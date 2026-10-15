// memory-archive: the records room at the server room's free end, right of the racks. Every write today to an instruction
// or memory file (snap.memoryArchive, server/features/memory-archive.mjs) is a labelled drawer in a rolling cabinet; the
// second cabinet rolls in once the first is full. A new filing is carried down by a clerk from the writer's floor and the
// drawer pulls open as it goes in. Hover a drawer for the file, who wrote it, when and its first line. ?demo=memoryarchive.
import { IX } from '../building.js'

const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const inR = (w, r, pad = 0) => r && w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
const CAB = [IX + 402, IX + 421], CW = 17, CH = 42, PER = 20, MAX = 40, OPEN_MS = 1400, CHUTE = IX + 471, FALL_MS = 700
const KIND = { claude: ['#e0925a', 'CLAUDE.md'], agents: ['#d8b45a', 'AGENTS.md'], rules: ['#6a9ae0', 'rule'], skill: ['#6cc48a', 'skill'], memory: ['#b48ae8', 'memory'] }
const STEEL = { classic: ['#7a8494', '#5a6272', '#9aa4b4'], synthwave: ['#5a3a7a', '#3a2456', '#8a5ab4'], cyberpunk: ['#3a3e56', '#24263a', '#5a5e7a'] }
const SAMPLE = [['claude', 'CLAUDE.md', 'Run the full suite before a PR'], ['memory', '~/…/memory/staging-needs-a-vpn.md', 'Staging needs the VPN'], ['rules', '.claude/rules/api.md', 'Every route returns a typed error'],
  ['skill', '.claude/skills/deploy/SKILL.md', 'Deploy'], ['agents', 'AGENTS.md', 'Agents never push to main'], ['memory', '~/…/memory/MEMORY.md', 'The cache warms on boot']]

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('memoryarchive')
  let list = [], primed = false, flown = false, demoT0 = 0, rollAt = 0, wasTwo = false
  const known = new Set(), pending = new Set(), opening = new Map(), queue = [], couriers = []   // pending: on its way, not filed yet

  if (demo) tower.on('snapshot', snap => {
    const now = Date.now(), d = new Date(now); d.setHours(0, 0, 0, 0)
    if (!demoT0) demoT0 = now
    const s = snap.sessions || [], n = 17 + Math.floor((now - demoT0) / 7000)
    snap.memoryArchive = { day: '', filings: Array.from({ length: n }, (_, i) => {
      const [kind, file, line] = SAMPLE[i % SAMPLE.length], x = s[i % Math.max(1, s.length)]
      const at = i < 17 ? d.getTime() + (8 + i * 0.5) * 3600_000 : demoT0 + (i - 16) * 7000
      return { id: 'demo-ma-' + i, at: Math.min(at, now), file, kind, tool: i % 3 ? 'Edit' : 'Write', session: x?.id, title: x?.title || 'PAYMENTS API', agent: i % 4 === 1 ? { type: 'Explore', description: 'map the ledger' } : null, line }
    }).slice(-MAX) }
  })

  tower.on('sync', snap => {
    const m = snap.memoryArchive; if (!m) return
    list = (m.filings || []).slice(-MAX)
    for (const f of list) {
      if (known.has(f.id)) continue
      known.add(f.id)
      if (primed && Date.now() - f.at < 10 * 60_000) { pending.add(f.id); queue.push(f) }
    }
    primed = true
    if (demo && !flown && !params.get('towerzoom') && tower.floor('basement')) { flown = true; setTimeout(() => tower.flyTo({ x: CAB[1], y: tower.floor('basement').y - 30 }, 5), 600) }
  })

  const room = () => tower.floor('basement')
  const two = () => list.length > PER
  function drawer(i) {
    const f = room(); if (!f) return null
    const cab = Math.floor(i / PER), j = i % PER, roll = cab && rollAt ? Math.max(0, 1 - (performance.now() - rollAt) / 1600) : 0
    return { x: CAB[cab] + 1 + (j % 2) * 8 + Math.round(roll * 40), y: f.y - 3 - CH + 1 + Math.floor(j / 2) * 4, w: 7, h: 3, cab }
  }

  // ---------- the clerk ----------
  function sprite(c, p, now, carry, palette, hue) {
    const sheet = api.charSheet(palette, hue); if (!sheet?.width) return
    let row = 2, frame = 1, flip = false
    if (p.riding) row = 0
    else if (p.walking) { flip = p.dir === 'left'; frame = [0, 1, 2, 1][Math.floor(now / 130) % 4] }
    else { const fc = p.face || 'right'; row = fc === 'down' ? 0 : fc === 'up' ? 1 : 2; flip = fc === 'left'; if (p.activity === 'read' || (row === 1 && !carry)) frame = 5 + Math.floor(now / 420) % 2 }
    const dx = Math.round(p.x - 8), dy = Math.round(p.y - 30)
    if (flip) { c.save(); c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(sheet, frame * 16, row * 32, 16, 32, 0, 0, 16, 32); c.restore() }
    else c.drawImage(sheet, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
    R(c, '#2e3a4a', p.x - 3, p.y - 28, 7, 1)                                                  // a visor
    if (!carry) return
    const fx = row === 2 ? p.x + (flip ? -6 : 3) : p.x - 3, fy = p.y - 17
    R(c, '#c89a4a', fx, fy, 5, 6); R(c, '#e8c47a', fx, fy, 5, 1); R(c, '#f4f0e6', fx + 1, fy - 1, 3, 1)   // the manila folder
    R(c, KIND[carry.kind]?.[0] || '#ccc', fx + 1, fy + 2, 3, 1)
  }
  // a courier walks the folder from the writer's desk to the post room's chute (the lifts stop there); it drops into the
  // basket under the server room's ceiling, and the archivist, who never leaves the records room, files it
  const chute = () => { const p = tower.floor('post'), f = room(); return p && f && { x: CHUTE, py: p.y, by: f.top + 12 } }
  let arch = null
  const falling = [], basket = []
  function archivist() {
    const f = room(); if (!f) return null
    if (!arch || arch.npc.gone) {
      arch = { busy: null, idleAt: 0 }
      arch.npc = tower.spawn({ id: 'records-archivist', floor: 'basement', x: IX + 396, z: Z.STAND + 2, draw: (c, p, now) => sprite(c, p, now, arch.busy?.carry ? arch.busy.it : null, 3, 200) })
      arch.npc.pose({ face: 'right' })
    }
    return arch
  }
  function dispatch() {
    const f = room(), ch = chute(); if (!f) { queue.length = 0; pending.clear(); return }
    while (queue.length && couriers.length < 2) {
      const it = queue.shift()
      if (!list.some(q => q.id === it.id)) { pending.delete(it.id); continue }
      if (!ch) { basket.push(it); continue }
      const from = it.session && tower.floor(it.session) ? { floor: it.session, x: tower.desk(it.session)?.seat ?? IX + 40 } : { from: 'door' }
      const cr = { it, t0: performance.now(), carry: true }
      cr.npc = tower.spawn({ id: 'records-courier-' + it.id, ...from, z: Z.WALK, draw: (c, p, now) => sprite(c, p, now, cr.carry ? it : null, 5, 30) })
      const ok = cr.npc.go('post', ch.x - 5, { face: 'right', then: () => { cr.carry = false; cr.t = performance.now(); falling.push({ it, t: performance.now() }) } })
      if (!ok) { cr.npc.remove(); basket.push(it); continue }
      couriers.push(cr)
    }
    const ar = archivist(); if (!ar || ar.busy || !basket.length) return
    const it = basket.shift(), i = list.findIndex(q => q.id === it.id), d = i >= 0 && drawer(i)
    if (!d) { pending.delete(it.id); return }
    ar.busy = { it, carry: false }
    ar.npc.go('basement', CHUTE - 2, { face: 'up', then: () => {
      ar.busy.carry = true
      ar.npc.go('basement', d.x + 3, { face: 'up', then: () => {
        ar.busy.carry = false; opening.set(it.id, performance.now()); pending.delete(it.id)
        setTimeout(() => { ar.busy = null; ar.idleAt = performance.now() }, OPEN_MS)
      } })
    } })
  }
  tower.on('step', () => {
    if (two() && !wasTwo) rollAt = primed ? performance.now() : 0
    wasTwo = two()
    dispatch()
    const now = performance.now()
    for (let i = falling.length - 1; i >= 0; i--) if (now - falling[i].t > FALL_MS) { basket.push(falling[i].it); falling.splice(i, 1) }
    for (let i = couriers.length - 1; i >= 0; i--) {
      const cr = couriers[i]
      if (!cr.carry && cr.t && !cr.out && now - cr.t > 700) { cr.out = true; cr.npc.leave(() => cr.npc.remove()) }
      if (cr.npc.gone || now - cr.t0 > 120_000) { if (cr.carry) basket.push(cr.it); if (!cr.npc.gone) cr.npc.remove(); couriers.splice(i, 1) }
    }
    if (arch && !arch.busy && arch.idleAt && now - arch.idleAt > 400 && !arch.npc.gone) { arch.idleAt = 0; arch.npc.go('basement', IX + 396, { face: 'right' }) }
    for (const [id, t] of opening) if (now - t > OPEN_MS + 300) opening.delete(id)
  })

  // ---------- the room ----------
  const steel = () => STEEL[api.theme?.skin] || STEEL.classic
  tower.on('items', out => {
    const f = room(); if (!f) return
    out.push({ z: Z.WALL + 2, draw: (c, now) => {
      const [body, dark, hi] = steel()
      R(c, '#3a4256', CAB[0] - 2, f.top + 12, 38, 7); R(c, '#c9a25a', CAB[0] - 1, f.top + 13, 36, 5)      // the RECORDS sign
      if (tower.zoom < 3) { R(c, '#5a4018', CAB[0] + 6, f.top + 15, 22, 1) }
      for (let cab = 0; cab < (two() ? 2 : 1); cab++) {
        const d0 = drawer(cab * PER), x = d0.x - 1, y = f.y - 3 - CH
        R(c, 'rgba(0,0,0,.25)', x + 1, f.y - 1, CW, 1)
        R(c, dark, x, y, CW, CH); R(c, body, x + 1, y, CW - 2, CH - 1); R(c, hi, x, y, CW, 1)
        R(c, '#1a1e2a', x + 2, f.y - 3, 3, 3); R(c, '#1a1e2a', x + CW - 5, f.y - 3, 3, 3)        // casters
        R(c, '#4a5266', x + 3, f.y - 2, 1, 1); R(c, '#4a5266', x + CW - 4, f.y - 2, 1, 1)
      }
      for (let i = 0; i < (two() ? MAX : PER); i++) {
        const d = drawer(i), q = list[i], filed = q && !pending.has(q.id)
        if (!filed) { R(c, '#3a4050', d.x, d.y, d.w, d.h); R(c, '#2a2e3a', d.x, d.y + d.h - 1, d.w, 1); R(c, '#5a6272', d.x + 3, d.y + 1, 1, 1); continue }
        const at = opening.get(q.id), open = at != null ? Math.sin(Math.min(1, (performance.now() - at) / OPEN_MS) * Math.PI) : 0
        const col = KIND[q.kind]?.[0] || '#ccc'
        if (open > 0.15) {   // pulled out toward us: its top shows the folders, the face drops and grows
          const o = Math.round(open * 2)
          R(c, '#20242e', d.x - o, d.y - 1, d.w + 2 * o, 2); R(c, '#e8c47a', d.x - o + 1, d.y - 1, d.w + 2 * o - 2, 1); R(c, col, d.x + 2, d.y - 2, 2, 1)
          R(c, '#d8dce4', d.x - o, d.y + 1, d.w + 2 * o, d.h); R(c, col, d.x + 1, d.y + 2, d.w - 2, 1)
          continue
        }
        R(c, '#c8ccd4', d.x, d.y, d.w, d.h); R(c, '#9aa0aa', d.x, d.y + d.h - 1, d.w, 1)
        R(c, col, d.x + 1, d.y, 4, 2); R(c, '#f4f0e6', d.x + 2, d.y + 1, 2, 1)            // the label card
        R(c, '#4a5060', d.x + 6, d.y + 1, 1, 1)                                            // the pull
      }
    } })
  })

  tower.on('items', out => {
    const ch = chute(); if (!ch) return
    out.push({ z: Z.FRONT + 2, draw: c => {   // the brass slot in the post room floor, under it the basket and anything falling
      R(c, '#5a4018', ch.x - 5, ch.py - 2, 10, 2); R(c, '#c9a25a', ch.x - 4, ch.py - 2, 8, 1); R(c, '#1a1208', ch.x - 3, ch.py - 1, 6, 1)
      R(c, '#c9a25a', ch.x - 1, ch.py - 9, 3, 5); R(c, '#3b2617', ch.x, ch.py - 8, 1, 2); R(c, '#3b2617', ch.x - 1, ch.py - 6, 3, 1); R(c, '#5a4018', ch.x, ch.py - 4, 1, 2)   // a little ↓ sign
      const by = ch.by
      R(c, '#6d7684', ch.x - 4, room().top, 1, by - room().top); R(c, '#6d7684', ch.x + 4, room().top, 1, by - room().top)
      for (let k = 0; k < Math.min(4, basket.length); k++) { R(c, '#c89a4a', ch.x - 3, by + 2 - k, 7, 1); R(c, '#e8c47a', ch.x - 2, by + 2 - k, 2, 1) }
      R(c, '#9aa3ad', ch.x - 5, by + 3, 11, 1); R(c, '#9aa3ad', ch.x - 5, by, 1, 3); R(c, '#9aa3ad', ch.x + 5, by, 1, 3)
      for (let x = ch.x - 3; x < ch.x + 5; x += 2) R(c, '#7a838f', x, by + 1, 1, 2)
      const now = performance.now()
      for (const fl of falling) {
        const k = Math.min(1, (now - fl.t) / FALL_MS), y = ch.py - 3 + (by - ch.py + 4) * k * k
        R(c, '#c89a4a', ch.x - 2, y, 5, 4); R(c, '#e8c47a', ch.x - 2, y, 5, 1); R(c, KIND[fl.it.kind]?.[0] || '#ccc', ch.x - 1, y + 2, 3, 1)
      }
    } })
  })

  tower.on('glow', (c, now, n) => {
    const f = room(); if (!f || n < 0.05) return
    c.fillStyle = `rgba(255,220,150,${0.18 * n})`; c.fillRect(CAB[0] - 2, f.top + 12, 38, 7)
  })

  tower.on('overlay', v => {
    const f = room(), k = tower.zoom; if (!f || k < 3) return
    const a = tower.worldToScreen(CAB[0] + 17, f.top + 15.5)
    if (a.x < -100 || a.x > v.canvas.width + 100 || a.y < -20 || a.y > v.canvas.height + 20) return
    v.save(); v.textAlign = 'center'; v.textBaseline = 'middle'; v.fillStyle = '#3a2410'; v.font = font(Math.min(3.4 * k, 14), 800)
    v.fillText(`RECORDS · ${list.length}`, a.x, a.y + 0.5); v.restore()
  })

  const time = t => new Date(t).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
  const who = q => `${esc(q.title || 'a session')}${q.agent ? ` · ${esc(q.agent.type)} agent${q.agent.description ? ` “${esc(q.agent.description)}”` : ''}` : ''}`
  tower.on('hover', (w, person) => {
    if (person) return null
    const f = room(); if (!f) return null
    const area = { x: CAB[0] - 2, y: f.top + 12, w: 38, h: f.y - f.top - 12 }
    if (!inR(w, area)) return null
    for (let i = 0; i < list.length; i++) {
      const d = drawer(i), q = list[i]
      if (!inR(w, { x: d.x, y: d.y - 0.5, w: d.w, h: d.h + 1 }) || pending.has(q.id)) continue
      return `<div class="t">🗂 ${esc(q.file)}</div><div>${who(q)}</div><div class="m">${time(q.at)} · ${esc(q.tool)} · ${esc(KIND[q.kind]?.[1] || q.kind)}</div>${q.line ? `<div>“${esc(q.line)}”</div>` : ''}`
    }
    const by = {}; for (const q of list) by[q.kind] = (by[q.kind] || 0) + 1
    return `<div class="t">🗂 Records room</div><div>${list.length ? `${list.length} filing${list.length > 1 ? 's' : ''} today` : 'nothing filed today'}</div>`
      + (list.length ? `<div class="m">${Object.entries(by).map(([k, n]) => `${n} ${esc(KIND[k]?.[1] || k)}`).join(' · ')}</div>` : '')
      + '<div class="m">every write to a CLAUDE.md, rule, skill or memory file</div>'
  })
}
