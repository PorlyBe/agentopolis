// The tower's geometry and its cached layers: the shell, every floor's furniture (back and front of the people),
// and the night lights. Rebuilt only when the floor list changes. World pixels: x = 0 is the tower's left outer wall,
// y = 0 is street level (up is negative).
// Stack, bottom to top: server room (lower basement), post room (basement), lobby, café + lounge (tall), one floor per session, meeting, the CEO
// office (the user's penthouse, tall) and the roof.
// Features read every rect here through api.tower (geometry(), deskGeo(), ceoSlots()); all of them move when sessions
// come and go, so read them every frame rather than caching them.
import { pixText, textW } from './draw.js'
// SHAFT spans both glass shafts: the main one (SHAFT1) against the wall and the express one (XSHAFT) right of it
export const T = 16, FH = 80, SLAB = 6, WALL = 8, FW = 480, BW = FW + 2 * WALL, SHAFT1 = 40, XSHAFT = 36, SHAFT = SHAFT1 + XSHAFT
export const IX = WALL, IX1 = WALL + FW
export const PLAQUE = { w: 192, h: 17 }       // each floor's name plaque, set into the slab above it, flush with the facade
export const STREET_L = -110                 // the street furniture's left end (news box, arrivals)
export const GROUND = 18                      // sidewalk + road band below y = 0; the basement sits under it
export const CAR_X = BW + SHAFT1 / 2, CAR_W = 30, CAR_H = 46
export const XCAR_X = BW + SHAFT1 + XSHAFT / 2, XCAR_W = 26
export const DOOR_X = IX1 - 6                 // where people step between the floor and the car
export const SEAT = { session: IX + 30, agent: k => IX + 116 + k * 40 }   // a desk's seat anchor: where its sitter's x is
// How high a seat is above its floor (its cushion's top): a sitter's hips rest there (people.js lines each sprite row's hips up).
export const SEAT_H = { chair: 10, dining: 11, sofa: 8 }
export const MAX_DESKS = 8
export const BANNER = { x0: IX + 202, x1: IX + 384 }
export const DOOR = { x: -4 }                 // the lobby's street door, in the left wall
export const OUTSIDE = -96                    // where arrivals appear and leavers vanish, on the sidewalk

// the tower's materials; features/themes.js swaps them (setPalette) and the layers are rebuilt
export const CLASSIC = {
  interior: { session: '#d6cdbd', lobby: '#ddd6ca', meeting: '#cdd3d8', cafe: '#dedbd0', ceo: '#d8ccb2', server: '#2c3242', post: '#cbc6b4' },
  wainscot: { session: '#b4a690', lobby: '#8f8070', meeting: '#a5adb6', cafe: '#c4bfae', ceo: '#5a3a26', server: '#232836', post: '#6f7462' },
  slabTop: '#8f6c4a', slab: '#565060', slabLine: '#3f3a48', roofSlab: '#6b6470', roofSlabTop: '#8b8490', wall: '#9d9488', wallEdge: '#7d7468',
  footing: '#5f5866', footingLine: '#4a4452', doorFrame: '#6f675c', glass: '#8fa8bb', skirting: '#6e5a44',
  shaft: '#6d7684', shaftHi: '#8d96a4', machine: '#8b8490', machineHi: '#a29ba6', machineLo: '#6b6470', deck: '#9a7a56', deckLine: '#7a5e40',
  lamp: '255,200,120', roomGlow: 'rgba(70,52,30,.55)',
}
let P = CLASSIC
let floorStyle = () => {}
export const setFloorStyle = fn => { floorStyle = fn || (() => {}) }   // features/floor-decor.js papers a session floor's walls
export const setPalette = p => { P = p ? { ...CLASSIC, ...p, interior: { ...CLASSIC.interior, ...p.interior }, wainscot: { ...CLASSIC.wainscot, ...p.wainscot } } : CLASSIC }
export const TALL = FH + 32                   // the café + lounge and the CEO office are taller than a working floor
const HEIGHT = { cafe: TALL, ceo: TALL }
const LOUNGE_X = IX + 170                     // where the café ends and the lounge begins

export function planFloors(sessions) {
  const floors = [{ id: 'basement', kind: 'server', label: 'SERVER ROOM', y: GROUND + 2 * FH - SLAB, top: GROUND + FH }, { id: 'post', kind: 'post', label: 'POST ROOM', y: GROUND + FH - SLAB, top: GROUND }]
  let y = 0
  const add = f => { const h = HEIGHT[f.kind] || FH; floors.push({ ...f, y, top: y - h + SLAB }); y -= h }
  add({ id: 'lobby', kind: 'lobby', label: 'LOBBY' })
  add({ id: 'cafe', kind: 'cafe', label: 'CAFÉ · LOUNGE' })
  for (const s of sessions) add({ id: s.id, kind: 'session', sessionId: s.id, session: s, hue: hashHue(s.id), desks: desksFor(s) })
  add({ id: 'meeting', kind: 'meeting', label: 'MEETING' })
  add({ id: 'ceo', kind: 'ceo', label: 'CEO OFFICE' })
  floors.push({ id: 'roof', kind: 'roof', label: 'ROOF', y, top: y - 52 })
  floors.forEach((f, i) => { f.n = i; f.x0 = IX; f.x1 = IX1 })
  return floors
}
// desks on a floor: one per subagent (finished ones keep theirs while they walk out) and a spare, 2 .. MAX_DESKS
export const desksFor = s => Math.min(MAX_DESKS, Math.max(2, s.agents.length + 1))
let hashFn = null
export const setHash = h => { hashFn = h }
const hashHue = id => hashFn(id) % 360

export function bounds(floors) {
  const roof = floors[floors.length - 1], g = garageRect(floors)
  return { x0: STREET_L - 6, x1: BW + SHAFT + 14, y0: roof.top - 44, y1: g.y + g.h + 4 }
}
// the parking garage, one level under the server room's footing (features/parking-garage.js draws it)
export const GARAGE_H = 58
export const garageRect = floors => ({ x: IX, y: floors[0].y + PLAQUE.h, w: FW, h: GARAGE_H })

const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }

// ---------- the layers ----------
export function buildLayers(floors) {
  const b = bounds(floors), W = b.x1 - b.x0, H = b.y1 - b.y0
  const mk = () => { const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const c = cv.getContext('2d'); c.translate(-b.x0, -b.y0); return [cv, c] }
  const [back, bc] = mk(), [front, fc] = mk(), [lights, lc] = mk()
  const roof = floors[floors.length - 1], low = floors.find(f => f.kind === 'post') || floors.find(f => f.kind === 'lobby')
  // a squeezed floor (f.open, being built or taken down) is drawn whole and cut to the band it still has
  const inside = (f, fn) => {
    if (f.open == null) return fn(f)
    if (f.y <= f.top) return
    for (const c of [bc, fc, lc]) { c.save(); c.beginPath(); c.rect(b.x0, f.top, W, f.y - f.top); c.clip() }
    fn({ ...f, top: f.y - (HEIGHT[f.kind] || FH) + SLAB })
    for (const c of [bc, fc, lc]) c.restore()
  }
  for (const f of floors) if (f.kind !== 'roof') inside(f, f => room(bc, f))
  shaft(bc, floors, low, roof)
  for (const f of floors) {
    if (f.kind === 'roof') continue
    R(bc, P.slabTop, 0, f.y, BW, 2); R(bc, P.slab, 0, f.y + 2, BW, SLAB - 2)    // the slab under each floor
    R(bc, P.slabLine, 0, f.y + SLAB - 1, BW, 1)
  }
  R(bc, P.roofSlab, 0, roof.y, BW, SLAB); R(bc, P.roofSlabTop, 0, roof.y, BW, 2)        // the roof slab
  // outer walls: the street door in the left one, a shaft door per served floor in the right one
  for (const [x, edge] of [[0, 0], [BW - WALL, WALL - 1]]) {
    R(bc, P.wall, x, roof.y, WALL, -roof.y + GROUND); R(bc, P.wallEdge, x + edge, roof.y, 1, -roof.y + GROUND)
  }
  R(bc, '#2c3242', 0, GROUND, WALL, floors[0].y - GROUND); R(bc, '#2c3242', BW - WALL, GROUND, WALL, floors[0].y - GROUND)
  R(bc, P.footing, 0, floors[0].y, BW, PLAQUE.h); R(bc, P.footingLine, 0, floors[0].y + PLAQUE.h - 1, BW, 1)   // the footing
  R(bc, P.slab, WALL, SLAB, FW, GROUND - SLAB); R(bc, P.slabLine, WALL, GROUND - 1, FW, 1)              // the ground slab
  bc.clearRect(0, -42, WALL, 42)
  R(bc, P.doorFrame, 0, -44, WALL, 2); R(bc, P.glass, 1, -42, 2, 42); R(bc, P.glass, 5, -42, 2, 42)   // door frame, glass panes
  for (const f of floors) if (f.kind !== 'roof' && f.kind !== 'server') inside(f, f => {
    bc.clearRect(BW - WALL, f.y - 42, WALL, 42)
    R(bc, '#8a96a6', BW - WALL, f.y - 44, WALL, 2); R(bc, '#5c6573', BW - WALL, f.y - 42, 1, 42)
  })
  for (const g of floors) inside(g, f => {
    if (f.kind === 'session') sessionFloor(bc, f)
    else if (f.kind === 'lobby') lobbyFloor(bc, fc, f)
    else if (f.kind === 'meeting') meetingFloor(bc, fc, f)
    else if (f.kind === 'cafe') cafeFloor(bc, fc, lc, f)
    else if (f.kind === 'ceo') ceoFloor(bc, fc, lc, f)
    else if (f.kind === 'server') serverFloor(bc, f)
    else if (f.kind === 'roof') roofDeck(bc, fc, f)
    if (f.kind !== 'roof' && f.kind !== 'server') for (const x of lampXs(f)) lamp(bc, lc, x, f)
  })
  for (const f of floors) if (f.kind !== 'roof' && !(f.open != null && f.y - f.top < 20)) plaque(fc, lc, f)
  // interiors glow faintly at night even away from the lamps
  lc.globalCompositeOperation = 'destination-over'
  for (const f of floors) if (f.kind !== 'roof' && f.y > f.top) { lc.fillStyle = f.kind === 'server' ? 'rgba(40,70,120,.25)' : P.roomGlow; lc.fillRect(IX, f.top, FW, f.y - f.top) }
  lc.globalCompositeOperation = 'source-over'
  // the penthouse window stays a hole in every layer, so the real sky shows through it
  const ceo = floors.find(f => f.kind === 'ceo')
  if (ceo) { const w = ceoSlots(floors).window; lc.clearRect(w.x, w.y, w.w, w.h) }
  return { back, front, lights, bounds: b }
}
// every floor has its own plaque in its ceiling's left end, so no lamp hangs there
export const lampXs = f => f.kind === 'post' ? [IX + 183, IX + 386, IX + 462] : f.kind === 'ceo' ? [IX + 214] : f.kind === 'cafe' ? [IX + 172, IX + 259] : [IX + 184, IX + 304, IX + 424]
function lamp(c, lc, x, f) {
  const d = Math.round((f.y - f.top - FH + SLAB) * 0.6), t = f.top + d     // tall rooms hang their lamps lower
  R(c, '#4a4452', x, f.top, 1, 4 + d); R(c, '#3a3542', x - 4, t + 4, 9, 3); R(c, '#fff1c8', x - 2, t + 7, 5, 1)
  const g = lc.createRadialGradient(x, t + 8, 0, x, t + 30, 64)
  g.addColorStop(0, `rgba(${P.lamp},.75)`); g.addColorStop(1, `rgba(${P.lamp},0)`)
  lc.fillStyle = g; lc.fillRect(x - 64, f.top, 128, f.y - f.top)
}

function room(c, f) {
  const k = f.kind, h = f.y - f.top
  R(c, P.interior[k], IX, f.top, FW, h)
  if (k === 'cafe') {
    const lw = IX1 - LOUNGE_X
    c.fillStyle = 'rgba(0,0,0,.05)'; for (let x = IX; x < LOUNGE_X; x += 8) c.fillRect(x, f.top, 1, h); for (let y = f.top + 4; y < f.y; y += 8) c.fillRect(IX, y, LOUNGE_X - IX, 1)
    R(c, '#d8c8b8', LOUNGE_X, f.top, lw, h); c.fillStyle = 'rgba(120,70,60,.07)'; for (let x = LOUNGE_X + 6; x < IX1; x += 14) c.fillRect(x, f.top, 6, h)
  }
  if (k === 'lobby') { c.fillStyle = 'rgba(0,0,0,.05)'; for (let x = IX; x < IX1; x += 24) c.fillRect(x, f.top, 1, h - 20) }
  if (k === 'ceo') { c.fillStyle = 'rgba(90,60,30,.06)'; for (let x = IX + 10; x < IX1; x += 20) c.fillRect(x, f.top, 1, h - 20) }
  R(c, P.wainscot[k], IX, f.y - 18, FW, 18)
  if (k === 'cafe') R(c, '#b09a86', LOUNGE_X, f.y - 18, IX1 - LOUNGE_X, 18)
  if (k === 'ceo') { c.fillStyle = '#6e4a32'; for (let x = IX + 4; x < IX1; x += 24) c.fillRect(x, f.y - 15, 18, 10); R(c, '#c9a25a', IX, f.y - 19, FW, 1) }
  R(c, k === 'server' ? '#1c2030' : 'rgba(0,0,0,.18)', IX, f.y - 19, FW, 1)
  R(c, k === 'server' ? '#161a26' : k === 'ceo' ? '#3e2716' : P.skirting, IX, f.y - 2, FW, 2)
  R(c, 'rgba(0,0,0,.12)', IX, f.top, FW, 2)                                      // the ceiling's shadow
  if (k === 'session') { R(c, `hsl(${f.hue} 45% 55%)`, IX, f.y - 20, FW, 1); floorStyle(c, f) }   // the session's accent, a thin rail
}

// The floor plaques: a slim bronze plate set into the slab over each floor (the roof slab for the penthouse, the ground
// slab for the server room), reading as the room's header; its left end is flush with the facade, so the silhouette stays clean. Session plaques are dark bronze with brass edges and the session hue as a hairline; shared
// floors get plain brass. Text is painted in the overlay; features add to the right end (the 'plaque' hook).
export function plaqueBox(f) { return { x: 0, y: f.top - SLAB, w: PLAQUE.w, h: PLAQUE.h } }
function plaque(c, lc, f) {
  const { x, y, w, h } = plaqueBox(f), s = f.kind === 'session'
  R(c, s ? '#1f1712' : '#5a4220', x, y, w, h)
  R(c, s ? '#2e2219' : '#b8924e', x + 1, y + 1, w - 2, h - 2)
  if (!s) { R(c, '#d2ae66', x + 1, y + 1, w - 2, 1); R(c, '#8a6a34', x + 1, y + h - 2, w - 2, 1) }
  else { R(c, '#a8844a', x + 1, y + 1, w - 2, 1); R(c, '#6a5030', x + 1, y + h - 2, w - 2, 1); R(c, `hsl(${f.hue} 55% 58%)`, x + 4, y + 4, 1, h - 8) }
  R(c, s ? '#c9a25a' : '#7a5a2a', x + 2, y + h / 2 - 0.5 | 0, 1, 1); R(c, s ? '#c9a25a' : '#7a5a2a', x + w - 3, y + h / 2 - 0.5 | 0, 1, 1)   // the rivets
  R(c, 'rgba(0,0,0,.28)', x + w, y + 1, 1, h - 1)
  const g = lc.createLinearGradient(0, y + h, 0, y + h + 10)                       // the backlight, spilling under it at night
  g.addColorStop(0, s ? 'rgba(255,214,150,.55)' : 'rgba(255,214,150,.4)'); g.addColorStop(1, 'rgba(255,214,150,0)')
  lc.fillStyle = g; lc.fillRect(x + 4, y + h, w - 8, 10)
}

function shaft(c, floors, low, roof) {
  const x = BW, top = roof.y - 34, pit = low.y > 0 ? low.y + SLAB : GROUND, S = SHAFT1, xx = BW + SHAFT1
  c.fillStyle = 'rgba(170,205,230,.16)'; c.fillRect(x + 3, top, S - 6, -top)
  c.fillStyle = 'rgba(170,200,230,.10)'; c.fillRect(xx, top, XSHAFT - 3, -top)
  if (low.y > 0) { R(c, '#262b36', x + 3, 0, SHAFT - 6, pit); R(c, '#4a4f5a', x, low.y, SHAFT, SLAB) }     // underground: a concrete well
  for (const wx of [x, x + S - 3, BW + SHAFT - 3]) { R(c, P.shaft, wx, top, 3, pit - top); R(c, P.shaftHi, wx, top, 1, pit - top) }
  for (let i = low.n; i < roof.n; i++) {
    const y = floors[i].y, ny = floors[i + 1].y
    R(c, '#7b8492', x + 3, y, S - 6, 2); c.fillStyle = 'rgba(109,118,132,.5)'; c.beginPath(); c.moveTo(x + 3, y); c.lineTo(x + S - 3, ny + 2); c.lineTo(x + S - 3, ny + 3); c.lineTo(x + 3, y + 1); c.fill()
    R(c, '#7b8492', x + S - 3, y, 3, 2)                                                       // the landing across to the express car
    R(c, '#737c8a', xx, y, XSHAFT - 3, 2); R(c, 'rgba(109,118,132,.45)', xx + 3, ny + 2, 1, y - ny - 2); R(c, 'rgba(109,118,132,.45)', xx + XSHAFT - 7, ny + 2, 1, y - ny - 2)
  }
  R(c, '#7b8492', x + 3, roof.y, SHAFT - 6, 2)
  if (low.y <= 0) R(c, '#4a4f5a', x, 0, SHAFT, GROUND)
  // the machine room on the roof, over both shafts
  R(c, P.machine, x - 6, top, SHAFT + 8, 34); R(c, P.machineHi, x - 6, top, SHAFT + 8, 2); R(c, P.machineLo, x - 6, top + 32, SHAFT + 8, 2)
  R(c, '#2a2f3a', x + 8, top + 8, 14, 9); R(c, '#4a5568', x + 9, top + 9, 12, 2)
  R(c, P.machineLo, xx - 1, top + 2, 1, 30); R(c, '#2a2f3a', xx + 10, top + 8, 12, 9); R(c, '#4a5568', xx + 11, top + 9, 10, 2)
}

// ---------- props (side view; x, y: left edge and the floor surface) ----------
function desk(c, x, y, w = 22) {
  R(c, '#6b4a30', x, y - 13, w, 3); R(c, '#8a6240', x, y - 13, w, 1)
  R(c, '#4e3624', x + 1, y - 10, 2, 10); R(c, '#4e3624', x + w - 3, y - 10, 2, 10)
  R(c, '#5c4029', x + w - 10, y - 10, 7, 7); R(c, '#c9a25a', x + w - 7, y - 7, 2, 1)
}
function monitorStand(c, x, y) { R(c, '#2a2a33', x + 4, y - 15, 2, 2); R(c, '#2a2a33', x + 2, y - 14, 6, 1) }
export function monitor(c, x, y, on, now, seed = 0) {
  R(c, '#1d1d24', x, y - 25, 10, 10)
  if (!on) { R(c, '#2b3445', x + 1, y - 24, 8, 8); return }
  R(c, '#2d5f9a', x + 1, y - 24, 8, 8)
  const t = Math.floor((now + seed * 97) / 220) % 4
  c.fillStyle = '#9fd0ff'; for (let i = 0; i < 3; i++) c.fillRect(x + 2, y - 23 + i * 2 + (i === t % 3 ? 0 : 0), 2 + ((i + t) % 3) * 2, 1)
}
function chair(c, seat, y) {   // an office chair facing right around a seat anchor: the backrest ends where the sitter's back starts
  const x = seat - 7
  R(c, '#33333d', x, y - 22, 3, 13); R(c, '#3e3e4a', x, y - 10, 12, 3); R(c, '#2a2a33', x + 5, y - 7, 2, 5)
  R(c, '#2a2a33', x + 1, y - 2, 10, 1); R(c, '#111', x + 1, y - 1, 2, 1); R(c, '#111', x + 9, y - 1, 2, 1)
}
function plant(c, x, y, tall = false) {
  const h = tall ? 30 : 18
  R(c, '#8a5a3a', x + 2, y - 8, 10, 8); R(c, '#a06a44', x + 2, y - 8, 10, 2)
  c.fillStyle = '#3f8a4a'; c.fillRect(x + 4, y - h, 6, h - 8); c.fillRect(x, y - h + 6, 6, 6); c.fillRect(x + 8, y - h + 3, 6, 7)
  c.fillStyle = '#5aa860'; c.fillRect(x + 5, y - h + 1, 3, 5); c.fillRect(x + 1, y - h + 7, 3, 3); c.fillRect(x + 9, y - h + 4, 3, 3)
}
function frame(c, x, y, w, h, inner) { R(c, '#4a3a2c', x, y, w, h); R(c, inner, x + 2, y + 2, w - 4, h - 4) }
function whiteboard(c, x, y, w) {
  R(c, '#9aa3ad', x, y, w, 26); R(c, '#f4f6f8', x + 2, y + 2, w - 4, 22); R(c, '#9aa3ad', x + 4, y + 26, w - 8, 2)
  c.fillStyle = '#5a7fb0'; for (let i = 0; i < 4; i++) c.fillRect(x + 6, y + 6 + i * 4, 10 + (i * 13) % 26, 1)
  c.fillStyle = '#d0584a'; c.fillRect(x + w - 22, y + 7, 12, 1); c.fillRect(x + w - 22, y + 11, 8, 1)
}
function table(c, x, y, w, h = 13) {
  R(c, 'rgba(0,0,0,.18)', x + 2, y - 1, w - 4, 1)
  R(c, '#7a5232', x, y - h, w, 3); R(c, '#94683f', x, y - h, w, 1)
  R(c, '#5a3c24', x + 3, y - h + 3, 3, h - 3); R(c, '#5a3c24', x + w - 6, y - h + 3, 3, h - 3)
}
function stoolBack(c, x, y) { R(c, '#6b4a30', x, y - 24, 2, 24); R(c, '#6b4a30', x + 10, y - 24, 2, 24); R(c, '#8a6240', x, y - 25, 12, 3); R(c, '#8a6240', x + 2, y - 19, 8, 2) }
function sofaBack(c, x, y, w, hue = 210) {   // seen from behind, in front of the people sitting on it
  R(c, `hsl(${hue} 25% 30%)`, x, y - 15, w, 15); R(c, `hsl(${hue} 28% 40%)`, x + 1, y - 14, w - 2, 9)
  R(c, `hsl(${hue} 25% 26%)`, x - 2, y - 11, 4, 11); R(c, `hsl(${hue} 25% 26%)`, x + w - 2, y - 11, 4, 11)
}
function counter(c, x, y, w) {
  R(c, '#5b3d26', x, y - 14, w, 14); R(c, '#9a6a3e', x + 1, y - 13, w - 2, 12)
  c.fillStyle = '#7d532f'; for (let i = x + 12; i < x + w - 4; i += 16) c.fillRect(i, y - 12, 1, 10)
  R(c, '#c4cad1', x - 1, y - 16, w + 2, 3); R(c, '#dde2e7', x - 1, y - 16, w + 2, 1)
  R(c, '#b9a888', x, y - 40, w, 14); R(c, '#9a8a6c', x, y - 27, w, 1)                      // wall cabinets
  c.fillStyle = '#8a7a5c'; for (let i = x + 15; i < x + w; i += 16) c.fillRect(i, y - 40, 1, 13)
}
function fridge(c, x, y) {
  R(c, '#6f7a86', x, y - 40, 18, 40); R(c, '#e4e9ee', x + 1, y - 39, 16, 38); R(c, '#c9d1d9', x + 1, y - 26, 16, 1)
  R(c, '#8c97a3', x + 14, y - 36, 1, 7); R(c, '#8c97a3', x + 14, y - 22, 1, 10)
  R(c, '#e8a23a', x + 4, y - 35, 2, 2); R(c, '#5aa0d8', x + 7, y - 33, 2, 2)
}
function coffeeMachine(c, x, y) { R(c, '#2a2a33', x, y - 29, 12, 13); R(c, '#44444f', x + 1, y - 28, 10, 3); R(c, '#7a2a2a', x + 9, y - 27, 1, 1); R(c, '#f4efe6', x + 4, y - 20, 4, 4) }
function microwave(c, x, y) { R(c, '#5c6470', x, y - 26, 18, 10); R(c, '#26303a', x + 1, y - 25, 11, 8); R(c, '#9aa3ad', x + 14, y - 24, 2, 1); R(c, '#9aa3ad', x + 14, y - 21, 2, 1) }
function sink(c, x, y) { R(c, '#9aa3ad', x + 6, y - 24, 2, 8); R(c, '#9aa3ad', x + 6, y - 24, 6, 2); R(c, '#7d858e', x, y - 17, 18, 2) }
function pinball(c, x, y) {
  R(c, '#2a1f45', x + 12, y - 36, 6, 18); R(c, '#4a2f7a', x + 13, y - 35, 4, 16)      // backbox
  c.fillStyle = '#1d1d2a'; c.beginPath(); c.moveTo(x, y - 18); c.lineTo(x + 18, y - 22); c.lineTo(x + 18, y - 16); c.lineTo(x, y - 13); c.fill()
  R(c, '#3a2a22', x + 1, y - 13, 2, 13); R(c, '#3a2a22', x + 15, y - 16, 2, 16)
  R(c, '#ffd84a', x + 5, y - 19, 2, 1); R(c, '#ff5a8a', x + 10, y - 20, 2, 1)
}
function arcade(c, x, y, hue) {
  R(c, `hsl(${hue} 45% 22%)`, x, y - 40, 16, 40); R(c, `hsl(${hue} 60% 42%)`, x + 1, y - 39, 14, 5)
  R(c, '#0c0f18', x + 2, y - 32, 12, 10); R(c, '#1d1d26', x + 1, y - 20, 14, 5)
  R(c, '#e8e8f0', x + 4, y - 19, 1, 2); R(c, '#ff5a5a', x + 9, y - 18, 2, 1)
}
function foosball(c, x, y) {
  R(c, '#3a2416', x + 3, y - 10, 3, 10); R(c, '#3a2416', x + 44, y - 10, 3, 10)
  R(c, '#6b4226', x, y - 18, 50, 8); R(c, '#2f8a44', x + 2, y - 19, 46, 2)
  c.fillStyle = '#c9ced6'; for (const rx of [10, 20, 30, 40]) c.fillRect(x + rx, y - 22, 1, 4)
  R(c, '#c9ced6', x - 4, y - 15, 58, 1)
  c.fillStyle = '#d84a4a'; c.fillRect(x + 9, y - 21, 3, 3); c.fillRect(x + 29, y - 21, 3, 3)
  c.fillStyle = '#3a7ad8'; c.fillRect(x + 19, y - 21, 3, 3); c.fillRect(x + 39, y - 21, 3, 3)
}
function poolTable(c, x, y) {
  R(c, '#3a2416', x + 6, y - 10, 4, 10); R(c, '#3a2416', x + 66, y - 10, 4, 10)
  R(c, '#5a3418', x, y - 16, 76, 7); R(c, '#7a4a24', x + 1, y - 15, 74, 5); R(c, '#1f7a4a', x + 2, y - 17, 72, 2)
  c.fillStyle = '#f2c14e'; c.fillRect(x + 50, y - 19, 2, 2); c.fillStyle = '#d84a4a'; c.fillRect(x + 53, y - 19, 2, 2); c.fillStyle = '#3a6ad8'; c.fillRect(x + 56, y - 19, 2, 2)
  c.fillStyle = '#f4f0e6'; c.fillRect(x + 18, y - 19, 2, 2)
}
export function wallTV(c, x, y, w = 52) { R(c, '#16161c', x, y, w, 28); R(c, '#0c0e14', x + 2, y + 2, w - 4, 24) }
function bookshelf(c, x, y) {
  R(c, '#5a3c24', x, y - 40, 28, 40); R(c, '#3e2a1a', x + 2, y - 38, 24, 36)
  const cols = ['#c8503a', '#3a7ab8', '#e0b040', '#5a9a4a', '#8a5ab0']
  for (let s = 0; s < 3; s++) { R(c, '#5a3c24', x + 2, y - 27 + s * 12, 24, 2); for (let k = 0; k < 6; k++) { c.fillStyle = cols[(k + s * 2) % 5]; c.fillRect(x + 3 + k * 4, y - 36 + s * 12, 3, 9 - (k % 3)) } }
}
function rackFrame(c, x, y) { R(c, '#1a1e2a', x, y - 46, 22, 46); R(c, '#2a3040', x + 1, y - 45, 20, 44) }
export function rack(c, x, y, kind, now, seed, failed) {
  const col = { shell: '#5fd17a', monitor: '#63b3f0', workflow: '#b996f5', agent: '#f29a4e' }[kind] || '#9aa3ad'
  R(c, '#0f121a', x, y - 46, 22, 46); R(c, '#3a4256', x + 1, y - 45, 20, 44)
  for (let u = 0; u < 8; u++) {
    R(c, '#1f2433', x + 3, y - 43 + u * 5, 16, 4)
    const on = failed ? Math.floor(now / 250) % 2 : (Math.floor(now / (140 + ((seed + u) % 5) * 60)) + u + seed) % 3 !== 0
    R(c, failed ? (on ? '#ff4a4a' : '#5a1a1a') : on ? col : '#2a3a2e', x + 15, y - 42 + u * 5, 2, 2)
    if ((u + seed) % 3 === 0) R(c, on ? '#f4c64f' : '#3a3420', x + 12, y - 42 + u * 5, 2, 2)
  }
  R(c, col, x + 1, y - 45, 20, 1)
}

// ---------- floors ----------
let stockPlant = true
export const skipStockPlant = (skip = true) => { stockPlant = !skip }   // desk-kit draws a live one in its place
function sessionFloor(c, f) {
  chair(c, SEAT.session, f.y); desk(c, SEAT.session + 6, f.y, 32); monitorStand(c, SEAT.session + 15, f.y)
  if (stockPlant) plant(c, IX + 82, f.y, true)
  for (let k = 0; k < f.desks; k++) { const sx = SEAT.agent(k); chair(c, sx, f.y); desk(c, sx + 6, f.y, 22); monitorStand(c, sx + 11, f.y) }
  if (f.desks <= 5) { bookshelf(c, IX + 352, f.y); plant(c, IX + 386, f.y) }
  plant(c, IX1 - 26, f.y)
  clock(c, IX1 - 22, f.top + 12)
}
function clock(c, x, y) { R(c, '#4a3a2c', x, y, 12, 12); R(c, '#f4f0e6', x + 1, y + 1, 10, 10); R(c, '#333', x + 5, y + 3, 1, 4); R(c, '#333', x + 5, y + 6, 3, 1) }
function lobbyFloor(c, fc, f) {
  R(c, '#cfc6b8', IX, f.y - 2, FW, 2)
  c.fillStyle = '#e9e4da'; for (let x = IX; x < IX1; x += 16) c.fillRect(x, f.y - 2, 8, 2)
  plant(c, IX + 16, f.y, true)
  // the cornerstone plaque over the reception desk: who built the place
  R(c, '#6b5038', IX + 96, f.y - 46, 64, 23); R(c, '#c9a25a', IX + 97, f.y - 45, 62, 21); R(c, '#a8823e', IX + 98, f.y - 44, 60, 19)
  for (const [i, t] of ['AGENTOPOLIS', 'EST. 2026', 'PORLYBE+CLAUDE'].entries()) pixText(c, t, IX + 128 - textW(t) / 2, f.y - 43 + i * 6, '#3b2617')
  // reserved: the TV / wall of fame (step 2), framed on the back wall
  R(c, '#3b2617', IX + 196, f.top + 6, 160, 34); R(c, '#2a2f3a', IX + 198, f.top + 8, 156, 30)
  for (let i = 0; i < 4; i++) frame(c, IX + 206 + i * 38, f.top + 12, 26, 20, '#3a4256')
  bookshelf(c, IX + 380, f.y)
  plant(c, IX + 420, f.y)
  // reception desk, in front of whoever stands behind it
  R(fc, '#4a3a2c', IX + 96, f.y - 20, 64, 20); R(fc, '#8a6a4a', IX + 94, f.y - 22, 68, 3); R(fc, '#6b5038', IX + 98, f.y - 17, 60, 15)
  R(fc, '#c9a25a', IX + 120, f.y - 12, 16, 3)
  // outside: an awning over the door, the mailbox and the newspaper box
  R(c, '#7a3a3a', -30, -50, 34, 4); c.fillStyle = '#b4504a'; for (let i = 0; i < 5; i++) c.fillRect(-30 + i * 7, -46, 4, 4)
  R(c, '#2c4f8a', -46, -20, 12, 20); R(c, '#3a63a8', -46, -24, 12, 6); R(c, '#1a2a4a', -43, -16, 6, 1); R(c, '#e8e8f0', -45, -10, 2, 2)
  R(c, '#c8a23a', -78, -22, 16, 22); R(c, '#e8c25a', -78, -22, 16, 3); R(c, '#f4f0e6', -75, -16, 10, 6); R(c, '#333', -74, -14, 8, 1); R(c, '#333', -74, -12, 6, 1)
}
function meetingFloor(c, fc, f) {
  whiteboard(c, IX + 40, f.top + 16, 74)
  plant(c, IX + 16, f.y, true)
  for (let i = 0; i < 6; i++) stoolBack(c, IX + 170 + i * 26, f.y)
  table(fc, IX + 156, f.y, 168)
  R(c, '#16161c', IX + 364, f.top + 8, 64, 34); R(c, '#2a4a6a', IX + 366, f.top + 10, 60, 30)    // the presentation screen
  c.fillStyle = '#9fd0ff'; c.fillRect(IX + 372, f.top + 16, 30, 2); c.fillRect(IX + 372, f.top + 22, 22, 1); c.fillRect(IX + 372, f.top + 26, 26, 1)
  plant(c, IX1 - 26, f.y)
}
// ---------- café + lounge: one tall floor, the café on the left and the games on the right ----------
export const CAFE = { pinball: IX + 182, arcade: IX + 206, tv: IX + 416, tvY: f => f.y - 66 }
function cafeFloor(c, fc, lc, f) {
  const y = f.y, t = f.top
  fridge(c, IX + 6, y)
  counter(c, IX + 28, y, 72); coffeeMachine(c, IX + 36, y); microwave(c, IX + 52, y); sink(c, IX + 76, y)
  R(c, '#4a3a2c', IX + 30, t + 12, 68, 28); R(c, '#2f3a34', IX + 32, t + 14, 64, 24)                 // the chalk menu
  c.fillStyle = '#e8e4d8'; c.fillRect(IX + 50, t + 17, 28, 2)
  for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(232,228,216,.7)'; c.fillRect(IX + 36, t + 23 + i * 5, 30 - i * 6, 1); c.fillStyle = '#f2c14e'; c.fillRect(IX + 84, t + 23 + i * 5, 6, 1) }
  stoolBack(c, IX + 112, y); stoolBack(c, IX + 136, y); table(fc, IX + 104, y, 54)
  plant(c, IX + 158, y, true)
  frame(c, IX + 180, t + 12, 22, 30, '#4a2f7a'); R(c, '#ff5a8a', IX + 185, t + 18, 12, 2); R(c, '#ffd84a', IX + 188, t + 24, 6, 6); R(c, '#5ae0ff', IX + 184, t + 34, 14, 2)
  frame(c, IX + 206, t + 12, 22, 30, '#1f4a5a'); R(c, '#7bff8a', IX + 210, t + 30, 4, 4); R(c, '#7bff8a', IX + 216, t + 26, 4, 8); R(c, '#e8e8f0', IX + 220, t + 18, 3, 3)
  R(c, '#ff5ab4', IX + 240, t + 10, 160, 1); R(c, '#ff5ab4', IX + 240, t + 10, 1, 4); R(c, '#ff5ab4', IX + 399, t + 10, 1, 4)    // a neon strip
  pinball(c, CAFE.pinball, y); arcade(c, CAFE.arcade, y, 175)
  foosball(c, IX + 234, y)
  poolTable(c, IX + 316, y)
  R(c, '#4a4452', IX + 353, t, 1, 38); R(c, '#2f6a3a', IX + 340, t + 38, 28, 4); R(c, '#fff1c8', IX + 342, t + 42, 24, 1)   // the pool lamp
  const g = lc.createRadialGradient(IX + 354, t + 44, 0, IX + 354, y - 16, 50); g.addColorStop(0, 'rgba(255,220,140,.7)'); g.addColorStop(1, 'rgba(255,220,140,0)')
  lc.fillStyle = g; lc.fillRect(IX + 300, t + 40, 108, y - t - 40)
  wallTV(c, CAFE.tv, CAFE.tvY(f), 52); sofaBack(fc, IX + 418, y, 48)
}

// ---------- the CEO office: the user's penthouse, under the roof ----------
export function ceoSlots(floors) {
  const f = floors.find(f => f.kind === 'ceo'); if (!f) return null
  const y = f.y, t = f.top
  return {
    floor: f, seat: IX + 348,
    window: { x: IX + 248, y: t + 8, w: 226, h: y - 28 - t - 8 },
    fame: { x: IX + 84, y: t + 15, w: 148, h: 40 },   // clear of the plaque in the ceiling
    trophies: { x: IX + 40, y: y - 56, w: 34, h: 50 },
    desk: { x: IX + 298, y: y - 17, w: 104, h: 17 },
    inbox: { x: IX + 302, y: y - 25, w: 16, h: 8 },
    gazette: { x: IX + 320, y: y - 23, w: 16, h: 6 },
    phone: { x: IX + 362, y: y - 24, w: 13, h: 7 },
    note: { x: IX + 378, y: y - 29, w: 10, h: 12 },
  }
}
function reserved(c, r) {   // a faint brass outline where a step-2 feature will put something
  c.fillStyle = 'rgba(160,120,60,.35)'
  for (let x = r.x; x < r.x + r.w; x += 4) { c.fillRect(x, r.y, 2, 1); c.fillRect(x, r.y + r.h - 1, 2, 1) }
  for (let y = r.y; y < r.y + r.h; y += 4) { c.fillRect(r.x, y, 1, 2); c.fillRect(r.x + r.w - 1, y, 1, 2) }
}
function ceoFloor(c, fc, lc, f) {
  const s = ceoSlots([f]), y = f.y, t = f.top, w = s.window, d = s.desk, x0 = s.seat
  // the window wall: a hole, so the live sky shows through; bronze frame, mullions, a sill
  c.clearRect(w.x, w.y, w.w, w.h)
  c.fillStyle = 'rgba(170,205,230,.10)'; c.fillRect(w.x, w.y, w.w, w.h)
  R(c, '#3e2f24', w.x - 3, w.y - 3, w.w + 6, 3); R(c, '#3e2f24', w.x - 3, w.y, 3, w.h); R(c, '#3e2f24', w.x + w.w, w.y, 3, w.h)
  R(c, '#8a6a4a', w.x - 5, w.y + w.h, w.w + 10, 3); R(c, '#a8845c', w.x - 5, w.y + w.h, w.w + 10, 1)
  for (let x = w.x + 56; x < w.x + w.w - 8; x += 57) R(c, '#4a3a2c', x, w.y, 2, w.h)
  R(c, '#4a3a2c', w.x, w.y + 14, w.w, 1)
  c.fillStyle = 'rgba(255,255,255,.16)'; for (const gx of [w.x + 10, w.x + 70, w.x + 128, w.x + 186]) for (let i = 0; i < 10; i++) c.fillRect(gx + i, w.y + 30 - i, 1, 2)
  // the left wall: bookshelf, the trophy cabinet's plinth, the wall of fame + TV slot with its picture light, a sofa
  bookshelf(c, IX + 4, y)
  R(c, '#3e2716', s.trophies.x - 2, y - 6, s.trophies.w + 4, 6); R(c, '#6e4a32', s.trophies.x - 2, y - 6, s.trophies.w + 4, 1)
  reserved(c, s.trophies); reserved(c, s.fame)
  R(c, '#8a6a3a', s.fame.x + 20, s.fame.y - 6, s.fame.w - 40, 2); R(c, '#c9a25a', s.fame.x + 20, s.fame.y - 6, s.fame.w - 40, 1)
  const pl = lc.createLinearGradient(0, s.fame.y - 4, 0, s.fame.y + 30); pl.addColorStop(0, 'rgba(255,214,150,.6)'); pl.addColorStop(1, 'rgba(255,214,150,0)')
  lc.fillStyle = pl; lc.fillRect(s.fame.x + 10, s.fame.y - 4, s.fame.w - 20, 34)
  const sx = IX + 112
  R(c, '#5a1f22', sx, y - 24, 64, 12); R(c, '#7a2a2e', sx + 1, y - 23, 62, 4); R(c, '#4a181a', sx + 21, y - 23, 1, 10); R(c, '#4a181a', sx + 42, y - 23, 1, 10)
  R(c, '#6a2428', sx - 4, y - 18, 6, 12); R(c, '#6a2428', sx + 62, y - 18, 6, 12); R(c, '#7a2a2e', sx, y - 12, 64, 6); R(c, '#8e3438', sx, y - 12, 64, 1)
  R(c, '#2a1a10', sx - 2, y - 6, 2, 6); R(c, '#2a1a10', sx + 64, y - 6, 2, 6)
  R(c, '#3e2716', IX + 190, y - 14, 14, 2); R(c, '#3e2716', IX + 196, y - 12, 2, 12); R(c, '#2a6a8a', IX + 192, y - 23, 9, 9); R(c, '#5aa04a', IX + 194, y - 21, 4, 3); R(c, '#c9a25a', IX + 196, y - 14, 1, 1)  // globe
  plant(c, IX + 222, y, true)
  // the rug, the executive chair and the chandelier over the desk
  R(c, '#7a2228', IX + 262, y - 2, 172, 2); c.fillStyle = '#c9a25a'; for (let x = IX + 266; x < IX + 430; x += 6) c.fillRect(x, y - 2, 2, 1)
  c.fillStyle = '#e8dcc0'; for (let x = IX + 259; x < IX + 262; x++) c.fillRect(x, y - 1, 1, 1); for (let x = IX + 434; x < IX + 437; x++) c.fillRect(x, y - 1, 1, 1)
  R(c, '#2e1214', x0 - 11, y - 52, 22, 40); R(c, '#4a1c20', x0 - 10, y - 51, 20, 38); R(c, '#2e1214', x0 - 9, y - 54, 18, 3)
  c.fillStyle = '#2e1214'; for (let r = 0; r < 4; r++) for (let k = 0; k < 3; k++) c.fillRect(x0 - 6 + k * 6, y - 47 + r * 8, 1, 1)
  R(c, '#8a6a3a', x0, t, 1, 14); R(c, '#c9a25a', x0 - 8, t + 14, 17, 2); R(c, '#c9a25a', x0 - 2, t + 16, 5, 3)
  for (const k of [-8, -3, 3, 8]) { R(c, '#f4efe0', x0 + k, t + 11, 1, 3); R(c, '#ffd27a', x0 + k, t + 10, 1, 1) }
  const ch = lc.createRadialGradient(x0, t + 14, 0, x0, t + 30, 80); ch.addColorStop(0, 'rgba(255,214,150,.8)'); ch.addColorStop(1, 'rgba(255,214,150,0)')
  lc.fillStyle = ch; lc.fillRect(x0 - 80, t, 160, y - t)
  // the mini bar under the window, a plant by the door
  R(c, '#3e2716', IX + 414, y - 22, 34, 22); R(c, '#5a3a26', IX + 415, y - 21, 32, 20); R(c, '#3e2716', IX + 430, y - 20, 1, 18)
  R(c, '#c9a25a', IX + 426, y - 12, 2, 1); R(c, '#c9a25a', IX + 434, y - 12, 2, 1); R(c, '#6e4a32', IX + 413, y - 23, 36, 2)
  R(c, '#c98a3a', IX + 418, y - 31, 6, 8); R(c, '#e8b860', IX + 419, y - 30, 2, 4); R(c, '#c98a3a', IX + 420, y - 34, 2, 3)       // decanter
  R(c, '#2a5a3a', IX + 428, y - 35, 4, 12); R(c, '#2a5a3a', IX + 429, y - 38, 2, 3); R(c, '#e8e0c8', IX + 428, y - 30, 4, 3)       // a bottle
  for (const gx of [IX + 436, IX + 442]) { R(c, 'rgba(220,235,245,.8)', gx, y - 28, 4, 5); R(c, '#c98a3a', gx + 1, y - 26, 2, 2) }
  plant(c, IX + 456, y)
  // the executive desk (in front of the user): walnut, a brass nameplate, a green banker's lamp, a blotter
  R(fc, '#3a2414', d.x, d.y, d.w, d.h); R(fc, '#6b4429', d.x - 2, d.y, d.w + 4, 3); R(fc, '#8a5a36', d.x - 2, d.y, d.w + 4, 1)
  R(fc, '#4e3120', d.x + 4, d.y + 5, d.w - 8, d.h - 7); R(fc, '#3a2414', d.x + d.w / 2, d.y + 5, 1, d.h - 7)
  R(fc, '#2a1a10', d.x + 2, y - 2, 4, 2); R(fc, '#2a1a10', d.x + d.w - 6, y - 2, 4, 2)
  R(fc, '#8a6a2a', x0 - 22, d.y + 6, 44, 8); R(fc, '#d8b45a', x0 - 21, d.y + 7, 42, 6)
  R(fc, '#1f3a2a', d.x + 2, d.y - 1, 40, 1)
  reserved(fc, s.inbox); reserved(fc, s.gazette)
  const lx = d.x + d.w - 12
  R(fc, '#c9a25a', lx, d.y - 2, 8, 2); R(fc, '#c9a25a', lx + 3, d.y - 9, 2, 7); R(fc, '#1f6a3a', lx - 2, d.y - 12, 12, 4); R(fc, '#2f8a4a', lx - 1, d.y - 12, 10, 1)
  const dl = lc.createRadialGradient(lx + 4, d.y - 8, 0, lx + 4, d.y - 8, 26); dl.addColorStop(0, 'rgba(255,230,160,.8)'); dl.addColorStop(1, 'rgba(255,230,160,0)')
  lc.fillStyle = dl; lc.fillRect(lx - 22, d.y - 34, 52, 34)
}

function serverFloor(c, f) {
  R(c, '#3a4050', IX, f.top + 2, FW, 3)                                          // cable tray
  c.fillStyle = '#5a6478'; for (let x = IX + 4; x < IX1; x += 12) c.fillRect(x, f.top + 5, 1, 3)
  R(c, '#4a5266', IX1 - 40, f.y - 30, 30, 30); R(c, '#2a3040', IX1 - 37, f.y - 27, 24, 14)   // the cooling unit
  c.fillStyle = '#5a6478'; for (let i = 0; i < 6; i++) c.fillRect(IX1 - 36, f.y - 26 + i * 2, 22, 1)
  for (let k = 0; k < RACKS; k++) rackFrame(c, rackX(k), f.y)
}
export const RACKS = 14, rackX = k => IX + 14 + k * 28
function roofDeck(c, fc, f) {
  const y = f.y
  c.fillStyle = P.deck; c.fillRect(0, y - 3, BW, 3); c.fillStyle = P.deckLine; for (let x = 0; x < BW; x += 12) c.fillRect(x, y - 3, 1, 3)
  // railing
  R(c, '#5a5f6a', 0, y - 18, BW, 2); R(c, '#5a5f6a', 0, y - 10, BW, 1)
  for (let x = 0; x <= BW - 2; x += 22) R(c, '#5a5f6a', x, y - 18, 2, 15)
  // string-light poles; the wire and bulbs are drawn live
  R(c, '#4a4040', 10, y - 48, 3, 45); R(c, '#4a4040', BW - 14, y - 48, 3, 45)
  // deck chairs, a parasol table, a grill, planters
  for (const x of [IX + 50, IX + 86]) { R(c, '#3a7ab8', x, y - 10, 18, 3); R(c, '#3a7ab8', x, y - 20, 3, 11); R(c, '#e8e2d4', x + 1, y - 9, 16, 1); R(c, '#5a4a3c', x + 2, y - 7, 2, 4); R(c, '#5a4a3c', x + 14, y - 7, 2, 4) }
  R(fc, '#5a4a3c', IX + 180, y - 13, 30, 2); R(fc, '#5a4a3c', IX + 194, y - 11, 2, 8)
  R(c, '#5a4a3c', IX + 194, y - 44, 2, 31); c.fillStyle = '#d84a4a'; c.beginPath(); c.moveTo(IX + 172, y - 38); c.lineTo(IX + 195, y - 48); c.lineTo(IX + 218, y - 38); c.fill()
  c.fillStyle = '#f4efe6'; c.beginPath(); c.moveTo(IX + 186, y - 38); c.lineTo(IX + 195, y - 48); c.lineTo(IX + 204, y - 38); c.fill()
  R(c, '#2a2a33', IX + 300, y - 16, 20, 7); R(c, '#3a3a44', IX + 302, y - 9, 2, 6); R(c, '#3a3a44', IX + 314, y - 9, 2, 6); R(c, '#e86a3a', IX + 302, y - 17, 16, 1)
  for (const x of [IX + 140, IX + 250, IX + 380, IX + 440]) plant(c, x, y - 3, x % 3 === 0)
}

// ---------- spots: where people on a break go ----------
// face: which way they look ('up' = toward the back wall, 'down' = at the viewer); anim: type | read | null
export function spotsFor(f) {
  const s = (id, x, face, pose = 'stand', anim = null, activity = id, seatH = SEAT_H.chair) => ({ id: f.id + ':' + id, floor: f.id, x, face, pose, anim, activity: f.id + ':' + activity, ...(pose === 'sit' ? { seatH } : {}) })
  if (f.kind === 'cafe') return [
    s('fridge', IX + 15, 'up'), s('coffee', IX + 42, 'up'), s('microwave', IX + 62, 'up', 'stand', 'read'),
    s('table-0', IX + 118, 'down', 'sit', null, 'table', SEAT_H.dining), s('table-1', IX + 142, 'down', 'sit', null, 'table', SEAT_H.dining),
    s('chat-1', IX + 88, 'right', 'stand', null, 'chat'), s('chat-2', IX + 100, 'left', 'stand', null, 'chat'),
    s('pinball0', CAFE.pinball + 9, 'right', 'stand', 'type'), s('arcade0', CAFE.arcade + 8, 'up', 'stand', 'type'),
    s('foos-l', IX + 226, 'right', 'stand', 'type', 'foosball'), s('foos-r', IX + 292, 'left', 'stand', 'type', 'foosball'),
    s('pool-l', IX + 308, 'right', 'stand', 'type', 'pool'), s('pool-r', IX + 400, 'left', 'stand', 'type', 'pool'),
    s('tv-1', IX + 432, 'up', 'sit', 'type', 'tv', SEAT_H.sofa), s('tv-2', IX + 452, 'up', 'sit', 'type', 'tv', SEAT_H.sofa),
  ]
  if (f.kind === 'meeting') return [
    ...[0, 1, 2, 3, 4, 5].map(i => s('seat-' + i, IX + 176 + i * 26, 'down', 'sit', null, 'meeting', SEAT_H.dining)),
    s('board', IX + 124, 'left', 'stand', 'read'),
  ]
  if (f.kind === 'roof') return [
    s('deck-1', IX + 56, 'right', 'sit'), s('deck-2', IX + 92, 'right', 'sit'),   // loungers: backrest on the left, like a desk chair s('rail-1', IX + 186, 'right', 'stand', null, 'chat'), s('rail-2', IX + 202, 'left', 'stand', null, 'chat'),
    s('grill', IX + 310, 'up', 'stand', 'read'), s('view', IX + 410, 'up'),
  ]
  return []
}
export const partnerOf = id => /-l$/.test(id) ? id.replace(/-l$/, '-r') : /-r$/.test(id) ? id.replace(/-r$/, '-l')
  : /-1$/.test(id) ? id.replace(/-1$/, '-2') : /-2$/.test(id) && /chat|rail/.test(id) ? id.replace(/-2$/, '-1') : null

// ---------- geometry for tower features (world-pixel rects { x, y, w, h }; y is the rect's top) ----------
// A session floor's desks: the session's own (seat x, chair, desk, monitor, a free desk-top slot right of the monitor,
// a floor slot left of the chair, a back-wall slot at the room's right end, the banner strip) and one per subagent desk.
export function deskGeo(f) {
  if (!f || f.kind !== 'session') return null
  const y = f.y
  const mk = (seat, w, mx) => ({ seat, chair: { x: seat - 7, y: y - 22, w: 12, h: 22 }, desk: { x: seat + 6, y: y - 13, w, h: 13 }, monitor: { x: mx, y: y - 25, w: 10, h: 10 } })
  const s = SEAT.session
  return {
    floor: f, ...mk(s, 32, s + 15),
    top: { x: s + 26, y: y - 21, w: 11, h: 8 },
    floorSlot: { x: IX + 3, y: y - 20, w: 15, h: 20 },
    wall: { x: IX + 392, y: f.top + 9, w: 64, h: 20 },                            // the task board, right of the desks' bubbles
    banner: { x: BANNER.x0, y: f.top + 4, w: BANNER.x1 - BANNER.x0, h: 17 },     // workflow-phases' bunting while a run is live
    agents: Array.from({ length: f.desks }, (_, k) => { const sx = SEAT.agent(k); return { k, ...mk(sx, 22, sx + 11), top: { x: sx + 22, y: y - 19, w: 6, h: 6 } } }),
  }
}
export function geometry(floors) {
  const get = k => floors.find(f => f.kind === k), lobby = get('lobby'), cafe = get('cafe'), meeting = get('meeting'), roof = floors[floors.length - 1]
  const ms = meeting ? spotsFor(meeting) : []
  return {
    lobby: lobby && {
      floor: lobby, door: { x: 0, y: -42, w: WALL, h: 42 }, inside: IX + 10, outside: OUTSIDE,
      mailbox: { x: -46, y: -24, w: 12, h: 24 }, newsBox: { x: -78, y: -22, w: 16, h: 22 }, awning: { x: -30, y: -50, w: 34, h: 8 },
      wall: { x: IX + 196, y: lobby.top + 6, w: 160, h: 34 }, reception: { x: IX + 94, y: lobby.y - 22, w: 68, h: 22 },
    },
    cafe: cafe && {
      floor: cafe, spots: spotsFor(cafe), cafe: { x0: IX, x1: LOUNGE_X }, lounge: { x0: LOUNGE_X, x1: IX1 },
      counter: { x: IX + 28, y: cafe.y - 16, w: 72, h: 16 }, menu: { x: IX + 30, y: cafe.top + 12, w: 68, h: 28 },
      table: { x: IX + 104, y: cafe.y - 13, w: 54, h: 13 }, tv: { x: CAFE.tv, y: CAFE.tvY(cafe), w: 52, h: 28 },
    },
    meeting: meeting && {
      floor: meeting, seats: ms.filter(s => /:seat-/.test(s.id)), board: ms.find(s => /:board$/.test(s.id)),
      whiteboard: { x: IX + 40, y: meeting.top + 16, w: 74, h: 28 }, screen: { x: IX + 364, y: meeting.top + 8, w: 64, h: 34 },
      table: { x: IX + 156, y: meeting.y - 13, w: 168, h: 13 },
    },
    roof: { floor: roof, deck: { x: 0, y: roof.y - 3, w: BW, h: 3 }, x0: IX, x1: IX1, spots: spotsFor(roof) },
    // the LED ticker hangs inside the lobby over the reception, so nothing breaks the facade line
    facade: { ticker: lobby && { x: IX + 40, y: lobby.top + 15, w: 144, h: 12 }, wall: { x: 0, y: roof.y, w: WALL, h: GROUND - roof.y } },
    ceo: ceoSlots(floors),
  }
}
