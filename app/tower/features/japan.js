// japan: the Japan skin (themes.js lists it and starts its decor). Its city painters (city.js) put Mt Fuji in the far
// sky — lit by the hour, akafuji at dusk, a silhouette at night, its snowcap deeper November to May — pagodas and tiled
// roofs in the far skyline, sakura street trees through the seasons, red chōchin on the lantern posts, and kawara roofs,
// shoji windows and noren on the neighbours. Its decor tiles the cornices and the roof edge, hangs a noren under the
// awning and chōchin up the shafts' outer side, and puts a torii and a stone lantern by the street.
import { BW, SHAFT, SLAB, PLAQUE } from '../building.js'
import { today, holidayOf } from './holidays.js'
import { R, rnd } from '../draw.js'

const KAWARA = '#4e556e', KAWARA_HI = '#6a728e', KAWARA_LO = '#33384c', RIDGE = '#262a3a'
const VERM = '#c4452e', VERM_LO = '#8c2e1f', VERM_HI = '#e46a4c', INK = '#1e1a1c'
const WASHI = '#f3ead6', INDIGO = '#2c3a66', INDIGO_HI = '#41548c', WOOD = '#3c2a22'
const SKY_FAR = '#aab0c8', SKY_NEAR = '#9198b4'
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))

// ---------- the season (?date= previews one) ----------
export function season(d = today()) {
  const md = (d.getMonth() + 1) * 100 + d.getDate()
  return md >= 320 && md <= 425 ? 'bloom' : md > 425 && md < 1010 ? 'green' : md >= 1010 && md <= 1205 ? 'autumn' : 'bare'
}
// how far the snow reaches down Fuji by month, of its height: a cap November to May, streaks in summer
const SNOW = [0.3, 0.31, 0.3, 0.27, 0.2, 0.08, 0.03, 0.02, 0.03, 0.08, 0.22, 0.27]

// ---------- Mt Fuji ----------
// The shape is classified once per (height, snow) into lit/mid/shaded rock, gullies and snow; each light (night,
// dusk, haze) recolours it into one image, which city.js lays under the clouds and over the sky.
const TOP = 3, PEAK_X = -300, REF_X = (BW + SHAFT) / 2, PARALLAX = 0.9
let roofY = -780                                       // the tower's roof, for Fuji's height (decor keeps it current)
const fujiH = () => Math.round(Math.max(380, Math.min(520, -roofY * 0.64)) / 20) * 20
let geo = null
function shape(Hm, S) {
  const key = Hm + '|' + S
  if (geo?.key === key) return geo
  const s = Hm / 500
  const hw = d => 24 * s + 1.15 * d + 0.0016 * d * d / s
  const bump = d => 8 * s * Math.exp(-(((d - 0.42 * Hm) / (0.05 * Hm)) ** 2))       // the Hōei crater's shoulder
  const half = Math.ceil(hw(Hm) + bump(Hm)) + 4, W = half * 2, H = Hm + TOP
  const cls = new Uint8Array(W * H)
  const G = Array.from({ length: 19 }, (_, i) => ({ k: -0.9 + i * 0.1 + (rnd(i * 3.1) - 0.5) * 0.05, d0: Hm * (0.02 + rnd(i + 7.7) * 0.05), d1: Hm * (0.3 + rnd(i + 3.3) * 0.45), a: 0.4 + rnd(i + 1.9) * 0.9 }))
  const deep = k => S * Hm * (0.9 + 0.07 * Math.sin(k * 9 + 1.3) + 0.05 * Math.sin(k * 23 + 0.4))
  const set = (x, r, v) => { const i = r * W + half + x; if (x >= -half && x < half) cls[i] = v }
  // the crater rim's two low humps over the flat summit
  for (const [d, spans] of [[-1, [[-14, -7], [5, 13]]], [-2, [[-12, -9], [7, 11]]]]) for (const [a, b] of spans) for (let x = Math.round(a * s); x <= Math.round(b * s); x++) set(x, d + TOP, S > 0.05 ? (x < 6 * s ? 5 : 6) : x < 0 ? 1 : 2)
  for (let d = 0; d < Hm; d++) {
    const wl = hw(d), wr = wl + bump(d), row = new Map()
    for (const g of G) if (d > g.d0 && d < g.d1) row.set(Math.round(g.k * (g.k < 0 ? wl : wr)), g)
    for (let x = Math.ceil(-wl); x <= Math.floor(wr); x++) {
      const k = x < 0 ? x / wl : x / wr, odd = (x + d) & 1
      const g = row.get(x), gn = g || row.get(x - 1) || row.get(x + 1)
      let sd = deep(k)
      if (gn) sd *= 1 + gn.a * (g ? 0.8 : 0.5)                               // snow lingers down the gullies
      const snow = d < sd - (d > sd - 3 && odd ? 3 : 0)
      let v
      if (snow) v = g ? 7 : k < 0.25 + (odd ? 0.05 : 0) ? 5 : 6
      else if (g) v = 4
      else v = k < -0.25 + (odd ? 0.04 : 0) ? 1 : k < 0.35 + (odd ? 0.05 : 0) ? 2 : 3
      set(x, d + TOP, v)
    }
  }
  return geo = { key, cls, W, H, half, Hm }
}
// [lit, mid, shade, gully, snow lit, snow shade, snow gully] by day, at dusk (akafuji) and at night
const DAY = [[106, 124, 168], [88, 106, 150], [70, 86, 128], [60, 74, 114], [248, 250, 253], [200, 211, 234], [178, 192, 222]]
const DUSK = [[156, 98, 118], [128, 84, 110], [100, 68, 100], [88, 60, 92], [255, 206, 178], [232, 160, 160], [210, 142, 150]]
const NIGHT = [[32, 38, 68], [27, 32, 60], [22, 27, 52], [20, 24, 46], [96, 108, 146], [74, 84, 120], [66, 76, 110]]
let img = null, imgKey = ''
function fujiImage(sky) {
  const Hm = fujiH(), S = SNOW[today().getMonth()], g = shape(Hm, S)
  const n = Math.round(sky.n * 40) / 40, w = sky.grey ? 0 : Math.round(sky.warm / 0.65 * 20) / 20, hz = sky.hz.map(v => Math.round(v / 6) * 6)
  const haze0 = sky.wet ? 0.55 : sky.grey ? 0.32 : 0
  const key = `${g.key}|${n}|${w}|${hz}|${haze0}`
  if (img && imgKey === key) return img
  imgKey = key
  const base = DAY.map((d, i) => mix(mix(d, NIGHT[i], n), DUSK[i], w * 0.8))
  const cv = img?.cv?.width === g.W && img.cv.height === g.H ? img.cv : Object.assign(document.createElement('canvas'), { width: g.W, height: g.H })
  const data = new ImageData(g.W, g.H), u = new Uint32Array(data.data.buffer), pack = ([r, gg, b]) => (255 << 24 | b << 16 | gg << 8 | r) >>> 0
  for (let r = 0; r < g.H; r++) {
    const t = Math.min(0.92, haze0 + 0.08 + 0.62 * Math.max(0, (r - TOP) / g.Hm) ** 1.6), cols = [0, ...base.map(col => pack(mix(col, hz, t)))]
    for (let x = 0, i = r * g.W; x < g.W; x++, i++) { const k = g.cls[i]; if (k) u[i] = cols[k] }
  }
  cv.getContext('2d').putImageData(data, 0, 0)
  return img = { cv, g }
}
function distant(c, v, now, sky) {
  const { cv, g } = fujiImage(sky), x = Math.round(PEAK_X + ((v.x0 + v.x1) / 2 - REF_X) * PARALLAX - g.half)
  if (x > v.x1 || x + g.W < v.x0 || -g.H > v.y1) return
  c.drawImage(cv, x, -g.H)
}

// ---------- the far skyline: tiled hip roofs on the low blocks, two pagodas ----------
function hipRoof(c, x, y, w, col, h = 6) {
  for (let r = 0; r < h; r++) R(c, col, x - 3 + r + (r === 0 ? 0 : 1), y - r - 1, w + 6 - 2 * r - (r === 0 ? 0 : 2), 1)
  R(c, col, x - 4, y - 2, 1, 1); R(c, col, x + w + 3, y - 2, 1, 1)                   // the eaves' upturned tips
}
function pagoda(c, cx, base, ht, col) {
  const tiers = 5, spire = Math.round(ht * 0.2), th = (ht - spire - 8) / tiers
  R(c, col, cx - 22, base - 8, 44, 8)
  for (let i = 0; i < tiers; i++) {
    const y = Math.round(base - 8 - i * th), bw = 26 - i * 3, ew = 46 - i * 5
    R(c, col, cx - bw / 2, y - th, bw, th)
    for (let r = 0; r < 4; r++) R(c, col, Math.round(cx - ew / 2 + r * 2 + (r ? 1 : 0)), Math.round(y - th + 3 - r), ew - r * 4 - (r ? 2 : 0), 1)
    R(c, col, Math.round(cx - ew / 2 - 1), Math.round(y - th + 1), 1, 2); R(c, col, Math.round(cx + ew / 2), Math.round(y - th + 1), 1, 2)
  }
  const top = Math.round(base - 8 - tiers * th)
  R(c, col, cx - 1, top - spire, 2, spire)
  for (let y = top - spire + 4; y < top - 2; y += 4) R(c, col, cx - 2, y, 4, 2)
  R(c, col, cx - 2, top - spire - 2, 4, 3)
}
function skyline(c, blocks) {
  for (const b of blocks) if (b.h < 160 && b.w > 40 && (b.x * 7 + b.h) % 3) hipRoof(c, b.x + 2, b.y, b.w - 4, b.far ? SKY_FAR : SKY_NEAR, 5 + (b.w > 70 ? 2 : 0))
  const out = []
  for (const [x, ht] of [[310, 206], [1010, 176]]) { pagoda(c, x, 260, ht, SKY_NEAR); out.push([x - 24, x + 24]) }
  return out
}

// ---------- street: sakura trees through the year, chōchin on the lantern posts ----------
const LEAVES = {
  bloom: ['#fde4ec', '#f7c0d2', '#f0a2bc', '#e2869f'], green: ['#78ae5c', '#5a9448', '#457a3a', '#2f5e2e'],
  autumn: ['#f2b04a', '#e8803a', '#d4542e', '#9e3424'],
}
const trees = new Map()
function treeSprite(sea) {
  if (trees.has(sea)) return trees.get(sea)
  const cv = Object.assign(document.createElement('canvas'), { width: 34, height: 46 }), c = cv.getContext('2d'), bark = '#4a3028', barkHi = '#6a4636'
  R(c, 'rgba(0,0,0,.25)', 8, 45, 18, 1)
  R(c, bark, 16, 28, 3, 18); R(c, barkHi, 16, 30, 1, 14); R(c, bark, 15, 42, 5, 3)
  // limbs, then twigs fanning out of them
  const limb = (x, y, dx, dy, n) => { for (let i = 0; i <= n; i++) R(c, bark, Math.round(x + dx * i / n), Math.round(y + dy * i / n), i < n / 2 ? 2 : 1, 1) }
  limb(17, 29, -10, -9, 10); limb(17, 29, 9, -10, 10); limb(17, 29, -1, -14, 12); limb(10, 22, -5, -1, 5); limb(23, 21, 6, -1, 5)
  limb(11, 21, -1, -6, 5); limb(25, 20, 1, -6, 5); limb(16, 17, -3, -5, 4); limb(17, 17, 4, -5, 4)
  const L = LEAVES[sea]
  if (L) for (let i = 0; i < 120; i++) {
    const a = rnd(i * 1.7) * Math.PI * 2, r = Math.sqrt(rnd(i + 0.37)), x = 17 + Math.cos(a) * r * 12.5, y = 19 + Math.sin(a) * r * 8
    if (rnd(i + 9.1) > 0.9 && r > 0.4) continue                                  // gaps the branches show through
    const lit = (y < 16 ? 0 : y < 21 ? 1 : 2) + (x > 22 ? 1 : 0)
    R(c, L[Math.min(3, lit + (rnd(i + 4.2) > 0.75 ? 1 : 0))], Math.round(x) - 1, Math.round(y) - 1, 2, 2)
  }
  if (sea === 'bloom') for (let i = 0; i < 6; i++) R(c, L[i % 2], 6 + Math.round(rnd(i + 2.2) * 22), 44 + (i % 2), 1, 1)   // fallen petals
  if (sea === 'autumn') for (let i = 0; i < 5; i++) R(c, L[1 + i % 3], 6 + Math.round(rnd(i + 5.5) * 22), 44 + (i % 2), 1, 1)
  trees.set(sea, cv)
  return cv
}
let sea = 'green', seaAt = 0
const tree = (c, tx) => { const t = performance.now(); if (t - seaAt > 5000) { sea = season(); seaAt = t } c.drawImage(treeSprite(sea), tx - 10, -46) }
export function chochin(c, cx, y) {            // a red paper lantern hung at (cx, y): caps, ribs, a highlight, its mark
  R(c, INK, cx - 2, y, 5, 1)
  R(c, VERM, cx - 3, y + 1, 7, 8); R(c, VERM, cx - 4, y + 2, 9, 6)
  R(c, VERM_LO, cx - 4, y + 3, 9, 1); R(c, VERM_LO, cx - 4, y + 6, 9, 1); R(c, VERM_HI, cx - 2, y + 2, 1, 5)
  R(c, INK, cx, y + 3, 1, 4); R(c, INK, cx - 1, y + 4, 3, 1)
  R(c, INK, cx - 2, y + 9, 5, 1)
}
export const LANTERN_Y = -55                   // hung above the neighbours' name boards
function lampPost(c, lx) {
  R(c, WOOD, lx, -58, 2, 58); R(c, '#5a4232', lx, -58, 1, 58); R(c, WOOD, lx, -59, 9, 2)
  R(c, INK, lx + 7, -57, 1, 2); chochin(c, lx + 7, LANTERN_Y)
  R(c, '#7a7468', lx - 2, -2, 6, 2)
}

// ---------- the neighbours' sprites: a kawara roof, shoji windows, a noren on the shop door ----------
function roof(c, b, top) {
  const x0 = b.x0 - 6, x1 = b.x0 + b.w + 6, H = 9
  R(c, 'rgba(0,0,0,.3)', b.x0, top, b.w, 2)
  for (let r = 0; r < H; r++) {
    const a = x0 + r + (r > 1 ? 2 : 0), w = x1 - x0 - 2 * r - (r > 1 ? 4 : 0), y = top - 2 - r
    R(c, r === 0 ? KAWARA_LO : KAWARA, a, y, w, 1)
    if (r > 0) for (let x = a + 1 + (r % 2); x < a + w - 1; x += 3) R(c, r < 2 ? KAWARA_HI : KAWARA_LO, x, y, 1, 1)
  }
  R(c, KAWARA_HI, x0 + 1, top - 3, x1 - x0 - 2, 1)
  R(c, RIDGE, x0 + H + 3, top - 2 - H, x1 - x0 - 2 * H - 6, 2)
  for (const x of [x0 + H + 1, x1 - H - 5]) { R(c, RIDGE, x, top - 4 - H, 4, 4); R(c, KAWARA_HI, x + 1, top - 3 - H, 1, 1) }
  R(c, KAWARA, x0 - 1, top - 4, 2, 2); R(c, KAWARA, x1 - 1, top - 4, 2, 2)              // upturned eave tips
}
function shoji(c, x, y, draft) {
  R(c, draft ? '#c4c8d2' : WASHI, x, y, 12, 14); R(c, draft ? '#b2b8c4' : '#e6dabe', x, y + 10, 12, 4)
  const k = draft ? '#6a6e7a' : '#6a4a36'
  R(c, k, x + 4, y, 1, 14); R(c, k, x + 8, y, 1, 14); R(c, k, x, y + 4, 12, 1); R(c, k, x, y + 9, 12, 1)
}
function shop(c, b) {
  const dx = b.x0 + b.w / 2 + 5
  R(c, INDIGO, dx, -24, 16, 8)
  for (const x of [dx + 5, dx + 10]) R(c, '#1e2a4a', x, -20, 1, 4)
  R(c, WASHI, dx + 7, -22, 2, 2); R(c, INDIGO_HI, dx, -24, 16, 1)
}

export const JAPAN = {
  label: 'Japan',
  building: {
    interior: { session: '#efe5cf', lobby: '#ece0c6', meeting: '#e6dfcc', cafe: '#f1e5cc', ceo: '#e9dcc0', post: '#e0d6bf' },
    wainscot: { session: '#7a5a42', lobby: '#6a4a36', meeting: '#7a5e48', cafe: '#8a6448', ceo: '#4a3226', post: '#6a5040' },
    slabTop: VERM, slab: KAWARA, slabLine: RIDGE, roofSlab: KAWARA, roofSlabTop: KAWARA_HI,
    wall: '#b8402c', wallEdge: VERM_LO, footing: '#6a6862', footingLine: '#45433f', doorFrame: WOOD, glass: '#d8cfb6', skirting: '#4a3426',
    shaft: '#4a3a32', shaftHi: '#7a6250', machine: KAWARA, machineHi: KAWARA_HI, machineLo: KAWARA_LO, deck: '#8a6a4a', deckLine: '#6a4e36',
    lamp: '255,196,130', roomGlow: 'rgba(90,52,30,.55)',
  },
  city: {
    skyFar: SKY_FAR, skyNear: SKY_NEAR, skyWin: '255,206,140', soil: '#4a3e34', pebble: '#5a4c40', walk: '#cdc4b2', walkLine: '#b2a996',
    road: '#4a4c56', lane: '#ece4d0', curb: '#9a9488', curbLine: '#7a746a', post: WOOD, bulb: '#ffcf8a', lampGlow: '255,150,100',
    trunk: '#4a3028', leaf: '#5a9448', leafHi: '#78ae5c', winLit: 'rgba(255,196,128,.8)',
    dayTop: [98, 146, 204], dayHz: [232, 226, 218], nightTop: [8, 10, 30], nightHz: [40, 38, 80],
    styles: [['#e8dfca', '#6a4a36', '#5a4232'], ['#4a5878', '#36405a', '#2e3348'], ['#9a6a48', '#74503a', '#4a3426'], ['#c88a52', '#a06a3a', '#5a4232']],
    skyline, distant, tree, lampPost, roof, window: shoji, shop,
  },
  tint: [['soft-light', 'rgba(255,224,200,.18)']],
  // the Look tab's postcard: Fuji over the skyline
  thumbSky(c) {
    for (let y = 0; y < 22; y++) { const hw = 2 + y * 1.1 + y * y * 0.02; R(c, y < 6 ? '#f6f8fc' : y < 8 && y % 2 ? '#f6f8fc' : '#6a7aa8', Math.round(14 - hw), 9 + y, Math.round(hw * 2), 1) }
    R(c, VERM, 56, 22, 6, 1); R(c, INK, 55, 21, 8, 1); R(c, VERM, 57, 23, 1, 8); R(c, VERM, 60, 23, 1, 8); R(c, VERM, 56, 25, 6, 1)
  },
}

// ---------- the tower's decor ----------
export function japanDecor(api, tower, on) {
  const { Z } = tower
  const roofF = () => tower.floors[tower.floors.length - 1]
  const XO = BW + SHAFT                                          // the shafts' outer side
  const outdoors = () => tower.floors.filter(f => f.kind !== 'roof' && f.kind !== 'server' && f.kind !== 'post' && f.y - f.top >= 30)
  const lanternAt = f => [XO + 9, f.top + 8]
  const lampsIn = v => { const out = []; for (let k = Math.floor(v.x0 / 160) - 1; k * 160 < v.x1 + 160; k++) { const lx = k * 160 + 40; if (lx < -134 || lx > XO + 24) out.push(lx) } return out }   // city.js's lantern posts

  // a tiled hood along each floor's slab: grooves across the slab past the plaque, a short eave off the street wall
  function cornices(c) {
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.y >= 0) continue
      for (let x = PLAQUE.w + 4; x < BW - 2; x += 4) { R(c, KAWARA_LO, x, f.y + 2, 1, SLAB - 3); R(c, KAWARA_HI, x + 1, f.y + 2, 2, 1) }
      eave(c, f.y, 16)
    }
  }
  function eave(c, y, len) {                                    // off the street-side wall, sloping down and out to the left
    for (let r = 0; r < 4; r++) { const w = Math.round(len * (0.45 + r * 0.18)); R(c, r ? KAWARA : KAWARA_HI, -w, y - 2 + r, w, 1); if (r > 1) for (let x = -w + 1; x < 0; x += 2) R(c, KAWARA_LO, x, y - 2 + r, 1, 1) }
    for (let x = -len; x < 0; x += 2) { R(c, KAWARA_HI, x, y + 2, 1, 1); R(c, KAWARA_LO, x + 1, y + 2, 1, 1) }
    R(c, 'rgba(0,0,0,.28)', -len, y + 3, len, 1); R(c, KAWARA, -len - 1, y, 1, 2)
  }
  function roofTrim(c) {
    const rf = roofF(), y = rf.y
    for (let x = 2; x < BW - 2; x += 4) { R(c, KAWARA_LO, x, y + 2, 1, SLAB - 3); R(c, KAWARA_HI, x + 1, y + 2, 2, 1) }
    // the corner sweeps out and up over the street
    for (let r = 0; r < 6; r++) { const w = 4 + r * 3; R(c, r ? KAWARA : KAWARA_HI, -w, y - 1 + r, w, 1); if (r > 1) for (let x = -w + 1; x < 0; x += 2) R(c, KAWARA_LO, x, y - 1 + r, 1, 1) }
    for (let x = -19; x < 0; x += 2) { R(c, KAWARA_HI, x, y + 5, 1, 1); R(c, KAWARA_LO, x + 1, y + 5, 1, 1) }
    R(c, 'rgba(0,0,0,.3)', -19, y + 6, 19, 1)
    R(c, KAWARA, -21, y + 1, 2, 3); R(c, KAWARA, -22, y - 1, 2, 2); R(c, KAWARA_HI, -22, y - 1, 1, 1)
    R(c, RIDGE, -5, y - 2, 6, 1); R(c, VERM, 0, y + SLAB, 3, 2)
  }
  // the street door: a tiled hood over the awning and a noren under it (not while a holiday hangs its own decor there)
  function door(c) {
    for (let r = 0; r < 4; r++) R(c, r ? KAWARA : KAWARA_HI, -32 + (3 - r), -54 + r, 37 - (3 - r), 1)
    R(c, KAWARA, -33, -50, 39, 4); for (let x = -32; x < 5; x += 3) R(c, KAWARA_LO, x, -52, 1, 6)
    for (let x = -34; x < 6; x += 2) { R(c, KAWARA_HI, x, -46, 1, 2); R(c, KAWARA_LO, x + 1, -46, 1, 2) }
    R(c, KAWARA, -35, -48, 1, 2); R(c, KAWARA, 6, -48, 1, 2)
    R(c, 'rgba(0,0,0,.35)', -34, -44, 40, 1)
    const h = holidayOf()?.key
    if (h === 'obon' || h === 'tanabata') return
    R(c, WOOD, -30, -43, 30, 1)
    for (let p = 0; p < 4; p++) {
      const x = -29 + p * 7
      R(c, INDIGO, x, -42, 6, 8); R(c, INDIGO_HI, x, -42, 6, 1); R(c, '#1e2a4a', x, -35, 6, 1)
    }
    R(c, WASHI, -16, -40, 3, 4); R(c, WASHI, -17, -39, 5, 2); R(c, INDIGO, -15, -39, 1, 2)   // the house mon across the middle slit
  }
  // a torii right of the shafts and a stone lantern at the street's left end
  function torii(c) {
    const x0 = XO + 5, x1 = XO + 29
    for (const x of [x0 + 3, x1 - 6]) { R(c, VERM, x, -36, 3, 36); R(c, VERM_HI, x, -36, 1, 36); R(c, INK, x - 1, -4, 5, 4) }
    R(c, VERM, x0 + 1, -30, x1 - x0 - 2, 2)                                            // nuki
    R(c, VERM, x0 - 1, -38, x1 - x0 + 2, 3); R(c, VERM_LO, x0 - 1, -36, x1 - x0 + 2, 1) // shimaki
    R(c, INK, x0 - 3, -41, x1 - x0 + 6, 3); R(c, INK, x0 - 4, -43, 3, 2); R(c, INK, x1 + 1, -43, 3, 2)   // the kasagi, ends upturned
    R(c, VERM, (x0 + x1) / 2 - 1, -36, 2, 6); R(c, '#2a2020', (x0 + x1) / 2 - 2, -35, 4, 3)
  }
  function toro(c, x) {
    const s = '#9a968c', d = '#76726a', l = '#b8b4aa'
    R(c, d, x - 5, -2, 11, 2); R(c, s, x - 1, -12, 3, 10); R(c, d, x - 4, -14, 9, 2)
    R(c, s, x - 3, -20, 7, 6); R(c, '#3a3632', x - 1, -19, 3, 4)
    R(c, d, x - 6, -22, 13, 2); R(c, s, x - 5, -23, 11, 1); R(c, l, x - 3, -24, 7, 1); R(c, s, x - 1, -26, 3, 2); R(c, l, x, -27, 1, 1)
  }
  const TORO_X = -117
  function lanterns(c) {
    for (const f of outdoors()) { const [x, y] = lanternAt(f); R(c, WOOD, XO, y - 3, x - XO + 1, 1); R(c, WOOD, XO, y - 4, 1, 3); R(c, INK, x, y - 2, 1, 2); chochin(c, x, y) }
  }

  tower.on('items', (out, now, ctx) => {
    if (!on() || !tower.floors.length) return
    roofY = roofF().y
    out.push({ z: Z.BEHIND + 2, draw: c => { torii(c); toro(c, TORO_X) } },
      { z: Z.OUTSIDE + 1, draw: c => { cornices(c); roofTrim(c); door(c); lanterns(c) } })
  })
  tower.on('glow', (c, now, n, ctx) => {
    if (!on() || n < 0.05 || !tower.floors.length) return
    c.globalAlpha = Math.min(1, n * 1.2)
    const lit = (x, y) => { pool(c, x, y + 5, 13, '255,120,80', 0.5); c.fillStyle = 'rgba(255,150,90,.55)'; c.fillRect(x - 3, y + 2, 7, 6) }
    for (const f of outdoors()) lit(...lanternAt(f))
    for (const lx of lampsIn(ctx.view)) lit(lx + 7, LANTERN_Y)
    pool(c, TORO_X, -18, 12, '255,200,120', 0.6); c.fillStyle = 'rgba(255,210,140,.8)'; c.fillRect(TORO_X - 1, -19, 3, 4)
    c.globalAlpha = 1
  })
}
const pool = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
