// report-card: 📊 draws today's report card — a 1200×630 PNG (sized for a Slack/OG preview) with a mini tower, eight
// stat tiles, a moment of the day and a grade — and shows it with Copy image / Download. Totals come from
// snap.reportCard (server/features/report-card.mjs) with fallbacks to the gazette, street, deploys and cost data.
// Colours follow the theme's skin and holiday. ?demo=reportcard opens the preview.
import { parseTheme } from '../options.js'

const W = 1200, H = 630
const SANS = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const SKIN = {
  classic: { bg: '#14151c', bg2: '#1c1e2a', panel: '#22242f', line: '#343748', ink: '#ecebf3', muted: '#9897a8', accent: '#f4a24f', accent2: '#63b3f0', sky: ['#3a5f8f', '#7fb0d8'] },
  cyberpunk: { bg: '#100c1e', bg2: '#1a1232', panel: '#211a3c', line: '#3d2f66', ink: '#f2ecff', muted: '#a497c8', accent: '#ff3fb4', accent2: '#3ae0ff', sky: ['#201e3c', '#4a2c6c'] },
  cottage: { bg: '#1b1912', bg2: '#25221a', panel: '#2d2a20', line: '#4a4532', ink: '#f6f0dc', muted: '#b4ab8c', accent: '#e8b04a', accent2: '#8fcf6a', sky: ['#7aa5c4', '#cfe3d4'] },
  japan: { bg: '#15161f', bg2: '#1d1f2c', panel: '#252838', line: '#3c4058', ink: '#f3ead6', muted: '#aeb0c4', accent: '#e05a3e', accent2: '#f0a2bc', sky: ['#6292cc', '#e8e2da'] },
  brutalist: { bg: '#161616', bg2: '#1f1f1f', panel: '#262626', line: '#3f3f3f', ink: '#f0f0f0', muted: '#a0a0a0', accent: '#ff5a3c', accent2: '#d8d8d8', sky: ['#6f7378', '#a9adb2'] },
}
const HOLIDAY = {
  halloween: ['#ff7a1a', '#a066ff'], christmas: ['#e04848', '#4fbf6a'], newyear: ['#ffd24a', '#c9b8ff'], valentine: ['#ff5c8a', '#ffb3c7'],
  lunar: ['#e8423c', '#ffcf4a'], hanami: ['#ff9cc2', '#9fd6a0'], goldenweek: ['#4fa8ff', '#ffcf4a'], tanabata: ['#7ad0ff', '#ffe27a'],
  obon: ['#ffad4a', '#8fb8ff'], tsukimi: ['#ffe9a8', '#9ab0ff'],
}

const nf = n => Math.round(n).toLocaleString('en-US')
const dur = ms => { const m = Math.round(ms / 60000); return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m` }
const usd = v => v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${v.toFixed(2)}`
const midnight = () => new Date().setHours(0, 0, 0, 0)

function palette(snap) {
  const q = new URLSearchParams(location.search)
  const t = parseTheme(q.get('theme') || snap?.theme || 'auto')
  const p = { ...(SKIN[t.skin] || SKIN.classic) }
  const h = HOLIDAY[t.holiday]
  if (h) { p.accent = h[0]; p.accent2 = h[1] }
  return p
}

function stats(api, s) {
  const today = midnight(), rc = s.reportCard?.ready ? s.reportCard : null
  const sessions = s.sessions || [], title = id => sessions.find(x => x.id === id)?.title
  const st = s.street?.status === 'ok' ? s.street : null
  const out = {}
  out.sessions = { v: nf(rc?.sessions ?? sessions.length), sub: `${sessions.filter(x => x.running).length} still open` }
  const tools = rc?.tools ?? s.gazette?.stats?.toolsToday ?? sessions.reduce((a, x) => a + (x.ext?.['milestone-cake']?.today || 0), 0)
  const peak = (s.heatmap?.hours || []).reduce((b, n, h) => n > b[1] ? [h, n] : b, [-1, 0])
  out.tools = { v: nf(tools), sub: peak[0] >= 0 ? `busiest at ${String(peak[0]).padStart(2, '0')}:00` : 'tool calls' }
  const live = sessions.reduce((a, x) => a + (x.agents || []).filter(g => g.state !== 'done' && g.state !== 'idle').length, 0)
  out.agents = { v: rc ? nf(rc.agents) : '—', sub: `${live} at work now` }
  if (st) {
    const mine = (st.merged || []).filter(m => m.author === st.me && Date.parse(m.mergedAt) >= today).length
    const all = (st.merged || []).filter(m => Date.parse(m.mergedAt) >= today).length
    out.prs = { v: nf(mine), sub: `${all} on the street` }
  } else out.prs = { v: '—', sub: 'GitHub not linked' }
  const dl = s.deploys?.status === 'ok' ? (s.deploys.list || []).filter(d => Date.parse(d.createdAt) >= today) : null
  out.deploys = dl ? { v: nf(dl.filter(d => d.conclusion === 'success').length), sub: dl.some(d => d.conclusion === 'failure') ? `${dl.filter(d => d.conclusion === 'failure').length} failed` : dl.some(d => d.status !== 'completed') ? 'one in flight' : 'all green' }
    : { v: '—', sub: 'no deploy feed' }
  out.spend = s.cost?.usdToday != null ? { v: usd(s.cost.usdToday), sub: 'list-price estimate' } : { v: '—', sub: 'counting…' }
  let longest = rc?.longest
  if (!longest) for (const x of sessions) { const t = x.ext?.['time-clock']?.in; if (t && (!longest || s.now - t > longest.ms)) longest = { id: x.id, ms: (s.now || Date.now()) - t } }
  out.longest = longest ? { v: dur(longest.ms), sub: title(longest.id) || 'a closed session' } : { v: '—', sub: '' }
  const top = rc?.top?.[0]
  out.top = top ? { v: api.toolLabel(top[0]), sub: `${top[0].replace(/^mcp__/, '').split('__').pop()} ×${nf(top[1])}` } : { v: '—', sub: '' }
  out.moment = moment(s, rc, st, dl, today)
  const score = tools / 150 + (+out.prs.v || 0) * 6 + (+out.deploys.v || 0) * 3 + (rc?.agents || live) / 4
  out.grade = score >= 60 ? 'A+' : score >= 35 ? 'A' : score >= 18 ? 'B+' : score >= 8 ? 'B' : 'C'
  return out
}

function moment(s, rc, st, dl, today) {
  const fmt = r => r.unit === 'ms' ? dur(r.value) : r.unit === 'usd' ? usd(r.value) : r.unit === 'lines' ? `${nf(r.value)} lines` : nf(r.value)
  const rec = (s.records?.list || []).find(r => r.fresh || (r.prev && r.at >= today))
  if (rec) return { icon: '🏆', kicker: 'NEW RECORD', text: `${rec.label}: ${fmt(rec)}`, sub: rec.prev ? `beat ${fmt({ ...rec, value: rec.prev.value })}` + (rec.what ? ` · ${rec.what}` : '') : rec.what || '' }
  const ok = (dl || []).filter(d => d.conclusion === 'success').sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
  if (ok.length) return { icon: '🚀', kicker: 'LIFT-OFF', text: `${ok.length} rocket${ok.length > 1 ? 's' : ''} launched from the roof`, sub: `latest: ${ok[0].title}` }
  const rt = rc?.retried
  if (rt) return { icon: '🔁', kicker: 'MOST-RETRIED COMMAND', text: rt.cmd, sub: `run ${rt.n} times — try, try again`, code: true }
  const ach = (s.achievements?.list || []).filter(a => a.earnedAt >= today).sort((a, b) => b.earnedAt - a.earnedAt)[0]
  if (ach) return { icon: ach.icon || '🏅', kicker: 'ACHIEVEMENT', text: ach.title, sub: `earned by ${ach.holder}` }
  const quake = (s.seismograph?.events || []).filter(e => e.at >= today).sort((a, b) => b.size - a.size)[0]
  if (quake) return { icon: '💥', kicker: 'BIGGEST TREMOR', text: quake.cmd, sub: quake.kind, code: true }
  return { icon: '☕', kicker: 'MOMENT OF THE DAY', text: 'A calm, steady day in the tower.', sub: '' }
}

// a rect with stepped 2-pixel corners
function block(c, x, y, w, h, fill, r = 6) {
  c.fillStyle = fill
  c.fillRect(x + r, y, w - 2 * r, h); c.fillRect(x, y + r, w, h - 2 * r)
  c.fillRect(x + r / 2, y + r / 2, w - r, h - r)
}
function fitFont(c, text, max, px, weight = 700, min = 12) {
  for (; px > min; px -= 1) { c.font = `${weight} ${px}px ${SANS}`; if (c.measureText(text).width <= max) break }
  return px
}
function clip(c, text, max) {
  if (c.measureText(text).width <= max) return text
  while (text.length > 1 && c.measureText(text + '…').width > max) text = text.slice(0, -1)
  return text + '…'
}
function wrap(c, text, max, lines) {
  const words = String(text).split(/\s+/), out = []
  let cur = ''
  for (const w of words) {
    const t = cur ? cur + ' ' + w : w
    if (c.measureText(t).width <= max || !cur) cur = t; else { out.push(cur); cur = w }
  }
  if (cur) out.push(cur)
  if (out.length > lines) { out.length = lines; out[lines - 1] = clip(c, out[lines - 1] + ' …', max) }
  return out.map(l => clip(c, l, max))
}

// the tower out of the last world frame (the camera pulls back for two frames when part of it is off screen)
async function towerShot(api) {
  const t = api.tower
  if (!t?.active || !t.world?.width || !t.bounds) return null
  const wrapEl = document.getElementById('wrap')
  const region = () => {
    const z = t.cam.zoom, x0 = Math.floor(t.cam.cx - wrapEl.clientWidth / 2 / z), y0 = Math.floor(t.cam.cy - wrapEl.clientHeight / 2 / z)
    const b = t.bounds, ix0 = Math.max(b.x0, x0), iy0 = Math.max(b.y0, y0)
    const ix1 = Math.min(b.x1, x0 + t.world.width), iy1 = Math.min(b.y1, y0 + t.world.height)
    return { x: ix0 - x0, y: iy0 - y0, w: ix1 - ix0, h: iy1 - iy0, cover: Math.max(0, ix1 - ix0) * Math.max(0, iy1 - iy0) / ((b.x1 - b.x0) * (b.y1 - b.y0)) }
  }
  const copy = r => { const c = document.createElement('canvas'); c.width = Math.max(1, r.w); c.height = Math.max(1, r.h); c.getContext('2d').drawImage(t.world, r.x, r.y, r.w, r.h, 0, 0, r.w, r.h); return c }
  let r = region()
  if (r.cover > 0.995) return copy(r)
  const saved = { zoom: t.cam.zoom, cx: t.cam.cx, cy: t.cam.cy, auto: t.cam.auto }
  const b = t.bounds
  Object.assign(t.cam, { auto: false, zoom: Math.min(wrapEl.clientWidth / (b.x1 - b.x0), wrapEl.clientHeight / (b.y1 - b.y0)) * 0.97, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2 })
  await new Promise(ok => requestAnimationFrame(() => requestAnimationFrame(ok)))
  r = region()
  const shot = r.w > 0 && r.h > 0 ? copy(r) : null
  Object.assign(t.cam, saved)
  return shot
}

function draw(api, snap, tower) {
  const P = palette(snap), S = stats(api, snap)
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H
  const c = cv.getContext('2d')
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, P.bg2); g.addColorStop(1, P.bg)
  c.fillStyle = g; c.fillRect(0, 0, W, H)
  c.fillStyle = P.line
  for (let y = 10; y < H; y += 20) for (let x = (y / 20 % 2) * 10 + 10; x < W; x += 20) c.fillRect(x, y, 2, 2)
  for (let x = 0; x < W; x += 16) { c.fillStyle = (x / 16) % 2 ? P.accent : P.accent2; c.fillRect(x, 0, 16, 6) }

  // the tower
  const tx = 36, ty = 34, tw = 372, th = 562
  block(c, tx - 4, ty - 4, tw + 8, th + 8, P.line, 8)
  const sky = c.createLinearGradient(0, ty, 0, ty + th); sky.addColorStop(0, P.sky[0]); sky.addColorStop(1, P.sky[1])
  block(c, tx, ty, tw, th, sky, 6)
  if (tower) {
    const k = Math.min(tw / tower.width, th / tower.height), dw = Math.round(tower.width * k), dh = Math.round(tower.height * k)
    c.save(); c.beginPath(); c.rect(tx, ty, tw, th); c.clip()
    c.imageSmoothingEnabled = k < 1
    c.drawImage(tower, tx + Math.round((tw - dw) / 2), ty + th - dh, dw, dh)
    c.restore()
  } else {
    c.fillStyle = P.panel; c.fillRect(tx + 120, ty + 140, 132, th - 140)
    c.fillStyle = P.accent; for (let y = ty + 160; y < ty + th - 20; y += 26) for (let x = tx + 134; x < tx + 240; x += 26) c.fillRect(x, y, 14, 12)
  }
  const now = new Date()
  c.font = `700 13px ${SANS}`
  const cap = `the tower at ${now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
  const cw = c.measureText(cap).width + 20
  block(c, tx + 10, ty + 10, cw, 26, P.bg + 'dd', 4)
  c.fillStyle = P.ink; c.textBaseline = 'middle'; c.fillText(cap, tx + 20, ty + 24)

  // title
  const X = 444, RW = W - X - 36
  c.textBaseline = 'alphabetic'
  c.fillStyle = P.accent; c.font = `800 15px ${SANS}`
  c.fillText('D A I L Y   R E P O R T   C A R D', X, 66)
  const owner = api.owner && api.owner !== 'You' ? `${api.owner}'s day` : 'your day'
  const date = now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })
  const title = `Agentopolis · ${date} · ${owner}`
  c.fillStyle = P.ink; fitFont(c, title, RW - 120, 32, 800)
  c.fillText(title, X, 106)

  // the grade stamp
  c.save(); c.translate(W - 82, 82); c.rotate(-0.16)
  c.strokeStyle = P.accent; c.lineWidth = 5; c.beginPath(); c.arc(0, 0, 46, 0, Math.PI * 2); c.stroke()
  c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 38, 0, Math.PI * 2); c.stroke()
  c.fillStyle = P.accent; c.textAlign = 'center'; c.textBaseline = 'middle'
  c.font = `900 ${S.grade.length > 1 ? 34 : 40}px ${SANS}`; c.fillText(S.grade, 0, 2)
  c.font = `800 9px ${SANS}`; c.fillText('GRADE', 0, -27)
  c.restore()
  c.textAlign = 'left'

  // tiles
  const C = api.COLORS
  const tiles = [
    ['🏢', 'sessions', S.sessions, C.thinking], ['🛠', 'tool calls', S.tools, C.tool], ['👥', 'subagents', S.agents, C.delegating], ['🔀', 'PRs merged', S.prs, '#b996f5'],
    ['🚀', 'deploys', S.deploys, C.building], ['💸', 'spend today', S.spend, C.waiting], ['⏱', 'longest session', S.longest, '#5fd1c8'], ['🔧', 'top tool', S.top, C.attention],
  ]
  const gap = 14, cols = 4, tw2 = (RW - gap * (cols - 1)) / cols, th2 = 124, y0 = 136
  tiles.forEach(([icon, label, d, col], i) => {
    const x = X + (i % cols) * (tw2 + gap), y = y0 + Math.floor(i / cols) * (th2 + gap)
    block(c, x, y, tw2, th2, P.panel, 6)
    c.fillStyle = col; c.fillRect(x + 6, y, tw2 - 12, 4)
    c.textBaseline = 'alphabetic'
    c.font = `16px ${SANS}`; c.fillText(icon, x + 14, y + 32)
    c.fillStyle = P.muted; c.font = `700 12px ${SANS}`; c.fillText(clip(c, label.toUpperCase(), tw2 - 50), x + 40, y + 30)
    c.fillStyle = P.ink; fitFont(c, d.v, tw2 - 28, 36, 800, 16); c.fillText(d.v, x + 14, y + 78)
    c.fillStyle = P.muted; c.font = `600 12px ${SANS}`; c.fillText(clip(c, d.sub || '', tw2 - 28), x + 14, y + 104)
  })

  // moment of the day
  const my = y0 + 2 * th2 + gap + 18, mh = 128, m = S.moment
  block(c, X, my, RW, mh, P.panel, 6)
  c.fillStyle = P.accent; c.fillRect(X, my + 6, 5, mh - 12)
  c.font = `40px ${SANS}`; c.textBaseline = 'middle'; c.fillText(m.icon, X + 24, my + mh / 2)
  c.textBaseline = 'alphabetic'
  c.fillStyle = P.accent; c.font = `800 13px ${SANS}`; c.fillText(m.kicker === 'MOMENT OF THE DAY' ? m.kicker : `MOMENT OF THE DAY · ${m.kicker}`, X + 88, my + 32)
  c.fillStyle = P.ink; c.font = `${m.code ? 700 : 800} ${m.code ? 20 : 24}px ${SANS}`
  const lines = wrap(c, m.code ? `$ ${m.text}` : m.text, RW - 112, 2)
  lines.forEach((l, i) => c.fillText(l, X + 88, my + 64 + i * 28))
  c.fillStyle = P.muted; c.font = `600 13px ${SANS}`; c.fillText(clip(c, m.sub || '', RW - 112), X + 88, my + mh - 16)

  // footer
  const fy = H - 30
  c.fillStyle = P.accent2
  for (const [dx, dy, w, h] of [[0, -14, 8, 18], [9, -20, 8, 24], [18, -10, 6, 14]]) c.fillRect(X + dx, fy + dy, w, h)
  c.fillStyle = P.muted; c.font = `700 14px ${SANS}`; c.textBaseline = 'alphabetic'
  c.fillText('made with Agentopolis', X + 34, fy + 3)
  c.textAlign = 'right'
  if (snap.records?.streak > 1) c.fillText(`🔥 ${snap.records.streak}-day streak`, W - 36, fy + 3)
  c.textAlign = 'left'
  return cv
}

const toBlob = cv => new Promise(ok => cv.toBlob(ok, 'image/png'))
const toB64 = blob => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = fail; r.readAsDataURL(blob) })

export default function init(api) {
  const btn = document.createElement('button'); btn.className = 'hbtn'
  btn.textContent = '📊'
  btn.title = 'Daily report card — an image to share'
  document.getElementById('tbPhoto')?.append(btn)

  const style = document.createElement('style')
  style.textContent = `
  #rcBack { position: fixed; inset: 0; z-index: 30; display: none; place-items: center; background: rgba(5, 6, 10, .55); }
  #rcBack.on { display: grid; }
  #rcCard { padding: 14px; display: flex; flex-direction: column; gap: 12px; max-width: min(92vw, 860px); }
  #rcCard img { display: block; width: 100%; height: auto; border-radius: var(--radius-s); border: 1px solid var(--card-line); image-rendering: auto; }
  #rcCard .row { display: flex; gap: 8px; align-items: center; }
  #rcCard .row b { flex: 1; font: 700 var(--fs) var(--font); color: var(--muted); }
  #rcCard button { all: unset; cursor: pointer; padding: 7px 14px; border-radius: var(--radius-s); font: 700 var(--fs) var(--font); color: var(--ink); background: var(--card-hi); border: 1px solid var(--card-line); }
  #rcCard button:hover, #rcCard button:focus-visible { background: rgba(255, 255, 255, .14); }
  #rcCard button.main { background: #f4a24f; color: #1a1408; border-color: transparent; }`
  document.head.append(style)
  const back = document.createElement('div'); back.id = 'rcBack'
  back.innerHTML = `<div id="rcCard" class="card" role="dialog" aria-label="Daily report card">
    <img alt="Today's report card"><div class="row"><b>1200 × 630 · ready for Slack</b>
    <button class="main" data-a="copy">Copy image</button><button data-a="dl">Download</button><button data-a="x" aria-label="Close">✕</button></div></div>`
  document.body.append(back)
  const img = back.querySelector('img')
  let blob = null, url = null, busy = false

  const close = () => { back.classList.remove('on'); if (url) URL.revokeObjectURL(url); url = null; blob = null }
  back.addEventListener('pointerdown', e => { if (e.target === back) close() })
  addEventListener('keydown', e => { if (e.key === 'Escape' && back.classList.contains('on')) close() })

  const fileName = () => { const d = new Date(), p = n => String(n).padStart(2, '0'); return `agentopolis-report-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}.png` }
  function anchorDownload() {
    const a = document.createElement('a'); a.href = url; a.download = fileName(); document.body.append(a); a.click(); a.remove()
  }
  async function download() {
    if (!blob) return
    try {
      const r = await fetch('/api/photo-booth/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'png', data: await toB64(blob) }) })
      if (r.ok) return api.toast('Report card saved to Downloads', 3000)
    } catch {}
    anchorDownload(); api.toast('Report card downloaded', 2500)
  }
  async function copy() {
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      api.toast('Report card copied — paste it into Slack', 3000)
    } catch { await download() }
  }
  back.querySelector('#rcCard .row').addEventListener('click', e => {
    const a = e.target.closest('button')?.dataset.a
    if (a === 'copy') copy(); else if (a === 'dl') download(); else if (a === 'x') close()
  })

  async function open() {
    const snap = api.lastSnapshot || api.tower?.snapshot
    if (busy || !snap) return api.toast(snap ? 'Report card: one moment…' : 'Report card: waiting for data')
    busy = true
    try {
      const shot = await towerShot(api).catch(() => null)
      const cv = draw(api, snap, shot)
      blob = await toBlob(cv)
      if (!blob) throw new Error('no PNG')
      if (url) URL.revokeObjectURL(url)
      url = URL.createObjectURL(blob); img.src = url
      back.classList.add('on')
      back.querySelector('button.main').focus()
    } catch (e) { console.error('[report-card]', e); api.toast('Report card: could not draw the image') }
    busy = false
  }
  btn.onclick = open

  const q = api.params
  if (q.getAll('demo').includes('reportcard')) setTimeout(open, 4000)
}
