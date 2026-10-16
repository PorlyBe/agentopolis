// hall-of-records: a glass trophy case in the meeting room, right of the table under the screen, with a plaque per all-time
// best (snap.records, server/features/hall-of-records.mjs). A record set today gets a spotlight and a toast. Hover a plaque for
// its date and what set it; click the case for the full list. ?demo=hallofrecords.
import { IX } from '../building.js'
import { R } from '../draw.js'

const CASE = { dx: IX + 332, w: 115, h: 32 }, CW = 27, CH = 13
const SHORT = { 'longest-session': 'LONGEST RUN', 'tools-day': 'TOOLS/DAY', 'agents-once': 'AGENTS', 'biggest-pr': 'BIGGEST PR', 'priciest-day': 'PRICEY DAY', 'commits-day': 'COMMITS/DAY', 'green-streak': 'GREEN RUN' }
const ICON = { 'longest-session': '⏱', 'tools-day': '🛠', 'agents-once': '👥', 'biggest-pr': '📜', 'priciest-day': '💰', 'commits-day': '📌', 'green-streak': '✅' }
const dur = ms => { const m = Math.round(ms / 60000), h = Math.floor(m / 60), d = Math.floor(h / 24); return d ? `${d}d ${h % 24}h` : h ? `${h}h ${m % 60}m` : `${m}m` }
const NUM = new Intl.NumberFormat('en-US')   // toLocaleString builds a formatter per call, and fmt runs every frame
const fmt = r => r.value == null ? '—' : r.unit === 'ms' ? dur(r.value) : r.unit === 'usd' ? '$' + r.value.toFixed(2) : r.unit === 'lines' ? NUM.format(r.value) + ' ln' : NUM.format(r.value)
const date = t => { const d = new Date(t), y = d.getFullYear() !== new Date().getFullYear(); return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', ...(y ? { year: 'numeric' } : {}) }) }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('hallofrecords')
  let list = [], panel = null, demoT0 = 0
  const lit = new Map(), shown = new Set()   // key -> when its spotlight came on; toasts already raised this page

  if (demo) tower.on('snapshot', snap => {
    const now = Date.now(), D = 86400_000
    if (!demoT0) { demoT0 = now; if (!params.get('towerzoom')) setTimeout(() => { const b = box(); b && tower.flyTo({ x: b.x + b.w / 2, y: b.y + 4 }, 6) }, 600) }
    const t = snap.sessions || [], ti = i => t[i % Math.max(1, t.length)]?.title || 'PHOTO GALLERY'
    const beat = now - demoT0 > 4000
    const rec = (key, label, unit, value, ago, what, prev) => ({ key, label, unit, value, at: now - ago, what, prev, fresh: !!prev && ago < D })
    snap.records = { day: new Date(now).toISOString().slice(0, 10), streak: 9, list: [
      rec('longest-session', 'Longest-running session', 'ms', 31 * 3600_000 + 12 * 60_000, 9 * D, ti(1), null),
      beat ? rec('tools-day', 'Most tool calls in a day', 'n', 2214, 60_000, `busiest: ${ti(0)}`, { value: 1987, at: now - 12 * D, what: `busiest: ${ti(2)}` })
        : rec('tools-day', 'Most tool calls in a day', 'n', 1987, 12 * D, `busiest: ${ti(2)}`, null),
      rec('agents-once', 'Most subagents at once', 'n', 14, 3 * D, `9 for ${ti(1)}`, null),
      rec('biggest-pr', 'Biggest merged PR', 'lines', 2100, 6 * D, '#424 game: level editor for 3.2 (+1240 −860)', null),
      rec('priciest-day', 'Priciest day', 'usd', 182.4, 20 * D, `top desk: ${ti(1)}`, null),
      rec('commits-day', 'Most commits in a day', 'n', 23, 2 * D, `most in ${ti(0)}`, null),
      rec('green-streak', 'Longest green CI streak', 'n', 17, 15 * D, 'tests on trail-map', null),
    ] }
  })

  tower.on('sync', snap => {
    list = snap.records?.list || []
    for (const r of list) {
      if (!r.fresh) { lit.delete(r.key); continue }
      if (!lit.has(r.key)) lit.set(r.key, performance.now())
      const tag = `${r.key}@${snap.records.day}`
      if (shown.has(tag)) continue
      shown.add(tag)
      let told = {}; try { told = JSON.parse(localStorage.getItem('hall-of-records') || '{}') || {} } catch {}
      if (!demo && told[r.key] === tag) continue
      api.toast(`🏆 New record: ${r.label} — ${fmt(r)}${r.prev ? ` (was ${fmt({ ...r, value: r.prev.value })})` : ''}`, 5000)
      told[r.key] = tag; try { localStorage.setItem('hall-of-records', JSON.stringify(told)) } catch {}
    }
  })

  function box() { const f = tower.floor('meeting'); return f && { x: CASE.dx, y: f.y - CASE.h - 1, w: CASE.w, h: CASE.h, f } }
  const cell = (b, i) => ({ x: b.x + 2 + (i % 4) * (CW + 1), y: b.y + 2 + Math.floor(i / 4) * (CH + 1), w: CW, h: CH })
  const inR = (w, r, pad = 0) => w.x >= r.x - pad && w.x < r.x + r.w + pad && w.y >= r.y - pad && w.y < r.y + r.h + pad

  function trophy(c, key, x, y, gold, now) {
    const G = gold ? '#f4c64f' : '#b8a878', D = gold ? '#c89a2a' : '#8a7c58', W = '#f4f0e6'
    R(c, '#4a3a2c', x, y + 7, 7, 2)                                // plinth
    if (key === 'longest-session') { R(c, D, x + 1, y + 1, 5, 6); R(c, W, x + 2, y + 2, 3, 4); R(c, '#333', x + 3, y + 3, 1, 2); R(c, D, x + 3, y, 1, 1) }
    else if (key === 'tools-day') { R(c, '#8a8f9a', x + 3, y + 1, 1, 6); R(c, '#c8ccd4', x + 1, y, 5, 2); R(c, G, x + 2, y + 5, 3, 2) }
    else if (key === 'agents-once') { for (let i = 0; i < 3; i++) { R(c, ['#63b3f0', '#e58ad0', '#5fd1c8'][i], x + i * 2, y + 2 + (i % 2), 2, 2); R(c, '#4a5060', x + i * 2, y + 4 + (i % 2), 2, 3 - (i % 2)) } }
    else if (key === 'biggest-pr') { R(c, W, x + 1, y + 1, 5, 6); R(c, '#5fd17a', x + 2, y + 2, 3, 1); R(c, '#ef5a5a', x + 2, y + 4, 2, 1); R(c, D, x, y, 7, 1); R(c, D, x, y + 6, 7, 1) }
    else if (key === 'priciest-day') { for (let i = 0; i < 3; i++) R(c, i % 2 ? D : G, x + 1, y + 6 - i * 2, 5, 2); R(c, G, x + 2, y, 3, 1) }
    else if (key === 'commits-day') { R(c, '#8a8f9a', x + 3, y, 1, 7); R(c, G, x + 1, y + 2, 5, 3); R(c, W, x + 2, y + 3, 3, 1) }
    else { R(c, '#2f7a41', x + 1, y + 1, 5, 6); R(c, '#5fd17a', x + 2, y + 4, 1, 1); R(c, '#5fd17a', x + 3, y + 5, 1, 1); R(c, '#5fd17a', x + 4, y + 2, 1, 3) }
    if (gold && Math.floor(now / 700 + x) % 5 === 0) R(c, '#fffbe0', x + 5, y, 1, 1)
  }

  tower.on('items', out => {
    const b = box(); if (!b) return
    out.push({ z: Z.WALL + 4, draw: (c, now) => {
      const f = b.f
      for (const r of list) if (lit.has(r.key)) {   // the spotlight: a can on the ceiling and a cone onto the plaque
        const q = cell(b, list.indexOf(r)), cx = q.x + q.w / 2, k = Math.min(1, (performance.now() - lit.get(r.key)) / 800)
        R(c, '#2a2c33', cx - 3, f.top, 6, 3); R(c, '#4a4d56', cx - 2, f.top + 3, 4, 2)
        c.fillStyle = `rgba(255,236,160,${0.22 * k})`; c.beginPath(); c.moveTo(cx - 2, f.top + 5); c.lineTo(cx + 2, f.top + 5); c.lineTo(q.x + q.w + 3, q.y + q.h); c.lineTo(q.x - 3, q.y + q.h); c.closePath(); c.fill()
      }
      R(c, 'rgba(0,0,0,.18)', b.x + 2, b.y + b.h, b.w, 1)
      R(c, '#3a2a1e', b.x, b.y, b.w, b.h); R(c, '#5a3f2a', b.x, b.y, b.w, 1)
      R(c, '#4a3424', b.x, b.y + b.h - 3, b.w, 3); R(c, '#2a1e16', b.x + 3, b.y + b.h - 1, 3, 1); R(c, '#2a1e16', b.x + b.w - 6, b.y + b.h - 1, 3, 1)
      for (let i = 0; i < 8; i++) {
        const q = cell(b, i), r = list[i]
        R(c, '#b9d3dc', q.x, q.y, q.w, q.h); R(c, '#cfe3ea', q.x, q.y, q.w, 2)
        R(c, 'rgba(255,255,255,.35)', q.x + q.w - 6 - (i % 3), q.y + 1, 1, q.h - 3)   // a glint on the glass
        if (i === 7) { R(c, '#7a5a2a', q.x + 3, q.y + 3, q.w - 6, q.h - 6); R(c, '#c89a3a', q.x + 4, q.y + 4, q.w - 8, q.h - 8); continue }
        if (!r) continue
        const gold = lit.has(r.key), bob = gold ? Math.round(Math.sin(now / 300) * 0.6) : 0
        if (r.value != null) trophy(c, r.key, q.x + 2, q.y + 2 + bob, gold, now); else R(c, '#4a3a2c', q.x + 2, q.y + 9, 7, 2)
        R(c, gold ? '#e8c25a' : '#a88a4a', q.x + 11, q.y + q.h - 4, q.w - 13, 3)   // the brass plaque
      }
    } })
  })

  tower.on('glow', (c, now, n) => {
    const b = box(); if (!b || n < 0.05) return
    c.fillStyle = `rgba(200,230,255,${0.12 * n})`; c.fillRect(b.x + 2, b.y + 2, b.w - 4, b.h - 6)
    for (const r of list) if (lit.has(r.key)) {
      const q = cell(b, list.indexOf(r)), g = c.createRadialGradient(q.x + q.w / 2, q.y + q.h / 2, 1, q.x + q.w / 2, q.y + q.h / 2, 24)
      g.addColorStop(0, `rgba(255,230,140,${0.55 * n})`); g.addColorStop(1, 'rgba(255,230,140,0)')
      c.fillStyle = g; c.fillRect(q.x - 24, q.y - 24, q.w + 48, q.h + 48)
    }
  })

  tower.on('overlay', v => {
    const b = box(), k = tower.zoom; if (!b || CH * k < 26) return
    const a = tower.worldToScreen(b.x, b.y)
    if (a.x > v.canvas.width || a.x + b.w * k < 0 || a.y > v.canvas.height || a.y + b.h * k < 0) return
    v.save(); v.textBaseline = 'middle'
    for (let i = 0; i < 8; i++) {
      const q = cell(b, i), p = tower.worldToScreen(q.x, q.y), r = list[i], x0 = p.x + 10.5 * k, w = (q.w - 11.5) * k
      if (i === 7) {
        v.textAlign = 'center'; v.fillStyle = '#3a2410'; const fs = Math.min(q.h * k * 0.22, 12)
        v.font = font(fs, 800); v.fillText('HALL OF', p.x + q.w * k / 2, p.y + q.h * k * 0.38); v.fillText('RECORDS', p.x + q.w * k / 2, p.y + q.h * k * 0.62)
        continue
      }
      if (!r) continue
      v.textAlign = 'left'
      const fv = Math.min(q.h * k * 0.34, 18), fl = Math.min(q.h * k * 0.17, 9)
      v.font = font(fv, 800); const tw = v.measureText(fmt(r)).width
      if (tw > w) v.font = font(Math.max(6, fv * w / tw), 800)
      v.fillStyle = r.value == null ? '#5a6a74' : '#10222c'
      v.fillText(fitText(fmt(r), w, v.font), x0, p.y + q.h * k * 0.32)
      v.font = font(fl, 800); v.fillStyle = lit.has(r.key) ? '#3a2400' : '#2a1e10'
      v.fillText(fitText(SHORT[r.key] || r.label, w, font(fl, 800)), x0, p.y + (q.h - 2.5) * k)
      if (r.at && k >= 4) { v.font = font(fl, 600); v.fillStyle = '#33505c'; v.fillText(fitText(date(r.at), w, font(fl, 600)), x0, p.y + q.h * k * 0.58) }
    }
    v.restore()
  })

  const tip = r => `<div class="t">${ICON[r.key] || '🏆'} ${esc(r.label)}${lit.has(r.key) ? ' · <span style="color:#f4c64f">new today!</span>' : ''}</div>`
    + (r.value == null ? '<div class="m">no record yet</div>' : `<div><b>${esc(fmt(r))}</b> · ${esc(date(r.at))}</div>${r.what ? `<div>${esc(r.what)}</div>` : ''}${r.prev ? `<div class="m">beat ${esc(fmt({ ...r, value: r.prev.value }))} from ${esc(date(r.prev.at))}</div>` : ''}`)
  tower.on('hover', (w, person) => {
    if (person) return null
    const b = box(); if (!b || !inR(w, b, 1)) return null
    const i = [0, 1, 2, 3, 4, 5, 6].find(n => inR(w, cell(b, n))), r = i != null ? list[i] : null
    if (r) return tip(r) + '<div class="m">click for the hall</div>'
    return `<div class="t">🏆 Hall of records</div><div>${list.filter(r => r.value != null).length} all-time bests${list.some(r => lit.has(r.key)) ? ' · a new one today!' : ''}</div><div class="m">click for the hall</div>`
  })
  tower.on('click', (w, person) => {
    const b = box(); if (person || !b || !inR(w, b, 1)) return false
    open(); return true
  })

  function open() {
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'card'; panel.id = 'hallofrecords'
      panel.style.cssText = 'position:absolute;top:12px;left:12px;z-index:8;width:min(520px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:12px 14px;font-size:var(--fs)'
      panel.addEventListener('click', e => { if (e.target.closest('[data-close]')) panel.style.display = 'none' })
      document.getElementById('wrap').appendChild(panel)
    }
    panel.style.display = 'block'; fill()
  }
  function fill() {
    const row = r => `<div style="display:flex;gap:10px;padding:7px 0;border-top:1px solid var(--card-line)${lit.has(r.key) ? ';background:linear-gradient(90deg,rgba(244,198,79,.18),transparent)' : ''}">
      <div style="font-size:20px;width:26px;text-align:center">${ICON[r.key] || '🏆'}</div>
      <div style="flex:1;min-width:0"><div style="color:var(--muted)">${esc(r.label)}${lit.has(r.key) ? ' · <b style="color:#f4c64f">NEW TODAY</b>' : ''}</div>
      <div><b style="font-size:16px">${esc(fmt(r))}</b>${r.at ? ` <span style="color:var(--muted)">· ${esc(date(r.at))}</span>` : ''}</div>
      ${r.what ? `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(r.what)}</div>` : ''}
      ${r.prev ? `<div style="color:var(--muted)">beat ${esc(fmt({ ...r, value: r.prev.value }))} from ${esc(date(r.prev.at))}</div>` : ''}</div></div>`
    panel.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b style="flex:1">🏆 HALL OF RECORDS</b><button class="hbtn" data-close title="Close">✕</button></div>
      <div style="color:var(--muted);margin-bottom:6px">All-time bests since this tower opened.</div>
      ${list.map(row).join('') || '<div style="color:var(--muted)">no records yet</div>'}`
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && panel) panel.style.display = 'none' })
  tower.on('sync', () => { if (panel?.style.display === 'block') fill() })
}
