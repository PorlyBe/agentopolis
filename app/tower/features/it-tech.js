// it-tech: an MCP/tool server erroring (server ext 'it-tech') on a session floor calls IT. A technician in a polo comes
// in with a stepladder and a toolbox, sets the ladder up mid-floor, opens the sparking ceiling panel and works there
// until the next clean call to that server; the floor's plaque carries an IT sticker meanwhile. Hover the ladder or the
// sticker for the server, its error and since when. ?demo=ittech fakes an outage that is fixed after a while.
import { IX } from '../building.js'
import { R } from '../draw.js'

const LX = IX + 244, STALE_MS = 60 * 60_000, MIN_WORK = 8000, PLAN_MS = 1000, MAX_TECHS = 3, LADDER = 40
const mins = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 1 ? 'just now' : m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') }

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('ittech')
  let down = new Map()            // floor id -> [outage] (most recent first)
  const techs = new Map()         // floor id -> { npc, phase, t, fixedAt }
  const stickers = new Map()      // floor id -> world rect
  let planAt = 0, sheet = null

  function techSheet() {
    if (sheet) return sheet
    const src = api.charSheet(4, 0); if (!src?.width) return null
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
    const x = cv.getContext('2d'); x.drawImage(src, 0, 0)
    const d = x.getImageData(0, 0, cv.width, cv.height), px = d.data
    const POLO = [[66, 128, 196], [48, 104, 170], [34, 80, 138]], PANTS = [[160, 140, 104], [134, 116, 84], [104, 90, 64]]
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue
      const r = px[i], g = px[i + 1], b = px[i + 2]
      if (r === g && g === b && r >= 0xb0 && r <= 0xf0) { const c = POLO[r >= 0xe8 ? 0 : r >= 0xcc ? 1 : 2]; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2] }
      else if (b > r + 25 && b > g) { const c = PANTS[b > 0x70 ? 0 : b > 0x38 ? 1 : 2]; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2] }
    }
    x.putImageData(d, 0, 0)
    return sheet = cv
  }

  // ---------- data ----------
  function outagesOf(s, now) {
    const out = []
    for (const o of [s, ...(s.agents || [])]) for (const d of o.ext?.['it-tech'] || []) if (now - d.at < STALE_MS) out.push({ ...d, agent: o !== s })
    const best = new Map()
    for (const d of out) if (!best.has(d.server) || best.get(d.server).at < d.at) best.set(d.server, { ...d, since: Math.min(d.since, best.get(d.server)?.since ?? d.since) })
    return [...best.values()].sort((a, b) => b.at - a.at)
  }
  function plan(now) {
    const snap = tower.snapshot; if (!snap) return
    const next = new Map()
    for (const s of snap.sessions) {
      const f = tower.floorOf(s.id); if (!f || f.kind !== 'session') continue
      const list = outagesOf(s, Date.now()); if (list.length) next.set(f.id, list)
    }
    down = next
    for (const [fid, t] of techs) {
      if (t.npc.gone || !tower.floor(fid)) { techs.delete(fid); continue }
      if (!down.has(fid) && !t.fixedAt) t.fixedAt = now
      else if (down.has(fid) && t.phase === 'work') t.fixedAt = 0
    }
    for (const fid of down.keys()) if (!techs.has(fid) && techs.size < MAX_TECHS && api.live !== false) call(fid)
  }
  function call(fid) {
    const t = { phase: 'walk', t: 0, fixedAt: 0 }
    t.npc = tower.spawn({ id: 'it-tech-' + fid, from: 'door', z: Z.STAND + 4, draw: (c, p, now) => drawTech(t, c, p, now) })
    if (!t.npc.go(fid, LX - 6, { face: 'right', then: () => { t.phase = 'setup'; t.t = 0 } })) { t.npc.remove(); return }
    techs.set(fid, t)
  }
  tower.on('step', (dt, now) => {
    if (now - planAt > PLAN_MS) { planAt = now; plan(now) }
    for (const [fid, t] of techs) {
      t.t += dt
      if (t.phase === 'setup' && t.t > 1.4) { t.phase = 'climb'; t.t = 0 }
      else if (t.phase === 'climb' && t.t > 1.2) { t.phase = 'work'; t.t = 0 }
      else if (t.phase === 'work' && t.fixedAt && t.t * 1000 > MIN_WORK) { t.phase = 'down'; t.t = 0 }
      else if (t.phase === 'down' && t.t > 1.2) { t.phase = 'fold'; t.t = 0 }
      else if (t.phase === 'fold' && t.t > 1.2) { t.phase = 'out'; t.npc.leave(() => techs.delete(fid)) }
      if (t.phase === 'work' && !t.fixedAt && !down.has(fid)) t.fixedAt = now
    }
  })
  tower.on('sync', () => { planAt = 0 })

  // ---------- drawing ----------
  const climbK = t => t.phase === 'climb' ? Math.min(1, t.t / 1.2) : t.phase === 'work' ? 1 : t.phase === 'down' ? 1 - Math.min(1, t.t / 1.2) : 0
  const ladderK = t => t.phase === 'setup' ? Math.min(1, t.t / 1.4) : t.phase === 'fold' ? 1 - Math.min(1, t.t / 1.2) : t.phase === 'walk' || t.phase === 'out' ? 0 : 1
  function toolbox(c, x, y, open) {
    R(c, '#b0302a', x, y - 5, 9, 5); R(c, '#d44a3a', x, y - 5, 9, 1); R(c, '#7a1d16', x, y - 1, 9, 1)
    R(c, '#3a3a42', x + 3, y - 7, 3, 1); R(c, '#3a3a42', x + 2, y - 7, 1, 2); R(c, '#3a3a42', x + 6, y - 7, 1, 2)
    if (open) { R(c, '#c0c4cc', x + 1, y - 7, 1, 2); R(c, '#e2b23a', x + 7, y - 8, 1, 3) }
  }
  function drawTech(t, c, p, now) {
    const s = techSheet(); if (!s) return
    let x = p.x, y = p.y, row = 2, flip = p.dir === 'left', frame = 1
    if (p.riding) row = 0
    else if (p.walking) frame = [0, 1, 2, 1][Math.floor(now / 130) % 4]
    else if (t.phase === 'work') { row = 1; flip = false; frame = 3 + Math.floor(now / 200) % 2 }
    else if (t.phase === 'climb' || t.phase === 'down') { row = 1; flip = false; frame = [0, 1, 2, 1][Math.floor(now / 160) % 4] }
    const up = climbK(t)
    if (up > 0) { x = LX + 1; y = p.y - Math.round(up * (LADDER - 6)) }
    // carrying: the folded ladder over the shoulder and the toolbox in hand
    if ((t.phase === 'walk' || t.phase === 'out') && !p.riding) {
      const d = p.dir === 'left' ? -1 : 1, lx = Math.round(x - 14 * d - (d < 0 ? 0 : 0))
      R(c, '#b9bec6', Math.min(lx, lx + 28 * d), y - 20, 28, 2); for (let k = 0; k < 28; k += 5) R(c, '#8a9099', Math.min(lx, lx + 28 * d) + k, y - 20, 1, 2)
      toolbox(c, Math.round(x + 3 * d - 4), y - 8, false)
    }
    const dx = Math.round(x - 8), dy = Math.round(y - 30)
    if (flip) { c.save(); c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(s, frame * 16, row * 32, 16, 32, 0, 0, 16, 32); c.restore() }
    else c.drawImage(s, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
    if (t.phase === 'work') { const a = Math.floor(now / 200) % 2; R(c, '#c0c4cc', x + 3, y - 31 - a, 1, 4); R(c, '#e2b23a', x + 3, y - 27 - a, 1, 2) }  // a screwdriver up in the panel
  }
  function ladder(c, f, k) {
    if (k <= 0) return
    const h = Math.round(LADDER * k), y = f.y, x0 = LX - 6, x1 = LX + 8, top = y - h
    c.strokeStyle = '#a7adb6'; c.lineWidth = 2
    c.beginPath(); c.moveTo(x0, y); c.lineTo(LX + 1, top); c.lineTo(x1, y); c.stroke()
    c.strokeStyle = '#7d838c'; c.lineWidth = 1
    for (let r = 6; r < h - 2; r += 7) { const yy = y - r + 0.5, w = (x1 - x0) * (1 - r / h); c.beginPath(); c.moveTo(LX + 1 - w / 2, yy); c.lineTo(LX + 1 + w / 2, yy); c.stroke() }
    R(c, '#5a6068', LX - 2, top - 1, 6, 2)
  }
  function panel(c, f, open, now, phase) {
    const x = LX - 9, y = f.top
    if (!open) {
      R(c, '#d8d2c4', x, y, 20, 2); R(c, '#9a948a', x, y + 2, 20, 1); R(c, '#9a948a', x, y, 1, 3); R(c, '#9a948a', x + 19, y, 1, 3)
    } else {
      R(c, '#15161b', x, y, 20, 3)
      R(c, '#d8d2c4', x - 1, y + 2, 2, 12); R(c, '#9a948a', x + 1, y + 2, 1, 12)   // the tile, hanging off its hinge
      const sway = Math.round(Math.sin(now / 500))
      R(c, '#c8382a', x + 5, y + 3, 1, 6 + sway); R(c, '#e2b23a', x + 9, y + 3, 1, 8 - sway); R(c, '#3a78c2', x + 13, y + 3, 1, 5); R(c, '#2a2a30', x + 15, y + 3, 1, 9 + sway)
      R(c, '#c0c4cc', x + 9, y + 11 - sway, 1, 1)
    }
    if (phase === 'fixed') return
    // sparks out of the seams (or the cut cable ends once it is open)
    const h = Math.floor(now / 90)
    if (h % 5 < 2) for (let i = 0; i < 4; i++) {
      const k = api.hash('spark' + h + i), sx = x + 3 + (k % 15), sy = y + (open ? 6 + (k >>> 4) % 6 : 2 + (k >>> 4) % 3)
      R(c, i % 2 ? '#fff6b0' : '#ffd23a', sx, sy, 1, 1)
      if (i === 0) R(c, '#fff6b0', sx + ((k >>> 8) % 3) - 1, sy + 1, 1, 1)
    }
  }
  tower.on('items', (out, now) => {
    for (const f of tower.floors) {
      if (f.kind !== 'session') continue
      const t = techs.get(f.id), bad = down.has(f.id)
      if (!t && !bad) continue
      const open = !!t && (t.phase === 'work' || (t.phase === 'climb' && t.t > 0.9) || (t.phase === 'down' && t.t < 0.3))
      const phase = !bad || t?.fixedAt ? 'fixed' : 'down'
      out.push({ z: Z.WALL + 6, draw: c => panel(c, f, open, now, phase) })
      if (t) out.push({ z: Z.STAND + 3, draw: c => { ladder(c, f, ladderK(t)); if (t.phase !== 'walk' && t.phase !== 'out') toolbox(c, LX + 10, f.y, t.phase === 'work') } })
    }
  })
  tower.on('glow', (c, now, n) => {
    for (const fid of down.keys()) {
      const f = tower.floor(fid); if (!f || techs.get(fid)?.fixedAt || Math.floor(now / 90) % 5 >= 2) continue
      const g = c.createRadialGradient(LX + 1, f.top + 5, 0, LX + 1, f.top + 5, 12); g.addColorStop(0, `rgba(255,220,90,${0.6 * Math.max(n, 0.2)})`); g.addColorStop(1, 'rgba(255,220,90,0)')
      c.fillStyle = g; c.fillRect(LX - 12, f.top - 8, 26, 26)
    }
  })

  // ---------- the IT sticker on the plaque ----------
  tower.on('plaque', (c, f, b) => {
    if (!down.has(f.id)) { stickers.delete(f.id); return 0 }
    const fs = b.fs * 0.78, h = b.h - 4 * b.k, y = b.y + (b.h - h) / 2
    c.font = font(fs, 800)
    const w = Math.round(c.measureText('IT').width + fs * 0.9), x = b.right - w - b.k
    c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(-0.08)
    c.fillStyle = '#e8eef6'; c.beginPath(); c.roundRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, 3); c.fill()
    c.fillStyle = '#3a78c2'; c.beginPath(); c.roundRect(-w / 2, -h / 2, w, h, 2.5); c.fill()
    c.fillStyle = '#fff'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('IT', 0, 0.5)
    c.restore()
    const a = tower.screenToWorld(x - 2, y), z = tower.screenToWorld(x + w + 2, y + h)
    stickers.set(f.id, { x: a.x, y: a.y, w: z.x - a.x, h: z.y - a.y })
    return w + 3 * b.k
  })

  // ---------- hover ----------
  function hit(w, person) {
    for (const [fid, r] of stickers) if (down.has(fid) && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h) return fid
    for (const [fid, t] of techs) if (person == null && t.npc && Math.abs(w.x - t.npc.x) < 9 && w.y > t.npc.y - 32 && w.y < t.npc.y + 2) return fid
    for (const f of tower.floors) if ((down.has(f.id) || techs.has(f.id)) && w.x >= LX - 12 && w.x <= LX + 20 && w.y >= f.top && w.y <= f.y) return f.id
    return null
  }
  tower.on('hover', (w, person) => {
    const fid = hit(w, person); if (!fid) return null
    const list = down.get(fid) || [], f = tower.floor(fid), t = techs.get(fid), now = Date.now()
    const what = t?.fixedAt || !list.length ? 'fixed — packing up' : t?.phase === 'work' ? 'in the ceiling, working on it' : 'on the way'
    return `<div class="t">🔧 IT · ${esc(f?.session?.title || 'floor')}</div><div class="m">technician: ${what}</div>`
      + list.map(d => `<div style="margin-top:4px"><b>${esc(d.server)}</b> down since ${esc(new Date(d.since).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))} (${mins(now - d.since)})${d.n > 1 ? ` · ${d.n} failures` : ''}${d.agent ? ' · a subagent' : ''}</div>`
        + `<div class="m">${esc(d.tool)}</div><div style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:420px">${esc(d.text.slice(0, 220))}</div>`).join('')
  })

  // ---------- ?demo=ittech ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => { const f = tower.floorOf(data.sessions[0]?.id); if (f) tower.flyTo({ x: LX, y: f.y - 30 }, Number(params.get('itzoom')) || 3) }, 800) }
    if (!data.sessions.length) data.sessions.push({ id: '00000000-0000-4000-8000-000000000041', title: 'PIXEL QUEST', cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'tool', tool: 'Bash', detail: null, lastActivity: now, agents: [], ext: {} })
    const s = data.sessions[0], t = (now - t0) % 90000
    s.ext = { ...s.ext }
    if (t < 60000) s.ext['it-tech'] = [{ server: 'issue-tracker', tool: 'mcp__issue-tracker__get_issue', text: 'MCP server "issue-tracker" is not connected', since: t0 - 4 * 60000, at: t0 - 60000, n: 3 }]
    else delete s.ext['it-tech']
  })
}
