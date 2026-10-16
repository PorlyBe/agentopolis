// task-board: a session's task list, from TaskCreate/TaskUpdate (ids are per session, "Task #3 created...")
// or TodoWrite (each call replaces the whole list). Tasks are often made early in a long transcript, so the
// whole file is read once and then only the bytes appended since, off the request path (server/lib/history.mjs).
import * as history from '../lib/history.mjs'
import { transcriptsOf } from '../lib/transcripts.mjs'

// per file: { tasks: Map(id -> task), pending: Map(toolUseId -> id), next }
function fresh() { return { tasks: new Map(), next: 1, pending: new Map() } }

function apply(st, e) {
  const content = e.message?.content
  if (!Array.isArray(content)) return
  if (e.type === 'assistant') for (const b of content) {
    if (b.type !== 'tool_use') continue
    const i = b.input || {}
    if (b.name === 'TodoWrite' && Array.isArray(i.todos)) {
      st.tasks = new Map(i.todos.map((t, n) => [String(n + 1), { subject: t.content || t.subject || '', active: t.activeForm || '', status: t.status || 'pending' }]))
      st.next = i.todos.length + 1
    } else if (b.name === 'TaskCreate') {
      const id = String(st.next++)
      st.tasks.set(id, { subject: i.subject || i.description || '', active: i.activeForm || '', status: 'pending' })
      st.pending.set(b.id, id)
    } else if (b.name === 'TaskUpdate' && i.taskId != null) {
      const id = String(i.taskId), t = st.tasks.get(id) || { subject: '', active: '', status: 'pending' }
      if (i.status === 'deleted') { st.tasks.delete(id); continue }
      if (i.status) t.status = i.status
      if (i.subject) t.subject = i.subject
      if (i.activeForm) t.active = i.activeForm
      st.tasks.set(id, t)
    }
  } else if (e.type === 'user') for (const b of content) {
    if (b.type !== 'tool_result' || !st.pending.has(b.tool_use_id)) continue
    const guess = st.pending.get(b.tool_use_id); st.pending.delete(b.tool_use_id)
    const text = typeof b.content === 'string' ? b.content : (b.content || []).map(c => c.text || '').join(' ')
    const real = String(e.toolUseResult?.task?.id ?? text.match(/Task #(\d+)/)?.[1] ?? guess)
    if (b.is_error) { st.tasks.delete(guess); continue }
    if (real !== guess && st.tasks.has(guess)) {
      const t = st.tasks.get(guess); st.tasks.delete(guess); st.tasks.set(real, t)
      st.next = Math.max(st.next, Number(real) + 1 || st.next)
    }
  }
}

const sub = {
  files: new Map(), main: true, open: fresh,
  line(st, l) {
    if (!l.includes('"Task') && !l.includes('"TodoWrite"') && !(st.pending.size && l.includes('tool_result'))) return
    try { apply(st, JSON.parse(l)) } catch {}
  },
}
history.subscribe(sub)

function board(st) {
  const list = [...st.tasks.entries()].sort((a, b) => Number(a[0]) - Number(b[0])).map(([, t]) => t)
  if (!list.length) return undefined
  const cur = list.find(t => t.status === 'in_progress')
  return {
    total: list.length,
    done: list.filter(t => t.status === 'completed').length,
    current: cur ? cur.active || cur.subject : null,
    items: list.slice(0, 12).map(t => ({ s: t.subject.slice(0, 80), st: t.status })),
  }
}

export default {
  serves: ['work-signals'],   // off: no whole-transcript reads for task lists
  snapshot(snap) {
    const now = Date.now()
    for (const x of snap.sessions) {
      const t = transcriptsOf(x.id)[0]
      const st = t && history.want(t, now) ? sub.files.get(t.file) : null
      const b = st && board(st)
      if (b) x.ext['task-board'] = b
      else delete x.ext['task-board']
    }
  },
}
