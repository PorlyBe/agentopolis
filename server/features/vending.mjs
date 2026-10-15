// vending: a session or agent stalled on Anthropic's side — its last assistant entry is an API error (overloaded,
// a 5xx, a rate or usage limit) and nothing came after it. Local trouble (the Mac slept, no network) is left out.
// snapshot.vending sums it up for the café's vending machine; office-wide when several hit it within 5 minutes.
const OFFICE_WINDOW = 5 * 60_000, STALE = { overloaded: 30 * 60_000, server: 30 * 60_000, limit: 6 * 60 * 60_000 }
const LOCAL = /asleep|went to sleep|ENOTFOUND|ECONNREFUSED|ETIMEDOUT|Connection lost|check your internet|aborted|interrupted/i

const textOf = e => (Array.isArray(e.message?.content) ? e.message.content : []).filter(b => b.type === 'text').map(b => b.text).join(' ').trim()
function kindOf(e, text) {
  if (LOCAL.test(text)) return null
  if (/overload/i.test(text) || /overload/i.test(e.error || '') || e.apiErrorStatus === 529) return 'overloaded'
  if (e.error === 'rate_limit' || e.apiErrorStatus === 429 || /limit/i.test(text)) return 'limit'
  if (e.error === 'server_error' || e.apiErrorStatus >= 500 || /API Error: 5\d\d/.test(text)) return 'server'
  return null
}

function stalled({ entries }) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type === 'user' && !e.isMeta) return undefined
    if (e.type !== 'assistant') continue
    if (!e.isApiErrorMessage) return undefined
    const text = textOf(e), kind = kindOf(e, text)
    if (!kind) return undefined
    const resetsAt = typeof e.quotaLimits?.resetsAt === 'number' ? e.quotaLimits.resetsAt * 1000 : null
    return { kind, text: text.slice(0, 160), at: Date.parse(e.timestamp) || 0, resetsAt, limit: e.quotaLimits?.rateLimitType || null }
  }
}

function snapshot(snap) {
  const now = snap.now, hits = []
  for (const s of snap.sessions) {
    const live = v => v && (v.kind === 'limit' && v.resetsAt ? v.resetsAt > now : now - v.at < STALE[v.kind])
    const own = s.ext?.vending, agents = s.agents.filter(g => g.state !== 'done' && live(g.ext?.vending))
    if (live(own)) hits.push({ session: s.id, agent: null, ...own })
    for (const g of agents) hits.push({ session: s.id, agent: g.id, ...g.ext.vending })
  }
  if (!hits.length) return
  hits.sort((a, b) => b.at - a.at)
  const lead = hits.find(h => h.kind === 'limit') || hits[0]
  const recent = new Set(hits.filter(h => lead.at - h.at < OFFICE_WINDOW).map(h => h.session))
  snap.vending = { kind: lead.kind, text: lead.text, resetsAt: lead.resetsAt, limit: lead.limit, at: lead.at, office: recent.size >= 2, hits }
}

export default { session: stalled, agent: stalled, snapshot }
