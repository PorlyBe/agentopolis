// friday-drinks: from 17:00 local on Fridays the roof terrace gets string lights and a cooler, and idle characters go
// up for a drink. A chalkboard holds the week's tally (snap.fridayDrinks, server/features/friday-drinks.mjs): PRs merged,
// commits, workflow runs, and today's cheapest and priciest session. Everything stays left of the deploy rocket pad.
// ?demo=fridaydrinks makes it Friday evening and sends a few people on a break.
import { IX } from '../building.js'
import { R } from '../draw.js'

const SLOTS = [[20, 'right'], [34, 'left'], [158, 'right'], [170, 'left'], [222, 'right'], [270, 'right'], [284, 'left']]
const BOARD = { x: IX + 108, w: 28, h: 24 }, COOLER = { x: IX + 230, w: 16 }, POLE = IX + 292
const BULBS = ['#ffd27a', '#ff9a5a', '#fff2c0', '#ffb8d0']
const usd = n => '$' + (n >= 100 ? Math.round(n) : n.toFixed(2))

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const demo = api.demo('fridaydrinks')
  const sent = new Map()   // person id -> slot index
  let planAt = 0

  const isOn = () => { const d = new Date(); return demo || (d.getDay() === 5 && d.getHours() >= 17) }
  const roof = () => tower.floors.at(-1)
  const tally = () => {
    const t = tower.snapshot?.fridayDrinks
    if (t?.ready || !demo) return t
    return { ready: true, merged: 7, commits: 212, workflows: 31, cheapest: { title: 'typo fix', usd: 0.18 }, priciest: { title: 'CSV EXPORT', usd: 41.3 } }
  }
  const lines = t => !t ? ['THIS WEEK', '…'] : [
    'THIS WEEK', `PRs merged ${t.gh === false ? '?' : t.merged}`, `commits ${t.commits}`, `workflows ${t.workflows}`,
    t.cheapest ? `cheap ${usd(t.cheapest.usd)}` : 'cheap —', t.priciest ? `pricey ${usd(t.priciest.usd)}` : 'pricey —',
  ]

  // ---------- who goes up ----------
  const idle = p => p.state === 'idle' && !p.leaving
  function plan() {
    const f = roof(); if (!f) return
    if (!isOn()) { for (const id of sent.keys()) tower.release(id); sent.clear(); return }
    for (const [id] of sent) { const p = tower.person(id); if (!p || !idle(p) || p.activity !== 'friday-drinks' && !p.walking && p.floor === f.id) { if (p) tower.release(id); sent.delete(id) } }
    const free = SLOTS.map((_, i) => i).filter(i => ![...sent.values()].includes(i))
    let budget = 2
    for (const p of tower.people) {
      if (!free.length || budget <= 0) break
      if (sent.has(p.id) || !idle(p) || p.floor === null || p.steered || p.activity?.startsWith('meeting:')) continue
      const i = free.shift(), [x, face] = SLOTS[i]
      if (tower.sendTo(p.id, f.id, IX + x, { face, pose: 'stand', activity: 'friday-drinks' })) { sent.set(p.id, i); budget-- } else free.unshift(i)
    }
  }
  tower.on('step', (dt, now) => { if (now - planAt > 1500 && api.live !== false) { planAt = now; plan() } })

  // ---------- the terrace ----------
  const wire = f => {
    const y = f.y - 47, pts = [], span = (a, b, ya, yb, sag) => { for (let x = a; x <= b; x++) { const t = (x - a) / (b - a); pts.push([x, Math.round(ya + (yb - ya) * t + sag * Math.sin(Math.PI * t))]) } }
    span(12, IX + 194, y, y - 1, 7); span(IX + 196, POLE + 1, y - 1, y, 5)
    return pts
  }
  const bulbs = f => wire(f).filter(([x]) => x % 9 === 4)
  function terrace(c, f, now) {
    const y = f.y - 3
    R(c, '#4a4040', POLE, y - 45, 2, 45); R(c, '#5a5050', POLE - 1, y - 46, 4, 2)
    for (const [x, wy] of wire(f)) R(c, '#2a2630', x, wy, 1, 1)
    bulbs(f).forEach(([x, wy], i) => { const on = (i + Math.floor(now / 700)) % 7 !== 0; R(c, '#1a1a1a', x, wy + 1, 1, 1); R(c, on ? BULBS[i % 4] : '#5a5040', x - 1, wy + 2, 3, 3) })
    // the cooler, a few bottles poking out of the ice
    const cx = COOLER.x
    R(c, 'rgba(0,0,0,.2)', cx - 1, y - 1, COOLER.w + 2, 1)
    R(c, '#2a6ab8', cx, y - 10, COOLER.w, 10); R(c, '#3a82d0', cx, y - 10, COOLER.w, 2); R(c, '#1f528f', cx, y - 3, COOLER.w, 1)
    R(c, '#eef2f6', cx - 1, y - 12, COOLER.w + 2, 2); R(c, '#c8d0d8', cx + 5, y - 9, 6, 1)
    for (const [bx, col] of [[3, '#6a3a1a'], [7, '#2f7a3a'], [11, '#6a3a1a']]) { R(c, col, cx + bx, y - 16, 2, 4); R(c, col, cx + bx, y - 18, 1, 2) }
    R(c, '#dff2ff', cx + 1, y - 13, COOLER.w - 2, 1)
  }
  function board(c, f) {
    const y = f.y - 3, x = BOARD.x, top = y - BOARD.h - 6
    R(c, '#6a4a30', x + 2, top + 4, 2, BOARD.h + 2); R(c, '#6a4a30', x + BOARD.w - 4, top + 4, 2, BOARD.h + 2)
    R(c, '#8a6240', x, top, BOARD.w, BOARD.h); R(c, '#2d3a32', x + 2, top + 2, BOARD.w - 4, BOARD.h - 4)
    c.fillStyle = 'rgba(240,240,230,.75)'
    const w = [18, 14, 16, 12, 15, 17]
    for (let i = 0; i < 6; i++) c.fillRect(x + 4, top + 4 + i * 3, w[i] - (i ? 0 : 6), 1)
    R(c, '#e8e8e0', x + BOARD.w - 7, top + BOARD.h - 4, 3, 1)
  }
  const boardRect = f => ({ x: BOARD.x, y: f.y - 3 - BOARD.h - 6, w: BOARD.w, h: BOARD.h })

  tower.on('items', (out, now) => {
    const f = roof(); if (!f || !isOn()) return
    out.push({ z: Z.FLOOR + 6, draw: c => { terrace(c, f, now); board(c, f) } })
    out.push({ z: Z.STAND + 2, draw: c => {
      for (const id of sent.keys()) {
        const p = tower.person(id)
        if (!p || p.floor !== f.id || p.walking || p.activity !== 'friday-drinks') continue
        const right = p.face !== 'left', hx = Math.round(p.x + (right ? 4 : -6))
        const cheers = Math.floor(now / 2600 + p.x) % 4 === 0, hy = Math.round(p.y - (cheers ? 19 : 14))
        R(c, '#6a3a1a', hx, hy - 4, 2, 5); R(c, '#6a3a1a', hx + (right ? 0 : 1), hy - 6, 1, 2); R(c, '#e8d8a0', hx, hy - 2, 2, 1)
      }
    } })
  })

  tower.on('glow', (c, now, n) => {
    const f = roof(); if (!f || !isOn()) return
    const k = Math.max(0.35, n)
    bulbs(f).forEach(([x, wy], i) => {
      if ((i + Math.floor(now / 700)) % 7 === 0) return
      const g = c.createRadialGradient(x + 0.5, wy + 3, 0, x + 0.5, wy + 3, 7)
      g.addColorStop(0, `rgba(255,200,120,${0.6 * k})`); g.addColorStop(1, 'rgba(255,200,120,0)')
      c.fillStyle = g; c.fillRect(x - 7, wy - 4, 15, 15)
    })
  })

  // the tally in chalk, once the board is big enough on screen to read
  tower.on('overlay', c => {
    const f = roof(); if (!f || !isOn()) return
    const b = boardRect(f), a = tower.worldToScreen(b.x + 2, b.y + 2), z = tower.zoom, w = (b.w - 4) * z, h = (b.h - 4) * z
    if (w < 70) return
    const ls = lines(tally()), fs = Math.min(15, Math.floor(h / ls.length) - 2)
    if (fs < 6) return
    c.save(); c.fillStyle = '#2d3a32'; c.fillRect(a.x, a.y, w, h)
    c.textBaseline = 'top'; c.fillStyle = '#f2f0e4'
    ls.forEach((l, i) => { c.font = font(fs, i ? 400 : 700); c.fillText(fitText(l, w - 6, c.font), a.x + 3, a.y + 2 + i * (fs + 2)) })
    c.restore()
  })

  tower.on('hover', (w, person) => {
    if (person) return null
    const f = roof(); if (!f || !isOn()) return null
    const b = boardRect(f)
    if (!(w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h + 6)) {
      const cx = COOLER.x
      return w.x >= cx - 1 && w.x <= cx + COOLER.w + 1 && w.y >= f.y - 19 && w.y <= f.y ? `<div class="t">🍻 Friday drinks</div><div class="m">${sent.size} up on the roof</div>` : null
    }
    const t = tally()
    if (!t?.ready) return '<div class="t">🍻 This week</div><div class="m">counting…</div>'
    const who = s => s ? `${esc(String(s.title).slice(0, 40))} · ${usd(s.usd)}` : '—'
    return `<div class="t">🍻 This week (since Monday)</div><div class="m">PRs merged: ${t.gh === false ? 'gh unavailable' : t.merged}</div><div class="m">commits: ${t.commits}</div><div class="m">workflows run: ${t.workflows}</div><div class="m">cheapest today: ${who(t.cheapest)}</div><div class="m">priciest today: ${who(t.priciest)}</div>`
  })

  if (demo) tower.on('snapshot', data => {
    data.sessions.forEach((s, i) => {
      if (i % 2 === 0) s.state = 'idle'
      for (const a of s.agents) if (a.state !== 'done') a.state = 'idle'
    })
  })
}
