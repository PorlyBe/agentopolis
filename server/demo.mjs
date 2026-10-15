// demo: a fully synthetic snapshot for `node server.mjs --demo`. Every name is invented; nothing here reads the disk,
// runs a command or touches the network. Deterministic in `now`, so successive polls animate smoothly.

const REPO = 'acme/skyline', ME = 'you', GH = `https://github.com/${REPO}`
const SEC = 1000, MIN = 60 * SEC, HOUR = 60 * MIN

const hash = s => { let h = 2166136261; for (const c of String(s)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const hex = (s, n) => { let o = ''; for (let i = 0; o.length < n; i++) o += hash(s + ':' + i).toString(16).padStart(8, '0'); return o.slice(0, n) }
const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const iso = t => new Date(t).toISOString().replace(/\.\d+Z$/, 'Z')
const cents = n => Math.round(n * 100) / 100

const OPUS = { model: 'claude-opus-4-1', family: 'Opus 4.1', window: 1_000_000 }
const SONNET = { model: 'claude-sonnet-4-5', family: 'Sonnet 4.5', window: 200_000 }

// [tool, detail]; null is a thinking beat
const SCRIPTS = {
  payments: [['Read', 'src/refunds/webhook.rs'], ['Grep', 'idempotency_key'], null, ['Edit', 'src/refunds/webhook.rs'], ['Bash', 'Run the refunds test suite'],
    ['Edit', 'src/ledger/entry.rs'], null, ['Bash', 'cargo clippy --all-targets'], ['TaskUpdate', 'Store the webhook delivery id'], ['Read', 'migrations/0042_refund_events.sql']],
  data: [['Agent', 'Map the ingest jobs'], ['Read', 'pipeline/jobs/ingest.py'], null, ['Bash', 'Check the backfill progress']],
  auth: [['AskUserQuestion', 'Rotate signing keys now or at the next deploy?']],
  docs: [['WebSearch', 'docs site search with static export'], ['Edit', 'content/quickstart.mdx'], ['Bash', 'Build the docs site']],
  mobile: [['Workflow', 'release-checklist']],
  explore: [['Glob', 'pipeline/**/*.py'], ['Grep', 'def run'], ['Read', 'pipeline/jobs/export.py'], null, ['Read', 'pipeline/scheduler.py']],
  backfill: [['Bash', 'Backfill September events'], ['Read', 'pipeline/backfill.py'], null, ['Edit', 'pipeline/backfill.py']],
  ios: [['Edit', 'ios/App/Settings/SettingsView.swift'], ['Bash', 'Build the iOS app for the simulator'], null, ['Read', 'ios/App/Info.plist']],
  android: [['Bash', 'Run the Android unit tests'], ['Edit', 'android/app/build.gradle.kts'], ['Read', 'android/app/src/main/AndroidManifest.xml'], null],
  notes: [['Bash', 'git log v3.1.0..HEAD --oneline'], ['Write', 'RELEASE_NOTES.md'], null, ['Read', 'CHANGELOG.md']],
  check: [['Bash', 'Check every store listing field'], ['Read', 'fastlane/metadata/en-US/description.txt'], null],
  reviewer: [['Read', 'src/refunds/webhook.rs'], ['Grep', '.unwrap()'], null, ['Read', 'src/ledger/entry.rs']],
}

const step = (key, now, ms = 4500) => {
  const off = hash(key) % ms, k = Math.floor((now + off) / ms)
  return { k, at: k * ms - off }
}
const pick = (key, script, k) => SCRIPTS[script][(k + hash(key)) % SCRIPTS[script].length]
const LANG = [[/\.rs$/, 'rust'], [/\.py$/, 'python'], [/\.swift$/, 'swift'], [/\.kts?$/, 'kotlin'], [/\.sql$/, 'sql'], [/\.(md|mdx|txt)$/, 'docs'], [/\.(ts|tsx|js)$/, 'ts'], [/\.go$/, 'go'], [/\.css$/, 'css'], [/\.sh$/, 'shell']]
// uniforms: the latest file the script edited and read, walking back from its current step
function uniformOf(key, script, k, now, ms = 4500) {
  const out = {}
  for (let i = 0; i < SCRIPTS[script].length; i++) {
    const x = pick(key, script, k - i), lang = x && /^(Edit|Write|Read)$/.test(x[0]) && LANG.find(([re]) => re.test(x[1]))?.[1]
    const kind = x?.[0] === 'Read' ? 'read' : 'edit'
    if (lang && !out[kind]) out[kind] = { lang, at: now - i * ms }
  }
  return Object.keys(out).length ? out : undefined
}

// An agent slot comes and goes: present for `life`, lingers 20 s as done, then gone until the next period.
function slot(sid, key, now, { period, life, off = 0 }) {
  const t = (now + off) % period, g = Math.floor((now + off) / period)
  if (t > life + 20 * SEC) return null
  return { id: 'a' + hex(`${sid}:${key}:${g}`, 16), born: now - t, done: t > life }
}

const SESSIONS = [
  { key: 'payments', title: 'PAYMENTS API', wt: 'refund-webhooks', branch: 'feat/refund-webhooks', m: OPUS, stacks: [['rust', 0.72], ['sql', 0.2]], usd: 9.4,
    prompt: 'make the refund webhook idempotent', pr: 423 },
  { key: 'mobile', title: 'MOBILE APP', wt: 'release-3-2', branch: 'release/3.2-checklist', m: OPUS, stacks: [['swift', 0.48], ['kotlin', 0.41]], usd: 14.2,
    prompt: 'run the release checklist for 3.2', pr: 424 },
  { key: 'docs', title: 'DOCS SITE', wt: 'quickstart', branch: 'docs/quickstart', m: SONNET, stacks: [['docs', 0.66], ['react', 0.3]], usd: 2.1,
    prompt: 'rewrite the quickstart page', pr: null },
  { key: 'data', title: 'DATA PIPELINE', wt: 'events-backfill', branch: 'data/events-backfill', m: OPUS, stacks: [['python', 0.7], ['sql', 0.25]], usd: 6.8,
    prompt: 'backfill the events table for September', pr: null },
  { key: 'auth', title: 'AUTH SERVICE', wt: 'key-rotation', branch: 'auth/key-rotation', m: SONNET, stacks: [['go', 0.81], ['terraform', 0.12]], usd: 3.3,
    prompt: 'rotate the JWT signing keys on a schedule', pr: 422 },
].map(s => ({ ...s, id: [hex(s.key, 8), hex(s.key + 1, 4), '4' + hex(s.key + 2, 3), 'a' + hex(s.key + 3, 3), hex(s.key + 4, 12)].join('-') }))

const ENGINEERS = ['alice-dev', 'bob-codes', 'carol-ci', 'dave-ships', 'erin-reviews', 'frank-fixes']
const PRS = [
  { n: 412, author: 'alice-dev', title: 'api: paginate the invoices endpoint', review: 'APPROVED', size: [182, 40], labels: ['api'] },
  { n: 418, author: 'alice-dev', title: 'web: dark mode for the billing page', draft: true, size: [410, 96], labels: ['web'] },
  { n: 415, author: 'bob-codes', title: 'ios: cache avatars on disk', red: true, size: [96, 12], labels: ['ios'] },
  { n: 409, author: 'carol-ci', title: 'ci: split the test matrix by service', review: 'APPROVED', size: [64, 58], labels: ['ci'] },
  { n: 420, author: 'carol-ci', title: 'ci: cache the cargo registry between jobs', size: [22, 4], labels: ['ci'], forMe: true },
  { n: 421, author: 'dave-ships', title: 'deploy: blue-green rollout for the worker fleet', size: [530, 210], labels: ['infra'], conflict: true },
  { n: 417, author: 'erin-reviews', title: 'docs: explain retry semantics', review: 'CHANGES_REQUESTED', size: [48, 6], labels: ['docs'] },
  { n: 419, author: 'frank-fixes', title: 'fix: race in the session refresh', flaky: true, size: [31, 18], labels: ['bug'] },
  { n: 423, author: ME, title: 'payments: refund webhooks are idempotent', size: [264, 71], labels: ['payments'], branch: 'feat/refund-webhooks' },
  { n: 424, author: ME, title: 'mobile: release checklist for 3.2', draft: true, size: [1240, 860], labels: ['mobile'], branch: 'release/3.2-checklist' },
  { n: 422, author: ME, title: 'auth: rotate signing keys on a schedule', review: 'APPROVED', size: [140, 22], labels: ['auth'], branch: 'auth/key-rotation' },
]
const LABELS = { api: '1d76db', web: '3594a7', ios: 'f05138', ci: '9aa6b2', infra: '7b42bc', docs: 'f7f3e8', bug: 'd73a4a', payments: '0e8a16', mobile: '6e5494', auth: 'fbca04' }
const MERGED = [
  [408, 'alice-dev', 'api: return 409 on duplicate charges'], [407, ME, 'payments: ledger entries carry a currency'], [406, 'carol-ci', 'ci: run clippy on every crate'],
  [405, 'dave-ships', 'infra: bump the worker memory limit'], [404, 'frank-fixes', 'fix: retry the email job on timeout'], [403, ME, 'auth: shorter refresh token lifetime'],
  [402, 'erin-reviews', 'docs: a page for webhooks'], [401, 'bob-codes', 'android: edge-to-edge on the home screen'],
]
const SAID = ['Looks good, one nit on naming.', 'Can we add a test for the empty case?', 'Nice catch on the retry loop!', 'LGTM once CI is green.',
  'Should this live behind a flag?', 'Rebased on main, ready for another look.', 'Shipping it 🚀', 'Thanks, updated.']

// CI on a PR cycles: running for a while, then its result; flaky ones alternate.
function ci(p, now) {
  const P = 4 * MIN + (hash(p.n) % 120) * SEC, t = (now + hash('ci' + p.n)) % P, g = Math.floor((now + hash('ci' + p.n)) / P)
  const start = now - t, running = t < P * 0.35
  const ok = p.red ? false : p.flaky ? g % 2 === 0 : true
  return { state: running ? 'running' : ok ? 'passed' : 'failed', start, end: running ? null : start + P * 0.35, g }
}

function sessionCore(s, now) {
  const base = { id: s.id, title: s.title, cwd: `/home/${ME}/code/skyline/.claude/worktrees/${s.wt}`, branch: s.branch, worktree: s.wt,
    running: true, endedAt: null, lastActivity: now - (hash(s.key + Math.floor(now / 7000)) % 4000) }
  const { k } = step(s.key, now), x = pick(s.key, s.key, k)
  let state = x ? 'tool' : 'thinking'
  if (s.key === 'mobile' || s.key === 'data') state = 'delegating'
  if (s.key === 'docs') state = 'waiting'
  if (s.key === 'auth') state = 'attention'
  return { ...base, state, tool: state === 'waiting' ? null : x?.[0] ?? null, detail: state === 'waiting' ? null : x?.[1] ?? null }
}

function agentsOf(s, now) {
  const mk = (key, script, type, description, sl, extra = {}) => {
    if (!sl) return null
    const { k, at } = step(sl.id, now, 3800), x = pick(sl.id, script, k)
    const ctx = Math.min(0.9, 0.08 + (now - sl.born) / (40 * MIN))
    return {
      id: sl.id, type, description, phase: extra.phase || null, workflow: extra.workflow || null, workflowRun: extra.workflowRun || null,
      state: sl.done ? 'done' : x ? 'tool' : 'thinking', tool: x?.[0] ?? null, detail: x?.[1] ?? null, lastActivity: Math.min(now, at), script, key,
      ext: { 'context-meter': { used: Math.round(ctx * 200_000), window: 200_000, pct: ctx, model: SONNET.model },
        uniforms: uniformOf(sl.id, script, k, now, 3800), ...(key === 'explore' && { wardrobe: { model: 'claude-haiku-4-5', big: false } }) },
    }
  }
  if (s.key === 'payments') return [mk('rev', 'reviewer', 'code-reviewer', 'Review the refund changes', slot(s.id, 'rev', now, { period: 4 * MIN, life: 100 * SEC }))].filter(Boolean)
  if (s.key === 'data') return [
    mk('explore', 'explore', 'Explore', 'Map the ingest jobs', slot(s.id, 'explore', now, { period: 5 * MIN, life: 4 * MIN })),
    mk('backfill', 'backfill', 'general-purpose', 'Backfill September events', slot(s.id, 'backfill', now, { period: 9 * MIN, life: 8 * MIN, off: 2 * MIN })),
  ].filter(Boolean)
  if (s.key === 'mobile') {
    const run = 'wf_' + hex('release' + Math.floor(now / (12 * MIN)), 12), wf = { workflow: 'release-checklist', workflowRun: run }
    return [
      mk('ios', 'ios', 'workflow-subagent', 'build iOS 3.2', slot(s.id, 'ios', now, { period: 6 * MIN, life: 5 * MIN }), { ...wf, phase: 'Build' }),
      mk('android', 'android', 'workflow-subagent', 'build Android 3.2', slot(s.id, 'android', now, { period: 7 * MIN, life: 6 * MIN, off: MIN }), { ...wf, phase: 'Build' }),
      mk('notes', 'notes', 'workflow-subagent', 'write the release notes', slot(s.id, 'notes', now, { period: 5 * MIN, life: 3 * MIN, off: 2 * MIN }), { ...wf, phase: 'Build' }),
      mk('check', 'check', 'workflow-subagent', 'check the store listings', slot(s.id, 'check', now, { period: 8 * MIN, life: 4 * MIN, off: 3 * MIN }), { ...wf, phase: 'Check' }),
    ].filter(Boolean)
  }
  return []
}

function sessionExt(s, x, now) {
  const day = midnight(now), into = Math.max(1, (now - day) / HOUR)
  const ctxPct = 0.18 + ((now / (90 * MIN) + hash(s.key) / 1e9) % 1) * 0.6
  const usd = cents(s.usd * Math.min(into, 9) / 4 + ((now / MIN) % 60) * 0.02)
  const tokens = Math.round(usd * 160_000)
  const clockIn = Math.min(now - 2 * HOUR - (hash(s.key) % 3) * HOUR, now)
  const hours = []; for (let t = clockIn; t <= now; t += HOUR) hours.push(new Date(t).getHours())
  const ext = {
    'context-meter': { used: Math.round(ctxPct * s.m.window), window: s.m.window, pct: ctxPct, model: s.m.model },
    uniforms: SCRIPTS[s.key] ? uniformOf(s.key, s.key, step(s.key, now).k, now) : undefined,
    'cost-jar': { usdToday: usd, tokensToday: tokens, byModel: { [s.m.model]: { family: s.m.family, usd, tokens, messages: Math.round(tokens / 9000) } } },
    'desk-props': { top: s.stacks.map(([stack, share]) => ({ stack, w: Math.round(share * 300), share })), files: 40 + hash(s.key) % 300 },
    'time-clock': { in: clockIn, hours: [...new Set(hours)] },
    walkabout: { at: now - 6 * MIN - hash(s.key) % (20 * MIN), text: s.prompt },
    'milestone-cake': { today: 300 + Math.round(into * 60) + hash(s.key) % 200, milestone: 500, at: now - 25 * MIN },
  }
  const mine = PRS.find(p => p.n === s.pr)
  ext['pr-celebration'] = mine
    ? { pr: { n: mine.n, url: `${GH}/pull/${mine.n}`, repo: REPO, title: mine.title, at: now - 70 * MIN }, prCount: 2 + hash(s.key) % 4, commits: 3 + hash(s.key) % 9, lastCommitAt: now - 12 * MIN }
    : { pr: null, prCount: 0, commits: 2, lastCommitAt: now - 30 * MIN }

  if (s.key === 'payments') {
    const c = (now % (3 * MIN)) / (3 * MIN)
    ext['task-board'] = { total: 5, done: 2, current: 'Storing the webhook delivery id', items: [
      { s: 'Read the current webhook handler', st: 'completed' }, { s: 'Add a refund_events table', st: 'completed' },
      { s: 'Store the webhook delivery id', st: 'in_progress' }, { s: 'Reject a replayed delivery', st: 'pending' }, { s: 'Open the PR', st: 'pending' }] }
    ext['test-lab'] = { flasks: [
      { service: 'payments-api', suite: 'cargo test', result: 'pass', at: now - Math.round(c * 3 * MIN), summary: '214 passed', runningSince: c < 0.3 ? now - Math.round(c * 3 * MIN) : null },
      { service: 'payments-api', suite: 'cargo clippy', result: 'pass', at: now - 7 * MIN, summary: 'exit 0', runningSince: null }] }
    ext['window-cleaner'] = { runs: [{ at: now - (now % (2 * MIN)), cmd: 'cargo fmt' }] }
    ext.bugs = { errs: [now - 9 * MIN, now - 4 * MIN] }
    const hp = now % (8 * MIN), hAt = now - hp
    ext.helipad = [{ id: 'toolu_' + hex('heli' + hAt, 20), kind: 'review', label: '/code-review ultra', at: hAt, back: hp > 4 * MIN ? hAt + 4 * MIN : null, ...(hp > 4 * MIN ? { status: 'completed' } : {}) }]
    const tp = now % (9 * MIN)
    if (tp < 100 * SEC) {
      const since = now - tp, c0 = { who: s.id, since, at: since + 2 * SEC, files: ['src/ledger/entry.rs'], cmd: 'git rebase origin/main', op: 'rebase' }
      ext['tug-of-war'] = tp < 80 * SEC ? { open: [c0], ended: [] } : { open: [], ended: [{ ...c0, end: since + 80 * SEC, how: 'resolved' }] }
    }
  }
  if (s.key === 'mobile') {
    const a = x.agents, ph = name => { const l = a.filter(g => g.phase === name); return { done: l.filter(g => g.state === 'done').length, total: Math.max(1, l.length) } }
    const b = ph('Build'), c = ph('Check')
    ext['workflow-phases'] = [{ run: a[0]?.workflowRun || 'wf_' + hex('release', 12), name: 'release-checklist', status: 'running', last: now,
      phases: [{ title: 'Build', state: 'active', ...b }, { title: 'Check', state: c.done ? 'active' : 'pending', ...c }, { title: 'Ship', state: 'pending', done: 0, total: 1 }] }]
    ext.library = { skills: [{ name: 'release-notes', at: now - 20 * MIN }, { name: 'store-listing', at: now - 9 * MIN }], web: { kind: 'search', q: 'app store screenshot sizes 2026', at: now - 5 * MIN } }
  }
  if (s.key === 'docs') {
    ext['waiting-line'] = { text: 'The new quickstart is live on the preview. Want me to add the API reference next?', kind: 'reply' }
    ext.meeting = { asking: true }
    ext['phone-booth'] = { at: now - 70 * SEC, host: 'localhost:3000', tool: 'navigate' }
    ext.library = { skills: [{ name: 'docs-style', at: now - 30 * MIN }], web: { kind: 'fetch', q: 'nextjs.org', at: now - 12 * MIN } }
  }
  if (s.key === 'data') {
    ext['test-lab'] = { flasks: [{ service: 'pipeline', suite: 'pytest', result: 'fail', at: now - 3 * MIN, summary: '2 failed, 118 passed', runningSince: null }] }
    ext['desk-props'].files = 88
  }
  if (s.key === 'auth') {
    ext['waiting-line'] = { text: 'Rotate the signing keys now, or at the next deploy?', kind: 'question', more: 0 }
    ext['plan-whiteboard'] = { state: 'approved', lines: ['Add a key-rotation job', 'Keep the old key for 24 hours', 'Publish both keys in JWKS', 'Alert when a rotation fails'], since: now - 50 * MIN }
  }
  return ext
}

function background(s, now) {
  if (s.key === 'data') return [{ label: 'Backfill events 2026-09', kind: 'shell', since: now - 14 * MIN }]
  if (s.key === 'payments' && now % (5 * MIN) < 3 * MIN) return [{ label: 'Load-test the refunds endpoint', kind: 'shell', since: now - (now % (5 * MIN)) }]
  return []
}

function street(now) {
  const open = PRS.map(p => {
    const c = ci(p, now), [add, del] = p.size, created = now - (2 + hash(p.n) % 40) * HOUR
    return { ...p, ci: c, created, updated: Math.max(created, c.start), branch: p.branch || `${p.author.split('-')[0]}/${p.title.split(': ')[1].replace(/\W+/g, '-').slice(0, 28)}`, add, del }
  })
  const url = n => `${GH}/pull/${n}`
  const slot = 9 * MIN, j0 = Math.floor(now / slot), events = []
  for (let j = j0 - 13; j <= j0; j++) {
    const at = j * slot + hash('ev' + j) % slot
    if (at > now) continue
    const actor = ENGINEERS[hash('a' + j) % ENGINEERS.length], p = PRS[hash('p' + j) % PRS.length]
    const type = ['review', 'comment', 'push', 'comment', 'review', 'opened'][hash('t' + j) % 6]
    const review = type === 'review' ? ['approved', 'commented', 'changes_requested', 'approved'][hash('r' + j) % 4] : null
    events.push({ id: String(9e9 + j), type, actor: actor === p.author ? ENGINEERS[(ENGINEERS.indexOf(actor) + 1) % 6] : actor, target: p.author, pr: p.n, at, review, bot: false,
      said: type === 'comment' || type === 'review' ? SAID[hash('s' + j) % SAID.length] : null })
  }
  const engineers = ENGINEERS.map((login, i) => {
    const mine = open.filter(p => p.author === login), recent = events.filter(e => e.actor === login)
    const lastAt = Math.max(0, ...recent.map(e => e.at)), fails = mine.filter(p => p.ci.state === 'failed')
    return {
      login, prs: mine.map(p => ({ n: p.n, title: p.title, draft: !!p.draft, review: p.review || null, ci: p.ci.state, url: url(p.n), updatedAt: p.updated })),
      ciRunning: mine.filter(p => p.ci.state === 'running').length, ciFailedAt: Math.max(0, ...fails.map(p => p.ci.end)),
      recent: recent.slice(-4).reverse().map(e => ({ type: e.type, at: e.at, pr: e.pr, review: e.review })),
      lastAt, active2h: recent.length, touchedAt: lastAt, level: Math.min(1, 0.3 + recent.length / 4),
      contrib: { commits12w: 40 + hash(login) % 160, merged: 6 + hash(login) % 30, score: hash(login) % 100 },
    }
  })
  const mineOpen = open.filter(p => p.author === ME)
  const runs = []
  for (const p of open) for (const wf of ['ci', 'lint']) {
    const c = p.ci, long = wf === 'ci', end = long ? c.end : c.start + 40 * SEC
    const running = long ? c.state === 'running' : now < end
    runs.push({ id: 7e9 + p.n * 100 + c.g % 50 + (long ? 0 : 50), url: `${GH}/actions/runs/${7e9 + p.n * 100}`, status: running ? 'in_progress' : 'completed',
      conclusion: running ? null : long && c.state === 'failed' ? 'failure' : 'success', branch: p.branch, workflow: wf, createdAt: iso(c.start), updatedAt: iso(running ? now : end) })
  }
  runs.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  const forMe = events.filter(e => e.target === ME && (e.type === 'review' || e.type === 'comment')).reverse()
    .map(e => ({ id: 'ev:' + e.id, kind: e.type, who: e.actor, bot: false, pr: e.pr, title: PRS.find(p => p.n === e.pr).title, review: e.review, at: e.at }))
  return {
    status: 'ok', message: '', repo: REPO, me: ME, fetchedAt: now - (now % 30_000),
    engineers,
    mine: mineOpen.map(p => ({ number: p.n, title: p.title, url: url(p.n), draft: !!p.draft, review: p.review || null, ci: p.ci.state, headRefName: p.branch,
      failingCheck: p.ci.state === 'failed' ? { name: 'ci / test', url: `${GH}/actions` } : null, updatedAt: p.updated })),
    post: [...open].sort((a, b) => b.n - a.n).map(p => ({ n: p.n, title: p.title, author: p.author, mine: p.author === ME, bot: false, draft: !!p.draft, review: p.review || null,
      ci: p.ci.state, size: p.add + p.del, additions: p.add, deletions: p.del, conflict: !!p.conflict, forMe: !!p.forMe,
      labels: p.labels.map(name => ({ name, color: LABELS[name] })), url: url(p.n), createdAt: p.created, updatedAt: p.updated })),
    bots: [{ login: 'release-bot[bot]', recent: [{ type: 'comment', at: now - 16 * MIN, pr: 424, target: ME }] }],
    forMe,
    events: events.map(({ said, ...e }) => e),
    merged: MERGED.map(([n, author, title], i) => ({ number: n, title, author, mergedAt: iso(now - (35 + i * 47) * MIN), url: url(n) })),
    runs: runs.slice(0, 40),
    said: events.filter(e => e.said).reverse().map(e => ({ actor: e.actor, type: e.type, pr: e.pr, at: e.at, said: e.said })),
  }
}

function deploys(now, merged) {
  const P = 25 * MIN, typical = 210, k0 = Math.floor((now - 3 * MIN) / P), list = []
  for (let k = k0 - 3; k <= k0; k++) {
    const at = k * P + 3 * MIN, done = now - at > typical * SEC
    const prs = merged.slice((k0 - k) * 2, (k0 - k) * 2 + 2).map(p => ({ number: p.number, title: p.title, author: p.author, url: p.url }))
    list.push({ id: 6e9 + k, workflow: 'cd', status: done ? 'completed' : 'in_progress', conclusion: done ? 'success' : null, event: 'push',
      title: prs[0] ? `${prs[0].title} (#${prs[0].number})` : 'deploy', sha: hex('sha' + k, 7), createdAt: iso(at), updatedAt: iso(done ? at + typical * SEC : now),
      typical, url: `${GH}/actions/runs/${6e9 + k}`, prs })
  }
  return { status: 'ok', repo: REPO, branch: 'main', fetchedAt: now, list }
}

const CATALOGUE = {
  'first-pr': { title: 'First PR of the day', icon: '🥇', tier: 'gold' },
  wrangler: { title: 'Workflow wrangler', icon: '🤠', tier: 'gold' },
  'big-context': { title: 'Big context', icon: '🧠', tier: 'silver' },
  'clean-hour': { title: 'Clean hour', icon: '✨', tier: 'silver' },
  'merge-streak': { title: 'Merge streak', icon: '🔥', tier: 'gold' },
  'full-house': { title: 'Full house', icon: '🏠', tier: 'bronze' },
}

export function generate(now) {
  const sessions = SESSIONS.map(s => {
    const core = sessionCore(s, now)
    const agents = agentsOf(s, now)
    const x = { ...core, agents }
    x.ext = sessionExt(s, x, now)
    const bg = background(s, now); if (bg.length) x.background = bg
    if (s.key === 'auth') x.attention = { kind: 'question', label: 'question for you', since: now - 4 * MIN }
    if (s.key === 'data') {
      const b = agents.find(a => a.key === 'backfill'), jp = now % (7 * MIN)
      if (b && b.state !== 'done' && jp < 2 * MIN) b.ext['printer-jam'] = { id: 'toolu_' + hex('jam' + (now - jp), 20), tool: 'Bash', text: 'python -m pipeline.backfill --month 2026-09',
        description: 'Backfill September events', at: now - jp - 3.5 * MIN, mtime: now - jp - 3.5 * MIN }
    }
    return { x, s }
  })

  // the ticker replays each present actor's recent tool steps
  const ticker = []
  for (const { x, s } of sessions) {
    const actors = [{ key: s.key, script: s.key, agent: null, who: s.title, ms: 4500 }, ...x.agents.filter(a => a.state !== 'done').map(a => ({ key: a.id, script: a.script, agent: a.id, who: a.description, ms: 3800 }))]
    for (const a of actors) {
      if (a.agent === null && (s.key === 'docs' || s.key === 'auth')) continue
      const { k } = step(a.key, now, a.ms)
      for (let b = 0; b < 8; b++) {
        const e = pick(a.key, a.script, k - b); if (!e) continue
        ticker.push({ id: `toolu_${hex(a.key + (k - b), 20)}`, t: (k - b) * a.ms - (hash(a.key) % a.ms), tool: e[0], detail: e[1], session: x.id, agent: a.agent, who: a.who })
      }
    }
  }
  ticker.sort((a, b) => b.t - a.t)

  const out = sessions.map(({ x }) => { for (const a of x.agents) { delete a.script; delete a.key }; return x })
  const st = street(now), dep = deploys(now, st.merged), day = midnight(now)
  const byS = Object.fromEntries(out.map(x => [x.id, x.ext['cost-jar'].usdToday]))
  const usdToday = cents(Object.values(byS).reduce((a, b) => a + b, 0))
  const agentsBusy = out.reduce((n, x) => n + x.agents.filter(a => a.state !== 'done').length, 0)
  const spark = Array.from({ length: 60 }, (_, i) => { const m = Math.floor(now / MIN) - 59 + i; return 12 + (hash('sp' + m) % 22) + Math.round(8 * Math.sin(m / 7)) })
  const toolsHour = spark.reduce((a, b) => a + b, 0), tokensToday = Math.round(usdToday * 165_000)
  const online = { sessions: out.length, active: out.length, agents: agentsBusy }
  const tvCommits = MERGED.slice(0, 4).map(([n, , t], i) => ({ id: 'toolu_' + hex('c' + n, 20), t: now - (8 + i * 11) * MIN, msg: t, branch: '', who: out[i % out.length].title }))
  const weather = { place: 'Harbor City', temp: 22, code: 1, kind: 'clear', wind: 3, windDir: 120, clouds: 15, precip: 0, isDay: true,
    sunrise: day + 6.75 * HOUR, sunset: day + 19 * HOUR, updated: now - (now % (10 * MIN)) }
  weather.isDay = now > weather.sunrise && now < weather.sunset
  const pay = out[0], mob = out[1]
  const earned = [
    { id: 'first-pr', session: pay.id, holder: pay.title, at: now - 70 * MIN },
    { id: 'wrangler', session: mob.id, holder: mob.title, at: now - 40 * MIN },
    { id: 'merge-streak', session: null, holder: 'office', at: now - 2 * HOUR },
  ].map(a => ({ key: `${a.id}|${a.session || 'office'}`, ...CATALOGUE[a.id], id: a.id, session: a.session, holder: a.holder, earnedAt: a.at }))
  const mergedG = st.merged.map(p => ({ n: p.number, title: p.title, author: p.author, by: p.author, at: Date.parse(p.mergedAt), url: p.url }))
  const priceT = now / MIN

  return {
    now,
    sessions: out,
    achievements: { day: new Date(now).toISOString().slice(0, 10), list: earned, catalogue: CATALOGUE },
    commits: { [pay.id]: [{ id: 'toolu_' + hex('cm' + Math.floor(now / (6 * MIN)), 20), t: now - (now % (6 * MIN)), k: 'c', agent: null, branch: pay.branch, sha: null, subject: 'payments: store the webhook delivery id' }] },
    cost: { usdToday, bySession: byS, estimate: true },
    deploys: dep,
    fireDrill: { status: 'ok', repo: REPO, branch: 'main', fetchedAt: now, red: [] },
    fridayDrinks: { ready: true, since: day - ((new Date(now).getDay() + 6) % 7) * 24 * HOUR, merged: 23, gh: true, commits: 187, workflows: 14,
      cheapest: { id: out[2].id, usd: byS[out[2].id], title: out[2].title }, priciest: { id: mob.id, usd: byS[mob.id], title: mob.title } },
    gazette: {
      at: now, date: now, edition: 42, repo: REPO, street: 'ok',
      headline: { at: mergedG[0].at, kind: 'merge', kicker: 'MERGE DAY', title: `${mergedG.length} PRs land on main`, deck: `Latest: #${mergedG[0].n} ${mergedG[0].title} by ${mergedG[0].author}.` },
      merged: mergedG, mergedCount: mergedG.length,
      opened: PRS.slice(-3).map(p => ({ n: p.n, title: p.title, author: p.author, at: now - (1 + hash(p.n) % 5) * HOUR, url: `${GH}/pull/${p.n}` })), openedCount: 3,
      stats: { toolsToday: toolsHour * 5, since: 0, toolsHour, tokens: tokensToday, commits: 31, online },
      busiest: { now: { name: 'build iOS 3.2', calls: 64, agent: true }, peak: { name: 'build iOS 3.2', calls: 88, agent: true, at: now - HOUR },
        leaders: [{ name: 'build iOS 3.2', minutes: 41 }, { name: 'PAYMENTS API', minutes: 33 }, { name: 'Map the ingest jobs', minutes: 17 }],
        desks: out.map(x => ({ title: x.title, state: x.state, agents: x.agents.filter(a => a.state !== 'done').length })).sort((a, b) => b.agents - a.agents) },
      workflows: [{ name: 'release-checklist', session: mob.title, agents: 4, doneAt: now - 2 * HOUR }],
      ci: { failsToday: 3, failsHour: 1, red: st.engineers.flatMap(e => e.prs.filter(p => p.ci === 'failed').map(p => ({ n: p.n, title: p.title, author: e.login, url: p.url }))),
        running: st.engineers.reduce((a, e) => a + e.ciRunning, 0), culprits: ['bob-codes', 'frank-fixes'] },
      engineer: { login: 'erin-reviews', actions: 14, openPrs: 1, merges: 1 }, coderabbit: null, weather: 'clear, 22°',
    },
    street: st,
    skyline: { main: REPO, repos: [{ name: 'harbor-docs', full: 'acme/harbor-docs', sessions: [out[2].id] }, { name: 'data-lake', full: 'globex/data-lake', sessions: out.slice(3, 5).map(x => x.id) },
      { name: 'pixel-kit', full: 'pixel-kit', sessions: [out[1].id] }] },
    lostFound: { at: now, prsAt: now, prsKnown: true, repo: REPO, total: 0, inUse: 0, crates: [] },
    priceBillboard: { ok: true, at: now - (now % MIN), list: [['BTC', 'Bitcoin', 98_000, 1.8], ['ETH', 'Ethereum', 3480, -0.8], ['USDT', 'Tether', 1, 0.01], ['XRP', 'XRP', 2.31, 4.2],
      ['BNB', 'BNB', 712, 1.1], ['SOL', 'Solana', 182, -3.6], ['USDC', 'USDC', 1, 0], ['DOGE', 'Dogecoin', 0.231, 6.4], ['ADA', 'Cardano', 0.78, -1.9], ['BCH', 'Bitcoin Cash', 410, -0.9]]
      .map(([sym, name, usd, ch], i) => ({ id: sym.toLowerCase(), sym, name, rank: i + 1, usd: usd * (1 + 0.004 * Math.sin(priceT / 30 + i)), ch24: ch + Math.sin(priceT / 40 + i) * 0.3,
        spark: Array.from({ length: 24 }, (_, j) => usd * (1 + ch / 100 * (j - 23) / 23 + 0.008 * Math.sin((priceT - 24 + j) / 5 + i))) })) },
    cranes: [{ sessionId: mob.id, add: 1240, del: 860, pr: 424, title: 'mobile: release checklist for 3.2', url: `${GH}/pull/424`, src: 'pr' }],
    securityDesk: { day, ready: true, stops: [
      { id: 'toolu_' + hex('sd1', 20), t: now - 55 * MIN, kind: 'hook', tool: 'Bash', what: 'Push to main', reason: 'Blocked: pushes to main go through a PR', session: pay.id, agent: null, sessionTitle: pay.title, agentName: null },
      { id: 'toolu_' + hex('sd2', 20), t: now - 18 * MIN, kind: 'hook', tool: 'Bash', what: 'Wait for the build', reason: 'Blocked: use a background job instead of sleep', session: mob.id, agent: null, sessionTitle: mob.title, agentName: null }] },
    serverRoom: { running: out.flatMap(x => (x.background || []).map(b => ({ id: hex(x.id + b.label, 9), kind: b.kind, label: b.label, session: x.id, title: x.title, since: b.since }))), failed: [] },
    mail: mob.agents.filter(a => a.state === 'done').map(a => ({ id: 'slip:' + a.id, t: now - 10 * SEC, kind: 'slip', from: { agent: a.id, name: null, session: mob.id }, to: { session: mob.id }, text: `${a.description}: done`, status: 'completed' })),
    records: { day: new Date(now).toISOString().slice(0, 10), streak: 9, list: [
      ['longest-session', 'Longest-running session', 'ms', 31 * HOUR + 12 * MIN, 9, mob.title], ['tools-day', 'Most tool calls in a day', 'n', 1987, 12, `busiest: ${pay.title}`],
      ['agents-once', 'Most subagents at once', 'n', 14, 3, `9 for ${mob.title}`], ['biggest-pr', 'Biggest merged PR', 'lines', 2100, 6, '#424 mobile: release checklist for 3.2 (+1240 −860)'],
      ['priciest-day', 'Priciest day', 'usd', 182.4, 20, `top desk: ${mob.title}`], ['commits-day', 'Most commits in a day', 'n', 23, 2, `most in ${pay.title}`],
      ['green-streak', 'Longest green CI streak', 'n', 17, 15, 'tests on payments-webhook']]
      .map(([key, label, unit, value, days, what]) => ({ key, label, unit, value, at: day - days * 24 * HOUR + 15 * HOUR, what, prev: null, fresh: false })) },
    ticker: ticker.slice(0, 40),
    heatmap: { day, hours: Array.from({ length: 24 }, (_, h) => { const at = day + h * HOUR; if (at > now) return 0
      const v = Math.round((h < 8 ? 3 : 40 + 110 * Math.exp(-((h - 11) ** 2) / 6) + 95 * Math.exp(-((h - 16) ** 2) / 5)) * (0.8 + (hash('hm' + h) % 40) / 100))
      return at + HOUR > now ? Math.round(v * (now - at) / HOUR) : v }) },
    seismograph: { day, events: [
      [9.6, 0, 'git reset --hard origin/main', 'reset --hard', 1], [11.2, 1, 'git push --force-with-lease origin release/3.2', 'force push', 3],
      [13.9, 2, 'rm -rf build/ dist/', 'rm -rf', 3], [15.4, 0, 'git branch -D spike/old-ledger', 'branch -D', 2], [16.8, 3, 'docker system prune -af', 'docker prune', 2]]
      .map(([h, i, cmd, kind, size]) => ({ id: 'toolu_' + hex('sg' + h, 20), at: day + h * HOUR, session: out[i % out.length].id, who: out[i % out.length].id, cmd, kind, size }))
      .concat([0, 1].map(k => { const t = now - (now % (6 * MIN)) - k * 6 * MIN, n = Math.floor(t / (6 * MIN)), x = out[n % out.length], c = [['git push --force origin feature/dark-mode', 'force push', 3], ['git reset --hard HEAD~2', 'reset --hard', 1], ['git clean -fdx', 'clean -fd', 2]][n % 3]
        return { id: 'toolu_' + hex('sgl' + n, 20), at: t, session: x.id, who: x.id, cmd: c[0], kind: c[1], size: c[2] } }))
      .filter(e => e.at <= now && e.at >= day).sort((a, b) => a.at - b.at) },
    trophies: { merged: 2, open: 3, closed: 0, gh: true, pending: 0, items: [
      ...st.mine.map(p => ({ n: p.number, repo: REPO, at: p.updatedAt, state: 'OPEN', mergedAt: 0, title: p.title, checked: true })),
      ...MERGED.filter(m => m[1] === ME).map(([n, , title], i) => ({ n, repo: REPO, at: now - (3 + i) * HOUR, state: 'MERGED', mergedAt: now - (1 + i * 2) * HOUR, title, checked: true }))] },
    tv: { ready: true, spark, toolsHour, tokensToday, outToday: Math.round(tokensToday / 180), prsWeek: 23, mergedWeek: 17,
      busiest: { name: 'build iOS 3.2', calls: 64, agent: true }, online, commits: tvCommits },
    weather,
  }
}
