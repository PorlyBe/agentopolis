// server-room: background jobs (bg shells, Monitors, async Agents, Workflows) running across every session.
// A job starts at the tool_result that hands back its task id and ends at a <task-notification> carrying a
// <status>, a TaskStop on its id, or MAX_AGE_MS. Notifications can land in a different transcript than the
// launch (a workflow agent's shell notifies the session), so starts and ends live in two global maps.
import path from 'node:path'

const MAX_AGE_MS = 12 * 60 * 60_000
const FAILED_SHOW_MS = 60_000
const jobs = new Map()   // task id -> { id, kind, label, session, agent, t, until? }
const ends = new Map()   // task id -> { status, t }
const NOTE = /<task-id>([\w-]+)<\/task-id>[\s\S]*?<status>(\w+)<\/status>/g

const kindOf = name => name === 'Bash' || name === 'PowerShell' ? 'shell' : name === 'Monitor' ? 'monitor' : name === 'Workflow' ? 'workflow' : 'agent'
const clip = s => String(s ?? '').split('\n')[0].trim().slice(0, 60)
const labelOf = (use, tur) => clip(tur.workflowName || use.input?.description || tur.description || use.input?.command || use.name)
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => typeof b === 'string' ? b : b?.text || (typeof b?.content === 'string' ? b.content : '')).join('\n') : ''

function scan(ctx) {
  const session = ctx.kind === 'session' ? ctx.id : path.basename(ctx.sessionDir)
  const agent = ctx.kind === 'agent' ? ctx.id : null
  const uses = new Map()
  for (const e of ctx.entries) {
    const t = Date.parse(e.timestamp) || ctx.now
    const c = e.message?.content
    if (e.type === 'assistant' && Array.isArray(c)) { for (const b of c) if (b.type === 'tool_use') uses.set(b.id, b); continue }
    let notes = ''
    if (e.type === 'queue-operation' && e.operation === 'enqueue') notes = textOf(e.content)
    else if (e.type === 'attachment' && e.attachment?.type === 'queued_command') notes = textOf(e.attachment.prompt)
    else if (e.type === 'user') {
      notes = textOf(typeof c === 'string' ? c : (c || []).filter(b => b.type === 'text'))
      const tur = e.toolUseResult
      if (Array.isArray(c) && tur && typeof tur === 'object') for (const b of c) {
        if (b.type !== 'tool_result' || b.is_error) continue
        const use = uses.get(b.tool_use_id); if (!use) continue
        if (use.name === 'TaskStop' || use.name === 'KillShell') { const id = tur.task_id || use.input?.task_id || use.input?.shell_id; if (id) end(id, 'killed', t); continue }
        const id = tur.backgroundTaskId || (tur.status === 'async_launched' && (tur.taskId || tur.agentId)) || (use.name === 'Monitor' && tur.taskId)
        if (!id || jobs.has(id)) continue
        const job = { id, kind: kindOf(use.name), label: labelOf(use, tur), session, agent, t }
        if (use.name === 'Monitor' && !tur.persistent && tur.timeoutMs) job.until = t + tur.timeoutMs
        jobs.set(id, job)
      }
    }
    if (notes.includes('<task-notification>')) for (const m of notes.matchAll(NOTE)) end(m[1], m[2], t)
  }
}
function end(id, status, t) { const was = ends.get(id); if (!was || was.t > t) ends.set(id, { status, t }) }

export default {
  session(ctx) { scan(ctx) },
  agent(ctx) { scan(ctx) },
  snapshot(snap) {
    const now = snap.now
    const live = new Map(snap.sessions.filter(s => s.running).map(s => [s.id, s]))
    const running = [], failed = []
    for (const [id, j] of jobs) {
      const e = ends.get(id)
      if (now - j.t > MAX_AGE_MS) { jobs.delete(id); ends.delete(id); continue }
      if (e) {
        if (e.status === 'failed' && now - e.t < FAILED_SHOW_MS && live.has(j.session)) failed.push({ id, kind: j.kind, label: j.label, session: j.session, ago: now - e.t })
        continue
      }
      if (j.until && now > j.until) continue
      const s = live.get(j.session); if (!s) continue
      // a subagent's shells die with it; once it has left the office, stop counting them
      if (j.agent && !s.agents.some(a => a.id === j.agent)) continue
      running.push({ id, kind: j.kind, label: j.label, session: j.session, title: s.title, since: j.t })
    }
    for (const [id, e] of ends) if (!jobs.has(id) && now - e.t > MAX_AGE_MS) ends.delete(id)
    running.sort((a, b) => a.since - b.since)
    snap.serverRoom = { running, failed }
    // a session that ended its turn while its own shell or monitor runs is building, not idle or waiting on the user
    for (const s of snap.sessions) {
      const own = running.filter(j => j.session === s.id && !jobs.get(j.id)?.agent && (j.kind === 'shell' || j.kind === 'monitor'))
      if (!own.length) continue
      s.background = own.map(j => ({ label: j.label, kind: j.kind, since: j.since }))
      if (s.state === 'waiting' || s.state === 'idle') s.state = 'building'
    }
  },
}
