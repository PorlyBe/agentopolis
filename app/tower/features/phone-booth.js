// phone-booth: a glass phone booth on each session floor, right of the last agent desk (a floor with eight desks has no
// room for it). While a session or agent drives a browser (Chrome / browser MCP tools, or Bash running
// shot.mjs, playwright or headless Chrome; ext['phone-booth'] from server/features/phone-booth.mjs) its character steps
// in, and the booth's screen shows the site's host with a favicon-ish colour square. It leaves once the browser has been
// quiet for a minute. One caller per booth. ?demo=phonebooth fakes it on the first two floors.
import { IX } from '../building.js'

const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const BW = 20, BH = 46, QUIET = 60_000, GIVE_UP = 45_000
const TOOL = /^mcp__(claude-in-chrome|Claude_Browser|playwright|puppeteer|chrome|browser)[^_]*__|browser/i
const CMD = /tools\/shot\.mjs|\bplaywright\b|--headless\b|headless[-_ ]?chrom/i

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('phonebooth')
  const who = new Map()     // person id -> { sid, live, host, tool, alive }
  const booths = new Map()  // floor id -> { id (occupant), phase 'walk'|'in', t }

  function track(id, sid, o) {
    const b = o.ext?.['phone-booth']
    const now = o.state === 'tool' && (TOOL.test(o.tool || '') || o.tool === 'Bash' && CMD.test(o.detail || ''))
    const live = now || (b && Date.now() - b.at < QUIET)
    let w = who.get(id); if (!w) who.set(id, w = {})
    Object.assign(w, { sid, live: !!live, host: b?.host || w.host || null, tool: b?.tool || null, alive: true, open: o.state !== 'done' })
  }
  tower.on('sync', data => {
    for (const w of who.values()) w.alive = false
    for (const s of data.sessions) { track(s.id, s.id, s); for (const g of s.agents) track(g.id, s.id, g) }
    for (const [id, w] of who) if (!w.alive) who.delete(id)
  })

  const hasBooth = f => f && f.kind === 'session' && f.desks < 8
  const bx = f => IX + (f.desks <= 5 ? 318 : f.desks === 6 ? 360 : 400)
  const free = (fid, b) => { if (b?.id && tower.person(b.id)?.activity === 'phone-booth') tower.release(b.id); booths.delete(fid) }

  tower.on('step', () => {
    const now = performance.now()
    for (const [fid, b] of booths) {
      const w = who.get(b.id), p = tower.person(b.id), f = tower.floor(fid)
      if (!w || !p || !hasBooth(f) || !w.live || !w.open) { free(fid, b); continue }
      if (p.steered && p.activity && p.activity !== 'phone-booth') { booths.delete(fid); continue }
      if (b.phase === 'walk' && now - b.t > GIVE_UP) free(fid, b)
    }
    for (const [id, w] of who) {
      if (!w.live || !w.open || booths.get(w.sid)) continue
      const f = tower.floor(w.sid), p = tower.person(id)
      if (!hasBooth(f) || f.open != null || !p || p.leaving || p.steered || !p.atDesk || p.floor !== w.sid) continue
      const b = { id, phase: 'walk', t: now }
      if (tower.sendTo(id, w.sid, bx(f) + BW / 2, { face: 'up', pose: 'stand', anim: 'type', activity: 'phone-booth', then: () => { b.phase = 'in' } })) booths.set(w.sid, b)
    }
  })

  // ---------- drawing ----------
  const hue = h => api.hash(h || '?') % 360
  function back(c, f, b, now) {
    const BX = bx(f), y = f.y, top = y - BH, w = b && who.get(b.id), on = b?.phase === 'in' && w
    R(c, '#2a2f3a', BX, top, BW, BH); R(c, '#3e4a5a', BX + 2, top + 5, BW - 4, BH - 7)
    R(c, '#1b1f28', BX - 1, top - 3, BW + 2, 4); R(c, on ? `hsl(${f.hue} 60% 62%)` : '#4a5260', BX + 2, top - 2, BW - 4, 2)
    R(c, '#1b2230', BX + 3, top + 3, BW - 6, 10)
    if (on) {
      R(c, '#eef3f8', BX + 4, top + 4, BW - 8, 8); R(c, '#c8d2de', BX + 4, top + 4, BW - 8, 1)
      R(c, `hsl(${hue(w.host)} 70% 50%)`, BX + 5, top + 6, 3, 3)
      c.fillStyle = '#8a96a6'; c.fillRect(BX + 9, top + 6, 5, 1); c.fillRect(BX + 9, top + 8, 3, 1)
      if (Math.floor(now / 400) % 2) R(c, '#5a9ad8', BX + 5, top + 10, 1 + Math.floor(now / 400) % 9, 1)
    }
    R(c, '#5a6270', BX + 3, top + 15, BW - 6, 1)
    R(c, '#1b1c22', BX + BW - 5, top + 18, 2, 6); R(c, '#1b1c22', BX + BW - 6, top + 18, 4, 1)
    R(c, '#5a6270', BX, y - 2, BW, 2)
  }
  function front(c, f) {
    const BX = bx(f), y = f.y, top = y - BH
    c.fillStyle = 'rgba(190,225,245,.24)'; c.fillRect(BX + 1, top + 1, BW - 2, BH - 3)
    R(c, '#2a2f3a', BX, top, 1, BH); R(c, '#2a2f3a', BX + BW - 1, top, 1, BH); R(c, '#2a2f3a', BX, top, BW, 1)
    R(c, 'rgba(42,47,58,.85)', BX + 1, y - 16, BW - 2, 1); R(c, '#9aa3ad', BX + BW - 4, y - 28, 1, 5)
    c.fillStyle = 'rgba(255,255,255,.4)'
    for (let i = 0; i < 6; i++) { c.fillRect(BX + 3 + i, top + 30 - i * 2, 1, 2); c.fillRect(BX + 8 + i, top + 38 - i * 2, 1, 1) }
  }
  let boxes = []
  tower.on('items', (out, now) => {
    boxes = []
    for (const f of tower.floors) {
      if (!hasBooth(f) || f.open != null) continue
      const b = booths.get(f.id)
      boxes.push({ f, x: bx(f), y: f.y - BH - 3, w: BW, h: BH + 3 })
      out.push({ z: Z.WALL + 4, draw: c => back(c, f, b, now) })
      out.push({ z: Z.STAND + 8, draw: c => front(c, f) })
    }
  })
  tower.on('glow', (c, now, n) => {
    for (const [fid, b] of booths) {
      const f = tower.floor(fid); if (!hasBooth(f) || b.phase !== 'in') continue
      const x = bx(f) + BW / 2, y = f.y - BH + 8, g = c.createRadialGradient(x, y, 0, x, y, 22)
      g.addColorStop(0, `rgba(170,210,255,${0.6 * n})`); g.addColorStop(1, 'rgba(170,210,255,0)')
      c.fillStyle = g; c.fillRect(x - 22, y - 22, 44, 44)
    }
  })

  function tag(c, sx, sy, text, color, fs) {
    c.font = font(fs); const w = c.measureText(text).width + 12, h = fs + 6, x = Math.round(sx), y = Math.round(sy - h / 2)
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.roundRect(x + 1, y + 2, w, h, 4); c.fill()
    c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill()
    c.fillStyle = color; c.fillRect(x, y + 3, 3, h - 6)
    c.fillStyle = '#1b1c26'; c.textBaseline = 'middle'; c.fillText(text, x + 7, y + h / 2 + 0.5)
  }
  tower.on('overlay', c => {
    const k = tower.zoom; if (k < 1.6) return
    const fs = Math.max(9, Math.min(13, 3.4 * k))
    c.save()
    for (const [fid, b] of booths) {
      const f = tower.floor(fid), w = who.get(b.id); if (!f || !w || b.phase !== 'in') continue
      const a = tower.worldToScreen(bx(f) - 2, f.y - 20), text = fitText('🌐 ' + (w.host || 'browser'), 220, font(fs))
      if (a.y < 0 || a.y > tower.canvas.clientHeight) continue
      c.font = font(fs)
      tag(c, a.x - c.measureText(text).width - 12, a.y, text, `hsl(${hue(w.host)} 70% 50%)`, fs)
    }
    c.restore()
  })
  tower.on('hover', m => {
    for (const x of boxes) if (m.x >= x.x && m.x <= x.x + x.w && m.y >= x.y && m.y <= x.y + x.h) {
      const b = booths.get(x.f.id), w = b && who.get(b.id)
      if (!w) return '<div class="t">Phone booth</div><div>free — a browser session steps in here</div>'
      return `<div class="t">Phone booth · ${esc(x.f.session?.title || 'session')}${b.id !== x.f.id ? ' · agent' : ''}</div><div>${esc(w.host || 'browser')}</div>` + (w.tool ? `<div>${esc(w.tool)}</div>` : '')
    }
    return null
  })

  // ---------- ?demo=phonebooth ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => tower.flyTo(data.sessions[0]?.id || 'lobby', 3), 800) }
    const base = t0 + Math.floor((now - t0) / 130_000) * 130_000, t = now - base
    data.sessions.slice(0, 2).forEach((s, i) => {
      const end = 45_000 + i * 15_000, at = Math.min(now, base + end)
      if (t < 2000 + i * 6000) return
      s.ext = { ...s.ext, 'phone-booth': { at, host: i ? 'localhost:4884' : 'github.com', tool: i ? 'tools/shot.mjs' : 'navigate' } }
      if (t < end) { s.state = 'tool'; s.tool = i ? 'Bash' : 'mcp__claude-in-chrome__navigate'; s.detail = i ? 'node tools/shot.mjs http://localhost:4884/' : 'https://github.com' }
    })
  })
}
