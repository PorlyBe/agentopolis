// printer-jam: a foreground tool call (server ext 'printer-jam') silent for over 3 minutes while its Claude still runs
// is a paper jam: the copier in the floor's right corner blinks red, the stuck character stands at it kicking, a pill
// counts up ('jammed 6m'). Hover or click the copier for the stuck command; it clears with a paper flutter when the
// result lands. One kicker per floor (the longest stuck), the rest are counted on the pill. ?demo=printerjam fakes one.
import { IX } from '../building.js'

const CX = IX + 426, CW = 18, JAM_MS = 3 * 60_000, PLAN_MS = 1000, FLUTTER_MS = 2400
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const mins = ms => { const m = Math.max(0, Math.floor(ms / 60000)); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('printerjam')
  let jams = new Map()          // floor id -> { s, who, j, more }
  const sent = new Map()        // person id -> floor id
  const flutters = new Map()    // floor id -> { at, sheets }
  const open = new Set()        // floor ids whose command card is shown
  let planAt = 0, pills = []

  function stuck(s, now) {
    if (!s.running || s.state === 'attention') return []
    const out = [], j = s.ext?.['printer-jam']
    const busy = (s.agents || []).some(a => a.state !== 'done')
    if (j && now - j.mtime > JAM_MS && !((j.tool === 'Agent' || j.tool === 'Task') && busy)) out.push({ who: s.id, j })
    for (const a of s.agents || []) { const g = a.ext?.['printer-jam']; if (g && a.state !== 'done' && now - g.mtime > JAM_MS) out.push({ who: a.id, j: g }) }
    return out
  }

  function plan() {
    const snap = tower.snapshot; if (!snap) return
    const now = Date.now(), next = new Map()
    for (const s of snap.sessions) {
      const f = tower.floorOf(s.id); if (!f || f.kind !== 'session') continue
      const list = stuck(s, now).sort((a, b) => a.j.at - b.j.at)
      if (list.length) next.set(f.id, { s, ...list[0], more: list.length - 1 })
    }
    for (const id of jams.keys()) if (!next.has(id) && tower.floor(id)) flutters.set(id, { at: performance.now(), sheets: Array.from({ length: 8 }, (_, i) => ({ vx: (Math.random() - 0.3) * 26, vy: -30 - Math.random() * 26, ph: Math.random() * 6, d: i * 70 })) })
    jams = next
    for (const id of open) if (!jams.has(id)) open.delete(id)
    const kick = new Map([...jams].map(([fid, q]) => [q.who, fid]))
    for (const [id, fid] of [...sent]) if (kick.get(id) !== fid) { const p = tower.person(id); if (p?.activity === 'printerjam') tower.release(id); sent.delete(id) }
    if (api.live === false) return
    for (const [id, fid] of kick) {
      if (sent.get(id) === fid) continue
      const p = tower.person(id); if (!p || p.leaving || (p.steered && !sent.has(id))) continue
      if (tower.sendTo(id, fid, CX - 7, { face: 'right', pose: 'stand', activity: 'printerjam' })) sent.set(id, fid)
    }
  }
  tower.on('step', (dt, now) => { if (now - planAt > PLAN_MS) { planAt = now; plan() } })
  tower.on('sync', () => { planAt = 0 })
  const kicker = fid => { const q = jams.get(fid), p = q && tower.person(q.who); return p && p.floor === fid && !p.walking && p.activity === 'printerjam' ? p : null }

  // ---------- the copier ----------
  function copier(c, x, y, jam, now, kicking) {
    const kickT = (now % 900) / 900, shake = kicking && kickT > 0.12 && kickT < 0.3 ? 1 : 0
    x += shake
    R(c, 'rgba(0,0,0,.18)', x - 1, y - 2, CW + 6, 2)
    R(c, '#b3b7b0', x, y - 14, CW, 14); R(c, '#8d918b', x, y - 1, CW, 1); R(c, '#c9ccc5', x, y - 14, CW, 1)
    R(c, '#9a9e97', x + 2, y - 10, CW - 4, 1); R(c, '#9a9e97', x + 2, y - 6, CW - 4, 1); R(c, '#6c7069', x + 8, y - 12, 3, 1); R(c, '#6c7069', x + 8, y - 8, 3, 1)
    R(c, '#e3e5df', x - 1, y - 22, CW + 2, 8); R(c, '#c4c7c0', x - 1, y - 15, CW + 2, 1)
    R(c, '#4e535c', x, y - 24, CW - 1, 2); R(c, '#6a707a', x, y - 24, CW - 1, 1)
    R(c, '#cfd2cb', x + CW + 1, y - 18, 4, 1); R(c, '#f7f5ee', x + CW + 1, y - 19, 3, 1)
    R(c, '#2c3038', x + 10, y - 21, 6, 3)
    const blink = Math.floor(now / 350) % 2
    R(c, jam ? (blink ? '#ff4a3a' : '#7a1d16') : '#5fd17a', x + 14, y - 20, 1, 1); R(c, '#9fd2ff', x + 11, y - 20, 2, 1)
    if (!jam) return
    // crumpled sheets stuck in the feed and the side door, a jam light, a wisp of smoke
    R(c, '#f7f5ee', x + 3, y - 27, 6, 3); R(c, '#d8d4c6', x + 4, y - 28, 2, 1); R(c, '#d8d4c6', x + 7, y - 26, 2, 1); R(c, '#ffffff', x + 5, y - 29, 3, 1)
    R(c, '#f7f5ee', x + CW, y - 13, 3, 4); R(c, '#d8d4c6', x + CW + 2, y - 12, 2, 2)
    R(c, blink ? '#ff4a3a' : '#a8322a', x + 2, y - 21, 3, 2)
    for (let i = 0; i < 3; i++) {
      const t = ((now / 1800) + i / 3) % 1, a = 0.45 * (1 - t)
      R(c, `rgba(120,120,128,${a.toFixed(2)})`, x + 6 + Math.sin(t * 6 + i) * 2, y - 30 - t * 14, 2 + Math.round(t * 2), 2 + Math.round(t * 2))
    }
  }
  function kick(c, p, now) {
    const t = (now % 900) / 900
    if (t < 0.32) {
      const ext = t < 0.12 ? 2 : t < 0.22 ? 5 : 3
      R(c, '#343a4a', p.x + 1, p.y - 8, ext + 1, 2); R(c, '#1b1c22', p.x + 1 + ext, p.y - 9, 2, 3)
      if (t > 0.12 && t < 0.3) { const sx = CX - 1, sy = p.y - 9; R(c, '#ffd84a', sx, sy - 2, 1, 5); R(c, '#ffd84a', sx - 2, sy, 5, 1); R(c, '#fff3b0', sx, sy, 1, 1) }
    }
    if (Math.floor(now / 1800) % 2) { R(c, '#c8382a', p.x - 1, p.y - 40, 1, 4); R(c, '#c8382a', p.x - 1, p.y - 35, 1, 1); R(c, '#c8382a', p.x + 2, p.y - 39, 1, 3); R(c, '#c8382a', p.x + 2, p.y - 35, 1, 1) }
  }
  tower.on('items', (out, now) => {
    for (const f of tower.floors) {
      if (f.kind !== 'session') continue
      const jam = jams.has(f.id), fl = flutters.get(f.id)
      const p = jam && kicker(f.id)
      out.push({ z: Z.FLOOR + 6, draw: c => copier(c, CX, f.y, jam, now, !!p) })
      if (p) out.push({ z: Z.STAND + 2, draw: c => kick(c, p, now) })
      if (fl) {
        const t = now - fl.at
        if (t > FLUTTER_MS + 600) { flutters.delete(f.id); continue }
        out.push({ z: Z.FRONT + 4, draw: c => {
          for (const s of fl.sheets) {
            const u = Math.max(0, t - s.d) / 1000; if (u <= 0 || u > FLUTTER_MS / 1000) continue
            const x = CX + 9 + s.vx * u + Math.sin(u * 7 + s.ph) * 3, y = Math.min(f.y - 1, f.y - 24 + s.vy * u + 22 * u * u)
            const flip = Math.floor(u * 8 + s.ph) % 2
            R(c, '#fbfaf4', x, y, flip ? 3 : 2, flip ? 2 : 3); R(c, '#d8d4c6', x, y + (flip ? 1 : 2), flip ? 3 : 2, 1)
          }
        } })
      }
    }
  })
  tower.on('glow', (c, now, n) => {
    for (const f of tower.floors) {
      if (f.kind !== 'session') continue
      const jam = jams.has(f.id), on = !jam || Math.floor(now / 350) % 2
      if (!on) continue
      c.fillStyle = jam ? `rgba(255,74,58,${0.5 * n})` : `rgba(95,209,122,${0.25 * n})`
      c.beginPath(); c.arc(CX + 14.5, f.y - 19.5, jam ? 6 : 3, 0, Math.PI * 2); c.fill()
    }
  })

  // ---------- the timer pill and the command card ----------
  function wrap(c, text, max, lines) {
    const out = []; let cur = ''
    for (const w of text.split(/\s+/)) {
      const t = cur ? cur + ' ' + w : w
      if (!cur || c.measureText(t).width <= max) cur = t
      else { out.push(cur); cur = w }
      if (out.length >= lines) break
    }
    if (cur && out.length < lines) out.push(cur)
    if (out.length === lines) out[lines - 1] = fitText(out[lines - 1] + (text.length > out.join(' ').length ? '…' : ''), max, c.font)
    return out
  }
  tower.on('overlay', c => {
    pills = []
    if (!jams.size) return
    const k = tower.zoom, H = tower.canvas.clientHeight, now = Date.now()
    c.save(); c.textBaseline = 'middle'
    for (const [fid, q] of jams) {
      const f = tower.floor(fid); if (!f) continue
      const a = tower.worldToScreen(CX + CW / 2, f.y - 32)
      if (a.y < -40 || a.y > H + 40) continue
      const fs = Math.round(Math.max(9, Math.min(13, 3.4 * k))), t = `⚠ jammed ${mins(now - q.j.mtime)}${q.more ? ` +${q.more}` : ''}`
      c.font = font(fs, 700)
      const w = Math.round(c.measureText(t).width + 12), h = fs + 7, x = Math.round(a.x - w / 2), y = Math.round(a.y - h)
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x + 1, y + 2, w, h, h / 2); c.fill()
      c.fillStyle = Math.floor(now / 700) % 2 ? '#c8382a' : '#a8322a'; c.beginPath(); c.roundRect(x, y, w, h, h / 2); c.fill()
      c.fillStyle = '#fff4ef'; c.fillText(t, x + 6, y + h / 2 + 0.5)
      pills.push({ fid, x, y, w, h })
      if (!open.has(fid)) continue
      const bf = Math.round(Math.max(11, Math.min(14, 3.8 * k))), mono = `${bf}px ui-monospace, SFMono-Regular, Menlo, monospace`, max = Math.min(360, Math.max(200, 90 * k))
      c.font = mono
      const body = wrap(c, q.j.text || '(no command)', max, 5), head = `STUCK · ${q.j.tool} · ${String(q.s.title).toUpperCase()}`
      const sub = q.j.description ? fitText(q.j.description, max, font(bf - 1)) : null
      c.font = font(bf - 2, 700)
      const cw = Math.round(Math.max(Math.min(max, c.measureText(head).width), ...body.map(l => { c.font = mono; return c.measureText(l).width })) + 22)
      const lh = bf + 4, ch = (body.length + 1 + (sub ? 1 : 0)) * lh + 12
      const cx = Math.max(4, Math.min(tower.canvas.clientWidth - cw - 4, Math.round(a.x - cw + 30))), cy = y - ch - 8
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(cx + 2, cy + 3, cw, ch, 7); c.fill()
      c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(cx, cy, cw, ch, 7); c.fill()
      c.beginPath(); c.moveTo(a.x - 5, cy + ch - 1); c.lineTo(a.x, cy + ch + 6); c.lineTo(a.x + 5, cy + ch - 1); c.fill()
      c.fillStyle = '#c8382a'; c.fillRect(cx, cy + 5, 3, ch - 10)
      c.font = font(bf - 2, 700); c.fillStyle = '#a8322a'; c.fillText(fitText(head, cw - 22, c.font), cx + 11, cy + 6 + lh / 2)
      let row = 1
      if (sub) { c.font = font(bf - 1); c.fillStyle = '#6e5038'; c.fillText(sub, cx + 11, cy + 6 + (row++ + 0.5) * lh) }
      c.font = mono; c.fillStyle = '#1b1c26'
      for (const l of body) c.fillText(l, cx + 11, cy + 6 + (row++ + 0.5) * lh)
      pills.push({ fid, x: cx, y: cy, w: cw, h: ch })
    }
    c.restore()
  })

  // ---------- hover / click ----------
  function hit(w, person, m) {
    for (let i = pills.length - 1; i >= 0; i--) { const b = pills[i]; if (m.sx >= b.x && m.sx <= b.x + b.w && m.sy >= b.y && m.sy <= b.y + b.h) return b.fid }
    if (person && sent.has(person.id) && jams.get(sent.get(person.id))?.who === person.id) return sent.get(person.id)
    for (const fid of jams.keys()) { const f = tower.floor(fid); if (f && w.x >= CX - 2 && w.x <= CX + CW + 5 && w.y >= f.y - 30 && w.y <= f.y) return fid }
    return null
  }
  tower.on('hover', (w, person, m) => {
    const fid = hit(w, person, m); if (!fid) return null
    const q = jams.get(fid)
    return `<div class="t">Paper jam · ${esc(q.s.title)}</div><div class="m">${esc(q.j.tool)} silent for ${mins(Date.now() - q.j.mtime)}${q.who !== q.s.id ? ' · a subagent' : ''}${q.more ? ` · +${q.more} more stuck` : ''}</div>`
      + `<div style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:420px">${esc((q.j.text || '').slice(0, 400))}</div><div class="m">click to ${open.has(fid) ? 'hide' : 'pin'} the command</div>`
  })
  tower.on('click', (w, person, m) => {
    const fid = hit(w, person, m); if (!fid) return false
    if (open.has(fid)) open.delete(fid); else open.add(fid)
    return true
  })

  // ---------- ?demo=printerjam ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => { const f = tower.floorOf(data.sessions[0]?.id); if (f) tower.flyTo({ x: CX - 20, y: f.y - 30 }, Number(params.get('pjzoom')) || 3) }, 800) }
    if (!data.sessions.length) data.sessions.push({ id: '00000000-0000-4000-8000-000000000031', title: 'WEB CI', cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'tool', tool: 'Bash', detail: null, lastActivity: now, agents: [], ext: {} })
    const s = data.sessions[0], t = (now - t0) % 40000
    s.running = true; s.agents = []; delete s.attention
    s.ext = { ...s.ext }
    if (t < 30000) { s.state = 'tool'; s.ext['printer-jam'] = { id: 'toolu_demo', tool: 'Bash', text: 'cd api-server && cargo build --release --features e2e 2>&1 | tail -40', description: 'Build the release binary with e2e features', at: t0 - 6 * 60000, mtime: t0 - 6 * 60000 } }
    else { s.state = 'thinking'; delete s.ext['printer-jam'] }
  })
}
