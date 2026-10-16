// window-heatmap: today's tool calls per local hour, across every transcript touched today (sessions, subagents,
// workflow agents). Each tool_use id counts once (a resumed or forked transcript repeats its parent's lines). Lines come
// from the shared crawl of today's transcripts (server/lib/crawler.mjs).
// Attaches snap.heatmap = { day, hours: [24 counts] }.
import * as crawler from '../lib/crawler.mjs'
import { own, tsOf } from '../lib/tail.mjs'

const DAY = 24 * 3600_000
const USE = /"type":"tool_use","id":"([^"]+)"/g

const seen = new Set()
let hours = new Array(24).fill(0)

function line(_, l, { today }) {
  if (!l.includes('"type":"tool_use"') || !l.includes('"type":"assistant"')) return
  const at = tsOf(l)
  if (at < today || at >= today + DAY) return
  const h = new Date(at).getHours()
  for (const m of l.matchAll(USE)) if (!seen.has(m[1])) { seen.add(own(m[1])); hours[h]++ }
}

crawler.today.subscribe({
  files: new Map(),
  open: () => ({}),
  line,
  onDay() { hours = new Array(24).fill(0); seen.clear() },
})

export default {
  snapshot(snap) {
    crawler.today.poke(snap.now)
    if (crawler.today.day) snap.heatmap = { day: crawler.today.day, hours: [...hours] }
  },
}
