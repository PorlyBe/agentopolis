// themes: the tower's skin. A theme is a skin (materials for building.js and city.js, a tint over the finished frame and
// its own decor) plus a holiday from holidays.js's calendar, whose decor holidays.js and ambience.js keep drawing.
// --theme <name> on the server (snap.theme), ?theme=<name> overrides it; ?demo=themes cycles them every 8 s.
// Names: auto (classic + the date's holiday), classic, cyberpunk, cottage, brutalist, a holiday key (halloween, christmas,
// newyear, valentine, lunar, hanami, goldenweek, tanabata, obon, tsukimi: classic + that holiday) or skin+holiday.
import { setPalette, BW, SHAFT, WALL, SLAB } from '../building.js'
import { HOLIDAYS, pinHoliday } from './holidays.js'

const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const pool = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
const rnd = k => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
const same = (o, v) => Object.fromEntries(Object.keys(o).map(k => [k, v]))
const KINDS = { session: 0, lobby: 0, meeting: 0, cafe: 0, ceo: 0, post: 0 }

const SKINS = {
  classic: { label: 'Classic' },
  cyberpunk: {
    label: 'Cyberpunk',
    building: {
      interior: { session: '#433b5c', lobby: '#3a3452', meeting: '#3c3a56', cafe: '#463858', ceo: '#38324e', post: '#363a50' },
      wainscot: same(KINDS, '#2a2440'), slabTop: '#2e2c3c', slab: '#1e1d2a', slabLine: '#0e0e16', roofSlab: '#2a2838', roofSlabTop: '#3a3850',
      wall: '#2c2e3e', wallEdge: '#16171f', footing: '#1e1d2a', footingLine: '#0e0e16', doorFrame: '#16171f', glass: '#3ae0ff', skirting: '#7a2a8a',
      shaft: '#2a2c3a', shaftHi: '#4a5a7a', machine: '#2a2c3a', machineHi: '#3a3c50', machineLo: '#16171f', deck: '#2a2a36', deckLine: '#1a1a24',
      lamp: '200,120,255', roomGlow: 'rgba(60,30,90,.6)',
    },
    city: {
      skyFar: '#2c2a4c', skyNear: '#201e3c', skyWin: '120,230,255', soil: '#14121e', pebble: '#1e1a2a', walk: '#3a3a4c', walkLine: '#2a2a3a',
      road: '#17161f', lane: '#ff3fb4', curb: '#2a2a38', curbLine: '#14141c', post: '#22222e', bulb: '#7af0ff', lampGlow: '90,230,255',
      trunk: '#2a2030', leaf: '#245a5e', leafHi: '#3ae0c0', winLit: 'rgba(255,90,210,.85)',
      dayTop: [44, 26, 78], dayHz: [150, 64, 140], nightTop: [6, 4, 18], nightHz: [70, 20, 84],
      styles: [['#2e2a44', '#1e1a30', '#ff3fb4'], ['#24304a', '#162036', '#3ae0ff'], ['#3a2a3e', '#24182a', '#b46aff'], ['#1e3038', '#122028', '#3affc0']],
    },
    tint: [['multiply', 'rgba(110,80,170,.55)'], ['screen', 'rgba(40,0,60,.18)']],
  },
  cottage: {
    label: 'Cottage',
    building: {
      interior: { session: '#ead9b6', lobby: '#e8d4ae', meeting: '#e0d2b0', cafe: '#ecdab8', ceo: '#e4cfa8', post: '#dac8a4' },
      wainscot: { session: '#8a6040', lobby: '#7a5434', meeting: '#8a6a48', cafe: '#9a7048', post: '#7a5a3a' },
      slabTop: '#a0703a', slab: '#6a4428', slabLine: '#4a2e1a', roofSlab: '#7a4a2a', roofSlabTop: '#9a6a3a', wall: '#b48a58', wallEdge: '#8a6438',
      footing: '#7a6a5a', footingLine: '#5a4a3a', doorFrame: '#5a3a22', glass: '#c8d8b0', skirting: '#5a3a22',
      shaft: '#7a5a3a', shaftHi: '#9a7a52', machine: '#a0603a', machineHi: '#c07a48', machineLo: '#7a4428', deck: '#a07a4a', deckLine: '#7a5a32',
      lamp: '255,186,100', roomGlow: 'rgba(96,62,24,.62)',
    },
    city: {
      skyFar: '#b9b2c2', skyNear: '#a39cb2', skyWin: '255,214,140', soil: '#4a3a24', pebble: '#5a4a2e', walk: '#c8b898', walkLine: '#a8987a',
      road: '#6a5a48', lane: '#7a6a56', curb: '#9a8a6a', curbLine: '#7a6a4e', post: '#3a2a1a', bulb: '#ffe0a0', lampGlow: '255,200,120',
      trunk: '#5a3e22', leaf: '#4a8a3a', leafHi: '#7ab84a', winLit: 'rgba(255,196,100,.9)',
      dayTop: [118, 160, 200], dayHz: [240, 222, 196], nightTop: [14, 12, 30], nightHz: [52, 40, 60],
      styles: [['#c87a5a', '#a05a40', '#e8c8a0'], ['#d8c098', '#b09870', '#f0e0c0'], ['#a0b088', '#80906a', '#d0d8b0'], ['#c8a0a0', '#a07a7a', '#e8d0c8']],
    },
    tint: [['soft-light', 'rgba(255,190,120,.3)'], ['multiply', 'rgba(255,242,222,.8)']],
  },
  brutalist: {
    label: 'Brutalist',
    building: {
      interior: { session: '#b8b6b0', lobby: '#c4c2bc', meeting: '#aeb0b0', cafe: '#bcbab4', ceo: '#a8a6a0', post: '#b0aea8' },
      wainscot: { ...same(KINDS, '#8e8c88'), ceo: '#5a5854' }, slabTop: '#9a9894', slab: '#7a7874', slabLine: '#3a3836', roofSlab: '#8a8884', roofSlabTop: '#a8a6a2',
      wall: '#a09e98', wallEdge: '#5a5854', footing: '#6a6864', footingLine: '#3a3836', doorFrame: '#3a3836', glass: '#9aa8b0', skirting: '#5a5854',
      shaft: '#8a8884', shaftHi: '#a8a6a2', machine: '#8a8884', machineHi: '#a8a6a2', machineLo: '#5a5854', deck: '#8a8884', deckLine: '#6a6864',
      lamp: '240,240,228', roomGlow: 'rgba(40,40,44,.5)',
    },
    city: {
      skyFar: '#a8acb2', skyNear: '#8e9298', skyWin: '235,235,225', soil: '#3a3836', pebble: '#4a4846', walk: '#a8a6a0', walkLine: '#8a8884',
      road: '#3a3a3c', lane: '#d8d8d0', curb: '#8a8884', curbLine: '#5a5854', post: '#2a2a2c', bulb: '#f0f0e8', lampGlow: '240,240,230',
      trunk: '#4a4440', leaf: '#5a6a5a', leafHi: '#6a7a6a', winLit: 'rgba(240,240,225,.8)',
      dayTop: [150, 160, 172], dayHz: [205, 208, 212], nightTop: [10, 12, 16], nightHz: [40, 44, 50],
      styles: [['#9a9894', '#7a7874', '#b8b6b2'], ['#8a8c90', '#6a6c70', '#a8aaae'], ['#a4a09a', '#84807a', '#c0bcb6'], ['#7e8084', '#5e6064', '#9ea0a4']],
    },
    tint: [['saturation', 'rgba(128,128,128,.72)'], ['multiply', 'rgba(232,232,236,1)']],
  },
}
const HOLI = new Map(HOLIDAYS.map(h => [h.key, h]))
const ALIAS = { cherryblossom: 'hanami', sakura: 'hanami', 'new-year': 'newyear', valentines: 'valentine', xmas: 'christmas' }
const CYCLE = ['classic', 'cyberpunk', 'cottage', 'brutalist', 'halloween', 'christmas', 'newyear', 'valentine', 'lunar', 'hanami', 'goldenweek', 'tanabata', 'obon', 'tsukimi', 'cyberpunk+halloween']

// 'cyberpunk+halloween' → { skin, holiday }: holiday null = the date's own, 'none' = no holiday decor
export function parseTheme(name) {
  let skin = null, holiday = null
  for (const raw of String(name || 'auto').toLowerCase().split(/[+, ]/)) {
    const p = ALIAS[raw] || raw
    if (SKINS[p] && !skin) skin = p
    else if (HOLI.has(p) && !holiday) holiday = p
  }
  if (!skin && !holiday) return { skin: 'classic', holiday: null, name: 'auto' }
  return { skin: skin || 'classic', holiday: holiday || 'none', name: [skin, holiday].filter(Boolean).join('+') }
}

export default function init(api, tower) {
  const { Z, font } = tower
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1))
  const DEMO = params.getAll('demo').includes('themes'), urlTheme = params.get('theme'), T0 = Date.now()
  let cur = null, skin = SKINS.classic, theme = parseTheme('auto')

  function apply(name) {
    const t = parseTheme(name)
    if (cur === t.name) return
    const rebuild = cur !== null && SKINS[t.skin] !== skin
    cur = t.name; theme = t; skin = SKINS[t.skin]
    setPalette(skin.building); tower.city.setTheme(skin.city ? { id: t.skin, ...skin.city } : null)
    pinHoliday(t.holiday)
    if (rebuild && tower.floor('lobby')) tower.setOpen('lobby', null)   // a no-op squeeze that rebuilds the cached layers
  }
  const wanted = () => DEMO ? CYCLE[Math.floor((Date.now() - T0) / 8000) % CYCLE.length] : urlTheme || tower.snapshot?.theme || 'auto'
  if (DEMO || urlTheme) apply(wanted())
  tower.on('snapshot', data => apply(DEMO || urlTheme ? wanted() : data.theme || 'auto'))
  if (DEMO) tower.on('step', () => apply(wanted()))
  api.theme = { get name() { return theme.name }, get skin() { return theme.skin }, get holiday() { return theme.holiday }, set: apply, list: () => [...Object.keys(SKINS), ...HOLI.keys()] }

  const roof = () => tower.floors[tower.floors.length - 1]
  const sessionFloors = () => tower.floors.filter(f => f.kind === 'session' || f.kind === 'meeting' || f.kind === 'cafe')

  // ---------- skin decor ----------
  const SX = BW + SHAFT + 3                                 // neon blade signs hang off the shaft's outer side
  const NEON = ['255,63,180', '58,224,255', '180,106,255', '58,255,192', '255,200,60']
  const signs = () => sessionFloors().filter((f, i) => i % 2 === 0).map((f, i) => ({ f, x: SX, y: f.top + 8, h: Math.min(44, f.y - f.top - 16), col: NEON[(f.n + i) % NEON.length], seed: f.n * 7 + 3 }))
  function blade(c, s, now) {
    const flick = rnd(s.seed + Math.floor(now / 140)) > 0.985 ? 0.25 : 1, a = flick
    R(c, '#10101a', s.x, s.y, 12, s.h); R(c, '#2a2a3a', s.x - 3, s.y + 3, 3, 2); R(c, '#2a2a3a', s.x - 3, s.y + s.h - 5, 3, 2)
    c.fillStyle = `rgba(${s.col},${a})`
    c.fillRect(s.x, s.y, 12, 1); c.fillRect(s.x, s.y + s.h - 1, 12, 1); c.fillRect(s.x, s.y, 1, s.h); c.fillRect(s.x + 11, s.y, 1, s.h)
    for (let gy = s.y + 4, k = 0; gy + 6 < s.y + s.h - 2; gy += 8, k++)   // invented glyphs, a 3x5 pixel stamp each
      for (let px = 0; px < 3; px++) for (let py = 0; py < 5; py++) if (rnd(s.seed * 31 + k * 17 + px * 5 + py) > 0.45 || px === 1 && py % 2 === 0) c.fillRect(s.x + 3 + px * 2, gy + py, 2, 1)
    c.globalCompositeOperation = 'lighter'; pool(c, s.x + 6, s.y + s.h / 2, s.h * 0.8, s.col, 0.22 * a); c.globalCompositeOperation = 'source-over'
  }
  function cyberpunk(c, now, v) {
    const rf = roof()
    c.globalCompositeOperation = 'lighter'
    // tubes: up the street-side wall and along the roof slab
    c.fillStyle = 'rgba(58,224,255,.9)'; c.fillRect(-1, rf.y, 1, -rf.y)
    c.fillStyle = 'rgba(255,63,180,.9)'; c.fillRect(0, rf.y + SLAB - 1, BW, 1)
    c.fillStyle = 'rgba(58,224,255,.12)'; c.fillRect(-4, rf.y, 7, -rf.y)
    c.fillStyle = 'rgba(255,63,180,.12)'; c.fillRect(0, rf.y + SLAB - 4, BW, 7)
    // the wet road throws the signs back
    for (const s of signs()) { const g = c.createLinearGradient(0, 4, 0, 16); g.addColorStop(0, `rgba(${s.col},.22)`); g.addColorStop(1, `rgba(${s.col},0)`); c.fillStyle = g; c.fillRect(s.x - 2 + (s.f.n % 3) * 6, 4, 8, 12) }
    c.globalCompositeOperation = 'source-over'
    for (const s of signs()) blade(c, s, now)
    // rain, always
    const W = v.x1 - v.x0, H = v.y1 - v.y0, n = Math.round(W * H / 5000), t = now / 1000
    c.fillStyle = 'rgba(150,200,255,.35)'
    for (let i = 0; i < n; i++) {
      const sp = 300 + rnd(i) * 120, y = v.y0 + ((rnd(i + 9) * H + t * sp) % H)
      let x = v.x0 + ((rnd(i + 3) * W - t * sp * 0.2) % W); if (x < v.x0) x += W
      c.fillRect(Math.round(x), Math.round(y), 1, 6)
    }
  }
  const ivyAt = f => [f.top + 14, f.y - 8]                    // between one plaque and the next
  function cottage(c, now) {
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.kind === 'server' || f.kind === 'post' || f.kind === 'lobby') continue
      const [y0, y1] = ivyAt(f)
      for (let y = y0; y < y1; y += 2) {
        const sw = Math.round(Math.sin(y / 9 + f.n) * 1.5)
        R(c, '#3a6a2a', sw, y, 2, 2)
        if (rnd(y * 3 + f.n) > 0.55) R(c, rnd(y + f.n) > 0.5 ? '#5a9a3a' : '#4a8a32', sw + (rnd(y + 1) > 0.5 ? 2 : -2), y, 2, 2)
        if (rnd(y * 7 + f.n) > 0.93) R(c, '#f0a0c0', sw + 2, y, 1, 1)
      }
      // a lantern sconce on the outer wall
      const ly = f.y - 40
      R(c, '#3a2a1a', -4, ly, 4, 1); R(c, '#3a2a1a', -6, ly - 1, 4, 1); R(c, '#2a1a0e', -7, ly, 4, 6); R(c, '#ffd88a', -6, ly + 1, 2, 4)
    }
    const lob = tower.floor('lobby')
    if (lob) for (const x of [WALL + 470, WALL + 4]) { R(c, '#8a5a3a', x - 3, lob.y - 6, 8, 6); R(c, '#a06a42', x - 3, lob.y - 6, 8, 1); for (let i = 0; i < 9; i++) R(c, ['#4a8a3a', '#6aa84a', '#e86a8a', '#f0c84a'][i % 4], x - 3 + (i % 4) * 2, lob.y - 9 - Math.floor(i / 4) * 2, 2, 2) }
  }
  function brutalist(c) {
    const rf = roof()
    for (let y = rf.y + 10; y < 0; y += 14) { R(c, 'rgba(40,40,40,.35)', 2, y, 1, 1); R(c, 'rgba(40,40,40,.35)', 5, y, 1, 1); R(c, 'rgba(40,40,40,.35)', BW - 6, y, 1, 1); R(c, 'rgba(40,40,40,.35)', BW - 3, y, 1, 1) }
    for (let y = rf.y + 3; y < 0; y += 7) R(c, 'rgba(255,255,255,.07)', 0, y, WALL, 1)
    for (const f of tower.floors) if (f.kind !== 'roof' && f.y < 0) R(c, 'rgba(0,0,0,.28)', -4, f.y + SLAB, 4, 3)   // the slabs cantilever past the wall
    for (const f of tower.floors) if (f.kind !== 'roof' && f.y < 0) R(c, '#7a7874', -4, f.y, 4, SLAB)
  }

  tower.on('items', out => {
    if (!tower.floors.length) return
    if (theme.skin === 'cottage') out.push({ z: Z.OUTSIDE + 1, draw: c => cottage(c, performance.now()) })
    if (theme.skin === 'brutalist') out.push({ z: Z.OUTSIDE + 1, draw: brutalist })
  })
  tower.on('glow', (c, now, n) => {
    if (theme.skin !== 'cottage' || n < 0.05 || !tower.floors.length) return
    c.globalAlpha = Math.min(1, n * 1.2)
    for (const f of tower.floors) if (!['roof', 'server', 'post', 'lobby'].includes(f.kind)) pool(c, -5, f.y - 37, 14, '255,200,120', 0.6)
    c.globalAlpha = 1
  })
  tower.on('post', (c, now, ctx) => {
    if (!skin.tint || !tower.floors.length) return
    const v = ctx.view
    for (const [op, col] of skin.tint) { c.globalCompositeOperation = op; c.fillStyle = col; c.fillRect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4) }
    c.globalCompositeOperation = 'source-over'
    if (theme.skin === 'cyberpunk') cyberpunk(c, now, v)
  })

  if (DEMO) tower.on('overlay', c => {
    const h = theme.holiday && theme.holiday !== 'none' ? HOLI.get(theme.holiday) : null
    const txt = `🎨 ${skin.label}${h ? ' · ' + h.icon + ' ' + h.name : ''}`
    c.save(); c.font = font(14, 700); c.textBaseline = 'top'
    const w = c.measureText(txt).width + 20
    c.fillStyle = 'rgba(20,20,28,.8)'; c.beginPath(); c.roundRect(16, 86, w, 24, 6); c.fill()
    c.fillStyle = '#fbfaf4'; c.fillText(txt, 26, 91); c.restore()
  })
}
