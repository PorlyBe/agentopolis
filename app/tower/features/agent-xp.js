// agent-xp: every subagent type levels up with use (snap.agentXp, server/features/agent-xp.mjs: spawns in the last 90 days,
// level = floor(sqrt(xp))). Each subagent wears a lanyard whose card is bronze, silver, gold or diamond by its type's level,
// with an "Lv 14" tag beside it once zoomed in; a spawn that crosses a level sparkles its wearers and raises a toast. The
// AGENT RANKS board hangs on the meeting room's back wall between the sign and the screen. ?demo=agentxp levels Explore up.
import { IX } from '../building.js'
import { geo } from './uniforms.js'
import { R, inR } from '../draw.js'

const BOARD = { dx: IX + 311, dy: 10, w: 48, h: 28 }, ROWS = 5
const typeOf = a => !a ? null : a.type === 'workflow-subagent' || a.workflow ? 'workflow' : a.type || 'general-purpose'
const tier = lv => lv >= 40 ? ['#bfefff', '#6fc8e8'] : lv >= 20 ? ['#f4c64f', '#b8892a'] : lv >= 10 ? ['#d8dee6', '#8a94a2'] : ['#d08a4a', '#8a5a2a']
const ICON = { workflow: '🧩', 'general-purpose': '🛠', Explore: '🔭', Plan: '🗺', 'claude-code-guide': '📘', fork: '🍴' }
const SKIN = { classic: ['#1e2a3a', '#3b2617', '#c9a25a'], synthwave: ['#2a1640', '#ff5ab4', '#3ae0ff'], cyberpunk: ['#141826', '#3ae0ff', '#ff3fb4'], noir: ['#1a1a1a', '#555', '#bbb'] }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('agentxp')
  let types = [], recent = [], byType = new Map(), primed = false, base = null, demoT0 = 0
  const best = new Map(), sparks = new Map(), cards = new Map()   // type -> best level seen; type -> sparkle start; agent id -> world card spot
  let boardFlash = null

  if (demo) tower.on('snapshot', snap => {
    const now = Date.now()
    if (!demoT0) { demoT0 = now; if (!params.get('towerzoom')) setTimeout(() => { const b = board(); b && tower.flyTo({ x: b.x + b.w / 2, y: b.y + 30 }, 5) }, 600) }
    const k = Math.floor((now - demoT0) / 9000), xp = [['workflow', 412], ['general-purpose', 231], ['Explore', 223 + k * 2], ['code-reviewer', 64], ['Plan', 38], ['claude-code-guide', 17]]
    snap.agentXp = { types: xp.map(([type, xp]) => { const level = Math.floor(Math.sqrt(xp)); return { type, xp, level, next: (level + 1) ** 2 } }).sort((a, b) => b.xp - a.xp),
      recent: [{ type: 'Explore', at: now - 9000 * (k ? 1 : 0) - 4000, description: 'map the search index' }], total: 0 }
  })

  tower.on('sync', snap => {
    const x = snap.agentXp; if (!x) return
    types = x.types || []; recent = x.recent || []; byType = new Map(types.map(t => [t.type, t]))
    for (const t of types) {
      const was = best.get(t.type)
      if (primed && was != null && t.level > was) {
        sparks.set(t.type, performance.now()); boardFlash = { type: t.type, at: performance.now() }
        api.toast(`⭐ ${t.type} reached Lv ${t.level}`, 5000)
      }
      if (was == null || t.level > was) best.set(t.type, t.level)
    }
    primed = true
  })

  function board() { const f = tower.floor('meeting'); return f && { x: BOARD.dx, y: f.top + BOARD.dy, w: BOARD.w, h: BOARD.h, f } }
  const row = (b, i) => ({ x: b.x + 2, y: b.y + 7 + i * 4, w: b.w - 4, h: 4 })

  // the lanyard, in sprite pixels on every subagent; remember where its card landed in world pixels for the tag
  const wear = api.wear || (api.wear = [])
  wear.push((c, p, info) => {
    if (p.kind !== 'agent' || !base) return
    const t = byType.get(typeOf(p.data)); if (!t) return
    const g = geo(api, p, info), [hi, lo] = tier(t.level), y = g.y0
    if (g.back) { R(c, '#c0392b', 5, y, 6, 1); return }
    const cx = g.side ? 9 : 7
    R(c, '#c0392b', cx - 2, y, 1, 2); R(c, '#c0392b', cx + 2, y, 1, 2); R(c, '#c0392b', cx - 1, y + 2, 3, 1)
    R(c, lo, cx - 1, y + 3, 3, 4); R(c, hi, cx - 1, y + 3, 3, 3); R(c, '#2a2a2a', cx, y + 4, 1, 1)
    const m = c.getTransform(), q = base.transformPoint(m.transformPoint(new DOMPoint(cx + 0.5, y + 5)))
    cards.set(p.id, { x: q.x, y: q.y, t, type: t.type })
  })

  const ink = () => SKIN[api.theme?.skin] || SKIN.classic
  tower.on('items', out => {
    cards.clear()
    out.push({ z: -1e9, draw: c => { base = c.getTransform().inverse() } })
    const b = board(); if (!b) return
    out.push({ z: Z.WALL + 3, draw: (c, now) => {
      const [bg, frame, head] = ink()
      R(c, 'rgba(0,0,0,.18)', b.x + 2, b.y + b.h, b.w - 1, 1)
      R(c, frame, b.x - 1, b.y - 1, b.w + 2, b.h + 2); R(c, bg, b.x, b.y, b.w, b.h)
      R(c, head, b.x + 1, b.y + 1, b.w - 2, 5); R(c, 'rgba(255,255,255,.25)', b.x + 1, b.y + 1, b.w - 2, 1)
      const top = types[0]?.level || 1
      for (let i = 0; i < ROWS; i++) {
        const q = row(b, i), t = types[i]; if (!t) continue
        const [hi, lo] = tier(t.level), full = q.w - 6, len = Math.max(2, Math.round(full * t.level / Math.max(top, 1)))
        const lit = sparks.has(t.type) && performance.now() - sparks.get(t.type) < 3000
        if (lit) R(c, 'rgba(255,236,160,.25)', q.x - 1, q.y, q.w + 2, 4)
        R(c, hi, q.x, q.y + 1, 2, 2); R(c, lo, q.x + 1, q.y + 2, 1, 1)                   // the medal
        R(c, 'rgba(255,255,255,.07)', q.x + 4, q.y + 3, full, 1)
        R(c, lo, q.x + 4, q.y + 3, len, 1)
        const span = (t.level + 1) ** 2 - t.level ** 2, part = Math.min(1, (t.xp - t.level ** 2) / Math.max(1, span))
        R(c, hi, q.x + 4, q.y + 3, Math.max(1, Math.round(len * part)), 1)                 // progress to the next level
        if (tower.zoom < 4) R(c, 'rgba(255,255,255,.35)', q.x + 4, q.y + 1, Math.min(full, 6 + t.type.length), 1)   // a chalk name
      }
      if (boardFlash && performance.now() - boardFlash.at < 2000 && Math.floor(now / 160) % 2) R(c, '#fffbe0', b.x + b.w - 4, b.y + 2, 2, 2)
    } })
    out.push({ z: Z.TOP - 1, draw: (c, now) => {   // level-up sparkles round the cards of that type
      const t0 = performance.now()
      for (const [type, at] of sparks) if (t0 - at > 3000) sparks.delete(type)
      if (!sparks.size) return
      for (const q of cards.values()) {
        const at = sparks.get(q.type); if (at == null) continue
        const k = (t0 - at) / 3000
        for (let i = 0; i < 6; i++) {
          const a = i / 6 * Math.PI * 2 + now / 400, r = 4 + 8 * k
          if ((Math.floor(now / 90) + i) % 3 === 0) continue
          R(c, i % 2 ? '#fff6b0' : '#f4c64f', q.x + Math.cos(a) * r, q.y - 4 + Math.sin(a) * r * 0.8, 1, 1)
        }
        R(c, '#fffbe0', q.x - 1, q.y - 12 - 6 * k, 3, 1); R(c, '#fffbe0', q.x, q.y - 13 - 6 * k, 1, 3)
      }
    } })
  })

  tower.on('glow', (c, now, n) => {
    const b = board(); if (!b || n < 0.05) return
    c.fillStyle = `rgba(150,200,255,${0.1 * n})`; c.fillRect(b.x, b.y, b.w, b.h)
  })

  tower.on('overlay', v => {
    const k = tower.zoom
    if (k >= 4) {   // the level tag beside each card
      v.save(); v.textBaseline = 'middle'; v.textAlign = 'left'
      const fs = Math.min(11, 2.2 * k); v.font = font(fs, 800)
      for (const q of cards.values()) {
        const s = tower.worldToScreen(q.x + 2.5, q.y - 1.5), txt = `Lv ${q.t.level}`, w = v.measureText(txt).width + fs * 0.6
        if (s.x < -40 || s.y < -20 || s.x > v.canvas.width || s.y > v.canvas.height) continue
        const [hi, lo] = tier(q.t.level)
        v.fillStyle = 'rgba(20,20,28,.82)'; v.fillRect(s.x, s.y - fs * 0.62, w, fs * 1.24)
        v.fillStyle = lo; v.fillRect(s.x, s.y - fs * 0.62, 1.5, fs * 1.24)
        v.fillStyle = hi; v.fillText(txt, s.x + fs * 0.35, s.y + 0.5)
      }
      v.restore()
    }
    const b = board(); if (!b || k < 3) return
    const a = tower.worldToScreen(b.x, b.y)
    if (a.x > v.canvas.width || a.x + b.w * k < 0 || a.y > v.canvas.height || a.y + b.h * k < 0) return
    v.save(); v.textBaseline = 'middle'
    const hf = Math.min(4.2 * k, 14); v.font = font(hf, 800); v.textAlign = 'center'; v.fillStyle = ink()[0]
    v.fillText(fitText('AGENT RANKS', (b.w - 4) * k, v.font), a.x + b.w * k / 2, a.y + 3.6 * k)
    if (k >= 4) {
      const fs = Math.min(2.5 * k, 12); v.font = font(fs, 700)
      for (let i = 0; i < ROWS; i++) {
        const q = row(b, i), t = types[i]; if (!t) continue
        const p = tower.worldToScreen(q.x + 4, q.y + 1.6)
        v.textAlign = 'left'; v.fillStyle = 'rgba(255,255,255,.92)'
        const lv = `Lv ${t.level}`, lw = v.measureText(lv).width
        v.fillText(fitText(t.type, (q.w - 7) * k - lw - fs, v.font), p.x, p.y)
        v.textAlign = 'right'; v.fillStyle = tier(t.level)[0]; v.fillText(lv, a.x + (b.w - 2.5) * k, p.y)
      }
    }
    v.restore()
  })

  const when = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago` }
  const line = t => {
    const last = recent.find(r => r.type === t.type)
    return `<div>${ICON[t.type] || '🤖'} <b>${esc(t.type)}</b> · Lv ${t.level} · ${t.xp.toLocaleString('en-US')} spawns</div>`
      + `<div class="m">${t.next - t.xp} more to Lv ${t.level + 1}${last ? ` · last ${when(last.at)}` : ''}</div>`
  }
  tower.on('hover', (w, person) => {
    if (person?.kind === 'agent') return null
    const b = board(); if (!b || !inR(w, b, 1)) return null
    const i = [...Array(ROWS).keys()].find(n => inR(w, row(b, n))), t = i != null ? types[i] : null
    if (t) return `<div class="t">⭐ Agent ranks</div>${line(t)}`
    return `<div class="t">⭐ Agent ranks</div><div class="m">subagent spawns, last 90 days · level = √xp</div>${types.slice(0, 8).map(line).join('') || '<div class="m">no subagents yet</div>'}`
  })
}
