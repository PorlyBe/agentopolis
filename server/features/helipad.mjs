// helipad: remote/cloud work a transcript dispatched — RemoteTrigger, an Agent/Task/Workflow with isolation 'remote',
// the code-review ultra and schedule skills, CronCreate. A synchronous one is back with its
// tool_result; a remote launch is back when a task-notification names its tool-use id (or the task id its result gave).
const MAX = 8
const base = p => String(p || '').split('/').pop()
const clip = (s, n = 90) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n)
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(x => x.text || x.content || '').join(' ') : ''

function classify(b) {
  const i = b.input || {}
  if (b.name === 'RemoteTrigger') return { kind: 'trigger', label: clip(`${i.action || 'run'} ${i.trigger_id || i.name || i.prompt || ''}`), sync: true }
  if (b.name === 'CronCreate') return { kind: 'cron', label: clip(`${i.cron || i.schedule || ''} ${i.prompt || i.description || ''}`), sync: true }
  if ((b.name === 'Agent' || b.name === 'Task' || b.name === 'Workflow') && i.isolation === 'remote') {
    const wf = /name:\s*['"]([^'"]+)/.exec(i.script || '')
    return { kind: b.name === 'Workflow' ? 'workflow' : 'agent', label: clip(i.description || wf?.[1] || i.prompt || b.name), sync: false }
  }
  if (b.name === 'Skill') {
    const s = String(i.skill || ''), a = String(i.args || '')
    if (/(^|:)code-review$/.test(s) && /\bultra\b/.test(a)) return { kind: 'review', label: clip(`/code-review ${a}`), sync: false }
    if (/(^|:)schedule$/.test(s)) return { kind: 'schedule', label: clip(`/schedule ${a}`), sync: true }
  }
  return null
}

function dispatches({ entries }) {
  const out = new Map(), byTask = new Map()
  for (const e of entries) {
    const at = Date.parse(e.timestamp) || 0, content = e.message?.content
    if (e.type === 'user') {
      const t = textOf(content)
      if (t.includes('<task-notification>')) {
        const d = out.get(/<tool-use-id>([^<]+)</.exec(t)?.[1]) || byTask.get(/<task-id>([^<]+)</.exec(t)?.[1])
        if (d && !d.back) { d.back = at; d.status = /<status>([^<]+)</.exec(t)?.[1] || 'done' }
      }
    }
    for (const b of Array.isArray(content) ? content : []) {
      if (b.type === 'tool_use') { const k = classify(b); if (k) out.set(b.id, { id: b.id, ...k, at, back: null }) }
      else if (b.type === 'tool_result' && out.has(b.tool_use_id)) {
        const d = out.get(b.tool_use_id), t = textOf(b.content)
        if (b.is_error) { d.back = at; d.status = 'error' }
        else if (d.sync) { d.back = at; d.status = 'done' }
        else { const task = /task[ _-]?id[":\s]+([\w-]+)/i.exec(t)?.[1]; if (task) byTask.set(task, d) }
      }
    }
  }
  if (!out.size) return undefined
  return [...out.values()].slice(-MAX).map(({ sync, ...d }) => d)
}

export default { session: dispatches, agent: dispatches }
