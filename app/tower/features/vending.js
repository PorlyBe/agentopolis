// vending: the café's vending machine. Normally lit and stocked; when a session or agent is stalled on Anthropic's side
// (snapshot.vending: overloaded, a 5xx, a usage limit) it goes OUT OF ORDER with a flickering sign saying why, and the
// stalled characters queue in front of it tapping their feet. Office-wide when several sessions hit it within 5 minutes.
// Hover the machine for who is stuck, click to open the first. ?demo=vending cycles overloaded → usage limit → fixed.
import { IX } from '../building.js'
import { R } from '../draw.js'
import { jihanki } from './japan-art.js'

const VX = IX + 155, VW = 20, VH = 46, FRONT = VX + 10, GAP = 22, CAP = 6, PLAN_MS = 1000
const SNACKS = ['#e0503a', '#f2c14e', '#5aa860', '#3a7ab8', '#c86ad8', '#f08a3a', '#e8e4d8', '#d84a6a', '#5fd1c8']

const hhmm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` }
function untilOf(v) {
  if (v.resetsAt) {
    const d = new Date(v.resetsAt), today = new Date().toDateString() === d.toDateString()
    return today ? hhmm(v.resetsAt) : `${d.toLocaleDateString('en', { weekday: 'short' })} ${hhmm(v.resetsAt)}`
  }
  return v.text?.match(/resets ([^·(]+?)\s*(\(|·|$)/)?.[1] || null
}
function reason(v) {
  if (v.kind === 'overloaded') return 'overloaded'
  if (v.kind === 'server') return 'API server error'
  const u = untilOf(v)
  const what = /spend limit/i.test(v.text || '') ? 'spend limit' : v.limit === 'seven_day' || /weekly/i.test(v.text || '') ? 'weekly limit' : 'usage limit'
  return u ? `${what} until ${u}` : what
}

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('vending')
  const sent = new Map()        // person id -> x
  let v = null, line = [], planAt = 0

  const live = () => { const s = tower.snapshot?.vending; return s?.hits?.length ? s : null }
  const titleOf = id => tower.snapshot?.sessions.find(s => s.id === id)?.title || id.slice(0, 8)

  function plan() {
    v = live()
    const want = []
    if (v && tower.floor('cafe')) for (const h of v.hits) {
      const id = h.agent || h.session, p = tower.person(id)
      if (!p || p.leaving || want.includes(id) || p.activity?.startsWith('meeting:') || (p.steered && !sent.has(id))) continue
      want.push(id)
    }
    line = want.slice(0, CAP)
    for (const id of [...sent.keys()]) if (!line.includes(id)) { tower.release(id); sent.delete(id) }
    // the line runs right from the machine, stepping past the café's break spots so queuers never stand on a player
    const taken = tower.spots.filter(s => s.floor === 'cafe').map(s => s.x), xs = []
    for (let x = FRONT; xs.length < line.length; x += GAP) { if (xs.length) while (taken.some(t => Math.abs(t - x) < 7)) x++; xs.push(x) }
    line.forEach((id, i) => {
      const x = xs[i]; if (sent.get(id) === x) return
      if (tower.sendTo(id, 'cafe', x, { face: i ? 'left' : 'up', pose: 'stand', activity: 'vending' })) sent.set(id, x)
    })
  }
  tower.on('sync', () => { planAt = performance.now(); plan() })
  tower.on('step', (dt, now) => { if (now - planAt > PLAN_MS && api.live !== false) { planAt = now; plan() } })

  const flick = now => { const t = now / 1000; return Math.sin(t * 13) + Math.sin(t * 31.7) * 0.8 + Math.sin(t * 2.3) * 1.2 > -0.9 }

  function machine(c, y, now) {
    const out = !!v, x = VX, top = y - VH
    if (api.theme?.skin === 'japan') {   // the Japan skin: a drinks machine, rows of cans and bottles behind lit glass
      jihanki(c, x, y, VW, VH, 'red', { out, seed: 7 })
      if (out) {
        R(c, flick(now) ? '#ff5a4a' : '#5a2a2a', x + 2, top + 2, VW - 4, 2)
        R(c, '#f4efe0', x + 4, top + 12, 12, 9); R(c, '#d84a3a', x + 5, top + 14, 10, 1); R(c, '#d84a3a', x + 5, top + 16, 7, 1); R(c, '#d84a3a', x + 5, top + 18, 8, 1)
        R(c, 'rgba(240,230,180,.8)', x + 3, top + 11, 3, 2); R(c, 'rgba(240,230,180,.8)', x + 14, top + 11, 3, 2)
      }
      return
    }
    R(c, 'rgba(0,0,0,.22)', x + 2, y - 1, VW, 1)
    R(c, '#243048', x, top, VW, VH); R(c, '#34446a', x + 1, top + 1, VW - 2, VH - 2)
    const lit = out ? flick(now) : true
    R(c, out ? (lit ? '#ff5a4a' : '#5a2a2a') : '#5ad0ff', x + 2, top + 2, VW - 4, 4)
    R(c, out ? (lit ? '#ffd0c8' : '#7a3a3a') : '#e8faff', x + 4, top + 3, 8, 1)
    // the glass and its spirals
    R(c, '#1a2232', x + 2, top + 8, 12, 25)
    R(c, out ? '#2a3446' : '#bfe6ff', x + 3, top + 9, 10, 23)
    for (let r = 0; r < 4; r++) {
      const ry = top + 11 + r * 6
      for (let k = 0; k < 3; k++) {
        const gone = out && (r * 3 + k) % 4 === 1
        if (!gone) R(c, out ? 'rgba(120,120,140,.7)' : SNACKS[(r * 3 + k) % SNACKS.length], x + 4 + k * 3, ry, 2, 3)
      }
      R(c, out ? '#4a5468' : '#8ab0c8', x + 3, ry + 3, 10, 1)
    }
    if (out) {   // the taped paper sign
      R(c, '#f4efe0', x + 3, top + 15, 10, 8); R(c, '#d84a3a', x + 4, top + 17, 8, 1); R(c, '#d84a3a', x + 4, top + 19, 6, 1); R(c, '#d84a3a', x + 4, top + 21, 7, 1)
      R(c, 'rgba(240,230,180,.8)', x + 2, top + 14, 3, 2); R(c, 'rgba(240,230,180,.8)', x + 11, top + 14, 3, 2)
    } else R(c, 'rgba(255,255,255,.35)', x + 4, top + 10, 1, 8)
    // the keypad, the display and the coin slot
    R(c, '#1a2232', x + 15, top + 8, 4, 4)
    R(c, out ? (Math.floor(now / 500) % 2 ? '#ff4a3a' : '#5a1a1a') : '#5fd17a', x + 16, top + 9, 2, 2)
    for (let r = 0; r < 4; r++) for (let k = 0; k < 2; k++) R(c, '#9aa3ad', x + 15 + k * 2, top + 14 + r * 2, 1, 1)
    R(c, '#c9a25a', x + 16, top + 24, 2, 3); R(c, '#111', x + 16, top + 25, 2, 1)
    R(c, '#111622', x + 2, top + 35, 12, 6); R(c, '#2a3446', x + 3, top + 36, 10, 2)
    R(c, '#1a2232', x + 1, y - 3, 3, 3); R(c, '#1a2232', x + VW - 4, y - 3, 3, 3)
  }

  tower.on('items', (out, now) => {
    const f = tower.floor('cafe'); if (!f || f.open != null && f.y - f.top < VH) return
    out.push({ z: Z.FLOOR + 6, draw: c => machine(c, f.y, now) })
    if (!v) return
    out.push({ z: Z.WALK + 4, draw: c => {   // tapping feet
      for (const id of line) {
        const p = tower.person(id); if (!p || p.walking || p.floor !== 'cafe' || p.activity !== 'vending') continue
        const up = Math.floor((now + api.hash(id) % 400) / 220) % 2
        const fx = p.face === 'left' ? p.x - 4 : p.face === 'up' ? p.x + 1 : p.x + 2
        R(c, '#2a2226', fx, p.y - 2 - up, 3, 2)
        if (up) { R(c, 'rgba(60,50,40,.55)', fx - 2, p.y - 5, 1, 1); R(c, 'rgba(60,50,40,.55)', fx + 4, p.y - 5, 1, 1) }
      }
    } })
  })
  tower.on('glow', (c, now, n) => {
    const f = tower.floor('cafe'); if (!f || n <= 0) return
    const x = VX + VW / 2, y = f.y - VH / 2
    const col = v ? (flick(now) ? '255,80,60' : null) : '150,215,255'
    if (!col) return
    const g = c.createRadialGradient(x, y, 0, x, y, 30); g.addColorStop(0, `rgba(${col},${(v ? 0.55 : 0.45) * n})`); g.addColorStop(1, `rgba(${col},0)`)
    c.fillStyle = g; c.fillRect(x - 30, y - 30, 60, 60)
  })

  // the flickering OUT OF ORDER sign and why, over the machine
  tower.on('overlay', (c, now) => {
    const f = tower.floor('cafe'); if (!v || !f) return
    const k = tower.zoom, a = tower.worldToScreen(VX + VW / 2, f.y - VH - 4), H = tower.canvas.clientHeight
    if (a.y < -40 || a.y > H + 40 || k < 0.9) return
    const fs = Math.max(8, Math.min(14, 3.6 * k)), on = flick(now)
    c.save(); c.textAlign = 'center'; c.textBaseline = 'middle'
    const head = 'OUT OF ORDER', why = reason(v) + (v.office ? ' · office-wide' : '')
    c.font = font(fs, 700); const hw = c.measureText(head).width
    c.font = font(fs * 0.85); const ww = c.measureText(why).width
    const w = Math.max(hw, ww) + 14, h = fs * 2.2 + 10, x = Math.round(a.x - w / 2), y = Math.round(a.y - h - 4)
    c.fillStyle = 'rgba(20,12,14,.9)'; c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill()
    c.strokeStyle = on ? '#ff5a4a' : '#5a2a2a'; c.lineWidth = 1.5; c.stroke()
    if (on) { c.shadowColor = '#ff3a2a'; c.shadowBlur = 8 }
    c.font = font(fs, 700); c.fillStyle = on ? '#ff6a5a' : '#6a3030'; c.fillText(head, a.x, y + 5 + fs / 2)
    c.shadowBlur = 0
    c.font = font(fs * 0.85); c.fillStyle = '#f4dcb0'; c.fillText(fitText(why, w - 8, font(fs * 0.85)), a.x, y + h - 5 - fs * 0.45)
    c.restore()
  })

  const onMachine = w => { const f = tower.floor('cafe'); return f && w.x >= VX - 2 && w.x <= VX + VW + 2 && w.y >= f.y - VH - 2 && w.y <= f.y }
  tower.on('hover', (w, person) => {
    if (person && sent.has(person.id) && v) {
      const h = v.hits.find(h => (h.agent || h.session) === person.id)
      return `<div class="t">${esc(titleOf(person.session || person.id))}${h?.agent ? ' · agent' : ''}</div><div class="m">stuck at the vending machine</div><div>${esc(h?.text || reason(v))}</div>`
    }
    if (!onMachine(w)) return null
    if (!v) return `<div class="t">Vending machine</div><div class="m">working — no API trouble</div>`
    const rows = v.hits.slice(0, 8).map(h => `<div><i class="s" style="background:#ef5a5a"></i>${esc(titleOf(h.session))}${h.agent ? ' · agent' : ''} — ${esc(reason(h))}</div>`).join('')
    return `<div class="t">OUT OF ORDER · ${esc(reason(v))}</div><div class="m">${v.office ? 'office-wide: several sessions within 5 minutes' : 'on Anthropic\'s side, not your agent'}</div>${rows}<div class="m">${esc(v.text || '')}</div><div class="m">↗ click to open the first</div>`
  })
  tower.on('click', w => {
    if (!v || !onMachine(w)) return false
    const s = tower.snapshot?.sessions.find(s => s.id === v.hits[0].session); if (s) tower.focusSession(s)
    return true
  })

  // ---------- ?demo=vending ----------
  if (!demo) return
  let t0 = 0
  const NAMES = ['DESIGN', 'RECIPE BOX', 'PIXEL QUEST']
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => tower.flyTo('cafe', 3), 800) }
    for (let i = data.sessions.length; i < 3; i++) data.sessions.push({ id: `00000000-0000-4000-8000-0000000000${20 + i}`, title: NAMES[i], cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'thinking', tool: null, detail: null, lastActivity: now, agents: [], ext: {} })
    const t = (now - t0) % 75000
    if (t > 60000) { delete data.vending; return }
    const reset = new Date(); reset.setHours(18, 0, 0, 0); if (reset < now) reset.setDate(reset.getDate() + 1)
    const over = t < 30000
    const hit = s => over ? { session: s.id, agent: null, kind: 'overloaded', text: 'API Error: 529 Overloaded', at: now - 60000, resetsAt: null }
      : { session: s.id, agent: null, kind: 'limit', text: "You've hit your session limit · resets 6pm", at: now - 60000, resetsAt: reset.getTime(), limit: 'five_hour' }
    const hits = data.sessions.slice(0, 3).map(hit)
    data.vending = { ...hits[0], office: hits.length >= 2, hits }
  })
}
