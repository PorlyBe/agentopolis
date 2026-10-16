// ceo-office: the penthouse's history scenery (see the API reference at the top of ../tower.js).
// Wall of fame + TV (snap.achievements, snap.tv, snap.cost; new medals take the TV over through notify.js's
// 'office:achievement' event), the trophy cabinet (snap.trophies), the review-request inbox on the desk (snap.street.forMe,
// carried up by a courier; read state kept in localStorage), today's Gazette on the desk (snap.gazette, opens the
// broadsheet), a brass plaque with today's spend (snap.cost) and, in the lobby, the commit printer under a cork board
// that replaces the old empty TV frame. ?demo=ceo fakes all of it and flies there; ?demo=print prints a fake commit.
const PANEL_MS = 6000, STATIC_MS = 260, TAKEOVER_MS = 8000, OUT_MS = 1400, HOLD_MS = 5200, DROP_MS = 500, TRAY_CAP = 5
const TIERS = { gold: ['#f2c14e', '#b8862a', '#fff1b8'], silver: ['#dfe4ea', '#9aa3ad', '#ffffff'], bronze: ['#d8925a', '#9a5a2a', '#ffd2a8'] }
const RIBBONS = { gold: ['#d84a4a', '#3a6fd8'], silver: ['#3a6fd8', '#e8e8f0'], bronze: ['#2f9a5a', '#e8e8f0'] }
const MF = { w: 11, h: 16, gap: 2 }, READ_KEY = 'github-street:read'
const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(n >= 1e10 ? 0 : 2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(n ?? 0)
const money = n => '$' + (n >= 1000 ? fmt(Math.round(n)) : n >= 100 ? Math.round(n) : n.toFixed(2))
const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
const inR = (p, r, pad = 1) => p && r && p.x >= r.x - pad && p.x <= r.x + r.w + pad && p.y >= r.y - pad && p.y <= r.y + r.h + pad

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const demos = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo')
  const demo = demos.includes('ceo'), demoPrint = demo || demos.includes('print')
  const loadT = Date.now()
  let snap = null, fame = [], tv = null, cost = null, trophies = null, street = null, paper = null
  const evFame = new Map(), takeovers = []
  let show = null, latestAt = -1e9

  // ---------- geometry (read every frame: the office moves when sessions come and go) ----------
  const IX = () => tower.interior.x0
  function wall() {
    const s = tower.slots; if (!s) return null
    const f = s.fame, tvR = { x: f.x + 40, y: f.y + 2, w: 55, h: 36 }
    const frames = []
    for (let i = 0; i < 12; i++) {   // nearest the TV first, alternating sides, top row first
      const side = i % 2, j = i >> 1, col = j % 3, row = j >= 3 ? 1 : 0
      const y = f.y + 3 + row * (MF.h + 2)
      frames.push({ x: side ? f.x + 108 + col * (MF.w + MF.gap) : f.x + 37 - MF.w - col * (MF.w + MF.gap), y, w: MF.w, h: MF.h })
    }
    return { f, tv: tvR, screen: { x: tvR.x + 3, y: tvR.y + 3, w: tvR.w - 6, h: tvR.h - 8 }, frames, plaque: { x: tvR.x + 4, y: f.y + 41, w: 47, h: 9 } }
  }
  const lobbyBits = () => {
    const l = tower.lobby; if (!l) return null
    const f = l.floor, x = IX()
    return { f, wall: l.wall, board: { x: x + 214, y: f.top + 9, w: 84, h: 26 }, printer: { x: x + 248, y: f.y - 31, w: 16, h: 31 } }
  }

  // ---------- data ----------
  addEventListener('office:achievement', e => {
    const a = e.detail; if (!a?.key) return
    evFame.set(a.key, a); latestAt = performance.now()
    if (takeovers.length < 6) takeovers.push(a)
  })
  const seenCommits = new Set(), queue = [], printed = []
  let job = null, stack = 0, primed = false
  const seenMail = new Set(), arrived = new Set()
  let read = new Set()
  try { read = new Set(JSON.parse(localStorage.getItem(READ_KEY) || '[]')) } catch {}
  const saveRead = () => { try { const prev = JSON.parse(localStorage.getItem(READ_KEY) || '[]'); localStorage.setItem(READ_KEY, JSON.stringify([...new Set([...prev, ...read])].slice(-300))) } catch {} }
  let lastHeadline = null, paperFlash = -1e9

  tower.on('sync', data => {
    snap = data
    const d = demo ? fakeAll(data) : data
    tv = d.tv || null; cost = d.cost || null; trophies = d.trophies || null; street = d.street || null
    const list = [...(d.achievements?.list || [])]
    for (const a of evFame.values()) if (!list.some(x => x.key === a.key)) list.push(a)
    fame = list.sort((a, b) => b.earnedAt - a.earnedAt)
    // commits made since the page loaded go through the printer; older ones are already pinned to the board
    for (const c of tv?.commits || []) {
      if (seenCommits.has(c.id)) continue
      seenCommits.add(c.id)
      if (c.t >= loadT - 3000) queue.push(c); else printed.push(c)
    }
    if (queue.length > 4) queue.splice(0, queue.length - 4)
    // review mail: open requests on load are already in the tray; anything new is carried up by a courier
    if (street?.status === 'ok') {
      for (const m of street.forMe || []) {
        if (seenMail.has(m.id) || m.bot) continue
        seenMail.add(m.id)
        if (!primed) { if (m.kind === 'request') arrived.add(m.id) } else deliver(m)
      }
      primed = true
    }
    paper = d.gazette || null
    const h = paper?.headline?.title
    if (lastHeadline !== null && h !== lastHeadline) paperFlash = performance.now()
    if (h != null) lastHeadline = h
  })
  const envelopes = () => (street?.forMe || []).filter(m => !m.bot && arrived.has(m.id) && !read.has(m.id))

  // ---------- the courier: walks in from the street and rides up to the user's desk with the envelope ----------
  const couriers = []
  function deliver(m) {
    if (!tower.active || !tower.slots) { arrived.add(m.id); return }
    const npc = tower.spawn({ look: api.lookOf(m.who || 'courier'), from: 'street' })
    const c = { npc, m, t0: performance.now(), done: false }
    couriers.push(c)
    npc.go('ceo', tower.slots.inbox.x - 10, { face: 'right', then: () => {
      arrived.add(m.id); c.done = true
      setTimeout(() => npc.leave(), 1600)
    } })
  }
  tower.on('step', () => {
    for (let i = couriers.length - 1; i >= 0; i--) {
      const c = couriers[i]
      if (!c.done && performance.now() - c.t0 > 60_000) { arrived.add(c.m.id); c.done = true; c.npc.leave() }
      if (c.npc.gone) couriers.splice(i, 1)
    }
  })

  // ---------- the printer ----------
  tower.on('step', (dt, now) => {
    if (!job && queue.length) job = { c: queue.shift(), t0: now }
    if (job && now - job.t0 > OUT_MS + HOLD_MS + DROP_MS) { stack = Math.min(TRAY_CAP, stack + 1); printed.push(job.c); job = null }
    if (show && now - show.t0 > TAKEOVER_MS) show = null
    if (!show && takeovers.length) show = { a: takeovers.shift(), t0: now }
  })

  // ---------- world items ----------
  tower.on('items', (out, now) => {
    const w = wall(), s = tower.slots, lb = lobbyBits()
    if (w) {
      out.push({ z: Z.WALL, draw: c => { drawWall(c, w, now); drawCabinet(c, s.trophies, now) } })
      out.push({ z: Z.FRONT + 1, draw: c => { drawInbox(c, s.inbox, now); drawPaper(c, s.gazette, now) } })
    }
    if (lb) {
      out.push({ z: Z.WALL, draw: c => { coverLobbyFrame(c, lb); drawBoard(c, lb.board) } })
      out.push({ z: Z.FLOOR, draw: c => drawPrinter(c, lb.printer, now) })
    }
    for (const cr of couriers) if (!cr.done && !cr.npc.gone && cr.npc.floor) out.push({ z: Z.WALK + 1, draw: c => {   // the envelope under the courier's arm
      const x = Math.round(cr.npc.x) + (cr.npc.dir === 'left' ? -6 : 3), y = Math.round(cr.npc.y) - 15
      R(c, '#8a8478', x, y, 6, 4); R(c, '#fbfaf4', x, y, 5, 3); R(c, '#c64545', x + 2, y + 1, 1, 1)
    } })
  })

  // the CEO wall: plain panelled wall where the reserved outline was, then medals, the TV and the plaque
  function drawWall(c, w, now) {
    const f = w.f, s = tower.slots, fl = s.floor
    R(c, '#d8ccb2', f.x, f.y, f.w, f.h)
    c.fillStyle = 'rgba(90,60,30,.06)'
    for (let x = IX() + 10; x < f.x + f.w; x += 20) if (x >= f.x) c.fillRect(x, f.y, 1, f.h)
    w.frames.forEach((fr, i) => frame(c, fr, fame[i], i, now))
    const t = w.tv
    R(c, 'rgba(0,0,0,.28)', t.x + 2, t.y + 2, t.w, t.h)
    R(c, '#101117', t.x, t.y, t.w, t.h); R(c, '#2a2b36', t.x, t.y, t.w, 1)
    R(c, '#0b1622', w.screen.x, w.screen.y, w.screen.w, w.screen.h)
    if (tv?.ready || show) {   // a coloured wash so the screen reads as on even when too small for text
      const p = show ? { color: '#f2c14e' } : panelNow(now)
      if (p) { c.fillStyle = p.color + '30'; c.fillRect(w.screen.x, w.screen.y, w.screen.w, w.screen.h) }
    }
    R(c, '#2a2b36', t.x + t.w / 2 - 6, t.y + t.h - 3, 12, 1)
    R(c, Math.floor(now / 1500) % 2 ? '#5fd17a' : '#3e9a55', t.x + t.w - 5, t.y + t.h - 3, 1, 1)
    // the ceiling lamp hangs in front of the wall: draw it again on top
    const lx = IX() + 184, d = Math.round((fl.y - fl.top - 64 + 6) * 0.6), lt = fl.top + d
    R(c, '#4a4452', lx, fl.top, 1, 4 + d); R(c, '#3a3542', lx - 4, lt + 4, 9, 3); R(c, '#fff1c8', lx - 2, lt + 7, 5, 1)
    const p = w.plaque
    R(c, 'rgba(0,0,0,.25)', p.x + 1, p.y + 1, p.w, p.h)
    R(c, '#8a6a2a', p.x, p.y, p.w, p.h); R(c, '#d8b45a', p.x + 1, p.y + 1, p.w - 2, p.h - 2); R(c, '#f0d48a', p.x + 1, p.y + 1, p.w - 2, 1)
    R(c, '#8a6a2a', p.x + 2, p.y + 4, 1, 1); R(c, '#8a6a2a', p.x + p.w - 3, p.y + 4, 1, 1)
  }
  function medal(c, cx, top, tier, r) {
    const [rib1, rib2] = RIBBONS[tier] || RIBBONS.gold, [face, rim, hi] = TIERS[tier] || TIERS.gold
    R(c, rib1, cx - r, top, r, r + 1); R(c, rib2, cx, top, r, r + 1)
    const cy = top + r + 1 + r
    c.fillStyle = rim; for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy + r * 0.6)); c.fillRect(cx - w, cy + dy, 2 * w, 1) }
    c.fillStyle = face; for (let dy = -r + 1; dy <= r - 1; dy++) { const w = Math.round(Math.sqrt((r - 1) * (r - 1) - dy * dy + r * 0.6)); c.fillRect(cx - w, cy + dy, 2 * w, 1) }
    R(c, hi, cx - Math.ceil(r / 2), cy - Math.ceil(r / 2), 1, Math.max(1, Math.floor(r / 2)))
  }
  function frame(c, f, a, i, now) {
    R(c, 'rgba(0,0,0,.28)', f.x + 1, f.y + 1, f.w, f.h)
    R(c, a ? '#5b3a20' : '#4a3a2e', f.x, f.y, f.w, f.h)
    R(c, a ? '#c9a25a' : '#6a5a4a', f.x + 1, f.y + 1, f.w - 2, f.h - 2)
    R(c, a ? '#1f2c46' : '#2c2a33', f.x + 2, f.y + 2, f.w - 4, f.h - 4)
    if (!a) { R(c, 'rgba(255,255,255,.08)', f.x + 5, f.y + 7, 1, 3); return }
    medal(c, f.x + (f.w >> 1), f.y + 2, a.tier, 3)
    if (i) return
    const t = (now % 2600) / 2600, gx = f.x - 6 + t * (f.w + 12)   // the newest one shines
    c.save(); c.beginPath(); c.rect(f.x + 2, f.y + 2, f.w - 4, f.h - 4); c.clip()
    c.fillStyle = 'rgba(255,255,255,.4)'; for (let k = 0; k < f.h; k++) c.fillRect(Math.round(gx + k * 0.5), f.y + 2 + k, 2, 1)
    c.restore()
    if (Math.floor(now / 300) % 4 < 2) { R(c, '#fff6c8', f.x + f.w - 2, f.y - 1, 1, 3); R(c, '#fff6c8', f.x + f.w - 3, f.y, 3, 1) }
    if (performance.now() - latestAt < 6000) { c.fillStyle = `rgba(255,230,140,${0.25 + 0.2 * Math.sin(now / 120)})`; c.fillRect(f.x - 1, f.y - 1, f.w + 2, f.h + 2) }
  }

  // the trophy cabinet: merged PRs as gold cups, open ones as blue rosettes, four shelves of four
  const shelfItems = () => { const it = trophies?.items || []; return [...it.filter(i => i.state === 'MERGED'), ...it.filter(i => i.state !== 'MERGED')].slice(0, 16) }
  function drawCabinet(c, r, now) {
    const { x, y, w, h } = r
    R(c, 'rgba(0,0,0,.25)', x + 2, y + 2, w, h - 2)
    R(c, '#3b2617', x, y, w, h); R(c, '#7a4e2c', x + 1, y + 1, w - 2, h - 2); R(c, '#9a6a3e', x + 1, y + 1, w - 2, 1)
    R(c, '#5b3a20', x + 2, y + 2, w - 4, 6); R(c, '#c9a25a', x + 3, y + 3, w - 6, 4); R(c, '#e4c27a', x + 3, y + 3, w - 6, 1)
    R(c, '#21160d', x + 2, y + 9, w - 4, h - 12)
    const list = shelfItems()
    for (let s = 0; s < 4; s++) {
      const base = y + 18 + s * 9
      R(c, '#8a5a34', x + 2, base, w - 4, 1)
      for (let j = 0; j < 4; j++) {
        const it = list[s * 4 + j]; if (!it) continue
        const ix = x + [3, 10, 19, 26][j]
        if (it.state === 'MERGED') cup(c, ix, base - 6, now, shine.get(it.repo + '#' + it.n)); else rosette(c, ix, base - 5)
      }
    }
    c.fillStyle = 'rgba(190,225,255,.07)'; c.fillRect(x + 2, y + 9, w - 4, h - 12)
    c.fillStyle = 'rgba(255,255,255,.13)'; for (let i = 0; i < 8; i++) { c.fillRect(x + 6 + i, y + 40 - i * 3, 1, 2); c.fillRect(x + 22 + i, y + 40 - i * 3, 1, 2) }
    R(c, '#3b2617', x + 16, y + 9, 2, h - 12)
    R(c, '#c9a25a', x + 15, y + 28, 1, 2); R(c, '#c9a25a', x + 18, y + 28, 1, 2)
    R(c, '#3b2617', x, y + h - 3, w, 3)
  }
  const shine = new Map()
  tower.on('sync', () => { for (const it of trophies?.items || []) { const k = it.repo + '#' + it.n; if (it.state === 'MERGED' && it.mergedAt > loadT && !shine.has(k)) shine.set(k, performance.now()) } })
  function cup(c, x, y, now, born) {
    R(c, '#c9962e', x - 1, y + 1, 1, 2); R(c, '#c9962e', x + 5, y + 1, 1, 2)
    R(c, '#f4c64f', x, y, 5, 3); R(c, '#f4c64f', x + 1, y + 3, 3, 1)
    R(c, '#ffe9a0', x, y, 5, 1); R(c, '#ffe9a0', x + 1, y + 1, 1, 1)
    R(c, '#c9962e', x + 2, y + 4, 1, 1); R(c, '#6b4a1f', x + 1, y + 5, 3, 1)
    if (born && now - born < 8000 && Math.floor(now / 180) % 2) { R(c, '#fffbe0', x + 2, y - 2, 1, 1); R(c, '#fffbe0', x + 4, y - 1, 1, 1) }
  }
  function rosette(c, x, y) {
    R(c, '#2f6fb0', x + 1, y + 3, 1, 2); R(c, '#2f6fb0', x + 3, y + 3, 1, 2)
    R(c, '#63b3f0', x + 1, y, 3, 3); R(c, '#63b3f0', x, y + 1, 5, 1); R(c, '#fbfaf4', x + 2, y + 1, 1, 1)
  }

  // the desk: a walnut letter tray (fills its slot, so the reserved outline is gone) and today's papers
  function drawInbox(c, r, now) {
    const { x, y, w, h } = r, n = Math.min(5, envelopes().length)
    for (let i = 0; i < n; i++) {   // letters standing in the tray, the newest highest
      const ex = x + 2 + (i % 2), ey = y - 2 - i
      R(c, '#9a948a', ex, ey, w - 4, 4); R(c, i % 2 ? '#f4efe0' : '#fbfaf4', ex, ey, w - 5, 3)
      if (i === n - 1) { R(c, '#c64545', ex + 5, ey + 1, 2, 1); R(c, '#d8d2c4', ex + 1, ey, 3, 1) }
    }
    R(c, '#3a2414', x, y + 1, w, h - 1); R(c, '#6b4429', x, y + 1, w, 1); R(c, '#8a5a36', x, y, w, 1)
    R(c, '#4e3120', x + 2, y + 3, w - 4, h - 5); R(c, '#c9a25a', x + w / 2 - 2, y + 4, 4, 1)
    R(c, '#2a1a10', x, y + h - 1, w, 1)
    if (n && (now % 3000) < 1500) R(c, '#d84a4a', x + w - 2, y + 2, 1, 1)
  }
  function drawPaper(c, r, now) {
    if (!paper) { R(c, '#d8d0bc', r.x + 1, r.y + r.h - 2, r.w - 2, 2); return }
    const { x, y, w, h } = r, kind = ({ ci: '#b8402f', merge: '#2f7a46', workflow: '#5e45c2' })[paper.headline?.kind] || '#1f1a14'
    R(c, '#bdb39b', x, y + 2, w, h - 2); R(c, '#ece4cf', x, y + 2, w, 1); R(c, '#bdb39b', x + 1, y + 4, w - 1, 1)
    R(c, '#efe6cf', x + 1, y, w - 2, 3); R(c, '#1f1a14', x + 2, y, w - 4, 1); R(c, kind, x + 2, y + 2, 7, 1); R(c, '#9b927f', x + 10, y + 2, 4, 1)
    R(c, '#2a1a10', x, y + h - 1, w, 1)
    const p = (performance.now() - paperFlash) / 7000
    if (p < 1 && Math.floor(now / 220) % 2) { c.fillStyle = `rgba(255,236,150,${0.6 * (1 - p)})`; c.fillRect(x - 1, y - 1, w + 2, h + 1); R(c, '#fff6c8', x + w + 1, y - 3, 1, 3); R(c, '#fff6c8', x + w, y - 2, 3, 1) }
  }

  // the lobby: the empty TV frame becomes plain wall again, with a cork board of printed commits over the printer
  function coverLobbyFrame(c, lb) {
    const r = lb.wall, f = lb.f, x0 = IX()
    if (!r) return
    R(c, '#ddd6ca', r.x, r.y, r.w, r.h)
    c.fillStyle = 'rgba(0,0,0,.05)'
    for (let x = x0; x < r.x + r.w; x += 24) if (x >= r.x) c.fillRect(x, r.y, 1, Math.min(r.h, f.y - 20 - r.y))
    for (const lx of [x0 + 64, x0 + 184, x0 + 304, x0 + 424]) if (lx + 5 > r.x && lx - 5 < r.x + r.w) {
      R(c, '#4a4452', lx, f.top, 1, 4); R(c, '#3a3542', lx - 4, f.top + 4, 9, 3); R(c, '#fff1c8', lx - 2, f.top + 7, 5, 1)
    }
  }
  const pinned = () => printed.slice(-6).reverse()
  function drawBoard(c, b) {
    R(c, 'rgba(0,0,0,.22)', b.x + 2, b.y + 2, b.w, b.h)
    R(c, '#6b4a30', b.x, b.y, b.w, b.h); R(c, '#b98a5a', b.x + 2, b.y + 2, b.w - 4, b.h - 4)
    c.fillStyle = 'rgba(90,50,20,.25)'; for (let k = 0; k < 40; k++) { const q = api.hash('cork' + k); c.fillRect(b.x + 3 + q % (b.w - 6), b.y + 3 + (q >>> 8) % (b.h - 6), 1, 1) }
    pinned().forEach((cm, i) => {
      const h = api.hash(cm.id), px = b.x + 5 + i * 13, py = b.y + 5 + (h % 3)
      R(c, 'rgba(0,0,0,.18)', px + 1, py + 1, 10, 13)
      R(c, '#fbfaf4', px, py, 10, 13); R(c, '#e4dfcf', px, py + 12, 10, 1)
      R(c, '#7a7466', px + 2, py + 3, 6, 1); for (let r = 0; r < 3; r++) R(c, '#b8b4a6', px + 2, py + 6 + r * 2, 3 + ((h >>> (r * 3)) % 4), 1)
      R(c, ['#d84a4a', '#3a6fd8', '#2f9a5a', '#e0a030'][h % 4], px + 4, py - 1, 2, 2)
    })
    if (!printed.length) { R(c, '#fbfaf4', b.x + b.w / 2 - 5, b.y + 6, 10, 13); R(c, '#d84a4a', b.x + b.w / 2 - 1, b.y + 5, 2, 2); R(c, '#b8b4a6', b.x + b.w / 2 - 3, b.y + 10, 6, 1) }
  }
  function drawPrinter(c, r, now) {
    const { x, y } = r, t = job ? now - job.t0 : -1, printing = t >= 0 && t < OUT_MS
    const jig = printing && Math.floor(now / 70) % 2 ? 1 : 0
    R(c, 'rgba(0,0,0,.2)', x - 1, y + 30, 18, 1)
    R(c, '#3d414b', x + 1, y + 14, 14, 17); R(c, '#545a66', x + 2, y + 15, 12, 15); R(c, '#2a2d35', x + 3, y + 18, 10, 6)
    R(c, '#6b7280', x + 2, y + 24, 12, 1); R(c, '#2a2d35', x + 7, y + 26, 2, 1)
    for (let i = 0; i < stack; i++) R(c, i % 2 ? '#e9e6dc' : '#fbfaf4', x + 4, y + 23 - i, 8, 1)
    const by = y + 4 + jig
    R(c, '#f4f2ea', x + 4, by - 3, 8, 4); R(c, '#8b919c', x + 1, by, 14, 10); R(c, '#d6d9df', x + 2, by + 1, 12, 8)
    R(c, '#eef0f3', x + 2, by + 1, 12, 1); R(c, '#2b2e36', x + 3, by + 6, 10, 1)
    R(c, t >= 0 ? (Math.floor(now / 200) % 2 ? '#7bff8a' : '#3fbf54') : '#3e9a55', x + 12, by + 2, 1, 1); R(c, '#5c626d', x + 9, by + 2, 2, 1)
    if (t < 0) return
    let len = 7, top = by + 6, alpha = 1
    if (t < OUT_MS) len = Math.max(1, Math.round(7 * t / OUT_MS))
    else if (t > OUT_MS + HOLD_MS) { const d = (t - OUT_MS - HOLD_MS) / DROP_MS; top += d * 10; alpha = 1 - d * 0.6 }
    c.globalAlpha = alpha
    R(c, '#fbfaf4', x + 4, top, 8, len)
    c.fillStyle = '#b8b4a6'; for (let k = 2; k < len; k += 2) c.fillRect(x + 5, top + k, k % 4 ? 5 : 6, 1)
    c.globalAlpha = 1
  }

  tower.on('glow', (c, now, n) => {
    const w = wall(); if (!w || !(tv?.ready || show)) return
    const s = w.screen, g = c.createRadialGradient(s.x + s.w / 2, s.y + s.h / 2, 0, s.x + s.w / 2, s.y + s.h / 2, 40)
    g.addColorStop(0, `rgba(110,170,255,${0.3 * n})`); g.addColorStop(1, 'rgba(110,170,255,0)')
    c.fillStyle = g; c.fillRect(s.x - 40, s.y - 40, s.w + 80, s.h + 80)
  })

  // ---------- the TV's panels ----------
  const titleOf = id => snap?.sessions?.find(s => s.id === id)?.title || id.slice(0, 8)
  function costPanel() {
    if (!cost || typeof cost.usdToday !== 'number') return null
    const top = Object.entries(cost.bySession || {}).filter(([, v]) => typeof v === 'number').sort((a, b) => b[1] - a[1])[0]
    return { color: '#7fd8b0', title: 'SPEND TODAY ~EST', value: money(cost.usdToday), side: top ? [`top: ${titleOf(top[0])}`] : ['estimate'] }
  }
  function panels() {
    if (!tv?.ready) return []
    const b = tv.busiest, o = tv.online, latest = fame[0]
    return [
      { color: '#5fd17a', title: 'TOOL CALLS · 1H', value: fmt(tv.toolsHour), spark: tv.spark },
      { color: '#f4c64f', title: 'TOKENS TODAY', value: fmt(tv.tokensToday), side: [`${fmt(tv.outToday)} out`] },
      costPanel(),
      { color: '#b996f5', title: 'PRS THIS WEEK', value: String(tv.prsWeek), side: [tv.mergedWeek != null ? `${tv.mergedWeek} merged` : 'opened'] },
      latest && { color: '#f2c14e', title: 'WALL OF FAME', value: String(fame.length), side: [`${latest.icon} ${latest.title}`, latest.holder] },
      { color: '#f07a8a', title: 'BUSIEST NOW', wide: b ? b.name : 'all quiet', side: [b ? `${b.calls} calls / 10 min` : 'no calls in 10 min'] },
      o && { color: '#63b3f0', title: 'ONLINE', value: `${o.sessions}·${o.agents}`, side: ['sessions', '· agents'] },
    ].filter(Boolean)
  }
  const panelNow = now => { const l = panels(); return l.length ? l[Math.floor(now / PANEL_MS) % l.length] : null }

  // ---------- overlay: the TV's picture, the plaque, counts and the printer's label ----------
  tower.on('overlay', (v, now) => {
    const k = tower.zoom, w = wall()
    v.textBaseline = 'top'
    if (w && onScreen(w.f, k)) {
      screen(v, w.screen, now, k)
      plaqueText(v, w.plaque, k)
      if (k >= 3) {
        v.textAlign = 'center'; v.textBaseline = 'middle'; v.font = `${Math.round(4.6 * k)}px ui-monospace, "Apple Color Emoji", sans-serif`
        w.frames.forEach((f, i) => { const a = fame[i]; if (a) { const p = tower.worldToScreen(f.x + f.w / 2, f.y + 9); v.fillText(a.icon, p.x, p.y) } })
        v.textAlign = 'left'; v.textBaseline = 'top'
      }
      const s = tower.slots
      cabinetText(v, s.trophies, k)
      const n = envelopes().length
      if (n) {
        const p = tower.worldToScreen(s.inbox.x + s.inbox.w, s.inbox.y - 3), r = Math.max(6, 2.6 * k)
        v.fillStyle = '#c64545'; v.beginPath(); v.arc(p.x, p.y, r, 0, Math.PI * 2); v.fill()
        v.fillStyle = '#fff'; v.font = font(Math.max(8, r * 1.2), 700); v.textAlign = 'center'; v.textBaseline = 'middle'
        v.fillText(String(n), p.x, p.y + 0.5); v.textAlign = 'left'; v.textBaseline = 'top'
      }
    }
    const lb = lobbyBits()
    if (lb && job) printLabel(v, lb.printer, now, k)
  })
  function onScreen(r, k) {
    const a = tower.worldToScreen(r.x - 60, r.y - 60), b = tower.worldToScreen(r.x + r.w + 140, r.y + r.h + 80), cv = tower.canvas
    return b.x > 0 && b.y > 0 && a.x < cv.clientWidth && a.y < cv.clientHeight
  }
  function plaqueText(v, p, k) {
    if (!cost || typeof cost.usdToday !== 'number' || p.h * k < 9) return
    const a = tower.worldToScreen(p.x, p.y), fs = Math.min(p.h * k * 0.72, 12)
    v.save(); v.beginPath(); v.rect(a.x, a.y, p.w * k, p.h * k); v.clip()
    v.font = font(fs, 700); v.fillStyle = '#4a3010'; v.textAlign = 'center'; v.textBaseline = 'middle'
    v.fillText(fitText(`${money(cost.usdToday)} TODAY`, (p.w - 6) * k, font(fs, 700)), a.x + p.w * k / 2, a.y + p.h * k / 2 + 0.5)
    v.restore()
  }
  function cabinetText(v, r, k) {
    if (!trophies || k < 1.8) return
    const merged = (trophies.items || []).filter(i => i.state === 'MERGED').length, open = (trophies.items || []).length - merged
    const a = tower.worldToScreen(r.x + 3, r.y + 3), w = (r.w - 6) * k, h = 4 * k, fs = Math.min(h * 0.95, 12)
    v.save(); v.beginPath(); v.rect(a.x, a.y, w, h); v.clip()
    v.font = font(fs, 700); v.fillStyle = '#3b2617'; v.textAlign = 'center'; v.textBaseline = 'middle'
    v.fillText(fitText(trophies.gh === false ? 'gh offline' : `🏆${merged} 🎗${open}`, w, font(fs, 700)), a.x + w / 2, a.y + h / 2 + 0.5)
    v.restore()
  }
  const sizes = (k, sh) => ({ head: Math.min(Math.max(8, 3.4 * k), sh * 0.24), big: Math.min(Math.max(12, 9 * k), sh * 0.48), mid: Math.min(Math.max(10, 5.6 * k), sh * 0.32), side: Math.min(Math.max(8, 3.6 * k), sh * 0.24) })
  function wrapText(v, text, w, max) {
    const out = []; let cur = ''
    for (const word of String(text).split(' ')) { const next = cur ? cur + ' ' + word : word; if (v.measureText(next).width <= w || !cur) cur = next; else { out.push(cur); cur = word } }
    if (cur) out.push(cur)
    return out.length > max ? [...out.slice(0, max - 1), fitText(out.slice(max - 1).join(' '), w, v.font)] : out.map(l => fitText(l, w, v.font))
  }
  function screen(v, s, now, k) {
    const a = tower.worldToScreen(s.x, s.y), sx = a.x, sy = a.y, sw = s.w * k, sh = s.h * k
    if (sh < 26) return
    const pad = Math.max(3, 2.2 * k), z = sizes(k, sh)
    v.save(); v.beginPath(); v.rect(sx, sy, sw, sh); v.clip()
    if (show) { takeover(v, sx, sy, sw, sh, pad, z, now, k); return void v.restore() }
    const list = panels()
    if (!list.length) {
      v.fillStyle = '#63b3f0'; v.font = font(z.mid, 600); v.textBaseline = 'middle'
      v.fillText('warming up' + '.'.repeat(1 + Math.floor(now / 400) % 3), sx + pad, sy + sh / 2); v.restore(); return
    }
    const cycle = Math.floor(now / PANEL_MS), p = list[cycle % list.length], into = now % PANEL_MS
    v.fillStyle = p.color + '18'; v.fillRect(sx, sy, sw, sh)
    const ty = sy + pad * 0.6
    v.fillStyle = p.color; v.font = font(z.head, 700); v.fillText(fitText(p.title, sw - 2 * pad, v.font), sx + pad, ty)
    const body = ty + z.head + Math.max(2, k)
    if (p.wide) {
      v.font = font(z.mid, 700); v.fillStyle = '#eef3f8'; v.fillText(fitText(p.wide, sw - 2 * pad, v.font), sx + pad, body)
      v.font = font(z.side, 500); v.fillStyle = '#9fb0c2'; v.fillText(fitText(p.side[0], sw - 2 * pad, v.font), sx + pad, body + z.mid + Math.max(2, k))
    } else {
      v.font = font(z.big, 700); v.fillStyle = '#eef3f8'
      const vw = v.measureText(p.value).width
      v.fillText(p.value, sx + pad, body)
      const sideX = Math.max(sx + sw * 0.5, sx + pad + vw + pad * 1.5), sideW = sx + sw - pad - sideX
      if (p.spark && sideW > 16) {
        const bh = z.big * 0.85, by = body + z.big * 0.15, data = p.spark.slice(-30), max = Math.max(1, ...data), cw = sideW / data.length
        v.fillStyle = 'rgba(255,255,255,.1)'; v.fillRect(sideX, by + bh, sideW, Math.max(1, k / 2))
        data.forEach((n, j) => { if (!n) return; const h = Math.max(1, Math.round(bh * n / max)); v.fillStyle = j === data.length - 1 ? '#c8ffd6' : p.color; v.fillRect(Math.round(sideX + j * cw), Math.round(by + bh - h), Math.max(1, Math.ceil(cw) - (cw > 3 ? 1 : 0)), h) })
      } else if (p.side && sideW > 16) {
        v.font = font(z.side, 500)
        const lines = p.side.length > 1 ? p.side.slice(0, 2).map(l => fitText(l, sideW, v.font)) : wrapText(v, p.side[0], sideW, 2)
        const lh = z.side + Math.max(1, k * 0.8), top = body + (z.big - lines.length * lh) / 2 + k * 0.5
        lines.forEach((l, j) => { v.fillStyle = j ? '#9fb0c2' : '#cfdbe6'; v.fillText(l, sideX, top + j * lh) })
      }
    }
    v.fillStyle = p.color + '88'; v.fillRect(sx, sy + sh - Math.max(1, k / 2), sw * into / PANEL_MS, Math.max(1, k / 2))
    scan(v, sx, sy, sw, sh, k)
    if (into < STATIC_MS && cycle > 0) noise(v, sx, sy, sw, sh, k, now)
    v.restore()
  }
  function scan(v, sx, sy, sw, sh, k) { v.fillStyle = 'rgba(0,0,0,.14)'; for (let y = 0; y < sh; y += Math.max(2, Math.round(k * 1.2))) v.fillRect(sx, sy + y, sw, Math.max(1, Math.round(k / 3))) }
  function noise(v, sx, sy, sw, sh, k, now) {
    const seed = Math.floor(now / 40)
    for (let n = 0; n < 120; n++) {
      const r = (Math.sin(seed * 12.9898 + n * 78.233) * 43758.5453) % 1, q = (Math.sin(seed * 4.1 + n * 9.7) * 1e4) % 1
      v.fillStyle = `rgba(220,230,240,${0.25 + Math.abs(q) * 0.5})`; v.fillRect(sx + Math.abs(r) * sw, sy + Math.abs(q) * sh, k * 1.5, k * 0.7)
    }
  }
  function takeover(v, sx, sy, sw, sh, pad, z, now, k) {
    const t = now - show.t0, a = show.a
    const g = v.createLinearGradient(sx, sy, sx, sy + sh); g.addColorStop(0, '#3a2a08'); g.addColorStop(1, '#1a1206')
    v.fillStyle = g; v.fillRect(sx, sy, sw, sh)
    for (let n = 0; n < 18; n++) {
      const px = sx + ((n * 53 + t / 18 * (n % 3 + 1)) % sw), py = sy + ((n * 37 + t / 30 * (n % 2 + 1)) % sh)
      v.fillStyle = Math.floor(t / 200 + n) % 3 ? 'rgba(255,220,120,.5)' : 'rgba(255,255,255,.8)'; v.fillRect(px, py, Math.max(1, k * 0.7), Math.max(1, k * 0.7))
    }
    const ty = sy + pad * 0.6
    v.fillStyle = Math.floor(t / 400) % 2 ? '#ffe28a' : '#f2c14e'; v.font = font(z.head, 800); v.fillText(fitText('🏅 ACHIEVEMENT', sw - 2 * pad, v.font), sx + pad, ty)
    const body = ty + z.head + Math.max(2, k)
    v.font = font(z.mid, 800); v.fillStyle = '#fff6dc'; v.fillText(fitText(`${a.icon} ${a.title}`, sw - 2 * pad, v.font), sx + pad, body)
    v.font = font(z.side, 600); v.fillStyle = '#e8c878'; v.fillText(fitText(a.holder, sw - 2 * pad, v.font), sx + pad, body + z.mid + Math.max(2, k))
    v.fillStyle = '#f2c14e'; v.fillRect(sx, sy + sh - Math.max(1, k / 2), sw * (1 - t / TAKEOVER_MS), Math.max(1, k / 2))
    scan(v, sx, sy, sw, sh, k)
    if (t < STATIC_MS) noise(v, sx, sy, sw, sh, k, now)
  }
  function printLabel(v, r, now, k) {
    const t = now - job.t0
    if (t < OUT_MS * 0.6 || t > OUT_MS + HOLD_MS) return
    const al = Math.min(1, (t - OUT_MS * 0.6) / 250, (OUT_MS + HOLD_MS - t) / 300), c = job.c
    const head = [/^[0-9a-f]{7,40}$/.test(c.id) ? c.id.slice(0, 7) : 'commit', c.who, c.branch].filter(Boolean).join(' · ')
    const big = Math.max(10, Math.min(15, Math.round(4.2 * k))), small = Math.max(8, Math.min(12, Math.round(3.2 * k)))
    const fBig = font(big, 600), fSmall = font(small), maxW = Math.max(200, 92 * k)
    const msg = fitText(c.msg, maxW, fBig), sub = fitText(head, maxW, fSmall)
    v.font = fBig; const w1 = v.measureText(msg).width; v.font = fSmall; const w2 = v.measureText(sub).width
    const w = Math.max(w1, w2) + 14, h = big + small + 14, a = tower.worldToScreen(r.x + 12, r.y + 4), lx = a.x + 6 * k, ly = a.y - h - 2 * k
    v.globalAlpha = al
    v.fillStyle = 'rgba(0,0,0,.35)'; v.fillRect(lx + 3, ly + 3, w, h)
    v.fillStyle = '#fbfaf4'; v.fillRect(lx, ly, w, h); v.fillStyle = '#e4dfcf'; v.fillRect(lx, ly + h - 3, w, 3)
    v.beginPath(); v.moveTo(lx, ly + h - 8); v.lineTo(a.x, a.y); v.lineTo(lx + 8, ly + h); v.fillStyle = '#fbfaf4'; v.fill()
    v.textBaseline = 'top'
    v.fillStyle = '#7a7466'; v.font = fSmall; v.fillText(sub, lx + 7, ly + 5)
    v.fillStyle = '#1b1c26'; v.font = fBig; v.fillText(msg, lx + 7, ly + 7 + small)
    v.globalAlpha = 1
  }

  // ---------- hover and click ----------
  function hitAt(p) {
    const w = wall(), s = tower.slots, lb = lobbyBits()
    if (w) {
      const i = w.frames.findIndex(f => inR(p, f, 0)); if (i >= 0 && fame[i]) return { medal: fame[i] }
      if (inR(p, w.tv)) return { tv: true }
      if (inR(p, w.plaque)) return { plaque: true }
      if (inR(p, s.trophies)) return { cabinet: true }
      if (inR(p, { x: s.inbox.x, y: s.inbox.y - 6, w: s.inbox.w, h: s.inbox.h + 6 }, 2)) return { inbox: true }
      if (paper && inR(p, s.gazette, 2)) return { paper: true }
    }
    if (lb) { if (inR(p, lb.board)) return { board: true }; if (inR(p, lb.printer)) return { printer: true } }
    return null
  }
  const line = (txt, col) => `<div>${col ? `<i class="s" style="background:${col}"></i>` : ''}${txt}</div>`
  let inboxHovered = false
  tower.on('hover', (p, person) => {
    const h = person ? null : hitAt(p)
    if (inboxHovered && !h?.inbox) { inboxHovered = false; for (const e of envelopes()) read.add(e.id); saveRead() }
    if (!h) return null
    if (h.medal) { const a = h.medal; return `<div class="t">${esc(a.icon)} ${esc(a.title)}</div><div class="m">${esc(a.tier)} · ${esc(a.holder)} · ${clock(a.earnedAt)}</div>` }
    if (h.tv) {
      const l = panels()
      return `<div class="t">Office TV</div>${l.length ? l.map(q => line(`${esc(q.title.toLowerCase())}: <b>${esc(q.value ?? q.wide)}</b>`, q.color)).join('') : '<div class="m">warming up</div>'}<div class="m">a new medal takes the screen over</div>`
    }
    if (h.plaque) {
      if (!cost) return '<div class="t">Spend today</div><div class="m">still counting</div>'
      const top = Object.entries(cost.bySession || {}).sort((a, b) => b[1] - a[1]).slice(0, 5)
      return `<div class="t">Spend today ~ ${money(cost.usdToday)}</div>${top.map(([id, u]) => line(`${esc(titleOf(id))} — ${money(u)}`)).join('')}<div class="m">an estimate at list prices</div>`
    }
    if (h.cabinet) {
      const it = trophies?.items || [], merged = it.filter(i => i.state === 'MERGED')
      const rows = [...merged, ...it.filter(i => i.state !== 'MERGED')].slice(0, 6).map(i => line(`#${i.n} ${esc((i.title || '').slice(0, 48))}`, i.state === 'MERGED' ? '#f4c64f' : '#63b3f0')).join('')
      return `<div class="t">Trophy cabinet · this week</div><div class="m">${merged.length} merged (cups) · ${it.length - merged.length} open (ribbons)${trophies?.gh === false ? ' · gh offline' : ''}</div>${rows}${it.length ? '<div class="m">↗ click for your PRs</div>' : ''}`
    }
    if (h.inbox) {
      inboxHovered = true
      const l = envelopes()
      return `<div class="t">✉ For you</div>${l.length ? l.slice(0, 8).map(m => `<div><span style="color:var(--wait)">${esc(m.who)}</span> ${m.kind === 'request' ? 'requested your review on' : m.kind === 'review' ? 'reviewed' : 'commented on'} <span class="m">#${m.pr}</span> ${esc((m.title || '').slice(0, 60))}</div>`).join('') : '<div class="m">nothing new in the tray</div>'}<div class="m">↗ click to open your review requests</div>`
    }
    if (h.paper) return `<div class="t">📰 The Daily Gazette</div><div>${esc(paper.headline?.kicker ? paper.headline.kicker + ': ' : '')}${esc(paper.headline?.title || '')}</div><div class="m">↗ click to read today's paper</div>`
    if (h.board || h.printer) {
      const l = pinned()
      return `<div class="t">🖨 Commit printer</div>${job ? line(`printing: ${esc(job.c.msg)}`, '#5fd17a') : ''}${l.length ? l.map(c => line(`${esc(c.msg.slice(0, 60))} <span class="m">${esc(c.branch || '')} · ${clock(c.t)}</span>`)).join('') : '<div class="m">no commits in the last half hour</div>'}`
    }
    return null
  })
  tower.on('click', (p, person) => {
    if (person) return false
    const h = hitAt(p); if (!h) return false
    if (h.inbox) {
      for (const x of envelopes()) read.add(x.id); saveRead()
      if (!street?.repo) { api.toast('GitHub street is still loading'); return true }
      api.openLink(`https://github.com/${street.repo}/pulls?q=is%3Apr+is%3Aopen+review-requested%3A${encodeURIComponent(street.me || '@me')}`)
      return true
    }
    if (h.paper) { openPaper(); return true }
    if (h.cabinet) { const repo = trophies?.items?.[0]?.repo || street?.repo; if (repo) api.openLink(`https://github.com/${repo}/pulls?q=is%3Apr+author%3A%40me`); return true }
    if (h.medal) { api.toast(`${h.medal.icon} ${h.medal.title} · ${h.medal.holder}`, 3000); return true }
    if (h.tv || h.plaque || h.board || h.printer) return true
    return false
  })

  // ---------- the Gazette: gazette.js's broadsheet, opened with this desk's copy ----------
  function openPaper() { if (!paper || !api.gazette?.open(paper)) api.toast('The Gazette has not been printed yet') }

  // ---------- ?demo=ceo / ?demo=print ----------
  const demoFame = [['first-pr', 'First PR of the day', '🥇', 'gold'], ['calls-1k', '1,000 tool calls', '🔨', 'silver'], ['clean-hour', 'Clean hour', '✨', 'silver'], ['night-owl', 'Night owl', '🦉', 'bronze'], ['six-at-once', 'Six at once', '👥', 'gold'], ['marathon', 'Marathon', '🏃', 'gold'], ['big-context', 'Big context', '🧠', 'silver']]
  let demoState = null
  function fakeAll(data) {
    if (!demoState) {
      const t = Date.now()
      demoState = {
        fame: demoFame.slice(0, 5).map(([id, title, icon, tier], i) => ({ key: id + '|demo', id, title, icon, tier, holder: data.sessions[i % Math.max(1, data.sessions.length)]?.title || 'office', earnedAt: t - (i + 1) * 4e5 })),
        mail: [{ id: 'demo:req1', kind: 'request', who: 'alice-dev', bot: false, pr: 1878, title: 'recipes: search by ingredient', at: t - 3e5 }],
      }
      setTimeout(() => { const [id, title, icon, tier] = demoFame[5]; const a = { key: id + '|demo', id, title, icon, tier, holder: 'RECIPE BOX', earnedAt: Date.now() }; evFame.set(a.key, a); latestAt = performance.now(); takeovers.push(a) }, 6000)
      setTimeout(() => { if (tower.slots) tower.flyTo('ceo') }, 400)
      setTimeout(() => { demoState.mail.unshift({ id: 'demo:req2', kind: 'request', who: 'bob-builds', bot: false, pr: 1880, title: 'app: a demo PR', at: Date.now() }) }, 2500)
    }
    const items = Array.from({ length: 14 }, (_, i) => ({ n: 1900 - i, repo: 'demo/office', at: Date.now() - i * 3e6, state: i % 3 === 1 ? 'OPEN' : 'MERGED', mergedAt: i === 0 ? Date.now() : 0, title: `demo PR ${i + 1}` }))
    return {
      ...data,
      achievements: { list: demoState.fame },
      trophies: { merged: items.filter(i => i.state === 'MERGED').length, open: items.filter(i => i.state === 'OPEN').length, gh: true, items },
      street: { ...(data.street || {}), status: 'ok', repo: data.street?.repo || 'demo/office', me: data.street?.me || 'you', forMe: demoState.mail },
      cost: data.cost || { usdToday: 123.45, bySession: {} },
      gazette: data.gazette || { at: Date.now(), date: Date.now(), edition: 1, repo: 'demo/office', street: 'ok', headline: { kind: 'merge', kicker: 'MERGE DAY', title: '3 PRs land on main', deck: 'A demo edition.' }, merged: [], mergedCount: 0, opened: [], openedCount: 0, stats: { toolsToday: 4210, toolsHour: 312, tokens: 48e6, commits: 9, online: { sessions: 4, agents: 6 } }, busiest: { leaders: [], desks: [] }, workflows: [], ci: { failsToday: 0, failsHour: 0, red: [], running: 0, culprits: [] } },
    }
  }
  if (demo) window.ceoOffice = { tower, hitAt, couriers, envelopes }   // for scripted checks
  if (demoPrint) {
    const fakeCommit = n => ({ id: 'demo-print-' + n, t: Date.now(), msg: ['tower: the CEO office gets its wall of fame', 'printer: pin every commit to the lobby board', 'gazette: a front page for the repo'][n % 3], branch: 'tower-port', who: 'demo' })
    setTimeout(() => { queue.push(fakeCommit(0)); if (!demo) tower.flyTo('lobby') }, demo ? 9000 : 1500)
    setTimeout(() => queue.push(fakeCommit(1)), demo ? 12000 : 3000)
    for (let i = 0; i < 3; i++) printed.push({ ...fakeCommit(i + 2), id: 'demo-old-' + i, t: Date.now() - (i + 1) * 6e5, msg: ['ui: field placeholders', 'map: elevation profile', 'site: dark mode'][i] })
  }
}
