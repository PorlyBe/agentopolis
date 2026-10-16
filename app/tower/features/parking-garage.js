// parking-garage: an underground level under the server room with one car per live session, in floor order: Opus (and
// Fable) a limo, Sonnet a sedan, Haiku a scooter; a 1M-context model tows a stretch trailer. The model is the latest
// assistant turn's (ext['context-meter']); exhaust puffs scale with tokens/min, measured from the growth of
// ext['cost-jar'].byModel between snapshots. Hover a car for session, model and rate; click it to open the session.
// ?demo=parkinggarage parks four extra sessions, one of each kind, burning at very different rates.
import { garageRect, BW } from '../building.js'
import { R } from '../draw.js'

const WINDOW_MS = 3 * 60_000, MIN_SPAN = 10_000, GAP = 10
const LEN = { limo: 52, sedan: 30, scooter: 16 }, TRAILER = 22
const kindOf = m => /opus|fable|mythos/i.test(m) ? 'limo' : /haiku/i.test(m) ? 'scooter' : 'sedan'
const pretty = m => {
  const x = String(m || '').match(/(opus|sonnet|haiku|fable|mythos)-(\d+)(?:-(\d+))?/i)
  return x ? x[1][0].toUpperCase() + x[1].slice(1).toLowerCase() + ' ' + x[2] + (x[3] && x[3].length < 3 ? '.' + x[3] : '') : (m || 'unknown model')
}
const fmt = n => n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n))
const DIGITS = { 1: ['010', '110', '010', '010', '111'], M: ['10001', '11011', '10101', '10001', '10001'] }

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const demo = api.demo('parkinggarage')
  const samples = new Map()   // session id -> [[t, tokens]]
  const emitted = new Map()   // session id -> last puff time
  let cars = [], puffs = []

  const tokensOf = s => { const b = s.ext?.['cost-jar']?.byModel; return b ? Object.values(b).reduce((n, m) => n + (m.tokens || 0), 0) : null }
  const modelOf = s => {
    const cm = s.ext?.['context-meter']
    if (cm?.model) return cm.model
    const b = Object.entries(s.ext?.['cost-jar']?.byModel || {}).sort((p, q) => q[1].messages - p[1].messages)[0]
    return b?.[0] || null
  }
  function rateOf(id) {
    const xs = samples.get(id); if (!xs || xs.length < 2) return null
    const [t0, n0] = xs[0], [t1, n1] = xs.at(-1)
    return t1 - t0 < MIN_SPAN ? null : Math.max(0, n1 - n0) / ((t1 - t0) / 60_000)
  }

  tower.on('sync', snap => {
    const now = snap.now || Date.now(), live = new Set()
    for (const s of snap.sessions) {
      live.add(s.id)
      const n = tokensOf(s); if (n == null) continue
      let xs = samples.get(s.id); if (!xs) samples.set(s.id, xs = [])
      if (xs.length && (n < xs.at(-1)[1] || now <= xs.at(-1)[0])) { if (n < xs.at(-1)[1]) xs.length = 0; else continue }   // day rolled over
      xs.push([now, n])
      while (xs.length > 2 && now - xs[1][0] > WINDOW_MS) xs.shift()
    }
    for (const id of samples.keys()) if (!live.has(id)) samples.delete(id)
  })

  // ---------- layout: cars left to right in floor order, wrapping to a second deck when the first is full ----------
  function layout() {
    const g = garageRect(tower.floors), x0 = g.x + 22, x1 = g.x + g.w - 8
    const list = tower.floors.filter(f => f.kind === 'session' && f.session).map(f => {
      const s = f.session, model = modelOf(s), cm = s.ext?.['context-meter']
      const big = cm?.window === 1_000_000 || /\[1m\]/i.test(model || ''), kind = kindOf(model || '')
      return { s, f, model, big, kind, len: LEN[kind] + (big ? TRAILER + 3 : 0), rate: rateOf(s.id) }
    })
    const total = list.reduce((n, c) => n + c.len + GAP, 0), rows = total > x1 - x0 ? 2 : 1
    const deck = r => rows === 1 || r === 0 ? g.y + g.h - 4 : g.y + Math.round(g.h / 2) - 1   // the lowest floors park on the bottom deck
    let r = 0, x = x0
    const perRow = rows === 1 ? list.length : Math.ceil(list.length / 2)
    const rowLen = k => list.slice(k * perRow, (k + 1) * perRow).reduce((n, c) => n + c.len, 0)
    list.forEach((c, i) => {
      if (rows === 2 && i === perRow) { r = 1; x = x0 }
      const n = rows === 1 ? list.length : (r === 0 ? perRow : list.length - perRow)
      const gap = Math.min(GAP + 12, Math.max(-8, (x1 - x0 - rowLen(r)) / Math.max(1, n)))
      Object.assign(c, { x: Math.round(x), y: deck(r), row: r })
      x += c.len + gap
    })
    return { g, rows, deck, list }
  }

  // ---------- puffs ----------
  const strength = rate => rate == null || rate <= 0 ? 0 : Math.max(0.08, Math.min(1, Math.log10(rate / 5_000) / Math.log10(400)))
  tower.on('step', (dt, now) => {
    for (const c of cars) {
      const k = strength(c.rate); if (!k) continue
      const every = 1600 - 1420 * k, last = emitted.get(c.s.id) || 0
      if (now - last < every) continue
      emitted.set(c.s.id, now)
      const px = c.x + (c.big ? TRAILER + 3 : 0) - 1, py = c.y - (c.kind === 'scooter' ? 5 : 4)
      puffs.push({ x: px, y: py, vx: -(6 + 10 * k) - Math.random() * 4, vy: -(3 + 4 * k) - Math.random() * 2, r: 1 + 2 * k, t0: now, life: 1400 + 1200 * k, ceil: c.y - 22 })
    }
    for (const p of puffs) { p.x += p.vx * dt; p.y = Math.max(p.ceil, p.y + p.vy * dt); p.vx *= 0.985 }
    puffs = puffs.filter(p => now - p.t0 < p.life).slice(-300)
  })

  // ---------- drawing ----------
  function shell(c, L, now) {
    const { g, rows, deck } = L, bottom = g.y + g.h
    R(c, '#2e2f36', 0, g.y, BW, g.h + 3)                                             // outer walls + foundation
    R(c, '#5e5f66', g.x, g.y, g.w, g.h - 4)
    c.fillStyle = '#585960'; for (let x = g.x + 16; x < g.x + g.w; x += 32) c.fillRect(x, g.y, 1, g.h - 4)
    R(c, 'rgba(0,0,0,.18)', g.x, g.y, g.w, 2)
    R(c, '#4a6a8a', g.x, g.y + 4, g.w, 1); c.fillStyle = '#3a5470'; for (let x = g.x + 30; x < g.x + g.w; x += 60) c.fillRect(x, g.y + 5, 1, 2)   // sprinkler pipe
    for (let r = 0; r < rows; r++) {
      const y = deck(r)
      c.fillStyle = '#c8a23a'; c.fillRect(g.x, y - 14, g.w, 1)
      for (let x = g.x; x < g.x + g.w; x += 8) { R(c, '#c8a23a', x, y - 3, 4, 3); R(c, '#2a2a2e', x + 4, y - 3, 4, 3) }
      R(c, '#46474e', g.x, y, g.w, r === 0 ? 4 : 3); R(c, '#7a7b82', g.x, y, g.w, 1)
    }
    for (const x of [g.x + 122, g.x + 242, g.x + 362]) { R(c, '#74757c', x, g.y + 2, 6, bottom - 4 - g.y - 2); R(c, '#86878e', x, g.y + 2, 1, bottom - 4 - g.y - 2) }
    for (let x = g.x + 46; x < g.x + g.w; x += 80) { R(c, '#3a3b42', x, g.y + 1, 14, 1); R(c, '#e8f2f0', x + 1, g.y + 2, 12, 2) }
    // the P sign and the exit, on the left wall
    R(c, '#1f5fb0', g.x + 3, g.y + 8, 12, 12); R(c, '#f4f4f4', g.x + 6, g.y + 10, 2, 8); R(c, '#f4f4f4', g.x + 8, g.y + 10, 3, 1); R(c, '#f4f4f4', g.x + 8, g.y + 14, 3, 1); R(c, '#f4f4f4', g.x + 11, g.y + 11, 1, 3)
    R(c, '#1a7a3a', g.x + 3, g.y + 24, 12, 5); R(c, '#bff0c8', g.x + 5, g.y + 26, 8, 1)
  }
  const glyph = (c, ch, x, y, col) => DIGITS[ch].forEach((row, j) => [...row].forEach((b, i) => { if (b === '1') R(c, col, x + i, y + j, 1, 1) }))
  const wheel = (c, x, y, d = 6) => { R(c, '#16161a', x, y - d + 1, d, d - 1); R(c, '#16161a', x + 1, y - d, d - 2, 1); R(c, '#9a9aa2', x + (d >> 1) - 1, y - (d >> 1) - 1, 2, 2) }
  function vehicle(c, car, now) {
    const { kind, s, f } = car, k = strength(car.rate)
    let x = car.x, y = car.y
    if (car.big) {
      R(c, '#d8d2c4', x, y - 16, TRAILER, 12); R(c, '#eeeae0', x, y - 16, TRAILER, 1); R(c, `hsl(${f.hue},45%,48%)`, x, y - 8, TRAILER, 2)
      glyph(c, '1', x + 6, y - 14, '#3a3a44'); glyph(c, 'M', x + 10, y - 14, '#3a3a44')
      wheel(c, x + 8, y, 5); R(c, '#3a3a40', x + TRAILER, y - 5, 4, 1)
      x += TRAILER + 3
    }
    const shake = k > 0.25 && Math.floor(now / (140 - 80 * k) + f.n) % 2 ? -1 : 0, by = y + shake
    const hue = `hsl(${f.hue},55%,46%)`, hue2 = `hsl(${f.hue},55%,60%)`
    if (kind === 'limo') {
      R(c, '#1c1c24', x + 1, by - 10, 50, 6); R(c, '#1c1c24', x + 8, by - 15, 36, 5); R(c, '#2c2c36', x + 8, by - 15, 36, 1)
      c.fillStyle = '#3e4c62'; for (let wx = x + 10; wx < x + 42; wx += 8) c.fillRect(wx, by - 14, 6, 3)
      R(c, '#c8c8d0', x + 1, by - 7, 50, 1); R(c, '#e8e0a0', x + 50, by - 9, 1, 2); R(c, '#d83a3a', x + 1, by - 9, 1, 2)
      R(c, hue, x + 44, by - 10, 3, 1)
      wheel(c, x + 5, y); wheel(c, x + 40, y)
    } else if (kind === 'sedan') {
      R(c, hue, x, by - 10, 30, 6); R(c, hue2, x, by - 10, 30, 1); R(c, hue, x + 7, by - 15, 15, 5)
      R(c, '#9cc4dc', x + 9, by - 14, 5, 3); R(c, '#9cc4dc', x + 15, by - 14, 5, 3)
      R(c, '#e8e0a0', x + 29, by - 9, 1, 2); R(c, '#d83a3a', x, by - 9, 1, 2)
      wheel(c, x + 3, y); wheel(c, x + 21, y)
    } else {
      R(c, hue, x + 3, by - 8, 10, 3); R(c, '#2a2a30', x + 3, by - 10, 6, 2); R(c, hue2, x + 12, by - 13, 2, 8); R(c, '#4a4a52', x + 11, by - 14, 4, 1)
      R(c, '#e8e0a0', x + 14, by - 12, 1, 1)
      wheel(c, x, y, 5); wheel(c, x + 11, y, 5)
    }
  }

  tower.on('items', (out, now) => {
    if (!tower.floors.length) return
    const L = layout(); cars = L.list
    out.push({ z: Z.BEHIND + 10, draw: c => {
      shell(c, L, now)
      for (const car of cars) {
        const bx = car.x - 3, w = car.len + 6
        R(c, 'rgba(240,236,220,.6)', bx - 1, car.y - 1, 1, 1); R(c, 'rgba(240,236,220,.6)', bx + w, car.y - 1, 1, 1)
        R(c, `hsl(${car.f.hue},45%,40%)`, car.x + car.len - 10, car.y - 22, 10, 4)        // the bay's tag, in the floor's hue
        vehicle(c, car, now)
      }
      for (const p of puffs) {
        const a = 1 - (now - p.t0) / p.life, r = p.r + (1 - a) * 2
        c.fillStyle = `rgba(206,206,212,${(0.55 * a).toFixed(3)})`; c.fillRect(Math.round(p.x - r), Math.round(p.y - r), Math.ceil(2 * r), Math.ceil(2 * r))
      }
    } })
  })

  tower.on('glow', (c, now, n) => {
    if (!tower.floors.length || n < 0.02) return
    const g = garageRect(tower.floors)
    for (let x = g.x + 46; x < g.x + g.w; x += 80) {
      const gr = c.createRadialGradient(x + 7, g.y + 4, 0, x + 7, g.y + 20, 40)
      gr.addColorStop(0, `rgba(200,235,230,${0.45 * n})`); gr.addColorStop(1, 'rgba(200,235,230,0)')
      c.fillStyle = gr; c.fillRect(x - 33, g.y, 80, g.h - 4)
    }
  })

  const hit = w => cars.find(c => w.x >= c.x - 2 && w.x <= c.x + c.len + 2 && w.y >= c.y - 18 && w.y <= c.y + 1)
  tower.on('hover', (w, person) => {
    if (person) return null
    const c = hit(w)
    if (c) {
      const rate = c.rate == null ? 'measuring…' : c.rate > 0 ? fmt(c.rate) + ' tokens/min' : 'idle — engine off'
      const what = { limo: 'limo', sedan: 'sedan', scooter: 'scooter' }[c.kind] + (c.big ? ' + 1M trailer' : '')
      return `<div class="t">🚗 ${esc(c.s.title)}</div><div class="m">${esc(pretty(c.model))}${c.big ? ' · 1M context' : ''} — ${what}</div><div class="m">${rate}</div><div class="m">↗ click to open the session</div>`
    }
    const g = tower.floors.length && garageRect(tower.floors)
    if (g && w.x >= g.x && w.x <= g.x + g.w && w.y >= g.y && w.y <= g.y + g.h) {
      const rows = [...cars].sort((a, b) => (b.rate || 0) - (a.rate || 0)).slice(0, 6)
      return `<div class="t">🅿️ Parking garage · one car per session</div>${rows.map(c => `<div class="m">${esc(pretty(c.model))}${c.big ? ' 1M' : ''} · ${c.rate == null ? '…' : fmt(c.rate) + '/min'} — ${esc(String(c.s.title).slice(0, 36))}</div>`).join('') || '<div class="m">no cars parked</div>'}<div class="m">limo Opus · sedan Sonnet · scooter Haiku · trailer 1M</div>`
    }
    return null
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const c = hit(w); if (!c) return false
    tower.focusSession(c.s)
    return true
  })

  if (demo) {
    const T0 = Date.now()
    const fake = [['haiku', 'claude-haiku-4-5', 20_000, false], ['sonnet', 'claude-sonnet-4-6', 250_000, false], ['opus1m', 'claude-opus-5-5', 2_500_000, true], ['parked', 'claude-opus-4-1', 0, false]]
    tower.on('snapshot', data => {
      const now = Date.now(), m = (now - T0) / 60_000
      for (const [id, model, rate, big] of fake) data.sessions.push({
        id: 'demo-garage-' + id, title: `${pretty(model)} demo`, cwd: '/tmp/demo', branch: 'demo/garage', worktree: null, running: true, endedAt: null,
        state: rate ? 'tool' : 'idle', tool: rate ? 'Read' : null, detail: null, lastActivity: now, agents: [],
        ext: { 'context-meter': { used: 1000, window: big ? 1_000_000 : 200_000, pct: 0.1, model }, 'cost-jar': { usdToday: 1, tokensToday: 0, byModel: { [model]: { family: model, usd: 1, tokens: Math.round(1e6 + rate * m), messages: 10 } } } },
      })
    })
  }
}
