// work-signals: what a session floor says about its work. A task board on the back wall (done/total, the current task),
// bug critters crawling the floor and wall per recent tool error with a red ceiling beacon on bursts, a session that
// needs the user standing and waving while its plaque pulses red, a monitor scrolling a log while the session waits on its
// own background job, and finished subagents handing a folder over at the session's desk before they walk out.
// Demos: ?demo=tasks, ?demo=bugs, ?demo=attention (notify.js fakes it), ?demo=building, ?demo=handoff.
const INK = { completed: '#2f7a41', in_progress: '#b0660f', pending: '#8a7a66' }
const MARK = { completed: '✓', in_progress: '▸', pending: '○' }
const BUG_LIFE = 10 * 60_000, BUG_FADE = 6 * 60_000, BUG_MAX = 8, BURST_N = 3, BURST_WIN = 60_000, ALARM_MS = 40_000
const SHELLS = ['#7b3fa8', '#2f7d45', '#a8452f', '#2f5fa8', '#8a7a2a']
const GIVE_S = 1.5, PAPER_MS = 90_000, RED = '#ef5a5a'
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }

const DEMO_TASKS = ['Read the tower API', 'Port the task board', 'Draw the bug critters', 'Wire the hand-off', 'Screenshot at fit zoom', 'Check page errors', 'Report back']
function demoBoard(i) {
  const n = 2 + (i % 3), items = DEMO_TASKS.map((s, j) => ({ s, st: i % 4 === 3 || j < n ? 'completed' : j === n ? 'in_progress' : 'pending' }))
  const cur = items.find(t => t.st === 'in_progress')
  return { total: items.length, done: items.filter(t => t.st === 'completed').length, current: cur && (i % 2 ? cur.s : 'Porting ' + cur.s.toLowerCase()), items }
}

export default function init(api, tower) {
  const Z = tower.Z, crowd = tower.crowd
  const demos = new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo')
  const sessions = () => tower.snapshot?.sessions || []
  const sessionFloors = () => tower.floors.filter(f => f.kind === 'session' && f.session)
  const pulse = (now, ms = 420) => 0.5 + 0.5 * Math.sin(now / ms)
  const inR = (w, r, pad = 0) => r && w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
  const ago = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h' }

  // ---------- task board ----------
  const boardOf = f => demos.includes('tasks') ? demoBoard(sessionFloors().indexOf(f)) : f.session.ext?.['task-board']
  function drawBoard(c, f, b, now) {
    const r = tower.desk(f.id)?.wall; if (!r) return
    const { x, y, w, h } = r
    R(c, 'rgba(0,0,0,.14)', x + 2, y + 2, w, h)
    R(c, '#7d8590', x, y, w, h); R(c, '#9aa3ad', x, y, w, 1); R(c, '#f4f6f8', x + 2, y + 2, w - 4, h - 4)
    R(c, '#9aa3ad', x + 4, y + h, w - 8, 2); R(c, '#d0453f', x + 8, y + h - 1, 4, 1); R(c, '#3c6fd0', x + 14, y + h - 1, 4, 1)
    // one pip per task along the bottom, so progress reads at any zoom
    const n = Math.min(b.total, 16), gap = 1, pw = Math.max(1, Math.floor((w - 6 - gap * (n - 1)) / n)), py = y + h - 5
    const sts = b.items.map(t => t.st)
    for (let j = 0; j < n; j++) {
      const st = sts[j] || (j < b.done ? 'completed' : 'pending')
      R(c, st === 'completed' ? '#5fbf74' : st === 'in_progress' ? (Math.floor(now / 700) % 2 ? '#f4b54f' : '#e09a2a') : '#d3d6de', x + 3 + j * (pw + gap), py, pw, 2)
    }
  }
  function boardText(v, f, b, now) {
    const r = tower.desk(f.id)?.wall; if (!r) return false
    const k = tower.zoom, p = tower.worldToScreen(r.x + 3, r.y + 2.5), w = (r.w - 6) * k, h = (r.h - 8) * k
    if (h < 9 || p.x > v.canvas.clientWidth || p.x + w < 0 || p.y > v.canvas.clientHeight || p.y + h < 0) return false
    const all = b.done === b.total, two = h >= 17, fs = two ? Math.min(13, h * 0.44) : Math.min(12, h * 0.85)
    v.save(); v.beginPath(); v.rect(p.x, p.y, w, h); v.clip(); v.textBaseline = 'middle'
    const count = all ? `${b.done}/${b.total} ✓` : `${b.done}/${b.total}`
    v.font = tower.font(fs, 700); const cw = v.measureText(count).width
    const cur = all ? 'TASKS · all done' : b.current ? '▸ ' + b.current : 'TASKS'
    const ym = two ? p.y + fs / 2 + 0.5 : p.y + h / 2 + 0.5
    v.fillStyle = all ? INK.completed : '#2a2d38'; v.fillText(count, p.x + w - cw, ym)
    v.font = tower.font(fs, 600); v.fillStyle = all ? INK.completed : b.current ? INK.in_progress : '#2a2d38'
    v.fillText(tower.fitText(cur, w - cw - fs * 0.6, tower.font(fs, 600)), p.x, ym)
    const next = b.items.find(t => t.st === 'pending')
    if (two && next && !all) { v.font = tower.font(fs); v.fillStyle = INK.pending; v.fillText(tower.fitText('○ ' + next.s, w, tower.font(fs)), p.x, p.y + h - fs / 2) }
    v.restore()
    return true
  }
  // ---------- bugs + the alarm beacon ----------
  const crit = new Map(), alarms = new Map(), fake = new Map(), squashed = new Set()
  let demoBugsAt = 0
  const errsOf = s => fake.get(s.id) || s.ext?.bugs?.errs || []
  const burstEnd = errs => { let end = 0; for (let i = BURST_N - 1; i < errs.length; i++) if (errs[i] - errs[i - BURST_N + 1] <= BURST_WIN) end = errs[i]; return end }
  // x is absolute, ry is relative to the floor surface (floors move when sessions come and go); -2 is on the floor
  const target = f => ({ x: f.x0 + 6 + Math.random() * (f.x1 - f.x0 - 40), ry: Math.random() < 0.55 ? -2 : -(22 + Math.random() * (f.y - f.top - 32)) })
  function syncBugs() {
    const now = Date.now(), ss = sessions()
    if (demos.includes('bugs') && !demoBugsAt && ss.length) {
      demoBugsAt = now
      fake.set(ss[0].id, [-540, -420, -300, -200, -95, -14, -9, -4].map(s => now + s * 1000))
      if (ss[1]) fake.set(ss[1].id, [-280, -60].map(s => now + s * 1000))
    }
    for (const s of ss) {
      const f = tower.floor(s.id); if (!f) continue
      const recent = errsOf(s).filter(t => now - t < BUG_LIFE).slice(-BUG_MAX).filter(t => !squashed.has(s.id + '|' + t))
      const kept = (crit.get(s.id) || []).filter(b => recent.includes(b.at))
      for (const at of recent) if (!kept.some(b => b.at === at)) {
        const h = api.hash(s.id + at), wall = h % 2
        // in from a crack: the left wall low down, or a gap in the floor near the plant
        kept.push({ at, x: wall ? f.x0 + 1 : f.x0 + 90, ry: wall ? -6 : -2, ...{ tx: 0, tr: 0 }, rest: 0.2, kind: h % 3 ? 'beetle' : 'ant', shell: SHELLS[(h >>> 4) % SHELLS.length], dir: 'right', born: performance.now() })
        const t = target(f); kept[kept.length - 1].tx = t.x; kept[kept.length - 1].tr = t.ry
      }
      if (kept.length) crit.set(s.id, kept); else crit.delete(s.id)
      const end = burstEnd(errsOf(s))
      if (end && now - end < ALARM_MS) alarms.set(s.id, end); else alarms.delete(s.id)
    }
    const live = new Set(ss.map(s => s.id))
    for (const id of crit.keys()) if (!live.has(id)) crit.delete(id)
    for (const id of alarms.keys()) if (!live.has(id)) alarms.delete(id)
  }
  function stepBugs(dt) {
    for (const [id, list] of crit) {
      const f = tower.floor(id); if (!f) continue
      for (const b of list) {
        if (b.rest > 0) { b.rest -= dt; continue }
        const dx = b.tx - b.x, dy = b.tr - b.ry, d = Math.hypot(dx, dy), mv = (b.kind === 'ant' ? 14 : 9) * dt
        b.dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')
        if (d <= mv) {
          b.x = b.tx; b.ry = b.tr; b.rest = Math.random() < 0.6 ? 0.3 + Math.random() * 2.5 : 0
          const t = target(f)
          if (Math.random() < 0.3) { b.tx = t.x; b.tr = t.ry }
          else { b.tx = Math.max(f.x0 + 4, Math.min(f.x1 - 34, b.x + (Math.random() - 0.5) * 50)); b.tr = b.ry === -2 && Math.random() < 0.7 ? -2 : Math.max(-(f.y - f.top - 8), Math.min(-2, b.ry + (Math.random() - 0.5) * 24)) }
        } else { b.x += dx / d * mv; b.ry += dy / d * mv }
      }
    }
  }
  function drawBug(c, b, y, now, a) {
    c.globalAlpha = a
    const cx = Math.round(b.x), cy = Math.round(y), moving = b.rest <= 0
    const put = (u, v, w = 1, h = 1) => {
      if (b.dir === 'right') c.fillRect(cx + u, cy + v, w, h)
      else if (b.dir === 'left') c.fillRect(cx - u - w + 1, cy + v, w, h)
      else if (b.dir === 'down') c.fillRect(cx + v, cy + u, h, w)
      else c.fillRect(cx + v, cy - u - w + 1, h, w)
    }
    const step = moving ? Math.floor(now / 90) % 2 : 0
    c.fillStyle = '#16110e'
    if (b.kind === 'ant') {
      put(-3, 0, 2, 1); put(-1, 0); put(0, 0, 2, 1); put(2, 0)
      for (const u of [-1, 0, 1]) { put(u + ((u + step) % 2 ? 0 : -1), -1); put(u + ((u + step) % 2 ? -1 : 0), 1) }
      put(3, -1); put(3, 1)
    } else {
      for (const u of [-1, 1]) { put(u + (step ? 1 : 0), -2); put(u - (step ? 1 : 0), 2) }
      put(-2, -1, 4, 3); put(2, 0)
      c.fillStyle = b.shell; put(-2, -1, 3, 1); put(-2, 1, 3, 1)
      c.fillStyle = 'rgba(255,255,255,.55)'; put(0, -1)
    }
    c.globalAlpha = 1
  }
  const beaconAt = f => ({ x: f.x0 + 192, y: f.top + 2 })   // just right of the floor's plaque, before the workflow banner
  function drawBeacon(c, f, now) {
    const { x, y } = beaconAt(f), lit = Math.floor(now / 160) % 2
    R(c, '#4a4452', x, f.top, 1, 2); R(c, '#2b2d36', x - 3, y, 7, 2)
    R(c, '#7a1414', x - 2, y + 2, 5, 4); R(c, '#7a1414', x - 1, y + 6, 3, 1)
    R(c, lit ? '#ff4a3a' : '#c42a22', x - 1, y + 2, 3, 3)
    R(c, '#ffd2c8', x + Math.round(2.2 * Math.sin(now / 130)), y + 2, 1, 3)
  }
  function beams(c, f, now) {
    const { x, y } = beaconAt(f), cx = x + 0.5, cy = y + 4, ang = now / 300
    c.save(); c.beginPath(); c.rect(f.x0, f.top, f.x1 - f.x0, f.y - f.top); c.clip()
    c.globalCompositeOperation = 'lighter'
    c.translate(cx, cy); c.scale(1, 0.55)
    for (const o of [0, Math.PI]) {
      const a = ang + o, r = 120, g = c.createRadialGradient(0, 0, 0, 0, 0, r)
      g.addColorStop(0, 'rgba(255,60,40,.32)'); g.addColorStop(1, 'rgba(255,40,30,0)')
      c.fillStyle = g; c.beginPath(); c.moveTo(0, 0); c.arc(0, 0, r, a - 0.3, a + 0.3); c.closePath(); c.fill()
    }
    c.restore()
  }

  // ---------- needs you: the session stands and waves, its plaque pulses ----------
  const sprites = new Map()
  function handUp(look, wave) {
    const key = `${look.palette}:${look.hue}:${wave}`
    if (sprites.has(key)) return sprites.get(key)
    const src = api.charSheet(look.palette, look.hue); if (!src?.width) return null
    const cv = document.createElement('canvas'); cv.width = 20; cv.height = 32
    const c = cv.getContext('2d'); c.drawImage(src, 16, 0, 16, 32, 0, 0, 16, 32)
    const px = c.getImageData(0, 0, 20, 32), d = px.data
    const at = (x, y) => d.slice((y * 20 + x) * 4, (y * 20 + x) * 4 + 4), put = (x, y, rgba) => d.set(rgba, (y * 20 + x) * 4)
    const sleeve = at(3, 20), line = at(2, 20), skin = at(2, 22), dark = at(1, 22)
    for (let y = 19; y <= 24; y++) { for (let x = 12; x < 16; x++) put(x, y, [0, 0, 0, 0]); put(12, y, line) }
    const fill = new Map(), add = (pts, col) => { for (const [x, y] of pts) fill.set(x + ',' + y, col) }, w = wave ? 1 : 0
    add([[13, 18], [14, 18], [13, 17], [14, 17], [14, 16], [15, 16], [14, 15], [15, 15], [15, 14], [16, 14], [15, 13], [16, 13]], sleeve)
    add([[15 + w, 12], [16 + w, 12], [15 + w, 11], [16 + w, 11], [17 + w, 11], [15 + w, 10], [16 + w, 10], [17 + w, 10], [15 + w, 9], [17 + w, 9], [14 + w, 11]], skin)
    for (const [k, col] of fill) { const [x, y] = k.split(',').map(Number); put(x, y, col) }
    for (const k of fill.keys()) {
      const [x, y] = k.split(',').map(Number)
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (nx < 0 || ny < 0 || nx >= 20 || fill.has(nx + ',' + ny) || at(nx, ny)[3]) continue
        put(nx, ny, fill.get(k) === skin ? dark : line)
      }
    }
    c.putImageData(px, 0, 0)
    sprites.set(key, cv); return cv
  }
  // the tower has no per-person sprite override, so a flagged session's actor gets a draw() that stands it up at its desk
  function waver(a) {
    return (c, p, now) => {
      if (a.pose === 'desk' && !a.walking) { const sh = handUp(a.look, Math.floor(now / 280) % 2); if (sh) { c.drawImage(sh, Math.round(a.x - 8), Math.round(p.y - 30)); return } }
      const d = a.draw; a.draw = null; try { crowd.drawActor(c, a, now) } finally { a.draw = d }
    }
  }
  function stepWavers() {
    for (const a of crowd.actors.values()) {
      if (a.kind !== 'session') continue
      const on = a.data?.state === 'attention' && !a.leaving && a.fade == null
      if (on && !a.wsWave) { a.wsWave = true; a.draw = waver(a) }
      else if (!on && a.wsWave) { a.wsWave = false; a.draw = null }
    }
  }

  // ---------- building: a log scrolls on the session's monitor while its own job runs ----------
  const buildingOf = f => f.session.state === 'building' || (f.session.background?.length && f.session.state !== 'attention')
  function drawLog(c, f, now) {
    const m = tower.desk(f.id)?.monitor; if (!m) return
    const x = m.x + 1, y = m.y + 1, scroll = Math.floor(now / 260)
    R(c, '#12201a', x, y, 8, 8)
    for (let i = 0; i < 4; i++) {
      const h = api.hash(f.id + ':' + (scroll + i)), w = 2 + h % 6
      R(c, h % 9 === 0 ? '#f4b54f' : '#7be08a', x + 1, y + 1 + i * 2, w, 1)
    }
    const sweep = (now / 1600) % 1; R(c, '#2a3a30', x, y + 7, 8, 1); R(c, '#f29a4e', x + Math.floor(sweep * 6), y + 7, 2, 1)
    // the progress lamp on the monitor's top edge
    const on = Math.floor(now / 500) % 2
    R(c, '#2a2a33', m.x + 3, m.y - 1, 4, 1); R(c, on ? '#ffb347' : '#a8601e', m.x + 4, m.y - 3, 2, 2)
  }

  // ---------- hand-offs ----------
  const jobs = new Map(), queues = new Map(), papers = new Map(), flashes = []
  const giveX = (sid, i) => { const d = tower.desk(sid); return d ? d.desk.x + d.desk.w + 7 + i * 13 : null }
  const dropAt = (sid, n = 0) => { const d = tower.desk(sid); return d && { x: d.desk.x + 2 + (n % 3) * 2 - 2, y: d.desk.y - 4 - (n % 3) } }
  const dequeue = (sid, id) => { const q = queues.get(sid); if (!q) return; const i = q.indexOf(id); if (i >= 0) q.splice(i, 1); if (!q.length) queues.delete(sid) }
  tower.on('leaving', (p, done) => {
    if (p.kind !== 'agent' || !tower.floor(p.session) || !tower.desk(p.session)) return false
    jobs.set(p.id, { sid: p.session, done, phase: 'pending', idx: -1, hue: api.hash(p.id) % 360 })
    return true
  })
  function stepHandoffs(dt, now) {
    for (const [id, j] of jobs) {
      const p = tower.person(id)
      if (!p || !tower.floor(j.sid)) { jobs.delete(id); dequeue(j.sid, id); j.done(); continue }
      if (j.phase === 'pending') { const q = queues.get(j.sid) || []; q.push(id); queues.set(j.sid, q); j.phase = 'go' }
      if (j.phase === 'go') {
        const idx = queues.get(j.sid).indexOf(id)
        if (idx !== j.idx) {
          j.idx = idx; j.arrived = false
          if (!tower.sendTo(id, j.sid, giveX(j.sid, idx), { face: 'left', pose: 'stand', then: () => { j.arrived = true } })) { jobs.delete(id); dequeue(j.sid, id); j.done(); continue }
        }
        if (j.arrived && idx === 0) { j.phase = 'give'; j.t = 0 }
      } else if (j.phase === 'give') {
        j.t += dt
        if (j.t >= GIVE_S) {
          const list = papers.get(j.sid) || [], d = dropAt(j.sid, list.length)
          list.push({ at: performance.now(), n: list.length, hue: j.hue }); papers.set(j.sid, list.slice(-4))
          if (d) flashes.push({ sid: j.sid, at: now })
          jobs.delete(id); dequeue(j.sid, id); j.done()
        }
      }
    }
    const t = performance.now()
    for (const [sid, list] of papers) { const keep = list.filter(p => t - p.at < PAPER_MS && tower.floor(sid)); if (keep.length) papers.set(sid, keep); else papers.delete(sid) }
    for (let i = flashes.length - 1; i >= 0; i--) if (now - flashes[i].at > 450) flashes.splice(i, 1)
  }
  function folder(c, px, py, hue, open) {
    px = Math.round(px); py = Math.round(py)
    R(c, '#b8862e', px, py, 6, 4); R(c, '#b8862e', px, py - 1, 3, 1); R(c, '#f2c862', px, py + 1, 6, 3)
    R(c, '#fbf6e8', px + 1, py, 4, 1); R(c, `hsl(${hue} 60% 50%)`, px + 4, py + 2, 1, 1)
    if (open) R(c, '#fbf6e8', px + 1, py - 1, 4, 1)
  }
  // ?demo=handoff: every half minute three made-up subagents appear on the busiest floor, finish and hand over
  let demoN = 0
  function seatDemo() {
    const f = [...sessionFloors()].sort((a, b) => b.session.agents.length - a.session.agents.length)[0]; if (!f) return
    for (let i = 0; i < 3; i++) {
      const id = `demo-handoff-${demoN++}`
      crowd.actors.set('a:' + id, { key: 'a:' + id, kind: 'agent', id, session: f.id, look: api.lookOf(id), route: [], dir: 'right', floor: f.id, x: f.x0 + 330 + i * 26, pose: 'spot', face: 'down',
        data: { id, type: 'demo', description: 'demo: report hand-off', state: 'tool', tool: 'Write', lastActivity: Date.now(), agents: [] } })
    }
  }
  if (demos.includes('handoff')) { setTimeout(seatDemo, 2500); setInterval(() => tower.active && seatDemo(), 30_000) }

  // ---------- demo: building ----------
  let buildSince = Date.now() - 95_000
  api.on('sync', () => {
    if (!demos.includes('building')) return
    const s = sessions().filter(s => s.state !== 'attention').at(-1); if (!s) return
    s.state = 'building'; s.background = [{ label: 'cargo test --workspace', kind: 'shell', since: buildSince }]
  })

  // ---------- bug-squash: each critter by id, and a way to squash one (it stays gone; a new error brings a new one) ----------
  const alphaOf = (bg, now) => Math.min(1, (now - bg.born) / 400) * (Date.now() - bg.at < BUG_FADE ? 1 : Math.max(0, 1 - (Date.now() - bg.at - BUG_FADE) / (BUG_LIFE - BUG_FADE)))
  tower.critters = {
    list: () => [...crit].flatMap(([sid, l]) => { const f = tower.floor(sid); return f ? l.map(b => ({ id: sid + '|' + b.at, sid, x: b.x, y: f.y + b.ry, ry: b.ry, kind: b.kind, shell: b.shell, dir: b.dir, a: alphaOf(b, performance.now()) })) : [] }),
    squash(id) {
      squashed.add(id)
      const i = id.lastIndexOf('|'), sid = id.slice(0, i), at = Number(id.slice(i + 1)), l = crit.get(sid), k = l ? l.findIndex(b => b.at === at) : -1
      if (k >= 0) { l.splice(k, 1); if (!l.length) crit.delete(sid) }
      return k >= 0
    },
    click: null,
  }
  tower.on('click', (w, person, m) => tower.critters.click?.(w, person, m) || false)

  // ---------- hooks ----------
  tower.on('sync', syncBugs)
  tower.on('step', (dt, now) => { stepBugs(dt); stepWavers(); stepHandoffs(dt, now) })
  tower.on('items', (out, now) => {
    for (const f of sessionFloors()) {
      const b = boardOf(f)
      if (b?.total) out.push({ z: Z.WALL, draw: c => drawBoard(c, f, b, now) })
      if (buildingOf(f)) out.push({ z: Z.WALL + 1, draw: c => drawLog(c, f, now) })
      if (alarms.has(f.id)) out.push({ z: Z.WALL + 2, draw: c => drawBeacon(c, f, now) })
      if (f.session.state === 'attention') {
        const a = pulse(now)
        out.push({ z: Z.WALL + 3, draw: c => { R(c, `rgba(239,90,90,${0.45 + 0.45 * a})`, f.x0, f.y - 20, f.x1 - f.x0, 1) } })
      }
      const list = crit.get(f.id)
      if (list) for (const bg of list) {
        const a = Math.min(1, (now - bg.born) / 400) * (Date.now() - bg.at < BUG_FADE ? 1 : Math.max(0, 1 - (Date.now() - bg.at - BUG_FADE) / (BUG_LIFE - BUG_FADE)))
        if (a > 0.02) out.push({ z: Z.FLOOR, draw: c => drawBug(c, bg, f.y + bg.ry, now, a) })
      }
    }
    for (const [sid, list] of papers) for (const p of list) {
      const d = dropAt(sid, p.n); if (!d) continue
      const fade = Math.min(1, (PAPER_MS - (performance.now() - p.at)) / 8000)
      out.push({ z: Z.FLOOR + 1, draw: c => { c.globalAlpha = Math.max(0, fade); folder(c, d.x, d.y, p.hue) } })
    }
    for (const [id, j] of jobs) {
      const p = tower.person(id); if (!p || j.phase === 'pending') continue
      if (j.phase === 'give') {
        const t = j.t / GIVE_S, d = dropAt(j.sid, (papers.get(j.sid) || []).length), from = { x: p.x - 13, y: p.y - 17 }
        const m = Math.max(0, (t - 0.55) / 0.45), e = m * m * (3 - 2 * m)
        const fx = from.x + (d.x - from.x) * e, fy = from.y + (d.y - from.y) * e - Math.sin(m * Math.PI) * 5
        out.push({ z: m > 0.6 ? Z.FLOOR + 2 : Z.STAND + 1, draw: c => folder(c, fx, fy, j.hue, true) })
        continue
      }
      const dir = p.walking ? p.dir : p.face, ox = p.riding ? -3 : dir === 'left' ? -9 : dir === 'right' ? 3 : -3
      out.push({ z: (p.riding ? Z.RIDE : p.walking ? Z.WALK : Z.STAND) + 1, draw: c => folder(c, p.x + ox, p.y - 14, j.hue) })
    }
  })
  tower.on('glow', (c, now, n) => {
    if (n < 0.02) return
    const pool = (x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a * n})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
    for (const f of sessionFloors()) {
      if (alarms.has(f.id)) { const b = beaconAt(f); pool(b.x, b.y + 4, 22, '255,60,40', 0.6) }
      if (buildingOf(f)) { const m = tower.desk(f.id)?.monitor; if (m) pool(m.x + 5, m.y + 5, 14, '255,170,80', 0.4) }
    }
  })
  tower.on('post', (c, now) => {
    for (const f of sessionFloors()) {
      if (alarms.has(f.id)) beams(c, f, now)
      if (f.session.state !== 'attention') continue
      const s = tower.plaque(f), a = pulse(now)
      c.strokeStyle = `rgba(239,90,90,${0.55 + 0.45 * a})`; c.lineWidth = 1; c.strokeRect(s.x + 0.5, s.y + 0.5, s.w - 1, s.h - 1)
      c.strokeStyle = `rgba(255,120,110,${0.3 * a})`; c.strokeRect(s.x - 0.5, s.y - 0.5, s.w + 1, s.h + 1)
    }
  })
  tower.on('overlay', (v, now) => {
    for (const f of sessionFloors()) {
      const b = boardOf(f)
      if (b?.total) boardText(v, f, b, now)
      if (f.session.state === 'attention') {
        // hung under the plaque's right end: the workflow banner takes the ceiling right of it
        const s = tower.plaque(f), p = tower.worldToScreen(s.x + s.w, s.y + s.h), k = tower.zoom
        const text = f.session.attention?.kind === 'question' ? '✋ QUESTION' : '✋ NEEDS YOU', fs = Math.max(9, Math.min(13, 4.2 * k))
        v.font = tower.font(fs, 700)
        const bw = v.measureText(text).width + 10, bh = fs + 6, bx = p.x - bw - 4 * k, by = p.y + 2 * k, a = pulse(now)
        v.fillStyle = `rgba(239,90,90,${0.25 * a})`; v.beginPath(); v.roundRect(bx - 3, by - 3, bw + 6, bh + 6, 7); v.fill()
        v.fillStyle = 'rgba(0,0,0,.3)'; v.beginPath(); v.roundRect(bx + 1, by + 2, bw, bh, 5); v.fill()
        v.fillStyle = RED; v.beginPath(); v.roundRect(bx, by, bw, bh, 5); v.fill()
        v.fillStyle = '#fff'; v.textBaseline = 'middle'; v.fillText(text, bx + 5, by + bh / 2 + 0.5)
      }
    }
    for (const fl of flashes) {
      const d = dropAt(fl.sid, Math.max(0, (papers.get(fl.sid) || []).length - 1)); if (!d) continue
      const t = (now - fl.at) / 450, k = tower.zoom, r = (2 + 7 * t) * k, p = tower.worldToScreen(d.x + 3, d.y + 1), w = Math.max(1, k * 0.8)
      v.globalAlpha = 1 - t; v.fillStyle = '#fff6c2'
      v.fillRect(p.x - r, p.y - w / 2, 2 * r, w); v.fillRect(p.x - w / 2, p.y - r, w, 2 * r)
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) v.fillRect(p.x + sx * r * 0.5, p.y + sy * r * 0.5, w, w)
      v.globalAlpha = 1
    }
  })
  tower.on('hover', (w, person) => {
    if (person) return null
    const esc = api.esc
    for (const f of sessionFloors()) {
      if (w.y < f.top || w.y > f.y) continue
      const d = tower.desk(f.id), b = boardOf(f)
      if (b?.total && inR(w, d?.wall, 1)) {
        const rows = [...b.items.filter(t => t.st === 'in_progress'), ...b.items.filter(t => t.st === 'pending'), ...b.items.filter(t => t.st === 'completed')].slice(0, 10)
        return `<div class="t">Tasks · ${b.done}/${b.total} done</div>${b.current ? `<div style="color:#f4b54f">▸ ${esc(b.current)}</div>` : ''}${rows.map(t => `<div class="m">${MARK[t.st] || '○'} ${esc(t.s)}</div>`).join('')}`
      }
      if (buildingOf(f) && inR(w, d?.monitor, 2)) {
        const js = f.session.background || []
        return `<div class="t">${esc(f.session.title)} · building</div>${js.map(j => `<div><i class="s" style="background:${api.COLORS.building}"></i>${esc(j.label)}</div><div class="m">${esc(j.kind)} · running ${ago(j.since)}</div>`).join('')}`
      }
      const errs = errsOf(f.session).filter(t => Date.now() - t < BUG_LIFE)
      const bugHit = (crit.get(f.id) || []).some(b => Math.abs(b.x - w.x) < 5 && Math.abs(f.y + b.ry - w.y) < 5)
      if (errs.length && (bugHit || (alarms.has(f.id) && Math.abs(w.x - beaconAt(f).x) < 6 && w.y < f.top + 12))) {
        return `<div class="t">🐞 ${errs.length} tool error${errs.length > 1 ? 's' : ''} in 10 min</div><div class="m">${esc(f.session.title)} · last ${ago(errs.at(-1))} ago${alarms.has(f.id) ? ' · a burst: 3+ within a minute' : ''}</div>${bugHit && tower.critters.click ? '<div class="m">🔨 click to squash it</div>' : ''}`
      }
    }
    return null
  })
}
