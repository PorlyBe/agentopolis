// lunch-rush: 12:00–13:00 local, idle characters (idle or done, nobody another feature steers) go down to the café,
// queue at the counter with trays, get served and sit down to eat — the table, an extra stool, the lounge sofa —
// steaming bowls in front of them. From 12:15 the rush starts and the queue fills. The chalk menu turns into a LUNCH
// board with today's three specials (picked by the date). A character whose session gets busy goes straight back to
// work; everyone else is released after their meal or at 13:00. Each eats once a day. ?demo=lunchrush forces it.
import { IX } from '../building.js'
import { R } from '../draw.js'

const QUEUE = [40, 56, 72, 88].map(x => IX + x)
const SEATS = [
  { x: IX + 118, face: 'down', seatH: 11, at: 'table' }, { x: IX + 142, face: 'down', seatH: 11, at: 'table' },
  { x: IX + 130, face: 'down', seatH: 11, at: 'table', stool: true },
  { x: IX + 432, face: 'up', seatH: 8, at: 'sofa' }, { x: IX + 452, face: 'up', seatH: 8, at: 'sofa' },
]
const BOOK = ['fridge', 'coffee', 'microwave', 'chat-1', 'chat-2', 'table-0', 'table-1', 'tv-1', 'tv-2'].map(s => 'cafe:' + s)
const SERVE_MS = 3500, QUIET = 3, BUSY = QUEUE.length - 1 + SEATS.length
const DISHES = [
  ['Katsu curry', 980], ['Tonkotsu ramen', 1100], ['Salmon poke', 1250], ['Gyudon', 750], ['Bibimbap', 1050], ['Pad thai', 990],
  ['Pho bo', 1080], ['Laksa', 1150], ['Falafel bowl', 900], ['Tempura udon', 950], ['Oyakodon', 820], ['Dal & rice', 780],
  ['Burrito bowl', 1200], ['Mapo tofu', 880], ['Chicken nanban', 1020], ['Onigiri set', 650],
]
const GLYPH = { L: '100100100100111', U: '101101101101111', N: '110101101101101', C: '011100100100011', H: '101101111101101' }
function pixText(c, s, x, y, col) {
  c.fillStyle = col
  for (const ch of s) { const g = GLYPH[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(x + i % 3, y + Math.floor(i / 3), 1, 1); x += 4 }
}
function specials(d = new Date()) {
  let h = d.getFullYear() * 372 + d.getMonth() * 31 + d.getDate()
  const pool = [...DISHES], out = []
  for (let i = 0; i < 3; i++) { h = (h * 1103515245 + 12345) >>> 0; out.push(pool.splice(h % pool.length, 1)[0]) }
  return out
}

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const demo = api.demo('lunchrush')
  const who = new Map()     // person id -> { phase 'queue'|'served'|'eat', joined, servedAt, seat, eatAt, eatMs }
  const ate = new Set()
  let planAt = 0, demoT0 = 0, day = '', stash = null

  const now0 = () => performance.now()
  const isOn = () => demo || new Date().getHours() === 12
  const busy = () => demo ? demoT0 && now0() - demoT0 > 12_000 : new Date().getMinutes() >= 15
  const hungry = p => (p.state === 'idle' || p.state === 'done') && !p.leaving
  const cafe = () => tower.floor('cafe')

  function book(on) {
    const sp = tower.crowd?.spots
    if (!Array.isArray(sp)) return
    if (on) {
      if (stash && stash.arr === sp) return
      const out = []
      for (let i = sp.length - 1; i >= 0; i--) if (BOOK.includes(sp[i].id)) out.push(...sp.splice(i, 1))
      stash = { arr: sp, out }
    } else if (stash) {
      if (stash.arr === sp) sp.push(...stash.out)
      stash = null
    }
  }
  const drop = id => { tower.release(id); who.delete(id) }
  const queue = () => [...who].filter(([, w]) => w.phase === 'queue').sort((a, b) => a[1].joined - b[1].joined).map(([id]) => id)
  const freeSeat = () => SEATS.findIndex((_, i) => ![...who.values()].some(w => w.seat === i))

  function plan(now) {
    const f = cafe()
    const d = new Date().toDateString(); if (d !== day) { day = d; ate.clear() }
    if (!f || !isOn() || api.live === false) { for (const id of [...who.keys()]) drop(id); book(false); return }
    book(true)
    for (const [id, w] of [...who]) {
      const p = tower.person(id)
      if (!p || !hungry(p)) { drop(id); continue }
      if (w.phase === 'eat' && now - w.eatAt > w.eatMs) { ate.add(id); drop(id) }
    }
    const q = queue()
    q.forEach((id, i) => {
      const w = who.get(id), x = QUEUE[Math.min(i, QUEUE.length - 1)]
      if (w.x !== x && tower.sendTo(id, 'cafe', x, { face: i ? 'left' : 'up', pose: 'stand', activity: 'lunch-queue' })) w.x = x
    })
    const front = q[0] && tower.person(q[0]), fw = q[0] && who.get(q[0])
    if (front && front.floor === 'cafe' && !front.walking && Math.abs(front.x - QUEUE[0]) < 2) {
      if (!fw.servedAt) fw.servedAt = now
      const s = freeSeat()
      if (now - fw.servedAt > SERVE_MS && s >= 0) {
        const st = SEATS[s]
        fw.phase = 'served'; fw.seat = s
        tower.sendTo(q[0], 'cafe', st.x, { face: st.face, pose: 'sit', seatH: st.seatH, activity: 'lunch', then: () => { const w = who.get(q[0]); if (w?.phase === 'served') { w.phase = 'eat'; w.eatAt = performance.now() } } })
      }
    }
    const target = busy() ? BUSY : QUIET
    let budget = 2
    for (const p of tower.people) {
      if (who.size >= target || budget <= 0 || queue().length >= QUEUE.length) break
      if (who.has(p.id) || ate.has(p.id) || !hungry(p) || p.steered || p.floor === null || p.activity?.startsWith('meeting:')) continue
      if (p.floor !== 'cafe' && tower.liftLoad(p.floor) > 3) continue
      who.set(p.id, { phase: 'queue', joined: now + Math.random(), eatMs: demo ? 35_000 + api.hash(p.id) % 20_000 : (12 + api.hash(p.id) % 10) * 60_000 })
      budget--
    }
  }
  tower.on('step', (dt, now) => { if (now - planAt > 1000) { planAt = now; if (demo && !demoT0) demoT0 = now; plan(now) } })
  tower.on('layout', () => { stash = null; planAt = 0 })

  // ---------- the café at lunch ----------
  function bowl(c, x, y, now, seed) {
    R(c, '#e0903a', x + 1, y - 1, 4, 1); R(c, '#f4f0e8', x, y, 6, 1); R(c, '#3a6ab0', x, y + 1, 6, 1); R(c, '#2a4a80', x + 1, y + 2, 4, 1)
    for (let k = 0; k < 3; k++) {
      const t = (now / 1100 + seed + k / 3) % 1
      R(c, `rgba(255,255,255,${0.9 * (1 - t)})`, x + 1 + k * 2 + Math.round(Math.sin(t * 6 + k)), y - 3 - Math.round(t * 7), 1, 1)
    }
  }
  function tray(c, p, now, full) {
    const side = p.walking ? (p.dir === 'left' ? -1 : 1) : p.face === 'left' ? -1 : p.face === 'right' ? 1 : 0
    const x = Math.round(p.x - 4 + side * 5), y = Math.round(p.y - 13)
    R(c, '#8a5a32', x, y, 10, 1); R(c, '#c88a4a', x, y - 1, 10, 1)
    if (full) bowl(c, x + 2, y - 4, now, p.x)
  }
  function menu(c) {
    const m = tower.cafe?.menu; if (!m) return
    R(c, '#4a3a2c', m.x, m.y, m.w, m.h); R(c, '#2d3a32', m.x + 2, m.y + 2, m.w - 4, m.h - 4)
    pixText(c, 'LUNCH', m.x + m.w / 2 - 10, m.y + 4, '#f2c14e')
    for (let i = 0; i < 3; i++) { c.fillStyle = 'rgba(232,228,216,.75)'; c.fillRect(m.x + 6, m.y + 12 + i * 4, 30 + ((i * 7) % 12), 1); R(c, '#f2c14e', m.x + m.w - 14, m.y + 12 + i * 4, 8, 1) }
  }
  tower.on('items', (out, now) => {
    const f = cafe(); if (!f || !isOn()) return
    out.push({ z: Z.WALL + 3, draw: c => menu(c) })
    out.push({ z: Z.FLOOR + 2, draw: c => { const s = SEATS.find(s => s.stool), y = f.y; R(c, '#6b4a30', s.x - 6, y - 24, 2, 24); R(c, '#6b4a30', s.x + 4, y - 24, 2, 24); R(c, '#8a6240', s.x - 6, y - 25, 12, 3); R(c, '#8a6240', s.x - 4, y - 19, 8, 2) } })
    out.push({ z: Z.STAND + 2, draw: c => {
      for (const [id, w] of who) {
        const p = tower.person(id); if (!p || p.floor !== 'cafe' || p.seated) continue
        if (w.phase === 'served' || (w.phase === 'queue' && p.activity === 'lunch-queue')) tray(c, p, now, w.phase === 'served' || (w.servedAt && now - w.servedAt > SERVE_MS * 0.6))
      }
    } })
    out.push({ z: Z.FRONT + 2, draw: c => {
      for (const [id, w] of who) {
        if (w.phase !== 'eat') continue
        const p = tower.person(id), st = SEATS[w.seat]; if (!p || p.floor !== 'cafe' || p.walking) continue
        if (st.at === 'table') { bowl(c, st.x - 3, f.y - 16, now, st.x); if (Math.floor(now / 1300 + st.x) % 3 === 0) R(c, '#6a4a2a', st.x + 2, f.y - 21, 1, 5) }
        else { const t = (now / 1100 + st.x) % 1; R(c, `rgba(255,255,255,${0.7 * (1 - t)})`, p.x + 5, p.y - 24 - Math.round(t * 6), 1, 1); R(c, `rgba(255,255,255,${0.5 * t})`, p.x + 6, p.y - 22 - Math.round(t * 6), 1, 1) }
      }
    } })
  })

  tower.on('overlay', c => {
    const f = cafe(), m = tower.cafe?.menu; if (!f || !m || !isOn()) return
    const a = tower.worldToScreen(m.x + 2, m.y + 10), z = tower.zoom, w = (m.w - 4) * z, h = (m.h - 12) * z
    if (w < 90) return
    const fs = Math.min(14, Math.floor(h / 3) - 2); if (fs < 6) return
    c.save(); c.fillStyle = '#2d3a32'; c.fillRect(a.x, a.y, w, h); c.textBaseline = 'top'; c.font = font(fs)
    specials().forEach(([n, yen], i) => {
      const p = '¥' + yen, pw = c.measureText(p).width, y = a.y + 1 + i * (fs + 2)
      c.fillStyle = '#f2f0e4'; c.fillText(fitText(n, w - pw - 10, c.font), a.x + 3, y)
      c.fillStyle = '#f2c14e'; c.fillText(p, a.x + w - pw - 3, y)
    })
    c.restore()
  })
  tower.on('hover', (w, person) => {
    const m = tower.cafe?.menu; if (!m || !isOn() || person) return null
    if (w.x < m.x || w.x > m.x + m.w || w.y < m.y || w.y > m.y + m.h) return null
    const q = queue().length, eating = [...who.values()].filter(x => x.phase === 'eat').length
    return `<div class="t">🍜 Lunch · today's specials</div>${specials().map(([n, y]) => `<div class="m">${esc(n)} · ¥${y}</div>`).join('')}<div class="m">${q} queuing · ${eating} eating${busy() ? ' · rush hour' : ''}</div>`
  })

  if (demo) tower.on('snapshot', data => {
    data.sessions.forEach((s, i) => {
      if (i % 3 !== 0) s.state = 'idle'
      for (const a of s.agents) if (a.state !== 'done') a.state = 'idle'
    })
  })
}
