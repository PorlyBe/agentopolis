// trophies: this week's PRs (pr-link entries found by tv.mjs's crawl) and whether each one merged.
// Merged state comes from `gh pr view`, one call at a time, at most one every 12 s, newest PR first,
// unchecked ones before refreshes, each answer cached 10 min (merged is final). Without a working gh every PR stays a ribbon.
import { execFile } from 'node:child_process'
import { prsSince } from './tv.mjs'

const WEEK = 7 * 24 * 3600_000, GAP = 12_000, TTL = 10 * 60_000, CLOSED_TTL = 60 * 60_000, GH_RETRY = 10 * 60_000
const URL_OK = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/
const known = new Map() // url -> { state, mergedAt, title, checked }
let busy = false, lastCall = 0, ghDownAt = 0, ghOk = null

const stale = (k, now) => !k || (k.state !== 'MERGED' && now - k.checked > (k.state === 'CLOSED' ? CLOSED_TTL : TTL))

function ask(pr) {
  busy = true; lastCall = Date.now()
  execFile('gh', ['pr', 'view', pr.url, '--json', 'state,mergedAt,title'], { timeout: 20_000 }, (err, out, stderr) => {
    busy = false
    const prev = known.get(pr.url)
    if (err) {
      if (err.code === 'ENOENT' || /auth|log ?in|token/i.test(stderr || '')) { ghDownAt = Date.now(); ghOk = false }
      else known.set(pr.url, { ...prev, state: prev?.state ?? null, checked: Date.now() })
      return
    }
    try {
      const j = JSON.parse(out)
      known.set(pr.url, { state: j.state, mergedAt: Date.parse(j.mergedAt) || 0, title: j.title, checked: Date.now() }); ghOk = true
    } catch { known.set(pr.url, { ...prev, checked: Date.now() }) }
  })
}

export default {
  snapshot(snap) {
    const now = snap.now
    const list = prsSince(now - WEEK).filter(p => URL_OK.test(p.url)).sort((a, b) => b.at - a.at)
    if (!busy && now - lastCall > GAP && (!ghDownAt || now - ghDownAt > GH_RETRY)) {
      const next = list.find(p => !known.has(p.url)) || list.find(p => stale(known.get(p.url), now))
      if (next) ask(next)
    }
    let merged = 0, open = 0, closed = 0
    const items = list.map(p => {
      const k = known.get(p.url), state = k?.state || 'OPEN'
      if (state === 'MERGED') merged++; else if (state === 'CLOSED') closed++; else open++
      return { n: p.n, repo: p.repo, at: p.at, state, mergedAt: k?.mergedAt || 0, title: k?.title || '', checked: !!k?.state }
    })
    snap.trophies = { merged, open, closed, gh: ghOk, pending: items.filter(i => !i.checked).length, items: items.filter(i => i.state !== 'CLOSED').slice(0, 40) }
  },
}
