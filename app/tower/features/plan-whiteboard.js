// plan-whiteboard: a session in plan mode (server ext 'plan-whiteboard') gets a whiteboard on its floor's back wall and,
// while it works, stands at it sketching boxes and arrows. When it calls ExitPlanMode the board flips to the plan's
// first lines and the character waves for sign-off wherever it stands (usually in the user's waiting line). Approved, the
// board shrinks into a framed sheet with a green tick, pinned high on the wall until the next plan. Hover for the plan.
// ?demo=planwhiteboard cycles the first floor through sketching, review and approval.
import { IX } from '../building.js'
import { inR } from '../draw.js'

const BOARD = { dx: IX + 92, dy: -62, w: 48, h: 22 }, POSTER = { dx: IX + 108, dy: -60, w: 16, h: 13 }
const STAND_X = IX + 116, FLIP_MS = 500, PIN_MS = 1400
const INK = ['#2f5fb0', '#2a2a32', '#c0392b']
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))) }
const ease = t => t < 0 ? 0 : t > 1 ? 1 : t * t * (3 - 2 * t)

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('planwhiteboard')
  const seen = new Map()   // floor id -> { state, at (performance.now of the change) }
  const sent = new Set()   // session ids standing at their board

  const planOf = f => f.session?.ext?.['plan-whiteboard'] || null
  const boardRect = f => ({ x: BOARD.dx, y: f.y + BOARD.dy, w: BOARD.w, h: BOARD.h })
  const posterRect = f => ({ x: POSTER.dx, y: f.y + POSTER.dy, w: POSTER.w, h: POSTER.h })

  // ---------- who stands at the board: a plan-mode session that is working, not one waiting on the user ----------
  tower.on('sync', data => {
    const now = performance.now()
    for (const f of tower.floors) {
      if (f.kind !== 'session') continue
      const st = planOf(f)?.state || null, was = seen.get(f.id)
      if (!was) seen.set(f.id, { state: st, at: -1e9 })
      else if (was.state !== st) seen.set(f.id, { state: st, at: now })
    }
    for (const id of seen.keys()) if (!tower.floor(id)) seen.delete(id)
    const want = new Map()
    for (const s of data.sessions) {
      const p = s.ext?.['plan-whiteboard'], f = tower.floorOf(s.id)
      if (!f || s.running === false || !p || (p.state !== 'sketching' && p.state !== 'review')) continue
      if (s.state === 'waiting' || s.state === 'attention' || s.state === 'idle') continue
      want.set(s.id, p.state === 'review' ? 'down' : 'up')
    }
    for (const id of [...sent]) {
      const p = tower.person(id)
      if (!want.has(id) || (p && p.activity !== 'planboard')) { if (p?.activity === 'planboard') tower.release(id); sent.delete(id) }
    }
    for (const [id, face] of want) {
      const p = tower.person(id); if (!p || p.leaving) continue
      if (p.steered && p.activity !== 'planboard') continue
      if (sent.has(id) && p.face === face && !p.walking) continue
      if (sent.has(id) && p.walking) continue
      if (tower.sendTo(id, id, STAND_X, { face, pose: 'stand', anim: face === 'up' ? 'type' : null, activity: 'planboard' })) sent.add(id)
    }
  })

  // ---------- world ----------
  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    for (const f of tower.floors) {
      if (f.kind !== 'session' || f.y < v.y0 - 10 || f.top > v.y1 + 10) continue
      const p = planOf(f); if (!p) continue
      const ch = seen.get(f.id) || { at: -1e9 }
      if (p.state === 'approved' && now - ch.at >= PIN_MS) out.push({ z: Z.WALL + 3, draw: c => drawPoster(c, posterRect(f), p, 1) })
      if (p.state === 'sketching' || p.state === 'review') out.push({ z: Z.WALL + 4, draw: c => drawBoard(c, f, p, ch, now) })
      else if (p.state === 'approved' && now - ch.at < PIN_MS) out.push({ z: Z.WALL + 5, draw: c => pinning(c, f, p, (now - ch.at) / PIN_MS) })
      if (p.state === 'review') {
        const who = tower.person(f.session.id)
        if (who && who.floor && !who.walking) out.push({ z: (who.seated ? Z.SEATED : Z.STAND) + 2, draw: c => wave(c, who, now) })
      }
    }
  })

  function frame(c, b) {
    R(c, 'rgba(0,0,0,.18)', b.x + 2, b.y + 2, b.w, b.h)
    R(c, '#8a929c', b.x - 1, b.y - 1, b.w + 2, b.h + 2); R(c, '#c3cad2', b.x - 1, b.y - 1, b.w + 2, 1)
  }
  function drawBoard(c, f, p, ch, now) {
    const b = boardRect(f), flipT = p.state === 'review' ? (now - ch.at) / FLIP_MS : 1
    if (p.state === 'review' && flipT < 1) {
      const k = Math.abs(Math.cos(flipT * Math.PI)), w = Math.max(1, b.w * k), x = b.x + (b.w - w) / 2
      frame(c, { ...b, x, w }); R(c, flipT < 0.5 ? '#f4f6f8' : '#f3ecd8', x, b.y, w, b.h)
    } else {
      frame(c, b)
      if (p.state === 'review') back(c, b, p, now); else sketch(c, b, f, p, now)
    }
    R(c, '#6a727c', b.x + 4, b.y + b.h + 1, b.w - 8, 1)
    R(c, INK[0], b.x + 8, b.y + b.h, 3, 1); R(c, INK[2], b.x + 13, b.y + b.h, 3, 1); R(c, '#e8e4dc', b.x + b.w - 12, b.y + b.h - 1, 4, 2)
  }
  // boxes and arrows drawn one stroke at a time, wiped and started again
  function sketch(c, b, f, p, now) {
    R(c, '#f4f6f8', b.x, b.y, b.w, b.h); R(c, 'rgba(255,255,255,.7)', b.x + 1, b.y + 1, b.w - 2, 1)
    const h = api.hash(f.id), n = 4 + h % 2, boxes = []
    for (let i = 0; i < n; i++) {
      const col = i % 3, row = (i + (h >> 3)) % 2
      boxes.push({ x: b.x + 3 + col * 15 + ((h >> (i + 2)) % 3), y: b.y + 3 + row * 10, w: 9 + (h >> i) % 3, h: 6 })
    }
    const steps = n * 2, t = Math.floor(now / 650 + (h % 7)) % (steps + 4)
    let k = 0
    for (let i = 0; i < n && k < t; i++, k++) {
      const q = boxes[i], ink = INK[(i + h) % 3]
      R(c, ink, q.x, q.y, q.w, 1); R(c, ink, q.x, q.y + q.h, q.w + 1, 1); R(c, ink, q.x, q.y, 1, q.h); R(c, ink, q.x + q.w, q.y, 1, q.h)
      R(c, '#9aa4b0', q.x + 2, q.y + 3, q.w - 4, 1)
      if (i + 1 < n && ++k < t) {
        const r = boxes[i + 1], ax = q.x + q.w + 1, ay = q.y + 3, bx = r.x - 1, by = r.y + 3
        if (Math.abs(ay - by) < 2) { R(c, INK[1], ax, ay, Math.max(1, bx - ax), 1); R(c, INK[1], bx - 2, ay - 1, 1, 3) }
        else { const mx = Math.round((ax + bx) / 2); R(c, INK[1], ax, ay, Math.max(1, mx - ax), 1); R(c, INK[1], mx, Math.min(ay, by), 1, Math.abs(by - ay)); R(c, INK[1], mx, by, Math.max(1, bx - mx), 1); R(c, INK[1], bx - 2, by - 1, 1, 3) }
      }
    }
  }
  // the back: the plan's headline and first lines, a sign-off box blinking
  function back(c, b, p, now) {
    R(c, '#f3ecd8', b.x, b.y, b.w, b.h)
    R(c, '#c96a2a', b.x + 2, b.y + 2, Math.min(b.w - 12, 8 + (p.lines?.[0]?.length || 20)), 2)
    for (let i = 1; i < 5; i++) {
      const len = p.lines?.[i]?.length ?? (i < 4 ? 30 : 0); if (!len) continue
      R(c, '#7a6a52', b.x + 3, b.y + 3 + i * 4, Math.min(b.w - 8, 6 + len * 0.6), 1)
    }
    const on = Math.floor(now / 500) % 2 === 0
    R(c, on ? '#f2a43a' : '#c98a2a', b.x + b.w - 8, b.y + 2, 6, 6); R(c, '#fff4dc', b.x + b.w - 6, b.y + 3, 2, 2); R(c, '#fff4dc', b.x + b.w - 6, b.y + 6, 2, 1)
  }
  function drawPoster(c, r, p, a) {
    c.globalAlpha = a
    R(c, 'rgba(0,0,0,.18)', r.x + 1, r.y + 1, r.w, r.h)
    R(c, '#6e5236', r.x - 1, r.y - 1, r.w + 2, r.h + 2); R(c, '#f3ecd8', r.x, r.y, r.w, r.h)
    R(c, '#c96a2a', r.x + 2, r.y + 2, r.w - 8, 1)
    for (let i = 0; i < 3; i++) R(c, '#9a8a72', r.x + 2, r.y + 5 + i * 2, r.w - 6 - (i % 2) * 3, 1)
    const tx = r.x + r.w - 6, ty = r.y + r.h - 6
    R(c, '#2f9a4a', tx, ty, 5, 5); R(c, '#eaffef', tx + 1, ty + 2, 1, 1); R(c, '#eaffef', tx + 2, ty + 3, 1, 1); R(c, '#eaffef', tx + 3, ty + 2, 1, 1); R(c, '#eaffef', tx + 3, ty + 1, 1, 1)
    R(c, '#d8443a', r.x + r.w / 2 - 1, r.y - 2, 2, 2)
    c.globalAlpha = 1
  }
  // approved: the board gets its tick, then shrinks and rises into the poster frame
  function pinning(c, f, p, t) {
    const b = boardRect(f), r = posterRect(f), k = ease((t - 0.35) / 0.65)
    const box = { x: b.x + (r.x - b.x) * k, y: b.y + (r.y - b.y) * k, w: b.w + (r.w - b.w) * k, h: b.h + (r.h - b.h) * k }
    if (k <= 0) {
      frame(c, b); back(c, b, p, 0)
      const s = Math.min(1, t / 0.2), tx = b.x + b.w - 10, ty = b.y + b.h - 10
      R(c, '#2f9a4a', tx, ty, 8 * s, 8 * s)
      if (s >= 1) { R(c, '#eaffef', tx + 1, ty + 4, 1, 1); R(c, '#eaffef', tx + 2, ty + 5, 1, 1); R(c, '#eaffef', tx + 3, ty + 6, 1, 1); R(c, '#eaffef', tx + 4, ty + 5, 1, 1); R(c, '#eaffef', tx + 5, ty + 4, 1, 1); R(c, '#eaffef', tx + 6, ty + 3, 1, 1) }
      return
    }
    drawPoster(c, box, p, 1)
  }
  function wave(c, who, now) {
    const sx = who.x + 5, sy = who.y - (who.seated ? 22 : 16), sw = Math.round(Math.sin(now / 110) * 2)
    const sleeve = who.look?.hue != null ? `hsl(${who.look.hue} 45% 45%)` : '#3a4a6a'
    R(c, sleeve, sx, sy - 4, 2, 5); R(c, sleeve, sx + 1 + Math.round(sw / 2), sy - 8, 2, 4)
    const hx = sx + 1 + sw, hy = sy - 13
    R(c, '#f2c9a0', hx, hy + 1, 3, 4); R(c, '#f2c9a0', hx - 1, hy + 2, 1, 2)
    for (let i = 0; i < 3; i++) R(c, '#f2c9a0', hx + i, hy, 1, 1)
    R(c, 'rgba(0,0,0,.25)', hx, hy + 4, 3, 1)
    if (Math.floor(now / 400) % 2) { R(c, '#f2a43a', hx + 5, hy - 2, 1, 3); R(c, '#f2a43a', hx - 3, hy - 2, 1, 3) }
  }

  tower.on('glow', (c, now, n) => {
    for (const f of tower.floors) {
      if (f.kind !== 'session' || planOf(f)?.state !== 'review') continue
      const b = boardRect(f), g = c.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, 0, b.x + b.w / 2, b.y + b.h / 2, 30)
      g.addColorStop(0, `rgba(255,190,90,${0.25 * Math.max(n, 0.2)})`); g.addColorStop(1, 'rgba(255,190,90,0)')
      c.fillStyle = g; c.fillRect(b.x - 10, b.y - 10, b.w + 20, b.h + 20)
    }
  })

  // ---------- overlay: the plan's words on the flipped board when zoomed in ----------
  tower.on('overlay', v => {
    const k = tower.zoom; if (k < 2.5) return
    const cv = tower.canvas
    for (const f of tower.floors) {
      const p = planOf(f), ch = seen.get(f.id)
      if (f.kind !== 'session' || p?.state !== 'review' || !p.lines?.length || (ch && performance.now() - ch.at < FLIP_MS)) continue
      const b = boardRect(f), a = tower.worldToScreen(b.x, b.y)
      if (a.x > cv.clientWidth || a.y > cv.clientHeight || a.x + b.w * k < 0 || a.y + b.h * k < 0) continue
      v.save(); v.beginPath(); v.rect(a.x, a.y, b.w * k, b.h * k); v.clip(); v.textBaseline = 'top'
      v.fillStyle = '#f3ecd8'; v.fillRect(a.x + 1.5 * k, a.y + 1.5 * k, (b.w - 11) * k, (b.h - 3) * k)
      const hs = Math.min(3.6 * k, 15), fs = Math.min(3 * k, 12), maxW = (b.w - 12) * k
      v.font = font(hs, 700); v.fillStyle = '#a8501a'; v.fillText(fitText(p.lines[0], maxW, font(hs, 700)), a.x + 2 * k, a.y + 1.6 * k)
      v.font = font(fs, 500); v.fillStyle = '#4a3e2e'
      let y = a.y + 1.6 * k + hs * 1.25
      for (const l of p.lines.slice(1)) { if (y + fs > a.y + (b.h - 1) * k) break; v.fillText(fitText(l, maxW, font(fs, 500)), a.x + 2 * k, y); y += fs * 1.2 }
      v.restore()
    }
  })

  // ---------- hover ----------
  function hit(w) {
    for (const f of tower.floors) {
      if (f.kind !== 'session' || w.y < f.top || w.y > f.y) continue
      const p = planOf(f); if (!p) continue
      if ((p.state === 'sketching' || p.state === 'review') && inR(w, boardRect(f), 1)) return { f, p, board: true }
      if (p.state === 'approved' && inR(w, posterRect(f), 1)) return { f, p, board: false }
    }
    return null
  }
  const lines = p => (p.lines || []).slice(1, 5).map(l => `<div class="m">${esc(l.slice(0, 90))}</div>`).join('')
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    const title = esc(h.f.session?.title || '')
    if (h.board && h.p.state === 'sketching') return `<div class="t">📝 ${title} · planning</div><div class="m">in plan mode${h.p.since ? ' since ' + esc(api.ago(h.p.since)) : ''} — no plan written yet</div>`
    if (h.board) return `<div class="t">📝 ${title} · plan waiting for your sign-off</div><div><b>${esc(h.p.lines?.[0] || 'Plan')}</b></div>${lines(h.p)}<div class="m">click to open the session</div>`
    return `<div class="t">✓ ${title} · approved plan</div><div><b>${esc(h.p.lines?.[0] || 'Plan')}</b></div>${lines(h.p)}<div class="m">approved ${esc(api.ago(h.p.since || h.p.at))}</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h || !h.board || h.p.state !== 'review') return false
    tower.focusSession?.(h.f.session)
    return true
  })

  // ---------- ?demo=planwhiteboard ----------
  if (!demo) return
  let t0 = 0
  const PLAN = ['Team dashboard: scaffold + auth POC', 'Context: support needs one staff UI', 'Scaffold dashboard-web behind SSO', 'Reuse the API session cookies', 'Roles: viewer, support, admin']
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => { const f = tower.floorOf(data.sessions[0]?.id); if (f) tower.flyTo({ x: STAND_X, y: f.y - 40 }, 4) }, 800) }
    const s = data.sessions[0]; if (!s) return
    const t = (now - t0) % 32000
    s.running = true; delete s.attention
    if (t < 12000) { s.state = 'thinking'; s.ext = { ...s.ext, 'plan-whiteboard': { state: 'sketching', since: t0 } } }
    else if (t < 24000) { s.state = 'tool'; s.tool = 'ExitPlanMode'; s.ext = { ...s.ext, 'plan-whiteboard': { state: 'review', lines: PLAN, since: now - (t - 12000) } } }
    else { s.state = 'tool'; s.tool = 'Edit'; s.ext = { ...s.ext, 'plan-whiteboard': { state: 'approved', lines: PLAN, since: now - (t - 24000) } } }
  })
}
