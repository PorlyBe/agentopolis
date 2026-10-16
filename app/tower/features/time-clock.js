// time-clock: a punch clock in the lobby, under the wall of fame right of lost & found, with a rack of time cards — one per
// live session: clocked in at its first transcript entry today (server/features/time-clock.mjs), a punched hole for every
// hour it wrote something. A session that moves in punches in at the clock on its way to the elevator; one that closes
// punches out on its way to the street. After 22:00 the floors still at work get a desk lamp and a night guard does rounds
// on the elevator with a torch. Hover a card or the clock; click a card to open its session. ?demo=timeclock fakes an
// arrival and a departure on a loop and forces the late shift.
import { IX, SEAT, OUTSIDE, DOOR_X } from '../building.js'
import { R } from '../draw.js'

const CLOCK_X = IX + 284, RACK = { x: IX + 298, w: 76 }, CW = 7, CH = 12, PITCH = 9, PER_ROW = 8
const PUNCH_MS = 1700, WAIT_MS = 45_000, LINGER_MS = 30_000
const hhmm = t => new Date(t).toTimeString().slice(0, 5)
const dur = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}` }

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('timeclock')
  const forced = (params.get('time') || '').match(/^(\d{1,2}):(\d{2})$/)
  const cards = new Map()            // session id -> { id, title, in, hours, out, endedAt, gone }
  const pending = new Map()          // session id -> { kind 'in'|'out', t0, diverted }
  const punches = []                 // { id, kind, at }
  let prev = null, guard = null, round = null

  const lobby = () => tower.lobby?.floor
  const hourNow = () => forced ? Number(forced[1]) : new Date().getHours()
  const late = () => demo || hourNow() >= 22 || hourNow() < 5
  const hueOf = id => tower.floorOf?.(id)?.hue ?? api.hash(id) % 360
  const list = () => [...cards.values()].sort((a, b) => (a.in || Infinity) - (b.in || Infinity) || a.id.localeCompare(b.id))
  const rows = () => Math.max(1, Math.min(2, Math.ceil(cards.size / PER_ROW)))
  function cardRect(i) {
    const f = lobby(); if (!f) return null
    const r = Math.floor(i / PER_ROW), top = f.y - 33 + r * 15
    return { x: RACK.x + 3 + (i % PER_ROW) * PITCH, y: top, w: CW, h: CH }
  }
  const rackRect = () => { const f = lobby(); return f && { x: RACK.x, y: f.y - 35, w: RACK.w, h: rows() * 15 + 2 } }
  const clockRect = () => { const f = lobby(); return f && { x: CLOCK_X - 7, y: f.y - 32, w: 14, h: 32 } }

  // ---------- data ----------
  tower.on('sync', data => {
    const now = Date.now(), ids = new Set()
    for (const s of data.sessions) {
      ids.add(s.id)
      const tc = s.ext?.['time-clock'], c = cards.get(s.id) || { id: s.id }
      Object.assign(c, { title: s.title, in: tc?.in || c.in || null, hours: tc?.hours || c.hours || [], endedAt: s.endedAt, out: s.running === false ? (c.out || s.endedAt || now) : null, gone: null })
      const h = new Date(s.lastActivity || now).getHours()
      if (c.in && s.lastActivity >= c.in && !c.hours.includes(h)) c.hours = [...c.hours, h].sort((a, b) => a - b)
      cards.set(s.id, c)
      if (api.live === false || !prev) continue
      if (!prev.has(s.id) && s.running !== false) { pending.set(s.id, { kind: 'in', t0: performance.now() }); divert(s.id) }
      else if (s.running === false && !c.punchedOut && !pending.has(s.id)) pending.set(s.id, { kind: 'out', t0: performance.now() })
    }
    for (const [id, c] of cards) if (!ids.has(id)) { c.gone ??= now; c.out ??= now; if (now - c.gone > LINGER_MS) cards.delete(id) }
    prev = api.live === false ? null : ids
  })

  // ---------- punching ----------
  function divert(id) {
    const q = pending.get(id); if (!q || q.diverted) return
    const exit = q.kind === 'out'
    if (tower.sendTo(id, 'lobby', CLOCK_X, { face: 'up', pose: 'stand', activity: 'timeclock', exit, then: () => punch(id, q.kind) })) q.diverted = true
  }
  function punch(id, kind, auto) {
    const at = performance.now()
    punches.push({ id, kind, at }); pending.delete(id)
    const c = cards.get(id); if (c && kind === 'out') c.punchedOut = true
    if (c && kind === 'in' && !c.in) c.in = Date.now()
    if (!auto) setTimeout(() => {
      if (kind === 'in') { if (!tower.sendTo(id, id, SEAT.session, { then: () => tower.release(id) })) tower.release(id) }
      else if (!tower.sendTo(id, 'lobby', OUTSIDE, { exit: true, then: () => tower.release(id) })) tower.release(id)
    }, PUNCH_MS)
  }
  tower.on('step', (dt, now) => {
    for (const [id, q] of pending) {
      const p = tower.person(id)
      if (q.diverted && !p) { pending.delete(id); continue }
      if (q.diverted) continue
      // closing: if they never make it down (the floor folded with them in the car) the clock punches their card anyway
      if (q.kind === 'out' && (now - q.t0 > WAIT_MS || (!p && q.seen))) { punch(id, 'out', true); continue }
      if (now - q.t0 > WAIT_MS) { pending.delete(id); continue }
      if (p) q.seen = true
      if (q.kind === 'in') { if (p) divert(id); continue }
      // on their way out to the street: catch them between the elevator and the clock
      if (p && p.floor === 'lobby' && !p.riding && p.x > CLOCK_X && p.x < DOOR_X + 2) divert(id)
    }
    while (punches.length && now - punches[0].at > PUNCH_MS + 4000) punches.shift()
    nightShift(now)
  })

  // ---------- the night guard ----------
  function nightShift() {
    if (!tower.lobby) return
    if (!late()) { if (guard && !guard.gone) { guard.leave(); guard = null } return }
    if (!guard || guard.gone) { guard = tower.spawn({ id: 'night-guard', from: 'street', z: Z.WALK - 1, draw: drawGuard }); round = null }
    if (round?.busy) return
    const stops = tower.floors.filter(f => f.kind === 'session' || f.kind === 'cafe' || f.kind === 'meeting').map(f => f.id)
    stops.push('lobby')
    round ??= { i: 0 }
    const fid = stops[round.i % stops.length], f = tower.floor(fid)
    round.busy = true
    const next = () => { round.i++; round.busy = false }
    if (!f) return next()
    const a = IX + 120 + (round.i * 53) % 120, b = IX + 360 + (round.i * 31) % 60
    const g = guard
    if (!g.go(fid, a, { face: 'right', then: () => setTimeout(() => { if (g.gone || !g.go(fid, b, { face: 'left', then: () => setTimeout(next, 1200) })) next() }, 900) })) next()
  }
  function drawGuard(c, p, now) {
    const sheet = api.charSheet(2, 220), flip = (p.walking ? p.dir : p.face) !== 'right'
    const dx = Math.round(p.x - 8), dy = Math.round(p.y - 30)
    c.save()
    if (flip) { c.translate(dx + 16, dy); c.scale(-1, 1) } else c.translate(dx, dy)
    c.drawImage(sheet, (p.walking ? [0, 1, 2, 1][Math.floor(now / 140) % 4] : 1) * 16, 64, 16, 32, 0, 0, 16, 32)
    R(c, '#1a1f2a', 5, 17, 7, 9); R(c, '#2a3242', 5, 17, 7, 1); R(c, '#c8ccd4', 9, 19, 2, 2)
    R(c, '#14181f', 3, 2, 10, 3); R(c, '#14181f', 3, 5, 13, 1); R(c, '#c8ccd4', 7, 3, 2, 1)
    R(c, '#3a3a40', 12, 18, 4, 2); R(c, '#fff4c0', 16, 18, 1, 2)
    c.restore()
  }
  const torch = () => guard && !guard.gone && guard.floor && { x: guard.x + ((guard.walking ? guard.dir : 'right') === 'left' ? -9 : 9), y: guard.y - 11, dir: (guard.walking ? guard.dir : 'right') === 'left' ? -1 : 1 }

  // ---------- drawing ----------
  function drawClock(c, f, now) {
    const x = CLOCK_X, y = f.y
    R(c, 'rgba(0,0,0,.22)', x - 5, y - 1, 11, 1)
    R(c, '#4a4452', x - 1, y - 18, 2, 18); R(c, '#3a3542', x - 4, y - 2, 9, 2)
    R(c, 'rgba(0,0,0,.25)', x - 5, y - 33, 13, 16)
    R(c, '#7a5a3a', x - 6, y - 34, 12, 17); R(c, '#9a7650', x - 6, y - 34, 12, 1); R(c, '#5a4028', x - 6, y - 18, 12, 1)
    R(c, '#f4efe0', x - 4, y - 32, 8, 8); R(c, '#c8c0aa', x - 4, y - 25, 8, 1)
    const d = new Date(), h = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 2 * Math.PI, m = d.getMinutes() / 60 * 2 * Math.PI
    R(c, '#2a2a30', x - 1, y - 29, 1, 1)
    c.fillStyle = '#2a2a30'
    for (let k = 1; k <= 3; k++) c.fillRect(Math.round(x - 1 + Math.sin(m) * k), Math.round(y - 29 - Math.cos(m) * k), 1, 1)
    for (let k = 1; k <= 2; k++) c.fillRect(Math.round(x - 1 + Math.sin(h) * k), Math.round(y - 29 - Math.cos(h) * k), 1, 1)
    R(c, '#2a2016', x - 3, y - 22, 6, 2)
    const recent = punches.some(q => now - q.at < 400)
    R(c, recent ? '#e8402a' : '#a8322a', x + 2, y - 20, 2, 1)
  }
  function drawCard(c, r, card, now) {
    R(c, 'rgba(0,0,0,.2)', r.x + 1, r.y + 1, r.w, r.h)
    R(c, card.out ? '#e8e0cc' : '#fbf7ea', r.x, r.y, r.w, r.h)
    R(c, `hsl(${hueOf(card.id)} 50% 50%)`, r.x, r.y, r.w, 2)
    const hrs = card.hours || []
    hrs.slice(0, 18).forEach((_, k) => R(c, '#3a3028', r.x + 1 + (k % 3) * 2, r.y + 3 + Math.floor(k / 3), 1, 1))
    if (!card.in) R(c, '#b8b0a0', r.x + 1, r.y + 6, 5, 1)
    if (card.out) { R(c, '#c8202a', r.x, r.y + 6, r.w, 2); R(c, '#f4c0b8', r.x + 1, r.y + 6, r.w - 2, 1) }
  }
  function drawRack(c, f, now) {
    const rr = rackRect()
    R(c, 'rgba(0,0,0,.18)', rr.x + 2, rr.y + 2, rr.w, rr.h)
    R(c, '#5a4632', rr.x, rr.y, rr.w, rr.h); R(c, '#6e5840', rr.x + 1, rr.y + 1, rr.w - 2, rr.h - 2)
    const busy = new Map(punches.filter(q => now - q.at < PUNCH_MS).map(q => [q.id, q]))
    list().forEach((card, i) => {
      if (i >= PER_ROW * 2) return
      const r = cardRect(i), q = busy.get(card.id)
      if (!q) drawCard(c, r, card, now)
      R(c, '#4a3826', r.x - 1, r.y + 9, CW + 2, 4); R(c, '#806848', r.x - 1, r.y + 9, CW + 2, 1)
    })
      }
  function drawPunch(c, f, now) {
    for (const q of punches) {
      const t = (now - q.at) / PUNCH_MS, card = cards.get(q.id)
      if (t >= 1 || !card) continue
      const i = list().indexOf(card), from = cardRect(Math.max(0, i))
      const to = { x: CLOCK_X - 3, y: f.y - 26 }, k = t < 0.3 ? t / 0.3 : t > 0.75 ? 1 - (t - 0.75) / 0.25 : 1
      const r = { x: from.x + (to.x - from.x) * k, y: from.y + (to.y - from.y) * k + (t > 0.3 && t < 0.75 ? 3 : 0), w: CW, h: CH }
      drawCard(c, r, { ...card, out: q.kind === 'out' && t > 0.45 ? 1 : card.out && q.kind !== 'out' }, now)
    }
  }
  // a light bar clipped on the monitor (the desk top belongs to desk-kit and mess, the chair to whoever sits in it)
  const lampAt = d => ({ x: d.monitor.x - 1, y: d.monitor.y - 3 })
  function lamp(c, f, d) {
    const { x, y } = lampAt(d)
    R(c, '#2a2a30', x + 5, y + 2, 2, 2); R(c, '#2a2a30', x, y, d.monitor.w + 2, 2); R(c, '#4a4a54', x, y, d.monitor.w + 2, 1); R(c, '#fff2b0', x + 1, y + 2, d.monitor.w, 1)
  }
  const working = s => s && s.running !== false && s.state !== 'idle'
  tower.on('items', (out, now) => {
    const f = lobby(); if (!f) return
    out.push({ z: Z.WALL + 4, draw: c => drawRack(c, f, now) })
    out.push({ z: Z.FLOOR + 6, draw: c => drawClock(c, f, now) })
    if (punches.length) out.push({ z: Z.STAND + 6, draw: c => drawPunch(c, f, now) })
    if (late()) for (const fl of tower.floors) {
      if (fl.kind !== 'session' || !working(fl.session)) continue
      const d = tower.desk(fl.sessionId); if (d) out.push({ z: Z.FLOOR + 4, draw: c => lamp(c, fl, d) })
    }
    const t = torch()
    if (t) out.push({ z: Z.WALK + 2, draw: c => { c.fillStyle = 'rgba(255,244,190,.12)'; c.beginPath(); c.moveTo(t.x, t.y); c.lineTo(t.x + t.dir * 34, t.y + 9); c.lineTo(t.x + t.dir * 34, t.y + 19); c.fill() } })
  })
  tower.on('glow', (c, now, n) => {
    const a = demo ? Math.max(n, 0.6) : n
    if (!late() || a < 0.05) return
    const pool = (x, y, r, rgb, al) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${al})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
    for (const fl of tower.floors) {
      if (fl.kind !== 'session' || !working(fl.session)) continue
      const d = tower.desk(fl.sessionId); if (!d) continue
      const l = lampAt(d); pool(l.x + d.monitor.w / 2, l.y + 12, 20, '255,226,140', 0.5 * a)
    }
    const t = torch()
    if (t) { pool(t.x + t.dir * 24, t.y + 12, 16, '255,244,190', 0.3 * a); pool(t.x, t.y, 4, '255,250,220', 0.6 * a) }
  })
  tower.on('overlay', (c, now) => {
    const f = lobby(); if (!f) return
    const k = tower.zoom
    c.save(); c.textAlign = 'center'; c.textBaseline = 'bottom'
    for (const q of punches) {
      const e = now - q.at; if (e < PUNCH_MS * 0.35 || e > PUNCH_MS + 2500) continue
      const card = cards.get(q.id), p = tower.worldToScreen(CLOCK_X, f.y - 52), fs = Math.round(Math.max(10, Math.min(16, 3.6 * k)))
      const rise = Math.min(1, (e - PUNCH_MS * 0.35) / 400)
      c.globalAlpha = Math.min(1, (PUNCH_MS + 2500 - e) / 600)
      c.font = font(fs, 800); c.fillStyle = q.kind === 'in' ? '#2f7a41' : '#a8322a'
      c.fillText(`KA-CHUNK · ${q.kind.toUpperCase()} ${hhmm(Date.now() - (now - q.at))}`, p.x, p.y - 6 * rise)
      if (card && k >= 2) { c.font = font(Math.max(9, fs - 3), 600); c.fillStyle = '#1b1c26'; c.fillText(tower.fitText(card.title, 200, font(fs - 3)), p.x, p.y - 6 * rise - fs - 2) }
      c.globalAlpha = 1
    }
    if (k >= 3) {
      const rr = rackRect(), p = tower.worldToScreen(rr.x + rr.w / 2, rr.y - 6), fs = Math.round(Math.max(8, Math.min(11, 2.4 * k)))
      c.font = font(fs, 700); c.fillStyle = '#5a3a26'; c.fillText('TIME CARDS', p.x, p.y)
    }
    c.restore()
  })

  // ---------- hover / click ----------
  const inR = (w, r, m = 0) => r && w.x >= r.x - m && w.x <= r.x + r.w + m && w.y >= r.y - m && w.y <= r.y + r.h + m
  function cardAt(w) { const l = list(); for (let i = 0; i < Math.min(l.length, PER_ROW * 2); i++) if (inR(w, cardRect(i))) return l[i]; return null }
  const worked = card => card.in ? dur((card.out || Date.now()) - card.in) : null
  const holes = card => (card.hours || []).map(h => String(h).padStart(2, '0')).join(' ')
  const line = card => `<div><i class="s" style="background:hsl(${hueOf(card.id)} 50% 50%)"></i><b>${esc(card.title)}</b> · ${card.in ? `in ${hhmm(card.in)}` : 'no punch today'}${card.out ? ` · out ${hhmm(card.out)}` : ''}${card.in ? ` · ${worked(card)}` : ''}</div>`
  tower.on('hover', (w, person) => {
    if (person) return null
    const card = cardAt(w)
    if (card) return `<div class="t">🕘 Time card · ${esc(card.title)}</div>`
      + `<div>${card.in ? `Clocked in <b>${hhmm(card.in)}</b>` : 'Carried over — nothing written today yet'}${card.out ? ` · out <b>${hhmm(card.out)}</b>` : ''}</div>`
      + (card.in ? `<div>${worked(card)} on the clock · ${card.hours.length} hour${card.hours.length === 1 ? '' : 's'} punched</div><div class="m">hours: ${holes(card)}</div>` : '')
      + `<div class="m">↗ click to open in Orca</div>`
    if (!inR(w, rackRect(), 1) && !inR(w, clockRect(), 1)) return null
    const l = list()
    return `<div class="t">🕘 Time clock — ${l.length} card${l.length === 1 ? '' : 's'}${late() ? ' · late shift' : ''}</div>${l.map(line).join('')}<div class="m">one hole per hour with transcript activity today</div>`
  })
  tower.on('click', w => {
    const card = cardAt(w); if (!card) return false
    const s = tower.snapshot?.sessions?.find(x => x.id === card.id)
    if (s) tower.focusSession(s)
    return true
  })

  // ---------- ?demo=timeclock ----------
  if (demo) {
    const T0 = Date.now(), P = 70_000, IN = 3000, END = 42_000, GONE = 62_000
    if (!params.get('towerzoom')) setTimeout(() => { const f = lobby(); f && tower.flyTo({ x: CLOCK_X + 30, y: f.y - 24 }, 5) }, 700)
    tower.on('snapshot', data => {
      const now = Date.now(), t = (now - T0) % P, c0 = now - t
      data.sessions.forEach((s, i) => { if (!s.ext?.['time-clock']) s.ext = { ...s.ext, 'time-clock': { in: now - (3 + i * 2) * 3600_000, hours: [8, 9, 10, 11, 13, 14, 15].slice(i % 3) } } })
      if (t < IN || t >= GONE) return
      const running = t < END
      data.sessions.push({
        id: 'demo-timeclock', title: 'NIGHT OWL', cwd: '/tmp/demo', branch: 'demo/time-clock', worktree: null, running, endedAt: running ? null : c0 + END,
        state: running ? 'tool' : 'idle', tool: running ? 'Edit' : null, detail: null, lastActivity: now, agents: [],
        ext: { 'time-clock': { in: c0 + IN, hours: [new Date(c0 + IN).getHours()] } },
      })
    })
  }
}
