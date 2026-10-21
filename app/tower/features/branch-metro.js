// branch-metro: a metro map of the repo's branches on the subway station's back wall (snap.branchMetro,
// server/features/branch-metro.mjs). Trunk is the thick main line, each recent branch a coloured line that forks off it
// and, once merged, rejoins it at an interchange; today's merges are lit stations under the TODAY band, open branches
// end in a terminus (named at close zoom). Live: a new commit sends a train along its line (trunk too), a merge runs a
// train into trunk and the interchange bursts with a chime, a rebase slides the fork forward. A branch quiet for a week
// goes grey behind a no-entry sign; one far behind trunk gets a red signal; your own lines (author = user.email) are
// bold and the rest muted. Release tags are flagged stations, one colour per product prefix (site-v1.2 vs v3.0). When
// trunk's latest CI run of any workflow failed the map reads NO SERVICE. Click the header to replay the last week.
// Hover a line, a tag or the header; click a line or tag for GitHub. ?demo=branchmetro invents a map that moves.
import { WALL_MAP as M } from './ci-subway.js'
import { R, pixText } from '../draw.js'

const COLS = ['#d8452e', '#2f78c8', '#e8a21a', '#3a9a52', '#9a4ab8', '#1aa0a8', '#c8508a', '#e86a1a', '#5a6ad8', '#8a7a5a']
const PCOLS = ['#1a3a7a', '#b8282a', '#1a7a4a', '#7a3aa8', '#c86a10', '#0a7a8a']
const TRUNK = '#22252e', INK = '#3a3640', PAPER = '#f4f0e6', LIT = '#ffe14a', GREY = '#aaa49a'
const HEAD = 6, TY = M.y + 22, LANES = [-5, 5, -10, 10, -14, 14]
const PX0 = M.x + 5, PX1 = M.x + M.w - 7
const H = 3600_000, DAY = 24 * H, STALE = 7 * DAY, BEHIND = 40, TRAIN = 2600, BURST = 3500, HOP = 1400, REPLAY = 14000
const BAD = /failure|timed_out|startup_failure/
const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const ago = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + 'm' : m < 48 * 60 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd' }
const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const mix = (a, b, k) => '#' + [1, 3, 5].map(i => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - k) + parseInt(b.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('')
const ease = f => f < 0.5 ? 2 * f * f : 1 - (-2 * f + 2) ** 2 / 2

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const params = api.params, demo = api.demo('branchmetro')
  let data = null, map = null, outage = null, replay = null
  const trains = [], bursts = [], hops = new Map(), T0 = Date.now()

  tower.on('snapshot', snap => {
    if (!demo) return
    const now = Date.now(); snap.branchMetro = fake(now)
    snap.street ||= {}; snap.street.runs = [...(snap.street.runs || []).filter(r => r.id !== 'demo-trunk'), fakeTrunkRun(now)]
  })
  tower.on('sync', snap => {
    data = snap.branchMetro || null
    const now = Date.now(), old = map
    map = data ? layout(data, now) : null
    outage = trunkDown(snap.street?.runs, data?.trunk)
    if (map && old) events(old, map, now)
  })
  tower.on('mode', on => {
    if (on && demo && !params.get('towerzoom')) setTimeout(() => tower.flyTo({ x: M.x + M.w / 2, y: M.y + M.h / 2 }, 5), 600)
  })

  // ---------- layout: time runs left to right on a square-root scale, so the last hours get room ----------
  function layout(d, now) {
    const bs = (d.branches || []).filter(b => b && b.name)
    const tagT = (d.tags || []).map(t => t.t).filter(t => t >= (d.since ?? 0))   // releases in the window stretch the map to reach them
    const first = Math.min(now - 6 * H, ...bs.map(b => b.fork ?? b.last ?? now), ...tagT)
    const span = Math.min(now - (d.since ?? now - 14 * DAY), Math.max(6 * H, (now - first) * 1.12))
    // metro maps aren't to scale: blend linear time with the rank of the map's events, so a busy hour spreads out
    const ev = [...new Set([now - span, now, ...tagT, ...bs.flatMap(b => [b.fork, b.merged, b.last]).filter(t => t != null && t >= now - span && t <= now)])].sort((a, b) => a - b)
    const cdf = t => { let i = 0; while (i < ev.length - 2 && ev[i + 1] < t) i++; const a = ev[i], b = ev[i + 1] ?? a; return (i + (b > a ? (t - a) / (b - a) : 0)) / Math.max(1, ev.length - 1) }
    const x = t => { t = Math.min(now, Math.max(now - span, t)); return PX0 + (PX1 - PX0) * (0.3 * (1 - (now - t) / span) + 0.7 * cdf(t)) }
    const anyMine = bs.some(b => b.mine)
    const lanes = LANES.map(() => []), lines = [], skipped = []
    bs.forEach((b, i) => {
      const end = b.merged ?? b.last ?? now
      let fx = Math.round(x(b.fork ?? now - span)), ex = Math.round(x(end))
      const fits = o => { const d = Math.abs(o), need = b.merged ? 2 * d + 4 : d + 5
        const f = Math.max(PX0, Math.min(fx, ex - need)), e = Math.max(ex, f + need)
        return { f, e: Math.min(PX1, e) } }
      let lane = -1, g = null
      for (let k = 0; k < LANES.length && lane < 0; k++) {
        const q = fits(LANES[k]), a = q.f - 2, z = q.e + (b.merged ? 2 : 5)
        if (lanes[k].every(([u, v]) => z < u || a > v)) { lane = k; g = q; lanes[k].push([a, z]) }
      }
      if (lane < 0) { skipped.push(b); return }
      const o = LANES[lane], dd = Math.abs(o), y = TY + o
      const stale = !b.merged && now - (b.last ?? now) > STALE, behind = !b.merged && !stale && (b.behind ?? 0) >= BEHIND
      const base = COLS[(api.hash(b.name) + i) % COLS.length]
      const col = stale ? GREY : anyMine && !b.mine ? mix(base, PAPER, 0.45) : base
      const pts = b.merged ? [[g.f, TY], [g.f + dd, y], [g.e - dd, y], [g.e, TY]] : [[g.f, TY], [g.f + dd, y], [g.e, y]]
      lines.push({ b, col, base, pts, y, lane, stale, behind, mine: !!b.mine, today: !!b.merged && b.merged >= midnight(now) })
    })
    const commits = (d.commits || []).filter(c => now - c.t <= span).map(c => ({ t: c.t, x: Math.round(x(c.t)) }))
    const products = [...new Set((d.tags || []).map(t => t.product))]
    const tags = (d.tags || []).filter(t => now - t.t <= span).map(t => ({ ...t, x: Math.round(x(t.t)), col: PCOLS[products.indexOf(t.product) % PCOLS.length] }))
    return { now, span, x, lines, skipped, commits, tags, top: d.commits?.[0]?.t ?? 0, today: Math.round(x(midnight(now))), since: now - span }
  }

  // ---------- live events: what changed since the last sync ----------
  function events(old, m, now) {
    const was = new Map(old.lines.map(l => [l.b.name, l]))
    for (const l of m.lines) {
      const o = was.get(l.b.name); if (!o) continue
      if (l.b.merged && !o.b.merged) trains.push({ line: l, t0: now, merge: true })
      else if (!l.b.merged && (l.b.last ?? 0) > (o.b.last ?? 0)) trains.push({ line: l, t0: now })
      if (!l.b.merged && !o.b.merged && (l.b.fork ?? 0) > (o.b.fork ?? 0) && o.pts.length === l.pts.length) hops.set(l.b.name, { from: o.pts, t0: now })
    }
    if (m.top > old.top && old.top) trains.push({ trunk: true, t0: now })
    if (trains.length > 12) trains.splice(0, trains.length - 12)
  }
  function trunkDown(runs, trunk) {
    if (!trunk || !runs?.length) return null
    const latest = new Map()
    for (const r of runs) if (r.branch === trunk && r.status === 'completed' && !/skipped|cancelled/.test(r.conclusion || '')) {
      const p = latest.get(r.workflow); if (!p || r.createdAt > p.createdAt) latest.set(r.workflow, r)
    }
    const bad = [...latest.values()].filter(r => BAD.test(r.conclusion || ''))
    return bad.length ? bad : null
  }
  function chime() {
    const lv = api.soundscape?.level() ?? 0, ctx = api.soundscape?.ctx
    if (!lv || !ctx || ctx.state !== 'running') return
    const dest = api.soundscape.out || ctx.destination, t = ctx.currentTime
    ;[[659, 0], [988, 0.16], [1319, 0.32]].forEach(([f, d]) => {
      const o = ctx.createOscillator(), g = ctx.createGain(); o.type = 'sine'; o.frequency.value = f
      g.gain.setValueAtTime(0.0001, t + d); g.gain.exponentialRampToValueAtTime(0.12 * lv, t + d + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.9)
      o.connect(g).connect(dest); o.start(t + d); o.stop(t + d + 0.95)
    })
  }

  // ---------- geometry ----------
  const lenOf = pts => { let L = 0; for (let i = 1; i < pts.length; i++) L += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return L }
  function along(pts, f) {
    let left = lenOf(pts) * Math.max(0, Math.min(1, f))
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay)
      if (left <= L || i === pts.length - 1) { const k = L ? Math.min(1, left / L) : 0; return [ax + (bx - ax) * k, ay + (by - ay) * k] }
      left -= L
    }
    return pts[pts.length - 1]
  }
  function clip(pts, xv) {   // the part of a line left of the replay's playhead
    const out = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i]
      if (bx <= xv) { out.push(pts[i]); continue }
      if (ax < xv) out.push([xv, ay + (by - ay) * (xv - ax) / (bx - ax)])
      break
    }
    return out
  }
  function shown(l, t) {   // a line's points, mid-hop if its fork just moved
    const h = hops.get(l.b.name); if (!h) return l.pts
    const f = (t - h.t0) / HOP; if (f >= 1) { hops.delete(l.b.name); return l.pts }
    const k = ease(f); return l.pts.map((p, i) => [Math.round(h.from[i][0] + (p[0] - h.from[i][0]) * k), p[1]])
  }

  // ---------- drawing ----------
  const stroke = (c, pts, col, w) => {
    c.fillStyle = col
    for (let i = 1; i < pts.length; i++) {
      const [ax, ay] = pts[i - 1], [bx, by] = pts[i], n = Math.max(Math.abs(bx - ax), Math.abs(by - ay))
      for (let s = 0; s <= n; s++) c.fillRect(Math.round(ax + (bx - ax) * s / (n || 1)), Math.round(ay + (by - ay) * s / (n || 1)) - (w >> 1), w, w)
    }
  }
  const ring = (c, x, y, fill, edge) => { R(c, edge, x - 1, y - 2, 3, 5); R(c, edge, x - 2, y - 1, 5, 3); R(c, fill, x - 1, y - 1, 3, 3) }
  const car = (c, x, y, col) => { x = Math.round(x); y = Math.round(y); R(c, '#14161c', x - 3, y - 2, 7, 4); R(c, col, x - 2, y - 1, 5, 2); R(c, '#fff8d0', x + 1, y - 1, 1, 1) }
  function header(c, t, vnow) {
    const down = outage && !replay, on = Math.floor(t / 500) % 2
    R(c, down ? (on ? '#b8221c' : '#6a1210') : replay ? '#3a2a6a' : '#1a3a7a', M.x, M.y, M.w, HEAD)
    if (replay) { const d = new Date(vnow); pixText(c, `REPLAY ${DAYS[d.getDay()]} ${String(d.getHours()).padStart(2, '0')}:00`, M.x + 3, M.y + 1, '#e8dcff'); return }
    pixText(c, down ? 'NO SERVICE' : 'BRANCH LINES', M.x + 3, M.y + 1, down && on ? '#fff' : PAPER)
  }
  function draw(c) {
    const m = map, t = Date.now()
    R(c, '#2a2630', M.x - 1, M.y - 1, M.w + 2, M.h + 2); R(c, PAPER, M.x, M.y, M.w, M.h)
    if (!m) { header(c, t); pixText(c, data === null ? 'NO REPO' : 'NO DATA', M.x + 50, TY - 2, '#8a8478'); return }
    let vnow = m.now, xv = PX1 + 9
    if (replay) {
      const f = (t - replay.t0) / REPLAY, from = Math.max(m.since, m.now - 7 * DAY)
      if (f >= 1) replay = null
      else {
        // sweep the map at an even pace (it isn't to scale), and find the moment under the playhead
        const x0 = m.x(from), want = x0 + (PX1 - x0) * f; let lo = from, hi = m.now
        for (let k = 0; k < 28; k++) { const mid = (lo + hi) / 2; if (m.x(mid) < want) lo = mid; else hi = mid }
        vnow = lo; xv = Math.round(want)
        for (const l of m.lines) if (l.b.merged && l.b.merged > replay.v && l.b.merged <= vnow) bursts.push({ x: l.pts[3][0], t0: t, quiet: true })
        replay.v = vnow
      }
    }
    header(c, t, vnow)
    const tx = Math.max(PX0, m.today)
    if (!replay && tx < PX1) {
      R(c, 'rgba(255,225,74,.28)', tx, M.y + HEAD, M.x + M.w - tx, M.h - HEAD); R(c, '#e8c23a', tx, M.y + HEAD, 1, M.h - HEAD)
      const lx = Math.min(M.x + M.w - 23, Math.max(M.x + 54, tx)); R(c, LIT, lx, M.y + 0, 22, HEAD); pixText(c, 'TODAY', lx + 1, M.y + 1, '#3a2a00')
    }
    // release flags: a pole from under the header down to trunk, one colour per product
    for (const g of m.tags) if (g.x <= xv) {
      c.fillStyle = mix(g.col, PAPER, 0.4); for (let y = M.y + HEAD + 3; y < TY - 2; y += 2) c.fillRect(g.x, y, 1, 1)
      R(c, g.col, g.x, M.y + HEAD, 1, 3); R(c, g.col, g.x + 1, M.y + HEAD, 4, 3); R(c, PAPER, g.x + 2, M.y + HEAD + 1, 2, 1)
    }
    const vis = m.lines.filter(l => !replay || (l.b.fork ?? 0) <= vnow).map(l => ({ l, pts: replay ? clip(l.pts, xv) : shown(l, t) }))
    for (const { l, pts } of vis) if (pts.length > 1) stroke(c, pts, l.col, l.mine ? 3 : 2)
    if (outage && !replay) {   // trunk out of service: hazard stripes crawl along it
      R(c, '#b8221c', M.x + 2, TY - 1, PX1 - M.x, 3); c.fillStyle = TRUNK
      for (let x = M.x + 2 + (Math.floor(t / 120) % 6); x < PX1; x += 6) c.fillRect(x, TY - 1, 3, 3)
    } else R(c, TRUNK, M.x + 2, TY - 1, Math.min(PX1 + 2, xv) - M.x - 2, 3)
    if (!replay || xv >= PX1) { R(c, TRUNK, M.x + M.w - 5, TY - 2, 1, 5); R(c, TRUNK, M.x + M.w - 4, TY - 1, 1, 3); R(c, TRUNK, M.x + M.w - 3, TY, 1, 1) }
    c.fillStyle = PAPER; let last = -9; for (const { x } of m.commits) if (x <= xv && x - last >= 2) { c.fillRect(x, TY, 1, 1); last = x }
    for (const { l, pts } of vis) {
      if (pts.length < 2) continue
      if (pts.length > 2) {
        const [a, b] = [pts[1], pts[2]], n = Math.min(l.b.ahead || 0, Math.floor((b[0] - a[0] - 2) / 3))
        c.fillStyle = PAPER; for (let k = 1; k <= n; k++) c.fillRect(Math.round(a[0] + k * (b[0] - a[0]) / (n + 1)), l.y - 1, 1, 1)
      }
      ring(c, pts[0][0], TY, '#fff', INK)
      const whole = !replay || pts.length === l.pts.length && pts[pts.length - 1][0] === l.pts[l.pts.length - 1][0]
      if (!whole) continue
      if (l.b.merged) {
        const e = pts[3][0]
        if (l.today && !replay) { const on = Math.floor(t / 600) % 2; ring(c, e, TY, on ? LIT : '#fff3a0', '#8a6a00'); R(c, '#e8a21a', e, TY - 6, 1, 3); R(c, LIT, e + 1, TY - 6, 2, 2) }
        else ring(c, e, TY, '#fff', INK)
      } else if (l.stale) {   // overgrown, with a no-entry sign
        const [ex, ey] = pts[2]
        c.fillStyle = '#5a8a3a'; for (const [dx, dy] of [[-3, -1], [-2, -2], [0, -2], [1, -1], [-5, -1]]) c.fillRect(ex + dx, ey + dy, 1, 1)
        R(c, INK, ex + 2, ey - 3, 1, 6); R(c, '#c8281e', ex + 1, ey - 6, 5, 4); R(c, '#fff', ex + 2, ey - 5, 3, 1)
      } else {
        const [ex, ey] = pts[2]
        R(c, INK, ex + 1, ey - 3, 1, 6); R(c, l.mine ? LIT : '#fff', ex - 1, ey - 1, 2, 2)
      }
      if (l.behind && !replay) {   // a red signal at the fork: rebase me
        const [sx, sy] = pts[1], above = sy < TY, on = Math.floor(t / 900) % 2   // on the trunk side, clear of the header
        R(c, INK, sx + 2, above ? sy + 2 : sy - 5, 1, 3); R(c, on ? '#ff3a2a' : '#7a1a16', sx + 1, above ? sy + 4 : sy - 6, 3, 2)
      }
    }
    for (const g of m.tags) if (g.x <= xv) { R(c, INK, g.x - 2, TY - 3, 5, 7); R(c, g.col, g.x - 1, TY - 2, 3, 5); R(c, '#fff', g.x, TY - 1, 1, 3) }
    // trains: commits ride their line fork→tip, merges ride into trunk, trunk commits run the main line
    for (let i = trains.length - 1; i >= 0; i--) {
      const tr = trains[i], f = (t - tr.t0) / TRAIN
      if (f >= 1) {
        trains.splice(i, 1)
        if (tr.merge) { bursts.push({ x: tr.line.pts[3][0], t0: t }); chime() }
        continue
      }
      if (replay) continue
      const pts = tr.trunk ? [[PX0, TY], [PX1, TY]] : tr.line.pts, [x, y] = along(pts, ease(f))
      car(c, x, y, tr.trunk ? LIT : tr.line.base)
    }
    for (let i = bursts.length - 1; i >= 0; i--) {   // an interchange celebrating a merge
      const b = bursts[i], f = (t - b.t0) / (b.quiet ? 900 : BURST); if (f >= 1) { bursts.splice(i, 1); continue }
      const r = Math.round(2 + f * (b.quiet ? 4 : 9)), on = Math.floor(t / 150) % 2
      ring(c, b.x, TY, on ? LIT : '#fff', '#8a6a00')
      c.fillStyle = on ? '#e8a21a' : LIT
      for (let k = 0; k < 8; k++) { const a = k * Math.PI / 4 + f; c.fillRect(Math.round(b.x + Math.cos(a) * r), Math.round(TY + Math.sin(a) * r * 0.8), 1, 1) }
    }
    if (replay) R(c, '#7a4ad8', xv, M.y + HEAD, 1, M.h - HEAD)
  }
  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    if (v.x1 < M.x - 2 || v.x0 > M.x + M.w + 2 || v.y1 < M.y - 2 || v.y0 > M.y + M.h + 2) return
    out.push({ z: Z.BEHIND + 40.5, draw: c => draw(c) })
  })
  tower.on('glow', (c, now, n) => {
    if (n < 0.03 || !map) return
    const spot = (x, a) => { const g = c.createRadialGradient(x, TY, 0, x, TY, 6); g.addColorStop(0, `rgba(255,225,90,${a * n})`); g.addColorStop(1, 'rgba(255,225,90,0)'); c.fillStyle = g; c.fillRect(x - 6, TY - 6, 12, 12) }
    for (const l of map.lines) if (l.today) spot(l.pts[3][0], 0.3)
    for (const b of bursts) spot(b.x, 0.6)
  })

  // ---------- close up: terminus names (with your initials) and release labels ----------
  tower.on('overlay', c => {
    if (!map || tower.zoom < 4 || replay) return
    const k = tower.zoom, fs = Math.max(8, Math.min(13, k * 1.5)), f = tower.font(fs, 700), right = tower.worldToScreen(M.x + M.w, 0).x
    c.save(); c.font = f; c.textBaseline = 'middle'
    const placed = []
    const label = (wx, wy, text, col, edge, ink, stack) => {
      const p = tower.worldToScreen(wx, wy), name = tower.fitText(text, 16 * k, f), w = c.measureText(name).width
      if (p.x < -50 || p.x > c.canvas.width || p.y < -20 || p.y > c.canvas.height + 20) return
      const left = p.x + w + 6 > right, x = left ? p.x - w - 4.5 * k : p.x
      if (stack) { while (placed.some(r => x < r.x + r.w + 4 && r.x - 6 * k < x + w + 2 && Math.abs(r.y - p.y) < fs + 2)) p.y += fs + 3; placed.push({ x, y: p.y, w }) }
      c.fillStyle = col; c.fillRect(x - 2, p.y - fs / 2 - 1, w + 4, fs + 2)
      c.fillStyle = edge; c.fillRect(left ? x + w + 2 : x - 2, p.y - fs / 2 - 1, 2, fs + 2)
      c.fillStyle = ink; c.fillText(name, x, p.y + 0.5)
    }
    for (const l of map.lines) {
      if (l.b.merged) continue
      const [ex, ey] = l.pts[2]
      label(ex + 2.5, ey, (l.mine && data?.me ? data.me + ' · ' : '') + short(l.b.name) + (l.stale ? ' · closed' : ''), 'rgba(244,240,230,.88)', l.col, '#22252e')
    }
    for (const g of map.tags) label(g.x + 5.5, M.y + HEAD + 1.5, g.product ? `${g.product} ${g.version}` : g.name, g.col, g.col, '#fff', true)
    c.restore()
  })
  const short = n => String(n).split('/').pop()

  // ---------- hover / click ----------
  function hit(w) {
    if (!map || w.x < M.x - 1 || w.x > M.x + M.w + 1 || w.y < M.y - 1 || w.y > M.y + M.h + 1) return null
    if (w.y < M.y + HEAD) return { header: true }
    for (const g of map.tags) if (Math.abs(w.x - g.x) < 2.5 && (Math.abs(w.y - TY) < 4 || (w.y < M.y + HEAD + 4 && w.x >= g.x - 1 && w.x <= g.x + 6))) return { tag: g }
    let best = null, bd = 2.6
    for (const l of map.lines) for (let i = 1; i < l.pts.length; i++) {
      const [ax, ay] = l.pts[i - 1], [bx, by] = l.pts[i], dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((w.x - ax) * dx + (w.y - ay) * dy) / L)), d = Math.hypot(ax + t * dx - w.x, ay + t * dy - w.y)
      if (d < bd && !(Math.abs(w.y - TY) < 2 && i !== 2)) { bd = d; best = l }
    }
    return best ? { line: best } : { map: true }
  }
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    const now = Date.now(), trunk = esc(data?.trunk || 'trunk')
    if (h.header) return `<div class="t">⏪ Replay the week</div><div class="m">click to watch the last seven days of branches fork, grow and merge</div>`
    if (h.tag) return `<div class="t"><span style="color:${h.tag.col}">⚑</span> ${esc(h.tag.name)}</div><div class="m">${h.tag.product ? esc(h.tag.product) + ' release · ' : 'release · '}${ago(now - h.tag.t)} ago</div><div class="m">↗ click for the release</div>`
    if (h.line) {
      const l = h.line, b = l.b, sw = `<span style="color:${l.col}">■</span>`
      const st = b.merged ? `<b style="color:#5fd17a">merged</b> ${ago(now - b.merged)} ago${l.today ? ' · today' : ''}`
        : l.stale ? `<b style="color:#aaa49a">closed</b> · no commit for ${ago(now - b.last)}` : `<b style="color:#f2a43a">open</b> · last commit ${ago(now - b.last)} ago`
      return `<div class="t">${sw} ${esc(b.name)}${l.mine ? ' · yours' : ''}</div><div class="m">${st}</div><div class="m">${b.ahead ?? '?'} ahead · ${b.behind ?? '?'} behind ${trunk}</div>`
        + (l.behind ? `<div class="m" style="color:#ff6a5a">🚦 far behind ${trunk} — rebase me</div>` : '')
        + (b.subject ? `<div class="m">last: ${esc(b.subject)}</div>` : '') + (b.mergedSubject ? `<div class="m">into ${trunk}: ${esc(b.mergedSubject)}</div>` : '')
    }
    const lines = map?.lines || [], today = lines.filter(l => l.today).length, open = lines.filter(l => !l.b.merged && !l.stale).length, stale = lines.filter(l => l.stale).length
    return `<div class="t">🚇 Branch lines${data?.repo ? ' · ' + esc(data.repo) : ''}</div>`
      + (outage ? `<div class="m" style="color:#ff6a5a">⛔ no service: ${outage.map(r => esc(r.workflow || 'CI')).join(', ')} failing on ${trunk}</div>` : '')
      + `<div class="m">${trunk}: ${map?.commits.length ?? 0} commits in the last ${ago(map?.span || 0)}${map?.tags.length ? ` · ${map.tags.length} releases` : ''}</div>`
      + `<div class="m">${today} merged today · ${open} open${stale ? ` · ${stale} closed` : ''}${map?.skipped.length ? ` · +${map.skipped.length} not drawn` : ''}</div><div class="m">hover a line for its branch · click the header to replay the week</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h) return false
    if (h.header) { replay = { t0: Date.now(), v: 0 }; return true }
    if (!data?.repo) return true
    const repo = data.repo
    if (h.tag) api.openLink(`https://github.com/${repo}/releases/tag/${encodeURIComponent(h.tag.name)}`)
    else if (h.line) api.openLink(`https://github.com/${repo}/${h.line.b.merged ? 'pulls?q=' + encodeURIComponent('head:' + h.line.b.name) : 'tree/' + h.line.b.name}`)
    else if (outage?.[0]?.url) api.openLink(outage[0].url)
    else api.openLink(`https://github.com/${repo}/branches`)
    return true
  })

  // ---------- demo: a map that moves — commits every 12s, a merge each minute, a rebase, a trunk outage ----------
  function fake(now) {
    const t = h => T0 - h * H, hrs = abs => (T0 - abs) / H, commits = [], C = 60_000, ph = now % C   // pinned to page load, so only the live bits move
    commits.push({ t: now - (now % 20_000), s: 'skyline: the newest change' })
    for (let h = 0.3; h < 80; h += 0.55 + (Math.sin(h * 3.1) + 1) * 0.6) commits.push({ t: t(h), s: `skyline: change ${Math.round(h * 10)}` })
    const b = (name, fork, last, ahead, behind, merged, subject, mergedSubject, mine = false) => ({ name, fork: t(fork), last: t(last), ahead, behind, merged: merged == null ? null : t(merged), subject, mergedSubject, local: true, remote: true, mine })
    const hr = new Date(T0).getHours() + new Date(T0).getMinutes() / 60, today = h => Math.min(h, Math.max(0.2, hr - 0.3))
    const live = ph >= 36_000 ? hrs(now - ph + 36_000) : null, tick = hrs(now - (ph % 12_000)), hop = Math.floor(now / 40_000) % 2 ? 1.5 : 2.6
    return { at: now, since: now - 14 * DAY, repo: 'acme/skyline', trunk: 'main', me: 'ME', commits, branches: [
      b('feature/sky-41-dark-mode', 30, 7, 9, 14, 6, 'theme: the dark palette for charts', 'site: dark mode (#212) [SKY-41]'),
      b('fix/sky-57-tile-collision', today(5), today(1.4), 2, 3, today(1.1), 'game: wait a frame before the hit test', 'game: tile collision fix (#218) [SKY-57]'),
      b('alice-dev/search-v2', 52, 3, 14, 48, null, 'search: rank exact matches first'),
      b('bob/sky-63-save-slots', 20, today(2.2), 5, 9, today(0.4), 'game: name each save slot', 'game: save slots (#220) [SKY-63]'),
      b('chore/deps-bump', 9, 8, 1, 6, 8.5, 'deps: bump the lockfile', 'deps: bump every minor (#215)'),
      b('feature/sky-70-offline-cache', 11, tick, 6, 5, null, 'map: cache the last tiles on disk', null, true),
      b('carol/sky-72-onboarding-copy', 26, 22, 3, 18, 21, 'copy: shorter welcome screen', 'onboarding: shorter copy (#209) [SKY-72]'),
      b('fix/sky-74-tz-drift', hop, 0.15, 2, 1, null, 'time: store UTC, render local', null, true),
      b('dave/sky-80-live-board', 3.2, live ?? tick, 4, 2, live, 'board: refresh every minute', 'board: live refresh (#224) [SKY-80]'),
      b('spike/gallery-rewrite', 280, 220, 21, 60, null, 'gallery: try a masonry grid'),
    ], tags: [
      { name: 'site-v1.4.1', product: 'site', version: '1.4.1', t: t(today(4)) },
      { name: 'app-v2.1.0', product: 'app', version: '2.1.0', t: t(30) },
      { name: 'site-v1.4.0', product: 'site', version: '1.4.0', t: t(60) },
      { name: 'v3.0.0', product: '', version: '3.0.0', t: t(140) },
    ] }
  }
  function fakeTrunkRun(now) {   // trunk CI breaks for the last 15s of each minute
    const bad = now % 60_000 >= 45_000, at = new Date(now - 30_000).toISOString()
    return { id: 'demo-trunk', url: null, status: 'completed', conclusion: bad ? 'failure' : 'success', branch: 'main', workflow: 'CI', createdAt: at, updatedAt: at }
  }
}
