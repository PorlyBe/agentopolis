// ivy-wear: the tower ages. Ivy creeps up the street-side wall of a session floor as its session runs on (hours: a few
// tendrils; days: a lush mat of leaves), a brand-new session's plaque is shiny and sparkles for its first hour and an old
// one gathers green patina, and the base of the building weathers (grime, moss) with the repo's age.
// Data: session.ext['ivy-wear'].start and snap.ivyWear.repoBorn (server/features/ivy-wear.mjs). ?demo=ivywear.
import { R, rnd } from '../draw.js'
const HOUR = 3600_000, DAY = 24 * HOUR
const growth = ms => ms == null || ms < 20 * 60_000 ? 0 : Math.min(1, Math.log(1 + ms / HOUR) / Math.log(1 + 168))
const patina = ms => ms == null ? 0 : Math.max(0, Math.min(1, (ms - 6 * HOUR) / (6 * DAY)))
const weather = ms => ms == null ? 0 : Math.max(0, Math.min(1, Math.sqrt(ms / (4 * 365 * DAY))))
const ageText = ms => ms < HOUR ? `${Math.max(1, Math.round(ms / 60_000))} min` : ms < 2 * DAY ? `${Math.round(ms / HOUR)} h` : ms < 60 * DAY ? `${Math.round(ms / DAY)} days` : ms < 2 * 365 * DAY ? `${Math.round(ms / (30 * DAY))} months` : `${(ms / (365 * DAY)).toFixed(1)} years`
const LEAF = ['#2f6a2e', '#3f8a3a', '#4f9c44', '#5aa850'], STEM = '#3d4a26', MOSS = ['#4a6a2a', '#5a7e32', '#6a8f3a']

export default function init(api, tower) {
  const { Z } = tower
  const params = api.params, demo = api.demo('ivywear')
  const DEMO_AGES = [12 * 60_000, 3 * HOUR, 20 * HOUR, 3 * DAY, 12 * DAY, 40 * DAY]
  const cache = new Map()
  let flown = false

  const sessionFloors = () => tower.floors.filter(f => f.kind === 'session' && f.session)
  const ageOf = f => {
    if (demo) return DEMO_AGES[sessionFloors().indexOf(f) % DEMO_AGES.length]
    const s = f.session, t = s.ext?.['ivy-wear']?.start || s.ext?.['time-clock']?.in
    return t ? Math.max(0, Date.now() - t) : null
  }
  const repoAge = () => {
    if (demo) return 3.1 * 365 * DAY
    const t = tower.snapshot?.ivyWear?.repoBorn
    return t ? Math.max(0, Date.now() - t) : null
  }

  if (demo) tower.on('mode', () => {
    if (flown || params.get('towerzoom')) return
    flown = true; setTimeout(() => { const f = sessionFloors()[2] || sessionFloors()[0]; f && tower.flyTo({ x: 60, y: f.y - 40 }, 2.6) }, 800)
  })

  // ---------- ivy: one cached sprite per floor and growth step ----------
  function ivySprite(seed, g, H) {
    const key = `${seed}:${Math.round(g * 40)}:${H}`, hit = cache.get(key)
    if (hit) return hit
    const W = 14, cv = document.createElement('canvas'); cv.width = W; cv.height = H + 2
    const c = cv.getContext('2d'), ox = 4, put = (col, x, y, w = 1, h = 1) => { if (y >= 0 && y < H + 2) R(c, col, x + ox, y, w, h) }
    const n = 1 + Math.floor(g * 4), leafy = Math.max(0, (g - 0.12) / 0.88)
    for (let i = 0; i < n; i++) {
      const bx = -1 + Math.floor(rnd(seed + i * 3.1) * 8), hv = Math.round(H * Math.min(1, g * 1.15) * (0.55 + 0.45 * rnd(seed + i * 7.7))), ph = rnd(seed + i) * 6
      for (let y = 0; y < hv; y++) {
        const x = bx + Math.round(1.6 * Math.sin(y / 7 + ph)), yy = H + 1 - y
        put(STEM, x, yy)
        if (y % 3 === 0 && rnd(seed * 3 + i * 31 + y) < 0.25 + leafy * 0.75) {
          const side = (y / 3 + i) % 2 ? 1 : -1, big = g > 0.4 && rnd(seed + y * 1.3 + i) < leafy
          const col = LEAF[Math.floor(rnd(seed + y + i * 5) * 4)]
          put(col, x + (side > 0 ? 1 : -2), yy - 1, big ? 2 : 1 + (g > 0.2 ? 1 : 0), big ? 2 : 1)
          if (big) put('#7ac860', x + (side > 0 ? 1 : -2), yy - 1)
        }
      }
      if (hv > 3) put(LEAF[3], bx + Math.round(1.6 * Math.sin(hv / 7 + ph)), H + 1 - hv, 2, 1)
    }
    if (g > 0.6) {   // days: a mat of leaves over the lower wall
      const k = (g - 0.6) / 0.4
      for (let y = H + 1; y > H + 1 - H * g * 0.85; y -= 2) for (let x = -3; x < 9; x++) {
        if (rnd(seed + x * 13.1 + y * 7.3) < k * 0.42 * (1 - (H + 1 - y) / (H * 1.1))) { put(LEAF[Math.floor(rnd(x + y + seed) * 4)], x, y, 2, 2); if (rnd(x * y + seed) < 0.3) put('#8ad070', x, y) }
      }
    }
    if (cache.size > 80) cache.clear()
    cache.set(key, cv)
    return cv
  }

  // ---------- plaques: shiny when new, patina when old ----------
  function patinaSprite(seed, k, w, h) {
    const key = `p:${seed}:${Math.round(k * 20)}`, hit = cache.get(key)
    if (hit) return hit
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h
    const c = cv.getContext('2d'), VG = ['#4f9a80', '#3f8a72', '#6ab89a']
    for (let x = 1; x < w - 1; x++) for (const y of [1, h - 2]) {
      const edge = Math.min(x, w - 1 - x) < 14 ? 1.6 : 1
      if (rnd(seed + x * 1.7 + y * 3.3) < k * 0.55 * edge) R(c, VG[Math.floor(rnd(x + y * 9 + seed) * 3)], x, y)
    }
    for (const [cx, cy, sx, sy] of [[1, 1, 1, 1], [w - 2, 1, -1, 1], [1, h - 2, 1, -1], [w - 2, h - 2, -1, -1]]) {
      const n = Math.round(k * 12)
      for (let i = 0; i < n; i++) { const dx = Math.floor(rnd(seed + i * 5 + cx) * 6 * k + 1), dy = Math.floor(rnd(seed + i * 11 + cy) * 3 * k); R(c, VG[i % 3], cx + sx * dx, cy + sy * dy) }
    }
    if (k > 0.3) { R(c, '#5aa88a', 2, Math.floor(h / 2 - 0.5)); R(c, '#5aa88a', w - 3, Math.floor(h / 2 - 0.5)) }
    cache.set(key, cv)
    return cv
  }
  function plaqueWear(c, f, ms, now) {
    const b = tower.plaque(f); if (!b) return
    const seed = api.hash(f.id) % 997
    if (ms < 6 * HOUR) {
      const fresh = ms < HOUR
      R(c, fresh ? '#f4dc96' : '#d8b870', b.x + 1, b.y + 1, b.w - 2, 1); R(c, fresh ? '#c8a050' : '#8a6a3a', b.x + 1, b.y + b.h - 2, b.w - 2, 1)
      R(c, '#fff2c0', b.x + 2, Math.floor(b.y + b.h / 2 - 0.5)); R(c, '#fff2c0', b.x + b.w - 3, Math.floor(b.y + b.h / 2 - 0.5))
      const period = fresh ? 3800 : 11000, t = ((now + seed * 37) % period) / 900
      if (t < 1) { const gx = b.x + t * (b.w + 20) - 10; for (let i = 0; i < 6; i++) { const x = gx + i; if (x > b.x && x < b.x + b.w - 1) { R(c, 'rgba(255,255,240,.9)', x, b.y + 1); R(c, 'rgba(255,255,240,.55)', x - 3, b.y + b.h - 2) } } }
      if (fresh) for (let i = 0; i < 3; i++) {
        const cyc = Math.floor((now + i * 700) / 2100), ph = ((now + i * 700) % 2100) / 2100, s = Math.sin(ph * Math.PI)
        const x = b.x + 6 + rnd(seed + cyc * 3 + i) * (b.w - 12), y = b.y + (rnd(seed + cyc * 7 + i) < 0.5 ? 1 : b.h - 2), r = Math.round(s * 2.4)
        R(c, '#ffffff', x, y); if (r > 0) { c.fillStyle = `rgba(255,250,210,${0.4 + 0.6 * s})`; c.fillRect(Math.round(x) - r, Math.round(y), 2 * r + 1, 1); c.fillRect(Math.round(x), Math.round(y) - r, 1, 2 * r + 1) }
      }
      return
    }
    const k = patina(ms); if (k > 0.02) c.drawImage(patinaSprite(seed, k, b.w, b.h), b.x, b.y)
  }

  // ---------- the base: grime and moss with the repo's age ----------
  function base(c, w) {
    const lobby = tower.floors.find(f => f.kind === 'lobby'); if (!lobby || w < 0.03) return
    const top = lobby.top + 12, low = -42
    for (let x = 0; x < 8; x++) {
      const len = Math.round((4 + rnd(x * 3.3) * 14) * w)
      if (rnd(x * 7.1) < 0.6) { c.fillStyle = `rgba(40,36,30,${0.12 + 0.22 * w})`; c.fillRect(x, top, 1, len) }
      c.fillStyle = `rgba(40,46,30,${0.1 + 0.25 * w})`; c.fillRect(x, low - 1 - Math.round(rnd(x * 5.9) * 6 * w), 1, 1 + Math.round(rnd(x * 5.9) * 6 * w))
    }
    const n = Math.round(3 + 18 * w)
    for (let i = 0; i < n; i++) {
      const x = Math.floor(rnd(i * 2.7) * 9) - 1, y = low - 1 - Math.floor(rnd(i * 4.3) * (4 + 14 * w)), s = rnd(i * 9.1) < w ? 2 : 1
      R(c, MOSS[i % 3], x, y, s, s)
    }
    R(c, MOSS[0], -4, low, 12, 1); for (let x = -4; x < 8; x++) if (rnd(x * 1.9) < 0.3 + 0.6 * w) R(c, MOSS[(x + 9) % 3], x, low - 1)
    for (const x of [-1, 8]) for (let y = -1; y > -(3 + 12 * w); y--) if (rnd(x * 3.1 + y * 1.3) < 0.75 - (-y / (3 + 12 * w)) * 0.5) R(c, MOSS[(x + y + 9) % 3], x + (rnd(y * 7.7 + x) < 0.3 ? (x < 0 ? -1 : 1) : 0), y)
    const tufts = Math.round(2 + 14 * w)
    for (let i = 0; i < tufts; i++) {
      const x = -3 - Math.floor(rnd(i * 6.6) ** 1.6 * 30), h = 1 + Math.floor(rnd(i * 3.7) * 2 * (0.5 + w))
      R(c, MOSS[1], x, -h, 1, h); R(c, MOSS[2], x + 1, -1, 1, 1); if (w > 0.4) R(c, MOSS[0], x - 1, -1, 1, 1)
    }
    if (w > 0.5) for (let i = 0; i < 6; i++) { const x = 10 + Math.floor(rnd(i * 8.8) * 170); R(c, 'rgba(60,70,40,.35)', x, 0, 1 + Math.floor(rnd(i) * 3), 1) }
  }

  tower.on('items', (out, now, ctx) => {
    const v = ctx.view, skin = api.theme?.skin
    if (v.x0 < 20) {
      for (const f of sessionFloors()) {
        if (f.y < v.y0 || f.top > v.y1) continue
        const g = growth(ageOf(f)), H = Math.max(0, f.y - f.top - 13)
        if (g <= 0 || H < 10 || f.open != null) continue
        const spr = ivySprite(api.hash(f.id) % 997, g, H)
        out.push({ z: Z.WALL + 1, draw: c => { c.drawImage(spr, -4, f.y - H - 1); if (skin === 'winter-cabin') for (let x = -3; x < 9; x += 2) if (rnd(x + f.n) < 0.5 * g) R(c, '#f4f8fc', x, f.y - Math.round(H * g * rnd(x * 3 + f.n)) - 1, 2, 1) } })
      }
      const w = weather(repoAge())
      if (w > 0.03) out.push({ z: Z.WALL + 1, draw: c => base(c, w) })
    }
    for (const f of sessionFloors()) {
      if (f.top - 8 > v.y1 || f.top + 12 < v.y0 || v.x0 > 200 || f.open != null) continue
      const ms = ageOf(f); if (ms == null) continue
      out.push({ z: Z.FRONT + 1, draw: c => plaqueWear(c, f, ms, now) })
    }
  })
  tower.on('glow', (c, now, n) => {
    if (n < 0.05) return
    for (const f of sessionFloors()) {
      const ms = ageOf(f); if (ms == null || ms >= HOUR) continue
      const b = tower.plaque(f), x = b.x + b.w / 2, y = b.y + b.h / 2, g = c.createRadialGradient(x, y, 0, x, y, 60)
      g.addColorStop(0, `rgba(255,230,150,${0.12 * n})`); g.addColorStop(1, 'rgba(255,230,150,0)'); c.fillStyle = g; c.fillRect(x - 60, y - 60, 120, 120)
    }
  })
  tower.on('hover', (w, person) => {
    if (person || w.x < -4 || w.x > 9) return null
    for (const f of sessionFloors()) {
      if (w.y > f.y || w.y < f.top + 11) continue
      const ms = ageOf(f), g = growth(ms); if (g <= 0) return null
      return `<div class="t">🌿 ${api.esc(f.session.title)}</div><div>running for ${ageText(ms)}</div><div class="m">${g > 0.7 ? 'lush ivy — this one has been going for days' : g > 0.35 ? 'the ivy is filling in' : 'a few tendrils so far'} · ${ms < HOUR ? 'its plaque is brand new' : ms < 6 * HOUR ? 'its plaque still shines' : `patina ${Math.round(patina(ms) * 100)}%`}</div>`
    }
    const lobby = tower.floors.find(f => f.kind === 'lobby'), ra = repoAge()
    if (lobby && ra != null && w.y > lobby.top + 12 && w.y < -40 && w.x >= -1) return `<div class="t">🧱 The base</div><div>first commit ${ageText(ra)} ago</div><div class="m">grime and moss grow with the repo's age</div>`
    return null
  })
}
