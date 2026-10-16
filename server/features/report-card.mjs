// report-card: today's totals for the daily report card (app/features/report-card.js) — sessions and subagents
// started today, tool calls by name, the longest session span and the most repeated shell command. Lines come from
// the shared crawl of today's transcripts (server/lib/crawler.mjs). Attaches snap.reportCard.
import * as crawler from '../lib/crawler.mjs'
import { own } from '../lib/tail.mjs'

const TS = /"timestamp":"([^"]+)"/
const USE = /"type":"tool_use","id":"([^"]+)","name":"([^"]+)"(,"input":\{"command":"((?:[^"\\]|\\.){0,400})")?/g

let ids = new Set(), tools = new Map(), cmds = new Map(), agentsToday = new Set(), ready = false
const sub = {
  files: new Map(),   // file -> { session, main, first, last }
  open(e, _, { today }) {
    if (!e.main && (e.birthtimeMs || 0) >= today) agentsToday.add(e.file)
    return { session: e.session, main: e.main, first: 0, last: 0 }
  },
  line,
  after() { ready = true },
  onDay() { ids = new Set(); tools = new Map(); cmds = new Map(); agentsToday = new Set() },
}
crawler.today.subscribe(sub)

function line(s, l, { today }) {
  const t = Date.parse(l.match(TS)?.[1]) || 0
  if (t < today) return
  s.first ||= t; if (t > s.last) s.last = t
  if (!l.includes('"type":"tool_use"')) return
  for (const m of l.matchAll(USE)) {
    if (ids.has(m[1])) continue
    ids.add(own(m[1])); tools.set(own(m[2]), (tools.get(m[2]) || 0) + 1)
    if (m[2] === 'Bash' && m[4] != null) {
      let c; try { c = JSON.parse(`"${m[4]}"`) } catch { continue }
      c = c.split('\n')[0].trim().slice(0, 120)
      if (c) cmds.set(own(c), (cmds.get(c) || 0) + 1)
    }
  }
}

function snapshot(snap) {
  crawler.today.poke(snap.now)
  if (!ready) { snap.reportCard = { ready: false }; return }
  const spans = new Map()
  for (const s of sub.files.values()) {
    if (!s.first) continue
    const b = spans.get(s.session) || { first: Infinity, last: 0, main: false }
    b.first = Math.min(b.first, s.first); b.last = Math.max(b.last, s.last); b.main ||= s.main
    spans.set(s.session, b)
  }
  const longest = [...spans].sort((a, b) => (b[1].last - b[1].first) - (a[1].last - a[1].first))[0]
  const top = [...tools].sort((a, b) => b[1] - a[1]).slice(0, 3)
  const retried = [...cmds].sort((a, b) => b[1] - a[1])[0]
  snap.reportCard = {
    ready: true, day: crawler.today.day,
    sessions: [...spans.values()].filter(b => b.main).length,
    agents: agentsToday.size,
    tools: ids.size,
    top,
    longest: longest ? { id: longest[0], ms: longest[1].last - longest[1].first } : null,
    retried: retried && retried[1] > 2 ? { cmd: retried[0], n: retried[1] } : null,
  }
}

export default { snapshot }
