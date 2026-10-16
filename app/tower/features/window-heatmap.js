// window-heatmap: at night the tower's transom windows (a row of panes under every ceiling, lobby to penthouse, right of
// the plaques) become a bar chart of today's tool calls by hour (snap.heatmap from server/features/window-heatmap.mjs):
// 24 columns, each lit from the ground floor up in proportion to that hour's calls, the current hour pulsing. A legend
// "00 06 12 18" sits in the slab under the lobby. Off by day. Hover a pane at night for its hour and count.
// ?demo=windowheatmap forces 22:30 and fake counts.
import { IX, IX1 } from '../building.js'
import { R } from '../draw.js'

const X0 = IX + 196, PITCH = (IX1 - 4 - X0) / 24, CW = 8, CH = 5, DY = 2
const ROWS = new Set(['lobby', 'cafe', 'session', 'meeting', 'ceo'])
const DIGITS = { 0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 6: '111100111101111', 8: '111101111101111' }
const hh = h => String(h).padStart(2, '0')

export default function init(api, tower) {
  const { Z } = tower
  const params = api.params, demo = api.demo('windowheatmap')
  const forceNight = demo && !params.get('time')
  let lastN = 0

  const rows = () => tower.floors.filter(f => ROWS.has(f.kind)).sort((a, b) => b.y - a.y)
  const colX = h => Math.round(X0 + h * PITCH + (PITCH - CW) / 2)
  const hourNow = () => Math.floor(api.daylight?.hourNow?.() ?? new Date().getHours()) % 24
  function hours() {
    const m = tower.snapshot?.heatmap
    if (!m || !Array.isArray(m.hours) || (!demo && m.day !== new Date().setHours(0, 0, 0, 0))) return null
    return m.hours
  }
  const fade = n => Math.max(0, Math.min(1, (n - 0.5) / 0.15))
  function lit(hs, nRows) {
    const max = Math.max(1, ...hs)
    return hs.map(v => v > 0 ? Math.max(1, Math.round(v / max * nRows)) : 0)
  }

  if (forceNight) tower.on('step', () => {
    const d = api.daylight
    if (d && !d.heatmapNight) api.daylight = { ...d, hourNow: () => 22.5, heatmapNight: true }
  })

  tower.on('items', (out, now, ctx) => {
    const k = fade(lastN = ctx.sun.n), hs = hours()
    if (!k || !hs) return
    const fl = rows(), on = lit(hs, fl.length), cur = hourNow(), lobby = tower.floor('lobby')
    out.push({ z: Z.WALL + 1, draw: c => {
      c.globalAlpha = k
      const pulse = 0.55 + 0.45 * Math.sin(now / 260)
      fl.forEach((f, r) => {
        const y = f.top + DY
        for (let h = 0; h < 24; h++) {
          const x = colX(h), isLit = r < on[h]
          R(c, '#2a2f44', x - 1, y - 1, CW + 2, CH + 2)
          if (!isLit) { R(c, '#1c2340', x, y, CW, CH); R(c, '#34406a', x, y, 2, 1); continue }
          const warm = h === cur ? `rgba(255,${200 + Math.round(40 * pulse)},${90 + Math.round(80 * pulse)},1)` : '#ffcf5e'
          R(c, warm, x, y, CW, CH); R(c, '#fff0b8', x, y, CW, 1); R(c, '#e0a63c', x, y + CH - 1, CW, 1)
        }
      })
      c.globalAlpha = 1
    } })
    if (lobby) out.push({ z: Z.TOP + 1, draw: c => { c.globalAlpha = k; legend(c, lobby.y + 1) } })
  })
  function legend(c, y) {
    for (const h of [0, 6, 12, 18]) {
      const t = hh(h)
      let x = colX(h)
      for (const ch of t) {
        const b = DIGITS[ch]
        for (let i = 0; i < 15; i++) if (b[i] === '1') R(c, '#ffe08a', x + i % 3, y + Math.floor(i / 3), 1, 1)
        x += 4
      }
      R(c, '#ffe08a', colX(h) + CW / 2 - 0.5, y - 1, 1, 1)
    }
  }
  tower.on('glow', (c, now, n) => {
    const k = fade(n), hs = hours()
    if (!k || !hs) return
    const fl = rows(), on = lit(hs, fl.length), cur = hourNow()
    fl.forEach((f, r) => {
      for (let h = 0; h < 24; h++) {
        if (r >= on[h]) continue
        const x = colX(h) + CW / 2, y = f.top + DY + CH / 2, a = (h === cur ? 0.35 + 0.25 * Math.sin(now / 260) : 0.28) * k
        const g = c.createRadialGradient(x, y, 0, x, y, 9)
        g.addColorStop(0, `rgba(255,205,110,${a})`); g.addColorStop(1, 'rgba(255,205,110,0)')
        c.fillStyle = g; c.fillRect(x - 9, y - 9, 18, 18)
      }
    })
  })

  tower.on('hover', (w, person) => {
    if (person || fade(lastN) < 0.3) return null
    const hs = hours(); if (!hs) return null
    if (w.x < X0 || w.x >= X0 + 24 * PITCH) return null
    const h = Math.floor((w.x - X0) / PITCH), lobby = tower.floor('lobby')
    const onRow = rows().some(f => w.y >= f.top && w.y <= f.top + DY + CH + 2)
    const onLegend = lobby && w.y >= lobby.y - 1 && w.y <= lobby.y + 7
    if (!onRow && !onLegend) return null
    const total = hs.reduce((a, b) => a + b, 0), peak = hs.indexOf(Math.max(...hs)), cur = hourNow()
    return `<div class="t">🌃 Window heatmap · ${hh(h)}:00–${hh((h + 1) % 24)}:00${h === cur ? ' (now)' : ''}</div>`
      + `<div><b>${hs[h].toLocaleString()}</b> tool call${hs[h] === 1 ? '' : 's'} this hour</div>`
      + `<div class="m">today ${total.toLocaleString()} · busiest ${hh(peak)}:00 (${hs[peak].toLocaleString()}) · every session and agent</div>`
  })

  if (!demo) return
  tower.on('snapshot', data => {
    const cur = forceNight ? 22 : hourNow(), m = Date.now() % 3600_000 / 3600_000
    data.heatmap = { day: new Date().setHours(0, 0, 0, 0), hours: Array.from({ length: 24 }, (_, h) => {
      if (h > cur) return 0
      const v = h < 7 ? (h === 1 ? 14 : 2) : Math.round(30 + 160 * Math.exp(-((h - 11) ** 2) / 5) + 120 * Math.exp(-((h - 16) ** 2) / 4) + 60 * Math.exp(-((h - 21) ** 2) / 2) + (api.hash('wh' + h) % 25))
      return h === cur ? Math.round(v * (0.3 + 0.7 * m)) : v
    }) }
  })
  if (!params.get('towerzoom')) setTimeout(() => tower.fit?.(), 600)
}
