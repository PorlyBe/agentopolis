// bugs: timestamps of recent tool errors per session, its own transcript plus its subagents' and workflow agents'.
// Each file is read once from near its end, then only its appended bytes; only errors from the last WINDOW are kept.
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

const WINDOW = 12 * 60_000
const FIRST_READ = 2 * 1024 * 1024
const CHUNK = 4 * 1024 * 1024
// a rejected permission prompt or an interrupt is the user's call, not a failure
const NOT_A_BUG = /doesn't want to proceed|was rejected|Request interrupted|Permission for this action/
const scans = new Map() // file -> { offset, rest, dec, errs: [ms] }
const dirs = new Map()  // session id -> session dir

const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }

function line(s, l) {
  if (!l.includes('"tool_result"') || !(l.includes('"is_error":true') || l.includes('<tool_use_error>'))) return
  let e; try { e = JSON.parse(l) } catch { return }
  const at = Date.parse(e.timestamp) || 0
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type !== 'tool_result') continue
    const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
    if ((b.is_error || out.startsWith('<tool_use_error>')) && !NOT_A_BUG.test(out.slice(0, 300))) s.errs.push(at)
  }
}

function scan(file, size) {
  let s = scans.get(file)
  if (!s || size < s.offset) {
    s = { offset: Math.max(0, size - FIRST_READ), rest: '', dec: new StringDecoder('utf8'), errs: [], skip: size > FIRST_READ }
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
  const cut = Date.now() - WINDOW
  if (s.errs.length && s.errs[0] < cut) s.errs = s.errs.filter(t => t >= cut)
  return s.errs
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
      const errs = []
      for (const f of [d.file, ...agentFiles(d.sessionDir)]) {
        let st; try { st = fs.statSync(f) } catch { continue }
        if (now - st.mtimeMs > WINDOW && !scans.has(f)) continue
        errs.push(...scan(f, st.size))
      }
      if (errs.length) s.ext.bugs = { errs: errs.sort((a, b) => a - b).slice(-30) }
      else delete s.ext.bugs   // ext is the cached parse's object: an aged-out list would otherwise stick
    }
    for (const f of scans.keys()) if (!fs.existsSync(f)) scans.delete(f)
  },
}
