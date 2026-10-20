// cosplay: on the Japan skin everyone comes dressed up as a generic archetype — a magical girl (pink twin-tails, a star
// wand), a ninja (hood and mask), a samurai (topknot, lacquered shoulder plates), a kitsune mask, cat ears and a tail, a
// maid, a sailor-collar school uniform, a mecha pilot suit or a yukata. Each person keeps theirs (a hash of their key).
// A costume replaces the model's outfit (wardrobe.js) and the language hat (uniforms.js) while it is worn; wardrobe's
// quick-change puff still plays. Drawn in sprite pixels through api.wear, like them, so it follows facing, sitting and
// the elevator. ?demo=cosplay shows every costume on any skin, rotating every 5 s.
import { geo } from './uniforms.js'

export const COSTUMES = ['magical', 'ninja', 'samurai', 'kitsune', 'cat', 'maid', 'sailor', 'mecha', 'yukata']
const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
const hex = h => [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16))
// the body each costume recolours: [colour of the top, rows of it from the first torso row, colour of the rest down to the feet]
const BODY = {
  magical: ['#f48ac0', 8], ninja: ['#2e3248', 7, '#262a3c'], samurai: ['#3a3e5e', 7, '#4a4a68'], kitsune: ['#f4f0e8', 7, '#c8302a'],
  maid: ['#2a2a34', 9], sailor: ['#f4f4f0', 7], mecha: ['#eef0f4', 7, '#e2e6ee'], yukata: ['#2c3a6a', 7, '#2c3a6a'],
}

export default function init(api, tower) {
  const demo = api.demo('cosplay')
  const sheets = new Map(), cache = new Map()
  function pixels(palette) {
    let s = sheets.get(palette); if (s) return s
    const im = api.img['char' + palette]; if (!im?.width) return null
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height
    const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0)
    sheets.set(palette, s = { w: im.width, d: x.getImageData(0, 0, im.width, im.height).data })
    return s
  }
  // a 16x32 overlay of one sprite frame's pixels, recoloured: keep(x, y, r, g, b) picks them, base gives the colour, and
  // each pixel's own lightness shades it in four steps (outlines stay dark)
  function recolour(key, palette, row, frame, base, keep) {
    if (cache.has(key)) return cache.get(key)
    const px = pixels(palette); if (!px) return null
    const cv = document.createElement('canvas'); cv.width = 16; cv.height = 32
    const x = cv.getContext('2d'), out = x.createImageData(16, 32), [br, bg, bb] = hex(base)
    for (let y = 0; y < 32; y++) for (let k = 0; k < 16; k++) {
      const i = ((row * 32 + y) * px.w + frame * 16 + k) * 4, r = px.d[i], g = px.d[i + 1], b = px.d[i + 2]
      if (px.d[i + 3] < 128 || !keep(k, y, r, g, b)) continue
      const lum = (r + g + b) / 3, f = lum < 50 ? 0.45 : lum < 120 ? 0.85 : lum < 190 ? 1 : 1.12, o = (y * 16 + k) * 4
      out.data[o] = Math.min(255, br * f); out.data[o + 1] = Math.min(255, bg * f); out.data[o + 2] = Math.min(255, bb * f); out.data[o + 3] = 255
    }
    x.putImageData(out, 0, 0)
    cache.set(key, cv); if (cache.size > 600) cache.delete(cache.keys().next().value)
    return cv
  }
  const isSkin = (r, g, b) => { const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 510, s = mx === mn ? 0 : (mx - mn) / 255 / (1 - Math.abs(2 * l - 1)); return r > g && g > b && r - b > 40 && s > 0.25 && l > 0.25 && l < 0.85 }
  // the clothes: char 0's body (every sheet shares it) from the first torso row down; reading frames hold a sheet, so
  // only the shoulders change there, and the side reading frames keep the arm out front
  function body(name, info, g) {
    const [top, rows, low] = BODY[name], holding = info.row === 0 && info.frame >= 5, rf = `${info.row}:${info.frame}`
    const cloth = (k, y, r, gg, b) => y >= g.y0 && !isSkin(r, gg, b) && !(info.row === 2 && info.frame >= 5 && k > 11)
    const out = [recolour(`b:${name}:${rf}`, 0, info.row, info.frame, top, (k, y, r, gg, b) => cloth(k, y, r, gg, b) && y < g.y0 + (holding ? 2 : rows))]
    if (low && !holding) out.push(recolour(`l:${name}:${rf}`, 0, info.row, info.frame, low, (k, y, r, gg, b) => cloth(k, y, r, gg, b) && y >= g.y0 + rows))
    return out
  }
  // the hair, recoloured into a wig or a hood: everything above the face, and the sides beside it
  function hair(name, p, info, g, col) {
    const pal = p.look?.palette ?? 0, faceTop = g.y0 - 6
    return recolour(`h:${name}:${pal}:${info.row}:${info.frame}:${col}`, pal, info.row, info.frame, col, (k, y) => y < g.y0 && (g.back || y < faceTop || (g.side ? k <= 6 : k <= 2 || k >= 13)))
  }

  // ---------- the costumes' details, in sprite pixels (side = facing +x) ----------
  const twinTails = (c, g, col, now) => {
    const sway = Math.floor(now / 380) % 2, y = g.y0 - 9
    const tail = (x, dir) => { for (let i = 0; i < 12; i++) R(c, i % 4 === 3 ? '#d86aa4' : col, x + (i > 6 ? dir * (i > 9 ? 1 + sway : sway) : 0), y + i, 2, 1); R(c, '#f4d03a', x, y - 1, 2, 2) }
    if (g.side) tail(2, -1); else { tail(0, -1); tail(14, 1) }
  }
  const star = (c, x, y, now) => {
    R(c, '#f4d03a', x - 1, y, 3, 1); R(c, '#f4d03a', x, y - 1, 1, 3); R(c, '#fff6c0', x, y, 1, 1)
    if (Math.floor(now / 300) % 3 === 0) { R(c, '#ffffff', x + 2, y - 2, 1, 1); R(c, '#ffffff', x - 2, y + 2, 1, 1) }
  }
  const ears = (c, g, outer, inner) => {   // two pointed ears, tips leaning out
    const one = (x, right) => { R(c, outer, x, g.H - 1, 4, 1); R(c, outer, x + (right ? 1 : 0), g.H - 2, 3, 1); R(c, outer, x + (right ? 2 : 0), g.H - 3, 2, 1); R(c, outer, x + (right ? 3 : 0), g.H - 4, 1, 1); R(c, inner, x + 1 + (right ? 1 : 0), g.H - 2, 1, 2) }
    if (g.side) { one(3, false); one(9, true) } else { one(1, false); one(11, true) }
  }
  const DETAIL = {
    magical(c, g, now) {
      const y = g.y0
      if (!g.back) { if (g.side) R(c, '#e83a6a', 10, y, 2, 2); else { R(c, '#ffffff', 5, y, 6, 1); R(c, '#e83a6a', 6, y + 1, 2, 2); R(c, '#e83a6a', 9, y + 1, 2, 2); R(c, '#b82a52', 8, y + 1, 1, 2) } }
      if (g.frame < 3 || g.frame > 6) {                                              // a flared skirt with a white frill
        const x0 = g.side ? 4 : 3, w = g.side ? 8 : 10
        R(c, '#f48ac0', x0, y + 7, w, 2); R(c, '#ffffff', x0 - 1, y + 9, w + 2, 1); R(c, '#d86aa4', x0, y + 8, w, 1)
      }
      if (g.back) return
      if (g.side) { R(c, '#c8a060', 11, y + 2, 4, 1); star(c, 15, y + 2, now) } else { R(c, '#c8a060', 14, y - 1, 1, 6); star(c, 14, y - 2, now) }
    },
    ninja(c, g) {
      const y = g.y0
      R(c, '#a8302a', g.side ? 5 : 3, y + 6, g.side ? 7 : 10, 1)                                   // the sash
      if (g.back) { R(c, '#a8302a', 6, g.y0 - 8, 4, 1); R(c, '#a8302a', 9, g.y0 - 7, 2, 3); return }   // the headband's knot
      if (g.side) { R(c, '#262a3c', 8, y - 3, 7, 3); R(c, '#262a3c', 9, y - 7, 6, 2) }               // the mask over the face, the hood's brow
      else { R(c, '#262a3c', 3, y - 3, 10, 3); R(c, '#262a3c', 3, y - 7, 10, 2); R(c, '#a8302a', 3, y - 7, 10, 1) }
    },
    samurai(c, g) {
      const y = g.y0, plate = (x, w) => { for (let r = 0; r < 4; r++) R(c, r % 2 ? '#2a1a1a' : '#a82a2a', x, y + r, w, 1); R(c, '#e8c060', x, y, w, 1) }
      if (g.side) plate(5, 4); else { plate(1, 3); plate(12, 3) }                                  // sode: laced shoulder plates
      if (!g.back && !g.side) { R(c, '#8a2a2a', 5, y + 1, 6, 4); for (let r = 0; r < 2; r++) R(c, '#e8c060', 5, y + 2 + r * 2, 6, 1) }
      R(c, '#1a1a22', 6, g.H - 1, 4, 1); R(c, '#1a1a22', g.side ? 5 : 7, g.H - 3, 3, 2); R(c, '#e8e0d0', g.side ? 8 : 6, g.H - 2, 1, 1)   // the topknot and its tie
      if (g.side) { R(c, '#1a1a22', 3, y + 4, 1, 1); R(c, '#1a1a22', 2, y + 3, 1, 1); R(c, '#c8a040', 4, y + 5, 1, 1) }   // the sword's hilt behind
      else if (!g.back) { R(c, '#1a1a22', 2, y + 5, 1, 3); R(c, '#c8a040', 2, y + 5, 1, 1) }
    },
    kitsune(c, g) {
      const y = g.y0
      ears(c, g, '#fbf8f2', '#d8302a')
      R(c, '#c8302a', g.side ? 5 : 3, y, g.side ? 6 : 10, 1)                                       // the haori's red trim
      if (g.back) { R(c, '#c8302a', 3, y - 5, 10, 1); return }                                      // the mask's cord
      const W = '#fbf8f2', RED = '#d8302a', E = '#1a1a22'
      if (g.side) { R(c, W, 8, y - 7, 6, 6); R(c, W, 14, y - 4, 2, 2); R(c, RED, 9, y - 6, 1, 3); R(c, E, 11, y - 5, 2, 1); R(c, E, 15, y - 4, 1, 1) }
      else {
        R(c, W, 3, y - 7, 10, 6); R(c, W, 5, y - 1, 6, 1)
        R(c, RED, 4, y - 6, 1, 2); R(c, RED, 11, y - 6, 1, 2); R(c, RED, 7, y - 7, 2, 1)
        R(c, E, 5, y - 4, 2, 1); R(c, E, 9, y - 4, 2, 1); R(c, E, 7, y - 2, 2, 1)
      }
    },
    cat(c, g, now) {
      ears(c, g, '#2a2226', '#f0a0b8')
      const y = g.y0 + 6, s = Math.floor(now / 420) % 2, T = '#2a2226'
      if (g.side) { R(c, T, 4, y, 1, 1); R(c, T, 3, y - 1, 1, 1); R(c, T, 2, y - 3 + s, 1, 3); R(c, T, 3 - s, y - 4, 1, 1) }
      else { const x = g.back ? 8 : 13; R(c, T, x, y, 1, 1); R(c, T, x + 1, y - 1, 1, 1); R(c, T, x + 2, y - 4 + s, 1, 4); R(c, T, x + 1 + s, y - 5, 1, 1) }
      if (!g.back && !g.side) { R(c, '#2a2226', 3, g.y0 - 2, 2, 1); R(c, '#2a2226', 11, g.y0 - 2, 2, 1) }   // whiskers drawn on
      if (!g.back) { R(c, '#d8302a', g.side ? 7 : 5, g.y0, g.side ? 4 : 6, 1); R(c, '#f4c43a', g.side ? 10 : 7, g.y0 + 1, 2, 1) }   // a collar and its bell
    },
    maid(c, g) {
      const y = g.y0
      R(c, '#ffffff', g.side ? 4 : 2, g.H + 1, g.side ? 8 : 12, 1)                                   // the frilled headband
      for (let x = g.side ? 4 : 2; x < (g.side ? 12 : 14); x += 2) R(c, '#ffffff', x, g.H, 1, 1)
      if (g.back) { R(c, '#ffffff', 6, y + 5, 4, 2); R(c, '#ffffff', 5, y + 4, 1, 1); R(c, '#ffffff', 10, y + 4, 1, 1); return }   // the apron's bow
      if (g.side) { R(c, '#ffffff', 10, y + 2, 2, 7); R(c, '#ffffff', 8, y, 2, 1) }
      else { R(c, '#ffffff', 5, y, 6, 1); R(c, '#ffffff', 5, y + 2, 6, 7); R(c, '#e8e8f0', 5, y + 8, 6, 1); R(c, '#d8303a', 7, y, 2, 1) }
    },
    sailor(c, g) {
      const y = g.y0, NAVY = '#2a3a6a'
      if (g.frame < 3 || g.frame > 6) { R(c, NAVY, g.side ? 4 : 3, y + 7, g.side ? 8 : 10, 3); for (let x = g.side ? 5 : 4; x < (g.side ? 12 : 13); x += 2) R(c, '#1a2648', x, y + 8, 1, 2) }   // a pleated skirt
      if (g.back) { R(c, NAVY, 3, y, 10, 4); R(c, '#ffffff', 3, y + 3, 10, 1); return }               // the big square collar
      if (g.side) { R(c, NAVY, 5, y, 4, 2); R(c, '#d8303a', 10, y + 1, 2, 2) }
      else { R(c, NAVY, 3, y, 4, 2); R(c, NAVY, 9, y, 4, 2); R(c, '#ffffff', 3, y + 1, 3, 1); R(c, '#ffffff', 10, y + 1, 3, 1); R(c, '#d8303a', 7, y + 1, 2, 2); R(c, '#d8303a', 6, y + 3, 1, 1); R(c, '#d8303a', 9, y + 3, 1, 1) }
    },
    mecha(c, g) {
      const y = g.y0, B = '#3a6ad8', O = '#f08a2a'
      if (g.side) { R(c, B, 6, y, 4, 2); R(c, O, 7, y + 3, 2, 1); R(c, '#4a4e5a', 9, g.y0 - 8, 2, 3); R(c, O, 10, g.y0 - 11, 1, 3) }
      else {
        R(c, B, 2, y, 3, 2); R(c, B, 11, y, 3, 2); R(c, O, 7, y, 2, 6); R(c, B, 5, y + 5, 6, 1)
        R(c, '#4a4e5a', 0, g.y0 - 8, 2, 3); R(c, '#4a4e5a', 14, g.y0 - 8, 2, 3); R(c, O, 15, g.y0 - 11, 1, 3)   // the headset and its antenna
      }
    },
    yukata(c, g) {
      const y = g.y0
      for (let k = 0; k < 9; k++) R(c, '#c8d4f0', (g.side ? 5 : 3) + (k * 5) % (g.side ? 7 : 10), y + 1 + (k * 3) % 10, 1, 1)   // a scatter of white flowers
      R(c, '#d8402a', g.side ? 5 : 3, y + 5, g.side ? 7 : 10, 2)                                    // the obi
      if (g.back) { R(c, '#d8402a', 5, y + 4, 6, 4); R(c, '#f06a4a', 7, y + 5, 2, 2) }               // its bow
      else if (!g.side) { R(c, '#f4f0e6', 6, y, 1, 3); R(c, '#f4f0e6', 9, y, 1, 3); R(c, '#f4f0e6', 7, y + 3, 2, 1) }   // the crossed collar
      R(c, '#f06a8a', g.side ? 4 : 11, g.H + 2, 2, 2); R(c, '#ffd84a', g.side ? 4 : 11, g.H + 2, 1, 1)   // a flower in the hair
    },
  }
  const WIG = { magical: '#f48ac0', ninja: '#2e3248', samurai: '#26262e' }

  const mixed = h => { h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); return (h ^ h >>> 15) >>> 0 }   // ids share long prefixes
  const active = () => demo || api.theme?.skin === 'japan'
  const people = []                                                         // the demo's order, for even coverage
  const costumeOf = p => !p?.key || !active() ? null
    : demo ? COSTUMES[((people.indexOf(p.key) + 1 || api.hash(p.key) % 9 + 1) - 1 + Math.floor(Date.now() / 5000)) % COSTUMES.length]
      : COSTUMES[mixed(api.hash(p.key)) % COSTUMES.length]
  api.costume = costumeOf                                                   // wardrobe.js and uniforms.js stand down while one is worn

  const wear = (c, p, info) => {
    const name = costumeOf(p); if (!name) return
    const g = geo(api, p, info)
    g.frame = info.frame
    if (BODY[name]) for (const cv of body(name, info, g) || []) if (cv) c.drawImage(cv, 0, 0)
    if (WIG[name]) { const cv = hair(name, p, info, g, WIG[name]); if (cv) c.drawImage(cv, 0, 0) }
    if (name === 'magical') twinTails(c, g, WIG.magical, info.now)
    DETAIL[name](c, g, info.now)
  }
  wear.layer = 5
  const list = api.wear || (api.wear = [])
  list.push(wear); list.sort((a, b) => (a.layer || 0) - (b.layer || 0))

  if (!demo) return
  tower.on('sync', () => { people.length = 0; for (const p of tower.people) people.push(p.key) })
  let flown = false
  tower.on('layout', floors => {
    if (flown || api.params.get('towerzoom')) return
    const f = floors.filter(f => f.kind === 'session').sort((a, b) => (b.session?.agents?.length || 0) - (a.session?.agents?.length || 0))[0]
    if (f) { flown = true; setTimeout(() => tower.flyTo(f.id, 3.2), 800) }
  })
}
