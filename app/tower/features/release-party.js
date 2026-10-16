// release-party: for 30 minutes after a release is published in the repo (snap.releases, server/features/release-party.mjs)
// a banner hangs across the tower front over the lobby, the street door wears a red ribbon with a bow and a bunch of
// balloons is tied up beside it, and now and then one floats off up the facade. A release published while the page is
// open bursts: a toast, a flight of balloons from the lobby door and confetti; one already out on page load just hangs.
// Hover the banner, ribbon or balloons for the release; click to open it. ?demo=releaseparty publishes one after 3 s.
import { R, pixText, textW } from '../draw.js'
const PARTY = 30 * 60_000, FADE = 60_000, BURST = 28, DRIFT = 7
const COLS = ['#e8453a', '#f4c43a', '#3a8ae8', '#4ac46a', '#e86ab8', '#f48a2a', '#9a5ae8']

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const demo = api.demo('releaseparty')
  const demoAt = Date.now() + 3000
  let rel = null, seen = null, first = true, balloons = [], confetti = [], nextDrift = 0

  tower.on('snapshot', data => {
    if (!demo) return
    data.releases = { repo: 'acme/skyline', list: Date.now() < demoAt ? [] : [{ tag: 'desktop-v0.6.0', name: 'Desktop v0.6.0', author: 'you', publishedAt: demoAt, prerelease: false, url: 'https://github.com/acme/skyline/releases' }] }
  })
  tower.on('sync', snap => {
    const now = Date.now(), list = snap.releases?.list || []
    if (first) { seen = new Set(list.map(r => r.tag)); first = false; rel = list.find(r => now - r.publishedAt < PARTY) || null; return }
    const fresh = list.find(r => !seen.has(r.tag) && now - r.publishedAt < PARTY)
    for (const r of list) seen.add(r.tag)
    if (fresh) { rel = fresh; burst(fresh) }
    if (rel && now - rel.publishedAt > PARTY) rel = null
  })
  const lobby = () => tower.floors.find(f => f.kind === 'lobby')
  const fade = () => rel ? Math.max(0, Math.min(1, (rel.publishedAt + PARTY - Date.now()) / FADE)) : 0

  // ---------- the banner: rope across the tower front at the lobby ceiling, bunting either side ----------
  function banner() {
    const f = lobby(); if (!f || !rel) return null
    const text = `${rel.tag} released`, k = textW(text, 2) + 30 <= 260 ? 2 : 1, w = textW(text, k) + 26, h = k === 2 ? 17 : 12
    const cx = 340, x = Math.round(cx - w / 2), y = f.top - 4
    return { x, y, w, h, k, text, rope: { x0: 196, x1: 488, y: f.top - 4 } }
  }
  function drawBanner(c, now, b) {
    const { rope } = b, sag = 3
    const ry = x => rope.y + Math.sin((x - rope.x0) / (rope.x1 - rope.x0) * Math.PI) * sag
    c.strokeStyle = '#5a4a3a'; c.lineWidth = 1; c.beginPath(); c.moveTo(rope.x0, rope.y); for (let x = rope.x0; x <= rope.x1; x += 4) c.lineTo(x, ry(x)); c.stroke()
    R(c, '#3a3640', rope.x0 - 1, rope.y - 2, 3, 4); R(c, '#3a3640', rope.x1 - 2, rope.y - 2, 3, 4)
    for (let x = rope.x0 + 6, i = 0; x < rope.x1 - 4; x += 9, i++) {
      if (x > b.x - 6 && x < b.x + b.w + 3) continue
      const y = ry(x), col = COLS[i % COLS.length], sw = Math.round(Math.sin(now / 400 + i) * 0.6)
      R(c, col, x + sw, y, 6, 2); R(c, col, x + 1 + sw, y + 2, 4, 2); R(c, col, x + 2 + sw, y + 4, 2, 2)
    }
    const sway = Math.sin(now / 900) * 0.8, x = b.x + sway, y = b.y
    R(c, '#3a2a2a', x + 2, y + b.h, b.w, 2)
    R(c, '#c8282e', x, y, b.w, b.h); R(c, '#e8453a', x, y, b.w, 2); R(c, '#9a1a20', x, y + b.h - 2, b.w, 2)
    for (let i = 0; i < b.w; i += 6) R(c, '#f4c43a', x + i, y + b.h, 3, 2)
    for (const ex of [x - 2, x + b.w]) { R(c, '#7a1a1e', ex, y + 1, 2, b.h - 2); R(c, '#9a1a20', ex - (ex < x ? 3 : -2), y + b.h - 4, 3, 5) }
    // a party popper and its spray
    const px = x + 5, py = y + Math.round(b.h / 2)
    R(c, '#f4c43a', px, py - 1, 2, 4); R(c, '#f4c43a', px + 2, py - 2, 2, 3); R(c, '#e8a21a', px + 4, py - 3, 2, 3)
    for (let i = 0; i < 4; i++) R(c, COLS[(i + Math.floor(now / 300)) % COLS.length], px + 6 + (i % 2) * 2, py - 5 + i * 2, 1, 1)
    pixText(c, b.text, x + 16, y + Math.round((b.h - 5 * b.k) / 2), '#fff4d0', b.k)
  }

  // ---------- the ribbon on the street door, and the balloons tied beside it ----------
  const KNOT = { x: -14, y: -1 }, BUNCH = [[-22, -30, 0], [-15, -34, 1], [-8, -29, 2], [-18, -24, 3]]
  function balloon(c, x, y, col, now, seed, string = 10) {
    x = Math.round(x); y = Math.round(y)
    R(c, col, x - 2, y - 7, 5, 1); R(c, col, x - 3, y - 6, 7, 5); R(c, col, x - 2, y - 1, 5, 1); R(c, col, x - 1, y, 3, 1)
    R(c, 'rgba(255,255,255,.55)', x - 2, y - 5, 1, 2); R(c, 'rgba(0,0,0,.22)', x + 2, y - 4, 1, 3); R(c, col, x, y + 1, 1, 1)
    c.fillStyle = 'rgba(70,60,60,.8)'
    for (let i = 2; i < string; i++) c.fillRect(x + Math.round(Math.sin(now / 300 + seed + i * 0.6) * 0.8), y + i, 1, 1)
  }
  function drawDoor(c, now) {
    const d = tower.lobby?.door; if (!d) return
    const y = d.y + Math.round(d.h * 0.55)
    R(c, '#c8282e', d.x - 1, y, d.w + 2, 3); R(c, '#e8453a', d.x - 1, y, d.w + 2, 1)
    const bx = d.x + d.w / 2
    R(c, '#c8282e', bx - 5, y - 3, 4, 4); R(c, '#c8282e', bx + 2, y - 3, 4, 4); R(c, '#9a1a20', bx - 1, y - 1, 3, 3)
    R(c, '#c8282e', bx - 3, y + 2, 2, 6); R(c, '#c8282e', bx + 2, y + 2, 2, 7); R(c, '#9a1a20', bx - 3, y + 7, 2, 1)
    R(c, '#5a5660', KNOT.x - 2, KNOT.y - 2, 5, 3)
    for (const [x, by, i] of BUNCH) {
      const bob = Math.sin(now / 700 + i * 1.7) * 1.2, top = by + bob
      c.strokeStyle = 'rgba(70,60,60,.75)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 0.5, top + 1); c.lineTo(KNOT.x + 0.5, KNOT.y - 2); c.stroke()
      balloon(c, x, top, COLS[i * 2 % COLS.length], now, i, 0)
    }
  }

  // ---------- burst, drifters, confetti ----------
  function launch(delay = 0) {
    const h = Math.random()
    balloons.push({ x: -16 + (h - 0.5) * 40, y: -24, vy: -(14 + Math.random() * 18), sway: 4 + Math.random() * 9, ph: Math.random() * 6, col: COLS[Math.floor(Math.random() * COLS.length)], wait: delay, seed: Math.random() * 9 })
  }
  function burst(r) {
    api.toast(`🎉 ${r.tag} released${r.author ? ' by ' + r.author : ''}`, 6000)
    for (let i = 0; i < BURST; i++) launch(i * 0.15)
    const b = banner(); if (!b) return
    for (let i = 0; i < 180; i++) {
      const fromDoor = i % 3 === 0, x = fromDoor ? -6 : b.x + Math.random() * b.w, y = fromDoor ? -20 : b.y + b.h / 2
      const a = fromDoor ? -Math.PI / 2 - 0.9 + Math.random() * 0.9 : -Math.PI / 2 + (Math.random() - 0.5) * 2.6, sp = 40 + Math.random() * 90
      confetti.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col: COLS[i % COLS.length], life: 5 + Math.random() * 3, ph: Math.random() * 6, wait: Math.random() * 0.4 })
    }
  }
  tower.on('step', (dt, now) => {
    if (rel && fade() > 0.3 && now > nextDrift) { if (nextDrift) launch(); nextDrift = now + DRIFT * 1000 * (0.6 + Math.random() * 0.8) }
    const ceil = (tower.floors.at(-1)?.top ?? -800) - 160
    for (const p of balloons) { if (p.wait > 0) { p.wait -= dt; continue } p.y += p.vy * dt; p.ph += dt }
    balloons = balloons.filter(p => p.y > ceil)
    for (const q of confetti) {
      if (q.wait > 0) { q.wait -= dt; continue }
      q.vy += 60 * dt; q.vx *= 1 - 1.6 * dt; q.vy = Math.min(q.vy, 26); q.x += (q.vx + Math.sin(q.ph * 5) * 8) * dt; q.y += q.vy * dt; q.ph += dt; q.life -= dt
    }
    confetti = confetti.filter(q => q.life > 0)
  })
  tower.on('items', (out, now) => {
    const k = fade()
    if (k > 0) {
      const b = banner()
      if (b) out.push({ z: Z.OUTSIDE + 6, draw: c => { c.globalAlpha = k; drawBanner(c, now, b) } })
      out.push({ z: Z.OUTSIDE + 5, draw: c => { c.globalAlpha = k; drawDoor(c, now) } })
    }
    if (balloons.length) out.push({ z: Z.OUTSIDE + 7, draw: c => { for (const p of balloons) if (p.wait <= 0) balloon(c, p.x + Math.sin(p.ph * 1.3) * p.sway, p.y, p.col, now, p.seed) } })
    if (confetti.length) out.push({ z: Z.TOP + 6, draw: c => {
      for (const q of confetti) { if (q.wait > 0) continue; c.globalAlpha = Math.min(1, q.life); const flip = Math.floor(q.ph * 8) % 3; R(c, q.col, q.x, q.y, flip === 1 ? 1 : 2, flip === 2 ? 1 : 2) }
    } })
  })
  tower.on('glow', (c, now, n) => {
    const b = banner(); if (!b || n < 0.05) return
    const g = c.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, 0, b.x + b.w / 2, b.y + b.h / 2, b.w / 2)
    g.addColorStop(0, `rgba(255,140,110,${0.3 * n * fade()})`); g.addColorStop(1, 'rgba(255,140,110,0)'); c.fillStyle = g; c.fillRect(b.x - 10, b.y - b.w / 2, b.w + 20, b.w)
  })

  // ---------- hover / click ----------
  const inR = (w, r, pad = 0) => w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
  function hit(w) {
    if (!rel || fade() <= 0) return false
    const b = banner(), d = tower.lobby?.door
    return !!(b && inR(w, b, 2)) || !!(d && inR(w, { x: -24, y: -48, w: d.x + d.w + 26, h: 48 }))
  }
  const card = r => `<div class="t">🎉 ${esc(r.tag)} released${r.prerelease ? ' <span style="color:#f2a43a">(pre-release)</span>' : ''}</div>`
    + `${r.name && r.name !== r.tag ? `<div class="m">${esc(r.name)}</div>` : ''}<div class="m">${r.author ? 'by ' + esc(r.author) + ' · ' : ''}${esc(api.ago(r.publishedAt))}</div><div class="m">↗ click for the release</div>`
  tower.on('hover', (w, person) => { if (person || !hit(w)) return null; return card(rel) })
  tower.on('click', (w, person) => { if (person || !hit(w)) return false; if (rel.url) api.openLink(rel.url); return true })
  tower.on('mode', on => { if (on && demo) setTimeout(() => tower.flyTo({ x: 180, y: -60 }, 2.2), 600) })
}
