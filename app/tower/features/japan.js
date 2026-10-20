// japan: the Japan skin (themes.js lists it and starts its decor). Its city painters (city.js) put Mt Fuji in the far
// sky — lit by the hour, akafuji at dusk, a silhouette at night, its snowcap deeper November to May — a Tokyo skyline
// (signboarded towers, neon at night, a lattice broadcast tower, a pagoda, a castle keep), sakura street trees in bloom
// all year (momiji among them in autumn, snow on them in winter), red chōchin on the lantern posts, and machiya, a
// konbini and an izakaya for neighbours. Its building painters put bonsai for plants, shoji in the meeting room, noren and
// lanterns in the café, daruma, a sakura branch at the penthouse window. Its decor tiles the cornices and the roof edge,
// hangs a noren under the awning and chōchin up the shafts' outer side, puts a torii, a stone lantern, drinks machines,
// a ramen yatai and a zebra crossing by the street, a maneki-neko on the reception desk, koinobori in May and drifting
// petals over the street. The painters themselves are in japan-art.js.
import { BW, SHAFT, SLAB, PLAQUE, IX, IX1 } from '../building.js'
import { today, holidayOf, koinobori } from './holidays.js'
import { R, rnd } from '../draw.js'
import { farSkyline, landmarks, jihanki, yatai, chochin as lantern, styleOf, windowOf, frontOf, frontLight, bonsai, daruma, manekiNeko, sakuraVase } from './japan-art.js'

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

// ---------- the far skyline: tiled hip roofs on the low blocks (the towers and landmarks are japan-art.js's) ----------
function hipRoof(c, x, y, w, col, h = 6) {
  for (let r = 0; r < h; r++) R(c, col, x - 3 + r + (r === 0 ? 0 : 1), y - r - 1, w + 6 - 2 * r - (r === 0 ? 0 : 2), 1)
  R(c, col, x - 4, y - 2, 1, 1); R(c, col, x + w + 3, y - 2, 1, 1)                   // the eaves' upturned tips
}
// the far skyline's night layer (its signs, the broadcast tower's floodlights, the lit keep) and where its signs are
let far = { neon: null, signs: [] }, marks = null
function skyline(c, blocks) {
  far = farSkyline(c, blocks, { far: SKY_FAR, near: SKY_NEAR, hipRoof })
  marks ||= landmarks({ near: SKY_NEAR })
  return []
}
function skyNight(c, x, y, n) { if (!far.neon) return; c.globalCompositeOperation = 'lighter'; c.globalAlpha = Math.min(1, n * 1.1); c.drawImage(far.neon, x, y) }

// ---------- street: sakura trees through the year, chōchin on the lantern posts ----------
// sakura in bloom whatever the date (a fantasy skin): in autumn every third tree is a momiji maple, in winter the
// blossom carries snow
const LEAVES = {
  sakura: ['#fde4ec', '#f7c0d2', '#f0a2bc', '#e2869f'], momiji: ['#f2784a', '#dc4630', '#b42a26', '#7e1c1e'],
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
  const kind = sea === 'momiji' ? 'momiji' : 'sakura', L = LEAVES[kind], snow = sea === 'snow'
  if (L) for (let i = 0; i < 120; i++) {
    const a = rnd(i * 1.7) * Math.PI * 2, r = Math.sqrt(rnd(i + 0.37)), x = 17 + Math.cos(a) * r * 12.5, y = 19 + Math.sin(a) * r * 8
    if (rnd(i + 9.1) > 0.9 && r > 0.4) continue                                  // gaps the branches show through
    const lit = (y < 16 ? 0 : y < 21 ? 1 : 2) + (x > 22 ? 1 : 0)
    R(c, L[Math.min(3, lit + (rnd(i + 4.2) > 0.75 ? 1 : 0))], Math.round(x) - 1, Math.round(y) - 1, 2, 2)
    if (snow && y < 17 && rnd(i + 6.6) > 0.35) R(c, '#ffffff', Math.round(x) - 1, Math.round(y) - 2, 2, 1)       // snow on the upper blossom
  }
  if (kind === 'sakura') for (let i = 0; i < 6; i++) R(c, L[i % 2], 6 + Math.round(rnd(i + 2.2) * 22), 44 + (i % 2), 1, 1)   // fallen petals
  else for (let i = 0; i < 5; i++) R(c, L[1 + i % 3], 6 + Math.round(rnd(i + 5.5) * 22), 44 + (i % 2), 1, 1)
  if (snow) { R(c, '#f4f6fa', 4, 44, 26, 2); R(c, '#ffffff', 16, 27, 3, 1) }
  trees.set(sea, cv)
  return cv
}
let sea = 'green', seaAt = 0
const tree = (c, tx) => {
  const t = performance.now(); if (t - seaAt > 5000) { sea = season(); seaAt = t }
  const k = sea === 'autumn' && (Math.floor(tx / 160) % 3 + 3) % 3 === 1 ? 'momiji' : sea === 'bare' ? 'snow' : 'sakura'
  c.drawImage(treeSprite(k), tx - 10, -46)
}
export const chochin = lantern
export const LANTERN_Y = -55                   // hung above the neighbours' name boards
function lampPost(c, lx) {
  R(c, WOOD, lx, -58, 2, 58); R(c, '#5a4232', lx, -58, 1, 58); R(c, WOOD, lx, -59, 9, 2)
  R(c, INK, lx + 7, -57, 1, 2); chochin(c, lx + 7, LANTERN_Y)
  R(c, '#7a7468', lx - 2, -2, 6, 2)
}

// ---------- the neighbours' sprites: a kawara roof (their windows and fronts are japan-art.js's) ----------
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

export const JAPAN = {
  label: 'Japan',
  building: {
    interior: { session: '#efe5cf', lobby: '#ece0c6', meeting: '#e6dfcc', cafe: '#f1e5cc', ceo: '#e9dcc0', post: '#e0d6bf' },
    wainscot: { session: '#7a5a42', lobby: '#6a4a36', meeting: '#7a5e48', cafe: '#8a6448', ceo: '#4a3226', post: '#6a5040' },
    slabTop: VERM, slab: KAWARA, slabLine: RIDGE, roofSlab: KAWARA, roofSlabTop: KAWARA_HI,
    wall: '#b8402c', wallEdge: VERM_LO, footing: '#6a6862', footingLine: '#45433f', doorFrame: WOOD, glass: '#d8cfb6', skirting: '#4a3426',
    shaft: '#4a3a32', shaftHi: '#7a6250', machine: KAWARA, machineHi: KAWARA_HI, machineLo: KAWARA_LO, deck: '#8a6a4a', deckLine: '#6a4e36',
    lamp: '255,196,130', roomGlow: 'rgba(90,52,30,.55)',
    plant: bonsai, backWall: shoji, furnish,
  },
  city: {
    skyFar: SKY_FAR, skyNear: SKY_NEAR, skyWin: '255,206,140', soil: '#4a3e34', pebble: '#5a4c40', walk: '#cdc4b2', walkLine: '#b2a996',
    road: '#4a4c56', lane: '#ece4d0', curb: '#9a9488', curbLine: '#7a746a', post: WOOD, bulb: '#ffcf8a', lampGlow: '255,150,100',
    trunk: '#4a3028', leaf: '#5a9448', leafHi: '#78ae5c', winLit: 'rgba(255,196,128,.8)',
    dayTop: [98, 146, 204], dayHz: [232, 226, 218], nightTop: [8, 10, 30], nightHz: [40, 38, 80],
    styles: [['#e8dfca', '#6a4a36', '#5a4232'], ['#4a5878', '#36405a', '#2e3348'], ['#9a6a48', '#74503a', '#4a3426'], ['#c88a52', '#a06a3a', '#5a4232']],
    skyline, skyNight, distant, tree, lampPost, roof, style: styleOf, window: windowOf, front: frontOf, frontLight,
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


  // ---------- the street: drinks machines by the door, a zebra crossing, a ramen yatai, petals ----------
  // static pieces are painted once into small sprites: sprite(key, x0, y0, w, h, paint) → { cv, x, y }
  const sprites = new Map()
  function sprite(key, x, y, w, h, paint) {
    let s = sprites.get(key)
    if (!s) { const cv = Object.assign(document.createElement('canvas'), { width: w, height: h }), c = cv.getContext('2d'); c.translate(-x, -y); paint(c); sprites.set(key, s = { cv, x, y }) }
    return s
  }
  const put = (c, s) => c.drawImage(s.cv, s.x, s.y)
  const DOOR_VEND = [[-61, 'red'], [-32, 'blue']]                // between the news box and the mailbox, and by the door
  const street = () => sprite('street', -64, -28, 48, 29, c => DOOR_VEND.forEach(([x, col], k) => jihanki(c, x, 0, 13, 26, col, { seed: 11 + k })))
  const CROSSINGS = [[-108, 92], [XO + 40, 64]]
  const crossing = () => sprite('zebra', -108, 4, XO + 104 + 108, 11, c => {
    for (const [x0, w] of CROSSINGS) { R(c, JAPAN.city.road, x0 - 2, 4, w + 2, 10); for (let x = x0; x < x0 + w; x += 6) { R(c, '#e8e2d4', x, 5, 3, 8); R(c, '#cfc8b8', x, 12, 3, 1) } }
  })
  // the yatai stands on the sidewalk between two neighbours' name boards, clear of the trees and lantern posts, the
  // nearest such spot to the tower
  let yKey = '', yX = null
  function yataiOf() {
    const bs = tower.street.buildings, k = bs.map(b => b.x0 + ':' + b.w).join(',')
    if (k === yKey) return yX
    yKey = k; yX = null
    const e = tower.street.extent, boards = bs.map(b => [b.x0 + b.w / 2 - 46, b.x0 + b.w / 2 + 46])
    const ok = x => {
      const a = x - 7, z = x + 41
      if (a < e.x0 || z > e.x1 || (z > -140 && a < XO + 40) || boards.some(([p, q]) => z > p && a < q)) return false
      for (let k0 = Math.floor(a / 160) - 1; k0 * 160 < z + 160; k0++) { const t = k0 * 160 + 118, l = k0 * 160 + 40; if (z > t - 8 && a < t + 24 || z > l - 3 && a < l + 13) return false }
      return true
    }
    for (let d = 0; d < 2000 && yX == null; d += 2) { if (ok(XO + 47 + d)) yX = XO + 47 + d; else if (ok(-182 - d)) yX = -182 - d }
    return yX
  }
  const cart = () => sprite('yatai', -8, -46, 50, 47, c => yatai(c, 0, 0))
  function steam(c, x, now) {
    for (let i = 0; i < 4; i++) {
      const p = ((now / 2200) + i / 4) % 1
      c.fillStyle = `rgba(250,250,252,${0.55 * (1 - p)})`
      c.fillRect(Math.round(x + 26 + Math.sin(p * 5 + i) * 2 + p * 3), Math.round(-27 - p * 18), p < 0.5 ? 2 : 3, p < 0.5 ? 2 : 3)
    }
  }
  // sakura petals drifting down over the street, never inside the tower
  const PETALS = ['#fde4ec', '#f7c0d2', '#f0a2bc', '#f8d0dc']
  function petals(c, v, now) {
    const t = now / 1000, W = v.x1 - v.x0, n = Math.min(90, Math.round(W / 7))
    for (let i = 0; i < n; i++) {
      const fall = 9 + rnd(i + 0.3) * 8, span = 150, ph = (rnd(i + 0.9) * span + t * fall) % span
      const y = -140 + ph, x = v.x0 + ((rnd(i + 0.1) * W + t * (6 + rnd(i + 0.5) * 6) + Math.sin(t * 1.3 + i) * 5) % W + W) % W
      if (x > -3 && x < XO + 3 || y > 3) continue
      const flip = Math.floor(t * 3 + i) % 3
      R(c, PETALS[i % 4], x, y, flip === 0 ? 2 : 1, flip === 1 ? 2 : 1)
    }
  }
  // the reception desk's maneki-neko, beckoning
  const nekoAt = f => [IX + 155, f.y - 22]                      // right of the cornerstone's lettering
  const koiMonth = () => today().getMonth() === 4 && holidayOf()?.key !== 'goldenweek'   // May, past Golden Week's own

  // the landmarks stand in front of the far skyline and behind the repos' towers, at its parallax
  tower.city.backdrop.unshift((c, v) => {
    if (!on() || !marks) return
    const sx = tower.city.skyX(v)
    for (const m of marks) { const x = Math.round(m.x + sx); if (x < v.x1 && x + m.w > v.x0) c.drawImage(m.cv, x, m.y) }
  })
  tower.on('items', (out, now, ctx) => {
    if (!on() || !tower.floors.length) return
    roofY = roofF().y
    const v = ctx.view, yx = yataiOf(), lob = tower.floor('lobby')
    out.push({ z: Z.BEHIND + 1, draw: c => put(c, crossing()) },
      { z: Z.BEHIND + 2, draw: c => { torii(c); toro(c, TORO_X); put(c, street()); if (yx != null) { const s = cart(); c.drawImage(s.cv, yx + s.x, s.y); steam(c, yx, now) } } },
      { z: Z.OUTSIDE + 1, draw: c => { cornices(c); roofTrim(c); door(c); lanterns(c) } },
      { z: Z.OUTSIDE + 2, draw: c => petals(c, v, now) })
    if (lob && lob.open == null) { const [x, y] = nekoAt(lob); out.push({ z: Z.FRONT + 2, draw: c => manekiNeko(c, x, y, Math.floor(now / 450) % 2 === 0) }) }
    if (koiMonth()) out.push({ z: Z.OUTSIDE + 3, draw: c => koinobori(c, -96, now) })
  })
  // what stands in front of the far skyline (the tower and its street furniture, the neighbours, the repos' towers)
  const hid = (x, y) => (x >= -50 && x <= XO + 34 && y >= (tower.bounds?.y0 ?? -1e9)) || !!tower.city.buildingAt(x, y) || !!api.farTowerAt?.(x, y)
  tower.on('glow', (c, now, n, ctx) => {
    if (!on() || n < 0.05 || !tower.floors.length) return
    const v = ctx.view
    // the far signs, brightened again where nothing nearer stands in front of them
    if (far.neon) {
      const sx = tower.city.skyX(v), SW = tower.city.SKY_W
      c.globalAlpha = Math.min(1, n * 0.8)
      for (let k = Math.floor((v.x0 - sx) / SW); k * SW + sx < v.x1; k++) {
        const X = Math.round(k * SW + sx)
        for (const s of far.signs) {
          const x = X + s.x, y = -260 + s.y
          if (x > v.x1 || x + s.w < v.x0 || hid(x, y) || hid(x + s.w - 1, y) || hid(x, y + s.h - 1) || hid(x + s.w - 1, y + s.h - 1)) continue
          c.drawImage(far.neon, s.x, s.y, s.w, s.h, x, y, s.w, s.h)
        }
      }
    }
    if (marks) {
      const sx = tower.city.skyX(v)
      for (const m of marks) {
        const x = Math.round(m.x + sx); if (x > v.x1 || x + m.w < v.x0) continue
        for (let y = 0; y < m.h; y += 8) { const wy = m.y + y; if (hid(x + 2, wy) || hid(x + m.w - 3, wy) || hid(x + m.w / 2, wy + 7)) continue; c.drawImage(m.night, 0, y, m.w, 8, x, wy, m.w, 8) }
      }
    }
    c.globalAlpha = Math.min(1, n * 1.2)
    const lit = (x, y) => { pool(c, x, y + 5, 13, '255,120,80', 0.5); c.fillStyle = 'rgba(255,150,90,.55)'; c.fillRect(x - 3, y + 2, 7, 6) }
    for (const f of outdoors()) lit(...lanternAt(f))
    for (const lx of lampsIn(v)) lit(lx + 7, LANTERN_Y)
    pool(c, TORO_X, -18, 12, '255,200,120', 0.6); c.fillStyle = 'rgba(255,210,140,.8)'; c.fillRect(TORO_X - 1, -19, 3, 4)
    for (const [x] of DOOR_VEND) { pool(c, x + 6, -16, 16, '200,235,255', 0.45); c.fillStyle = 'rgba(220,240,255,.55)'; c.fillRect(x + 2, -21, 9, 13) }
    const yx = yataiOf(); if (yx != null) lit(yx - 3, -36)
    c.globalAlpha = 1
  })
}

// ---------- inside: bonsai for plants, shoji in the meeting room, noren and lanterns in the café, daruma, a sakura branch ----------
function shoji(c, f) {   // the meeting room's back wall
  if (f.kind !== 'meeting') return
  const y0 = f.top + 3, y1 = f.y - 19, h = y1 - y0
  if (h < 20) return
  R(c, '#f1e9d6', IX, y0, IX1 - IX, h)
  for (let y = y0 + 6; y < y1 - 2; y += 7) R(c, '#dccdb0', IX, y, IX1 - IX, 1)
  for (let x = IX + 6; x < IX1; x += 9) R(c, '#dccdb0', x, y0, 1, h)
  for (let x = IX; x < IX1; x += 54) { R(c, '#8a6a4a', x, y0, 2, h); R(c, '#a8845c', x, y0, 1, h) }
  R(c, '#6a4a30', IX, y0 - 1, IX1 - IX, 2); R(c, '#6a4a30', IX, y1 - 1, IX1 - IX, 2)                            // the kamoi and shikii rails
}
function furnish(c, fc, lc, f) {
  const y = f.y, t = f.top
  if (f.kind === 'lobby') { daruma(c, IX + 383, y - 40, '#c8302a', true); daruma(c, IX + 395, y - 40, '#f0ece2') }
  if (f.kind === 'ceo') {
    sakuraVase(c, IX + 251, y - 28)
    daruma(c, IX + 8, y - 40, '#c8302a', true); daruma(c, IX + 19, y - 40, '#e8b84a')
  }
  if (f.kind === 'cafe') {
    // a noren over the kitchen counter (under the menu board), two chōchin over the table, ramen on it
    R(c, WOOD, IX + 27, y - 52, 74, 2); R(c, '#5a4232', IX + 27, y - 52, 74, 1)
    for (let p = 0; p < 6; p++) { const x = IX + 28 + p * 12; R(c, INDIGO, x, y - 50, 11, 9); R(c, INDIGO_HI, x, y - 50, 11, 1); R(c, '#1e2a4a', x, y - 42, 11, 1) }
    R(c, WASHI, IX + 60, y - 48, 7, 5); R(c, INDIGO, IX + 62, y - 47, 3, 3); R(c, WASHI, IX + 63, y - 46, 1, 1)
    for (const x of [IX + 118, IX + 146]) {
      R(c, '#4a4452', x, t, 1, 22); lantern(c, x, t + 22)
      const g = lc.createRadialGradient(x, t + 27, 0, x, t + 27, 30); g.addColorStop(0, 'rgba(255,130,90,.7)'); g.addColorStop(1, 'rgba(255,130,90,0)'); lc.fillStyle = g; lc.fillRect(x - 30, t, 60, 60)
    }
    for (const x of [IX + 113, IX + 139]) { R(fc, '#2a2020', x, y - 17, 7, 1); R(fc, '#f0e8d8', x, y - 16, 7, 3); R(fc, '#c8302a', x, y - 15, 7, 1); R(fc, '#c89a50', x + 1, y - 17, 5, 1); R(fc, '#d8c098', x + 5, y - 20, 1, 4); R(fc, '#d8c098', x + 6, y - 21, 1, 4) }
  }
}
const pool = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
