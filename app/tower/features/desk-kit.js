// desk-kit: per-session desk items on each session floor, ported from the top-down context-meter, desk-props, cost-jar,
// achievements, pr-celebration and janitor features. The floor's plaque carries a hairline context gauge along its lower
// edge (subagents get a thin strip under their screen), the open PR's number and the medals as brass studs at its right
// end; a stack mascot sits on the desk, a coin jar stands left of the chair, and the desk plant (building.js leaves its
// spot empty) wilts as the context fills; after a compaction a janitor wheels his cart in, rides up and sweeps.
// Demos: ?demo=deskkit (fake values everywhere, rising spend), ?demo=deskpr (a PR, then a commit, on the first floor),
// ?demo=deskjanitor (a compaction on the first floor), ?demo=deskwilt (plants cycle through the wilt stages).
import { IX, skipStockPlant } from '../building.js'

skipStockPlant()

const SEGS = 20
const ctxColor = p => p < 0.6 ? '#5fd17a' : p < 0.8 ? '#f4c64f' : '#ef5d5d'
const clamp = p => Math.max(0, Math.min(1, p || 0))

// ---------- mascots (feet on the bottom row) ----------
const SPR = {
  rust: { pal: { r: '#e0502e', d: '#8f2a17', l: '#f58a5e', w: '#ffffff', k: '#1b1012' }, rows: ['.rr........rr.', 'r.r.w....w.r.r', 'rrr.k....k.rrr', '.r..d....d..r.', '..rrrrrrrrrr..', '.rrlrrrrrrrrr.', '.rrrrrrrrrrrr.', '..rrrrrrrrrr..', '.d.d......d.d.', 'd..d......d..d'] },
  swift: { pal: { o: '#f05138', d: '#b8341f', l: '#ffb08a', w: '#ffffff', k: '#1b1012', y: '#f8c24a' }, rows: ['.....ooo....', '....ooooo...', '...oooowko..', 'o..oooooooyy', 'oooooooooo..', '.oolddoooo..', '..oldddooo..', '...ooooooo..', '....oooo....', '....y..y....'] },
  go: { pal: { c: '#7fd5ea', d: '#4aa6bd', w: '#ffffff', k: '#1b1012', n: '#6b4a3a', f: '#f2cfa0' }, rows: ['.cc....cc.', 'cccccccccc', 'cwwccccwwc', 'cwkccccwkc', 'ccccnncccc', 'cccdwwdccc', 'cccccccccc', 'dccccccccd', '.cccccccc.', '.cccccccc.', '.ff....ff.'] },
  python: { pal: { b: '#3d7bbf', d: '#24507e', y: '#ffd43b', o: '#c29a18', w: '#ffffff', k: '#101418' }, rows: ['....bbb.....', '...bbwkb....', '...bbbbbb...', '....bbb.....', '.....bb.....', '...bbbbbb...', '..dddddddd..', '.yyyyyyyyyy.', '.oooooooooo.', 'bbbbbbbbbbbb', 'dddddddddddd'] },
  sql: { pal: { t: '#c4d3e6', m: '#8aa0b8', d: '#5d7189', b: '#3f4f63' }, rows: ['..tttttt..', '.tttttttt.', 'mmttttttmm', 'mmmmmmmmmm', 'dmmmmmmmmd', 'bbbbbbbbbb', 'mmmmmmmmmm', 'dmmmmmmmmd', 'bbbbbbbbbb', 'mmmmmmmmmm', '.dmmmmmmd.'] },
  css: { pal: { p: '#d8b07a', d: '#9c7444', r: '#e2474b', b: '#3d8ee0', g: '#4cc26a', y: '#f2c94c', m: '#b65ad8' }, rows: ['...pppppp...', '.pprpppbpp..', 'pppppppppppp', 'pypp..ppgppp', 'pppp..pppppd', 'pmpppppppp..', '.ppppppppd..', '..ddddddd...'] },
  docs: { pal: { w: '#f7f3e8', s: '#d9d2bf', l: '#9aa3b4', d: '#8c8470' }, rows: ['.wwwwwwww...', '.wllllllw...', '.wwwwwwww...', '.wlllllww...', '.wwwwwwww...', '.wllllwww...', 'swwwwwwwws..', 'sssssssssss.', 'dsssssssssd.', 'ddddddddddd.'] },
  shell: { pal: { f: '#5b6370', s: '#14181e', g: '#5fd17a', h: '#8a93a2', d: '#3a404a' }, rows: ['ffffffffffff', 'fssssssssssf', 'fsgssssssssf', 'fssgsssssssf', 'fsgssssssssf', 'fssssssssssf', 'fssssssssssf', 'ffffffffffff', '....hhhh....', '..dddddddd..'] },
  kotlin: { pal: { w: '#e9e4f7', h: '#cfc6e6' }, rows: ['..........', '.wwwwwww..', '.wwwwwwwhh', '.wwwwwww.h', '.wwwwwww.h', '.wwwwwww.h', '.wwwwwwwhh', '.wwwwwww..', '..wwwww...'] },
  terraform: { pal: { c: '#7b42bc', l: '#a87de0', d: '#542c86', t: '#c0623a', s: '#8f4426', p: '#ff8fc8' }, rows: ['....p.....', '...ccc....', '...clc.c..', 'c..ccc.c..', 'cl.clccl..', 'cccccccc..', '..cccd....', '...clc....', '..tttttt..', '..ssssss..', '...tttt...'] },
}
const LABEL = { rust: 'Rust', react: 'React', ts: 'TypeScript', js: 'JavaScript', swift: 'Swift', kotlin: 'Kotlin', terraform: 'Terraform', python: 'Python', go: 'Go', sql: 'SQL', css: 'CSS', docs: 'Docs', shell: 'Shell', ci: 'CI' }
const STICKER = { rust: '#e0502e', react: '#61dafb', ts: '#3178c6', js: '#f0db4f', swift: '#f05138', kotlin: '#7f52ff', terraform: '#7b42bc', python: '#3d7bbf', go: '#7fd5ea', sql: '#8aa0b8', css: '#e2474b', docs: '#f7f3e8', shell: '#5fd17a', ci: '#9aa6b2' }
const STACKS = Object.keys(LABEL)
function sprite(c, s, x, y, swap = {}) {
  for (let j = 0; j < s.rows.length; j++) for (let i = 0; i < s.rows[j].length; i++) {
    const ch = swap[s.rows[j][i]] ?? s.rows[j][i]
    if (ch !== '.') { c.fillStyle = s.pal[ch] || ch; c.fillRect(x + i, y + j, 1, 1) }
  }
}
const shadow = (c, cx, by, w) => { c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(Math.round(cx - w / 2), by, w, 1) }
const blinking = (now, seed) => (now + seed * 777) % 4200 < 140
function block(c, cx, by, now, seed, face, side, ink, glyph) {
  const bob = Math.sin(now / 900 + seed) > 0.7 ? 1 : 0, x = cx - 5, y = by - 10 - bob
  shadow(c, cx, by, 10)
  c.fillStyle = side; c.fillRect(x + 1, y + 1, 10, 10 + bob - 1)
  c.fillStyle = face; c.fillRect(x, y, 10, 10)
  c.fillStyle = ink; glyph.forEach((r, j) => { for (let i = 0; i < r.length; i++) if (r[i] !== '.') c.fillRect(x + 2 + i, y + 4 + j, 1, 1) })
}
const MASCOT = {
  rust(c, cx, by, now, seed) {
    const s = SPR.rust, x = cx - 7, y = by - s.rows.length
    shadow(c, cx, by, 13); sprite(c, s, x, y, blinking(now, seed) ? { w: 'd', k: 'd' } : {})
    if ((now + seed * 500) % 3000 < 260) { c.fillStyle = s.pal.r; c.fillRect(x + 1, y + 1, 1, 1); c.fillRect(x + 12, y + 1, 1, 1) }
  },
  swift(c, cx, by, now, seed) { const s = SPR.swift; shadow(c, cx, by, 8); sprite(c, s, cx - 6, by - s.rows.length - ((now + seed * 300) % 3600 < 300 ? 1 : 0), blinking(now, seed) ? { w: 'o', k: 'd' } : {}) },
  go(c, cx, by, now, seed) { const s = SPR.go; shadow(c, cx, by, 10); sprite(c, s, cx - 5, by - s.rows.length, blinking(now, seed) ? { w: 'c', k: 'd' } : {}) },
  python(c, cx, by, now, seed) {
    const s = SPR.python, x = cx - 6, y = by - s.rows.length, t = (now + seed * 400) % 2600, sway = Math.round(Math.sin(now / 700 + seed) * 0.6)
    shadow(c, cx, by, 12)
    sprite(c, { pal: s.pal, rows: s.rows.slice(4) }, x, y + 4); sprite(c, { pal: s.pal, rows: s.rows.slice(0, 4) }, x + sway, y, blinking(now, seed) ? { w: 'b', k: 'd' } : {})
    if (t < 420 && Math.floor(t / 140) % 2 === 0) { c.fillStyle = '#e0475a'; c.fillRect(x + sway + 9, y + 2, 2, 1) }
  },
  sql(c, cx, by, now, seed) {
    const s = SPR.sql, x = cx - 5, y = by - s.rows.length, on = Math.floor((now + seed * 211) / 900) % 3
    shadow(c, cx, by, 10); sprite(c, s, x, y)
    for (let i = 0; i < 3; i++) { c.fillStyle = i === on ? '#7bff8a' : '#2f5a3a'; c.fillRect(x + 6 + i, y + 7 + (i % 2) * 3, 1, 1) }
  },
  css(c, cx, by, now, seed) {
    const s = SPR.css, x = cx - 6, y = by - s.rows.length, dip = Math.sin(now / 1400 + seed) > 0.5 ? 1 : 0
    shadow(c, cx, by, 12); sprite(c, s, x, y)
    c.fillStyle = '#6b4a2a'; for (let i = 0; i < 4; i++) c.fillRect(x + 11 - i, y - 4 + i + dip, 1, 1)
    c.fillStyle = '#e2474b'; c.fillRect(x + 6, y + 1 + dip, 1, 1)
  },
  docs(c, cx, by, now, seed) {
    const s = SPR.docs, x = cx - 6, y = by - s.rows.length
    shadow(c, cx, by, 12); sprite(c, s, x, y)
    if ((now + seed * 600) % 5000 < 500) { c.fillStyle = '#ffffff'; c.fillRect(x + 8, y - 1, 2, 1); c.fillStyle = '#d9d2bf'; c.fillRect(x + 8, y, 1, 1) }
  },
  shell(c, cx, by, now, seed) {
    const s = SPR.shell, x = cx - 6, y = by - s.rows.length
    shadow(c, cx, by, 12); sprite(c, s, x, y)
    if (Math.floor((now + seed * 137) / 530) % 2) { c.fillStyle = '#5fd17a'; c.fillRect(x + 4, y + 4, 3, 1) }
  },
  kotlin(c, cx, by, now, seed) {
    const s = SPR.kotlin, x = cx - 5, y = by - s.rows.length
    shadow(c, cx, by, 10); sprite(c, s, x, y)
    for (let j = 1; j <= 7; j++) for (let i = 1; i <= 7; i++) { const d = i + j; c.fillStyle = d === 8 ? '#ffffff' : d < 8 ? (d < 5 ? '#7f52ff' : '#b04fd8') : (d < 11 ? '#e44889' : '#f08a3a'); c.fillRect(x + i, y + j, 1, 1) }
    c.fillStyle = '#e9e4f7'; c.fillRect(x + 1, y + 1, 7, 1)
    for (let k = 0; k < 2; k++) { const t = (now / 1600 + k * 0.5 + seed * 0.13) % 1; c.fillStyle = `rgba(255,255,255,${0.45 * (1 - t)})`; c.fillRect(x + 3 + k * 3 + Math.round(Math.sin(t * 6 + k) * 0.7), y - 1 - Math.round(t * 4), 1, 2) }
  },
  terraform(c, cx, by, now, seed) {
    const s = SPR.terraform, x = cx - 5, y = by - s.rows.length, sway = Math.sin(now / 1100 + seed) > 0.6 ? 1 : 0
    shadow(c, cx, by, 8); sprite(c, { pal: s.pal, rows: s.rows.slice(1) }, x, y + 1)
    c.fillStyle = s.pal.p; c.fillRect(x + 4 + sway, y, 1, 1); c.fillStyle = '#ffd1e8'; c.fillRect(x + 4 + sway, y - 1, 1, 1)
  },
  react(c, cx, by, now, seed) {
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(cx - 4, by, 8, 1)
    c.fillStyle = '#2a3140'; c.fillRect(cx - 3, by - 2, 6, 2); c.fillStyle = '#3c4658'; c.fillRect(cx - 2, by - 3, 4, 1)
    const oy = by - 9, spin = now / 4000 + seed, seen = new Set()
    c.fillStyle = '#61dafb'
    for (let o = 0; o < 3; o++) {
      const a = spin + o * Math.PI / 3, ca = Math.cos(a), sa = Math.sin(a)
      for (let k = 0; k < 40; k++) {
        const t = k / 40 * Math.PI * 2, ex = Math.cos(t) * 5.6, ey = Math.sin(t) * 1.9, px = Math.round(cx - 0.5 + ex * ca - ey * sa), py = Math.round(oy + ex * sa + ey * ca)
        if (!seen.has(px * 999 + py)) { seen.add(px * 999 + py); c.fillRect(px, py, 1, 1) }
      }
    }
    c.fillStyle = '#b8f0ff'; c.fillRect(cx - 1, oy - 1, 2, 2)
  },
  ci(c, cx, by, now, seed) {
    const oy = by - 6.5, spin = now / 5000 + seed
    shadow(c, cx, by, 10)
    for (let j = -6; j <= 6; j++) for (let i = -6; i <= 6; i++) {
      const dx = i + 0.5, dy = j + 0.5, d = Math.hypot(dx, dy), R = Math.cos(6 * (Math.atan2(dy, dx) - spin)) > -0.1 ? 6.2 : 4.7
      if (d > R || d < 1.4) continue
      c.fillStyle = d < 2.4 ? '#5b6470' : dy < -1.5 ? '#c4ccd6' : dy > 2 ? '#7b8692' : '#9aa6b2'; c.fillRect(Math.round(cx - 0.5 + i), Math.round(oy + j), 1, 1)
    }
  },
  ts: (c, cx, by, now, seed) => block(c, cx, by, now, seed, '#3178c6', '#1f4f88', '#ffffff', ['TTT.SSS', '.T..S..', '.T..SSS', '.T....S', '.T..SSS']),
  js: (c, cx, by, now, seed) => block(c, cx, by, now, seed, '#f0db4f', '#b7a12a', '#323330', ['..J.SSS', '..J.S..', '..J.SSS', 'J.J...S', 'JJJ.SSS']),
}

// ---------- coin jar ----------
const FULL = 300, DROP_MS = 520, CLINK_MS = 420
const level = usd => Math.min(1, Math.log10(1 + Math.max(0, usd)) / Math.log10(1 + FULL))
const money = usd => usd >= 1000 ? `$${(usd / 1000).toFixed(1)}k` : usd >= 10 ? `$${Math.round(usd)}` : usd >= 0.995 ? `$${usd.toFixed(1)}` : `$${usd.toFixed(2)}`

// ---------- medals ----------
const TIERS = { gold: ['#f2c14e', '#b8862a', '#fff1b8'], silver: ['#dfe4ea', '#9aa3ad', '#ffffff'], bronze: ['#d8925a', '#9a5a2a', '#ffd2a8'] }
const RIBBONS = { gold: ['#d84a4a', '#3a6fd8'], silver: ['#3a6fd8', '#e8e8f0'], bronze: ['#2f9a5a', '#e8e8f0'] }
const DEMO_MEDALS = [['First PR of the day', '🥇', 'gold'], ['1,000 tool calls', '🔨', 'silver'], ['Night owl', '🦉', 'bronze'], ['Clean hour', '✨', 'silver'], ['Marathon', '🏃', 'gold']]

// ---------- plant + janitor ----------
const SWEEP_S = 3.2, DROP = 0.2, STAGES = [0.15, 0.6, 0.74, 0.88, 0.97]
const wiltOf = p => p < 0.5 ? p * 0.2 : p < 0.8 ? 0.1 + (p - 0.5) / 0.3 * 0.45 : Math.min(1, 0.55 + (p - 0.8) / 0.2 * 0.45)
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const ramp = (stops, w) => { for (let i = 1; i < stops.length; i++) if (w <= stops[i][0]) return mix(stops[i - 1][1], stops[i][1], (w - stops[i - 1][0]) / (stops[i][0] - stops[i - 1][0])); return stops.at(-1)[1] }
const rgb = c => `rgb(${c})`
const LEAF = [[0, [52, 140, 62]], [0.3, [120, 158, 64]], [0.6, [150, 132, 60]], [1, [116, 78, 40]]]
const LEAF_HI = [[0, [104, 196, 88]], [0.3, [176, 196, 104]], [0.6, [196, 168, 92]], [1, [156, 108, 60]]]
const STEM = [[0, [46, 104, 48]], [0.5, [104, 112, 52]], [1, [96, 70, 38]]]
const STEMS = [[-0.75, 9], [-0.42, 14], [-0.12, 18], [0.12, 17], [0.4, 14], [0.72, 10]]
const FALLEN = [[-6, -1], [17, -1], [-2, -1], [13, -1], [-9, -1], [20, -1]]
const PLANT_X = IX + 82                      // the floor plant beside the session desk (building.js skips its own)
const CONFETTI = ['#f4c64f', '#5fd17a', '#63b3f0', '#b996f5', '#f07a8a', '#ffffff', '#ff9a3c']

export default function init(api, tower) {
  const demos = api.params.getAll('demo')
  const demoKit = demos.includes('deskkit'), demoPr = demos.includes('deskpr'), demoJan = demos.includes('deskjanitor'), demoWilt = demos.includes('deskwilt')
  const t0 = performance.now()
  const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
  const sessions = () => tower.floors.filter(f => f.kind === 'session' && f.session)
  const idx = id => sessions().findIndex(f => f.id === id)

  // ---------- data, real or demo ----------
  const override = new Map()                 // session id -> pct (janitor demo)
  const ctxOf = s => {
    if (override.has(s.id)) return { pct: override.get(s.id) }
    if (demoKit) return { pct: [0.12, 0.55, 0.71, 0.86, 0.97][idx(s.id) % 5] }
    const m = s.ext?.['context-meter']; return m ? { ...m, pct: clamp(m.pct) } : null
  }
  const agentCtx = (g, k) => demoKit ? { pct: [0.2, 0.45, 0.66, 0.83, 0.95][k % 5] } : g?.ext?.['context-meter']
  const usdOf = (s, now) => {
    if (!demoKit) return s.ext?.['cost-jar']?.usdToday
    const i = idx(s.id) % 5; return [0.4, 3.2, 11.6, 47.5, 186][i] + (now - t0) / 1000 * [0.12, 0.35, 0.6, 0.9, 1.6][i]
  }
  function stacksOf(s, now) {
    if (demoKit) { const i = idx(s.id), k = Math.floor(now / 2500); return [STACKS[(i + k) % STACKS.length], STACKS[(i + k + 5) % STACKS.length]] }
    const top = s.ext?.['desk-props']?.top
    if (!top?.length || !MASCOT[top[0].stack]) return []
    return [top[0].stack, top[1] && top[1].share >= 0.2 && top[1].w >= top[0].w * 0.3 && MASCOT[top[1].stack] ? top[1].stack : null]
  }
  const fakePr = new Map()
  const prOf = s => fakePr.get(s.id)?.pr || (demoKit ? { n: 1800 + idx(s.id) * 7, title: 'demo PR', repo: 'demo/office' } : s.ext?.['pr-celebration']?.pr)
  let medals = []
  const medalsOf = s => demoKit ? DEMO_MEDALS.slice(0, (idx(s.id) % 5)).map(([title, icon, tier], i) => ({ title, icon, tier, earnedAt: Date.now() - i * 3e6 })) : medals.filter(a => a.session === s.id)

  // ---------- state ----------
  const jars = new Map(), prSeen = new Map(), plants = new Map(), last = new Map(), visits = new Map()
  let parts = [], firstSync = true, armed = false
  const jarFor = id => { let j = jars.get(id); if (!j) jars.set(id, j = { usd: null, shown: 0, dollars: null, drops: [], clinks: [] }); return j }
  const plantOf = id => { let p = plants.get(id); if (!p) plants.set(id, p = { w: null, held: null, queue: 0, perk: -1e9, swept: 1, pct: 0 }); return p }

  function updateJars(now) {
    const live = new Set()
    for (const f of sessions()) {
      const usd = usdOf(f.session, now); if (usd == null) continue
      live.add(f.id)
      const j = jarFor(f.id), d = Math.floor(usd)
      if (j.dollars == null) { j.dollars = d; j.shown = usd }
      else if (d > j.dollars) { const l = j.drops.at(-1) ?? -Infinity; for (let k = 0; k < Math.min(3, d - j.dollars); k++) j.drops.push(Math.max(now, l + 240) + k * 240); j.dollars = d }
      else if (d < j.dollars) j.dollars = d
      j.usd = usd
    }
    for (const id of jars.keys()) if (!live.has(id)) jars.delete(id)
  }

  function burst(id, n, sparkle) {
    const d = tower.desk(id); if (!d) return
    const ox = d.desk.x + d.desk.w - 6, oy = d.desk.y - 8
    for (let i = 0; i < n; i++) {
      const a = sparkle ? Math.random() * Math.PI * 2 : -Math.PI / 2 + (Math.random() - 0.5) * 2.2, v = sparkle ? 14 + Math.random() * 18 : 50 + Math.random() * 70
      parts.push({ id, dx: 0, dy: 0, ox, oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: sparkle ? 0.7 + Math.random() * 0.4 : 2 + Math.random() * 1.2,
        c: sparkle ? (i % 2 ? '#fff6c2' : '#f4c64f') : CONFETTI[i % CONFETTI.length], spin: Math.random() * 6, sparkle })
    }
  }

  function compacted(id, pre) { const p = plantOf(id); if (p.held == null) p.held = pre; p.queue++ }

  tower.on('sync', snap => {
    const now = performance.now(), ids = new Set(snap.sessions.map(s => s.id))
    medals = snap.achievements?.list || []
    updateJars(now)
    for (const m of [last, plants, override, prSeen]) for (const id of m.keys()) if (!ids.has(id)) m.delete(id)
    for (const s of snap.sessions) {
      const e = s.ext?.['pr-celebration'], k = e?.pr ? `${e.pr.repo}#${e.pr.n}` : null, c = e?.commits || 0, was = prSeen.get(s.id)
      if (!firstSync && was && api.live) { if (k && k !== was.k) burst(s.id, 120); else if (c > was.c) burst(s.id, 16, true) }
      prSeen.set(s.id, { k, c })
      const m = s.ext?.['context-meter']
      if (!m || !api.live) { last.delete(s.id); continue }
      const prev = last.get(s.id)
      if (prev && ((m.compacted && !prev.compacted) || (prev.pct - m.pct >= DROP && m.pct < prev.pct * 0.6))) compacted(s.id, prev.pct)
      last.set(s.id, { pct: m.pct, compacted: !!m.compacted })
    }
    firstSync = false
    const first = sessions()[0]
    if (!armed && first) {
      armed = true
      if (demoPr) {
        setTimeout(() => { fakePr.set(first.id, { pr: { n: 4242, repo: 'demo/office', title: 'agent office: confetti for every PR' } }); burst(first.id, 120); tower.flyTo(first.id) }, 2500)
        setTimeout(() => burst(first.id, 16, true), 7000)
      }
      if (demoJan) {
        override.set(first.id, 0.97)
        setTimeout(() => { compacted(first.id, 0.97); override.set(first.id, 0.06); tower.flyTo(first.id) }, 3000)
      }
    }
  })
  tower.on('layout', () => { for (const q of parts) { const d = tower.desk(q.id); if (d) { q.ox = d.desk.x + d.desk.w - 6; q.oy = d.desk.y - 8 } } })

  // ---------- the janitor ----------
  let sheet = null
  function janitorSheet() {
    if (sheet) return sheet
    const src = api.charSheet(4, 0); if (!src?.width) return null
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
    const x = cv.getContext('2d'); x.drawImage(src, 0, 0)
    const d = x.getImageData(0, 0, cv.width, cv.height), px = d.data, Wd = cv.width
    const at = (X, Y) => (Y * Wd + X) * 4, put = (X, Y, c) => { const i = at(X, Y); px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255 }
    const SUIT = [[110, 158, 143], [90, 138, 123], [72, 116, 103]], PANTS = [[78, 122, 108], [62, 102, 90], [44, 76, 68]]
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue
      const r = px[i], g = px[i + 1], b = px[i + 2]
      if (r === g && g === b && r >= 0xb0 && r <= 0xf0) { const c = SUIT[r >= 0xe8 ? 0 : r >= 0xcc ? 1 : 2]; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2] }
      else if (b > r + 25 && b > g) { const c = PANTS[b > 0x70 ? 0 : b > 0x38 ? 1 : 2]; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2] }
    }
    // a work cap over the hair's crown, brim on the facing side
    const CAP = [222, 170, 58], CAP_DK = [168, 118, 34], BRIM = [120, 84, 26]
    for (let row = 0; row < 3; row++) for (let f = 0; f < 7; f++) {
      const ox = f * 16, oy = row * 32, top = []
      for (let c = 0; c < 16; c++) { top[c] = null; for (let y = 0; y < 13; y++) if (px[at(ox + c, oy + y) + 3] >= 128) { top[c] = y; break } }
      const cols = top.map((t, c) => t == null ? -1 : c).filter(c => c >= 0); if (!cols.length) continue
      const sorted = cols.map(c => top[c]).sort((a, b) => a - b), crown = sorted[Math.floor(sorted.length * 0.6)], c0 = cols[0], c1 = cols.at(-1), bottom = crown + 3
      for (const c of cols) {
        const start = Math.max(top[c], crown + (c <= c0 + 1 || c >= c1 - 1 ? 1 : 0))
        for (let y = 0; y < start; y++) px[at(ox + c, oy + y) + 3] = 0
        for (let y = start; y <= bottom; y++) put(ox + c, oy + y, y === start || y === bottom ? CAP_DK : CAP)
      }
      if (row === 0) for (let c = c0 + 1; c <= c1 - 1; c++) put(ox + c, oy + bottom + 1, BRIM)
      if (row === 2) for (let c = c1 - 1; c <= Math.min(15, c1 + 2); c++) put(ox + c, oy + bottom + 1, BRIM)
    }
    x.putImageData(d, 0, 0)
    return (sheet = cv)
  }
  function drawCart(c, cx, y, handleLeft) {
    const x = Math.round(cx) - 6
    R(c, 'rgba(0,0,0,.28)', x, y - 1, 13, 1)
    R(c, '#8a8f98', x + 10, y - 22, 1, 13); R(c, '#d9d2bf', x + 9, y - 10, 3, 2)               // mop
    R(c, '#2b2f36', handleLeft ? x - 1 : x + 12, y - 15, 1, 9)                                     // push bar
    R(c, '#b8892a', x, y - 12, 12, 8); R(c, '#f2c14e', x + 1, y - 11, 10, 6)                       // body
    R(c, '#5a6a7a', x + 2, y - 16, 6, 4); R(c, '#7fb0d8', x + 3, y - 16, 4, 1); R(c, '#9aa3ad', x + 2, y - 17, 6, 1)   // bucket
    R(c, '#1d1d22', x + 1, y - 3, 3, 3); R(c, '#1d1d22', x + 8, y - 3, 3, 3)
  }
  function drawJanitor(v, c, p, now) {
    const s = janitorSheet(); if (!s) return
    const sweeping = v.phase === 'sweep', y = p.y
    const dir = sweeping ? 'right' : p.riding ? 'down' : p.dir || 'right'
    const row = dir === 'down' ? 0 : 2, flip = dir === 'left'
    const frame = p.walking ? [0, 1, 2, 1][Math.floor(now / 130) % 4] : sweeping ? [0, 1, 2, 1][Math.floor(now / 220) % 4] : 1
    // the cart rolls ahead of him; while he sweeps it waits behind him
    if (!p.riding) drawCart(c, p.x + (dir === 'left' || sweeping ? -13 : 13), y, dir !== 'left' && !sweeping)
    else drawCart(c, p.x + 11, y, true)
    const dx = Math.round(p.x - 8), dy = Math.round(y - 30)
    if (flip) { c.save(); c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(s, frame * 16, row * 32, 16, 32, 0, 0, 16, 32); c.restore() }
    else c.drawImage(s, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
    if (sweeping) {
      const hx = p.x + 8 + Math.sin(now / 110) * 3.5
      c.strokeStyle = '#8a5a34'; c.lineWidth = 1; c.beginPath(); c.moveTo(Math.round(p.x + 3) + 0.5, y - 14.5); c.lineTo(Math.round(hx) + 2.5, y - 2.5); c.stroke()
      R(c, '#c9a25a', Math.round(hx) - 1, y - 3, 6, 2); R(c, '#8a6a36', Math.round(hx) - 1, y - 1, 6, 1)
    }
  }
  function startVisit(id) {
    const v = { id, phase: 'in', t: 0, puffs: [] }
    v.npc = tower.spawn({ id: 'janitor-' + id, from: 'door', draw: (c, p, now) => drawJanitor(v, c, p, now) })
    const ok = v.npc.go(id, PLANT_X - 6, { face: 'right', then: () => { v.phase = 'sweep'; v.t = 0 } })
    if (!ok) { v.npc.remove(); return }
    visits.set(id, v)
  }

  tower.on('step', (dt, now) => {
    if (demoKit) updateJars(now)
    for (const j of jars.values()) {
      if (j.usd == null) continue
      j.shown += (j.usd - j.shown) * Math.min(1, dt * 2.5)
      while (j.drops.length && now - j.drops[0] > DROP_MS) { j.drops.shift(); j.clinks.push(now) }
      while (j.clinks.length && now - j.clinks[0] > CLINK_MS) j.clinks.shift()
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life += dt
      if (q.life > q.max) { parts.splice(i, 1); continue }
      q.vy += (q.sparkle ? 20 : 140) * dt; q.vx *= 1 - 1.2 * dt
      if (!q.sparkle) q.vy = Math.min(q.vy, 34)
      q.dx += q.vx * dt; q.dy += q.vy * dt; q.spin += dt * 9
    }
    for (const f of sessions()) {
      const p = plantOf(f.id)
      if (p.queue > 0 && !visits.has(f.id)) { p.queue--; startVisit(f.id) }
      const pct = p.held ?? (demoWilt ? STAGES[(idx(f.id) + Math.floor(now / 4000)) % STAGES.length] : ctxOf(f.session)?.pct ?? 0), target = wiltOf(pct)
      if (p.w == null) p.w = target
      p.w += (target - p.w) * Math.min(1, dt * (now - p.perk < 1500 ? 5 : 1.6))
      p.pct = pct
    }
    for (const [id, v] of visits) {
      if (v.npc.gone) { visits.delete(id); continue }
      v.puffs = v.puffs.filter(f => now - f.at < 700)
      if (v.phase !== 'sweep') continue
      const p = plantOf(id), f = tower.floor(id)
      v.t += dt
      p.swept = Math.max(0, 1 - v.t / (SWEEP_S * 0.8))
      if (f && v.t % 0.28 < dt) v.puffs.push({ x: v.npc.x + 10 + Math.sin(now / 110) * 3.5 + (Math.random() - 0.5) * 4, y: f.y - 2, at: now, r: 1 + Math.random() })
      if (v.t >= SWEEP_S || !f) {
        p.perk = now; p.swept = 1; p.held = p.queue > 0 ? p.held : null
        v.phase = 'out'; v.npc.leave()
      }
    }
  })

  // ---------- drawing (world pixels) ----------
  function drawPlant(c, x, y, w, now, perkT) {   // x: left of the 16-px box, y: floor surface
    const droop = Math.min(1, w * 1.15), bounce = perkT < 1 ? Math.sin(perkT * Math.PI * 3) * (1 - perkT) * 0.35 : 0
    const leaf = rgb(ramp(LEAF, w)), hi = rgb(ramp(LEAF_HI, w)), stem = rgb(ramp(STEM, w))
    const px = (X, Y, col) => { c.fillStyle = col; c.fillRect(Math.round(X), Math.round(Y), 1, 1) }
    const bx = x + 8, by = y - 9, s = 1.4                      // a floor plant: stems 40% longer than the desk one
    STEMS.forEach(([a0, len], i) => {
      const L = Math.round(len * s * (1 - 0.3 * w)), side = a0 < 0 ? -1 : 1, sway = Math.sin(now / 900 + i * 1.7) * 0.05 * (1 - w)
      let X = bx - 0.5 + side * 0.5, Y = by, a = a0
      for (let k = 0; k < L; k++) {
        const u = k / L
        a = a0 * (1 - 0.4 * droop) + side * (droop * 2.7 * Math.pow(u, 0.8) - 0.12 * (1 - droop) * u) - side * bounce * u + sway
        X = Math.max(x - 4, Math.min(x + 19, X + Math.sin(a))); Y = Math.min(y - 3, Y - Math.cos(a))
        px(X, Y, stem)
        if (k >= 2 && k % 2 === (i % 2)) {
          const ls = (k / 3) % 2 ? 1 : -1, up = a + ls * 0.85, la = up + (ls * 2.7 - up) * droop * 0.85, n = w > 0.7 ? 2 : 3
          for (let q = 1; q <= n; q++) px(X + Math.sin(la) * q, Y - Math.cos(la) * q, q === 2 ? hi : leaf)
          if (w < 0.8) px(X + Math.sin(la) * 2 + Math.cos(la), Y - Math.cos(la) * 2 + Math.sin(la), leaf)
        }
      }
      px(X + Math.sin(a), Y - Math.cos(a), hi); px(X + Math.sin(a) * 2, Y - Math.cos(a) * 2, leaf)
    })
    // building.js's terracotta pot
    R(c, '#8a5a3a', x + 2, y - 8, 12, 8); R(c, '#a06a44', x + 2, y - 8, 12, 2); R(c, '#3d2a1c', x + 3, y - 9, 10, 1)
  }
  function drawJar(c, x, y, j) {   // y: floor surface
    y -= 16
    R(c, 'rgba(0,0,0,.28)', x + 3, y + 15, 11, 1); R(c, 'rgba(205,232,250,.32)', x + 3, y + 4, 10, 11)
    const fill = j.shown > 0.005 ? Math.max(1, Math.ceil(level(j.shown) * 9)) : 0
    for (let r = 0; r < fill; r++) {
      const ry = y + 13 - r
      R(c, r % 2 ? '#d9a12c' : '#f0c24a', x + 4, ry, 8, 1); R(c, r % 2 ? '#b07a1c' : '#c98f22', x + 4 + (r * 3) % 7, ry, 2, 1)
      if (r === fill - 1) { R(c, '#ffe58a', x + 5 + (r % 3), ry, 2, 1); R(c, '#ffe58a', x + 9, ry, 1, 1) }
    }
    c.fillStyle = '#8fb6c9'; c.fillRect(x + 2, y + 5, 1, 9); c.fillRect(x + 13, y + 5, 1, 9); c.fillRect(x + 3, y + 14, 10, 1); c.fillRect(x + 3, y + 4, 1, 1); c.fillRect(x + 12, y + 4, 1, 1)
    R(c, 'rgba(255,255,255,.55)', x + 4, y + 5, 1, 6); R(c, 'rgba(255,255,255,.55)', x + 5, y + 5, 1, 2)
    R(c, '#7da4b8', x + 4, y + 2, 8, 2); R(c, '#b8d6e4', x + 4, y + 2, 8, 1)
    R(c, '#6b4a2e', x + 6, y + 1, 4, 1); R(c, '#8a6440', x + 6, y + 2, 4, 1)
  }
  function drawCoin(c, x, y, t, now) {
    const cy = Math.round(y - 28 + 14 * t * t), w = [4, 2, 1][Math.floor(now / 70) % 3], cx = Math.round(x + 8 - w / 2)
    R(c, '#b07a1c', cx, cy + 1, w, 3); R(c, '#ffd34e', cx, cy, w, 3); if (w > 1) R(c, '#fff2b0', cx, cy, 1, 1)
  }
  function drawClink(c, x, y, t) {
    const r = 2 + Math.round(t * 5), cx = x + 8, cy = y - 13
    c.fillStyle = `rgba(255,240,170,${1 - t})`
    for (const [dx, dy] of [[-r, 0], [r, 0], [0, -r], [-r + 1, -r + 1], [r - 1, -r + 1]]) c.fillRect(cx + dx, cy + dy, 1, 1)
  }
  function medal(c, cx, top, tier, r) {
    const [rib1, rib2] = RIBBONS[tier] || RIBBONS.gold, [face, rim, hi] = TIERS[tier] || TIERS.gold
    R(c, rib1, cx - r, top, r, r + 1); R(c, rib2, cx, top, r, r + 1)
    const cy = top + r + 1 + r
    c.fillStyle = rim; for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy + r * 0.6)); c.fillRect(cx - w, cy + dy, 2 * w, 1) }
    c.fillStyle = face; for (let dy = -r + 1; dy <= r - 1; dy++) { const w = Math.round(Math.sqrt((r - 1) * (r - 1) - dy * dy + r * 0.6)); c.fillRect(cx - w, cy + dy, 2 * w, 1) }
    R(c, hi, cx - Math.ceil(r / 2), cy - Math.ceil(r / 2), 1, Math.max(1, Math.floor(r / 2)))
  }
  const gaugeBox = f => { const b = tower.plaque(f); return { x: b.x + 7, y: b.y + b.h - 4, w: b.w - 13, h: 1 } }
  const studs = f => { const b = tower.plaque(f), n = Math.min(3, medalsOf(f.session).length); return Array.from({ length: n }, (_, i) => ({ x: b.x + b.w - 9 - i * 5, y: b.y + 6 })) }
  const prTags = new Map()                   // floor id -> the PR number's world rect on the plaque, as last painted
  const jarX = d => d.floorSlot.x - 1

  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    for (const f of sessions()) {
      if (f.y < v.y0 - 10 || f.top > v.y1 + 10) continue
      const s = f.session, d = tower.desk(f.id); if (!d) continue
      // the plaque: a hairline context gauge along its lower edge, medals as brass studs at its right end
      const m = ctxOf(s), mine = medalsOf(s)
      out.push({ z: tower.Z.FRONT, draw: c => {
        if (m) {
          const g = gaugeBox(f), lit = Math.ceil(m.pct * SEGS - 0.001), sw = g.w / SEGS, col = ctxColor(m.pct), blink = m.pct >= 0.9 && Math.floor(now / 600) % 2
          for (let j = 0; j < SEGS; j++) R(c, j < lit ? (blink && j === lit - 1 ? '#7a3a30' : col) : 'rgba(241,228,196,.13)', Math.round(g.x + j * sw), g.y, Math.max(1, Math.round(sw) - 1), g.h)
        }
        studs(f).forEach((p, i) => { const [face, rim, hi] = TIERS[mine[i].tier] || TIERS.gold; R(c, rim, p.x, p.y, 3, 3); R(c, face, p.x + 1, p.y, 1, 3); R(c, face, p.x, p.y + 1, 3, 1); R(c, hi, p.x, p.y, 1, 1) })
      } })
      // the plant (replacing the stock one), fallen leaves, perk sparkle
      const p = plants.get(f.id)
      if (p && p.w != null) {
        const perkT = (now - p.perk) / 1400, fallen = p.pct > 0.9 ? Math.min(FALLEN.length, 1 + Math.floor((p.pct - 0.9) / 0.1 * FALLEN.length)) : 0
        out.push({ z: tower.Z.WALL + 1, draw: c => {
          drawPlant(c, PLANT_X - 1, f.y, p.w, now, perkT)
          if (fallen && p.swept > 0) { c.globalAlpha = p.swept; FALLEN.slice(0, fallen).forEach(([dx], i) => { R(c, i % 2 ? '#8a6232' : '#a77a3e', PLANT_X + dx, f.y - 1, 3, 1); R(c, '#6e4a22', PLANT_X + dx + (i % 2 ? 2 : 0), f.y - 2, 1, 1) }); c.globalAlpha = 1 }
        } })
        if (perkT < 1) out.push({ z: tower.Z.TOP, draw: c => {
          c.fillStyle = '#fff6c2'; c.globalAlpha = Math.max(0, 1 - perkT)
          for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + perkT * 1.5, r = 4 + 12 * perkT, sx = Math.round(PLANT_X + 7 + Math.cos(a) * r), sy = Math.round(f.y - 22 + Math.sin(a) * r * 0.8 - 6 * perkT), k = i % 2 ? 1 : 2; c.fillRect(sx - k, sy, 2 * k + 1, 1); c.fillRect(sx, sy - k, 1, 2 * k + 1) }
        } })
      }
      // desk: mascot + sticker
      const [first, second] = stacksOf(s, now), seed = api.hash(s.id) % 97
      out.push({ z: tower.Z.FLOOR, draw: c => {
        if (first) MASCOT[first](c, Math.round(d.top.x + d.top.w / 2) + 1, d.desk.y, now, seed)
        if (second) { const x = d.monitor.x + 6, y = d.monitor.y + 5; R(c, '#f4f2ea', x + 1, y, 3, 4); R(c, '#f4f2ea', x, y + 1, 5, 2); R(c, STICKER[second], x + 1, y + 1, 3, 2) }
      } })
      // subagents' context strip under their screen
      out.push({ z: tower.Z.FLOOR, draw: c => {
        for (const g of s.agents) {
          const a = tower.person(g.id); if (!a || !a.atDesk || a.leaving || a.floor !== f.id) continue
          const ad = d.agents[a.slot], mm = agentCtx(g, a.slot); if (!ad || !mm) continue
          const x = ad.monitor.x + 1, y = ad.monitor.y + 9, pct = clamp(mm.pct)
          R(c, '#2a2a33', x, y, 8, 2); R(c, ctxColor(pct), x, y, Math.max(1, Math.round(8 * pct)), 2)
        }
      } })
      // coin jar
      const j = jars.get(f.id)
      if (j && j.usd != null) {
        const x = jarX(d)
        out.push({ z: tower.Z.FLOOR, draw: c => drawJar(c, x, f.y, j) })
        if (j.drops.length || j.clinks.length) out.push({ z: tower.Z.FLOOR + 1, draw: c => {
          for (const t of j.drops) if (now >= t) drawCoin(c, x, f.y, Math.min(1, (now - t) / DROP_MS), now)
          for (const t of j.clinks) drawClink(c, x, f.y, (now - t) / CLINK_MS)
        } })
      }
    }
    for (const v of visits.values()) if (v.puffs.length) {
      out.push({ z: tower.Z.WALK + 5, draw: c => { c.fillStyle = '#d8d2c4'; for (const p of v.puffs) { const t = (now - p.at) / 700; c.globalAlpha = 0.55 * (1 - t); c.beginPath(); c.arc(p.x, p.y - 5 * t, p.r + 3 * t, 0, Math.PI * 2); c.fill() } } })
    }
    if (parts.length) out.push({ z: tower.Z.TOP, draw: c => {
      for (const q of parts) {
        c.globalAlpha = Math.min(1, (q.max - q.life) / 0.5); c.fillStyle = q.c
        const x = q.ox + q.dx, y = q.oy + q.dy
        if (q.sparkle) { const r = Math.max(0.5, 1.6 * (1 - q.life / q.max)); c.fillRect(x - r, y - 0.5, r * 2, 1); c.fillRect(x - 0.5, y - r, 1, r * 2) }
        else c.fillRect(Math.round(x), Math.round(y), 2, Math.max(1, Math.round(2 * Math.abs(Math.cos(q.spin)))))
      }
    } })
  })

  // ---------- text (screen space) ----------
  tower.on('overlay', (c, now) => {
    const k = tower.zoom, H = tower.canvas.clientHeight
    c.textBaseline = 'middle'
    for (const f of sessions()) {
      const d = tower.desk(f.id); if (!d) continue
      const o = tower.worldToScreen(0, f.y); if (o.y < -40 || o.y - 70 * k > H) continue
      const j = jars.get(f.id)
      if (j && j.usd != null && k >= 1.1) {   // a paper tag over the jar's lid
        const x = jarX(d), p = tower.worldToScreen(x + 8, f.y - 22), fs = Math.max(8, Math.min(3.6 * k, 13)), t = money(j.usd)
        c.font = tower.font(fs, 700)
        const bump = j.clinks.length ? Math.max(0, 1 - (now - j.clinks.at(-1)) / CLINK_MS) * 0.8 * k : 0
        const w = Math.round(c.measureText(t).width + Math.max(4, 1.4 * k)), h = Math.round(fs + Math.max(2, 0.8 * k)), x0 = Math.round(p.x - w / 2), y0 = Math.round(p.y - h / 2 - bump)
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(x0 + 1, y0 + 1, w, h)
        c.fillStyle = '#f3e7c6'; c.fillRect(x0, y0, w, h); c.fillStyle = '#c7a24a'; c.fillRect(x0, y0, 1, h); c.fillRect(x0 + w - 1, y0, 1, h)
        c.fillStyle = '#3a2614'; c.textAlign = 'center'; c.fillText(t, p.x, y0 + h / 2 + 0.5); c.textAlign = 'left'
      }
    }
  })

  // the open PR's number on the plaque, in green enamel, left of the medal studs
  tower.on('plaque', (c, f, b) => {
    const n = studs(f).length, pr = prOf(f.session), used = n ? (n * 5 + 3) * b.k : 0
    if (!pr) { prTags.delete(f.id); return used }
    const fs = b.fs * 0.92, t = `⚑ #${pr.n}`
    c.font = tower.font(fs, 700); const w = c.measureText(t).width, x = b.right - used - w
    c.fillStyle = '#8fd6a0'; c.fillText(t, x, b.y + b.h / 2 + 0.5)
    const a = tower.screenToWorld(x - 2, b.y), z = tower.screenToWorld(x + w + 2, b.y + b.h)
    prTags.set(f.id, { x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y })
    return used + w + fs * 0.8
  })

  // ---------- hover / click ----------
  const inR = (w, r, pad = 1) => w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
  const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const fmtK = n => n >= 1e6 ? (n / 1e6).toFixed(2) + 'M' : Math.round(n / 1000) + 'k'
  function hit(w) {
    for (const f of sessions()) {
      const d = tower.desk(f.id); if (!d) continue
      if (w.y < f.top - 20 || w.y > f.y + 20) continue
      const s = f.session, pr = prOf(s), tag = prTags.get(f.id)
      if (pr && tag && inR(w, tag, 0)) return { kind: 'pr', s, pr }
      if (studs(f).some(p => inR(w, { x: p.x, y: p.y, w: 3, h: 3 }, 1.5))) return { kind: 'medals', s }
      if (ctxOf(s) && inR(w, gaugeBox(f), 1.5)) return { kind: 'ctx', s }
      if (w.y > f.top && w.y <= f.y) {
        if (stacksOf(s, performance.now())[0] && inR(w, { x: d.top.x - 2, y: d.desk.y - 12, w: d.top.w + 4, h: 12 })) return { kind: 'mascot', s }
        if (jars.get(f.id)?.usd != null && inR(w, { x: jarX(d) + 2, y: f.y - 26, w: 12, h: 26 })) return { kind: 'jar', s }
        if (inR(w, { x: PLANT_X - 2, y: f.y - 34, w: 18, h: 34 }, 0)) return { kind: 'plant', s, f }
      }
    }
    for (const v of visits.values()) if (Math.abs(w.x - v.npc.x) < 8 && w.y > v.npc.y - 28 && w.y < v.npc.y + 1) return { kind: 'janitor', v }
    return null
  }
  const esc = api.esc
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    const s = h.s, t = s ? `<div class="t">${esc(s.title)}</div>` : ''
    if (h.kind === 'ctx') { const m = ctxOf(s); return `${t}<div>context ${Math.round(m.pct * 100)}%${m.used ? ` · ${fmtK(m.used)} of ${fmtK(m.window)} tokens` : ''}</div>${m.compacted ? '<div class="m">just compacted</div>' : ''}` }
    if (h.kind === 'medals') return `${t}${medalsOf(s).slice(0, 8).map(a => `<div>${a.icon} ${esc(a.title)} <span class="m">${clock(a.earnedAt)}</span></div>`).join('')}`
    if (h.kind === 'pr') return `${t}<div>PR #${h.pr.n}${h.pr.title ? ' — ' + esc(h.pr.title) : ''}</div><div class="m">${esc(h.pr.repo || '')}${h.pr.url ? ' · ↗ click to open' : ''}</div>`
    if (h.kind === 'mascot') { const [a, b] = stacksOf(s, performance.now()); return `${t}<div>working in ${LABEL[a]}${b ? ' · ' + LABEL[b] : ''}</div>` }
    if (h.kind === 'jar') { const usd = jars.get(s.id).usd, by = s.ext?.['cost-jar']?.byModel || {}; return `${t}<div>${money(usd)} today <span class="m">(list-price estimate)</span></div>${Object.values(by).map(b => `<div class="m">${esc(b.family)} · $${b.usd.toFixed(2)}</div>`).join('')}` }
    if (h.kind === 'plant') { const p = plants.get(s.id); return `${t}<div>the desk plant ${p?.pct > 0.8 ? 'is wilting' : p?.pct > 0.5 ? 'is drooping' : 'is thriving'} — context ${Math.round((p?.pct || 0) * 100)}%</div><div class="m">a compaction brings the janitor</div>` }
    if (h.kind === 'janitor') return `<div class="t">The janitor</div><div class="m">${h.v.phase === 'sweep' ? 'sweeping up after a compaction' : h.v.phase === 'in' ? 'on his way to sweep up a compaction' : 'heading out'}</div>`
    return null
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w)
    if (h?.kind === 'pr' && h.pr.url) { api.openLink(h.pr.url); return true }
    return false
  })
}
