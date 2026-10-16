// groundhog: a character stuck in a retry loop (server ext 'groundhog': the same tool call failing 3+ times in 10 min)
// walks the same small circle between its desk and the wall board, over a worn dotted loop on the floor, with a déjà-vu
// thought ('3rd time…'); the floor's plaque gets a tally of the tries. Hover the walker for the call it keeps retrying.
// The loop ends when that call succeeds or the window passes. ?demo=groundhog fakes one.
import { IX, IX1 } from '../building.js'
import { R } from '../draw.js'

const WINDOW = 10 * 60_000, PLAN_MS = 1000, SPAN = 44, PAUSE = { a: 1300, b: 1000 }
const nth = n => n + (n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] || 'th')

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('groundhog')
  const walkers = new Map()     // person id -> { s, loop, fid, a, b, leg, arrived }
  let planAt = 0

  function loopsOf(s, now) {
    if (s.running === false) return []
    return (s.ext?.groundhog?.loops || []).filter(l => now - l.last < WINDOW)
  }

  function plan() {
    const snap = tower.snapshot; if (!snap) return
    const now = Date.now(), want = new Map()
    for (const s of snap.sessions) {
      const f = tower.floorOf(s.id); if (!f || f.kind !== 'session') continue
      for (const l of loopsOf(s, now)) if (!want.has(l.who)) want.set(l.who, { s, loop: l, fid: f.id })
    }
    for (const [id, w] of [...walkers]) {
      if (want.has(id)) continue
      const p = tower.person(id); if (p?.activity === 'groundhog') tower.release(id)
      walkers.delete(id)
    }
    for (const [id, q] of want) {
      const w = walkers.get(id)
      if (w) { w.s = q.s; w.loop = q.loop; continue }
      if (api.live === false) continue
      const p = tower.person(id); if (!p || p.leaving || p.steered || p.floor !== q.fid) continue
      const a = Math.round(p.x), b = a + SPAN > IX1 - 40 ? a - SPAN : a + SPAN
      const nw = { ...q, a, b, leg: 'a', arrived: performance.now() }
      walkers.set(id, nw)
      go(id, nw, 'b')
    }
  }
  function go(id, w, leg) {
    w.leg = leg; w.arrived = null
    const o = leg === 'a' ? { face: 'right', pose: 'stand', anim: 'type' } : { face: 'up', pose: 'stand', anim: 'read' }
    if (!tower.sendTo(id, w.fid, w[leg], { ...o, activity: 'groundhog', then: () => { w.arrived = performance.now() } })) walkers.delete(id)
  }
  tower.on('step', (dt, now) => {
    if (now - planAt > PLAN_MS) { planAt = now; plan() }
    for (const [id, w] of walkers) {
      const p = tower.person(id)
      if (!p || !p.steered || (p.activity && p.activity !== 'groundhog')) { walkers.delete(id); continue }
      if (w.arrived != null && now - w.arrived > PAUSE[w.leg]) go(id, w, w.leg === 'a' ? 'b' : 'a')
    }
  })

  // ---------- the worn loop on the floor ----------
  tower.on('items', (out, now) => {
    for (const [, w] of walkers) {
      const f = tower.floor(w.fid); if (!f) continue
      const x0 = Math.min(w.a, w.b) - 4, x1 = Math.max(w.a, w.b) + 4, cx = (x0 + x1) / 2, rx = (x1 - x0) / 2, y = f.y - 2
      out.push({ z: Z.FLOOR + 2, draw: c => {
        const n = 26, shift = (now / 900) % 1
        for (let i = 0; i < n; i++) {
          const t = (i + shift) / n * Math.PI * 2, x = cx + Math.cos(t) * rx, yy = y + Math.sin(t) * 1.6
          R(c, i % 2 ? 'rgba(110,80,50,.6)' : 'rgba(110,80,50,.3)', x, yy, 2, 1)
        }
        const t = (now / 2600) % 1, ax = cx + Math.cos(t * Math.PI * 2) * rx, ay = y + Math.sin(t * Math.PI * 2) * 1.6, d = Math.sin(t * Math.PI * 2) > 0 ? -1 : 1
        R(c, '#b0660f', ax, ay - 1, 1, 3); R(c, '#b0660f', ax + d, ay, 1, 1)
      } })
    }
  })

  // ---------- the déjà-vu thought ----------
  tower.on('overlay', (c, now) => {
    if (!walkers.size) return
    const k = tower.zoom, H = tower.canvas.clientHeight
    if (k < tower.fitZoom() * 1.1) return
    c.save(); c.textBaseline = 'middle'
    for (const [id, w] of walkers) {
      const p = tower.person(id); if (!p || p.floor !== w.fid) continue
      const a = tower.worldToScreen(p.x, p.y - 34)
      if (a.y < -60 || a.y > H + 60) continue
      const fs = Math.round(Math.max(10, Math.min(14, 3.6 * k))), t = `🔁 ${nth(w.loop.count)} time…`
      c.font = font(fs, 700)
      const tw = c.measureText(t).width + 18, h = fs + 12, x = Math.round(a.x + 10), y = Math.round(a.y - h - 14 - Math.sin(performance.now() / 500) * 1.5)
      c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.roundRect(x + 2, y + 3, tw, h, h / 2); c.fill()
      c.fillStyle = '#f6f1ff'
      c.beginPath(); c.roundRect(x, y, tw, h, h / 2); c.fill()
      for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x + 6 + i * (tw - 12) / 3, y + (i % 2 ? 1 : 2), h * 0.32, 0, Math.PI * 2); c.fill(); c.beginPath(); c.arc(x + 9 + i * (tw - 18) / 3, y + h - 1, h * 0.28, 0, Math.PI * 2); c.fill() }
      c.beginPath(); c.arc(x + 2, y + h + 6, 3.2, 0, Math.PI * 2); c.fill()
      c.beginPath(); c.arc(a.x + 3, a.y - 5, 2, 0, Math.PI * 2); c.fill()
      c.fillStyle = '#5b3fa0'; c.fillText(t, x + 9, y + h / 2 + 0.5)
    }
    c.restore()
  })

  // ---------- the plaque tally ----------
  tower.on('plaque', (c, f, b) => {
    if (f.kind !== 'session' || !f.session) return 0
    const n = Math.max(0, ...loopsOf(f.session, Date.now()).map(l => l.count)); if (!n) return 0
    const sw = Math.max(1, Math.round(b.k * 0.6)), gap = 2.2 * b.k, hh = b.h * 0.5, y0 = b.y + (b.h - hh) / 2
    const groups = Math.floor(n / 5), rest = n % 5, gw = 4 * gap + 2 * b.k, w = groups * gw + rest * gap + b.k
    let x = b.right - w - b.k
    c.fillStyle = '#f4c64f'; c.strokeStyle = '#f4c64f'; c.lineWidth = sw
    for (let g = 0; g < groups; g++) {
      for (let i = 0; i < 4; i++) c.fillRect(Math.round(x + i * gap), y0, sw, hh)
      c.beginPath(); c.moveTo(x - b.k * 0.5, y0 + hh - 1); c.lineTo(x + 3 * gap + sw + b.k * 0.5, y0 + 1); c.stroke()
      x += gw
    }
    for (let i = 0; i < rest; i++) c.fillRect(Math.round(x + i * gap), y0, sw, hh)
    return w + 2 * b.k
  })

  // ---------- hover / click ----------
  tower.on('hover', (w, person) => {
    const q = person && walkers.get(person.id); if (!q) return null
    const l = q.loop, mins = Math.max(1, Math.round((l.last - l.first) / 60000))
    return `<div class="t">Groundhog Day · ${esc(q.s.title)}</div><div class="m">${l.count} failed tries of the same ${esc(l.tool)} call in ${mins}m${person.id !== q.s.id ? ' · a subagent' : ''}</div>`
      + `<div style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:420px">${esc(l.label)}</div><div class="m">time to step in? click to open in Orca</div>`
  })
  tower.on('click', (w, person) => { const q = person && walkers.get(person.id); if (!q) return false; tower.focusSession(q.s); return true })

  // ---------- ?demo=groundhog ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!data.sessions.length) data.sessions.push({ id: '00000000-0000-4000-8000-000000000041', title: 'GARDEN PLANNER', cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'tool', tool: 'Bash', detail: null, lastActivity: now, agents: [], ext: {} })
    const s = data.sessions[data.sessions.length > 1 ? 1 : 0]
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => { const f = tower.floorOf(s.id); if (f) tower.flyTo({ x: IX + 90, y: f.y - 30 }, Number(params.get('ghzoom')) || 3) }, 800) }
    const count = 3 + Math.floor((now - t0) / 15000) % 6
    s.running = true; s.state = 'tool'; delete s.attention
    s.ext = { ...s.ext, groundhog: { loops: [{ who: s.id, tool: 'Bash', label: 'pytest -q tests/test_frost.py -k alerts_by_postcode', count, first: now - count * 90000, last: now - 20000 }] } }
  })
}
