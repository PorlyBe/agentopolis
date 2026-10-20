// The tower's camera: fit (the tower beside or above the HUD cards), clamped pan and zoom, eased flights and a soft
// follow. World ↔ screen conversion lives here; the view size is read once per resize, not on each read in a frame.
import { BW, SHAFT, bounds } from './building.js'

export const MAX_ZOOM = 8

export function createCamera(st) {
  const { api, wrap, cv, people, city } = st
  const cam = { zoom: 1, cx: 0, cy: 0, auto: true }
  const sz = { w: 0, h: 0 }
  const vw = () => sz.w || wrap.clientWidth, vh = () => sz.h || wrap.clientHeight, usableH = () => Math.max(100, vh() - (api.reserveBottom || 0))
  // fit frames the tower; zooming out goes on until the whole street (every engineer's building) fits the width
  function fitBox() { const b = bounds(st.floors); return { ...b, x0: b.x0 - 6, x1: b.x1 + 6 } }
  function cityBox() { const b = fitBox(), e = city.extent(); return { ...b, x0: Math.min(b.x0, e.x0) - 24, x1: Math.max(b.x1, e.x1) + 24 } }
  // HUD cards in the bottom corners (api.hudCorners: () => { w, h } from the corner): the fit keeps the tower beside them
  // when that costs less zoom than lifting it above them
  let framed = null
  function framing(fresh) {
    const key = `${vw()}x${vh()}:${api.reserveBottom}:${st.floorKey}:${st.floors.at(-1)?.y}`, t = performance.now()
    if (!fresh && framed?.key === key && t - framed.t < 500) return framed
    const b = fitBox(), bw = b.x1 - b.x0, bh = b.y1 - b.y0, base = api.reserveBottom || 0
    const at = reserve => Math.min(vw() / bw, Math.max(100, vh() - reserve) / bh) * 0.98
    const z = at(base)
    let cw = 0, ch = 0
    for (const f of api.hudCorners || []) { const c = f(); if (c) { cw = Math.max(cw, c.w); ch = Math.max(ch, c.h) } }
    const beside = Math.min(z, (vw() - 2 * cw) / bw * 0.98), above = at(Math.max(base, ch))
    framed = !cw || (vw() - bw * z) / 2 >= cw ? { zoom: z, reserve: base }
      : beside >= above ? { zoom: beside, reserve: base } : { zoom: above, reserve: Math.max(base, ch) }
    framed.key = key; framed.t = t
    return framed
  }
  const fitZoom = () => st.floors.length ? framing().zoom : 1
  const minZoom = () => { if (!st.floors.length) return 1; const b = cityBox(); return Math.min(fitZoom(), vw() / (b.x1 - b.x0) * 0.98) }
  function fit() {
    flight = null; following = null
    if (!st.floors.length) return
    const b = fitBox(), f = framing(true)
    cam.zoom = f.zoom; cam.auto = true
    cam.cx = (b.x0 + b.x1) / 2; cam.cy = (b.y0 + b.y1) / 2 + f.reserve / 2 / cam.zoom
  }
  function clampCam() {
    if (!st.floors.length) return
    const b = cityBox(), z = cam.zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, cam.zoom)), hw = vw() / 2 / z
    cam.cx = b.x1 - b.x0 <= 2 * hw ? (b.x0 + b.x1) / 2 : Math.max(b.x0 + hw, Math.min(b.x1 - hw, cam.cx))
    // zoomed out past the tower's fit, the basement stays at the bottom and the sky grows above
    if (z < fitZoom() - 1e-6) cam.cy = b.y1 - (usableH() - vh() / 2) / z
    else cam.cy = Math.max(b.y0, Math.min(b.y1, cam.cy))
  }
  function zoomAt(z, sx = vw() / 2, sy = vh() / 2) {
    const w = toWorld(sx, sy)
    cam.zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, z)); cam.auto = false
    cam.cx = w.x - (sx - vw() / 2) / cam.zoom; cam.cy = w.y - (sy - vh() / 2) / cam.zoom
    clampCam()
  }
  // flyTo / follow: an eased flight, then (when following) a soft chase of the person
  let flight = null, following = null
  function flyTo(t, z) {
    const f = typeof t === 'string' ? st.byId.get(t) : null
    if (!f && !(t && Number.isFinite(t.x) && Number.isFinite(t.y))) return false
    const p = f ? { x: (BW + SHAFT) / 2, y: (f.top + f.y) / 2 + 6 } : t
    const zf = f ? Math.min(vw() / (BW + SHAFT + 60), usableH() / ((f.y - f.top) * 2.6)) : Math.max(cam.zoom, 3)
    const zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, z ?? zf))
    flight = { t: 0, from: { cx: cam.cx, cy: cam.cy, zoom: cam.zoom }, to: { cx: p.x, cy: p.y, zoom } }
    cam.auto = false
    return true
  }
  function follow(id, z) {
    following = id ? people.find(id)?.key || null : null
    if (following) { const a = people.actors.get(following); flyTo({ x: a.x, y: people.yOf(a) - 16 }, z ?? Math.max(cam.zoom, 3.5)) }
  }
  function step(dt) {
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 0.7)
      const e = flight.t < 0.5 ? 2 * flight.t ** 2 : 1 - (-2 * flight.t + 2) ** 2 / 2, { from, to } = flight
      if (following) { const a = people.actors.get(following); if (a) { to.cx = a.x; to.cy = people.yOf(a) - 16 } }
      cam.zoom = from.zoom + (to.zoom - from.zoom) * e; cam.cx = from.cx + (to.cx - from.cx) * e; cam.cy = from.cy + (to.cy - from.cy) * e
      if (flight.t >= 1) flight = null
      clampCam(); return
    }
    if (!following) return
    const a = people.actors.get(following)
    if (!a || a.fade != null) { following = null; return }
    const k = 1 - Math.exp(-dt * 5)
    cam.cx += (a.x - cam.cx) * k; cam.cy += (people.yOf(a) - 16 - cam.cy) * k
    clampCam()
  }
  const toWorld = (sx, sy) => ({ x: cam.cx + (sx - vw() / 2) / cam.zoom, y: cam.cy + (sy - vh() / 2) / cam.zoom })
  const toScreen = (x, y) => [(x - cam.cx) * cam.zoom + vw() / 2, (y - cam.cy) * cam.zoom + vh() / 2]
  function size() { sz.w = wrap.clientWidth; sz.h = wrap.clientHeight; const dpr = devicePixelRatio || 1; cv.width = Math.round(vw() * dpr); cv.height = Math.round(vh() * dpr) }
  new ResizeObserver(() => { if (!st.active) return; size(); if (cam.auto) fit(); else clampCam() }).observe(wrap)

  return {
    cam, vw, vh, fit, clampCam, zoomAt, flyTo, follow, step, toWorld, toScreen, size, fitZoom,
    get following() { return following },
    get flying() { return !!flight },
    // a drag or the wheel takes the camera back from a flight (and a drag from a follow too)
    stop(unfollow = true) { flight = null; if (unfollow) following = null },
  }
}
