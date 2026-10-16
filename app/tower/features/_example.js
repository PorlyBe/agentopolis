// example: a sticky note on every session floor's back wall with the number of tool calls its transcript shows.
// This file is a teaching copy. It is NOT registered in tower.js, so it never runs; `npm run new-feature <name>` copies
// it to app/tower/features/<name>.js, swaps the two names below and registers the copy. Delete what you don't need.
//
// The plugin API (every hook, the geometry, the z bands) is documented at the top of ../tower.js. Read it first; this
// file only shows each piece once, in context.
import { IX } from '../building.js'
import { R } from '../draw.js'

const NAME = 'example'   // session.ext[NAME] comes from server/features/<NAME>.mjs (the file name is the key)
const DEMO = 'example'   // ?demo=<DEMO> plays this feature with invented data
const NOTE = { dx: 214, w: 14, h: 12 }   // where on the floor: x is IX + dx, pick a free spot (see CONTRIBUTING.md)

export default function init(api, tower) {
  const { Z, font } = tower
  const params = api.params
  const demo = api.demo(DEMO)
  const notes = new Map()   // session id -> { calls, title, bump }
  let flown = false

  // snapshot: runs before the tower reads each /api/state poll. A demo edits the data in place here, so the rest of
  // the feature cannot tell invented data from real data. Invent everything: no real names, repos or paths.
  tower.on('snapshot', snap => {
    if (!demo) return
    for (const [i, s] of snap.sessions.entries()) {
      s.ext ??= {}
      s.ext[NAME] = { calls: 40 + i * 17 + Math.floor(Date.now() / 4000) % 9 }
    }
  })

  // sync: after the tower took the snapshot. Keep what you draw from in your own state, keyed by session id, and drop
  // sessions that left. Never cache geometry here: floors move whenever sessions come and go.
  tower.on('sync', snap => {
    const live = new Set()
    for (const s of snap.sessions) {
      const ext = s.ext?.[NAME]; if (!ext) continue
      live.add(s.id)
      const prev = notes.get(s.id)
      notes.set(s.id, { calls: ext.calls, title: s.title, session: s, bump: prev && prev.calls !== ext.calls ? performance.now() : prev?.bump || 0 })
    }
    for (const id of notes.keys()) if (!live.has(id)) notes.delete(id)
    // a demo flies the camera to its feature once there is something to see (?towerzoom= means someone chose a view)
    if (demo && !flown && notes.size && !params.get('towerzoom')) {
      flown = true
      setTimeout(() => { const r = rectOf(notes.keys().next().value); if (r) tower.flyTo({ x: r.x, y: r.y + 20 }, 6) }, 600)
    }
  })

  // geometry, read fresh every time it is needed
  const rectOf = id => { const f = tower.floorOf(id); return f && { x: IX + NOTE.dx, y: f.top + 10, w: NOTE.w, h: NOTE.h } }
  const inR = (w, r) => r && w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.h

  // items: push { z, draw } in world pixels. Z.WALL sits on the back wall behind people; see the z bands in tower.js.
  tower.on('items', (out, now) => {
    for (const [id, n] of notes) {
      const r = rectOf(id); if (!r) continue
      const lift = now - n.bump < 400 ? 1 : 0   // a small hop when the number changes
      out.push({ z: Z.WALL, draw: c => {
        R(c, 'rgba(0,0,0,.18)', r.x + 1, r.y + 1 - lift, r.w, r.h)
        R(c, '#f7e27a', r.x, r.y - lift, r.w, r.h); R(c, '#e8cf5a', r.x, r.y - lift, r.w, 2)
        for (let k = 0; k < Math.min(4, Math.ceil(n.calls / 50)); k++) R(c, '#8a7a3a', r.x + 2, r.y + 4 + k * 2 - lift, r.w - 4, 1)
      } })
    }
  })

  // glow: the night pass. The canvas is in 'lighter' mode; n is how dark it is (0 day .. 1 night), scale by it.
  tower.on('glow', (c, now, n) => {
    if (n < 0.05) return
    for (const id of notes.keys()) { const r = rectOf(id); if (r) R(c, `rgba(255,230,140,${0.25 * n})`, r.x - 2, r.y - 2, r.w + 4, r.h + 4) }
  })

  // overlay: screen space, after the built-in labels. Text goes here so it stays sharp at every zoom.
  tower.on('overlay', c => {
    if (tower.zoom < 3) return
    c.textAlign = 'center'; c.textBaseline = 'middle'; c.font = font(Math.round(tower.zoom * 3.2), 700); c.fillStyle = '#4a3a10'
    for (const [id, n] of notes) { const r = rectOf(id); if (!r) continue; const s = tower.worldToScreen(r.x + r.w / 2, r.y + r.h / 2 + 1); c.fillText(String(n.calls), s.x, s.y) }
    c.textAlign = 'left'
  })

  // hover: return an HTML string for the tooltip (escape anything from data with api.esc), true for a pointer only,
  // or nothing to let the next feature have it
  tower.on('hover', w => {
    for (const [id, n] of notes) if (inR(w, rectOf(id))) return `<div class="t">${api.esc(n.title)}</div><div class="m">${n.calls} tool calls in the transcript</div>`
  })

  // click: return true to consume it. focusSession opens the session's terminal (when it runs in Orca).
  tower.on('click', w => {
    for (const [id, n] of notes) if (inR(w, rectOf(id))) { tower.focusSession(n.session); return true }
    return false
  })
}
