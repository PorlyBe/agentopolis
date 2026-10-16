// ambience: the tower's atmosphere. Seasonal decor, dated by holidays.js's calendar and off when the theme names no holiday (?season=halloween|christmas|winter|spring|
// summer|autumn|lunar|valentine|none forces one; ?date=YYYY-MM-DD moves the day), the soundscape heard from the tower's people (soundscape.js keeps the button and setting), an LED ticker over the lobby's reception (snap.ticker) and the street's GitHub life (snap.street): bot couriers to
// the engineers' doors, emotes over their roofs, mail for the user in the lobby mailbox, the Gazette stand on a new headline.
// Demos: ?demo=street (traffic + mail every 24 s), ?demo=gazette-stand, ?demo=ghost (the shaft ghost every 12 s),
// ?demo=towersound (fills the café's games for a minute, to hear them).
import { BW, SHAFT } from '../building.js'
import { holidayOf, today, noDecor } from './holidays.js'
import { R } from '../draw.js'

const SEASONS = ['halloween', 'christmas', 'winter', 'spring', 'summer', 'autumn', 'lunar', 'valentine', 'none']
const DRAWN_HERE = new Set(['halloween', 'christmas', 'lunar', 'valentine'])   // the other holidays draw themselves
function seasonOf(d = today()) {
  const m = d.getMonth() + 1, h = holidayOf(d)?.key
  if (DRAWN_HERE.has(h)) return h
  if (m === 12 || m <= 2) return 'winter'
  if (m <= 5) return 'spring'
  if (m <= 8) return 'summer'
  return 'autumn'
}
const pool = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
const inR = (w, r, pad = 2) => w && w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad

export default function init(api, tower) {
  const { Z } = tower
  const demos = api.params.getAll('demo')
  const forced = api.params.get('season'), season = () => SEASONS.includes(forced) ? forced : noDecor() ? 'none' : seasonOf()
  let night = 0
  const lit = () => night > 0.25
  const hooks = { items: [], glow: [], step: [], sync: [], overlay: [], hover: [], click: [] }
  for (const k of Object.keys(hooks)) tower.on(k, (...a) => { for (const fn of hooks[k]) { const r = fn(...a); if (r) return r } return null })
  tower.on('items', (out, now, ctx) => { night = Math.max(ctx.sun.n, ctx.sun.gloom * 0.6) })
  seasonal(api, tower, hooks, season, lit, demos)
  ticker(api, tower, hooks)
  street(api, tower, hooks, demos)
  sound(api, tower)
}

// ===================== seasonal decor =====================
function pumpkin(c, cx, by, big, on, now) {
  const w = big ? 9 : 7, h = big ? 7 : 5, x = Math.round(cx - w / 2), y = by - h
  R(c, 'rgba(0,0,0,.28)', x, by, w, 1)
  R(c, '#a8501a', x, y + 1, w, h - 1); R(c, '#a8501a', x + 1, y, w - 2, h)
  R(c, '#e07a22', x + 1, y + 1, w - 2, h - 2); R(c, '#f4a04a', x + 2, y + 1, 1, h - 3)
  R(c, '#b85a1c', Math.floor(cx), y + 1, 1, h - 2)
  R(c, '#4f7a2a', Math.floor(cx), y - 2, 1, 2); R(c, '#6ea03a', Math.floor(cx) + 1, y - 2)
  const fl = on ? (Math.sin(now / 90 + cx) > -0.6 ? '#ffe36a' : '#ffb43a') : '#4a200c'
  R(c, fl, x + 2, y + 2); R(c, fl, x + w - 3, y + 2); R(c, fl, x + 2, y + h - 2, w - 4, 1)
}
function cobweb(c, x, y, dir, now) {
  c.fillStyle = 'rgba(235,236,244,.55)'
  for (const a of [0.18, 0.62, 1.05, 1.4]) for (let r = 1; r < 11; r++) c.fillRect(Math.round(x + dir * r * Math.cos(a)), Math.round(y + r * Math.sin(a)), 1, 1)
  for (const r of [4, 7, 10]) for (let a = 0.05; a < 1.55; a += 0.7 / r) c.fillRect(Math.round(x + dir * r * Math.cos(a)), Math.round(y + r * Math.sin(a) + (r > 5 ? 0.6 : 0)), 1, 1)
  const drop = 12 + Math.round(3 * Math.sin(now / 1300 + x))
  R(c, 'rgba(235,236,244,.4)', x + dir * 6, y + 6, 1, drop - 6); R(c, '#1a1620', x + dir * 6 - 1, y + drop, 3, 2)
}
function bat(c, x, y, flap) {
  R(c, '#2a2034', x - 1, y - 1, 3, 3); R(c, '#ff5a4a', x - 1, y); R(c, '#ff5a4a', x + 1, y)
  if (flap) { R(c, '#3a2c4a', x - 4, y - 2, 3, 1); R(c, '#3a2c4a', x - 3, y - 1, 2, 1); R(c, '#3a2c4a', x + 2, y - 1, 2, 1); R(c, '#3a2c4a', x + 2, y - 2, 3, 1) }
  else { R(c, '#3a2c4a', x - 4, y + 1, 3, 1); R(c, '#3a2c4a', x - 3, y + 2); R(c, '#3a2c4a', x + 2, y + 1, 3, 1); R(c, '#3a2c4a', x + 4, y + 2) }
}
function ghost(c, x, y, now, a) {
  c.globalAlpha = a
  R(c, '#eef0ff', x - 3, y - 12, 6, 1); R(c, '#eef0ff', x - 4, y - 11, 8, 2); R(c, '#eef0ff', x - 5, y - 9, 10, 8)
  const w = Math.floor(now / 200) % 2
  for (let i = 0; i < 5; i++) if ((i + w) % 2 === 0) R(c, '#eef0ff', x - 5 + i * 2, y - 1, 2, 1)
  R(c, '#c9cde8', x + 3, y - 9, 2, 8)
  R(c, '#22203a', x - 3, y - 8, 2, 2); R(c, '#22203a', x + 1, y - 8, 2, 2); R(c, '#22203a', x - 1, y - 5, 2, 2)
  c.globalAlpha = 1
}
function tree(c, cx, by, now) {
  R(c, 'rgba(0,0,0,.28)', cx - 7, by - 1, 14, 2)
  R(c, '#7a3a2a', cx - 4, by - 5, 8, 4); R(c, '#9a4a34', cx - 4, by - 5, 8, 1); R(c, '#5a3a22', cx - 1, by - 7, 2, 2)
  for (let i = 0; i < 4; i++) { const w = 4 + i * 3; R(c, '#1f5a34', cx - w / 2, by - 25 + i * 4, w, 5); R(c, '#2f7a44', cx - w / 2 + 1, by - 25 + i * 4, w - 2, 1) }
  const cols = ['#ff5a5a', '#ffd84a', '#5ab0ff', '#f2f2f2']
  ;[[-1, -21], [2, -17], [-3, -14], [3, -11], [-5, -10], [0, -12], [5, -9]].forEach(([dx, dy], i) => R(c, cols[(i + Math.floor(now / 500)) % 4], cx + dx, by + dy))
  R(c, '#ffd84a', cx - 1, by - 28, 2, 3); R(c, '#ffd84a', cx - 2, by - 27, 4, 1)
  R(c, '#d84a4a', cx + 6, by - 4, 5, 4); R(c, '#f2c14e', cx + 8, by - 4, 1, 4)
  R(c, '#4a8ad8', cx - 11, by - 3, 5, 3); R(c, '#e8e8f0', cx - 9, by - 3, 1, 3)
}
function gift(c, cx, by, seed) {
  const col = ['#c8303a', '#3a7ab8', '#3f8a4a'][seed % 3]
  R(c, 'rgba(0,0,0,.28)', cx - 4, by, 8, 1); R(c, col, cx - 4, by - 6, 8, 6); R(c, '#f2c14e', cx - 1, by - 6, 2, 6)
  R(c, '#f2c14e', cx - 3, by - 8, 2, 2); R(c, '#f2c14e', cx + 1, by - 8, 2, 2)
}
function flowers(c, cx, by, seed) {
  R(c, 'rgba(0,0,0,.28)', cx - 3, by, 7, 1); R(c, '#9a5a3a', cx - 3, by - 4, 6, 4); R(c, '#b8704a', cx - 3, by - 4, 6, 1)
  const hues = ['#ff7aa8', '#ffd84a', '#c88aff', '#ff9a5a']
  for (const [dx, h] of [[-2, 8], [0, 10], [2, 7]]) { R(c, '#4a9a3a', cx + dx, by - 4 - h + 2, 1, h - 2); R(c, hues[(seed + dx + 3) % 4], cx + dx - 1, by - 4 - h, 3, 2); R(c, '#fff3a0', cx + dx, by - 4 - h) }
}
function fan(c, cx, by, now) {
  R(c, 'rgba(0,0,0,.28)', cx - 4, by, 9, 1); R(c, '#5a6470', cx - 3, by - 2, 7, 2); R(c, '#7a8490', cx, by - 10, 1, 8)
  R(c, '#c4cad1', cx - 4, by - 18, 9, 9); R(c, '#8a949e', cx - 3, by - 17, 7, 7)
  if (Math.floor(now / 60) % 2) { R(c, '#e8eef4', cx - 3, by - 14, 7, 1); R(c, '#e8eef4', cx, by - 17, 1, 7) }
  else { R(c, '#e8eef4', cx - 2, by - 16); R(c, '#e8eef4', cx + 2, by - 12); R(c, '#e8eef4', cx + 2, by - 16); R(c, '#e8eef4', cx - 2, by - 12); R(c, '#e8eef4', cx - 1, by - 15, 3, 3) }
  R(c, '#3a424c', cx, by - 14)
}
function lantern(c, cx, y) {
  R(c, '#5a3a22', cx, y - 3, 1, 3); R(c, '#c8a24a', cx - 3, y, 6, 1)
  R(c, '#c8282a', cx - 4, y + 1, 8, 6); R(c, '#e84a3a', cx - 3, y + 1, 2, 6)
  R(c, '#c8a24a', cx - 3, y + 7, 6, 1); R(c, '#f2c14e', cx, y + 8, 1, 3)
}
function mandarin(c, cx, by) {
  R(c, 'rgba(0,0,0,.28)', cx - 4, by, 9, 1); R(c, '#c8282a', cx - 3, by - 5, 7, 5); R(c, '#f2c14e', cx - 3, by - 4, 7, 1)
  R(c, '#2f6a34', cx - 5, by - 14, 11, 9); R(c, '#3f8a44', cx - 4, by - 13, 6, 3)
  for (const [dx, dy] of [[-3, -12], [2, -11], [-1, -9], [3, -7], [-4, -8]]) R(c, '#ff9a2a', cx + dx, by + dy, 2, 2)
}
function heart(c, x, y, col) { R(c, col, x, y, 2, 1); R(c, col, x + 3, y, 2, 1); R(c, col, x - 1, y + 1, 7, 2); R(c, col, x, y + 3, 5, 1); R(c, col, x + 1, y + 4, 3, 1); R(c, col, x + 2, y + 5) }
function leaves(c, cx, by, seed) {
  const cols = ['#d8642a', '#e8a23a', '#b8402a', '#c88a2a']
  for (let i = 0; i < 7; i++) R(c, cols[(seed + i) % 4], cx - 5 + ((seed * 7 + i * 5) % 11), by - 1 - ((seed + i * 3) % 3), 2, 1)
}

function seasonal(api, tower, H, season, lit, demos) {
  const { Z } = tower
  const forcedGhost = demos.includes('ghost') || /[?&#]season=/.test(location.search + location.hash)
  // free floor spots, clear of furniture and of the other features' slots (desk-kit's floorSlot, the reception)
  function spots() {
    const out = [], I = tower.interior
    for (const f of tower.floors) {
      if (f.kind === 'session') out.push({ x: I.x0 + 83, y: f.y, k: 0 }, { x: I.x1 - 33, y: f.y, k: 1 })
      else if (f.kind === 'lobby') out.push({ x: I.x0 + 44, y: f.y, k: 2, big: true, lobby: true }, { x: I.x0 + 182, y: f.y, k: 3 })
      else if (f.kind === 'cafe') out.push({ x: I.x0 + 151, y: f.y - 13, k: 4, z: Z.FRONT + 1 })
      else if (f.kind === 'meeting') out.push({ x: I.x0 + 240, y: f.y - 13, k: 5, z: Z.FRONT + 1, big: true })
      else if (f.kind === 'ceo') out.push({ x: I.x0 + 251, y: f.y, k: 6, big: true })
      else if (f.kind === 'roof') out.push({ x: I.x0 + 164, y: f.y - 3, k: 7, big: true, out: true }, { x: I.x0 + 272, y: f.y - 3, k: 8, out: true })
    }
    out.push({ x: -13, y: 0, k: 9, big: true, out: true }, { x: -22, y: 0, k: 10, out: true })
    for (const b of tower.street.buildings || []) out.push({ x: b.x0 + b.w / 2 + 27, y: 0, k: api.hash(b.e.login) % 7, big: api.hash(b.e.login) % 2 === 0, out: true })
    return out
  }
  const claimed = (p, h) => !!h && ((h.lobby && p.lobby) || (h.door && (p.k === 9 || p.k === 10) && p.y === 0 && p.x < 0))
  function deco(c, s, p, now) {
    if (s === 'halloween') pumpkin(c, p.x, p.y, !!p.big, lit(), now)
    else if (s === 'christmas') { if (p.lobby) tree(c, p.x, p.y, now); else gift(c, p.x, p.y, p.k) }
    else if (s === 'spring') flowers(c, p.x, p.y, p.k)
    else if (s === 'summer') { if (p.out || p.z) flowers(c, p.x, p.y, p.k); else fan(c, p.x, p.y, now) }
    else if (s === 'autumn') { leaves(c, p.x, p.y, p.k); if (p.k % 2) pumpkin(c, p.x + 4, p.y, false, false, now) }
    else if (s === 'lunar') mandarin(c, p.x, p.y)
    else if (s === 'valentine') { const bob = Math.round(Math.sin(now / 800 + p.k)); R(c, '#7a7a8a', p.x - 1, p.y - 2, 3, 2); R(c, 'rgba(240,240,250,.6)', p.x, p.y - 12 + bob, 1, 10 - bob); heart(c, p.x - 2, p.y - 18 + bob, p.k % 2 ? '#ff5a8a' : '#e8304a') }
  }
  // strands: along the roof railing, down the street-facing wall to the awning, and under the awning
  const COLS = { halloween: ['#ff8a2a', '#a85ae8'], christmas: ['#ff4a4a', '#4ad86a', '#ffd84a', '#4aa8ff'], spring: ['#ff9ac8', '#fff08a', '#9ae8c8', '#c8aaff'], summer: ['#ff5a5a', '#ffd84a', '#4ab0ff', '#5ad87a'], autumn: ['#d8642a', '#e8a23a', '#b8402a'], valentine: ['#ff5a8a', '#d8304a'] }
  const BULBS = new Set(['halloween', 'christmas'])
  function bulbs() {
    const roof = tower.floors[tower.floors.length - 1], out = [], wire = []
    for (let x = 1; x < BW - 1; x++) { const t = (x % 22) / 22, y = roof.y - 17 + Math.round(3 * Math.sin(Math.PI * t)); wire.push([x, y]); if (x % 11 === 5) out.push([x, y + 1]) }
    for (let y = roof.y + 4; y < -54; y++) { const x = 4 + Math.round(1.5 * Math.sin(y / 9)); wire.push([x, y]); if (((y - roof.y) % 12) === 6) out.push([x, y + 1]) }
    for (let x = -29; x < 4; x++) { wire.push([x, -46]); if ((x + 29) % 7 === 3) out.push([x, -45]) }
    return { out, wire }
  }
  function strand(c, s, now, glow) {
    const cols = COLS[s]; if (!cols) return
    const { out, wire } = bulbs()
    if (!glow) for (const [x, y] of wire) R(c, s === 'spring' || s === 'valentine' ? 'rgba(232,224,208,.8)' : '#2a2630', x, y)
    out.forEach(([x, y], i) => {
      const col = cols[i % cols.length], on = (i + Math.floor(now / 900)) % 6 !== 0
      if (BULBS.has(s)) {
        if (glow) { if (on) pool(c, x + 0.5, y + 2, 6, hex(col), 0.55) }
        else { R(c, '#1a1a1a', x, y); R(c, on ? col : '#3a3a44', x - 1, y + 1, 3, 3) }
      } else if (!glow) { c.fillStyle = col; c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x + 3, y); c.lineTo(x + 0.5, y + 5); c.fill() }
    })
  }
  const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)).join(',')
  function lanterns() {
    const roof = tower.floors[tower.floors.length - 1], out = []
    for (let x = 22; x < BW - 10; x += 44) out.push([x, roof.y - 16])
    out.push([-24, -45], [-4, -45])
    return out
  }
  function cobwebs() {
    const out = [], I = tower.interior
    for (const f of tower.floors) {
      if (f.kind === 'roof') continue
      const h = api.hash('web' + f.id)
      if (f.kind === 'server' || h % 3 !== 1) out.push([I.x0, f.top + 2, 1])
      if (f.kind === 'server' || h % 3 !== 0) out.push([I.x1, f.top + 2, -1])
    }
    return out
  }

  H.items.push((out, now) => {
    const s = season(); if (s === 'none' || !tower.floors.length) return
    const hol = holidayOf(today())
    for (const p of spots()) if (!claimed(p, hol)) out.push({ z: p.z ?? Z.FLOOR, draw: c => deco(c, s, p, now) })
    if (!hol?.strand) out.push({ z: Z.OUTSIDE + 2, draw: c => strand(c, s, now, false) })
    if (s === 'lunar') out.push({ z: Z.OUTSIDE + 2, draw: c => { for (const [x, y] of lanterns()) lantern(c, x, y) } })
    if (s === 'winter' || s === 'christmas') out.push({ z: Z.OUTSIDE + 1, draw: c => {   // snow on the awning and the roof railing
      R(c, '#f4f8ff', -30, -52, 34, 2)
      const roof = tower.floors[tower.floors.length - 1]; R(c, '#f4f8ff', 0, roof.y - 20, BW, 2)
      for (const b of tower.street.buildings || []) R(c, '#f4f8ff', b.x0 - 2, -b.h - 5, b.w + 4, 2)
    } })
    if (s !== 'halloween') return
    for (const [x, y, d] of cobwebs()) out.push({ z: Z.WALL - 1, draw: c => cobweb(c, x, y, d, now) })
    // bats around the roof, more once it is dark
    const roof = tower.floors[tower.floors.length - 1], n = lit() ? 4 : 2
    out.push({ z: Z.OUTSIDE + 5, draw: c => {
      for (let i = 0; i < n; i++) {
        const x = BW / 2 + (BW / 2 + 30) * Math.sin(now / (6100 + i * 1900) + i * 2.1), y = roof.y - 64 + 10 * Math.sin(now / 900 + i) + 18 * Math.cos(now / 2600 + i * 3)
        bat(c, Math.round(x), Math.round(y), Math.floor(now / 110 + i) % 2)
      }
    } })
    // now and then a ghost drifts up the elevator shaft, from the lobby to the machine room
    const g = ghostAt(now)
    if (g) out.push({ z: Z.RIDE + 5, draw: c => ghost(c, g.x, g.y, now, g.a) })
  })
  function ghostAt(now) {
    const P = forcedGhost ? 12000 : 70000, t = (now % P) / 10000
    if (t >= 1) return null
    const roof = tower.floors[tower.floors.length - 1], y0 = -8, y1 = roof.y - 14
    return { x: Math.round(BW + SHAFT / 2 + 4 * Math.sin(now / 700)), y: Math.round(y0 + (y1 - y0) * t), a: (0.5 + 0.25 * night()) * Math.min(1, t * 8, (1 - t) * 8) }
  }
  const night = () => lit() ? 1 : 0
  H.glow.push((c, now, n) => {
    const s = season(); if (s === 'none' || n < 0.05) return
    c.globalAlpha = Math.min(1, n * 1.2)
    const hol = holidayOf(today())
    if (!hol?.strand) strand(c, s, now, true)
    if (s === 'halloween' && lit()) {
      const fl = 0.85 + 0.15 * Math.sin(now / 120)
      for (const p of spots()) pool(c, p.x, p.y - 3, p.big ? 13 : 10, '255,160,50', 0.5 * fl)
      const g = ghostAt(now); if (g) pool(c, g.x, g.y - 6, 14, '200,210,255', 0.25 * g.a)
    }
    if (s === 'lunar') for (const [x, y] of lanterns()) pool(c, x, y + 4, 11, '255,90,60', 0.5)
    if (s === 'christmas') for (const p of spots()) if (p.lobby && !claimed(p, hol)) pool(c, p.x, p.y - 14, 22, '255,220,140', 0.4)
    c.globalAlpha = 1
  })
}

// ===================== LED ticker over the lobby's reception =====================
const GLYPH = {
  A: '7e1111117e', B: '7f49494936', C: '3e41414122', D: '7f4141221c', E: '7f49494941', F: '7f09090901', G: '3e4149497a', H: '7f0808087f',
  I: '00417f4100', J: '2040413f01', K: '7f08142241', L: '7f40404040', M: '7f020c027f', N: '7f0408107f', O: '3e4141413e', P: '7f09090906',
  Q: '3e4151215e', R: '7f09192946', S: '4649494931', T: '01017f0101', U: '3f4040403f', V: '1f2040201f', W: '3f4038403f', X: '6314081463',
  Y: '0708700807', Z: '6151494543', 0: '3e5149453e', 1: '00427f4000', 2: '4261514946', 3: '2141454b31', 4: '1814127f10', 5: '2745454539',
  6: '3c4a494930', 7: '0171090503', 8: '3649494936', 9: '064949291e', ' ': '0000000000', '.': '0060600000', ',': '0050300000',
  ':': '0036360000', '-': '0808080808', '/': '2010080402', _: '4040404040', '#': '147f147f14', '!': '00005f0000', '?': '0201510906',
  '(': '001c224100', ')': '0041221c00', '+': '08083e0808', '=': '1414141414', '@': '3249794136', '*': '14083e0814', "'": '0000070000',
  '"': '0007000700', '>': '4122140800', '<': '0814224100', '&': '3649552250', '%': '2313086462', '~': '0804081008', '|': '00007f0000', '·': '0000080000',
}
function ticker(api, tower, H) {
  const AMBER = '#ffb347', DIM = '#7a4a2a', SPEED = 20
  let feed = [], strip = null, off = 0
  const clean = s => String(s ?? '').normalize('NFKD').replace(/[^\x20-\x7e]/g, '').replace(/\s+/g, ' ').trim().toUpperCase()
  function build() {
    const segs = feed.length ? feed.slice(0, 5).flatMap(it => {
      const tool = clean(api.toolLabel(it.tool)), d = clean(it.detail)
      return [[clean(it.who) + ': ', `hsl(${api.hash(it.session) % 360} 85% 68%)`], [tool + (d ? ' ' + (d.length > 34 ? d.slice(0, 33) + '~' : d) : ''), AMBER], ['   ·   ', DIM]]
    }) : [['AGENTOPOLIS   ·   ALL QUIET   ·   ', AMBER]]
    const n = segs.reduce((m, [t]) => m + t.length, 0), cv = document.createElement('canvas')
    cv.width = Math.max(1, n * 6); cv.height = 7
    const c = cv.getContext('2d')
    let x = 0
    for (const [t, col] of segs) for (const ch of t) {
      const g = GLYPH[ch] ?? GLYPH['?']; c.fillStyle = col
      for (let k = 0; k < 5; k++) { const b = parseInt(g.slice(k * 2, k * 2 + 2), 16); for (let r = 0; r < 7; r++) if (b >> r & 1) c.fillRect(x + k, r, 1, 1) }
      x += 6
    }
    strip = cv; off = 0
  }
  H.sync.push(data => { feed = data.ticker || []; if (!strip) build() })
  H.step.push(dt => { const t = tower.facade?.ticker; if (!t || !strip) return; off += SPEED * dt; if (off > strip.width + t.w) build() })
  const panel = t => ({ x: t.x + 7, y: t.y + Math.floor((t.h - 7) / 2), w: t.w - 10, h: 7 })
  function draw(c, t, now) {   // a bronze-framed strip like the floor plaques, on two fine rods from the ceiling
    R(c, '#4a4452', t.x + 12, t.y - 15, 1, 15); R(c, '#4a4452', t.x + t.w - 13, t.y - 15, 1, 15)
    R(c, 'rgba(0,0,0,.18)', t.x + 1, t.y + t.h, t.w - 1, 1)
    R(c, '#1f1712', t.x, t.y, t.w, t.h); R(c, '#a8844a', t.x + 1, t.y, t.w - 2, 1); R(c, '#6a5030', t.x + 1, t.y + t.h - 1, t.w - 2, 1)
    const p = panel(t)
    R(c, '#120c08', p.x - 1, p.y - 1, p.w + 2, p.h + 2)
    c.fillStyle = '#22160e'; for (let y = 0; y < 7; y++) for (let x = (y % 2); x < p.w; x += 2) c.fillRect(p.x + x, p.y + y, 1, 1)
    R(c, Math.floor(now / 700) % 2 ? '#ff4a3a' : '#5a1a14', t.x + 3, p.y + 2, 2, 2)                                 // the LIVE lamp
    text(c, p)
  }
  function text(c, p) {
    if (!strip) return
    c.save(); c.beginPath(); c.rect(p.x, p.y, p.w, 7); c.clip()
    c.drawImage(strip, Math.round(p.x + p.w - off), p.y); c.restore()
  }
  H.items.push((out, now) => { const t = tower.facade?.ticker; if (t) out.push({ z: Z_WALL(tower), draw: c => draw(c, t, now) }) })
  H.glow.push((c, now, n) => {
    const t = tower.facade?.ticker; if (!t || n < 0.03) return
    const p = panel(t)
    c.globalAlpha = Math.min(1, n); text(c, p)
    c.globalAlpha = n * 0.5; pool(c, p.x + p.w / 2, p.y + 3, p.w / 2, '255,170,70', 0.18); c.globalAlpha = 1
  })
  const ago = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h' }
  H.hover.push(w => {
    const t = tower.facade?.ticker; if (!t || !inR(w, t)) return null
    const esc = api.esc, rows = feed.slice(0, 7).map(it => `<div><i class="s" style="background:hsl(${api.hash(it.session) % 360} 55% 62%)"></i><b>${esc(it.who)}</b> ${esc(api.toolLabel(it.tool))}${it.detail ? ' <span class="m">' + esc(it.detail.slice(0, 60)) + '</span>' : ''} <span class="m">${ago(it.t)}</span></div>`).join('')
    return `<div class="t">LIVE · latest tool calls</div>${rows || '<div class="m">all quiet</div>'}`
  })
}
const Z_WALL = tower => tower.Z.WALL

// ===================== the street's GitHub life =====================
const EMOTE = { push: '⬆', review: '💬', comment: '💬', merged: '✓', opened: '✚', ready: '✚' }
const READ_KEY = 'github-street:read', FLASH_MS = 9000
function street(api, tower, H, demos) {
  const { Z } = tower, demo = demos.includes('street'), demoStand = demos.includes('gazette-stand')
  let st = null, primed = false, n = 0, demoAt = 0, flown = false
  const seen = new Set(), arrived = new Set(), emotes = [], couriers = [], demoMail = []
  let read = new Set(), mailHover = false
  try { read = new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')) } catch {}
  const saveRead = () => { try { localStorage.setItem(READ_KEY, JSON.stringify([...read].slice(-300))) } catch {} }
  const buildings = () => tower.street.buildings || []
  const bOf = login => buildings().find(b => b.e.login === login)
  const doorX = b => b.x0 + b.w / 2 + 13

  // ---------- data ----------
  let paper = null, lastHead = null, flashAt = -1e9
  H.sync.push(snap => {
    const g = snap.gazette
    if (g) { const h = g.headline?.title; if (lastHead !== null && h !== lastHead) flashAt = performance.now(); lastHead = h; paper = g }
    if (demoStand && !flown && tower.lobby) { flown = true; tower.flyTo({ x: -60, y: -20 }, 6); setTimeout(() => { flashAt = performance.now() }, 900) }
    st = snap.street
    if (!st || st.status !== 'ok') return
    if (!primed) {
      for (const ev of st.events) seen.add(ev.id)
      for (const m of st.forMe) { seen.add(m.id); if (m.kind === 'request') arrived.add(m.id) }
      primed = true
    } else {
      for (const ev of st.events) if (!seen.has(ev.id)) { seen.add(ev.id); onEvent(ev) }
      for (const m of st.forMe) if (!seen.has(m.id)) { seen.add(m.id); if (!m.bot) sendCourier(m.who, 'office', m.id) }
    }
    if (demo && !demoAt && buildings().length) { demoAt = performance.now() + 1500; tower.flyTo({ x: -150, y: -50 }, 2.4) }
  })
  function onEvent(ev) {
    if (ev.bot) { if (ev.target && ev.target === st.me) sendCourier(ev.actor, 'office', null); else if (bOf(ev.target)) sendCourier(ev.actor, ev.target, null) }
    else if (EMOTE[ev.type] && bOf(ev.actor)) emotes.push({ login: ev.actor, glyph: EMOTE[ev.type], t0: performance.now() })
  }

  // ---------- couriers: walk the sidewalk to a door (or the user's mailbox), wait, walk back ----------
  function sendCourier(login, dest, envelope) {
    if (couriers.length > 8 || !tower.lobby) return
    const b = dest === 'office' ? null : bOf(dest)
    if (dest !== 'office' && !b) return
    const tx = b ? doorX(b) : tower.lobby.mailbox.x - 8, from = !b || b.x0 < 0 ? tx - 520 : tx + 520
    const kind = /^coderabbit/i.test(login) ? 'rabbit' : /^linear/i.test(login) ? 'orb' : /\[bot\]$|^Copilot$/i.test(login) ? 'robot' : 'person'
    const cr = { login, kind, envelope, tx, from, phase: 'in', wait: 0 }
    const busy = couriers.filter(c => c.tx === tx && c.phase === 'in').length
    cr.npc = tower.spawn({ id: `courier${++n}`, floor: 'lobby', x: from + (from < tx ? -1 : 1) * busy * 26, z: Z.WALK, ...(kind === 'person' ? { look: api.lookOf(login) } : { draw: (c, p, now) => drawBot(c, cr, p, now) }) })
    cr.npc.go('lobby', tx, { face: from < tx ? 'right' : 'left', then: () => { cr.phase = 'wait'; cr.wait = 1.8; if (cr.envelope) { arrived.add(cr.envelope); cr.envelope = 'delivered' } } })
    couriers.push(cr)
  }
  H.step.push((dt, now) => {
    if (demo && demoAt && now > demoAt) { demoAt = now + 24000; demoBurst() }
    for (let i = emotes.length - 1; i >= 0; i--) if (now - emotes[i].t0 > 4000) emotes.splice(i, 1)
    for (let i = couriers.length - 1; i >= 0; i--) {
      const cr = couriers[i]
      if (cr.npc.gone) { couriers.splice(i, 1); continue }
      if (cr.phase === 'wait' && (cr.wait -= dt) <= 0) { cr.phase = 'out'; cr.npc.go('lobby', cr.from, { then: () => cr.npc.remove() }) }
    }
  })
  function drawBot(c, cr, p, now) {
    c.translate(Math.round(p.x), Math.round(p.y) - 6)
    R(c, 'rgba(0,0,0,.25)', -4, 5, 9, 2)
    const walking = p.walking
    if (p.dir === 'left') c.scale(-1, 1)
    if (cr.kind === 'rabbit') rabbit(c, walking ? -Math.abs(Math.sin(now / 110)) * 3 : 0)
    else if (cr.kind === 'orb') orb(c, Math.sin(now / 260) * 1.5)
    else robot(c, now, walking, /github-actions/.test(cr.login) ? '#9aa3ad' : '#5ec4b8')
  }
  function envelope(c, x, y) {
    R(c, '#a89f86', x - 4, y + 1, 9, 6); R(c, '#fbf6e6', x - 5, y, 9, 6)
    R(c, '#c9bfa5', x - 4, y + 1); R(c, '#c9bfa5', x - 3, y + 2, 2, 1); R(c, '#c9bfa5', x, y + 2, 2, 1); R(c, '#c9bfa5', x + 2, y + 1)
    R(c, '#c64545', x - 1, y + 3, 2, 2)
  }

  // ---------- the mailbox and the Gazette stand by the door ----------
  const envelopes = () => [...(st?.forMe || []), ...demoMail].filter(m => !m.bot && arrived.has(m.id) && !read.has(m.id))
  function drawMailbox(c, now) {
    const m = tower.lobby.mailbox, mail = envelopes().length
    R(c, '#5a5f6a', m.x + m.w, m.y + 8, 1, 10)                                            // the flag's post
    if (mail) { R(c, '#d8383a', m.x + m.w + 1, m.y + 6, 4, 3); R(c, '#fbf6e6', m.x + 3, m.y + 6, 6, 2); R(c, '#c64545', m.x + 5, m.y + 6, 2, 1) }
    else R(c, '#8a3a3a', m.x + m.w + 1, m.y + 15, 4, 2)
    if (mail && mailHover) { c.strokeStyle = '#ffd84a'; c.lineWidth = 1; c.strokeRect(m.x - 1.5, m.y - 1.5, m.w + 3, m.h + 2) }
  }
  const fresh = () => performance.now() - flashAt < FLASH_MS
  function drawStand(c, now) {
    const b = tower.lobby.newsBox, on = fresh() && Math.floor(now / 350) % 2 === 0
    R(c, on ? '#fff8d0' : '#f4f0e6', b.x + 3, b.y + 6, 10, 6); R(c, '#333', b.x + 4, b.y + 7, 8, 1); R(c, '#b8402f', b.x + 4, b.y + 9, 5, 1); R(c, '#777', b.x + 4, b.y + 10, 7, 1)
    if (fresh()) { c.strokeStyle = on ? '#ffd84a' : 'rgba(255,216,74,.4)'; c.lineWidth = 1; c.strokeRect(b.x - 0.5, b.y - 0.5, b.w + 1, b.h + 1) }
  }
  H.items.push((out, now) => {
    if (!tower.lobby) return
    out.push({ z: Z.FLOOR + 2, draw: c => { drawMailbox(c, now); if (paper) drawStand(c, now) } })
    for (const cr of couriers) if (cr.kind === 'person' && cr.envelope && cr.envelope !== 'delivered' && !cr.npc.gone) out.push({ z: Z.WALK + 1, draw: c => envelope(c, Math.round(cr.npc.x), Math.round(cr.npc.y) - 36) })
    for (const cr of couriers) if (cr.kind !== 'person' && cr.envelope && cr.envelope !== 'delivered' && !cr.npc.gone) out.push({ z: Z.WALK + 1, draw: c => envelope(c, Math.round(cr.npc.x), Math.round(cr.npc.y) - 24) })
  })
  H.glow.push((c, now, k) => {
    if (!tower.lobby || k < 0.05) return
    if (fresh()) { const b = tower.lobby.newsBox; pool(c, b.x + b.w / 2, b.y + 8, 16, '255,220,120', 0.5 * k) }
    if (envelopes().length) { const m = tower.lobby.mailbox; pool(c, m.x + m.w + 3, m.y + 7, 6, '255,90,80', 0.5 * k) }
  })

  // ---------- text: emotes over the roofs, the mail count, the headline while the stand flashes ----------
  H.overlay.push((v, now) => {
    const k = tower.zoom, t = performance.now()
    v.textAlign = 'center'; v.textBaseline = 'middle'
    for (const em of emotes) {
      const b = bOf(em.login); if (!b) continue
      const p = (t - em.t0) / 4000, a = p < 0 ? 0 : p < 0.15 ? p / 0.15 : 1 - Math.max(0, (p - 0.6) / 0.4)
      const s = tower.worldToScreen(b.x0 + b.w / 2, -b.h - 30 - Math.max(0, p) * 16), r = Math.max(10, 5 * k)
      if (s.x < -40 || s.x > tower.canvas.clientWidth + 40) continue
      s.y = Math.max(s.y, 70 - Math.max(0, p) * 16)                              // a roof above the view: pin it to the top
      v.globalAlpha = Math.max(0, a)
      v.fillStyle = 'rgba(0,0,0,.3)'; v.beginPath(); v.arc(s.x + 2, s.y + 3, r, 0, Math.PI * 2); v.fill()
      v.fillStyle = '#fbfaf4'; v.beginPath(); v.arc(s.x, s.y, r, 0, Math.PI * 2); v.fill()
      v.beginPath(); v.moveTo(s.x - r * 0.3, s.y + r * 0.8); v.lineTo(s.x, s.y + r * 1.35); v.lineTo(s.x + r * 0.3, s.y + r * 0.8); v.fill()
      v.fillStyle = em.glyph === '✓' ? '#2f9a4a' : em.glyph === '⬆' ? '#2f6fb0' : '#1b1c26'
      v.font = `700 ${Math.round(r * 1.15)}px ui-monospace, Menlo, "Apple Color Emoji", sans-serif`; v.fillText(em.glyph, s.x, s.y + 1)
      v.globalAlpha = 1
    }
    const mail = envelopes().length
    if (mail && tower.lobby) {
      const m = tower.lobby.mailbox, s = tower.worldToScreen(m.x + m.w + 3, m.y - 1), r = Math.max(6, 2.6 * k)
      v.fillStyle = '#c64545'; v.beginPath(); v.arc(s.x, s.y, r, 0, Math.PI * 2); v.fill()
      v.fillStyle = '#fff'; v.font = tower.font(Math.max(9, r * 1.3), 700); v.fillText(String(mail), s.x, s.y + 0.5)
    }
    v.textAlign = 'left'
    if (fresh() && paper && tower.lobby) {
      const b = tower.lobby.newsBox, s = tower.worldToScreen(b.x + b.w / 2, b.y - 2), h = paper.headline
      tower.bubble(s.x, s.y, `📰 ${h?.kicker ? h.kicker + ': ' : ''}${tower.fitText(h?.title || 'a new edition', 260, tower.font(12))}`, '#b8402f')
    }
  })

  // ---------- hover and click ----------
  const esc = api.esc, verb = m => m.kind === 'request' ? 'requested your review on' : m.kind === 'review' ? 'reviewed' : 'commented on'
  const markRead = () => { for (const m of envelopes()) read.add(m.id); saveRead() }
  H.hover.push((w, person) => {
    const over = !person && tower.lobby && envelopes().length && inR(w, tower.lobby.mailbox, 3)
    if (mailHover && !over) markRead()
    mailHover = !!over
    if (person || !tower.lobby) return null
    if (over) return '<div class="t">✉ Mail for you</div>' + envelopes().slice(0, 8).map(m => `<div><b>${esc(m.who)}</b> ${verb(m)} <span class="m">#${m.pr}</span> ${esc((m.title || '').slice(0, 60))}</div>`).join('') + '<div class="m">↗ click to open your review requests</div>'
    if (paper && inR(w, tower.lobby.newsBox, 2)) { const h = paper.headline || {}; return `<div class="t">📰 The Gazette · No. ${paper.edition ?? ''}</div><div><b>${esc(h.kicker || '')}</b> ${esc(h.title || '')}</div>${h.deck ? `<div class="m">${esc(h.deck)}</div>` : ''}<div class="m">${api.gazette?.open ? '↗ click to read the paper' : 'the paper is not printed yet'}</div>` }
    return null
  })
  H.click.push((w, person) => {
    if (person || !tower.lobby) return false
    if (envelopes().length && inR(w, tower.lobby.mailbox, 3)) {
      markRead()
      const repo = st?.repo; if (repo) api.openLink(`https://github.com/${repo}/pulls?q=is%3Apr+is%3Aopen+review-requested%3A${encodeURIComponent(st.me || '@me')}`)
      return true
    }
    if (paper && inR(w, tower.lobby.newsBox, 2)) {
      if (!api.gazette?.open(paper)) { flashAt = performance.now(); api.toast(`📰 ${paper.headline?.title || 'The Gazette'}`, 4000) }
      return true
    }
    return false
  })

  // ---------- demo ----------
  function demoBurst() {
    const b = [...buildings()].sort((p, q) => Math.abs(p.x0) - Math.abs(q.x0)); if (!b.length) return
    sendCourier('coderabbitai[bot]', b[0].e.login, null)
    if (b[2]) setTimeout(() => sendCourier('linear[bot]', b[2].e.login, null), 1500)
    setTimeout(() => sendCourier('github-actions[bot]', 'office', null), 3000)
    const t = performance.now()
    emotes.push({ login: b[1 % b.length].e.login, glyph: '⬆', t0: t })
    if (b[3]) emotes.push({ login: b[3].e.login, glyph: '💬', t0: t + 600 })
    if (b[4]) emotes.push({ login: b[4].e.login, glyph: '✓', t0: t + 1200 })
    const who = b[1 % b.length].e, id = 'demo:' + Date.now()
    demoMail.push({ id, kind: 'request', who: who.login, bot: false, pr: who.prs[0]?.n || 1234, title: who.prs[0]?.title || 'a demo PR', at: Date.now() })
    sendCourier(who.login, 'office', id)
    flashAt = t
  }
}
function rabbit(c, hop) {
  c.translate(0, hop)
  R(c, '#f2efe6', -5, -2, 8, 6); R(c, '#f2efe6', 2, -6, 5, 5); R(c, '#f2efe6', 3, -11, 1, 5); R(c, '#f2efe6', 5, -11, 1, 5)
  R(c, '#f2a0a8', 3, -10, 1, 3); R(c, '#d8d3c6', -5, 3, 8, 1); R(c, '#d8d3c6', -6, -1, 2, 2); R(c, '#2a2a33', 5, -4)
  R(c, '#f29a4e', 7, -2, 3, 1); R(c, '#5fd17a', 10, -3); R(c, '#d8d3c6', -4, 4, 2, 2); R(c, '#d8d3c6', 1, 4, 2, 2)
}
function orb(c, bob) {
  c.fillStyle = 'rgba(160,110,255,.25)'; c.beginPath(); c.arc(0, -7 + bob, 8, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#5e45c2'; c.beginPath(); c.arc(0, -7 + bob, 5, 0, Math.PI * 2); c.fill()
  c.fillStyle = '#8f78f0'; c.beginPath(); c.arc(-1, -8 + bob, 3, 0, Math.PI * 2); c.fill()
  R(c, '#e6deff', -2, -10 + bob, 2, 2)
}
function robot(c, now, walking, body) {
  const leg = walking ? Math.floor(now / 150) % 2 : 0
  R(c, '#3a3d45', -3, 2, 2, 4 - leg); R(c, '#3a3d45', 1, 2, 2, 3 + leg)
  R(c, body, -4, -5, 8, 7); R(c, '#3a3d45', -4, -5, 8, 1); R(c, body, -3, -10, 6, 5); R(c, '#1b1c26', -2, -9, 4, 2)
  R(c, '#7bf3ff', Math.floor(now / 400) % 2 ? -1 : 0, -9, 2, 1); R(c, '#3a3d45', 0, -12, 1, 2); R(c, '#ffd84a', 0, -13)
  R(c, '#3a3d45', -1, -3, 2, 2)
  if (Math.floor(now / 200) % 2) { R(c, '#3a3d45', -2, -3); R(c, '#3a3d45', 1, -2) } else { R(c, '#3a3d45', 0, -4); R(c, '#3a3d45', -1, -1) }
}

// ===================== soundscape =====================
// soundscape.js owns the button, the setting and the AudioContext (api.soundscape); the voices are made here.
const READING = /^(Read|Grep|Glob|WebFetch|WebSearch|ToolSearch)$|^mcp__|claude-in-chrome/
function sound(api, tower) {
  let ctx = null, master = null, noise = null
  const level = () => api.soundscape?.level() ?? 0
  const counts = { keys: 0, clink: 0, thock: 0, clack: 0, ding: 0, bleep: 0, lift: 0 }
  function graph() {
    if (master || !ctx) return
    master = ctx.createGain(); master.gain.value = 0.0001; master.connect(api.soundscape.out || ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate * 4, ctx.sampleRate)
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const brown = ctx.createBuffer(1, ctx.sampleRate * 6, ctx.sampleRate), b = brown.getChannelData(0)
    let last = 0; for (let i = 0; i < b.length; i++) { last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = last * 3.5 }
    const src = ctx.createBufferSource(); src.buffer = brown; src.loop = true
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 240
    const room = ctx.createGain(); room.gain.value = 0.05
    src.connect(lp).connect(room).connect(master); src.start()
  }
  const out = pan => { const p = ctx.createStereoPanner(); p.pan.value = pan; p.connect(master); return p }
  const env = (g, at, peak, a, d) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + d) }
  function key(at, pan, v) {
    const s = ctx.createBufferSource(); s.buffer = noise
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1800 + Math.random() * 2200; bp.Q.value = 1.4
    const g = ctx.createGain(); env(g, at, (0.05 + Math.random() * 0.03) * v, 0.002, 0.035)
    s.connect(bp).connect(g).connect(out(pan)); s.start(at, Math.random() * 3.5, 0.06); counts.keys++
  }
  function tone(at, pan, list, type = 'sine') {
    for (const [f, len, v] of list) { const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.value = f * (0.98 + Math.random() * 0.04); env(g, at, v, 0.003, len); o.connect(g).connect(out(pan)); o.start(at); o.stop(at + len + 0.05) }
  }
  const clink = (at, pan, v) => { tone(at, pan, [[2093, 0.5, 0.02 * v], [3322, 0.35, 0.012 * v], [4870, 0.22, 0.008 * v]]); counts.clink++ }
  function thock(at, pan, v, f = 170, peak = 0.07, cut = 600, name = 'thock') {
    const o = ctx.createOscillator(), g = ctx.createGain(), lp = ctx.createBiquadFilter()
    o.type = 'triangle'; o.frequency.setValueAtTime(f * 1.6, at); o.frequency.exponentialRampToValueAtTime(f, at + 0.03)
    lp.type = 'lowpass'; lp.frequency.value = cut; env(g, at, peak * v, 0.003, 0.1)
    o.connect(lp).connect(g).connect(out(pan)); o.start(at); o.stop(at + 0.2); counts[name]++
  }
  const clack = (at, pan, v) => thock(at, pan, v, 1400, 0.03, 3200, 'clack')      // pool balls
  const ding = (at, pan, v) => { tone(at, pan, [[1568, 0.25, 0.012 * v], [2349, 0.18, 0.006 * v]]); counts.ding++ }     // pinball bumper
  const bleep = (at, pan, v) => { [0, 0.07, 0.14].forEach((d, i) => tone(at + d, pan, [[660 * [1, 1.25, 1.5][i], 0.05, 0.006 * v]], 'square')); counts.bleep++ }
  const lift = (at, pan, v) => { tone(at, pan, [[1319, 0.7, 0.014 * v]]); tone(at + 0.18, pan, [[1047, 0.9, 0.012 * v]]); counts.lift++ }

  const panAt = x => { const s = tower.worldToScreen(x, 0).x / Math.max(1, tower.canvas.clientWidth); return Math.max(-0.7, Math.min(0.7, s * 1.4 - 0.7)) }
  const volAt = (x, y) => { const s = tower.worldToScreen(x, y), W = tower.canvas.clientWidth, H = tower.canvas.clientHeight; return s.x > -40 && s.x < W + 40 && s.y > -40 && s.y < H + 40 ? 1 : 0.3 }
  const typists = new Map(), timers = new Map()
  let carWas = null
  const every = (id, horizon, gap, fn) => { let t = timers.get(id) ?? performance.now() + gap() * Math.random(); if (t < horizon) { fn(t); t = Math.max(t, performance.now()) + gap() } timers.set(id, t) }
  if (/[?&#]demo=towersound/.test(location.search + location.hash)) setTimeout(() => {    // fill the café's games for a minute
    const want = ['foos-l', 'foos-r', 'coffee', 'pinball0'], ps = tower.people.filter(p => !p.leaving)
    want.forEach((id, i) => { const sp = tower.spots.find(s => s.id === 'cafe:' + id), p = ps[i]; if (sp && p) { tower.sendTo(p.id, sp.floor, sp.x, { face: sp.face, anim: sp.anim, activity: sp.activity }); setTimeout(() => tower.release(p.id), 60000) } })
  }, 3000)
  setInterval(() => {
    ctx = api.soundscape?.ctx; if (!ctx) return
    const g = level()
    if (!g) { if (master) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.1); return }
    graph()
    if (ctx.state !== 'running') return
    master.gain.setTargetAtTime(g * (1 - 0.75 * (api.soundscape.duck || 0)), ctx.currentTime, 0.4)   // dips while a floor's own sounds play
    const now = performance.now(), horizon = now + 150, at = ms => ctx.currentTime + Math.max(0, ms - now) / 1000
    const people = tower.people, live = new Set()
    for (const p of people.filter(p => p.atDesk && !p.leaving && p.state === 'tool' && !READING.test(p.data?.tool || '')).slice(0, 6)) {
      live.add(p.key)
      const pan = panAt(p.x), v = volAt(p.x, p.y)
      let t = typists.get(p.key) ?? now + Math.random() * 400
      while (t < horizon) { if (t >= now - 20) key(at(t), pan, v); t += Math.random() < 0.06 ? 500 + Math.random() * 1400 : 70 + Math.random() * 160 }
      typists.set(p.key, t)
    }
    for (const k of typists.keys()) if (!live.has(k)) typists.delete(k)
    const at2 = act => people.filter(p => p.activity === act && !p.walking && !p.riding)
    const play = (act, min, id, gap, fn) => { const ps = at2(act); if (ps.length >= min) every(id, horizon, gap, t => fn(at(t), panAt(ps[0].x), volAt(ps[0].x, ps[0].y))); else timers.delete(id) }
    play('cafe:coffee', 1, 'coffee', () => 6000 + Math.random() * 9000, (t, p, v) => { clink(t, p, v); if (Math.random() < 0.3) clink(t + 0.09, p, v) })
    play('cafe:foosball', 2, 'foos', () => 280 + Math.random() * 900, (t, p, v) => thock(t, p, v))
    play('cafe:pool', 2, 'pool', () => 2500 + Math.random() * 5000, (t, p, v) => { clack(t, p, v); if (Math.random() < 0.5) clack(t + 0.12 + Math.random() * 0.2, p, v * 0.6) })
    play('cafe:pinball0', 1, 'pinball', () => 400 + Math.random() * 1600, ding)
    play('cafe:arcade0', 1, 'arcade', () => 1500 + Math.random() * 3500, bleep)
    const car = tower.car
    if (carWas === 'moving' && car.state !== 'moving' && !(api.soundscape.duck > 0.5)) lift(at(now), panAt(car.x), volAt(car.x, car.y) * 0.8)
    carWas = car.state
    const b = api.soundscape?.button; if (b) b.dataset.towerSounds = JSON.stringify(counts)
  }, 60)
}
