// easter-eggs: a few secrets. ↑↑↓↓←→←→BA throws a 20 s disco (mirror balls drop in the lobby and the café, spotlights
// sweep every floor, everyone bobs, a beat if the ambience is on). Clicking the CEO 10× quickly makes him dance a jig.
// Typing "coffee" sends everyone who isn't working to the café for a break. Clicking the elevator 5× plays elevator
// music. Keys typed into inputs or dialogs never count. ?demo=eastereggs starts the disco.
import { R } from '../draw.js'
const DISCO_MS = 20_000, JIG_MS = 9000, COFFEE_MS = 30_000, MUZAK_MS = 16_000
const KONAMI = ['arrowup', 'arrowup', 'arrowdown', 'arrowdown', 'arrowleft', 'arrowright', 'arrowleft', 'arrowright', 'b', 'a']
const WORKING = new Set(['tool', 'thinking', 'building'])   // a delegating lead is free: the subagents do the work
const HUES = [330, 50, 190, 120, 270, 20]
const NOTE = ['.##', '.#.', '.#.', '##.', '##.']
function note(c, x, y, col) { c.fillStyle = col; NOTE.forEach((r, j) => { for (let i = 0; i < 3; i++) if (r[i] === '#') c.fillRect(Math.round(x) + i, Math.round(y) + j, 1, 1) }) }

export default function init(api, tower) {
  const { Z } = tower
  const demo = api.demo('eastereggs')
  let disco = 0, jig = 0, muzak = 0, keys = [], typed = ''
  const ceoClicks = [], carClicks = [], coffee = new Map()   // person id -> sent at
  const sound = () => { const s = api.soundscape; return s?.level() > 0 && s.ctx?.state === 'running' ? s : null }

  // ---------- keys ----------
  addEventListener('keydown', e => {
    if (e.metaKey || e.ctrlKey || e.altKey || !tower.active) return
    if (e.target.closest?.('input, textarea, select, [contenteditable], dialog, [role=dialog], #settings')) return
    const k = e.key.toLowerCase()
    keys = [...keys, k].slice(-KONAMI.length)
    if (keys.join() === KONAMI.join()) { keys = []; startDisco() }
    if (k.length === 1) { typed = (typed + k).slice(-12); if (typed.endsWith('coffee')) { typed = ''; coffeeBreak() } }
  })

  // ---------- disco ----------
  function startDisco() {
    disco = performance.now()
    api.toast('🪩 Disco!', 2500)
    const s = sound(); if (s) beat(s.ctx, s.level())
  }
  const on = now => disco && now - disco < DISCO_MS
  function beat(ctx, vol) {
    const out = ctx.createGain(); out.gain.value = 0.22 * vol; out.connect(api.soundscape.out || ctx.destination)
    const t0 = ctx.currentTime + 0.05, spb = 0.5, bars = Math.floor(DISCO_MS / 1000 / spb)
    const BASS = [55, 55, 82.4, 73.4]
    for (let i = 0; i < bars; i++) {
      const t = t0 + i * spb
      const k = ctx.createOscillator(), kg = ctx.createGain()
      k.frequency.setValueAtTime(140, t); k.frequency.exponentialRampToValueAtTime(40, t + 0.12)
      kg.gain.setValueAtTime(1, t); kg.gain.exponentialRampToValueAtTime(0.001, t + 0.18)
      k.connect(kg).connect(out); k.start(t); k.stop(t + 0.2)
      const h = ctx.createOscillator(), hg = ctx.createGain(), hp = ctx.createBiquadFilter()
      h.type = 'square'; h.frequency.value = 7000; hp.type = 'highpass'; hp.frequency.value = 6000
      hg.gain.setValueAtTime(0.12, t + spb / 2); hg.gain.exponentialRampToValueAtTime(0.001, t + spb / 2 + 0.05)
      h.connect(hp).connect(hg).connect(out); h.start(t + spb / 2); h.stop(t + spb / 2 + 0.06)
      const b = ctx.createOscillator(), bg = ctx.createGain()
      b.type = 'sawtooth'; b.frequency.value = BASS[Math.floor(i / 2) % 4] * (i % 2 ? 2 : 1)
      bg.gain.setValueAtTime(0.18, t + spb / 2); bg.gain.exponentialRampToValueAtTime(0.001, t + spb - 0.02)
      b.connect(bg).connect(out); b.start(t + spb / 2); b.stop(t + spb)
    }
  }
  const balls = () => [['lobby', 0.82], ['cafe', 0.4]].map(([id, k]) => { const f = tower.floor(id); return f && { f, x: tower.interior.x0 + Math.round((tower.interior.x1 - tower.interior.x0) * k) } }).filter(Boolean)
  function ball(c, b, now) {
    const t = Math.min(1, (now - disco) / 1200), up = Math.max(0, 1 - (DISCO_MS - (now - disco)) / 1000)
    const len = Math.round(16 * t * (1 - up)), cy = b.f.top + len + 5
    R(c, '#5a5a62', b.x, b.f.top, 1, len)
    const spin = Math.floor(now / 120)
    for (let j = -4; j <= 4; j++) for (let i = -4; i <= 4; i++) {
      if (i * i + j * j > 18) continue
      const lit = (i + j + spin) % 3 === 0
      R(c, lit ? '#ffffff' : (i + j) & 1 ? '#c8ccd6' : '#8d93a3', b.x + i, cy + j, 1, 1)
    }
  }
  function sparkles(c, b, now) {
    for (let i = 0; i < 26; i++) {
      const h = api.hash('sp' + i), x = tower.interior.x0 + ((h % 480) + now / 30 * (1 + (h >>> 9) % 3)) % (tower.interior.x1 - tower.interior.x0)
      const y = b.f.top + 6 + (h >>> 4) % Math.max(1, b.f.y - b.f.top - 12)
      R(c, `hsla(${HUES[i % HUES.length]},100%,80%,.85)`, x, y, 1, 1)
    }
  }
  function spots(c, f, now) {
    const x0 = tower.interior.x0, x1 = tower.interior.x1, h = f.y - f.top
    c.save(); c.beginPath(); c.rect(x0, f.top, x1 - x0, h); c.clip(); c.globalCompositeOperation = 'lighter'
    for (let i = 0; i < 3; i++) {
      const sx = x0 + (x1 - x0) * (i + 0.5) / 3, a = Math.sin(now / 700 + i * 2.1 + f.y / 40) * 0.9, hue = HUES[(i + Math.floor(now / 500) + api.hash(f.id) % 6) % HUES.length]
      const ex = sx + Math.tan(a) * h, w = 14
      c.fillStyle = `hsla(${hue},100%,60%,.16)`
      c.beginPath(); c.moveTo(sx - 1, f.top); c.lineTo(sx + 1, f.top); c.lineTo(ex + w, f.y); c.lineTo(ex - w, f.y); c.fill()
      c.fillStyle = `hsla(${hue},100%,70%,.28)`; c.fillRect(Math.round(ex - w), f.y - 2, w * 2, 2)
    }
    c.restore()
  }
  let tmp = null
  function bob(c, now) {   // everyone hops a pixel on the beat (a copy of their patch of the world, one pixel up)
    if (Math.floor((now - disco) / 250) % 2) return
    const m = c.getTransform(), done = []
    tmp ??= document.createElement('canvas'); if (tmp.width !== 18) { tmp.width = 18; tmp.height = 50 }
    const tc = tmp.getContext('2d')
    for (const p of tower.people) {
      if (p.floor == null || p.leaving || done.some(d => d.f === p.floor && Math.abs(d.x - p.x) < 18)) continue
      done.push({ f: p.floor, x: p.x })
      const h = p.seated ? 48 : 32, x = Math.round(p.x - 9), y = Math.round(p.y - h)
      tc.clearRect(0, 0, 18, 50); tc.drawImage(c.canvas, x * m.a + m.e, y * m.d + m.f, 18 * m.a, h * m.d, 0, 0, 18, h)
      c.drawImage(tmp, 0, 0, 18, h, x, y - 1, 18, h)
    }
  }

  // ---------- the CEO's jig ----------
  let sheet = null
  function ceoSheet() {
    if (tower.avatar?.sheet) { const s = tower.avatar.sheet(); if (s) return s }
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
  const JIG = [[0, 0, false, 0], [0, 2, false, 2], [2, 0, false, 0], [2, 2, true, 2], [0, 0, false, 0], [0, 2, false, 2], [2, 1, true, 1], [2, 1, false, 1]]
  function dancer(c, now) {
    const s = tower.slots, sh = ceoSheet(); if (!s || !sh) return
    const [row, frame, flip, hop] = JIG[Math.floor((now - jig) / 220) % JIG.length]
    const dx = Math.round(s.seat - 8), dy = Math.round(s.desk.y - 31 - hop)   // up on the desk
    if (flip) { c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(sh, frame * 16, row * 32, 16, 32, 0, 0, 16, 32) }
    else c.drawImage(sh, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
  }
  const jigging = now => jig && now - jig < JIG_MS
  const patch = document.createElement('canvas'), pc = patch.getContext('2d')
  patch.width = 18; patch.height = 34
  let patched = false
  function chime(freqs, step) {
    const s = sound(); if (!s) return
    const ctx = s.ctx, out = ctx.createGain(); out.gain.value = 0.12 * s.level(); out.connect(s.out || ctx.destination)
    freqs.forEach((f, i) => {
      if (!f) return
      const t = ctx.currentTime + 0.05 + i * step, o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'triangle'; o.frequency.value = f
      g.gain.setValueAtTime(0.001, t); g.gain.linearRampToValueAtTime(1, t + 0.02); g.gain.exponentialRampToValueAtTime(0.001, t + step * 0.95)
      o.connect(g).connect(out); o.start(t); o.stop(t + step)
    })
  }
  const JIG_TUNE = [587, 494, 392, 494, 587, 659, 587, 494, 440, 370, 440, 494, 392, 0, 392, 0]
  const MUZAK = [392, 494, 587, 740, 659, 587, 494, 0, 440, 523, 659, 587, 523, 494, 440, 0, 392, 494, 587, 784, 740, 659, 587, 0, 523, 494, 440, 392, 0, 0]

  // ---------- coffee ----------
  function coffeeBreak() {
    const cafe = tower.floor('cafe'); if (!cafe) return
    const spots = tower.spots.filter(s => s.floor === 'cafe')
    let n = 0
    for (const p of tower.people) {
      if (p.steered || p.leaving || p.floor == null || WORKING.has(p.state) || coffee.has(p.id)) continue
      const sp = spots[n % spots.length], x = sp ? sp.x + Math.floor(n / spots.length) * 6 : tower.interior.x0 + 20 + n * 12
      if (tower.sendTo(p.id, 'cafe', x, { face: sp?.face || 'up', pose: 'stand', activity: 'coffee' })) { coffee.set(p.id, performance.now()); n++ }
    }
    api.toast(n ? `☕ Coffee break! ${n} head${n === 1 ? 's' : ''} to the café` : '☕ Everyone is busy — no coffee break', 3000)
  }

  tower.on('step', (dt, now) => {
    for (const [id, t] of coffee) {
      const p = tower.person(id)
      if (!p) { coffee.delete(id); continue }
      if (now - t > COFFEE_MS || (WORKING.has(p.state) && now - t > 12_000)) { tower.release(id); coffee.delete(id) }
    }
  })

  // ---------- clicks ----------
  const quick = (list, now, n, gap) => { list.push(now); while (list.length && now - list[0] > gap * n) list.shift(); return list.length }
  // interactions.js swallows a quick second click, so count raw pointer taps on the canvas instead
  let downAt = null
  addEventListener('pointerdown', e => { downAt = e.target === tower.canvas ? { x: e.clientX, y: e.clientY } : null }, true)
  addEventListener('pointerup', e => {
    if (!downAt || e.target !== tower.canvas || !tower.active || Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 4) return
    const r = tower.canvas.getBoundingClientRect(), w = tower.screenToWorld(e.clientX - r.left, e.clientY - r.top)
    const now = performance.now(), s = tower.slots, car = tower.car
    if (s && w.x > s.seat - 8 && w.x < s.seat + 8 && w.y > s.floor.y - 48 && w.y < s.desk.y) {
      if (quick(ceoClicks, now, 10, 450) >= 10 && !jigging(now)) { ceoClicks.length = 0; jig = now; chime(JIG_TUNE, 0.18) }
    } else if (car && Math.abs(w.x - car.x) < 15 && w.y > car.y - 46 && w.y < car.y) {
      if (quick(carClicks, now, 5, 600) >= 5) { carClicks.length = 0; muzak = now; chime(MUZAK, 0.3); api.toast('🎵 Now playing: elevator music', 2500) }
    }
  }, true)

  // ---------- drawing ----------
  tower.on('items', (out, now) => {
    if (on(now)) for (const b of balls()) {
      out.push({ z: Z.WALL + 8, draw: c => sparkles(c, b, now) })
      out.push({ z: Z.STAND + 9, draw: c => ball(c, b, now) })
    }
    if (jigging(now) && tower.slots) {
      const s = tower.slots, x = Math.round(s.seat - 9), y = Math.round(s.floor.y - 47)
      out.push({ z: Z.SEATED + 4.99, draw: c => {
        const m = c.getTransform(); pc.clearRect(0, 0, 18, 34)
        pc.drawImage(c.canvas, x * m.a + m.e, y * m.d + m.f, 18, 34, 0, 0, 18, 34); patched = true
      } })
      out.push({ z: Z.SEATED + 5.01, draw: c => { if (patched) { c.clearRect(x, y, 18, 34); c.drawImage(patch, x, y) } patched = false } })
      out.push({ z: Z.FRONT + 10, draw: c => dancer(c, now) })
      out.push({ z: Z.FRONT + 20, draw: c => notes(c, s.seat, s.desk.y - 34, now - jig, JIG_MS, '#c9a25a') })
    }
    const car = tower.car
    if (muzak && now - muzak < MUZAK_MS && car) out.push({ z: Z.RIDE + 5, draw: c => notes(c, car.x, car.y - 40, now - muzak, MUZAK_MS, '#7ab8f0') })
  })
  function notes(c, x, y, t, dur, col) {
    for (let i = 0; i < 5; i++) {
      const life = (t / 1000 + i * 0.45) % 2.2, a = Math.min(1, (dur - t) / 600) * (1 - life / 2.2)
      if (a <= 0 || t < i * 450) continue
      c.globalAlpha = a
      note(c, x + Math.sin(life * 3 + i) * 7 + (i % 2 ? 4 : -6), y - life * 12, i % 2 ? col : '#f2f2f2')
    }
    c.globalAlpha = 1
  }
  tower.on('post', (c, now) => {
    if (!on(now)) return
    bob(c, now)
    for (const f of tower.floors) if (f.top < f.y && f.kind !== 'roof') spots(c, f, now)
  })
  tower.on('glow', (c, now, n) => {
    if (!on(now)) return
    for (const b of balls()) { c.fillStyle = `rgba(255,255,255,${0.35 * n})`; c.fillRect(b.x - 6, b.f.top + 15, 13, 13) }
  })
  tower.on('hover', (w, person) => {
    if (person) return null
    const now = performance.now(), car = tower.car
    if (muzak && now - muzak < MUZAK_MS && car && Math.abs(w.x - car.x) < 15 && w.y > car.y - 46 && w.y < car.y) return '<div class="t">🎵 Elevator music</div><div class="m">the girl from Ipanema goes walking…</div>'
    return null
  })

  // ---------- ?demo=eastereggs ----------
  if (!demo) return
  tower.on('mode', () => setTimeout(startDisco, 1200))
  setInterval(() => { if (!on(performance.now())) startDisco() }, DISCO_MS + 6000)
}
