// drones: Bash commands that download packages (pnpm/npm/yarn installs, cargo builds that fetch crates, pip, swift
// package resolve, gradle), in a session's transcript or one of its agents'. An install still waiting on its result is
// 'pending'; a finished one that pulled anything is a 'delivery' with the package names its output (or command) names.
// Files are read like groundhog.mjs: once from near their end, then only their appended bytes.
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

const FIRST_READ = 2 * 1024 * 1024, CHUNK = 4 * 1024 * 1024
const KEEP = 10 * 60_000, PENDING = 15 * 60_000, MAX_PKGS = 12
const AT = String.raw`(?:^|[;&|(\n]|\b(?:then|do|time|exec|xargs)\s)\s*(?:[A-Z_][A-Z0-9_]*=\S*\s+)*`
const cmdRe = (tool, rest) => new RegExp(AT + tool + rest, 'm')
const KINDS = [
  ['pnpm', cmdRe('pnpm\\b', String.raw`(?:\s+(?:-\S+|--filter\s+\S+|-C\s+\S+|--dir\s+\S+))*\s+(?:install|i|add|update|up|fetch)\b`)],
  ['npm', cmdRe('npm\\b', String.raw`(?:\s+-\S+)*\s+(?:install|i|ci|add)\b`)],
  ['yarn', cmdRe('yarn\\b', String.raw`(?:\s+(?:install|add)\b|\s*(?:$|[;&|)]))`)],
  ['cargo', cmdRe('cargo\\b', String.raw`(?:\s+(?:\+\S+|-\S+))*\s+(?:build|test|fetch|update|run|check|clippy|install|nextest|add)\b`)],
  ['pip', cmdRe('(?:python3?\\s+-m\\s+)?(?:pip3?|uv)\\b', String.raw`\s+(?:pip\s+)?(?:install|add|sync)\b`)],
  ['swift', cmdRe('(?:swift|xcodebuild)\\b', String.raw`[^;&|\n]*?(?:\bpackage\s+(?:resolve|update)\b|-resolvePackageDependencies\b)`)],
  ['gradle', cmdRe('(?:\\./)?gradlew?\\b', '')],
]
const scans = new Map()   // file -> { offset, rest, dec, skip, pending: Map(id -> call), deliveries: [] }
const dirs = new Map()
const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }
const textOf = b => (typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map(x => x.text || '').join('\n') : '')).replace(/\r/g, '\n')
const bare = cmd => cmd.replace(/<<-?\s*['"]?(\w+)['"]?[^\n]*\n[\s\S]*?\n\s*\1\b/g, '').replace(/'[^']*'|"(?:[^"\\]|\\.)*"/g, "''")
const kindOf = cmd => { const b = bare(cmd); return KINDS.find(([, re]) => re.test(b))?.[0] || null }

function argPkgs(cmd) {
  const m = cmd.match(/\b(?:pnpm|npm|yarn|cargo|uv)\b[^;&|\n]*?\s(?:add|install|i)\s+([^;&|\n]+)/) || cmd.match(/\bpip3?\s+install\s+([^;&|\n]+)/)
  if (!m) return []
  return m[1].split(/\s+/).map(a => a.replace(/^['"]|['"]$/g, '')).filter(a => a && !a.startsWith('-') && !/[<>=]/.test(a) && (!a.includes('/') || /^@[\w.-]+\/[\w.-]+/.test(a)) && a !== '.').map(a => a.replace(/(?<=.)@[^@/]*$/, ''))
}

function parse(kind, cmd, out) {
  const names = [], add = n => { if (n && !names.includes(n)) names.push(n) }
  let count = 0
  const dl = [...out.matchAll(/^\s*Download(?:ed|ing) (\S+) v\S+/gm)].map(m => m[1])
  const comp = [...out.matchAll(/^\s*Compiling (\S+) v\S+/gm)].map(m => m[1])
  if (kind === 'cargo') {
    if (!dl.length && comp.length < 5 && !/Updating crates\.io index/.test(out)) return null
    for (const n of dl) add(n)
    if (comp.length >= 5) for (const n of comp) add(n)
    count = Math.max(dl.length, comp.length >= 5 ? comp.length : 0)
  }
  for (const m of out.matchAll(/^\+ (@?[\w.-]+(?:\/[\w.-]+)?) \d\S*/gm)) add(m[1])
  for (const m of out.matchAll(/^\s*[└├]─ (@?[\w.-]+(?:\/[\w.-]+)?)@/gm)) add(m[1])
  for (const m of out.matchAll(/^Collecting (\S+?)(?:[<>=!~ (]|$)/gm)) add(m[1])
  const si = out.match(/^Successfully installed (.+)$/m)
  if (si) for (const p of si[1].split(/\s+/)) add(p.replace(/-[\d.]+\w*$/, ''))
  for (const m of out.matchAll(/^Fetching (?:from )?\S+\/([^/\s]+?)(?:\.git)?\/?$/gm)) add(m[1])
  for (const m of out.matchAll(/^Download https?:\/\/\S+\/([^/\s]+?)-\d[^/\s]*\.(?:jar|pom|module|aar)$/gm)) add(m[1])
  const pr = [...out.matchAll(/Progress: resolved \d+, reused \d+, downloaded (\d+)/g)].at(-1)
  const added = out.match(/\badded (\d+) packages?/), pk = out.match(/^Packages: \+(\d+)/m), saved = out.match(/Saved (\d+) new dependenc/)
  count = Math.max(count, names.length, +(pr?.[1] || 0), +(added?.[1] || 0), +(pk?.[1] || 0), +(saved?.[1] || 0))
  if (!count) return null
  for (const n of argPkgs(cmd)) if (names.length < MAX_PKGS) add(n)
  return { count, pkgs: names.slice(0, MAX_PKGS) }
}

function line(s, l) {
  const use = l.includes('"tool_use"'), res = l.includes('"tool_result"')
  if (!use && !res) return
  let e; try { e = JSON.parse(l) } catch { return }
  const at = Date.parse(e.timestamp) || 0
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type === 'tool_use' && e.type === 'assistant' && b.name === 'Bash') {
      const cmd = String(b.input?.command || ''), kind = kindOf(cmd)
      if (!kind || b.input?.run_in_background) continue
      s.pending.set(b.id, { kind, cmd: cmd.replace(/\s+/g, ' ').trim().slice(0, 160), raw: cmd, at })
      if (s.pending.size > 50) s.pending.delete(s.pending.keys().next().value)
    } else if (b.type === 'tool_result') {
      const call = s.pending.get(b.tool_use_id); if (!call) continue
      s.pending.delete(b.tool_use_id)
      const got = parse(call.kind, call.raw, textOf(b)); if (!got) continue
      s.deliveries.push({ at, kind: call.kind, cmd: call.cmd, ...got })
      if (s.deliveries.length > 6) s.deliveries.shift()
    }
  }
}

function scan(file, size) {
  let s = scans.get(file)
  if (!s || size < s.offset) {
    s = { offset: Math.max(0, size - FIRST_READ), rest: '', dec: new StringDecoder('utf8'), skip: size > FIRST_READ, pending: new Map(), deliveries: [] }
    scans.set(file, s)
  }
  if (size > s.offset) {
    const fd = fs.openSync(file, 'r')
    try {
      while (s.offset < size) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
        const n = fs.readSync(fd, buf, 0, buf.length, s.offset)
        if (!n) break
        s.offset += n
        const lines = (s.rest + s.dec.write(buf.subarray(0, n))).split('\n')
        s.rest = lines.pop()
        if (s.skip) { lines.shift(); s.skip = false }
        for (const l of lines) if (l) line(s, l)
      }
    } finally { fs.closeSync(fd) }
  }
  const now = Date.now()
  s.deliveries = s.deliveries.filter(d => now - d.at < KEEP)
  for (const [id, p] of s.pending) if (now - p.at > PENDING) s.pending.delete(id)
  return s
}

function agentFiles(sessionDir) {
  const sub = path.join(sessionDir, 'subagents'), out = []
  const visit = d => { for (const f of ls(d)) if (f.startsWith('agent-') && f.endsWith('.jsonl')) out.push(path.join(d, f)) }
  visit(sub)
  for (const wf of ls(path.join(sub, 'workflows'))) visit(path.join(sub, 'workflows', wf))
  return out
}

export default {
  session({ id, sessionDir, file }) { dirs.set(id, { sessionDir, file }) },
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const d = dirs.get(s.id); if (!d) continue
      const deliveries = [], pending = []
      for (const f of [d.file, ...agentFiles(d.sessionDir)]) {
        let st; try { st = fs.statSync(f) } catch { continue }
        if (now - st.mtimeMs > PENDING && !scans.has(f)) continue
        const who = f === d.file ? s.id : path.basename(f).slice(6, -6)
        const r = scan(f, st.size)
        for (const x of r.deliveries) deliveries.push({ who, ...x })
        for (const [, p] of r.pending) if (p.kind !== 'cargo' && p.kind !== 'gradle') pending.push({ who, kind: p.kind, cmd: p.cmd, since: p.at })
      }
      if (deliveries.length || pending.length) s.ext.drones = { deliveries: deliveries.sort((a, b) => a.at - b.at), pending }
      else delete s.ext.drones
    }
    for (const f of scans.keys()) if (!fs.existsSync(f)) scans.delete(f)
  },
}
