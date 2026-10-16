// deploy-rocket: deploy runs on the default branch (snap.deploys, server/features/deploys.mjs) as rockets on a launch pad
// on the roof terrace. A new run rolls out of the elevator machine room onto a free pad slot (three; the rest wait inside),
// climbs while it runs, and on success boosts into orbit — a firework, then a star that hangs over the roof for ten
// minutes. A failure sputters, tumbles back onto the pad and lies there smoking; clicking it (or the failure toast) opens
// the run. ?demo=deployrocket (the old ?demo=rocket still works) fakes one deploy that succeeds and one that fails.
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
const SLOTS = 3, S = 2, CLIMB = 62, ROLL_MS = 1800, FRESH = 3 * 60_000, STAR_MS = 10 * 60_000, WRECK_MS = 30 * 60_000
const BAD = /failure|timed_out|startup_failure/
const short = t => String(t || '').replace(/\s*\(#\d+\)\s*$/, '').replace(/\s*\[[A-Z]+-\d+\]\s*$/, '')
const wfName = w => String(w || 'deploy').replace(/^[^\p{L}\p{N}]+/u, '').trim() || 'deploy'

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('deployrocket', 'rocket')
  const rockets = new Map(), seen = new Set(), stars = [], parts = []
  let list = [], repo = null, primed = false, demoT0 = 0, failUrl = null, failText = null, waiting = 0

  // ---------- geometry ----------
  const roof = () => tower.floors.at(-1)
  const pad = () => { const f = roof(); return f && { x: tower.interior.x0 + 322, y: f.y - 24, w: 80, deck: f.y - 5 } }
  const slotX = i => pad().x + 13 + i * 24
  const gantry = () => { const p = pad(); return { x: p.x + p.w - 6, y: p.y - 48 } }
  const machine = () => tower.interior.x1 + 4

  // ---------- data ----------
  function fake() {
    if (!demoT0) {
      demoT0 = Date.now()
      if (!params.get('towerzoom')) setTimeout(() => { const p = pad(); p && tower.flyTo({ x: p.x + 20, y: p.y - 46 }, 3.2) }, 600)
    }
    const t = Date.now() - demoT0, iso = ms => new Date(demoT0 + ms).toISOString()
    const one = { id: 'demo-1', workflow: '🚀 cd', status: t < 11_000 ? 'in_progress' : 'completed', conclusion: t < 11_000 ? null : 'success', title: 'app: add the profile page (#1924)',
      createdAt: iso(0), updatedAt: iso(Math.min(t, 11_000)), typical: 14, url: null, prs: [{ number: 1924, title: 'app: add the profile page', author: 'you' }] }
    const two = { id: 'demo-2', workflow: '🌐 web-cd', status: t < 4000 ? 'queued' : t < 17_000 ? 'in_progress' : 'completed', conclusion: t < 17_000 ? null : 'failure', title: 'ui: add a Notice with four tones (#1925)',
      createdAt: iso(1500), updatedAt: iso(Math.min(t, 17_000)), typical: 20, url: null, prs: [{ number: 1925, title: 'ui: add a Notice with four tones', author: 'you' }] }
    return t < 1000 ? [] : t < 1500 ? [one] : [one, two]
  }

  tower.on('sync', data => {
    const d = data.deploys
    repo = d?.repo || repo
    if (d?.status !== 'ok' && !demo) return
    list = demo ? fake() : d.list
    const now = performance.now(), wall = Date.now()
    for (const r of list) {
      const k = rockets.get(r.id)
      if (k) { k.d = r; continue }
      if (seen.has(r.id)) continue
      seen.add(r.id)
      if (r.conclusion === 'skipped') continue
      const age = wall - Date.parse(r.updatedAt)
      if (r.status === 'completed' && (!primed || age > FRESH)) {   // the past: only its aftermath
        if (r.conclusion === 'success' && age < STAR_MS) addStar(r, Date.parse(r.updatedAt))
        else if (BAD.test(r.conclusion) && age < WRECK_MS && freeSlot() >= 0) rockets.set(r.id, { d: r, slot: freeSlot(), alt: 0, rot: Math.PI / 2, phase: 'wreck', t0: now, at: Date.parse(r.updatedAt) })
        continue
      }
      rockets.set(r.id, { d: r, slot: -1, alt: 0, vy: 0, rot: 0, phase: 'inside', t0: now })
    }
    primed = true
  })

  const holds = k => k.slot >= 0 && k.phase !== 'gone'
  function freeSlot() {
    const used = new Set([...rockets.values()].filter(holds).map(k => k.slot))
    for (let i = 0; i < SLOTS; i++) if (!used.has(i)) return i
    return -1
  }
  function addStar(d, at) {
    const p = pad(); if (!p) return
    const h = api.hash(String(d.id))
    stars.push({ d, at, x: p.x + 20 + (h % 160) - 80, dy: 70 + (h >> 4) % 18 })
    while (stars.length > 6) stars.shift()
  }
  const what = d => d.prs?.length ? `#${d.prs[0].number} ${short(d.prs[0].title)}${d.prs.length > 1 ? ` +${d.prs.length - 1}` : ''}` : short(d.title) || wfName(d.workflow)

  // ---------- the flight ----------
  tower.on('step', (dt, now) => {
    const p = pad(); if (!p) return
    waiting = 0
    for (const [id, k] of [...rockets].sort((a, b) => Date.parse(a[1].d.createdAt) - Date.parse(b[1].d.createdAt))) {
      const d = k.d, done = d.status === 'completed', el = (now - k.t0) / 1000
      if (k.phase === 'inside') {
        if (done && !BAD.test(d.conclusion) && d.conclusion !== 'success') { k.phase = 'gone'; continue }
        let s = freeSlot()
        if (s < 0) { const w = [...rockets.values()].filter(q => q.phase === 'wreck').sort((a, b) => a.t0 - b.t0)[0]; if (w) { w.phase = 'gone'; s = freeSlot() } }
        if (s < 0) { waiting++; continue }
        k.slot = s; k.phase = 'roll'; k.t0 = now
      } else if (k.phase === 'roll') { if (el * 1000 >= ROLL_MS) { k.phase = 'pad'; k.t0 = now } }
      else if (k.phase === 'pad') {
        if (done && d.conclusion !== 'success' && !BAD.test(d.conclusion)) { k.phase = 'scrub'; k.t0 = now }
        else if (d.status === 'in_progress' || done) { k.phase = 'climb'; k.t0 = now; puffs(slotX(k.slot), p.y, 10, '210,206,200') }
      } else if (k.phase === 'climb') {
        const run = (Date.now() - Date.parse(d.createdAt)) / 1000, typ = Math.max(8, d.typical || 60)
        const target = Math.max(done ? 26 : 0, CLIMB * (1 - Math.exp(-run / typ * 1.4)) * 0.85)
        k.alt += Math.max(-4 * dt, Math.min(14 * dt, target - k.alt))
        if (Math.random() < dt * 9) puffs(slotX(k.slot), p.y - k.alt + 8, 1, '200,196,192', 0.6, true)
        if (done && el > 1.6) {
          if (d.conclusion === 'success') { k.phase = 'orbit'; k.t0 = now; k.vy = 20 }
          else if (BAD.test(d.conclusion)) { k.phase = 'fizzle'; k.t0 = now; boom(d) }
          else { k.phase = 'scrub'; k.t0 = now }
        }
      } else if (k.phase === 'orbit') {
        k.vy += 260 * dt; k.alt += k.vy * dt
        if (Math.random() < dt * 24) puffs(slotX(k.slot), p.y - k.alt + 12, 1, '230,226,220', 0.8, true)
        if (k.alt > CLIMB + 40 && !k.burst) { k.burst = true; firework(slotX(k.slot), p.y - k.alt); addStar(d, Date.now()); api.toast(`🚀 deployed ${what(d)}`, 4500) }
        if (k.alt > CLIMB + 160) k.phase = 'gone'
      } else if (k.phase === 'fizzle') {
        if (Math.random() < dt * 18) puffs(slotX(k.slot) + (Math.random() - 0.5) * 3, p.y - k.alt, 1, '70,66,72', 1)
        if (el > 1.1) { k.phase = 'fall'; k.t0 = now; k.vy = 0 }
      } else if (k.phase === 'fall') {
        k.vy += 150 * dt; k.alt -= k.vy * dt; k.rot = Math.min(Math.PI / 2, k.rot + dt * 2.6)
        if (Math.random() < dt * 40) puffs(slotX(k.slot), p.y - k.alt - 12, 1, '62,58,64', 1.2)
        if (k.alt <= 0) { k.alt = 0; k.rot = Math.PI / 2; k.phase = 'wreck'; k.t0 = now; k.at = Date.now(); puffs(slotX(k.slot), p.y - 2, 16, '120,112,104', 2.2) }
      } else if (k.phase === 'wreck') {
        if (Math.random() < dt * 3) puffs(slotX(k.slot) + 2, p.y - 4, 1, '80,76,84', 0.4)
        if (Date.now() - k.at > WRECK_MS || [...rockets.values()].some(q => q.d.workflow === d.workflow && q.phase === 'orbit')) k.phase = 'gone'
      } else if (k.phase === 'scrub') { if (el * 1000 >= ROLL_MS) k.phase = 'gone' }
      if (k.phase === 'gone') rockets.delete(id)
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const q = parts[i]; q.life -= dt
      if (q.life <= 0) { parts.splice(i, 1); continue }
      q.vy += (q.g ?? -6) * dt; q.x += q.vx * dt; q.y += q.vy * dt
    }
    const cut = Date.now() - STAR_MS
    while (stars.length && stars[0].at < cut) stars.shift()
  })
  function puffs(x, y, n, rgb, spread = 1, down = false) {
    for (let i = 0; i < n; i++) parts.push({ x, y, vx: (Math.random() - 0.5) * 10 * spread, vy: down ? 3 + Math.random() * 5 : -2 - Math.random() * 6, g: down ? -3 : -6, r: 1 + Math.random() * 1.4, life: 1.2 + Math.random(), max: 2.2, rgb, grow: 2 })
  }
  function firework(x, y) {
    const cols = ['#f4c64f', '#ff7a5a', '#63b3f0', '#b996f5', '#5fd17a', '#ffffff']
    for (let i = 0; i < 46; i++) {
      const a = (i / 46) * Math.PI * 2, v = 22 + (i % 3) * 9
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 18, life: 1.5 + Math.random() * 0.5, max: 2, col: cols[i % cols.length], spark: true })
    }
  }
  function boom(d) {
    failUrl = d.url || (repo ? `https://github.com/${repo}/actions` : null)
    failText = `💥 deploy failed — ${wfName(d.workflow)}${d.prs?.length ? ` · #${d.prs[0].number}` : ''}`
    api.toast(failText, 6000)
  }
  const toastEl = document.getElementById('toast')
  toastEl?.addEventListener('click', () => { if (failUrl && toastEl.textContent === failText) api.openLink(failUrl) })
  if (toastEl) new MutationObserver(() => { toastEl.style.cursor = failText && toastEl.textContent === failText ? 'pointer' : '' }).observe(toastEl, { childList: true, characterData: true, subtree: true })

  // ---------- drawing ----------
  const xOf = k => {
    const s = slotX(k.slot), e = (tower.interior.x1 + 4)
    if (k.phase === 'roll') { const q = Math.min(1, (performance.now() - k.t0) / ROLL_MS), ease = 1 - (1 - q) ** 3; return e + (s - e) * ease }
    if (k.phase === 'scrub') { const q = Math.min(1, (performance.now() - k.t0) / ROLL_MS); return s + (e - s) * q * q }
    return s
  }
  function rocket(c, x, y, rot, flame, now, burnt) {
    c.save(); c.translate(Math.round(x), Math.round(y)); if (rot) c.rotate(rot); c.scale(S, S)
    const body = burnt ? '#8a847c' : '#ece8e0', shade = burnt ? '#5a5650' : '#b8b2a8', red = burnt ? '#6a2a24' : '#d0392c'
    R(c, red, -4, -5, 2, 5); R(c, red, 3, -5, 2, 5); R(c, red, -3, -6, 1, 1); R(c, red, 3, -6, 1, 1)
    R(c, body, -2, -14, 5, 14); R(c, shade, 2, -14, 1, 14)
    R(c, red, -1, -16, 3, 2); R(c, red, 0, -17, 1, 1); R(c, red, -2, -14, 5, 1)
    R(c, '#2a3040', -1, -11, 3, 3); R(c, burnt ? '#3a4050' : '#7ac8f4', 0, -10, 1, 1)
    R(c, red, -2, -4, 5, 1); R(c, '#4a4452', -1, 0, 3, 1)
    if (flame) {
      const h = flame * (3 + Math.abs(Math.sin(now / 45)) * 4)
      R(c, '#e8452a', -1, 1, 3, h); R(c, '#ff9a3a', -1, 1, 3, h * 0.65); R(c, '#ffe28a', 0, 1, 1, h * 0.4)
    }
    c.restore()
  }
  function drawPad(c, now) {
    const p = pad(), g = gantry()
    const x0 = p.x - 6, w = p.w + 10, top = 5
    R(c, '#4a4650', x0 - 3, p.deck - 1, w + 6, 1)
    for (const lx of [x0 + 3, x0 + w - 9]) { R(c, '#6e6a74', lx, p.y + top, 6, p.deck - p.y - top); R(c, '#86828c', lx, p.y + top, 1, p.deck - p.y - top) }
    R(c, '#5e5a64', x0 + 9, p.y + top, w - 18, p.deck - p.y - top); R(c, '#4e4a54', x0 + 9, p.y + top, w - 18, 1)
    for (let i = 0; i < SLOTS; i++) {
      const k = [...rockets.values()].find(r => r.slot === i), hot = k && (k.phase === 'climb' || k.phase === 'orbit')
      const tx = slotX(i) - 5
      R(c, '#2a2630', tx, p.y + top, 11, 6); R(c, hot && Math.floor(now / 90) % 2 ? '#ff9a3a' : '#3e3a44', tx + 1, p.y + top + 4, 9, 1)
      for (let j = 0; j < 4; j++) R(c, '#3a3640', tx - 1 + j, p.y + top + 6 + j, 13 - 2 * j, 1)
    }
    R(c, '#86828c', x0, p.y, w, top); R(c, '#b4b0b8', x0, p.y, w, 1); R(c, '#5e5a64', x0, p.y + top - 1, w, 1)
    for (let x = x0 + 1; x < x0 + w - 3; x += 6) { R(c, '#e8c23a', x, p.y + 2, 3, 2); R(c, '#2a2630', x + 3, p.y + 2, 3, 2) }
    for (let i = 0; i < SLOTS; i++) { R(c, '#2a2630', slotX(i) - 4, p.y, 9, 1); R(c, '#c8c4cc', slotX(i) - 7, p.y - 1, 15, 1) }
    for (const lx of [x0 - 2, x0 + w + 1]) {
      R(c, '#5a5660', lx, p.y - 20, 1, p.deck - p.y + 20); R(c, '#3a3640', lx - 2, p.y - 22, 5, 2); R(c, '#fff4c8', lx - 1, p.y - 20, 3, 1)
    }
    R(c, '#c8572a', g.x, g.y, 1, 48); R(c, '#c8572a', g.x + 4, g.y, 1, 48)
    for (let y = g.y + 2; y < p.y; y += 5) { R(c, '#a8472a', g.x + 1, y, 3, 1); R(c, '#8a3a24', g.x + 1 + ((y >> 2) % 2) * 2, y + 2, 1, 1) }
    R(c, '#5a5660', g.x - 1, g.y - 1, 7, 1)
    R(c, Math.floor(now / 700) % 2 ? '#ff4a3a' : '#7a2a22', g.x + 2, g.y - 3, 1, 2)
    if (waiting) R(c, '#f4c64f', g.x - 4, g.y + 6, 2, 2)
  }
  tower.on('items', (out, now, ctx) => {
    const p = pad(); if (!p || p.y < ctx.view.y0 - 200 || p.y - 200 > ctx.view.y1) return
    out.push({ z: Z.SEATED - 1, draw: c => drawPad(c, now) })   // behind everyone on the roof, who would otherwise walk behind it
    for (const k of rockets.values()) {
      if (k.slot < 0 || k.phase === 'inside') continue
      const flame = k.phase === 'climb' ? 0.8 : k.phase === 'orbit' ? 1.6 : k.phase === 'fizzle' ? (Math.floor(now / 70) % 3 === 0 ? 0.6 : 0) : 0
      const z = k.phase === 'wreck' ? Z.FRONT + 2 : Z.OUTSIDE + 5
      out.push({ z, draw: c => {
        const x = xOf(k), y = p.y - k.alt
        if (k.phase === 'roll' || k.phase === 'scrub') { R(c, '#4a4452', x - 10, p.y - 2, 21, 2); R(c, '#2a2630', x - 8, p.y, 2, 2); R(c, '#2a2630', x + 7, p.y, 2, 2) }
        rocket(c, x + (k.phase === 'wreck' ? -14 : 0), k.phase === 'wreck' ? p.y - 6 : y - (k.phase === 'roll' || k.phase === 'scrub' ? 2 : 0), k.rot, flame, now, k.phase === 'wreck' || k.phase === 'fall')
      } })
    }
    out.push({ z: Z.OUTSIDE + 4, draw: c => {
      for (const q of parts) {
        if (q.spark) continue
        const a = Math.max(0, q.life / q.max)
        c.fillStyle = `rgba(${q.rgb},${0.42 * a})`; c.beginPath(); c.arc(q.x, q.y, q.r + (1 - a) * q.grow * 2, 0, Math.PI * 2); c.fill()
      }
    } })
    out.push({ z: Z.TOP + 3, draw: c => {
      for (const q of parts) {
        if (!q.spark) continue
        const a = Math.max(0, q.life / q.max)
        c.globalAlpha = Math.min(1, a * 1.4); R(c, q.col, q.x, q.y, 1, 1); if (a > 0.6) R(c, q.col, q.x - q.vx * 0.04, q.y - q.vy * 0.04, 1, 1)
      }
      c.globalAlpha = 1
      for (const s of stars) {
        const tw = 0.6 + 0.4 * Math.sin(now / 300 + s.x), y = p.y - s.dy, col = `rgba(255,236,150,${tw})`
        R(c, col, s.x, y - 2, 1, 5); R(c, col, s.x - 2, y, 5, 1); R(c, '#fffbe8', s.x, y, 1, 1)
      }
    } })
  })
  tower.on('glow', (c, now, n) => {
    const p = pad(); if (!p) return
    const pool = (x, y, r, col, al) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
    for (const k of rockets.values()) if (k.phase === 'climb' || k.phase === 'orbit') pool(slotX(k.slot), p.y - k.alt + 8, 30, '255,150,60', 0.5 * Math.max(n, 0.3))
    const g = gantry(); if (Math.floor(now / 700) % 2) pool(g.x + 2, g.y - 2, 8, '255,60,40', 0.6 * n)
    for (const lx of [p.x - 8, p.x + p.w + 5]) pool(lx, p.y - 19, 22, '255,240,190', 0.35 * n)
  })

  // ---------- labels: the deploy over a flying rocket ----------
  tower.on('overlay', (v, now) => {
    const p = pad(), k0 = tower.zoom; if (!p || k0 < 2) return
    v.textBaseline = 'middle'
    for (const k of rockets.values()) {
      if (!['climb', 'orbit', 'fizzle', 'fall', 'pad'].includes(k.phase) || k.slot < 0) continue
      if (k.phase === 'orbit' && k.alt > CLIMB + 30) continue
      const left = k.slot === 0, s = tower.worldToScreen(slotX(k.slot) + (left ? -12 : 13), p.y - k.alt - 22), fs = Math.min(4.2 * k0, 12)
      const t = fitText(`${k.d.prs?.[0] ? '#' + k.d.prs[0].number + ' · ' : ''}${wfName(k.d.workflow)}`, 60 * k0, font(fs, 700))
      v.font = font(fs, 700); const w = v.measureText(t).width + fs, x0 = left ? s.x - w : s.x
      v.fillStyle = 'rgba(13,18,28,.78)'; v.fillRect(x0, s.y - fs * 0.68, w, fs * 1.36)
      v.textAlign = 'center'; v.fillStyle = k.phase === 'fizzle' || k.phase === 'fall' ? '#ffb0a8' : k.phase === 'pad' ? '#c8d2e0' : '#ffe28a'; v.fillText(t, x0 + w / 2, s.y + 0.5)
    }
    v.textAlign = 'center'; v.textBaseline = 'bottom'
    if (waiting) { const g = gantry(), s = tower.worldToScreen(g.x + 2, g.y - 5); v.font = font(Math.min(4 * k0, 11), 700); v.fillStyle = '#f4c64f'; v.fillText(`+${waiting} queued`, s.x, s.y) }
    v.textAlign = 'left'; v.textBaseline = 'alphabetic'
  })

  // ---------- hover / click ----------
  function hit(w) {
    const p = pad(); if (!p) return null
    for (const k of rockets.values()) {
      if (k.slot < 0 || k.phase === 'inside') continue
      const x = xOf(k), y = p.y - k.alt
      const r = k.phase === 'wreck' ? { x: x - 18, y: p.y - 16, w: 40, h: 18 } : { x: x - 10, y: y - 38, w: 21, h: 42 }
      if (w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h) return { k }
    }
    for (const s of stars) if (Math.abs(w.x - s.x) <= 3 && Math.abs(w.y - (p.y - s.dy)) <= 3) return { star: s }
    const g = gantry()
    if (w.x >= p.x && w.x <= p.x + p.w && w.y >= g.y - 4 && w.y <= p.y + 3) return { pad: true }
    return null
  }
  const stateText = d => d.status !== 'completed' ? (d.status === 'in_progress' ? '<b style="color:#f2a43a">⟳ deploying</b>' : '◌ queued')
    : d.conclusion === 'success' ? '<b style="color:#5fd17a">✓ deployed</b>' : BAD.test(d.conclusion) ? '<b style="color:#ef5a5a">✗ deploy failed</b>' : esc(d.conclusion || '')
  const prLines = d => (d.prs || []).map(q => `<div class="m">#${q.number} ${esc(short(q.title).slice(0, 56))}${q.author ? ' · ' + esc(q.author) : ''}</div>`).join('')
  const card = d => `<div class="t">${esc(wfName(d.workflow))} · ${stateText(d)}</div>${prLines(d) || `<div class="m">${esc(short(d.title).slice(0, 60))}</div>`}<div class="m">started ${esc(api.ago(Date.parse(d.createdAt)))}</div>`
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    if (h.k) return card(h.k.d) + '<div class="m">↗ click for the run</div>'
    if (h.star) return card(h.star.d) + '<div class="m">↗ click for the run</div>'
    const recent = [...list].reverse().filter(d => d.conclusion !== 'skipped').slice(0, 6)
    return `<div class="t">🚀 Launch pad · deploys on trunk</div>${recent.length ? recent.map(d => `<div class="m">${d.status !== 'completed' ? '⟳' : d.conclusion === 'success' ? '✓' : BAD.test(d.conclusion) ? '✗' : '·'} ${esc(wfName(d.workflow))} — ${esc(what(d).slice(0, 48))}</div>`).join('') : '<div class="m">no deploys in the last 6 h</div>'}<div class="m">↗ click for the repo's Actions</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h) return false
    const d = h.k?.d || h.star?.d
    const url = d ? d.url : repo ? `https://github.com/${repo}/actions` : null
    if (url) api.openLink(url); else if (d) api.toast(`${wfName(d.workflow)} · ${d.conclusion || d.status}`)
    return true
  })
}
