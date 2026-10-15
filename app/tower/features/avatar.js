// avatar: the user's own look in the CEO office. --avatar "hair=bun,haircolour=red,suit=navy,skin=3,glasses=round,pet=cat"
// on the server or the ⚙ settings panel (snap.avatar), or ?avatar=... on the URL (wins), restyles char_0: hair (short, long, bun, curly, bald,
// mohawk), hair colour, suit (charcoal, navy, burgundy, forest, cream), skin tone 1..6, glasses (none, round, square),
// and a pet (none, cat, dog, claudio) that naps in a basket by the sofa. Unset keys keep today's look. tower.avatar.sheet()
// is the restyled full sheet (tower.js seats it; walkers can use it too). ?demo=avatar cycles looks in a close-up.
import { IX } from '../building.js'
import { AVATAR as OPTS } from '../../options.js'

const ALIAS = { haircolor: 'haircolour', hc: 'haircolour', colour: 'haircolour', color: 'haircolour', tone: 'skin', specs: 'glasses' }
const DEFAULT = { hair: 'short', haircolour: 'brown', suit: 'charcoal', skin: '2', glasses: 'none', pet: 'none' }
const PRESETS = [
  'hair=bun,haircolour=red,suit=navy,skin=3,glasses=round,pet=cat',
  'hair=bald,suit=burgundy,skin=5,glasses=square,pet=dog',
  'hair=long,haircolour=blonde,suit=cream,skin=1,pet=claudio',
  'hair=mohawk,haircolour=pink,suit=forest,skin=4,glasses=square,pet=cat',
  'hair=curly,haircolour=black,suit=charcoal,skin=6,glasses=round,pet=dog',
  'hair=short,haircolour=grey,suit=navy,skin=2,glasses=round',
  'hair=long,haircolour=blue,suit=burgundy,skin=3,pet=claudio',
  '',
]
export function parseLook(v) {
  const out = { ...DEFAULT }
  const src = typeof v === 'string' ? Object.fromEntries(v.split(/[,;&]/).map(p => p.split(/[=:]/).map(s => s.trim().toLowerCase())).filter(p => p[0])) : (v || {})
  for (let [k, val] of Object.entries(src)) {
    k = ALIAS[k] || k; val = String(val ?? '').toLowerCase()
    if (k === 'haircolour' && val === 'gray') val = 'grey'
    if (OPTS[k]?.includes(val)) out[k] = val
  }
  return out
}
const lookKey = l => Object.keys(DEFAULT).map(k => `${k}=${l[k]}`).join(',')
const shortKey = l => Object.keys(DEFAULT).filter(k => l[k] !== DEFAULT[k]).map(k => `${k}=${l[k]}`).join(',')

// ---------- char_0's palette ----------
const K = (r, g, b) => (r << 16) | (g << 8) | b
const HI = K(177, 134, 73), MID = K(143, 100, 57), DK = K(109, 71, 38), OUT = K(50, 25, 29)
const HAIR = new Map([[HI, 0], [MID, 1], [DK, 2], [K(111, 74, 42), 2]])
const OUTLINE = new Set([OUT, K(52, 31, 32)])
const SK = K(233, 163, 132), SKHI = K(251, 191, 151), SKLO = K(197, 137, 110)
const SKIN = new Set([SK, SKHI, SKLO, K(255, 216, 178), K(226, 152, 120), K(132, 82, 58)])
const SKIN_BASE = [251, 191, 151]
const SKIN_TONES = { 1: [255, 222, 196], 2: SKIN_BASE, 3: [222, 160, 114], 4: [188, 126, 84], 5: [142, 92, 60], 6: [100, 64, 44] }
const HAIR_RAMP = {
  black: [[74, 64, 66], [50, 42, 46], [34, 28, 32]], blonde: [[248, 218, 128], [224, 184, 92], [182, 140, 62]],
  red: [[226, 122, 58], [186, 86, 40], [138, 58, 30]], grey: [[200, 200, 204], [162, 162, 168], [122, 122, 130]],
  white: [[246, 246, 242], [220, 220, 216], [184, 184, 180]], pink: [[250, 156, 200], [226, 112, 168], [178, 78, 130]],
  blue: [[112, 172, 240], [72, 132, 212], [46, 92, 162]],
}
// suit = dark + luminance * gain per channel; charcoal is the recolour tower.js has always used
const SUITS = {
  charcoal: [[26, 0.42], [26, 0.42], [34, 0.46]], navy: [[8, 0.2], [18, 0.33], [46, 0.62]],
  burgundy: [[52, 0.7], [10, 0.18], [22, 0.26]], forest: [[14, 0.24], [42, 0.5], [26, 0.3]], cream: [[96, 1.45], [86, 1.4], [64, 1.25]],
}
const GLASS = { round: K(58, 40, 30), square: K(18, 18, 26) }

function restyle(src, look) {
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
  const x = cv.getContext('2d'); x.drawImage(src, 0, 0)
  const img = x.getImageData(0, 0, cv.width, cv.height), d = img.data, W = cv.width
  const cols = Math.floor(W / 16), rows = Math.floor(cv.height / 32)
  const heads = []
  for (let r = 0; r < rows; r++) for (let f = 0; f < cols; f++) heads.push(headOf(cell(d, W, f * 16, r * 32), r))
  for (let r = 0; r < rows; r++) for (let f = 0; f < cols; f++) shape(d, W, f * 16, r * 32, r, look, heads[r * cols + f])
  colour(d, look)
  if (look.glasses !== 'none') for (let r = 0; r < rows; r++) for (let f = 0; f < cols; f++) if (r !== 1 && f < 5) glasses(d, W, f * 16, r * 32, r, look.glasses, heads[r * cols + f])
  x.putImageData(img, 0, 0)
  return cv
}
function cell(d, W, ox, oy) {
  const i = (x, y) => ((oy + y) * W + ox + x) * 4
  const ok = (x, y) => x >= 0 && x < 16 && y >= 0 && y < 32
  return {
    get: (x, y) => { if (!ok(x, y)) return null; const j = i(x, y); return d[j + 3] ? K(d[j], d[j + 1], d[j + 2]) : -1 },
    put: (x, y, c) => { if (!ok(x, y)) return; const j = i(x, y); if (c == null) { d[j + 3] = 0; return } d[j] = c >> 16 & 255; d[j + 1] = c >> 8 & 255; d[j + 2] = c & 255; d[j + 3] = 255 },
  }
}
function headOf(g, view) {
  let x0 = 16, x1 = -1, y0 = 32, y1 = -1
  for (let y = 0; y < 26; y++) for (let x = 0; x < 16; x++) if (HAIR.has(g.get(x, y))) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y) }
  if (x1 < 0) return null
  let face = view === 1 ? y1 - 3 : 32
  if (view !== 1) for (let y = y0; y <= y1 + 3 && face === 32; y++) for (let x = x0; x <= x1; x++) if (SKIN.has(g.get(x, y))) { face = y; break }
  return { x0, x1, y0, y1, face: face === 32 ? y1 : face, cx: Math.round((x0 + x1) / 2) }
}
const N4 = [[0, -1], [-1, 0], [1, 0], [0, 1]]
function reoutline(g, h, bottom) {
  for (let pass = 0; pass < 2; pass++) for (let y = 0; y <= bottom; y++) for (let x = 0; x < 16; x++) {
    if (!OUTLINE.has(g.get(x, y))) continue
    if (!N4.some(([dx, dy]) => { const c = g.get(x + dx, y + dy); return c != null && c !== -1 && !OUTLINE.has(c) })) g.put(x, y, null)
  }
  const add = []
  for (let y = 0; y <= bottom; y++) for (let x = 0; x < 16; x++) if (g.get(x, y) === -1 && N4.some(([dx, dy]) => { const c = g.get(x + dx, y + dy); return HAIR.has(c) || (SKIN.has(c) && y + dy < h.face) })) add.push([x, y])
  for (const [x, y] of add) g.put(x, y, OUT)
}
function shape(d, W, ox, oy, view, look, h) {
  const style = look.hair; if (style === 'short' || !h) return
  const g = cell(d, W, ox, oy)
  const side = view === 2, top = h.y0 + 3
  if (style === 'bald' || style === 'bun' || style === 'mohawk') {
    for (let y = h.y0; y <= h.y1; y++) for (let x = h.x0; x <= h.x1; x++) {
      const c = g.get(x, y), inside = y >= top && x > h.x0 && x < h.x1 && !(y === top && (x === h.x0 + 1 || x === h.x1 - 1))
      if (!HAIR.has(c) && !(OUTLINE.has(c) && inside && (view === 1 || y < h.face))) continue
      if (!inside) g.put(x, y, null)
      else if (style === 'bun' && OUTLINE.has(c)) g.put(x, y, DK)
      else if (style !== 'bun') g.put(x, y, y <= top + 1 && x <= h.cx ? SKHI : x >= h.x1 - 2 ? SKLO : SK)
    }
    if (style === 'mohawk') {
      if (side) for (let x = h.x0 + 2; x <= h.x1 - 3; x++) for (let y = top - 2 + (x % 2); y <= top; y++) g.put(x, y, y === top - 2 + (x % 2) ? HI : MID)
      else for (let y = top - 3; y <= top + 1; y++) for (const x of [h.cx - 1, h.cx]) if (y > top - 3 || x === h.cx - 1) g.put(x, y, x === h.cx - 1 ? HI : MID)
    }
    if (style === 'bun') {
      const bx = side ? h.x0 + 3 : h.cx
      for (const [dy, w] of [[-4, 1], [-3, 2], [-2, 2], [-1, 1]]) for (let dx = -w; dx <= w; dx++) g.put(bx + dx, top + dy, dy < -2 && dx < 0 ? HI : dy === -1 || dx > 0 ? DK : MID)
    }
    reoutline(g, h, h.y1 + 1)
  } else if (style === 'long') {
    const end = h.y1 + (view === 1 ? 6 : 7)
    for (let y = h.y1 + 1; y <= end; y++) {
      const last = y === end
      const xs = view === 1 ? range(h.x0, h.x1).filter(x => !last || x % 2 === 0) : side ? range(h.x0, h.x0 + 3 - (last ? 2 : 0)) : [h.x0, h.x0 + 1, h.x1 - 1, h.x1].filter((x, k) => !last || k === 0 || k === 3)
      for (const x of xs) g.put(x, y, x === h.x0 || x === h.x1 || x % 3 === 0 ? DK : x % 3 === 1 ? MID : HI)
    }
    reoutline(g, { ...h, face: -1 }, end + 1)
  } else if (style === 'curly') {
    const scallop = []
    for (let y = 0; y <= h.y1; y++) for (let x = 0; x < 16; x++) {
      if (!OUTLINE.has(g.get(x, y)) || (x + y) % 2 || !N4.some(([dx, dy]) => HAIR.has(g.get(x + dx, y + dy)))) continue
      const out = N4.find(([dx, dy]) => g.get(x + dx, y + dy) === -1 && dy <= 0)
      if (out && y < h.face) scallop.push([x, y, out])
    }
    for (const [x, y, [dx, dy]] of scallop) { g.put(x, y, MID); g.put(x + dx, y + dy, OUT) }
    for (let y = h.y0; y <= h.y1; y++) for (let x = h.x0; x <= h.x1; x++) if (HAIR.has(g.get(x, y))) {
      if ((x * 7 + y * 3) % 5 === 0) g.put(x, y, DK); else if ((x * 3 + y * 5) % 7 === 0) g.put(x, y, HI)
    }
  }
}
const range = (a, b) => Array.from({ length: Math.max(0, b - a + 1) }, (_, i) => a + i)
function colour(d, look) {
  const ramp = HAIR_RAMP[look.haircolour], tone = SKIN_TONES[look.skin], [sr, sg, sb] = SUITS[look.suit]
  const k = tone.map((v, i) => v / SKIN_BASE[i]), tinted = look.skin !== '2'
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const r = d[i], g = d[i + 1], b = d[i + 2], c = K(r, g, b)
    if (ramp && HAIR.has(c)) { const t = ramp[HAIR.get(c)]; d[i] = t[0]; d[i + 1] = t[1]; d[i + 2] = t[2] }
    else if (tinted && SKIN.has(c)) { d[i] = Math.min(255, Math.round(r * k[0])); d[i + 1] = Math.min(255, Math.round(g * k[1])); d[i + 2] = Math.min(255, Math.round(b * k[2])) }
    else if (b > r + 30 && b > g + 10) { const l = (r + g + b) / 3; d[i] = Math.min(255, Math.round(sr[0] + l * sr[1])); d[i + 1] = Math.min(255, Math.round(sg[0] + l * sg[1])); d[i + 2] = Math.min(255, Math.round(sb[0] + l * sb[1])) }
  }
}
function glasses(d, W, ox, oy, view, kind, h) {
  if (!h) return
  const g = cell(d, W, ox, oy)
  const eyes = []
  for (let y = h.face - 2; y <= h.face + 3; y++) for (let x = h.x0; x <= h.x1; x++) if (g.get(x, y) === 0) {
    const e = eyes.find(e => x >= e.x0 - 2 && x <= e.x1 + 2)
    if (e) Object.assign(e, { x0: Math.min(e.x0, x), x1: Math.max(e.x1, x), y0: Math.min(e.y0, y), y1: Math.max(e.y1, y) })
    else eyes.push({ x0: x, x1: x, y0: y, y1: y })
  }
  if (!eyes.length || eyes.length > 2) return
  const col = GLASS[kind], lens = c => c === 0 ? K(79, 79, 79) : c > 0 ? K(...[c >> 16 & 255, c >> 8 & 255, c & 255].map(v => Math.round(v + (255 - v) * 0.45))) : c
  const y = Math.min(...eyes.map(e => e.y0))
  for (const e of eyes) for (let x = e.x0 - 1; x <= e.x1 + 1; x++) {
    const rim = x === e.x0 - 1 || x === e.x1 + 1, corner = kind === 'round' && rim
    if (!corner) { g.put(x, y - 1, col); g.put(x, y + 1, col) }
    const c = g.get(x, y); g.put(x, y, rim ? col : lens(c))
  }
  eyes.sort((p, q) => p.x0 - q.x0)
  if (view === 2) for (let x = eyes[0].x0 - 2; x >= eyes[0].x0 - 4; x--) { if (g.get(x, y) > -1) g.put(x, y, col) }
  else if (eyes.length === 2) for (const x of [eyes[0].x0 - 2, eyes[1].x1 + 2, ...range(eyes[0].x1 + 2, eyes[1].x0 - 2)]) if (g.get(x, y) > -1) g.put(x, y, col)
}

// ---------- the pet ----------
const PETS = {
  cat: { img: 'pet_gitcat', name: 'Mochi', kind: 'office cat', emoji: '🐈' },
  dog: { img: 'pet_claudio', name: 'Biscuit', kind: 'office dog', emoji: '🐕' },
  claudio: { img: 'pet_claudio', name: 'Claudio', kind: 'up from the lounge for a visit', emoji: '🐕' },
}
function petSheet(src, kind) {
  if (kind === 'claudio') return src
  const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
  const x = cv.getContext('2d'); x.drawImage(src, 0, 0)
  const img = x.getImageData(0, 0, cv.width, cv.height), d = img.data
  const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))))
  for (let i = 0; i < d.length; i += 4) {
    if (!d[i + 3]) continue
    const r = d[i], g = d[i + 1], b = d[i + 2], l = (r + g + b) / 3
    if (r > 180 && b > 110 && r > g + 30) continue   // pink ears and nose
    const c = kind === 'cat' ? (l > 140 ? null : lerp([52, 24, 14], [232, 136, 58], (l - 18) / 52)) : lerp([36, 20, 14], [150, 98, 60], l / 170)
    if (c) { d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2] }
  }
  x.putImageData(img, 0, 0)
  return cv
}

export default function init(api, tower) {
  const { Z } = tower
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1))
  const demo = params.getAll('demo').includes('avatar'), forced = params.get('avatar')
  let look = parseLook(forced || ''), key = null, sheet = null, pets = {}, demoAt = 0, demoIdx = -1
  const previews = new Map()
  tower.avatar = {
    get look() { return { ...look } },
    sheet() {
      const src = api.charSheet(0, 0); if (!src?.width) return null
      const k = lookKey(look); if (k !== key) { key = k; sheet = restyle(src, look) }
      return sheet
    },
    // a restyled sheet for any look, for the settings panel's preview
    preview(v) {
      const src = api.charSheet(0, 0); if (!src?.width) return null
      const l = parseLook(v), k = lookKey(l)
      if (!previews.has(k)) { if (previews.size > 40) previews.clear(); previews.set(k, restyle(src, l)) }
      return previews.get(k)
    },
  }
  tower.on('sync', snap => { if (!forced && !demo) look = parseLook(snap.avatar || '') })

  // the pet's day: naps in its basket, now and then pads over and curls up on the sofa; sits up when the phone rings
  const pet = { x: IX + 92, st: 'nap', until: 0, to: null, dir: 'right', lift: 0, hop: 0, pat: 0 }
  const BASKET = IX + 92, SOFA = IX + 126, SOFA_H = 12, SPEED = 18
  const floor = () => tower.slots?.floor
  const ringing = () => (tower.snapshot?.sessions || []).some(s => s.state === 'attention' && s.running !== false)
  const petImg = kind => { const src = api.img?.[PETS[kind].img]; if (!src?.width) return null; return pets[kind] ??= petSheet(src, kind) }
  tower.on('step', (dt, now) => {
    if (demo && now > demoAt) { demoAt = now + 3500; demoIdx = (demoIdx + 1) % PRESETS.length; look = parseLook(PRESETS[demoIdx]) }
    if (look.pet === 'none') return
    if (!pet.until) pet.until = now + (demo ? 4000 : 30_000 + Math.random() * 60_000)
    if (pet.st === 'walk') {
      const dx = pet.to - pet.x, step = SPEED * dt
      pet.dir = dx < 0 ? 'left' : 'right'
      if (Math.abs(dx) <= step) { pet.x = pet.to; pet.st = pet.to === SOFA ? 'hop' : 'nap'; pet.hop = now; pet.until = now + (demo ? 5000 : 40_000 + Math.random() * 80_000) }
      else pet.x += Math.sign(dx) * step
    } else if (pet.st === 'hop') {
      const k = Math.min(1, (now - pet.hop) / 350); pet.lift = pet.down ? SOFA_H * (1 - k) : SOFA_H * k
      if (k >= 1) { if (pet.down) { pet.down = false; pet.st = 'walk'; pet.to = BASKET } else pet.st = 'sofa' }
    } else if (now > pet.until) {
      if (pet.st === 'sofa') { pet.st = 'hop'; pet.down = true; pet.hop = now }
      else { pet.st = 'walk'; pet.to = SOFA }
    }
  })
  const petPos = () => { const f = floor(); return f && { x: pet.x, y: f.y - Math.round(pet.lift) } }
  tower.on('items', (out, now) => {
    const f = floor(); if (!f || look.pet === 'none') return
    out.push({ z: Z.FLOOR, draw: c => basket(c, BASKET, f.y) })
    const img = petImg(look.pet); if (!img) return
    out.push({ z: Z.STAND - 4, draw: c => {
      const p = petPos(), x = Math.round(p.x), y = p.y - (now - pet.pat < 500 ? Math.round(Math.sin((now - pet.pat) / 500 * Math.PI) * 4) : 0)
      if (pet.st === 'walk') {
        const fr = Math.floor(now / 160) % 3
        if (pet.dir === 'left') { c.translate(x + 16, y - 29); c.scale(-1, 1); c.drawImage(img, fr * 32, 64, 32, 32, 0, 0, 32, 32) }
        else c.drawImage(img, fr * 32, 64, 32, 32, x - 16, y - 29, 32, 32)
      } else {
        const fr = ringing() ? 4 : pet.st === 'hop' ? 3 : 3 + (Math.floor(now / 2400) % 5 === 0 ? 2 : 0)
        c.drawImage(img, fr * 16, 0, 16, 32, x - 8, y - 29, 16, 32)
        if (ringing() && Math.floor(now / 400) % 2) { c.fillStyle = '#ffd84a'; c.fillRect(x + 6, y - 19, 1, 3); c.fillRect(x + 6, y - 15, 1, 1) }
      }
      if (now - pet.pat < 1500) heart(c, x - 2, y - 20 - Math.round((now - pet.pat) / 150))
    } })
  })
  tower.on('overlay', (c, now) => {
    const p = petPos()
    if (p && look.pet !== 'none' && (pet.st === 'nap' || pet.st === 'sofa') && !ringing()) {
      const k = tower.zoom
      if (k >= 2) for (let i = 0; i < 2; i++) {
        const t = ((now / 2800) + i / 2) % 1, al = Math.min(1, (1 - t) * 1.8, t * 6), s = tower.worldToScreen(p.x + 5 + t * 4, p.y - 15 - t * 9)
        c.font = tower.font(Math.round((3 + 2 * t) * k), 700); c.fillStyle = `rgba(245,244,252,${al * 0.9})`; c.fillText('z', s.x, s.y)
      }
    }
    if (!demo) return
    const cv = tower.canvas, s = { x: cv.clientWidth / 2, y: cv.clientHeight - 24 }, txt = '--avatar "' + (shortKey(look) || 'default') + '"'
    c.font = tower.font(13, 700); const w = c.measureText(txt).width + 16
    c.fillStyle = 'rgba(20,18,30,.85)'; c.fillRect(s.x - w / 2, s.y - 22, w, 22)
    c.fillStyle = '#f4efe0'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(txt, s.x, s.y - 11); c.textAlign = 'left'
  })
  const onPet = w => { const p = petPos(); return p && look.pet !== 'none' && Math.abs(w.x - p.x) < 9 && w.y > p.y - 15 && w.y < p.y + 2 }
  tower.on('hover', w => {
    if (!onPet(w)) return null
    const m = PETS[look.pet], what = ringing() ? 'ears up — the phone is ringing' : { nap: 'napping in the basket', sofa: 'curled up on the sofa', walk: 'padding across the office', hop: 'hopping' }[pet.st]
    return `<div class="t">${m.emoji} ${api.esc(m.name)}</div><div class="m">${api.esc(m.kind)} · ${what}</div>`
  })
  tower.on('click', w => { if (!onPet(w)) return false; pet.pat = performance.now(); return true })
  tower.on('mode', () => { if (demo) setTimeout(() => { const f = floor(); if (f) tower.flyTo({ x: IX + 230, y: f.y - 28 }, 4) }, 600) })
}
function basket(c, x, y) {
  const R = (col, X, Y, w, h) => { c.fillStyle = col; c.fillRect(X, Y, w, h) }
  R('#6a4426', x - 9, y - 4, 18, 4); R('#8a5a32', x - 9, y - 4, 18, 1); R('#a8743e', x - 8, y - 3, 16, 1)
  for (let i = 0; i < 18; i += 3) R('#5a3820', x - 9 + i, y - 2, 1, 2)
  R('#c84a4a', x - 7, y - 5, 14, 1)
}
function heart(c, x, y) {
  c.fillStyle = '#ff5a7a'
  c.fillRect(x, y, 2, 1); c.fillRect(x + 3, y, 2, 1); c.fillRect(x, y + 1, 5, 1); c.fillRect(x + 1, y + 2, 3, 1); c.fillRect(x + 2, y + 3, 1, 1)
}
