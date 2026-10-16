// Where transcripts live, and the per-snapshot file index server.mjs builds for the features.
// Each snapshot, server.mjs records for every session on screen its transcript and every agent transcript it listed,
// with the stat it already took, so a feature never re-lists or re-stats them (filesOf(id)).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
export const midnight = (t = Date.now()) => new Date(t).setHours(0, 0, 0, 0)

let index = new Map()   // session id -> { id, file, stat, sessionDir, agents: [{ id, file, stat }] }
let indexedAt = 0
export const setIndex = m => { index = m; indexedAt = Date.now() }
// whether a page is polling: background timers (gh, orca) skip their work while nobody looks
export const watched = (within = 15_000) => Date.now() - indexedAt < within
export const filesOf = id => index.get(id) || null
// [{ file, stat, who }] for a session: its own transcript (who = session id) then its agents' (who = agent id)
export function transcriptsOf(id) {
  const x = index.get(id); if (!x) return []
  return [{ file: x.file, stat: x.stat, who: id, main: true }, ...x.agents.map(a => ({ file: a.file, stat: a.stat, who: a.id, main: false }))]
}

// Drop per-file states whose transcript is gone; at most once per `every` ms per map, so a poll never pays for it.
const swept = new WeakMap()
export function sweep(map, every = 60_000, now = Date.now()) {
  if (now - (swept.get(map) || 0) < every) return
  swept.set(map, now)
  for (const f of map.keys()) if (!fs.existsSync(f)) map.delete(f)
}
