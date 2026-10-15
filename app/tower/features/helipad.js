// helipad: a small pad on the elevator machine room's roof. When a session (or subagent) dispatches remote or cloud
// work (server ext 'helipad': RemoteTrigger, remote Agent/Workflow, /code-review ultra, /schedule, CronCreate), a
// helicopter lands, its character rides up to the roof, climbs the ladder with a briefcase
// labelled with the task and flies off; it comes back when the result or task-notification lands (30 min at most).
// Hover the pad for what is out. ?demo=helipad fakes a quick publish and a long remote review.
import { BW, SHAFT } from '../building.js'

const HX = BW + 19, LAD = BW - 8, STAND = BW - 16, TIMEOUT = 30 * 60_000, MIN_AWAY = 12_000, OLD = 3 * 60_000, WAIT = 45
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
const ICON = { artifact: '📄', cron: '⏰', schedule: '⏰', trigger: '📡', agent: '☁️', workflow: '☁️', review: '🔎' }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('helipad')
  const trips = new Map(), jobs = [], busy = new Set()
  let heli = null, primed = false, recent = []

  const roof = () => tower.floors.at(-1)
  const deck = () => { const f = roof(); return f && f.y - 34 }      // the machine room's roof
  const actor = id => tower.crowd?.find?.(id)

  // ---------- data ----------
  tower.on('sync', snap => {
    const now = Date.now(), live = new Set()
    for (const s of snap.sessions || []) for (const o of [s, ...(s.agents || [])]) for (const d of o.ext?.helipad || []) {
      live.add(d.id)
      const t = trips.get(d.id)
      if (t) { t.d = d; continue }
      const old = !primed || now - d.at > OLD
      if (d.back && old) { trips.set(d.id, { d, phase: 'done', sid: s.id }); continue }
      if (now - d.at > TIMEOUT) continue
      const trip = { d, sid: s.id, title: s.title, who: o === s ? s.id : o.id, phase: old ? 'away' : 'queued', awayAt: Date.now(), aboard: false }
      trips.set(d.id, trip)
      if (!old) jobs.push({ trip, dir: 'out' })
    }
    for (const t of trips.values()) if (!live.has(t.d.id) && t.phase === 'away') t.gone = true
    primed = true
  })
  function settle(now) {
    for (const t of trips.values()) {
      if (t.phase !== 'away') continue
      if ((t.d.back || t.gone) && now - t.awayAt > MIN_AWAY || now - t.d.at > TIMEOUT) { t.phase = 'returning'; jobs.push({ trip: t, dir: 'back' }) }
    }
    if (trips.size > 60) for (const [id, t] of trips) if (t.phase === 'done' && trips.size > 40) trips.delete(id)
  }

  // ---------- the helicopter's jobs ----------
  function start(job) {
    heli = { job, phase: 'in', t: 0, arrived: false, board: false, want: job.dir === 'out' }
    if (job.dir === 'out') job.trip.phase = 'boarding'; else heli.board = job.trip.aboard
  }
  // the passenger is called up once nothing else is steering them
  function call(h) {
    const t = h.job.trip, p = tower.person(t.who)
    if (!p || p.leaving || busy.has(t.who)) { h.want = false; return }
    if (p.steered || api.live === false || !roof()) return
    if (tower.sendTo(t.who, roof().id, STAND, { face: 'right', pose: 'stand', activity: 'helipad', then: () => { if (heli === h) h.arrived = true } })) { h.want = false; h.board = true; busy.add(t.who) }
  }
  function hide(who, on) { const a = actor(who); if (a) a.delay = on ? 1e9 : 0 }
  function step(dt) {
    const now = Date.now()
    settle(now)
    if (!heli) { if (jobs.length && roof()) start(jobs.shift()); return }
    const h = heli, t = h.job.trip, out = h.job.dir === 'out'
    h.t += dt
    if (h.want) call(h)
    const next = phase => { h.phase = phase; h.t = 0 }
    if (h.phase === 'in' && h.t > 2.6) next(out ? 'wait' : h.board ? 'alight' : 'drop')
    else if (h.phase === 'wait') {
      if (h.board && h.arrived) { hide(t.who, true); next('up') }
      else if ((!h.board && !h.want) || h.t > WAIT) { if (h.board) { tower.release(t.who); busy.delete(t.who); h.board = false } next('load') }
    }
    else if (h.phase === 'up' && h.t > 1.6) next('cross')
    else if (h.phase === 'cross' && h.t > 1.2) next(out ? 'load' : 'down')
    else if (h.phase === 'load' && h.t > 0.8) { t.aboard = h.board; next('lift') }
    else if (h.phase === 'alight' && h.t > 0.5) next('cross')
    else if (h.phase === 'down' && h.t > 1.6) { hide(t.who, false); tower.release(t.who); busy.delete(t.who); next('lift') }
    else if (h.phase === 'drop' && h.t > 1.5) next('lift')
    else if (h.phase === 'lift' && h.t > 2.8) {
      if (out) { t.phase = 'away'; t.awayAt = now } else { t.phase = 'done'; recent = [t, ...recent].slice(0, 5) }
      heli = null
    }
    // someone else took the passenger off the roof meanwhile: fly on without them
    if (heli && h.board && ['up', 'cross', 'load', 'lift', 'alight', 'down'].includes(h.phase) && actor(t.who) && actor(t.who).delay < 1e8 && !(h.phase === 'down' && h.t === 0)) { h.board = false; t.aboard = false; busy.delete(t.who) }
  }
  tower.on('step', dt => step(dt))

  // ---------- drawing ----------
  function where() {
    const y0 = deck(); if (y0 == null) return null
    if (!heli) return null
    const { phase, t } = heli
    if (phase === 'in') { const k = ease(Math.min(1, t / 2.6)); return { x: HX + (1 - k) * 230, y: y0 - 2 - (1 - k) * 150, tilt: (1 - k) * 0.18, spin: true } }
    if (phase === 'lift') { const k = ease(Math.min(1, t / 2.8)), k2 = Math.max(0, (t - 0.6) / 2.2); return { x: HX + ease(Math.min(1, k2)) * 230, y: y0 - 2 - k * 150, tilt: Math.min(1, k2) * 0.18, spin: true } }
    return { x: HX, y: y0 - 2, tilt: 0, spin: true }
  }
  function briefcase(c, x, y) { R(c, '#7a4e2a', x, y, 6, 4); R(c, '#9a6a3a', x, y, 6, 1); R(c, '#4a2e18', x + 2, y - 1, 2, 1); R(c, '#f2e6c8', x + 4, y + 1, 2, 2) }
  function chopper(c, x, y, now, tilt, passenger) {
    c.save(); c.translate(Math.round(x), Math.round(y)); c.rotate(tilt)
    R(c, '#2a2a30', -11, -1, 21, 1); R(c, '#2a2a30', -7, -3, 1, 2); R(c, '#2a2a30', 5, -3, 1, 2); R(c, '#2a2a30', 10, -2, 1, 1)
    R(c, '#c23a26', -24, -9, 15, 2); R(c, '#e2e2e8', -24, -9, 3, 1)                                     // tail boom
    R(c, '#c23a26', -25, -14, 3, 6)                                                                      // fin
    const tr = Math.floor(now / 40) % 3; R(c, '#3a3a42', -24, -16 + tr, 1, 6 - 2 * tr)                   // tail rotor
    R(c, '#d8452e', -10, -11, 19, 8); R(c, '#e86a4a', -10, -11, 19, 1); R(c, '#a8322a', -10, -4, 19, 1) // cabin
    R(c, '#d8452e', 9, -10, 2, 6); R(c, '#d8452e', 11, -9, 1, 4)                                          // nose
    R(c, '#9fd0ff', 3, -10, 7, 4); R(c, '#cfe8ff', 3, -10, 7, 1)                                          // front glass
    R(c, '#2a2f3a', 6, -9, 3, 3); R(c, '#e8e2d4', 6, -9, 3, 1)                                            // the pilot
    R(c, '#9fd0ff', -7, -10, 7, 4)                                                                         // rear window
    if (passenger) {
      const p = passenger, sheet = api.charSheet(p.look.palette, p.look.hue)
      if (sheet?.width) { c.save(); c.beginPath(); c.rect(-7, -10, 7, 4); c.clip(); c.drawImage(sheet, 16, 64, 16, 32, -12, -14, 16, 32); c.restore() }
    }
    R(c, '#f2e6c8', -9, -7, 2, 2)                                                                          // the door stripe
    R(c, '#3a3a42', -1, -13, 2, 2)
    const L = Math.floor(now / 45) % 2 ? 17 : 12
    c.fillStyle = 'rgba(40,40,48,.35)'; c.fillRect(-17, -14, 34, 1)
    R(c, '#2a2a30', -L, -14, 2 * L, 1)
    if (Math.floor(now / 500) % 2) { R(c, '#ff4a3a', -10, -4, 1, 1); R(c, '#4aff7a', 8, -4, 1, 1) }
    c.restore()
  }
  function pad(c, now) {
    const y = deck(); if (y == null) return
    const x0 = BW - 1, x1 = BW + SHAFT + 1
    R(c, '#3a3d45', x0, y - 2, x1 - x0, 2)
    for (let x = x0; x < x1; x += 6) R(c, '#f2c230', x, y - 2, 3, 1)
    R(c, '#2a2d34', BW + 25, y + 3, 7, 7); R(c, '#f2c230', BW + 26, y + 4, 1, 5); R(c, '#f2c230', BW + 30, y + 4, 1, 5); R(c, '#f2c230', BW + 27, y + 6, 3, 1)  // the H plate
    // the windsock
    R(c, '#5a5f6a', x1 - 2, y - 16, 1, 14)
    const flap = Math.round(Math.sin(now / 400))
    R(c, '#f07a2a', x1 - 1, y - 16, 3, 3); R(c, '#f4efe6', x1 + 2, y - 16 + (flap > 0 ? 1 : 0), 2, 2); R(c, '#f07a2a', x1 + 4, y - 15 + flap, 2, 2)
    R(c, Math.floor(now / 700) % 2 ? '#7bff8a' : '#2f7a41', x0, y - 3, 1, 1); R(c, Math.floor(now / 700) % 2 ? '#7bff8a' : '#2f7a41', x1 - 1, y - 3, 1, 1)
    // the ladder up the machine room's side
    const f = roof()
    for (let yy = f.y - 2; yy >= y; yy -= 4) R(c, '#7d838c', LAD, yy, 4, 1)
    R(c, '#a7adb6', LAD, y - 4, 1, f.y - y + 2); R(c, '#a7adb6', LAD + 3, y - 4, 1, f.y - y + 2)
  }
  function climber(c, now) {
    if (!heli?.board) return
    const { phase, t } = heli, out = heli.job.dir === 'out', p = tower.person(heli.job.trip.who); if (!p) return
    const y0 = deck(), f = roof(), sheet = api.charSheet(p.look.palette, p.look.hue); if (!sheet?.width) return
    let x, y, row = 2, frame = [0, 1, 2, 1][Math.floor(now / 130) % 4], flip = false
    if (phase === 'up' || phase === 'down') {
      const k = phase === 'up' ? Math.min(1, t / 1.6) : 1 - Math.min(1, t / 1.6)
      x = LAD + 2; y = f.y + (y0 - 2 - f.y) * k; row = 1; frame = [0, 1, 2, 1][Math.floor(now / 160) % 4]
    } else if (phase === 'cross') {
      const k = out ? Math.min(1, t / 1.2) : 1 - Math.min(1, t / 1.2)
      x = LAD + 2 + (HX - 6 - LAD - 2) * k; y = y0 - 2; flip = !out
    } else return
    const dx = Math.round(x - 8), dy = Math.round(y - 30)
    if (flip) { c.save(); c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(sheet, frame * 16, row * 32, 16, 32, 0, 0, 16, 32); c.restore() }
    else c.drawImage(sheet, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
    if (out || phase !== 'down') briefcase(c, Math.round(x + (row === 1 ? 4 : flip ? -8 : 3)), Math.round(y - 13))
  }
  tower.on('items', (out, now) => {
    if (!roof()) return
    out.push({ z: Z.FRONT + 10, draw: c => pad(c, now) })
    const w = where(); if (!w) return
    const h = heli, inCab = h.board && (['in', 'alight'].includes(h.phase) && h.job.dir === 'back' || ['load', 'lift'].includes(h.phase) && h.job.dir === 'out')
    out.push({ z: Z.OUTSIDE + 20, draw: c => { chopper(c, w.x, w.y, now, w.tilt, inCab ? tower.person(h.job.trip.who) : null); if (h.phase === 'drop' || (h.phase === 'load' && !h.board)) briefcase(c, HX - 9, deck() - 6) } })
    out.push({ z: Z.OUTSIDE + 21, draw: c => climber(c, now) })
  })
  tower.on('glow', (c, now, n) => {
    const w = where(); if (!w || Math.floor(now / 500) % 2 === 0) return
    for (const [dx, col] of [[-10, '255,74,58'], [8, '74,255,122']]) { const g = c.createRadialGradient(w.x + dx, w.y - 4, 0, w.x + dx, w.y - 4, 7); g.addColorStop(0, `rgba(${col},${0.7 * n})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(w.x + dx - 7, w.y - 11, 14, 14) }
  })
  // the briefcase's label while the task boards or comes back
  tower.on('overlay', v => {
    if (!heli || tower.zoom < 2 || !['wait', 'up', 'cross', 'load', 'alight', 'drop', 'down'].includes(heli.phase)) return
    const d = heli.job.trip.d, k = tower.zoom, s = tower.worldToScreen(HX, deck() - 22), fs = Math.min(4 * k, 12)
    const t = fitText(`💼 ${ICON[d.kind] || ''} ${d.label}`, 80 * k, font(fs, 700))
    v.font = font(fs, 700); const w = v.measureText(t).width + fs
    v.fillStyle = 'rgba(13,18,28,.8)'; v.beginPath(); v.roundRect(s.x - w / 2, s.y - fs * 1.4, w, fs * 1.4, 4); v.fill()
    v.textAlign = 'center'; v.textBaseline = 'middle'; v.fillStyle = heli.job.dir === 'out' ? '#ffe28a' : '#9fe8b0'; v.fillText(t, s.x, s.y - fs * 0.7)
    v.textAlign = 'left'
  })

  // ---------- hover ----------
  tower.on('hover', w => {
    const y = deck(); if (y == null) return null
    const w0 = where(), onHeli = w0 && Math.abs(w.x - w0.x) < 20 && w.y > w0.y - 16 && w.y < w0.y + 2
    if (!onHeli && !(w.x >= LAD - 2 && w.x <= BW + SHAFT + 6 && w.y >= y - 18 && w.y <= y + 12)) return null
    const away = [...trips.values()].filter(t => t.phase === 'away' || t.phase === 'returning' || t.phase === 'boarding'), now = Date.now()
    const row = t => `<div class="m">${ICON[t.d.kind] || '·'} ${esc(t.d.label)} — ${esc(t.title || '')}${t.d.back ? ` · ${esc(t.d.status || 'back')}` : ''} · ${esc(api.ago(t.d.at))}</div>`
    const now1 = heli ? `<div>${heli.job.dir === 'out' ? '🛫 taking out' : '🛬 bringing back'}: <b>${esc(heli.job.trip.d.label)}</b></div>` : ''
    return `<div class="t">🚁 Helipad · remote work</div>${now1}${away.length ? `<div>out (${away.length}):</div>${away.map(row).join('')}` : '<div class="m">nothing out right now</div>'}${recent.length ? `<div>back:</div>${recent.map(row).join('')}` : ''}`
  })

  // ---------- ?demo=helipad ----------
  if (!demo) return
  let t0 = 0, demoSid = null
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => { const f = roof(); if (f) tower.flyTo({ x: HX - 10, y: f.y - 40 }, Number(params.get('hpzoom')) || 4) }, 800) }
    if (!data.sessions.length) data.sessions.push({ id: '00000000-0000-4000-8000-000000000051', title: 'WEB CI', cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'tool', tool: 'Bash', detail: null, lastActivity: now, agents: [], ext: {} })
    demoSid = data.sessions.find(x => x.id === demoSid)?.id || (tower.people.find(p => p.kind === 'session' && !p.steered && !p.leaving && data.sessions.some(x => x.id === p.id))?.id ?? null)
    const s = data.sessions.find(x => x.id === demoSid) || data.sessions[0], P = 150_000, n = Math.floor((now - t0) / P), c0 = t0 + n * P
    const list = [{ id: `demo-pub-${n}`, kind: 'review', label: '/code-review ultra', at: c0 + 1000, back: c0 + 3000, status: 'done' },
      { id: `demo-rev-${n}`, kind: 'review', label: '/code-review ultra 1937', at: c0 + 2000, back: now - c0 > 110_000 ? c0 + 110_000 : null, status: 'completed' }]
    s.ext = { ...s.ext, helipad: list.filter(d => d.at <= now).map(d => ({ ...d, back: d.back && d.back <= now ? d.back : null })) }
  })
}
