// bugs: timestamps of recent tool errors per session, its own transcript plus its subagents' and workflow agents'.
// Each file is read once from near its end, then only its appended bytes; only errors from the last WINDOW are kept.
import { readSync, tailState } from '../lib/tail.mjs'
import { transcriptsOf, sweep } from '../lib/transcripts.mjs'

const WINDOW = 12 * 60_000
const FIRST_READ = 2 * 1024 * 1024
// a rejected permission prompt or an interrupt is the user's call, not a failure
const NOT_A_BUG = /doesn't want to proceed|was rejected|Request interrupted|Permission for this action/
const scans = new Map() // file -> { offset, rest, skip, errs: [ms] }

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
    s = tailState(Math.max(0, size - FIRST_READ), { errs: [] })
    scans.set(file, s)
  }
  readSync(s, file, size, l => line(s, l))
  const cut = Date.now() - WINDOW
  if (s.errs.length && s.errs[0] < cut) s.errs = s.errs.filter(t => t >= cut)
  return s.errs
}

export default {
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const errs = []
      for (const { file: f, stat: st } of transcriptsOf(s.id)) {
        if (now - st.mtimeMs > WINDOW && !scans.has(f)) continue
        try { errs.push(...scan(f, st.size)) } catch {}
      }
      if (errs.length) s.ext.bugs = { errs: errs.sort((a, b) => a - b).slice(-30) }
      else delete s.ext.bugs   // ext is the cached parse's object: an aged-out list would otherwise stick
    }
    sweep(scans)
  },
}
