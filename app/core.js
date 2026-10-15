// The app shell: assets, identity helpers, /api/state polling, toasts and the hook bus. The tower (app/tower/tower.js)
// draws everything; features in app/features/*.js add the DOM around it and only talk through the `api` passed to them.

const COLORS = { tool: '#5fd17a', thinking: '#63b3f0', waiting: '#f4c64f', done: '#f4c64f', delegating: '#b996f5', building: '#f29a4e', attention: '#ef5a5a', idle: '#84829a' }

// ---------- assets ----------
const img = {}
const load = (key, src) => new Promise((ok, fail) => { const i = new Image(); i.onload = () => { img[key] = i; ok() }; i.onerror = () => fail(src); i.src = src })
const assetsReady = Promise.all([
  ...[0, 1, 2, 3, 4, 5].map(i => load('char' + i, `/assets/characters/char_${i}.png`)),
  load('pet_claudio', '/assets/pets/claudio/pet.png'), load('pet_gitcat', '/assets/pets/gitcat/pet.png'),
])
const hueCache = new Map()
function charSheet(palette, hue) {
  const k = palette + ':' + hue
  if (hueCache.has(k)) return hueCache.get(k)
  const src = img['char' + palette]; if (!hue) { hueCache.set(k, src); return src }
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
  const x = cv.getContext('2d'); x.filter = `hue-rotate(${hue}deg)`; x.drawImage(src, 0, 0)
  hueCache.set(k, cv); return cv
}

// ---------- identity ----------
const hash = s => { let h = 2166136261; for (const c of s) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0 }
const lookOf = id => { const h = hash(id); return { palette: h % 6, hue: [0, 0, 0, 40, 160, 220, 300][(h >>> 5) % 7] } }
const TOOL_LABEL = [
  [/^Bash$|PowerShell/, '⌘ shell'], [/^(Edit|Write|MultiEdit|NotebookEdit)$/, '✎ editing'], [/^Read$/, '📖 reading'],
  [/^(Grep|Glob|ToolSearch)$/, '🔍 searching'], [/^Web(Fetch|Search)$/, '🌐 web'], [/^(Agent|Task)$/, '👥 delegating'],
  [/^Workflow$/, '🗂 workflow'], [/^AskUserQuestion$/, '❓ asking you'], [/claude-in-chrome|Browser/, '🧭 browser'],
  [/^mcp__/, '🔌 mcp'], [/^Skill$/, '📘 skill'], [/^(TodoWrite|Task(Create|Update|List))/, '📝 planning'],
]
const toolLabel = t => { if (!t) return ''; for (const [re, l] of TOOL_LABEL) if (re.test(t)) return l; return '⚙ ' + t.slice(0, 14) }
const ago = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? s + 's ago' : Math.round(s / 60) + 'm ago' }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

// ---------- hooks ----------
// sync(data)   after each poll (or replayed snapshot), in feature order: earlier features may adjust the snapshot
// live(bool)   replay paused (false) or resumed (true) live data; toasts are muted while it is off
const hooks = { sync: [], live: [] }
const run = (name, ...args) => { for (const fn of hooks[name]) { try { fn(...args) } catch (e) { console.error(`[${name}]`, e) } } }

let sessions = [], owner = 'You', live = true, lastLive = null, reserveBottom = 0, settings = null, pollTimer = 0
function sync(data) {
  sessions = data.sessions
  owner = data.owner || owner
  document.getElementById('nSessions').textContent = sessions.length
  document.getElementById('nAgents').textContent = sessions.reduce((n, s) => n + s.agents.filter(g => g.state !== 'done' && g.state !== 'idle').length, 0)
  document.getElementById('empty').style.display = sessions.length ? 'none' : 'grid'
  run('sync', data)
}

// Toasts queue up so one feature's message never wipes another's.
const toasts = []
let toastBusy = false
function toast(msg, ms = 2500) { if (!live) return; toasts.push([msg, ms]); if (!toastBusy) nextToast() }
function nextToast() {
  const t = document.getElementById('toast'), next = toasts.shift()
  if (!next) { toastBusy = false; t.style.display = 'none'; return }
  toastBusy = true; t.textContent = next[0]; t.style.display = 'block'
  setTimeout(nextToast, toasts.length ? Math.min(next[1], 1600) : next[1])
}

// ---------- the API features receive ----------
const api = {
  COLORS, img, load, hash, lookOf, toolLabel, charSheet, toast, esc, ago,
  // room features keep clear of at the bottom of the view (the ticker, the replay bar)
  get reserveBottom() { return reserveBottom }, set reserveBottom(v) { reserveBottom = v },
  get sessions() { return sessions },
  get owner() { return owner },
  // GET /api/settings as it was at startup ({ effective, saved, defaults, options }); the settings panel replaces it
  get settings() { return settings }, set settings(v) { settings = v },
  refresh: () => { if (polling) pollAgain = true; else { clearTimeout(pollTimer); poll() } },   // poll now, e.g. after a setting changed
  // replay: stop polling and push snapshots yourself (same shape as /api/state); resumeLive() goes back to live
  get live() { return live },
  get lastSnapshot() { return lastLive },
  pauseLive: () => { live = false; document.body.dataset.replay = '1'; run('live', false) },
  resumeLive: () => { live = true; delete document.body.dataset.replay; run('live', true) },
  // Fed snapshots keep the latest live extras (street, TV, weather, each session's ext) so features don't treat the replay's gaps as changes.
  feed: data => {
    const extOf = new Map((lastLive?.sessions || []).map(s => [s.id, s.ext]))
    sync({ ...(lastLive || {}), ...data, sessions: data.sessions.map(s => ({ ...s, ext: s.ext || extOf.get(s.id) })) })
  },
  // open a GitHub link in the default browser rather than inside Orca
  openLink: url => fetch('/api/open', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url }) })
    .then(r => r.ok || toast('Could not open the link')).catch(() => toast('Agentopolis server is offline')),
  header: document.querySelector('header'), hud: document.getElementById('hud'),
  view: null,                                        // the on-screen canvas (the tower sets it; the photo booth shoots it)
  on(name, fn) { if (!hooks[name]) throw new Error('unknown hook ' + name); hooks[name].push(fn) },
}

let polling = false, pollAgain = false
async function poll() {
  const conn = document.getElementById('conn')
  if (live) {
    polling = true
    try {
      const r = await fetch('/api/state', { cache: 'no-store' })
      const data = await r.json()
      if (live) { lastLive = data; sync(data); conn.textContent = 'live'; conn.className = 'live' }   // else replay began while this poll was in flight
    } catch (e) { conn.textContent = 'server offline'; conn.className = ''; if (!(e instanceof TypeError)) console.error(e) }
    polling = false
  }
  pollTimer = setTimeout(poll, pollAgain ? 0 : 1500); pollAgain = false
}

export async function start(features) {
  try { await assetsReady } catch (src) { document.getElementById('conn').textContent = 'missing asset ' + src; return }
  try { const r = await fetch('/api/settings', { cache: 'no-store' }); if (r.ok) settings = await r.json() } catch {}
  for (const [name, init] of features) { try { await init(api) } catch (e) { console.error(`feature ${name} failed to start`, e) } }
  poll()
}
