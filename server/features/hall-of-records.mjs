// hall-of-records: all-time bests, kept in the server's own data dir (~/.agentopolis/records.json, never under ~/.claude).
// Features run alphabetically and milestone-cake comes after this one, so each tick reads the previous, complete snapshot.
// A record beaten today keeps the one it beat as `prev`; the first value ever seen is a record with no prev (no fanfare).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DIR = path.join(os.homedir(), '.agentopolis'), FILE = path.join(DIR, 'records.json')
const SAVE_GAP = 5000, HEAD = 64 * 1024
const OFF = process.argv.includes('--demo')
const CATALOGUE = [
  ['longest-session', 'Longest-running session', 'ms'],
  ['tools-day', 'Most tool calls in a day', 'n'],
  ['agents-once', 'Most subagents at once', 'n'],
  ['biggest-pr', 'Biggest merged PR', 'lines'],
  ['priciest-day', 'Priciest day', 'usd'],
  ['commits-day', 'Most commits in a day', 'n'],
  ['green-streak', 'Longest green CI streak', 'n'],
]
const unit = key => CATALOGUE.find(c => c[0] === key)?.[2]
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const midnight = t => new Date(t).setHours(0, 0, 0, 0)

let store = (() => { try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); return j && typeof j.records === 'object' ? j : null } catch { return null } })()
  || { version: 1, records: {}, ci: { streak: 0, seen: [] } }
store.ci ||= { streak: 0, seen: [] }
let dirty = false, savedAt = 0, prev = null
const files = new Map(), starts = new Map()        // session id -> transcript; session id -> first timestamp
const today = { day: null, tools: new Map(), commits: new Map() }   // session id -> max calls today; commit id -> session id
const sizes = new Map()                            // my open PR number -> { size, add, del, title }

function save(now) {
  if (OFF || !dirty || now - savedAt < SAVE_GAP) return
  dirty = false; savedAt = now
  try {
    fs.mkdirSync(DIR, { recursive: true })
    let disk = null; try { disk = JSON.parse(fs.readFileSync(FILE, 'utf8')) } catch {}   // another server may share the file: keep its better values
    for (const [k, r] of Object.entries(disk?.records || {})) if (r && !(store.records[k]?.value >= r.value)) store.records[k] = r
    const tmp = `${FILE}.${process.pid}.tmp`
    fs.writeFileSync(tmp, JSON.stringify(store, null, 1))
    fs.renameSync(tmp, FILE)
  } catch (e) { console.error('[hall-of-records] save', e.message) }
}

function offer(key, value, at, what) {
  if (!(value > 0)) return
  value = unit(key) === 'usd' ? Math.round(value * 100) / 100 : Math.round(value); at = Math.round(at)
  const r = store.records[key], day = dayKey(at)
  if (r && value <= r.value) return
  const beat = r && r.day !== day ? { value: r.value, at: r.at, what: r.what } : r?.prev ?? null
  store.records[key] = { value, at, day, what: what || null, prev: beat }
  dirty = true
}

function startOf(id) {
  if (starts.has(id)) return starts.get(id)
  const file = files.get(id); if (!file) return null
  let t = null
  try {
    const fd = fs.openSync(file, 'r')
    try {
      const buf = Buffer.alloc(HEAD), n = fs.readSync(fd, buf, 0, HEAD, 0)
      const m = buf.subarray(0, n).toString('utf8').match(/"timestamp":"([^"]+)"/)
      t = m ? Date.parse(m[1]) || null : null
    } finally { fs.closeSync(fd) }
  } catch {}
  starts.set(id, t)
  return t
}

function absorb(s) {
  const now = s.now, day = dayKey(now)
  if (today.day !== day) { today.day = day; today.tools.clear(); today.commits.clear() }
  const title = new Map(s.sessions.map(x => [x.id, x.title]))

  for (const x of s.sessions) {
    const t0 = startOf(x.id)
    if (t0 && x.lastActivity > t0) offer('longest-session', x.lastActivity - t0, x.lastActivity, x.title)
    const n = x.ext?.['milestone-cake']?.today
    if (n > (today.tools.get(x.id) || 0)) today.tools.set(x.id, n)
  }
  const tools = [...today.tools.values()].reduce((a, b) => a + b, 0)
  const topTools = [...today.tools].sort((a, b) => b[1] - a[1])[0]
  offer('tools-day', tools, now, topTools && title.get(topTools[0]) ? `busiest: ${title.get(topTools[0])}` : null)

  let busy = 0, top = null
  for (const x of s.sessions) {
    const k = (x.agents || []).filter(a => a.state !== 'done' && a.state !== 'idle').length
    busy += k; if (k && (!top || k > top.k)) top = { k, title: x.title }
  }
  offer('agents-once', busy, now, top ? `${top.k} for ${top.title}` : null)

  if (s.cost?.usdToday != null) {
    const top = Object.entries(s.cost.bySession || {}).filter(([id]) => title.has(id)).sort((a, b) => b[1] - a[1])[0]
    offer('priciest-day', s.cost.usdToday, now, top ? `top desk: ${title.get(top[0])}` : null)
  }

  const cut = midnight(now)
  for (const [sid, list] of Object.entries(s.commits || {})) for (const e of list) if (e.k === 'c' && e.t >= cut) today.commits.set(e.id, sid)
  if (today.commits.size) {
    const per = new Map(); for (const sid of today.commits.values()) per.set(sid, (per.get(sid) || 0) + 1)
    const best = [...per].sort((a, b) => b[1] - a[1])[0]
    offer('commits-day', today.commits.size, now, title.get(best[0]) ? `most in ${title.get(best[0])}` : null)
  }

  const st = s.street
  if (st?.status === 'ok' && st.me) {
    for (const p of st.post || []) if (p.mine) sizes.set(p.n, { size: (p.additions || 0) + (p.deletions || 0), add: p.additions || 0, del: p.deletions || 0, title: p.title })
    for (const m of st.merged || []) {
      const z = sizes.get(m.number); if (!z || m.author !== st.me) continue
      offer('biggest-pr', z.size, Date.parse(m.mergedAt) || now, `#${m.number} ${m.title || z.title} (+${z.add} −${z.del})`)
    }
    const mine = new Set([...(st.mine || []).map(p => p.headRefName), ...s.sessions.map(x => x.branch)].filter(Boolean))
    const seen = new Set(store.ci.seen)
    const done = (st.runs || []).filter(r => r.status === 'completed' && r.id && mine.has(r.branch) && !seen.has(r.id))
      .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
    for (const r of done) {
      store.ci.seen.push(r.id); dirty = true
      if (r.conclusion === 'success') { store.ci.streak++; offer('green-streak', store.ci.streak, Date.parse(r.updatedAt) || now, `${r.workflow || 'CI'} on ${r.branch}`) }
      else if (r.conclusion === 'failure') store.ci.streak = 0
    }
    if (store.ci.seen.length > 400) store.ci.seen = store.ci.seen.slice(-300)
  }
}

export default {
  session({ id, file }) { if (file && files.get(id) !== file) { files.set(id, file); starts.delete(id) } },
  snapshot(snap) {
    if (OFF) return
    if (prev) { try { absorb(prev) } catch (e) { console.error('[hall-of-records]', e.message) } }
    prev = snap
    save(snap.now)
    const day = dayKey(snap.now)
    snap.records = {
      day, streak: store.ci.streak,
      list: CATALOGUE.map(([key, label, unit]) => {
        const r = store.records[key]
        return { key, label, unit, value: r?.value ?? null, at: r?.at ?? null, what: r?.what ?? null, prev: r?.prev ?? null, fresh: !!(r && r.day === day && r.prev) }
      }),
    }
  },
}
