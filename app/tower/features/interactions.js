// interactions: the tower's ways in. Click a subagent (or shift-click a session) to follow its transcript in the side
// panel; the header chips fly to a session's floor and 👁 follows its character; double-click anyone to follow them;
// a slim tower map shows up while zoomed in; the replay refits around its bar.
// ?demo=towerpanel opens the first subagent's panel, ?demo=towerfollow follows a working subagent,
// ?demo=towerchip hovers and flies to the first chip's floor, ?demo=towermap zooms in so the map shows.
import { BW, SHAFT, GROUND, IX, IX1 } from '../building.js'

const KIND = { server: '#2a3040', post: '#8a8470', lobby: '#8f8070', cafe: '#a49a84', meeting: '#7f8a96', ceo: '#6a4a30' }

export default function init(api, tower) {
  const hue = id => api.hash(id) % 360
  const nameOf = p => p.kind === 'session' ? p.data?.title : (p.data?.description || p.data?.type)
  let shift = false, lastUp = null, prevUp = null
  addEventListener('pointerup', e => { shift = e.shiftKey; prevUp = lastUp; lastUp = { t: e.timeStamp, x: e.clientX, y: e.clientY } }, true)
  // the second click of a double-click must not ask Orca (or the panel) twice
  const second = () => !!(prevUp && lastUp.t - prevUp.t < 450 && Math.hypot(lastUp.x - prevUp.x, lastUp.y - prevUp.y) < 8)

  // ---------- the side panel: side-panel.js's own, opened from here in tower mode ----------
  const panel = document.getElementById('sidepanel')
  const openPanel = (session, id) => api.openPanel?.(session, id)
  const pt = () => api.panelTarget?.()

  tower.on('click', (w, p) => {
    if (second()) return true
    if (p?.kind === 'agent') { openPanel(p.session, p.id); return true }
    if (p?.kind === 'session' && shift) { openPanel(p.session, null); return true }
    return false
  })
  tower.on('dblclick', (w, p) => { if (!p) return false; tower.follow(p.id); return true })

  // ---------- header chips, the follow pill ----------
  const strip = document.getElementById('navchips'), pill = document.getElementById('followpill')
  let hovered = null, shownFollow = undefined
  strip?.addEventListener('click', e => {
    const chip = tower.active && e.target.closest('.navchip'); if (!chip) return
    e.stopPropagation()
    const id = chip.dataset.id
    if (e.target.closest('.eye')) tower.follow(tower.following === id ? null : id)
    else { tower.follow(null); tower.flyTo(id) }
  }, true)
  strip?.addEventListener('mouseover', e => { hovered = e.target.closest('.navchip')?.dataset.id || null })
  strip?.addEventListener('mouseleave', () => { hovered = null })
  pill?.querySelector('button').addEventListener('click', () => { if (tower.active) tower.follow(null) })
  addEventListener('keydown', e => {
    if (e.key !== 'Escape') return
    if (!pt() && tower.active && tower.following) tower.follow(null)
  }, true)   // before side-panel.js closes its panel on the same key
  function showFollow(force) {
    const id = tower.active ? tower.following : null
    if (id === shownFollow && !force) return
    shownFollow = id
    const p = id && tower.person(id)
    for (const el of strip?.children || []) el.classList.toggle('on', !!p && p.kind === 'session' && el.dataset.id === id)
    if (!pill || !tower.active) return
    if (!p) { pill.classList.remove('on'); return }
    pill.querySelector('b').textContent = nameOf(p) || p.id.slice(0, 8)
    pill.style.setProperty('--pill', `hsl(${hue(p.session)} 55% 62%)`)
    pill.classList.add('on')
  }
  tower.on('sync', () => showFollow(true))

  // ---------- replay: its bar takes room at the bottom ----------
  api.on('live', () => requestAnimationFrame(() => { if (tower.active && tower.cam.auto) tower.fit() }))

  // ---------- rings: who is followed, whose transcript is open, which floor a chip points at ----------
  tower.on('overlay', (c, now) => {
    const k = tower.zoom
    if (hovered) {
      const f = tower.floor(hovered)
      if (f) {
        const a = tower.worldToScreen(IX - 2, f.top - 2), b = tower.worldToScreen(IX1 + 2, f.y + 2), h = hue(hovered)
        const pulse = 0.65 + 0.25 * Math.sin(now / 300)
        c.fillStyle = `hsla(${h} 70% 70% / .1)`; c.strokeStyle = `hsla(${h} 75% 66% / ${pulse})`; c.lineWidth = 3
        c.shadowColor = `hsl(${h} 80% 60%)`; c.shadowBlur = 12
        c.beginPath(); c.roundRect(a.x, a.y, b.x - a.x, b.y - a.y, 5); c.fill(); c.stroke(); c.shadowBlur = 0
      }
    }
    const ring = (id, moving) => {
      const p = id && tower.person(id); if (!p) return
      const s = tower.worldToScreen(p.x, p.y), t = moving ? (now / 900) % 1 : 0, r = Math.max(6, 7 * k)
      c.strokeStyle = `hsla(${hue(p.session)} 75% 62% / ${moving ? 0.9 - 0.6 * t : 0.7})`; c.lineWidth = 2
      c.beginPath(); c.ellipse(s.x, s.y, r * (1 + 0.3 * t), r * 0.35 * (1 + 0.3 * t), 0, 0, Math.PI * 2); c.stroke()
    }
    ring(tower.following, true)
    const t = pt(); if (t?.id && t.id !== tower.following) ring(t.id, false)
  })

  // ---------- the tower map ----------
  const style = document.createElement('style')
  style.textContent = `
  #towermap { position: absolute; right: var(--gut); bottom: calc(var(--gut) + var(--lift)); z-index: 2; padding: 6px;
    transition: opacity .25s, transform .25s, right .25s, bottom .25s; }
  #towermap.off { opacity: 0; transform: translateY(8px); pointer-events: none !important; }
  #towermap .hd { display: flex; align-items: center; justify-content: space-between; height: 16px; margin: -1px 1px 4px;
    color: var(--muted); font-size: var(--fs-xs); letter-spacing: 1.5px; user-select: none; }
  #towermap .pin { width: 18px; height: 16px; padding: 0; border: 0; border-radius: 4px; background: none; color: var(--muted); cursor: pointer; display: grid; place-items: center; }
  #towermap .pin:hover { background: var(--card-hi); color: var(--ink); }
  #towermap .pin.on { color: var(--wait); }
  #towermap canvas { display: block; border-radius: 5px; cursor: crosshair; touch-action: none; }
  #towermap .mtip { position: absolute; pointer-events: none; display: none; white-space: nowrap; max-width: 220px; overflow: hidden;
    text-overflow: ellipsis; padding: 3px 7px; border-radius: 5px; background: #111219f2; border: 1px solid var(--card-line); font-size: var(--fs-s); transform: translate(-100%, -50%); }`
  document.head.append(style)
  const KEY = 'agent-office.minimap.pinned'
  let pinned = false
  try { pinned = localStorage.getItem(KEY) === '1' } catch {}
  const map = document.createElement('div'); map.id = 'towermap'; map.className = 'card off'
  map.innerHTML = `<div class="hd"><span>TOWER</span><button class="pin"><svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor"><path d="M10 1l5 5-2 1-3 3 .5 3.5L9 15l-3-3-4 4-1-1 4-4-3-3 1.5-1.5L7 7l3-3z"/></svg></button></div><canvas></canvas><div class="mtip"></div>`
  api.hud.append(map)
  const mcv = map.querySelector('canvas'), mc = mcv.getContext('2d'), mtip = map.querySelector('.mtip'), pinBtn = map.querySelector('.pin')
  const showPin = () => { pinBtn.classList.toggle('on', pinned); pinBtn.title = pinned ? 'Unpin: show only when zoomed in' : 'Keep the map visible' }
  showPin()
  pinBtn.onclick = () => { pinned = !pinned; showPin(); try { localStorage.setItem(KEY, pinned ? '1' : '0') } catch {} }

  // the map spans the building and its shaft, a little street either side; the viewport is clipped to it
  const PAD = 40
  let mw = 0, mh = 0, s = 1, box = null, dpr = 1, mapShown = false, inside = false, mhover = null
  const wrap = document.getElementById('wrap')
  const fitZoom = () => tower.fitZoom()
  function size() {
    const b = tower.bounds, d = devicePixelRatio || 1
    box = { x0: -PAD, x1: BW + SHAFT + PAD, y0: b.y0 + 30, y1: tower.floors[0].y + 8 }
    const H = Math.min(260, Math.max(150, wrap.clientHeight * 0.3)), sc = H / (box.y1 - box.y0)
    const w = Math.round((box.x1 - box.x0) * sc), h = Math.round(H)
    if (w === mw && h === mh && d === dpr) return
    mw = w; mh = h; dpr = d
    mcv.width = Math.round(mw * dpr); mcv.height = Math.round(mh * dpr); mcv.style.width = mw + 'px'; mcv.style.height = mh + 'px'
  }
  const mx = x => (x - box.x0) * s, my = y => (y - box.y0) * s
  function drawMap(now) {
    s = mw / (box.x1 - box.x0)
    const c = mc
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, mw, mh)
    c.fillStyle = '#1a2036'; c.fillRect(0, 0, mw, mh)
    for (const e of tower.street.buildings || []) if (e.x0 + e.w > box.x0 && e.x0 < box.x1) { c.fillStyle = '#262d45'; c.fillRect(mx(e.x0), my(-e.h), e.w * s, e.h * s) }
    c.fillStyle = '#3a3f4a'; c.fillRect(0, my(0), mw, GROUND * s)
    c.fillStyle = '#231c18'; c.fillRect(0, my(GROUND), mw, mh - my(GROUND))
    const fl = tower.floors
    c.fillStyle = '#4a4440'; c.fillRect(mx(0), my(fl[fl.length - 1].y), BW * s, my(fl[0].y + 4) - my(fl[fl.length - 1].y))
    for (const f of fl) {
      if (f.kind === 'roof') { c.fillStyle = '#5a5450'; c.fillRect(mx(0), my(f.y - 4), BW * s, 4 * s); continue }
      const col = f.kind === 'session' ? `hsl(${f.hue} 22% ${f.id === hovered ? 62 : 48}%)` : KIND[f.kind] || '#666'
      c.fillStyle = col; c.fillRect(mx(IX), my(f.top), (IX1 - IX) * s, (f.y - f.top) * s)
      if (f.kind === 'session') { c.fillStyle = `hsl(${f.hue} 55% 62%)`; c.fillRect(mx(IX), my(f.top), 2, (f.y - f.top) * s) }
    }
    c.fillStyle = '#2a2f3c'; c.fillRect(mx(BW), my(fl[fl.length - 1].y - 8), SHAFT * s, my(fl[0].y) - my(fl[fl.length - 1].y - 8))
    const car = tower.car; c.fillStyle = '#c8d8ec'; c.fillRect(mx(BW + 6), my(car.y - 40), 28 * s, 40 * s)
    const xc = tower.xcar; if (xc) { c.fillStyle = xc.lit > 0.5 ? '#f0dca0' : '#5a6070'; c.fillRect(mx(xc.x - 11), my(xc.y - 40), 22 * s, 40 * s) }
    const st = p => api.COLORS[p.state] || api.COLORS.idle, ppl = tower.people
    for (const p of ppl) if (p.kind !== 'session') { c.fillStyle = st(p); c.beginPath(); c.arc(mx(p.x), my(p.y - 8), 1.6, 0, 7); c.fill() }
    for (const p of ppl) if (p.kind === 'session') {
      const x = mx(p.x), y = my(p.y - 8), r = p === mhover || p.id === tower.following ? 3.6 : 2.6
      c.fillStyle = '#0e0f15'; c.beginPath(); c.arc(x, y, r + 2, 0, 7); c.fill()
      c.fillStyle = st(p); c.beginPath(); c.arc(x, y, r + 1.2, 0, 7); c.fill()
      c.fillStyle = `hsl(${hue(p.session)} 60% 62%)`; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill()
    }
    const a = tower.screenToWorld(0, 0), b = tower.screenToWorld(wrap.clientWidth, wrap.clientHeight)
    c.save(); c.beginPath(); c.rect(0, 0, mw, mh); c.clip()
    const vx = mx(a.x), vy = my(a.y), vw = (b.x - a.x) * s, vh = (b.y - a.y) * s
    c.fillStyle = 'rgba(255,255,255,.08)'; c.fillRect(vx, vy, vw, vh)
    c.strokeStyle = 'rgba(0,0,0,.6)'; c.lineWidth = 3; c.strokeRect(vx + .5, vy + .5, vw - 1, vh - 1)
    c.strokeStyle = '#ecebf3'; c.lineWidth = 1.2; c.strokeRect(vx + .5, vy + .5, vw - 1, vh - 1)
    c.restore()
  }
  tower.on('step', (dt, now) => {
    showFollow()
    if (!tower.floors.length) return
    const want = pinned || inside || tower.zoom > fitZoom() * 1.06
    if (want !== mapShown) { mapShown = want; map.classList.toggle('off', !want) }
    if (!mapShown) return
    const open = panel?.classList.contains('open')
    map.style.right = open ? `calc(${panel.offsetWidth}px + 2 * var(--gut))` : ''
    size(); drawMap(now)
  })
  const local = e => { const r = mcv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  function moveTo(p) {
    const cam = tower.cam, b = tower.bounds
    tower.follow(null)
    cam.cx = Math.max(box.x0, Math.min(box.x1, p.x / s + box.x0)); cam.cy = Math.max(b.y0, Math.min(b.y1, p.y / s + box.y0)); cam.auto = false
  }
  let mdrag = false
  mcv.addEventListener('pointerdown', e => { mdrag = true; try { mcv.setPointerCapture(e.pointerId) } catch {} moveTo(local(e)); e.preventDefault() })
  mcv.addEventListener('pointermove', e => {
    const p = local(e)
    if (mdrag) { moveTo(p); mtip.style.display = 'none'; return }
    let best = null, bd = 64
    for (const q of tower.people) { const d = (mx(q.x) - p.x) ** 2 + (my(q.y - 8) - p.y) ** 2 - (q.kind === 'session' ? 16 : 0); if (d < bd) { bd = d; best = q } }
    mhover = best
    const wy = p.y / s + box.y0, f = !best && tower.floors.find(f => f.kind !== 'roof' && wy >= f.top && wy <= f.y)
    const text = best ? nameOf(best) || 'someone' : f ? (f.session?.title || f.label) : ''
    if (!text) { mtip.style.display = 'none'; return }
    mtip.textContent = text; mtip.style.borderColor = best ? api.COLORS[best.state] || api.COLORS.idle : 'var(--line)'
    mtip.style.display = 'block'; mtip.style.left = (mcv.offsetLeft - 6) + 'px'; mtip.style.top = (mcv.offsetTop + p.y) + 'px'
  })
  const mend = () => { mdrag = false }
  mcv.addEventListener('pointerup', mend); mcv.addEventListener('pointercancel', mend)
  map.addEventListener('pointerenter', () => { inside = true })
  map.addEventListener('pointerleave', () => { inside = false; mhover = null; mtip.style.display = 'none' })
  mcv.addEventListener('wheel', e => {
    e.preventDefault()
    const cam = tower.cam, z = Math.min(8, cam.zoom * Math.exp(-e.deltaY * 0.0015))
    if (z <= fitZoom() * 1.001) return tower.fit()
    cam.zoom = z; cam.auto = false
  }, { passive: false })

  // ---------- demos ----------
  const demos = api.params.getAll('demo')
  let demoDone = false
  if (demos.some(d => /^tower(panel|follow|chip|map)$/.test(d))) tower.on('sync', data => {
    if (demoDone || !tower.people.length) return
    demoDone = true
    setTimeout(() => {
      const ppl = tower.people, agent = ppl.find(p => p.kind === 'agent' && p.state !== 'idle' && p.state !== 'done') || ppl.find(p => p.kind === 'agent')
      if (demos.includes('towerpanel') && agent) openPanel(agent.session, agent.id)
      if (demos.includes('towerfollow')) tower.follow((agent || ppl[0]).id)
      if (demos.includes('towerchip')) { hovered = data.sessions[0].id; tower.flyTo(hovered) }
      if (demos.includes('towermap')) { const p = ppl.find(p => p.kind === 'session'); tower.flyTo({ x: p.x + 120, y: p.y - 20 }, fitZoom() * 2.6) }
    }, 600)
  })
}
