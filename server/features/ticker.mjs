// ticker: the latest tool calls across every session and agent, newest first.
import path from 'node:path'
import os from 'node:os'

const CAP = 40
const KEEP_MS = 2 * 60 * 60_000
const HOME = os.homedir()
const recent = new Map() // transcript file -> { session, agent, who, items, newest }

const short = s => String(s ?? '').split(HOME).join('~').split('\n')[0].trim().slice(0, 90)
function detailOf(name, i = {}) {
  if (name === 'Bash') return short(i.description || i.command)
  if (i.file_path) return short(i.file_path.replace(/^.*\/(?=[^/]+\/[^/]+$)/, '…/'))
  return short(i.description || i.pattern || i.url || i.query || i.command || i.skill || i.subject || i.prompt || '')
}

function collect(ctx) {
  const items = []
  for (const e of ctx.entries) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue
    const t = Date.parse(e.timestamp); if (!t) continue
    for (const b of e.message.content) if (b.type === 'tool_use') items.push({ id: b.id, t, tool: b.name, detail: detailOf(b.name, b.input) })
  }
  const kept = items.slice(-CAP)
  recent.set(ctx.file, {
    session: ctx.kind === 'session' ? ctx.id : path.basename(ctx.sessionDir),
    agent: ctx.kind === 'agent' ? ctx.id : null,
    who: ctx.kind === 'agent' ? (ctx.meta?.description || ctx.meta?.agentType || 'agent') : null,
    items: kept, newest: kept.at(-1)?.t ?? 0,
  })
}

export default {
  session(ctx) { collect(ctx) },
  agent(ctx) { collect(ctx) },
  snapshot(snap) {
    const titles = new Map(snap.sessions.map(s => [s.id, s.title]))
    const all = []
    for (const [file, r] of recent) {
      if (snap.now - r.newest > KEEP_MS) { recent.delete(file); continue }
      if (!titles.has(r.session)) continue
      for (const it of r.items) all.push({ ...it, session: r.session, agent: r.agent, who: r.who || titles.get(r.session) })
    }
    all.sort((a, b) => b.t - a.t)
    snap.ticker = all.slice(0, CAP)
  },
}
