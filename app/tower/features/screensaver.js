// screensaver: when the user has sent no prompt to any session for 30 min (newest server ext 'walkabout' time), the office
// dims to a night-light, idle monitors bounce a logo, robot vacuums trundle along the floors and a zzz rises over the
// CEO chair. Working desks keep their screens lit. A new prompt flicks the lights back on floor by floor, bottom up.
// ?demo=screensaver: asleep for 22 s, awake for 8 s, repeating.
const IDLE = 30 * 60_000, FADE = 3, STAGGER = 220, FLICK = 320, CYCLE = 30_000, DEMO_SLEEP = 22_000
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const LOGO = ['#f7931a', '#0ac18e', '#63b3f0', '#e58ad0', '#f4e04f']
const busySession = st => st === 'tool' || st === 'thinking' || st === 'delegating' || st === 'building'
const busyAgent = st => !!st && st !== 'idle' && st !== 'done'

export default function init(api, tower) {
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('screensaver')
  const t0 = Date.now(), dim = new Map(), bots = new Map()
  let lastPrompt = 0, asleep = false, wakeAt = 0

  tower.on('sync', snap => {
    let m = 0
    for (const s of snap.sessions || []) m = Math.max(m, s.ext?.walkabout?.at || 0)
    lastPrompt = m
  })
  const idleNow = () => demo ? (Date.now() - t0) % CYCLE < DEMO_SLEEP : api.live !== false && tower.floors.length > 0 && Date.now() - lastPrompt > IDLE
  const indoor = () => tower.floors.filter(f => f.kind !== 'roof')

  tower.on('step', (dt, now) => {
    const was = asleep
    asleep = idleNow()
    if (was && !asleep) wakeAt = now
    indoor().forEach((f, i) => {
      let d = dim.get(f.id) || 0
      if (asleep) d = Math.min(1, d + dt / FADE)
      else if (d > 0) {
        const on = wakeAt + i * STAGGER + FLICK
        d = now >= on ? 0 : now >= on - FLICK ? (Math.sin(now / 23 + i) > 0.1 ? 1 : 0.25) : d
      }
      dim.set(f.id, d)
      if (d > 0.4) {
        let b = bots.get(f.id)
        if (!b) bots.set(f.id, b = { x: f.x0 + 40 + (api.hash(f.id) % Math.max(1, f.x1 - f.x0 - 80)), dir: api.hash(f.id) % 2 ? 1 : -1, pause: 0 })
        if (b.pause > 0) b.pause -= dt
        else {
          b.x += b.dir * 16 * dt
          if (b.x < f.x0 + 14 || b.x > f.x1 - 14 || Math.random() < dt * 0.06) { b.dir *= -1; b.pause = 0.6 + Math.random(); b.x = Math.max(f.x0 + 14, Math.min(f.x1 - 14, b.x)) }
        }
      } else bots.delete(f.id)
    })
  })

  // every desk monitor on the session floors: its screen rect and whether its sitter is working
  function screens() {
    const out = []
    for (const f of tower.floors) {
      if (f.kind !== 'session' || !f.sessionId) continue
      const d = tower.desk(f.sessionId); if (!d) continue
      const me = tower.person(f.sessionId)
      out.push({ f, m: d.monitor, on: !!me && me.floor === f.id && me.atDesk && busySession(me.state ?? me.data?.state) })
      for (const a of d.agents || []) {
        const p = tower.people.find(p => p.kind === 'agent' && p.floor === f.id && p.slot === a.k && p.atDesk && !p.leaving)
        out.push({ f, m: a.monitor, on: !!p && busyAgent(p.state ?? p.data?.state), seed: a.k + 1 })
      }
    }
    return out
  }
  function vacuum(c, b, y, now) {
    R(c, '#3a3e48', b.x - 5, y - 3, 10, 3); R(c, '#6a6f80', b.x - 4, y - 4, 8, 1); R(c, '#8a90a2', b.x - 2, y - 4, 4, 1)
    R(c, '#14151a', b.x - 4, y - 1, 2, 1); R(c, '#14151a', b.x + 2, y - 1, 2, 1)
    if (b.pause <= 0) R(c, 'rgba(200,200,210,.35)', b.x - b.dir * 7, y - 1, 2, 1)
  }
  function logo(c, s, now) {
    const sx = s.m.x + 1, sy = s.m.y + 1, w = 8, h = 8, t = (now / 420) + (s.seed || 0) * 3.1
    const px = (t * 1.3) % (2 * (w - 3)), py = (t * 0.9) % (2 * (h - 2))
    const x = px < w - 3 ? px : 2 * (w - 3) - px, y = py < h - 2 ? py : 2 * (h - 2) - py
    const bounces = Math.floor(t * 1.3 / (w - 3)) + Math.floor(t * 0.9 / (h - 2))
    R(c, '#05060a', sx, sy, w, h)
    R(c, LOGO[(bounces + (s.seed || 0)) % LOGO.length], sx + Math.floor(x), sy + Math.floor(y), 3, 2)
  }
  function zed(c, x, y, s, a) {
    c.globalAlpha = a; c.fillStyle = '#dfe6ff'
    c.fillRect(x, y, 4 * s, s); c.fillRect(x + 2 * s, y + s, s, s); c.fillRect(x + s, y + 2 * s, s, s); c.fillRect(x, y + 3 * s, 4 * s, s)
    c.globalAlpha = 1
  }

  tower.on('post', (c, now) => {
    const fl = indoor(), any = fl.some(f => (dim.get(f.id) || 0) > 0)
    if (!any) return
    const scr = screens(), plaques = tower.floors.map(f => { try { return tower.plaque(f) } catch { return null } }).filter(Boolean)
    for (const f of fl) { const b = bots.get(f.id); if (b) vacuum(c, b, f.y, now) }
    for (const f of fl) {
      const d = dim.get(f.id) || 0; if (d <= 0) continue
      c.save(); c.beginPath(); c.rect(f.x0, f.top, f.x1 - f.x0, f.y - f.top)
      for (const s of scr) if (s.f === f && s.on) c.rect(s.m.x - 1, s.m.y - 1, s.m.w + 2, s.m.h + 2)
      for (const p of plaques) c.rect(p.x, p.y, p.w, p.h)
      c.clip('evenodd'); c.fillStyle = `rgba(6,8,24,${0.7 * d})`; c.fillRect(f.x0, f.top, f.x1 - f.x0, f.y - f.top); c.restore()
    }
    c.globalCompositeOperation = 'lighter'
    for (const f of fl) {
      const d = dim.get(f.id) || 0; if (d < 0.3) continue
      const g = c.createRadialGradient(f.x0 + 8, f.y - 6, 0, f.x0 + 8, f.y - 6, 22)
      g.addColorStop(0, `rgba(255,170,80,${0.35 * d})`); g.addColorStop(1, 'rgba(255,170,80,0)')
      c.fillStyle = g; c.fillRect(f.x0 - 14, f.y - 30, 44, 30)
      for (const s of scr) if (s.f === f) {
        const cx = s.m.x + 5, cy = s.m.y + 5, r = s.on ? 18 : 9, col = s.on ? '110,170,255' : '160,160,255'
        const q = c.createRadialGradient(cx, cy, 0, cx, cy, r); q.addColorStop(0, `rgba(${col},${(s.on ? 0.3 : 0.12) * d})`); q.addColorStop(1, `rgba(${col},0)`)
        c.fillStyle = q; c.fillRect(cx - r, cy - r, r * 2, r * 2)
      }
      const b = bots.get(f.id)
      if (b && Math.floor(now / 700) % 2) R(c, 'rgba(80,255,140,.9)', b.x + b.dir * 3, f.y - 4, 1, 1)
    }
    c.globalCompositeOperation = 'source-over'
    for (const s of scr) if (!s.on && (dim.get(s.f.id) || 0) > 0.5) logo(c, s, now)
    const ceo = tower.slots, cf = ceo?.floor
    if (cf && (dim.get(cf.id) || 0) > 0.5) {
      const k = dim.get(cf.id)
      for (let i = 0; i < 3; i++) {
        const p = ((now / 2400) + i / 3) % 1, s = 1 + Math.floor(p * 2.2)
        zed(c, Math.round(ceo.seat + 4 + p * 14 + Math.sin(p * 6 + i) * 2), Math.round(cf.y - 40 - p * 26), s, k * Math.min(1, (1 - p) * 2.5, p * 6))
      }
    }
  })

  tower.on('hover', (w, person) => {
    if (person || !asleep) return null
    const cf = tower.slots?.floor
    if (!cf || Math.abs(w.x - tower.slots.seat - 12) > 22 || w.y < cf.y - 72 || w.y > cf.y) return null
    const mins = lastPrompt ? Math.round((Date.now() - lastPrompt) / 60_000) : null
    return `<div class="t">💤 Screensaver</div><div>${demo ? 'demo' : mins == null ? 'No prompt from you in any open session' : `Your last prompt was ${mins >= 120 ? Math.round(mins / 60) + ' h' : mins + ' min'} ago`}</div><div class="m">lights come back on with the next prompt</div>`
  })
}
