// mess: a session's floor gets messier as its context fills (tidy under 40%, full chaos past 90%), and after a compaction
// desk-kit's janitor (npc 'janitor-<session id>') cleans it: mess fades where he has walked, the rest goes while he
// sweeps, then the floor sparkles. If he never shows up, a mop wave sweeps the floor on its own.
// Demo: ?demo=mess ramps the first floor from 0 to 100% over ~20 s, then compacts it.
import { IX, IX1 } from '../building.js'
import { R } from '../draw.js'

const clamp = p => Math.max(0, Math.min(1, p || 0))
const PAPER = ['#f4f1e8', '#e6e2d6', '#d4cfc0', '#ffffff']
// [threshold, kind, where]: every 10% past 40 adds a few things
const PLAN = [
  [0.40, 'ball'], [0.43, 'cup', 'desk0'], [0.47, 'ball'], [0.50, 'sheet'], [0.53, 'cup', 'agent'], [0.56, 'binfill'], [0.58, 'ball'],
  [0.61, 'pizza'], [0.63, 'sheet'], [0.65, 'cup', 'desk1'], [0.67, 'binover'], [0.69, 'ball'], [0.71, 'cupfloor'], [0.73, 'sheet'],
  [0.75, 'cup', 'agent'], [0.77, 'cup', 'desk2'], [0.79, 'ball'],
  [0.80, 'stack'], [0.81, 'stain'], [0.82, 'sticky', 'mon'], [0.84, 'stack', 'agent'], [0.85, 'sticky', 'mon'], [0.86, 'stain'],
  [0.87, 'stack'], [0.88, 'sticky', 'mon'], [0.89, 'stain'],
  [0.90, 'tip'], [0.91, 'drift'], [0.92, 'flies'], [0.93, 'drift'], [0.94, 'ball'], [0.95, 'drift'], [0.96, 'pizza'], [0.97, 'stack'],
  [0.98, 'drift'], [0.99, 'sticky', 'mon'],
  [0.915, 'ball'], [0.925, 'flies', 'pizza'], [0.935, 'sheet'], [0.945, 'stain'], [0.955, 'ball'], [0.965, 'drift'], [0.975, 'cupfloor'], [0.985, 'ball'], [0.995, 'drift'],
]
const BINS = new Map([['binfill', 1], ['binover', 2], ['tip', 3]])
const BIN = 10                                    // the bin stands under the session desk, desk.x + BIN
const FREE = [[IX + 22, IX + 40], [IX + 60, IX + 74], [IX + 106, IX1 - 34]]   // floor clear of the jar, bin, plant leaves, landing
const SWEEP_S = 2.6, WAVE_S = 4, WAIT_S = 45, IN_S = 0.45, OUT_S = 0.35

function rng(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296 } }

export default function init(api, tower) {
  const demo = api.demo('mess')
  const rooms = new Map()                          // session id -> { items, lv, held, clean, last }

  // ---------- the mess plan, deterministic per session ----------
  function plan(id) {
    const r = rng(api.hash('mess:' + id)), taken = []
    const spot = w => {
      for (let tries = 0; tries < 24; tries++) {
        const [a, b] = FREE[r() < 0.12 ? 0 : r() < 0.15 ? 1 : 2], x = Math.round(a + r() * (b - a - w))
        if (tries > 18 || !taken.some(([x0, x1]) => x < x1 + 3 && x + w > x0 - 3)) { taken.push([x, x + w]); return x }
      }
    }
    const W = { ball: 9, sheet: 7, pizza: 16, cupfloor: 9, stack: 7, stain: 11, drift: 26 }
    return PLAN.map(([t, kind, where], i) => ({ i, t, kind, where: where || 'floor', x: W[kind] ? spot(W[kind]) : 0, v: r(), k: Math.floor(r() * 1e6), born: null, gone: null }))
  }
  function room(id) { let m = rooms.get(id); if (!m) rooms.set(id, m = { items: plan(id), lv: null, held: null, clean: null, last: null, sparkle: null, trail: [] }); return m }
  const pctOf = s => { const m = s.ext?.['context-meter']; return m ? { pct: clamp(m.pct), compacted: !!m.compacted } : null }

  // ---------- where each item sits this frame ----------
  function anchor(it, f, d, m = rooms.get(f.id)) {
    const y = f.y
    if (it.where === 'floor') {
      if (it.kind === 'binfill' || it.kind === 'binover' || it.kind === 'tip') return { x: d.desk.x + BIN + 3, y }
      if (it.kind === 'flies') return { x: d.desk.x + BIN + 3, y: y - 8 }
      return { x: it.x, y }
    }
    if (it.where === 'pizza') { const z = m.items.find(q => q.kind === 'pizza'); return { x: z.x + 7, y: y - 8 } }
    if (it.where.startsWith('desk')) return { x: d.desk.x + 1 + (it.where === 'desk1' ? 4 : 0), y: d.desk.y - (it.where === 'desk2' ? 4 : 0) }
    if (it.where === 'mon') return { x: d.monitor.x, y: d.monitor.y }
    const a = d.agents[it.k % Math.max(1, d.agents.length)]; if (!a) return null
    return it.kind === 'stack' ? { x: a.desk.x, y: a.desk.y } : { x: a.desk.x + a.desk.w - 5, y: a.desk.y }
  }

  // ---------- data ----------
  tower.on('sync', snap => {
    const now = performance.now(), ids = new Set(snap.sessions.map(s => s.id))
    for (const id of rooms.keys()) if (!ids.has(id)) rooms.delete(id)
    for (const s of snap.sessions) {
      const p = pctOf(s), m = room(s.id)
      if (p && m.last && api.live && !m.clean && ((p.compacted && !m.last.compacted) || (m.last.pct - p.pct >= 0.2 && p.pct < m.last.pct * 0.6))) {
        m.held = m.lv ?? m.last.pct
        m.clean = { at: now, seen: false, wave: null, end: null }
      }
      m.last = p
    }
  })

  function finish(m, f, now) {
    m.clean = null; m.held = null; m.lv = m.last?.pct ?? 0
    for (const it of m.items) { it.born = it.t <= m.lv ? -1e9 : null; it.gone = null }
    m.sparkle = { at: now, pts: Array.from({ length: 18 }, (_, i) => ({ x: IX + 16 + Math.random() * (IX1 - IX - 50), y: f.y - 2 - Math.random() * (i % 3 ? 4 : 16), d: Math.random() * 1600 })) }
  }
  function sweepTo(m, f, d, x, now) {   // clear everything at or right of x
    for (const it of m.items) {
      if (it.born == null || it.gone != null) continue
      const a = anchor(it, f, d); if (a && a.x + 2 >= x) it.gone = now
    }
  }
  function trail(m, x, now) { const t = m.trail.at(-1); if (!t || Math.abs(t.x - x) >= 1) m.trail.push({ x, at: now }) }

  tower.on('step', (dt, now) => {
    for (const f of tower.floors) {
      if (f.kind !== 'session' || !f.session) continue
      const m = room(f.id), d = tower.desk(f.id); if (!d) continue
      const target = m.held ?? m.last?.pct ?? 0
      if (m.lv == null) { m.lv = target; for (const it of m.items) if (it.t <= target) it.born = -1e9 }
      else m.lv += (target - m.lv) * Math.min(1, dt * 1.4)
      for (const it of m.items) {
        if (it.t <= m.lv && it.born == null) { it.born = now; it.gone = null }
        else if (it.t > m.lv + 0.005 && it.born != null && it.gone == null && !m.clean) it.gone = now
        if (it.gone != null && now - it.gone > OUT_S * 1000 && !m.clean) it.born = it.gone = null
      }
      m.trail = m.trail.filter(t => now - t.at < 2600)
      if (m.sparkle && now - m.sparkle.at > 3200) m.sparkle = null
      const c = m.clean; if (!c) continue
      // follow desk-kit's janitor: mess fades behind him on his way in, the rest while he sweeps, all of it once he leaves
      const j = tower.person('janitor-' + f.id), here = j && j.floor === f.id && !j.riding && j.x < IX1 + 4
      if (here && !j.leaving) {
        c.seen = true
        if (j.walking) { sweepTo(m, f, d, j.x, now); trail(m, j.x, now) }
        else {
          c.sweepAt ??= now
          const x = j.x - (j.x - IX) * Math.min(1, (now - c.sweepAt) / 1000 / SWEEP_S)
          sweepTo(m, f, d, x, now); trail(m, x, now)
        }
      } else if (c.seen && !c.wave && (!j || j.leaving)) { sweepTo(m, f, d, -1e9, now); c.end ??= now }
      else if (!c.seen && !c.wave && now - c.at > WAIT_S * 1000) c.wave = now   // no janitor came: mop it ourselves
      if (c.wave) {
        const x = IX1 - 30 - (IX1 - 30 - IX) * Math.min(1, (now - c.wave) / 1000 / WAVE_S)
        sweepTo(m, f, d, x, now); trail(m, x, now)
        if (x <= IX) c.end ??= now
      }
      if (c.end && now - c.end > OUT_S * 1000) finish(m, f, now)
    }
  })

  // ---------- pixel art (x: left edge, y: the surface it stands on) ----------
  function balls(c, x, y, v) { ball(c, x, y, v); if (v > 0.3) ball(c, x + 4, y, 1 - v); if (v > 0.65) ball(c, x + 2, y - 3, v * 0.5) }
  function ball(c, x, y, v) { const s = v > 0.5 ? 4 : 3; R(c, PAPER[0], x, y - s, s, s); R(c, PAPER[3], x + 1, y - s, 1, 1); R(c, PAPER[2], x, y - 1, s - 1, 1); R(c, PAPER[1], x + s - 1, y - s + 1, 1, 1) }
  function sheet(c, x, y) { R(c, PAPER[0], x, y - 1, 6, 1); R(c, PAPER[1], x + 1, y - 2, 3, 1); R(c, PAPER[2], x + 4, y - 1, 1, 1) }
  function cup(c, x, y, v) {
    R(c, '#f4f0e6', x, y - 4, 3, 4); R(c, v > 0.5 ? '#8a5a34' : '#3f7a4a', x, y - 3, 3, 1); R(c, '#d2c9b6', x - 0, y - 5, 3, 1); R(c, '#bdb39e', x + 1, y - 6, 1, 1)
  }
  function cupFloor(c, x, y) { R(c, '#f4f0e6', x, y - 3, 4, 3); R(c, '#8a5a34', x + 1, y - 3, 1, 3); R(c, '#d2c9b6', x + 4, y - 3, 1, 3); R(c, 'rgba(90,55,25,.6)', x + 5, y - 1, 3, 1) }
  function pizza(c, x, y, v) {   // an open box: lid leaning back, a crust left in it
    R(c, '#a07848', x, y - 12, 2, 10); R(c, '#c9a26a', x + 1, y - 12, 1, 10); R(c, '#c8382a', x, y - 8, 2, 2)
    R(c, '#b88c56', x, y - 3, 14, 3); R(c, '#dcb47a', x + 1, y - 3, 12, 1); R(c, '#d89a4a', x + 4 + Math.round(v * 4), y - 4, 4, 1); R(c, '#c8382a', x + 5 + Math.round(v * 4), y - 4, 1, 1)
  }
  function stack(c, x, y, v, n) { for (let j = 0; j < n; j++) R(c, j % 2 ? PAPER[1] : PAPER[0], x + (j * 7 + Math.floor(v * 3)) % 3 - 1, y - 1 - j, 6, 1); R(c, '#2a2a33', x + 2, y - n - 1, 2, 1) }
  function stain(c, x, y, v, p) { const w = Math.max(2, Math.round((7 + v * 4) * p)); R(c, '#3e2410', x, y - 2, w, 2); if (w > 3) R(c, '#6a4020', x + 1, y - 3, w - 3, 1); R(c, '#8a6040', x + 2, y - 2, 1, 1) }
  function drift(c, x, y, k) {
    const r = rng(k)
    for (let j = 0; j < 7; j++) { const w = 24 - j * 3.4; for (let i = 0; i < w; i++) if (r() > 0.12) R(c, PAPER[Math.floor(r() * 4)], x + j * 1.7 + i, y - 1 - j, 1, 1) }
    ball(c, x + 3 + Math.floor(r() * 14), y - 6, r()); sheet(c, x + 18, y)
  }
  function bin(c, x, y, st, now) {   // x: centre
    if (st === 3) {   // tipped over, opening to the right, papers spilling out
      R(c, '#5a6470', x - 5, y - 6, 9, 6); R(c, '#46505c', x - 3, y - 6, 1, 6); R(c, '#46505c', x, y - 6, 1, 6); R(c, '#7a8490', x - 5, y - 6, 9, 1)
      R(c, '#7a8490', x + 4, y - 7, 1, 7); R(c, '#1e2228', x + 3, y - 5, 1, 4)
      sheet(c, x + 4, y); ball(c, x + 9, y, 0.8); ball(c, x + 5, y - 2, 0.2); sheet(c, x + 12, y)
      return
    }
    R(c, '#5a6470', x - 3, y - 7, 6, 7); R(c, '#7a8490', x - 3, y - 7, 6, 1); R(c, '#46505c', x - 2, y - 5, 1, 4); R(c, '#46505c', x + 1, y - 5, 1, 4)
    if (st >= 1) { R(c, PAPER[0], x - 2, y - 8, 4, 1); R(c, PAPER[2], x, y - 8, 1, 1) }
    if (st >= 2) { R(c, PAPER[1], x - 3, y - 9, 5, 1); ball(c, x - 1, y - 9, 0.2); ball(c, x + 4, y, 0.2); sheet(c, x - 10, y) }
  }
  function flies(c, x, y, now, k) {
    for (let i = 0; i < 4; i++) {
      const a = now / (260 + i * 37) + i * 1.9 + k, fx = x + Math.cos(a) * (5 + i) + Math.sin(a * 2.3) * 2, fy = y + Math.sin(a * 1.4) * 3 - (i % 2) * 3
      R(c, '#22201e', fx, fy, 1, 1); if (Math.floor(now / 90 + i) % 2) R(c, 'rgba(220,230,240,.7)', fx, fy - 1, 1, 1)
    }
  }
  const STICK = ['#f6e05e', '#f48fb1', '#a5e38a', '#8ad0ff', '#f6e05e']
  function stickies(c, x, y, k, n) {   // x, y: the monitor's top-left
    const r = rng(k)
    for (let i = 0; i < n; i++) {
      const side = r(), sx = side < 0.4 ? x - 2 + Math.floor(r() * 3) - (r() < 0.4 ? 3 : 0) : side < 0.8 ? x + 9 + Math.floor(r() * 3) + (r() < 0.4 ? 3 : 0) : x + 1 + Math.floor(r() * 8)
      const sy = side < 0.8 ? y + Math.floor(r() * 9) - (r() < 0.3 ? 4 : 0) : y - 2 - Math.floor(r() * 3)
      R(c, STICK[Math.floor(r() * STICK.length)], sx, sy, 3, 3); R(c, 'rgba(0,0,0,.18)', sx, sy + 2, 3, 1)
    }
  }

  function drawItem(c, it, a, now, p, m) {
    const drop = it.where === 'mon' || it.kind === 'stain' ? 0 : Math.round(-10 * (1 - p) * (1 - p) + (p > 0.7 ? -Math.sin((p - 0.7) / 0.3 * Math.PI) * 1.5 : 0)) * (it.where === 'floor' ? 1 : 0.5)
    const x = a.x, y = a.y + drop
    switch (it.kind) {
      case 'ball': return it.where === 'floor' ? balls(c, x, y, it.v) : ball(c, x, y, it.v)
      case 'sheet': return sheet(c, x, y)
      case 'cup': return cup(c, x, y, it.v)
      case 'cupfloor': return cupFloor(c, x, y)
      case 'pizza': return pizza(c, x, y, it.v)
      case 'stack': return stack(c, x, y, it.v, it.where === 'floor' ? 4 + Math.round(it.v * 4) : 3 + Math.round(it.v * 2))
      case 'stain': return stain(c, x, a.y, it.v, p)
      case 'drift': return drift(c, x, y, it.k)
      case 'flies': return flies(c, x, a.y, now, it.k)
      case 'sticky': return stickies(c, x, a.y, it.k, Math.max(1, Math.round((3 + it.v * 2) * p)))
    }
  }

  // ---------- drawing ----------
  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    for (const f of tower.floors) {
      if (f.kind !== 'session' || f.y < v.y0 - 10 || f.top > v.y1 + 10) continue
      const m = rooms.get(f.id), d = tower.desk(f.id); if (!m || !d) continue
      const g = m.items.findLast(it => BINS.has(it.kind) && it.born != null), st = g ? BINS.get(g.kind) : 0, bx = d.desk.x + BIN + 3
      out.push({ z: tower.Z.FLOOR + 2, draw: c => {
        // the mop's wet sheen on the floor strip
        for (const t of m.trail) { c.globalAlpha = 0.7 * (1 - (now - t.at) / 2600); R(c, '#eef8ff', t.x, f.y - 2, 2, 1); if ((t.x * 7) % 11 < 1) R(c, '#ffffff', t.x, f.y - 3, 1, 1) }
        c.globalAlpha = 1
        const o = fade(g, now)
        if (o < 1) { c.globalAlpha = 1 - o; bin(c, bx, f.y, 0, now) }
        c.globalAlpha = o; bin(c, bx, f.y, st, now); c.globalAlpha = 1
        for (const it of m.items) {
          if (it.born == null || it.where !== 'floor' || BINS.has(it.kind) || it.kind === 'flies') continue
          paint(c, it, f, d, now, m)
        }
      } })
      out.push({ z: tower.Z.FLOOR + 6, draw: c => {
        for (const it of m.items) if (it.born != null && (it.where !== 'floor' || it.kind === 'flies')) paint(c, it, f, d, now, m)
      } })
      if (m.sparkle) out.push({ z: tower.Z.TOP, draw: c => {
        c.fillStyle = '#fff6c2'
        for (const s of m.sparkle.pts) {
          const t = (now - m.sparkle.at - s.d) / 1400; if (t < 0 || t > 1) continue
          const k = Math.round(2.5 * Math.sin(t * Math.PI)); if (!k) continue
          c.globalAlpha = Math.sin(t * Math.PI); c.fillRect(Math.round(s.x) - k, Math.round(s.y), 2 * k + 1, 1); c.fillRect(Math.round(s.x), Math.round(s.y) - k, 1, 2 * k + 1)
        }
      } })
    }
  })
  const fade = (it, now) => it?.gone == null ? 1 : Math.max(0, 1 - (now - it.gone) / (OUT_S * 1000))
  function paint(c, it, f, d, now, m) {
    const a = anchor(it, f, d); if (!a) return
    const p = Math.min(1, Math.max(0, (now - it.born) / (IN_S * 1000))), o = fade(it, now)
    if (o <= 0) return
    c.globalAlpha = o; drawItem(c, it, a, now, p, m); c.globalAlpha = 1
    if (it.gone != null && o < 1) {   // a little dust puff where it was swept
      const t = 1 - o; c.fillStyle = '#e8e2d2'; c.globalAlpha = 0.6 * o
      for (let i = 0; i < 3; i++) c.fillRect(Math.round(a.x + 1 + (i - 1) * (1 + 3 * t)), Math.round(a.y - 2 - t * 4 - (i % 2)), 1, 1)
      c.globalAlpha = 1
    }
  }

  // ---------- hover ----------
  tower.on('hover', (w, person) => {
    if (person) return null
    for (const f of tower.floors) {
      if (f.kind !== 'session' || w.y < f.top || w.y > f.y + 1) continue
      const m = rooms.get(f.id), d = tower.desk(f.id); if (!m || !d) return null
      const hit = m.items.some(it => { if (it.born == null || it.gone != null) return false; const a = anchor(it, f, d); return a && w.x >= a.x - 2 && w.x <= a.x + (it.kind === 'drift' ? 18 : 8) && w.y >= a.y - 10 && w.y <= a.y + (it.where === 'mon' ? 12 : 1) })
      if (!hit) return null
      const pct = Math.round((m.held ?? m.lv) * 100)
      return `<div class="t">${api.esc(f.session.title)}</div><div>${m.clean ? 'the janitor is on it' : pct >= 90 ? 'utter chaos' : pct >= 80 ? 'a real mess' : pct >= 60 ? 'getting messy' : 'a little untidy'} — context ${pct}%</div><div class="m">${m.clean ? 'compacted: cleaning up' : 'a compaction brings the janitor'}</div>`
    }
    return null
  })

  // ---------- demo: fake one floor's context through /api/state so desk-kit's janitor sees the same compaction ----------
  if (demo) {
    const real = window.fetch.bind(window)
    let target = null, t0 = null, flown = false
    window.fetch = async (u, o) => {
      const r = await real(u, o)
      if (!String(u).startsWith('/api/state')) return r
      const data = await r.json(), now = performance.now()
      target ??= data.sessions[0]?.id; t0 ??= now
      const s = data.sessions.find(x => x.id === target), t = (now - t0) / 1000
      if (s) s.ext = { ...s.ext, 'context-meter': t < 23 ? { used: 0, window: 1e6, pct: Math.min(1, Math.max(0, (t - 1) / 20)) } : { used: 6e4, window: 1e6, pct: 0.06, compacted: true } }
      if (!flown && s && !new URLSearchParams(location.search).get('towerzoom')) { flown = true; setTimeout(() => tower.flyTo(target), 300) }
      return new Response(JSON.stringify(data), { status: r.status, headers: { 'content-type': 'application/json' } })
    }
  }
}
