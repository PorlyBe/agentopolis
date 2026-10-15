// github-street: who else is working on the repo the live sessions sit in, from read-only gh calls.
// One job per 20 s tick, round-robin (events, open PRs, runs; merged PRs every 5th round), so each source refreshes
// about once a minute and the 1.5 s snapshot only attaches the cached result. Events accumulate by id for 24 h.
// Contributor stats (commits per week per author) are fetched once a day; GitHub answers 202 while it computes them,
// so a miss retries every few minutes and the last good copy stays. Each engineer gets contrib: { commits12w, merged, score }.
import { execFile } from 'node:child_process'

const TICK = 20_000, DAY = 24 * 3600_000, HOUR = 3600_000, RETRY_NO_GH = 5 * 60_000, REPO_TTL = 10 * 60_000
const WINDOW = 12 * 7 * DAY, STATS_RETRY = 3 * 60_000
const BOT = /\[bot\]$|^Copilot$/i
const BASE_BRANCH = /^(trunk|main|master|develop)$/
const CHECKS_TTL = 5 * 60_000, CHECKS_PER_TICK = 2

const state = {
  status: 'loading', message: 'looking for the repo…', repo: null, me: null,
  prs: [], merged: [], runs: [], events: new Map(), fetched: {}, cycle: 0, busy: false, ghDownAt: 0, built: null,
  commits: null, statsAt: 0, statsTry: 0,   // commits: login -> commits in the last 12 weeks
  myCi: new Map(), checks: new Map(),   // the user's branches: last known CI (the run list slides); PR number -> { key, at, failing }
}
const remotes = new Map() // cwd -> 'owner/repo' | null
let cwds = new Set(), repoAt = 0

const run = (cmd, args, opts = {}) => new Promise(resolve => {
  execFile(cmd, args, { timeout: 30_000, maxBuffer: 16 * 1024 * 1024, ...opts }, (err, out, stderr) => resolve({ err, out, stderr: String(stderr || '') }))
})
const gh = async args => {
  const r = await run('gh', args)
  if (r.err) {
    if (r.err.code === 'ENOENT') { state.status = 'no-gh'; state.message = 'gh CLI not installed'; state.ghDownAt = Date.now() }
    else if (/auth|log ?in|token|401/i.test(r.stderr)) { state.status = 'unauth'; state.message = 'gh not signed in — run gh auth login'; state.ghDownAt = Date.now() }
    else console.error('[github-street] gh', args.slice(0, 2).join(' '), r.stderr.trim().split('\n')[0])
    return null
  }
  try { return JSON.parse(r.out) } catch { return null }
}

const repoOf = url => url.match(/github\.com[:/]([\w.-]+\/[\w.-]+?)(?:\.git)?\/?$/)?.[1] ?? null
async function findRepo() {
  repoAt = Date.now()
  for (const cwd of cwds) if (!remotes.has(cwd)) {
    const r = await run('git', ['-C', cwd, 'remote', 'get-url', 'origin'], { timeout: 5000 })
    remotes.set(cwd, r.err ? null : repoOf(r.out.trim()))
  }
  const count = new Map()
  for (const cwd of cwds) { const r = remotes.get(cwd); if (r) count.set(r, (count.get(r) || 0) + 1) }
  const best = [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  if (best !== state.repo) { state.repo = best; state.prs = []; state.merged = []; state.runs = []; state.events.clear(); state.fetched = {}; state.commits = null; state.statsAt = 0; state.statsTry = 0; state.myCi.clear(); state.checks.clear() }
  if (!best && state.status === 'loading') { state.status = 'no-repo'; state.message = 'no GitHub repo among the live sessions' }
}

function addEvents(list) {
  const cut = Date.now() - DAY
  for (const e of list || []) {
    const at = Date.parse(e.created_at)
    if (at < cut || state.events.has(e.id)) continue
    const p = e.payload || {}, actor = e.actor?.login
    let type = null, pr = p.pull_request?.number ?? p.number ?? (p.issue?.pull_request ? p.issue.number : null), ref = p.pull_request?.head?.ref, target = null, review = null
    if (e.type === 'PushEvent') { ref = p.ref?.replace(/^refs\/heads\//, ''); if (!BASE_BRANCH.test(ref || '')) type = 'push' }
    else if (e.type === 'PullRequestEvent') type = { opened: 'opened', reopened: 'opened', ready_for_review: 'ready', merged: 'merged', closed: p.pull_request?.merged ? 'merged' : 'closed' }[p.action] ?? null
    else if (e.type === 'PullRequestReviewEvent' && p.action === 'created') { type = 'review'; review = p.review?.state?.toLowerCase() ?? null }
    else if (e.type === 'PullRequestReviewCommentEvent' && p.action === 'created') type = 'comment'
    else if (e.type === 'IssueCommentEvent' && p.action === 'created' && p.issue?.pull_request) { type = 'comment'; target = p.issue.user?.login ?? null }
    if (!type || !actor) continue
    const said = (p.review?.body || p.comment?.body || '').replace(/\s+/g, ' ').trim().slice(0, 280) || null
    state.events.set(e.id, { id: e.id, type, actor, at, pr, ref: ref ?? null, target, review, said })
  }
  for (const [id, e] of state.events) if (e.at < cut) state.events.delete(id)
}

const JOBS = {
  async events() {
    // first fill reads three pages (the API's 300-event maximum); afterwards the newest page is enough
    const pages = state.fetched.events ? [1] : [1, 2, 3]
    for (const page of pages) {
      const j = await gh(['api', `repos/${state.repo}/events?per_page=100&page=${page}`])
      if (!j) break
      addEvents(j)
      if (j.length < 100) break
    }
    state.fetched.events = Date.now()
  },
  async prs() {
    const j = await gh(['pr', 'list', '-R', state.repo, '--state', 'open', '--limit', '100', '--json', 'number,title,author,isDraft,updatedAt,createdAt,reviewDecision,headRefName,reviewRequests,url,statusCheckRollup,additions,deletions,mergeable,labels'])
    if (j) { state.prs = j; state.fetched.prs = Date.now() }
  },
  async runs() {
    const j = await gh(['run', 'list', '-R', state.repo, '--limit', '60', '--json', 'databaseId,status,conclusion,headBranch,workflowName,createdAt,updatedAt,event'])
    if (j) { state.runs = j; state.fetched.runs = Date.now() }
  },
  async merged() {
    const j = await gh(['pr', 'list', '-R', state.repo, '--state', 'merged', '--limit', '40', '--json', 'number,title,author,headRefName,mergedAt,url'])
    if (j) { state.merged = j; state.fetched.merged = Date.now() }
  },
  async stats() {
    state.statsTry = Date.now()
    const j = await gh(['api', `repos/${state.repo}/stats/contributors`])
    if (!Array.isArray(j) || !j.length) { console.error('[github-street] contributor stats not ready yet (202), retrying in 3 min'); return }
    const cut = (Date.now() - WINDOW) / 1000, commits = new Map()
    for (const c of j) if (c.author?.login) commits.set(c.author.login, (c.weeks || []).reduce((n, w) => n + (w.w >= cut ? w.c : 0), 0))
    state.commits = commits; state.statsAt = Date.now()
  },
}

async function tick() {
  if (state.busy) return
  state.busy = true
  try {
    if (!state.repo || Date.now() - repoAt > REPO_TTL) await findRepo()
    if (!state.repo) return
    if (state.ghDownAt && Date.now() - state.ghDownAt < RETRY_NO_GH) return
    if (!state.me) {
      const r = await run('gh', ['api', 'user', '-q', '.login'])
      if (r.err) { await gh(['api', 'user']); return }
      state.me = r.out.trim(); state.ghDownAt = 0
    }
    // until every source has answered once, run them back to back
    const order = ['events', 'prs', 'runs', ...(state.cycle % 5 === 0 ? ['merged'] : [])]
    const missing = order.filter(k => !state.fetched[k])
    const jobs = missing.length ? missing : [order[state.cycle % 3]]
    if (!missing.length && state.cycle % 15 === 14) jobs.push('merged')
    for (const k of jobs) await JOBS[k]()
    if (Date.now() - state.statsAt > DAY && Date.now() - state.statsTry > STATS_RETRY) await JOBS.stats()
    state.cycle++
    if (state.fetched.prs) { state.status = 'ok'; state.message = ''; state.built = build(); if (await checks()) state.built = build() }
  } catch (e) { console.error('[github-street]', e.message) } finally { state.busy = false }
}

// the user's failing PRs: which check failed, from gh pr checks — only when the run list says red, refetched when a newer
// run lands on the branch or after CHECKS_TTL, at most CHECKS_PER_TICK a tick
async function checks() {
  let n = 0
  for (const p of state.built?.mine || []) {
    if (p.ci !== 'failed' || !state.myCi.get(p.headRefName)?.ci || n >= CHECKS_PER_TICK) continue   // rollup-sourced reds already name their check
    const key = state.myCi.get(p.headRefName)?.at || 0, c = state.checks.get(p.number)
    if (c && c.key === key && Date.now() - c.at < CHECKS_TTL) continue
    n++
    const j = await gh(['pr', 'checks', String(p.number), '-R', state.repo, '--json', 'name,bucket,link,workflow'])
    if (!Array.isArray(j)) { state.checks.set(p.number, { key, at: Date.now(), failing: c?.failing ?? null }); continue }
    const bad = j.filter(x => x.bucket === 'fail'), f = bad.find(x => !/complete$/i.test(x.name)) || bad[0]
    state.checks.set(p.number, { key, at: Date.now(), failing: f ? { name: f.name, workflow: f.workflow || null, url: f.link || null } : null })
  }
  return n > 0
}

// a PR's CI from the checks GitHub rolls up on its head commit — covers PRs whose runs fell out of the run list
function rollupCi(p) {
  const all = (p.statusCheckRollup || []).map(x => x.__typename === 'StatusContext'
    ? { name: x.context, url: x.targetUrl, done: x.state !== 'PENDING' && x.state !== 'EXPECTED', bad: /FAILURE|ERROR/.test(x.state) }
    : { name: x.workflowName ? `${x.workflowName} / ${x.name}` : x.name, url: x.detailsUrl, done: x.status === 'COMPLETED', bad: /FAILURE|TIMED_OUT|STARTUP_FAILURE|ACTION_REQUIRED/.test(x.conclusion) })
  if (!all.length) return null
  const bad = all.find(x => x.bad)
  return { ci: all.some(x => !x.done) ? 'running' : bad ? 'failed' : 'passed', failing: bad ? { name: bad.name, url: bad.url || null } : null }
}

// a branch's CI: the newest run of each workflow on it — running if any is, failed if any newest one failed
function branchCi() {
  const latest = new Map()
  for (const r of state.runs) {
    if (!r.headBranch || BASE_BRANCH.test(r.headBranch)) continue
    const k = r.headBranch + '\0' + r.workflowName, at = Date.parse(r.updatedAt || r.createdAt)
    if (!latest.has(k) || at > latest.get(k).at) latest.set(k, { branch: r.headBranch, at, r })
  }
  const out = new Map()
  for (const { branch, at, r } of latest.values()) {
    const c = out.get(branch) || { running: 0, failed: 0, ok: 0, at: 0, url: null }
    if (r.status !== 'completed') c.running++
    else if (/failure|timed_out|startup_failure/.test(r.conclusion)) { c.failed++; c.url ||= `https://github.com/${state.repo}/actions/runs/${r.databaseId}` }
    else if (r.conclusion === 'success' || r.conclusion === 'skipped' || r.conclusion === 'neutral') c.ok++
    c.at = Math.max(c.at, at)
    out.set(branch, c)
  }
  for (const [b, c] of out) state.myCi.set(b, { ci: c.running ? 'running' : c.failed ? 'failed' : c.ok ? 'passed' : null, at: c.at, url: c.url })
}

function build() {
  const now = Date.now(), me = state.me
  const author = new Map(), byBranch = new Map(), title = new Map()
  for (const p of [...state.merged, ...state.prs]) {
    author.set(p.number, p.author?.login); title.set(p.number, p.title)
    if (p.headRefName) byBranch.set(p.headRefName, p)
  }
  // a branch nobody has a PR for yet belongs to whoever pushed it
  const pusher = new Map()
  const events = [...state.events.values()].sort((a, b) => a.at - b.at)
  for (const e of events) if (e.type === 'push' && e.ref && !BOT.test(e.actor)) pusher.set(e.ref, e.actor)
  for (const e of events) {
    if (e.pr == null && e.ref) e.pr = byBranch.get(e.ref)?.number ?? null
    e.target = e.target || (e.pr != null && author.get(e.pr)) || (e.ref && pusher.get(e.ref)) || null
  }
  const ownerOfBranch = b => byBranch.get(b)?.author?.login || pusher.get(b) || null

  // CI per branch: running now, and the newest failure within the hour
  const ci = new Map()
  for (const r of state.runs) {
    if (!r.headBranch || BASE_BRANCH.test(r.headBranch)) continue
    const c = ci.get(r.headBranch) || { running: 0, failedAt: 0, last: null }
    if (r.status !== 'completed') c.running++
    else {
      const at = Date.parse(r.updatedAt)
      if (/failure|timed_out|startup_failure/.test(r.conclusion) && now - at < HOUR) c.failedAt = Math.max(c.failedAt, at)
      if (!c.last || at > c.last.at) c.last = { at, ok: r.conclusion === 'success' || r.conclusion === 'skipped' }
    }
    ci.set(r.headBranch, c)
  }
  const ciState = b => { const c = ci.get(b); return !c ? null : c.running ? 'running' : c.failedAt ? 'failed' : c.last?.ok ? 'passed' : c.last ? 'failed' : null }

  const people = new Map()
  const person = login => {
    if (!people.has(login)) people.set(login, { login, prs: [], ciRunning: 0, ciFailedAt: 0, recent: [], lastAt: 0, active2h: 0, touchedAt: 0 })
    return people.get(login)
  }
  for (const p of state.prs) {
    const login = p.author?.login
    if (!login || login === me || BOT.test(login) || p.author?.is_bot) continue
    person(login).prs.push({ n: p.number, title: p.title, draft: p.isDraft, review: p.reviewDecision || null, ci: ciState(p.headRefName), url: p.url, updatedAt: Date.parse(p.updatedAt) })
  }
  for (const p of state.merged) {
    const login = p.author?.login, at = Date.parse(p.mergedAt)
    if (!login || login === me || BOT.test(login) || now - at > DAY) continue
    const e = person(login); e.lastAt = Math.max(e.lastAt, at)
  }
  for (const [branch, c] of ci) {
    const login = ownerOfBranch(branch)
    if (!login || login === me || BOT.test(login) || !people.has(login) && !c.running && !c.failedAt) continue
    const e = person(login); e.ciRunning += c.running; e.ciFailedAt = Math.max(e.ciFailedAt, c.failedAt)
  }
  // the user's own open PRs (the street leaves them out: his tower is the main building)
  branchCi()
  const mine = state.prs.filter(p => p.author?.login === me).map(p => {
    const c = state.myCi.get(p.headRefName), r = c?.ci ? null : rollupCi(p), ci = c?.ci ?? r?.ci ?? null
    const ch = ci !== 'failed' ? null : r ? r.failing : state.checks.get(p.number)?.failing
    return {
      number: p.number, title: p.title, url: p.url, draft: !!p.isDraft, review: p.reviewDecision || null, ci, headRefName: p.headRefName,
      failingCheck: ci !== 'failed' ? null : ch ? { name: ch.name, url: ch.url || c.url } : c?.url ? { name: null, url: c.url } : null,
      updatedAt: Date.parse(p.updatedAt),
    }
  }).sort((a, b) => b.updatedAt - a.updatedAt)
  for (const b of state.myCi.keys()) if (!state.prs.some(p => p.headRefName === b && p.author?.login === me)) state.myCi.delete(b)
  for (const n of state.checks.keys()) if (!mine.some(p => p.number === n)) state.checks.delete(n)

  const bots = new Map(), forMe = []
  for (const e of events) {
    const bot = BOT.test(e.actor)
    if (bot) {
      if (!bots.has(e.actor)) bots.set(e.actor, { login: e.actor, recent: [] })
      bots.get(e.actor).recent.push({ type: e.type, at: e.at, pr: e.pr, target: e.target })
    } else if (e.actor !== me) {
      const p = person(e.actor)
      p.recent.push({ type: e.type, at: e.at, pr: e.pr, review: e.review })
      p.lastAt = Math.max(p.lastAt, e.at)
      if (now - e.at < 2 * HOUR) p.active2h++
      if ((e.type === 'push' || e.type === 'comment' || e.type === 'review') && e.at > p.touchedAt) p.touchedAt = e.at
    }
    if (e.target === me && e.actor !== me && (e.type === 'review' || e.type === 'comment') && now - e.at < 6 * HOUR)
      forMe.push({ id: 'ev:' + e.id, kind: e.type, who: e.actor, bot, pr: e.pr, title: title.get(e.pr) || '', review: e.review, at: e.at })
  }
  for (const p of state.prs) if ((p.reviewRequests || []).some(r => r.login === me))
    forMe.push({ id: `req:${p.number}:${p.updatedAt}`, kind: 'request', who: p.author?.login, bot: false, pr: p.number, title: p.title, at: Date.parse(p.updatedAt) })

  // merged counts only what the merged-PR list already holds (the newest 40), so it is a small bonus on top of commits
  const merged = new Map()
  for (const p of state.merged) if (p.author?.login && now - Date.parse(p.mergedAt) < WINDOW) merged.set(p.author.login, (merged.get(p.author.login) || 0) + 1)
  const contrib = login => {
    if (!state.commits) return null
    const commits12w = state.commits.get(login) || 0, m = merged.get(login) || 0
    return { commits12w, merged: m, score: commits12w + m }
  }
  const engineers = [...people.values()].filter(e => e.prs.length || now - e.lastAt < DAY).map(e => ({
    ...e, recent: e.recent.slice(-8).reverse(), level: Math.min(1, e.active2h / 8), contrib: contrib(e.login),
  })).sort((a, b) => (b.level - a.level) || (b.ciRunning - a.ciRunning) || (b.prs.length - a.prs.length) || (b.lastAt - a.lastAt))
  // the post room: every open PR, the user's and bots' included, as a parcel
  const post = state.prs.map(p => ({
    n: p.number, title: p.title, author: p.author?.login || null, mine: p.author?.login === me, bot: !!p.author?.is_bot || BOT.test(p.author?.login || ''),
    draft: !!p.isDraft, review: p.reviewDecision || null, ci: rollupCi(p)?.ci ?? null, size: (p.additions || 0) + (p.deletions || 0), additions: p.additions || 0, deletions: p.deletions || 0,
    conflict: p.mergeable === 'CONFLICTING', forMe: (p.reviewRequests || []).some(r => r.login === me),
    labels: (p.labels || []).slice(0, 3).map(l => ({ name: l.name, color: l.color })), url: p.url,
    createdAt: Date.parse(p.createdAt), updatedAt: Date.parse(p.updatedAt),
  }))
  return {
    engineers, mine, post,
    bots: [...bots.values()].map(b => ({ login: b.login, recent: b.recent.slice(-10).reverse() })),
    forMe: forMe.sort((a, b) => b.at - a.at),
    events: events.filter(e => now - e.at < 2 * HOUR).slice(-80).map(e => ({ id: e.id, type: e.type, actor: e.actor, target: e.target, pr: e.pr, at: e.at, review: e.review, bot: BOT.test(e.actor) })),
  }
}

let timer = null
export default {
  snapshot(snap) {
    const live = new Set(snap.sessions.map(s => s.cwd).filter(Boolean))
    if ([...live].some(c => !cwds.has(c))) { cwds = new Set([...cwds, ...live]); if (!state.repo) repoAt = 0 }
    if (!timer) { timer = setInterval(tick, TICK); timer.unref?.(); setTimeout(tick, 200) }
    snap.street = {
      status: state.status, message: state.message, repo: state.repo, me: state.me,
      fetchedAt: Math.max(0, ...Object.values(state.fetched)), ...(state.built || { engineers: [], mine: [], post: [], bots: [], forMe: [], events: [] }),
      merged: state.merged.map(p => ({ number: p.number, title: p.title, author: p.author?.login, mergedAt: p.mergedAt, url: p.url })),
      runs: state.runs.map(r => ({ id: r.databaseId, url: state.repo && r.databaseId ? `https://github.com/${state.repo}/actions/runs/${r.databaseId}` : null, status: r.status, conclusion: r.conclusion, branch: r.headBranch, workflow: r.workflowName, createdAt: r.createdAt, updatedAt: r.updatedAt })),
      said: [...state.events.values()].filter(e => e.said).sort((a, b) => b.at - a.at).slice(0, 20).map(e => ({ actor: e.actor, type: e.type, pr: e.pr, at: e.at, said: e.said })),
    }
  },
}
