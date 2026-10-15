// smokestack: a brick chimney on the roof's right end whose smoke follows the live token rate across every session
// (snap.tv.tokensToday, else the sum of ext['cost-jar'].tokensToday; the rate is the rise over the last three minutes):
// thin wisps when quiet, steady puffs when busy, thick dark plumes in a big workflow, drifting with the real wind
// (snap.weather wind/windDir). A dial on the stack shows tokens/min; at night the plume is lit orange from below.
// ?demo=smokestack cycles quiet → busy → workflow every 10 s.
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const MAX = 200, WIN = 3 * 60_000, LO = 3e5, HI = 3e7
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e3 ? Math.round(n / 1e3) + 'k' : String(Math.round(n))

export default function init(api, tower) {
  const { Z, font } = tower
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('smokestack')
  const samples = [], parts = []
  let rate = null, shown = 0, total = null, acc = 0, flown = false

  const stack = () => {
    const f = tower.floors.at(-1); if (!f || f.kind !== 'roof') return null
    const x = tower.interior.x0 + 457, base = f.y - 3
    return { x, w: 14, base, top: base - 62, mouth: { x: x + 7, y: base - 64 } }
  }
  const DEMO = [4e5, 5e6, 3.2e7]
  const demoRate = () => DEMO[Math.floor(Date.now() / 10_000) % 3]
  const level = () => {
    const r = demo ? demoRate() : shown
    let k = Math.max(0, Math.min(1, Math.log10(Math.max(r, 1) / LO) / Math.log10(HI / LO)))
    const wf = (tower.snapshot?.sessions || []).reduce((n, s) => n + (s.agents || []).filter(a => a.workflow && a.state !== 'done').length, 0)
    if (wf >= 4) k = Math.max(k, 0.8)
    return k
  }
  const wind = () => {
    const w = tower.snapshot?.weather
    if (!w || w.wind == null) return 2
    const toward = -Math.sin((w.windDir ?? 270) * Math.PI / 180)   // windDir is where it blows from; screen right is east
    return Math.max(-26, Math.min(26, toward * (1 + w.wind * 0.9)))
  }

  tower.on('sync', snap => {
    const t = Date.now()
    let v = snap.tv?.tokensToday
    if (v == null) { const per = snap.sessions.map(s => s.ext?.['cost-jar']?.tokensToday).filter(n => n != null); v = per.length ? per.reduce((a, b) => a + b, 0) : null }
    if (v == null) return
    total = v
    if (samples.length && v < samples.at(-1).v) samples.length = 0   // a new day
    samples.push({ t, v })
    while (samples.length > 2 && t - samples[0].t > WIN) samples.shift()
    const a = samples[0], b = samples.at(-1)
    rate = b.t - a.t >= 20_000 ? (b.v - a.v) / (b.t - a.t) * 60_000 : null
  })

  if (demo) tower.on('mode', () => {
    if (flown || params.get('towerzoom')) return
    flown = true; setTimeout(() => { const s = stack(); s && tower.flyTo({ x: s.x - 30, y: s.top - 30 }, 3) }, 600)
  })

  tower.on('step', dt => {
    const s = stack(); if (!s) return
    shown += ((rate ?? 0) - shown) * Math.min(1, dt / 4)
    const k = level(), wx = wind()
    acc += dt * (0.7 + 22 * k * k + 4 * k)
    while (acc >= 1 && parts.length < MAX) {
      acc -= 1
      parts.push({ x: s.mouth.x + (Math.random() - 0.5) * (2 + 3 * k), y: s.mouth.y, vx: (Math.random() - 0.5) * 2, vy: -(5 + 9 * k + Math.random() * 4),
        r: 1 + k * 1.6 + Math.random(), grow: 1.2 + 3.2 * k + Math.random(), age: 0, life: 4 + 5 * k + Math.random() * 3, dark: k, seed: Math.random() })
    }
    if (acc >= 1) acc = 0
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.age += dt
      if (p.age > p.life) { parts.splice(i, 1); continue }
      const q = Math.min(1, p.age / 2.5)
      p.vx += (wx * q - p.vx) * Math.min(1, dt * 0.9) + Math.sin(p.age * 2 + p.seed * 6) * 0.25
      p.vy *= 1 - dt * 0.35
      p.x += p.vx * dt; p.y += p.vy * dt
    }
  })

  function chimney(c, s, now) {
    const { x, w, base, top } = s
    R(c, '#5a2e22', x - 1, top, w + 2, base - top)
    for (let y = top + 6, row = 0; y < base; y += 3, row++) for (let bx = x + (row % 2 ? 0 : 2); bx < x + w; bx += 5) {
      R(c, (bx * 7 + row * 13) % 5 === 0 ? '#8a4632' : '#9c5038', bx, y, Math.min(4, x + w - bx), 2)
    }
    R(c, '#3a1e18', x - 2, top, w + 4, 3); R(c, '#6a3a2e', x - 2, top, w + 4, 1); R(c, '#1a1210', x + 2, top - 1, w - 4, 1)
    R(c, '#3a1e18', x - 2, top + 22, w + 4, 2)
    R(c, '#4a2a22', x - 2, base - 4, w + 4, 4)
    // the dial: a brass ring, a white face, a needle that swings with the rate
    const gx = x + 7, gy = top + 13, k = level()
    R(c, '#b08a3a', gx - 4, gy - 4, 9, 9); R(c, '#e8dcc0', gx - 3, gy - 3, 7, 7); R(c, '#d84a3a', gx + 2, gy - 3, 1, 2)
    const a = Math.PI * (0.8 + 1.4 * k) + Math.sin(now / 160) * 0.06 * k
    for (let i = 0; i <= 3; i++) R(c, '#1a1a22', gx + Math.round(Math.cos(a) * i), gy + Math.round(Math.sin(a) * i), 1, 1)
    R(c, '#1a1a22', gx, gy, 1, 1)
    R(c, '#2a2a30', x + 2, top + 26, w - 4, 6); R(c, '#58e08a', x + 3, top + 28, Math.max(1, Math.round((w - 6) * k)), 2)
  }
  function smoke(c, now, sun) {
    const n = sun?.n || 0
    for (const p of parts) {
      const t = p.age / p.life, r = p.r + p.grow * Math.sqrt(p.age), a = (1 - t) * (0.32 + 0.5 * p.dark) * Math.min(1, p.age * 3)
      const g = Math.round(214 - 150 * p.dark + 30 * t), col = `rgba(${g},${g},${g + 4},${a})`
      c.fillStyle = col; c.beginPath(); c.arc(Math.round(p.x), Math.round(p.y), Math.max(1, Math.round(r)), 0, Math.PI * 2); c.fill()
      if (r > 3) { c.fillStyle = `rgba(255,255,255,${a * (0.25 - 0.18 * p.dark) * (1 - n)})`; c.beginPath(); c.arc(Math.round(p.x - r * 0.35), Math.round(p.y - r * 0.35), Math.round(r * 0.45), 0, Math.PI * 2); c.fill() }
    }
  }

  tower.on('items', (out, now, ctx) => {
    const s = stack(); if (!s) return
    const v = ctx.view
    if (s.x > v.x1 + 60 || s.x < v.x0 - 260 || s.base < v.y0 || s.top - 200 > v.y1) return
    out.push({ z: Z.WALL - 2, draw: c => chimney(c, s, now) })
    if (parts.length) out.push({ z: Z.OUTSIDE + 6, draw: c => smoke(c, now, ctx.sun) })
  })
  tower.on('glow', (c, now, n) => {
    const s = stack(); if (!s || n < 0.05) return
    const k = level(), fl = 0.8 + 0.2 * Math.sin(now / 90) * Math.sin(now / 37)
    const pool = (x, y, r, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(255,140,50,${a})`); g.addColorStop(1, 'rgba(255,90,30,0)'); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
    pool(s.mouth.x, s.mouth.y + 1, 10 + 8 * k, (0.45 + 0.35 * k) * n * fl)
    for (const p of parts) {
      const h = s.mouth.y - p.y; if (h > 45 || p.seed > 0.5) continue
      const r = p.r + p.grow * Math.sqrt(p.age), a = (1 - h / 45) ** 2 * (1 - p.age / p.life) * 0.09 * n * fl
      if (a > 0.01) pool(p.x, p.y + r * 0.5, r * 1.1, a)
    }
    R(c, `rgba(255,170,80,${0.5 * n * fl})`, s.x + 4, s.top + 13, 7, 1)
  })
  tower.on('overlay', v => {
    const s = stack(); if (!s || tower.zoom < 3.2) return
    const p = tower.worldToScreen(s.x + 2, s.top + 26), w = (s.w - 4) * tower.zoom, fs = Math.min(11, 1.9 * tower.zoom)
    const r = demo ? demoRate() : rate
    v.font = font(fs, 700); v.textBaseline = 'bottom'; v.fillStyle = '#e8dcc0'
    v.fillText(tower.fitText(r == null ? '…/min' : fmt(r) + '/min', w * 1.6, font(fs, 700)), p.x - w * 0.3, p.y - 1)
  })
  tower.on('hover', (w, person) => {
    if (person) return null
    const s = stack(); if (!s || w.x < s.x - 3 || w.x > s.x + s.w + 4 || w.y < s.top - 3 || w.y > s.base) return null
    const r = demo ? demoRate() : rate, k = level()
    const mood = k > 0.75 ? 'billowing — a big workflow is burning' : k > 0.35 ? 'steady puffs — busy' : 'thin wisps — quiet'
    return `<div class="t">🏭 Smokestack</div><div><b>${r == null ? 'measuring…' : fmt(r) + ' tokens/min'}</b> · ${mood}</div><div class="m">today: ${total == null ? '—' : fmt(total) + ' tokens'} across every session</div><div class="m">rate over the last 3 min · smoke drifts with the real wind</div>`
  })
}
