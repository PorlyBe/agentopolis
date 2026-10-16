// express-elevator: a second glass car in the shaft right of the main one. It sleeps dark in the lobby until the line
// for the lift gets long (4+ waiting, or anyone waiting over 8 s), then its lights fade up, the EXPRESS sign on the
// machine room comes on and the dispatcher (people.js) hands each floor's call to whichever car is nearest. After a
// quiet minute it finishes its riders, parks in the lobby and goes dark again. ?demo=expresselevator sends everyone
// to the café and back, over and over (its quiet minute is 20 s there).
import { BW, SHAFT1, XSHAFT, CAR_H } from '../building.js'

const BUSY_N = 4, BUSY_MS = 8000, QUIET_MS = 60_000, MIN_OPEN = 20_000
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const GLYPH = { E: '111100110100111', X: '101101010101101', P: '111101111100100', R: '110101110101101', S: '011100010001110' }
function pixText(c, s, x, y, col) {
  c.fillStyle = col
  for (const ch of s) { const g = GLYPH[ch]; if (g) for (let i = 0; i < 15; i++) if (g[i] === '1') c.fillRect(x + i % 3, y + Math.floor(i / 3), 1, 1); x += 4 }
}

export default function init(api, tower) {
  const { Z } = tower, crowd = tower.crowd, xcar = crowd.xcar
  const params = api.params, demo = api.demo('expresselevator')
  const X0 = BW + SHAFT1, X1 = BW + SHAFT1 + XSHAFT
  let openedAt = 0, quietSince = 0, stats = { n: 0, oldest: 0 }

  function measure(now) {
    let n = 0, oldest = 0
    for (const q of crowd.queue.values()) for (const a of q) { n++; oldest = Math.max(oldest, now - (a.queuedAt ?? now)) }
    return { n, oldest }
  }
  tower.on('step', (dt, now) => {
    stats = measure(now)
    if (!xcar.active) {
      if (stats.n >= BUSY_N || stats.oldest > BUSY_MS) { xcar.active = true; openedAt = quietSince = now }
    } else {
      if (stats.n >= BUSY_N - 1 || stats.oldest > BUSY_MS * 0.75) quietSince = now      // a line is still forming
      if (now - quietSince > (demo ? QUIET_MS / 3 : QUIET_MS) && now - openedAt > MIN_OPEN) xcar.active = false
    }
    const want = xcar.active || xcar.riders.length || xcar.state !== 'idle' ? 1 : 0
    xcar.lit += Math.max(-dt * 0.8, Math.min(dt * 1.2, want - xcar.lit))
    if (demo) flood(now)
  })

  // ---------- the demo: everyone to the café, then home again ----------
  let wave = null, nextWave = 0
  function flood(now) {
    if (!tower.floor('cafe')) return
    if (!wave && now > nextWave) {
      const ids = tower.people.filter(p => !p.steered && !p.leaving && p.floor && p.floor !== 'cafe').map(p => p.id)
      wave = { ids, at: now }
      ids.forEach((id, i) => tower.sendTo(id, 'cafe', tower.interior.x0 + 24 + (i * 23) % 440, { face: i % 2 ? 'left' : 'down', activity: 'express-demo' }))
    }
    if (wave && now - wave.at > 28_000) { for (const id of wave.ids) tower.release(id); wave = null; nextWave = now + 100_000 }
  }

  // ---------- the express shaft: sign, landing lamps, a hint of the line ----------
  function sign(c, now, glow) {
    const rf = tower.floors.at(-1); if (!rf) return
    const y = rf.y - 13, x = X0 + 4, k = xcar.lit
    if (glow) {
      if (k < 0.05) return
      const g = c.createRadialGradient(x + 14, y + 3, 0, x + 14, y + 3, 26); g.addColorStop(0, `rgba(255,170,70,${0.3 * k})`); g.addColorStop(1, 'rgba(255,170,70,0)')
      c.fillStyle = g; c.fillRect(x - 12, y - 22, 52, 50); c.globalAlpha *= k; pixText(c, 'EXPRESS', x + 1, y + 1, '#ffc45a'); return
    }
    R(c, '#1c1a20', x - 1, y - 1, 31, 9)
    pixText(c, 'EXPRESS', x + 1, y + 1, k > 0.5 ? (Math.floor(now / 2400) % 7 === 0 && k < 1 ? '#a8742a' : '#ffc45a') : '#4a4048')
  }
  tower.on('items', (out, now) => {
    out.push({ z: Z.WALL + 1, draw: c => {
      sign(c, now, false)
      const k = xcar.lit
      for (const f of tower.floors) {
        if (f.kind === 'roof' || f.kind === 'server') continue
        const here = xcar.at === f.id && xcar.state !== 'moving'
        R(c, here && k > 0.5 ? '#5fd17a' : k > 0.5 ? '#c89a3a' : '#3a3f4a', X0 + 1, f.y - 50, 3, 2)
      }
      // a closed express car wears a chain across its doors
      if (k < 0.5 && !xcar.active) {
        const x = xcar.x - 13, y = xcar.y - CAR_H / 2
        for (let i = 0; i < 26; i += 2) R(c, i % 4 ? '#c8a030' : '#2a2a2a', x + i, y + Math.round(Math.sin(i / 26 * Math.PI) * 3), 2, 1)
      }
    } })
  })
  tower.on('glow', (c, now, n) => { c.globalAlpha = n; sign(c, now, true); c.globalAlpha = 1 })
  tower.on('hover', w => {
    const rf = tower.floors.at(-1); if (!rf || w.x < X0 || w.x > X1 || w.y < rf.y - 34 || w.y > tower.floors[0].y) return null
    const st = xcar.active ? 'open — calls go to the nearest car' : xcar.lit > 0.05 ? 'closing' : 'closed until the line gets long'
    return `<div class="t">Express elevator</div><div class="m">${st}</div><div class="m">${stats.n} waiting · ${xcar.riders.length} aboard</div>`
  })
  if (demo && !params.get('towerzoom')) tower.on('mode', () => setTimeout(() => tower.flyTo({ x: BW + 20, y: (tower.floor('cafe')?.y ?? 0) - 120 }, 1.6), 600))
}
