// merge-stamp: when a merged PR's parcel is picked up in the post room, a big rubber stamp drops from the ceiling onto
// it — THUNK, the parcel jumps, red ink splatters — and leaves MERGED in red ink before the postal worker carries it
// off to the van (post-room.js holds the pickup through tower.postRoom.hold). The parcel keeps a red mark on its way out.
// ?demo=mergestamp merges one parcel every 15 s and flies to the post room.
import { R } from '../draw.js'
const GLYPH = { M: '7f020c027f', E: '7f49494941', R: '7f09192946', G: '3e4149497a', D: '7f4141221c' }
const DROP = 420, PRESS = 380, LIFT = 520, HOLD = DROP + PRESS + LIFT + 450, IMPRINT_MS = 9000
const INK = '#c8202a', W = 41, H = 13

export default function init(api, tower) {
  const { Z, font } = tower
  const params = api.params, demo = api.demo('mergestamp')
  const stamps = new Map()   // PR number -> { p, t0, x, y, w, h, drops }
  let hooked = false

  function begin(p, q) {
    if (!q) return 0
    const s = { p, t0: performance.now(), x: q.x, y: q.y, w: q.w, h: q.h, drops: [] }
    for (let i = 0; i < 14; i++) { const a = Math.PI * (1.05 + i / 13 * 0.9) + (Math.random() - 0.5) * 0.3, v = 30 + Math.random() * 55; s.drops.push({ vx: Math.cos(a) * v * (Math.random() < 0.5 ? 1 : 1.2), vy: Math.sin(a) * v, r: Math.random() < 0.3 ? 2 : 1 }) }
    stamps.set(p.n, s)
    return HOLD
  }
  tower.on('step', () => {
    if (!hooked && tower.postRoom) {
      hooked = true
      tower.postRoom.hold.push(begin)
      tower.postRoom.jolt.push((p, now) => {
        const s = stamps.get(p.n); if (!s) return null
        const e = now - s.t0 - DROP
        if (e < 0 || e > 320) return e >= 0 && e < PRESS ? { y: 1 } : null
        return { x: [1, -1, 1, 0, -1, 0][Math.floor(e / 55) % 6], y: e < 120 ? 1 : 0 }
      })
      tower.postRoom.decorate.push((c, q, now) => {
        const s = stamps.get(q.p.n); if (!s || now - s.t0 < DROP) return
        R(c, INK, q.x + 1, q.y + 1, q.w - 2, 1); R(c, INK, q.x + 1, q.y + q.h - 2, q.w - 2, 1); R(c, INK, q.x + 1, q.y + 1, 1, q.h - 2); R(c, INK, q.x + q.w - 2, q.y + 1, 1, q.h - 2)
        if (q.w > 5) R(c, INK, q.x + 2, q.y + (q.h >> 1), q.w - 4, 1)
      })
    }
    const now = performance.now()
    for (const [n, s] of stamps) if (now - s.t0 > IMPRINT_MS + 60_000) stamps.delete(n)
  })

  function text(c, x, y, col) {
    let cx = x
    for (const ch of 'MERGED') {
      const g = GLYPH[ch]
      for (let k = 0; k < 5; k++) { const b = parseInt(g.slice(k * 2, k * 2 + 2), 16); for (let r = 0; r < 7; r++) if (b >> r & 1) R(c, col, cx + k, y + r, 1, 1) }
      cx += 6
    }
  }
  function imprint(c, cx, cy, alpha, seed) {
    const x = Math.round(cx - W / 2), y = Math.round(cy - H / 2)
    c.save(); c.globalAlpha = alpha
    R(c, INK, x, y, W, 1); R(c, INK, x, y + H - 1, W, 1); R(c, INK, x, y, 1, H); R(c, INK, x + W - 1, y, 1, H)
    text(c, x + 3, y + 3, INK)
    c.fillStyle = 'rgba(255,240,230,.55)'   // dry patches in the ink
    for (let i = 0; i < 9; i++) c.fillRect(x + 1 + (seed * 7 + i * 13) % (W - 2), y + 1 + (seed + i * 5) % (H - 2), 1, 1)
    c.restore()
  }
  function stampBody(c, cx, bottom, squash) {
    const x = Math.round(cx - (W + 2) / 2), b = Math.round(bottom)
    R(c, '#7a1a1a', x + 1, b - 2, W, 2)                                  // the rubber
    R(c, '#2a2a30', x, b - 6 + squash, W + 2, 4 - squash); R(c, '#4a4a54', x, b - 6 + squash, W + 2, 1)   // the mount
    const nx = Math.round(cx) - 3
    R(c, '#6a4424', nx, b - 15 + squash, 6, 9); R(c, '#8a5a30', nx + 1, b - 15 + squash, 1, 9)            // the neck
    R(c, '#8a5a30', nx - 4, b - 22 + squash, 14, 7); R(c, '#a8743e', nx - 3, b - 22 + squash, 12, 2); R(c, '#5a3a1e', nx - 4, b - 16 + squash, 14, 1)   // the knob
    R(c, '#f2d24a', nx - 1, b - 20 + squash, 8, 2); R(c, INK, nx, b - 20 + squash, 6, 1)                   // its label
  }

  tower.on('items', (out, now) => {
    const f = tower.floor('post'); if (!f || f.open != null || !stamps.size) return
    for (const [n, s] of stamps) {
      const e = now - s.t0; if (e > IMPRINT_MS) continue
      const q = tower.postRoom?.rect(n), cx = (q?.x ?? s.x) + (q?.w ?? s.w) / 2, top = (q?.y ?? s.y), cy = top + (q?.h ?? s.h) / 2
      if (e >= DROP) out.push({ z: Z.FLOOR + 5, draw: c => {
        if (q) imprint(c, cx, cy, Math.min(1, e < IMPRINT_MS - 1500 ? 1 : (IMPRINT_MS - e) / 1500), n % 17)
        c.save(); c.globalAlpha = e < 4000 ? 1 : Math.max(0, 1 - (e - 4000) / 3000)
        for (const d of s.drops) {
          const t = Math.min(0.3, (e - DROP) / 1000), x = cx + d.vx * t, y = Math.min(f.y - d.r, cy + d.vy * t + 120 * t * t)
          R(c, INK, x, y, d.r, d.r)
        }
        c.restore()
      } })
      out.push({ z: Z.STAND + 3, draw: c => {
        if (e < DROP + PRESS + LIFT) {
          const k = e < DROP ? (e / DROP) ** 2 : e < DROP + PRESS ? 1 : 1 - ((e - DROP - PRESS) / LIFT) ** 0.7
          const bottom = f.top - 4 + (cy + H / 2 - (f.top - 4)) * k, squash = e >= DROP && e < DROP + 120 ? 1 : 0
          stampBody(c, cx, bottom, squash)
          if (e >= DROP && e < DROP + 260) {   // the THUNK puff
            const p = (e - DROP) / 260
            c.fillStyle = `rgba(240,232,220,${0.8 * (1 - p)})`
            for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) c.fillRect(Math.round(cx + sx * (W / 2 + 1 + p * 8 + i * 2)), Math.round(bottom - 1 - i - p * 3), 2, 1)
          }
        }
      } })
    }
  })
  tower.on('overlay', v => {
    const k = tower.zoom; if (k < 1.6 || !stamps.size) return
    const now = performance.now()
    for (const [n, s] of stamps) {
      const e = now - s.t0 - DROP; if (e < 0 || e > 900) continue
      const q = tower.postRoom?.rect(n); if (!q) continue
      const p = tower.worldToScreen(q.x + q.w / 2, q.y - 18), a = e < 600 ? 1 : 1 - (e - 600) / 300, sc = 1 + 0.25 * Math.max(0, 1 - e / 150)
      v.save(); v.globalAlpha = a; v.translate(p.x + 9 * k, p.y - e / 40); v.rotate(-0.12); v.scale(sc, sc)
      v.font = font(Math.min(18, 4 * k), 800); v.textAlign = 'left'; v.textBaseline = 'middle'
      v.lineWidth = 3; v.strokeStyle = '#2a1410'; v.strokeText('THUNK!', 0, 0); v.fillStyle = '#ffd84a'; v.fillText('THUNK!', 0, 0)
      v.restore()
    }
  })

  // ---------- ?demo=mergestamp ----------
  if (demo) {
    const FAKE = Array.from({ length: 10 }, (_, i) => ({ n: 3100 + i, title: `demo: parcel ${i + 1}`, author: i % 3 ? 'demo-ana' : 'you', mine: !(i % 3), bot: false, draft: i < 2, review: i % 2 ? 'APPROVED' : null, ci: 'passed', size: 60 + i * 140, conflict: false, forMe: false, labels: [], url: null, createdAt: Date.now() - 2 * 864e5, updatedAt: Date.now() }))
    let T0 = 0, flown = false
    const merged = [], gone = new Set()
    tower.on('snapshot', data => {
      if (!T0) T0 = Date.now()
      const st = { ...(data.street || {}), status: 'ok', post: FAKE, merged: [] }
      const open = st.post.filter(p => !gone.has(p.n) && !p.draft)
      const due = Math.floor((Date.now() - T0 - 5000) / 15000) + 1
      while (merged.length < due && open.length) {
        const p = open.find(p => p.review === 'APPROVED') || open[Math.floor(open.length / 2)]
        open.splice(open.indexOf(p), 1); gone.add(p.n)
        merged.unshift({ number: p.n, title: p.title, author: p.author, mergedAt: new Date().toISOString(), url: null })
      }
      data.street = { ...st, post: st.post.filter(p => !gone.has(p.n)), merged: [...merged, ...(st.merged || [])] }
      if (!flown && !params.get('towerzoom') && tower.floor('post')) { flown = true; setTimeout(() => tower.flyTo('post', 3.2), 600) }
    })
  }
}
