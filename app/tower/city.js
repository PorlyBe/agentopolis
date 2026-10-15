// The city around the tower: sky (real sun and weather), a hazy skyline, the street, and the GitHub engineers'
// buildings either side: a shopfront with their name, and one floor per open PR stacked on it (the PR's number on a plate,
// drafts dimmer), the tallest nearest the tower. A floor whose PR's CI failed is on fire, smoke rising from it, and the
// fire truck parks in front with its hose on it; a running build blinks the floor's lamp and puffs from the chimney.
import { BW, SHAFT, STREET_L, GROUND } from './building.js'

const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
const SHOP = 40, STOREY = 26, MAX_PRS = 12
const STYLES = [['#9a5a48', '#7a4436', '#c48a6a'], ['#b8a27e', '#97835f', '#d8c6a0'], ['#8c8f98', '#6f727c', '#b0b4bc'], ['#5f8a8c', '#4a6e70', '#8ab4b4'], ['#6a6f86', '#53586c', '#9095ac'], ['#a07858', '#80603f', '#c8a07c']]
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t))
const rgb = a => `rgb(${a[0]},${a[1]},${a[2]})`
// the street's colours; features/themes.js swaps them through setTheme
export const CLASSIC = {
  id: 'classic', styles: STYLES, skyFar: '#9fb2cc', skyNear: '#8799b6', skyWin: '255,236,170', soil: '#4a3a2e', pebble: '#56443a',
  walk: '#b9b4ab', walkLine: '#a29d94', road: '#3d3f47', lane: '#d8c25a', curb: '#8a867e', curbLine: '#6a665e',
  post: '#3a3d46', bulb: '#e8e0c0', lampGlow: '255,220,150', trunk: '#5a3e2a', leaf: '#3f7a44', leafHi: '#56994f', winLit: 'rgba(255,205,110,.85)',
  dayTop: [91, 143, 208], dayHz: [183, 211, 238], nightTop: [8, 12, 32], nightHz: [30, 40, 82],
}

export function createCity(api) {
  let buildings = [], key = '', repo = null, P = CLASSIC
  const backdrop = []                                  // (c, v, now, n) painters between the far skyline and the street
  const behind = []                                    // (c, v, now, n) painters in front of the sky, behind the far skyline
  const cache = new Map()
  const LEFT0 = STREET_L - 14, RIGHT0 = BW + SHAFT + 34
  const shown = e => [...e.prs].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0)).slice(0, MAX_PRS).sort((a, b) => a.n - b.n)

  function setStreet(street) {
    repo = street?.repo || null
    const eng = (street?.engineers || []).slice(0, 12)
    const k = eng.map(e => `${e.login}:${e.level > 0}:${e.contrib?.commits12w ?? '-'}:${shown(e).map(p => `${p.n}${p.draft ? 'd' : ''}${p.ci || ''}`).join(',')}`).join('|')
    if (k === key) return
    key = k
    const ranked = eng.map(e => ({ e, prs: shown(e) })).sort((a, b) => b.prs.length - a.prs.length || b.e.level - a.e.level || (b.e.contrib?.score || 0) - (a.e.contrib?.score || 0))
    let left = LEFT0, right = RIGHT0
    buildings = ranked.map(({ e, prs }, i) => {
      const h = api.hash(e.login), w = (7 + h % 4) * 16, gap = 18 + (h >>> 3) % 3 * 8
      let x0
      if (i % 2 === 0) { x0 = left - w; left = x0 - gap } else { x0 = right; right = x0 + w + gap }
      const fire = prs.map((p, j) => p.ci === 'failed' && !p.draft ? j : -1).filter(j => j >= 0)
      return { e, x0, w, prs, more: e.prs.length - prs.length, floors: prs.length + 1, h: SHOP + prs.length * STOREY + 3, cols: Math.floor((w - 30) / 20),
        style: h % STYLES.length, seed: h, fire, burning: fire.length > 0, ci: prs.some(p => p.ci === 'running') || e.ciRunning > 0, quiet: !prs.length && !(e.level > 0) }
    })
  }

  // floor j (0 = the first above the shopfront): its band, its windows, its number plate
  const storey = (b, j) => ({ x: b.x0, y: -SHOP - (j + 1) * STOREY, w: b.w, h: STOREY })
  const wins = (b, j) => { const y = storey(b, j).y + 7, x0 = b.x0 + 28 + Math.floor((b.w - 30 - b.cols * 20) / 2); return Array.from({ length: b.cols }, (_, k) => ({ x: x0 + k * 20, y })) }
  const plate = (b, j) => ({ x: b.x0 + 5, y: storey(b, j).y + 10, w: 19, h: 7 })
  function sprite(b) {
    const k = `${P.id}|${b.e.login}|${b.w}|${b.quiet}|${b.prs.map(p => p.n + (p.draft ? 'd' : '')).join(',')}`
    if (cache.has(k)) return cache.get(k)
    const cv = document.createElement('canvas'); cv.width = b.w + 8; cv.height = b.h + 30
    const c = cv.getContext('2d'); c.translate(4 - b.x0, b.h + 30)    // y = 0 is the street
    const [body, dark, trim] = P.styles[b.style % P.styles.length], top = -b.h
    R(c, body, b.x0, top, b.w, b.h); R(c, dark, b.x0 + b.w - 4, top, 4, b.h); R(c, trim, b.x0, top, b.w, 3)
    R(c, trim, b.x0 - 2, top - 3, b.w + 4, 4)                                                // the parapet
    b.prs.forEach((p, j) => {
      const s = storey(b, j)
      R(c, dark, b.x0, s.y + s.h - 1, b.w, 1)
      for (const { x, y } of wins(b, j)) {
        R(c, dark, x - 1, y - 1, 14, 16)
        if (p.draft) { R(c, '#8fa6ba', x, y, 12, 14); R(c, '#a9bccc', x + 1, y + 1, 3, 5); R(c, '#7a90a6', x, y + 9, 12, 5) }
        else { R(c, '#f6d27a', x, y, 12, 14); R(c, '#e8b85a', x, y + 10, 12, 4) }
        R(c, dark, x + 5, y, 1, 14)
      }
      const q = plate(b, j)
      R(c, '#5a4220', q.x, q.y, q.w, q.h); R(c, p.draft ? '#9a8a6a' : '#c9a25a', q.x + 1, q.y + 1, q.w - 2, q.h - 2)
    })
    // the ground floor: a shopfront with a door and the name board above it
    R(c, dark, b.x0, -SHOP - 1, b.w, 2)
    R(c, dark, b.x0 + 4, -30, b.w - 8, 30); R(c, '#2a3040', b.x0 + 8, -26, b.w - 16, 26)
    R(c, '#7fa0bc', b.x0 + 10, -24, b.w / 2 - 14, 22); R(c, '#5a4030', b.x0 + b.w / 2 + 6, -24, 14, 24)
    R(c, '#3b2617', b.x0 + b.w / 2 - 44, -40, 88, 13); R(c, '#ecdcb4', b.x0 + b.w / 2 - 42, -38, 84, 9)
    // roof furniture: a water tank or an antenna mast, a chimney
    const rx = b.x0 + 26 + b.seed % Math.max(1, b.w - 60)
    if (b.seed % 2) { R(c, '#6a5040', rx, top - 20, 16, 14); R(c, '#8a6a50', rx, top - 20, 16, 2); R(c, '#4a3a2c', rx + 2, top - 6, 2, 3); R(c, '#4a3a2c', rx + 12, top - 6, 2, 3) }
    R(c, '#5a5f6a', b.x0 + b.w - 18, top - 26, 2, 23); R(c, '#5a5f6a', b.x0 + b.w - 22, top - 18, 10, 1)
    R(c, '#7a7068', b.x0 + 10, top - 12, 8, 9)
    if (b.quiet) { c.fillStyle = 'rgba(28,32,52,.28)'; c.fillRect(b.x0 - 2, top - 30, b.w + 4, b.h + 30) }
    cache.set(k, cv); if (cache.size > 60) cache.delete(cache.keys().next().value)
    return cv
  }

  // ---------- skyline (far, hazy, parallax) ----------
  const SKY_W = 1400
  const makeSkyline = () => {
    const cv = document.createElement('canvas'); cv.width = SKY_W; cv.height = 260
    const c = cv.getContext('2d'), wins = []
    let x = 0, i = 0
    while (x < SKY_W) {
      const h = api.hash('sky' + i), w = 34 + h % 60, ht = 70 + (h >>> 4) % 170, far = (h >>> 9) % 2
      c.fillStyle = far ? P.skyFar : P.skyNear; c.fillRect(x, 260 - ht, w, ht)
      if ((h >>> 12) % 4 === 0) c.fillRect(x + w / 2 - 1, 260 - ht - 16, 2, 16)
      for (let wy = 260 - ht + 8; wy < 250; wy += 12) for (let wx = x + 5; wx < x + w - 6; wx += 9) if (api.hash(`w${i}:${wx}:${wy}`) % 7 === 0) wins.push([wx, wy - 260])
      x += w + (h >>> 7) % 10; i++
    }
    return { cv, wins }
  }
  let skyline = makeSkyline()
  function setTheme(t) { const n = t ? { ...CLASSIC, ...t } : CLASSIC; if (n.id === P.id) return; P = n; skyline = makeSkyline() }
  const skyX = v => (v.x0 + v.x1) / 2 * 0.55

  // ---------- drawing ----------
  function drawBack(c, v, now, n = 0) {
    const sx = skyX(v)
    for (const fn of behind) { c.save(); try { fn(c, v, now, n) } catch (e) { console.error('[city:behind]', e) } c.restore() }
    for (let k = Math.floor((v.x0 - sx) / SKY_W); k * SKY_W + sx < v.x1; k++) {
      c.drawImage(skyline.cv, Math.round(k * SKY_W + sx), -260)
      // far windows sit behind the near buildings, so they are lit here and the night tint only dims them
      if (n > 0.05) { c.fillStyle = `rgba(${P.skyWin},${n})`; for (const [x, y] of skyline.wins) c.fillRect(Math.round(k * SKY_W + sx + x), y, 2, 3) }
    }
    for (const fn of backdrop) { c.save(); try { fn(c, v, now, n) } catch (e) { console.error('[city:backdrop]', e) } c.restore() }
    // the ground: sidewalk, road, curb, then soil
    const x0 = Math.floor(v.x0) - 2, w = Math.ceil(v.x1 - v.x0) + 4
    R(c, P.soil, x0, GROUND, w, Math.max(0, v.y1 - GROUND))
    c.fillStyle = P.pebble; for (let gx = Math.floor(x0 / 37) * 37; gx < x0 + w; gx += 37) for (let gy = GROUND + 10; gy < v.y1; gy += 23) { const h = api.hash(`${gx}:${gy}`); c.fillRect(gx + h % 20, gy + (h >>> 5) % 12, 4 + h % 4, 2) }
    R(c, P.walk, x0, 0, w, 4); c.fillStyle = P.walkLine; for (let gx = Math.floor(x0 / 24) * 24; gx < x0 + w; gx += 24) c.fillRect(gx, 0, 1, 4)
    R(c, P.road, x0, 4, w, 10); c.fillStyle = P.lane; for (let gx = Math.floor(x0 / 32) * 32; gx < x0 + w; gx += 32) c.fillRect(gx, 9, 14, 1)
    R(c, P.curb, x0, 14, w, 4); R(c, P.curbLine, x0, 17, w, 1)
    for (const b of buildings) if (b.x0 < v.x1 && b.x0 + b.w > v.x0) c.drawImage(sprite(b), b.x0 - 4, -b.h - 30)
    // street lamps and trees, kept clear of the tower and its door
    for (let k = Math.floor(v.x0 / 160) - 1; k * 160 < v.x1 + 160; k++) {
      const lx = k * 160 + 40, tx = k * 160 + 118
      if (lx < LEFT0 - 10 || lx > RIGHT0 - 10) { R(c, P.post, lx, -48, 2, 48); R(c, P.post, lx, -48, 8, 2); R(c, P.bulb, lx + 5, -46, 4, 2) }
      if (tx < LEFT0 - 20 || tx > RIGHT0) {
        R(c, P.trunk, tx + 6, -16, 3, 16)
        c.fillStyle = P.leaf; c.fillRect(tx, -34, 15, 18); c.fillRect(tx + 2, -38, 11, 24); c.fillStyle = P.leafHi; c.fillRect(tx + 3, -35, 6, 6)
      }
    }
  }
  // Moving bits outside: a running build's chimney puff and floor lamp, burning floors, the fire truck and its water.
  let hover = null                                     // { b, j }: the floor under the mouse, outlined
  function drawLive(c, v, now) {
    for (const b of buildings) {
      if (b.x0 > v.x1 + 80 || b.x0 + b.w < v.x0 - 80) continue
      const top = -b.h
      if (b.ci) {
        R(c, Math.floor(now / 600) % 2 ? '#ff4a4a' : '#5a1a1a', b.x0 + b.w - 18, top - 28, 2, 2)
        for (let i = 0; i < 5; i++) {
          const p = ((now / 2600) + i / 5) % 1, r = 2 + p * 5
          c.fillStyle = `rgba(225,225,232,${0.55 * (1 - p)})`
          c.beginPath(); c.arc(b.x0 + 14 + Math.sin(p * 5 + i) * 3 + p * 10, top - 14 - p * 34, r, 0, Math.PI * 2); c.fill()
        }
        b.prs.forEach((p, j) => { if (p.ci === 'running') { const q = plate(b, j); R(c, Math.floor(now / 500) % 2 ? '#ffb347' : '#8a5a1e', q.x + q.w + 1, q.y + 2, 2, 2) } })
      }
      for (const j of b.fire) burn(c, b, j, now)
      if (b.burning) truck(c, b, now)
      if (hover?.b === b && hover.j >= 0) { const s = storey(b, hover.j); c.strokeStyle = 'rgba(255,236,160,.9)'; c.lineWidth = 1; c.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1) }
    }
  }
  function flame(c, x, y, w, h, now, seed) {
    for (let i = 0; i < w; i += 2) {
      const f = Math.abs(Math.sin(now / 110 + i * 1.7 + seed)) * h * 0.6 + h * 0.4
      R(c, '#e8452a', x + i, y - f, 2, f); R(c, '#ff8a3a', x + i, y - f * 0.7, 2, f * 0.7); if (i % 4 === 0) R(c, '#ffd84a', x + i, y - f * 0.35, 2, f * 0.35)
    }
  }
  function burn(c, b, j, now) {   // flames out of this floor's windows, soot above them, smoke rising from it past the roof
    const s = storey(b, j), rise = s.y + b.h + 70
    for (let i = 0; i < 8; i++) {
      const p = ((now / 3400) + i / 8 + j * 0.13) % 1, r = 3 + p * 12
      c.fillStyle = `rgba(52,48,54,${0.55 * (1 - p)})`
      c.beginPath(); c.arc(b.x0 + b.w * 0.55 + Math.sin(p * 4 + i + j) * 6 + p * 24, s.y + 4 - p * rise, r, 0, Math.PI * 2); c.fill()
    }
    wins(b, j).forEach(({ x, y }, k) => {
      R(c, 'rgba(40,24,20,.55)', x - 1, y - 4, 14, 3)
      R(c, '#7a2a14', x, y, 12, 14); R(c, '#ff8a3a', x + 1, y + 6, 10, 8)
      flame(c, x, y + 14, 12, 18, now, k * 3 + j)
    })
  }
  function truck(c, b, now) {
    const tx = b.x0 + b.w / 2 - 28, ty = 14
    R(c, '#b8262a', tx, ty - 16, 56, 12); R(c, '#d8383a', tx, ty - 16, 56, 2); R(c, '#b8262a', tx + 40, ty - 22, 16, 8)
    R(c, '#9fd0ff', tx + 46, ty - 21, 8, 5); R(c, '#e8e8f0', tx + 4, ty - 10, 34, 1)
    R(c, Math.floor(now / 250) % 2 ? '#ff3a3a' : '#3a7aff', tx + 44, ty - 24, 4, 2)
    for (const wx of [tx + 8, tx + 44]) { R(c, '#1a1a1e', wx, ty - 4, 8, 6); R(c, '#8a8a92', wx + 3, ty - 2, 2, 2) }
    // the hose works each burning floor in turn
    const j = b.fire[Math.floor(now / 3000) % b.fire.length], ws = wins(b, j), w = ws[Math.floor(ws.length / 2)] || { x: b.x0 + b.w / 2, y: storey(b, j).y }
    const target = { x: w.x + 6, y: w.y + 6 }, nx = tx + 12, ny = ty - 18
    const dx = target.x - nx, dy = target.y - ny, len = Math.hypot(dx, dy), reach = Math.min(40, len * 0.3)
    const ex = nx + dx / len * reach, ey = ny + dy / len * reach
    c.strokeStyle = '#c9ced6'; c.lineWidth = 3; c.beginPath(); c.moveTo(nx, ny); c.lineTo(ex, ey); c.stroke()
    c.fillStyle = '#9aa0aa'; for (let i = 1; i < 6; i++) c.fillRect(Math.round(nx + dx / len * reach * i / 6) - 2, Math.round(ny + dy / len * reach * i / 6), 4, 1)
    for (let i = 0; i < 26; i++) {
      const p = ((now / 900) + i / 26) % 1, x = ex + (target.x - ex) * p, y = ey + (target.y - ey) * p - Math.sin(p * Math.PI) * Math.min(30, len * 0.15)
      c.fillStyle = `rgba(200,230,255,${1 - p * 0.3})`; c.fillRect(Math.round(x), Math.round(y), 3, 3)
    }
  }
  // After the night tint: windows, lamps and flames glow.
  function drawLights(c, v, now, k) {
    if (k < 0.02) return
    c.globalAlpha = k
    for (const b of buildings) {
      if (b.x0 > v.x1 || b.x0 + b.w < v.x0) continue
      b.prs.forEach((p, j) => { c.fillStyle = p.draft ? 'rgba(170,200,230,.3)' : P.winLit; for (const { x, y } of wins(b, j)) c.fillRect(x, y, 12, 14) })
      c.fillStyle = 'rgba(160,200,240,.35)'; c.fillRect(b.x0 + 10, -24, b.w / 2 - 14, 22)
      for (const j of b.fire) { const s = storey(b, j); glow(c, b.x0 + b.w / 2, s.y + s.h / 2, 60, '255,120,40', 0.5 + 0.1 * Math.sin(now / 90 + j)) }
    }
    for (let n = Math.floor(v.x0 / 160) - 1; n * 160 < v.x1 + 160; n++) {
      const lx = n * 160 + 40
      if (lx < LEFT0 - 10 || lx > RIGHT0 - 10) { glow(c, lx + 7, -40, 46, P.lampGlow, 0.5); R(c, '#fff4d0', lx + 5, -46, 4, 2) }
    }
    c.globalAlpha = 1
  }
  function glow(c, x, y, r, col, a) {
    const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`)
    c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r)
  }

  // ---------- sky (drawn behind everything with destination-over, so front-most first) ----------
  function drawSky(c, v, now, sun) {
    const { n, hour, sr, ss, kind, clouds, lightColor } = sun
    const wet = /rain|storm|drizzle/.test(kind || ''), grey = wet || kind === 'fog' || kind === 'snow'
    const span = v.x1 - v.x0 + 400, cx = (v.x0 + v.x1) / 2 * 0.3
    const count = Math.round((clouds ?? 30) / 100 * 9) + (wet ? 5 : 0)
    const cc = n > 0.6 ? [58, 66, 96] : grey ? [168, 172, 182] : [250, 251, 253]
    for (let i = 0; i < count; i++) {
      const h = api.hash('cloud' + i), sp = 3 + h % 6
      const x = v.x0 - 200 + (((h % 997) / 997 * span + now / 1000 * sp - cx) % span + span) % span
      const skyH = Math.max(80, -v.y0)
      const y = v.y0 + 20 + ((h >>> 8) % 100) / 100 * Math.min(skyH * 0.55, 420)
      const w = 40 + (h >>> 4) % 50
      c.fillStyle = rgb(mix(cc, [0, 0, 0], 0.12)); c.fillRect(Math.round(x), Math.round(y + 6), w, 6)
      c.fillStyle = rgb(cc); c.fillRect(Math.round(x + 4), Math.round(y), w - 8, 9); c.fillRect(Math.round(x + w * 0.25), Math.round(y - 6), w * 0.4, 8); c.fillRect(Math.round(x + w * 0.55), Math.round(y - 3), w * 0.3, 6)
    }
    const top = v.y0, horizon = 0, skyH = Math.max(1, horizon - top)
    // sun by day, moon by night, crossing the visible sky
    const day = hour >= sr && hour <= ss
    const t = day ? (hour - sr) / (ss - sr) : ((hour < sr ? hour + 24 : hour) - ss) / (sr + 24 - ss)
    const bx = v.x0 + (0.12 + 0.76 * t) * (v.x1 - v.x0), by = top + skyH * (0.8 - 0.62 * Math.sin(Math.PI * t))
    if (!wet) {
      if (day) { glow(c, bx, by, 40, '255,230,160', 0.5); R(c, '#fff2c0', bx - 7, by - 7, 14, 14); R(c, '#ffe08a', bx - 5, by - 9, 10, 18); R(c, '#ffe08a', bx - 9, by - 5, 18, 10) }
      else { glow(c, bx, by, 30, '200,215,255', 0.25); R(c, '#e8ecf4', bx - 6, by - 6, 12, 12); R(c, '#c8d0e0', bx - 1, by - 3, 3, 3) }
    }
    if (n > 0.35) {
      c.globalAlpha = Math.min(1, (n - 0.35) * 2.5)
      for (let i = 0; i < 160; i++) {
        const h = api.hash('star' + i), x = v.x0 + (((h % 2000) - (v.x0 + v.x1) / 2 * 0.1) % (v.x1 - v.x0) + (v.x1 - v.x0)) % (v.x1 - v.x0)
        const y = top + ((h >>> 11) % 1000) / 1000 * skyH * 0.85
        c.fillStyle = (Math.floor(now / 700) + i) % 9 === 0 ? '#a8b0d0' : '#f0f2ff'; c.fillRect(Math.round(x), Math.round(y), 1 + (h >>> 3) % 2, 1)
      }
      c.globalAlpha = 1
    }
    const dayTop = grey ? [128, 146, 170] : P.dayTop, dayHz = grey ? [176, 186, 198] : P.dayHz
    let tp = mix(dayTop, P.nightTop, n), hz = mix(dayHz, P.nightHz, n)
    const warm = Math.max(0, 1 - Math.abs(n - 0.4) / 0.35) * (grey ? 0.25 : 0.65)
    if (lightColor && warm > 0) hz = mix(hz, lightColor, warm)
    const g = c.createLinearGradient(0, top, 0, horizon)
    g.addColorStop(0, rgb(tp)); g.addColorStop(1, rgb(hz))
    c.fillStyle = g; c.fillRect(v.x0 - 2, top - 2, v.x1 - v.x0 + 4, Math.max(0, horizon - top) + 40)
  }
  function drawWeather(c, v, now, kind) {
    if (!kind || kind === 'clear' || kind === 'clouds') return
    const W = v.x1 - v.x0, H = v.y1 - v.y0, t = now / 1000
    if (kind === 'fog') { c.fillStyle = 'rgba(205,210,220,.28)'; c.fillRect(v.x0, v.y0, W, H); return }
    const snow = kind === 'snow', storm = kind === 'storm', n = Math.round(W * H / (snow ? 9000 : storm ? 4000 : kind === 'drizzle' ? 12000 : 6000))
    c.fillStyle = snow ? 'rgba(255,255,255,.9)' : 'rgba(190,210,235,.55)'
    for (let i = 0; i < n; i++) {
      const h = api.hash('drop' + i), sp = snow ? 22 + h % 18 : 260 + h % 120
      const y = v.y0 + (((h >>> 8) % 1000) / 1000 * H + t * sp) % H
      let x = v.x0 + ((h % 1000) / 1000 * W + (snow ? Math.sin(t + i) * 8 : -t * sp * 0.25)) % W
      if (x < v.x0) x += W
      if (snow) c.fillRect(Math.round(x), Math.round(y), 2, 2); else c.fillRect(Math.round(x), Math.round(y), 1, 5)
    }
    if (storm && (Math.floor(t / 7) * 7919) % 5 === 0 && t % 7 < 0.18) { c.fillStyle = 'rgba(235,240,255,.35)'; c.fillRect(v.x0, v.y0, W, H) }
  }

  // ---------- hover ----------
  function buildingAt(x, y) { return buildings.find(b => x >= b.x0 && x < b.x0 + b.w && y <= 0 && y >= -b.h - 28) || null }
  const floorAt = (b, y) => { const j = Math.floor((-SHOP - y) / STOREY); return j >= 0 && j < b.prs.length ? j : -1 }
  function labels() { return buildings.map(b => ({ text: b.e.login, badge: b.e.contrib ? `${b.e.contrib.commits12w}` : null, x: b.x0 + b.w / 2, y: -33.5, w: 84 })) }
  // the PR numbers on the floor plates (the top one says how many more did not fit)
  function plates() { return buildings.flatMap(b => b.prs.map((p, j) => ({ ...plate(b, j), text: `${p.n}`, more: j === b.prs.length - 1 && b.more > 0 ? b.more : 0, draft: p.draft, fire: p.ci === 'failed' && !p.draft }))) }
  const extent = () => buildings.reduce((m, b) => ({ x0: Math.min(m.x0, b.x0), x1: Math.max(m.x1, b.x0 + b.w) }), { x0: LEFT0, x1: RIGHT0 })
  return { setStreet, setTheme, backdrop, behind, drawBack, drawLive, drawLights, drawSky, drawWeather, buildingAt, floorAt, labels, plates, extent, set hover(h) { hover = h }, get repo() { return repo }, get buildings() { return buildings } }
}
