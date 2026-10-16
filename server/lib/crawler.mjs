// One asynchronous crawl of the transcripts touched lately, shared by the features that need all of them (not only the
// sessions on screen). The tree is listed once every RELIST for everyone; each file is read once per group and its new
// lines are handed to every subscriber of that group, each keeping its own state per file. Two groups:
//   week  — every transcript (sessions, subagents, workflow agents) of a session touched in the last 7 days, read
//           from byte 0 (tv, friday-drinks, security-desk). Between relists only files touched in the last hour are stat'ed.
//   today — the transcripts touched since local midnight, of sessions touched since the day before, each entered at
//           midnight by bisection (cost-jar, seismograph, window-heatmap, report-card, memory-archive).
// Crawls run only when a subscriber's snapshot asks (poke), so nothing is read while no page is open.
//
// A subscriber: { files: Map(file -> state), open(entry, stat, ctx) -> state | null (not interested yet; asked again when
// the file grows), line(state, line, ctx), after?(ctx) once per finished crawl, onDay?(today) (today group, new day) }.
// entry: { file, project, session, agent (id | null), wf (workflow run | null), main, sessionDir, mtimeMs, birthtimeMs, mainMtime }
// ctx: { now, today, relist }
import fs from 'node:fs'
import path from 'node:path'
import { PROJECTS, midnight } from './transcripts.mjs'
import { readAsync, tailState, seekSince } from './tail.mjs'

const HOUR = 3600_000, DAY = 24 * HOUR, WEEK = 7 * DAY, RELIST = 20_000

const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }
const stat = async f => { try { return await fs.promises.stat(f) } catch { return null } }

let all = [], listedAt = 0, listing = null
// every main transcript touched in the last WEEK, then all its agents' (each with its stat at listing time)
async function walk(now) {
  const out = []
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const main = path.join(pd, f), st = await stat(main)
      if (!st || now - st.mtimeMs > WEEK) continue
      const session = f.slice(0, -6), sessionDir = path.join(pd, session), mainMtime = st.mtimeMs
      out.push({ file: main, project: proj, session, agent: null, wf: null, main: true, sessionDir, mtimeMs: st.mtimeMs, birthtimeMs: st.birthtimeMs, mainMtime })
      const sub = path.join(sessionDir, 'subagents')
      const agents = async (d, wf) => {
        for (const a of await dir(d)) {
          if (!a.startsWith('agent-') || !a.endsWith('.jsonl')) continue
          const file = path.join(d, a), ast = await stat(file)
          if (ast) out.push({ file, project: proj, session, agent: a.slice(6, -6), wf, main: false, sessionDir, mtimeMs: ast.mtimeMs, birthtimeMs: ast.birthtimeMs, mainMtime })
        }
      }
      await agents(sub, null)
      for (const wf of await dir(path.join(sub, 'workflows'))) await agents(path.join(sub, 'workflows', wf), wf)
    }
  }
  return out
}
function relist(now) {
  if (listing) return listing
  listing = walk(now).then(l => { all = l; listedAt = now; return true }, e => { console.error('[crawler] list', e.message); return false })
    .finally(() => { listing = null })
  return listing
}

function group(name, { every, pick, start }) {
  const subs = [], readers = new Map()   // file -> { offset, rest, skip, mtime }
  const g = { name, ready: false, day: 0, crawledAt: 0, crawling: false, list: [] }
  let from = null   // the listing g.list was picked from
  g.subscribe = sub => { subs.push(sub); return g }
  g.poke = (now = Date.now()) => { if (!g.crawling && now - g.crawledAt > every) crawl() }

  async function readFile(e, st, ctx) {
    let r = readers.get(e.file)
    if (r && st.size < r.offset) { readers.delete(e.file); r = null; for (const s of subs) s.files.delete(e.file) }   // rewritten
    const live = []
    for (const s of subs) {
      let x = s.files.get(e.file)
      if (!x) { x = s.open(e, st, ctx); if (x) s.files.set(e.file, x) }
      if (x) live.push([s, x])
    }
    if (r && st.size <= r.offset) { r.mtime = st.mtimeMs; return }
    const fh = await fs.promises.open(e.file, 'r')
    try {
      if (!r) { r = tailState(start === 'today' ? await seekSince(fh, st.size, ctx.today) : 0, { mtime: 0 }); readers.set(e.file, r) }
      await readAsync(r, e.file, st.size, l => { for (const [s, x] of live) s.line(x, l, ctx) }, fh)
      r.mtime = st.mtimeMs
    } finally { await fh.close() }
  }

  async function crawl() {
    g.crawling = true
    try {
      const now = Date.now(), today = midnight(now)
      if (start === 'today' && today !== g.day) {
        if (g.day) { readers.clear(); for (const s of subs) { s.files.clear(); s.onDay?.(today) } }
        listedAt = 0
      }
      g.day = today
      if (now - listedAt > RELIST) await relist(now)
      const fresh = from !== all   // a new listing (by this group or the other): stat everything once
      if (fresh) {
        from = all
        g.list = all.filter(e => pick(e, today, now))
        const keep = new Set(g.list.map(e => e.file))
        for (const f of readers.keys()) if (!keep.has(f)) readers.delete(f)
        for (const s of subs) for (const f of s.files.keys()) if (!keep.has(f)) s.files.delete(f)
      }
      const ctx = { now, today, relist: fresh }
      for (const e of g.list) {
        const r = readers.get(e.file)
        if (start === 'zero' && !fresh && r && now - r.mtime > HOUR) continue
        const st = await stat(e.file); if (!st) continue
        if (start === 'zero' && now - st.mtimeMs > WEEK) continue
        try { await readFile(e, st, ctx) } catch (err) { if (err.code !== 'ENOENT') console.error(`[crawler ${name}]`, err.message) }
      }
      for (const s of subs) { try { s.after?.(ctx) } catch (err) { console.error(`[crawler ${name}]`, err.message) } }
      g.ready = true
    } catch (e) { console.error(`[crawler ${name}]`, e.message) } finally { g.crawling = false; g.crawledAt = Date.now() }
  }
  return g
}

export const week = group('week', { every: 1000, start: 'zero', pick: () => true })
// a workflow can leave its session's own transcript quiet for hours, so its agents count while the session was touched since yesterday
export const today = group('today', { every: 1500, start: 'today', pick: (e, today) => e.mainMtime >= today - DAY && e.mtimeMs >= today })
export const listed = () => all
