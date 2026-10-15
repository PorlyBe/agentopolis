// achievements: badges earned today, per session and for the office, from tv.mjs's crawl of today's transcripts
// (tool calls, errors, commits, agents, compacts) plus the live snapshot (PRs, merges, CI). Earned ones are kept
// for the local day in a JSON file under the OS temp dir, one per port, so a restart keeps them.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { dayFacts, crawlReady, prsSince, titleOf } from './tv.mjs'

const MIN = 60_000
const port = (() => { const i = process.argv.indexOf('--port'); return i < 0 ? 4747 : Number(process.argv[i + 1]) || 4747 })()
const FILE = path.join(os.tmpdir(), `agent-office-achievements-${port}.json`)
export const CATALOGUE = {
  'first-pr': { title: 'First PR of the day', icon: '🥇', tier: 'gold' },
  'calls-1k': { title: '1,000 tool calls', icon: '🔨', tier: 'silver' },
  'clean-hour': { title: 'Clean hour', icon: '✨', tier: 'silver' },
  'six-at-once': { title: 'Six at once', icon: '👥', tier: 'gold' },
  marathon: { title: 'Marathon', icon: '🏃', tier: 'gold' },
  'night-owl': { title: 'Night owl', icon: '🦉', tier: 'bronze' },
  'big-context': { title: 'Big context', icon: '🧠', tier: 'silver' },
  wrangler: { title: 'Workflow wrangler', icon: '🤠', tier: 'gold' },
  'commit-machine': { title: 'Commit machine', icon: '📦', tier: 'silver' },
  'merge-streak': { title: 'Merge streak', icon: '🔥', tier: 'gold' },
  phoenix: { title: 'Phoenix', icon: '🐦‍🔥', tier: 'gold' },
  'office-10k': { title: '10,000 tool calls', icon: '🏭', tier: 'gold' },
  'full-house': { title: 'Full house', icon: '🏠', tier: 'bronze' },
}

const dayKey = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
let day = dayKey(), earned = new Map(), lastEval = 0, prev = null
try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); if (j.day === day) earned = new Map(j.list.map(a => [a.key, a])) } catch {}
const save = () => { try { fs.writeFileSync(FILE, JSON.stringify({ day, list: [...earned.values()] })) } catch (e) { console.error('[achievements] save', e.message) } }

function award(id, session, at, names) {
  const key = id + '|' + (session || 'office')
  if (earned.has(key) || (id === 'first-pr' && [...earned.values()].some(a => a.id === id))) return
  const c = CATALOGUE[id]
  earned.set(key, { key, id, title: c.title, icon: c.icon, tier: c.tier, session: session || null,
    holder: session ? names.get(session) || titleOf(session) || session.slice(0, 8) : 'office', earnedAt: Math.min(at || Date.now(), Date.now()) })
  return true
}

// minute (ms) at which a sorted [[minute, n]] running total first reaches goal
const reach = (mins, goal) => { let n = 0; for (const [m, c] of mins) if ((n += c) >= goal) return m * MIN; return 0 }

function perSession(groups, names, award) {
  for (const [sid, fs_] of groups) {
    const merged = new Map()
    for (const f of fs_) for (const [m, n] of f.calls) merged.set(m, (merged.get(m) || 0) + n)
    const mins = [...merged].sort((a, b) => a[0] - b[0]), errs = fs_.flatMap(f => f.errs).sort((a, b) => a - b)
    const at1k = reach(mins, 1000); if (at1k) award('calls-1k', sid, at1k)
    // clean hour: tool calls in every 10-minute slice of an hour, 60+ of them, and not one tool error
    const set = new Map(mins)
    for (const [end] of mins) {
      let total = 0, slices = new Set()
      for (let m = end - 59; m <= end; m++) { const n = set.get(m); if (n) { total += n; slices.add(Math.floor((end - m) / 10)) } }
      if (slices.size < 6 || total < 60) continue
      if (errs.some(t => t > (end - 60) * MIN && t <= (end + 1) * MIN)) continue
      award('clean-hour', sid, (end + 1) * MIN); break
    }
    // marathon: four hours with no gap over 15 minutes
    let start = null, last = null
    for (const [m] of mins) {
      if (last == null || m - last > 15) start = m
      last = m
      if (m - start >= 240) { award('marathon', sid, m * MIN); break }
    }
    const owl = mins.find(([m]) => { const h = new Date(m * MIN).getHours(); return h >= 22 || h < 4 })
    if (owl) award('night-owl', sid, owl[0] * MIN)
    const big = fs_.find(f => f.bigAt); if (big) award('big-context', sid, big.bigAt)
    const commits = fs_.flatMap(f => f.commitTs).sort((a, b) => a - b)
    if (commits.length >= 10) award('commit-machine', sid, commits[9])
    // six subagents at once: overlap of the agents' first..last activity
    const ev = fs_.filter(f => f.agent && f.first).flatMap(f => [[f.first, 1], [f.last + 1, -1]]).sort((a, b) => a[0] - b[0] || a[1] - b[1])
    let live = 0
    for (const [t, d] of ev) if ((live += d) >= 6) { award('six-at-once', sid, t); break }
    const runs = new Map()
    for (const f of fs_) if (f.wf && f.first) runs.set(f.wf, [...(runs.get(f.wf) || []), f.first])
    for (const firsts of runs.values()) if (firsts.length >= 10) { award('wrangler', sid, firsts.sort((a, b) => a - b)[9]); break }
  }
}

function evaluate(snap) {
  const { today, files } = dayFacts()
  const names = new Map(snap.sessions.map(s => [s.id, s.title]))
  let changed = false
  const give = (id, sid, at) => { if (award(id, sid, at, names)) changed = true }
  const groups = new Map()
  for (const f of files) groups.set(f.session, [...(groups.get(f.session) || []), f])
  perSession(groups, names, give)
  const all = new Map()
  for (const f of files) for (const [m, n] of f.calls) all.set(m, (all.get(m) || 0) + n)
  const at10k = reach([...all].sort((a, b) => a[0] - b[0]), 10_000); if (at10k) give('office-10k', null, at10k)
  const first = prsSince(today).sort((a, b) => a.at - b.at)[0]
  if (first) give('first-pr', first.session, first.at)
  const merges = (prev?.trophies?.items || []).filter(i => i.state === 'MERGED' && i.mergedAt >= today).map(i => i.mergedAt).sort((a, b) => a - b)
  if (merges.length >= 3) give('merge-streak', null, merges[2])
  // phoenix: a CI workflow that failed on a live session's branch, then passed on it later today
  const mine = new Set(snap.sessions.map(s => s.branch).filter(b => b && !/^(trunk|main|master)$/.test(b)))
  const runs = (prev?.street?.runs || []).filter(r => mine.has(r.branch) && r.status === 'completed' && Date.parse(r.updatedAt) >= today).sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))
  const red = new Set()
  for (const r of runs) {
    const k = r.branch + '|' + r.workflow
    if (r.conclusion === 'failure') red.add(k)
    else if (r.conclusion === 'success' && red.has(k)) {
      give('phoenix', snap.sessions.find(x => x.branch === r.branch).id, Date.parse(r.updatedAt)); red.delete(k)
    }
  }
  const busy = snap.sessions.filter(s => s.state !== 'idle' && s.state !== 'waiting').length
  if (busy >= 4) give('full-house', null, snap.now)
  if (changed) save()
}

export default {
  snapshot(snap) {
    if (dayKey() !== day) { day = dayKey(); earned = new Map(); save() }
    if (crawlReady() && snap.now - lastEval > 4000) { lastEval = snap.now; try { evaluate(snap) } catch (e) { console.error('[achievements]', e.message) } }
    // features after this one (trophies, street) fill in the snapshot later; read them from the previous one
    prev = snap
    for (const a of earned.values()) if (a.session) { const s = snap.sessions.find(x => x.id === a.session); if (s) a.holder = s.title }
    snap.achievements = { day, list: [...earned.values()].sort((a, b) => b.earnedAt - a.earnedAt), catalogue: CATALOGUE }
  },
}
