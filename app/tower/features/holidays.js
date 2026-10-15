// holidays: the tower's calendar, a date table read by ambience.js too (Halloween, Valentine's, Lunar New Year and
// Christmas keep their decor there; this file draws the rest). the user is in Tokyo, so the Japanese year is in it: New Year
// (kadomatsu at the door, fireworks over the roof around midnight), hanami (petals down the facade), Golden Week (carp
// streamers on the sidewalk), Tanabata (a wish bamboo in the lobby, streamers off the awning), Obon (paper lanterns),
// Tsukimi (the harvest moon, dango and pampas grass). ?date=YYYY-MM-DD previews a day; ?demo=holidays cycles through them.
import { IX, BW } from '../building.js'

const MD = s => s.split('-').map(Number)
// [key, name, icon, from, to (MM-DD, inclusive, may wrap the year) | per-year dates ±days, claims]
// claims: lobby (the big spot left of reception), door (both sides of the street door), strand (the bulb strands)
export const HOLIDAYS = [
  { key: 'newyear', name: 'New Year · Shōgatsu', icon: '🎍', from: '12-31', to: '01-07', pin: '01-01', door: true },
  { key: 'valentine', name: "Valentine's Day", icon: '💝', from: '02-08', to: '02-14' },
  { key: 'lunar', name: 'Lunar New Year', icon: '🧧', on: { 2025: '01-29', 2026: '02-17', 2027: '02-06', 2028: '01-26', 2029: '02-13', 2030: '02-03', 2031: '01-23', 2032: '02-11' }, before: 3, after: 14 },
  { key: 'hanami', name: 'Hanami · cherry blossoms', icon: '🌸', from: '03-25', to: '04-10', pin: '03-31', lobby: true },
  { key: 'goldenweek', name: 'Golden Week · Kodomo no Hi', icon: '🎏', from: '04-29', to: '05-05' },
  { key: 'tanabata', name: 'Tanabata · star festival', icon: '🎋', from: '07-01', to: '07-07', lobby: true },
  { key: 'obon', name: 'Obon', icon: '🏮', from: '08-13', to: '08-16', pin: '08-14', strand: true },
  { key: 'tsukimi', name: 'Tsukimi · moon viewing', icon: '🎑', on: { 2025: '10-06', 2026: '09-25', 2027: '09-15', 2028: '10-03', 2029: '09-22', 2030: '09-12', 2031: '10-01', 2032: '09-19' }, before: 2, after: 2, lobby: true },
  { key: 'halloween', name: 'Halloween', icon: '🎃', from: '10-10', to: '11-01', pin: '10-31' },
  { key: 'christmas', name: 'Christmas', icon: '🎄', from: '12-01', to: '12-26', pin: '12-24' },
]

const params = new URLSearchParams(location.search + '&' + location.hash.slice(1))
const DEMO = params.getAll('demo').includes('holidays'), T0 = Date.now()
const DEMO_DATES = ['12-31', '02-14', '03-31', '05-03', '07-07', '08-14', '09-25', '10-31', '12-24']
const fixed = (params.get('date') || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
const forcedTime = (params.get('time') || '').match(/^(\d{1,2}):(\d{2})$/)
// themes.js pins the calendar: a holiday key (its day stands in for today), 'none' (no holiday) or null (the real date)
let pinned = null
export const pinHoliday = key => { pinned = key || null }
const pinDay = y => { const h = HOLIDAYS.find(h => h.key === pinned); if (!h) return null; const s = h.on ? h.on[y] || Object.values(h.on)[0] : h.pin || h.to; return MD(s) }
// the day the tower lives in: ?date= (or the demo's cycle) at the real (or ?time=) time of day
export function today() {
  const now = new Date()
  let y = now.getFullYear(), m = now.getMonth() + 1, d = now.getDate()
  if (fixed) [y, m, d] = [+fixed[1], +fixed[2], +fixed[3]]
  else if (DEMO) [m, d] = MD(DEMO_DATES[Math.floor((Date.now() - T0) / 12000) % DEMO_DATES.length])
  else if (pinDay(y)) [m, d] = pinDay(y)
  if (!fixed && !DEMO && !forcedTime && !pinDay(y)) return now
  const [hh, mm] = forcedTime ? [+forcedTime[1], +forcedTime[2]] : [now.getHours(), now.getMinutes()]
  return new Date(y, m - 1, d, hh, mm, now.getSeconds())
}
export function holidayOf(d = today()) {
  if (pinned === 'none' && !fixed && !DEMO) return null
  const y = d.getFullYear(), md = (d.getMonth() + 1) * 100 + d.getDate()
  for (const h of HOLIDAYS) {
    if (h.on) {
      const s = h.on[y]; if (!s) continue
      const [m, dd] = MD(s), off = (new Date(y, d.getMonth(), d.getDate()) - new Date(y, m - 1, dd)) / 864e5
      if (off >= -h.before && off <= h.after) return h
      continue
    }
    const [fm, fd] = MD(h.from), [tm, td] = MD(h.to), a = fm * 100 + fd, b = tm * 100 + td
    if (a <= b ? md >= a && md <= b : md >= a || md <= b) return h
  }
  return null
}

const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const pool = (c, x, y, r, rgb, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${rgb},${a})`); g.addColorStop(1, `rgba(${rgb},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
const rnd = k => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }

// ---------- sprites ----------
function kadomatsu(c, cx, by) {
  R(c, 'rgba(0,0,0,.28)', cx - 6, by, 12, 1)
  for (const [dx, h] of [[-3, 22], [0, 26], [3, 19]]) {
    R(c, '#3f8a3a', cx + dx - 1, by - h, 3, h - 6); R(c, '#6ab85a', cx + dx - 1, by - h, 1, h - 6)
    R(c, '#e8f0c8', cx + dx - 1, by - h, 3, 1); R(c, '#c8d8a0', cx + dx, by - h + 1, 2, 1)
  }
  for (const [dx, dy] of [[-6, -10], [5, -9], [-5, -13], [4, -12]]) R(c, '#2a5a2a', cx + dx - 1, by + dy, 3, 2)
  R(c, '#d8b468', cx - 5, by - 8, 11, 8); R(c, '#b89048', cx - 5, by - 8, 11, 1)
  R(c, '#7a5a2a', cx - 5, by - 5, 11, 1); R(c, '#7a5a2a', cx - 5, by - 2, 11, 1)
  R(c, '#c8202a', cx + 3, by - 13, 2, 2)
}
function shimenawa(c) {   // the sacred rope with paper zigzags over the street door
  for (let x = -2; x < 10; x++) R(c, '#d8b468', x, -45 + Math.round(Math.sin((x + 2) / 12 * Math.PI) * 2), 1, 2)
  for (const x of [0, 4, 8]) { R(c, '#f8f6ee', x, -42, 2, 2); R(c, '#f8f6ee', x + 1, -40, 2, 2); R(c, '#f8f6ee', x, -38, 2, 2) }
  R(c, '#e8902a', 3, -44, 3, 3); R(c, '#3f8a3a', 3, -45, 3, 1)
}
function wreath(c) {
  const cx = 4, cy = -34
  for (let a = 0; a < 12; a++) R(c, a % 3 ? '#2f6a34' : '#3f8a44', cx + Math.round(4 * Math.cos(a / 12 * 2 * Math.PI)) - 1, cy + Math.round(4 * Math.sin(a / 12 * 2 * Math.PI)) - 1, 2, 2)
  R(c, '#d8303a', cx - 1, cy + 3, 3, 2); R(c, '#d8303a', cx - 2, cy + 5, 1, 2); R(c, '#d8303a', cx + 1, cy + 5, 1, 2)
  R(c, '#ff5a5a', cx - 3, cy - 2); R(c, '#ff5a5a', cx + 3, cy)
}
function sakuraTree(c, cx, by, now) {
  R(c, 'rgba(0,0,0,.28)', cx - 6, by, 12, 1)
  R(c, '#7a4a3a', cx - 4, by - 6, 8, 6); R(c, '#9a5a44', cx - 4, by - 6, 8, 1)
  R(c, '#5a3a2a', cx - 1, by - 26, 2, 20); R(c, '#5a3a2a', cx - 5, by - 22, 4, 1); R(c, '#5a3a2a', cx + 1, by - 20, 5, 1)
  for (let i = 0; i < 26; i++) {
    const a = rnd(i) * 2 * Math.PI, r = 4 + rnd(i + 50) * 8
    R(c, ['#ffc8d8', '#ffb0c8', '#f898b8', '#fff0f4'][i % 4], cx + Math.round(Math.cos(a) * r * 1.3) - 1, by - 28 + Math.round(Math.sin(a) * r * 0.7), 3, 2)
  }
}
function bamboo(c, cx, f, now) {   // the Tanabata wish bamboo, hung with tanzaku slips
  const by = f.y, top = f.top + 12
  R(c, 'rgba(0,0,0,.28)', cx - 5, by, 10, 1)
  R(c, '#7a5a3a', cx - 4, by - 6, 8, 6); R(c, '#9a7a4a', cx - 4, by - 6, 8, 1)
  R(c, '#4a8a3a', cx, top, 2, by - 6 - top); for (let y = top + 8; y < by - 6; y += 10) R(c, '#2f6a2a', cx, y, 2, 1)
  const cols = ['#ff5a6a', '#ffd84a', '#5ab0ff', '#7ad86a', '#c88aff', '#f8f6ee']
  for (let i = 0; i < 7; i++) {
    const y = top + 4 + i * 7, d = i % 2 ? 1 : -1, len = 9 - Math.abs(3 - i)
    for (let k = 1; k <= len; k++) R(c, '#5aa04a', cx + d * k + (d < 0 ? 0 : 1), y + Math.floor(k / 3))
    R(c, '#7ac85a', cx + d * len + (d < 0 ? -1 : 1), y + Math.floor(len / 3), 2, 1)
    const sx = cx + d * (len - 2) + (d < 0 ? 0 : 1), sw = Math.round(Math.sin(now / 900 + i) * 0.6)
    R(c, cols[i % cols.length], sx + sw, y + Math.floor(len / 3) + 2, 2, 5)
  }
}
function streamers(c, now) {   // fukinagashi off the awning
  const cols = ['#ff5a6a', '#ffd84a', '#5ab0ff', '#7ad86a', '#c88aff']
  for (const [x0, k] of [[-26, 0], [-12, 1], [0, 2]]) {
    R(c, '#e8d0a0', x0 - 1, -46, 4, 2)
    cols.forEach((col, i) => { for (let y = 0; y < 12 + (i % 2) * 3; y++) R(c, col, x0 + i * 0.6 + Math.sin(now / 500 + y / 3 + k + i) * (y / 8), -44 + y, 1, 1) })
  }
}
function chochin(c, cx, y) {
  R(c, '#3a2a1a', cx, y - 2, 1, 2); R(c, '#2a2020', cx - 2, y, 5, 1)
  R(c, '#f8f0dc', cx - 3, y + 1, 7, 7); R(c, '#f8f0dc', cx - 2, y + 8, 5, 1); R(c, '#e8dcc0', cx - 3, y + 3, 7, 1); R(c, '#e8dcc0', cx - 3, y + 6, 7, 1)
  R(c, '#c8202a', cx - 1, y + 3, 3, 3); R(c, '#2a2020', cx - 2, y + 9, 5, 1)
}
function koinobori(c, x, now) {
  R(c, '#d8d8e0', x, -100, 1, 100); R(c, '#a8a8b0', x + 1, -100, 1, 100); R(c, 'rgba(0,0,0,.28)', x - 3, 0, 8, 1)
  R(c, '#ffd84a', x - 1, -104, 3, 3)
  const spin = Math.floor(now / 120) % 2; R(c, '#5ab0ff', x - 3 + spin * 2, -100, 3, 1); R(c, '#ff5a5a', x - spin * 2 + 1, -99, 3, 1)
  R(c, '#f8f6ee', x + 1, -97, 3, 1)
  for (let i = 0; i < 4; i++) R(c, ['#5ab0ff', '#ff5a6a', '#ffd84a', '#7ad86a'][i], x + 1, -96 + i, 4 + i, 1)
  const fish = [[-88, 22, '#2a2a3a', '#4a4a5a'], [-75, 18, '#d8303a', '#ff6a6a'], [-63, 14, '#3a6ad8', '#6a9aff']]
  for (const [y, len, col, hi] of fish) {
    for (let k = 0; k < len; k++) {
      const wy = y + Math.round(Math.sin(now / 260 - k / 4) * (k / len) * 2.5), h = k < 3 ? 5 : k > len - 4 ? 3 + (k % 2) * 3 : 5
      R(c, col, x + 2 + k, wy - Math.floor(h / 2), 1, h)
      if (k > 3 && k < len - 4 && k % 3 === 0) R(c, hi, x + 2 + k, wy - 1, 1, 2)
    }
    const wy = y + 0
    R(c, '#f8f6ee', x + 3, wy - 2, 2, 2); R(c, '#1a1a1a', x + 4, wy - 1)
  }
}
function dango(c, cx, by) {
  R(c, 'rgba(0,0,0,.28)', cx - 6, by, 12, 1)
  R(c, '#b8905a', cx - 5, by - 4, 10, 4); R(c, '#d8b07a', cx - 6, by - 5, 12, 1); R(c, '#8a6a3a', cx - 2, by - 3, 4, 2)
  for (const [dx, dy] of [[-4, -8], [-1, -8], [2, -8], [-3, -11], [0, -11], [-1, -14]]) { R(c, '#f8f6ee', cx + dx, by + dy, 3, 3); R(c, '#e0dccc', cx + dx, by + dy + 2, 3, 1) }
}
function susuki(c, cx, by, now) {
  R(c, '#5a6a7a', cx - 2, by - 7, 5, 7); R(c, '#7a8a9a', cx - 2, by - 7, 5, 1)
  for (const [dx, h, ph] of [[-3, 18, 0], [0, 22, 1], [3, 17, 2], [1, 14, 3]]) {
    const sw = Math.round(Math.sin(now / 1100 + ph) * 1.2)
    for (let y = 0; y < h; y++) R(c, '#8a9a5a', cx + Math.round(dx * y / h) + (y > h - 6 ? sw : 0), by - 7 - y)
    R(c, '#e8dcb0', cx + dx + sw - 1, by - 7 - h, 2, 4); R(c, '#d8c890', cx + dx + sw, by - 4 - h, 1, 2)
  }
}
function moon(c, cx, cy, a) {
  c.globalAlpha = a
  c.fillStyle = '#fff4c8'; c.beginPath(); c.arc(cx, cy, 13, 0, 2 * Math.PI); c.fill()
  c.fillStyle = '#f0e0a0'; for (const [dx, dy, r] of [[-4, -3, 3], [5, 4, 2], [-2, 6, 2], [6, -5, 1.5]]) { c.beginPath(); c.arc(cx + dx, cy + dy, r, 0, 2 * Math.PI); c.fill() }
  R(c, 'rgba(200,180,120,.55)', cx - 3, cy - 1, 2, 4); R(c, 'rgba(200,180,120,.55)', cx - 1, cy + 1, 4, 3); R(c, 'rgba(200,180,120,.55)', cx + 3, cy + 2, 2, 1)
  c.globalAlpha = 1
}

export default function init(api, tower) {
  const { Z, font } = tower
  const current = () => holidayOf(today())
  const roof = () => tower.floors[tower.floors.length - 1]
  const lobbyX = IX + 44, POLE_X = -96, MOON_X = 120
  let night = 0

  const midnight = () => { const d = today(); return (d.getMonth() === 11 && d.getDate() === 31 && d.getHours() === 23 && d.getMinutes() >= 50) || (d.getMonth() === 0 && d.getDate() === 1 && d.getHours() === 0 && d.getMinutes() < 30) }
  function bursts(now) {
    const rf = roof(), out = [], P = 1400
    for (let k = Math.floor(now / P) - 2; k <= Math.floor(now / P); k++) {
      const t = (now - k * P) / 2600; if (t < 0 || t > 1) continue
      const x = -30 + rnd(k) * (BW + 60), y = rf.y - 60 - rnd(k + 9) * 90
      out.push({ x, y, t, col: ['255,90,90', '255,216,74', '90,176,255', '122,216,106', '200,138,255', '255,255,255'][Math.floor(rnd(k + 3) * 6)], n: 18 + Math.floor(rnd(k + 5) * 10) })
    }
    return out
  }
  function drawBurst(c, b) {
    const r = 6 + 26 * Math.sqrt(b.t), a = Math.max(0, 1 - b.t ** 1.5)
    c.fillStyle = `rgba(${b.col},${a})`
    for (let i = 0; i < b.n; i++) { const an = i / b.n * 2 * Math.PI; c.fillRect(Math.round(b.x + Math.cos(an) * r), Math.round(b.y + Math.sin(an) * r + 10 * b.t * b.t), 2, 2); c.fillRect(Math.round(b.x + Math.cos(an) * r * 0.6), Math.round(b.y + Math.sin(an) * r * 0.6 + 10 * b.t * b.t), 1, 1) }
    if (b.t < 0.12) { c.fillStyle = `rgba(255,250,220,${1 - b.t / 0.12})`; c.fillRect(Math.round(b.x) - 1, Math.round(b.y) - 1, 3, 3) }
  }
  function lanterns() {
    const rf = roof(), out = []
    for (let x = 16; x < BW - 8; x += 32) out.push([x, rf.y - 15])
    out.push([-26, -45], [-14, -45], [-2, -45])
    return out
  }
  function petals(now) {
    const rf = roof(), out = [], H = -rf.y + 40
    for (let i = 0; i < 140; i++) {
      const sp = 10 + rnd(i) * 9, y = rf.y - 40 + ((now / 1000 * sp + rnd(i + 7) * H) % H)
      const x = -60 + rnd(i + 3) * (BW + 90) + Math.sin(now / 900 + i) * 6 + (y - rf.y) * 0.12
      out.push([x, y, i])
    }
    return out
  }

  tower.on('items', (out, now, ctx) => {
    night = ctx.sun.n
    const h = current(); if (!h || !tower.floors.length) return
    const lobby = tower.lobby?.floor
    const k = h.key
    if (k === 'newyear') {
      out.push({ z: Z.OUTSIDE + 3, draw: c => { kadomatsu(c, -9, 0); kadomatsu(c, -24, 0); shimenawa(c) } })
      if (DEMO || fixed || midnight()) out.push({ z: Z.TOP + 2, draw: c => { for (const b of bursts(now)) drawBurst(c, b) } })
    } else if (k === 'christmas') out.push({ z: Z.OUTSIDE + 3, draw: wreath })
    else if (k === 'hanami') {
      if (lobby) out.push({ z: Z.FLOOR, draw: c => sakuraTree(c, lobbyX, lobby.y, now) })
      out.push({ z: Z.OUTSIDE + 6, draw: c => { for (const [x, y, i] of petals(now)) R(c, i % 3 ? '#ffb8d0' : '#fff0f4', x, y, 2, i % 4 ? 2 : 1) } })
    } else if (k === 'goldenweek') out.push({ z: Z.OUTSIDE + 3, draw: c => koinobori(c, POLE_X, now) })
    else if (k === 'tanabata') {
      if (lobby) out.push({ z: Z.FLOOR, draw: c => bamboo(c, lobbyX, lobby, now) })
      out.push({ z: Z.OUTSIDE + 3, draw: c => streamers(c, now) })
    } else if (k === 'obon') {
      const rf = roof()
      out.push({ z: Z.OUTSIDE + 2, draw: c => { R(c, '#2a2630', 1, rf.y - 17, BW - 2, 1); R(c, '#2a2630', -30, -47, 34, 1); for (const [x, y] of lanterns()) chochin(c, x, y) } })
    } else if (k === 'tsukimi') {
      if (lobby) out.push({ z: Z.FLOOR, draw: c => { susuki(c, lobbyX - 5, lobby.y, now); dango(c, lobbyX + 9, lobby.y) } })
      if (night > 0.15) out.push({ z: Z.BEHIND + 1, draw: c => moon(c, MOON_X, roof().y - 80, Math.min(1, night * 1.5)) })
    }
  })
  tower.on('glow', (c, now, n) => {
    const h = current(); if (!h || n < 0.05) return
    c.globalAlpha = Math.min(1, n * 1.2)
    if (h.key === 'obon') for (const [x, y] of lanterns()) pool(c, x, y + 5, 10, '255,190,110', 0.55)
    if (h.key === 'tsukimi') pool(c, MOON_X, roof().y - 80, 34, '255,240,180', 0.35)
    if (h.key === 'newyear' && (DEMO || fixed || midnight())) for (const b of bursts(now)) if (b.t < 0.5) pool(c, b.x, b.y, 30, b.col, 0.3 * (1 - b.t * 2))
    c.globalAlpha = 1
  })

  // ---------- hover, and the demo's caption ----------
  const DATE_FMT = h => h.on ? `${h.on[today().getFullYear()] || ''}${h.on[today().getFullYear()] ? ` (−${h.before}…+${h.after} days)` : ''}` : `${h.from} → ${h.to}`
  tower.on('hover', (w, person) => {
    const h = current(); if (person || !h) return null
    const lobby = tower.lobby?.floor
    const near = (x, y0, y1, dx = 10) => Math.abs(w.x - x) <= dx && w.y >= y0 && w.y <= y1
    const hit = (h.lobby && lobby && near(lobbyX, lobby.top, lobby.y)) || (h.key === 'newyear' && near(-16, -48, 0, 16))
      || (h.key === 'goldenweek' && w.x >= POLE_X - 4 && w.x <= POLE_X + 26 && w.y >= -106 && w.y <= 0) || (h.key === 'tanabata' && near(-12, -48, -28, 18))
    if (!hit) return null
    const next = HOLIDAYS.map(x => x.name).join(' · ')
    return `<div class="t">${h.icon} ${api.esc(h.name)}</div><div>${api.esc(DATE_FMT(h))}</div><div class="m">the calendar: ${api.esc(next)}</div>`
  })
  if (DEMO) tower.on('overlay', c => {
    const d = today(), h = current(), txt = `${h ? h.icon + ' ' + h.name : 'no holiday'} · ${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    c.save(); c.font = font(14, 700); c.textAlign = 'center'; c.textBaseline = 'top'
    const w = c.measureText(txt).width + 20, x = 16 + w / 2
    c.fillStyle = 'rgba(20,20,28,.8)'; c.beginPath(); c.roundRect(x - w / 2, 56, w, 24, 6); c.fill()
    c.fillStyle = '#fbfaf4'; c.fillText(txt, x, 61); c.restore()
  })
}
