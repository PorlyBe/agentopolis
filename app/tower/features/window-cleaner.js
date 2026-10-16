// window-cleaner: when a session (or one of its agents) runs a formatter or auto-fix (cargo fmt, prettier, eslint --fix…,
// ext['window-cleaner'] from server/features/window-cleaner.mjs), a gondola on ropes from a trolley davit on the roof
// railing comes down in front of that floor's glass and two cleaners squeegee it from left to right; the panes they leave
// sparkle for a while. One gondola, so floors queue. ?demo=windowcleaner fakes runs on the first two floors.
import { R } from '../draw.js'
const GW = 40, PARK = 32, DOWN = 110, SWEEP = 30, ROLL = 140, FRESH = 120_000, SHINE = 45_000

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('windowcleaner')
  const seen = new Set(), queue = [], shine = new Map()   // shine: sid -> { x1, done }
  let job = null, tx = PARK, gy = null, first = true, box = null

  const roof = () => tower.floors.at(-1)
  const parkY = () => roof().y - 1
  const workY = f => f.y - 12
  const x0 = () => tower.interior.x0 + 4 + GW / 2, x1 = () => tower.interior.x1 - 4 - GW / 2

  function enqueue(sid, cmd) {
    if (job?.sid === sid && job.phase !== 'up' && job.phase !== 'home') return
    const q = queue.find(q => q.sid === sid)
    if (q) q.cmd = cmd; else queue.push({ sid, cmd })
  }
  tower.on('sync', data => {
    const now = Date.now()
    for (const s of data.sessions) for (const o of [s, ...s.agents]) for (const r of o.ext?.['window-cleaner']?.runs || []) {
      const key = s.id + '|' + r.at + '|' + r.cmd
      if (seen.has(key) || r.at > now) continue
      seen.add(key)
      if (now - r.at < (first ? 20_000 : FRESH)) enqueue(s.id, r.cmd)
    }
    first = false
  })

  tower.on('step', dt => {
    const r = roof(); if (!r) return
    if (gy == null) gy = parkY()
    const toward = (v, to, sp) => v < to ? Math.min(to, v + sp * dt) : Math.max(to, v - sp * dt)
    if (!job) {
      if (queue.length) { job = { ...queue.shift(), phase: 'roll' }; shine.delete(job.sid) }
      else { tx = toward(tx, PARK, ROLL); gy = parkY(); return }
    }
    const f = tower.floor(job.sid)
    if (!f && job.phase !== 'up' && job.phase !== 'home') job.phase = 'up'
    if (job.phase === 'roll') { tx = toward(tx, x0(), ROLL); if (tx === x0()) job.phase = 'down' }
    else if (job.phase === 'down') {
      const to = workY(f), sp = Math.max(DOWN, (to - parkY()) / 7)
      gy = toward(gy, to, sp); if (gy === to) { job.phase = 'sweep'; shine.set(job.sid, { x1: tower.interior.x0, done: 0 }) }
    } else if (job.phase === 'sweep') {
      gy = workY(f); tx = toward(tx, x1(), SWEEP)
      shine.get(job.sid).x1 = tx - GW / 2 + 2
      if (tx === x1()) { Object.assign(shine.get(job.sid), { x1: tower.interior.x1, done: Date.now() }); job.phase = 'up' }
    } else if (job.phase === 'up') { gy = toward(gy, parkY(), Math.max(DOWN, (gy - parkY()) / 7)); if (gy === parkY()) job.phase = 'home' }
    else if (job.phase === 'home') { tx = toward(tx, queue.length ? x0() : PARK, ROLL); if (tx === PARK || queue.length) job = null }
    for (const [sid, s] of shine) if (s.done && Date.now() - s.done > SHINE) shine.delete(sid)
  })

  // ---------- drawing ----------
  function davit(c, ry) {
    const x = Math.round(tx)
    R(c, '#3a3f4a', x - 7, ry - 17, 3, 3); R(c, '#3a3f4a', x + 4, ry - 17, 3, 3)
    R(c, '#d8a22a', x - 7, ry - 22, 14, 5); R(c, '#f2c14e', x - 7, ry - 22, 14, 1); R(c, '#1b1c22', x - 4, ry - 20, 8, 1)
    R(c, '#c8901e', x - 1, ry - 37, 2, 15)
    R(c, '#c8901e', x - GW / 2, ry - 38, GW, 2); R(c, '#f2c14e', x - GW / 2, ry - 38, GW, 1)
    R(c, '#3a3f4a', x - GW / 2, ry - 36, 2, 2); R(c, '#3a3f4a', x + GW / 2 - 2, ry - 36, 2, 2)
  }
  function cleaner(c, cx, y, now, i, busy) {
    R(c, '#2f5a9a', cx - 2, y - 17, 5, 8); R(c, '#3a6ab0', cx - 2, y - 17, 5, 2); R(c, '#e8c25a', cx, y - 15, 1, 1)
    R(c, '#e0b088', cx - 2, y - 22, 5, 5); R(c, '#1b1c22', cx + 1, y - 21, 1, 1)
    R(c, i ? '#e86a3a' : '#f2c14e', cx - 3, y - 24, 7, 2); R(c, i ? '#e86a3a' : '#f2c14e', cx - 2, y - 25, 5, 1)
    if (!busy) { R(c, '#2f5a9a', cx + 3, y - 16, 1, 5); return }
    const s = Math.sin(now / (i ? 420 : 330) + i * 1.7), up = 0.5 + 0.5 * s
    const hx = cx + 4 + (i ? Math.round(3 * s) : 0), hy = Math.round(y - 18 - (i ? 6 : 6 + 16 * up))
    for (let k = 0; k <= 4; k++) R(c, '#2f5a9a', cx + 3 + (hx - cx - 3) * k / 4, y - 16 + (hy - y + 16) * k / 4, 1, 1)
    if (i) { R(c, '#5ab0e8', hx - 1, hy - 1, 3, 3); R(c, '#9fd0ff', hx, hy - 1, 1, 1) }
    else { R(c, '#9aa3ad', hx, hy - 4, 1, 4); R(c, '#1b1c22', hx - 3, hy - 5, 7, 1); R(c, '#9aa3ad', hx - 3, hy - 6, 7, 1) }
  }
  function gondola(c, now, ry, busy) {
    const gx = Math.round(tx - GW / 2), y = Math.round(gy), top = ry - 36
    c.fillStyle = '#2a2a30'; c.fillRect(gx + 1, top, 1, y - 18 - top); c.fillRect(gx + GW - 2, top, 1, y - 18 - top)
    R(c, '#6a7280', gx + 1, y - 18, 1, 9); R(c, '#6a7280', gx + GW - 2, y - 18, 1, 9); R(c, '#6a7280', gx + 1, y - 19, GW - 2, 1)
    if (busy) { const on = Math.floor(now / 500) % 2; R(c, on ? '#ffb02a' : '#8a5a1a', gx + GW / 2 - 1, y - 21, 2, 2) }
    if (busy || job) { cleaner(c, gx + 11, y, now, 0, job?.phase === 'sweep'); cleaner(c, gx + 28, y, now, 1, job?.phase === 'sweep') }
    R(c, '#7a5a1a', gx, y - 10, GW, 10); R(c, '#d8a22a', gx + 1, y - 9, GW - 2, 8)
    c.fillStyle = '#b8801a'; for (let x = gx + 4; x < gx + GW - 2; x += 6) c.fillRect(x, y - 9, 1, 8)
    R(c, '#f2c14e', gx, y - 12, GW, 2); R(c, '#7a5a1a', gx, y - 1, GW, 1)
    R(c, '#4a8ad8', gx + 18, y - 13, 4, 4); R(c, '#2a5a9a', gx + 18, y - 10, 4, 1)
    box = { x: gx, y: y - 26, w: GW, h: 26 }
  }
  function glass(c, f, s, now) {
    const t = f.top + 2, h = f.y - f.top - 4, X0 = tower.interior.x0, X1 = tower.interior.x1
    const k = s.done ? Math.max(0, 1 - (Date.now() - s.done) / SHINE) : 1, x1 = Math.min(X1, s.x1)
    if (!s.done && x1 < X1) {
      c.fillStyle = 'rgba(120,98,64,.13)'; c.fillRect(x1, t, X1 - x1, h)
      for (let i = 0; i < 26; i++) { const hx = X0 + api.hash(f.id + 'g' + i) % (X1 - X0), hy = t + api.hash(f.id + 'h' + i) % h; if (hx > x1) R(c, 'rgba(110,86,52,.22)', hx, hy, 2 + i % 3, 1 + i % 2) }
      c.fillStyle = 'rgba(170,215,245,.22)'; c.fillRect(Math.max(X0, x1 - 14), t, Math.min(14, x1 - X0), h)
      for (let i = 0; i < 4; i++) { const dx = x1 - 3 - i * 3, dy = (now / 18 + i * 17) % h; R(c, 'rgba(200,232,255,.6)', dx, t + dy, 1, 2) }
    }
    if (x1 <= X0 || k <= 0) return
    c.save(); c.beginPath(); c.rect(X0, t, x1 - X0 - (s.done ? 0 : 14), h); c.clip()
    c.fillStyle = `rgba(255,255,255,${0.16 * k})`
    for (let x = X0 - h; x < x1; x += 52) { c.beginPath(); c.moveTo(x + h * 0.6, t); c.lineTo(x + h * 0.6 + 7, t); c.lineTo(x + 7, t + h); c.lineTo(x, t + h); c.fill() }
    c.restore()
    for (let i = 0; i < 22; i++) {
      const sx = X0 + 6 + api.hash(f.id + 's' + i) % (X1 - X0 - 12), sy = t + 4 + api.hash(f.id + 'y' + i) % (h - 24)
      if (sx > x1 - 16) continue
      const tw = Math.sin(now / 260 + i * 2.1), a = k * Math.max(0, tw)
      if (a < 0.15) continue
      const col = `rgba(255,255,255,${a.toFixed(2)})`, l = tw > 0.7 ? 2 : 1
      R(c, col, sx, sy, 1, 1); R(c, col, sx - l, sy, l, 1); R(c, col, sx + 1, sy, l, 1); R(c, col, sx, sy - l, 1, l); R(c, col, sx, sy + 1, 1, l)
    }
  }
  tower.on('items', (out, now) => {
    const r = roof(); if (!r || gy == null) return
    const ry = r.y
    for (const [sid, s] of shine) { const f = tower.floor(sid); if (f && f.open == null) out.push({ z: Z.FRONT + 90, draw: c => glass(c, f, s, now) }) }
    out.push({ z: Z.OUTSIDE + 20, draw: c => { davit(c, ry); gondola(c, now, ry, !!job && job.phase !== 'home') } })
  })
  tower.on('glow', (c, now, n) => {
    if (!job || !box || job.phase === 'home' || Math.floor(now / 500) % 2) return
    const x = box.x + GW / 2, y = box.y + 6, g = c.createRadialGradient(x, y, 0, x, y, 14)
    g.addColorStop(0, `rgba(255,176,42,${0.7 * n})`); g.addColorStop(1, 'rgba(255,176,42,0)')
    c.fillStyle = g; c.fillRect(x - 14, y - 14, 28, 28)
  })

  function tag(c, sx, sy, text, color, fs) {
    c.font = font(fs); const w = c.measureText(text).width + 12, h = fs + 6, x = Math.round(sx), y = Math.round(sy - h / 2)
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.roundRect(x + 1, y + 2, w, h, 4); c.fill()
    c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill()
    c.fillStyle = color; c.fillRect(x, y + 3, 3, h - 6)
    c.fillStyle = '#1b1c26'; c.textBaseline = 'middle'; c.fillText(text, x + 7, y + h / 2 + 0.5)
  }
  tower.on('overlay', c => {
    const k = tower.zoom; if (k < 1.6 || !job || !box || job.phase === 'home') return
    const fs = Math.max(9, Math.min(13, 3.4 * k)), a = tower.worldToScreen(box.x + GW, box.y + 4)
    if (a.y < 0 || a.y > tower.canvas.clientHeight) return
    c.save(); tag(c, Math.min(tower.canvas.clientWidth - 120, a.x + 4), a.y, fitText('🧽 ' + job.cmd, 200, font(fs)), '#d8a22a', fs); c.restore()
  })
  tower.on('hover', w => {
    if (!box || w.x < box.x || w.x > box.x + box.w || w.y < box.y || w.y > box.y + box.h + 2) return null
    if (!job) return '<div class="t">Window cleaners</div><div>parked — they come down when a session runs a formatter</div>'
    const s = tower.snapshot?.sessions.find(s => s.id === job.sid)
    return `<div class="t">Window cleaners · ${esc(s?.title || 'a floor')}</div><div>${esc(job.cmd)}</div>` + (queue.length ? `<div>${queue.length} more floor${queue.length > 1 ? 's' : ''} waiting</div>` : '')
  })

  // ---------- ?demo=windowcleaner ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => tower.flyTo(data.sessions[0]?.id || 'lobby', 2), 800) }
    const base = t0 + Math.floor((now - t0) / 90_000) * 90_000
    data.sessions.slice(0, 2).forEach((s, i) => {
      const at = base + 1500 + i * 4000
      s.ext = { ...s.ext, 'window-cleaner': { runs: at <= now ? [{ at, cmd: i ? 'pnpm format' : 'cargo fmt' }] : [] } }
    })
  })
}
