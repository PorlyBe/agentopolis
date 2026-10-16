// standup: at 10:00 local, once a day, every live session's character rides up to the meeting room and stands round
// the table for about two minutes; one by one each says "<title>: <branch> · <state> · PR #N" (the PR as my-prs owns it:
// the session's branch is its head, or the session opened it). A wall clock in the room keeps the time, a STAND-UP sign
// hangs by the door while it runs. Sessions waiting on the user (the waiting line) or steered by another feature stay put.
// ?demo=standup holds one now.
import { IX } from '../building.js'
import { R } from '../draw.js'

const KEY = 'ao-standup-date', HOUR = 10, LATE_MIN = 10, BUDGET_MS = 120_000, GATHER_MS = 40_000, CAP_MS = 200_000
const SLOTS = [189, 215, 241, 267, 293, 163, 319, 150, 332, 137, 345, 124, 358].map(x => IX + x)
const CLOCK = { x: IX + 140, dy: 26, r: 6 }, SIGN = { x: IX + 430, w: 35, h: 11 }
const GLYPH = { S: '111100111001111', T: '111010010010010', A: '010101111101101', N: '101111111101101', D: '110101101101110', '-': '000000111000000', U: '101101101101111', P: '111101111100100' }
function pixText(c, s, x, y, col) {
  c.fillStyle = col
  for (const ch of s) { const g = GLYPH[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(x + i % 3, y + Math.floor(i / 3), 1, 1); x += 4 }
}
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}` }
const lsGet = () => { try { return localStorage.getItem(KEY) } catch { return null } }
const lsSet = v => { try { localStorage.setItem(KEY, v) } catch {} }

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const params = api.params, demo = api.demo('standup')
  let su = null, planAt = 0, demoAt = demo ? performance.now() + 2500 : 0

  const room = () => tower.floor('meeting')
  const skip = s => !s || s.running === false || s.state === 'waiting' || s.state === 'attention'
  const sessionOf = id => tower.snapshot?.sessions?.find(s => s.id === id)
  function prOf(s) {
    const st = tower.snapshot?.street, mine = st?.mine || [], repo = st?.repo
    const pc = s.ext?.['pr-celebration']?.pr
    return mine.find(p => s.branch && s.branch === p.headRefName)
      || mine.find(p => pc?.n === p.number && (!repo || !pc.repo || pc.repo === repo))
      || (demo && !mine.length && s.branch && s.branch !== 'trunk' ? { number: 1900 + api.hash(s.id) % 99 } : null)
  }
  const line = s => {
    const pr = prOf(s)
    return `${s.title}: ${s.branch || s.worktree || '—'} · ${s.state}${pr ? ` · PR #${pr.number}` : ''}`
  }

  // ---------- when ----------
  function due() {
    if (demo) return demoAt && performance.now() > demoAt
    const d = new Date()
    return d.getHours() === HOUR && d.getMinutes() < LATE_MIN && lsGet() !== today()
  }
  function start(now) {
    const f = room(); if (!f) return
    demoAt = 0
    if (!demo) lsSet(today())
    const ids = []
    for (const p of tower.people) {
      if (p.kind !== 'session' || p.leaving || p.steered || p.activity?.startsWith('meeting:')) continue
      if (skip(sessionOf(p.session || p.id))) continue
      ids.push(p.id)
    }
    if (!ids.length) return
    su = { t0: now, ids: ids.slice(0, SLOTS.length), slot: new Map(), sent: new Set(), talkAt: 0, turn: -1, turnAt: 0, turnMs: 8000, done: false }
    su.ids.forEach((id, i) => su.slot.set(id, SLOTS[i]))
    if (demo && !params.get('towerzoom')) setTimeout(() => tower.flyTo('meeting', 3), 400)
  }
  function finish() {
    if (!su) return
    for (const id of su.sent) tower.release(id)
    su = null
  }
  const here = id => { const p = tower.person(id); return p && p.floor === 'meeting' && !p.walking && p.activity === 'standup' }

  function plan(now) {
    if (!su) { if (api.live !== false && due()) start(now); return }
    if (now - su.t0 > CAP_MS) return finish()
    // drop anyone who left, or who now waits on the user: the waiting line wants them
    for (const id of [...su.ids]) {
      const p = tower.person(id), s = sessionOf(p?.session || id)
      if (!p || p.leaving || skip(s)) { if (su.sent.has(id)) tower.release(id); su.sent.delete(id); su.ids.splice(su.ids.indexOf(id), 1) }
    }
    if (!su.ids.length) return finish()
    let budget = 2
    for (const id of su.ids) {
      if (su.sent.has(id) || budget <= 0) continue
      const p = tower.person(id); if (!p || (p.floor && p.floor !== 'meeting' && tower.liftLoad(p.floor) > 3)) continue
      if (tower.sendTo(id, 'meeting', su.slot.get(id), { face: 'down', pose: 'stand', activity: 'standup' })) { su.sent.add(id); budget-- }
    }
    if (!su.talkAt && (su.ids.every(here) || now - su.t0 > GATHER_MS)) {
      su.talkAt = now
      const left = Math.max(60_000, BUDGET_MS - (now - su.t0))
      su.turnMs = Math.max(5000, Math.min(15_000, left / su.ids.length))
    }
    if (su.talkAt) {
      if (su.turn < 0 || now - su.turnAt > su.turnMs) {
        let i = su.turn + 1
        while (i < su.ids.length && !here(su.ids[i])) i++
        if (i >= su.ids.length) { if (!su.done) { su.done = true; su.turnAt = now; su.turn = su.ids.length } else if (now - su.turnAt > 4000) finish() }
        else { su.turn = i; su.turnAt = now }
      }
    }
  }
  const speaker = () => su && su.talkAt && su.turn >= 0 && su.turn < su.ids.length ? su.ids[su.turn] : null

  tower.on('step', (dt, now) => {
    if (now - planAt > 1000) { planAt = now; plan(now) }
    if (!su) return
    const sp = speaker(), spx = sp ? tower.person(sp)?.x : null
    for (const id of su.ids) {
      const a = tower.crowd?.find?.(id); if (!a || a.pose !== 'spot' || !here(id)) continue
      a.face = id === sp || spx == null ? 'down' : a.x < spx ? 'right' : 'left'
    }
  })
  tower.on('layout', () => { planAt = 0 })

  // ---------- the clock and the door sign ----------
  function clock(c, f) {
    const cx = CLOCK.x, cy = f.top + CLOCK.dy, r = CLOCK.r, d = new Date()
    for (let dy = -r - 1; dy <= r + 1; dy++) { const w = Math.round(Math.sqrt(Math.max(0, (r + 1.3) ** 2 - dy * dy))); R(c, '#3a3440', cx - w, cy + dy, w * 2 + 1, 1) }
    for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(Math.max(0, (r + 0.3) ** 2 - dy * dy))); R(c, '#f4f0e4', cx - w, cy + dy, w * 2 + 1, 1) }
    for (let k = 0; k < 12; k += 3) { const a = k / 12 * 2 * Math.PI; R(c, '#7a7080', cx + Math.round(Math.sin(a) * (r - 1)), cy - Math.round(Math.cos(a) * (r - 1)), 1, 1) }
    const hand = (a, len, col) => { for (let t = 0; t <= len; t += 0.5) R(c, col, cx + Math.round(Math.sin(a) * t), cy - Math.round(Math.cos(a) * t), 1, 1) }
    const m = d.getMinutes() + d.getSeconds() / 60, h = d.getHours() % 12 + m / 60
    hand(h / 12 * 2 * Math.PI, r - 3, '#1b1c26'); hand(m / 60 * 2 * Math.PI, r - 1, '#2a3a5a')
    R(c, su ? '#d8453f' : '#1b1c26', cx, cy, 1, 1)
  }
  function sign(c, f, now) {
    const x = SIGN.x, y = f.top + 22
    R(c, '#4a4452', x + 6, f.top, 1, y - f.top); R(c, '#4a4452', x + SIGN.w - 7, f.top, 1, y - f.top)
    R(c, 'rgba(0,0,0,.2)', x + 1, y + SIGN.h, SIGN.w, 1)
    R(c, '#7a1e1a', x, y, SIGN.w, SIGN.h); R(c, Math.floor(now / 900) % 2 ? '#c8352f' : '#b52d28', x + 1, y + 1, SIGN.w - 2, SIGN.h - 2)
    pixText(c, 'STAND-UP', x + 2, y + 3, '#fff4e0')
  }
  tower.on('items', (out, now) => {
    const f = room(); if (!f) return
    out.push({ z: Z.WALL + 2, draw: c => { clock(c, f); if (su) sign(c, f, now) } })
  })
  tower.on('glow', (c, now, n) => {
    const f = room(); if (!f || !su) return
    const x = SIGN.x + SIGN.w / 2, y = f.top + 27, g = c.createRadialGradient(x, y, 0, x, y, 22)
    g.addColorStop(0, `rgba(255,90,70,${0.5 * Math.max(0.3, n)})`); g.addColorStop(1, 'rgba(255,90,70,0)')
    c.fillStyle = g; c.fillRect(x - 22, y - 22, 44, 44)
  })

  // ---------- who's talking ----------
  tower.on('overlay', () => {
    const id = speaker(); if (!id || !here(id)) return
    const p = tower.person(id), s = sessionOf(p?.session || id); if (!p || !s) return
    const k = tower.zoom, a = tower.worldToScreen(p.x, p.y - 31)
    const text = line(s), short = text.length > 72 ? text.slice(0, 71) + '…' : text
    tower.bubble(a.x, a.y - Math.max(10, Math.min(16, 5.6 * k)) - 16, '🗣 ' + short, api.COLORS[s.state] || api.COLORS.idle)
  })
  tower.on('hover', (w, person) => {
    const f = room(); if (!f) return null
    if (person && su?.ids.includes(person.id)) return null
    const onClock = Math.abs(w.x - CLOCK.x) <= CLOCK.r + 1 && Math.abs(w.y - (f.top + CLOCK.dy)) <= CLOCK.r + 1
    const onSign = su && w.x >= SIGN.x && w.x <= SIGN.x + SIGN.w && w.y >= f.top && w.y <= f.top + 22 + SIGN.h
    if (!onClock && !onSign) return null
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    if (!su) return `<div class="t">🕙 ${t}</div><div class="m">daily stand-up at ${HOUR}:00 · ${lsGet() === today() ? 'held today' : 'not yet today'}</div>`
    const rows = su.ids.map((id, i) => { const s = sessionOf(tower.person(id)?.session || id); return s ? `<div class="m">${i === su.turn ? '▶ ' : ''}${esc(line(s))}</div>` : '' }).join('')
    return `<div class="t">🗣 Stand-up · ${t}</div>${rows}`
  })

}
