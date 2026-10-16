// bug-squash: the bug critters work-signals.js draws per recent tool error are clickable. A click squashes one (a splat,
// twitching legs, +10, a squish if sound is on); squashes in quick succession combo (+20, +30…). An arcade scoreboard
// on the lobby's back wall keeps today's score and the top five days (localStorage, this browser only). A squashed
// critter stays gone until a new error brings a new one. ?demo=bugsquash: invented errors and a phantom player.
import { R } from '../draw.js'
const KEY = 'agentopolis:bug-squash', COMBO_MS = 1600, SPLAT_MS = 9000, FLOAT_MS = 1100, KEEP_MS = 15 * 60_000
const BOARD = { dx: 314, w: 80, h: 29, up: 77 }   // x from the interior's left, top this far above the lobby floor
const FONT = { A: '010101111101101', B: '110101110101110', G: '011100101101011', H: '101101111101101', N: '110101101101101', O: '111101101101111',
  Q: '010101101110011', S: '011100010001110', U: '101101101101111', W: '101101111111101', ' ': '000000000000000', '×': '000101010101000',
  0: '111101101101111', 1: '010110010010111', 2: '111001111100111', 3: '111001111001111', 4: '101101111001001', 5: '111100111001111',
  6: '111100111101111', 7: '111001001001001', 8: '111101111101111', 9: '111101111001111' }
const pix = (c, s, x, y, col) => { c.fillStyle = col; for (const ch of String(s)) { const g = FONT[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(Math.round(x + i % 3), Math.round(y + Math.floor(i / 3)), 1, 1); x += 4 } }
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` }
const pad4 = n => String(n).padStart(4, '0')

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('bugsquash')
  const splats = [], floats = []
  let combo = 0, lastAt = 0

  // ---------- the score, per browser ----------
  const load = () => { try { const j = JSON.parse(localStorage.getItem(KEY) || 'null'); if (j && typeof j === 'object') return j } catch {} return null }
  const save = () => { if (demo) return; try { localStorage.setItem(KEY, JSON.stringify(store)) } catch {} }
  const store = demo
    ? { day: dayKey(), today: 0, top: [{ d: '2026-09-02', s: 340 }, { d: '2026-09-21', s: 210 }, { d: '2026-10-01', s: 150 }, { d: '2026-10-08', s: 90 }], squashed: [] }
    : { day: dayKey(), today: 0, top: [], squashed: [], ...load() }
  if (!Array.isArray(store.top)) store.top = []
  if (!Array.isArray(store.squashed)) store.squashed = []
  function roll() {
    const d = dayKey(); if (store.day === d) return
    if (store.today > 0) store.top.push({ d: store.day, s: store.today })
    store.top = store.top.sort((a, b) => b.s - a.s).slice(0, 20); store.day = d; store.today = 0; save()
  }
  roll()
  const top5 = () => [...store.top.map(e => ({ ...e })), ...(store.today > 0 ? [{ d: store.day, s: store.today, now: true }] : [])].sort((a, b) => b.s - a.s).slice(0, 5)
  const best = () => Math.max(store.today, ...store.top.map(e => e.s), 0)
  store.squashed = store.squashed.filter(([, t]) => Date.now() - t < KEEP_MS)
  for (const [id] of store.squashed) tower.critters?.squash(id)

  // ---------- the squish ----------
  function squish(n) {
    const lv = api.soundscape?.level() ?? 0, ctx = api.soundscape?.ctx
    if (!lv || !ctx || ctx.state !== 'running') return
    const dest = api.soundscape.out || ctx.destination, t = ctx.currentTime, len = 0.2, buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * len), ctx.sampleRate), d = buf.getChannelData(0)
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length) ** 2
    const src = ctx.createBufferSource(); src.buffer = buf
    const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.Q.value = 7; f.frequency.setValueAtTime(2200, t); f.frequency.exponentialRampToValueAtTime(180, t + len)
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.6 * lv, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + len)
    src.connect(f).connect(g).connect(dest); src.start(t); src.stop(t + len)
    if (n > 1) {
      const o = ctx.createOscillator(), og = ctx.createGain()
      o.type = 'square'; o.frequency.setValueAtTime(520 + n * 110, t + 0.05); o.frequency.setValueAtTime(780 + n * 110, t + 0.1)
      og.gain.setValueAtTime(0.0001, t); og.gain.setValueAtTime(0.06 * lv, t + 0.05); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.2)
      o.connect(og).connect(dest); o.start(t + 0.05); o.stop(t + 0.22)
    }
  }

  function hit(w) {
    const pad = Math.max(4, 9 / tower.zoom)
    let best = null, bd = Infinity
    for (const b of tower.critters?.list() || []) {
      if (b.a < 0.15) continue
      const d = Math.hypot(b.x - w.x, b.y - w.y)
      if (d < pad && d < bd) { best = b; bd = d }
    }
    return best
  }
  function squash(b) {
    if (!tower.critters?.squash(b.id)) return false
    roll()
    const t = performance.now()
    combo = t - lastAt < COMBO_MS ? Math.min(9, combo + 1) : 1; lastAt = t
    const pts = 10 * combo
    store.today += pts
    store.squashed.push([b.id, Date.now()]); store.squashed = store.squashed.filter(([, at]) => Date.now() - at < KEEP_MS).slice(-60)
    save()
    splats.push({ sid: b.sid, x: b.x, ry: b.ry, at: t, shell: b.shell, kind: b.kind, seed: api.hash(b.id) })
    floats.push({ sid: b.sid, x: b.x, ry: b.ry, at: t, pts, combo })
    if (splats.length > 40) splats.shift()
    squish(combo)
    return true
  }
  if (tower.critters) tower.critters.click = w => { const b = hit(w); return b ? squash(b) : false }

  // ---------- demo: invented errors, a phantom player ----------
  if (demo) {
    const errs = new Map(), t0 = Date.now()
    let next = 0, flown = false
    tower.on('snapshot', snap => {
      const now = Date.now(), ss = snap.sessions.slice(0, 3)
      ss.forEach((s, i) => {
        if (!errs.has(s.id)) errs.set(s.id, [-420, -300, -200, -95, -40, -12, -5].slice(i).map(k => now + k * 1000))
        const l = errs.get(s.id)
        if (now - l.at(-1) > 9000 + i * 3000) l.push(now)
        while (l.length && now - l[0] > 9 * 60_000) l.shift()
        s.ext = { ...s.ext, bugs: { errs: [...l] } }
      })
    })
    tower.on('mode', () => {
      if (flown || params.get('towerzoom')) return
      flown = true
      setTimeout(() => { const f = tower.floors.find(f => f.kind === 'session'); f && tower.flyTo({ x: 250, y: f.y - 30 }, 2.6) }, 800)
    })
    tower.on('step', () => {
      const t = performance.now(); if (t < next || Date.now() - t0 < 4000) return
      const list = (tower.critters?.list() || []).filter(b => b.a > 0.5)
      if (list.length) squash(list[Math.floor(Math.random() * list.length)])
      next = t + (Math.random() < 0.45 ? 350 + Math.random() * 500 : 2600 + Math.random() * 2400)
    })
  }

  // ---------- drawing ----------
  function splat(c, s, y, now) {
    const t = now - s.at, a = t < SPLAT_MS - 2000 ? 1 : Math.max(0, (SPLAT_MS - t) / 2000)
    if (a <= 0) return
    c.globalAlpha = a
    const x = Math.round(s.x), yy = Math.round(y), h = s.seed
    if (t < 160) { R(c, '#fff6c2', x - 4, yy, 9, 1); R(c, '#fff6c2', x, yy - 4, 1, 9); R(c, '#fff6c2', x - 3, yy - 3); R(c, '#fff6c2', x + 3, yy - 3); R(c, '#fff6c2', x - 3, yy + 3); R(c, '#fff6c2', x + 3, yy + 3) }
    const goo = '#9fcf3a', dark = '#6f9a22'
    R(c, goo, x - 3, yy - 1, 7, 3); R(c, goo, x - 2, yy - 2, 5, 5)
    for (let i = 0; i < 5; i++) { const k = (h >>> (i * 3)) & 7, dx = [-5, 5, -4, 4, 0, -6, 6, 2][k], dy = [-2, 1, 2, -3, -3, 0, -1, 3][(k + i) & 7]; R(c, i % 2 ? dark : goo, x + dx, yy + dy, 1 + (i & 1), 1) }
    R(c, '#16110e', x - 2, yy, 5, 1); R(c, s.shell || '#4a3a2a', x - 1, yy, 3, 1)
    const tw = t < 1600 ? Math.floor(now / 70) % 2 : 0
    for (const [u, v] of [[-3, -1], [3, -1], [-3, 1], [3, 1], [-2, 2], [2, 2]]) R(c, '#16110e', x + u + (tw && u < 0 ? -1 : 0), yy + v + (tw && v > 0 ? 1 : tw ? -1 : 0))
    c.globalAlpha = 1
  }
  function board(c, f, now) {
    const x = tower.interior.x0 + BOARD.dx, y = f.y - BOARD.up, { w, h } = BOARD
    R(c, 'rgba(0,0,0,.18)', x + 2, y + 2, w, h)
    R(c, '#2a1a3a', x, y, w, h); R(c, '#4a2e66', x, y, w, 1); R(c, '#120a1a', x + 2, y + 9, w - 4, h - 11)
    for (let i = 0; i < w; i += 3) { const on = (Math.floor(now / 160) + i / 3) % 4 === 0; R(c, on ? '#ffe36a' : '#7a5a2a', x + i + 1, y, 1, 1); R(c, on ? '#ffe36a' : '#7a5a2a', x + w - 2 - i, y + h - 1, 1, 1) }
    const title = 'BUG SQUASH', tw = title.length * 4 - 1
    pix(c, title, x + (w - tw) / 2, y + 2, Math.floor(now / 900) % 2 ? '#ff5a8a' : '#ffd23a')
    const rows = top5(), today = store.today
    for (let i = 0; i < 5; i++) {
      const e = rows[i], cx = x + (i < 3 ? 4 : 42), cy = y + 11 + (i % 3) * 6, blink = e?.now && Math.floor(now / 400) % 2
      pix(c, String(i + 1), cx, cy, '#8a7aa8')
      pix(c, e ? pad4(e.s) : '----', cx + 6, cy, e ? (e.now ? (blink ? '#ffffff' : '#7af0ff') : i === 0 ? '#ffd23a' : '#e8e0f0') : '#4a3a5a')
    }
    pix(c, 'NOW', x + 42, y + 23, '#7af0ff'); pix(c, pad4(today), x + 56, y + 23, today ? '#7af0ff' : '#4a6a7a')
    R(c, '#4a2e66', x + 38, y + 11, 1, 16)
  }

  tower.on('items', (out, now, ctx) => {
    const lobby = tower.floors.find(f => f.kind === 'lobby')
    if (lobby) out.push({ z: Z.WALL + 4, draw: c => board(c, lobby, now) })
    for (let i = splats.length - 1; i >= 0; i--) {
      const s = splats[i], f = tower.floor(s.sid)
      if (!f || now - s.at > SPLAT_MS) { splats.splice(i, 1); continue }
      out.push({ z: Z.FLOOR, draw: c => splat(c, s, f.y + s.ry, now) })
    }
  })
  tower.on('glow', (c, now, n) => {
    const lobby = tower.floors.find(f => f.kind === 'lobby'); if (!lobby || n < 0.05) return
    const x = tower.interior.x0 + BOARD.dx + BOARD.w / 2, y = lobby.y - BOARD.up + BOARD.h / 2
    const g = c.createRadialGradient(x, y, 0, x, y, 46); g.addColorStop(0, `rgba(200,90,255,${0.28 * n})`); g.addColorStop(1, 'rgba(200,90,255,0)')
    c.fillStyle = g; c.fillRect(x - 46, y - 46, 92, 92)
  })
  tower.on('overlay', (v, now) => {
    for (let i = floats.length - 1; i >= 0; i--) {
      const s = floats[i], f = tower.floor(s.sid), t = (now - s.at) / FLOAT_MS
      if (!f || t >= 1) { floats.splice(i, 1); continue }
      const p = tower.worldToScreen(s.x, f.y + s.ry), fs = Math.max(11, Math.min(18, 4 * tower.zoom)) * (s.combo > 1 ? 1.15 : 1)
      const y = p.y - 8 - t * 34, text = `+${s.pts}` + (s.combo > 1 ? ` COMBO ×${s.combo}` : '')
      v.globalAlpha = Math.min(1, (1 - t) * 2.2); v.font = font(fs, 800); v.textAlign = 'center'; v.textBaseline = 'bottom'
      v.lineWidth = 3; v.strokeStyle = 'rgba(20,10,30,.85)'; v.strokeText(text, p.x, y)
      v.fillStyle = s.combo > 1 ? '#ff5a8a' : '#ffe36a'; v.fillText(text, p.x, y)
      v.globalAlpha = 1; v.textAlign = 'left'
    }
  })
  tower.on('hover', (w, person) => {
    if (person) return null
    const lobby = tower.floors.find(f => f.kind === 'lobby'); if (!lobby) return null
    const x = tower.interior.x0 + BOARD.dx, y = lobby.y - BOARD.up
    if (w.x < x || w.x > x + BOARD.w || w.y < y || w.y > y + BOARD.h) return null
    roll()
    const rows = top5().map((e, i) => `<div${e.now ? ' style="color:#7af0ff"' : ' class="m"'}>${i + 1}. <b>${e.s}</b> · ${e.now ? 'today' : esc(e.d)}</div>`).join('')
    return `<div class="t">🐞 BUG SQUASH</div><div>today <b>${store.today}</b> · high score <b>${best()}</b></div>${rows || '<div class="m">no scores yet</div>'}<div class="m">click the bugs crawling on a session floor: +10 each, quick squashes combo (+20, +30…) · scores stay in this browser</div>`
  })
}
