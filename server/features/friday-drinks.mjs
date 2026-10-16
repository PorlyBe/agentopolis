// friday-drinks: the week's tally for the roof chalkboard — PRs merged (trophies.mjs), commits and workflow runs
// since Monday 00:00 local, and today's cheapest and priciest session (cost-jar). Commits come from tv.mjs's crawl of the
// week's transcripts: each successful `git commit` Bash call, once per printed hash (or per call when -q).
// Workflow runs are the <session>/workflows/<run>.json files stamped this week. Attaches snap.fridayDrinks.
import fs from 'node:fs'
import path from 'node:path'
import * as crawler from '../lib/crawler.mjs'
import { tsOf } from '../lib/tail.mjs'
import { titleOf, commitsSince, crawlReady } from './tv.mjs'

const EVERY = 60_000
const runs = new Map()       // workflow meta file -> start time
let stamping = false, stampedAt = 0

const monday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime() }
const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }

async function runStart(file) {
  if (runs.has(file)) return
  try {
    const fh = await fs.promises.open(file, 'r'), buf = Buffer.alloc(300)
    try { await fh.read(buf, 0, 300, 0) } finally { await fh.close() }
    runs.set(file, tsOf(buf.toString('utf8')))
  } catch {}
}

// the workflow runs of the sessions touched since Monday, from the crawler's listing
async function stamp() {
  stamping = true
  try {
    const since = monday()
    for (const e of crawler.listed()) {
      if (!e.main || e.mtimeMs < since) continue
      const wd = path.join(e.sessionDir, 'workflows')
      for (const w of await dir(wd)) if (w.endsWith('.json')) await runStart(path.join(wd, w))
    }
  } catch (e) { console.error('[friday-drinks]', e.message) } finally { stamping = false; stampedAt = Date.now() }
}

export default {
  serves: ['friday-drinks'],
  after: ['tv', 'trophies', 'cost-jar'],
  snapshot(snap) {
    crawler.week.poke(snap.now)
    if (!stamping && crawler.listed().length && snap.now - stampedAt > EVERY) stamp()
    snap.fridayDrinks = tally(snap)
  },
}

function tally(snap) {
  const since = monday()
  const merged = (snap.trophies?.items || []).filter(i => i.state === 'MERGED' && (i.mergedAt || i.at) >= since).length
  const spend = Object.entries(snap.cost?.bySession || {}).filter(([, usd]) => usd > 0).sort((a, b) => a[1] - b[1])
  const who = ([id, usd]) => ({ id, usd, title: snap.sessions.find(s => s.id === id)?.title || titleOf(id) || id.slice(0, 8) })
  return {
    ready: crawlReady() && stampedAt > 0, since, merged, gh: snap.trophies?.gh ?? null,
    commits: commitsSince(since),
    workflows: [...runs.values()].filter(t => t >= since).length,
    cheapest: spend.length ? who(spend[0]) : null,
    priciest: spend.length > 1 ? who(spend.at(-1)) : null,
  }
}
