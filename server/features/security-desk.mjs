// security-desk: today's guardrail stops across every transcript touched today (sessions, subagents, workflow agents):
// a rejected permission prompt, a hook or harness block, an auto-mode classifier denial. Each names the tool it stopped,
// found through its tool_use id. Lines come from the shared crawl of the week's transcripts (server/lib/crawler.mjs: each
// file read once from the start, then only its appended bytes, asynchronously); a file joins once touched since yesterday.
import * as crawler from '../lib/crawler.mjs'
import { own } from '../lib/tail.mjs'

const KEEP = 80, DAY = 24 * 3600_000
const KINDS = [
  ['classifier', /auto mode classifier|classifier (?:gave no verdict|judged)/i],
  ['rejected', /doesn't want to proceed|tool use was rejected|was rejected by the user|Permission for this action/],
  ['hook', /^(?:<tool_use_error>)?Blocked:|PreToolUse:?\S* hook|hook (?:blocked|denied|error)|blocked by (?:a |the )?hook/i],
]
const MARK = /auto mode classifier|doesn't want to proceed|was rejected|Permission for this action|Blocked:|hook/
const USE = /"type":"tool_use","id":"(toolu_\w+)","name":"([^"]+)","input":(\{.{0,600})/g
let stops = []

function fresh(e) {
  return { session: e.session, agent: e.agent, title: null, uses: new Map() }
}
const PICK = Object.fromEntries(['description', 'command', 'file_path', 'url', 'skill', 'query'].map(k => [k, new RegExp(`"${k}":"((?:[^"\\\\]|\\\\.){1,160})`)]))
const what = (name, raw) => {
  const pick = k => raw.match(PICK[k])?.[1]?.replace(/\\n/g, ' ').replace(/\\(.)/g, '$1')
  return (name === 'Bash' ? pick('description') || pick('command') : pick('file_path') || pick('description') || pick('command') || pick('url') || pick('skill') || pick('query')) || null
}

function line(s, l, { today }) {
  if (!s.agent && l.length < 2000 && l.includes('"ai-title"')) { try { s.title = own(JSON.parse(l).aiTitle) || s.title } catch {} return }
  if (l.includes('"type":"tool_use"')) {
    for (const m of l.matchAll(USE)) { s.uses.set(own(m[1]), { tool: own(m[2]), what: own(what(m[2], m[3])) }); if (s.uses.size > 400) s.uses.delete(s.uses.keys().next().value) }
    return
  }
  if (!l.includes('"tool_result"') || !MARK.test(l)) return
  let e; try { e = JSON.parse(l) } catch { return }
  const t = Date.parse(e.timestamp) || 0
  if (t < today) return
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type !== 'tool_result') continue
    const out = (typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map(x => x.text || '').join(' ') : '').slice(0, 400)
    if (!b.is_error && !out.startsWith('<tool_use_error>')) continue
    const kind = KINDS.find(([, re]) => re.test(out))?.[0]
    if (!kind) continue
    const u = s.uses.get(b.tool_use_id) || {}
    const reason = kind === 'classifier' ? out.match(/Reason: \[([^\]]+)\]/)?.[1] || (/no verdict/.test(out) ? 'no verdict' : 'judged dangerous')
      : kind === 'hook' ? out.replace(/^<tool_use_error>/, '').replace(/<\/tool_use_error>$/, '').slice(0, 120) : 'prompt rejected'
    stops.push({ id: b.tool_use_id || `${t}`, t, kind, tool: u.tool || null, what: u.what || null, reason: own(reason), session: s.session, agent: s.agent, fileTitle: s.title })
  }
}

// a transcript joins once touched since yesterday: a stop is today's, and the tool call it names is near it
crawler.week.subscribe({
  files: new Map(),
  open: (e, st, { today }) => st.mtimeMs >= today - DAY ? fresh(e) : null,
  line,
  after({ today }) {
    const seen = new Set()
    stops = stops.filter(x => x.t >= today && !seen.has(x.id) && seen.add(x.id)).sort((a, b) => a.t - b.t).slice(-KEEP)
  },
})

export default {
  serves: ['security-desk'],   // only its own tower feature reads it
  snapshot(snap) {
    crawler.week.poke(snap.now)
    const titles = new Map(), agents = new Map()
    for (const s of snap.sessions) { titles.set(s.id, s.title); for (const g of s.agents || []) agents.set(g.id, g.description || g.type) }
    snap.securityDesk = { day: crawler.week.day, ready: crawler.week.ready, stops: stops.map(({ fileTitle, ...x }) => ({ ...x, sessionTitle: titles.get(x.session) || fileTitle || x.session.slice(0, 8), agentName: x.agent ? agents.get(x.agent) || null : null })) }
  },
}
