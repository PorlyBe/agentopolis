// waiting-line: sessions waiting on the user ('waiting' — their turn is over — or 'attention') walk up to the CEO office
// and queue left of his desk behind a velvet rope, longest wait at the front. Each says what it last asked
// (snap ext['waiting-line'], or the permission it needs): the front bubble in full, the rest shortened, hover for
// the whole line, click to open that session in Orca. Answered, they ride home. The phone keeps ringing for
// 'attention' (ceo.js); here those bubbles are red. ?demo=waitingline (or the old waitline) fakes a line that moves.
import { IX } from '../building.js'

const GAP = 32, FRONT = IX + 278, CAP = 8, PLAN_MS = 1000
const ext = s => s.ext?.['waiting-line']
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const mins = ms => { const m = Math.max(0, Math.round(ms / 60000)); return m < 60 ? m + 'm' : Math.floor(m / 60) + 'h' + String(m % 60).padStart(2, '0') }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('waitingline', 'waitline')   // waitline: the old name
  const sent = new Map()      // session id -> x we sent them to
  let line = [], over = 0, planAt = 0, boxes = []

  const sinceOf = s => s.state === 'attention' ? s.attention?.since ?? s.lastActivity : s.lastActivity
  const says = s => {
    const e = ext(s)
    if (s.state === 'attention' && s.attention?.kind !== 'question') return `✋ ${s.attention?.label || 'needs you'}${s.attention?.detail ? ' — ' + s.attention.detail : ''}`
    if (e?.text) return (e.kind === 'question' || s.state === 'attention' ? '✋ ' : '') + e.text + (e.more ? ` (+${e.more} more)` : '')
    return s.state === 'attention' ? `✋ ${s.attention?.label || 'needs you'}` : 'your turn'
  }
  const colorOf = s => api.COLORS[s.state] || api.COLORS.waiting

  // ---------- who queues, and where ----------
  function plan() {
    const snap = tower.snapshot; if (!snap || !tower.floor('ceo')) return
    const want = []
    for (const s of snap.sessions) {
      if ((s.state !== 'waiting' && s.state !== 'attention') || s.running === false) continue
      const p = tower.person(s.id)
      if (!p || p.leaving || p.activity?.startsWith('meeting:') || (p.steered && !sent.has(s.id))) continue
      want.push(s)
    }
    want.sort((a, b) => sinceOf(a) - sinceOf(b))
    line = want.slice(0, CAP); over = want.length - line.length
    const keep = new Set(line.map(s => s.id))
    for (const id of [...sent.keys()]) {
      if (keep.has(id)) continue
      const p = tower.person(id)
      if (!p?.activity?.startsWith('meeting:')) tower.release(id)
      sent.delete(id)
    }
    let budget = 2
    line.forEach((s, i) => {
      const x = FRONT - i * GAP; if (sent.get(s.id) === x) return
      const p = tower.person(s.id)
      if (p.floor !== 'ceo' && (budget <= 0 || tower.liftLoad(p.floor) > 3)) return
      if (p.floor !== 'ceo') budget--
      if (tower.sendTo(s.id, 'ceo', x, { face: 'right', pose: 'stand', activity: 'waitline' })) sent.set(s.id, x)
    })
  }
  tower.on('step', (dt, now) => { if (now - planAt > PLAN_MS && api.live !== false) { planAt = now; plan() } })
  tower.on('sync', () => { planAt = 0 })
  const inPlace = s => { const p = tower.person(s.id); return p && p.floor === 'ceo' && !p.walking && p.activity === 'waitline' ? p : null }

  // ---------- the rope ----------
  tower.on('items', out => {
    const f = tower.floor('ceo'); if (!f || !line.length) return
    const n = line.length, x0 = FRONT - (n - 1) * GAP - 12, x1 = FRONT + 10, y = f.y
    out.push({ z: Z.FLOOR + 4, draw: c => {
      const posts = [x1]; for (let x = x1 - 2 * GAP; x > x0; x -= 2 * GAP) posts.push(x); posts.push(x0)
      for (let i = 0; i < posts.length - 1; i++) {
        const a = posts[i], b = posts[i + 1]
        for (let x = b + 1; x < a; x++) { const t = (x - b) / (a - b), sag = Math.round(Math.sin(Math.PI * t) * 3); R(c, '#8a1f2a', x, y - 14 + sag, 1, 2); R(c, '#b0303e', x, y - 14 + sag, 1, 1) }
      }
      for (const x of posts) { R(c, 'rgba(0,0,0,.2)', x - 2, y - 2, 6, 2); R(c, '#9a7a3a', x - 2, y - 3, 5, 2); R(c, '#c9a25a', x, y - 15, 1, 12); R(c, '#e8c878', x - 1, y - 17, 3, 2) }
      R(c, '#3b2617', x1 + 1, y - 26, 1, 9); R(c, '#f4efe0', x1 - 4, y - 31, 11, 6); R(c, '#c9a25a', x1 - 4, y - 31, 11, 1)
      R(c, '#7a1f22', x1 - 2, y - 29, 7, 1); R(c, '#7a1f22', x1 - 2, y - 27, 5, 1)
    } })
  })

  // ---------- bubbles ----------
  function wrap(c, text, max, lines) {
    const out = []
    let cur = ''
    for (const w of text.split(' ')) {
      const t = cur ? cur + ' ' + w : w
      if (!cur || c.measureText(t).width <= max) cur = t
      else { out.push(cur); cur = w }
    }
    if (cur) out.push(cur)
    if (out.length <= lines) return out
    return [...out.slice(0, lines - 1), fitText(out.slice(lines - 1).join(' '), max, c.font)]
  }
  // the tower's own status bubble sits over each head; a card at the same spot, at least as wide, covers it
  function card(c, ax, ay, w, h, color) {
    const x = Math.round(ax - w / 2), y = Math.round(ay - h - 5)
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x + 2, y + 3, w, h, 6); c.fill()
    c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill()
    c.beginPath(); c.moveTo(ax - 4, y + h - 1); c.lineTo(ax, y + h + 5); c.lineTo(ax + 4, y + h - 1); c.fill()
    c.fillStyle = color; c.fillRect(x, y + 4, 3, h - 8)
    return { x, y }
  }
  // the left edge of the tower's 'NEED YOU' note card over the desk (tower.js ceoText), to keep the front bubble off it
  function noteLeft(c, k) {
    const list = (tower.snapshot?.sessions || []).filter(s => s.state === 'attention' && s.running !== false), n = tower.slots?.note
    if (!list.length || !n) return Infinity
    const fs = Math.max(10, Math.min(13, 4 * k)), nx = tower.worldToScreen(n.x + n.w / 2, n.y).x
    c.font = font(fs)
    const w = Math.max(...list.slice(0, 4).map(s => c.measureText('✋ ' + fitText(s.title, 190, font(fs))).width)) + 16
    return Math.min(tower.canvas.clientWidth - w - 4, nx - w / 2)
  }
  const builtin = s => s.state === 'attention' ? `✋ ${s.attention?.label || 'needs you'}` : '💬 your turn'
  tower.on('overlay', c => {
    boxes = []
    if (!line.length) return
    const k = tower.zoom, cv = tower.canvas, W = cv.clientWidth, H = cv.clientHeight, f = tower.floor('ceo')
    if (tower.worldToScreen(0, f.top).y > H || tower.worldToScreen(0, f.y).y < 0) return
    const here = line.map((s, i) => ({ s, i, p: inPlace(s) })).filter(q => q.p)
    if (!here.length) return
    const bf = Math.max(k < tower.fitZoom() ? 8 : 10, Math.min(16, 5.6 * k)), ch = bf + 9, bfont = font(bf)
    const close = k >= tower.fitZoom() * 1.6, now = Date.now()
    const at = p => { const a = tower.worldToScreen(p.x, p.y - 31); return { x: a.x, y: a.y - 3 } }
    c.save(); c.textBaseline = 'middle'; c.font = bfont
    const room = Math.max(24, GAP * k - 18)
    for (const { s, i, p } of [...here].reverse()) {
      const a = at(p), lead = i === 0
      const t = lead ? [`${close ? 'NEXT · ' : fitText(says(s), 160, bfont) + ' · '}${mins(now - sinceOf(s))}`] : close ? wrap(c, says(s), room, 2) : [mins(now - sinceOf(s))]
      const w = Math.round(Math.max(c.measureText(builtin(s)).width, ...t.map(l => c.measureText(l).width)) + 16), h = Math.max(ch, t.length * (bf + 3) + 8)
      const { x, y } = card(c, a.x, a.y, w, h, colorOf(s))
      c.fillStyle = lead && close ? (s.state === 'attention' ? '#a8322a' : '#8a6a1a') : '#1b1c26'; c.font = lead && close ? font(bf, 700) : bfont
      t.forEach((l, n) => c.fillText(l, x + 9, y + h / 2 + (n - (t.length - 1) / 2) * (bf + 3) + 0.5)); c.font = bfont
      boxes.push({ s, x, y, w, h })
      if (lead && !close && line.length > 1) { c.font = font(bf, 700); c.fillStyle = '#fbfaf4'; c.fillText(`+${line.length - 1 + over}`, x + w + 4, y + ch / 2); c.font = bfont }
    }
    const front = here[0]
    if (close && front.i === 0) {
      const { s, p } = front, a = at(p), fs = Math.round(Math.max(11, Math.min(15, 4.4 * k))), lh = fs + 4, max = Math.min(340, Math.max(170, 90 * k))
      c.font = font(fs)
      const body = wrap(c, says(s), max, 4)
      const head = String(s.title).toUpperCase()
      c.font = font(fs - 2, 700)
      const hw = c.measureText(head).width
      c.font = font(fs)
      const w = Math.round(Math.max(hw, ...body.map(t => c.measureText(t).width)) + 20), h = Math.round((body.length + 1) * lh + 10)
      const ax = a.x, ay = a.y - (here.length > 1 ? 2 * (bf + 3) + 8 : ch) - 9
      const x = Math.max(4, Math.min(Math.min(W, noteLeft(c, k)) - w - 6, Math.round(ax - 18))); const y = Math.round(ay - h - 6)
      c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x + 2, y + 3, w, h, 7); c.fill()
      c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 7); c.fill()
      c.beginPath(); c.moveTo(ax - 5, y + h - 1); c.lineTo(ax, y + h + 6); c.lineTo(ax + 5, y + h - 1); c.fill()
      c.fillStyle = colorOf(s); c.fillRect(x, y + 5, 3, h - 10)
      c.font = font(fs - 2, 700); c.fillStyle = '#6e5038'; c.fillText(fitText(head, w - 20, font(fs - 2, 700)), x + 11, y + 5 + lh / 2)
      c.font = font(fs); c.fillStyle = '#1b1c26'
      body.forEach((t, n) => c.fillText(t, x + 11, y + 5 + (n + 1.5) * lh))
      boxes.push({ s, x, y, w, h })
    }
    if (close && over > 0) {
      const tail = tower.worldToScreen(FRONT - (line.length - 1) * GAP - 16, f.y - 8)
      c.font = font(Math.max(10, bf), 700); c.textAlign = 'right'; c.fillStyle = '#5a3a26'; c.fillText(`+${over}`, tail.x, tail.y); c.textAlign = 'left'
    }
    c.restore()
  })

  // ---------- hover / click ----------
  function hit(person, m) {
    if (person && sent.has(person.id)) { const s = line.find(q => q.id === person.id); if (s) return s }
    for (let i = boxes.length - 1; i >= 0; i--) { const b = boxes[i]; if (m.sx >= b.x && m.sx <= b.x + b.w && m.sy >= b.y && m.sy <= b.y + b.h) return b.s }
    return null
  }
  tower.on('hover', (w, person, m) => {
    const s = hit(person, m); if (!s) return null
    const i = line.indexOf(s), att = s.state === 'attention'
    return `<div class="t">${esc(s.title)}</div><div class="m">${i === 0 ? 'next in line' : `#${i + 1} in line`} · waiting ${mins(Date.now() - sinceOf(s))}${att ? ' · the phone is ringing' : ''}</div>`
      + `<div><i class="s" style="background:${colorOf(s)}"></i>${esc(says(s))}</div><div class="m">${s.running ? '↗ click to open in Orca' : 'no longer running'}</div>`
  })
  tower.on('click', (w, person, m) => { const s = hit(person, m); if (!s) return false; tower.focusSession(s); return true })

  // ---------- ?demo=waitingline ----------
  if (!demo) return
  const SAYS = [
    ['Once the extension in Edge is signed in with this session\'s account, should I rerun the connection test?', 'reply'],
    ['When 1920 is applied, tell me and I\'ll check that the apply shows the bucket and the replaced task definition.', 'reply'],
    null,
    ['Which screen should the app open first after sign-in: the dashboard or the welcome tour?', 'question'],
    ['Draft PR #1912 is up. Should I run a code review before you look?', 'reply'],
    ['All suites are green from inside api-server. Should I run /verify-api?', 'reply'],
  ]
  const NAMES = ['DESIGN', 'ID SERVER', 'WEB CI', 'ONBOARDING', 'BILLING', 'LEDGER']
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => tower.flyTo('ceo', 3), 800) }
    for (let i = data.sessions.length; i < SAYS.length; i++) data.sessions.push({ id: `00000000-0000-4000-8000-0000000000${10 + i}`, title: NAMES[i], cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'thinking', tool: null, detail: null, lastActivity: now, agents: [], ext: {} })
    const cycle = Math.floor((now - t0) / 60000), t = (now - t0) % 60000
    data.sessions.slice(0, SAYS.length).forEach((s, i) => {
      const order = (i - cycle + SAYS.length * 9) % SAYS.length, since = t0 + cycle * 60000 - (SAYS.length - order) * 170000
      s.running = true; s.agents = []; delete s.attention
      if (order === 0 && t > 45000) { s.state = 'thinking'; return }
      s.lastActivity = since
      if (!SAYS[i]) { s.state = 'attention'; s.attention = { kind: 'permission', label: 'allow Bash?', detail: 'pnpm --filter web test -- --run', since }; return }
      s.state = SAYS[i][1] === 'question' ? 'attention' : 'waiting'
      if (s.state === 'attention') s.attention = { kind: 'question', label: 'question for you', since }
      s.ext = { ...s.ext, 'waiting-line': { text: SAYS[i][0], kind: SAYS[i][1] } }
    })
  })
}
