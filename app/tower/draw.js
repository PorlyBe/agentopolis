// draw: small drawing helpers the tower features share, so a fix lands once instead of in every copy.

// a filled rect snapped to whole world pixels (fractional x/y would be drawn anti-aliased)
export const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }

// is world point w inside rect r (grown by pad on every side)? A missing rect is never hit.
export const inR = (w, r, pad = 0) => r && w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad

// a stable pseudo-random 0..1 for a number: the same k always gives the same value
export const rnd = k => { const s = Math.sin(k * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s) }

// quadratic ease-in-out over t 0..1
export const easeInOut = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2

// a 3x5 pixel font: each glyph is five rows of three bits, the high bit on the left
const FONT = {
  A: [2, 5, 7, 5, 5], B: [6, 5, 6, 5, 6], C: [3, 4, 4, 4, 3], D: [6, 5, 5, 5, 6], E: [7, 4, 6, 4, 7], F: [7, 4, 6, 4, 4], G: [3, 4, 5, 5, 3],
  H: [5, 5, 7, 5, 5], I: [7, 2, 2, 2, 7], J: [1, 1, 1, 5, 2], K: [5, 5, 6, 5, 5], L: [4, 4, 4, 4, 7], M: [5, 7, 7, 5, 5], N: [6, 5, 5, 5, 5],
  O: [2, 5, 5, 5, 2], P: [6, 5, 6, 4, 4], Q: [2, 5, 5, 6, 3], R: [6, 5, 6, 5, 5], S: [3, 4, 2, 1, 6], T: [7, 2, 2, 2, 2], U: [5, 5, 5, 5, 7],
  V: [5, 5, 5, 5, 2], W: [5, 5, 7, 7, 5], X: [5, 5, 2, 5, 5], Y: [5, 5, 2, 2, 2], Z: [7, 1, 2, 4, 7], 0: [7, 5, 5, 5, 7], 1: [2, 6, 2, 2, 7],
  2: [6, 1, 2, 4, 7], 3: [6, 1, 2, 1, 6], 4: [5, 5, 7, 1, 1], 5: [7, 4, 6, 1, 6], 6: [3, 4, 7, 5, 7], 7: [7, 1, 1, 2, 2], 8: [7, 5, 7, 5, 7],
  9: [7, 5, 7, 1, 6], '-': [0, 0, 7, 0, 0], '.': [0, 0, 0, 0, 2], '/': [1, 1, 2, 4, 4], ':': [0, 2, 0, 2, 0], '+': [0, 2, 7, 2, 0], '!': [2, 2, 2, 0, 2],
  '_': [0, 0, 0, 0, 7], '@': [2, 5, 7, 4, 3],
}
// its width in px at scale k (glyphs are 3 wide with a 1 px gap)
export const textW = (s, k = 1) => String(s).length * 4 * k - k
export function pixText(c, s, x, y, col, k = 1) {
  c.fillStyle = col
  for (const ch of String(s).toUpperCase()) {
    const g = FONT[ch]
    if (g) for (let r = 0; r < 5; r++) for (let b = 0; b < 3; b++) if (g[r] & (4 >> b)) c.fillRect(Math.round(x) + b * k, Math.round(y) + r * k, k, k)
    x += 4 * k
  }
}
