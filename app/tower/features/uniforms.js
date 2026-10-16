// uniforms: everyone wears the language they are working in — the file type of their latest Edit/Write in the last
// few minutes, else of their latest Read (server/features/uniforms.mjs). Rust a crab on the head, TypeScript/JavaScript a
// blue cap with a yellow brim, Python a snake scarf, Go gopher ears, Swift an orange bird badge, Kotlin a purple beanie,
// SQL a database-cylinder hat, docs reading glasses, CSS a paint-splashed beret, shell a hard hat. Drawn in sprite pixels
// through api.wear (people.js), so it follows facing, sitting and the elevator. ?demo=uniforms cycles every outfit.

const WINDOW = 5 * 60_000
export const LANGS = ['rust', 'ts', 'python', 'go', 'swift', 'kotlin', 'sql', 'docs', 'css', 'shell']

// Body geometry is the same in every character sheet (only hair differs): the first torso row per [row][frame].
const Y0 = [[17, 18, 17, 21, 21, 21, 22], [17, 18, 17, 18, 18, 18, 19], [20, 19, 20, 20, 20, 20, 21]]
const tops = new Map()
// the sprite's first opaque row (the top of the hair) for this palette, row and frame
function headTop(api, palette, row, frame) {
  let t = tops.get(palette)
  if (!t) {
    const im = api.img['char' + palette]; if (!im?.width) return Y0[row][frame] - 15
    const cv = document.createElement('canvas'); cv.width = im.width; cv.height = im.height
    const x = cv.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0)
    const d = x.getImageData(0, 0, im.width, im.height).data
    t = []
    for (let r = 0; r < 3; r++) for (let f = 0; f < 7; f++) {
      let top = Y0[r][f] - 15
      scan: for (let y = 0; y < 32; y++) for (let k = 0; k < 16; k++) if (d[((r * 32 + y) * im.width + f * 16 + k) * 4 + 3] >= 128) { top = y; break scan }
      t.push(top)
    }
    tops.set(palette, t)
  }
  return t[row * 7 + frame]
}
// g: { row 0 front | 1 back | 2 side (facing +x), frame, H hair top, y0 first torso row, side, back }
export function geo(api, p, { row, frame }) {
  const H = headTop(api, p.look?.palette ?? 0, row, frame), y0 = Y0[row][frame]
  return { row, frame, H, y0, side: row === 2, back: row === 1, front: row === 0 }
}

const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(x, y, w, h) }

const DRAW = {
  rust(c, g, now) {
    const cx = g.side ? 8 : 7, y = g.H - 1, s = Math.floor(now / 320) % 2
    R(c, '#a8391a', cx - 3, y + 2, 1); R(c, '#a8391a', cx + 4, y + 2, 1)             // legs
    R(c, '#e4572e', cx - 3, y, 8, 2); R(c, '#f28c5c', cx - 2, y - 1, 6, 1)
    R(c, '#e4572e', cx - 4, y - 1, 1, 1); R(c, '#e4572e', cx + 5, y - 1, 1, 1)        // arms
    R(c, '#e4572e', cx - 6, y - 3 + s, 3, 2); R(c, '#fde0d0', cx - 5, y - 3 + s, 1, 1)  // claws, snapping
    R(c, '#e4572e', cx + 5, y - 2 - s, 3, 2); R(c, '#fde0d0', cx + 6, y - 2 - s, 1, 1)
    if (!g.back) { R(c, '#2b1a12', cx - 1, y - 2, 1, 1); R(c, '#2b1a12', cx + 2, y - 2, 1, 1) }
  },
  ts(c, g) {
    const y = g.H
    R(c, '#235a97', 3, y, 10, 3); R(c, '#3178c6', 4, y - 1, 8, 3); R(c, '#4a90dc', 5, y - 1, 3, 1); R(c, '#f7df1e', 7, y - 2, 2, 1)
    if (g.side) { R(c, '#f7df1e', 10, y + 2, 6, 1); R(c, '#c9b20f', 10, y + 3, 5, 1) }
    else if (g.front) { R(c, '#f7df1e', 2, y + 3, 12, 1); R(c, '#c9b20f', 3, y + 4, 10, 1) }
    else R(c, '#f7df1e', 6, y + 2, 4, 1)
  },
  python(c, g, now) {
    const y = g.y0 - 1, x0 = g.side ? 5 : 3, w = g.side ? 7 : 10
    for (let k = 0; k < w; k++) R(c, ((k + 1) >> 1) % 2 ? '#ffd43b' : '#3776ab', x0 + k, y, 1, 2)
    const tx = g.side ? 4 : g.back ? 4 : 10, flick = Math.floor(now / 500) % 3 === 0
    R(c, '#3776ab', tx, y + 2, 2, 1); R(c, '#ffd43b', tx, y + 3, 2, 1); R(c, '#3776ab', tx, y + 4, 2, 2)
    if (!g.back) { R(c, '#0d1b2a', tx + 1, y + 4, 1, 1); if (flick) R(c, '#e0303a', tx + 1, y + 6, 1, 1) }
  },
  go(c, g) {
    const ear = x => { R(c, '#2a7f96', x, g.H, 3, 3); R(c, '#7fd3e6', x, g.H - 1, 3, 3); R(c, '#bfeaf4', x + 1, g.H, 1, 1) }
    if (g.side) { ear(4); ear(9) } else { ear(1); ear(12) }
  },
  swift(c, g) {
    if (g.back) return
    const x = g.side ? 8 : 3, y = g.y0 + 1
    R(c, '#c93a24', x, y, 3, 3); R(c, '#f05138', x, y, 3, 2); R(c, '#fff', x + 1, y + 1, 1, 1); R(c, '#ffd0c6', x, y, 1, 1)
  },
  kotlin(c, g) {
    const y = g.H, x = g.side ? 3 : 2
    R(c, '#7f52ff', x + 1, y - 1, 10, 1); R(c, '#7f52ff', x, y, 12, 3); R(c, '#9b7bff', x + 2, y, 3, 1)
    R(c, '#c757bc', x - 1, y + 3, 14, 2); R(c, '#e24462', x - 1, y + 4, 14, 1)
    R(c, '#e24462', x + 5, y - 3, 2, 2); R(c, '#ff8aa0', x + 5, y - 3, 1, 1)
  },
  sql(c, g) {
    const cx = g.side ? 9 : 8, y = g.H - 4
    R(c, '#36507a', cx - 6, y + 6, 12, 1)
    R(c, '#4f6d9a', cx - 4, y, 8, 6); R(c, '#36507a', cx - 4, y + 2, 8, 1); R(c, '#36507a', cx - 4, y + 4, 8, 1)
    R(c, '#8fb0dc', cx - 3, y - 1, 6, 1); R(c, '#b9d0ee', cx - 4, y, 8, 1); R(c, '#6d8cbc', cx - 3, y + 1, 1, 4)
  },
  docs(c, g) {
    if (g.back) return
    const ink = '#1d1d26', lens = 'rgba(200,230,255,.55)'
    if (g.side) { const y = g.y0 - 5; R(c, lens, 11, y, 3, 2); R(c, ink, 10, y - 1, 5, 1); R(c, ink, 10, y + 2, 5, 1); R(c, ink, 14, y, 1, 2); R(c, ink, 6, y - 1, 4, 1); return }
    const y = g.y0 - 3
    for (const x of [3, 9]) { R(c, lens, x + 1, y, 3, 2); R(c, ink, x, y - 1, 5, 1); R(c, ink, x, y + 2, 5, 1); R(c, ink, x, y, 1, 2); R(c, ink, x + 4, y, 1, 2) }
  },
  css(c, g) {
    const y = g.H + 1, x = g.side ? 2 : 1
    R(c, '#1a3aa8', x, y + 1, 14, 2); R(c, '#264de4', x + 1, y, 13, 2); R(c, '#264de4', x + 3, y - 1, 9, 1); R(c, '#1a3aa8', 9, y - 2, 1, 1)
    R(c, '#e44d26', x + 3, y, 2, 1); R(c, '#f7df1e', x + 9, y - 1, 1, 1); R(c, '#3fb950', x + 11, y + 1, 1, 1); R(c, '#fff', x + 6, y + 1, 1, 1)
  },
  shell(c, g) {
    const y = g.H
    R(c, '#c99a06', 3, y, 10, 3); R(c, '#f5c518', 4, y - 1, 8, 3); R(c, '#ffe066', 5, y - 1, 2, 1); R(c, '#c99a06', 7, y - 2, 2, 4)
    if (g.side) R(c, '#c99a06', 2, y + 2, 15, 1); else R(c, '#c99a06', 1, y + 2, 14, 1)
  },
}

export function langOfPerson(p, now = Date.now()) {
  const u = p.data?.ext?.uniforms; if (!u) return null
  if (u.edit && now - u.edit.at < WINDOW && DRAW[u.edit.lang]) return u.edit.lang
  if (u.read && now - u.read.at < WINDOW && DRAW[u.read.lang]) return u.read.lang
  return null
}

export default function init(api, tower) {
  const demo = api.demo('uniforms')
  const wear = (c, p, info) => {
    const lang = langOfPerson(p); if (!lang) return
    DRAW[lang](c, geo(api, p, info), info.now)
  }
  wear.layer = 10
  const list = api.wear || (api.wear = [])
  list.push(wear); list.sort((a, b) => (a.layer || 0) - (b.layer || 0))

  if (!demo) return
  const SHOWN = LANGS.filter(l => !['rust', 'swift', 'kotlin'].includes(l))   // the demo keeps to the screenshot stack
  tower.on('snapshot', data => {
    const now = Date.now(), k = Math.floor(now / 5000)
    const put = (x, i) => { x.ext = x.ext || {}; x.ext.uniforms = { edit: { lang: SHOWN[(k + i) % SHOWN.length], at: now } } }
    let i = 0
    for (const s of data.sessions || []) { put(s, i++); for (const g of s.agents || []) put(g, i++) }
  })
}
