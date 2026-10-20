// japan-art: the Japan skin's pixel painters (japan.js places them): the far Tokyo skyline (mixed-use towers with
// vertical signboards, rooftop tanks and billboards, a lattice broadcast tower, a castle keep), the neighbours' fronts
// (machiya, a corner konbini, an izakaya), drinks vending machines, bicycles, a ramen yatai, bonsai, daruma, a
// maneki-neko and a sakura branch. Everything here paints into whatever canvas it is given; the callers cache it.
import { R, rnd } from '../draw.js'

const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`
const hexA = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
const INK = '#1e1a1c', VERM = '#c4452e', WASHI = '#f3ead6', INDIGO = '#2c3a66'

// ---------- the far skyline ----------
const SIGNS = [[226, 64, 64], [240, 186, 52], [64, 138, 222], [72, 186, 120], [232, 96, 176], [120, 214, 240], [250, 128, 52]]
// a few glyph-like marks down a vertical sign: abstract strokes, never letters
function glyphs(c, x, y, w, h, col, seed) {
  c.fillStyle = col
  for (let gy = y + 2, k = 0; gy + 3 <= y + h - 1; gy += 5, k++) {
    const r = rnd(seed * 7.3 + k)
    if (w >= 5) { c.fillRect(x + 1, gy + 1, w - 2, 1); if (r > 0.3) c.fillRect(x + 1 + (r > 0.65 ? 0 : w - 3), gy, 1, 3); if (r < 0.5) c.fillRect(x + Math.floor(w / 2), gy + 2, 1, 2) }
    else c.fillRect(x + 1, gy, 1, 2 + (r > 0.5 ? 1 : 0))
  }
}
// One far block made a Tokyo mixed-use tower: floor lines, a vertical signboard, a band sign, a water tank or a
// billboard on the roof. Its signs go into neon too (lit at night) and into signs (for the glow pass).
function tokyoBlock(c, n, b, base, signs, i) {
  const h = rnd(b.x * 0.137 + b.h), hz = col => rgb(mix(col, base, 0.5)), dark = rgb(mix(base, [40, 44, 70], 0.16))
  c.fillStyle = dark; for (let y = b.y + 7; y < 258; y += 9) c.fillRect(b.x + 1, y, b.w - 2, 1)
  // the vertical signboard, on one side, a few floors under the roof
  const right = h > 0.5, sw = b.w > 60 ? 7 : 5, sh = Math.min(70, 22 + Math.floor(rnd(i + 0.3) * 44)), sx = right ? b.x + b.w - sw - 2 : b.x + 2, sy = b.y + 10 + Math.floor(rnd(i + 0.7) * 16)
  const col = SIGNS[Math.floor(rnd(i * 1.9) * SIGNS.length)]
  if (sy + sh < 252) {
    R(c, dark, sx - 1, sy - 1, sw + 2, sh + 2); R(c, hz(col), sx, sy, sw, sh)
    glyphs(c, sx, sy, sw, sh, rgb(mix(mix(col, [255, 255, 255], 0.6), base, 0.4)), i)
    R(n, rgb(col), sx, sy, sw, sh); glyphs(n, sx, sy, sw, sh, rgb(mix(col, [255, 255, 240], 0.75)), i)
    signs.push({ x: sx - 1, y: sy - 1, w: sw + 2, h: sh + 2 })
  }
  // a horizontal band sign across a lower floor of the wider ones
  if (b.w > 54 && h < 0.7) {
    const by = Math.min(250, b.y + 40 + Math.floor(rnd(i + 2.2) * Math.max(10, b.h - 60))), bw = b.w - 14 - sw, bx = right ? b.x + 4 : b.x + sw + 8, col2 = SIGNS[(Math.floor(h * 97) + 2) % SIGNS.length]
    if (by < 248) {
      R(c, hz(col2), bx, by, bw, 4); R(n, rgb(col2), bx, by, bw, 4)
      for (let x = bx + 2; x < bx + bw - 2; x += 3 + (x % 2)) { R(c, rgb(mix(mix(col2, [255, 255, 255], 0.6), base, 0.4)), x, by + 1, 1, 2); R(n, rgb(mix(col2, [255, 255, 240], 0.8)), x, by + 1, 1, 2) }
      signs.push({ x: bx, y: by, w: bw, h: 4 })
    }
  }
  // the roof: a billboard on legs, or a water tank
  const roofCol = rgb(mix(base, [60, 64, 90], 0.22))
  if (b.w >= 46 && rnd(i + 5.5) > 0.45) {
    const bw = Math.min(40, b.w - 12), bx = b.x + Math.floor((b.w - bw) / 2), by = b.y - 15, col3 = SIGNS[Math.floor(rnd(i + 8.1) * SIGNS.length)]
    R(c, roofCol, bx + 4, by + 10, 1, 5); R(c, roofCol, bx + bw - 5, by + 10, 1, 5); R(c, roofCol, bx + 3, by + 13, bw - 6, 1)
    R(c, roofCol, bx - 1, by - 1, bw + 2, 12); R(c, hz(col3), bx, by, bw, 10)
    R(c, rgb(mix(mix(col3, [255, 255, 255], 0.5), base, 0.45)), bx + 3, by + 3, Math.floor(bw * 0.45), 2); R(c, rgb(mix(mix(col3, [30, 30, 40], 0.4), base, 0.45)), bx + 3, by + 6, Math.floor(bw * 0.3), 1)
    R(n, rgb(col3), bx, by, bw, 10); R(n, rgb(mix(col3, [255, 255, 240], 0.7)), bx + 3, by + 3, Math.floor(bw * 0.45), 2)
    signs.push({ x: bx - 1, y: by - 1, w: bw + 2, h: 12 })
  } else {
    const tx = b.x + 6 + Math.floor(rnd(i + 3.7) * Math.max(1, b.w - 20))
    R(c, roofCol, tx + 1, b.y - 3, 1, 3); R(c, roofCol, tx + 6, b.y - 3, 1, 3)
    R(c, roofCol, tx, b.y - 10, 8, 7); R(c, rgb(mix(base, [255, 255, 255], 0.15)), tx + 1, b.y - 10, 2, 7); R(c, roofCol, tx + 1, b.y - 11, 6, 1)
  }
}
// a red-and-white lattice broadcast tower, its base at (cx, base), ht tall
function broadcastTower(c, n, cx, base, ht, hz) {
  const RED = rgb(mix([222, 70, 46], hz, 0.22)), WHITE = rgb(mix([250, 248, 244], hz, 0.2)), DECK = rgb(mix([110, 116, 140], hz, 0.25))
  const hw = t => 2 + 27 * (1 - t) ** 2.4, top = base - ht
  for (let y = top + 22; y < base; y++) {
    const t = (base - y) / (ht - 22), w = hw(t), band = Math.floor((base - y) / (t > 0.55 ? 14 : 22)) % 2, col = band ? WHITE : RED
    const l = Math.round(cx - w), r = Math.round(cx + w)
    c.fillStyle = col; c.fillRect(l, y, 2, 1); c.fillRect(r - 1, y, 2, 1)
    // X bracing between the legs (none under the arch)
    if (base - y > 26 || Math.abs(base - y - 26) < 1) {
      const seg = 9, k = ((base - y) % seg) / seg, a = Math.round(l + (r - l) * k), b2 = Math.round(r - (r - l) * k)
      c.fillRect(a, y, 1, 1); c.fillRect(b2, y, 1, 1)
      if ((base - y) % seg === 0) c.fillRect(l, y, r - l + 1, 1)
    } else if (base - y > 18) { const k = (base - y - 18) / 8, aw = Math.round((r - l) / 2 * (1 - k * k)); c.fillRect(l, y, Math.max(0, (r - l) / 2 - aw), 1); c.fillRect(Math.round(cx + aw), y, Math.max(0, r - Math.round(cx + aw)), 1) }
  }
  for (const [t, w, h] of [[0.36, 15, 7], [0.64, 7, 4]]) { const y = Math.round(base - 22 - t * (ht - 22)); R(c, DECK, cx - w, y - h, 2 * w + 1, h); R(c, WHITE, cx - w, y - h, 2 * w + 1, 1); R(c, RED, cx - w, y - 1, 2 * w + 1, 1) }
  R(c, RED, cx - 1, top, 2, 24); R(c, WHITE, cx - 1, top + 6, 2, 4); R(c, WHITE, cx - 1, top + 14, 2, 3)
  // night: floodlit orange, the decks lit, aviation lights at the top
  const glowCol = 'rgba(255,150,70,.55)'
  for (let y = top + 22; y < base; y += 2) { const t = (base - y) / (ht - 22), w = hw(t); n.fillStyle = glowCol; n.fillRect(Math.round(cx - w), y, 2, 1); n.fillRect(Math.round(cx + w) - 1, y, 2, 1) }
  for (const [t, w, h] of [[0.36, 15, 7], [0.64, 7, 4]]) { const y = Math.round(base - 22 - t * (ht - 22)); R(n, 'rgba(255,236,190,.9)', cx - w + 1, y - h + 2, 2 * w - 1, 2) }
  R(n, '#ff3a2a', cx - 1, top, 2, 2); R(n, 'rgba(255,170,90,.8)', cx - 1, top + 2, 2, 20)
}
// a five-storey pagoda: vermilion posts and white walls under dark tiled roofs, a bronze spire with its rings
function pagodaTall(c, n, cx, base, ht, hz) {
  const ROOF = rgb(mix([62, 70, 86], hz, 0.3)), ROOF_HI = rgb(mix([104, 112, 128], hz, 0.3)), RED = rgb(mix([196, 70, 46], hz, 0.3)), WALL = rgb(mix([240, 234, 220], hz, 0.25)), BRONZE = rgb(mix([150, 120, 70], hz, 0.3)), STONE = rgb(mix([140, 138, 140], hz, 0.3))
  const tiers = 5, spire = Math.round(ht * 0.22), th = Math.floor((ht - spire - 6) / tiers)
  R(c, STONE, cx - 18, base - 6, 36, 6); R(c, ROOF_HI, cx - 18, base - 6, 36, 1)
  for (let i = 0; i < tiers; i++) {
    const y = base - 6 - i * th, bw = 22 - i * 2, ew = 50 - i * 5
    R(c, RED, cx - bw / 2, y - th + 4, bw, th - 4); R(c, WALL, cx - bw / 2 + 2, y - th + 6, bw - 4, th - 9)
    for (let k = -bw / 2 + 4; k < bw / 2 - 3; k += 4) R(c, RED, cx + k, y - th + 6, 1, th - 9)
    R(c, RED, cx - bw / 2 - 2, y - th + 4, bw + 4, 1)                                               // the balcony rail
    for (let r = 0; r < 4; r++) R(c, r === 0 ? ROOF_HI : ROOF, Math.round(cx - ew / 2 + r * 2), y - th + 3 - r, ew - r * 4, 1)
    R(c, ROOF, Math.round(cx - ew / 2 - 2), y - th + 2, 2, 2); R(c, ROOF, Math.round(cx + ew / 2), y - th + 2, 2, 2)
    R(n, 'rgba(255,200,140,.4)', cx - bw / 2 + 2, y - th + 6, bw - 4, th - 9)
  }
  const top = base - 6 - tiers * th
  R(c, BRONZE, cx - 1, top - spire, 2, spire + 1)
  for (let y = top - spire + 5; y < top - 3; y += 3) R(c, BRONZE, cx - 2, y, 5, 1)
  R(c, BRONZE, cx - 2, top - spire - 2, 4, 3)
}
// a white castle keep on its stone base, among the park's trees
function castle(c, n, cx, base, hz) {
  const STONE = rgb(mix([150, 148, 150], hz, 0.35)), STONE_D = rgb(mix([110, 108, 116], hz, 0.35)), WALL = rgb(mix([250, 248, 244], hz, 0.22)), WIN = rgb(mix([60, 60, 70], hz, 0.35))
  const ROOF = rgb(mix([72, 84, 96], hz, 0.35)), ROOF_HI = rgb(mix([110, 124, 136], hz, 0.35)), GOLD = rgb(mix([240, 200, 80], hz, 0.25)), TREE = rgb(mix([70, 110, 84], hz, 0.45)), TREE_D = rgb(mix([52, 86, 66], hz, 0.45))
  // the castle hill, wooded, then trees around the keep's foot
  const HILL = 84
  for (let y = 0; y < HILL; y++) { const w = Math.round(78 - y * 0.55 - (y / HILL) ** 3 * 22); R(c, y % 3 ? TREE : TREE_D, cx - w, base - 1 - y, 2 * w, 1) }
  for (let k = -70; k < 70; k += 7) { const r = 3 + Math.floor(rnd(k + 0.5) * 3), yy = base - HILL + Math.abs(k) ** 1.6 * 0.07 + 2; for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); R(c, y > 0 ? TREE_D : TREE, cx + k - w, Math.round(yy + y - r), w * 2, 1) } }
  base -= HILL
  for (const [dx, r] of [[-40, 7], [-32, 9], [34, 8], [42, 6]]) for (let y = -r; y <= r; y++) { const w = Math.round(Math.sqrt(r * r - y * y)); R(c, y > 2 ? TREE_D : TREE, cx + dx - w, base - r + y, w * 2, 1) }
  // the ishigaki: a battered stone base, wider at the foot
  for (let y = 0; y < 20; y++) { const w = 34 - Math.round(6 * (y / 20) ** 0.7); R(c, y % 5 === 4 ? STONE_D : STONE, cx - w, base - 1 - y, w * 2, 1) }
  for (let y = 2; y < 20; y += 5) for (let x = -30 + (y % 10 ? 4 : 0); x < 30; x += 8) R(c, STONE_D, cx + x, base - y - 4, 1, 4)
  let y = base - 20
  const roof = (w, y0, gable) => {
    for (let r = 0; r < 4; r++) R(c, r === 3 ? ROOF_HI : ROOF, cx - w - 4 + r, y0 - r, 2 * (w + 4 - r), 1)
    R(c, ROOF, cx - w - 6, y0 - 2, 2, 2); R(c, ROOF, cx + w + 4, y0 - 2, 2, 2)                  // upturned ends
    if (gable) for (let r = 0; r < 5; r++) R(c, r ? ROOF : ROOF_HI, cx - 5 + r, y0 - 4 - r, 10 - 2 * r + 1, 1)
  }
  for (const [w, h, wins, gable] of [[24, 14, 5, true], [18, 11, 4, false], [12, 10, 3, true]]) {
    R(c, WALL, cx - w, y - h, 2 * w, h)
    for (let k = 0; k < wins; k++) R(c, WIN, Math.round(cx - w + 4 + k * (2 * w - 8) / Math.max(1, wins - 1)) - 1, y - h + 4, 2, 3)
    R(n, 'rgba(255,232,190,.32)', cx - w, y - h, 2 * w, h)
    y -= h
    roof(w, y, gable)
    y -= 4
  }
  R(c, ROOF, cx - 9, y - 2, 18, 2); R(c, GOLD, cx - 10, y - 4, 2, 2); R(c, GOLD, cx + 8, y - 4, 2, 2)    // the ridge and its golden shachi
}
export function farSkyline(c, blocks, { far, near, hipRoof, pagoda }) {
  const n = Object.assign(document.createElement('canvas'), { width: c.canvas.width, height: c.canvas.height }).getContext('2d'), signs = []
  const FAR = hexA(far), NEAR = hexA(near)
  blocks.forEach((b, i) => {
    if (b.h >= 112) tokyoBlock(c, n, b, b.far ? FAR : NEAR, signs, i)
    else if (b.w > 40 && (b.x * 7 + b.h) % 3) hipRoof(c, b.x + 2, b.y, b.w - 4, b.far ? far : near, 5 + (b.w > 70 ? 2 : 0))
  })
  return { neon: n.canvas, signs }
}
// The landmarks, one of each (the skyline repeats every 1400 px, and a wide view would show a tiled one twice): sprites
// of the broadcast tower, the castle on its hill and a pagoda, each { cv, night, x (its left, from the skyline's
// parallax origin), y (its top, world), w, h }; night holds its lights, drawn in 8 px strips where nothing stands in front
export function landmarks({ near }) {
  const NEAR = hexA(near)
  const mk = (x, w, paint) => {
    const cv = Object.assign(document.createElement('canvas'), { width: w, height: 262 }), nv = Object.assign(document.createElement('canvas'), { width: w, height: 262 })
    paint(cv.getContext('2d'), nv.getContext('2d'), w / 2)
    return { cv, night: nv, x: x - w / 2, y: -262, w, h: 262 }
  }
  return [
    mk(-460, 66, (c, n, cx) => broadcastTower(c, n, cx, 260, 252, NEAR)),
    mk(-304, 56, (c, n, cx) => pagodaTall(c, n, cx, 260, 236, NEAR)),
    mk(652, 160, (c, n, cx) => castle(c, n, cx, 260, NEAR)),
  ]
}

// ---------- drinks vending machines (jidōhanbaiki) ----------
const BOTTLES = ['#e84a3a', '#f4c43a', '#3a8ad8', '#5ac06a', '#f08ac0', '#f4f4ec', '#8a5a3a', '#4ad0d0', '#ff8a3a']
const BODY = { red: ['#c8302a', '#e8483a', '#8a1e1a'], blue: ['#2a5aa8', '#3a74c8', '#1a3a74'], white: ['#e8e6e0', '#ffffff', '#a8a49c'], green: ['#2a8a5a', '#3aa86c', '#1a5a3a'], orange: ['#e87a2a', '#f8984a', '#a84a1a'] }
// a machine w x h with its feet at (x, y): a lit display of bottle rows with their buttons, the coin panel, the slot.
// out: out of order (dark, emptied); seed picks the bottles
export function jihanki(c, x, y, w, h, colour = 'red', { out = false, seed = 0 } = {}) {
  const [body, hi, lo] = BODY[colour] || BODY.red, top = y - h
  R(c, 'rgba(0,0,0,.25)', x + 1, y, w, 1)
  R(c, lo, x, top, w, h); R(c, body, x + 1, top + 1, w - 2, h - 1); R(c, hi, x + 1, top + 1, w - 2, 1); R(c, lo, x + w - 2, top + 2, 1, h - 3)
  R(c, out ? '#5a5a62' : hi, x + 2, top + 2, w - 4, 2); R(c, out ? '#4a4a52' : '#ffffff', x + 3, top + 2, Math.max(2, (w - 6) >> 1), 1)   // the lit header
  // the display: rows of cans and bottles behind glass, a button under each
  const dx = x + 2, dy = top + 5, dw = w - 4, per = Math.max(2, Math.floor((dw + 1) / 3)), rows = Math.max(2, Math.floor((h * 0.54 - 1) / 5)), dh = rows * 5 + 1
  R(c, '#1a1e2a', dx - 1, dy - 1, dw + 2, dh + 2); R(c, out ? '#3a4050' : '#f4fbff', dx, dy, dw, dh)
  const off = dx + Math.floor((dw - (per * 3 - 1)) / 2)
  for (let r = 0; r < rows; r++) for (let k = 0; k < per; k++) {
    const bx = off + k * 3, by = dy + 1 + r * 5, gone = out && (r + k) % 3 === 1, tall = rnd(seed * 5.7 + r * 3 + k) > 0.5
    const col = out ? '#5a6070' : BOTTLES[Math.floor(rnd(seed * 3.1 + r * 7 + k) * BOTTLES.length)]
    if (!gone) { R(c, col, bx, by + 1, 2, 2); R(c, tall ? (out ? '#6a7080' : '#ffffff') : col, bx + (tall ? 1 : 0), by, tall ? 1 : 2, 1) }
    R(c, out ? '#2a2e38' : (r * per + k + seed) % 7 === 0 ? '#ff4a3a' : '#3a9aff', bx, by + 4, 1, 1)
  }
  for (let r = 0; r < rows; r++) R(c, out ? '#2e3440' : '#b8c8d4', dx, dy + 4 + r * 5, dw, 1)              // the shelves
  if (!out) R(c, 'rgba(255,255,255,.7)', dx, dy, 1, dh)
  const py = dy + dh + 2
  if (py + 4 < y - 6) { R(c, '#c8ccd4', x + w - 6, py, 4, 6); R(c, '#1a1e2a', x + w - 5, py + 1, 2, 1); R(c, out ? '#5a1a1a' : '#5aff8a', x + w - 5, py + 3, 2, 1) }  // coins, the readout
  R(c, '#14161e', x + 2, y - 5, w - 8, 3); R(c, lo, x + 2, y - 2, w - 8, 1)                               // the take-out slot
  return { x: dx, y: dy, w: dw, h: dh }                                                                   // the display, for its glow
}

// ---------- street things ----------
export function bicycle(c, x, y, col = '#3a7ac8', dir = 1) {
  const wheel = cx => { R(c, '#22242a', cx - 3, y - 7, 6, 1); R(c, '#22242a', cx - 3, y - 1, 6, 1); R(c, '#22242a', cx - 4, y - 6, 1, 5); R(c, '#22242a', cx + 3, y - 6, 1, 5); R(c, '#8a8e98', cx, y - 4, 1, 1) }
  wheel(x + 4); wheel(x + 16)
  const f = (a, b) => R(c, col, x + (dir > 0 ? a : 20 - a), b, 1, 1)
  for (let i = 0; i < 7; i++) { f(4 + i, y - 4 - Math.floor(i / 2)); f(10 + i, y - 7 + Math.floor(i / 3)) }
  for (let i = 0; i < 4; i++) f(15 - Math.floor(i / 2), y - 8 - i)
  R(c, '#22242a', x + (dir > 0 ? 6 : 12), y - 10, 3, 1)                                                         // saddle
  R(c, '#8a8e98', x + (dir > 0 ? 12 : 6), y - 12, 3, 1); R(c, '#b8bcc4', x + (dir > 0 ? 15 : 3), y - 11, 2, 3)     // bars and the basket
  R(c, '#6a6e78', x + (dir > 0 ? 15 : 2), y - 10, 3, 2)
}
// a ramen yatai, its left end at x: big spoked wheels, a light wooden cart, a counter with the stock pot and bowls, a little
// tiled roof on two posts with a white noren and a red lantern at its corner (the steam is drawn live, from x + 26, y - 26)
export function yatai(c, x, y) {
  const wood = '#b07a48', woodD = '#7a4e2a', woodL = '#d8a868', post = '#5a3a22'
  R(c, 'rgba(0,0,0,.25)', x - 1, y, 38, 1)
  R(c, post, x + 1, y - 42, 2, 24); R(c, post, x + 31, y - 42, 2, 24)                                 // the posts
  R(c, woodD, x, y - 18, 34, 12); R(c, wood, x + 1, y - 17, 32, 10)
  for (let k = x + 4; k < x + 32; k += 7) R(c, woodD, k, y - 17, 1, 10)
  R(c, woodL, x + 1, y - 17, 32, 1)
  R(c, woodL, x - 2, y - 20, 38, 2); R(c, woodD, x - 2, y - 18, 38, 1)                                // the counter
  R(c, '#8a9098', x + 22, y - 26, 9, 6); R(c, '#b8bec8', x + 22, y - 26, 9, 1); R(c, '#5a6068', x + 23, y - 22, 7, 1)   // the stock pot
  for (const bx of [x + 4, x + 12]) { R(c, '#f0e8d8', bx, y - 23, 6, 3); R(c, '#c83a2a', bx, y - 22, 6, 1); R(c, '#e8b860', bx + 1, y - 23, 4, 1) }   // bowls
  R(c, '#d8c098', x + 15, y - 26, 1, 4); R(c, '#d8c098', x + 16, y - 26, 1, 4)
  for (const wx of [x + 7, x + 27]) {                                                                 // spoked wheels
    R(c, '#3a2418', wx - 4, y - 8, 9, 8); R(c, woodL, wx - 3, y - 7, 7, 6); R(c, '#3a2418', wx - 2, y - 6, 5, 4)
    R(c, woodL, wx, y - 6, 1, 4); R(c, woodL, wx - 2, y - 4, 5, 1); R(c, '#3a2418', wx, y - 4, 1, 1)
  }
  for (let r = 0; r < 5; r++) R(c, r === 4 ? '#6a728e' : '#4e556e', x - 5 + r, y - 42 - r, 44 - 2 * r, 1)   // the little roof
  R(c, '#33384c', x - 5, y - 41, 44, 1); R(c, '#4e556e', x - 6, y - 43, 2, 2); R(c, '#4e556e', x + 38, y - 43, 2, 2)
  for (let p = 0; p < 4; p++) { const nx = x + 3 + p * 7; R(c, '#f0e8d8', nx, y - 40, 6, 8); R(c, '#ffffff', nx, y - 40, 6, 1); R(c, '#d8ccb4', nx, y - 33, 6, 1) }
  R(c, '#c8302a', x + 15, y - 38, 3, 3)
  chochin(c, x - 3, y - 40)
}
export function chochin(c, cx, y) {            // a red paper lantern hung at (cx, y): caps, ribs, a highlight, its mark
  R(c, INK, cx - 2, y, 5, 1)
  R(c, VERM, cx - 3, y + 1, 7, 8); R(c, VERM, cx - 4, y + 2, 9, 6)
  R(c, '#8c2e1f', cx - 4, y + 3, 9, 1); R(c, '#8c2e1f', cx - 4, y + 6, 9, 1); R(c, '#e46a4c', cx - 2, y + 2, 1, 5)
  R(c, INK, cx, y + 3, 1, 4); R(c, INK, cx - 1, y + 4, 3, 1)
  R(c, INK, cx - 2, y + 9, 5, 1)
}
// a big izakaya lantern (aka-chōchin), taller and with a glyph-like brush mark down it
export function akachochin(c, cx, y) {
  R(c, INK, cx - 3, y, 7, 2)
  for (let r = 0; r < 14; r++) { const w = r < 2 || r > 11 ? 4 : r < 4 || r > 9 ? 5 : 6; R(c, r % 4 === 3 ? '#a8301f' : VERM, cx - w + 1, y + 2 + r, 2 * w - 1, 1) }
  R(c, '#e46a4c', cx - 3, y + 4, 1, 8)
  R(c, INK, cx, y + 4, 1, 3); R(c, INK, cx - 1, y + 8, 3, 1); R(c, INK, cx, y + 10, 1, 3)
  R(c, INK, cx - 3, y + 16, 7, 2)
}

// ---------- the neighbours: machiya, the konbini, the izakaya ----------
export const kindOf = b => b.i === 1 ? 'konbini' : b.i === 2 ? 'izakaya' : 'machiya'
const MACHIYA = [['#8a5a3c', '#5e3c28', '#3c2a22'], ['#e8dfca', '#b8a88a', '#5a4232'], ['#6e4a34', '#4a3224', '#2e2018'], ['#ddd2b8', '#ab9c80', '#4a3426']]
export const styleOf = b => kindOf(b) === 'konbini' ? ['#eeebe4', '#c4beb4', '#3a8a5a'] : kindOf(b) === 'izakaya' ? ['#5a3a2a', '#3a2418', '#2a1a12'] : MACHIYA[b.seed % MACHIYA.length]
const wooden = b => kindOf(b) === 'machiya' && MACHIYA.indexOf(styleOf(b)) % 2 === 0
export function windowOf(c, x, y, draft, b) {
  if (b && kindOf(b) === 'konbini') {   // flats over the shop: glass, a curtain
    R(c, draft ? '#8a9aac' : '#a8c4da', x, y, 12, 14); R(c, draft ? '#9aa4b0' : '#e8d8b8', x, y, 4, 14); R(c, '#ffffff', x + 6, y + 2, 1, 4); R(c, '#7a8494', x, y + 13, 12, 1); return
  }
  if (b && wooden(b)) {                 // koshi: close vertical slats over warm paper
    R(c, draft ? '#9a9488' : '#f0d8a8', x, y, 12, 14)
    for (let k = x; k < x + 12; k += 2) R(c, draft ? '#5a544c' : '#4a3020', k, y, 1, 14)
    R(c, '#3a2418', x, y + 6, 12, 1); return
  }
  R(c, draft ? '#c4c8d2' : WASHI, x, y, 12, 14); R(c, draft ? '#b2b8c4' : '#e6dabe', x, y + 10, 12, 4)
  const k = draft ? '#6a6e7a' : '#6a4a36'
  R(c, k, x + 4, y, 1, 14); R(c, k, x + 8, y, 1, 14); R(c, k, x, y + 4, 12, 1); R(c, k, x, y + 9, 12, 1)
}
// the ground floor (y -40 .. 0; the name board covers -40 .. -27 in the middle)
export function frontOf(c, b) {
  const x0 = b.x0, w = b.w, kind = kindOf(b), [body, dark] = styleOf(b)
  // a short tiled eave over the shop, under the first storey's windows
  for (let r = 0; r < 3; r++) R(c, r ? '#4e556e' : '#6a728e', x0 - 3 + r, -44 + r, w + 6 - 2 * r, 1)
  R(c, 'rgba(0,0,0,.3)', x0, -41, w, 1)
  if (kind === 'konbini') {
    for (const [k, col] of [[0, '#3a7ac8'], [1, '#f4f4f0'], [2, '#4aa86a']]) R(c, col, x0, -47 + k, w, 1)   // the fascia's three stripes (no brand)
    R(c, dark, x0 + 2, -27, w - 4, 27)
    const gx = x0 + 44, gw = w - 74
    R(c, '#2a3040', gx - 1, -25, gw + 2, 25); R(c, '#dff0fa', gx, -24, gw, 24)
    for (let s = 0; s < 3; s++) {                                                                       // shelves of goods through the glass
      R(c, '#b8c4cc', gx, -18 + s * 6, gw, 1)
      for (let k = gx + 1; k < gx + gw - 1; k += 2) R(c, BOTTLES[(k * 7 + s * 3 + b.seed) % BOTTLES.length], k, -21 + s * 6, 1, 3)
    }
    R(c, 'rgba(255,255,255,.6)', gx + 2, -23, 1, 10); R(c, 'rgba(255,255,255,.6)', gx + 4, -23, 1, 5)
    const dx = x0 + w - 28                                                                              // the automatic door
    R(c, '#5a6270', dx - 1, -26, 18, 26); R(c, '#cfe6f4', dx, -25, 16, 25); R(c, '#5a6270', dx + 8, -25, 1, 25); R(c, '#3aa86a', dx, -26, 16, 1)
    VEND.forEach((col, k) => jihanki(c, x0 + 4 + k * 14, 0, 13, 26, col, { seed: b.seed + k }))
    R(c, '#5a6270', x0 + w - 9, -10, 6, 10); R(c, '#3a7ac8', x0 + w - 9, -10, 6, 2)                           // a recycling bin
    bicycle(c, x0 + 44, 0, '#c8302a', 1)
    return
  }
  if (kind === 'izakaya') {
    R(c, '#2a1a12', x0 + 3, -27, w - 6, 27)
    const sx = x0 + 10, sw = Math.max(20, w / 2 - 22)                                                  // a lit shoji window
    R(c, '#1e140e', sx - 1, -24, sw + 2, 16); R(c, '#f4dcae', sx, -23, sw, 14)
    for (let k = sx + 4; k < sx + sw; k += 5) R(c, '#6a4a30', k, -23, 1, 14); R(c, '#6a4a30', sx, -16, sw, 1)
    const dx = x0 + w / 2 + 6                                                                           // the sliding door under a red noren
    R(c, '#4a3020', dx, -26, 22, 26); R(c, '#e8c88a', dx + 2, -24, 18, 22); for (let k = dx + 4; k < dx + 20; k += 3) R(c, '#5a3a22', k, -24, 1, 22)
    R(c, '#5a3a22', dx + 10, -24, 1, 22)
    for (let p = 0; p < 3; p++) { R(c, '#c8302a', dx + 1 + p * 7, -26, 6, 9); R(c, '#e8483a', dx + 1 + p * 7, -26, 6, 1) }
    R(c, WASHI, dx + 9, -23, 4, 3)
    akachochin(c, dx - 5, -26); akachochin(c, dx + 28, -26)
    // a standing menu board: wood, its marks brushed in rows
    const mx = x0 + w - 14
    if (mx > dx + 34) { R(c, '#4a3020', mx, -16, 9, 16); R(c, '#e8dcc0', mx + 1, -15, 7, 10); for (let r = 0; r < 4; r++) R(c, INK, mx + 2, -14 + r * 2 + (r > 1 ? 1 : 0), 3 + (r % 2) * 2, 1) }
    else { R(c, '#7a5a3a', x0 + 6, -6, 8, 6); R(c, '#c8a060', x0 + 6, -6, 8, 1) }                         // a crate of empties
    return
  }
  // machiya: posts, a koshi lattice across the front, an indigo noren on the door, inuyarai at the foot
  R(c, '#2a1c14', x0 + 3, -27, w - 6, 27)
  const lx = x0 + 6, lw = w / 2 - 6
  R(c, '#f0d8a8', lx, -25, lw, 20); for (let k = lx; k < lx + lw; k += 2) R(c, '#3c2818', k, -25, 1, 20)
  R(c, '#3c2818', lx, -18, lw, 1); R(c, '#3c2818', lx, -11, lw, 1)
  const dx = x0 + w / 2 + 5
  R(c, '#5a4030', dx, -24, 16, 24); R(c, '#3a2818', dx + 7, -24, 1, 24)
  R(c, INDIGO, dx, -24, 16, 8); R(c, '#41548c', dx, -24, 16, 1); for (const x of [dx + 5, dx + 10]) R(c, '#1e2a4a', x, -20, 1, 4); R(c, WASHI, dx + 7, -22, 2, 2)
  // inuyarai: a low curved bamboo fence along the foot of the lattice
  for (let k = lx; k < lx + lw - 1; k += 3) { R(c, '#8a6a3a', k, -5, 1, 5); R(c, '#a8844a', k, -6, 2, 1) }
  R(c, '#6a4a2a', lx, -3, lw - 1, 1)
  if (b.seed % 3 === 0) bicycle(c, x0 + w - 22, 0, '#5a8a5a', -1)
  else { R(c, '#7a5a3a', x0 + w - 13, -7, 8, 7); R(c, '#4a7a3a', x0 + w - 12, -11, 6, 4); R(c, '#e8a0b8', x0 + w - 11, -12, 2, 1) }   // a planter
}
const VEND = ['red', 'blue', 'white']
export function frontLight(c, b, now) {
  const x0 = b.x0, w = b.w, kind = kindOf(b)
  if (kind === 'konbini') {
    c.fillStyle = 'rgba(235,248,255,.7)'; c.fillRect(x0 + 44, -24, w - 74, 24); c.fillRect(x0 + w - 28, -25, 16, 25)
    c.fillStyle = 'rgba(220,240,255,.65)'; for (let k = 0; k < 3; k++) c.fillRect(x0 + 6 + k * 14, -21, 9, 13)
    glowPool(c, x0 + w / 2, -14, w * 0.55, '220,240,255', 0.3)
  } else if (kind === 'izakaya') {
    c.fillStyle = 'rgba(255,200,130,.55)'; c.fillRect(x0 + 10, -23, Math.max(20, w / 2 - 22), 14); c.fillRect(x0 + w / 2 + 8, -24, 18, 22)
    for (const lx of [x0 + w / 2 + 1, x0 + w / 2 + 34]) { glowPool(c, lx, -18, 18, '255,90,60', 0.6); c.fillStyle = 'rgba(255,140,90,.8)'; c.fillRect(lx - 3, -23, 7, 10) }
  } else { c.fillStyle = 'rgba(255,196,120,.38)'; c.fillRect(x0 + 6, -25, w / 2 - 6, 20) }
}
export function glowPool(c, x, y, r, col, a) { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }

// ---------- interiors ----------
// a bonsai: a twisted trunk and cloud pads over a shallow glazed pot (on a little stand when tall)
export function bonsai(c, x, y, tall) {
  const pot = '#3a4a6a', potHi = '#5a6a8a', trunk = '#5a3a26', g = ['#2f5e2e', '#3f7a3a', '#5a9448']
  let by = y
  if (tall) { R(c, '#4a3020', x, y - 10, 14, 2); R(c, '#4a3020', x + 1, y - 8, 2, 8); R(c, '#4a3020', x + 11, y - 8, 2, 8); R(c, '#6a4a30', x, y - 10, 14, 1); by = y - 10 }
  R(c, pot, x + 1, by - 4, 12, 4); R(c, potHi, x, by - 5, 14, 1); R(c, '#2a3450', x + 2, by - 1, 10, 1)
  const s = tall ? 1.3 : 1
  const tr = [[7, 0], [6, -1], [6, -2], [5, -3], [5, -4], [6, -5], [7, -6], [8, -7], [8, -8], [7, -9], [6, -10]]
  for (const [dx, dy] of tr) if (-dy * s < 14 * s) R(c, trunk, x + dx, Math.round(by - 6 + dy * s), 2, Math.ceil(s))
  const pad = (cx, cy, w) => { R(c, g[0], cx - w, cy, 2 * w, 2); R(c, g[1], cx - w + 1, cy - 1, 2 * w - 2, 2); R(c, g[2], cx - w + 2, cy - 1, Math.max(1, w - 1), 1) }
  pad(x + 4, Math.round(by - 9 * s), Math.round(4 * s)); pad(x + 11, Math.round(by - 12 * s), Math.round(3 * s)); pad(x + 7, Math.round(by - 16 * s), Math.round(4 * s))
}
export function daruma(c, x, y, col = '#c8302a', big = false) {   // feet at (x, y)
  const w = big ? 9 : 7, h = big ? 10 : 8
  for (let r = 0; r < h; r++) { const k = r < 2 ? (big ? 2 : 1) : r > h - 2 ? 1 : 0; R(c, col, x + k, y - h + r, w - 2 * k, 1) }
  R(c, '#f4e8d0', x + 2, y - h + 2, w - 4, big ? 4 : 3)                                                  // the face
  R(c, INK, x + 2, y - h + 3, 1, 1)                                                                      // one eye painted in
  R(c, '#e8b84a', x + 1, y - 3, w - 2, 1)
}
export function manekiNeko(c, x, y, wave) {   // a beckoning cat sat on (x .. x + 7, y), its right paw raised, up or down
  const W = '#fbf8f2', E = '#2a2226', O = '#e8a040', P = '#f0a0a8'
  R(c, W, x, y - 6, 7, 6); R(c, W, x, y - 11, 7, 5)
  R(c, W, x, y - 12, 2, 1); R(c, W, x + 5, y - 12, 2, 1); R(c, P, x + 1, y - 12, 1, 1); R(c, P, x + 5, y - 12, 1, 1)  // ears
  R(c, O, x, y - 11, 3, 2); R(c, E, x + 1, y - 9, 1, 1); R(c, E, x + 5, y - 9, 1, 1); R(c, P, x + 3, y - 8, 1, 1)
  R(c, '#d8302a', x, y - 6, 7, 1); R(c, '#f4c43a', x + 3, y - 5, 1, 1)                                     // collar and bell
  R(c, '#f4c43a', x, y - 4, 2, 3); R(c, '#c89a2a', x, y - 2, 2, 1)                                         // the koban it holds
  R(c, '#e8e2d6', x + 1, y - 1, 5, 1)
  if (wave) { R(c, W, x + 7, y - 13, 2, 3); R(c, W, x + 7, y - 10, 1, 3); R(c, P, x + 7, y - 13, 1, 1) } else { R(c, W, x + 7, y - 10, 2, 3); R(c, W, x + 7, y - 7, 1, 2) }
}
// a sakura branch in a tall vase, the vase's foot at (x, y), the branch reaching up and right
export function sakuraVase(c, x, y) {
  R(c, '#2a3450', x, y - 12, 6, 12); R(c, '#4a5a7a', x + 1, y - 12, 1, 11); R(c, '#2a3450', x + 1, y - 13, 4, 1)
  const pts = []
  for (let i = 0; i < 26; i++) { const px = x + 3 + Math.round(i * 0.75), py = y - 13 - i; pts.push([px, py]); R(c, '#4a3028', px, py, 1, 1) }
  for (let i = 0; i < 12; i++) { const px = x + 10 + i, py = y - 22 - Math.round(i * 0.35); pts.push([px, py]); R(c, '#4a3028', px, py, 1, 1) }
  for (let i = 0; i < 8; i++) { const px = x + 1 - Math.round(i * 0.5), py = y - 24 - i; pts.push([px, py]); R(c, '#4a3028', px, py, 1, 1) }
  pts.forEach(([px, py], i) => { if (i % 2) return; const r = rnd(i * 3.3); R(c, r > 0.5 ? '#f7c0d2' : '#fde4ec', px - 1 + (i % 4 ? 1 : 0), py - 1, 2, 2); if (r > 0.75) R(c, '#e2869f', px, py, 1, 1) })
}
