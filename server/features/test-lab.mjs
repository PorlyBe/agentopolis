// test-lab: the last result of each suite (cargo test/nextest/clippy/mutants, pnpm test/vitest/lint/typecheck) a session
// or its agents ran, per service folder. A Bash call with no result yet is running; a background one until its
// task-notification lands, whose output file tail is then read for the verdict (a trailing echo hides the exit code).
// Results are kept per session for the server's lifetime, so they outlive the transcript tail and finished agents.
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

const RUNNER = /^(?:cargo\s+(?:\+\S+\s+)?(test|nextest|clippy|mutants)|pnpm\s+(?:(?:-C|--dir|--filter|-F|-r|--recursive)\s+(?:\S+\s+)?)*(?:run\s+)?(test|vitest|lint|typecheck)|(?:npx|pnpm\s+exec)\s+(vitest))\b/
const STALE_MS = 40 * 60_000
const store = new Map() // session id -> Map(key -> { service, suite, result, at, summary, runningSince })
const roots = new Map() // dir -> repo root

function repoRoot(dir) {
  if (roots.has(dir)) return roots.get(dir)
  let d = dir, root = null
  for (let i = 0; i < 12 && d && d !== path.dirname(d); i++, d = path.dirname(d)) if (fs.existsSync(path.join(d, '.git'))) { root = d; break }
  roots.set(dir, root)
  return root
}
function serviceOf(dir) {
  const wt = dir.match(/^(.*?)\/\.claude\/worktrees\/[^/]+(?:\/([^/]+))?/)
  if (wt) return wt[2] || path.basename(wt[1])
  const root = repoRoot(dir)
  if (!root) return path.basename(dir)
  const rel = path.relative(root, dir)
  return rel && !rel.startsWith('..') ? rel.split(path.sep)[0] : path.basename(root)
}

const unquote = s => s.replace(/^['"]|['"]$/g, '')
function suitesOf(command, cwd) {
  const out = []
  let dir = cwd || '/'
  const vars = {}, expand = s => unquote(s).replace(/^~(?=\/|$)/, process.env.HOME).replace(/\$\{?(\w+)\}?/g, (_, v) => vars[v] ?? '')
  const bare = command.replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\s*(?=\n|$)/g, ':').replace(/"[^"]*\n[^"]*"|'[^']*\n[^']*'/g, '""')
  for (let seg of bare.split(/&&|\|\||;|\n|\|/)) {
    seg = seg.trim()
    const set = seg.match(/^(?:export\s+)?([A-Za-z_]\w*)=(\S+)$/)
    if (set) { vars[set[1]] = expand(set[2]); continue }
    seg = seg.replace(/^(?:time\s+|[A-Z_][A-Z0-9_]*=\S*\s+)+/, '')
    const cd = seg.match(/^cd\s+(\S+)/)
    if (cd) { dir = path.resolve(dir, expand(cd[1])); continue }
    const m = seg.match(RUNNER); if (!m) continue
    const suite = m[1] ? `cargo ${m[1]}` : m[2] ? `pnpm ${m[2]}` : 'vitest'
    let where = dir
    const mp = seg.match(/--manifest-path[=\s]+(\S+)/), c = seg.match(/(?:\s-C|--dir)\s+(\S+)/)
    if (mp) where = path.dirname(path.resolve(dir, expand(mp[1])))
    else if (c) where = path.resolve(dir, expand(c[1]))
    const service = serviceOf(where)
    const hidden = />\s*\S/.test(seg.replace(/\d?>&\d/g, ''))
    if (!out.some(o => o.suite === suite && o.service === service)) out.push({ suite, service, hidden })
  }
  return out
}

function verdict(text, isError, hidden) {
  const t = String(text || '')
  const failed = t.match(/test result: FAILED[^\n]*/)?.[0] || t.match(/\b([1-9]\d*) (?:failed|failing)\b/)?.[0]
    || t.match(/error(?:\[E\d+\])?: (?:could not compile|aborting)[^\n]*/)?.[0] || t.match(/\bELIFECYCLE\b[^\n]*/)?.[0]
    || t.match(/\b(?:TEST |)EXIT(?: code)?[:= ]+([1-9]\d*)/i)?.[0] || t.match(/\bexit code ([1-9]\d*)/i)?.[0]
    || t.match(/^\s*(\d+) (?:mutants? )?missed\b[^\n]*/m)?.[1] > 0 && 'mutants missed'
  if (failed) return { result: 'fail', summary: String(failed).trim().slice(0, 90) }
  const sum = (re) => [...t.matchAll(re)].reduce((n, m) => n + Number(m[1]), 0)
  const passed = sum(/test result: ok\. (\d+) passed/g) || sum(/Tests?\s+(\d+) passed/g) || sum(/\b(\d+) passed\b/g)
  if (passed) return { result: 'pass', summary: `${passed} passed` }
  if (isError) return { result: 'fail', summary: (t.match(/Exit code \d+/)?.[0] || 'error').slice(0, 90) }
  if (/Finished\b|test result: ok|\bEXIT(?: code)?[:= ]+0\b|warning: .* generated \d+ warning/i.test(t)) return { result: 'pass', summary: 'ok' }
  return hidden ? { result: 'unknown', summary: 'output went to a log' } : { result: 'pass', summary: 'exit 0' }
}

function tail(file, bytes = 16 * 1024) {
  try {
    const st = fs.statSync(file), fd = fs.openSync(file, 'r')
    try { const len = Math.min(st.size, bytes), buf = Buffer.alloc(len); fs.readSync(fd, buf, 0, len, st.size - len); return buf.toString('utf8') } finally { fs.closeSync(fd) }
  } catch { return '' }
}
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => b?.text || '').join('\n') : ''

// one reader per transcript file: read once from near its end, then only appended bytes; only lines that can matter are parsed
const FIRST_READ = 4 * 1024 * 1024, CHUNK = 4 * 1024 * 1024
const scans = new Map() // file -> { offset, rest, dec, skip, uses, at, out }
const dirs = new Map()  // session id -> { sessionDir, file }

function entry(sc, e) {
  sc.at = Date.parse(e.timestamp) || sc.at
  const at = sc.at, content = e.message?.content
  if (typeof content === 'string' && content.includes('<task-notification>')) {
    const id = content.match(/<tool-use-id>([^<]+)</)?.[1], u = id && sc.uses.get(id)
    if (!u?.bg) return
    const status = content.match(/<status>(\w+)</)?.[1], file = content.match(/<output-file>([^<]+)</)?.[1]
    const out = tail(file), bad = status === 'failed' || /exit code [1-9]/.test(content)
    for (const s of u.suites) sc.out.push({ ...s, ...(status === 'completed' || status === 'failed' ? verdict(out || (bad ? content : ''), bad, s.hidden) : { result: 'fail', summary: status || 'stopped' }), at })
    sc.uses.delete(id)
    return
  }
  if (!Array.isArray(content)) return
  for (const b of content) {
    if (b?.type === 'tool_use' && b.name === 'Bash' && typeof b.input?.command === 'string') {
      const suites = suitesOf(b.input.command, e.cwd)
      if (suites.length) sc.uses.set(b.id, { suites, at, bg: false })
    } else if (b?.type === 'tool_result' && sc.uses.has(b.tool_use_id)) {
      const u = sc.uses.get(b.tool_use_id), r = e.toolUseResult
      if (r?.backgroundTaskId) { u.bg = true; continue }
      const text = r && typeof r === 'object' && 'stdout' in r ? `${r.stdout}\n${r.stderr}` : textOf(b.content)
      if (!/Request interrupted|was rejected|doesn't want to proceed/.test(textOf(b.content).slice(0, 300))) for (const s of u.suites) sc.out.push({ ...s, ...verdict(text, b.is_error, s.hidden), at })
      sc.uses.delete(b.tool_use_id)
    }
  }
}
function line(sc, l) {
  const use = l.includes('"name":"Bash"') && /cargo|pnpm|npx/.test(l)
  const res = sc.uses.size && l.includes('"tool_result"')
  const note = sc.uses.size && l.includes('<task-notification>') && l.includes('"type":"user"')
  if (!use && !res && !note) return
  let e; try { e = JSON.parse(l) } catch { return }
  entry(sc, e)
}
function scan(file, size) {
  let sc = scans.get(file)
  if (!sc || size < sc.offset) {
    sc = { offset: Math.max(0, size - FIRST_READ), rest: '', dec: new StringDecoder('utf8'), skip: size > FIRST_READ, uses: new Map(), at: 0, out: [] }
    scans.set(file, sc)
  }
  if (size > sc.offset) {
    const fd = fs.openSync(file, 'r')
    try {
      while (sc.offset < size) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - sc.offset))
        const n = fs.readSync(fd, buf, 0, buf.length, sc.offset)
        if (!n) break
        sc.offset += n
        const lines = (sc.rest + sc.dec.write(buf.subarray(0, n))).split('\n')
        sc.rest = lines.pop()
        if (sc.skip) { lines.shift(); sc.skip = false }
        for (const l of lines) if (l) line(sc, l)
      }
    } finally { fs.closeSync(fd) }
  }
  const runs = sc.out
  sc.out = []
  for (const u of sc.uses.values()) for (const s of u.suites) runs.push({ ...s, result: 'running', at: u.at })
  return runs
}
const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }
function agentFiles(sessionDir) {
  const sub = path.join(sessionDir, 'subagents'), out = []
  const visit = d => { for (const f of ls(d)) if (f.startsWith('agent-') && f.endsWith('.jsonl')) out.push(path.join(d, f)) }
  visit(sub)
  for (const wf of ls(path.join(sub, 'workflows'))) visit(path.join(sub, 'workflows', wf))
  return out
}
function runsOf(id) {
  const d = dirs.get(id); if (!d) return []
  const now = Date.now(), all = []
  for (const f of [d.file, ...agentFiles(d.sessionDir)]) {
    let st; try { st = fs.statSync(f) } catch { continue }
    if (f !== d.file && now - st.mtimeMs > STALE_MS && !scans.has(f)) continue
    all.push(...scan(f, st.size))
  }
  return all.sort((a, b) => a.at - b.at)
}

export default {
  session({ id, sessionDir, file }) { dirs.set(id, { sessionDir, file }) },
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const all = runsOf(s.id)
      let m = store.get(s.id); if (!m) store.set(s.id, m = new Map())
      for (const r of all) {
        const key = `${r.service}|${r.suite}`, cur = m.get(key) || { service: r.service, suite: r.suite, result: null, at: 0, summary: '', runningSince: null }
        if (r.result === 'running') { if (r.at >= cur.at && now - r.at < STALE_MS) cur.runningSince = Math.max(cur.runningSince || 0, r.at) }
        else if (r.at >= cur.at) { Object.assign(cur, { result: r.result, at: r.at, summary: r.summary }); if (cur.runningSince && cur.runningSince <= r.at) cur.runningSince = null }
        m.set(key, cur)
      }
      for (const [key, cur] of m) {
        if (cur.runningSince && (now - cur.runningSince > STALE_MS || !all.some(r => r.result === 'running' && `${r.service}|${r.suite}` === key && r.at === cur.runningSince))) cur.runningSince = null
        if (!cur.result && !cur.runningSince) m.delete(key)
      }
      if (m.size) (s.ext ||= {})['test-lab'] = { flasks: [...m.values()].sort((a, b) => a.service.localeCompare(b.service) || a.suite.localeCompare(b.suite)).slice(0, 8) }
    }
    for (const id of store.keys()) if (!snap.sessions.some(s => s.id === id)) store.delete(id)
    for (const f of scans.keys()) if (!fs.existsSync(f)) scans.delete(f)
  },
}
