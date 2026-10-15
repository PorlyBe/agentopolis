// move-in-out: a session's floor is built when it appears and taken down when it ends, instead of popping in and out.
// Move-in: the floors above slide up while the new floor rises behind scaffolding, the roof crane lowers its slab, a
// ribbon is tied across the floor's elevator door and the plaque reads NOW OPEN; the session walks in from the street,
// rides up and cuts the ribbon. Move-out (its process gone for two polls in a row, so a pid-file blip never counts):
// MOVED OUT on the plaque, everyone carries a box to the elevator with two movers, the lights go off lamp by lamp, then
// the floor folds away and the floors above slide down — all inside the 20 s the server keeps an ended session.
// ?demo=moveinout fakes a session moving in, then out, on a loop.
import { IX, IX1, BW, SEAT, DOOR_X, OUTSIDE, lampXs } from '../building.js'

const BUILD = 2.2, STRIKE = 1.4, FOLD = 1.8, OPEN_TAG = 8
const ZONES = [[IX, IX + 244], [IX + 244, IX + 364], [IX + 364, IX1]]     // one per lamp, switched off left to right
const PILE_X = IX1 - 64
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const ease = t => t <= 0 ? 0 : t >= 1 ? 1 : t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2

export default function init(api, tower) {
  const { Z, font } = tower
  const demo = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('moveinout')
  const moves = new Map(), off = new Map()
  let prev = null
  const secs = (m, now) => (now - m.t0) / 1000
  const title = s => s?.title || 'A session'

  // ---------- data ----------
  tower.on('sync', data => {
    if (!api.live) { prev = null; return }      // a replay jumps between snapshots: no ceremonies
    const now = performance.now(), ids = new Set(data.sessions.map(s => s.id))
    for (const s of data.sessions) {
      const m = moves.get(s.id)
      if (prev && !prev.has(s.id) && s.running !== false) moveIn(s, now)
      if (s.running === false) {
        const n = (off.get(s.id) || 0) + 1; off.set(s.id, n)
        if (n >= 2 && m?.kind !== 'out') moveOut(s, now)
      } else {
        off.delete(s.id)
        if (m?.kind === 'out') comeBack(s, m, now)
      }
    }
    for (const [id, m] of moves) if (!ids.has(id)) { for (const n of m.movers || []) if (!n.npc.gone && !n.out) n.npc.leave(); moves.delete(id) }
    for (const id of off.keys()) if (!ids.has(id)) off.delete(id)
    prev = ids
  })

  function moveIn(s, now, quiet) {
    moves.set(s.id, { kind: 'in', id: s.id, t0: now, k: 0, cut: null, arrived: !!quiet })
    tower.setOpen(s.id, 0)
    if (quiet) return
    api.toast(`🏗 ${title(s)} moved in`, 3500)
    const a = tower.crowd.find(s.id)                // the session comes in from the street and rides up
    if (a) { a.floor = 'lobby'; a.x = OUTSIDE + 40; a.lastY = 0 }
    tower.sendTo(s.id, s.id, SEAT.session, { then: () => tower.release(s.id) })
  }
  function moveOut(s, now) {
    const was = moves.get(s.id)
    if (was?.kind === 'in') tower.setOpen(s.id, null)
    const f = tower.floor(s.id)
    if (!f) return
    const m = { kind: 'out', id: s.id, t0: now, k: 1, pile: 0, carry: new Set(), movers: [], dark: [], fold: null, by: (s.endedAt || Date.now()) + 15_000 }
    moves.set(s.id, m)
    api.toast(`📦 ${title(s)} moved out`, 3500)
    const out = id => tower.sendTo(id, 'lobby', OUTSIDE, { exit: true, then: () => { m.carry.delete(id); tower.release(id) } })
    for (const p of tower.people) {
      if (p.session !== s.id || p.leaving) continue
      if (p.floor !== s.id) { out(p.id); continue }
      m.pile++
      tower.sendTo(p.id, s.id, PILE_X - 4, { exit: true, then: () => { m.pile = Math.max(0, m.pile - 1); m.carry.add(p.id); out(p.id) } })
    }
    for (let i = 0; i < 2; i++) {
      const npc = tower.spawn({ id: `mover-${s.id}-${i}`, floor: s.id, x: DOOR_X - 4 - i * 6, face: 'left' }), n = { npc, box: false, out: false }
      m.movers.push(n); m.pile += 2
      setTimeout(() => npc.go(s.id, PILE_X + 6 + i * 6, { face: 'left', then: () => {
        m.pile = Math.max(0, m.pile - 2); n.box = true
        npc.go('lobby', OUTSIDE - 30, { then: () => { n.out = true; npc.remove() } })
      } }), 700 + i * 900)
    }
    tower.vacate(s.id)
  }
  function comeBack(s, m, now) {        // running again before the floor was gone: lights on, everyone back to work
    tower.vacate(s.id, false); tower.hide(s.id, false)
    for (const p of tower.people) if (p.session === s.id) { const a = tower.crowd.find(p.id); if (a) a.leaving = false; tower.release(p.id) }
    for (const n of m.movers) if (!n.npc.gone && !n.out) n.npc.leave()
    if (m.fold == null) { moves.delete(s.id); tower.setOpen(s.id, null); return }
    moveIn(s, now, true); moves.get(s.id).k = m.k; moves.get(s.id).t0 = now - (BUILD * m.k + 0.3) * 1000
  }

  // ---------- the timeline ----------
  const onFloor = (m, f) => tower.people.some(p => p.session === m.id && p.floor === f.id && !p.riding)
    || m.movers.some(n => !n.npc.gone && n.npc.floor === f.id)
  tower.on('step', (dt, now) => {
    for (const [id, m] of moves) {
      const t = secs(m, now), f = tower.floor(id)
      if (m.kind === 'in') {
        const k = ease((t - 0.3) / BUILD)
        if (k !== m.k) { m.k = k; tower.setOpen(id, k) }
        const p = tower.person(id)
        if (!m.arrived && p && p.floor === id && !p.riding) m.arrived = true
        if (m.arrived && m.cut == null && k >= 1) m.cut = now
        if ((m.cut != null && now - m.cut > OPEN_TAG * 1000) || t > 60) moves.delete(id)
        continue
      }
      if (!f) continue
      if (m.fold == null) {
        const empty = !onFloor(m, f) && m.pile === 0
        for (let i = 0; i < ZONES.length; i++) if (m.dark[i] == null && (i < 2 ? t > 3.5 + i * 2 : (empty && t > 6) || t > 10)) m.dark[i] = now
        if (m.dark[2] != null && (now - m.dark[2] > 700) || t > 11 || Date.now() > m.by) { m.fold = now; strand(m, f) }
        continue
      }
      const k = 1 - ease((now - m.fold) / 1000 / FOLD)
      if (k !== m.k) { m.k = k; tower.setOpen(id, k) }
      if (k <= 0) { tower.hide(id); tower.setOpen(id, null); m.gone = true }
    }
  })

  function strand(m, f) {               // still waiting for the car as the floor folds: they slip away with it
    for (const p of tower.people) if (p.session === m.id && p.floor === f.id && !p.riding) { const a = tower.crowd.find(p.id); if (a) a.fade = 1; m.carry.delete(p.id) }
    for (const n of m.movers) if (!n.npc.gone && n.npc.floor === f.id) n.npc.remove()
  }

  // ---------- the world ----------
  tower.on('items', (out, now) => {
    for (const [id, m] of moves) {
      const f = tower.floor(id), t = secs(m, now)
      if (m.kind === 'in') {
        if (!f) continue
        const strike = m.k < 1 ? 0 : Math.min(1, (t - 0.3 - BUILD) / STRIKE)
        if (strike < 1) out.push({ z: Z.FRONT + 4, draw: c => scaffold(c, f, m.k, strike, now) })
        const crane = Math.min(1, Math.max(0, t - 0.3 - BUILD) / 1.2)
        if (crane < 1) out.push({ z: Z.BEHIND + 5, draw: c => drawCrane(c, f, m.k, crane) })
        if (f.y - f.top > 40 && (m.cut == null || now - m.cut < 1800)) out.push({ z: Z.FRONT + 2, draw: c => ribbon(c, f, m.cut == null ? 0 : (now - m.cut) / 1800) })
        continue
      }
      if (!f || m.gone) continue
      out.push({ z: Z.WALL + 80, draw: c => dark(c, f, m, now, 0.62) })
      if (m.pile) out.push({ z: Z.FLOOR + 5, draw: c => pile(c, f.y, m.pile) })
      for (const pid of m.carry) { const p = tower.person(pid); if (p) out.push({ z: Z.RIDE + 2, draw: c => box(c, p.x + (p.dir === 'left' ? -4 : 3), p.y - 19) }) }
      for (const n of m.movers) if (!n.npc.gone) out.push({ z: Z.RIDE + 2, draw: c => { const p = n.npc; R(c, '#f2c230', p.x - 4, p.y - 31, 8, 2); R(c, '#d9a51e', p.x - 3, p.y - 33, 6, 2); if (n.box) { const x = p.x + (p.dir === 'left' ? -4 : 3); box(c, x, p.y - 19); box(c, x, p.y - 26) } } })
      if (m.fold != null && m.k < 0.25) out.push({ z: Z.FRONT + 6, draw: c => dust(c, f, 1 - m.k / 0.25) })
    }
  })
  tower.on('post', (c, now, ctx) => {
    const n = ctx.sun.n; if (n < 0.05) return
    for (const [id, m] of moves) { const f = tower.floor(id); if (m.kind === 'out' && f && !m.gone) dark(c, f, m, now, 0.5 * n) }
  })

  // scaffolding on the floor's face: poles every bay, ledgers, planks on every other lift, a brace per bay, a mesh while
  // it rises and hazard tape along the ceiling; struck top first once the floor stands
  function scaffold(c, f, k, strike, now) {
    const y0 = f.top - 2, y1 = f.y, h = y1 - y0; if (h <= 2) return
    const cut = y0 + h * strike
    const pl = tower.plaque(f)
    c.save(); c.beginPath(); c.rect(IX - 4, cut, BW - IX + 8, y1 - cut); c.rect(pl.x + pl.w, pl.y, -pl.w, pl.h); c.clip('evenodd')
    if (k < 1) { c.fillStyle = 'rgba(70,140,96,.22)'; c.fillRect(IX, y0, IX1 - IX, h) }
    for (let x = IX + 2; x <= IX1; x += 60) { R(c, '#6e7682', x, y0, 2, h); R(c, '#a9b0ba', x, y0, 1, h) }
    for (let y = y1 - 18, j = 0; y > y0 + 2; y -= 18, j++) {
      R(c, '#7d8590', IX, y, IX1 - IX, 1)
      if (j % 2 === 0) for (let x = IX + 4; x < IX1 - 56; x += 60) { R(c, '#a8784a', x, y - 3, 56, 3); R(c, '#c99a62', x, y - 3, 56, 1) }
    }
    c.fillStyle = '#8a929e'
    for (let x = IX + 2, i = 0; x < IX1 - 58; x += 60, i++) for (let s = 0; s < 58; s += 2) {
      const yy = i % 2 ? y0 + 2 + s * (h - 4) / 58 : y1 - 2 - s * (h - 4) / 58
      c.fillRect(x + 2 + s, Math.round(yy), 2, 1)
    }
    if (k < 1) for (let x = IX; x < IX1; x += 8) { R(c, '#f2c230', x, f.top, 4, 2); R(c, '#2b2b30', x + 4, f.top, 4, 2) }
    c.restore()
    if (k < 1 && Math.floor(now / 140) % 3 === 0) R(c, '#ffe9a0', IX + 120 + (Math.floor(now / 420) % 5) * 70, f.y - 30, 1, 1)   // a welder's spark
  }
  // a tower crane on the roof; its hook lowers a floor slab down the facade while the floor rises, then it folds away
  function drawCrane(c, f, k, fade) {
    const roof = tower.floors.at(-1); if (!roof) return
    const base = roof.y, top = base - 70, mx = 64, hx = -26
    c.save(); c.globalAlpha = 1 - fade
    for (let y = top; y < base; y += 6) { R(c, '#d9a51e', mx, y, 6, 1); R(c, '#b8861a', mx + (y / 6 % 2 ? 0 : 5), y, 1, 6) }
    R(c, '#f2c230', mx, top, 1, base - top); R(c, '#f2c230', mx + 5, top, 1, base - top)
    R(c, '#f2c230', hx - 6, top, mx + 50 - hx, 2); R(c, '#b8861a', hx - 6, top + 2, mx + 50 - hx, 1)
    for (let x = hx; x < mx; x += 6) R(c, '#d9a51e', x, top + 1, 1, 2)
    R(c, '#5a5a62', mx + 34, top + 2, 12, 8); R(c, '#3a3a42', mx - 2, top - 8, 10, 8); R(c, '#8fc0e0', mx, top - 6, 4, 3)
    const dest = f.y - 8, hy = Math.round(top + 6 + (dest - top - 6) * Math.min(1, k * 1.05) * (1 - fade))
    R(c, '#3a3a42', hx - 2, top + 2, 6, 2); R(c, '#2a2a30', hx, top + 4, 1, hy - top - 4)
    R(c, '#2a2a30', hx - 2, hy, 5, 2); R(c, '#2a2a30', hx - 10, hy + 2, 1, 4); R(c, '#2a2a30', hx + 10, hy + 2, 1, 4)
    if (k < 1) { R(c, '#7c7686', hx - 16, hy + 6, 34, 5); R(c, '#9a94a2', hx - 16, hy + 6, 34, 1); R(c, '#565060', hx - 16, hy + 10, 34, 1) }
    c.restore()
  }
  // a red ribbon with a bow across the floor's elevator door; cut, its halves drop and confetti flies
  function ribbon(c, f, p) {
    const y = f.y - 24, x0 = IX1 - 10, x1 = BW + 2, mid = (x0 + x1) / 2
    if (p <= 0) {
      R(c, '#c8302a', x0, y, x1 - x0, 2); R(c, '#e8524a', x0, y, x1 - x0, 1)
      R(c, '#c8302a', mid - 4, y - 2, 3, 3); R(c, '#c8302a', mid + 1, y - 2, 3, 3); R(c, '#8a1f1a', mid - 1, y - 1, 2, 2)
      R(c, '#c8302a', mid - 2, y + 2, 1, 4); R(c, '#c8302a', mid + 1, y + 2, 1, 4)
      return
    }
    c.save(); c.globalAlpha = Math.max(0, 1 - Math.max(0, p - 0.6) / 0.4)
    const drop = Math.min(1, p * 3)
    for (const [ax, dir] of [[x0, 1], [x1, -1]]) for (let i = 0; i < 9; i++) R(c, '#c8302a', ax + dir * i * (1 - drop * 0.85), y + i * drop * 1.1, 1, 2)
    const cols = ['#ffd84a', '#5fd17a', '#63b3f0', '#e58ad0', '#f29a4e']
    for (let i = 0; i < 34; i++) {
      const h = api.hash('confetti' + i), a = (h % 360) * Math.PI / 180, v = 18 + (h >>> 9) % 30
      R(c, cols[i % 5], mid + Math.cos(a) * v * p - 10 * p, y - 6 + Math.sin(a) * v * p * 0.7 + 30 * p * p, 1 + (h >>> 3) % 2, 2 - (h >>> 3) % 2)
    }
    c.restore()
  }
  // lights out zone by zone: a lamp flickers, then its part of the room goes dark and the bulb dims
  function dark(c, f, m, now, alpha) {
    const xs = lampXs(f)
    ZONES.forEach(([x0, x1], i) => {
      const at = m.dark[i]; if (at == null) return
      const s = (now - at) / 1000, a = s < 0.35 ? (Math.floor(s * 20) % 3 === 1 ? alpha : 0) : alpha
      if (a) { c.fillStyle = `rgba(14,16,32,${a})`; c.fillRect(x0, f.top, x1 - x0, f.y - f.top) }
      if (s >= 0.35 && xs[i] && f.y - f.top > 12) R(c, '#57514a', xs[i] - 2, f.top + 7, 5, 1)
    })
  }
  function box(c, x, y) {
    R(c, '#b98a52', x - 4, y, 9, 7); R(c, '#d3a46a', x - 4, y, 9, 1); R(c, '#8f6438', x + 4, y + 1, 1, 6); R(c, '#e8d6a8', x - 1, y, 2, 7)
  }
  function pile(c, y, n) {
    for (let i = 0; i < n; i++) { const row = i < 3 ? 0 : i < 5 ? 1 : 2, col = i < 3 ? i : i < 5 ? i - 3 : 0; box(c, PILE_X + 4 + col * 10 + row * 5, y - 7 - row * 7) }
  }
  function dust(c, f, p) {
    for (let i = 0; i < 18; i++) {
      const h = api.hash('dust' + i), x = IX + 6 + (h % (IX1 - IX - 12)), r = 1.5 + p * (2 + (h >>> 8) % 3)
      c.fillStyle = `rgba(190,180,166,${0.55 * (1 - p)})`; c.beginPath(); c.arc(x + ((h >>> 4) % 2 ? 1 : -1) * p * 6, f.y - 2 - p * 6, r, 0, Math.PI * 2); c.fill()
    }
  }

  // ---------- the plaque ----------
  tower.on('plaque', (c, f, b) => {
    const m = moves.get(f.id); if (!m) return 0
    const t = m.kind === 'out' ? 'MOVED OUT' : m.k < 1 ? '🏗 BUILDING' : 'NOW OPEN'
    const col = m.kind === 'out' ? '#e8806a' : m.k < 1 ? '#f2c230' : '#7be08e'
    const fs = b.fs * 0.86, ym = b.y + b.h / 2 + 0.5
    c.font = font(fs, 700)
    const w = c.measureText(t).width, x = b.right - w
    c.fillStyle = m.kind === 'out' ? '#4a1e18' : '#1d3a24'; c.fillRect(x - fs * 0.35, b.y + 2.5 * b.k, w + fs * 0.7, b.h - 5 * b.k)
    c.fillStyle = col; c.fillText(t, x, ym)
    return w + fs
  })

  // ---------- ?demo=moveinout: a session that arrives, works a while, closes and leaves, over and over ----------
  if (demo) {
    const T0 = Date.now(), P = 72_000, IN = 4000, END = 48_000, GONE = 68_000
    tower.on('snapshot', data => {
      const t = (Date.now() - T0) % P, c0 = Date.now() - t
      if (t < IN || t >= GONE) return
      const running = t < END, now = Date.now()
      data.sessions.push({
        id: 'demo-moveinout', title: 'NEW HIRE', cwd: '/tmp/demo', branch: 'demo/move-in', worktree: null, running, endedAt: running ? null : c0 + END,
        state: running ? 'tool' : 'idle', tool: running ? 'Edit' : null, detail: null, lastActivity: now,
        agents: [{ id: 'demo-moveinout-a1', type: 'general-purpose', description: 'unpack the boxes', state: running ? 'tool' : 'idle', tool: running ? 'Bash' : null, detail: null, lastActivity: now }],
        ext: {},
      })
    })
  }
}
