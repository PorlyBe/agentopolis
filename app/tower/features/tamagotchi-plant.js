// tamagotchi-plant: a potted plant in the CEO office grows one stage per day of the user's Claude Code streak (server
// snap.tamagotchiPlant), sprout → seedling → sapling → bush → big bush → small tree → in flower → in fruit, and droops
// brown when neither yesterday nor today has any activity. The first prompt of the day (newest ext.walkabout.at) brings
// a watering can. ?demo=tamagotchiplant grows it through every stage, wilts it, and waters it again.
const DAY = 86_400_000, WATER_MS = 4200, KEY = 'tamagotchi-plant:watered', CYCLE = 32_000
const STAGES = ['seed', 'sprout', 'seedling', 'sapling', 'bush', 'big bush', 'small tree', 'in flower', 'in fruit']
const GREEN = ['#2f6b34', '#3f8a3e', '#5fb14f', '#8fd46a'], BROWN = ['#5e4a26', '#7a6230', '#9a7c3c', '#b89a52']
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const store = { get: () => { try { return localStorage.getItem(KEY) } catch { return null } }, set: v => { try { localStorage.setItem(KEY, v) } catch {} } }

export default function init(api, tower) {
  const { Z } = tower
  const demo = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('tamagotchiplant')
  let data = null, lastPrompt = 0, water = 0, t0 = 0, cyc = -1

  const spot = () => { const s = tower.slots, f = s?.floor; return f && f.open == null ? { x: tower.interior.x0 + 96, y: f.y, f } : null }

  function state(now) {
    if (demo) {
      const t = (Date.now() - t0) % CYCLE, k = Math.floor(t / 3000)
      return k < 8 ? { stage: k + 1, streak: k + 1, best: 23, wilted: false } : { stage: 8, streak: 0, best: 23, wilted: true, last: 8 }
    }
    if (!data) return null
    const today = data.today || dayKey(lastPrompt) === dayKey(Date.now())
    let streak = data.streak
    if (today && !data.today) streak = data.yesterday ? streak + 1 : 1
    const wilted = !today && !data.yesterday
    return { stage: Math.max(1, Math.min(8, wilted ? data.last || 1 : streak)), streak, best: Math.max(data.best || 0, streak), wilted, last: data.last, today, ready: data.ready }
  }

  tower.on('snapshot', () => { if (demo && !t0) { t0 = Date.now(); if (!location.search.includes('towerzoom')) setTimeout(() => { const p = spot(); p && tower.flyTo({ x: p.x, y: p.y - 30 }, 6) }, 600) } })
  tower.on('sync', snap => {
    data = snap.tamagotchiPlant || null
    let m = 0; for (const s of snap.sessions || []) m = Math.max(m, s.ext?.walkabout?.at || 0)
    lastPrompt = m
    const today = dayKey(Date.now())
    if (!demo && api.live !== false && m && dayKey(m) === today && store.get() !== today) { store.set(today); water = performance.now() }
  })
  tower.on('step', (dt, now) => {
    if (demo && t0) { const k = Math.floor((Date.now() - t0) / CYCLE); if (k !== cyc) { cyc = k; water = now } }
  })

  // ---------- drawing (x = the pot's centre, y = the floor) ----------
  function blob(c, cx, cy, rx, ry, col) {
    c.fillStyle = col
    for (let dy = -ry; dy <= ry; dy++) { const w = Math.round(rx * Math.sqrt(1 - (dy / (ry + 0.5)) ** 2)); c.fillRect(Math.round(cx - w), Math.round(cy + dy), 2 * w + 1, 1) }
  }
  function leaf(c, x, y, dir, P, droop) {
    if (droop) { R(c, P[1], x + dir, y, 1, 1); R(c, P[1], x + dir * 2, y + 1, 1, 2); R(c, P[2], x + dir * 2, y + 1, 1, 1); return }
    R(c, P[1], x + dir, y - 1, 1, 1); R(c, P[1], x + 2 * dir, y - 1, 1, 1); R(c, P[2], x + 2 * dir, y - 2, 1, 1); R(c, P[2], x + 3 * dir, y - 2, 1, 1)
  }
  function canopy(c, cx, cy, rx, ry, P, sway, wilted) {
    if (wilted) { ry = Math.max(2, Math.round(ry * 0.7)); cy += Math.round(ry * 0.5) }
    blob(c, cx + sway, cy, rx, ry, P[0]); blob(c, cx - 1 + sway, cy - 1, rx - 1, ry - 1, P[1])
    blob(c, cx - 2 + sway, cy - 2, Math.max(1, rx - 4), Math.max(1, ry - 3), P[2])
    for (let i = 0; i < rx; i += 3) R(c, P[3], cx - rx + 2 + i + sway, cy - ry + 1 + (i % 2), 1, 1)
    if (wilted) for (let i = -rx + 1; i < rx; i += 3) R(c, P[0], cx + i + sway, cy + ry, 1, 2 + (i & 1))
  }
  function plant(c, x, y, st, now) {
    const P = st.wilted ? BROWN : GREEN, s = st.stage, w = st.wilted
    const sway = w ? 0 : Math.round(Math.sin(now / 1500) * 0.6), y0 = y - 10, lean = w ? 1 : 0
    const stem = (h, col) => { for (let i = 0; i < h; i++) R(c, col, x + (lean && i > h / 2 ? 1 : 0), y0 - i - 1, 1, 1) }
    if (s <= 3) {
      const h = [0, 3, 6, 10][s]
      stem(h, w ? '#7a6230' : '#3f7a34')
      for (let i = 0; i < s; i++) { const ly = y0 - h + 1 + i * 3; leaf(c, x + (lean && ly < y0 - h / 2 ? 1 : 0), ly, -1, P, w); leaf(c, x + (lean && ly < y0 - h / 2 ? 1 : 0), ly, 1, P, w) }
      if (s === 3 && !w) R(c, P[3], x, y0 - h - 1, 1, 1)
    } else if (s <= 5) {
      stem(4, '#4a5a2a')
      if (s === 4) canopy(c, x, y0 - 8, 6, 5, P, sway, w)
      else { canopy(c, x - 4, y0 - 8, 5, 5, P, sway, w); canopy(c, x + 4, y0 - 9, 5, 5, P, sway, w); canopy(c, x, y0 - 13, 6, 5, P, sway, w) }
    } else {
      const th = s === 6 ? 14 : s === 7 ? 17 : 19, r = s === 6 ? 9 : s === 7 ? 10 : 11
      for (let i = 0; i < th; i++) { const lx = lean && i > th / 2 ? 1 : 0; R(c, '#6a4a2e', x - 1 + lx, y0 - i - 1, 2, 1); R(c, '#8a6440', x + lx, y0 - i - 1, 1, 1) }
      R(c, '#6a4a2e', x + 1, y0 - th + 4, 3, 1); R(c, '#6a4a2e', x - 3, y0 - th + 6, 3, 1)
      const cy = y0 - th - r + 4
      canopy(c, x + lean, cy, r, r - 1, P, sway, w)
      if (!w && s >= 7) for (let i = 0; i < 9; i++) {
        const a = i * 2.39, d = (i % 3 + 1) / 3.6 * r, fx = x + sway + Math.round(Math.cos(a) * d), fy = cy + Math.round(Math.sin(a) * d * 0.85)
        if (s === 7) { R(c, '#f6b8d4', fx, fy, 2, 1); R(c, '#fff3f8', fx, fy - 1, 1, 1); R(c, '#f2c14e', fx + 1, fy - 1, 1, 1) }
        else if (i % 2) { R(c, '#e85a3a', fx, fy, 2, 2); R(c, '#ffb08a', fx, fy, 1, 1); R(c, '#4a6a2a', fx + 1, fy - 1, 1, 1) }
        else R(c, '#f6d0e0', fx, fy, 1, 1)
      }
    }
    if (w) { R(c, BROWN[2], x - 11, y - 1, 2, 1); R(c, BROWN[1], x + 9, y - 1, 3, 1); R(c, BROWN[3], x + 12, y - 2, 1, 1) }
  }
  function pot(c, x, y) {
    R(c, 'rgba(0,0,0,.2)', x - 7, y - 1, 15, 1)
    R(c, '#9a4a28', x - 5, y - 8, 11, 8); R(c, '#b45a32', x - 4, y - 8, 4, 7); R(c, '#7c3a20', x + 4, y - 8, 2, 8)
    R(c, '#c8693a', x - 6, y - 11, 13, 3); R(c, '#e08a52', x - 6, y - 11, 13, 1); R(c, '#8a4224', x - 6, y - 9, 13, 1)
    R(c, '#3a2a1e', x - 5, y - 11, 11, 1)
  }
  function can(c, x, y, tilt) {
    R(c, '#4f8a6a', x, y, 8, 5); R(c, '#6fb08a', x, y, 8, 1); R(c, '#3a6a50', x, y + 4, 8, 1)
    R(c, '#3a6a50', x + 2, y - 3, 4, 1); R(c, '#3a6a50', x + 1, y - 2, 1, 2); R(c, '#3a6a50', x + 6, y - 2, 1, 2)
    if (tilt) { R(c, '#4f8a6a', x + 8, y + 2, 2, 1); R(c, '#4f8a6a', x + 10, y + 3, 2, 1); R(c, '#4f8a6a', x + 12, y + 4, 2, 1); R(c, '#8a96a0', x + 13, y + 4, 2, 2) }
    else { R(c, '#4f8a6a', x + 8, y + 1, 2, 1); R(c, '#4f8a6a', x + 10, y, 2, 1); R(c, '#8a96a0', x + 12, y - 1, 2, 2) }
  }
  const height = st => st.stage <= 3 ? [0, 6, 9, 14][st.stage] + 10 : st.stage <= 5 ? 28 : [0, 0, 0, 0, 0, 0, 40, 45, 49][st.stage]

  tower.on('items', (out, now) => {
    const p = spot(), st = state(now); if (!p || !st) return
    out.push({ z: Z.FLOOR + 4, draw: c => {
      plant(c, p.x, p.y, st, now); pot(c, p.x, p.y)
      const t = now - water
      if (water && t < WATER_MS) {
        const top = p.y - height(st), a = Math.min(1, t / 300, (WATER_MS - t) / 300), tilt = t > 500 && t < WATER_MS - 500
        c.globalAlpha = a; can(c, p.x - 17, top - 9, tilt)
        if (tilt) for (let i = 0; i < 6; i++) {
          const q = ((t / 520) + i / 6) % 1
          R(c, '#7cc4f4', p.x - 3 + (i % 3) + q * 2, top - 4 + q * 10, 1, 2)
        }
        c.globalAlpha = 1
      } else if (water && t < WATER_MS + 1600) {
        const q = (t - WATER_MS) / 1600, top = p.y - height(st)
        c.globalAlpha = 1 - q
        for (let i = 0; i < 3; i++) R(c, '#fff6b0', p.x - 6 + i * 6, top - 2 - q * 8 - (i % 2) * 3, 1, 1)
        c.globalAlpha = 1
      }
    } })
  })

  tower.on('hover', (w, person) => {
    if (person) return null
    const p = spot(), st = state(performance.now()); if (!p || !st) return null
    if (Math.abs(w.x - p.x) > 13 || w.y < p.y - height(st) - 4 || w.y > p.y) return null
    const head = st.wilted ? `🥀 wilting · best ${st.best}` : `🌱 ${st.streak}-day streak · best ${st.best}`
    const body = st.wilted ? `No Claude Code yesterday — the ${st.last || 1}-day plant is drooping. A prompt today waters it.`
      : `${STAGES[st.stage][0].toUpperCase() + STAGES[st.stage].slice(1)}${st.stage < 8 ? ` · grows again tomorrow if you use Claude Code` : ' · fully grown'}`
    return `<div class="t">${head}</div><div>${body}</div><div class="m">${demo ? 'demo' : st.ready === false ? 'still counting the last 60 days…' : 'one stage per day in a row, from your transcripts'}</div>`
  })
}
