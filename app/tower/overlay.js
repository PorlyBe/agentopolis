// The tower's screen-space text, scaled with the zoom: floor plaques, workflow bunting, the "+N" overflow count, the
// neighbours' PR plates and name labels, a bubble over each session, a status diamond over each subagent, and the
// CEO's desk note. font / fitText / bubble are the helpers features get through api.tower.
import { IX, BANNER, plaqueBox } from './building.js'
import { squeezed, runOf } from './render.js'

export const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const INK = { done: '#2f7a41', active: '#b0660f', pending: '#8a7a66', stopped: '#a8322a' }
const MARK = { done: '✓', active: '●', pending: '○', stopped: '✕' }
export const font = (px, w = '') => `${w ? w + ' ' : ''}${Math.round(px)}px ${MONO}`

export function createOverlay(st, camera, ceo) {
  const { api, people, city, hooks, report, vc } = st
  const { cam, vw, vh, toScreen, fitZoom } = camera
  function fitText(t, max, f) {
    vc.font = f; t = String(t ?? '')
    if (vc.measureText(t).width <= max) return t
    while (t.length > 1 && vc.measureText(t + '…').width > max) t = t.slice(0, -1)
    return t + '…'
  }
  function overlay(now) {
    const k = cam.zoom, c = vc
    c.textBaseline = 'middle'
    for (const f of st.floors) {
      if (f.kind === 'roof' || squeezed(f)) continue
      const b = plaqueBox(f), [sx, sy] = toScreen(b.x, b.y), w = b.w * k, h = b.h * k
      if (!(sx > vw() || sx + w < 0 || sy > vh() || sy + h < 0) && h >= 7) plaqueText(f, sx, sy, w, h, k)
      if (f.kind === 'ceo') ceoText(now, k)
      if (f.kind === 'session') {
        const run = f.open == null && runOf(f)
        if (run) bannerText(f, run, k)
        const over = people.overflow.get(f.id)
        if (over) { const [ox, oy] = toScreen(IX + 462, f.y - 30); c.font = font(Math.max(9, 5 * k), 700); c.fillStyle = '#5a4a3c'; c.fillText(`+${over}`, ox, oy) }
      }
    }
    const pf = Math.min(11, 5.2 * k)
    if (pf >= 6) for (const p of city.plates()) {   // the PR numbers on the neighbours' floor plates
      const [x, y] = toScreen(p.x + p.w / 2, p.y + p.h / 2)
      if (x < -40 || x > vw() + 40 || y < -20 || y > vh() + 20) continue
      c.font = font(pf, 700); c.textAlign = 'center'; c.fillStyle = p.fire ? '#7a1a10' : p.draft ? '#4a4030' : '#3a2410'
      c.fillText(fitText(p.text, p.w * k - 2, font(pf, 700)), x, y + 0.5); c.textAlign = 'left'
      if (p.more) { c.font = font(pf * 0.9, 700); c.fillStyle = '#f4e6c0'; c.fillText(`+${p.more}`, x + p.w * k / 2 + 3, y - p.h * k) }
    }
    for (const l of city.labels()) {
      const [x, y] = toScreen(l.x, l.y), w = l.w * k
      if (x + w < 0 || x - w > vw() || w < 36) continue   // too small to read: the hover tip still names them
      const fs = Math.max(7, Math.min(5.4 * k, 8 * k)), f = font(fs, 700)
      c.font = f
      const bw = l.badge ? c.measureText(l.badge).width + fs * 0.6 : 0, name = fitText(l.text, w - 4 - bw, f), nw = c.measureText(name).width
      const x0 = x - (nw + bw) / 2
      c.fillStyle = '#2b1d12'; c.fillText(name, x0, y + 0.5)
      if (l.badge) { c.fillStyle = '#9a4a1a'; c.fillText(l.badge, x0 + nw + fs * 0.6, y + 0.5) }
    }
    // people: a bubble over each session, a status diamond over each subagent
    const bf = Math.max(k < fitZoom() ? 8 : 10, Math.min(16, 5.6 * k))   // a little smaller once zoomed out to the street
    for (const a of people.actors.values()) {
      if (a.delay > 0 || !a.data || a.fade != null) continue
      const y = people.yOf(a), [x, top] = toScreen(a.x, y - 31 + people.sitDy(a))
      if (x < -200 || x > vw() + 200 || top < -60 || top > vh() + 60) continue
      if (a.kind === 'session') bubble(x, top - 3, sessionBubble(a.data, now), api.COLORS[a.data.state] || api.COLORS.idle, bf)
      else {
        const state = a.leaving ? 'done' : a.data.state
        if (state === 'idle') { if (!a.brk) zzz(x, top, now, k); continue }
        const r = Math.max(3.5, 2.4 * k)
        c.fillStyle = 'rgba(0,0,0,.45)'; diamond(x, top - r + 1, r + 0.8)
        c.fillStyle = api.COLORS[state] || api.COLORS.idle; diamond(x, top - r, r)
        if (state === 'done') { c.font = font(Math.max(10, 4 * k)); c.fillStyle = api.COLORS.done; c.fillText('✓', x + r + 1, top - r) }
      }
    }
  }
  let noteCard = null
  function ceoText(now, k) {
    const c = vc, slots = st.slots, d = slots.desk, [px, py] = toScreen(slots.seat - 20, d.y + 7.5), pw = 40 * k
    noteCard = null
    if (pw > 34) { c.save(); c.beginPath(); c.rect(px, py - 3 * k, pw, 6 * k); c.clip(); c.font = font(Math.min(4.6 * k, 14), 700); c.fillStyle = '#3b2617'; c.textAlign = 'center'; c.fillText(`${api.owner.toUpperCase()} · CEO`, px + pw / 2, py + 0.5); c.restore() }
    const list = ceo.needsPaul(); if (!list.length) return
    // the desk note, readable: who needs the user, newest first
    const n = slots.note, [nx, ny] = toScreen(n.x + n.w / 2, n.y), fs = Math.max(10, Math.min(13, 4 * k))
    c.font = font(fs)
    const lines = list.slice(0, 4).map(s => '✋ ' + fitText(s.title, 190, font(fs))), more = list.length > 4 ? `+${list.length - 4} more` : null
    const w = Math.max(...lines.map(t => c.measureText(t).width)) + 16, h = (lines.length + (more ? 1 : 0)) * (fs + 4) + 22
    const x = Math.min(vw() - w - 4, nx - w / 2), y = ny - h - 8
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + 3, y + 3, w, h)
    c.fillStyle = '#fff4c0'; c.fillRect(x, y, w, h); c.fillStyle = '#d8383a'; c.fillRect(x, y, w, 3)
    c.fillStyle = '#7a1f22'; c.font = font(fs - 1, 700); c.fillText(list.length === 1 ? 'NEEDS YOU' : `${list.length} NEED YOU`, x + 8, y + 12)
    c.font = font(fs); c.fillStyle = '#2b1d12'
    lines.forEach((t, i) => c.fillText(t, x + 8, y + 22 + i * (fs + 4) + fs / 2))
    if (more) { c.fillStyle = '#6e5038'; c.fillText(more, x + 8, y + 22 + lines.length * (fs + 4) + fs / 2) }
    noteCard = { x, y, w, h }
  }
  // letter-spaced small caps: cream on bronze for a session (its branch lighter after a ·), dark on brass for the rest
  function plaqueText(f, sx, sy, w, h, k) {
    const c = vc, fs = Math.max(7, Math.min(13, h * 0.46)), ym = sy + h / 2 + 0.5, sp = Math.max(0.5, fs * 0.1)
    c.save(); c.beginPath(); c.rect(sx + 2 * k, sy + 2 * k, w - 4 * k, h - 4 * k); c.clip()
    c.letterSpacing = sp + 'px'
    if (f.kind === 'session') {
      const s = f.session, tx = sx + 8 * k
      let right = sx + w - 5 * k
      c.letterSpacing = '0px'
      for (const fn of hooks.plaque) { try { right -= fn(c, f, { x: sx, y: sy, w, h, fs, k, right }) || 0 } catch (e) { report('plaque', e) } }
      c.letterSpacing = sp + 'px'
      const max = right - tx - 2, title = String(s?.title || '').toUpperCase(), br = s?.worktree || s?.branch || ''
      const name = fitText(title, max, font(fs, 700)); c.font = font(fs, 700)
      c.fillStyle = '#f1e4c4'; c.fillText(name, tx, ym)
      const nw = c.measureText(name).width
      if (br && name === title && max - nw > fs * 6) { c.font = font(fs * 0.92); c.fillStyle = '#b39b74'; c.fillText(fitText('· ' + br, max - nw - fs * 0.5, font(fs * 0.92)), tx + nw + fs * 0.5, ym) }
    } else {
      c.font = font(fs, 700); c.fillStyle = '#3a2814'; c.textAlign = 'center'
      c.fillText(fitText(f.label, w - 16 * k, font(fs, 700)), sx + w / 2, ym); c.textAlign = 'left'
    }
    c.restore(); c.letterSpacing = '0px'
  }
  function bannerText(f, run, k) {
    const [x0, y0] = toScreen(BANNER.x0 + 4, f.top + 6), [x1] = toScreen(BANNER.x1 - 4, 0), h = 9 * k, w = x1 - x0
    if (h < 7) return
    const c = vc, fs = Math.max(7, Math.min(h * 0.92, 11 * k / 1.5))
    c.save(); c.beginPath(); c.rect(x0, y0 - 1, w, h + 2); c.clip()
    const ym = y0 + h / 2 + 0.5
    const name = fitText(run.name, w * 0.45, font(fs, 700))
    c.fillStyle = '#2b1d12'; c.fillText(name, x0, ym)
    let x = x0 + c.measureText(name).width + fs
    c.font = font(fs * 0.92)
    for (const ph of run.phases) {
      const t = `${MARK[ph.state] || '○'} ${ph.title}${ph.total ? ` ${ph.done}/${ph.total}` : ''}`
      if (x + c.measureText(t).width > x0 + w) { c.fillStyle = INK.pending; c.fillText('…', x, ym); break }
      c.fillStyle = INK[ph.state] || INK.pending; c.fillText(t, x, ym); x += c.measureText(t).width + fs * 0.9
    }
    c.restore()
  }
  function sessionBubble(s, now) {
    if (s.state === 'tool') return api.toolLabel(s.tool)
    if (s.state === 'thinking') return 'thinking' + '.'.repeat(1 + Math.floor(now / 400) % 3)
    if (s.state === 'waiting') return '💬 your turn'
    if (s.state === 'delegating') return `👥 ${s.agents.filter(g => g.state !== 'done' && g.state !== 'idle').length} at work`
    if (s.state === 'attention') return `✋ ${s.attention?.label || 'needs you'}`
    if (s.state === 'building') {
      const j = s.background?.[0]; if (!j) return '⚙ building'
      const ms = Date.now() - j.since, m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60
      return `⚙ ${j.label.slice(0, 22)} · ${m}m ${String(sec).padStart(2, '0')}s${s.background.length > 1 ? ` +${s.background.length - 1}` : ''}`
    }
    return 'z z z'
  }
  function bubble(ax, ay, text, color, fs) {
    const c = vc
    c.font = font(fs)
    const w = c.measureText(text).width + 16, h = fs + 9, x = ax - w / 2, y = ay - h - 5
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x + 2, y + 3, w, h, 6); c.fill()
    c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill()
    c.beginPath(); c.moveTo(ax - 4, y + h - 1); c.lineTo(ax, y + h + 5); c.lineTo(ax + 4, y + h - 1); c.fill()
    c.fillStyle = color; c.fillRect(x, y + 4, 3, h - 8)
    c.fillStyle = '#1b1c26'; c.textBaseline = 'middle'; c.fillText(text, x + 9, y + h / 2 + 0.5)
  }
  function diamond(cx, cy, r) { const c = vc; c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.fill() }
  function zzz(cx, top, now, k) {
    const t = (now / 1100) % 1
    vc.font = font(Math.max(9, 4 * k)); vc.fillStyle = `rgba(60,58,80,${1 - t})`
    vc.fillText('z', cx + k * 2 + t * 4 * k, top - t * 6 * k)
  }
  return { overlay, fitText, bubble, get noteCard() { return noteCard } }
}
