// skyline-towers: the other repos the live sessions work in (snap.skyline, server/features/skyline-towers.mjs) stand as
// dim distant towers behind the street, a rooftop sign with the repo's name on each, one lit window per session working
// there (blinking while it works). Hover for the repo and its sessions, click to open one. ?demo=skylinetowers invents six.
import { BW, SHAFT, STREET_L } from '../building.js'

const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const MAX = 6, PAR = 0.35, MID = (BW + SHAFT) / 2
const SLOTS = [STREET_L - 130, BW + SHAFT + 100, STREET_L - 330, BW + SHAFT + 300, STREET_L - 520, BW + SHAFT + 490]
const BUSY = new Set(['tool', 'thinking', 'delegating', 'building'])
const INK = {
  classic: { body: '#7b8cab', side: '#6a7a98', trim: '#8d9dba', win: '#6c7c9a', lit: '#ffe39a', blink: '#fff6cf', board: '#3a3f52', face: '#d8dce6', leg: '#4a5064' },
  cyberpunk: { body: '#262444', side: '#1c1a36', trim: '#3a2f5a', win: '#2c2a4c', lit: '#7af0ff', blink: '#ff7ad8', board: '#14121e', face: '#ff3fb4', leg: '#2a2838' },
  synthwave: { body: '#3a1a52', side: '#2a103e', trim: '#ff3fb4', win: '#4a2462', lit: '#ff9a5a', blink: '#3ae0ff', board: '#14081e', face: '#ff9af0', leg: '#2a1a3e' },
  'space-station': { body: '#2a303c', side: '#1e222c', trim: '#5a6270', win: '#323a48', lit: '#9ad8ff', blink: '#f0c020', board: '#14161c', face: '#9ad8ff', leg: '#3a404c' },
  underwater: { body: '#2a6a7a', side: '#1e5a6a', trim: '#3a8090', win: '#246070', lit: '#bff4ff', blink: '#ffffff', board: '#1a3a44', face: '#bff4ff', leg: '#24525c' },
  steampunk: { body: '#8a7458', side: '#6a5a44', trim: '#c8963a', win: '#7a6650', lit: '#ffd890', blink: '#fff0c0', board: '#3a2a1a', face: '#e8c88a', leg: '#4a3020' },
  candy: { body: '#e0b0d0', side: '#c898b8', trim: '#fff4fa', win: '#d0a0c0', lit: '#fff4fa', blink: '#ff7ab0', board: '#8a5a7a', face: '#fff4fa', leg: '#a87a9a' },
}
const FAKE = [['acme/rocket-docs'], ['globex/data-lake'], ['initech/pixel-kit'], ['acme/edge-proxy'], ['umbrella/notebooks'], ['acme/infra-live']]

export default function init(api, tower) {
  const { font, fitText } = tower
  const demo = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('skylinetowers')
  let towers = [], key = ''

  if (demo) tower.on('snapshot', data => {
    const ids = data.sessions.map(s => s.id)
    data.skyline = { main: data.street?.repo || null, repos: FAKE.map(([full], i) => ({ full, name: full.split('/').pop(), sessions: ids.length ? ids.filter((_, k) => k % FAKE.length === i || (i === 0 && k < 3)).slice(0, 4) : [] })) }
  })
  tower.on('sync', data => {
    const repos = (data.skyline?.repos || []).filter(r => r.sessions?.length).slice(0, MAX)
    const k = repos.map(r => r.full + ':' + r.sessions.join(',')).join('|')
    if (k === key) return
    key = k
    towers = repos.map((r, i) => {
      const h = api.hash(r.full), w = 40 + h % 4 * 6, ht = 230 + (h >>> 4) % 150 + r.sessions.length * 10
      const cols = Math.floor((w - 8) / 7), rows = Math.floor((ht - 30) / 9), used = new Set()
      const lit = r.sessions.map((id, j) => {
        let s = api.hash(id + r.full), cell
        do { cell = { col: s % cols, row: 2 + (s >>> 5) % Math.min(rows - 3, 14) }; s = api.hash(String(s)) } while (used.has(cell.col + ':' + cell.row) && used.size < cols * rows)
        used.add(cell.col + ':' + cell.row)
        return { id, ...cell, phase: (api.hash(id) % 1000) / 1000 }
      })
      return { r, slot: SLOTS[i], w, h: ht, cols, rows, lit, seed: h, sign: Math.max(30, Math.min(w + 14, r.name.length * 4 + 8)) }
    })
  })

  const xOf = t => Math.round(t.slot + (tower.cam.cx - MID) * PAR)
  const sessionOf = id => tower.snapshot?.sessions.find(s => s.id === id) || null
  const winAt = (t, x0, l) => ({ x: x0 + 4 + l.col * 7 + Math.floor((t.w - 8 - t.cols * 7) / 2), y: -t.h + 16 + l.row * 9 })
  const signRect = (t, x0) => ({ x: x0 + t.w / 2 - t.sign / 2, y: -t.h - 17, w: t.sign, h: 10 })
  const ink = () => INK[api.theme?.skin] || INK.classic

  function draw(c, v, now) {
    const k = ink()
    for (const t of towers) {
      const x0 = xOf(t), top = -t.h
      if (x0 > v.x1 || x0 + t.w + 20 < v.x0) continue
      R(c, k.body, x0, top, t.w, t.h); R(c, k.side, x0 + t.w - 5, top, 5, t.h); R(c, k.trim, x0 - 1, top - 2, t.w + 2, 3)
      if (t.seed % 3 === 0) { R(c, k.trim, x0 + 6, top - 10, t.w - 12, 8); R(c, k.side, x0 + 6, top - 3, t.w - 12, 1) }
      if (t.seed % 2) { R(c, k.leg, x0 + t.w - 10, top - 34, 1, 32); R(c, Math.floor(now / 900 + t.seed) % 2 ? '#ff5a5a' : '#5a2a2a', x0 + t.w - 10, top - 35, 1, 1) }
      for (let row = 0; row < t.rows; row++) for (let col = 0; col < t.cols; col++) {
        const w = winAt(t, x0, { col, row }); if (w.y > -4) continue
        R(c, k.win, w.x, w.y, 3, 4)
      }
      for (const l of t.lit) {
        const s = sessionOf(l.id), w = winAt(t, x0, l), busy = s && BUSY.has(s.state)
        const on = !busy || ((now / 700 + l.phase) % 1) < 0.72
        R(c, on ? (busy ? k.blink : k.lit) : k.win, w.x, w.y, 3, 4)
      }
      const b = signRect(t, x0)
      R(c, k.leg, b.x + 3, b.y + b.h, 1, top - b.y - b.h); R(c, k.leg, b.x + b.w - 4, b.y + b.h, 1, top - b.y - b.h)
      R(c, k.leg, b.x - 1, b.y - 1, b.w + 2, b.h + 2); R(c, k.board, b.x, b.y, b.w, b.h)
      if (tower.zoom * b.w < 40) for (let i = 0; i < Math.min(t.r.name.length, (b.w - 6) / 3); i++) R(c, k.face, b.x + 3 + i * 3, b.y + 4, 2, 2)   // far away: a blur of letters
    }
  }
  // the sign is visible unless the tower or a street building stands in front of it
  const hidden = (x, y) => (x >= -6 && x <= BW + SHAFT + 14 && y >= (tower.bounds?.y0 ?? -1e9)) || !!tower.city.buildingAt(x, y)
  tower.city.backdrop.push(draw)
  // at night the lit windows shine through the tint, unless something nearer stands in front of them
  tower.on('glow', (c, now, n) => {
    if (n < 0.05) return
    const k = ink()
    for (const t of towers) {
      const x0 = xOf(t)
      for (const l of t.lit) {
        const s = sessionOf(l.id), w = winAt(t, x0, l), busy = s && BUSY.has(s.state)
        if (busy && ((now / 700 + l.phase) % 1) >= 0.72 || hidden(w.x, w.y) || hidden(w.x + 3, w.y + 4)) continue
        c.globalAlpha = n * 0.85; R(c, busy ? k.blink : k.lit, w.x, w.y, 3, 4)
        c.globalAlpha = n * 0.35; R(c, busy ? k.blink : k.lit, w.x - 1, w.y - 1, 5, 6)
      }
    }
    c.globalAlpha = 1
  })

  tower.on('overlay', c => {
    const z = tower.zoom, k = ink()
    for (const t of towers) {
      const b = signRect(t, xOf(t))
      if (b.w * z < 40 || hidden(b.x, b.y + 2) || hidden(b.x + b.w, b.y + 2)) continue
      const p = tower.worldToScreen(b.x + b.w / 2, b.y + b.h / 2)
      if (p.x < -100 || p.x > c.canvas.width || p.y < -20) continue
      const fs = Math.min(13, Math.max(7, b.h * z * 0.7)), f = font(fs, 700)
      c.font = f; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillStyle = k.face
      c.fillText(fitText(t.r.name, b.w * z - 6, f), p.x, p.y + 0.5)
    }
    c.textAlign = 'left'; c.textBaseline = 'alphabetic'
  })

  function hit(w) {
    for (const t of towers) {
      const x0 = xOf(t), b = signRect(t, x0)
      const inBody = w.x >= x0 && w.x < x0 + t.w && w.y >= -t.h && w.y <= 0, inSign = w.x >= b.x - 1 && w.x <= b.x + b.w + 1 && w.y >= b.y - 1 && w.y <= -t.h
      if ((inBody || inSign) && !hidden(w.x, w.y)) {
        const near = t.lit.map(l => ({ l, d: Math.hypot(winAt(t, x0, l).x + 1.5 - w.x, winAt(t, x0, l).y + 2 - w.y) })).sort((a, b) => a.d - b.d)[0]
        return { t, near: near && near.d < 5 ? near.l.id : null }
      }
    }
    return null
  }
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    const rows = h.t.lit.map(l => { const s = sessionOf(l.id); return s ? `<div${l.id === h.near ? ' style="font-weight:700"' : ''}><span style="color:${api.COLORS?.[s.state] || '#aaa'}">●</span> ${api.esc(s.title)} <span class="m">${api.esc(s.state)}</span></div>` : '' }).join('')
    return `<div class="t">🏙 ${api.esc(h.t.r.full)}</div>${rows}<div class="m">another repo a live session works in · click to open ${h.near ? 'it' : 'the first'}</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h) return false
    const s = sessionOf(h.near) || h.t.lit.map(l => sessionOf(l.id)).find(Boolean)
    if (s) tower.focusSession(s)
    return true
  })
}
