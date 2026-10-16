// post-room: the basement between the lobby and the server room, one parcel per open PR in the repo (snap.street.post,
// the whole team's). Drafts wait in a locked cage, ready PRs on the sorting rack; review requested from the user goes in the
// FOR YOU pigeonholes and approved ones are stamped onto the OUTBOUND cart. A parcel's size follows its diff (additions +
// deletions); the user's are wrapped in his burgundy and gold, labels are stickers in their GitHub colour, changes requested
// is a RETURN TO SENDER stamp, red CI smokes (never on a draft: the user's call), a merge conflict crushes the box and a week
// without an update gathers dust and cobwebs. A new PR is carried in from the street by a courier; a merged one is taken
// up by a postal worker to the van at the kerb, which drives off. Hover a parcel or a sign; click a parcel for its PR.
// ?demo=postroom fakes the states, an arrival and a merge departure every 20 s, and flies there.
import { IX } from '../building.js'
import { R, inR } from '../draw.js'

const DAY = 864e5, STALE = 7 * DAY, TOP = 52, TIERS = [3, 19, 35]
const CAGE = { x0: IX + 6, x1: IX + 176 }, RACK = { x0: IX + 190, x1: IX + 380 }, HOLE = { x: IX + 393, y: 52, cols: 4, rows: 2 }, CART = { x: IX + 394, w: 52 }
const VAN_X = -178, VAN_W = 44
const WRAP = { kraft: ['#b48a58', '#8e6a40', '#e0c890'], mine: ['#7a2a2e', '#561c20', '#d8b45a'], bot: ['#9aa3ad', '#6f7884', '#d8dee6'] }
const AREA = { drafts: ['DRAFTS', '#8a6a2a'], ready: ['READY FOR REVIEW', '#2f5a8a'], mine: ['FOR YOU', '#7a2a2e'], outbound: ['OUTBOUND', '#2f6a3a'] }
const SPOTS = [[IX + 60, 'up', 'read'], [IX + 130, 'up', 'type'], [IX + 236, 'up', 'type'], [IX + 330, 'up', 'read'], [IX + 420, 'up', 'read'], [IX + 462, 'left', null]]
const dims = n => n < 50 ? [6, 4] : n < 200 ? [8, 5] : n < 800 ? [9, 7] : n < 2500 ? [11, 8] : [13, 9]
const where = p => p.draft ? 'drafts' : p.review === 'APPROVED' ? 'outbound' : p.forMe ? 'mine' : 'ready'
const dropX = a => ({ drafts: IX + 110, ready: IX + 285, mine: IX + 420, outbound: IX + 420 })[a]
const stale = p => p.updatedAt && Date.now() - p.updatedAt > STALE
const smokes = p => p.ci === 'failed' && !p.draft

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('postroom')
  let list = [], primed = false, known = new Map(), me = null, flown = false
  const gone = new Map()        // n -> { p, at }: left the open list, waiting for the merged list to say how
  const hidden = new Set()      // parcels in a courier's or a worker's hands
  const departures = [], couriers = [], workers = []
  let van = null, placed = [], over = {}
  // for commit-stamps and merge-stamp: a parcel's rect by PR number, drawing on a parcel, nudging it, holding a merge pickup (ms)
  const hooks = tower.postRoom = { rect: n => placed.find(q => q.p.n === n) || null, decorate: [], jolt: [], hold: [] }
  const each = (l, ...a) => l.map(fn => { try { return fn(...a) } catch (e) { console.error('[post-room hook]', e) } })

  // ---------- data ----------
  tower.on('sync', snap => {
    const st = snap.street
    if (!st || st.status !== 'ok' || !Array.isArray(st.post)) return
    me = st.me
    const now = Date.now(), cur = new Map(st.post.map(p => [p.n, p])), merged = new Map((st.merged || []).map(m => [m.number, m]))
    if (primed) {
      const fresh = st.post.filter(p => !known.has(p.n))
      for (const p of fresh) if (fresh.length <= 4) deliver(p)
      for (const [n, p] of known) if (!cur.has(n)) gone.set(n, { p, at: now })
    }
    for (const [n, g] of gone) {
      if (cur.has(n)) { gone.delete(n); continue }
      const m = merged.get(n)
      if (m && now - Date.parse(m.mergedAt) < 3 * 3600_000) { gone.delete(n); departures.push({ p: g.p, phase: 'shelf', at: performance.now() }) }
      else if (m || now - g.at > 10 * 60_000) gone.delete(n)
    }
    known = cur; primed = true
    list = [...st.post, ...[...gone.values()].map(g => g.p)]
    if (demo && !flown && !params.get('towerzoom') && tower.floor('post')) { flown = true; setTimeout(() => tower.flyTo('post'), 600) }
  })
  const shelved = () => [...list, ...departures.filter(d => ['shelf', 'fetch', 'hold'].includes(d.phase)).map(d => d.p)].filter(p => !hidden.has(p.n))

  // ---------- layout: each area packs left to right, bottom tier first, then a second layer on top ----------
  function layout(f) {
    placed = []; over = { drafts: 0, ready: 0, mine: 0, outbound: 0 }
    const by = { drafts: [], ready: [], mine: [], outbound: [] }
    for (const p of [...shelved()].sort((a, b) => a.n - b.n)) by[where(p)].push(p)
    const pack = (ps, x0, x1, floors, layers, area) => {
      const T = floors.length, rows = floors.map(() => []), per = Math.ceil(ps.length / T)
      let i = 0
      for (let t = 0; t < T && i < ps.length; t++) {   // the first layer: an even share per tier, spread across it
        const take = []; let sum = 0
        while (i < ps.length && (take.length < per || t === T - 1)) { const w = dims(ps[i].size)[0]; if (sum + w + 2 * take.length > x1 - x0) break; take.push(ps[i++]); sum += w }
        const gap = Math.max(2, Math.min(24, (x1 - x0 - sum) / Math.max(1, take.length)))
        let x = x0 + Math.min(gap, 24) / 2 - 1
        for (const p of take) { const [w, h] = dims(p.size), q = { p, x: Math.round(x), y: floors[t] - h, w, h, area }; rows[t].push(q); placed.push(q); x += w + gap }
      }
      for (let layer = 1; layer < layers && i < ps.length; layer++) for (let t = 0; t < T && i < ps.length; t++) {   // then stacked on top
        let x = x0
        while (i < ps.length) {
          const p = ps[i], [w, h] = dims(p.size)
          if (x + w > x1) break
          const under = rows[t].filter(q => q.x < x + w && q.x + q.w > x), base = under.length ? Math.min(...under.map(q => q.y)) : floors[t]
          if (t < T - 1 && base - h < floors[t + 1] + 2) { x += 3; continue }
          const q = { p, x, y: base - h, w, h, area, layer }
          rows[t].push(q); placed.push(q); x += w + 2; i++
        }
      }
      over[area] = ps.length - i
    }
    pack(by.drafts, CAGE.x0 + 4, CAGE.x1 - 4, TIERS.map(t => f.y - t), 2, 'drafts')
    pack(by.ready, RACK.x0 + 4, RACK.x1 - 4, TIERS.map(t => f.y - t), 2, 'ready')
    pack(by.outbound, CART.x + 4, CART.x + CART.w - 6, [f.y - 7], 2, 'outbound')
    by.mine.forEach((p, i) => {
      if (i >= HOLE.cols * HOLE.rows) return void over.mine++
      const [w, h] = dims(p.size), cw = Math.min(w, 10), ch = Math.min(h, 7), r = hole(f, i)
      placed.push({ p, x: r.x + (r.w - cw >> 1), y: r.y + r.h - ch, w: cw, h: ch, area: 'mine' })
    })
    return by
  }
  const hole = (f, i) => ({ x: HOLE.x + 2 + (i % HOLE.cols) * 13, y: f.y - HOLE.y + 2 + Math.floor(i / HOLE.cols) * 11, w: 12, h: 9 })
  const signs = f => ({
    drafts: { x: CAGE.x0 + 30, y: f.top + 12, w: CAGE.x1 - CAGE.x0 - 60, h: 9 },
    ready: { x: RACK.x0 + 16, y: f.top + 12, w: RACK.x1 - RACK.x0 - 32, h: 9 },
    mine: { x: HOLE.x, y: f.top + 12, w: 54, h: 9 },
    outbound: { x: CART.x + 3, y: f.y - 27, w: CART.w - 8, h: 7 },
  })
  const count = (by, a) => a === 'ready' ? by.ready.length + by.mine.length + by.outbound.length : by[a].length

  // ---------- the people: two postal workers, couriers bringing new PRs, the merge run to the van ----------
  function sprite(c, p, now, palette, hue, anim, cap) {
    const sheet = api.charSheet(palette, hue); if (!sheet?.width) return
    let row = 2, frame = 1, flip = false
    if (p.riding) row = 0
    else if (p.walking) { flip = p.dir === 'left'; frame = [0, 1, 2, 1][Math.floor(now / 130) % 4] }
    else { const f = p.face || 'right'; row = f === 'down' ? 0 : f === 'up' ? 1 : 2; flip = f === 'left'; frame = anim === 'type' ? 3 + Math.floor(now / 170) % 2 : anim === 'read' ? 5 + Math.floor(now / 420) % 2 : 1 }
    const dx = Math.round(p.x - 8), dy = Math.round(p.y - 30)
    if (flip) { c.save(); c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(sheet, frame * 16, row * 32, 16, 32, 0, 0, 16, 32); c.restore() }
    else c.drawImage(sheet, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
    if (cap) {
      const x = Math.round(p.x), y = Math.round(p.y) - 27
      R(c, cap, x - 4, y, 8, 2); R(c, 'rgba(255,255,255,.25)', x - 3, y, 6, 1)
      if (row === 2) R(c, cap, flip ? x - 6 : x + 3, y + 2, 3, 1); else if (row === 0) R(c, cap, x - 4, y + 2, 8, 1)
    }
  }
  function ensureWorkers(now) {
    if (!tower.floor('post')) return
    for (let i = 0; i < 2; i++) {
      const w = workers[i] ||= { i, task: null, until: now + 1500 * i, spot: -1, anim: null }
      if (w.npc && !w.npc.gone) continue
      w.npc = tower.spawn({ id: 'post-worker-' + i, floor: 'post', x: SPOTS[i * 3][0], z: Z.STAND + 1, draw: (c, p, n) => sprite(c, p, n, i ? 4 : 0, 0, w.anim, '#1f3a6a') })
      w.task = null; w.until = now + 2000
    }
  }
  function wander(w, now) {
    let k = Math.floor(Math.random() * SPOTS.length); if (k === w.spot) k = (k + 1) % SPOTS.length
    const [x, face, anim] = SPOTS[k]
    w.spot = k; w.anim = null; w.until = Infinity
    if (!w.npc.go('post', x, { face, then: () => { w.anim = anim; w.until = performance.now() + 3500 + Math.random() * 6000 } })) w.until = now + 3000
  }
  function fetch(w, d, now) {
    const q = placed.find(q => q.p.n === d.p.n), x = q ? q.x + q.w / 2 : dropX(where(d.p))
    w.task = 'fetch'; w.d = d; w.anim = null; w.t0 = now; d.phase = 'fetch'
    const ok = w.npc.go('post', x, { face: 'up', then: () => {
      const wait = Math.max(0, ...each(hooks.hold, d.p, placed.find(q => q.p.n === d.p.n)).filter(Number.isFinite))
      if (wait) { d.phase = 'hold'; w.task = 'hold'; w.anim = 'read'; w.holdUntil = performance.now() + wait } else carry(w, d)
    } })
    if (!ok) { w.task = null; d.phase = 'done' }
  }
  function carry(w, d) {
    d.phase = 'carried'; hidden.add(d.p.n); w.task = 'carry'; w.anim = null; callVan()
    w.npc.go('lobby', VAN_X + VAN_W + 7, { face: 'left', then: () => { w.task = 'load' } })
  }
  function callVan() {
    if (van && van.phase !== 'out') return
    van = { x: Math.max(tower.street.extent?.x0 ?? -600, -900) - 60, phase: 'in', load: [], t: 0, door: 0 }
  }
  function deliver(p) {
    if (couriers.length >= 3 || !tower.floor('post')) return
    const cr = { p, phase: 'in', t0: performance.now() }
    cr.npc = tower.spawn({ id: `post-courier-${p.n}`, from: 'street', z: Z.WALK, draw: (c, q, n) => sprite(c, q, n, 2, 0, null, '#6a4a1e') })
    hidden.add(p.n)
    if (!cr.npc.go('post', dropX(where(p)) + (couriers.length - 1) * 8, { face: 'up', then: () => { cr.phase = 'drop'; cr.t = performance.now(); hidden.delete(p.n) } })) { hidden.delete(p.n); cr.npc.remove(); return }
    couriers.push(cr)
  }

  tower.on('step', (dt, now) => {
    ensureWorkers(now)
    for (let i = couriers.length - 1; i >= 0; i--) {
      const cr = couriers[i]
      if (cr.phase === 'drop' && now - cr.t > 1400) { cr.phase = 'out'; cr.npc.leave(() => cr.npc.remove()) }
      if (cr.npc.gone || now - cr.t0 > 120_000) { hidden.delete(cr.p.n); if (!cr.npc.gone) cr.npc.remove(); couriers.splice(i, 1) }
    }
    for (const w of workers) {
      if (!w.npc || w.npc.gone) continue
      if (w.task && now - w.t0 > 120_000) { if (w.d) { w.d.phase = 'done'; hidden.delete(w.d.p.n) } w.task = null; w.until = now }
      if (w.task === 'hold' && now >= w.holdUntil) carry(w, w.d)
      if (w.task === 'load' && van?.phase === 'parked') {
        van.load.push(w.d.p); van.t = 0; w.d.phase = 'done'; w.task = null; w.until = now + 400
      }
      if (!w.task) {
        const d = departures.find(d => d.phase === 'shelf')
        if (d) fetch(w, d, now)
        else if (now > w.until) wander(w, now)
      }
    }
    for (let i = departures.length - 1; i >= 0; i--) if (departures[i].phase === 'done') { hidden.delete(departures[i].p.n); departures.splice(i, 1) }
    if (van) {
      van.t += dt
      if (van.phase === 'in') { van.x = Math.min(VAN_X, van.x + Math.max(30, Math.min(140, (VAN_X - van.x) * 1.5)) * dt); if (van.x >= VAN_X) { van.phase = 'parked'; van.t = 0 } }
      else if (van.phase === 'parked') {
        van.door = Math.min(1, van.door + dt * 3)
        const busy = departures.some(d => d.phase !== 'done') || workers.some(w => w.task === 'carry' || w.task === 'load')
        if (!busy && van.t > 1.6) van.phase = 'out'
      } else {
        van.door = Math.max(0, van.door - dt * 4)
        if (!van.door) van.x -= Math.min(160, 20 + van.t * 70) * dt
        if (van.x < (tower.street.extent?.x0 ?? -600) - 120) van = null
      }
    }
  })

  // ---------- drawing ----------
  function parcel(c, q, now) {
    const p = q.p, [body, shade, tape] = p.mine ? WRAP.mine : p.bot ? WRAP.bot : WRAP.kraft
    let { x, y, w, h } = q
    for (const o of each(hooks.jolt, p, now)) if (o) { x += o.x || 0; y += o.y || 0 }
    if (p.conflict) {   // crushed: the lid caved in, the sides bulge
      y += 2; h -= 2
      R(c, shade, x - 1, y + 1, w + 2, h - 1); R(c, body, x, y, w - 1, h - 1)
      R(c, shade, x + (w >> 1) - 2, y, 4, 1); R(c, 'rgba(40,24,10,.45)', x + (w >> 1) - 1, y + 1, 2, 1); R(c, shade, x + 1, y + h - 2, w - 3, 1)
    } else { R(c, shade, x, y, w, h); R(c, body, x, y, w - 1, h - 1); R(c, 'rgba(255,255,255,.18)', x, y, w - 1, 1) }
    if (p.mine) { R(c, tape, x + (w >> 1), y, 1, h); R(c, tape, x, y + (h >> 1), w, 1); R(c, tape, x + (w >> 1) - 1, y - 1, 1, 1); R(c, tape, x + (w >> 1) + 1, y - 1, 1, 1) }
    else R(c, tape, x + (w >> 1) - 1, y, 2, Math.min(3, h - 1))
    if (w >= 7) (p.labels || []).forEach((l, i) => { if (/^[0-9a-f]{6}$/i.test(l.color || '')) R(c, '#' + l.color, x + 1 + i * 2, y + h - 3, 2, 2) })
    if (p.review === 'APPROVED') { const sx = x + w - 5, sy = y + 1; R(c, '#2f8a44', sx, sy, 3, 1); R(c, '#2f8a44', sx, sy + 2, 3, 1); R(c, '#2f8a44', sx, sy, 1, 3); R(c, '#2f8a44', sx + 2, sy, 1, 3) }
    if (p.review === 'CHANGES_REQUESTED') for (let i = 0; i < w - 1; i++) R(c, '#c8302a', x + i, y + h - 2 - Math.floor(i * (h - 2) / w), 1, 1)
    if (smokes(p)) {
      R(c, '#2a2420', x + 1, y, 2, 1); R(c, '#3a302a', x + w - 3, y + 1, 2, 2); R(c, Math.floor(now / 160 + p.n) % 3 ? '#ff7a2a' : '#ffd84a', x + 2, y - 1, 1, 1)
      for (let i = 0; i < 4; i++) {
        const k = ((now / 2400) + i / 4 + (p.n % 7) / 7) % 1
        c.fillStyle = `rgba(80,76,82,${(0.5 * (1 - k)).toFixed(3)})`
        const r = 0.5 + k * 2; c.fillRect(Math.round(x + w / 2 + Math.sin(k * 5 + i) * 2 + k * 3 - r), Math.round(y - 2 - k * 16 - r), Math.ceil(2 * r), Math.ceil(2 * r))
      }
    }
    if (stale(p)) {
      R(c, 'rgba(220,214,200,.65)', x, y, w, 1)
      c.fillStyle = 'rgba(220,214,200,.5)'; for (let i = 0; i < 3; i++) c.fillRect(x + ((i * 5 + p.n) % Math.max(1, w - 1)), y + 1 + (i % 2) * 2, 1, 1)
      c.fillStyle = 'rgba(245,245,250,.8)'; for (let i = 0; i < 4; i++) { c.fillRect(x - 1 - i, y - 1 - i, 1, 1); c.fillRect(x - 1 - i, y - 1, 1, 1) }
    }
    each(hooks.decorate, c, { ...q, x, y, w, h }, now)
  }
  function furniture(c, f) {
    const y = f.y
    // the drafts cage: a back panel and grey shelves (its mesh is drawn over the parcels)
    R(c, 'rgba(70,66,52,.14)', CAGE.x0, y - TOP, CAGE.x1 - CAGE.x0, TOP)
    for (const t of TIERS) { R(c, '#7a7e86', CAGE.x0, y - t, CAGE.x1 - CAGE.x0, 2); R(c, '#9aa0a8', CAGE.x0, y - t, CAGE.x1 - CAGE.x0, 1) }
    // the sorting rack: steel uprights, slotted shelves
    R(c, 'rgba(40,60,90,.10)', RACK.x0, y - TOP, RACK.x1 - RACK.x0, TOP)
    for (const x of [RACK.x0, RACK.x0 + 63, RACK.x0 + 126, RACK.x1 - 3]) { R(c, '#3e5470', x, y - TOP, 3, TOP); R(c, '#5a7290', x, y - TOP, 1, TOP) }
    for (const t of [...TIERS, TOP]) { R(c, '#8a6a44', RACK.x0, y - t, RACK.x1 - RACK.x0, 2); R(c, '#a8845a', RACK.x0, y - t, RACK.x1 - RACK.x0, 1) }
    // FOR YOU: a wooden pigeonhole board on the wall; the OUTBOUND cart under it
    const hy = y - HOLE.y
    R(c, '#5a3a22', HOLE.x, hy, 54, 25); R(c, '#c9a25a', HOLE.x, hy, 54, 1)
    for (let i = 0; i < HOLE.cols * HOLE.rows; i++) { const r = hole(f, i); R(c, '#2e1e12', r.x, r.y, r.w, r.h) }
    R(c, '#7a5a3a', CART.x + CART.w - 2, y - 26, 2, 22); R(c, '#9a7a5a', CART.x + CART.w - 6, y - 27, 6, 2)
    R(c, '#5a6070', CART.x + 8, y - 20, 1, 2); R(c, '#5a6070', CART.x + CART.w - 14, y - 20, 1, 2)
    R(c, '#5a6070', CART.x, y - 7, CART.w, 2)
    for (const wx of [CART.x + 4, CART.x + CART.w - 9]) { R(c, '#1a1a20', wx, y - 4, 4, 4); R(c, '#8a8a92', wx + 1, y - 3, 2, 2) }
    // a franking machine on a stand by the shaft door, a wall clock over it
    R(c, '#4a4f5a', IX + 452, y - 14, 2, 14); R(c, '#3a3f4a', IX + 446, y - 16, 14, 2); R(c, '#b8402f', IX + 447, y - 23, 12, 7); R(c, '#e8e0c8', IX + 449, y - 21, 5, 2); R(c, '#2a2a30', IX + 455, y - 21, 2, 4)
    R(c, '#4a3a2c', IX + 448, f.top + 22, 10, 10); R(c, '#f4f0e6', IX + 449, f.top + 23, 8, 8); R(c, '#333', IX + 453, f.top + 24, 1, 4); R(c, '#333', IX + 453, f.top + 27, 2, 1)
  }
  function fronts(c, f) {
    const y = f.y
    c.fillStyle = 'rgba(96,100,110,.55)'
    for (let x = CAGE.x0; x <= CAGE.x1; x += 5) c.fillRect(x, y - TOP, 1, TOP - 1)
    for (let yy = y - TOP; yy < y; yy += 7) c.fillRect(CAGE.x0, yy, CAGE.x1 - CAGE.x0, 1)
    R(c, '#4a4e58', CAGE.x0, y - TOP - 1, CAGE.x1 - CAGE.x0 + 1, 2); R(c, '#4a4e58', CAGE.x0, y - TOP, 2, TOP); R(c, '#4a4e58', CAGE.x1 - 1, y - TOP, 2, TOP)
    R(c, '#4a4e58', CAGE.x1 - 42, y - TOP, 2, TOP)                                                    // the door's frame
    R(c, '#d8b45a', CAGE.x1 - 46, y - 33, 5, 4); R(c, '#8a6a2a', CAGE.x1 - 45, y - 36, 3, 3); R(c, '#4a4e58', CAGE.x1 - 44, y - 35, 1, 2)   // the padlock
    R(c, '#f2d24a', CAGE.x0 + 8, y - 47, 18, 7); R(c, '#2a2a30', CAGE.x0 + 10, y - 45, 14, 1); R(c, '#2a2a30', CAGE.x0 + 10, y - 43, 10, 1)   // a NOT READY tag
    c.fillStyle = 'rgba(96,104,118,.8)'
    for (let x = CART.x; x <= CART.x + CART.w - 4; x += 4) c.fillRect(x, y - 18, 1, 11)
    R(c, '#5a6070', CART.x, y - 19, CART.w - 2, 2)
  }
  function sign(c, r, col, chain = true) {
    if (chain) { R(c, '#4a4452', r.x + 4, r.y - 12, 1, 12); R(c, '#4a4452', r.x + r.w - 5, r.y - 12, 1, 12) }
    R(c, '#2a2420', r.x - 1, r.y - 1, r.w + 2, r.h + 2); R(c, col, r.x, r.y, r.w, r.h); R(c, 'rgba(255,255,255,.2)', r.x, r.y, r.w, 1)
  }
  function vanDraw(c, now) {
    const x = Math.round(van.x), y = 13, moving = van.phase !== 'parked' && van.x < VAN_X - 0.5 || van.phase === 'out' && !van.door
    const bob = moving && Math.floor(now / 90) % 2 ? -1 : 0, b = y + bob
    R(c, 'rgba(0,0,0,.3)', x - 1, y + 1, VAN_W + 2, 1)
    R(c, '#e8e4dc', x + 8, b - 20, VAN_W - 8, 16); R(c, '#e8e4dc', x, b - 12, 10, 8); R(c, '#d0ccc4', x + 2, b - 17, 8, 5)
    R(c, '#7ab0d8', x + 3, b - 16, 6, 4); R(c, '#c8302a', x, b - 8, VAN_W, 2); R(c, '#2f5a8a', x, b - 6, VAN_W, 1)
    R(c, '#f4f0e6', x + 20, b - 16, 9, 6); R(c, '#c8302a', x + 20, b - 16, 9, 1); R(c, '#b8b0a0', x + 21, b - 15, 3, 2); R(c, '#b8b0a0', x + 26, b - 15, 2, 2)   // the envelope logo
    R(c, '#f2d24a', x, b - 11, 1, 2); R(c, '#d83a3a', x + VAN_W - 1, b - 11, 1, 2)
    if (van.door) { R(c, '#1a1a20', x + VAN_W - 1, b - 19, 1, 14); R(c, '#d0ccc4', x + VAN_W, b - 19, Math.round(5 * van.door), 14) }
    for (const wx of [x + 5, x + VAN_W - 11]) { R(c, '#16161a', wx, y - 5, 6, 5); R(c, '#9a9aa2', wx + 2, y - 3, 2, 2) }
    van.load.slice(-3).forEach((p, i) => { if (van.door > 0.5) { const [w, h] = dims(p.size); R(c, p.mine ? WRAP.mine[0] : WRAP.kraft[0], x + VAN_W - 4 - w - i * 2, b - 6 - h - i, w, h) } })
  }

  tower.on('items', (out, now) => {
    const f = tower.floor('post'); if (!f || f.open != null) return
    layout(f); const s = signs(f)
    out.push({ z: Z.WALL + 4, draw: c => {
      furniture(c, f)
      for (const q of placed) if (!q.layer || q.area !== 'outbound') parcel(c, q, now)
      for (const a of ['drafts', 'ready', 'mine']) sign(c, s[a], AREA[a][1])
      sign(c, s.outbound, AREA.outbound[1], false)
    } })
    out.push({ z: Z.FLOOR + 4, draw: c => {
      fronts(c, f)
      for (const q of placed) if (q.layer && q.area === 'outbound') parcel(c, q, now)
      if (hover?.q) { const q = hover.q; c.strokeStyle = 'rgba(255,236,160,.95)'; c.lineWidth = 1; c.strokeRect(q.x - 0.5, q.y - 0.5, q.w + 1, q.h + 1) }
    } })
    for (const cr of couriers) if (cr.phase === 'in' && !cr.npc.gone) out.push({ z: Z.RIDE + 1, draw: c => carried(c, cr.npc, cr.p) })
    for (const w of workers) if ((w.task === 'carry' || w.task === 'load') && w.npc && !w.npc.gone) out.push({ z: Z.RIDE + 1, draw: c => carried(c, w.npc, w.d.p) })
    if (van) out.push({ z: Z.OUTSIDE + 5, draw: c => vanDraw(c, now) })
  })
  function carried(c, npc, p) {
    const [w, h] = dims(p.size), x = Math.round(npc.x) - (w >> 1) + (npc.walking ? (npc.dir === 'left' ? -4 : 4) : 0), y = Math.round(npc.y) - 13 - h
    parcel(c, { p, x, y, w, h }, performance.now())
  }

  tower.on('overlay', v => {
    const f = tower.floor('post'), k = tower.zoom; if (!f || f.open != null) return
    const by = layout(f), s = signs(f)
    v.save(); v.textAlign = 'center'; v.textBaseline = 'middle'
    for (const a of Object.keys(AREA)) {
      const r = s[a], h = r.h * k, w = r.w * k; if (h < 9) continue
      const p = tower.worldToScreen(r.x, r.y), n = count(by, a), more = over[a] ? ` +${over[a]}` : ''
      if (p.x > tower.canvas.clientWidth || p.x + w < 0 || p.y > tower.canvas.clientHeight || p.y + h < 0) continue
      v.font = font(Math.min(13, h * 0.62), 700); v.fillStyle = a === 'mine' ? '#f2d488' : '#f4ecd8'
      v.fillText(tower.fitText(`${AREA[a][0]} · ${n}${more}`, w - 4, v.font), p.x + w / 2, p.y + h / 2 + 0.5)
    }
    v.restore()
  })

  // ---------- hover / click ----------
  let hover = null
  const state = p => p.draft ? 'draft' : p.review === 'APPROVED' ? 'approved' : p.review === 'CHANGES_REQUESTED' ? 'changes requested' : p.forMe ? 'review requested from you' : 'ready for review'
  const ci = p => p.ci === 'failed' ? (p.draft ? 'CI failed (a draft never burns)' : '🔥 CI failed') : p.ci === 'running' ? 'CI running' : p.ci === 'passed' ? 'CI ✓' : 'no CI yet'
  const sizeName = n => n < 50 ? 'a letter' : n < 200 ? 'a small parcel' : n < 800 ? 'a parcel' : n < 2500 ? 'a big box' : 'a crate'
  const line = p => `<div class="m">#${p.n} ${esc(String(p.title || '').slice(0, 48))} — ${esc(p.author || '?')}</div>`
  function hit(w) {
    const f = tower.floor('post'); if (!f || f.open != null || w.y < f.top || w.y > f.y) return null
    const q = [...placed].reverse().find(q => inR(w, q, 1)); if (q) return { q }
    const s = signs(f); for (const a of Object.keys(AREA)) if (inR(w, s[a], 1)) return { area: a }
    if (inR(w, { x: CART.x, y: f.y - 27, w: CART.w, h: 27 })) return { area: 'outbound' }
    if (inR(w, { x: HOLE.x, y: f.y - HOLE.y, w: 54, h: 25 })) return { area: 'mine' }
    if (w.x >= CAGE.x0 && w.x <= CAGE.x1 && w.y >= f.y - TOP) return { area: 'drafts' }
    if (w.x >= RACK.x0 && w.x <= RACK.x1 && w.y >= f.y - TOP) return { area: 'ready' }
    return { room: true }
  }
  const vanHit = w => van && w.x >= van.x && w.x <= van.x + VAN_W && w.y >= -9 && w.y <= 14
  tower.on('hover', (w, person) => {
    hover = null
    if (person) return null
    if (vanHit(w)) return `<div class="t">🚚 Outbound van</div>${van.load.map(line).join('') || '<div class="m">waiting for a merged PR</div>'}<div class="m">merged — off it goes</div>`
    const h = hit(w); if (!h) return null
    hover = h
    const f = tower.floor('post'), by = layout(f)
    if (h.q) {
      const p = h.q.p, lab = (p.labels || []).map(l => `<i class="s" style="background:#${esc(l.color || '888')}"></i>${esc(l.name)}`).join(' ')
      const marks = [p.conflict && '💥 merge conflict (crushed)', stale(p) && `🕸 no update for ${Math.floor((Date.now() - p.updatedAt) / DAY)} days`].filter(Boolean).join(' · ')
      return `<div class="t">📦 #${p.n} ${esc(p.title || '')}</div><div>${esc(p.author || '?')}${p.mine ? ' (you)' : p.bot ? ' (bot)' : ''} · ${state(p)}</div>`
        + `<div class="m">${sizeName(p.size)} · ${p.size} lines changed · ${ci(p)}</div>${marks ? `<div class="m">${marks}</div>` : ''}${lab ? `<div class="m">${lab}</div>` : ''}<div class="m">↗ click to open the PR</div>`
    }
    if (h.area) {
      const items = h.area === 'ready' ? [...by.ready, ...by.mine, ...by.outbound] : by[h.area]
      const what = { drafts: 'not ready yet — locked in the cage', ready: 'on the sorting rack, the pigeonholes and the cart', mine: 'review requested from you', outbound: 'approved — stamped and on the cart' }[h.area]
      return `<div class="t">${AREA[h.area][0]} · ${items.length}</div><div class="m">${what}</div>${items.slice(0, 12).map(line).join('')}${items.length > 12 ? `<div class="m">… and ${items.length - 12} more</div>` : ''}`
    }
    const all = shelved(), n = fn => all.filter(fn).length
    return `<div class="t">📮 Post room · ${all.length} open PR${all.length === 1 ? '' : 's'}${demo ? ' (demo)' : ''}</div>`
      + `<div class="m">${n(p => p.draft)} drafts · ${n(p => !p.draft)} ready · ${n(p => p.forMe && !p.draft)} for you · ${n(p => p.review === 'APPROVED' && !p.draft)} approved</div>`
      + `<div class="m">${n(smokes)} red CI · ${n(p => p.conflict)} conflicts · ${n(stale)} stale · ${n(p => p.mine)} yours</div>`
      + `<div class="m">size = lines changed · stickers = labels · a new PR arrives by courier, a merged one leaves by van</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h?.q) return false
    if (h.q.p.url) api.openLink(h.q.p.url); else api.toast(`#${h.q.p.n} · ${state(h.q.p)}`)
    return true
  })

  // ---------- ?demo=postroom ----------
  if (demo) {
    const LAB = { web: '3594a7', desktop: '6e5494', feature: '0e8a16', fix: 'd93f0b', infra: '5d6d7e', ci: '34495e', identity: 'c5def5', mobile: 'fbca04', docs: '0075ca', deps: '0366d6' }
    const mk = ([n, title, author, draft, review, ci, size, conflict, forMe, days, labels]) => ({
      n, title, author, mine: author === 'you', bot: /\[bot\]$/.test(author), draft, review, ci, size, conflict, forMe, url: null,
      labels: labels.map(name => ({ name, color: LAB[name] })), createdAt: Date.now() - (days + 2) * DAY, updatedAt: Date.now() - days * DAY,
    })
    const FAKE = [
      [1901, 'web: onboarding copy pass', 'demo-ana', true, null, 'failed', 120, false, false, 0.2, ['web']],
      [1902, 'desktop: tray icon states', 'you', true, null, 'running', 640, false, false, 0.1, ['desktop', 'feature']],
      [1903, 'auth: refresh token rotation', 'demo-ben', true, null, null, 2900, true, false, 1, ['auth']],
      [1904, 'billing: webhook retries', 'demo-cai', true, null, 'passed', 80, false, false, 12, ['fix']],
      [1905, 'infra: aurora snapshot policy', 'demo-dee', true, null, null, 30, false, false, 9, ['infra']],
      [1906, 'mobile: android biometrics', 'demo-eli', true, null, 'passed', 1500, false, false, 2, ['mobile']],
      [1907, 'web: dark mode tokens', 'you', true, null, 'passed', 260, false, false, 0.5, ['web']],
      [1910, 'web: receive sheet networks', 'demo-ana', false, null, 'passed', 210, false, true, 0.3, ['web']],
      [1911, 'api: balance cache ttl', 'demo-ben', false, null, 'running', 95, false, true, 0.5, ['fix']],
      [1912, 'desktop: settings page layout', 'you', false, null, 'passed', 420, false, false, 0.2, ['desktop']],
      [1913, 'prices: feed backoff', 'demo-dee', false, 'APPROVED', 'passed', 60, false, false, 0.4, ['fix']],
      [1914, 'web: activity detail pane', 'demo-cai', false, 'APPROVED', 'passed', 880, false, false, 1, ['web', 'feature']],
      [1915, 'auth: jwks cache', 'you', false, 'APPROVED', 'passed', 300, false, false, 0.6, ['auth']],
      [1916, 'reports: export csv', 'demo-eli', false, 'CHANGES_REQUESTED', 'passed', 180, false, false, 1.5, ['feature']],
      [1917, 'ci: cache cargo registry', 'demo-dee', false, 'CHANGES_REQUESTED', 'failed', 40, false, false, 3, ['ci']],
      [1918, 'web: checkout flow', 'demo-ana', false, null, 'failed', 1300, false, false, 0.8, ['web']],
      [1919, 'api: settle fee rounding', 'demo-ben', false, null, 'passed', 150, true, false, 4, ['fix']],
      [1920, 'docs: staging runbook', 'demo-eli', false, null, null, 25, false, false, 15, ['docs']],
      [1921, 'chore(deps): bump vite', 'dependabot[bot]', false, null, 'passed', 12, false, false, 0.1, ['deps']],
      [1922, 'mobile: ios widget', 'demo-cai', false, null, 'running', 3400, false, false, 0.2, ['mobile', 'feature']],
    ]
    let T0 = 0, posts = [], merged = [], arrived = 0, sent = 0
    tower.on('snapshot', data => {
      if (!T0) { T0 = Date.now(); posts = FAKE.map(mk) }
      const e = Date.now() - T0
      while (arrived < Math.floor((e - 4000) / 20000) + 1) {
        arrived++
        posts.push(mk([2000 + arrived, arrived % 2 ? 'web: new arrival from the street' : 'desktop: freshly opened', 'demo-ana', arrived % 2 === 0, arrived % 2 ? 'APPROVED' : null, 'running', 90 + arrived * 170, false, false, 0, ['web']]))
      }
      while (sent < Math.floor((e - 12000) / 20000) + 1) {
        sent++
        const i = posts.findIndex(p => p.review === 'APPROVED' && !p.draft)
        if (i >= 0) { const [p] = posts.splice(i, 1); merged.unshift({ number: p.n, title: p.title, author: p.author, mergedAt: new Date().toISOString(), url: null }) }
      }
      data.street = { ...(data.street || {}), status: 'ok', post: posts.map(p => ({ ...p, mine: p.author === 'you' })), merged: [...merged, ...(data.street?.merged || [])] }
    })
  }
}
