// ci-subway: a metro station under the street left of the tower, for the repo's GitHub Actions runs (snap.street.runs).
// A queued run is a passenger on the platform (shirt in its workflow's line colour), a running one a car on the tunnel
// loop (colour and length by workflow; cars bunch into trains as they slow through the station), and a finished one
// departs for good, tail lamp green or red. More than five queued and the board flashes DELAYS. The board lists the next
// runs (workflow · branch · wait). Hover a passenger, a car, the board or the entrance; click opens the run.
// ?demo=cisubway fakes a queue that builds up and drains.
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const SX0 = -300, SX1 = -10, CEIL = 22, HALL = 26, PLAT = 84, TUN0 = 92, RAIL = 121, TUN1 = 126
export const WALL_MAP = { x: -298, y: 48, w: 144, h: 29 }   // the back wall between the name plates and the benches, left of the stairs (branch-metro)
const TOP = { x: -92, y: HALL }, FOOT = { x: -150, y: PLAT }, BOARD = { x: -84, y: 30, w: 70, h: 32 }, TOTEM = -84
const LOOP = 900, GAP = 3, SLOW = 26, FAST = 64, OUT = 150, WALK = 26, DELAY = 5
const LINES = ['#d8452e', '#2f78c8', '#e8a21a', '#3a9a52', '#9a4ab8', '#1aa0a8', '#c8508a', '#8a7a5a']
const QUEUED = /^(queued|pending|waiting|requested)$/, BAD = /failure|timed_out|startup_failure/
const SKIN = ['#f1c9a5', '#d9a47e', '#b07a52', '#7a5236', '#e8b890'], HAIR = ['#2a1e16', '#5a3a22', '#c89a4a', '#1a1a1e', '#8a4a2a', '#d8d0c0']
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5],
  O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7],
  2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7],
  9: [7, 5, 7, 1, 6], '-': [0, 0, 7, 0, 0], '.': [0, 0, 0, 0, 2], '/': [1, 1, 2, 4, 4], ':': [0, 2, 0, 2, 0], '+': [0, 2, 7, 2, 0], '!': [2, 2, 2, 0, 2],
}
export function pixText(c, s, x, y, col) {
  c.fillStyle = col
  for (const ch of String(s).toUpperCase()) {
    const g = FONT[ch]
    if (g) for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (g[r] & (4 >> b)) c.fillRect(Math.round(x) + b, Math.round(y) + r, 1, 1)
    x += 4
  }
}
const mins = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + (m % 60 ? String(m % 60).padStart(2, '0') : '') }
const wfName = w => String(w || 'workflow').replace(/^[^\p{L}\p{N}]+/u, '').trim() || 'workflow'
const abbr = (s, n) => String(s || '').toUpperCase().replace(/[^A-Z0-9\-./:+!]/g, '').slice(0, n)

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const demo = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('cisubway')
  const line = w => LINES[api.hash(wfName(w)) % LINES.length], lenOf = w => 30 + (api.hash(wfName(w) + '#') % 4) * 6
  const pax = new Map(), cars = new Map()
  let runs = [], queue = [], repo = null, first = true

  // ---------- data ----------
  tower.on('snapshot', data => { if (demo) { data.street ||= {}; data.street.runs = fakeRuns(Date.now()); data.street.repo ||= 'acme/skyline' } })
  tower.on('sync', snap => {
    repo = snap.street?.repo || null
    runs = (snap.street?.runs || []).filter(r => r.id != null)
    const byId = new Map(runs.map(r => [r.id, r]))
    queue = runs.filter(r => QUEUED.test(r.status)).sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    const going = runs.filter(r => r.status === 'in_progress')
    queue.forEach((r, i) => {
      const p = pax.get(r.id)
      if (p) { p.run = r; return }
      const look = api.hash(String(r.id))
      pax.set(r.id, first ? { run: r, x: slot(i, queue.length).x, y: PLAT, phase: 'wait', look } : { run: r, x: TOP.x, y: TOP.y, phase: 'stairs', look })
    })
    for (const [id, p] of pax) {
      if (byId.get(id) && QUEUED.test(byId.get(id).status)) continue
      if (p.phase === 'board' || p.phase === 'leave') continue
      p.phase = byId.get(id)?.status === 'in_progress' ? 'board' : 'leave'; p.t = 0
    }
    going.forEach((r, i) => {
      const k = cars.get(r.id)
      if (k) { k.run = r; return }
      const p = pax.get(r.id)
      const at = first ? i * LOOP / Math.max(1, going.length) : p ? SX1 - 4 - p.x : LOOP * 0.55
      const len = lenOf(r.workflow)
      let pos = ((at % LOOP) + LOOP) % LOOP
      for (let n = 0; n < cars.size; n++) {
        const o = [...cars.values()].find(o => !o.out && pos - len - GAP < o.p && o.p - o.len - GAP < pos); if (!o) break
        pos = ((o.p - o.len - GAP) % LOOP + LOOP) % LOOP
      }
      cars.set(r.id, { run: r, p: pos, len, col: line(r.workflow), fresh: !first && !p ? 0 : 1 })
    })
    for (const [id, k] of cars) if (!k.out && byId.get(id)?.status !== 'in_progress') { const r = byId.get(id); k.out = { ok: r ? !BAD.test(r.conclusion || '') : null, conclusion: r?.conclusion || 'gone' } }
    first = false
  })

  // the platform: longest wait at the right end; a crowd packs tighter and steps into a second row
  function slot(i, n) {
    const gap = Math.max(4.5, Math.min(13, 16 - n), n > 40 ? (SX1 - SX0 - 40) / n : 0)
    const back = gap < 8 && i % 2 === 1
    return { x: SX1 - 16 - i * gap, y: PLAT - (back ? 2 : 0), back }
  }
  const xOf = k => SX1 - 4 - k.p

  // ---------- motion ----------
  const toward = (a, b, d) => Math.abs(b - a) <= d ? b : a + Math.sign(b - a) * d
  tower.on('step', dt => {
    const order = queue.map(r => r.id)
    for (const [id, p] of pax) {
      if (p.phase === 'stairs') {
        const d = WALK * dt, tx = FOOT.x, ty = FOOT.y
        p.x = toward(p.x, tx, d * 0.7); p.y = TOP.y + (TOP.x - p.x) / (TOP.x - FOOT.x) * (FOOT.y - TOP.y)
        if (p.x === tx) { p.y = PLAT; p.phase = 'walk' }
      } else if (p.phase === 'walk' || p.phase === 'wait') {
        const i = order.indexOf(id), s = slot(Math.max(0, i), order.length)
        p.x = toward(p.x, s.x, WALK * dt); p.y = s.y; p.back = s.back
        p.phase = p.x === s.x ? 'wait' : 'walk'
      } else if (p.phase === 'board') {
        p.t += dt; if (p.t > 0.9) pax.delete(id)
      } else if (p.phase === 'leave') {
        if (p.y >= PLAT && p.x !== FOOT.x) { p.x = toward(p.x, FOOT.x, WALK * dt); p.y = PLAT }
        else { p.x = toward(p.x, TOP.x, WALK * dt * 0.7); p.y = TOP.y + (TOP.x - p.x) / (TOP.x - FOOT.x) * (FOOT.y - TOP.y); if (p.x === TOP.x) pax.delete(id) }
      }
    }
    const list = [...cars.values()].sort((a, b) => a.p - b.p)
    list.forEach((k, i) => {
      if (k.fresh < 1) k.fresh = Math.min(1, k.fresh + dt * 1.5)
      if (k.out) { k.p += OUT * dt; if (k.p > LOOP + 60) cars.delete(k.run.id); return }
      const v = (xOf(k) > SX0 ? SLOW : FAST) * dt
      let next = k.p + v
      if (list.length > 1) {
        const a = list[(i + 1) % list.length], ahead = a.out ? null : ((a.p - k.p) % LOOP + LOOP) % LOOP
        if (ahead != null && ahead > 0) next = Math.min(next, k.p + Math.max(0, ahead - a.len - GAP))
      }
      k.p = next % LOOP
    })
  })

  // ---------- drawing ----------
  function station(c, now, v) {
    const tx0 = Math.max(Math.floor(v.x0) - 2, SX1 - LOOP - 80)
    // the tunnel, out under the street and the neighbours
    R(c, '#1c1c22', tx0, TUN0, SX1 - tx0, TUN1 - TUN0); R(c, '#2a2a32', tx0, TUN0, SX1 - tx0, 3); R(c, '#55504c', tx0, TUN1, SX1 - tx0, 3)
    for (let x = Math.floor(tx0 / 40) * 40; x < SX0; x += 40) { R(c, '#2e2e36', x, TUN0, 3, TUN1 - TUN0); R(c, '#e8d890', x + 1, TUN0 + 6, 1, 1) }
    R(c, '#4a4a52', tx0, RAIL + 1, SX1 - tx0, 1); R(c, '#8a8a92', tx0, RAIL, SX1 - tx0, 1)
    c.fillStyle = '#3a342e'; for (let x = Math.floor(tx0 / 6) * 6; x < SX1; x += 6) c.fillRect(x, RAIL + 2, 3, 2)
    // the station box: ceiling slab, tiled walls, a line stripe, the name plate
    R(c, '#6a6670', SX0 - 4, CEIL, SX1 - SX0 + 8, 4); R(c, '#4a4650', SX0 - 4, CEIL + 3, SX1 - SX0 + 8, 1)
    R(c, '#5a5660', SX0 - 4, CEIL, 4, TUN0 - CEIL); R(c, '#5a5660', SX1, CEIL, 4, TUN1 + 3 - CEIL)
    R(c, '#e8e0cc', SX0, HALL, SX1 - SX0, PLAT - HALL)
    c.fillStyle = '#d6cdb6'; for (let y = HALL + 5; y < PLAT; y += 5) c.fillRect(SX0, y, SX1 - SX0, 1)
    for (let y = HALL; y < PLAT; y += 5) for (let x = SX0 + ((y / 5) % 2) * 4; x < SX1; x += 8) c.fillRect(x, y, 1, 5)
    R(c, '#2f78c8', SX0, PLAT - 26, SX1 - SX0, 3); R(c, '#d8452e', SX0, PLAT - 23, SX1 - SX0, 1)
    R(c, '#1a3a7a', -280, 36, 60, 11); R(c, '#f4f0e6', -279, 37, 58, 9); R(c, '#1a3a7a', -278, 38, 56, 7); pixText(c, 'SKYLINE', -270, 39, '#f4f0e6')
    R(c, '#1a3a7a', -200, 36, 26, 11); R(c, '#f4f0e6', -199, 37, 24, 9); R(c, '#d8452e', -198, 38, 22, 7); pixText(c, 'GHA', -193, 39, '#fff')
    for (let x = SX0 + 20; x < SX1; x += 50) { R(c, '#3a3640', x, HALL, 1, 3); R(c, '#fff4c8', x - 4, HALL + 3, 9, 2) }
    // benches along the back wall
    for (const bx of [-262, -214]) { R(c, '#7a5a3a', bx, PLAT - 7, 22, 2); R(c, '#4a3a2a', bx + 2, PLAT - 5, 2, 5); R(c, '#4a3a2a', bx + 18, PLAT - 5, 2, 5) }
    // the platform: its slab and the yellow edge, the buffer stop at the tunnel's end
    R(c, '#8a867e', SX0, PLAT, SX1 - SX0, 6); R(c, '#e8c23a', SX0, PLAT, SX1 - SX0, 1); R(c, '#6a665e', SX0, PLAT + 5, SX1 - SX0, 1)
    c.fillStyle = '#2a2630'; for (let x = SX0 + 2; x < SX1; x += 4) c.fillRect(x, PLAT + 1, 2, 1)
    R(c, '#d8452e', SX1 - 6, RAIL - 12, 4, 12); R(c, '#f4f0e6', SX1 - 6, RAIL - 9, 4, 2)
    // the stairs down from the sidewalk, cut through the ceiling
    R(c, '#2a2630', TOP.x - 14, CEIL, 16, 4)
    for (let k = 0, n = (TOP.x - FOOT.x) / 4; k < n; k++) {
      const x = TOP.x - 4 - k * 4, y = TOP.y + k * (FOOT.y - TOP.y) / n
      R(c, '#9a948a', x, y, 6, 2); R(c, '#7a746a', x, y + 2, 6, PLAT - y - 2 > 4 ? 3 : 1)
    }
    c.strokeStyle = '#4a4650'; c.lineWidth = 1; c.beginPath(); c.moveTo(TOP.x + 2, TOP.y - 8); c.lineTo(FOOT.x + 2, FOOT.y - 8); c.stroke()
    R(c, '#4a4650', TOP.x + 1, TOP.y - 8, 1, 8); R(c, '#4a4650', FOOT.x + 1, FOOT.y - 8, 1, 8)
    board(c, now)
  }
  function board(c, now) {
    const b = BOARD, late = queue.length > DELAY
    R(c, '#3a3640', b.x + 10, CEIL + 4, 1, b.y - CEIL - 4); R(c, '#3a3640', b.x + b.w - 11, CEIL + 4, 1, b.y - CEIL - 4)
    R(c, '#4a4650', b.x - 1, b.y - 1, b.w + 2, b.h + 2); R(c, '#0e0e12', b.x, b.y, b.w, b.h)
    if (late) {
      const on = Math.floor(now / 500) % 2 === 0
      R(c, on ? '#7a1a16' : '#2a0e0e', b.x + 1, b.y + 1, b.w - 2, 7)
      pixText(c, `DELAYS ${queue.length}`, b.x + 3, b.y + 2, on ? '#ffd0c8' : '#ff5a4a')
    } else pixText(c, 'NEXT', b.x + 3, b.y + 2, '#ffb347')
    const going = `${runs.filter(r => r.status === 'in_progress').length}R`
    pixText(c, going, b.x + b.w - 2 - going.length * 4, b.y + 2, '#5fd17a')
    const now2 = Date.now()
    queue.slice(0, 3).forEach((r, i) => {
      const y = b.y + 10 + i * 7
      R(c, line(r.workflow), b.x + 2, y, 2, 5)
      pixText(c, abbr(wfName(r.workflow), 3), b.x + 5, y, '#ffd27a')
      pixText(c, abbr(r.branch, 8), b.x + 18, y, '#e8c890')
      const ms = now2 - Date.parse(r.createdAt), w = abbr(ms < 60_000 ? Math.max(0, Math.floor(ms / 1000)) + 's' : mins(ms), 3)
      pixText(c, w, b.x + b.w - 2 - w.length * 4, y, '#ffb347')
    })
    if (!queue.length) pixText(c, 'NO RUNS WAITING', b.x + 4, b.y + 14, '#8a6a3a')
  }
  function entrance(c, now) {
    // railings round the stairwell on the sidewalk, and the line totem
    for (const x of [TOP.x - 14, TOP.x + 2]) { R(c, '#3a3d46', x, -8, 1, 8); R(c, '#5a5d66', x - 1, -9, 3, 1) }
    R(c, '#5a5d66', TOP.x - 14, -8, 17, 1); R(c, '#3a3d46', TOP.x - 14, -4, 17, 1)
    R(c, '#3a3d46', TOTEM, -30, 2, 30); R(c, '#2a2d36', TOTEM - 2, -1, 6, 1)
    R(c, '#1a3a7a', TOTEM - 5, -40, 12, 11); R(c, queue.length > DELAY && Math.floor(now / 500) % 2 ? '#d8452e' : '#2f78c8', TOTEM - 4, -39, 10, 9)
    pixText(c, 'M', TOTEM - 1, -37, '#fff')
  }
  function person(c, p, now) {
    const h = p.look, skin = SKIN[h % SKIN.length], hair = HAIR[(h >>> 3) % HAIR.length], shirt = line(p.run.workflow), pants = (h >>> 6) % 2 ? '#2a2e3e' : '#4a3a2e'
    const x = Math.round(p.x), y = Math.round(p.y), walk = p.phase !== 'wait' && p.phase !== 'board', s = walk ? Math.floor(now / 160) % 2 : 0
    const sink = p.phase === 'board' ? Math.min(1, p.t / 0.9) : 0
    c.globalAlpha = (p.back ? 0.82 : 1) * (1 - sink)
    const yy = y + sink * 10
    R(c, pants, x - 2, yy - 6, 2, 6 - s); R(c, pants, x + 1, yy - 6, 2, 6 - (1 - s) * (walk ? 1 : 0))
    R(c, '#1a1a1e', x - 2, yy - 1 + (walk ? 0 : 0), 2, 1); R(c, '#1a1a1e', x + 1, yy - 1, 2, 1)
    R(c, shirt, x - 3, yy - 13, 7, 7); R(c, 'rgba(0,0,0,.18)', x - 3, yy - 8, 7, 2)
    R(c, skin, x - 2, yy - 18, 5, 5); R(c, hair, x - 2, yy - 19, 5, 2); R(c, hair, x + ((h >>> 9) % 2 ? -2 : 2), yy - 18, 1, 2)
    const waited = Date.now() - Date.parse(p.run.createdAt)
    if (p.phase === 'wait' && waited > 10 * 60_000) R(c, '#e8e8f0', x + 4, yy - 10, 2, 2)          // checking the watch
    if (p.phase === 'wait' && (h % 3 === 0)) { R(c, '#1a1a1e', x + 3, yy - 12, 2, 3); R(c, '#9fd0ff', x + 3, yy - 12, 1, 1) }   // a phone
    c.globalAlpha = 1
  }
  function car(c, k, now) {
    const x = xOf(k), L = k.len, top = RAIL - 20, dark = 'rgba(0,0,0,.28)'
    if (x > SX1 || x + L < SX1 - LOOP - 80) return
    c.globalAlpha = k.fresh
    R(c, k.col, x, top, L, 16); R(c, dark, x, top, L, 2); R(c, 'rgba(255,255,255,.22)', x, top + 2, L, 1); R(c, dark, x, top + 13, L, 3)
    R(c, '#1a1a1e', x + 1, top + 4, 3, 6)                                        // the cab glass
    for (let wx = x + 7; wx + 6 < x + L - 3; wx += 9) { R(c, '#cfe6f4', wx, top + 4, 6, 6); R(c, '#9ab8cc', wx, top + 8, 6, 2) }
    R(c, '#f4f0e6', x + 3, top + 11, 5, 1)
    R(c, '#2a2630', x + 2, RAIL - 4, 8, 3); R(c, '#2a2630', x + L - 10, RAIL - 4, 8, 3)
    R(c, '#5a5660', x + 3, RAIL - 2, 2, 2); R(c, '#5a5660', x + 7, RAIL - 2, 2, 2); R(c, '#5a5660', x + L - 9, RAIL - 2, 2, 2); R(c, '#5a5660', x + L - 5, RAIL - 2, 2, 2)
    R(c, '#fff8c8', x, top + 9, 1, 2)
    const tail = k.out ? (k.out.ok === false ? '#ff4a3a' : k.out.ok ? '#5fe07a' : '#c8c8d0') : '#c83a2a'
    R(c, tail, x + L - 1, top + 9, 1, 2)
    R(c, '#f4f0e6', x + L - 9, top + 1, 7, 7); pixText(c, abbr(wfName(k.run.workflow), 1) || '?', x + L - 7, top + 2, k.col)
    if (k.out) { c.fillStyle = 'rgba(220,220,230,.5)'; for (let i = 0; i < 3; i++) c.fillRect(x + L + 3 + i * 5, top + 4 + i * 4, 6 + i * 2, 1) }
    c.globalAlpha = 1
  }
  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    if (v.x0 > SX1 + 4 || v.y1 < -44 || v.y0 > TUN1 + 6) return
    out.push({ z: Z.BEHIND + 40, draw: c => station(c, now, v) })
    out.push({ z: Z.BEHIND + 41, draw: c => {
      c.beginPath(); c.rect(SX1 - LOOP - 80, TUN0, LOOP + 80, TUN1 - TUN0); c.clip()
      for (const k of cars.values()) car(c, k, now)
      const l = SX1 - LOOP - 80, g = c.createLinearGradient(l, 0, l + 70, 0)
      g.addColorStop(0, 'rgba(20,20,26,1)'); g.addColorStop(1, 'rgba(20,20,26,0)'); c.fillStyle = g; c.fillRect(l, TUN0, 70, TUN1 - TUN0)
    } })
    out.push({ z: Z.BEHIND + 42, draw: c => {
      const list = [...pax.values()].sort((a, b) => (b.back ? 1 : 0) - (a.back ? 1 : 0))
      for (const p of list) person(c, p, now)
    } })
    out.push({ z: Z.WALL + 1, draw: c => entrance(c, now) })
  })
  tower.on('glow', (c, now, n) => {
    if (n < 0.03) return
    const pool = (x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
    for (let x = SX0 + 20; x < SX1; x += 50) pool(x, HALL + 5, 26, '255,240,190', 0.35 * n)
    pool(BOARD.x + BOARD.w / 2, BOARD.y + BOARD.h / 2, 30, queue.length > DELAY ? '255,80,60' : '255,170,70', 0.3 * n)
    pool(TOTEM + 1, -35, 14, '120,170,255', 0.5 * n)
    for (const k of cars.values()) pool(xOf(k), RAIL - 10, 10, '255,250,200', 0.4 * n)
  })

  // ---------- hover / click ----------
  const inR = (w, r, pad = 0) => w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
  function hit(w) {
    if (w.x > SX1 + 4 || w.x < SX1 - LOOP - 80 || w.y < -44 || w.y > TUN1 + 4) return null
    for (const p of [...pax.values()].reverse()) if (p.phase !== 'board' && inR(w, { x: p.x - 4, y: p.y - 20, w: 8, h: 20 })) return { run: p.run, kind: 'pax' }
    for (const k of cars.values()) if (inR(w, { x: xOf(k), y: RAIL - 21, w: k.len, h: 21 })) return { run: k.run, kind: 'car', k }
    if (inR(w, BOARD, 1)) return { board: true }
    if (inR(w, { x: TOTEM - 6, y: -41, w: 14, h: 41 }) || inR(w, { x: TOP.x - 15, y: -10, w: 19, h: 10 })) return { board: true }
    return null
  }
  const ago = at => mins(Date.now() - Date.parse(at))
  const card = h => {
    const r = h.run, wf = esc(wfName(r.workflow)), sw = `<span style="color:${line(r.workflow)}">■</span>`
    const st = h.kind === 'pax' ? `waiting ${ago(r.createdAt)} on the platform` : h.k.out
      ? (h.k.out.ok === false ? `<b style="color:#ef5a5a">✗ ${esc(h.k.out.conclusion)}</b> — departing` : `<b style="color:#5fd17a">✓ ${esc(h.k.out.conclusion)}</b> — departing`)
      : `<b style="color:#f2a43a">⟳ running</b> ${ago(r.updatedAt || r.createdAt)}`
    return `<div class="t">${sw} ${wf} · ${esc(r.branch || '')}</div><div class="m">${st}</div><div class="m">queued ${ago(r.createdAt)} ago${r.event ? ' · ' + esc(r.event) : ''}</div><div class="m">↗ click for the run</div>`
  }
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    if (h.run) return card(h)
    const going = runs.filter(r => r.status === 'in_progress')
    const rows = queue.slice(0, 8).map(r => `<div class="m"><span style="color:${line(r.workflow)}">■</span> ${esc(wfName(r.workflow))} · ${esc(r.branch || '')} · ${ago(r.createdAt)}</div>`).join('')
    return `<div class="t">🚇 CI subway${queue.length > DELAY ? ' · <b style="color:#ef5a5a">DELAYS</b>' : ''}</div><div class="m">${queue.length} waiting · ${going.length} running</div>${rows || '<div class="m">no runs waiting</div>'}${queue.length > 8 ? `<div class="m">+${queue.length - 8} more</div>` : ''}<div class="m">↗ click for ${queue[0] ? 'the next run' : "the repo's Actions"}</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h) return false
    const url = h.run?.url || queue[0]?.url || (repo ? `https://github.com/${repo}/actions` : null)
    if (url) api.openLink(url)
    return true
  })
  tower.on('mode', on => { if (on && demo) setTimeout(() => tower.flyTo({ x: -110, y: 50 }, 3.4), 600) })

  // ---------- demo: a queue that builds past the DELAYS mark and drains, on a 100 s cycle ----------
  const WF = ['CI', 'web-ci', 'desktop', 'auth', 'reports-ci', 'lint']
  const BR = ['search-slot', 'browser', 'trunk', 'price-billboard', 'standup', 'settings']
  function fakeRuns(now) {
    const cyc = 100_000, t0 = Math.floor(now / cyc) * cyc, out = []
    for (const base of [t0 - cyc, t0]) for (let i = 0; i < 16; i++) {
      const q = base + (i < 12 ? i * 3_000 : 20_000 + i * 2_500), start = q + (i < 12 ? 24_000 + i * 3_000 : 6_000), end = start + 14_000 + (i % 4) * 8_000
      if (now < q) continue
      const id = 990000 + (base / cyc % 1000) * 100 + i, status = now < start ? 'queued' : now < end ? 'in_progress' : 'completed'
      out.push({ id, url: `https://github.com/acme/skyline/actions`, status, conclusion: status === 'completed' ? (i % 6 === 4 ? 'failure' : 'success') : null,
        branch: BR[i % BR.length], workflow: WF[(i * 7) % WF.length], createdAt: new Date(q - (i === 0 ? 14 * 60_000 : 0)).toISOString(), updatedAt: new Date(Math.min(now, now < start ? q : start)).toISOString(), event: 'pull_request' })
    }
    return out.filter(r => r.status !== 'completed' || now - Date.parse(r.createdAt) < cyc * 1.2)
  }
}
