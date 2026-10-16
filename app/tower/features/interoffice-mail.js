// interoffice-mail: a brass pneumatic tube runs up the tower's right wall with a hatch on every floor. When an agent
// SendMessages another (snap.mail), the envelope flies from the sender into their floor's hatch, a capsule shoots
// along the tube to the recipient's floor and a mail clerk walks it to their desk's in-tray. An agent finishing
// (a task-notification or hand-back) comes back as a stamped return slip on the parent session's desk. Mail for a
// session outside the tower leaves through the roof. Hover a tray or hatch for the recent mail.
// ?demo=interofficemail fakes letters and slips between the floors on screen.
import { IX1 } from '../building.js'
import { R, inR, easeInOut as ease } from '../draw.js'

const TX = IX1 + 2, TW = 4, HX = IX1 - 9, FRESH_MS = 20_000, TRAY_MS = 4 * 60_000, MAX_CLERKS = 3, MAX_FLIGHTS = 14
const STAMP = { completed: '#3e9a55', returned: '#3e9a55', message: '#3a63a8', failed: '#c0392b', killed: '#8a7a66', stopped: '#8a7a66' }

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('interofficemail')
  const seen = new Set(), flights = [], trays = new Map(), log = []   // trays: key -> [{ e, at }]
  let primed = false, clerks = 0, demoN = 0, demoAt = 0, flown = false

  // ---------- who is where ----------
  const hatch = f => ({ x: HX, y: f.y - 44, w: 8, h: 7 })
  const nameOf = (side, snap = tower.snapshot) => {
    if (side.agent) { for (const s of snap?.sessions || []) { const a = s.agents.find(g => g.id === side.agent); if (a) return a.description || a.type || 'agent' } return 'agent ' + side.agent.slice(0, 6) }
    if (side.session) return (snap?.sessions || []).find(s => s.id === side.session)?.title || 'a session'
    return side.name || 'someone'
  }
  // where a side of a letter sits: the person if they are in the tower, else their session's desk
  function spot(side) {
    const p = side.agent && tower.person(side.agent)
    if (p && p.floor && !p.leaving) return { floor: p.floor, x: p.x, y: p.y, key: side.agent }
    const s = side.session && tower.person(side.session)
    if (s && s.floor) return { floor: s.floor, x: s.x, y: s.y, key: side.session }
    if (side.session && tower.floor(side.session)) { const f = tower.floor(side.session); return { floor: f.id, x: tower.desk(f.id)?.seat ?? f.x0 + 30, y: f.y, key: side.session } }
    return null
  }
  // the in-tray: the left end of the desk nearest the sitter
  function trayAt(key) {
    const p = tower.person(key), sid = p?.session || key, d = tower.desk(sid); if (!d) return null
    let best = d, bd = p ? Math.abs(p.x - d.seat) : 0
    if (p) for (const a of d.agents) { const dd = Math.abs(p.x - a.seat); if (dd < bd) { bd = dd; best = a } }
    return { x: best.desk.x + 1, y: best.desk.y - 3, w: best === d ? 7 : 5, h: 3, stand: best.desk.x + best.desk.w + 4 }
  }

  // ---------- incoming ----------
  function take(list) {
    const now = Date.now()
    for (const e of list) {
      if (seen.has(e.id)) continue
      seen.add(e.id); log.push(e); if (log.length > 60) log.shift()
      const fresh = now - e.t < FRESH_MS
      if (!primed || !fresh) { if (now - e.t < TRAY_MS) { const k = spot(e.to)?.key; if (k) drop(k, e, e.t) } continue }
      send(e)
    }
    primed = true
  }
  function drop(key, e, at = Date.now()) { const l = trays.get(key) || []; l.push({ e, at }); trays.set(key, l.slice(-6)) }
  function send(e) {
    if (flights.length >= MAX_FLIGHTS) { const k = spot(e.to)?.key; if (k) drop(k, e); return }
    const p = e.kind === 'slip' && e.from.agent && tower.person(e.from.agent)
    const from = e.kind === 'slip' ? (p && p.floor && !p.leaving ? { floor: p.floor, x: p.x, y: p.y, key: p.id } : null) : spot(e.from), to = spot(e.to)
    const fl = { e, phase: 'out', t: 0, from, to, gone: !to }
    if (!from) {   // a slip from an agent who already left: the capsule drops in from above
      const tf = to && tower.floor(to.floor); if (!tf) return
      fl.phase = 'tube'; fl.ya = tf.top - 30; fl.yb = hatch(tf).y + 3
    }
    flights.push(fl)
  }
  tower.on('sync', snap => {
    if (snap.mail) take(snap.mail)
    if (demo) demoTick(snap)
  })

  // ---------- demo ----------
  function demoTick(snap) {
    if (!flown && !params.get('towerzoom')) { flown = true; const f = tower.floors.find(q => q.kind === 'session'); if (f) setTimeout(() => tower.flyTo({ x: IX1 - 120, y: f.y - 40 }, 2.2), 500) }
    if (Date.now() - demoAt < 3500) return
    demoAt = Date.now()
    const ss = (snap.sessions || []).filter(s => tower.floor(s.id))
    if (!ss.length) return
    const a = ss[demoN % ss.length], b = ss[(demoN + 1) % ss.length], ag = a.agents.find(g => tower.person(g.id)), bg = b.agents.find(g => tower.person(g.id))
    const kinds = [
      { kind: 'letter', from: { session: a.id }, to: bg ? { agent: bg.id, session: b.id } : { session: b.id }, text: 'Re-review the PR at its new head' },
      { kind: 'letter', from: { session: a.id }, to: ag ? { agent: ag.id, session: a.id } : { session: a.id }, text: 'Fix the three findings on the same branch' },
      { kind: 'slip', from: ag ? { agent: ag.id, session: a.id } : { agent: 'a0demo' }, to: { session: a.id }, text: 'Agent "pre-PR checks" finished', status: 'completed' },
      { kind: 'letter', from: bg ? { agent: bg.id, session: b.id } : { session: b.id }, to: { name: 'UPDATER' }, text: 'Bump the vite pin' },
      { kind: 'slip', from: { agent: 'a1demo' }, to: { session: b.id }, text: 'Agent "docs grounding" failed', status: 'failed' },
    ]
    const k = kinds[demoN % kinds.length]
    demoN++
    take([{ id: `demo-${demoN}`, t: Date.now(), ...k }])
  }

  // ---------- motion ----------
  tower.on('step', dt => {
    for (const fl of flights) {
      fl.t += dt
      if (fl.phase === 'out') {
        const f = tower.floor(fl.from.floor); if (!f) { fl.done = true; continue }
        if (fl.t >= 0.9) {
          const h = hatch(f); fl.phase = 'tube'; fl.t = 0; fl.ya = h.y + 3
          if (fl.gone) fl.yb = tower.floors[tower.floors.length - 1].top - 26
          else { const tf = tower.floor(fl.to.floor); if (!tf) { fl.done = true; continue } fl.yb = hatch(tf).y + 3 }
        }
      } else if (fl.phase === 'tube') {
        const dur = Math.max(0.6, Math.abs(fl.yb - fl.ya) / 260)
        if (fl.t >= dur) {
          if (fl.gone) { fl.phase = 'puff'; fl.t = 0; continue }
          fl.phase = 'pop'; fl.t = 0
        }
      } else if (fl.phase === 'pop' && fl.t >= 0.5) {
        const tf = tower.floor(fl.to.floor), h = tf && hatch(tf); if (!tf) { fl.done = true; continue }
        const to = spot(fl.e.to) || fl.to, tr = trayAt(to.key)
        const tx = tr ? tr.x + tr.w / 2 : to.x
        if (clerks < MAX_CLERKS) {
          clerks++
          fl.phase = 'clerk'; fl.t = 0
          const npc = fl.npc = tower.spawn({ id: `mailclerk-${fl.e.id}`, floor: tf.id, x: h.x - 2, face: 'left', look: api.lookOf('mail-clerk') })
          npc.go(tf.id, tr ? tr.stand : tx + 8, { face: 'left', then: () => {
            fl.carry = false; fl.dropped = true
            flights.push({ e: fl.e, phase: 'fly', t: 0, fx: npc.x - 5, fy: npc.y - 17, tx, ty: tr ? tr.y : to.y - 14, key: to.key })
            npc.go(tf.id, h.x - 2, { then: () => { npc.remove(); clerks--; fl.done = true } })
          } })
          fl.carry = true
          setTimeout(() => { if (!fl.done && !npc.gone) { npc.remove(); clerks--; fl.done = true; if (!fl.dropped) drop(to.key, fl.e) } }, 40_000)
        } else { fl.phase = 'fly'; fl.t = 0; fl.fx = h.x + 4; fl.fy = h.y + 3; fl.tx = tx; fl.ty = tr ? tr.y : to.y - 14; fl.key = to.key }
      } else if (fl.phase === 'fly' && fl.t >= 1) { drop(fl.key, fl.e); fl.done = true }
      else if (fl.phase === 'puff' && fl.t >= 0.8) fl.done = true
    }
    for (let i = flights.length - 1; i >= 0; i--) if (flights[i].done) flights.splice(i, 1)
    const now = Date.now()
    for (const [k, l] of trays) { const keep = l.filter(q => now - q.at < TRAY_MS); if (keep.length) trays.set(k, keep); else trays.delete(k) }
  })

  // ---------- drawing ----------
  function envelope(c, x, y, slip, status) {
    if (slip) { R(c, '#f4d8d0', x - 2, y - 2, 5, 4); R(c, STAMP[status] || '#3e9a55', x, y - 1, 2, 2); return }
    R(c, '#f4efe0', x - 2, y - 1, 5, 3); R(c, '#c9b896', x - 2, y - 1, 5, 1); R(c, '#c0392b', x, y, 1, 1)
  }
  function tube(c, now) {
    const fs = tower.floors, top = fs[fs.length - 1].top - 30, bot = fs[0].y
    R(c, '#7a5a26', TX, top, TW, bot - top); R(c, '#c9a25a', TX + 1, top, 1, bot - top); R(c, '#e8c878', TX + 1, top, 1, 1)
    for (const f of fs) if (f.kind !== 'roof') R(c, '#5a4018', TX - 1, f.y - 2, TW + 2, 2)
    R(c, '#5a4018', TX - 2, top - 3, TW + 4, 3); R(c, '#9a7a3a', TX - 1, top - 5, TW + 2, 2)   // the roof vent
  }
  function hatchDraw(c, f, now, busy) {
    const h = hatch(f)
    R(c, '#7a5a26', h.x + h.w - 1, h.y + 2, TX - h.x - h.w + 1, 3)
    R(c, '#3b2617', h.x, h.y, h.w, h.h); R(c, '#c9a25a', h.x + 1, h.y + 1, h.w - 2, h.h - 2); R(c, '#2a1c10', h.x + 2, h.y + 2, h.w - 4, 3)
    R(c, '#8a6a3a', h.x - 1, h.y + h.h, h.w + 2, 1)
    if (busy) R(c, Math.floor(now / 200) % 2 ? '#ffd84a' : '#e8452a', h.x + h.w - 2, h.y - 1, 1, 1)
  }
  function trayDraw(c, r, l) {
    R(c, '#6d7684', r.x, r.y + r.h - 1, r.w, 1); R(c, '#6d7684', r.x, r.y, 1, r.h); R(c, '#6d7684', r.x + r.w - 1, r.y, 1, r.h)
    l.slice(-4).forEach((q, i) => {
      const y = r.y + r.h - 2 - i
      if (q.e.kind === 'slip') { R(c, '#f4d8d0', r.x + 1, y, r.w - 2, 1); R(c, STAMP[q.e.status] || '#3e9a55', r.x + r.w - 3, y, 1, 1) }
      else { R(c, i % 2 ? '#e8e0cc' : '#f4efe0', r.x + 1, y, r.w - 2, 1); if (i === Math.min(l.length, 4) - 1) R(c, '#c0392b', r.x + Math.floor(r.w / 2), y, 1, 1) }
    })
  }
  tower.on('items', (out, now, ctx) => {
    if (!tower.floors.length) return
    out.push({ z: Z.FRONT + 4, draw: c => tube(c, now) })
    const busy = new Set(flights.map(fl => fl.phase === 'out' ? fl.from?.floor : fl.to?.floor))
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.kind === 'server' || f.y < ctx.view.y0 - 10 || f.top > ctx.view.y1 + 10) continue
      out.push({ z: Z.WALL + 4, draw: c => hatchDraw(c, f, now, busy.has(f.id)) })
    }
    for (const [k, l] of trays) { const r = trayAt(k); if (r) out.push({ z: Z.FRONT + 3, draw: c => trayDraw(c, r, l) }) }
    for (const fl of flights) out.push({ z: fl.phase === 'tube' ? Z.FRONT + 5 : Z.FRONT + 8, draw: c => flightDraw(c, fl, now) })
  })
  function flightDraw(c, fl, now) {
    const slip = fl.e.kind === 'slip'
    if (fl.phase === 'out') {
      const f = tower.floor(fl.from.floor); if (!f) return
      const h = hatch(f), k = ease(Math.min(1, fl.t / 0.9)), x0 = fl.from.x, y0 = f.y - 22, x1 = h.x + 4, y1 = h.y + 3
      envelope(c, x0 + (x1 - x0) * k, y0 + (y1 - y0) * k - Math.sin(k * Math.PI) * 14, slip, fl.e.status)
    } else if (fl.phase === 'tube') {
      const dur = Math.max(0.6, Math.abs(fl.yb - fl.ya) / 260), y = fl.ya + (fl.yb - fl.ya) * ease(Math.min(1, fl.t / dur))
      R(c, '#9aa3ad', TX, y - 4, TW, 8); R(c, '#e8ecf0', TX + 1, y - 4, 1, 8); R(c, slip ? '#c0392b' : '#c9a25a', TX, y - 1, TW, 2)
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(TX, y + (fl.yb > fl.ya ? -9 : 5), TW, 4)
    } else if (fl.phase === 'pop') {
      const f = tower.floor(fl.to.floor); if (!f) return
      const h = hatch(f), k = Math.min(1, fl.t / 0.5)
      envelope(c, h.x + 4 - k * 3, h.y + 3 + k * 2 - Math.sin(k * Math.PI) * 4, slip, fl.e.status)
    } else if (fl.phase === 'clerk' && fl.npc && !fl.npc.gone) {
      const n = fl.npc
      R(c, '#2a4a7a', n.x - 4, n.y - 31, 9, 2); R(c, '#1d3560', n.x + (n.dir === 'left' ? -5 : 4), n.y - 30, 2, 1)   // the clerk's cap
      R(c, '#7a5a3a', n.x - 5, n.y - 16, 3, 6); R(c, '#5a4028', n.x - 4, n.y - 23, 1, 7)                      // the satchel
      if (fl.carry) envelope(c, n.x + (n.dir === 'left' ? -5 : 5), n.y - 17, slip, fl.e.status)
    } else if (fl.phase === 'fly') {
      const k = ease(Math.min(1, fl.t)), x = fl.fx + (fl.tx - fl.fx) * k, y = fl.fy + (fl.ty - fl.fy) * k - Math.sin(k * Math.PI) * 10
      envelope(c, x, y, slip, fl.e.status)
    } else if (fl.phase === 'puff') {
      const top = tower.floors[tower.floors.length - 1].top - 34, k = Math.min(1, fl.t / 0.8)
      c.fillStyle = `rgba(230,236,242,${0.8 * (1 - k)})`
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(TX + 2 + Math.sin(i * 2.3) * (2 + k * 6), top - k * 14 - i * 2, 1.5 + k * 3, 0, Math.PI * 2); c.fill() }
      if (k < 0.5) envelope(c, TX + 2 + k * 10, top - 4 - k * 20, slip, fl.e.status)
    }
  }
  tower.on('glow', (c, now, n) => {
    for (const fl of flights) if (fl.phase === 'tube') {
      const dur = Math.max(0.6, Math.abs(fl.yb - fl.ya) / 260), y = fl.ya + (fl.yb - fl.ya) * ease(Math.min(1, fl.t / dur))
      const g = c.createRadialGradient(TX + 2, y, 0, TX + 2, y, 8); g.addColorStop(0, `rgba(255,220,140,${0.5 * Math.max(n, 0.3)})`); g.addColorStop(1, 'rgba(255,220,140,0)')
      c.fillStyle = g; c.fillRect(TX - 6, y - 8, 16, 16)
    }
  })

  // ---------- hover ----------
  const ago = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : Math.round(s / 60) + 'm' }
  const line = e => `<div>${e.kind === 'slip' ? `<span style="color:${STAMP[e.status] || '#3e9a55'}">▣ ${esc(e.status || 'returned')}</span> ` : '✉ '}<b>${esc(nameOf(e.from).slice(0, 34))}</b> → ${esc(nameOf(e.to).slice(0, 34))}${e.text ? ` <span class="m">· ${esc(e.text.slice(0, 70))}</span>` : ''} <span class="m">${ago(Date.now() - e.t)}</span></div>`
  tower.on('hover', (w, person) => {
    if (person) return null
    for (const [k, l] of trays) {
      const r = trayAt(k)
      if (r && inR(w, r, 2)) return `<div class="t">📥 In-tray · ${esc(nameOf(tower.person(k)?.kind === 'agent' ? { agent: k } : { session: k }).slice(0, 40))}</div>${l.slice(-6).reverse().map(q => line(q.e)).join('')}`
    }
    for (const f of tower.floors) {
      if (f.kind === 'roof' || f.kind === 'server') continue
      if (!inR(w, hatch(f), 2)) continue
      const here = log.filter(e => [spot(e.from)?.floor, spot(e.to)?.floor].includes(f.id)).slice(-8).reverse()
      return `<div class="t">📮 Interoffice mail${demo ? ' (demo)' : ''}</div>${here.length ? here.map(line).join('') : '<div class="m">no recent mail on this floor</div>'}`
    }
    return null
  })
}
