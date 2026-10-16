// drones: when a session (or one of its agents) downloads packages (server ext 'drones': pnpm/npm/yarn installs,
// cargo fetching crates, pip, swift package resolve, gradle), a loading ledge slides out of the elevator shaft's outer
// wall at that floor and quadcopters fly in from the sky, each lowering a crate labelled with a package name onto it,
// then fly off; more packages, more drones. The crates are taken in and the ledge folds away. An install still running
// keeps one drone hovering by the ledge. It stays right of the shaft, clear of the window-cleaner's gondola (on the
// facade) and the refactor crane (on the left wall). ?demo=drones fakes deliveries on the first floors.
import { BW, SHAFT } from '../building.js'
import { R } from '../draw.js'

const LX = BW + SHAFT, LW = 22, CW = 7, CH = 6, SLOTS = 3, MAXD = 6
const GAP = 1.1, FLY = 2.6, LOWER = 1.0, OFF = 2.2, KEEP = 9, SLIDE = 0.6, FRESH = 5 * 60_000
const ICON = { pnpm: '📦', npm: '📦', yarn: '🧶', cargo: '🦀', pip: '🐍', swift: '🐦', gradle: '🐘' }
const TINT = { pnpm: '#c08a3e', npm: '#b8743a', yarn: '#b88a52', cargo: '#a8643a', pip: '#9a8240', swift: '#b0703e', gradle: '#8f7a48' }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('drones')
  const docks = new Map()   // session id -> { sid, s, queue: [], job, out (ledge 0..1), crates: [], drones: [], hover, pending }
  const seen = new Set()
  let first = true, t = 0

  const dock = s => { let d = docks.get(s.id); if (!d) docks.set(s.id, d = { sid: s.id, s, queue: [], job: null, out: 0, crates: [], drones: [], hover: null, pending: null }); d.s = s; return d }

  tower.on('sync', data => {
    const now = Date.now()
    for (const s of data.sessions) {
      const x = s.ext?.drones
      if (!x || s.running === false) { const d = docks.get(s.id); if (d) d.pending = null; continue }
      const d = dock(s)
      d.pending = x.pending?.[0] || null
      for (const v of x.deliveries || []) {
        const key = `${v.who}|${v.at}|${v.cmd}`
        if (seen.has(key)) continue
        seen.add(key)
        if (now - v.at < (first ? 60_000 : FRESH)) d.queue.push(v)
      }
    }
    for (const [sid, d] of docks) if (!data.sessions.some(s => s.id === sid)) docks.delete(sid)
    first = false
  })

  function begin(d) {
    const v = d.queue.shift(), n = Math.min(MAXD, Math.max(1, Math.ceil(Math.sqrt(v.count))))
    const labels = []
    for (let i = 0; i < n; i++) labels.push(v.pkgs[i] || v.kind)
    if (v.count > n) labels[n - 1] = n > 1 || !v.pkgs[0] ? `+${v.count - n + 1} more` : `${v.pkgs[0]} +${v.count - 1}`
    d.job = { v, t: 0, done: null }
    d.crates = []
    d.drones = labels.map((label, i) => ({ i, label, t: -i * GAP, slot: i, phase: 'in', seed: Math.random() * 6 }))
    if (d.hover) { d.drones[0].t = 0.6 * FLY; d.drones[0].from = { x: d.hover.x, y: d.hover.y }; d.hover = null }
  }
  const slotXY = (f, k) => ({ x: LX + 1 + (k % SLOTS) * CW, y: f.y - 1 - CH - Math.floor(k / SLOTS) * CH })

  tower.on('step', dt => {
    t += dt
    for (const [sid, d] of docks) {
      const f = tower.floor(sid)
      if (!f || f.kind !== 'session') { d.job = null; d.drones = []; d.crates = []; d.out = 0; continue }
      const want = !!(d.job || d.pending || d.queue.length || d.hover)
      d.out = want ? Math.min(1, d.out + dt / SLIDE) : Math.max(0, d.out - dt / SLIDE)
      if (!d.job && d.queue.length && d.out >= 1) begin(d)
      if (!d.job && d.pending && !d.hover) d.hover = { x: LX + 60, y: f.y - 120, a: 0 }
      if (d.hover) {
        const tx = LX + LW / 2 + 14 + Math.sin(t * 0.9) * 8, ty = f.y - 26 + Math.sin(t * 1.7) * 3
        d.hover.x += (tx - d.hover.x) * Math.min(1, dt * 1.4); d.hover.y += (ty - d.hover.y) * Math.min(1, dt * 1.4)
        if (!d.pending && !d.job) { d.hover.y -= 60 * dt; d.hover.x += 40 * dt; d.hover.a = (d.hover.a || 0) + dt; if (d.hover.a > 2) d.hover = null }
      }
      if (!d.job) continue
      const j = d.job
      j.t += dt
      for (const q of d.drones) {
        q.t += dt
        if (q.phase === 'in' && q.t >= FLY) { q.phase = 'lower'; q.t = 0 }
        else if (q.phase === 'lower' && q.t >= LOWER) { q.phase = 'off'; q.t = 0; d.crates.push({ slot: q.slot, label: q.label, at: j.t }) }
        else if (q.phase === 'off' && q.t >= OFF) q.phase = 'gone'
      }
      d.drones = d.drones.filter(q => q.phase !== 'gone')
      if (!d.drones.length && j.done == null) j.done = j.t
      if (j.done != null && j.t - j.done > KEEP) {
        const k = Math.min(1, (j.t - j.done - KEEP) / 1.2)
        for (const c of d.crates) c.take = k
        if (k >= 1) { d.job = null; d.crates = [] }
      }
    }
  })

  // ---------- geometry ----------
  function droneXY(d, q, f) {
    const s = slotXY(f, q.slot), hx = s.x + CW / 2, hy = s.y - 10
    const from = q.from || { x: LX + 70 + q.i * 16 + q.seed * 4, y: f.y - 230 - q.i * 14 }
    if (q.phase === 'in') {
      if (q.t < 0) return null
      const k = Math.min(1, q.t / FLY), e = 1 - Math.pow(1 - k, 3)
      return { x: from.x + (hx - from.x) * e + Math.sin(q.t * 5 + q.seed) * (1 - e) * 2, y: from.y + (hy - from.y) * e, rope: 3, tilt: k < 0.85 ? -1 : 0, a: Math.min(1, q.t * 3), crate: true }
    }
    if (q.phase === 'lower') { const k = Math.min(1, q.t / LOWER); return { x: hx, y: hy - k * 2, rope: 3 + k * 4, tilt: 0, a: 1, crate: k < 1 } }
    const k = Math.min(1, q.t / OFF), e = k * k
    return { x: hx + e * (90 + q.i * 10), y: hy - 2 - e * 200, rope: 0, tilt: 1, a: 1 - Math.max(0, k - 0.7) / 0.3, crate: false }
  }

  // ---------- drawing ----------
  function drone(c, x, y, tilt, now, seed) {
    x = Math.round(x); y = Math.round(y)
    const blur = Math.floor(now / 45 + seed) % 2
    R(c, '#2b2f38', x - 6, y, 12, 1)                                   // arms
    R(c, '#3a404c', x - 2, y - 1, 5, 3); R(c, '#5c6574', x - 1, y - 1, 3, 1)   // body
    R(c, '#2b2f38', x - 6, y - 1, 1, 1); R(c, '#2b2f38', x + 5, y - 1, 1, 1)  // motors
    c.fillStyle = 'rgba(210,220,230,.75)'
    const rw = blur ? 6 : 4, ry = y - 2 + (tilt < 0 ? 0 : 0)
    c.fillRect(x - 6 - rw / 2 + 0.5, ry + (tilt > 0 ? 1 : 0), rw, 1); c.fillRect(x + 5 - rw / 2 + 0.5, ry + (tilt < 0 ? 1 : 0), rw, 1)
    R(c, Math.floor(now / 400 + seed) % 2 ? '#ff4a3a' : '#7a2a24', x - 2, y + 1, 1, 1); R(c, '#4aff7a', x + 2, y + 1, 1, 1)
  }
  function crate(c, x, y, tint, a = 1) {
    c.globalAlpha = a
    R(c, '#6e4a26', x, y, CW, CH); R(c, tint, x + 1, y + 1, CW - 2, CH - 2)
    R(c, '#6e4a26', x + 1, y + 3, CW - 2, 1); R(c, '#f4e6c8', x + 2, y + 1, 3, 1)
    c.globalAlpha = 1
  }
  function ledge(c, f, k) {
    const w = Math.round(LW * k); if (w < 1) return
    const y = f.y - 1
    R(c, '#4a4f5a', LX, y - 1, 2, 5)                                  // the hatch frame in the shaft wall
    R(c, '#7a828f', LX, y, w, 2); R(c, '#9aa3b0', LX, y, w, 1)
    for (let x = 0; x < w; x += 4) R(c, x % 8 ? '#2a2a2a' : '#f2c230', LX + x, y + 2, Math.min(4, w - x), 1)
    if (w > 12) for (let i = 0; i < 6; i++) R(c, '#5a606c', LX + 2 + i * 2, y + 8 - i, 2, 1)
    if (w >= LW) { R(c, '#d8d2c4', LX + 6, y - 0, 1, 1); R(c, '#d8d2c4', LX + 14, y - 0, 1, 1) }
  }

  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    if (v.x1 < LX - 20) return
    for (const [sid, d] of docks) {
      const f = tower.floor(sid); if (!f || (!d.out && !d.hover && !d.drones.length)) continue
      if (f.y < v.y0 - 20 || f.y - 260 > v.y1) continue
      const tint = TINT[d.job?.v.kind] || TINT.pnpm
      out.push({ z: Z.OUTSIDE + 6, draw: c => {
        ledge(c, f, d.out)
        for (const cr of d.crates) {
          const s = slotXY(f, cr.slot), dx = -(cr.take || 0) * (s.x - LX + CW)
          c.save(); c.beginPath(); c.rect(LX, s.y - 2, LW + 4, CH + 4); c.clip(); crate(c, s.x + dx, s.y, tint); c.restore()
        }
        for (const q of d.drones) {
          const p = droneXY(d, q, f); if (!p) continue
          c.globalAlpha = Math.max(0, Math.min(1, p.a))
          if (p.crate) { R(c, '#3a3a40', p.x, p.y + 2, 1, p.rope); crate(c, Math.round(p.x) - 3, Math.round(p.y + 2 + p.rope), tint, c.globalAlpha) ; c.globalAlpha = Math.max(0, Math.min(1, p.a)) }
          drone(c, p.x, p.y, p.tilt, now, q.seed)
          c.globalAlpha = 1
        }
        if (d.hover) drone(c, d.hover.x, d.hover.y, 0, now, 3)
      } })
    }
  })
  tower.on('glow', (c, now, n) => {
    for (const [sid, d] of docks) {
      const f = tower.floor(sid); if (!f) continue
      const pts = d.drones.map(q => droneXY(d, q, f)).filter(Boolean)
      if (d.hover) pts.push(d.hover)
      for (const p of pts) {
        if (Math.floor(now / 400) % 2) continue
        const g = c.createRadialGradient(p.x - 2, p.y + 1, 0, p.x - 2, p.y + 1, 5); g.addColorStop(0, `rgba(255,74,58,${0.8 * n})`); g.addColorStop(1, 'rgba(255,74,58,0)')
        c.fillStyle = g; c.fillRect(p.x - 7, p.y - 4, 10, 10)
      }
    }
  })

  // ---------- package tags ----------
  tower.on('overlay', c => {
    if (!docks.size || tower.zoom < 2.2) return
    const k = tower.zoom, fs = Math.round(Math.min(12, 3.2 * k)), H = tower.canvas.clientHeight
    c.save(); c.textBaseline = 'middle'; c.font = font(fs, 700)
    const tag = (sx, sy, text, bg) => {
      const tt = fitText(text, 34 * k, c.font), w = c.measureText(tt).width + 8, h = fs + 5
      const x = Math.round(sx + 4), y = Math.round(sy - h / 2)
      c.fillStyle = bg; c.beginPath(); c.roundRect(x, y, w, h, 3); c.fill()
      c.fillStyle = '#fff8ec'; c.fillText(tt, x + 4, y + h / 2 + 0.5)
    }
    for (const [sid, d] of docks) {
      const f = tower.floor(sid); if (!f) continue
      for (const q of d.drones) {
        const p = droneXY(d, q, f); if (!p?.crate || p.a < 0.6) continue
        const s = tower.worldToScreen(p.x + 4, p.y + 4 + p.rope + CH / 2)
        if (s.y > -20 && s.y < H + 20) tag(s.x, s.y, q.label, 'rgba(110,74,38,.92)')
      }
      if (d.job && d.crates.length && !d.drones.length && !(d.crates[0].take > 0)) {
        const s = tower.worldToScreen(LX + LW + 2, f.y - 6)
        tag(s.x, s.y, `${ICON[d.job.v.kind] || '📦'} ${d.job.v.count} pkg${d.job.v.count === 1 ? '' : 's'} · ${d.job.v.kind}`, 'rgba(40,44,52,.9)')
      }
      if (d.hover && d.pending) { const s = tower.worldToScreen(d.hover.x + 6, d.hover.y - 2); tag(s.x, s.y, `${d.pending.kind} fetching…`, 'rgba(40,44,52,.85)') }
    }
    c.restore()
  })

  // ---------- hover / click ----------
  const hit = w => {
    for (const [sid, d] of docks) {
      const f = tower.floor(sid); if (!f || (!d.out && !d.hover)) continue
      if (w.x >= LX - 2 && w.x <= LX + LW + 50 && w.y >= f.y - 60 && w.y <= f.y + 8) return d
    }
    return null
  }
  tower.on('hover', w => {
    const d = hit(w); if (!d) return null
    const v = d.job?.v
    if (!v) return d.pending ? `<div class="t">Delivery drones · ${esc(d.s.title)}</div><div class="m">${esc(d.pending.kind)} is fetching packages…</div><div class="m" style="font-family:ui-monospace,Menlo,monospace;max-width:420px">${esc(d.pending.cmd)}</div>` : null
    return `<div class="t">${ICON[v.kind] || '📦'} Delivery · ${esc(d.s.title)}</div><div class="m">${v.count} package${v.count === 1 ? '' : 's'} via ${esc(v.kind)}${v.who !== d.sid ? ' · a subagent' : ''}</div>`
      + (v.pkgs.length ? `<div style="font-family:ui-monospace,Menlo,monospace;max-width:420px">${v.pkgs.map(esc).join(', ')}</div>` : '')
      + `<div class="m" style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:420px">${esc(v.cmd)}</div>`
  })
  tower.on('click', w => { const d = hit(w); if (!d) return false; tower.focusSession(d.s); return true })

  // ---------- ?demo=drones ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!data.sessions.length) data.sessions.push({ id: '00000000-0000-4000-8000-000000000061', title: 'LEDGER', cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'tool', tool: 'Bash', detail: null, lastActivity: now, agents: [], ext: {} })
    const ss = data.sessions.filter(s => s.running !== false).slice(0, 2)
    if (!t0) { t0 = now; if (!params.get('towerzoom') && ss[0]) setTimeout(() => { const f = tower.floorOf(ss[0].id); if (f) tower.flyTo({ x: LX + 10, y: f.y - 50 }, Number(params.get('dronezoom')) || 3.4) }, 800) }
    const cyc = 30_000, k = Math.floor((now - t0) / cyc), at = t0 + k * cyc + 4000
    const sets = [
      { kind: 'pnpm', count: 9, pkgs: ['react', 'zod', '@tanstack/react-router', 'vite', 'vitest', 'happy-dom'], cmd: 'pnpm install' },
      { kind: 'cargo', count: 23, pkgs: ['tokio', 'serde', 'hyper-util', 'reqwest', 'thiserror', 'axum'], cmd: 'cargo build -p api-server' },
      { kind: 'pip', count: 2, pkgs: ['requests', 'idna'], cmd: 'pip install requests' },
    ]
    ss.forEach((s, i) => {
      const v = sets[(k + i) % sets.length]
      s.running = true
      s.ext = { ...s.ext, drones: { deliveries: now >= at ? [{ who: s.id, at, ...v }] : [], pending: now < at && i === 0 ? [{ who: s.id, kind: v.kind, cmd: v.cmd, since: at - 4000 }] : [] } }
    })
  })
}
