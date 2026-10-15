// floor-decor: a session floor styled by the Look tab's rules (snap.floorRules, app/options.js FLOOR_PRESETS): the first
// rule whose pattern matches the session's title papers the wall above the dado, lays a carpet, and puts a plant set and a
// prop in spots the furniture leaves free. Started by themes.js; the wallpaper goes into the cached layers (building.js
// setFloorStyle), so a rule change rebuilds them.
import { setFloorStyle, IX, IX1, FW } from '../building.js'
import { floorRuleFor } from '../../options.js'

const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const rnd = k => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }
const CARPET = { blue: '#3a5a9a', green: '#3a7a4a', red: '#9a3a3a', grey: '#6a6a72', sand: '#c8b088', purple: '#6a4a9a' }

function paper(c, f, kind) {
  const x0 = IX, y0 = f.top + 2, w = FW, h = f.y - 20 - y0
  if (h <= 0) return
  const fill = (base, fn) => { R(c, base, x0, y0, w, h); c.save(); c.beginPath(); c.rect(x0, y0, w, h); c.clip(); fn(); c.restore() }
  if (kind === 'mint-stripes') fill('#cfe8d8', () => { c.fillStyle = '#b4dcc4'; for (let x = x0; x < x0 + w; x += 8) c.fillRect(x, y0, 3, h) })
  else if (kind === 'blush-dots') fill('#f0d8d6', () => { c.fillStyle = '#d8a8b0'; for (let y = y0 + 2, r = 0; y < y0 + h; y += 6, r++) for (let x = x0 + 2 + (r % 2) * 3; x < x0 + w; x += 6) c.fillRect(x, y, 1, 1) })
  else if (kind === 'brick') fill('#a8664a', () => { c.fillStyle = '#c8957a'; for (let y = y0, r = 0; y < y0 + h; y += 5, r++) { c.fillRect(x0, y, w, 1); for (let x = x0 + (r % 2) * 6; x < x0 + w; x += 12) c.fillRect(x, y, 1, 5) } })
  else if (kind === 'oak-panels') fill('#a87a4e', () => { for (let x = x0; x < x0 + w; x += 16) { R(c, '#8a5e38', x, y0, 1, h); R(c, '#c09060', x + 1, y0, 1, h) } })
  else if (kind === 'navy-grid') fill('#2e3a5a', () => { c.fillStyle = '#3e4c70'; for (let x = x0; x < x0 + w; x += 10) c.fillRect(x, y0, 1, h); for (let y = y0; y < y0 + h; y += 10) c.fillRect(x0, y, w, 1) })
  else if (kind === 'sky') fill('#cfe2f4', () => { for (let i = 0; i < 6; i++) { const x = x0 + rnd(i + f.n) * (w - 30), y = y0 + 4 + rnd(i * 3 + f.n) * Math.max(1, h - 12); R(c, '#eef6fc', x, y, 22, 4); R(c, '#eef6fc', x + 5, y - 3, 10, 3) } })
}
function carpet(c, f, kind) {
  const col = CARPET[kind]; if (!col) return
  R(c, col, IX, f.y - 3, FW, 3); c.fillStyle = 'rgba(255,255,255,.18)'; for (let x = IX; x < IX1; x += 4) c.fillRect(x, f.y - 3, 2, 1)
}
function plant(c, x, y, kind, seed) {
  R(c, '#7a4a2e', x, y - 6, 8, 6); R(c, '#9a603a', x - 1, y - 7, 10, 2)
  if (kind === 'ferns') for (let i = 0; i < 5; i++) { const dx = i * 2 - 4; for (let j = 0; j < 6; j++) R(c, j % 2 ? '#3f8a44' : '#56a04f', x + 3 + dx * j / 4, y - 8 - j * 1.6 + Math.abs(dx) * j / 8, 2, 1) }
  else if (kind === 'cacti') { R(c, '#4a8a4a', x + 3, y - 18, 3, 11); R(c, '#4a8a4a', x, y - 14, 2, 5); R(c, '#4a8a4a', x + 7, y - 16, 2, 6); R(c, '#4a8a4a', x + 1, y - 10, 2, 1); R(c, '#6ab06a', x + 4, y - 17, 1, 9); if (seed % 2) R(c, '#ff6a9a', x + 4, y - 20, 2, 2) }
  else if (kind === 'flowers') { R(c, '#3f7a44', x + 1, y - 13, 6, 6); for (let i = 0; i < 4; i++) R(c, ['#ff6a8a', '#ffd84a', '#c08aff', '#ffffff'][(i + seed) % 4], x + (i % 2) * 5, y - 15 + (i >> 1) * 3, 3, 3) }
  else if (kind === 'bonsai') { R(c, '#5a3a22', x + 3, y - 12, 2, 5); R(c, '#5a3a22', x + 4, y - 13, 3, 1); R(c, '#3f7a44', x - 1, y - 17, 7, 4); R(c, '#56994f', x + 4, y - 16, 6, 3) }
}
// props hang on the wall left of the first lamp, over the first agent desk; the plant stands left of the phone booth
// (roomy floors) or between the session desk's plant and the first agent chair
function wallProp(c, x, y, kind, now, seed) {
  if (kind === 'moodboards') { R(c, '#8a6a40', x, y, 46, 18); R(c, '#c89a62', x + 1, y + 1, 44, 16); for (let i = 0; i < 7; i++) { const px = x + 3 + (i % 4) * 10 + Math.floor(rnd(seed + i) * 3), py = y + 3 + (i >> 2) * 7; R(c, ['#ff8a9a', '#7ad0ff', '#ffe07a', '#9ae0a0', '#d0a0ff', '#ffffff', '#ffb070'][i], px, py, 8, 5); R(c, '#c83a3a', px + 3, py, 1, 1) } }
  else if (kind === 'whiteboards') { R(c, '#8a8f98', x, y, 46, 18); R(c, '#f4f6f8', x + 1, y + 1, 44, 15); R(c, '#2a6ab0', x + 4, y + 4, 18, 1); R(c, '#2a6ab0', x + 4, y + 7, 26, 1); R(c, '#c83a3a', x + 4, y + 10, 12, 1); R(c, '#3a8a4a', x + 30, y + 4, 8, 6); R(c, '#8a8f98', x + 4, y + 17, 38, 1) }
  else if (kind === 'trophies') { R(c, '#6b4a30', x, y + 14, 46, 2); for (let i = 0; i < 3; i++) { const tx = x + 4 + i * 15; R(c, '#c9a25a', tx + 1, y + 4, 7, 5); R(c, '#e8c87a', tx + 2, y + 5, 2, 3); R(c, '#c9a25a', tx + 4, y + 9, 1, 3); R(c, '#8a6a34', tx + 2, y + 12, 5, 2) } }
  else if (kind === 'racks') { R(c, '#2a2f3a', x + 8, y + 2, 30, 14); for (let r = 0; r < 3; r++) { R(c, '#3a4252', x + 9, y + 3 + r * 4, 28, 3); R(c, (Math.floor(now / 400) + r + seed) % 3 ? '#4aff7a' : '#1a5a2a', x + 33, y + 4 + r * 4, 2, 1) } }
  else if (kind === 'bookshelves') { R(c, '#6b4a30', x + 4, y + 2, 38, 14); R(c, '#4e3624', x + 5, y + 8, 36, 1); for (let i = 0; i < 9; i++) R(c, ['#9a3a3a', '#3a5a9a', '#c9a25a', '#3a7a4a', '#6a4a9a'][(i + seed) % 5], x + 6 + i * 4, y + 3 + (i % 2), 3, 5 - (i % 2)) }
}
export default function floorDecor(api, tower) {
  const { Z } = tower
  let rules = [], key = '[]'
  const ruleOf = f => f.kind === 'session' && rules.length ? floorRuleFor(rules, f.session?.title) : null
  setFloorStyle((c, f) => { const r = ruleOf(f); if (r) { paper(c, f, r.wallpaper); carpet(c, f, r.carpet) } })
  tower.on('snapshot', data => {
    const k = JSON.stringify(data.floorRules || [])
    if (k === key) return
    key = k; rules = data.floorRules || []
    if (tower.floor('lobby')) tower.setOpen('lobby', null)   // rebuild the layers with the new wallpaper
  })
  tower.on('items', (out, now) => {
    if (!rules.length) return
    for (const f of tower.floors) {
      const r = ruleOf(f)
      if (!r || f.open != null || (r.plants === 'none' && r.props === 'none')) continue
      out.push({ z: Z.WALL, draw: c => {
        if (r.props !== 'none') wallProp(c, IX + 92, f.top + 24, r.props, now, f.n * 13)
        if (r.plants !== 'none') plant(c, f.desks <= 5 ? IX + 308 : IX + 97, f.y, r.plants, f.n * 13)
      } })
    }
  })
}
