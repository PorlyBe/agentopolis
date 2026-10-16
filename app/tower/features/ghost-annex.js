// ghost-annex: sessions closed earlier today (snap.ghostAnnex, server/features/ghost-annex.mjs) haunt a translucent side
// wing hung off the left wall, one ghost floor per session, level with the tower's floors from the café up: a faded plaque,
// a dim desk and a see-through sitter. Out at night, faint in the evening, hidden by day unless you hover the little ANNEX
// sign by the café. The refactor crane's floor and the one above it stay an open bay so its jib swings clear. At most 8
// ghosts, newest lowest; the rest are "+N earlier" on the annex roof. Hover a ghost floor for what it was.
// ?demo=ghostannex fakes ten ghosts, keeps the wing showing and flies there.
import { IX } from '../building.js'
import { R } from '../draw.js'

const AX0 = -114, AX1 = -28, AW = AX1 - AX0, MAX = 8
const INK = { classic: '190,215,255', noir: '225,225,225', gameboy: '155,188,15', synthwave: '255,130,235', cyberpunk: '90,235,255', blueprint: '210,235,255', candy: '255,190,230' }
const hm = t => new Date(t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
const dur = ms => { const m = Math.max(1, Math.round(ms / 60000)), h = Math.floor(m / 60); return h ? `${h}h ${String(m % 60).padStart(2, '0')}m` : `${m}m` }
const STATE = { tool: 'mid-tool', thinking: 'thinking', waiting: 'waiting on you', attention: 'needed you', delegating: 'delegating', idle: 'idle' }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('ghostannex')
  let ghosts = [], cranes = new Set(), reveal = 0, hoverAt = -1e9, flown = false, vis = 0
  const hovering = () => performance.now() - hoverAt < 250

  if (demo) tower.on('snapshot', data => {
    const now = Date.now(), M = 60_000
    const T = [['RECIPE EXPORT', 'feat/csv-export', 'Bash', 'idle', 412], ['ONBOARDING COPY', 'docs/onboarding', 'Edit', 'waiting', 96], ['FLAKY E2E HUNT', 'fix/e2e-timeouts', 'Bash', 'tool', 733],
      ['SEARCH INDEX', 'feat/search-reindex', 'Read', 'thinking', 208], ['DEPENDABOT SWEEP', 'chore/deps', 'Bash', 'idle', 57], ['RATE LIMITER', 'feat/rate-limit', 'Edit', 'idle', 351],
      ['LOGO TWEAKS', 'design/logo', 'Write', 'waiting', 31], ['CACHE WARMUP', 'perf/cache-warm', 'Bash', 'idle', 164], ['MORNING TRIAGE', 'main', 'Grep', 'idle', 88], ['SPIKE: GRAPHQL', 'spike/graphql', 'WebSearch', 'idle', 40]]
    data.ghostAnnex = { day: 'demo', ghosts: T.map(([title, branch, last, state, calls], i) => {
      const closed = now - (6 + i * 37) * M
      return { id: 'ghost-demo-' + i, title, branch, worktree: null, opened: closed - (25 + (i * 53) % 180) * M, closed, calls, last, state, agents: i % 3 }
    }) }
  })
  tower.on('sync', data => {
    const live = new Set(data.sessions.map(s => s.id))
    ghosts = (data.ghostAnnex?.ghosts || []).filter(g => !live.has(g.id))
    cranes = new Set((data.cranes || []).filter(c => c.add + c.del > 1000).map(c => c.sessionId))
    if (demo && !flown && ghosts.length && !params.get('towerzoom')) { flown = true; setTimeout(() => { const L = plan(); L && tower.flyTo({ x: (AX0 + AX1) / 2, y: (L.top + L.bottom) / 2 }, 2.2) }, 700) }
  })

  // slots: the tower's floors from the café up to the CEO office; a crane floor and the one above it are an open bay
  function plan() {
    if (!ghosts.length) return null
    const fl = tower.floors.filter(f => f.kind === 'cafe' || f.kind === 'session' || f.kind === 'meeting' || f.kind === 'ceo')
    if (!fl.length) return null
    const blocked = new Set()
    fl.forEach((f, i) => { if (f.kind === 'session' && cranes.has(f.sessionId)) { blocked.add(i); blocked.add(i + 1) } })
    const slots = [], shown = []
    for (let i = 0; i < fl.length && shown.length < Math.min(MAX, ghosts.length); i++) {
      const f = fl[i], s = { y: f.y, top: f.top, bay: blocked.has(i) }
      if (!s.bay) { s.g = ghosts[shown.length]; shown.push(s.g) }
      slots.push(s)
    }
    while (slots.length && slots.at(-1).bay) slots.pop()
    if (!slots.length) return null
    return { slots, more: ghosts.length - shown.length, top: slots.at(-1).top, bottom: slots[0].y, cafe: fl[0] }
  }
  const sign = L => ({ x: -25, y: L.cafe.y - 46, w: 22, h: 9 })
  const inR = (w, r) => w.x >= r.x && w.x < r.x + r.w && w.y >= r.y && w.y < r.y + r.h
  const ink = () => INK[api.theme?.skin] || INK.classic
  const baseVis = n => demo ? 1 : n >= 0.75 ? 1 : n > 0.2 ? 0.25 + 0.75 * (n - 0.2) / 0.55 * 0.6 : 0

  tower.on('step', dt => { reveal = hovering() ? Math.min(1, reveal + dt * 3) : Math.max(0, reveal - dt / 4) })

  function sitter(c, x, y, hue, a, now, seed) {
    const bob = Math.round(Math.sin(now / 900 + seed) * 1)
    c.globalAlpha = a * 0.55
    const body = `hsl(${hue} 45% 78%)`, skin = '#f1ece4'
    R(c, skin, x, y - 21 + bob, 5, 5); R(c, '#2a2e38', x + 1, y - 19 + bob, 1, 1); R(c, '#2a2e38', x + 3, y - 19 + bob, 1, 1)
    R(c, body, x - 1, y - 16 + bob, 7, 7)
    c.globalAlpha = a * 0.3
    for (let i = 0; i < 7; i++) R(c, body, x - 1 + i, y - 9 + bob, 1, 3 + ((i + Math.floor(now / 300)) % 2))   // a wispy hem instead of legs
    c.globalAlpha = 1
  }
  function drawAnnex(c, L, a, now) {
    const k = ink(), A = x => `rgba(${k},${(x * a).toFixed(3)})`
    // the struts that hang it off the wall below the café, and a glass bridge across the gap at café level
    c.strokeStyle = A(0.35); c.lineWidth = 1.5; c.beginPath()
    c.moveTo(-1, L.bottom + 44); c.lineTo(AX0 + 8, L.bottom + 1); c.moveTo(-1, L.bottom + 44); c.lineTo(AX1 - 6, L.bottom + 1); c.stroke()
    R(c, A(0.25), AX1, L.cafe.y - 30, -AX1, 30); R(c, A(0.5), AX1, L.cafe.y - 31, -AX1, 1); R(c, A(0.5), AX1, L.cafe.y, -AX1, 2)
    for (const s of L.slots) {
      const h = s.y - s.top
      R(c, A(0.55), AX0 - 2, s.y, AW + 4, 4)                                     // slab
      if (s.bay) {                                                                // open steel bay for the crane
        R(c, A(0.3), AX0, s.top, 2, h); R(c, A(0.3), AX1 - 2, s.top, 2, h)
        c.strokeStyle = A(0.22); c.lineWidth = 1; c.beginPath(); c.moveTo(AX0, s.top); c.lineTo(AX1, s.y); c.moveTo(AX1, s.top); c.lineTo(AX0, s.y); c.stroke()
        continue
      }
      const g = s.g, hue = api.hash(g.id) % 360
      R(c, A(0.12), AX0, s.top, AW, h)                                            // back wall
      R(c, A(0.4), AX0, s.top, 2, h); R(c, A(0.4), AX1 - 2, s.top, 2, h)
      for (let x = AX0 + 10; x < AX1 - 8; x += 22) R(c, A(0.08), x, s.top + 10, 14, 18)   // empty windows
      const dx = AX0 + 36, fy = s.y
      R(c, A(0.4), dx, fy - 12, 30, 2); R(c, A(0.25), dx + 2, fy - 10, 2, 10); R(c, A(0.25), dx + 26, fy - 10, 2, 10)   // desk
      R(c, A(0.35), dx + 16, fy - 21, 10, 8); R(c, A(0.12), dx + 17, fy - 20, 8, 6); R(c, A(0.35), dx + 20, fy - 13, 2, 1)   // dead monitor
      R(c, A(0.3), dx - 4, fy - 9, 9, 2); R(c, A(0.3), dx, fy - 7, 1, 7)       // chair
      sitter(c, dx - 2, fy - 2, hue, a, now, api.hash(g.id) % 50)
      R(c, A(0.5), AX0 + 4, s.top + 3, AW - 8, 9); R(c, A(0.2), AX0 + 5, s.top + 4, AW - 10, 7)   // the faded plaque
    }
    // the roof cap and its "+N earlier" board
    R(c, A(0.5), AX0 - 3, L.top - 4, AW + 6, 4)
    if (L.more > 0) { R(c, A(0.4), AX0 + 20, L.top - 16, AW - 40, 11); R(c, A(0.4), AX0 + 26, L.top - 5, 1, 2); R(c, A(0.4), AX1 - 27, L.top - 5, 1, 2) }
  }
  function drawSign(c, L, now, a) {
    const b = sign(L)
    R(c, '#4a4f5a', b.x + b.w, b.y + 3, 3, 1)
    R(c, '#2e3240', b.x, b.y, b.w, b.h); R(c, `rgba(${ink()},${(0.55 + 0.45 * a).toFixed(2)})`, b.x + 1, b.y + 1, b.w - 2, b.h - 2)
    R(c, '#2e3240', b.x + 2, b.y + 3, 2, 3); R(c, '#2e3240', b.x + 1, b.y + 4, 1, 1)   // ← arrow; the word is in the overlay
    if (hovering() && Math.floor(now / 500) % 2) R(c, '#ffffff', b.x + b.w - 3, b.y + 1, 1, 1)
  }

  tower.on('items', (out, now, ctx) => {
    const L = plan(); if (!L) return
    vis = Math.max(baseVis(ctx.sun.n), reveal * 0.85)
    const v = ctx.view
    if (v.x0 > 4 || v.x1 < AX0 - 10 || v.y0 > L.bottom + 50 || v.y1 < L.top - 20) return
    if (vis > 0.02) out.push({ z: Z.BEHIND + 6, draw: c => drawAnnex(c, L, vis, now) })
    out.push({ z: Z.OUTSIDE + 2, draw: c => drawSign(c, L, now, vis) })
  })
  tower.on('glow', (c, now, n) => {
    const L = plan(); if (!L || vis < 0.05 || n < 0.05) return
    const k = ink()
    for (const s of L.slots) if (s.g) {
      const cx = AX0 + 36, cy = s.y - 14, g = c.createRadialGradient(cx, cy, 2, cx, cy, 34), p = 0.75 + 0.25 * Math.sin(now / 1300 + api.hash(s.g.id) % 9)
      g.addColorStop(0, `rgba(${k},${(0.32 * n * vis * p).toFixed(3)})`); g.addColorStop(1, `rgba(${k},0)`)
      c.fillStyle = g; c.fillRect(cx - 34, cy - 34, 68, 68)
      c.fillStyle = `rgba(${k},${(0.05 * n * vis).toFixed(3)})`; c.fillRect(AX0, s.top, AW, s.y - s.top)
    }
  })

  tower.on('overlay', (v, now, ctx) => {
    const L = plan(); if (!L) return
    const z = tower.zoom
    v.save(); v.textBaseline = 'middle'; v.textAlign = 'center'
    const b = sign(L), p = tower.worldToScreen(b.x + b.w / 2 + 1, b.y + b.h / 2)
    if (z >= 2.2) { v.font = font(Math.min(11, b.h * z * 0.62), 800); v.fillStyle = '#20242e'; v.fillText('ANNEX', p.x + 1.5 * z, p.y + 0.5) }
    if (vis > 0.05 && z >= 1.6) {
      const k = ink(), day = (ctx?.sun?.n ?? 1) < 0.4
      for (const s of L.slots) {
        if (!s.g) continue
        const q = tower.worldToScreen(AX0 + AW / 2, s.top + 7.5), w = (AW - 12) * z, g = s.g
        v.globalAlpha = Math.min(1, vis * 0.9)
        v.font = font(Math.min(12, 6.2 * z), 800); v.fillStyle = day ? '#2c3a55' : `rgba(${k},1)`
        v.fillText(fitText(g.title, w, v.font), q.x, q.y)
        if (z >= 3) {
          const r = tower.worldToScreen(AX0 + AW - 26, s.top + 26)
          v.font = font(Math.min(11, 3.6 * z), 600); v.fillStyle = day ? 'rgba(44,58,85,.85)' : `rgba(${k},.85)`
          v.fillText(fitText(`closed ${hm(g.closed)}`, 46 * z, v.font), r.x, r.y)
          v.fillText(fitText(dur(g.closed - g.opened), 46 * z, v.font), r.x, r.y + 4.4 * z)
          v.fillText(fitText(STATE[g.state] || g.state || '', 46 * z, v.font), r.x, r.y + 8.8 * z)
        }
      }
      if (L.more > 0) { const q = tower.worldToScreen(AX0 + AW / 2, L.top - 10.5); v.globalAlpha = Math.min(1, vis); v.font = font(Math.min(11, 5 * z), 800); v.fillStyle = '#20242e'; v.fillText(`+${L.more} earlier`, q.x, q.y) }
    }
    v.restore()
  })

  tower.on('hover', (w, person) => {
    const L = plan(); if (!L || person) return null
    if (inR(w, sign(L))) {
      hoverAt = performance.now()
      return `<div class="t">👻 Ghost annex</div><div>${ghosts.length} session${ghosts.length === 1 ? '' : 's'} closed today</div><div class="m">out at night · hover here to peek by day</div>`
    }
    if (vis < 0.15 || w.x < AX0 || w.x >= AX1) return null
    const s = L.slots.find(s => s.g && w.y >= s.top && w.y < s.y + 4)
    if (s) {
      const g = s.g
      return `<div class="t">👻 ${esc(g.title)}</div>${g.branch ? `<div>${esc(g.branch)}</div>` : ''}<div>${hm(g.opened)} → ${hm(g.closed)} · ${dur(g.closed - g.opened)}</div>`
        + `<div>${g.calls} tool call${g.calls === 1 ? '' : 's'}${g.last ? ` · last ${esc(g.last)}` : ''}</div><div class="m">${esc(STATE[g.state] || g.state || '')} when it closed · gone</div>`
    }
    if (L.more > 0 && w.y >= L.top - 17 && w.y < L.top) return `<div class="t">👻 +${L.more} earlier</div><div>${ghosts.slice(ghosts.length - L.more, ghosts.length - L.more + 12).map(g => `${esc(g.title)} · ${hm(g.closed)}`).join('<br>')}</div>`
    return null
  })
  tower.on('click', (w, person) => {
    const L = plan(); if (!L || person || vis < 0.15 || w.x < AX0 || w.x >= AX1 || w.y < L.top - 17 || w.y > L.bottom + 4) return false
    return true
  })
}
