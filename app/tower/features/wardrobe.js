// wardrobe: the model a session or subagent runs on picks its outfit — Opus a suit jacket and tie, Sonnet a smart-casual
// shirt with rolled sleeves, Haiku a hoodie, anything else a lab coat; a 1M context window adds a lanyard badge. The model
// is the latest assistant turn's (server/features/wardrobe.mjs, else context-meter's). When it changes, a dust puff with
// sparkles hides a quick change. A colour layer over the torso, under the uniforms accessories. ?demo=wardrobe swaps
// models every few seconds.
import { geo } from './uniforms.js'

const PUFF = 900, SWAP = 320
const MODELS = ['claude-opus-4-1', 'claude-sonnet-4-5', 'claude-haiku-4-5', 'claude-fable-1']
const BASE = { suit: [44, 54, 84], smart: [134, 178, 218], hoodie: [124, 132, 146], lab: [232, 236, 241] }
export const outfitOf = m => !m ? null : /opus/i.test(m) ? 'suit' : /sonnet/i.test(m) ? 'smart' : /haiku/i.test(m) ? 'hoodie' : 'lab'
const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
const blob = (c, x, y, r) => { for (let dy = -r; dy <= r; dy++) { const w = Math.round(Math.sqrt(r * r - dy * dy)); c.fillRect(Math.round(x - w), Math.round(y + dy), w * 2, 1) } }

export default function init(api, tower) {
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('wardrobe')
  const seen = new Map()       // person key -> { outfit, from, at }
  const garments = new Map()   // `${outfit}:${row}:${frame}` -> canvas
  let ref = null               // char_0's pixels: the body every sheet shares

  function pixels() {
    if (ref) return ref
    const im = api.img.char0; if (!im?.width) return null
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height
    const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0)
    return (ref = { w: im.width, d: x.getImageData(0, 0, im.width, im.height).data })
  }
  // char_0's torso pixels repainted in the outfit's colour, its own shading kept in four steps; its hands stay bare
  function garment(outfit, row, frame, y0) {
    const key = `${outfit}:${row}:${frame}`
    if (garments.has(key)) return garments.get(key)
    const px = pixels(); if (!px) return null
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 32
    const x = cv.getContext('2d'), out = x.createImageData(16, 32), [br, bg, bb] = BASE[outfit]
    const rows = outfit === 'lab' ? 8 : 6, holding = (row === 0 && frame >= 5)
    for (let y = y0; y < Math.min(32, y0 + (holding ? 2 : rows)); y++) for (let k = 0; k < 16; k++) {
      if (row === 2 && frame >= 5 && k > 11) continue
      const i = ((row * 32 + y) * px.w + frame * 16 + k) * 4, [r, g, b, a] = [px.d[i], px.d[i + 1], px.d[i + 2], px.d[i + 3]]
      if (a < 128) continue
      const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / 255 / (1 - Math.abs(2 * l - 1))
      if (r > g && g > b && r - b > 40 && s > 0.25 && l > 0.25 && l < 0.85) continue        // skin
      const lum = (r + g + b) / 3, f = lum < 50 ? 0.5 : lum < 120 ? 0.92 : lum < 190 ? 1.05 : 1.15
      const o = (y * 16 + k) * 4
      out.data[o] = Math.min(255, br * f); out.data[o + 1] = Math.min(255, bg * f); out.data[o + 2] = Math.min(255, bb * f); out.data[o + 3] = 255
    }
    x.putImageData(out, 0, 0)
    garments.set(key, cv)
    return cv
  }

  function details(c, outfit, g, big) {
    const { y0, side, back, front } = g
    if (outfit === 'suit' && !back) {
      if (side) { R(c, '#f2f2f2', 9, y0, 1, 1); R(c, '#c0392b', 9, y0 + 1, 1, 3) }
      else { R(c, '#f2f2f2', 6, y0, 4, 1); R(c, '#f2f2f2', 6, y0 + 1, 1, 1); R(c, '#f2f2f2', 9, y0 + 1, 1, 1); R(c, '#c0392b', 7, y0, 2, 1); R(c, '#a52a1f', 7, y0 + 1, 2, 3); R(c, '#c0392b', 7, y0 + 4, 2, 1) }
    }
    if (outfit === 'smart') {
      const cuff = '#e3eef8'
      if (side) R(c, cuff, 7, y0 + 2, 2, 1)
      else { R(c, cuff, 1, y0 + 3, 3, 1); R(c, cuff, 12, y0 + 3, 3, 1); if (front) { R(c, '#fff', 5, y0, 2, 1); R(c, '#fff', 9, y0, 2, 1) } }
    }
    if (outfit === 'hoodie') {
      const dk = '#5e6573'
      if (back) { R(c, dk, 4, y0 - 1, 8, 2); R(c, dk, 5, y0 + 1, 6, 1); R(c, dk, 6, y0 + 2, 4, 1) }
      else if (side) { R(c, dk, 5, y0 - 1, 2, 3) }
      else { R(c, dk, 3, y0 - 1, 2, 2); R(c, dk, 11, y0 - 1, 2, 2); R(c, '#f2f2f2', 6, y0 + 1, 1, 2); R(c, '#f2f2f2', 9, y0 + 1, 1, 2); R(c, dk, 5, y0 + 4, 6, 1) }
    }
    if (outfit === 'lab' && !back) {
      if (side) R(c, '#b9c2cf', 9, y0, 1, 6)
      else { R(c, '#7fa8d6', 7, y0, 2, 4); R(c, '#b9c2cf', 6, y0, 1, 5); R(c, '#b9c2cf', 9, y0, 1, 5); R(c, '#b9c2cf', 10, y0 + 2, 2, 1); R(c, '#2f6fd6', 11, y0 + 1, 1, 1) }
    }
    if (big) {
      const strap = '#d9433b'
      if (back) R(c, strap, 5, y0, 6, 1)
      else if (side) { R(c, strap, 8, y0, 1, 2); R(c, '#fafafa', 8, y0 + 2, 2, 3); R(c, '#4a7fd6', 8, y0 + 2, 2, 1) }
      else { R(c, strap, 5, y0, 1, 1); R(c, strap, 6, y0 + 1, 1, 1); R(c, strap, 10, y0, 1, 1); R(c, strap, 9, y0 + 1, 1, 1); R(c, '#fafafa', 7, y0 + 2, 3, 3); R(c, '#4a7fd6', 7, y0 + 2, 3, 1) }
    }
  }

  const modelOf = p => { const e = p.data?.ext; return e?.wardrobe?.model || e?.['context-meter']?.model || null }
  const bigOf = p => { const e = p.data?.ext; return e?.wardrobe ? !!e.wardrobe.big : (e?.['context-meter']?.window ?? 0) >= 1_000_000 }
  function stateOf(p, now) {
    const outfit = outfitOf(modelOf(p)), s = seen.get(p.key)
    if (!s) { const n = { outfit, from: null, at: 0 }; seen.set(p.key, n); return n }
    if (s.outfit !== outfit) { s.from = s.outfit; s.outfit = outfit; s.at = now }
    return s
  }

  const dress = (c, p, info) => {
    const s = stateOf(p, info.now), t = info.now - s.at
    const outfit = s.at && t < SWAP ? s.from : s.outfit; if (!outfit) return
    const g = geo(api, p, info), cv = garment(outfit, info.row, info.frame, g.y0)
    if (cv) c.drawImage(cv, 0, 0)
    details(c, outfit, g, bigOf(p))
  }
  dress.layer = 0
  const puff = (c, p, info) => {
    const s = seen.get(p.key); if (!s?.at) return
    const t = (info.now - s.at) / PUFF; if (t >= 1 || t < 0) return
    const cx = 8, cy = 20, h = api.hash(p.key)
    c.save()
    for (let k = 0; k < 9; k++) {
      const a = k / 9 * Math.PI * 2 + h % 7, r = 3 + t * 9, s2 = Math.max(1, Math.round(5 * (1 - t) + (k % 3)))
      c.fillStyle = `rgba(236,230,218,${0.9 * (1 - t)})`
      c.fillRect(Math.round(cx + Math.cos(a) * r - s2 / 2), Math.round(cy + Math.sin(a) * r * 1.3 - s2 / 2 - t * 4), s2, s2)
    }
    if (t < 0.5) {
      const k = 1 - t / 0.5
      c.fillStyle = `rgba(250,246,238,${0.97 * k})`
      for (const [bx, by, r] of [[8, 21, 6], [4, 17, 4], [12, 16, 4], [5, 25, 4], [11, 25, 4], [8, 13, 4]]) blob(c, bx + (bx - 8) * t, by - t * 3, Math.round(r * (1 + t * 0.6)))
    }
    for (let k = 0; k < 4; k++) {
      if ((Math.floor(info.now / 90) + k) % 3 === 0) continue
      const sx = 1 + (h >> (k * 3)) % 14, sy = 6 + (h >> (k * 4 + 1)) % 20 - Math.round(t * 6)
      c.fillStyle = '#ffe36b'; c.fillRect(sx, sy - 1, 1, 3); c.fillRect(sx - 1, sy, 3, 1); c.fillStyle = '#fff'; c.fillRect(sx, sy, 1, 1)
    }
    c.restore()
  }
  puff.layer = 20
  const list = api.wear || (api.wear = [])
  list.push(dress, puff); list.sort((a, b) => (a.layer || 0) - (b.layer || 0))

  tower.on('sync', () => {
    const live = new Set(tower.people.map(p => p.key))
    for (const k of seen.keys()) if (!live.has(k)) seen.delete(k)
  })

  if (!demo) return
  tower.on('snapshot', data => {
    const k = Math.floor(Date.now() / 6000)
    let i = 0
    const put = x => { const n = (k + i * 3 + (i >> 1)) % MODELS.length; x.ext = x.ext || {}; x.ext.wardrobe = { model: MODELS[n], big: (k + i) % 3 === 0 }; i++ }
    for (const s of data.sessions || []) { put(s); for (const g of s.agents || []) put(g) }
  })
}
