// director-mode: an auto-pilot camera for a TV across the room. On (🎬 in the toolbar, D, or ?director=1 for a kiosk),
// it picks shots from what is happening — a floor moving in or out, a deploy launch, the helicopter, a jammed copier, a
// tremor, a storm cloud, a reviewer's visit, the waiting line, a busy floor, the post room — with an establishing wide
// shot now and then, and glides between them slowly: every shot holds at least 12 s (calm ones longer) and drifts a
// little, never cutting sooner than 10 s, and a long jump goes out to the wide shot first. A small lower-third names the
// shot. Any drag, wheel, zoom or click hands the camera back for 60 s. Off by default; remembered per browser.
// ?demo=directormode switches it on with shorter holds (still 10 s at least).
import { IX, BW, SHAFT } from '../building.js'

const KEY = 'agentopolis:director', PAUSE = 60_000, MIN_CUT = 10_000
const ease = t => 0.5 - 0.5 * Math.cos(Math.PI * Math.max(0, Math.min(1, t)))

export default function init(api, tower) {
  const params = api.params, demo = api.demo('directormode')
  const k = demo ? 0.6 : 1   // the demo holds shots a little shorter so a screenshot run sees a few
  let on = false, pausedUntil = 0, shot = null, flight = null, base = null, cutAt = 0, t0 = 0
  const shown = new Map()     // shot key -> last time on air
  const seenEvents = new Set()

  // ---------- toolbar, caption ----------
  const style = document.createElement('style')
  style.textContent = `
  #dirBtn.on { background: #f29a4e33; box-shadow: inset 0 0 0 1px #a8784a; }
  #dirCap { position: absolute; left: 16px; z-index: 5; pointer-events: none; max-width: min(460px, calc(100% - 32px)); padding: 5px 10px 5px 9px;
    border-left: 3px solid #f29a4e; background: rgba(16,18,26,.62); color: #f2ece2; font: 600 12px/1.35 ui-monospace, SFMono-Regular, Menlo, monospace;
    letter-spacing: .02em; border-radius: 0 4px 4px 0; opacity: 0; transform: translateY(4px); transition: opacity .9s, transform .9s; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  #dirCap.on { opacity: 1; transform: none; }
  #dirCap .k { color: #f6b77a; margin-right: 6px; }`
  document.head.append(style)
  const grp = document.createElement('div'); grp.className = 'grp'; grp.id = 'tbDirector'
  const btn = document.createElement('button'); btn.className = 'hbtn'; btn.id = 'dirBtn'; btn.textContent = '🎬'
  btn.title = 'Director mode — the camera follows what\'s happening'; btn.setAttribute('aria-pressed', 'false')
  grp.append(btn); document.getElementById('zoom')?.append(grp)
  const cap = document.createElement('div'); cap.id = 'dirCap'; cap.setAttribute('aria-live', 'polite')
  document.getElementById('wrap').append(cap)
  let capTimer = 0
  function caption(text, ms = 7000, kind = '🎬') {
    cap.style.bottom = `${(api.reserveBottom || 0) + 16}px`
    cap.innerHTML = `<span class="k">${kind}</span>${api.esc(text)}`
    cap.classList.add('on'); clearTimeout(capTimer); capTimer = setTimeout(() => cap.classList.remove('on'), ms)
  }

  function set(v, quiet) {
    on = v; btn.classList.toggle('on', on); btn.setAttribute('aria-pressed', String(on))
    try { localStorage.setItem(KEY, on ? '1' : '0') } catch {}
    pausedUntil = 0; flight = null; shot = null
    if (on) { cutAt = 0; if (!quiet) caption('Director mode on — press D to stop', 3500) }
    else if (!quiet) caption('Director mode off', 2500)
  }
  btn.addEventListener('click', () => set(!on))
  let start = demo || params.get('director') === '1'
  if (!start && params.get('director') !== '0') try { start = localStorage.getItem(KEY) === '1' } catch {}
  if (start) set(true, true)

  // any hand on the camera pauses it
  function pause() {
    if (!on) return
    if (performance.now() >= pausedUntil) caption('Director paused — back in a minute', 3000, '⏸')
    pausedUntil = performance.now() + PAUSE; flight = null; shot = null
  }
  const cv = tower.canvas
  cv.addEventListener('pointerdown', pause, true); cv.addEventListener('wheel', pause, { capture: true, passive: true })
  document.getElementById('zoom')?.addEventListener('click', e => { if (e.target.closest('button') && !e.target.closest('#tbDirector')) pause() }, true)
  addEventListener('keydown', e => {
    if (e.target.closest?.('input, textarea, select, [contenteditable]') || e.metaKey || e.ctrlKey || e.altKey) return
    if (e.key === 'd' || e.key === 'D') { set(!on); return }
    if (['+', '=', '-', '0', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) pause()
  })

  // ---------- shots ----------
  const vw = () => cv.clientWidth || innerWidth, vh = () => Math.max(100, (cv.clientHeight || innerHeight) - (api.reserveBottom || 0))
  const roof = () => tower.floors.at(-1)
  const label = f => f.kind === 'session' ? `Floor ${f.n - 2} · ${f.session?.title || 'session'}` : (f.label || f.kind).replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase())
  const floorZoom = f => Math.min(vw() / (BW + SHAFT + 60), vh() / ((f.y - f.top) * 2.6))
  const onFloor = (f, x = (BW + SHAFT) / 2, zm = 1) => ({ x, y: (f.top + f.y) / 2 + 4, zoom: floorZoom(f) * zm })
  function wide() {
    const b = tower.bounds
    return { key: 'wide', text: 'The tower', hold: 16_000, calm: true, x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2, zoom: tower.fitZoom() }
  }

  function candidates(now) {
    const snap = tower.snapshot, out = []; if (!snap) return out
    const add = (score, s) => { if (s && Number.isFinite(s.x) && Number.isFinite(s.y)) out.push({ score, ...s }) }
    const fresh = (key, t, win) => t && now - t < win && !seenEvents.has(key)
    // floors moving in or out
    for (const f of tower.floors) if (f.kind === 'session' && f.open != null) add(100, { key: 'move:' + f.id, event: true, ...onFloor(f, IX + 200, 1.1),
      text: `${label(f)} — ${f.session?.running === false ? 'moving out' : 'moving in'}` })
    // a deploy lifting off
    for (const d of snap.deploys?.list || []) {
      const at = Date.parse(d.createdAt), rf = roof()
      if (d.status !== 'completed' && fresh('deploy:' + d.id, at, 4 * 60_000) && rf) add(90, { key: 'deploy:' + d.id, event: true, x: IX + 362, y: rf.y - 50, zoom: 3,
        text: `Roof · deploy launching — ${String(d.title || d.workflow || '').slice(0, 60)}` })
    }
    for (const s of snap.sessions || []) {
      const f = tower.floorOf(s.id); if (!f || f.kind !== 'session') continue
      for (const o of [s, ...(s.agents || [])]) {
        for (const h of o.ext?.helipad || []) {
          const t = h.back && now - h.back < 3 * 60_000 ? h.back : h.at, rf = roof()
          if (fresh('heli:' + h.id + ':' + (h.back ? 'b' : 'o'), t, 3 * 60_000) && rf) add(80, { key: 'heli:' + h.id + ':' + (h.back ? 'b' : 'o'), event: true, x: BW + 10, y: rf.y - 50, zoom: 3,
            text: `Helipad · ${h.back ? 'back from' : 'off to'} ${h.label || h.kind || 'remote work'} — ${s.title}` })
        }
        const j = o.ext?.['printer-jam']
        if (j && s.running && now - (j.mtime || j.at) > 3 * 60_000 && (o === s || o.state !== 'done'))
          add(seenEvents.has('jam:' + j.id) ? 25 : 70, { key: 'jam:' + j.id, event: !seenEvents.has('jam:' + j.id), ...onFloor(f, IX + 400, 1.7), text: `${label(f)} — jammed copier` })
      }
      const st = s.ext?.['storm-cloud']
      const sk = 'storm:' + s.id + ':' + st?.level
      if (st?.level >= 1 && now - (st.at || 0) < 20 * 60_000) add(seenEvents.has(sk) ? 20 : 60, { key: sk, event: !seenEvents.has(sk), ...onFloor(f, IX + 90, 1.6),
        text: `${label(f)} — storm cloud (${st.word || 'grumpy'})` })
      const busy = (s.agents || []).filter(a => a.state !== 'done').length
      if (busy >= 2) add(18 + busy * 4, { key: 'busy:' + s.id, calm: true, ...onFloor(f, IX + 240, 1.25), text: `${label(f)} — ${busy} agents at work` })
      else add(6, { key: 'floor:' + s.id, calm: true, ...onFloor(f, IX + 150, 1.4), text: `${label(f)} — ${s.tool ? 'busy with ' + s.tool : ({ waiting: 'waiting for you', attention: 'needs you', thinking: 'thinking', idle: 'quiet' })[s.state] || 'at work'}` })
    }
    for (const e of snap.seismograph?.events || []) {
      const f = tower.floorOf(e.session)
      if (f && fresh('quake:' + e.id, e.at, 2 * 60_000)) add(85, { key: 'quake:' + e.id, event: true, ...onFloor(f, IX + 200, 1.5), text: `${label(f)} — tremor: ${e.kind || 'destructive command'}` })
    }
    const me = snap.street?.me
    for (const e of snap.street?.events || []) {
      if (!me || e.target !== me || !/review|comment/.test(e.type) || !fresh('visit:' + e.id, e.at, 3 * 60_000)) continue
      const lb = tower.floor('lobby')
      if (lb) add(65, { key: 'visit:' + e.id, event: true, ...onFloor(lb, 40, 1.2), text: `Lobby · a visit from ${e.actor} about #${e.pr}` })
    }
    const waiting = (snap.sessions || []).filter(s => s.running !== false && (s.state === 'waiting' || s.state === 'attention')).length, ceo = tower.floor('ceo')
    if (waiting && ceo) add(22 + waiting * 6, { key: 'line', calm: true, ...onFloor(ceo, IX + 300, 1.2), text: `CEO office · ${waiting} waiting in line for ${snap.owner || 'you'}` })
    const post = tower.floor('post')
    if (post) add(10, { key: 'post', calm: true, ...onFloor(post, IX + 240, 1.05), text: `Post room · ${(snap.street?.post || []).length} open PRs` })
    const cafe = tower.floor('cafe')
    if (cafe) add(5, { key: 'cafe', calm: true, ...onFloor(cafe, IX + 240, 1), text: 'Café · lounge' })
    add(sinceWide(now) > 70_000 ? 45 : 8, wide())
    return out
  }
  const sinceWide = now => now - (shown.get('wide') || 0)

  function pick(nowMs) {
    const list = candidates(Date.now())
    for (const c of list) {
      const last = shown.get(c.key)
      if (shot && c.key === shot.key) c.score -= 1000
      else if (last && !c.event) c.score -= Math.max(0, 50 - (nowMs - last) / 6000)
      c.score += Math.random() * 6
    }
    list.sort((a, b) => b.score - a.score)
    let next = list[0]; if (!next) return
    // a long jump goes out to the wide shot first
    if (shot && shot.key !== 'wide' && next.key !== 'wide' && Math.hypot(next.x - cam().x, next.y - cam().y) * Math.min(next.zoom, cam().zoom) > Math.max(vw(), vh()) * 1.2) next = { ...wide(), hold: 11_000, via: next }
    cut(next, nowMs)
  }
  const cam = () => ({ x: tower.cam.cx, y: tower.cam.cy, zoom: tower.cam.zoom })
  function cut(next, nowMs) {
    const z0 = tower.fitZoom()
    next.zoom = Math.max(z0 * 0.96, Math.min(6, next.zoom))
    const from = cam(), dist = Math.hypot(next.x - from.x, next.y - from.y) * Math.min(from.zoom, next.zoom) / vh() + Math.abs(Math.log(next.zoom / from.zoom))
    flight = { from, t0: nowMs, dur: Math.min(7000, 3200 + dist * 1800) }
    shot = next; base = { x: next.x, y: next.y, zoom: next.zoom }; cutAt = nowMs
    shown.set(next.key, nowMs); if (next.event) seenEvents.add(next.key)
    shot.hold = (next.hold || (next.calm ? 20_000 : 14_000)) * k
    caption(next.text)
  }

  tower.on('step', (dt, now) => {
    if (!on || !tower.active) return
    if (now < pausedUntil) return
    if (pausedUntil) { pausedUntil = 0; tower.follow(null); caption('Director back on', 2500) }
    if (tower.following) return
    if (!shot) return pick(now)
    const age = now - cutAt
    if (age > Math.max(shot.hold, MIN_CUT)) {
      if (shot.via) { const v = shot.via; shot = null; return cut(v, now) }
      return pick(now)
    }
    // a fresh event may cut a calm shot short, but never sooner than 10 s
    if (shot.calm && age > MIN_CUT && !flight && Math.floor(age / 1000) !== Math.floor((age - dt * 1000) / 1000)) {
      const hot = candidates(Date.now()).filter(c => c.event && !seenEvents.has(c.key) && c.score >= 60)
      if (hot.length) return pick(now)
    }
    const c = tower.cam
    c.auto = false
    if (flight) {
      const p = (now - flight.t0) / flight.dur, e = ease(p), f = flight.from
      c.cx = f.x + (base.x - f.x) * e; c.cy = f.y + (base.y - f.y) * e
      c.zoom = Math.exp(Math.log(f.zoom) + (Math.log(base.zoom) - Math.log(f.zoom)) * e)
      if (p >= 1) { flight = null; t0 = now }
      return
    }
    // gentle drift: a slow pan and a breath of zoom, starting from rest
    const t = (now - t0) / 1000, ramp = Math.min(1, t / 4), amp = shot.key === 'wide' ? 0 : 14 / base.zoom
    c.cx = base.x + amp * ramp * Math.sin(t / 9)
    c.cy = base.y + amp * 0.4 * ramp * Math.sin(t / 13)
    c.zoom = base.zoom * (1 + 0.035 * ramp * Math.sin(t / 11))
  })
}
