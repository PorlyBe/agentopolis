// cat-chaos: Marmalade, a ginger stray (not Git, the café's black cat), slips in from the street when a session floor
// has sat idle for 10+ min and does one bit of mischief there: knocks the mug off the desk, sits on the keyboard
// (sssss…), naps in the copier's paper tray, chases the dot on the monitor or bats a pen off the desk. One cat for the
// whole tower; it leaves as soon as that session gets busy, and wanders to another idle floor after a while.
// ?demo=catchaos keeps the first session idle and runs every trick in turn.
import { IX } from '../building.js'
import { R } from '../draw.js'

const IDLE = 10 * 60_000, STAY = 7 * 60_000, REST = 90_000, HOP = 550, CX = IX + 426
const TRICKS = ['mug', 'keyboard', 'paper', 'dot', 'pen']
const SAY = { mug: 'knocked the mug off the desk', keyboard: 'sitting on the keyboard', paper: 'asleep in the copier paper tray', dot: 'chasing the dot on the monitor', pen: 'batting a pen around' }
const busy = st => st === 'tool' || st === 'thinking' || st === 'delegating' || st === 'building'
const busyAgent = st => !!st && st !== 'idle' && st !== 'done'
const O = '#3a1d0e', B = '#d9822b', H = '#f2b264', P = '#f0a0a8', E = '#fff1d0'
const CURL = [[O, [[1, 3, 8], [2, 1, 10], [3, 0, 11], [4, 0, 11], [5, 0, 11], [6, 1, 11], [0, 10, 10], [0, 13, 13], [1, 9, 14], [2, 9, 14], [3, 9, 14], [4, 9, 14], [5, 10, 13]]],
  [B, [[2, 3, 8], [3, 1, 9], [4, 1, 10], [5, 1, 9], [2, 10, 13], [3, 10, 13], [4, 10, 13]]],
  [H, [[2, 4, 6], [5, 1, 1], [6, 2, 9], [5, 10, 10], [3, 3, 3], [4, 6, 6]]], [P, [[1, 10, 10], [1, 13, 13], [4, 12, 12]]], [E, [[4, 9, 9]]]]

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const demo = api.demo('catchaos')
  const cat = { npc: null, sid: null, trick: null, st: 'away', t0: 0, since: 0, rest: 0, done: new Set(), next: 0 }
  const mess = []            // { sid, kind 'shards'|'pen', parts, until }
  let snap = null, ginger = null, demoSid = null, demoT0 = 0, flown = false

  function sheet() {
    if (ginger) return ginger
    const img = api.img?.pet_gitcat; if (!img?.naturalWidth) return null
    const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight
    const g = cv.getContext('2d'); g.drawImage(img, 0, 0)
    const d = g.getImageData(0, 0, cv.width, cv.height), a = d.data
    for (let i = 0; i < a.length; i += 4) {
      if (!a[i + 3]) continue
      const r = a[i], gg = a[i + 1], b = a[i + 2], l = (r + gg + b) / 3
      if (r > gg + 40) continue
      const to = l < 30 ? [58, 29, 14] : l < 62 ? [217, 130, 43] : l < 110 ? [242, 178, 100] : null
      if (to) [a[i], a[i + 1], a[i + 2]] = to
    }
    g.putImageData(d, 0, 0)
    return ginger = cv
  }
  function sprite(c, x, y, now, o = {}) {
    const img = sheet(); if (!img) return
    x = Math.round(x); y = Math.round(y - (o.lift || 0))
    if (o.walk) {
      const f = o.frame ?? Math.floor(now / 140) % 3
      c.save()
      if (o.dir === 'left') { c.translate(x + 16, y - 29); c.scale(-1, 1); c.drawImage(img, f * 32, 64, 32, 32, 0, 0, 32, 32) }
      else c.drawImage(img, f * 32, 64, 32, 32, x - 16, y - 29, 32, 32)
      c.restore()
    } else c.drawImage(img, (o.frame ?? 3 + Math.floor(now / 700) % 3) * 16, 0, 16, 32, x - 8, y - 29, 16, 32)
  }
  function curl(c, bx, by, now) {
    const ox = Math.round(bx) - 7, oy = Math.round(by) - 7
    R(c, 'rgba(0,0,0,.25)', ox + 1, oy + 7, 13, 1)
    if (Math.floor(now / 1500) % 2) { R(c, O, ox + 4, oy, 4, 1); R(c, B, ox + 4, oy + 1, 4, 1) }
    for (const [col, rows] of CURL) { c.fillStyle = col; for (const [r, x0, x1] of rows) c.fillRect(ox + x0, oy + r, x1 - x0 + 1, 1) }
  }

  // ---------- which floors are idle ----------
  const sessionOf = sid => snap?.sessions?.find(s => s.id === sid)
  function idleFor(s, now) {
    if (!s || busy(s.state) || (s.agents || []).some(a => busyAgent(a.state))) return 0
    return now - (s.lastActivity || now)
  }
  function pick(now) {
    const list = (snap?.sessions || []).filter(s => tower.floor(s.id) && tower.desk(s.id) && idleFor(s, now) > IDLE)
      .sort((a, b) => (cat.done.has(a.id) - cat.done.has(b.id)) || (idleFor(b, now) - idleFor(a, now)))
    return list[0] || null
  }

  // ---------- where each trick happens ----------
  function perch(sid, trick) {
    const d = tower.desk(sid), f = tower.floor(sid); if (!d || !f) return null
    const m = d.monitor, k = d.desk
    if (trick === 'paper') return { x: CX + 9, y: f.y - 22, ground: CX - 6, curl: true }
    if (trick === 'keyboard') return { x: m.x + 5, y: k.y, ground: k.x - 4, curl: true }
    if (trick === 'mug') return { x: k.x + k.w - 12, y: k.y, ground: k.x + k.w + 6 }
    if (trick === 'dot') return { x: m.x + m.w + 5, y: k.y, ground: k.x + k.w + 6, dir: 'left' }
    return { x: k.x + 8, y: k.y, ground: k.x - 4 }
  }

  function begin(s, now) {
    const tricks = demo ? [TRICKS[Math.floor((Date.now() - demoT0) / 14000) % TRICKS.length]] : tower.person(s.id)?.atDesk === false ? ['mug', 'paper', 'pen'] : TRICKS   // Git naps by the monitor of an empty desk
    cat.sid = s.id; cat.trick = tricks[Math.floor(Math.random() * tricks.length)]
    cat.since = now; cat.st = 'go'; cat.pounce = false; trick.obj = null; cat.done.add(s.id)
    if (!cat.npc || cat.npc.gone) cat.npc = tower.spawn({ id: 'cat-chaos', ...(demo ? { floor: s.id, x: tower.floor(s.id).x1 - 20 } : { from: 'door' }), draw: (c, p, t) => { if (!pose(t)) sprite(c, p.x, p.y, t, p.walking ? { walk: true, dir: p.dir, frame: Math.floor(t / 170) % 3 } : {}) } })
    const ph = perch(s.id, cat.trick)
    cat.npc.go(s.id, ph.ground, { face: 'right' })
  }
  function leave(now, toNext) {
    if ((cat.st === 'up' && !onGround()) || cat.st === 'hop') { cat.st = 'down'; cat.t0 = now; cat.toNext = toNext; return }
    cat.st = 'away'; cat.rest = now + (demo ? 1500 : toNext ? 3000 : REST); cat.sid = null
    if (!toNext && cat.npc && !cat.npc.gone) { cat.npc.leave(); cat.npc = null }
    for (const m of mess) m.until = Math.min(m.until, Date.now() + 20_000)
  }

  tower.on('sync', data => { snap = data })
  tower.on('step', (dt, now) => {
    const wall = Date.now()
    for (let i = mess.length - 1; i >= 0; i--) if (wall > mess[i].until) mess.splice(i, 1)
    for (const m of mess) for (const q of m.parts || []) if (!q.rest) {
      q.vy += 260 * dt; q.x += q.vx * dt; q.y += q.vy * dt
      if (q.y >= m.floorY) { q.y = m.floorY; if (Math.abs(q.vy) < 30) q.rest = true; q.vy *= -0.3; q.vx *= 0.5 }
    }
    if (cat.st === 'away') {
      if (now < cat.rest || !snap) return
      const s = demo ? sessionOf(demoSid) : pick(wall)
      if (s) begin(s, now)
      return
    }
    const s = sessionOf(cat.sid), ph = s && perch(cat.sid, cat.trick)
    if (!s || !ph || (!demo && idleFor(s, wall) < IDLE)) return leave(now, false)
    if (cat.st === 'go') {
      const n = cat.npc; if (!n || n.gone) return leave(now, false)
      if (n.floor === cat.sid && !n.walking && Math.abs(n.x - ph.ground) < 2) { cat.st = 'hop'; cat.t0 = now; cat.from = { x: n.x, y: n.y } }
      return
    }
    if (cat.st === 'hop' && now - cat.t0 > HOP) { cat.st = 'up'; cat.t0 = now; setup(ph, now) }
    if (cat.st === 'down' && now - cat.t0 > HOP) {
      const next = cat.toNext; cat.st = 'away'
      return leave(now, next)
    }
    if (cat.st === 'up') {
      play(dt, now, ph)
      const stay = demo ? 13000 : STAY
      if (now - cat.since > stay && (demo || pick(wall)?.id !== cat.sid)) leave(now, true)
    }
  })

  // ---------- the tricks ----------
  const trick = { obj: null }
  function setup(ph, now) {
    const f = tower.floor(cat.sid)
    trick.obj = cat.trick === 'mug' ? { x: ph.x + 9, y: ph.y, vy: 0, falling: false, broken: false, floorY: f.y }
      : cat.trick === 'pen' ? { x: ph.x + 5, y: ph.y, vx: 0, vy: 0, onFloor: false, floorY: f.y, deskEnd: tower.desk(cat.sid).desk.x + tower.desk(cat.sid).desk.w }
      : null
  }
  function play(dt, now, ph) {
    const t = now - cat.t0, o = trick.obj
    if (cat.trick === 'mug' && o && !o.broken) {
      const edge = tower.desk(cat.sid).desk.x + tower.desk(cat.sid).desk.w + 1
      if (!o.falling && t > 2600) { o.x += 6 * dt; if (o.x > edge) o.falling = true }
      if (o.falling) {
        o.vy += 280 * dt; o.y += o.vy * dt; o.x += 4 * dt
        if (o.y >= o.floorY) {
          o.broken = true
          const parts = Array.from({ length: 9 }, (_, i) => ({ x: o.x + 1, y: o.floorY - 2, vx: (i - 4) * 9 + Math.random() * 6, vy: -40 - Math.random() * 50, c: i % 3 ? '#f4f1e8' : '#e85a5a' }))
          mess.push({ sid: cat.sid, kind: 'shards', parts, x: o.x, floorY: o.floorY, until: Infinity, at: now })
        }
      }
    }
    if (cat.trick === 'pen' && o) {
      if (!o.onFloor) {
        if (t > 2000) o.vx = Math.max(o.vx, 14)
        o.x += o.vx * dt
        if (o.x > o.deskEnd + 1) { o.vy += 260 * dt; o.y += o.vy * dt; if (o.y >= o.floorY) { o.y = o.floorY; o.onFloor = true; o.vx = 0; o.hit = now + 1200 } }
      } else {
        if (cat.st === 'up' && !cat.pounce) { cat.pounce = true; cat.npc.go(cat.sid, o.x - 9, { face: 'right' }) }
        o.x += o.vx * dt; o.vx *= 1 - dt * 1.6
        const n = cat.npc
        if (now > o.hit && !n.walking) { o.vx = (Math.random() < 0.6 ? 1 : -0.5) * (28 + Math.random() * 18); o.hit = now + 1800 + Math.random() * 1600 }
        if (!n.walking && Math.abs(n.x - (o.x - 9)) > 14) n.go(cat.sid, o.x - 9, { face: 'right' })
        const f = tower.floor(cat.sid); if (f) o.x = Math.max(f.x0 + 20, Math.min(f.x1 - 30, o.x))
      }
    }
  }
  const onGround = () => cat.trick === 'pen' && trick.obj?.onFloor

  function pose(now) {
    const ph = cat.sid && perch(cat.sid, cat.trick); if (!ph) return null
    if (cat.st === 'up') {
      if (onGround()) return null
      let lift = 0
      if (cat.trick === 'dot') { const k = (now % 2600) / 2600; if (k > 0.8) lift = Math.sin((k - 0.8) / 0.2 * Math.PI) * 4 }
      return { x: ph.x, y: ph.y, curl: ph.curl, lift, dir: ph.dir }
    }
    if (cat.st !== 'hop' && cat.st !== 'down') return null
    const t = Math.min(1, (now - cat.t0) / HOP), e = cat.st === 'hop' ? t : 1 - t, f = cat.from || { x: ph.ground, y: tower.floor(cat.sid)?.y ?? ph.y }
    return { x: f.x + (ph.x - f.x) * e, y: f.y + (ph.y - f.y) * e - Math.sin(Math.PI * t) * 8, hop: true, dir: (cat.st === 'hop') === (ph.x > f.x) ? 'right' : 'left' }
  }

  function screen(c, m, now) {
    const t = now - cat.t0
    if (cat.trick === 'keyboard') {
      R(c, '#0b1410', m.x + 1, m.y + 1, m.w - 2, 5)
      const n = Math.min(24, Math.floor(t / 300))
      for (let i = 0; i < n; i++) { const row = Math.floor(i / 4), col = i % 4; if (row < 2) R(c, '#7cf29a', m.x + 1 + col * 2, m.y + 2 + row * 2, 1, 1) }
      if (Math.floor(now / 400) % 2) R(c, '#7cf29a', m.x + 1 + (n % 4) * 2, m.y + 2 + Math.min(1, Math.floor(n / 4)) * 2, 1, 1)
    } else if (cat.trick === 'dot') {
      R(c, '#05060a', m.x + 1, m.y + 1, m.w - 2, m.h - 2)
      const k = now / 380, w = m.w - 3, h = m.h - 3
      const px = (k * 1.7) % (2 * w), py = (k * 1.1) % (2 * h)
      R(c, '#ff4a3a', m.x + 1 + Math.floor(px < w ? px : 2 * w - px), m.y + 1 + Math.floor(py < h ? py : 2 * h - py), 1, 1)
    }
  }

  tower.on('items', (out, now) => {
    for (const m of mess) {
      const f = tower.floor(m.sid); if (!f || f.open != null) continue
      out.push({ z: Z.FLOOR + 7, draw: c => {
        const age = Math.min(1, (now - m.at) / 1500)
        R(c, '#6a4024', m.x - 3 - age * 3, m.floorY - 1, 7 + age * 6, 1); R(c, '#8a5a34', m.x - 1 - age * 2, m.floorY - 1, 3 + age * 3, 1)
        for (const q of m.parts) R(c, q.c, q.x, q.y - 1, q.rest ? 2 : 1, 1)
      } })
    }
    if (!cat.sid) return
    const f = tower.floor(cat.sid), d = tower.desk(cat.sid); if (!f || !d || f.open != null) return
    const o = trick.obj
    if (cat.st === 'up' || cat.st === 'down') {
      if (cat.trick === 'mug' && o && !o.broken) out.push({ z: Z.FRONT + 7, draw: c => {
        const x = Math.round(o.x), y = Math.round(o.y)
        R(c, '#e85a5a', x, y - 5, 4, 5); R(c, '#ff8a80', x, y - 5, 4, 1); R(c, '#5a2a1a', x + 1, y - 5, 2, 1); R(c, '#e85a5a', x + 4, y - 4, 1, 3)
        if (!o.falling && Math.floor(now / 500) % 2) R(c, 'rgba(255,255,255,.5)', x + 1, y - 8, 1, 2)
      } })
      if (cat.trick === 'pen' && o) out.push({ z: Z.FRONT + 7, draw: c => { R(c, '#2a4ad8', o.x, o.y - 1, 5, 1); R(c, '#e8e8f0', o.x + 5, o.y - 1, 1, 1) } })
      if (cat.trick === 'paper') out.push({ z: Z.FLOOR + 5, draw: c => { R(c, '#f7f5ee', CX - 3, f.y - 1, 4, 1); R(c, '#e6e2d6', CX + 21, f.y - 1, 5, 1); R(c, '#ffffff', CX + 25, f.y - 2, 3, 1) } })
    }
    const p = pose(now); if (!p) return
    out.push({ z: cat.trick === 'paper' ? Z.FLOOR + 7 : Z.FRONT + 6, draw: c => p.curl && !p.hop ? curl(c, p.x, p.y, now) : sprite(c, p.x, p.y, now, p.hop ? { walk: true, dir: p.dir, frame: 1 } : { lift: p.lift, frame: cat.trick === 'mug' && trick.obj?.broken ? 3 : undefined }) })
  })

  tower.on('post', (c, now) => {
    if ((cat.st !== 'up' && cat.st !== 'down') || !cat.sid || (cat.trick !== 'keyboard' && cat.trick !== 'dot')) return
    const f = tower.floor(cat.sid), d = tower.desk(cat.sid); if (f && d && f.open == null) screen(c, d.monitor, now)
  })
  tower.on('overlay', (c, now) => {
    if (cat.st !== 'up' || !cat.sid) return
    const d = tower.desk(cat.sid), k = tower.zoom; if (!d || k < 2) return
    if (cat.trick === 'dot') {
      const m = d.monitor, a = tower.worldToScreen(m.x + 1, m.y + 1), b = tower.worldToScreen(m.x + m.w - 1, m.y + m.h - 1), w = b.x - a.x - k, h = b.y - a.y - k, q = now / 380 * k
      const px = (q * 1.7) % (2 * w), py = (q * 1.1) % (2 * h)
      c.fillStyle = '#05060a'; c.fillRect(a.x, a.y, b.x - a.x, b.y - a.y)
      c.fillStyle = '#ff4a3a'; c.fillRect(Math.round(a.x + (px < w ? px : 2 * w - px)), Math.round(a.y + (py < h ? py : 2 * h - py)), Math.ceil(k), Math.ceil(k))
    }
    if (cat.trick === 'keyboard') {
      const n = Math.min(40, 4 + Math.floor((now - cat.t0) / 180)), s = tower.worldToScreen(d.monitor.x + d.monitor.w / 2, d.monitor.y - 3)
      const text = 's'.repeat(n), fs = Math.max(9, Math.round(k * 2.6))
      c.font = `700 ${fs}px ${tower.MONO}`; c.textAlign = 'center'; c.textBaseline = 'alphabetic'
      c.lineWidth = 3; c.strokeStyle = 'rgba(8,14,10,.85)'; c.strokeText(text, s.x, s.y); c.fillStyle = '#7cf29a'; c.fillText(text, s.x, s.y)
      c.textAlign = 'start'
    }
    if (cat.trick === 'paper' || cat.trick === 'keyboard') {
      const p = pose(now); if (!p) return
      for (let i = 0; i < 2; i++) {
        const t = ((now / 2800) + i / 2) % 1, al = Math.min(1, (1 - t) * 1.8, t * 6)
        const s = tower.worldToScreen(p.x + 4 + t * 5, p.y - 8 - t * 11)
        c.font = `700 ${Math.max(8, Math.round((4 + 3 * t) * k))}px ${tower.MONO}`
        c.fillStyle = `rgba(245,244,252,${al})`; c.fillText('z', s.x, s.y)
      }
    }
  })

  tower.on('hover', (w, person) => {
    if (person || !cat.sid) return null
    const p = pose(performance.now()) || (cat.npc && !cat.npc.gone ? { x: cat.npc.x, y: cat.npc.y } : null)
    if (!p || Math.abs(w.x - p.x) > 9 || w.y < p.y - 14 || w.y > p.y + 1) return null
    const s = sessionOf(cat.sid), idle = s ? Math.round(idleFor(s, Date.now()) / 60000) : 0
    const what = cat.st === 'go' ? `on the way to ${esc(s?.title || 'a quiet floor')}` : `${SAY[cat.trick]} on ${esc(s?.title || 'a quiet floor')}`
    return `<div class="t">🐈 Marmalade the office stray</div><div>${what}</div><div class="m">${demo ? 'demo' : `that floor has been quiet for ${idle} min`} · leaves when the session gets busy</div>`
  })

  // ---------- ?demo=catchaos ----------
  if (!demo) return
  tower.on('snapshot', data => {
    const now = Date.now(); if (!demoT0) demoT0 = now
    const s = demoSid ? data.sessions.find(q => q.id === demoSid) : data.sessions[0]
    if (!s) return
    demoSid = s.id
    s.state = 'idle'; s.lastActivity = now - 14 * 60_000
    for (const a of s.agents || []) a.state = 'done'
    if (!flown && !location.search.includes('towerzoom')) { flown = true; setTimeout(() => { const f = tower.floor(demoSid); if (f) tower.flyTo({ x: 150, y: f.y - 30 }, 4) }, 600) }
  })
}
