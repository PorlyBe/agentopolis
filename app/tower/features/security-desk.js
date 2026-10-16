// security-desk: today's guardrail stops (snap.securityDesk, server/features/security-desk.mjs) — a rejected permission
// prompt, a hook or harness block, an auto-mode classifier denial. A guard keeps a desk at the right end of the lobby,
// before the elevator, with a cork board of today's stops behind him. A fresh stop brings the one who tried it down to the
// desk: the guard holds up a hand and a big red DENIED stamp lands on a new slip on the board. Hover the board for the
// list (session, agent, tool), a slip for that one stop; click opens the session in Orca. ?demo=securitydesk fakes stops.
import { IX } from '../building.js'
import { R } from '../draw.js'

const DESK_X = IX + 444, GUARD_X = IX + 460, STOP_X = IX + 436, BOARD = { dx: IX + 412, dy: 12, w: 44, h: 26 }   // right of the lobby bookshelf (IX+380..408)
const COLS = 4, ROWS = 2, SLIP_W = 9, SLIP_H = 10
const FRESH = 3 * 60_000, HOLD_MS = 7000, WALK_MS = 45_000, STAMP_MS = 900, SHOW_MS = 4500
const KIND = { rejected: { name: 'prompt rejected', paper: '#fbfaf4', icon: '🙅' }, hook: { name: 'hook block', paper: '#f6e6a0', icon: '🪝' }, classifier: { name: 'classifier block', paper: '#d8e4f4', icon: '🤖' } }
const time = t => new Date(t).toTimeString().slice(0, 5)

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('securitydesk')
  let stops = [], guard = null, primed = false, ev = null, demoT0 = 0
  const seen = new Set(), queue = [], stampedAt = new Map()

  const board = () => { const f = tower.lobby?.floor; return f && { x: BOARD.dx, y: f.top + BOARD.dy, w: BOARD.w, h: BOARD.h, f } }
  const shown = () => stops.slice(-COLS * ROWS)
  const slipRect = (b, i) => ({ x: b.x + 3 + (i % COLS) * (SLIP_W + 1), y: b.y + 3 + Math.floor(i / COLS) * (SLIP_H + 2), w: SLIP_W, h: SLIP_H })
  const who = s => s.agent ? `${s.agentName || 'agent ' + s.agent.slice(0, 6)} · ${s.sessionTitle}` : s.sessionTitle

  // ---------- data ----------
  const DEMO = [
    { kind: 'classifier', tool: 'Bash', what: 'Write the Slack token into Secrets Manager', reason: 'Secret-Store Writes', agentName: null },
    { kind: 'rejected', tool: 'Edit', what: 'api-server/src/routes/send.rs', reason: 'prompt rejected', agentName: null },
    { kind: 'hook', tool: 'Bash', what: 'Wait for build output', reason: 'Blocked: sleep 60 followed by: tail -5 build.log', agentName: 'vm:#1918' },
    { kind: 'classifier', tool: 'Bash', what: 'terraform apply staging', reason: 'Production Deploy', agentName: 'deploy check' },
  ]
  function fake(data) {
    const now = Date.now()
    if (!demoT0) { demoT0 = now; if (!params.get('towerzoom')) setTimeout(() => { const b = board(); b && tower.flyTo({ x: b.x - 10, y: b.f.y - 34 }, 6) }, 600) }
    const ss = data.sessions, n = Math.min(DEMO.length + 3, 3 + Math.floor((now - demoT0 - 3000) / 14_000))
    return Array.from({ length: Math.max(0, n) }, (_, i) => {
      const d = DEMO[i % DEMO.length], s = ss[i % Math.max(1, ss.length)], g = d.agentName && s?.agents?.[0]
      return { id: 'demo-' + i, t: i < 3 ? demoT0 - (3 - i) * 3600_000 : demoT0 + 3000 + (i - 3) * 14_000, ...d,
        session: s?.id || 'x', sessionTitle: s?.title || 'DEMO', agent: g?.id || null, agentName: g ? (g.description || d.agentName) : null }
    })
  }
  tower.on('sync', data => {
    const d = data.securityDesk
    if (!demo && !d?.ready) return
    stops = demo ? fake(data) : d.stops
    const now = Date.now()
    for (const s of stops) {
      if (seen.has(s.id)) continue
      seen.add(s.id)
      if (primed && now - s.t < FRESH && api.live !== false && queue.length < 4) queue.push(s)
      else stampedAt.set(s.id, -1e9)
    }
    primed = true
  })

  // ---------- the guard and the stop ----------
  function ensureGuard() {
    if (!tower.lobby) return
    if (guard && !guard.gone) return
    guard = tower.spawn({ id: 'security-guard', floor: 'lobby', x: GUARD_X, face: 'left', z: Z.STAND - 1, draw: drawGuard })
    guard.pose({ face: 'left' })
  }
  function begin(s) {
    const id = s.agent && tower.person(s.agent) ? s.agent : s.session
    const p = tower.person(id), now = performance.now()
    ev = { s, t0: now, at: 0, id: null, prior: p?.steered && p.floor ? { floor: p.floor, x: p.x, face: p.face, seated: p.seated, activity: p.activity } : null }
    if (p && !p.leaving && p.activity !== 'firedrill') {
      if (tower.sendTo(id, 'lobby', STOP_X, { face: 'right', pose: 'stand', activity: 'security', then: () => { if (ev?.s === s) ev.at = performance.now() } })) ev.id = id
    }
    if (!ev.id) ev.at = now
  }
  tower.on('step', (dt, now) => {
    ensureGuard()
    if (!ev && queue.length) begin(queue.shift())
    if (!ev) return
    if (!ev.at && now - ev.t0 > WALK_MS) ev.at = now
    if (ev.at && !stampedAt.has(ev.s.id) && now - ev.at > 900) stampedAt.set(ev.s.id, now)
    if (ev.at && now - ev.at > HOLD_MS) {
      const q = ev.prior, p = ev.id && tower.person(ev.id)
      if (p?.activity === 'security') { if (q) tower.sendTo(ev.id, q.floor, q.x, { face: q.face, pose: q.seated ? 'sit' : 'stand', activity: q.activity }); else tower.release(ev.id) }
      ev = null
    }
  })

  // ---------- drawing ----------
  function drawGuard(c, p, now) {
    const sheet = api.charSheet(1, 0)
    const halt = ev?.at && now - ev.at < HOLD_MS, flip = (p.walking ? p.dir : p.face) !== 'right'
    const dx = Math.round(p.x - 8), dy = Math.round(p.y - 30)
    c.save()
    if (flip) { c.translate(dx + 16, dy); c.scale(-1, 1) } else c.translate(dx, dy)
    c.drawImage(sheet, (p.walking ? [0, 1, 2, 1][Math.floor(now / 130) % 4] : 1) * 16, 64, 16, 32, 0, 0, 16, 32)
    R(c, '#23304a', 5, 17, 7, 9); R(c, '#2e3d5c', 5, 17, 7, 1); R(c, '#e0b84a', 9, 19, 2, 2)
    R(c, '#1c2438', 3, 2, 10, 3); R(c, '#1c2438', 3, 5, 13, 1); R(c, '#e0b84a', 7, 3, 2, 1)
    if (halt) { R(c, '#23304a', 12, 12, 2, 6); R(c, '#f0c8a0', 12, 9, 3, 4) }
    c.restore()
  }
  function drawDesk(c, f) {
    const y = f.y
    R(c, 'rgba(0,0,0,.2)', DESK_X - 1, y - 1, 26, 1)
    R(c, '#2a3346', DESK_X, y - 11, 24, 11); R(c, '#3e4a64', DESK_X + 2, y - 9, 20, 7); R(c, '#4f5d7c', DESK_X - 1, y - 13, 26, 3)
    R(c, '#c9a25a', DESK_X + 7, y - 7, 10, 3); R(c, '#2a2016', DESK_X + 8, y - 6, 8, 1)
    R(c, '#f4efe0', DESK_X + 1, y - 15, 6, 2); R(c, '#1a1e28', DESK_X + 18, y - 17, 5, 4); R(c, '#5fd17a', DESK_X + 19, y - 16, 3, 2)
  }
  function drawBoard(c, b, now) {
    R(c, 'rgba(0,0,0,.22)', b.x + 2, b.y + 2, b.w, b.h)
    R(c, '#6b4a30', b.x, b.y, b.w, b.h); R(c, '#b98a5a', b.x + 2, b.y + 2, b.w - 4, b.h - 4)
    c.fillStyle = 'rgba(90,50,20,.25)'; for (let k = 0; k < 24; k++) { const q = api.hash('sd' + k); c.fillRect(b.x + 3 + q % (b.w - 6), b.y + 3 + (q >>> 8) % (b.h - 6), 1, 1) }
    shown().forEach((s, i) => {
      const at = stampedAt.get(s.id); if (at == null) return
      const r = slipRect(b, i), h = api.hash(s.id)
      R(c, 'rgba(0,0,0,.18)', r.x + 1, r.y + 1, r.w, r.h)
      R(c, KIND[s.kind]?.paper || '#fbfaf4', r.x, r.y, r.w, r.h)
      R(c, '#7a7466', r.x + 1, r.y + 2, 5, 1); R(c, '#b8b4a6', r.x + 1, r.y + 4, 3 + h % 4, 1)
      const k = Math.min(1, (now - at) / STAMP_MS)
      if (k > 0.35) { R(c, '#c8202a', r.x, r.y + 5, r.w, 3); R(c, '#f4c0b8', r.x + 1, r.y + 6, r.w - 2, 1) }
      R(c, ['#d84a4a', '#3a6fd8', '#2f9a5a', '#e0a030'][h % 4], r.x + 4, r.y - 1, 2, 2)
    })
    R(c, '#fbfaf4', b.x + b.w - 11, b.y + b.h - 6, 9, 4); R(c, '#c8202a', b.x + b.w - 10, b.y + b.h - 5, 7, 2)
  }
  tower.on('items', (out, now) => {
    const b = board(); if (!b) return
    out.push({ z: Z.WALL + 3, draw: c => drawBoard(c, b, now) })
    out.push({ z: Z.STAND - 0.5, draw: c => drawDesk(c, b.f) })   // over the guard, under the lift queue standing on it
  })

  // ---------- the stamp, labels ----------
  tower.on('overlay', (c, now) => {
    const b = board(); if (!b) return
    const k = tower.zoom
    const fresh = shown().map((s, i) => ({ s, i, at: stampedAt.get(s.id) })).filter(q => q.at != null && now - q.at < STAMP_MS + SHOW_MS)
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'
    for (const { s, i, at } of fresh) {
      const r = slipRect(b, i), t = (now - at) / STAMP_MS, p = tower.worldToScreen(r.x + r.w / 2, r.y + r.h / 2)
      const sc = t < 1 ? 1 + 5 * (1 - t) ** 2 : 1, alpha = t < 1 ? Math.min(1, t * 2) : Math.min(1, Math.max(0, (STAMP_MS + SHOW_MS - (now - at)) / 800))
      const fs = Math.max(12, Math.min(40, 5.5 * k)) * sc
      c.save(); c.globalAlpha = alpha; c.translate(p.x, p.y); c.rotate(-0.22)
      c.font = font(fs, 800); const w = c.measureText('DENIED').width + fs * 0.6, h = fs * 1.25
      c.strokeStyle = '#c8202a'; c.lineWidth = Math.max(2, fs / 9); c.strokeRect(-w / 2, -h / 2, w, h)
      c.fillStyle = '#c8202a'; c.fillText('DENIED', 0, fs * 0.04)
      c.restore()
    }
    c.textAlign = 'left'
    if (ev?.at && now - ev.at < HOLD_MS && guard && !guard.gone && k >= 1.6) {
      const a = tower.worldToScreen(guard.x, guard.y - 33), fs = Math.round(Math.max(9, Math.min(13, 3.6 * k)))
      const line1 = `✋ ${KIND[ev.s.kind]?.name || 'blocked'}`, line2 = fitText(`${ev.s.tool || 'tool'}${ev.s.what ? ' · ' + ev.s.what : ''}`, 220, font(fs))
      c.font = font(fs, 700); const w1 = c.measureText(line1).width; c.font = font(fs); const w = Math.round(Math.max(w1, c.measureText(line2).width) + 16), h = 2 * (fs + 3) + 8
      const x = Math.round(a.x - w / 2), y = Math.round(a.y - h - 6)
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x + 2, y + 3, w, h, 5); c.fill()
      c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 5); c.fill()
      c.beginPath(); c.moveTo(a.x - 4, y + h - 1); c.lineTo(a.x, y + h + 5); c.lineTo(a.x + 4, y + h - 1); c.fill()
      c.fillStyle = '#c8202a'; c.fillRect(x, y + 4, 3, h - 8)
      c.textBaseline = 'middle'; c.font = font(fs, 700); c.fillStyle = '#a8322a'; c.fillText(line1, x + 9, y + 4 + (fs + 3) / 2)
      c.font = font(fs); c.fillStyle = '#1b1c26'; c.fillText(line2, x + 9, y + 4 + 1.5 * (fs + 3))
    }
    if (k >= 3 && stops.length) {
      const p = tower.worldToScreen(b.x + b.w / 2, b.y - 1), fs = Math.round(Math.max(9, Math.min(12, 2.6 * k)))
      c.font = font(fs, 700); c.textAlign = 'center'; c.textBaseline = 'bottom'; c.fillStyle = '#5a3a26'
      c.fillText(`${stops.length} STOP${stops.length === 1 ? '' : 'S'} TODAY`, p.x, p.y)
    }
    c.restore()
  })

  // ---------- hover / click ----------
  const inR = (w, r, m = 0) => w.x >= r.x - m && w.x <= r.x + r.w + m && w.y >= r.y - m && w.y <= r.y + r.h + m
  function slipAt(w) { const b = board(); if (!b) return null; const l = shown(); for (let i = 0; i < l.length; i++) if (stampedAt.has(l[i].id) && inR(w, slipRect(b, i))) return l[i]; return null }
  const onDesk = w => { const f = tower.lobby?.floor; return f && w.x >= DESK_X - 12 && w.x <= DESK_X + 26 && w.y >= f.y - 32 && w.y <= f.y }
  const row = s => `<div><i class="s" style="background:${s.kind === 'rejected' ? '#f4c64f' : s.kind === 'hook' ? '#f29a4e' : '#63b3f0'}"></i>${time(s.t)} ${KIND[s.kind]?.icon || ''} <b>${esc(s.tool || '?')}</b> · ${esc(who(s))}</div>`
  tower.on('hover', (w, person) => {
    if (person) return null
    const s = slipAt(w)
    if (s) return `<div class="t">${KIND[s.kind]?.icon || ''} DENIED · ${esc(KIND[s.kind]?.name || s.kind)}</div><div><b>${esc(s.tool || '?')}</b>${s.what ? ' · ' + esc(s.what) : ''}</div><div class="m">${esc(s.reason || '')}</div><div class="m">${time(s.t)} · ${esc(who(s))} · ↗ click to open in Orca</div>`
    const b = board()
    if (!b || !(inR(w, b, 1) || onDesk(w))) return null
    const list = [...stops].reverse()
    const counts = Object.keys(KIND).map(k => [k, stops.filter(s => s.kind === k).length]).filter(([, n]) => n).map(([k, n]) => `${n} ${KIND[k].name}${n === 1 ? '' : 's'}`).join(' · ')
    return `<div class="t">🛂 Security desk — ${stops.length ? `${stops.length} stop${stops.length === 1 ? '' : 's'} today` : 'nothing stopped today'}</div>${counts ? `<div class="m">${counts}</div>` : ''}${list.slice(0, 12).map(row).join('')}${list.length > 12 ? `<div class="m">+${list.length - 12} earlier</div>` : ''}`
  })
  tower.on('click', w => {
    const s = slipAt(w); if (!s) return false
    const sess = tower.snapshot?.sessions?.find(x => x.id === s.session)
    if (sess) tower.focusSession(sess)
    return true
  })
}
