// branch-metro: a metro map of the repo's branches on the subway station's back wall (snap.branchMetro,
// server/features/branch-metro.mjs). Trunk is the thick main line, each recent branch a coloured line that forks off it
// and, once merged, rejoins it at an interchange; today's merges are lit stations under the TODAY band, open branches
// end in a terminus (named at close zoom). Hover a line for its branch, last commit, ahead/behind and merge time.
// ?demo=branchmetro invents a map.
import { WALL_MAP as M } from './ci-subway.js'
import { R, pixText } from '../draw.js'

const COLS = ['#d8452e', '#2f78c8', '#e8a21a', '#3a9a52', '#9a4ab8', '#1aa0a8', '#c8508a', '#e86a1a', '#5a6ad8', '#8a7a5a']
const TRUNK = '#22252e', INK = '#3a3640', PAPER = '#f4f0e6', LIT = '#ffe14a'
const HEAD = 6, TY = M.y + 17, LANES = [-4, 4, -7, 7, -10, 10]
const PX0 = M.x + 5, PX1 = M.x + M.w - 7
const H = 3600_000, DAY = 24 * H
const ago = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + 'm' : m < 48 * 60 ? Math.round(m / 60) + 'h' : Math.round(m / 1440) + 'd' }
const midnight = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const params = api.params, demo = api.demo('branchmetro')
  let data = null, map = null

  tower.on('snapshot', snap => { if (demo) snap.branchMetro = fake(Date.now()) })
  tower.on('sync', snap => { data = snap.branchMetro || null; map = data ? layout(data, Date.now()) : null })
  tower.on('mode', on => {
    if (on && demo && !params.get('towerzoom')) setTimeout(() => tower.flyTo({ x: M.x + M.w / 2, y: M.y + M.h / 2 }, 7), 600)
  })

  // ---------- layout: time runs left to right on a square-root scale, so the last hours get room ----------
  function layout(d, now) {
    const bs = (d.branches || []).filter(b => b && b.name)
    const first = Math.min(now - 6 * H, ...bs.map(b => b.fork ?? b.last ?? now))
    const span = Math.min(now - (d.since ?? now - 14 * DAY), Math.max(6 * H, (now - first) * 1.12))
    // metro maps aren't to scale: blend linear time with the rank of the map's events, so a busy hour spreads out
    const ev = [...new Set([now - span, now, ...bs.flatMap(b => [b.fork, b.merged, b.last]).filter(t => t != null && t >= now - span && t <= now)])].sort((a, b) => a - b)
    const cdf = t => { let i = 0; while (i < ev.length - 2 && ev[i + 1] < t) i++; const a = ev[i], b = ev[i + 1] ?? a; return (i + (b > a ? (t - a) / (b - a) : 0)) / Math.max(1, ev.length - 1) }
    const x = t => { t = Math.min(now, Math.max(now - span, t)); return PX0 + (PX1 - PX0) * (0.3 * (1 - (now - t) / span) + 0.7 * cdf(t)) }
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
      const o = LANES[lane], dd = Math.abs(o), y = TY + o, col = COLS[(api.hash(b.name) + i) % COLS.length]
      const pts = b.merged ? [[g.f, TY], [g.f + dd, y], [g.e - dd, y], [g.e, TY]] : [[g.f, TY], [g.f + dd, y], [g.e, y]]
      lines.push({ b, col, pts, y, lane, today: !!b.merged && b.merged >= midnight(now) })
    })
    const commits = (d.commits || []).filter(c => now - c.t <= span).map(c => Math.round(x(c.t)))
    return { now, span, x, lines, skipped, commits, today: Math.round(x(midnight(now))), since: now - span }
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
  function draw(c, now) {
    const m = map
    R(c, '#2a2630', M.x - 1, M.y - 1, M.w + 2, M.h + 2); R(c, PAPER, M.x, M.y, M.w, M.h)
    R(c, '#1a3a7a', M.x, M.y, M.w, HEAD); pixText(c, 'BRANCH LINES', M.x + 3, M.y + 1, PAPER)
    if (!m) { pixText(c, data === null ? 'NO REPO' : 'NO DATA', M.x + 50, TY - 2, '#8a8478'); return }
    const tx = Math.max(PX0, m.today)
    if (tx < PX1) {
      R(c, 'rgba(255,225,74,.28)', tx, M.y + HEAD, M.x + M.w - tx, M.h - HEAD); R(c, '#e8c23a', tx, M.y + HEAD, 1, M.h - HEAD)
      const lx = Math.min(M.x + M.w - 23, Math.max(M.x + 54, tx)); R(c, LIT, lx, M.y + 0, 22, HEAD); pixText(c, 'TODAY', lx + 1, M.y + 1, '#3a2a00')
    }
    for (const l of m.lines) stroke(c, l.pts, l.col, 2)
    R(c, TRUNK, M.x + 2, TY - 1, PX1 - M.x, 3)
    R(c, TRUNK, M.x + M.w - 5, TY - 2, 1, 5); R(c, TRUNK, M.x + M.w - 4, TY - 1, 1, 3); R(c, TRUNK, M.x + M.w - 3, TY, 1, 1)
    c.fillStyle = PAPER; let last = -9; for (const x of m.commits) if (x - last >= 2) { c.fillRect(x, TY, 1, 1); last = x }
    for (const l of m.lines) {
      const [a, b] = [l.pts[1], l.pts[2]], n = Math.min(l.b.ahead || 0, Math.floor((b[0] - a[0] - 2) / 3))
      c.fillStyle = PAPER; for (let k = 1; k <= n; k++) c.fillRect(Math.round(a[0] + k * (b[0] - a[0]) / (n + 1)), l.y - 1, 1, 1)
      ring(c, l.pts[0][0], TY, '#fff', INK)
      if (l.b.merged) {
        const e = l.pts[3][0]
        if (l.today) { const on = Math.floor(now / 600) % 2; ring(c, e, TY, on ? LIT : '#fff3a0', '#8a6a00'); R(c, '#e8a21a', e, TY - 6, 1, 3); R(c, LIT, e + 1, TY - 6, 2, 2) }
        else ring(c, e, TY, '#fff', INK)
      } else {
        const [ex, ey] = l.pts[2]
        R(c, INK, ex + 1, ey - 3, 1, 6); R(c, '#fff', ex - 1, ey - 1, 2, 2)
      }
    }
  }
  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    if (v.x1 < M.x - 2 || v.x0 > M.x + M.w + 2 || v.y1 < M.y - 2 || v.y0 > M.y + M.h + 2) return
    out.push({ z: Z.BEHIND + 40.5, draw: c => draw(c, now) })
  })
  tower.on('glow', (c, now, n) => {
    if (n < 0.03 || !map) return
    for (const l of map.lines) if (l.today) {
      const x = l.pts[3][0], g = c.createRadialGradient(x, TY, 0, x, TY, 6)
      g.addColorStop(0, `rgba(255,225,90,${0.3 * n})`); g.addColorStop(1, 'rgba(255,225,90,0)'); c.fillStyle = g; c.fillRect(x - 6, TY - 6, 12, 12)
    }
  })

  // ---------- close up: terminus names ----------
  tower.on('overlay', c => {
    if (!map || tower.zoom < 4) return
    const k = tower.zoom, fs = Math.max(8, Math.min(13, k * 1.5)), f = tower.font(fs, 700)
    c.save(); c.font = f; c.textBaseline = 'middle'
    for (const l of map.lines) {
      if (l.b.merged) continue
      const [ex, ey] = l.pts[2], p = tower.worldToScreen(ex + 2.5, ey), name = tower.fitText(short(l.b.name), 14 * k, f), w = c.measureText(name).width
      if (p.x < -50 || p.x > c.canvas.width || p.y < -20 || p.y > c.canvas.height + 20) continue
      const left = p.x + w + 6 > tower.worldToScreen(M.x + M.w, 0).x, x = left ? tower.worldToScreen(ex - 2, 0).x - w - 4 : p.x
      c.fillStyle = 'rgba(244,240,230,.88)'; c.fillRect(x - 2, p.y - fs / 2 - 1, w + 4, fs + 2)
      c.fillStyle = l.col; c.fillRect(left ? x + w + 2 : x - 2, p.y - fs / 2 - 1, 2, fs + 2)
      c.fillStyle = '#22252e'; c.fillText(name, x, p.y + 0.5)
    }
    c.restore()
  })
  const short = n => String(n).split('/').pop()

  // ---------- hover / click ----------
  function hit(w) {
    if (!map || w.x < M.x - 1 || w.x > M.x + M.w + 1 || w.y < M.y - 1 || w.y > M.y + M.h + 1) return null
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
    const now = Date.now()
    if (h.line) {
      const b = h.line.b, sw = `<span style="color:${h.line.col}">■</span>`
      const st = b.merged ? `<b style="color:#5fd17a">merged</b> ${ago(now - b.merged)} ago${h.line.today ? ' · today' : ''}` : `<b style="color:#f2a43a">open</b> · last commit ${ago(now - b.last)} ago`
      return `<div class="t">${sw} ${esc(b.name)}</div><div class="m">${st}</div><div class="m">${b.ahead ?? '?'} ahead · ${b.behind ?? '?'} behind ${esc(data?.trunk || 'trunk')}</div>`
        + (b.subject ? `<div class="m">last: ${esc(b.subject)}</div>` : '') + (b.mergedSubject ? `<div class="m">into ${esc(data?.trunk || 'trunk')}: ${esc(b.mergedSubject)}</div>` : '')
    }
    const lines = map?.lines || [], today = lines.filter(l => l.today).length, open = lines.filter(l => !l.b.merged).length
    return `<div class="t">🚇 Branch lines${data?.repo ? ' · ' + esc(data.repo) : ''}</div><div class="m">${esc(data?.trunk || 'trunk')}: ${map?.commits.length ?? 0} commits in the last ${ago(map?.span || 0)}</div>`
      + `<div class="m">${today} merged today · ${open} open${map?.skipped.length ? ` · +${map.skipped.length} not drawn` : ''}</div><div class="m">hover a line for its branch</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h) return false
    if (data?.repo) api.openLink(h.line ? `https://github.com/${data.repo}/${h.line.b.merged ? 'pulls?q=' + encodeURIComponent('head:' + h.line.b.name) : 'tree/' + h.line.b.name}` : `https://github.com/${data.repo}/branches`)
    return true
  })

  // ---------- demo ----------
  function fake(now) {
    const t = h => now - h * H, commits = []
    for (let h = 0.3; h < 80; h += 0.55 + (Math.sin(h * 3.1) + 1) * 0.6) commits.push({ t: t(h), s: `skyline: change ${Math.round(h * 10)}` })
    const b = (name, fork, last, ahead, behind, merged, subject, mergedSubject) => ({ name, fork: t(fork), last: t(last), ahead, behind, merged: merged == null ? null : t(merged), subject, mergedSubject, local: true, remote: true })
    const hr = new Date(now).getHours() + new Date(now).getMinutes() / 60, today = h => Math.min(h, Math.max(0.2, hr - 0.3))
    return { at: now, since: now - 14 * DAY, repo: 'acme/skyline', trunk: 'main', commits, branches: [
      b('feature/sky-41-dark-mode', 30, 7, 9, 14, 6, 'theme: the dark palette for charts', 'web: dark mode for every page (#212) [SKY-41]'),
      b('fix/sky-57-flaky-login', today(5), today(1.4), 2, 3, today(1.1), 'auth: wait for the session cookie', 'auth: the login test waits for its cookie (#218) [SKY-57]'),
      b('alice-dev/search-v2', 52, 3, 14, 40, null, 'search: rank exact matches first'),
      b('bob/sky-63-invoice-pdf', 20, today(2.2), 5, 9, today(0.4), 'billing: embed the logo in the PDF', 'billing: invoices download as PDF (#220) [SKY-63]'),
      b('chore/deps-bump', 9, 8, 1, 6, 8.5, 'deps: bump the lockfile', 'deps: bump every minor (#215)'),
      b('feature/sky-70-offline-cache', 11, 0.3, 6, 5, null, 'app: cache the last sync on disk'),
      b('carol/sky-72-onboarding-copy', 26, 22, 3, 18, 21, 'copy: shorter welcome screen', 'onboarding: shorter copy (#209) [SKY-72]'),
      b('fix/sky-74-tz-drift', today(1.5), 0.15, 2, 1, null, 'time: store UTC, render local'),
      b('spike/ledger-rewrite', 70, 34, 21, 60, null, 'ledger: try an append-only table'),
    ] }
  }
}
