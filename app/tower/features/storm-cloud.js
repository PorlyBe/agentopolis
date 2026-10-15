// storm-cloud: when the user's last prompts to a session read grumpy (snap ext['storm-cloud'] { level 1..3, word, at,
// since } from server/features/storm-cloud.mjs), a little rain cloud parks under that floor's ceiling and rains on the
// desk; level 3 is dark with thunder flicker. A thanks/perfect/nice (ext.clear) or ~20 min of calm parts it: the sun
// peeks through for a while. Hover the cloud. ?demo=stormcloud cycles one floor through drizzle, storm, thunder and sun.
const CALM_MS = 20 * 60_000, SUN_MS = 45_000, FADE_MS = 1500
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const TONE = { 1: ['#e9edf2', '#c9d0da', '#aab4c2'], 2: ['#9aa3b2', '#7d8696', '#646c7c'], 3: ['#5c6270', '#474c58', '#353943'] }
const ago = ms => ms < 60_000 ? 'just now' : ms < 3600_000 ? Math.round(ms / 60_000) + 'm' : Math.round(ms / 3600_000) + 'h'

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('stormcloud')
  const clouds = new Map()   // session id -> { level, word, at, since, t0, gone?, sun? }
  let first = true, flown = false

  tower.on('sync', data => {
    const now = Date.now(), t = performance.now(), live = new Set()
    for (const s of data.sessions) {
      const x = s.ext?.['storm-cloud']; if (!x) continue
      live.add(s.id)
      const cur = clouds.get(s.id)
      const raining = x.level > 0 && now - x.at < CALM_MS
      if (raining) {
        if (!cur || cur.sun || cur.gone) clouds.set(s.id, { level: x.level, word: x.word, at: x.at, since: x.since, t0: t })
        else Object.assign(cur, { level: x.level, word: x.word, at: x.at, since: x.since })
      } else if (cur && !cur.sun && !cur.gone) {
        Object.assign(cur, { sun: t, cleared: x.clear ? 'thanks' : 'calm' })
      } else if (!cur && first && x.clear?.was && now - x.clear.at < SUN_MS) {
        clouds.set(s.id, { level: x.clear.was, word: x.clear.word, at: x.clear.at, since: x.clear.at, t0: t - FADE_MS, sun: t, cleared: 'thanks' })
      }
    }
    for (const [id, c] of clouds) if (!live.has(id) && !c.sun) c.sun = t, c.cleared = 'calm'
    first = false
    if (demo && !flown && clouds.size && !params.get('towerzoom')) {
      flown = true
      setTimeout(() => { const id = clouds.keys().next().value, d = tower.desk(id); if (d) tower.flyTo({ x: d.seat + 20, y: d.floor.y - 20 }, 5) }, 600)
    }
  })
  tower.on('step', (dt, now) => { for (const [id, c] of clouds) if (c.sun && now - c.sun > SUN_MS) clouds.delete(id) })

  const geo = id => {
    const d = tower.desk(id), f = d?.floor
    if (!f || f.open != null && f.open < 1) return null
    return { f, cx: d.seat + 22, top: f.top + 15, deskY: d.desk.y }
  }

  // ---------- the cloud ----------
  const SHAPE = [
    '..........hhhh..................',
    '........hhhhhhhh....hhhh........',
    '...hhh.hhhhhhhhhh.hhhhhhhh......',
    '..hhhhhhhhhhhhhhhhhhhhhhhhhhh...',
    '.hhhhhhhhhhhhhhhmmhhhhhhhhhhhh..',
    'hmmhhhhhhhhhhhmmmmmhhhhhhhhhhhh.',
    'mmmmmmhhhhhmmmmmmmmmmmhhhhhmmmmm',
    'mmmmmmmmmmmmmmmmmmmmmmmmmmmmmmmm',
    'lmmmmmmmmmmmmmmmmmmmmmmmmmmmmmml',
    '.llllllllllllllllllllllllllllll.',
  ]
  function puff(c, g, lvl, a, now, shift = 0) {
    const [hi, mid, lo] = TONE[lvl] || TONE[1], x0 = g.cx - 16 + shift + Math.round(Math.sin(now / 1800) * 1.5), y0 = g.top
    c.globalAlpha = a
    SHAPE.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] !== '.') R(c, row[i] === 'h' ? hi : row[i] === 'm' ? mid : lo, x0 + i, y0 + j, 1, 1) })
    c.globalAlpha = 1
  }
  function rain(c, g, lvl, a, now) {
    const n = lvl === 1 ? 5 : lvl === 2 ? 9 : 13, len = g.deskY - (g.top + 10), col = lvl === 1 ? '#8fb2d8' : '#6f98c8'
    c.globalAlpha = a * 0.85
    for (let i = 0; i < n; i++) {
      const h = api.hash('rain' + i), sp = 60 + h % 40, ph = ((now / 1000) * sp + (h >>> 8) % len) % len
      R(c, col, g.cx - 13 + (h >>> 4) % 27, g.top + 10 + ph, 1, 2 + (lvl > 1 ? 1 : 0))
    }
    for (let i = 0; i < Math.ceil(n / 4); i++) {   // splashes on the desk
      const h = api.hash('spl' + i + Math.floor(now / 260)), sx = g.cx - 12 + h % 25
      R(c, col, sx - 1, g.deskY - 1, 1, 1); R(c, col, sx + 1, g.deskY - 1, 1, 1)
    }
    c.globalAlpha = 1
  }
  const flash = now => { const k = Math.floor(now / 90) % 60; return k === 0 || k === 2 || k === 31 }
  function bolt(c, g, now) {
    if (!flash(now)) return
    const s = api.hash('b' + Math.floor(now / 5400)), x0 = g.cx - 6 + s % 12
    let x = x0, y = g.top + 10
    c.fillStyle = '#fff3a0'
    for (let i = 0; i < 6; i++) { c.fillRect(x, y, 1, 3); y += 3; x += ((s >>> i) & 1) ? 1 : -1 }
  }
  function sun(c, g, k, now) {
    const x = g.cx + 6, y = g.top + 4, a = Math.min(1, k * 15) * Math.min(1, (1 - k) * 4)
    c.globalAlpha = a
    for (let i = 0; i < 8; i++) {
      const an = i * Math.PI / 4 + now / 3000, r = 8 + (Math.floor(now / 300) + i) % 2
      R(c, '#ffd86a', x + Math.cos(an) * r, y + Math.sin(an) * r, 1, 1)
    }
    R(c, '#f7b733', x - 4, y - 3, 9, 7); R(c, '#f7b733', x - 3, y - 4, 7, 9); R(c, '#ffd86a', x - 3, y - 3, 6, 6); R(c, '#fff2b8', x - 2, y - 2, 2, 2)
    c.globalAlpha = 1
  }

  tower.on('items', (out, now) => {
    for (const [id, cl] of clouds) {
      const g = geo(id); if (!g) continue
      const k = cl.sun ? (now - cl.sun) / SUN_MS : 0
      const a = Math.min(1, (now - cl.t0) / FADE_MS) * (cl.sun ? Math.max(0, 1 - k * 2.2) : 1)
      if (cl.sun) out.push({ z: Z.WALL + 6, draw: c => sun(c, g, k, now) })
      if (a <= 0) continue
      const part = cl.sun ? Math.round(k * 40) : 0
      if (!cl.sun) out.push({ z: Z.STAND + 6, draw: c => { rain(c, g, cl.level, a, now); if (cl.level >= 3) bolt(c, g, now) } })
      out.push({ z: Z.STAND + 7, draw: c => { puff(c, g, cl.level, a, now, -part) } })
    }
  })
  tower.on('glow', (c, now, n) => {
    for (const [id, cl] of clouds) {
      if (cl.sun || cl.level < 3 || !flash(now)) continue
      const g = geo(id); if (!g) continue
      c.fillStyle = `rgba(200,220,255,${0.18 + 0.25 * n})`; c.fillRect(tower.interior.x0, g.f.top, tower.interior.x1 - tower.interior.x0, g.f.y - g.f.top)
    }
  })
  tower.on('post', (c, now) => {
    for (const [id, cl] of clouds) {
      if (cl.sun || cl.level < 3 || !flash(now)) continue
      const g = geo(id); if (!g) continue
      c.fillStyle = 'rgba(235,240,255,.16)'; c.fillRect(tower.interior.x0, g.f.top, tower.interior.x1 - tower.interior.x0, g.f.y - g.f.top)
    }
  })

  tower.on('hover', (w, person) => {
    if (person) return null
    for (const [id, cl] of clouds) {
      const g = geo(id); if (!g || w.x < g.cx - 17 || w.x > g.cx + 17 || w.y < g.top - 2 || w.y > g.top + 13) continue
      const s = tower.snapshot?.sessions?.find(x => x.id === id)
      const word = cl.word ? ` — '${esc(cl.word)}'` : ''
      if (cl.sun) return `<div class="t">☀ ${cl.cleared === 'thanks' ? 'sunny again' : 'blown over'}${word}</div><div class="m">${esc(s?.title || '')}</div>`
      return `<div class="t">${cl.level >= 3 ? '⛈' : '☁'} grumpy since ${ago(Date.now() - cl.since)}${word}</div><div class="m">${esc(s?.title || '')} · ${['', 'drizzle', 'rain', 'thunderstorm'][cl.level]} · a thanks or 20 calm minutes clears it</div>`
    }
    return null
  })

  // ---------- ?demo=stormcloud ----------
  if (!demo) return
  const WORDS = [[1, 'why'], [2, 'ugh'], [3, 'wtf'], [0, null]]
  let d0 = 0
  tower.on('snapshot', data => {
    const now = Date.now(); d0 ||= now
    const ss = data.sessions.filter(s => s.running !== false); if (!ss.length) return
    const ph = Math.floor((now - d0) / 9000) % 4, [level, word] = WORDS[ph], s = ss[0]
    s.ext = { ...s.ext, 'storm-cloud': level ? { level, word, at: now - 30_000, since: d0 } : { level: 0, clear: { at: now - 2000, was: 3, word: 'wtf' } } }
    if (ss[2]) ss[2].ext = { ...ss[2].ext, 'storm-cloud': { level: 2, word: 'no no', at: now - 4 * 60_000, since: now - 7 * 60_000 } }
  })
}
