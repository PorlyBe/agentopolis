// seismograph: today's destructive Bash commands (rm -r on a non-temp path, force push, reset --hard, clean -fd,
// branch -D, DROP/TRUNCATE through a db client, kubectl delete, terraform destroy, docker system prune) across every
// transcript touched today, its own and its subagents'. Quoted strings and heredoc bodies are ignored for the git/rm/…
// checks; a call the user rejected is dropped. Files are entered at local midnight by bisection, then only their
// appended bytes are read (like cost-jar). Attaches snap.seismograph = { day, events: [{ id, at, session, who, cmd, kind, size }] }.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CHUNK = 4 * 1024 * 1024, PROBE = 256 * 1024, DAY = 24 * 3600_000, MAX = 300
const REJECTED = /doesn't want to proceed|was rejected|Permission for this action|Request interrupted/
const TEMP = /^["']?([$_]\{?TMPDIR|\/tmp\b|\/private\/tmp\b|\/var\/folders\b|\/private\/var\/folders\b)|(^|\/)(tmp|temp|\.tmp|scratchpad)(\/|$)/i
const DB = /\b(psql|mysql|mariadb|sqlite3|mongosh|clickhouse(-client)?|cockroach|duckdb|sqlcmd|pg_ctl)\b/

const strip = cmd => cmd
  .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, ' ')
  .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, m => m.replace(/[\s;&|()`]/g, '_'))

// -> { kind, size 1..3 } | null
export function classify(raw) {
  const cmd = String(raw || '')
  const plain = strip(cmd), vars = new Map()
  for (const m of plain.matchAll(/(?:^|[\s;&|(])(\w+)=(\S+)/g)) vars.set(m[1], /mktemp/.test(m[2]) ? '/tmp/mktemp' : m[2].replace(/^["']|["']$/g, ''))
  const expand = x => x.replace(/^(["']?)\$\{?(\w+)\}?/, (all, q, v) => vars.has(v) ? vars.get(v) : all)
  if (DB.test(plain.replace(/["'][^"']*["']/g, ' '))) {
    if (/\bDROP\s+(DATABASE|SCHEMA)\b/i.test(cmd)) return { kind: 'drop database', size: 3 }
    if (/\bDROP\s+TABLE\b/i.test(cmd)) return { kind: 'drop table', size: 2 }
    if (/\bTRUNCATE\b/i.test(cmd)) return { kind: 'truncate', size: 2 }
  }
  let best = null
  const hit = (kind, size) => { if (!best || size > best.size) best = { kind, size } }
  for (let seg of plain.split(/&&|\|\||[;|\n&()]|\$\(|`/)) {
    seg = seg.trim().replace(/^(sudo\s+|command\s+|exec\s+|\w+=\S*\s+)+/, '')
    const t = seg.split(/\s+/)
    if (t[0] === 'rm') {
      const flags = t.slice(1).filter(x => x.startsWith('-')), targets = t.slice(1).filter(x => x && !x.startsWith('-')).map(expand)
      const rec = flags.some(f => f === '--recursive' || /^-[a-zA-Z]*[rR]/.test(f))
      if (rec && targets.length && targets.some(x => !TEMP.test(x))) hit('rm -rf', 3)
    } else if (t[0] === 'git') {
      const i = t.findIndex((x, k) => k > 0 && !x.startsWith('-') && !/^-C$|^-c$/.test(t[k - 1]))
      const sub = t[i], rest = t.slice(i + 1)
      if (sub === 'push' && rest.some(x => x === '--force' || x.startsWith('--force-with-lease') || x === '--force-if-includes' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x) || /^\+[\w/.-]/.test(x))) hit('force push', 3)
      else if (sub === 'reset' && rest.includes('--hard')) hit('reset --hard', 1)
      else if (sub === 'clean' && rest.some(x => /^-[a-zA-Z]*f/.test(x) || x === '--force') && rest.some(x => /^-[a-zA-Z]*d/.test(x))) hit('clean -fd', 2)
      else if (sub === 'branch' && rest.some(x => /^-[a-zA-Z]*D/.test(x) || x === '--delete' && rest.includes('--force'))) hit('branch -D', 2)
    } else if (t[0] === 'kubectl' && t.includes('delete')) hit('kubectl delete', 2)
    else if ((t[0] === 'terraform' || t[0] === 'tofu') && (t.includes('destroy') || (t.includes('apply') && t.includes('-destroy')))) hit('terraform destroy', 3)
    else if (t[0] === 'docker' && t[1] === 'system' && t[2] === 'prune') hit('docker prune', 2)
  }
  return best
}

const files = new Map()   // file -> { offset, rest, dec, session, who, fresh, skip }
const events = new Map()  // tool_use id -> event
let list = [], listedAt = 0, crawling = false, crawledAt = 0, day = 0
const midnight = () => new Date().setHours(0, 0, 0, 0)
const tsOf = l => { const i = l.indexOf('"timestamp":"'); return i < 0 ? 0 : Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0 }
const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }

async function listFiles(today) {
  const out = []
  const touched = async f => { try { return (await fs.promises.stat(f)).mtimeMs >= today } catch { return false } }
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const id = f.slice(0, -6), main = path.join(pd, f)
      let st; try { st = await fs.promises.stat(main) } catch { continue }
      if (st.mtimeMs < today - DAY) continue
      if (st.mtimeMs >= today) out.push([main, id, id])
      const sub = path.join(pd, id, 'subagents')
      const agents = async d => (await dir(d)).filter(x => x.startsWith('agent-') && x.endsWith('.jsonl')).map(x => path.join(d, x))
      const add = async a => { if (await touched(a)) out.push([a, id, path.basename(a).slice(6, -6)]) }
      for (const a of await agents(sub)) await add(a)
      for (const wf of await dir(path.join(sub, 'workflows'))) for (const a of await agents(path.join(sub, 'workflows', wf))) await add(a)
    }
  }
  return out
}

async function seekToday(fh, size, today) {
  let lo = 0, hi = size
  while (hi - lo > PROBE) {
    const mid = Math.floor((lo + hi) / 2), buf = Buffer.alloc(Math.min(PROBE, size - mid))
    const { bytesRead } = await fh.read(buf, 0, buf.length, mid)
    const t = buf.subarray(0, bytesRead).toString('utf8').split('\n').slice(1, -1).map(tsOf).find(Boolean)
    if (!t) return lo
    if (t < today) lo = mid; else hi = mid
  }
  return lo
}

function line(s, l, today) {
  const use = l.includes('"name":"Bash"'), res = events.size && l.includes('"tool_result"')
  if (!use && !res) return
  let e; try { e = JSON.parse(l) } catch { return }
  const content = Array.isArray(e.message?.content) ? e.message.content : []
  if (use && e.type === 'assistant') {
    const at = Date.parse(e.timestamp) || 0
    if (at < today) return
    for (const b of content) {
      if (b.type !== 'tool_use' || b.name !== 'Bash' || events.has(b.id)) continue
      const cmd = String(b.input?.command || ''), c = classify(cmd)
      if (c) events.set(b.id, { id: b.id, at, session: s.session, who: s.who, cmd: cmd.replace(/\s+/g, ' ').trim().slice(0, 200), ...c })
    }
  } else for (const b of content) {
    if (b.type !== 'tool_result' || !events.has(b.tool_use_id)) continue
    const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
    if (REJECTED.test(out.slice(0, 300))) events.delete(b.tool_use_id)
  }
}

async function read(file, session, who, size, today) {
  let s = files.get(file)
  if (!s || size < s.offset) { s = { offset: 0, rest: '', dec: new StringDecoder('utf8'), session, who, fresh: true }; files.set(file, s) }
  if (size <= s.offset) return
  const fh = await fs.promises.open(file, 'r')
  try {
    if (s.fresh) { s.fresh = false; s.offset = await seekToday(fh, size, today); if (s.offset) s.skip = true }
    while (s.offset < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      const lines = (s.rest + s.dec.write(buf.subarray(0, bytesRead))).split('\n')
      s.rest = lines.pop()
      if (s.skip) { lines.shift(); s.skip = false }
      for (const l of lines) if (l) line(s, l, today)
    }
  } finally { await fh.close() }
}

async function crawl() {
  if (crawling) return
  crawling = true
  try {
    const today = midnight(), t0 = Date.now()
    if (today !== day) { day = today; events.clear(); files.clear(); listedAt = 0 }
    if (t0 - listedAt > 20_000) { list = await listFiles(today); listedAt = t0 }
    for (const [file, session, who] of list) {
      let st; try { st = await fs.promises.stat(file) } catch { continue }
      await read(file, session, who, st.size, today)
    }
  } catch (e) { console.error('[seismograph crawl]', e.message) } finally { crawling = false; crawledAt = Date.now() }
}

export default {
  snapshot(snap) {
    if (!crawling && snap.now - crawledAt > 1500) crawl()
    if (!day) return
    snap.seismograph = { day, events: [...events.values()].sort((a, b) => a.at - b.at).slice(-MAX) }
  },
}
