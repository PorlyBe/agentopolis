// The tower's frame, back to front: the city behind, the building's back layer, the people band (people, the user and
// feature items sorted by z), the front furniture, the cars' glass, the street; then the night tint, the glows, the sky
// and the weather, and finally the world scaled onto the screen with the overlay on top. The live bits of the building
// (monitors, the café's games, the racks, the call lamps, the string lights, workflow bunting) are drawn here too.
import { light } from '../features/day-night.js'
import { IX, FW, BW, GROUND, SEAT, BANNER, CAR_X, CAR_H, RACKS, rackX, CAFE, monitor, rack, plaqueBox, garageRect, frontSpans } from './building.js'
import { Z } from './registry.js'

const HUES = ['#63b3f0', '#e58ad0', '#5fd1c8', '#f4a24f', '#b996f5', '#c8d16a']
export const squeezed = f => f.open != null && f.y - f.top < 20   // too low for its plaque, which would cover the one below
export const runOf = f => { const r = f.session?.ext?.['workflow-phases']?.[0]; return r && r.status === 'running' ? r : null }

export function createRenderer(st, camera, ceo, overlay) {
  const { api, people, city, hooks, run, report, off, oc, vc } = st
  const { cam, vw, vh } = camera

  function sunInfo() {
    const d = api.daylight, hour = d?.hourNow ? d.hourNow() : new Date().getHours() + new Date().getMinutes() / 60
    const sun = d?.sunHours ? d.sunHours() : { sr: 6.5, ss: 18.5 }
    const n = d?.nightness ? d.nightness(hour) : (hour < sun.sr || hour > sun.ss ? 1 : 0)
    return { hour, sr: sun.sr, ss: sun.ss, n, gloom: d?.gloom?.() ?? 0, kind: d?.weatherKind?.() ?? st.snap?.weather?.kind, clouds: st.snap?.weather?.clouds, lightColor: light(hour).color }
  }
  function render(now) {
    const z = cam.zoom, W = vw(), H = vh(), layers = st.layers
    const v = { x0: cam.cx - W / 2 / z, y0: cam.cy - H / 2 / z }; v.x1 = v.x0 + W / z; v.y1 = v.y0 + H / z
    const ox = Math.floor(v.x0), oy = Math.floor(v.y0), ow = Math.ceil(v.x1) - ox + 1, oh = Math.ceil(v.y1) - oy + 1
    if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh }
    const c = oc
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, ow, oh); c.imageSmoothingEnabled = false
    c.setTransform(1, 0, 0, 1, -ox, -oy)
    const sun = sunInfo(), lb = layers.bounds
    const items = [], ctx = { now, view: v, sun }
    run('items', items, now, ctx)
    // people: a walker passing a piece of front furniture is drawn in front of it (with the items on it), others in the people band
    const crowd = [...people.actors.values()].filter(a => !(a.delay > 0))
    const crossers = new Set(crowd.filter(people.crossing)), passers = new Set(crowd.filter(a => !crossers.has(a) && passing(a)))
    for (const a of passers) items.push({ z: Z.FRONT + 5, draw: () => people.drawActor(c, a, now) })
    items.sort((p, q) => p.z - q.z)
    const band = (lo, hi) => { for (const it of items) if (it.z >= lo && it.z < hi) { c.save(); try { it.draw(c, now) } catch (e) { report('item', e) } c.restore() } }
    city.drawBack(c, v, now, sun.n)
    windowView(c, sun.n)
    band(-Infinity, 0)
    c.drawImage(layers.back, lb.x0, lb.y0)
    drawLive(c, now)
    band(0, 100)
    people.drawCar(c, false)
    // people, the user and feature items in the people band, back to front by z (stable, so equal z keeps insertion order)
    const zOf = a => a.z ?? (a.liftPhase === 'riding' ? Z.RIDE : a.walking ? Z.WALK : a.pose === 'desk' || a.sitting ? Z.SEATED : Z.STAND)
    const mid = crowd.filter(a => !passers.has(a) && !crossers.has(a)).map(a => ({ z: zOf(a), draw: () => people.drawActor(c, a, now) }))
    mid.push({ z: Z.SEATED + 5, draw: () => ceo.drawPaul(c, now) }, ...items.filter(it => it.z >= 100 && it.z < 200).map(it => ({ z: it.z, draw: () => { c.save(); try { it.draw(c, now) } catch (e) { report('item', e) } c.restore() } })))
    mid.sort((p, q) => p.z - q.z)
    for (const it of mid) { try { it.draw() } catch (e) { report('actor', e) } }
    c.drawImage(layers.front, lb.x0, lb.y0)
    ceo.drawDesk(c, now)
    band(200, 300)
    // the cars' glass, with express riders crossing the main shaft between the two (people.crossing)
    people.drawCar(c, true, people.car)
    for (const a of crossers) { try { people.drawActor(c, a, now) } catch (e) { report('actor', e) } }
    people.drawCar(c, true, people.xcar)
    city.drawLive(c, v, now)
    band(300, 400)
    // night: the outside darkens fully, the lit interiors only a little
    const ext = sun.n * 0.62 + sun.gloom * (1 - sun.n) * 0.6, int = sun.n * 0.2 + sun.gloom * 0.15
    const rooms = interiorRects()
    c.globalCompositeOperation = 'source-atop'
    if (ext > 0.01) {
      c.save(); c.beginPath(); c.rect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4); for (const r of rooms) c.rect(r.x, r.y + r.h, r.w, -r.h)
      c.clip('evenodd'); c.fillStyle = `rgba(14,18,44,${ext})`; c.fillRect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4); c.restore()
    }
    if (int > 0.01) { c.fillStyle = `rgba(20,22,48,${int})`; for (const r of rooms) c.fillRect(r.x, r.y, r.w, r.h) }
    c.globalCompositeOperation = 'lighter'
    if (sun.n > 0.02) { c.globalAlpha = sun.n * 0.75; c.drawImage(layers.lights, lb.x0, lb.y0); c.globalAlpha = 1 }
    drawGlow(c, now, sun.n)
    city.drawLights(c, v, now, sun.n)
    if (hooks.glow.length) { c.save(); run('glow', c, now, sun.n, ctx); c.restore(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 }
    c.globalCompositeOperation = 'destination-over'
    city.drawSky(c, v, now, sun)
    c.globalCompositeOperation = 'source-over'
    c.save(); c.beginPath(); c.rect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4); for (const r of rooms) c.rect(r.x, r.y + r.h, r.w, -r.h); c.clip('evenodd')
    city.drawWeather(c, v, now, sun.kind); c.restore()
    band(400, Infinity)
    if (hooks.post.length) { c.save(); run('post', c, now, ctx); c.restore() }

    const dpr = devicePixelRatio || 1
    vc.setTransform(dpr, 0, 0, dpr, 0, 0)
    vc.imageSmoothingEnabled = z < 1
    vc.fillStyle = '#14151c'; vc.fillRect(0, 0, W, H)
    vc.drawImage(off, 0, 0, ow, oh, (ox - v.x0) * z, (oy - v.y0) * z, ow * z, oh * z)
    try { overlay.overlay(now) } catch (e) { report('overlay', e) }
    if (hooks.overlay.length) { vc.save(); run('overlay', vc, now, ctx); vc.restore() }
  }
  // A walker whose walk neither starts nor ends behind a piece of front furniture (building.js frontSpans) walks in
  // front of it (crossing the CEO office to the waiting line, say); someone heading to or leaving a seat behind it stays behind it.
  function passing(a) {
    if (!a.walking || a.z != null || a.liftPhase === 'riding') return false
    const spans = frontSpans(st.byId.get(a.floor)); if (!spans) return false
    const inside = (x, x0, x1) => x + 8 > x0 && x - 8 < x1
    return spans.some(([x0, x1]) => inside(a.x, x0, x1) && !inside(a.sx ?? a.x, x0, x1) && !inside(a.tx ?? a.x, x0, x1))
  }
  function interiorRects() {
    const floors = st.floors
    const top = floors[floors.length - 2].top, base = floors[0]
    const rooms = [{ x: IX, y: top, w: FW, h: -top }, { x: IX, y: GROUND, w: FW, h: base.y - GROUND }, garageRect(floors)]
    // plaques are backlit too, so their names stay readable at night: the parts the rooms do not cover (no overlaps: the clip is even-odd)
    const out = [...rooms]
    for (const f of floors) if (f.kind !== 'roof') {
      const b = plaqueBox(f)
      out.push({ x: b.x, y: b.y, w: IX - b.x, h: b.h })
      let y = b.y
      for (const r of [...rooms].sort((p, q) => p.y - q.y)) {
        if (r.y + r.h <= y || r.y >= b.y + b.h) continue
        if (r.y > y) out.push({ x: IX, y, w: b.x + b.w - IX, h: r.y - y })
        y = Math.max(y, r.y + r.h)
      }
      if (y < b.y + b.h) out.push({ x: IX, y, w: b.x + b.w - IX, h: b.y + b.h - y })
    }
    return out
  }
  // ---------- live bits of the building ----------
  const working = s => s === 'tool' || s === 'thinking' || s === 'delegating' || s === 'building'
  function deskOccupant(f, k) {
    for (const a of people.actors.values()) if (a.floor === f.id && a.pose === 'desk' && (k == null ? a.kind === 'session' : a.kind === 'agent' && a.slot === k)) return a
    return null
  }
  function drawLive(c, now) {
    const car = people.car
    for (const f of st.floors) {
      if (f.kind === 'session' && !(f.y - f.top < 26)) {
        if (f.open != null) { c.save(); c.beginPath(); c.rect(IX, f.top, FW, f.y - f.top); c.clip() }
        const me = deskOccupant(f)
        monitor(c, SEAT.session + 15, f.y, me && working(me.data?.state), now)
        for (let k = 0; k < f.desks; k++) { const a = deskOccupant(f, k); monitor(c, SEAT.agent(k) + 11, f.y, a && !a.leaving && a.data?.state !== 'idle' && a.data?.state !== 'done', now, k + 1) }
        const run = runOf(f)
        if (run && f.open == null) banner(c, f, run)
        if (f.open != null) c.restore()
      }
      if (f.kind === 'cafe') {
        const tv = people.occupied('cafe:tv') > 0
        if (tv) {
          const x = CAFE.tv + 2, y = CAFE.tvY(f) + 2, t = now / 120
          c.fillStyle = '#2a3a6a'; c.fillRect(x, y, 48, 24); c.fillStyle = '#3a8a4a'; c.fillRect(x, y + 12, 48, 12)
          c.fillStyle = '#5a5a66'; c.beginPath(); c.moveTo(x + 22, y + 12); c.lineTo(x + 26, y + 12); c.lineTo(x + 40, y + 24); c.lineTo(x + 8, y + 24); c.fill()
          c.fillStyle = '#ff5a5a'; c.fillRect(x + 18 + Math.round(4 * Math.sin(now / 400)), y + 18, 4, 3); c.fillStyle = '#5ab0ff'; c.fillRect(x + 26 + Math.round(4 * Math.sin(now / 470 + 1)), y + 19, 4, 3)
          c.fillStyle = '#f2f0e6'; c.fillRect(x + 23.5, y + 12 + ((t / 6) % 1) * 10, 1, 2)
        }
        for (const [i, x] of [[0, CAFE.arcade + 2]]) if (people.occupied('cafe:arcade' + i)) {
          const tt = Math.floor(now / 200); c.fillStyle = '#7bff8a'; for (let k = 0; k < 3; k++) c.fillRect(x + 1 + k * 3 + (tt % 2), f.y - 31 + (tt % 4 > 1 ? 1 : 0), 2, 1)
          c.fillStyle = '#5ae0ff'; c.fillRect(x + 5 + Math.round(2 * Math.sin(now / 300)), f.y - 24, 2, 1)
        }
        for (const [i, x] of [[0, CAFE.pinball]]) if (people.occupied('cafe:pinball' + i)) { c.fillStyle = Math.floor(now / 120) % 2 ? '#ffd84a' : '#ff5a8a'; c.fillRect(x + 13, f.y - 34, 4, 3) }
        if (people.occupied('cafe:coffee')) for (let k = 0; k < 3; k++) {
          const p = ((now / 1400) + k / 3) % 1; c.fillStyle = `rgba(255,255,255,${0.6 * (1 - p)})`
          c.fillRect(Math.round(IX + 41 + Math.sin(p * 6 + k) * 1.5), Math.round(f.y - 31 - p * 10), 1, 2)
        }
      }
      if (f.kind === 'server') {
        const jobs = [...(st.snap?.serverRoom?.running || []), ...(st.snap?.serverRoom?.failed || []).map(j => ({ ...j, failed: true }))]
        jobs.slice(0, RACKS).forEach((j, k) => rack(c, rackX(k), f.y, j.kind, now, api.hash(j.id) % 7, j.failed))
      }
      if (f.kind === 'roof') stringLights(c, f, now, false)
      // the call lamp over each shaft door
      if (f.kind !== 'roof' && f.kind !== 'server') {
        const here = car.at === f.id && car.state !== 'moving'
        c.fillStyle = here ? '#5fd17a' : '#3a3f4a'; c.fillRect(BW - 6, f.y - 50, 4, 3)
      }
    }
  }
  // far rooftops seen from the penthouse, under the window's glass (the sky itself shows through the hole)
  function windowView(c, n) {
    const slots = st.slots
    if (!slots) return
    const w = slots.window, base = w.y + w.h, day = [143, 163, 192], night = [30, 36, 64]
    const col = (k) => { const a = day.map((v, i) => Math.round(v * (1 - k * 0.12) + (night[i] - v) * n)); return `rgb(${a})` }
    c.save(); c.beginPath(); c.rect(w.x, w.y, w.w, w.h); c.clip()
    for (let layer = 0; layer < 2; layer++) {
      let x = w.x - 6, i = 0
      while (x < w.x + w.w) {
        const h = api.hash(`pent${layer}:${i}`), bw = 10 + h % 18, bh = (layer ? 6 : 12) + (h >>> 5) % (layer ? 14 : 18)
        c.fillStyle = col(layer); c.fillRect(x, base - bh, bw, bh)
        if (!layer && (h >>> 9) % 5 === 0) c.fillRect(x + (bw >> 1), base - bh - 6, 1, 6)
        if (n > 0.3) { c.fillStyle = `rgba(255,226,150,${Math.min(1, (n - 0.3) * 2)})`; for (let k = 0; k < bw * bh / 40; k++) { const q = api.hash(`pw${layer}:${i}:${k}`); if (q % 3 === 0) c.fillRect(x + 1 + q % (bw - 2), base - bh + 2 + (q >>> 6) % Math.max(1, bh - 3), 1, 1) } }
        x += bw + 1 + (h >>> 11) % 4; i++
      }
    }
    c.restore()
  }
  function stringLights(c, f, now, glow) {
    const cols = ['#ffd27a', '#ff8a7a', '#8ad0ff', '#b8f08a']
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, x = 12 + t * (BW - 24), y = f.y - 46 + Math.sin(Math.PI * t) * 12
      if (!glow) { c.fillStyle = '#3a3438'; c.fillRect(Math.round(x), Math.round(y), 2, 1) }
      if (i % 2) continue
      const on = (Math.floor(now / 900) + i) % 7 !== 0
      if (glow) { if (on) { c.fillStyle = cols[(i / 2) % 4]; c.fillRect(Math.round(x) - 1, Math.round(y) + 1, 4, 4) } }
      else { c.fillStyle = cols[(i / 2) % 4]; c.globalAlpha = 0.7; c.fillRect(Math.round(x), Math.round(y) + 2, 2, 3); c.globalAlpha = 1 }
    }
  }
  function drawGlow(c, now, n) {
    if (n < 0.02) return
    c.globalAlpha = n
    const pool = (x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
    for (const f of st.floors) if (f.kind === 'session') {
      const me = deskOccupant(f); if (me && working(me.data?.state)) pool(SEAT.session + 17, f.y - 20, 18, '110,170,255', 0.45)
      for (let k = 0; k < f.desks; k++) { const a = deskOccupant(f, k); if (a && a.data?.state !== 'idle') pool(SEAT.agent(k) + 13, f.y - 20, 14, '110,170,255', 0.4) }
    }
    pool(CAR_X, people.car.y - CAR_H / 2, 30, '220,235,255', 0.35)
    if (people.xcar.lit > 0.02) pool(people.xcar.x, people.xcar.y - CAR_H / 2, 26, '255,236,190', 0.32 * people.xcar.lit)
    const roof = st.floors[st.floors.length - 1]
    stringLights(c, roof, now, true)
    pool(BW / 2, roof.y - 40, 160, '255,200,120', 0.12)
    c.globalAlpha = 1
  }
  function banner(c, f, run) {
    const x0 = BANNER.x0, x1 = BANNER.x1, y = f.top + 4, hue = HUES[api.hash(run.run || run.name) % HUES.length]
    c.fillStyle = '#5a5050'; c.fillRect(x0, y - 2, 1, 3); c.fillRect(x1 - 1, y - 2, 1, 3)
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x0 + 2, y + 15, x1 - x0 - 2, 2)
    c.fillStyle = '#f2e8d0'; c.fillRect(x0, y, x1 - x0, 15)
    c.fillStyle = hue; c.fillRect(x0, y, x1 - x0, 2); c.fillRect(x0, y + 13, x1 - x0, 2)
    for (let x = x0 + 6; x < x1 - 4; x += 12) { c.fillStyle = hue; c.fillRect(x, y + 15, 4, 2); c.fillRect(x + 1, y + 17, 2, 1) }
  }
  return { render }
}
