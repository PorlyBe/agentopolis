// blimp: an airship drifts across the sky over the street, behind the tower and in front of the far skyline, towing a
// banner with today's Gazette headline (snap.gazette.headline); a long one scrolls. Every few minutes, or at the edge of
// town, it turns around. At night its nav lights blink and the banner is lit. Click it to open the Gazette. ?demo=blimp.
import { BW, SHAFT } from '../building.js'
import { R } from '../draw.js'

const BODY = { w: 72, h: 22 }, BAN = { w: 170, h: 16 }, ROPE = 12, SPEED = 6, TURN = 3.2
const SCROLL = 34   // banner text, screen px per second
// the envelope's colours; the steampunk skin flies a brass dirigible
const HULL = {
  classic: { fin: ['#c8404a', '#a8323a', '#8a2a30'], body: ['#e8ecf2', '#c8ced8', '#aab2c0', '#8a92a2'], stripe: ['#f4a24f', '#2f6fb0'] },
  steampunk: { fin: ['#d8a84a', '#b8862e', '#8a5a32'], body: ['#e0c890', '#c8a46a', '#a8844e', '#7a5a34'], stripe: ['#6a4424', '#6a4424'] },
}

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('blimp')
  let headline = null, paper = null, x = null, dir = 1, sx = 1, turning = 0, nextTurn = 0, flown = false

  if (demo) tower.on('snapshot', snap => {
    if (!snap.gazette?.headline) snap.gazette = { ...(snap.gazette || {}), at: Date.now(), headline: { kicker: 'EXTRA', title: 'Blimp spotted over the street; engineers look up from their terminals', deck: 'Witnesses report a banner.' } }
  })
  tower.on('sync', snap => { paper = snap.gazette || null; const h = paper?.headline; headline = h ? [h.kicker, h.title].filter(Boolean).join(': ') : null })

  const range = () => { const e = tower.street.extent; return { x0: e.x0 + 60, x1: e.x1 - 60 } }
  const altitude = now => { const top = tower.floors.at(-1)?.top ?? -400; return Math.min(-220, top * 0.6) + Math.sin(now / 4200) * 3 }
  const towerRect = () => { const top = tower.floors.at(-1)?.top ?? -400; return { x: -2, y: top - 80, w: BW + SHAFT + 4, h: -top + 80 } }
  const inR = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h
  const gap = () => (demo ? 25 : 180 + Math.random() * 180) * 1000

  function geo(now) {
    if (x == null) return null
    const cy = altitude(now), cx = x
    const bx = cx - sx * (BODY.w / 2 + ROPE + BAN.w / 2) - BAN.w / 2, by = cy - 2
    return { cx, cy, body: { x: cx - BODY.w / 2, y: cy - BODY.h / 2, w: BODY.w, h: BODY.h + 8 }, ban: { x: bx, y: by, w: BAN.w, h: BAN.h } }
  }

  tower.on('step', (dt, now) => {
    const r = range()
    if (x == null) { x = demo ? Math.max(r.x0, -260) : r.x0 + Math.random() * (r.x1 - r.x0); dir = Math.random() < 0.5 ? 1 : -1; if (demo) dir = -1; sx = dir; nextTurn = now + gap() }
    if (demo && !flown && !params.get('towerzoom')) { flown = true; const g = geo(now); setTimeout(() => tower.flyTo({ x: g.cx + 60, y: g.cy + 10 }, 3), 600) }
    if (!turning && (now > nextTurn || (dir > 0 && x > r.x1) || (dir < 0 && x < r.x0))) { turning = now; dir = -dir }
    if (turning) {
      const q = Math.min(1, (now - turning) / (TURN * 1000))
      sx = -dir * Math.cos(q * Math.PI)
      if (q >= 1) { turning = 0; sx = dir; nextTurn = now + gap() }
    }
    x += sx * SPEED * Math.min(dt, 0.25)
  })

  function envelope(c, g, now, night) {
    const { cx, cy } = g, hw = BODY.w / 2, hh = BODY.h / 2
    const H = HULL[api.theme?.skin] || HULL.classic
    c.save(); c.translate(Math.round(cx), Math.round(cy)); c.scale(sx || 0.001, 1)
    for (let r = 0; r < 8; r++) {   // tail fins: a vertical trailing edge, the leading edge sloping into the body
      R(c, r ? H.fin[1] : H.fin[0], -hw + 1, -hh - 3 + r, 3 + r, 1)
      R(c, r ? H.fin[2] : H.fin[1], -hw + 1, hh + 2 - r, 3 + r, 1)
    }
    R(c, H.fin[1], -hw - 1, -1, 10, 2)
    for (let y = -hh; y < hh; y++) {
      const k = 1 - ((y + 0.5) / hh) ** 2, w = Math.round(hw * Math.sqrt(Math.max(0, k)) * (y < 0 ? 1 : 0.97))
      const col = H.body[y < -hh + 3 ? 0 : y < -2 ? 1 : y < 4 ? 2 : 3]
      R(c, col, -w + (y > 3 ? 2 : 0), y, w * 2 - (y > 3 ? 2 : 0), 1)
    }
    R(c, H.stripe[0], -hw + 8, -2, BODY.w - 18, 2); R(c, H.stripe[1], -hw + 10, 1, BODY.w - 22, 1)   // livery stripes
    R(c, '#f4f0e6', hw - 10, -5, 2, 2)   // nose cap
    R(c, '#4a4d56', -6, hh - 1, 1, 3); R(c, '#4a4d56', 8, hh - 1, 1, 3)
    R(c, '#3a3d46', -9, hh + 2, 22, 6); R(c, '#5a5d66', -9, hh + 2, 22, 1)   // gondola
    for (let i = 0; i < 4; i++) R(c, night ? '#ffe9a0' : '#9fd0ff', -6 + i * 5, hh + 4, 3, 2)
    const p = Math.floor(now / 70) % 2; R(c, '#2a2c33', -12, hh + 3, 3, 3); R(c, '#8a8f9a', -14, hh + (p ? 2 : 5), 1, 3)   // propeller
    const blink = Math.floor(now / 600) % 2 === 0, strobe = now % 1500 < 120
    R(c, blink ? '#ff4a3a' : '#7a2a2a', hw - 3, 2, 2, 2)                       // nose light
    R(c, blink ? '#7a2a2a' : '#4aff7a', -hw + 2, -hh + 4, 2, 2)                // top-rear light
    if (night && strobe) R(c, '#ffffff', -hw - 3, 0, 2, 2)                     // tail strobe
    c.restore()
  }

  function banner(c, g, now, night) {
    const b = g.ban, tail = { x: g.cx - sx * (BODY.w / 2 - 2), y: g.cy + 1 }, end = { x: b.x + b.w / 2 + sx * b.w / 2, y: b.y + 2 }
    c.strokeStyle = '#5a5d66'; c.lineWidth = 1; c.beginPath(); c.moveTo(tail.x, tail.y); c.lineTo(end.x, end.y); c.moveTo(tail.x, tail.y); c.lineTo(end.x, end.y + b.h - 3); c.stroke()
    for (let i = 0; i < b.w; i += 6) {
      const wave = Math.round(Math.sin(now / 380 + i / 14 * (sx >= 0 ? 1 : -1)) * 1.2)
      R(c, night ? '#fff6d8' : '#f4f0e6', b.x + i, b.y + wave, Math.min(6, b.w - i), b.h)
      R(c, '#c8402f', b.x + i, b.y + wave, Math.min(6, b.w - i), 1); R(c, '#c8402f', b.x + i, b.y + wave + b.h - 1, Math.min(6, b.w - i), 1)
    }
  }

  tower.on('items', (out, now, ctx) => {
    const g = geo(now); if (!g) return
    const night = (ctx?.sun?.n || 0) > 0.4
    out.push({ z: Z.BEHIND + 2, draw: (c, t) => { banner(c, g, t, night); envelope(c, g, t, night) } })
  })

  tower.on('glow', (c, now, n) => {
    const g = geo(now); if (!g || n < 0.05) return
    const b = g.ban, tr = towerRect()
    c.save(); c.beginPath(); c.rect(-1e5, -1e5, 2e5, 2e5); c.rect(tr.x, tr.y, tr.w, tr.h); c.clip('evenodd')   // the tower hides it
    c.fillStyle = `rgba(255,236,170,${0.35 * n})`; c.fillRect(b.x, b.y - 1, b.w, b.h + 2)
    const halo = (px, py, col, r) => { const gr = c.createRadialGradient(px, py, 0, px, py, r); gr.addColorStop(0, col); gr.addColorStop(1, 'rgba(0,0,0,0)'); c.fillStyle = gr; c.fillRect(px - r, py - r, r * 2, r * 2) }
    const blink = Math.floor(now / 600) % 2 === 0, hw = BODY.w / 2, hh = BODY.h / 2
    halo(g.cx + sx * (hw - 2), g.cy + 3, `rgba(255,70,50,${(blink ? 0.9 : 0.2) * n})`, 8)
    halo(g.cx - sx * (hw - 3), g.cy - hh + 5, `rgba(70,255,120,${(blink ? 0.2 : 0.8) * n})`, 7)
    if (now % 1500 < 120) halo(g.cx - sx * (hw + 2), g.cy + 1, `rgba(255,255,255,${n})`, 12)
    halo(g.cx + 2 * sx, g.cy + hh + 5, `rgba(255,220,140,${0.4 * n})`, 12)
    c.restore()
  })

  tower.on('overlay', (v, now, ctx) => {
    const g = geo(now), k = tower.zoom; if (!g || BAN.h * k < 9) return
    const b = g.ban, a = tower.worldToScreen(b.x, b.y), w = b.w * k, h = b.h * k
    if (a.x > v.canvas.width || a.x + w < 0 || a.y > v.canvas.height || a.y + h < 0) return
    const tr = towerRect(), t0 = tower.worldToScreen(tr.x, tr.y)
    v.save()
    v.beginPath(); v.rect(a.x + 2, a.y, w - 4, h); v.clip()
    v.beginPath(); v.rect(-1e4, -1e4, 3e4, 3e4); v.rect(t0.x, t0.y, tr.w * k, tr.h * k); v.clip('evenodd')   // hidden behind the tower
    const text = headline || 'THE AGENTOPOLIS GAZETTE — read all about it', fs = Math.min(h * 0.62, 22)
    v.font = font(fs, 800); v.textBaseline = 'middle'
    v.fillStyle = (ctx?.sun?.n || 0) > 0.4 ? '#8a2a12' : '#2a2018'
    const tw = v.measureText(text).width, y = a.y + h / 2 + 0.5
    if (tw <= w - 8) { v.textAlign = 'center'; v.fillText(text, a.x + w / 2, y) }
    else {
      const loop = tw + 40, off = (now / 1000 * SCROLL) % loop
      v.textAlign = 'left'; v.fillText(text, a.x + 4 - off, y); v.fillText(text, a.x + 4 - off + loop, y)
    }
    v.restore()
  })

  function hit(w, now) {
    const g = geo(now); if (!g || inR(w, towerRect())) return false
    return inR(w, g.body) || inR(w, { x: g.ban.x, y: g.ban.y - 2, w: g.ban.w, h: g.ban.h + 4 })
  }
  tower.on('hover', (w, person) => {
    if (person || !hit(w, performance.now())) return null
    return `<div class="t">🎈 The Gazette blimp</div><div>${esc(headline || 'No paper printed yet')}</div>${api.gazette ? '<div class="m">click to read the Gazette</div>' : ''}`
  })
  tower.on('click', (w, person) => {
    if (person || !api.gazette || !hit(w, performance.now())) return false
    if (!api.gazette.open(paper)) api.toast(`📰 ${headline || 'The Gazette is not printed yet'}`, 4000)
    return true
  })
}
