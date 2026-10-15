// test-lab: a QA rack on each session floor's back wall, one flask per suite the session or its agents ran (server ext
// 'test-lab': cargo test/nextest/clippy/mutants, pnpm test/vitest/lint/typecheck, per service folder). Blue and bubbling
// while running, green and glowing on pass, red and fizzing on fail, amber when the output went to a log; each keeps its
// last result until the next run. Hover a flask for its suite, service and result. ?demo=testlab fakes a rack that cycles.
import { IX } from '../building.js'

const RACK_X = IX + 150, PITCH = 8, GAP = 4, MAX = 8, SHELF = 44
const LIQ = { running: ['#5fb3f0', '#2f7fc0'], pass: ['#5fd17a', '#2f9a4a'], fail: ['#ef5d5d', '#a8322a'], unknown: ['#d9b25a', '#9a7a30'] }
const WORD = { running: 'running', pass: 'passed', fail: 'failed', unknown: 'finished, output in a log' }
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const inR = (w, r, pad = 0) => r && w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('testlab')
  const flips = new Map() // `${floor}|${key}` -> { state, at } for the settle flash

  const flasksOf = f => (f.session?.ext?.['test-lab']?.flasks || []).slice(0, MAX)
  const stateOf = q => q.runningSince ? 'running' : q.result || 'unknown'
  // flask slots, a small gap between services
  function slots(f) {
    const out = [], qs = flasksOf(f), y = f.y - SHELF
    let x = RACK_X, prev = null
    for (const q of qs) {
      if (prev && prev !== q.service) x += GAP
      out.push({ q, x, y: y - 9, w: 7, h: 9, st: stateOf(q) }); x += PITCH; prev = q.service
    }
    return out
  }
  tower.on('sync', () => {
    const now = performance.now()
    for (const f of tower.floors) if (f.kind === 'session') for (const s of slots(f)) {
      const k = `${f.id}|${s.q.service}|${s.q.suite}`, was = flips.get(k)
      if (!was) flips.set(k, { state: s.st, at: -1e9 })
      else if (was.state !== s.st) flips.set(k, { state: s.st, at: now })
    }
  })

  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    for (const f of tower.floors) {
      if (f.kind !== 'session' || f.y < v.y0 - 10 || f.top > v.y1 + 10) continue
      const sl = slots(f); if (!sl.length) continue
      out.push({ z: Z.WALL + 4, draw: c => rack(c, f, sl, now) })
    }
  })

  function rack(c, f, sl, now) {
    const x0 = RACK_X - 3, x1 = sl.at(-1).x + 10, y = f.y - SHELF
    R(c, 'rgba(0,0,0,.16)', x0 + 1, y + 2, x1 - x0, 2)
    R(c, '#7a5a3a', x0, y, x1 - x0, 2); R(c, '#9a7650', x0, y, x1 - x0, 1)
    R(c, '#4a4452', x0 + 2, y + 2, 1, 3); R(c, '#4a4452', x1 - 3, y + 2, 1, 3)
    R(c, '#4a4452', x0 + 2, y + 4, 3, 1); R(c, '#4a4452', x1 - 5, y + 4, 3, 1)
    for (const s of sl) flask(c, f, s, now)
  }

  // an Erlenmeyer flask, 7 wide x 9 tall: cork, neck, body
  function flask(c, f, s, now) {
    const { x, y, st } = s, [liq, deep] = LIQ[st], seed = api.hash(s.q.suite + s.q.service) % 997
    const flash = flips.get(`${f.id}|${s.q.service}|${s.q.suite}`), fresh = flash && now - flash.at < 900
    const glass = '#d8eef4', rim = '#9fc0cc'
    R(c, '#8a5a32', x + 2, y, 3, 1)
    R(c, rim, x + 2, y + 1, 1, 3); R(c, rim, x + 4, y + 1, 1, 3); R(c, 'rgba(216,238,244,.5)', x + 3, y + 1, 1, 3)
    R(c, rim, x + 1, y + 4, 1, 1); R(c, rim, x + 5, y + 4, 1, 1)
    R(c, rim, x, y + 5, 1, 3); R(c, rim, x + 6, y + 5, 1, 3); R(c, rim, x, y + 8, 7, 1)
    R(c, 'rgba(216,238,244,.45)', x + 2, y + 4, 3, 1)
    R(c, liq, x + 1, y + 5, 5, 3); R(c, deep, x + 1, y + 7, 5, 1)
    R(c, liq, x + 2, y + 4, 3, 1)
    R(c, glass, x + 1, y + 5, 1, 1)
    if (st === 'running') {
      for (let i = 0; i < 3; i++) {
        const p = ((now / 700) + i / 3 + seed / 97) % 1, bx = x + 2 + ((i + seed) % 3), by = y + 7 - p * 7
        R(c, p < 0.55 ? '#c8ecff' : 'rgba(200,236,255,.7)', bx, by, 1, 1)
      }
      if (Math.floor(now / 260 + seed) % 4 === 0) R(c, 'rgba(220,240,255,.8)', x + 3, y - 1 - (now / 120) % 3, 1, 1)
    } else if (st === 'fail') {
      for (let i = 0; i < 4; i++) {
        const p = ((now / 380) + i / 4 + seed / 53) % 1, dx = Math.round(Math.sin(i * 2.3 + now / 140) * (1 + p * 2))
        R(c, i % 2 ? '#ffb0a0' : '#ef5d5d', x + 3 + dx, y - p * 6, 1, 1)
      }
      R(c, '#ffd0c8', x + 2 + (Math.floor(now / 90) % 3), y + 4, 1, 1)
    } else if (st === 'pass') {
      if (Math.floor(now / 1700 + seed) % 5 === 0) R(c, '#eaffef', x + 4, y + 5, 1, 1)
    }
    if (fresh) { c.globalAlpha = 1 - (now - flash.at) / 900; R(c, '#ffffff', x, y, 7, 9); c.globalAlpha = 1 }
  }

  tower.on('glow', (c, now, n, ctx) => {
    const v = ctx.view
    for (const f of tower.floors) {
      if (f.kind !== 'session' || f.y < v.y0 - 10 || f.top > v.y1 + 10) continue
      for (const s of slots(f)) {
        if (s.st === 'unknown') continue
        const cx = s.x + 3.5, cy = s.y + 6, col = s.st === 'pass' ? '95,209,122' : s.st === 'fail' ? '239,93,93' : '95,179,240'
        const a = (s.st === 'fail' ? 0.45 + 0.25 * Math.sin(now / 120) : s.st === 'running' ? 0.35 + 0.1 * Math.sin(now / 400) : 0.4) * Math.max(n, 0.25)
        const g = c.createRadialGradient(cx, cy, 0, cx, cy, 9); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`)
        c.fillStyle = g; c.fillRect(cx - 9, cy - 9, 18, 18)
      }
    }
  })

  function hit(w) {
    for (const f of tower.floors) {
      if (f.kind !== 'session' || w.y < f.top || w.y > f.y) continue
      const s = slots(f).find(s => inR(w, { x: s.x, y: s.y - 2, w: s.w, h: s.h + 4 }, 0.5))
      if (s) return { f, s }
    }
    return null
  }
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    const all = slots(h.f), dot = st => `<i class="s" style="background:${LIQ[st][0]}"></i>`
    const ready = all.every(s => s.st === 'pass')
    const row = s => `<div${s === h.s ? '' : ' class="m"'}>${dot(s.st)}${s === h.s ? '<b>' : ''}${esc(s.q.suite)} · ${esc(s.q.service)}${s === h.s ? '</b>' : ''} — ${WORD[s.st]}</div>`
    const q = h.s.q
    const detail = h.s.st === 'running' ? `started ${esc(api.ago(q.runningSince))}${q.result ? ` · last ${WORD[q.result]}` : ''}` : `${esc(q.summary || '')} · ${esc(api.ago(q.at))}`
    return `<div class="t">🧪 ${esc(q.suite)} · ${esc(q.service)} — ${WORD[h.s.st]}</div><div class="m">${detail}</div>${all.length > 1 ? all.map(row).join('') : ''}<div class="m">${ready ? '✓ every suite green' : 'not every suite is green'}</div>`
  })

  // ---------- ?demo=testlab ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => { const f = tower.floorOf(data.sessions[0]?.id); if (f) tower.flyTo({ x: RACK_X + 30, y: f.y - 40 }, 4) }, 800) }
    if (!data.sessions.length) return
    const t = (now - t0) % 30000, ago = ms => now - ms
    const q = (service, suite, result, summary, at, run) => ({ service, suite, result, summary, at, runningSince: run ? ago(run) : null })
    data.sessions[0].ext = { ...data.sessions[0].ext, 'test-lab': { flasks: [
      q('api-server', 'cargo clippy', 'pass', 'ok', ago(6e5)),
      t < 8000 ? q('api-server', 'cargo test', 'fail', 'test result: FAILED. 211 passed; 1 failed', ago(9e5), t) : q('api-server', 'cargo test', 'pass', '212 passed', ago(t - 8000)),
      q('api-server', 'cargo mutants', 'unknown', 'output went to a log', ago(36e5)),
      t > 4000 && t < 14000 ? q('web-app', 'pnpm lint', 'pass', 'ok', ago(12e5), t - 4000) : q('web-app', 'pnpm lint', t >= 14000 ? 'fail' : 'pass', t >= 14000 ? 'ELIFECYCLE Command failed with exit code 1.' : 'ok', ago(t >= 14000 ? t - 14000 : 12e5)),
      q('web-app', 'pnpm test', 'pass', '318 passed', ago(3e5)),
      q('web-app', 'pnpm typecheck', 'fail', 'ELIFECYCLE Command failed with exit code 2.', ago(2e5)),
    ] } }
    if (data.sessions[1]) data.sessions[1].ext = { ...data.sessions[1].ext, 'test-lab': { flasks: [q('auth-server', 'cargo test', null, '', 0, 2000), q('auth-server', 'cargo clippy', 'pass', 'ok', ago(5e4))] } }
  })
}
