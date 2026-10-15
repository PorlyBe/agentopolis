// gazette: today's front page for the newspaper stand, from what tv, github-street, trophies and weather already gathered.
// Snapshot hooks run alphabetically, so this reads the previous snapshot (after those features filled it in).
// Their feeds are short windows (street events: 2 h, commits: 30 min, tool calls: 1 h), so a day ledger accumulates them
// and is kept in the temp dir per port, so a restart keeps the morning's news.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const WEIGHT = { merged: 5, review: 3, comment: 1, push: 1, opened: 1, ready: 1, closed: 0 }
const MIN = 60_000, HOUR = 60 * MIN
const BOT = /\[bot\]$|^Copilot$/i, RABBIT = /^coderabbit/i
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', '..')
const PORT = (process.argv.join(' ').match(/--port\s+(\d+)/) || [])[1] || '4747'
const FILE = path.join(os.tmpdir(), `agent-office-gazette-${PORT}.json`)
const FOUNDED = (() => { try { return fs.statSync(path.join(ROOT, '.git')).birthtimeMs } catch { return Date.now() } })()

const midnight = (t = Date.now()) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const dayKey = t => new Date(t).toDateString()
const blank = now => ({ day: dayKey(now), events: {}, titles: {}, minutes: {}, since: 0, ciFails: {}, workflows: {}, lead: {}, peak: null, commits: {} })
let ledger = (() => { try { const j = JSON.parse(fs.readFileSync(FILE, 'utf8')); return j.day === dayKey(Date.now()) ? j : null } catch { return null } })() || blank(Date.now())
let prev = null, edition = null, builtAt = 0, streetWasOk = false

const clip = (s, n) => { s = String(s ?? '').replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s }
const plural = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`
const big = n => n >= 1e9 ? (n / 1e9).toFixed(1) + ' billion' : n >= 1e6 ? (n / 1e6).toFixed(1) + ' million' : n >= 1e3 ? Math.round(n / 1e3) + ' thousand' : String(n)

// fold the previous snapshot's short windows into today's ledger
function absorb(s, now) {
  const today = midnight(now), L = ledger, st = s.street, tv = s.tv
  if (st?.status === 'ok') {
    for (const e of st.events || []) if (e.at >= today) L.events[e.id] = { type: e.type, actor: e.actor, target: e.target, pr: e.pr, at: e.at, review: e.review, bot: e.bot }
    for (const b of st.bots || []) for (const r of b.recent || []) if (r.at >= today) L.events[`b:${b.login}:${r.type}:${r.pr}:${r.at}`] ??= { type: r.type, actor: b.login, target: r.target, pr: r.pr, at: r.at, bot: true }
    for (const e of st.engineers || []) {
      for (const r of e.recent || []) if (r.at >= today) L.events[`e:${e.login}:${r.type}:${r.pr}:${r.at}`] ??= { type: r.type, actor: e.login, pr: r.pr, at: r.at, review: r.review }
      for (const p of e.prs || []) L.titles[p.n] = { title: p.title, author: e.login }
      if (e.ciFailedAt >= today) L.ciFails[`${e.login}:${e.ciFailedAt}`] = { login: e.login, at: e.ciFailedAt }
    }
    for (const p of st.merged || []) if (p.title) L.titles[p.number] = { ...L.titles[p.number], title: p.title, author: p.author, state: 'MERGED', mergedAt: Date.parse(p.mergedAt) }
    // events from the repo feed and the per-person lists describe the same thing twice: keep the feed's copy
    const feed = new Set(Object.entries(L.events).filter(([k]) => !k.includes(':')).map(([, e]) => `${e.actor}:${e.type}:${e.pr}:${e.at}`))
    for (const k of Object.keys(L.events)) if (k.includes(':')) { const e = L.events[k]; if (feed.has(`${e.actor}:${e.type}:${e.pr}:${e.at}`)) delete L.events[k] }
  }
  for (const p of s.trophies?.items || []) if (p.title) L.titles[p.n] = { title: p.title, author: L.titles[p.n]?.author ?? st?.me ?? null, mine: true, at: p.at, state: p.state, mergedAt: p.mergedAt }
  if (tv?.ready && tv.spark) {
    const m0 = Math.floor(now / MIN)
    tv.spark.forEach((n, i) => { const m = m0 - 59 + i; if (m * MIN >= today) L.minutes[m] = n })
    if (!L.since) L.since = Math.max(today, (m0 - 59) * MIN)
    if (tv.busiest) {
      L.lead[tv.busiest.name] = (L.lead[tv.busiest.name] || 0) + 1
      if (!L.peak || tv.busiest.calls > L.peak.calls) L.peak = { ...tv.busiest, at: now }
    }
    for (const c of tv.commits || []) if (c.t >= today) L.commits[c.id] = { t: c.t, msg: c.msg, who: c.who }
  }
  for (const x of s.sessions || []) {
    const runs = new Map()
    for (const a of x.agents || []) if (a.workflowRun) { const r = runs.get(a.workflowRun) || { name: a.workflow, n: 0, done: 0 }; r.n++; if (a.state === 'done') r.done++; runs.set(a.workflowRun, r) }
    for (const [id, r] of runs) {
      const w = L.workflows[id] ||= { name: r.name, session: x.title, agents: 0, start: now, doneAt: 0 }
      w.agents = Math.max(w.agents, r.n)
      w.doneAt = r.done === r.n ? (w.doneAt || now) : 0
    }
  }
}

function compose(s, now) {
  const today = midnight(now), L = ledger, st = s.street, ok = st?.status === 'ok', repo = st?.repo || null
  const events = Object.values(L.events).sort((a, b) => a.at - b.at)
  const prUrl = n => repo ? `https://github.com/${repo}/pull/${n}` : null
  const titleOf = n => L.titles[n]?.title || ''

  const merged = new Map(), opened = new Map()
  for (const e of events) {
    if (e.type === 'merged' && e.pr != null) merged.set(e.pr, { n: e.pr, title: titleOf(e.pr), author: e.target || L.titles[e.pr]?.author || e.actor, by: e.actor, at: e.at, url: prUrl(e.pr) })
    if (e.type === 'opened' && e.pr != null && !opened.has(e.pr)) opened.set(e.pr, { n: e.pr, title: titleOf(e.pr), author: e.actor, at: e.at, url: prUrl(e.pr) })
  }
  for (const [n, t] of Object.entries(L.titles)) {
    if (!t.mine) continue
    if (t.state === 'MERGED' && t.mergedAt >= today && !merged.has(+n)) merged.set(+n, { n: +n, title: t.title, author: t.author, at: t.mergedAt, url: prUrl(n) })
    if (t.at >= today && !opened.has(+n)) opened.set(+n, { n: +n, title: t.title, author: t.author, at: t.at, url: prUrl(n) })
  }
  for (const m of merged.values()) m.title ||= titleOf(m.n)
  const mergedList = [...merged.values()].sort((a, b) => b.at - a.at)

  const toolsToday = Object.entries(L.minutes).reduce((a, [m, n]) => +m * MIN >= today ? a + n : a, 0)
  const tokens = s.tv?.tokensToday || 0
  const commits = Object.values(L.commits).filter(c => c.t >= today).length
  const leaders = Object.entries(L.lead).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([name, minutes]) => ({ name, minutes }))
  const online = s.tv?.online || { sessions: s.sessions?.length || 0, active: 0, agents: 0 }
  const desks = (s.sessions || []).map(x => ({ title: x.title, state: x.state, agents: x.agents.filter(a => a.state !== 'done').length }))
    .sort((a, b) => b.agents - a.agents).slice(0, 5)

  const fails = Object.values(L.ciFails).filter(f => f.at >= today).sort((a, b) => b.at - a.at)
  const failsHour = fails.filter(f => now - f.at < HOUR)
  const red = ok ? st.engineers.flatMap(e => e.prs.filter(p => p.ci === 'failed').map(p => ({ n: p.n, title: p.title, author: e.login, url: p.url || prUrl(p.n) }))).slice(0, 5) : []
  const runningCi = ok ? st.engineers.reduce((a, e) => a + e.ciRunning, 0) : 0

  // engineer of the day: shipping and reviewing outweigh volume — a merge 5, a review 3, anything else 1, a close 0
  const people = new Map()
  for (const e of events) {
    if (e.bot || BOT.test(e.actor) || e.actor === st?.me || !(e.type in WEIGHT)) continue
    const p = people.get(e.actor) || { score: 0, n: 0, by: {} }
    p.score += WEIGHT[e.type]; p.n++; p.by[e.type] = (p.by[e.type] || 0) + 1
    people.set(e.actor, p)
  }
  const topLogin = [...people].sort((a, b) => b[1].score - a[1].score || b[1].n - a[1].n)[0]
  const eng = ok && (topLogin ? st.engineers.find(e => e.login === topLogin[0]) : st.engineers[0])
  const engineer = topLogin || eng ? {
    login: topLogin?.[0] || eng.login, actions: topLogin?.[1].n || 0, score: topLogin?.[1].score || 0, by: topLogin?.[1].by || {}, openPrs: eng?.prs?.length || 0,
    merges: mergedList.filter(m => m.author === (topLogin?.[0] || eng.login)).length,
  } : null

  const rabbit = events.filter(e => RABBIT.test(e.actor))
  const lastRabbit = rabbit.at(-1)
  const coderabbit = lastRabbit ? {
    pr: lastRabbit.pr, title: titleOf(lastRabbit.pr), target: lastRabbit.target || L.titles[lastRabbit.pr]?.author || null,
    kind: lastRabbit.type, review: lastRabbit.review || null, at: lastRabbit.at, today: rabbit.length, url: lastRabbit.pr != null ? prUrl(lastRabbit.pr) : null,
    prs: new Set(rabbit.map(e => e.pr)).size,
  } : null

  const wfDone = Object.values(L.workflows).filter(w => w.doneAt >= today).sort((a, b) => b.doneAt - a.doneAt)
  const weather = (() => {
    const w = s.weather
    if (!w) return null
    if (typeof w === 'string') return clip(w, 120)
    const line = w.line || w.summary || w.text || w.description || [w.condition || w.sky || w.kind, w.temp != null ? `${w.temp}°` : null].filter(Boolean).join(', ')
    return line ? clip(line, 120) : null
  })()

  // the headline: the most notable thing, with recency breaking ties
  const cands = []
  if (failsHour.length >= 3 || red.length >= 4) cands.push({ score: 100, at: failsHour[0]?.at || now, kind: 'ci', kicker: 'CI MELTDOWN', title: `${plural(Math.max(failsHour.length, red.length), 'red build')} rock the street`, deck: `Beacons flash over ${[...new Set([...failsHour.map(f => f.login), ...red.map(r => r.author)])].slice(0, 3).join(', ')}. Engineers reach for coffee.` })
  const wf = wfDone.find(w => w.agents >= 4 && now - w.doneAt < 3 * HOUR)
  if (wf) cands.push({ score: 80, at: wf.doneAt, kind: 'workflow', kicker: 'WORKFLOW COMPLETE', title: `${clip(wf.name, 48)} wraps up`, deck: `${plural(wf.agents, 'agent')} clock out after ${Math.max(1, Math.round((wf.doneAt - wf.start) / MIN))} minutes for ${clip(wf.session, 40)}.` })
  if (mergedList.length >= 3) cands.push({ score: 75, at: mergedList[0].at, kind: 'merge', kicker: 'MERGE DAY', title: `${mergedList.length} PRs land on trunk`, deck: `Latest: #${mergedList[0].n} ${clip(mergedList[0].title, 60)}${mergedList[0].author ? ' by ' + mergedList[0].author : ''}.` })
  else if (mergedList.length) { const m = mergedList[0]; cands.push({ score: 70, at: m.at, kind: 'merge', kicker: 'MERGED', title: m.title ? clip(m.title, 70) : `PR #${m.n} lands`, deck: `#${m.n}${m.author ? ` by ${m.author}` : ''} is on trunk${m.by && m.by !== m.author ? `, merged by ${m.by}` : ''}.` }) }
  if (opened.size) cands.push({ score: 40, at: [...opened.values()].at(-1).at, kind: 'opened', kicker: 'NEW ON THE STREET', title: `${plural(opened.size, 'new PR')} opened today`, deck: `Reviewers, sharpen your pencils.` })
  if (tokens > 5e6) cands.push({ score: 30, at: now, kind: 'tokens', kicker: 'BY THE NUMBERS', title: `Agents read ${big(tokens)} tokens`, deck: `${plural(toolsToday, 'tool call')} so far, and the coffee machine is holding up.` })
  cands.push({ score: 0, at: now, kind: 'quiet', kicker: 'OFFICE LIFE', title: 'A quiet day at the office', deck: 'The printer naps. The plants are watered. Nothing broke, yet.' })
  cands.sort((a, b) => (b.score + Math.max(0, 20 - (now - b.at) / (6 * MIN))) - (a.score + Math.max(0, 20 - (now - a.at) / (6 * MIN))))
  const { score, ...headline } = cands[0]

  return {
    at: now, date: now, edition: Math.max(1, Math.round((today - midnight(FOUNDED)) / (24 * HOUR)) + 1),
    repo, street: ok ? 'ok' : st?.status || 'loading',
    headline,
    merged: mergedList.slice(0, 12), mergedCount: mergedList.length,
    opened: [...opened.values()].sort((a, b) => b.at - a.at).slice(0, 8), openedCount: opened.size,
    stats: { toolsToday, since: L.since > today + MIN ? L.since : 0, toolsHour: s.tv?.toolsHour || 0, tokens, commits, online },
    busiest: { now: s.tv?.busiest || null, peak: L.peak, leaders, desks },
    workflows: wfDone.slice(0, 3).map(w => ({ name: w.name, session: w.session, agents: w.agents, doneAt: w.doneAt })),
    ci: { failsToday: fails.length, failsHour: failsHour.length, red, running: runningCi, culprits: [...new Set(fails.map(f => f.login))].slice(0, 4) },
    engineer, coderabbit, weather,
  }
}

export default {
  snapshot(snap) {
    const now = snap.now
    if (ledger.day !== dayKey(now)) ledger = blank(now)
    const streetOk = prev?.street?.status === 'ok'
    if (prev && (!edition || now - builtAt >= MIN || (streetOk && !streetWasOk))) {
      absorb(prev, now)
      edition = compose(prev, now); builtAt = now; streetWasOk = streetOk
      fs.writeFile(FILE, JSON.stringify(ledger), () => {})
    }
    prev = snap
    if (edition) snap.gazette = edition
  },
}
