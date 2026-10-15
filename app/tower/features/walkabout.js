// walkabout: when the user types a prompt into a session (snap ext.walkabout { at, text }), he leaves the CEO office,
// rides down to that floor, stands by its desk a moment saying the first words, and goes back. A newer prompt
// elsewhere sends him there instead. His chair stays empty meanwhile; the phone and the waiting line carry on.
// ?demo=walkabout sends him to two floors in quick succession, then round again every 40 s.
const STAND_MS = 4500, FRESH_MS = 90_000, TRIP_MS = 120_000
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }

export default function init(api, tower) {
  const { Z } = tower
  const demo = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('walkabout')
  const seen = new Map()   // session id -> newest prompt time already acted on
  let primed = false, trip = null

  // the user's sheet: tower.js recolours row 0 of char_0 for his chair; this is the same suit on every row, for walking
  let sheet = null
  function paulSheet() {
    if (sheet) return sheet
    const src = api.charSheet(0, 0); if (!src?.width) return null
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
    const x = cv.getContext('2d'); x.drawImage(src, 0, 0)
    const d = x.getImageData(0, 0, cv.width, cv.height), p = d.data
    for (let i = 0; i < p.length; i += 4) {
      const [r, g, b] = [p[i], p[i + 1], p[i + 2]]
      if (p[i + 3] && b > r + 30 && b > g + 10) { const l = (r + g + b) / 3; p[i] = p[i + 1] = Math.round(26 + l * 0.42); p[i + 2] = Math.round(34 + l * 0.46) }
    }
    x.putImageData(d, 0, 0)
    return (sheet = cv)
  }
  function drawWalker(c, p, now) {
    const sh = tower.avatar?.sheet() || paulSheet(); if (!sh) return
    let row = 2, frame = 1, flip = false
    if (p.riding) { row = 0 }
    else if (p.walking) { flip = p.dir === 'left'; frame = [0, 1, 2, 1][Math.floor(now / 130) % 4] }
    else { const f = p.face || 'left'; row = f === 'down' ? 0 : f === 'up' ? 1 : 2; flip = f === 'left' }
    const dx = Math.round(p.x - 8), dy = Math.round(p.y - 30)
    if (flip) { c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(sh, frame * 16, row * 32, 16, 32, 0, 0, 16, 32) }
    else c.drawImage(sh, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
    if (!p.walking && !p.riding) R(c, '#c9a25a', p.x + (flip ? -3 : 2), p.y - 21, 1, 1)
  }

  // ---------- the trip ----------
  const deskX = () => tower.interior.x0 + 80
  function goTo(sid, text) {
    if (!tower.floor(sid) || !tower.slots) return
    if (!trip || trip.npc.gone) {
      const npc = tower.spawn({ id: 'paul-walkabout', floor: 'ceo', x: tower.slots.seat, draw: drawWalker, face: 'left', z: Z.WALK })
      trip = { npc, t0: performance.now() }
    }
    Object.assign(trip, { sid, text, phase: 'out', standT: 0 })
    const t = trip
    t.npc.go(sid, deskX(), { face: 'left', then: () => { if (trip === t && t.sid === sid) { t.phase = 'there'; t.standT = performance.now() } } })
  }
  function goHome() {
    const t = trip; t.phase = 'home'
    t.npc.go('ceo', tower.slots.seat, { face: 'right', then: () => { if (trip === t && t.phase === 'home') { t.npc.remove(); trip = null } } })
  }
  tower.on('step', (dt, now) => {
    if (!trip) return
    if (trip.npc.gone || now - trip.t0 > TRIP_MS) { if (!trip.npc.gone) trip.npc.remove(); trip = null; return }
    if (trip.phase === 'out' && !tower.floor(trip.sid)) goHome()
    else if (trip.phase === 'there' && now - trip.standT > STAND_MS) goHome()
  })

  tower.on('sync', data => {
    let best = null
    for (const s of data.sessions) {
      const w = s.ext?.walkabout; if (!w?.at) continue
      const was = seen.get(s.id); seen.set(s.id, Math.max(was ?? 0, w.at))
      if (!primed || (was != null && w.at <= was) || Date.now() - w.at > FRESH_MS || s.running === false) continue
      if (!best || w.at > best.w.at) best = { s, w }
    }
    primed = true
    if (best && api.live !== false) goTo(best.s.id, best.w.text)
  })

  // ---------- the empty chair: tower.js draws the user seated at Z.SEATED + 5; while he is out, paint back what was under him ----------
  const patch = document.createElement('canvas'), pc = patch.getContext('2d')
  patch.width = 18; patch.height = 34
  let patched = false
  tower.on('items', out => {
    const s = tower.slots; if (!trip || !s) return
    const x = Math.round(s.seat - 9), y = Math.round(s.floor.y - 47)
    out.push({ z: Z.SEATED + 4.99, draw: c => {
      const m = c.getTransform(); pc.clearRect(0, 0, 18, 34)
      pc.drawImage(c.canvas, x * m.a + m.e, y * m.d + m.f, 18, 34, 0, 0, 18, 34); patched = true
    } })
    out.push({ z: Z.SEATED + 5.01, draw: c => { if (patched) { c.clearRect(x, y, 18, 34); c.drawImage(patch, x, y) } patched = false } })
  })

  // ---------- his bubble, over the session's own ----------
  tower.on('overlay', (c, now) => {
    if (!trip || trip.npc.gone || trip.phase !== 'there') return
    const p = tower.worldToScreen(trip.npc.x, trip.npc.y - 31), k = tower.zoom
    tower.bubble(p.x + 4 * k, p.y - Math.max(10, Math.min(16, 5.6 * k)) - 16, '💬 ' + trip.text, '#c9a25a')
  })
  tower.on('hover', (w, person) => {
    if (!trip || trip.npc.gone) return null
    const n = trip.npc
    if (Math.abs(w.x - n.x) > 7 || w.y < n.y - 28 || w.y > n.y + 1) return null
    const title = tower.snapshot?.sessions?.find(s => s.id === trip.sid)?.title || 'a session'
    return `<div class="t">${api.esc(api.owner)} · CEO</div><div class="m">${trip.phase === 'home' ? 'heading back to the office' : 'dropping by ' + api.esc(title)}</div><div>${api.esc(trip.text)}</div>`
  })

  // ---------- ?demo=walkabout ----------
  if (!demo) return
  const TEXTS = ['can you also check the desktop build?', 'ship it! open the PR as a draft', 'what does the elevator do at night?']
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now(); if (!t0) t0 = now
    const ss = data.sessions.filter(s => s.running !== false); if (!ss.length) return
    const round = Math.floor((now - t0) / 40000), into = now - t0 - round * 40000
    const a = ss[(round * 2 + 1) % ss.length], b = ss[(round * 2 + 2) % ss.length]
    const at = (s, ms, i) => { if (into > ms) s.ext = { ...s.ext, walkabout: { at: t0 + round * 40000 + ms, text: TEXTS[(round + i) % TEXTS.length] } } }
    at(a, 2000, 0)
    if (b !== a) at(b, 3500, 1)
  })
  // the camera chases him (tower.follow is for people with a session)
  tower.on('step', dt => {
    if (!trip || trip.npc.gone) return
    const cam = tower.cam, k = 1 - Math.exp(-dt * 4)
    cam.auto = false; cam.zoom += (3 - cam.zoom) * k; cam.cx += (trip.npc.x - cam.cx) * k; cam.cy += (trip.npc.y - 16 - cam.cy) * k
  })
}
