// interoffice-mail: messages between agents. A SendMessage tool_use is a letter from its transcript's owner to
// input.to (an agent id, or a session's name); a subagent's hand-back (<agent-message from=…>), a teammate message
// and an agent's <task-notification> are a stamped return slip on the receiving session's desk. Each event is kept
// for KEEP_MS in one global map, so a letter is seen whichever transcript changed last.
import path from 'node:path'

const KEEP_MS = 15 * 60_000, MAX = 40
const events = new Map()   // id -> { id, t, kind 'letter'|'slip', from: { session, agent }, to: { session, agent, name }, text, status }
const agentHome = new Map() // agent id -> session id
const AGENT = /^a[0-9a-f]{15,17}$/
const clip = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 90)
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => typeof b === 'string' ? b : b?.type === 'text' ? b.text : '').join('\n') : ''
const NOTE = /<task-notification>[\s\S]*?<task-id>([\w-]+)<\/task-id>[\s\S]*?<status>(\w+)<\/status>(?:[\s\S]*?<summary>([\s\S]*?)<\/summary>)?/g
const HANDBACK = /<agent-message from="([^"]+)">\s*(?:\[[^\]]*\][^\n]*\n)?([\s\S]{0,400})/
const TEAMMATE = /<teammate-message[^>]*?(?:teammate_id|from)="([^"]+)"[^>]*>([\s\S]{0,300})/g

function add(e) { if (!events.has(e.id)) events.set(e.id, e) }

function scan(ctx) {
  const session = ctx.kind === 'session' ? ctx.id : path.basename(ctx.sessionDir)
  const agent = ctx.kind === 'agent' ? ctx.id : null
  if (agent) agentHome.set(agent, session)
  const cut = ctx.now - KEEP_MS
  for (const e of ctx.entries) {
    const t = Date.parse(e.timestamp) || 0
    if (t < cut) continue
    const c = e.message?.content
    if (e.type === 'assistant' && Array.isArray(c)) {
      for (const b of c) {
        if (b.type !== 'tool_use' || b.name !== 'SendMessage' || !b.input?.to) continue
        const to = String(b.input.to)
        add({ id: b.id, t, kind: 'letter', from: { session, agent }, to: AGENT.test(to) ? { agent: to } : { name: to.slice(0, 40) },
          text: clip(b.input.summary || String(b.input.message || '').split('\n')[0]) })
      }
      continue
    }
    if (e.type !== 'user' || agent) continue
    const text = textOf(c)
    if (!text || text.length > 200_000) continue
    const hb = text.startsWith('Another Claude session sent a message') && text.match(HANDBACK)
    if (hb) add({ id: e.uuid || `hb:${hb[1]}:${t}`, t, kind: 'slip', from: { agent: AGENT.test(hb[1]) ? hb[1] : null, name: AGENT.test(hb[1]) ? null : hb[1] }, to: { session },
      text: clip(hb[2].replace(/^\s*#+\s*/, '')), status: 'returned' })
    if (text.includes('<teammate-message')) for (const m of text.matchAll(TEAMMATE))
      add({ id: `${e.uuid}:tm:${m[1]}`, t, kind: 'slip', from: { agent: AGENT.test(m[1]) ? m[1] : null, name: AGENT.test(m[1]) ? null : m[1] }, to: { session }, text: clip(m[2]), status: 'message' })
    if (text.includes('<task-notification>')) for (const m of text.matchAll(NOTE)) {
      const summary = m[3] || ''
      if (!AGENT.test(m[1]) && !/^(Agent|Workflow)\b/.test(summary)) continue   // background shells belong to the server room
      add({ id: `tn:${m[1]}:${t}`, t, kind: 'slip', from: { agent: AGENT.test(m[1]) ? m[1] : null }, to: { session }, text: clip(summary), status: m[2] })
    }
  }
}

export default {
  serves: ['interoffice-mail'],
  session(ctx) { scan(ctx) },
  agent(ctx) { scan(ctx) },
  snapshot(snap) {
    const now = snap.now
    for (const s of snap.sessions) for (const a of s.agents) agentHome.set(a.id, s.id)
    const byName = new Map(snap.sessions.map(s => [String(s.title).toLowerCase(), s.id]))
    for (const [id, e] of events) if (now - e.t > KEEP_MS) events.delete(id)
    const lastSlip = new Map()   // a hand-back and its task-notification are one return slip
    const list = [...events.values()].sort((a, b) => a.t - b.t).filter(e => {
      if (e.kind !== 'slip' || !e.from.agent) return true
      const was = lastSlip.get(e.from.agent); lastSlip.set(e.from.agent, e.t)
      return was == null || e.t - was > 90_000
    })
    const out = list.slice(-MAX).map(e => {
      const from = { ...e.from, session: e.from.session || (e.from.agent && agentHome.get(e.from.agent)) || null }
      const to = { ...e.to }
      if (to.agent) to.session = agentHome.get(to.agent) || null
      else if (to.name && !to.session) to.session = byName.get(to.name.toLowerCase()) || null
      return { ...e, from, to }
    })
    if (out.length) snap.mail = out
  },
}
