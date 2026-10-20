// tower: a side-view skyscraper of the sessions, one floor each, with shared floors on top, a glass elevator,
// a post room and a server room underneath and the GitHub engineers' buildings along the street. It is the whole view.
// ?demo=towerlife sends everyone on breaks; ?towerzoom=<z>|min&towerat=<floor index> starts on a close-up or the whole street.
// the user sits in the CEO office under the roof; when a session needs him ('attention') his desk phone rings and a note
// lists who — clicking either opens the first one in Orca.
//
// ===== Tower feature API (app/tower/features/*.js: export default function init(api, tower), tower === api.tower) =====
// Coordinates: world pixels. x = 0 is the tower's left outer wall (interior tower.interior.x0..x1 = 8..488), the street
// door is in that wall, the street furniture stands left of it (x < 0), the elevator shafts are right of it (BW..BW+SHAFT: the main
// car's, then the express car's, tower.xcar). y = 0 is street
// level and the lobby floor; up is negative. A floor's people stand on f.y; f.top is its ceiling. Rects are { x, y, w, h }
// with y their top. Everything moves when sessions come and go: read geometry every frame (or on 'layout'), never cache.
// Hooks — tower.on(name, fn); a throwing hook is logged and skipped:
//   sync(snapshot)              after the tower took the /api/state snapshot (floors, people already updated)
//   layout(floors)              the floor plan changed (a session came or went, desks grew)
//   step(dt, now)               every frame while the tower is shown, after people moved (dt s, now = performance.now())
//   items(out, now, ctx)        push { z, draw(c, now) } to draw in world pixels (c is pre-transformed, save/restore is done
//                               for you); ctx = { now, view: {x0,y0,x1,y1}, sun: { n night 0..1, hour, gloom, kind, ... } }
//   glow(c, now, n, ctx)        night pass: c is in 'lighter' mode; draw lamp/LED glows (scale by n yourself)
//   post(c, now, ctx)           after the whole world (sky, weather) — untinted, before scaling to the screen
//   overlay(c, now, ctx)        screen space (CSS px), after the built-in labels; use tower.worldToScreen, font, fitText
//   click / dblclick(w, person, m)   w = world point, person = hit person view or null, m = { sx, sy, cx, cy };
//                               runs before the built-in click; return true to consume it
//   hover(w, person, m)         return an HTML string (tooltip) or true (pointer only) to claim the hover
//   leaving(person, done)       a finished subagent is about to walk out; return true to hold it, steer it with
//                               sendTo, then call done() (it then walks out; auto after 60 s)
//   snapshot(data)              before the tower reads a snapshot: edit it in place (demos)
//   mode(active)                once, with true, after every feature has started (the tower is now on screen)
//   plaque(c, f, b)             a session floor's plaque text is being painted (screen space); b = { x, y, w, h, fs, k, right }:
//                               paint at its right end, right-aligned to b.right, and return the px used (the name gets the rest)
// Z bands for items (draw order, back to front):
//   z < 0       behind the tower (after the skyline + street, under the building)       Z.BEHIND
//   0..99       on the back wall / floor, in front of the furniture layer, behind people  Z.WALL 10, Z.FLOOR 50
//   100..199    among people, who sit at Z.SEATED 120 (the user 125), stand at Z.STAND 130, walk at Z.WALK 140, ride Z.RIDE 150
//   200..299    in front of the front furniture (reception, tables, CEO desk)            Z.FRONT
//   300..399    outdoors in front (street traffic), after the city's live layer   Z.OUTSIDE
//   (all of the above are dimmed by the night tint; relight with 'glow')
//   400+        after weather, never tinted (fireworks, confetti)                          Z.TOP
// Geometry: tower.plaque(floor) → the floor's name plaque, set into the slab under it (y = f.y, left end x = 0, front layer:
//   draw on it at Z.FRONT); tower.floors [{ id, kind 'server'|'post'|'lobby'|'cafe'|'session'|'meeting'|'ceo'|'roof', sessionId, session, n,
//   y, top, x0, x1, hue, desks }], tower.floor(id), tower.floorOf(sessionId),
//   tower.desk(sessionId) → { floor, seat, chair, desk, monitor, top (desk-top slot), floorSlot, wall (task board),
//   banner (workflow bunting strip), agents: [{ k, seat, chair, desk, monitor, top }] },
//   tower.spots (break spots: { id, floor, x, face, pose, anim, activity }), tower.cafe { spots, counter, menu, table, tv,
//   cafe/lounge x ranges }, tower.meeting { seats, board (spot), whiteboard, screen, table }, tower.ceo / tower.slots
//   { fame, trophies, inbox, gazette, window, desk, phone, note, seat, floor }, tower.lobby { door, inside, outside,
//   mailbox, newsBox, awning, wall, reception }, tower.facade { ticker (inside the lobby, over reception), wall }, tower.street { sidewalk, road, curb,
//   outside, door, buildings (city.js: { e, x0, w, h, floors, fire }), extent }, tower.roof { deck, x0, x1, spots }.
// People: tower.people → views { id, key, kind 'session'|'agent', session, x, y, floor (null riding), seated, atDesk,
//   walking, dir, face, state, activity, leaving, steered, onBreak, riding, look, data, slot }; tower.person(id).
//   tower.sendTo(id, floorId, x, { face 'left'|'right'|'up'|'down', pose 'stand'|'sit', anim 'type'|'read', activity, then(p),
//   exit: they keep walking if their session leaves the crowd meanwhile })
//   takes them off breaks and rides the elevator; they stay there until tower.release(id) sends them home (or out).
//   tower.liftLoad(floorId) → riders in the main car + people queued for a lift on that floor: send people a few at a
//   time while it is high (> 3), so the car is not swamped.
//   tower.spawn({ id?, look? ({ palette, hue }, default api.lookOf) | draw(c, p, now)?, from 'door'|'street' | floor+x, z? })
//   → npc { x, y, floor, walking, dir, gone, go(floor, x, opts) , pose(opts), leave(then), remove() } — same elevator
//   and walking; not in tower.people, not clickable by the built-in click (hit-test it yourself).
// Camera: tower.flyTo(floorId | { x, y }, zoom?), tower.follow(personId | null, zoom?), tower.following, tower.fit(),
//   tower.zoom, tower.worldToScreen(x, y) → { x, y }, tower.screenToWorld(sx, sy), tower.canvas (on-screen),
//   tower.world (the unscaled world canvas of the last frame). Helpers: tower.font(px, weight), fitText(t, maxPx, font),
//   bubble(sx, sy, text, color, fs?), tip(html), focusSession(session) (open in Orca), tower.snapshot, tower.active, tower.Z.
// Floors coming and going: tower.setOpen(floorId, k 0..1 | null) squeezes a floor to k of its height (f.open = k; the
//   floors above slide with it), tower.hide(sessionId, on) drops a floor from the plan, tower.vacate(sessionId, on) takes
//   its people out of the crowd (those steered with sendTo keep walking until released, then leave).
//
// This file wires the parts and owns the data (the snapshot → the floor plan → the people): registry.js (the features,
// the hooks, Z), camera.js, render.js (the frame), overlay.js (screen-space text), input.js (hover, click, pan, zoom),
// ceo.js (the user's desk), building.js (geometry + cached layers), people.js (people + elevators), city.js (the street).
import { IX, IX1, GROUND, CAR_X, DOOR, OUTSIDE, planFloors, buildLayers, desksFor, bounds, plaqueBox, setHash, SLAB, ceoSlots, geometry, deskGeo } from './building.js'
import { createPeople } from './people.js'
import { createCity } from './city.js'
import { Z, createHooks, startFeatures } from './registry.js'
import { createCamera, MAX_ZOOM } from './camera.js'
import { createRenderer } from './render.js'
import { createOverlay, MONO, font } from './overlay.js'
import { createInput } from './input.js'
import { createCeo } from './ceo.js'

export default async function init(api) {
  setHash(api.hash)
  const { hooks, report, run, ask, on } = createHooks()
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1))
  const demo = params.getAll('demo').includes('towerlife'), demoFire = params.getAll('demo').includes('towerfire')
  // ?demo=towerfire: one PR of the first engineer failed CI (they get four PRs if they have fewer), one of the third's
  // too, and the second's first PR is building
  const fakePr = (e, i) => ({ n: 1900 + i, title: `demo PR ${i + 1}`, draft: i === 3, ci: null, url: null, updatedAt: Date.now() - i * 6e5 })
  const fakeTrouble = st => ({ ...st, engineers: (st?.engineers || []).map((e, i) => {
    const prs = (i === 0 && e.prs.length < 4 ? [...e.prs, ...[0, 1, 2, 3].map(k => fakePr(e, k))].slice(0, 4) : e.prs).map(p => ({ ...p }))
    if (i === 0 && prs[1]) prs[1].ci = 'failed'
    if (i === 2 && prs[0]) prs[0].ci = 'failed'
    if (i === 1 && prs[0]) prs[0].ci = 'running'
    return { ...e, prs }
  }) })
  const wrap = document.getElementById('wrap'), tip = document.getElementById('tip')
  const cv = document.createElement('canvas'), vc = cv.getContext('2d')
  cv.id = 'tower'
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;display:block;touch-action:none;cursor:grab'
  wrap.insertBefore(cv, document.getElementById('hud'))
  api.view = cv
  const off = document.createElement('canvas'), oc = off.getContext('2d')
  const people = createPeople(api, demo, ask), city = createCity(api)
  // what every part reads: the canvases, the crowd, the street and the current plan (floors and their geometry)
  const st = {
    api, wrap, tip, cv, vc, off, oc, people, city, hooks, report, run, ask,
    floors: [], byId: new Map(), layers: null, floorKey: null, snap: null, slots: null, geo: null, desks: new Map(), active: false,
  }
  const camera = createCamera(st), { cam } = camera
  const ceo = createCeo(st), overlay = createOverlay(st, camera, ceo)
  const renderer = createRenderer(st, camera, ceo, overlay), input = createInput(st, camera, ceo, overlay)

  const style = document.createElement('style')
  style.textContent = '#tower.pointer { cursor: pointer !important; } #tower.dragging { cursor: grabbing !important; }'
  document.head.appendChild(style)

  // ---------- data ----------
  // A floor being built or taken down is squeezed (open: 0..1 of its height) and everything above it moves with it;
  // hidden floors are left out of the plan, vacated sessions out of the crowd (people a feature steers walk on).
  const open = new Map(), hidden = new Set(), vacated = new Set()
  let order = []
  api.on('sync', data => {
    run('snapshot', data)
    st.snap = data
    const live = new Set(data.sessions.map(s => s.id))
    for (const set of [hidden, vacated]) for (const id of set) if (!live.has(id)) set.delete(id)
    for (const id of open.keys()) if (!live.has(id)) open.delete(id)
    if (!order.length) order = data.sessions.map(s => s.id)
    order = order.filter(id => live.has(id))
    for (const s of data.sessions) if (!order.includes(s.id)) order.push(s.id)
    plan()
    for (const f of st.floors) if (f.session) f.session = data.sessions.find(s => s.id === f.id)
    people.sync(order.filter(id => !vacated.has(id)).map(id => data.sessions.find(s => s.id === id)))
    city.setStreet(demoFire ? fakeTrouble(data.street) : data.street)
    run('sync', data)
  })
  function plan() {
    const snap = st.snap
    if (!snap) return
    const sessions = order.filter(id => !hidden.has(id)).map(id => snap.sessions.find(s => s.id === id))
    const k = sessions.map(s => s.id + ':' + desksFor(s)).join(',')
    if (k === st.floorKey) return
    st.floorKey = k
    st.floors = planFloors(sessions); st.byId = new Map(st.floors.map(f => [f.id, f]))
    reflow()
  }
  function reflow() {
    const floors = st.floors
    let d = 0
    for (const f of floors) {
      f.base ??= { y: f.y, top: f.top }
      f.y = f.base.y + d; f.top = f.base.top + d
      const k = open.get(f.id)
      if (k == null) { delete f.open; continue }
      const s = Math.round((f.base.y - f.base.top + SLAB) * (1 - k))
      f.open = k; f.top += s; d += s
    }
    st.layers = buildLayers(floors); st.slots = ceoSlots(floors); st.geo = geometry(floors)
    st.desks = new Map(floors.filter(f => f.kind === 'session').map(f => [f.id, deskGeo(f)]))
    people.setFloors(floors)
    if (cam.auto) camera.fit(); else camera.clampCam()
    run('layout', floors)
  }

  // ---------- the frame ----------
  // ⚙ Settings → Advanced caps the frame rate (settings.fps 60 | 30 | 15; ?fps= overrides it): frames in between are
  // skipped whole, except while the camera flies or for a moment after any input, so dragging, zooming and hovering
  // stay smooth. A hidden page draws nothing at all until it is shown again.
  const urlFps = Number(params.get('fps')) || 0
  const fpsCap = () => urlFps || api.settings?.effective?.fps || 60
  let last = performance.now(), hotUntil = 0, paused = false
  const poke = () => { hotUntil = performance.now() + 400 }
  for (const ev of ['pointerdown', 'pointermove', 'wheel']) cv.addEventListener(ev, poke, { passive: true })
  addEventListener('keydown', poke); new ResizeObserver(poke).observe(wrap)   // a resize clears the canvas: redraw at once
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !paused || !st.active) return
    paused = false; last = performance.now(); poke(); requestAnimationFrame(frame)
  })
  function frame(now) {
    if (!st.active) return
    if (document.hidden) { paused = true; return }
    // queued first and each stage isolated: one throw must not stop movement (or drawing) until a reload
    requestAnimationFrame(frame)
    const cap = fpsCap()
    if (cap < 60 && now - last < 1000 / cap - 2 && now > hotUntil && !camera.flying) return
    const dt = Math.min(0.1, (now - last) / 1000); last = now
    if (!st.floors.length) return
    try { people.step(dt, now) } catch (e) { report('people', e) }
    run('step', dt, now)
    try { camera.step(dt) } catch (e) { report('camera', e) }
    try { renderer.render(now) } catch (e) { report('render', e); oc.reset?.() }
    try { input.hover() } catch (e) { report('hover', e) }
  }

  const worldToScreen = (x, y) => { const [sx, sy] = camera.toScreen(x, y); return { x: sx, y: sy } }
  const tower = api.tower = {
    on, Z, MONO, get active() { return st.active }, get snapshot() { return st.snap },
    // geometry (world pixels)
    get floors() { return st.floors }, floor: id => st.byId.get(id) || null, floorOf: sid => st.byId.get(sid) || null,
    desk: sid => st.desks.get(sid) || null, plaque: f => (typeof f === 'string' ? st.byId.get(f) : f) ? plaqueBox(typeof f === 'string' ? st.byId.get(f) : f) : null, get spots() { return people.spots },
    get slots() { return st.slots }, get ceo() { return st.slots },
    get lobby() { return st.geo?.lobby }, get cafe() { return st.geo?.cafe }, get meeting() { return st.geo?.meeting }, get roof() { return st.geo?.roof }, get facade() { return st.geo?.facade },
    get street() { return { sidewalk: { y0: 0, y1: 4 }, road: { y0: 4, y1: 14, lane: 9 }, curb: { y0: 14, y1: GROUND }, ground: GROUND, door: DOOR.x, outside: OUTSIDE, buildings: city.buildings, extent: city.extent() } },
    get interior() { return { x0: IX, x1: IX1 } }, get bounds() { return st.floors.length ? bounds(st.floors) : null },
    // people
    get people() { const out = []; for (const a of people.actors.values()) if (a.kind !== 'npc' && a.data && a.fade == null && !(a.delay > 0)) out.push(people.person(a)); return out },
    person: id => { const a = people.find(id); return a ? people.person(a) : null },
    sendTo: (id, floor, x, opts) => people.sendTo(id, floor, x, opts), release: id => people.release(id), spawn: o => people.spawn(o),
    liftLoad: floorId => people.liftLoad(floorId),
    get car() { const c = people.car; return { y: c.y, at: c.at, state: c.state, x: CAR_X } },
    get xcar() { const c = people.xcar; return { y: c.y, at: c.at, state: c.state, x: c.x, active: c.active, lit: c.lit, riders: c.riders.length } },
    // camera
    flyTo: camera.flyTo, follow: camera.follow, get following() { return camera.following && people.actors.get(camera.following)?.id || null }, fit: camera.fit,
    get zoom() { return cam.zoom }, fitZoom: camera.fitZoom, cam, worldToScreen, screenToWorld: (sx, sy) => camera.toWorld(sx, sy),
    get canvas() { return cv }, get world() { return off },
    // overlay helpers (screen space)
    font, fitText: overlay.fitText, bubble: (x, y, text, color, fs = Math.max(10, Math.min(16, 5.6 * cam.zoom))) => overlay.bubble(x, y, text, color, fs), tip: input.showTip,
    focusSession: async s => {
      if (!s?.running) return api.toast(`${s?.title || 'That session'} is no longer running`)
      try { const r = await fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id }) }); const j = await r.json(); api.toast(r.ok ? `Opened ${s.title} in Orca` : j.error) } catch { api.toast('Agentopolis server is offline') }
    },
    // floors coming and going: setOpen(floorId, 0..1 | null) squeezes a floor, hide(sessionId, on) drops it from the
    // plan, vacate(sessionId, on) takes its people out of the crowd (those a feature steers keep walking until released)
    setOpen(id, k) { if (k == null || k >= 1) open.delete(id); else open.set(id, Math.max(0, k)); if (st.byId.has(id)) reflow() },
    hide(id, on = true) { if (on) hidden.add(id); else hidden.delete(id); plan() },
    vacate(id, on = true) { if (on) vacated.add(id); else vacated.delete(id) },
    city, crowd: people,
  }
  await startFeatures(api, tower)

  try { localStorage.removeItem('agent-office:mode') } catch {}   // the old office/tower switch
  st.active = true; camera.size(); camera.fit(); requestAnimationFrame(frame)
  run('mode', true)
  // ?towerzoom=<z>&towerat=<floor index>: a close-up for checking detail
  const tz = params.get('towerzoom') === 'min' ? -1 : Number(params.get('towerzoom'))
  if (tz === -1) { const t = setInterval(() => { if (!st.floors.length || !city.buildings.length) return; clearInterval(t); cam.zoom = 0; cam.auto = false; camera.clampCam() }, 100) }
  else if (tz) { const t = setInterval(() => { if (!st.floors.length) return; clearInterval(t); const f = st.floors[Number(params.get('towerat') ?? 2)] || st.floors[2]; cam.zoom = Math.min(MAX_ZOOM, tz); cam.auto = false; cam.cx = Number(params.get('towerx') ?? 250); cam.cy = f.y - 30 }, 100) }
}
