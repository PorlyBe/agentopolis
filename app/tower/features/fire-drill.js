// fire-drill: the default branch went red (snap.fireDrill, server/features/fire-drill.mjs). The alarm bells ring on
// every floor, everyone files out to the assembly point on the street left of the door, where a marshal in a hi-vis vest
// holds a clipboard with the failing workflow. Green again, or two minutes on, they go back in; while it stays red a
// small TRUNK RED sign hangs from the lobby awning. Hover the marshal or the sign for the runs, click to open one.
// ?demo=firedrill fakes a red trunk that turns green again, over and over.
import { R } from '../draw.js'
const FRESH = 20 * 60_000, KEY = 'agent-office:firedrill'
const MARSHAL_X = -118, POST_X = -110, CROWD_X = -132, GAP = 9
const SIGN = { x: -28, y: -42, w: 24, h: 8 }

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('firedrill')
  const DRILL_MS = demo ? 45_000 : 120_000
  let red = [], drill = null, marshal = null, sweepAt = 0, clearAt = -1e9, primed = false, demoT0 = 0
  const evac = new Map()      // person id -> { slot, prior }
  let drilled = new Set()
  try { drilled = new Set(JSON.parse(localStorage.getItem(KEY) || '[]')) } catch {}
  const remember = id => { drilled.add(id); try { localStorage.setItem(KEY, JSON.stringify([...drilled].slice(-50))) } catch {} }
  const label = () => red.map(r => r.workflow).join(', ')

  // ---------- data ----------
  function fake() {
    const now = Date.now()
    if (!demoT0) { demoT0 = now; if (!params.get('towerzoom')) setTimeout(() => tower.flyTo({ x: -60, y: -30 }, 3.2), 700) }
    const cycle = Math.floor((now - demoT0) / 100_000), t = (now - demoT0) % 100_000
    return t > 2000 && t < 75_000 ? [{ id: 'demo-' + cycle, workflow: 'ci', title: 'site: the gallery page keeps its scroll on back (#1931)', sha: 'a1b2c3d', failedAt: demoT0 + cycle * 100_000 + 2000, url: null }] : []
  }
  tower.on('sync', data => {
    const d = data.fireDrill
    if (!demo && d?.status !== 'ok') return
    const had = red.length
    red = demo ? fake() : d.red
    if (!red.length) { if (drill) end(true); else if (had) clearAt = performance.now(); return }
    const fresh = red.find(r => !drilled.has(r.id) && Date.now() - r.failedAt < FRESH)
    if (!drill && fresh && (api.live !== false || demo)) start(fresh)
    else if (!primed) for (const r of red) remember(r.id)
    primed = true
  })

  function start(r) {
    for (const x of red) remember(x.id)
    drill = { t0: performance.now(), run: r }
    api.toast(`🔔 Fire drill — trunk is red: ${r.workflow}`, 5000)
    marshal = tower.spawn({ id: 'firedrill-marshal', floor: 'lobby', x: -420, z: Z.STAND + 2, draw: drawMarshal })
    marshal.go('lobby', MARSHAL_X, { face: 'left' })
  }
  function end(green) {
    for (const [id, e] of evac) {
      const p = tower.person(id)
      if (!p || p.activity !== 'firedrill') continue
      if (e.prior) tower.sendTo(id, e.prior.floor, e.prior.x, { face: e.prior.face, pose: e.prior.seated ? 'sit' : 'stand', activity: e.prior.activity })
      else tower.release(id)
    }
    evac.clear()
    if (marshal && !marshal.gone) { const m = marshal; setTimeout(() => m.go('lobby', -420, { then: () => m.remove() }), 2500) }
    marshal = null; drill = null
    if (green) clearAt = performance.now()
  }

  // ---------- everyone out ----------
  function sweep() {
    let slot = Math.max(-1, ...[...evac.values()].map(e => e.slot))
    for (const p of tower.people) {
      if (evac.has(p.id) || p.leaving) continue
      const prior = p.steered && p.floor && p.activity !== 'security' ? { floor: p.floor, x: p.x, face: p.face, seated: p.seated, activity: p.activity } : null
      const x = CROWD_X - ++slot * GAP
      if (tower.sendTo(p.id, 'lobby', x, { face: 'right', pose: 'stand', activity: 'firedrill' })) evac.set(p.id, { slot, prior })
      else slot--
    }
  }
  tower.on('step', (dt, now) => {
    if (!drill) return
    if (now - drill.t0 > DRILL_MS) return end(false)
    if (now - sweepAt > 700) { sweepAt = now; sweep() }
  })

  // ---------- drawing ----------
  const ringing = now => drill && now - drill.t0 < 25_000
  function bell(c, x, y, now) {
    const on = ringing(now), j = on ? (Math.floor(now / 60) % 2 ? 1 : -1) : 0
    R(c, '#5a1c1c', x + 3, y, 3, 2)
    R(c, '#b0262a', x + j, y + 2, 9, 7); R(c, '#e04a48', x + 1 + j, y + 3, 3, 3); R(c, '#7a1a1c', x + j, y + 8, 9, 1)
    R(c, '#2a2a2a', x + 4 - j, y + 9, 2, 2)
    if (on && Math.floor(now / 120) % 2) { R(c, '#ffd84a', x - 3, y + 2, 1, 4); R(c, '#ffd84a', x + 11, y + 2, 1, 4); R(c, '#ffd84a', x - 5, y + 3, 1, 2); R(c, '#ffd84a', x + 13, y + 3, 1, 2) }
  }
  function assemblyPost(c) {
    R(c, 'rgba(0,0,0,.2)', POST_X - 2, -1, 6, 1)
    R(c, '#5a5f68', POST_X, -30, 2, 30)
    R(c, '#1f8a4a', POST_X - 6, -42, 14, 13); R(c, '#2aa85a', POST_X - 5, -41, 12, 1)
    R(c, '#f4f4ec', POST_X - 1, -38, 4, 4)
    R(c, '#f4f4ec', POST_X - 4, -36, 2, 1); R(c, '#f4f4ec', POST_X + 4, -36, 2, 1); R(c, '#f4f4ec', POST_X + 1, -41, 1, 2); R(c, '#f4f4ec', POST_X + 1, -33, 1, 2)
  }
  function sign(c, now) {
    const s = SIGN, sway = Math.round(Math.sin(now / 900))
    R(c, '#3a3a3a', s.x + 3, -46, 1, 4); R(c, '#3a3a3a', s.x + s.w - 4, -46, 1, 4)
    R(c, 'rgba(0,0,0,.25)', s.x + 1 + sway, s.y + 1, s.w, s.h)
    R(c, '#7a1418', s.x + sway, s.y, s.w, s.h); R(c, '#c8202a', s.x + 1 + sway, s.y + 1, s.w - 2, s.h - 2)
    c.fillStyle = '#fbe9e0'; for (let i = 0; i < 5; i++) c.fillRect(s.x + 3 + sway + i * 4, s.y + 3, 3, 2)
  }
  function drawMarshal(c, p, now) {
    const look = api.lookOf('firedrill-marshal'), sheet = api.charSheet(look.palette, look.hue)
    const frame = p.walking ? [0, 1, 2, 1][Math.floor(now / 130) % 4] : 1, flip = (p.walking ? p.dir : p.face) === 'left'
    const dx = Math.round(p.x - 8), dy = Math.round(p.y - 30)
    c.save()
    if (flip) { c.translate(dx + 16, dy); c.scale(-1, 1) } else c.translate(dx, dy)
    c.drawImage(sheet, frame * 16, 64, 16, 32, 0, 0, 16, 32)
    R(c, '#d8f02a', 5, 17, 7, 8); R(c, '#b8d020', 5, 24, 7, 1); R(c, '#e8e8e0', 5, 19, 7, 1); R(c, '#e8e8e0', 5, 22, 7, 1)
    R(c, '#f4f4ec', 4, 2, 9, 3); R(c, '#d8d8cc', 3, 5, 11, 1)
    if (!p.walking) { R(c, '#6b4a2a', 11, 15, 5, 7); R(c, '#fbfaf4', 12, 16, 3, 5); R(c, '#c8202a', 12, 17, 3, 1); R(c, '#9a968a', 12, 19, 2, 1) }
    c.restore()
  }
  tower.on('items', (out, now) => {
    if (!drill && !red.length) return
    for (const f of tower.floors) if (f.kind !== 'roof') out.push({ z: Z.WALL + 2, draw: c => bell(c, tower.interior.x0 + 3, f.top + 9, now) })
    if (drill) out.push({ z: Z.FLOOR, draw: c => assemblyPost(c) })
    if (red.length) out.push({ z: Z.OUTSIDE + 2, draw: c => sign(c, now) })
  })
  tower.on('glow', (c, now, n) => {
    if (!red.length) return
    const k = Math.max(0.3, n), pulse = 0.5 + 0.5 * Math.sin(now / 400)
    const g = c.createRadialGradient(SIGN.x + SIGN.w / 2, SIGN.y + 4, 0, SIGN.x + SIGN.w / 2, SIGN.y + 4, 18)
    g.addColorStop(0, `rgba(255,60,50,${0.35 * k * pulse})`); g.addColorStop(1, 'rgba(255,60,50,0)')
    c.fillStyle = g; c.fillRect(SIGN.x - 10, SIGN.y - 14, SIGN.w + 20, 36)
  })
  tower.on('post', (c, now) => {
    if (!ringing(now) || Math.floor(now / 500) % 2) return
    const top = tower.floors.at(-1)?.top ?? -400, bot = tower.floors[0]?.y ?? 60
    c.fillStyle = 'rgba(255,40,30,.07)'; c.fillRect(0, top, tower.interior.x1 + 8, bot - top)
  })

  // ---------- labels ----------
  function card(c, ax, ay, lines, color) {
    const fs = lines.fs, w = Math.round(Math.max(...lines.map(l => { c.font = l.b ? font(fs, 700) : font(fs); return c.measureText(l.t).width })) + 16), h = lines.length * (fs + 3) + 8
    const x = Math.round(ax - w / 2), y = Math.round(ay - h - 6)
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x + 2, y + 3, w, h, 5); c.fill()
    c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 5); c.fill()
    c.beginPath(); c.moveTo(ax - 4, y + h - 1); c.lineTo(ax, y + h + 5); c.lineTo(ax + 4, y + h - 1); c.fill()
    c.fillStyle = color; c.fillRect(x, y + 4, 3, h - 8)
    lines.forEach((l, i) => { c.font = l.b ? font(fs, 700) : font(fs); c.fillStyle = l.col || '#1b1c26'; c.fillText(l.t, x + 9, y + 4 + (i + 0.5) * (fs + 3) + 0.5) })
  }
  tower.on('overlay', (c, now) => {
    const k = tower.zoom
    if (k < 1.6) return
    c.save(); c.textBaseline = 'middle'
    const fs = Math.round(Math.max(9, Math.min(13, 3.6 * k)))
    if (marshal && !marshal.gone && !marshal.walking) {
      const a = tower.worldToScreen(marshal.x, marshal.y - 33), wf = fitText(label(), 200, font(fs))
      const lines = [{ t: '🦺 FIRE DRILL', b: true, col: '#a8322a' }, { t: wf }]
      if (drill) lines.push({ t: `back in ${Math.max(0, Math.ceil((DRILL_MS - (now - drill.t0)) / 1000))}s or when green`, col: '#6e6a60' })
      lines.fs = fs; card(c, a.x, a.y, lines, '#e0b020')
    } else if (red.length) {
      const a = tower.worldToScreen(SIGN.x + SIGN.w / 2, SIGN.y - 5)
      const lines = [{ t: fitText('TRUNK RED — ' + label(), 220, font(fs, 700)), b: true, col: '#a8322a' }]; lines.fs = fs
      card(c, a.x, a.y, lines, '#c8202a')
    } else if (now - clearAt < 6000) {
      const a = tower.worldToScreen(MARSHAL_X, -36), lines = [{ t: '✓ all clear — trunk is green', b: true, col: '#2f7a41' }]; lines.fs = fs
      card(c, a.x, a.y, lines, '#2f7a41')
    }
    c.restore()
  })

  // ---------- hover / click ----------
  const onMarshal = w => marshal && !marshal.gone && Math.abs(w.x - marshal.x) < 8 && w.y > marshal.y - 32 && w.y < marshal.y + 2
  const onSign = w => w.x >= SIGN.x - 2 && w.x <= SIGN.x + SIGN.w + 2 && w.y >= SIGN.y - 5 && w.y <= SIGN.y + SIGN.h + 2
  const onPost = w => drill && Math.abs(w.x - POST_X) < 8 && w.y > -43 && w.y < 0
  tower.on('hover', (w, person) => {
    if (!red.length && !drill) return null
    if (!(onMarshal(w) || (red.length && onSign(w)) || onPost(w) || (person && evac.has(person.id)))) return null
    const runs = red.map(r => `<div><i class="s" style="background:#c8202a"></i><b>${esc(r.workflow)}</b> ${esc(r.title || '')}${r.sha ? ` <span class="m">${esc(r.sha)}</span>` : ''} · ${esc(api.ago(r.failedAt))}</div>`).join('')
    return `<div class="t">🔔 ${drill ? 'Fire drill — trunk is red' : 'Trunk is red'}</div>${runs || '<div class="m">trunk is green again</div>'}`
      + `<div class="m">${drill ? `${evac.size} out on the street · ` : ''}every deploy waits on it${red.some(r => r.url) ? ' · ↗ click to open the run' : ''}</div>`
  })
  tower.on('click', (w, person) => {
    if (!red.length || !(onMarshal(w) || onSign(w) || onPost(w))) return false
    const r = red.find(x => x.url); if (r) window.open(r.url, '_blank', 'noopener')
    return true
  })
}
