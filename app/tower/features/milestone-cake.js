// milestone-cake: when a session passes 100, 500, 1000 (then every 1000) tool calls today (snap ext['milestone-cake']
// { today, milestone, at }), a cake with candles stands on its desk for ten minutes; the floor's subagents gather round,
// confetti flies and a toast says so. ?demo=milestonecake gives the first session two helpers and a fresh 1000.
const STAY_MS = 10 * 60_000, PARTY_MS = 20_000, FRESH_MS = 60_000, CAP = 4
const CONFETTI = ['#f2c14e', '#e85a7a', '#63b3f0', '#5fd17a', '#b996f5', '#fbfaf4']
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const label = n => n >= 1000 ? (n / 1000) + 'k' : String(n)

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const demo = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('milestonecake')
  const cakes = new Map()     // session id -> { m, at, today }
  const known = new Map()     // session id -> last milestone seen
  const parties = new Map()   // session id -> { t0, guests: [person ids] }
  const parts = []
  let primed = false

  const cakeRect = sid => { const d = tower.desk(sid); return d && { x: d.desk.x + 1, y: d.desk.y - 6, w: 9, h: 6 } }

  tower.on('sync', data => {
    const now = Date.now(), ids = new Set(data.sessions.map(s => s.id))
    for (const id of [...cakes.keys()]) if (!ids.has(id)) cakes.delete(id)
    for (const s of data.sessions) {
      const e = s.ext?.['milestone-cake'], m = e?.milestone || 0, was = known.get(s.id)
      known.set(s.id, Math.max(was ?? 0, m))
      if (!m || !e.at || now - e.at > STAY_MS) { cakes.delete(s.id); continue }
      const prev = cakes.get(s.id)
      cakes.set(s.id, { m, at: e.at, today: e.today })
      const fresh = primed ? was != null && m > was : now - e.at < FRESH_MS
      if (fresh && prev?.m !== m && api.live !== false) party(s, m)
    }
    primed = true
  })

  function party(s, m) {
    api.toast(`🎂 ${s.title} hit ${m.toLocaleString()} tool calls`, 4000)
    const r = cakeRect(s.id); if (!r) return
    burst(r.x + r.w / 2, r.y - 4)
    const guests = tower.people.filter(p => p.kind === 'agent' && p.session === s.id && !p.leaving && !p.steered).slice(0, CAP)
    const x0 = r.x + r.w + 30
    guests.forEach((p, i) => tower.sendTo(p.id, s.id, x0 + i * 11, { face: 'left', pose: 'stand', activity: 'cake' }))
    const old = parties.get(s.id); if (old) for (const id of old.guests) if (!guests.some(g => g.id === id)) tower.release(id)
    parties.set(s.id, { t0: performance.now(), guests: guests.map(p => p.id) })
  }
  function burst(x, y) {
    for (let i = 0; i < 70; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.4, v = 40 + Math.random() * 70
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0, max: 2.2 + Math.random() * 1.4, c: CONFETTI[i % CONFETTI.length], spin: Math.random() * 6 })
    }
  }

  tower.on('step', (dt, now) => {
    for (const [sid, p] of parties) {
      if (now - p.t0 < PARTY_MS && tower.floor(sid)) continue
      for (const id of p.guests) { const q = tower.person(id); if (q?.activity === 'cake') tower.release(id) }
      parties.delete(sid)
    }
    for (const [sid, k] of cakes) if (Date.now() - k.at > STAY_MS) cakes.delete(sid)
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life += dt
      if (q.life > q.max) { parts.splice(i, 1); continue }
      q.vy += 90 * dt; q.vx *= 1 - dt * 1.2; q.vy *= 1 - dt * 0.8; q.x += q.vx * dt; q.y += q.vy * dt; q.spin += dt * 8
    }
  })

  // ---------- the cake: plate, two sponge layers, icing drips, candles (gold for every 1000) ----------
  function cake(c, r, k, now) {
    const { x, y } = r
    R(c, 'rgba(0,0,0,.18)', x, y + 6, 10, 1); R(c, '#e8ecf0', x - 1, y + 5, 11, 1); R(c, '#b8c0c8', x, y + 6, 9, 1)
    R(c, '#c98a5a', x + 1, y + 1, 7, 4); R(c, '#f4d0dc', x + 1, y + 3, 7, 1); R(c, '#a8683a', x + 1, y + 4, 7, 1)
    R(c, '#f7b8cc', x, y, 9, 2); R(c, '#fde4ee', x, y, 9, 1); R(c, '#f7b8cc', x + 2, y + 2, 1, 1); R(c, '#f7b8cc', x + 6, y + 2, 1, 1)
    const n = k.m >= 1000 ? Math.min(4, k.m / 1000) : k.m >= 500 ? 3 : 1, gold = k.m >= 1000
    for (let i = 0; i < n; i++) {
      const cx = x + Math.round((i + 1) * 9 / (n + 1))
      R(c, gold ? '#f2c14e' : ['#63b3f0', '#5fd17a', '#e85a7a'][i % 3], cx, y - 3, 1, 3)
      const fl = Math.floor(now / 140 + i * 3) % 3
      R(c, '#ffb83a', cx, y - 5, 1, 2); if (fl) R(c, '#fff1a0', cx, y - 5 - (fl === 2 ? 1 : 0), 1, 1)
    }
  }
  tower.on('items', (out, now) => {
    for (const [sid, k] of cakes) {
      const r = cakeRect(sid), f = tower.floor(sid); if (!r || !f || f.open != null) continue
      out.push({ z: Z.FRONT + 3, draw: c => cake(c, r, k, now) })
    }
    if (parts.length) out.push({ z: Z.TOP, draw: c => {
      for (const q of parts) { c.globalAlpha = Math.min(1, (q.max - q.life) * 2); c.fillStyle = q.c; c.fillRect(Math.round(q.x), Math.round(q.y), Math.sin(q.spin) > 0 ? 2 : 1, Math.cos(q.spin) > 0 ? 1 : 2) }
      c.globalAlpha = 1
    } })
  })
  tower.on('glow', (c, now, n) => {
    for (const sid of cakes.keys()) {
      const r = cakeRect(sid); if (!r) continue
      const g = c.createRadialGradient(r.x + 4, r.y - 4, 0, r.x + 4, r.y - 4, 12)
      g.addColorStop(0, `rgba(255,190,90,${0.5 * n})`); g.addColorStop(1, 'rgba(255,190,90,0)')
      c.fillStyle = g; c.fillRect(r.x - 10, r.y - 16, 28, 26)
    }
  })

  tower.on('hover', w => {
    for (const [sid, k] of cakes) {
      const r = cakeRect(sid); if (!r || w.x < r.x - 2 || w.x > r.x + r.w + 2 || w.y < r.y - 7 || w.y > r.y + r.h + 1) continue
      const s = tower.snapshot?.sessions?.find(q => q.id === sid)
      return `<div class="t">🎂 ${label(k.m)} tool calls</div><div>${esc(s?.title || 'this session')} · ${(k.today || k.m).toLocaleString()} today</div><div class="m">reached at ${new Date(k.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · subagents count too</div>`
    }
    return null
  })

  // ---------- ?demo=milestonecake ----------
  if (!demo) return
  let t0 = 0, first = null
  tower.on('snapshot', data => {
    const now = Date.now(); if (!t0) t0 = now
    const s = first ? data.sessions.find(q => q.id === first) : data.sessions.find(q => q.running !== false)
    if (!s) return
    if (!first) { first = s.id; if (!location.search.includes('towerzoom')) setTimeout(() => { const f = tower.floor(first); if (f) tower.flyTo({ x: 100, y: f.y - 30 }, 5) }, 600) }
    for (let i = s.agents.length; i < 2; i++) s.agents.push({ id: 'demo-cake-' + i, type: 'general-purpose', description: 'demo helper ' + (i + 1), phase: null, workflow: null, workflowRun: null, state: 'tool', tool: 'Read', detail: '', lastActivity: now, ext: {} })
    const at = t0 + 2500
    s.ext = { ...s.ext, 'milestone-cake': now > at ? { today: 1003, milestone: 1000, at } : { today: 997, milestone: 500, at: t0 - STAY_MS - 1 } }
  })
}
