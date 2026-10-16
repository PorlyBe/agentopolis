// library: when a session (or agent) loads a skill, its character walks to the floor's bookshelf, pulls a book with the
// skill's name on the spine, reads a moment and carries it to the desk, where it stays until the turn ends.
// Web research (WebSearch / WebFetch) sends them to the glass by the elevator with binoculars. Data: ext.library
// (server/features/library.mjs). Hover a desk's books for their names. ?demo=library fakes both on the first floors.
import { IX, IX1 } from '../building.js'
import { R } from '../draw.js'

const SHELF = IX + 352, SHELF_AT = SHELF + 19, SLOT = { x: SHELF + 7, dy: 24, h: 8 }, WIN_X = IX1 - 14
const FRESH = 120_000, PULL = 900, READ = 2400, LOOK_MIN = 6000, GIVE_UP = 45_000
const WEB = /^(WebSearch|WebFetch)$/
const short = n => n.replace(/^anthropic-skills:/, '')

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('library')
  const who = new Map()     // person id -> { floor, sid, agent, seen, desk: [names], queue: [names], phase, t, book, web, webSeen, open }
  let first = true, deskBoxes = []
  const hue = n => api.hash(n) % 360
  const bookCol = (n, l = 42) => `hsl(${hue(n)} 55% ${l}%)`

  function track(id, sid, agent, data, lib, open) {
    let w = who.get(id)
    if (!w) who.set(id, w = { sid, agent, seen: new Set(), desk: [], queue: [], phase: null, t: 0, book: null, web: null, webSeen: new Set() })
    w.floor = sid; w.open = open; w.alive = true
    const names = new Set((lib?.skills || []).map(s => s.name))
    w.desk = w.desk.filter(n => names.has(n)); w.queue = w.queue.filter(n => names.has(n))
    for (const s of lib?.skills || []) {
      const key = s.name + '|' + s.at
      if (w.seen.has(key)) continue
      w.seen.add(key)
      if (first || Date.now() - s.at > FRESH || !open) { if (!w.desk.includes(s.name)) w.desk.push(s.name) }
      else if (!w.queue.includes(s.name) && w.book !== s.name) w.queue.push(s.name)
    }
    const live = data.state === 'tool' && WEB.test(data.tool || '')
    const web = lib?.web, key = web && web.kind + '|' + web.at
    w.webLive = live || (web && Date.now() - web.at < 8000)
    if (web && w.webLive && !w.webSeen.has(key)) { w.webSeen.add(key); if (!first) w.web = { ...web, q: web.q || data.detail || '' } }
    else if (live && w.web) w.web.q = w.web.q || data.detail || ''
  }

  tower.on('sync', data => {
    for (const w of who.values()) w.alive = false
    for (const s of data.sessions) {
      track(s.id, s.id, null, s, s.ext?.library, s.state !== 'waiting')
      for (const g of s.agents) track(g.id, s.id, g.id, g, g.ext?.library, g.state !== 'done' && g.state !== 'waiting')
    }
    for (const [id, w] of who) if (!w.alive) { if (w.phase) tower.release(id); who.delete(id) }
    first = false
  })

  const hasShelf = f => f && f.kind === 'session' && f.desks <= 5
  const ours = p => p.activity === 'library' || p.activity === 'binoculars'
  function finish(id, w) { if (w.book && !w.desk.includes(w.book)) w.desk.push(w.book); w.book = null; w.phase = null }

  tower.on('step', () => {
    const now = performance.now()
    for (const [id, w] of who) {
      const p = tower.person(id), f = tower.floor(w.floor)
      if (!p || !f) { w.phase = null; continue }
      if (w.phase && w.phase !== 'carry' && w.phase !== 'back' && p.steered && p.activity && !ours(p)) { finish(id, w); w.web = null; continue }   // someone else took them
      if (!w.phase) {
        if (w.web && Date.now() - w.web.at > 60_000) w.web = null
        if (p.leaving || p.steered || !p.atDesk || p.floor !== w.floor) {
          if (!p.steered && w.queue.length && !hasShelf(f)) { w.desk.push(...w.queue); w.queue = [] }
          continue
        }
        if (w.web) {
          if (tower.sendTo(id, w.floor, WIN_X, { face: 'right', pose: 'stand', activity: 'binoculars', then: () => { w.phase = 'look'; w.t = performance.now() } })) { w.phase = 'webwalk'; w.t = now }
          else w.web = null
          continue
        }
        if (w.queue.length) {
          const name = w.queue.shift()
          if (!hasShelf(f) || !w.open) { w.desk.push(name); continue }
          w.book = name
          if (tower.sendTo(id, w.floor, SHELF_AT, { face: 'up', pose: 'stand', activity: 'library', then: () => { w.phase = 'pull'; w.t = performance.now() } })) { w.phase = 'walk'; w.t = now }
          else finish(id, w)
        }
        continue
      }
      const dt = now - w.t
      if ((w.phase === 'walk' || w.phase === 'webwalk') && dt > GIVE_UP) { tower.release(id); w.web = null; w.phase = 'back'; w.t = now }
      else if (w.phase === 'pull' && dt > PULL) { tower.sendTo(id, w.floor, SHELF_AT, { face: 'down', pose: 'stand', anim: 'read', activity: 'library' }); w.phase = 'read'; w.t = now }
      else if (w.phase === 'read' && dt > READ) { tower.release(id); w.phase = 'carry'; w.t = now }
      else if (w.phase === 'look' && dt > LOOK_MIN && !w.webLive) { tower.release(id); w.web = null; w.phase = 'back'; w.t = now }
      else if ((w.phase === 'carry' || w.phase === 'back') && (p.atDesk || dt > GIVE_UP)) finish(id, w)
    }
  })

  // ---------- drawing ----------
  function closedBook(c, x, y, n, w = 4, h = 6) { R(c, bookCol(n, 30), x, y, w, h); R(c, bookCol(n), x, y, w - 1, h); R(c, '#f4efe0', x + 1, y + 2, w - 2, 1) }
  function binoculars(c, p) {
    const x = Math.round(p.x) + 2, y = Math.round(p.y) - 24
    R(c, '#1b1c22', x, y, 5, 2); R(c, '#1b1c22', x, y + 3, 5, 2); R(c, '#3a3c48', x + 1, y + 2, 2, 1)
    R(c, '#6a7488', x + 4, y, 1, 2); R(c, '#6a7488', x + 4, y + 3, 1, 2); R(c, '#1b1c22', x - 1, y + 5, 1, 4)
  }
  tower.on('items', (out, now) => {
    deskBoxes = []
    for (const [id, w] of who) {
      const p = tower.person(id), f = tower.floor(w.floor)
      if (!f || f.kind !== 'session' || f.open != null) continue
      if (w.phase === 'pull' && hasShelf(f) && w.book) {
        const k = Math.min(1, (performance.now() - w.t) / PULL), n = w.book
        out.push({ z: Z.WALL + 2, draw: c => R(c, '#2a1c10', SLOT.x, f.y - SLOT.dy, 3, SLOT.h) })
        out.push({ z: Z.STAND + 6, draw: c => closedBook(c, SLOT.x + k * 6, f.y - SLOT.dy - k * 2, n, 3, SLOT.h) })
      } else if (w.phase === 'read' && p) {
        const n = w.book
        out.push({ z: Z.STAND + 6, draw: c => {
          const x = Math.round(p.x) - 5, y = Math.round(p.y) - 16
          R(c, bookCol(n, 30), x, y, 11, 6); R(c, '#f8f4e8', x + 1, y, 4, 5); R(c, '#ece4d0', x + 6, y, 4, 5); R(c, bookCol(n, 30), x + 5, y, 1, 6)
          c.fillStyle = 'rgba(80,70,60,.5)'; for (let i = 0; i < 2; i++) { c.fillRect(x + 2, y + 1 + i * 2, 2, 1); c.fillRect(x + 7, y + 1 + i * 2, 2, 1) }
        } })
      } else if (w.phase === 'carry' && p && w.book && !p.atDesk && !p.riding) {
        const n = w.book
        out.push({ z: Z.WALK + 6, draw: c => closedBook(c, p.dir === 'left' ? p.x - 7 : p.x + 3, p.y - 17, n) })
      } else if (w.phase === 'look' && p && p.activity === 'binoculars') out.push({ z: Z.STAND + 6, draw: c => binoculars(c, p) })
      if (!w.open || !w.desk.length) continue
      const d = tower.desk(w.sid); if (!d) continue
      const desk = w.agent ? d.agents[p?.slot ?? -1]?.desk : d.desk
      if (!desk || (w.agent && (!p || p.slot == null))) continue
      const list = w.desk.slice(-4), bw = w.agent ? 5 : 8, x = desk.x + 1
      deskBoxes.push({ w, x, y: desk.y - list.length * 2 - 1, wd: bw, h: list.length * 2 + 2 })
      out.push({ z: Z.FLOOR + 8, draw: c => list.forEach((n, i) => {
        const y = desk.y - 2 - i * 2, o = i % 2
        R(c, bookCol(n, 30), x + o, y, bw, 2); R(c, bookCol(n), x + o, y, bw - 1, 1); R(c, '#f4efe0', x + o + bw - 1, y, 1, 2)
      }) })
    }
  })

  function tag(c, sx, sy, text, color, fs) {
    c.font = font(fs); const w = c.measureText(text).width + 12, h = fs + 6, x = Math.round(sx), y = Math.round(sy - h / 2)
    c.fillStyle = 'rgba(0,0,0,.3)'; c.beginPath(); c.roundRect(x + 1, y + 2, w, h, 4); c.fill()
    c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 4); c.fill()
    c.fillStyle = color; c.fillRect(x, y + 3, 3, h - 6)
    c.fillStyle = '#1b1c26'; c.textBaseline = 'middle'; c.fillText(text, x + 7, y + h / 2 + 0.5)
  }
  tower.on('overlay', c => {
    const k = tower.zoom; if (k < 1.6) return
    const fs = Math.max(9, Math.min(13, 3.4 * k)), H = tower.canvas.clientHeight, W = tower.canvas.clientWidth
    c.save()
    for (const [id, w] of who) {
      const p = tower.person(id); if (!p || !w.phase) continue
      let text = null, color = '#c9a25a'
      if ((w.phase === 'pull' || w.phase === 'read' || w.phase === 'carry' && !p.atDesk) && w.book) { text = '📕 ' + short(w.book); color = bookCol(w.book, 50) }
      else if (w.phase === 'look' && w.web) { text = (w.web.kind === 'search' ? '🔭 ' : '🔭 ') + (w.web.q || 'the web'); color = '#5a9ad8' }
      if (!text) continue
      const a = tower.worldToScreen(p.x, p.y - 14)
      if (a.y < 0 || a.y > H) continue
      const t = fitText(text, Math.min(260, 60 * k), font(fs)), right = w.phase === 'look' ? a.x - 12 * k : a.x + 7 * k
      c.font = font(fs)
      const x = w.phase === 'look' ? Math.max(4, right - c.measureText(t).width - 12) : Math.min(W - 80, right)
      tag(c, x, a.y, t, color, fs)
    }
    c.restore()
  })

  tower.on('hover', w => {
    for (const b of deskBoxes) if (w.x >= b.x - 2 && w.x <= b.x + b.wd + 2 && w.y >= b.y - 3 && w.y <= b.y + b.h + 2) {
      const s = tower.snapshot?.sessions.find(s => s.id === b.w.sid)
      return `<div class="t">${esc(s?.title || 'Desk')}${b.w.agent ? ' · agent' : ''} · skills this turn</div>` + b.w.desk.map(n => `<div><i class="s" style="background:${bookCol(n, 50)}"></i>${esc(n)}</div>`).join('')
    }
    return null
  })

  // ---------- ?demo=library ----------
  if (!demo) return
  let t0 = 0
  const SKILLS = ['verify-api', 'code-review', 'release-notes']
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => tower.flyTo(data.sessions[0]?.id || 'lobby', 3), 800) }
    const cyc = Math.floor((now - t0) / 70000), base = t0 + cyc * 70000, t = now - base
    data.sessions.slice(0, 2).forEach((s, i) => {
      const at = ms => base + ms + i * 3000
      const skills = SKILLS.slice(0, i ? 1 : 3).map((n, j) => ({ name: n, at: at(2000 + j * 13000) })).filter(x => x.at <= now)
      const web = i === 0 ? { kind: 'search', q: 'canvas imageSmoothingEnabled pixel art', at: at(44000) } : { kind: 'fetch', q: 'developer.mozilla.org', at: at(20000) }
      const searching = now >= web.at && now - web.at < 24000
      s.ext = { ...s.ext, library: { skills, web: now >= web.at ? web : null } }
      s.state = t > 62000 ? 'waiting' : 'tool'; s.tool = searching ? (web.kind === 'search' ? 'WebSearch' : 'WebFetch') : 'Skill'; s.detail = web.q
      s.agents = s.agents.map(g => ({ ...g }))
    })
  })
}
