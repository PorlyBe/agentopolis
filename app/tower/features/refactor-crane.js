// refactor-crane: a tower crane bolted to the left outer wall (the side away from the elevator shaft) of every session
// floor whose PR or branch changes more than 1000 lines (snap.cranes, server/features/refactor-crane.mjs). It slews
// slowly and lifts steel beams; the bigger the diff, the taller the mast, the longer the jib and the heavier the load.
// Hover for the PR, click to open it. ?demo=refactorcrane fakes a 1.5k and a 16k change on the first session floors.
import { R } from '../draw.js'
const YEL = '#e8b830', YEL_D = '#b8861c', STEEL = '#8a4a32', STEEL_L = '#b0644a', CABLE = '#3a3540'
const MX = -16, MW = 7                                 // the mast's left edge and width; brackets reach the wall at x = 0
const kfmt = n => n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : `${n}`

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('refactorcrane')
  let cranes = [], flown = false

  tower.on('snapshot', data => {
    if (!demo) return
    const ss = data.sessions.filter(s => s.running !== false)
    data.cranes = [
      ss[0] && { sessionId: ss[0].id, add: 1240, del: 268, pr: 1937, title: 'search every asset', url: null, src: 'pr' },
      ss[1] && { sessionId: ss[1].id, add: 12_410, del: 3_920, pr: 1918, title: 'cloud backup: set up, connect, restore', url: null, src: 'pr' },
    ].filter(Boolean)
  })
  tower.on('sync', data => {
    cranes = (data.cranes || []).filter(c => c.add + c.del > 1000)
    if (demo && !flown && cranes[1] && !params.get('towerzoom')) { flown = true; setTimeout(() => tower.flyTo({ x: -40, y: tower.floor(cranes[1].sessionId)?.top ?? -300 }, 3), 600) }
  })

  // geometry: lv 0 (1k lines) .. 1 (30k+)
  function geo(cr, now) {
    const f = tower.floor(cr.sessionId)
    if (!f || f.kind !== 'session' || f.y - f.top < 30) return null
    const n = cr.add + cr.del, lv = Math.max(0, Math.min(1, Math.log10(n / 1000) / Math.log10(30)))
    const seed = api.hash(cr.sessionId), t = now / 1000 + seed % 100
    const top = f.top - 18 - Math.round(70 * lv), L = 56 + Math.round(84 * lv)
    const slew = Math.cos(0.75 * Math.sin(t / 9)), jl = Math.round(L * slew), cl = Math.round((12 + 6 * lv) * slew)
    const mx = MX + MW / 2, jy = top + 8
    const trolley = mx - 10 - (jl - 18) * (0.25 + 0.6 * (0.5 + 0.5 * Math.sin(t / 6.3)))
    const p = (t / 11) % 1, lift = p < 0.4 ? p / 0.4 : p < 0.55 ? 1 : p < 0.95 ? 1 - (p - 0.55) / 0.4 : 0
    const low = f.y - 14, high = jy + 16, hook = low + (high - low) * (0.5 - 0.5 * Math.cos(Math.PI * lift))
    return { f, lv, n, top, L, jl, cl, mx, jy, trolley, hook, beams: 1 + Math.round(3 * lv), bw: 20 + Math.round(10 * lv) }
  }

  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    for (const cr of cranes) {
      const g = geo(cr, now)
      if (!g || g.f.y < v.y0 - 20 || g.top > v.y1 + 20 || v.x0 > 30 || v.x1 < MX - g.jl - 40) continue
      out.push({ z: Z.OUTSIDE + 4, draw: c => drawCrane(c, g, now) })
    }
  })
  function lattice(c, x, y0, y1) {
    R(c, YEL_D, x, y0, 1, y1 - y0); R(c, YEL_D, x + MW - 1, y0, 1, y1 - y0)
    R(c, YEL, x + 1, y0, 1, y1 - y0); R(c, YEL, x + MW - 2, y0, 1, y1 - y0)
    for (let y = y0; y < y1 - 1; y += 6) { R(c, YEL_D, x, y, MW, 1); for (let i = 0; i < 5; i++) R(c, YEL, x + 1 + i, y + 1 + i, 1, 1) }
  }
  function drawCrane(c, g, now) {
    const { f, top, jl, cl, mx, jy, trolley, hook, beams, bw } = g
    // mast from the floor's slab up past its ceiling, bolted to the wall twice per storey
    lattice(c, MX, top + 10, f.y + 4)
    R(c, '#5a5f6a', MX - 2, f.y + 3, MW + 4, 3)
    for (let y = f.y - 10; y > top + 14; y -= 34) { R(c, '#4a4f5a', MX + MW, y, -MX - MW, 2); R(c, '#2e323a', -2, y - 1, 2, 4) }
    // slewing ring, cab, A-frame
    R(c, '#4a4f5a', MX - 1, top + 8, MW + 2, 2)
    R(c, YEL_D, MX - 7, top + 10, 8, 8); R(c, YEL, MX - 6, top + 10, 7, 7); R(c, '#9fd0ff', MX - 5, top + 11, 4, 3)
    R(c, YEL_D, mx - 1, top - 6, 2, 14)
    // jib (left) and counter-jib (right), lattice chords
    R(c, YEL_D, mx - jl, jy - 2, jl, 1); R(c, YEL_D, mx - jl, jy + 1, jl, 1); R(c, YEL, mx - jl, jy - 1, jl, 2)
    c.fillStyle = YEL_D; for (let x = mx - jl + 2; x < mx - 4; x += 5) { c.fillRect(Math.round(x), jy - 1, 1, 2) }
    R(c, YEL_D, mx, jy - 2, cl, 4); R(c, '#6a6a72', mx + cl - 6, jy + 2, 7, 6); R(c, '#55555c', mx + cl - 6, jy + 6, 7, 2)
    c.strokeStyle = CABLE; c.lineWidth = 0.6; c.beginPath()
    c.moveTo(mx, top - 6); c.lineTo(mx - jl + 2, jy - 2); c.moveTo(mx, top - 6); c.lineTo(mx + cl - 2, jy - 2); c.stroke()
    // the warning lamp on the A-frame
    R(c, Math.floor(now / 700) % 2 ? '#ff3a2a' : '#7a1a14', mx - 1, top - 8, 2, 2)
    // trolley, hoist cable, hook block and the slung beams
    const tx = Math.round(trolley), hy = Math.round(hook), sway = Math.round(Math.sin(now / 900) * 1.2)
    R(c, '#4a4f5a', tx - 3, jy + 2, 6, 2)
    R(c, CABLE, tx - 1, jy + 4, 1, hy - jy - 4); R(c, CABLE, tx + 1, jy + 4, 1, hy - jy - 4)
    R(c, '#d84a2a', tx - 2 + sway, hy, 5, 3); R(c, '#2e323a', tx + sway, hy + 3, 1, 3)
    const by = hy + 10, bx = tx + sway - bw / 2
    c.strokeStyle = CABLE; c.beginPath(); c.moveTo(tx + sway + 0.5, hy + 5); c.lineTo(bx + 2, by); c.moveTo(tx + sway + 0.5, hy + 5); c.lineTo(bx + bw - 2, by); c.stroke()
    for (let i = 0; i < beams; i++) {
      const y = by + i * 4
      R(c, STEEL, bx, y, bw, 1); R(c, STEEL_L, bx + 1, y + 1, bw - 2, 1); R(c, STEEL, bx, y + 2, bw, 1)
      R(c, 'rgba(0,0,0,.25)', bx, y + 3, bw, 1)
    }
  }
  tower.on('glow', (c, now, n) => {
    if (Math.floor(now / 700) % 2 === 0) return
    for (const cr of cranes) {
      const g = geo(cr, now); if (!g) continue
      const gr = c.createRadialGradient(g.mx, g.top - 7, 0, g.mx, g.top - 7, 14)
      gr.addColorStop(0, `rgba(255,60,40,${0.4 + 0.5 * n})`); gr.addColorStop(1, 'rgba(255,60,40,0)')
      c.fillStyle = gr; c.fillRect(g.mx - 14, g.top - 21, 28, 28)
    }
  })

  // the label over the cab: +adds −dels
  tower.on('overlay', (v, now) => {
    const k = tower.zoom, cv = tower.canvas
    for (const cr of cranes) {
      const g = geo(cr, now); if (!g) continue
      const a = tower.worldToScreen(MX - 4, g.top - 12)
      if (a.x < -80 || a.y < -20 || a.x > cv.clientWidth + 80 || a.y > cv.clientHeight + 20) continue
      const fs = Math.max(9, Math.min(4.2 * k, 14)), add = `+${kfmt(cr.add)}`, del = ` −${kfmt(cr.del)}`
      v.font = font(fs, 700); const wa = v.measureText(add).width, wd = v.measureText(del).width, w = wa + wd + fs
      v.fillStyle = 'rgba(20,18,24,.82)'; v.fillRect(a.x - w / 2, a.y - fs, w, fs * 1.45)
      v.fillStyle = YEL; v.fillRect(a.x - w / 2, a.y + fs * 0.45 - 2, w, 2)
      v.textBaseline = 'middle'; v.textAlign = 'left'
      v.fillStyle = '#7fe08a'; v.fillText(add, a.x - w / 2 + fs / 2, a.y - fs * 0.27)
      v.fillStyle = '#ff8a7a'; v.fillText(del, a.x - w / 2 + fs / 2 + wa, a.y - fs * 0.27)
    }
  })

  function hit(w) {
    const now = performance.now()
    for (const cr of cranes) {
      const g = geo(cr, now); if (!g) continue
      if (w.x >= g.mx - g.jl - 4 && w.x <= 2 && w.y >= g.top - 16 && w.y <= g.f.y + 4 && (w.x >= MX - 8 || w.y <= g.jy + 6 || Math.abs(w.x - g.trolley) < g.bw / 2 + 2)) return { cr, g }
    }
    return null
  }
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    const { cr } = h, title = cr.title ? esc(String(cr.title).slice(0, 60)) : ''
    return `<div class="t">🏗 Big refactor${cr.pr ? ` · #${cr.pr}` : ''}</div>${title ? `<div>${title}</div>` : ''}`
      + `<div><b style="color:#5fd17a">+${cr.add.toLocaleString()}</b> <b style="color:#ef5a5a">−${cr.del.toLocaleString()}</b> lines${cr.src === 'branch' ? ' on the branch (no PR yet)' : ''}</div>`
      + `<div class="m">${esc(tower.floor(cr.sessionId)?.session?.title || '')}${cr.url ? ' · ↗ click for the PR' : ''}</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h) return false
    if (h.cr.url) api.openLink(h.cr.url); else api.toast(`🏗 ${h.cr.pr ? '#' + h.cr.pr + ' · ' : ''}+${kfmt(h.cr.add)} −${kfmt(h.cr.del)}`)
    return true
  })
}
