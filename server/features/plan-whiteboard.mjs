// plan-whiteboard: where a session is with a plan. 'sketching' while its user turns carry permissionMode 'plan',
// 'review' while an ExitPlanMode call waits for the user, 'approved' once he said yes (kept, as the last approved plan).
const lines = plan => String(plan || '').split('\n').map(l => l.replace(/^[#>*\-\s]+|[*`_]+/g, '').trim()).filter(Boolean)

function plan({ entries }) {
  let mode = null, modeAt = 0, call = null, approved = null, at = 0
  for (const e of entries) {
    at = Date.parse(e.timestamp) || at
    if (e.type === 'user' && e.permissionMode) { mode = e.permissionMode; modeAt = at }
    const content = e.message?.content
    if (!Array.isArray(content)) continue
    for (const b of content) {
      if (b?.type === 'tool_use' && b.name === 'ExitPlanMode') call = { id: b.id, at, lines: lines(b.input?.plan).slice(0, 5) }
      else if (b?.type === 'tool_result' && call && b.tool_use_id === call.id) {
        const text = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
        if (!b.is_error && /approved/i.test(text)) { approved = { lines: call.lines, at }; mode = null }
        call = null
      }
    }
  }
  if (call) return { state: 'review', lines: call.lines, since: call.at, approved }
  if (mode === 'plan') return { state: 'sketching', since: modeAt, approved }
  if (approved) return { state: 'approved', lines: approved.lines, since: approved.at, approved }
}

const kept = new Map() // session id -> last approved plan, outliving the transcript tail
export default {
  serves: ['plan-whiteboard'],
  session: plan,
  snapshot(snap) {
    for (const s of snap.sessions) {
      const p = s.ext?.['plan-whiteboard']
      if (p?.approved && (!kept.get(s.id) || kept.get(s.id).at < p.approved.at)) kept.set(s.id, p.approved)
      if (p) delete p.approved
      if (!p && kept.has(s.id)) (s.ext ||= {})['plan-whiteboard'] = { state: 'approved', lines: kept.get(s.id).lines, since: kept.get(s.id).at }
    }
    for (const id of kept.keys()) if (!snap.sessions.some(s => s.id === id)) kept.delete(id)
  },
}
