// replay: "while you were away" — pause live data and replay the office from the transcripts of the last hours, sped up.
// ?demo=replay (or #demo=replay) opens it an hour ago at 60×; demo=replay-back also clicks "Back to live" after 6 s.
export default function init(api) {
  const BAR_H = 50
  const style = document.createElement('style')
  style.textContent = `
  body[data-replay] { --lift: ${BAR_H + 10}px; }   /* bottom cards (activity, tower map) sit above the bar */
  #replayBtn.on { background: #f29a4e33; color: #f3d9a8; }
  #replayTint { position: absolute; inset: 0; z-index: 1; display: none; pointer-events: none !important;
    backdrop-filter: sepia(.45) saturate(.85); -webkit-backdrop-filter: sepia(.45) saturate(.85);
    background: radial-gradient(ellipse at center, transparent 55%, rgba(40, 22, 6, .45) 100%); }
  #replayTint.on, #replayBar.on, #replayTag.on { display: flex; }
  #replayTag { display: none; align-items: center; gap: 8px; height: 28px; padding: 0 12px; border-radius: 999px;
    border-color: #a8784a99; color: #f3d9a8; font: 700 var(--fs-s) var(--font); letter-spacing: 2px; }
  #replayTag i { width: 7px; height: 7px; border-radius: 50%; background: #f29a4e; animation: rpBlink 1.2s steps(2) infinite; }
  @keyframes rpBlink { 50% { opacity: .2; } }
  #replayBar { position: absolute; left: 50%; transform: translateX(-50%); bottom: var(--gut); width: min(1100px, calc(100% - 2 * var(--gut)));
    height: ${BAR_H}px; z-index: 3; display: none; align-items: center; gap: 10px; padding: 0 10px; border-color: #a8784a66; }
  #replayBar button, #replayBar select { height: 28px; border-radius: var(--radius-s); border: 1px solid var(--card-line); background: rgba(255, 255, 255, .05);
    color: var(--ink); font: 600 var(--fs) var(--font); cursor: pointer; padding: 0 9px; }
  #replayBar button:hover { background: var(--card-hi); }
  #replayBar .play { width: 32px; padding: 0; font-size: 13px; }
  #replayBar .speeds { display: flex; gap: 2px; }
  #replayBar .speeds button { padding: 0 7px; color: var(--muted); }
  #replayBar .speeds button.on { color: #f3d9a8; border-color: #a8784a; background: #f29a4e22; }
  #replayBar .clock { flex: none; min-width: 98px; text-align: center; color: #f3d9a8; font-weight: 700; font-size: 13px; }
  #replayBar .track { position: relative; flex: 1; min-width: 120px; height: 34px; }
  #replayBar .dens { position: absolute; left: 0; right: 0; top: 4px; height: 10px; display: flex; border-radius: 3px; overflow: hidden; background: rgba(0, 0, 0, .35); }
  #replayBar .dens i { flex: 1; }
  #replayBar .ticks { position: absolute; inset: 0; pointer-events: none; }
  #replayBar .ticks b { position: absolute; top: 2px; width: 1px; height: 14px; background: #a8784a88; }
  #replayBar .ticks span { position: absolute; top: 21px; transform: translateX(-50%); font-size: var(--fs-xs); color: var(--muted); white-space: nowrap; }
  #replayBar input[type=range] { position: absolute; left: 0; right: 0; top: 0; width: 100%; height: 18px; margin: 0; background: transparent;
    -webkit-appearance: none; appearance: none; cursor: pointer; }
  #replayBar input[type=range]::-webkit-slider-runnable-track { height: 18px; background: transparent; }
  #replayBar input[type=range]::-webkit-slider-thumb { -webkit-appearance: none; width: 4px; height: 18px; border-radius: 2px;
    background: #fff3dc; box-shadow: 0 0 0 1px #6e5038, 0 0 8px #f29a4e; }
  #replayBar .live { color: #ef8a8a; border-color: #ef8a8a44 !important; }
  #replayBar .live:hover { background: #ef5a5a22 !important; }
  @media (max-width: 760px) { #replayBar .speeds button:not(.on), #replayBar .hours { display: none; } #replayBar .clock { min-width: 0; } }
  #replayBar .msg { color: var(--muted); }`
  document.head.append(style)

  const el = (tag, cls, html = '') => { const e = document.createElement(tag); if (cls) e.className = cls; e.innerHTML = html; return e }
  const tint = el('div'); tint.id = 'replayTint'
  const btn = el('button', 'hbtn', '⏪'); btn.id = 'replayBtn'; btn.title = 'Replay the last hours, sped up'
  const tag = el('div', 'card', '<i></i>REPLAY'); tag.id = 'replayTag'
  const bar = el('div', 'card'); bar.id = 'replayBar'
  bar.innerHTML = `<button class="play" title="Play / pause (space)">⏸</button>
    <span class="speeds">${[10, 30, 60, 120].map(s => `<button data-s="${s}">${s}×</button>`).join('')}</span>
    <select class="hours" title="Window">${[4, 8, 12, 24].map(h => `<option value="${h}"${h === 8 ? ' selected' : ''}>${h}h</option>`).join('')}</select>
    <span class="clock">—</span>
    <div class="track"><div class="dens"></div><div class="ticks"></div><input type="range" min="0" max="1" step="1000" value="0"></div>
    <button class="live" title="Back to live (Esc)">● Back to live</button>`
  api.hud.append(tint, bar)
  document.getElementById('tbReplay').append(btn)
  document.getElementById('topstack').append(tag)
  const $ = s => bar.querySelector(s)
  const slider = $('input'), clock = $('.clock'), playBtn = $('.play')

  const CODE = { t: 'tool', k: 'thinking', w: 'waiting', i: 'idle' }
  const IDLE = 5 * 60_000, AGENT_STALE = 10 * 60_000, LINGER = 45_000
  let tl = null, open = false, playing = false, speed = 60, T = 0, timer = null, lastTick = 0, hours = 8

  // Event lists become [absMs, code, tool, detail] once, so a frame is a binary search per transcript.
  function prepare(d) {
    const abs = ev => ev.map(([t, c, tool, detail]) => [d.from + t * 1000, c, tool ?? null, detail ?? null])
    for (const s of d.sessions) { s.ev = abs(s.ev); for (const g of s.agents) { g.ev = abs(g.ev); g.endAt = d.from + g.end * 1000 } }
    return d
  }
  function at(ev, t) {
    let lo = 0, hi = ev.length - 1, r = -1
    while (lo <= hi) { const m = (lo + hi) >> 1; if (ev[m][0] <= t) { r = m; lo = m + 1 } else hi = m - 1 }
    return r === -1 ? null : ev[r]
  }
  const realT = e => e[1] === 'i' ? e[0] - IDLE : e[0]

  function snapshotAt(t) {
    const now = Date.now(), shift = now - t, sessions = []
    for (const s of tl.sessions) {
      let last = -Infinity
      const agents = []
      for (const g of s.agents) {
        const e = at(g.ev, t); if (!e) continue
        const lt = realT(e)
        let state
        if (g.done && t >= g.endAt) { if (t - g.endAt > LINGER) continue; state = 'done' }
        else if (t - lt > AGENT_STALE) continue
        else state = t - lt > IDLE ? 'idle' : e[1] === 'w' ? 'done' : CODE[e[1]]
        last = Math.max(last, lt)
        agents.push({ id: g.id, type: g.type, description: g.description, phase: g.phase, workflow: g.workflow, workflowRun: g.workflowRun,
          state, tool: state === 'tool' ? e[2] : null, detail: state === 'tool' ? e[3] : null, lastActivity: lt + shift, ext: {} })
      }
      const se = at(s.ev, t)
      if (se) last = Math.max(last, realT(se))
      if (!Number.isFinite(last) || t - last > tl.windowMs) continue
      let state = se ? CODE[se[1]] : 'idle'
      const quiet = se ? t - realT(se) : Infinity
      if (agents.some(g => g.state !== 'done' && g.state !== 'idle') && (state === 'waiting' || quiet > 30_000)) state = 'delegating'
      else if (state !== 'waiting' && quiet > IDLE) state = 'idle'
      sessions.push({ id: s.id, title: s.title, cwd: s.cwd, branch: s.branch, worktree: s.cwd?.match(/\.claude\/worktrees\/([^/]+)/)?.[1] ?? null,
        running: false, state, tool: state === 'tool' ? se[2] : null, detail: state === 'tool' ? se[3] : null, lastActivity: last + shift, agents, ext: {} })
    }
    return { now, replay: t, sessions }
  }

  const fmt = (t, day) => new Date(t).toLocaleString('en-GB', { ...(day ? { weekday: 'short' } : {}), hour: '2-digit', minute: '2-digit', hour12: false }).replace(',', '')
  function drawTrack() {
    const { from, to } = tl, span = to - from, N = 160, n = new Array(N).fill(0), kind = Array.from({ length: N }, () => ({ t: 0, k: 0, d: 0 }))
    for (const s of tl.sessions) {
      for (const e of s.ev) { const b = Math.floor((e[0] - from) / span * N); if (b >= 0 && b < N && e[1] !== 'i') { n[b]++; e[1] === 't' ? kind[b].t++ : kind[b].k++ } }
      for (const g of s.agents) for (const e of g.ev) { const b = Math.floor((e[0] - from) / span * N); if (b >= 0 && b < N && e[1] !== 'i') { n[b]++; kind[b].d++ } }
    }
    const max = Math.max(1, ...n)
    $('.dens').innerHTML = n.map((v, i) => {
      if (!v) return '<i></i>'
      const k = kind[i], c = k.d >= k.t && k.d >= k.k ? api.COLORS.delegating : k.t >= k.k ? api.COLORS.tool : api.COLORS.thinking
      return `<i style="background:${c};opacity:${(0.15 + 0.85 * Math.sqrt(v / max)).toFixed(2)}"></i>`
    }).join('')
    let ticks = ''
    const step = span > 12 * 3_600_000 ? 3 : 1, h0 = new Date(from); h0.setMinutes(0, 0, 0)
    for (let h = h0.getTime() + 3_600_000; h < to; h += 3_600_000) {
      const x = ((h - from) / span * 100).toFixed(2), hr = new Date(h).getHours()
      ticks += `<b style="left:${x}%"></b>${hr % step ? '' : `<span style="left:${x}%">${String(hr).padStart(2, '0')}:00</span>`}`
    }
    $('.ticks').innerHTML = ticks
    slider.min = from; slider.max = to
  }

  function render() {
    clock.textContent = fmt(T, true)
    slider.value = T
    playBtn.textContent = playing ? '⏸' : '▶'
    for (const b of bar.querySelectorAll('.speeds button')) b.classList.toggle('on', Number(b.dataset.s) === speed)
  }
  function frame() {
    if (!open || !tl) return
    const now = performance.now()
    if (playing) { T = Math.min(tl.to, T + (now - lastTick) * speed); if (T >= tl.to) playing = false }
    lastTick = now
    api.feed(snapshotAt(T))
    render()
  }

  async function load(h) {
    clock.textContent = 'loading…'
    const r = await fetch(`/api/replay/?hours=${h}`, { cache: 'no-store' })
    if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || r.statusText)
    tl = prepare(await r.json()); hours = h
    drawTrack()
  }
  const firstActivity = () => {
    let first = tl.to
    for (const s of tl.sessions) for (const ev of [s.ev, ...s.agents.map(g => g.ev)]) { const e = ev.find(x => x[0] >= tl.from); if (e) first = Math.min(first, e[0]) }
    return Math.max(tl.from, first - 60_000)
  }

  async function openReplay(start, sp = speed) {
    if (open) return
    open = true; api.pauseLive()
    api.reserveBottom += BAR_H + 12
    for (const x of [tint, tag, bar]) x.classList.add('on'); btn.classList.add('on'); btn.title = 'Back to live (Esc)'
    const conn = document.getElementById('conn'); if (conn) { conn.textContent = 'replay'; conn.className = '' }
    try { await load(hours) } catch (e) { api.toast('Replay failed: ' + e.message); return close() }
    if (!open) return
    speed = sp; T = start ? Math.max(tl.from, start(tl)) : firstActivity(); playing = true; lastTick = performance.now()
    frame(); timer = setInterval(frame, 250)
  }
  async function close() {
    if (!open) return
    open = false; playing = false; clearInterval(timer); timer = null
    api.reserveBottom -= BAR_H + 12
    for (const x of [tint, tag, bar]) x.classList.remove('on'); btn.classList.remove('on'); btn.title = 'Replay the last hours, sped up'
    // Show live data straight away instead of waiting for the next poll.
    try { const r = await fetch('/api/state', { cache: 'no-store' }); if (!open) api.feed(await r.json()) } catch {}
    if (!open) api.resumeLive()
  }

  btn.onclick = () => { btn.blur(); open ? close() : openReplay() }
  $('.live').onclick = close
  playBtn.onclick = () => { if (!tl) return; if (!playing && T >= tl.to) T = tl.from; playing = !playing; lastTick = performance.now(); render() }
  for (const b of bar.querySelectorAll('.speeds button')) b.onclick = () => { speed = Number(b.dataset.s); render() }
  slider.oninput = () => { const back = Number(slider.value) < T; T = Number(slider.value); lastTick = performance.now(); api.feed(snapshotAt(T), { reset: back }); render() }
  $('.hours').onchange = async e => {
    const h = Number(e.target.value)
    try { await load(h); T = Math.max(T, tl.from); frame() } catch (err) { api.toast('Replay failed: ' + err.message) }
  }
  addEventListener('keydown', e => {
    if (!open || e.target.closest?.('input[type=text], textarea, select')) return
    if (e.key === 'Escape') { e.preventDefault(); close() }
    else if (e.key === ' ' && (e.target === document.body || e.target.closest?.('.hbtn, #replayBar button'))) { e.preventDefault(); playBtn.click() }
  })

  const demos = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo')
  if (demos.includes('replay') || demos.includes('replay-back')) {
    openReplay(d => d.to - 3_600_000, 60)
    if (demos.includes('replay-back')) setTimeout(close, 6000)
  }
}
