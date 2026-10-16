// agent-xp: every subagent type levels up with use. XP = how many times that type was spawned in the last 90 days,
// counted from the subagent records Claude Code keeps beside each transcript (subagents/agent-*.meta.json, agentType;
// a workflow's agents live under subagents/workflows/ and count as "workflow"). Level = floor(sqrt(xp)).
// A full crawl every few minutes (a subagents dir is re-listed only when its mtime moved), a quick one of the live
// sessions' dirs between. snap.agentXp = { types: [{ type, xp, level, next }], recent: [{ type, at, description }] }.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const SPAN = 90 * 24 * 3600_000, FULL = 5 * 60_000, QUICK = 2000
const spawns = new Map()   // meta or transcript path -> { type, at, description }
const dirs = new Map()     // agents dir -> mtimeMs at its last listing
const live = new Map()     // session id -> sessionDir
let crawling = false, fullAt = 0, quickAt = 0, cache = null, cacheAt = 0

const levelOf = xp => Math.floor(Math.sqrt(xp))
const typeOf = (t, inWorkflow) => inWorkflow || t === 'workflow-subagent' ? 'workflow' : String(t || 'general-purpose').slice(0, 40)

async function listAgents(d, inWorkflow, force) {
  let st; try { st = await fs.promises.stat(d) } catch { return }
  if (Date.now() - st.mtimeMs > SPAN && !dirs.has(d)) return
  if (!force && dirs.get(d) === st.mtimeMs) return
  dirs.set(d, st.mtimeMs)
  let xs; try { xs = await fs.promises.readdir(d) } catch { return }
  const metas = new Set(xs.filter(x => x.endsWith('.meta.json')))
  for (const x of xs) {
    if (!x.startsWith('agent-') || !x.endsWith('.jsonl')) continue
    const meta = x.slice(0, -6) + '.meta.json', key = path.join(d, metas.has(meta) ? meta : x)
    if (spawns.has(key)) continue
    let s; try { s = await fs.promises.stat(key) } catch { continue }
    const at = s.birthtimeMs || s.mtimeMs
    if (Date.now() - at > SPAN) continue
    let m = {}
    if (metas.has(meta)) { try { m = JSON.parse(await fs.promises.readFile(key, 'utf8')) } catch {} }
    spawns.set(key, { type: typeOf(m.agentType, inWorkflow), at, description: String(m.description || '').slice(0, 60) })
  }
}
async function session(sessionDir, force) {
  const sub = path.join(sessionDir, 'subagents')
  await listAgents(sub, false, force)
  let wfs = []; try { wfs = await fs.promises.readdir(path.join(sub, 'workflows')) } catch {}
  for (const wf of wfs) await listAgents(path.join(sub, 'workflows', wf), true, force)
}

async function crawl(full) {
  if (crawling) return
  crawling = true
  try {
    if (full) {
      const ls = async d => { try { return await fs.promises.readdir(d, { withFileTypes: true }) } catch { return [] } }
      for (const p of await ls(PROJECTS)) {
        if (!p.isDirectory()) continue
        const pd = path.join(PROJECTS, p.name)
        for (const e of await ls(pd)) if (e.isDirectory() && e.name !== 'memory') await session(path.join(pd, e.name))
      }
      const cut = Date.now() - SPAN
      for (const [k, v] of spawns) if (v.at < cut) spawns.delete(k)
      fullAt = Date.now()
    } else for (const d of live.values()) await session(d, false)
    quickAt = Date.now()
  } catch (e) { console.error('[agent-xp crawl]', e.message) } finally { crawling = false }
}

function aggregate() {
  const by = new Map()
  for (const s of spawns.values()) by.set(s.type, (by.get(s.type) || 0) + 1)
  const types = [...by].map(([type, xp]) => { const level = levelOf(xp); return { type, xp, level, next: (level + 1) ** 2 } }).sort((a, b) => b.xp - a.xp)
  const recent = [...spawns.values()].sort((a, b) => b.at - a.at).slice(0, 12)
  return { types, recent, total: spawns.size, since: Date.now() - SPAN }
}

export default {
  serves: ['agent-xp'],   // only its own tower feature reads it
  session({ id, sessionDir }) { live.set(id, sessionDir) },
  snapshot(snap) {
    const now = Date.now()
    for (const id of live.keys()) if (!snap.sessions.some(s => s.id === id)) live.delete(id)
    if (!crawling) { if (now - fullAt > FULL) crawl(true); else if (now - quickAt > QUICK) crawl(false) }
    if (!fullAt) return
    if (!cache || now - cacheAt > 1500) { cache = aggregate(); cacheAt = now }
    snap.agentXp = cache
  },
}
