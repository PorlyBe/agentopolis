// floor-sounds: zoomed in on a floor you hear it — keyboards while its tools run, the copier whirring (crunching while
// printer-jam has it jammed), the elevator ding when the car stops there, coffee pouring in the café, street traffic at
// the lobby, wind on the roof. All synthesized; plays through soundscape.js's AudioContext and follows its off/low/high
// button (nothing starts before a gesture). Volume and pan follow the camera; silent once zoomed out to the tower.
// ?demo=floorsounds flies onto the busiest floor and shows a "click for sound" hint.
import { IX } from '../building.js'

const Z0 = 2.2, Z1 = 3.6, TICK = 80, JAM_MS = 3 * 60_000
const READING = /^(Read|Grep|Glob|WebFetch|WebSearch|ToolSearch)$|^mcp__/
const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v))

export default function init(api, tower) {
  const params = api.params, demo = api.demo('floorsounds')
  const level = () => api.soundscape?.level() ?? 0
  const counts = { keys: 0, whirr: 0, crunch: 0, ding: 0, pour: 0, car: 0, horn: 0 }
  let ctx = null, master = null, noise = null, beds = null, carWas = null
  const timers = new Map()

  function graph() {
    if (master) return
    master = ctx.createGain(); master.gain.value = 0.0001; master.connect(ctx.destination)
    noise = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate)
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1
    const brown = ctx.createBuffer(1, ctx.sampleRate * 5, ctx.sampleRate), b = brown.getChannelData(0)
    let l = 0; for (let i = 0; i < b.length; i++) { l = (l + 0.02 * (Math.random() * 2 - 1)) / 1.02; b[i] = l * 3.5 }
    const bed = (buf, type, f, q) => {
      const s = ctx.createBufferSource(); s.buffer = buf; s.loop = true
      const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.value = f; flt.Q.value = q
      const g = ctx.createGain(); g.gain.value = 0
      s.connect(flt).connect(g).connect(master); s.start()
      return { g, flt }
    }
    beds = { street: bed(brown, 'lowpass', 320, 0.7), wind: bed(noise, 'bandpass', 520, 0.9), hiss: bed(noise, 'highpass', 5000, 0.5) }
  }
  const out = (pan, v) => { const p = ctx.createStereoPanner(), g = ctx.createGain(); p.pan.value = pan; g.gain.value = v; g.connect(p).connect(master); return g }
  const env = (g, at, peak, a, d) => { g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + a); g.gain.exponentialRampToValueAtTime(0.0001, at + a + d) }
  function burst(at, dest, { type = 'bandpass', f = 2000, q = 1, peak = 0.05, a = 0.002, d = 0.04, len = 0.08, sweep }) {
    const s = ctx.createBufferSource(); s.buffer = noise
    const flt = ctx.createBiquadFilter(); flt.type = type; flt.frequency.setValueAtTime(f, at); flt.Q.value = q
    if (sweep) for (const [t, v] of sweep) flt.frequency.linearRampToValueAtTime(v, at + t)
    const g = ctx.createGain(); env(g, at, peak, a, d)
    s.connect(flt).connect(g).connect(dest); s.start(at, Math.random() * 2, len)
  }
  function tone(at, dest, f, len, peak, type = 'sine', to) {
    const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, at)
    if (to) o.frequency.exponentialRampToValueAtTime(to, at + len)
    env(g, at, peak, 0.004, len); o.connect(g).connect(dest); o.start(at); o.stop(at + len + 0.05)
  }

  const key = (at, dest, heavy) => {
    burst(at, dest, { f: 2600 + Math.random() * 1800, q: 2, peak: 0.07, d: 0.03, len: 0.05 })
    tone(at, dest, heavy ? 120 : 210, 0.04, heavy ? 0.06 : 0.03, 'triangle'); counts.keys++
  }
  const whirr = (at, dest) => {
    burst(at, dest, { f: 900, q: 3, peak: 0.035, a: 0.15, d: 1.4, len: 1.7 })
    tone(at, dest, 110, 1.5, 0.025, 'sawtooth')
    for (let i = 0; i < 4; i++) burst(at + 0.3 + i * 0.32, dest, { f: 3200, q: 4, peak: 0.04, d: 0.02, len: 0.04 })
    counts.whirr++
  }
  const crunch = (at, dest) => {
    tone(at, dest, 70 + Math.random() * 20, 0.45, 0.06, 'sawtooth', 45)
    for (let i = 0; i < 6; i++) burst(at + i * 0.06, dest, { type: 'lowpass', f: 1400, peak: 0.08, d: 0.05, len: 0.07 })
    if (Math.random() < 0.5) { tone(at + 0.6, dest, 880, 0.08, 0.02, 'square'); tone(at + 0.75, dest, 880, 0.08, 0.02, 'square') }
    counts.crunch++
  }
  const ding = (at, dest) => {
    tone(at, dest, 1568, 1.1, 0.05); tone(at, dest, 3136, 0.5, 0.012)
    burst(at + 0.35, dest, { type: 'lowpass', f: 500, peak: 0.03, a: 0.1, d: 0.6, len: 0.8, sweep: [[0.7, 220]] })
    counts.ding++
  }
  const pour = (at, dest) => {
    burst(at, dest, { f: 700, q: 6, peak: 0.05, a: 0.12, d: 2.1, len: 2.4, sweep: [[2.2, 1700]] })
    for (let i = 0; i < 9; i++) tone(at + 0.15 + i * 0.22 + Math.random() * 0.08, dest, 500 + i * 70, 0.05, 0.012, 'sine', 900 + i * 90)
    counts.pour++
  }
  function car(at, w, cxPan) {
    const dir = Math.random() < 0.5 ? -1 : 1, len = 2.2 + Math.random() * 1.5
    const p = ctx.createStereoPanner(), g = ctx.createGain(); g.gain.value = w
    p.pan.setValueAtTime(clamp(-0.9 * dir + cxPan, -1, 1), at); p.pan.linearRampToValueAtTime(clamp(0.9 * dir + cxPan, -1, 1), at + len)
    g.connect(p).connect(master)
    burst(at, g, { f: 380, q: 1.2, peak: 0.09, a: len / 2, d: len / 2, len, sweep: [[len / 2, 820], [len, 300]] })
    counts.car++
    if (Math.random() < 0.06) { tone(at + len / 2, g, 415, 0.3, 0.03, 'square'); tone(at + len / 2, g, 523, 0.3, 0.02, 'square'); counts.horn++ }
  }

  // how much of each floor the camera is on: 0 when zoomed out, 1 centred on it at close-up
  function weights() {
    const z = tower.zoom, k = clamp((z - Z0) / (Z1 - Z0)), cy = tower.cam.cy, m = new Map()
    if (!k) return m
    for (const f of tower.floors) {
      const h = Math.max(20, f.y - f.top), w = k * clamp(1.4 - Math.abs(cy - (f.top + f.y) / 2) / h)
      if (w > 0.02) m.set(f.id, Math.min(1, w))
    }
    return m
  }
  const panAt = x => clamp((x - tower.cam.cx) * tower.zoom / Math.max(1, tower.canvas.clientWidth / 2), -0.85, 0.85)
  const nearX = x => clamp(1.6 - Math.abs(x - tower.cam.cx) * tower.zoom / Math.max(1, tower.canvas.clientWidth / 2), 0.15, 1)
  const every = (id, horizon, gap, fn) => {
    const now = performance.now(); let t = timers.get(id) ?? now + gap() * Math.random()
    if (t < horizon) { fn(t); t = Math.max(t, now) + gap() } timers.set(id, t)
  }
  const jammed = (s, now) => {
    if (!s?.running || s.state === 'attention') return false
    const j = s.ext?.['printer-jam'], busy = (s.agents || []).some(a => a.state !== 'done')
    if (j && now - j.mtime > JAM_MS && !((j.tool === 'Agent' || j.tool === 'Task') && busy)) return true
    return (s.agents || []).some(a => { const g = a.ext?.['printer-jam']; return g && a.state !== 'done' && now - g.mtime > JAM_MS })
  }

  function tick() {
    ctx = api.soundscape?.ctx
    if (!ctx || !tower.floors.length) return
    const g = level()
    if (!g || !tower.active) { if (master) master.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.15); return }
    graph()
    if (ctx.state !== 'running') return
    master.gain.setTargetAtTime(g, ctx.currentTime, 0.3)
    const now = performance.now(), horizon = now + TICK * 2, at = ms => ctx.currentTime + Math.max(0, ms - now) / 1000
    const W = weights(), live = new Set(), wall = Date.now()
    let street = 0, wind = 0, hiss = 0
    for (const f of tower.floors) {
      const w = W.get(f.id); if (!w) continue
      if (f.kind === 'lobby') street = Math.max(street, w)
      if (f.kind === 'roof') wind = Math.max(wind, w)
      if (f.kind === 'session') {
        for (const p of tower.people.filter(p => p.floor === f.id && p.atDesk && !p.leaving && p.state === 'tool').slice(0, 4)) {
          const id = 'k:' + p.key, slow = READING.test(p.data?.tool || ''); live.add(id)
          let t = timers.get(id) ?? now + Math.random() * 300
          let dest = null
          while (t < horizon) { if (t >= now - 20) key(at(t), dest ||= out(panAt(p.x), w * nearX(p.x)), Math.random() < 0.08); t += Math.random() < (slow ? 0.3 : 0.07) ? 400 + Math.random() * 1500 : 65 + Math.random() * 150 }
          timers.set(id, t)
        }
        const cx = IX + 426, jam = jammed(f.session, wall), id = 'p:' + f.id; live.add(id)
        const busy = f.session && f.session.state !== 'waiting' && f.session.running
        if (jam) every(id, horizon, () => 1400 + Math.random() * 2200, t => crunch(at(t), out(panAt(cx), w * nearX(cx))))
        else if (busy) every(id, horizon, () => 18000 + Math.random() * 30000, t => whirr(at(t), out(panAt(cx), w * nearX(cx) * 0.8)))
      }
      if (f.kind === 'cafe') {
        const ps = tower.people.filter(p => p.floor === f.id && p.activity === 'cafe:coffee' && !p.walking)
        const id = 'c:' + f.id
        if (ps.length || demo) { live.add(id); const x = ps[0]?.x ?? tower.spots.find(s => s.id === 'cafe:coffee')?.x ?? (f.x0 + f.x1) / 2; every(id, horizon, () => 7000 + Math.random() * 8000, t => pour(at(t), out(panAt(x), w * nearX(x)))) }
        hiss = Math.max(hiss, w * 0.4)
      }
    }
    if (street > 0.05) { live.add('street'); every('street', horizon, () => 2500 + Math.random() * 5500, t => car(at(t), street * 0.9, panAt(-40) * 0.4)) }
    const car0 = tower.car, cw = car0 && W.get(car0.at)
    if (carWas === 'moving' && car0.state !== 'moving' && cw) ding(at(now), out(panAt(car0.x), cw * nearX(car0.x)))
    carWas = car0?.state
    const windK = clamp((tower.snapshot?.weather?.wind ?? 10) / 30, 0.25, 1.4)
    beds.street.g.gain.setTargetAtTime(street * 0.18, ctx.currentTime, 0.4)
    beds.wind.g.gain.setTargetAtTime(wind * 0.09 * windK * (0.6 + 0.4 * Math.sin(now / 1900) * Math.sin(now / 700)), ctx.currentTime, 0.3)
    beds.wind.flt.frequency.setTargetAtTime(420 + 260 * (0.5 + 0.5 * Math.sin(now / 2300)), ctx.currentTime, 0.4)
    beds.hiss.g.gain.setTargetAtTime(hiss * 0.012, ctx.currentTime, 0.5)
    for (const k of timers.keys()) if (!live.has(k)) timers.delete(k)
    counts.wind = Math.round(wind * 100); counts.street = Math.round(street * 100)
    if (hint) hint.dataset.counts = JSON.stringify(counts)
    const b = api.soundscape?.button; if (b) b.dataset.floorSounds = JSON.stringify(counts)
  }
  setInterval(() => { try { tick() } catch (e) { console.error('[floor-sounds]', e) } ; paintHint() }, TICK)

  let hint = null
  function paintHint() {
    if (!hint) return
    const on = level() > 0 && api.soundscape?.ctx?.state === 'running'
    hint.style.display = on ? 'none' : 'block'
  }
  if (demo) {
    hint = document.createElement('button'); hint.id = 'floorSoundsHint'
    hint.textContent = '🔈 click for sound'
    hint.style.cssText = 'position:absolute;left:50%;bottom:22px;transform:translateX(-50%);z-index:30;font:12px ui-monospace,Menlo,monospace;' +
      'padding:6px 12px;border:2px solid #1d1d24;background:#f4e9c8;color:#2a2a33;box-shadow:3px 3px 0 #1d1d24;cursor:pointer;image-rendering:pixelated'
    hint.onclick = () => { if (!level()) api.soundscape?.button?.click() }
    document.getElementById('wrap')?.append(hint)
    tower.on('mode', on => {
      if (!on || params.has('towerzoom') || params.getAll('demo').length > 1) return
      setTimeout(() => {
        const score = f => tower.people.filter(p => p.floor === f.id && p.atDesk && p.state === 'tool').length * 2 + tower.people.filter(p => p.floor === f.id).length
        const f = tower.floors.filter(f => f.kind === 'session').sort((a, b) => score(b) - score(a))[0]
        if (f) tower.flyTo(f.id, 4)
      }, 1500)
    })
  }
}
