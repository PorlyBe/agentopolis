// tower: a side-view skyscraper of the sessions, one floor each, with shared floors on top, a glass elevator,
// a post room and a server room underneath and the GitHub engineers' buildings along the street. It is the whole view.
// ?demo=towerlife sends everyone on breaks; ?towerzoom=<z>|min&towerat=<floor index> starts on a close-up or the whole street.
// the user sits in the CEO office under the roof; when a session needs him ('attention') his desk phone rings and a note
// lists who — clicking either opens the first one in Orca.
//
// ===== Tower feature API (app/tower/features/*.js: export default function init(api, tower), tower === api.tower) =====
// Coordinates: world pixels. x = 0 is the tower's left outer wall (interior tower.interior.x0..x1 = 8..488), the street
// door is in that wall, the street furniture stands left of it (x < 0), the elevator shaft is right of it. y = 0 is street
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
import { light } from '../features/day-night.js'
import {
  IX, IX1, FW, BW, GROUND, SLAB, SEAT, MAX_DESKS, BANNER, CAR_X, CAR_H, RACKS, rackX, SHAFT, DOOR, OUTSIDE,
  planFloors, buildLayers, desksFor, bounds, plaqueBox, setHash, monitor, rack, CAFE, ceoSlots, geometry, deskGeo, garageRect,
} from './building.js'
import { createPeople } from './people.js'
import { createCity } from './city.js'
import ceoOffice from './features/ceo-office.js'
import deskKit from './features/desk-kit.js'
import workSignals from './features/work-signals.js'
import interactions from './features/interactions.js'
import social from './features/social.js'
import ambience from './features/ambience.js'
import mess from './features/mess.js'
import myPrs from './features/my-prs.js'
import moveInOut from './features/move-in-out.js'
import deployRocket from './features/deploy-rocket.js'
import waitingLine from './features/waiting-line.js'
import printerJam from './features/printer-jam.js'
import groundhog from './features/groundhog.js'
import fireDrill from './features/fire-drill.js'
import securityDesk from './features/security-desk.js'
import vending from './features/vending.js'
import library from './features/library.js'
import testLab from './features/test-lab.js'
import planWhiteboard from './features/plan-whiteboard.js'
import parkingGarage from './features/parking-garage.js'
import fridayDrinks from './features/friday-drinks.js'
import lostFound from './features/lost-found.js'
import interofficeMail from './features/interoffice-mail.js'
import walkabout from './features/walkabout.js'
import milestoneCake from './features/milestone-cake.js'
import reviewerVisits from './features/reviewer-visits.js'
import refactorCrane from './features/refactor-crane.js'
import timeClock from './features/time-clock.js'
import holidays from './features/holidays.js'
import windowCleaner from './features/window-cleaner.js'
import phoneBooth from './features/phone-booth.js'
import itTech from './features/it-tech.js'
import helipad from './features/helipad.js'
import ciSubway from './features/ci-subway.js'
import releaseParty from './features/release-party.js'
import tugOfWar from './features/tug-of-war.js'
import drones from './features/drones.js'
import commitStamps from './features/commit-stamps.js'
import mergeStamp from './features/merge-stamp.js'
import priceBillboard from './features/price-billboard.js'
import screensaver from './features/screensaver.js'
import standup from './features/standup.js'
import lunchRush from './features/lunch-rush.js'
import seismograph from './features/seismograph.js'
import windowHeatmap from './features/window-heatmap.js'
import hallOfRecords from './features/hall-of-records.js'
import blimp from './features/blimp.js'
import uniforms from './features/uniforms.js'
import wardrobe from './features/wardrobe.js'
import themes from './features/themes.js'
import skylineTowers from './features/skyline-towers.js'
import avatar from './features/avatar.js'
import postRoom from './features/post-room.js'

const FEATURES = [['ceo-office', ceoOffice], ['desk-kit', deskKit], ['work-signals', workSignals], ['interactions', interactions], ['social', social], ['ambience', ambience], ['mess', mess], ['my-prs', myPrs], ['move-in-out', moveInOut], ['waiting-line', waitingLine], ['deploy-rocket', deployRocket],
  ['printer-jam', printerJam], ['groundhog', groundhog], ['fire-drill', fireDrill], ['security-desk', securityDesk], ['vending', vending], ['library', library], ['test-lab', testLab], ['plan-whiteboard', planWhiteboard], ['parking-garage', parkingGarage], ['friday-drinks', fridayDrinks], ['lost-found', lostFound], ['interoffice-mail', interofficeMail], ['post-room', postRoom],
  ['walkabout', walkabout], ['milestone-cake', milestoneCake], ['reviewer-visits', reviewerVisits], ['refactor-crane', refactorCrane], ['time-clock', timeClock], ['holidays', holidays], ['window-cleaner', windowCleaner], ['phone-booth', phoneBooth], ['it-tech', itTech], ['helipad', helipad],
  ['ci-subway', ciSubway], ['release-party', releaseParty], ['tug-of-war', tugOfWar], ['drones', drones], ['commit-stamps', commitStamps], ['merge-stamp', mergeStamp], ['price-billboard', priceBillboard], ['screensaver', screensaver], ['standup', standup], ['lunch-rush', lunchRush],
  ['seismograph', seismograph], ['window-heatmap', windowHeatmap], ['hall-of-records', hallOfRecords], ['blimp', blimp], ['uniforms', uniforms], ['wardrobe', wardrobe], ['themes', themes], ['skyline-towers', skylineTowers], ['avatar', avatar]]
const Z = { BEHIND: -100, WALL: 10, FLOOR: 50, SEATED: 120, STAND: 130, WALK: 140, RIDE: 150, FRONT: 200, OUTSIDE: 300, TOP: 400 }

const MAX_ZOOM = 8
const MONO = 'ui-monospace, SFMono-Regular, Menlo, monospace'
const HUES = ['#63b3f0', '#e58ad0', '#5fd1c8', '#f4a24f', '#b996f5', '#c8d16a']
const INK = { done: '#2f7a41', active: '#b0660f', pending: '#8a7a66', stopped: '#a8322a' }
const MARK = { done: '✓', active: '●', pending: '○', stopped: '✕' }

export default async function init(api) {
  setHash(api.hash)
  const hooks = { snapshot: [], sync: [], layout: [], step: [], items: [], glow: [], post: [], overlay: [], click: [], dblclick: [], hover: [], leaving: [], mode: [], plaque: [] }
  const run = (name, ...args) => { for (const fn of hooks[name]) { try { fn(...args) } catch (e) { console.error(`[tower:${name}]`, e) } } }
  const ask = (name, ...args) => { for (const fn of hooks[name]) { try { const r = fn(...args); if (r) return r } catch (e) { console.error(`[tower:${name}]`, e) } } return null }
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
  let floors = [], byId = new Map(), layers = null, floorKey = null, order = [], snap = null, slots = null, geo = null, desks = new Map()
  const cam = { zoom: 1, cx: 0, cy: 0, auto: true }
  let active = false

  const style = document.createElement('style')
  style.textContent = '#tower.pointer { cursor: pointer !important; } #tower.dragging { cursor: grabbing !important; }'
  document.head.appendChild(style)

  // ---------- data ----------
  // A floor being built or taken down is squeezed (open: 0..1 of its height) and everything above it moves with it;
  // hidden floors are left out of the plan, vacated sessions out of the crowd (people a feature steers walk on).
  const open = new Map(), hidden = new Set(), vacated = new Set()
  api.on('sync', data => {
    run('snapshot', data)
    snap = data
    const live = new Set(data.sessions.map(s => s.id))
    for (const set of [hidden, vacated]) for (const id of set) if (!live.has(id)) set.delete(id)
    for (const id of open.keys()) if (!live.has(id)) open.delete(id)
    if (!order.length) order = data.sessions.map(s => s.id)
    order = order.filter(id => live.has(id))
    for (const s of data.sessions) if (!order.includes(s.id)) order.push(s.id)
    plan()
    for (const f of floors) if (f.session) f.session = data.sessions.find(s => s.id === f.id)
    people.sync(order.filter(id => !vacated.has(id)).map(id => data.sessions.find(s => s.id === id)))
    city.setStreet(demoFire ? fakeTrouble(data.street) : data.street)
    run('sync', data)
  })
  function plan() {
    if (!snap) return
    const sessions = order.filter(id => !hidden.has(id)).map(id => snap.sessions.find(s => s.id === id))
    const k = sessions.map(s => s.id + ':' + desksFor(s)).join(',')
    if (k === floorKey) return
    floorKey = k
    floors = planFloors(sessions); byId = new Map(floors.map(f => [f.id, f]))
    reflow()
  }
  function reflow() {
    let d = 0
    for (const f of floors) {
      f.base ??= { y: f.y, top: f.top }
      f.y = f.base.y + d; f.top = f.base.top + d
      const k = open.get(f.id)
      if (k == null) { delete f.open; continue }
      const s = Math.round((f.base.y - f.base.top + SLAB) * (1 - k))
      f.open = k; f.top += s; d += s
    }
    layers = buildLayers(floors); slots = ceoSlots(floors); geo = geometry(floors)
    desks = new Map(floors.filter(f => f.kind === 'session').map(f => [f.id, deskGeo(f)]))
    people.setFloors(floors)
    if (cam.auto) fit(); else clampCam()
    run('layout', floors)
  }

  // ---------- camera ----------
  const vw = () => wrap.clientWidth, vh = () => wrap.clientHeight, usableH = () => Math.max(100, vh() - (api.reserveBottom || 0))
  // fit frames the tower; zooming out goes on until the whole street (every engineer's building) fits the width
  function fitBox() { const b = bounds(floors); return { ...b, x0: b.x0 - 6, x1: b.x1 + 6 } }
  function cityBox() { const b = fitBox(), e = city.extent(); return { ...b, x0: Math.min(b.x0, e.x0) - 24, x1: Math.max(b.x1, e.x1) + 24 } }
  // HUD cards in the bottom corners (api.hudCorners: () => { w, h } from the corner): the fit keeps the tower beside them
  // when that costs less zoom than lifting it above them
  let framed = null
  function framing(fresh) {
    const key = `${vw()}x${vh()}:${api.reserveBottom}:${floorKey}:${floors.at(-1)?.y}`, t = performance.now()
    if (!fresh && framed?.key === key && t - framed.t < 500) return framed
    const b = fitBox(), bw = b.x1 - b.x0, bh = b.y1 - b.y0, base = api.reserveBottom || 0
    const at = reserve => Math.min(vw() / bw, Math.max(100, vh() - reserve) / bh) * 0.98
    const z = at(base)
    let cw = 0, ch = 0
    for (const f of api.hudCorners || []) { const c = f(); if (c) { cw = Math.max(cw, c.w); ch = Math.max(ch, c.h) } }
    const beside = Math.min(z, (vw() - 2 * cw) / bw * 0.98), above = at(Math.max(base, ch))
    framed = !cw || (vw() - bw * z) / 2 >= cw ? { zoom: z, reserve: base }
      : beside >= above ? { zoom: beside, reserve: base } : { zoom: above, reserve: Math.max(base, ch) }
    framed.key = key; framed.t = t
    return framed
  }
  const fitZoom = () => floors.length ? framing().zoom : 1
  const minZoom = () => { if (!floors.length) return 1; const b = cityBox(); return Math.min(fitZoom(), vw() / (b.x1 - b.x0) * 0.98) }
  function fit() {
    flight = null; following = null
    if (!floors.length) return
    const b = fitBox(), f = framing(true)
    cam.zoom = f.zoom; cam.auto = true
    cam.cx = (b.x0 + b.x1) / 2; cam.cy = (b.y0 + b.y1) / 2 + f.reserve / 2 / cam.zoom
  }
  function clampCam() {
    if (!floors.length) return
    const b = cityBox(), z = cam.zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, cam.zoom)), hw = vw() / 2 / z
    cam.cx = b.x1 - b.x0 <= 2 * hw ? (b.x0 + b.x1) / 2 : Math.max(b.x0 + hw, Math.min(b.x1 - hw, cam.cx))
    // zoomed out past the tower's fit, the basement stays at the bottom and the sky grows above
    if (z < fitZoom() - 1e-6) cam.cy = b.y1 - (usableH() - vh() / 2) / z
    else cam.cy = Math.max(b.y0, Math.min(b.y1, cam.cy))
  }
  function zoomAt(z, sx = vw() / 2, sy = vh() / 2) {
    const w = toWorld(sx, sy)
    cam.zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, z)); cam.auto = false
    cam.cx = w.x - (sx - vw() / 2) / cam.zoom; cam.cy = w.y - (sy - vh() / 2) / cam.zoom
    clampCam()
  }
  // flyTo / follow: an eased flight, then (when following) a soft chase of the person
  let flight = null, following = null
  function flyTo(t, z) {
    const f = typeof t === 'string' ? byId.get(t) : null
    if (!f && !(t && Number.isFinite(t.x) && Number.isFinite(t.y))) return false
    const p = f ? { x: (BW + SHAFT) / 2, y: (f.top + f.y) / 2 + 6 } : t
    const zf = f ? Math.min(vw() / (BW + SHAFT + 60), usableH() / ((f.y - f.top) * 2.6)) : Math.max(cam.zoom, 3)
    const zoom = Math.max(minZoom(), Math.min(MAX_ZOOM, z ?? zf))
    flight = { t: 0, from: { cx: cam.cx, cy: cam.cy, zoom: cam.zoom }, to: { cx: p.x, cy: p.y, zoom } }
    cam.auto = false
    return true
  }
  function follow(id, z) {
    following = id ? people.find(id)?.key || null : null
    if (following) { const a = people.actors.get(following); flyTo({ x: a.x, y: people.yOf(a) - 16 }, z ?? Math.max(cam.zoom, 3.5)) }
  }
  function stepCamera(dt) {
    if (flight) {
      flight.t = Math.min(1, flight.t + dt / 0.7)
      const e = flight.t < 0.5 ? 2 * flight.t ** 2 : 1 - (-2 * flight.t + 2) ** 2 / 2, { from, to } = flight
      if (following) { const a = people.actors.get(following); if (a) { to.cx = a.x; to.cy = people.yOf(a) - 16 } }
      cam.zoom = from.zoom + (to.zoom - from.zoom) * e; cam.cx = from.cx + (to.cx - from.cx) * e; cam.cy = from.cy + (to.cy - from.cy) * e
      if (flight.t >= 1) flight = null
      clampCam(); return
    }
    if (!following) return
    const a = people.actors.get(following)
    if (!a || a.fade != null) { following = null; return }
    const k = 1 - Math.exp(-dt * 5)
    cam.cx += (a.x - cam.cx) * k; cam.cy += (people.yOf(a) - 16 - cam.cy) * k
    clampCam()
  }
  const toWorld = (sx, sy) => ({ x: cam.cx + (sx - vw() / 2) / cam.zoom, y: cam.cy + (sy - vh() / 2) / cam.zoom })
  const toScreen = (x, y) => [(x - cam.cx) * cam.zoom + vw() / 2, (y - cam.cy) * cam.zoom + vh() / 2]
  function size() { const dpr = devicePixelRatio || 1; cv.width = Math.round(vw() * dpr); cv.height = Math.round(vh() * dpr) }
  new ResizeObserver(() => { if (!active) return; size(); if (cam.auto) fit(); else clampCam() }).observe(wrap)

  // ---------- the frame ----------
  let last = performance.now()
  function frame(now) {
    if (!active) return
    const dt = Math.min(0.1, (now - last) / 1000); last = now
    if (floors.length) { people.step(dt, now); run('step', dt, now); stepCamera(dt); render(now); hover() }
    requestAnimationFrame(frame)
  }
  function sunInfo() {
    const d = api.daylight, hour = d?.hourNow ? d.hourNow() : new Date().getHours() + new Date().getMinutes() / 60
    const sun = d?.sunHours ? d.sunHours() : { sr: 6.5, ss: 18.5 }
    const n = d?.nightness ? d.nightness(hour) : (hour < sun.sr || hour > sun.ss ? 1 : 0)
    return { hour, sr: sun.sr, ss: sun.ss, n, gloom: d?.gloom?.() ?? 0, kind: d?.weatherKind?.() ?? snap?.weather?.kind, clouds: snap?.weather?.clouds, lightColor: light(hour).color }
  }
  function render(now) {
    const z = cam.zoom, W = vw(), H = vh()
    const v = { x0: cam.cx - W / 2 / z, y0: cam.cy - H / 2 / z }; v.x1 = v.x0 + W / z; v.y1 = v.y0 + H / z
    const ox = Math.floor(v.x0), oy = Math.floor(v.y0), ow = Math.ceil(v.x1) - ox + 1, oh = Math.ceil(v.y1) - oy + 1
    if (off.width !== ow || off.height !== oh) { off.width = ow; off.height = oh }
    const c = oc
    c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, ow, oh); c.imageSmoothingEnabled = false
    c.setTransform(1, 0, 0, 1, -ox, -oy)
    const sun = sunInfo(), lb = layers.bounds
    const items = [], ctx = { now, view: v, sun }
    run('items', items, now, ctx)
    items.sort((p, q) => p.z - q.z)
    const band = (lo, hi) => { for (const it of items) if (it.z >= lo && it.z < hi) { c.save(); try { it.draw(c, now) } catch (e) { console.error('[tower:item]', e) } c.restore() } }
    city.drawBack(c, v, now, sun.n)
    windowView(c, sun.n)
    band(-Infinity, 0)
    c.drawImage(layers.back, lb.x0, lb.y0)
    drawLive(c, now)
    band(0, 100)
    people.drawCar(c, false)
    // people, the user and feature items in the people band, back to front by z (stable, so equal z keeps insertion order)
    const zOf = a => a.z ?? (a.liftPhase === 'riding' ? Z.RIDE : a.walking ? Z.WALK : a.pose === 'desk' || a.sitting ? Z.SEATED : Z.STAND)
    const mid = [...people.actors.values()].filter(a => !(a.delay > 0)).map(a => ({ z: zOf(a), draw: () => people.drawActor(c, a, now) }))
    mid.push({ z: Z.SEATED + 5, draw: () => drawPaul(c, now) }, ...items.filter(it => it.z >= 100 && it.z < 200).map(it => ({ z: it.z, draw: () => { c.save(); try { it.draw(c, now) } catch (e) { console.error('[tower:item]', e) } c.restore() } })))
    mid.sort((p, q) => p.z - q.z)
    for (const it of mid) it.draw()
    c.drawImage(layers.front, lb.x0, lb.y0)
    drawDesk(c, now)
    band(200, 300)
    people.drawCar(c, true)
    city.drawLive(c, v, now)
    band(300, 400)
    // night: the outside darkens fully, the lit interiors only a little
    const ext = sun.n * 0.62 + sun.gloom * (1 - sun.n) * 0.6, int = sun.n * 0.2 + sun.gloom * 0.15
    const rooms = interiorRects()
    c.globalCompositeOperation = 'source-atop'
    if (ext > 0.01) {
      c.save(); c.beginPath(); c.rect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4); for (const r of rooms) c.rect(r.x, r.y + r.h, r.w, -r.h)
      c.clip('evenodd'); c.fillStyle = `rgba(14,18,44,${ext})`; c.fillRect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4); c.restore()
    }
    if (int > 0.01) { c.fillStyle = `rgba(20,22,48,${int})`; for (const r of rooms) c.fillRect(r.x, r.y, r.w, r.h) }
    c.globalCompositeOperation = 'lighter'
    if (sun.n > 0.02) { c.globalAlpha = sun.n * 0.75; c.drawImage(layers.lights, lb.x0, lb.y0); c.globalAlpha = 1 }
    drawGlow(c, now, sun.n)
    city.drawLights(c, v, now, sun.n)
    if (hooks.glow.length) { c.save(); run('glow', c, now, sun.n, ctx); c.restore(); c.globalCompositeOperation = 'lighter'; c.globalAlpha = 1 }
    c.globalCompositeOperation = 'destination-over'
    city.drawSky(c, v, now, sun)
    c.globalCompositeOperation = 'source-over'
    c.save(); c.beginPath(); c.rect(v.x0 - 2, v.y0 - 2, v.x1 - v.x0 + 4, v.y1 - v.y0 + 4); for (const r of rooms) c.rect(r.x, r.y + r.h, r.w, -r.h); c.clip('evenodd')
    city.drawWeather(c, v, now, sun.kind); c.restore()
    band(400, Infinity)
    if (hooks.post.length) { c.save(); run('post', c, now, ctx); c.restore() }

    const dpr = devicePixelRatio || 1
    vc.setTransform(dpr, 0, 0, dpr, 0, 0)
    vc.imageSmoothingEnabled = z < 1
    vc.fillStyle = '#14151c'; vc.fillRect(0, 0, W, H)
    vc.drawImage(off, 0, 0, ow, oh, (ox - v.x0) * z, (oy - v.y0) * z, ow * z, oh * z)
    overlay(now)
    if (hooks.overlay.length) { vc.save(); run('overlay', vc, now, ctx); vc.restore() }
  }
  function interiorRects() {
    const top = floors[floors.length - 2].top, base = floors[0]
    const rooms = [{ x: IX, y: top, w: FW, h: -top }, { x: IX, y: GROUND, w: FW, h: base.y - GROUND }, garageRect(floors)]
    // plaques are backlit too, so their names stay readable at night: the parts the rooms do not cover (no overlaps: the clip is even-odd)
    const out = [...rooms]
    for (const f of floors) if (f.kind !== 'roof') {
      const b = plaqueBox(f)
      out.push({ x: b.x, y: b.y, w: IX - b.x, h: b.h })
      let y = b.y
      for (const r of [...rooms].sort((p, q) => p.y - q.y)) {
        if (r.y + r.h <= y || r.y >= b.y + b.h) continue
        if (r.y > y) out.push({ x: IX, y, w: b.x + b.w - IX, h: r.y - y })
        y = Math.max(y, r.y + r.h)
      }
      if (y < b.y + b.h) out.push({ x: IX, y, w: b.x + b.w - IX, h: b.y + b.h - y })
    }
    return out
  }
  // ---------- live bits of the building ----------
  const working = st => st === 'tool' || st === 'thinking' || st === 'delegating' || st === 'building'
  function deskOccupant(f, k) {
    for (const a of people.actors.values()) if (a.floor === f.id && a.pose === 'desk' && (k == null ? a.kind === 'session' : a.kind === 'agent' && a.slot === k)) return a
    return null
  }
  function drawLive(c, now) {
    const car = people.car
    for (const f of floors) {
      if (f.kind === 'session' && !(f.y - f.top < 26)) {
        if (f.open != null) { c.save(); c.beginPath(); c.rect(IX, f.top, FW, f.y - f.top); c.clip() }
        const me = deskOccupant(f)
        monitor(c, SEAT.session + 15, f.y, me && working(me.data?.state), now)
        for (let k = 0; k < f.desks; k++) { const a = deskOccupant(f, k); monitor(c, SEAT.agent(k) + 11, f.y, a && !a.leaving && a.data?.state !== 'idle' && a.data?.state !== 'done', now, k + 1) }
        const run = runOf(f)
        if (run && f.open == null) banner(c, f, run)
        if (f.open != null) c.restore()
      }
      if (f.kind === 'cafe') {
        const tv = people.occupied('cafe:tv') > 0
        if (tv) {
          const x = CAFE.tv + 2, y = CAFE.tvY(f) + 2, t = now / 120
          c.fillStyle = '#2a3a6a'; c.fillRect(x, y, 48, 24); c.fillStyle = '#3a8a4a'; c.fillRect(x, y + 12, 48, 12)
          c.fillStyle = '#5a5a66'; c.beginPath(); c.moveTo(x + 22, y + 12); c.lineTo(x + 26, y + 12); c.lineTo(x + 40, y + 24); c.lineTo(x + 8, y + 24); c.fill()
          c.fillStyle = '#ff5a5a'; c.fillRect(x + 18 + Math.round(4 * Math.sin(now / 400)), y + 18, 4, 3); c.fillStyle = '#5ab0ff'; c.fillRect(x + 26 + Math.round(4 * Math.sin(now / 470 + 1)), y + 19, 4, 3)
          c.fillStyle = '#f2f0e6'; c.fillRect(x + 23.5, y + 12 + ((t / 6) % 1) * 10, 1, 2)
        }
        for (const [i, x] of [[0, CAFE.arcade + 2]]) if (people.occupied('cafe:arcade' + i)) {
          const tt = Math.floor(now / 200); c.fillStyle = '#7bff8a'; for (let k = 0; k < 3; k++) c.fillRect(x + 1 + k * 3 + (tt % 2), f.y - 31 + (tt % 4 > 1 ? 1 : 0), 2, 1)
          c.fillStyle = '#5ae0ff'; c.fillRect(x + 5 + Math.round(2 * Math.sin(now / 300)), f.y - 24, 2, 1)
        }
        for (const [i, x] of [[0, CAFE.pinball]]) if (people.occupied('cafe:pinball' + i)) { c.fillStyle = Math.floor(now / 120) % 2 ? '#ffd84a' : '#ff5a8a'; c.fillRect(x + 13, f.y - 34, 4, 3) }
        if (people.occupied('cafe:coffee')) for (let k = 0; k < 3; k++) {
          const p = ((now / 1400) + k / 3) % 1; c.fillStyle = `rgba(255,255,255,${0.6 * (1 - p)})`
          c.fillRect(Math.round(IX + 41 + Math.sin(p * 6 + k) * 1.5), Math.round(f.y - 31 - p * 10), 1, 2)
        }
      }
      if (f.kind === 'server') {
        const jobs = [...(snap?.serverRoom?.running || []), ...(snap?.serverRoom?.failed || []).map(j => ({ ...j, failed: true }))]
        jobs.slice(0, RACKS).forEach((j, k) => rack(c, rackX(k), f.y, j.kind, now, api.hash(j.id) % 7, j.failed))
      }
      if (f.kind === 'roof') stringLights(c, f, now, false)
      // the call lamp over each shaft door
      if (f.kind !== 'roof' && f.kind !== 'server') {
        const here = car.at === f.id && car.state !== 'moving'
        c.fillStyle = here ? '#5fd17a' : '#3a3f4a'; c.fillRect(BW - 6, f.y - 50, 4, 3)
      }
    }
  }
  // ---------- the CEO office ----------
  const needsPaul = () => (snap?.sessions || []).filter(s => s.state === 'attention' && s.running !== false)
  const ringing = now => needsPaul().length > 0 && (now % 2000) < 1200
  // far rooftops seen from the penthouse, under the window's glass (the sky itself shows through the hole)
  function windowView(c, n) {
    if (!slots) return
    const w = slots.window, base = w.y + w.h, day = [143, 163, 192], night = [30, 36, 64]
    const col = (k) => { const a = day.map((v, i) => Math.round(v * (1 - k * 0.12) + (night[i] - v) * n)); return `rgb(${a})` }
    c.save(); c.beginPath(); c.rect(w.x, w.y, w.w, w.h); c.clip()
    for (let layer = 0; layer < 2; layer++) {
      let x = w.x - 6, i = 0
      while (x < w.x + w.w) {
        const h = api.hash(`pent${layer}:${i}`), bw = 10 + h % 18, bh = (layer ? 6 : 12) + (h >>> 5) % (layer ? 14 : 18)
        c.fillStyle = col(layer); c.fillRect(x, base - bh, bw, bh)
        if (!layer && (h >>> 9) % 5 === 0) c.fillRect(x + (bw >> 1), base - bh - 6, 1, 6)
        if (n > 0.3) { c.fillStyle = `rgba(255,226,150,${Math.min(1, (n - 0.3) * 2)})`; for (let k = 0; k < bw * bh / 40; k++) { const q = api.hash(`pw${layer}:${i}:${k}`); if (q % 3 === 0) c.fillRect(x + 1 + q % (bw - 2), base - bh + 2 + (q >>> 6) % Math.max(1, bh - 3), 1, 1) } }
        x += bw + 1 + (h >>> 11) % 4; i++
      }
    }
    c.restore()
  }
  let paulSprite = null
  function paulSheet() {   // char_0 (the suit) recoloured charcoal with a gold pocket square, so the user is nobody else
    if (paulSprite) return paulSprite
    const src = api.charSheet(0, 0); if (!src?.width) return null
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = 32
    const x = cv.getContext('2d'); x.drawImage(src, 0, 0, src.width, 32, 0, 0, src.width, 32)
    const d = x.getImageData(0, 0, cv.width, 32), p = d.data
    for (let i = 0; i < p.length; i += 4) {
      const [r, g, b] = [p[i], p[i + 1], p[i + 2]]
      if (p[i + 3] && b > r + 30 && b > g + 10) { const l = (r + g + b) / 3; p[i] = p[i + 1] = Math.round(26 + l * 0.42); p[i + 2] = Math.round(34 + l * 0.46) }
    }
    x.putImageData(d, 0, 0)
    return (paulSprite = cv)
  }
  function drawPaul(c, now) {
    if (!slots) return
    const sh = api.tower?.avatar?.sheet() || paulSheet(); if (!sh) return   // features/avatar.js restyles him
    const y = slots.floor.y, x = slots.seat
    // mostly at work, now and then reading the paper; looking up while the phone rings
    const frame = needsPaul().length ? 3 : Math.floor(now / 7000) % 3 === 2 ? 5 + Math.floor(now / 600) % 2 : 3 + (Math.floor(now / 900) % 4 === 0 ? 1 : 0)
    c.drawImage(sh, frame * 16, 0, 16, 32, Math.round(x - 8), Math.round(y - 46), 16, 32)   // a tall chair: he sits above the desk
  }
  const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
  function drawDesk(c, now) {
    if (!slots) return
    const p = slots.phone, n = slots.note, ring = ringing(now), list = needsPaul()
    const jx = ring ? (Math.floor(now / 45) % 2 ? 1 : -1) : 0, jy = ring ? -1 - (Math.floor(now / 90) % 2) : 0
    R(c, '#1d1d24', p.x + 1, p.y + 3, 11, 4); R(c, '#3a3a46', p.x + 2, p.y + 3, 9, 1); R(c, '#c9a25a', p.x + 5, p.y + 5, 3, 1)
    R(c, '#7a1f22', p.x + jx, p.y + jy, 13, 3); R(c, '#9a2a2e', p.x + jx, p.y + jy, 13, 1); R(c, '#7a1f22', p.x + jx, p.y + jy + 2, 3, 2); R(c, '#7a1f22', p.x + 10 + jx, p.y + jy + 2, 3, 2)
    if (ring) {
      c.fillStyle = '#ffd84a'
      for (const [sx, dir] of [[p.x - 3, -1], [p.x + 15, 1]]) { c.fillRect(sx, p.y - 1, 1, 3); c.fillRect(sx + dir * 2, p.y - 3, 1, 5); c.fillRect(sx + dir * 4, p.y - 2, 1, 3) }
    }
    R(c, '#5a4030', n.x + 4, n.y + n.h - 2, 2, 2)
    R(c, list.length ? '#fff4c0' : '#f4efe0', n.x, n.y, n.w, n.h - 2); R(c, 'rgba(0,0,0,.15)', n.x + n.w - 1, n.y, 1, n.h - 2)
    if (list.length) { R(c, '#d8383a', n.x + 2, n.y + 2, 6, 2); for (let k = 0; k < Math.min(3, list.length); k++) R(c, '#6a5a4a', n.x + 2, n.y + 5 + k * 2, 6, 1) }
    else for (let k = 0; k < 3; k++) R(c, '#c8bca4', n.x + 2, n.y + 2 + k * 3, 6, 1)
  }
  async function focusFirst() {
    const s = needsPaul()[0]
    if (!s) return api.toast('Nobody needs you right now')
    try {
      const r = await fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
      const j = await r.json(); api.toast(r.ok ? `Opened ${s.title} in Orca` : j.error)
    } catch { api.toast('Agentopolis server is offline') }
  }

  function stringLights(c, f, now, glow) {
    const cols = ['#ffd27a', '#ff8a7a', '#8ad0ff', '#b8f08a']
    for (let i = 0; i <= 30; i++) {
      const t = i / 30, x = 12 + t * (BW - 24), y = f.y - 46 + Math.sin(Math.PI * t) * 12
      if (!glow) { c.fillStyle = '#3a3438'; c.fillRect(Math.round(x), Math.round(y), 2, 1) }
      if (i % 2) continue
      const on = (Math.floor(now / 900) + i) % 7 !== 0
      if (glow) { if (on) { c.fillStyle = cols[(i / 2) % 4]; c.fillRect(Math.round(x) - 1, Math.round(y) + 1, 4, 4) } }
      else { c.fillStyle = cols[(i / 2) % 4]; c.globalAlpha = 0.7; c.fillRect(Math.round(x), Math.round(y) + 2, 2, 3); c.globalAlpha = 1 }
    }
  }
  function drawGlow(c, now, n) {
    if (n < 0.02) return
    c.globalAlpha = n
    const pool = (x, y, r, col, a) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${a})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
    for (const f of floors) if (f.kind === 'session') {
      const me = deskOccupant(f); if (me && working(me.data?.state)) pool(SEAT.session + 17, f.y - 20, 18, '110,170,255', 0.45)
      for (let k = 0; k < f.desks; k++) { const a = deskOccupant(f, k); if (a && a.data?.state !== 'idle') pool(SEAT.agent(k) + 13, f.y - 20, 14, '110,170,255', 0.4) }
    }
    pool(CAR_X, people.car.y - CAR_H / 2, 30, '220,235,255', 0.35)
    const roof = floors[floors.length - 1]
    stringLights(c, roof, now, true)
    pool(BW / 2, roof.y - 40, 160, '255,200,120', 0.12)
    c.globalAlpha = 1
  }
  const squeezed = f => f.open != null && f.y - f.top < 20   // too low for its plaque, which would cover the one below
  const runOf = f => { const r = f.session?.ext?.['workflow-phases']?.[0]; return r && r.status === 'running' ? r : null }
  function banner(c, f, run) {
    const x0 = BANNER.x0, x1 = BANNER.x1, y = f.top + 4, hue = HUES[api.hash(run.run || run.name) % HUES.length]
    c.fillStyle = '#5a5050'; c.fillRect(x0, y - 2, 1, 3); c.fillRect(x1 - 1, y - 2, 1, 3)
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(x0 + 2, y + 15, x1 - x0 - 2, 2)
    c.fillStyle = '#f2e8d0'; c.fillRect(x0, y, x1 - x0, 15)
    c.fillStyle = hue; c.fillRect(x0, y, x1 - x0, 2); c.fillRect(x0, y + 13, x1 - x0, 2)
    for (let x = x0 + 6; x < x1 - 4; x += 12) { c.fillStyle = hue; c.fillRect(x, y + 15, 4, 2); c.fillRect(x + 1, y + 17, 2, 1) }
  }

  // ---------- overlay: text, bubbles, status marks (screen space, scaled with zoom) ----------
  const font = (px, w = '') => `${w ? w + ' ' : ''}${Math.round(px)}px ${MONO}`
  function fitText(t, max, f) {
    vc.font = f; t = String(t ?? '')
    if (vc.measureText(t).width <= max) return t
    while (t.length > 1 && vc.measureText(t + '…').width > max) t = t.slice(0, -1)
    return t + '…'
  }
  function overlay(now) {
    const k = cam.zoom, c = vc
    c.textBaseline = 'middle'
    for (const f of floors) {
      if (f.kind === 'roof' || squeezed(f)) continue
      const b = plaqueBox(f), [sx, sy] = toScreen(b.x, b.y), w = b.w * k, h = b.h * k
      if (!(sx > vw() || sx + w < 0 || sy > vh() || sy + h < 0) && h >= 7) plaqueText(f, sx, sy, w, h, k)
      if (f.kind === 'ceo') ceoText(now, k)
      if (f.kind === 'session') {
        const run = f.open == null && runOf(f)
        if (run) bannerText(f, run, k)
        const over = people.overflow.get(f.id)
        if (over) { const [ox, oy] = toScreen(IX + 462, f.y - 30); c.font = font(Math.max(9, 5 * k), 700); c.fillStyle = '#5a4a3c'; c.fillText(`+${over}`, ox, oy) }
      }
    }
    const pf = Math.min(11, 5.2 * k)
    if (pf >= 6) for (const p of city.plates()) {   // the PR numbers on the neighbours' floor plates
      const [x, y] = toScreen(p.x + p.w / 2, p.y + p.h / 2)
      if (x < -40 || x > vw() + 40 || y < -20 || y > vh() + 20) continue
      c.font = font(pf, 700); c.textAlign = 'center'; c.fillStyle = p.fire ? '#7a1a10' : p.draft ? '#4a4030' : '#3a2410'
      c.fillText(fitText(p.text, p.w * k - 2, font(pf, 700)), x, y + 0.5); c.textAlign = 'left'
      if (p.more) { c.font = font(pf * 0.9, 700); c.fillStyle = '#f4e6c0'; c.fillText(`+${p.more}`, x + p.w * k / 2 + 3, y - p.h * k) }
    }
    for (const l of city.labels()) {
      const [x, y] = toScreen(l.x, l.y), w = l.w * k
      if (x + w < 0 || x - w > vw() || w < 36) continue   // too small to read: the hover tip still names them
      const fs = Math.max(7, Math.min(5.4 * k, 8 * k)), f = font(fs, 700)
      c.font = f
      const bw = l.badge ? c.measureText(l.badge).width + fs * 0.6 : 0, name = fitText(l.text, w - 4 - bw, f), nw = c.measureText(name).width
      const x0 = x - (nw + bw) / 2
      c.fillStyle = '#2b1d12'; c.fillText(name, x0, y + 0.5)
      if (l.badge) { c.fillStyle = '#9a4a1a'; c.fillText(l.badge, x0 + nw + fs * 0.6, y + 0.5) }
    }
    // people: a bubble over each session, a status diamond over each subagent
    const bf = Math.max(k < fitZoom() ? 8 : 10, Math.min(16, 5.6 * k))   // a little smaller once zoomed out to the street
    for (const a of people.actors.values()) {
      if (a.delay > 0 || !a.data || a.fade != null) continue
      const y = people.yOf(a), [x, top] = toScreen(a.x, y - 31 + people.sitDy(a))
      if (x < -200 || x > vw() + 200 || top < -60 || top > vh() + 60) continue
      if (a.kind === 'session') bubble(x, top - 3, sessionBubble(a.data, now), api.COLORS[a.data.state] || api.COLORS.idle, bf)
      else {
        const st = a.leaving ? 'done' : a.data.state
        if (st === 'idle') { if (!a.brk) zzz(x, top, now, k); continue }
        const r = Math.max(3.5, 2.4 * k)
        c.fillStyle = 'rgba(0,0,0,.45)'; diamond(x, top - r + 1, r + 0.8)
        c.fillStyle = api.COLORS[st] || api.COLORS.idle; diamond(x, top - r, r)
        if (st === 'done') { c.font = font(Math.max(10, 4 * k)); c.fillStyle = api.COLORS.done; c.fillText('✓', x + r + 1, top - r) }
      }
    }
  }
  let noteCard = null
  function ceoText(now, k) {
    const c = vc, d = slots.desk, [px, py] = toScreen(slots.seat - 20, d.y + 7.5), pw = 40 * k
    noteCard = null
    if (pw > 34) { c.save(); c.beginPath(); c.rect(px, py - 3 * k, pw, 6 * k); c.clip(); c.font = font(Math.min(4.6 * k, 14), 700); c.fillStyle = '#3b2617'; c.textAlign = 'center'; c.fillText(`${api.owner.toUpperCase()} · CEO`, px + pw / 2, py + 0.5); c.restore() }
    const list = needsPaul(); if (!list.length) return
    // the desk note, readable: who needs the user, newest first
    const n = slots.note, [nx, ny] = toScreen(n.x + n.w / 2, n.y), fs = Math.max(10, Math.min(13, 4 * k))
    c.font = font(fs)
    const lines = list.slice(0, 4).map(s => '✋ ' + fitText(s.title, 190, font(fs))), more = list.length > 4 ? `+${list.length - 4} more` : null
    const w = Math.max(...lines.map(t => c.measureText(t).width)) + 16, h = (lines.length + (more ? 1 : 0)) * (fs + 4) + 22
    const x = Math.min(vw() - w - 4, nx - w / 2), y = ny - h - 8
    c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + 3, y + 3, w, h)
    c.fillStyle = '#fff4c0'; c.fillRect(x, y, w, h); c.fillStyle = '#d8383a'; c.fillRect(x, y, w, 3)
    c.fillStyle = '#7a1f22'; c.font = font(fs - 1, 700); c.fillText(list.length === 1 ? 'NEEDS YOU' : `${list.length} NEED YOU`, x + 8, y + 12)
    c.font = font(fs); c.fillStyle = '#2b1d12'
    lines.forEach((t, i) => c.fillText(t, x + 8, y + 22 + i * (fs + 4) + fs / 2))
    if (more) { c.fillStyle = '#6e5038'; c.fillText(more, x + 8, y + 22 + lines.length * (fs + 4) + fs / 2) }
    noteCard = { x, y, w, h }
  }
  // letter-spaced small caps: cream on bronze for a session (its branch lighter after a ·), dark on brass for the rest
  function plaqueText(f, sx, sy, w, h, k) {
    const c = vc, fs = Math.max(7, Math.min(13, h * 0.46)), ym = sy + h / 2 + 0.5, sp = Math.max(0.5, fs * 0.1)
    c.save(); c.beginPath(); c.rect(sx + 2 * k, sy + 2 * k, w - 4 * k, h - 4 * k); c.clip()
    c.letterSpacing = sp + 'px'
    if (f.kind === 'session') {
      const s = f.session, tx = sx + 8 * k
      let right = sx + w - 5 * k
      c.letterSpacing = '0px'
      for (const fn of hooks.plaque) { try { right -= fn(c, f, { x: sx, y: sy, w, h, fs, k, right }) || 0 } catch (e) { console.error('[tower:plaque]', e) } }
      c.letterSpacing = sp + 'px'
      const max = right - tx - 2, title = String(s?.title || '').toUpperCase(), br = s?.worktree || s?.branch || ''
      const name = fitText(title, max, font(fs, 700)); c.font = font(fs, 700)
      c.fillStyle = '#f1e4c4'; c.fillText(name, tx, ym)
      const nw = c.measureText(name).width
      if (br && name === title && max - nw > fs * 6) { c.font = font(fs * 0.92); c.fillStyle = '#b39b74'; c.fillText(fitText('· ' + br, max - nw - fs * 0.5, font(fs * 0.92)), tx + nw + fs * 0.5, ym) }
    } else {
      c.font = font(fs, 700); c.fillStyle = '#3a2814'; c.textAlign = 'center'
      c.fillText(fitText(f.label, w - 16 * k, font(fs, 700)), sx + w / 2, ym); c.textAlign = 'left'
    }
    c.restore(); c.letterSpacing = '0px'
  }
  function bannerText(f, run, k) {
    const [x0, y0] = toScreen(BANNER.x0 + 4, f.top + 6), [x1] = toScreen(BANNER.x1 - 4, 0), h = 9 * k, w = x1 - x0
    if (h < 7) return
    const c = vc, fs = Math.max(7, Math.min(h * 0.92, 11 * k / 1.5))
    c.save(); c.beginPath(); c.rect(x0, y0 - 1, w, h + 2); c.clip()
    const ym = y0 + h / 2 + 0.5
    const name = fitText(run.name, w * 0.45, font(fs, 700))
    c.fillStyle = '#2b1d12'; c.fillText(name, x0, ym)
    let x = x0 + c.measureText(name).width + fs
    c.font = font(fs * 0.92)
    for (const ph of run.phases) {
      const t = `${MARK[ph.state] || '○'} ${ph.title}${ph.total ? ` ${ph.done}/${ph.total}` : ''}`
      if (x + c.measureText(t).width > x0 + w) { c.fillStyle = INK.pending; c.fillText('…', x, ym); break }
      c.fillStyle = INK[ph.state] || INK.pending; c.fillText(t, x, ym); x += c.measureText(t).width + fs * 0.9
    }
    c.restore()
  }
  function sessionBubble(s, now) {
    if (s.state === 'tool') return api.toolLabel(s.tool)
    if (s.state === 'thinking') return 'thinking' + '.'.repeat(1 + Math.floor(now / 400) % 3)
    if (s.state === 'waiting') return '💬 your turn'
    if (s.state === 'delegating') return `👥 ${s.agents.filter(g => g.state !== 'done' && g.state !== 'idle').length} at work`
    if (s.state === 'attention') return `✋ ${s.attention?.label || 'needs you'}`
    if (s.state === 'building') {
      const j = s.background?.[0]; if (!j) return '⚙ building'
      const ms = Date.now() - j.since, m = Math.floor(ms / 60000), sec = Math.floor(ms / 1000) % 60
      return `⚙ ${j.label.slice(0, 22)} · ${m}m ${String(sec).padStart(2, '0')}s${s.background.length > 1 ? ` +${s.background.length - 1}` : ''}`
    }
    return 'z z z'
  }
  function bubble(ax, ay, text, color, fs) {
    const c = vc
    c.font = font(fs)
    const w = c.measureText(text).width + 16, h = fs + 9, x = ax - w / 2, y = ay - h - 5
    c.fillStyle = 'rgba(0,0,0,.35)'; c.beginPath(); c.roundRect(x + 2, y + 3, w, h, 6); c.fill()
    c.fillStyle = '#fbfaf4'; c.beginPath(); c.roundRect(x, y, w, h, 6); c.fill()
    c.beginPath(); c.moveTo(ax - 4, y + h - 1); c.lineTo(ax, y + h + 5); c.lineTo(ax + 4, y + h - 1); c.fill()
    c.fillStyle = color; c.fillRect(x, y + 4, 3, h - 8)
    c.fillStyle = '#1b1c26'; c.textBaseline = 'middle'; c.fillText(text, x + 9, y + h / 2 + 0.5)
  }
  function diamond(cx, cy, r) { const c = vc; c.beginPath(); c.moveTo(cx, cy - r); c.lineTo(cx + r, cy); c.lineTo(cx, cy + r); c.lineTo(cx - r, cy); c.fill() }
  function zzz(cx, top, now, k) {
    const t = (now / 1100) % 1
    vc.font = font(Math.max(9, 4 * k)); vc.fillStyle = `rgba(60,58,80,${1 - t})`
    vc.fillText('z', cx + k * 2 + t * 4 * k, top - t * 6 * k)
  }

  // ---------- hover and click ----------
  let mouse = null
  function thingAt(m) {
    if (!m) return null
    const w = toWorld(m.sx, m.sy)
    let hit = null
    for (const a of people.actors.values()) {
      if (a.delay > 0 || !a.data || a.fade != null) continue
      const y = people.yOf(a)
      if (w.x > a.x - 7 && w.x < a.x + 7 && w.y > y - 28 && w.y < y + 1) hit = a
    }
    if (hit) return { actor: hit }
    if (noteCard && m.sx >= noteCard.x && m.sx <= noteCard.x + noteCard.w && m.sy >= noteCard.y && m.sy <= noteCard.y + noteCard.h) return { ceo: 'note' }
    if (slots) {
      const inR = (r, pad = 2) => w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
      if (inR(slots.phone, 3)) return { ceo: 'phone' }
      if (inR(slots.note, 3)) return { ceo: 'note' }
      if (w.x > slots.seat - 8 && w.x < slots.seat + 8 && w.y > slots.floor.y - 48 && w.y < slots.desk.y) return { ceo: 'paul' }
    }
    for (const f of floors) if (f.kind === 'session' && !squeezed(f)) { const b = plaqueBox(f); if (w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h) return { sign: f } }
    const base = floors[0]
    if (base && w.y > base.y - 46 && w.y < base.y) {
      const jobs = [...(snap?.serverRoom?.running || []), ...(snap?.serverRoom?.failed || []).map(j => ({ ...j, failed: true }))]
      for (let k = 0; k < Math.min(RACKS, jobs.length); k++) if (w.x >= rackX(k) && w.x < rackX(k) + 22) return { job: jobs[k] }
    }
    const b = city.buildingAt(w.x, w.y)
    return b ? { building: b, pr: city.floorAt(b, w.y) } : null
  }
  const ago = ms => { const s = Math.round((Date.now() - ms) / 1000); return s < 60 ? s + 's ago' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago' }
  function personAt(m) {
    const w = toWorld(m.sx, m.sy)
    let hit = null
    for (const a of people.actors.values()) {
      if (a.delay > 0 || !a.data || a.fade != null) continue
      const y = people.yOf(a)
      if (w.x > a.x - 7 && w.x < a.x + 7 && w.y > y - 28 && w.y < y + 1) hit = a
    }
    return { w, person: hit && people.person(hit) }
  }
  const showTip = html => { if (!mouse) return; tip.innerHTML = html; tip.style.display = 'block'; tip.style.left = Math.min(mouse.cx + 14, innerWidth - 370) + 'px'; tip.style.top = (mouse.cy + 14) + 'px' }
  function hover() {
    city.hover = null
    if (mouse && !drag?.moved && hooks.hover.length) {
      const { w, person } = personAt(mouse), r = ask('hover', w, person, mouse)
      if (r) { cv.classList.add('pointer'); if (typeof r === 'string') showTip(r); else tip.style.display = 'none'; return }
    }
    const hit = drag?.moved ? null : thingAt(mouse)
    cv.classList.toggle('pointer', !!hit)
    if (!hit) { tip.style.display = 'none'; return }
    const esc = api.esc, sw = col => `<i class="s" style="background:${col}"></i>`
    let html
    if (hit.actor || hit.sign) {
      const a = hit.actor, d = a ? a.data : hit.sign.session
      if (!d) { tip.style.display = 'none'; return }
      const st = a?.leaving ? 'done' : d.state, doing = d.tool ? `${api.toolLabel(d.tool)}${d.detail ? ' — ' + d.detail : ''}` : st
      const where = a?.brk?.spot?.floor ? ` · on a break (${a.brk.spot.floor})` : a?.liftPhase ? ' · in the elevator' : ''
      html = !a || a.kind === 'session'
        ? `<div class="t">${esc(d.title)}</div><div class="m">${esc(d.worktree || d.branch || '')}</div><div>${sw(api.COLORS[st] || api.COLORS.idle)}${esc(doing)}</div><div class="m">${d.agents.length} subagent(s) · ${ago(d.lastActivity)}${where}</div><div class="m">${d.running ? '↗ click to open in Orca' : 'no longer running'}</div>`
        : `<div class="t">${esc(d.description || d.type)}</div><div class="m">${esc(d.type)}${d.workflow ? ' · ' + esc(d.workflow) : ''}${d.phase ? ' · ' + esc(d.phase) : ''}</div><div>${sw(api.COLORS[st] || api.COLORS.idle)}${esc(a.leaving ? 'done' : doing)}</div><div class="m">${ago(d.lastActivity)}${where}</div>`
    } else if (hit.ceo) {
      const list = needsPaul()
      html = `<div class="t">${esc(api.owner)} · CEO</div>${list.length ? list.slice(0, 6).map(s => `<div>${sw(api.COLORS.attention || '#ef5a5a')}${esc(s.title)} — ${esc(s.attention?.label || 'needs you')}</div>`).join('') + '<div class="m">↗ click the phone or the note to open the first in Orca</div>' : '<div class="m">nobody needs you right now — the phone is quiet</div>'}`
    } else if (hit.job) {
      const j = hit.job
      html = `<div class="t">${esc(j.label)}</div><div class="m">${esc(j.kind)} · ${esc(j.title || '')}</div><div>${sw(j.failed ? '#ef5a5a' : '#5fd17a')}${j.failed ? 'failed' : 'running since ' + ago(j.since)}</div>`
    } else {
      const b = hit.building, e = b.e, at = b.prs[hit.pr]
      city.hover = { b, j: hit.pr }
      const col = p => p.ci === 'failed' ? '#ef5a5a' : p.ci === 'running' ? '#f29a4e' : p.ci === 'passed' ? '#5fd17a' : '#8a8f9c'
      const prs = [...b.prs].reverse().slice(0, 8).map(p => `<div${p === at ? '' : ' class="m"'}>${sw(col(p))}${p === at ? '<b>' : ''}#${p.n} ${esc(String(p.title || '').slice(0, 48))}${p === at ? '</b>' : ''}${p.draft ? ' · draft' : ''}${p.ci === 'failed' ? ' · 🔥 CI failed' : p.ci ? ' · CI ' + esc(p.ci) : ''}</div>`).join('')
      const ct = e.contrib ? `${e.contrib.commits12w} commit(s) in 12 weeks${e.contrib.merged ? ` · ${e.contrib.merged} merged PR(s)` : ''}` : `activity ${Math.round(e.level * 100)}%`
      html = `<div class="t">${esc(e.login)}</div><div class="m">${e.prs.length} open PR(s), a floor each · ${ct}</div>${prs}<div class="m">↗ click ${at ? `for #${at.n}` : 'for their open PRs'}</div>`
    }
    showTip(html)
  }
  async function click(m) {
    if (hooks.click.length) { const { w, person } = personAt(m); if (ask('click', w, person, m)) return }
    const hit = thingAt(m); if (!hit) return
    const s = hit.sign?.session || (hit.actor?.kind === 'session' ? hit.actor.data : null)
    if (s) {
      if (!s.running) return api.toast(`${s.title} is no longer running`)
      try {
        const r = await fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
        const j = await r.json(); api.toast(r.ok ? `Opened ${s.title} in Orca` : j.error)
      } catch { api.toast('Agentopolis server is offline') }
      return
    }
    if (hit.ceo) return focusFirst()
    if (hit.actor) { const d = hit.actor.data; return api.toast(`${d.description || d.type} · ${d.state}${d.tool ? ' · ' + api.toolLabel(d.tool) : ''}`, 3500) }
    if (hit.job) return api.toast(`${hit.job.kind}: ${hit.job.label}`)
    if (hit.building) {
      const pr = hit.building.prs[hit.pr]
      if (pr?.url) return api.openLink(pr.url)
      const login = hit.building.e.login, repo = city.repo
      api.openLink(repo ? `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr is:open author:${login}`)}` : `https://github.com/${login}`)
    }
  }

  // ---------- input ----------
  let drag = null
  const pointers = new Map()
  const local = e => { const r = cv.getBoundingClientRect(); return { sx: e.clientX - r.left, sy: e.clientY - r.top, cx: e.clientX, cy: e.clientY } }
  cv.addEventListener('pointerdown', e => {
    cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, local(e))
    if (pointers.size === 2) { const [p, q] = [...pointers.values()]; drag = { pinch: Math.hypot(p.sx - q.sx, p.sy - q.sy), zoom: cam.zoom, moved: true }; return }
    drag = { ...local(e), cx0: cam.cx, cy0: cam.cy, moved: false }
  })
  cv.addEventListener('pointermove', e => {
    mouse = local(e)
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, mouse)
    if (!drag) return
    if (drag.pinch && pointers.size === 2) {
      const [p, q] = [...pointers.values()], d = Math.hypot(p.sx - q.sx, p.sy - q.sy)
      zoomAt(drag.zoom * d / drag.pinch, (p.sx + q.sx) / 2, (p.sy + q.sy) / 2); return
    }
    if (drag.pinch) return
    const dx = mouse.sx - drag.sx, dy = mouse.sy - drag.sy
    if (!drag.moved && Math.hypot(dx, dy) > 4) { drag.moved = true; cv.classList.add('dragging') }
    if (drag.moved) { flight = null; following = null; cam.cx = drag.cx0 - dx / cam.zoom; cam.cy = drag.cy0 - dy / cam.zoom; cam.auto = false; clampCam() }
  })
  const up = e => {
    pointers.delete(e.pointerId)
    const wasClick = drag && !drag.moved && !drag.pinch
    if (!pointers.size) { drag = null; cv.classList.remove('dragging') }
    if (wasClick) click(local(e))
  }
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up)
  cv.addEventListener('dblclick', e => { const m = local(e), { w, person } = personAt(m); ask('dblclick', w, person, m) })
  cv.addEventListener('pointerleave', () => { if (!drag) mouse = null })
  cv.addEventListener('wheel', e => {
    e.preventDefault()
    const m = local(e)
    flight = null
    zoomAt(cam.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), following ? vw() / 2 : m.sx, following ? vh() / 2 : m.sy)
  }, { passive: false })
  document.getElementById('zoomIn').addEventListener('click', () => active && zoomAt(cam.zoom * 1.25))
  document.getElementById('zoomOut').addEventListener('click', () => active && zoomAt(cam.zoom / 1.25))
  document.getElementById('zoomFit').addEventListener('click', () => active && fit())
  addEventListener('keydown', e => {
    if (!active || e.target.closest?.('input, textarea')) return
    if (e.key === '+' || e.key === '=') zoomAt(cam.zoom * 1.25)
    else if (e.key === '-') zoomAt(cam.zoom / 1.25)
    else if (e.key === '0') fit()
  })
  const worldToScreen = (x, y) => { const [sx, sy] = toScreen(x, y); return { x: sx, y: sy } }
  const tower = api.tower = {
    on(name, fn) { if (!hooks[name]) throw new Error('unknown tower hook ' + name); hooks[name].push(fn) },
    Z, MONO, get active() { return active }, get snapshot() { return snap },
    // geometry (world pixels)
    get floors() { return floors }, floor: id => byId.get(id) || null, floorOf: sid => byId.get(sid) || null,
    desk: sid => desks.get(sid) || null, plaque: f => (typeof f === 'string' ? byId.get(f) : f) ? plaqueBox(typeof f === 'string' ? byId.get(f) : f) : null, get spots() { return people.spots },
    get slots() { return slots }, get ceo() { return slots },
    get lobby() { return geo?.lobby }, get cafe() { return geo?.cafe }, get meeting() { return geo?.meeting }, get roof() { return geo?.roof }, get facade() { return geo?.facade },
    get street() { return { sidewalk: { y0: 0, y1: 4 }, road: { y0: 4, y1: 14, lane: 9 }, curb: { y0: 14, y1: GROUND }, ground: GROUND, door: DOOR.x, outside: OUTSIDE, buildings: city.buildings, extent: city.extent() } },
    get interior() { return { x0: IX, x1: IX1 } }, get bounds() { return floors.length ? bounds(floors) : null },
    // people
    get people() { const out = []; for (const a of people.actors.values()) if (a.kind !== 'npc' && a.data && a.fade == null && !(a.delay > 0)) out.push(people.person(a)); return out },
    person: id => { const a = people.find(id); return a ? people.person(a) : null },
    sendTo: (id, floor, x, opts) => people.sendTo(id, floor, x, opts), release: id => people.release(id), spawn: o => people.spawn(o),
    get car() { const c = people.car; return { y: c.y, at: c.at, state: c.state, x: CAR_X } },
    // camera
    flyTo, follow, get following() { return following && people.actors.get(following)?.id || null }, fit,
    get zoom() { return cam.zoom }, fitZoom, cam, worldToScreen, screenToWorld: (sx, sy) => toWorld(sx, sy),
    get canvas() { return cv }, get world() { return off },
    // overlay helpers (screen space)
    font, fitText, bubble: (x, y, text, color, fs = Math.max(10, Math.min(16, 5.6 * cam.zoom))) => bubble(x, y, text, color, fs), tip: showTip,
    focusSession: async s => {
      if (!s?.running) return api.toast(`${s?.title || 'That session'} is no longer running`)
      try { const r = await fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id }) }); const j = await r.json(); api.toast(r.ok ? `Opened ${s.title} in Orca` : j.error) } catch { api.toast('Agentopolis server is offline') }
    },
    // floors coming and going: setOpen(floorId, 0..1 | null) squeezes a floor, hide(sessionId, on) drops it from the
    // plan, vacate(sessionId, on) takes its people out of the crowd (those a feature steers keep walking until released)
    setOpen(id, k) { if (k == null || k >= 1) open.delete(id); else open.set(id, Math.max(0, k)); if (byId.has(id)) reflow() },
    hide(id, on = true) { if (on) hidden.add(id); else hidden.delete(id); plan() },
    vacate(id, on = true) { if (on) vacated.add(id); else vacated.delete(id) },
    city, crowd: people,
  }
  for (const [name, fn] of FEATURES) { try { await fn(api, tower) } catch (e) { console.error(`tower feature ${name} failed to start`, e) } }

  try { localStorage.removeItem('agent-office:mode') } catch {}   // the old office/tower switch
  active = true; size(); fit(); requestAnimationFrame(frame)
  run('mode', true)
  // ?towerzoom=<z>&towerat=<floor index>: a close-up for checking detail
  const tz = params.get('towerzoom') === 'min' ? -1 : Number(params.get('towerzoom'))
  if (tz === -1) { const t = setInterval(() => { if (!floors.length || !city.buildings.length) return; clearInterval(t); cam.zoom = 0; cam.auto = false; clampCam() }, 100) }
  else if (tz) { const t = setInterval(() => { if (!floors.length) return; clearInterval(t); const f = floors[Number(params.get('towerat') ?? 2)] || floors[2]; cam.zoom = Math.min(MAX_ZOOM, tz); cam.auto = false; cam.cx = Number(params.get('towerx') ?? 250); cam.cy = f.y - 30 }, 100) }
}
