// People in the tower: a session at its desk, its subagents along the floor, breaks on the shared floors,
// arrivals through the lobby door and leavers back out of it. Floors are changed by the glass elevator, and by the express
// car in the shaft beside it while features/express-elevator.js has it open (xcar.active): calls go to the nearest car.
// Tower features steer people (sendTo / release), add their own walkers (spawn, kind 'npc') and can hold a finished
// subagent for a detour before it walks out (the 'leaving' hook, asked through `ask`). See tower.js for the API.
import { SEAT, SEAT_H, MAX_DESKS, DOOR, DOOR_X, BW, SHAFT1, CAR_X, CAR_W, CAR_H, XCAR_X, XCAR_W, OUTSIDE, spotsFor, partnerOf } from './building.js'

const SPEED = 56, CAR_SPEED = 150, XCAR_SPEED = 190, CAP = 6, DWELL = 0.9, XDWELL = 0.45, HURRY = 1.5, STUCK = 12
const RESTING = new Set(['waiting', 'idle', 'delegating', 'building'])
const LONG_WAIT = new Set(['delegating', 'building'])
const READING = /^(Read|Grep|Glob|WebFetch|WebSearch|ToolSearch)$|^mcp__|claude-in-chrome/
const asking = s => s.tool === 'AskUserQuestion' || (s.state === 'waiting' && !!s.ext?.meeting?.asking)

export function createPeople(api, demo, ask = () => false) {
  const actors = new Map()
  const slots = new Map()                // session id -> Map(agent id -> desk index)
  const overflow = new Map()             // session id -> agents without a desk
  const since = new Map()                // session id -> ms resting since
  const claimed = new Map()              // spot id -> actor key
  const departed = new Set()
  let floors = [], byId = new Map(), spots = [], firstSync = true, arrivals = 0
  const queue = new Map()                // floor id -> people waiting there for whichever car comes
  const mkCar = (x, w, speed, express) => ({ x, w, speed, express, dwell: express ? XDWELL : DWELL, active: !express, lit: express ? 0 : 1, y: 0, at: 'lobby', state: 'idle', dir: 0, t: 0, doors: 0, riders: [], moving: 0, queue })
  const car = mkCar(CAR_X, CAR_W, CAR_SPEED, false), xcar = mkCar(XCAR_X, XCAR_W, XCAR_SPEED, true), cars = [car, xcar]

  const fy = id => byId.get(id)?.y
  const home = a => ({ floor: a.session, x: a.kind === 'session' ? SEAT.session : SEAT.agent(a.slot), then: () => sit(a) })
  const sit = a => { a.pose = 'desk'; a.face = 'right'; a.anim = null; a.activity = null }

  function setFloors(list) {
    floors = list; byId = new Map(list.map(f => [f.id, f]))
    spots = list.flatMap(spotsFor)
    for (const [id, q] of queue) if (!byId.has(id)) { for (const a of q) { a.leg = null; a.liftPhase = null } queue.delete(id) }
    for (const k of cars) {
      for (const a of k.riders) if (a.liftPhase === 'riding') a.floor = null
      // its floor is gone: whoever steps in or out there fades with it, and the car takes its riders to the nearest
      // floor (stops()) instead of jumping anywhere with them aboard
      if (!byId.has(k.at)) {
        for (const a of actors.values()) if (a.car === k && a.liftPhase !== 'riding') detach(a)
        if (k.state === 'open') k.state = 'closing'
      } else if (k.state !== 'moving') k.y = fy(k.at)
      k.cableTop = list[list.length - 1].y - 4
    }
  }
  const nearest = y => floors.reduce((b, f) => !b || Math.abs(f.y - y) < Math.abs(b.y - y) ? f : b, null)?.id

  // ---------- routes ----------
  // A route is a list of legs: { walk: x } on the current floor, { lift: floorId }, { then: fn }.
  function go(a, goal) {
    if (a.liftPhase === 'queued' || a.liftPhase === 'boarding') detach(a)
    const keep = a.liftPhase === 'riding' || a.liftPhase === 'exiting' ? [a.leg] : []
    const from = a.liftPhase === 'riding' ? null : a.floor
    if (a.liftPhase === 'riding') a.leg.lift = goal.floor
    a.route = [...(from && from !== goal.floor ? [{ lift: goal.floor }] : []), ...(a.liftPhase === 'exiting' && a.floor !== goal.floor ? [{ lift: goal.floor }] : []),
      { walk: goal.x }, { then: goal.then }]
    if (keep.length) a.route.unshift(keep[0]); else a.leg = null
    a.pose = null; a.anim = null; a.activity = null
  }
  function unqueue(a) { const q = queue.get(a.floor); if (q) { const i = q.indexOf(a); if (i >= 0) q.splice(i, 1) } a.liftPhase = null }
  // a.car is the car someone is boarding, riding or stepping out of. Nothing counts them: a car waits while anyone still
  // walks in or out of it (inOut), so a person who fades, is removed or loses their floor mid-step never holds its doors.
  function detach(a) {
    if (a.liftPhase === 'queued') unqueue(a)
    const k = a.car
    if (k) { const i = k.riders.indexOf(a); if (i >= 0) k.riders.splice(i, 1) }
    a.car = null; a.liftPhase = null; a.held = 0
  }
  function stepOut(a) {
    const leg = a.leg
    a.liftPhase = null; a.leg = null; a.car = null; a.held = 0
    if (leg && a.floor !== leg.lift && byId.has(leg.lift)) a.route.unshift({ lift: leg.lift })
  }
  // an express rider crossing the main shaft waits (2 s at most) while the main car passes the landing, rather than
  // walk through it
  const holdFor = (a, dt) => car.state === 'moving' && Math.abs(car.y - fy(a.floor)) < CAR_H && (a.held = (a.held || 0) + dt) < 2
  // a.sx / a.tx: where the current walk started and where it ends (render.js draws a walker passing front furniture in front of it)
  const walkTo = (a, x, dt) => {
    // express riders hurry in and out of their car, so its stops stay short
    const d = x - a.x, mv = SPEED * dt * (a.kind === 'session' ? 1.05 : 1) * (a.car?.express && a.liftPhase !== 'riding' ? HURRY : 1)
    a.tx = x
    if (Math.abs(d) <= mv) { a.x = x; return true }
    if (!a.wasWalking) a.sx = a.x
    a.x += Math.sign(d) * mv; a.dir = d > 0 ? 'right' : 'left'; a.walking = true
    return false
  }

  function stepActor(a, dt) {
    a.wasWalking = a.walking; a.walking = false
    if (a.delay > 0) { a.delay -= dt; return }
    for (let guard = 0; guard < 4; guard++) {
      const leg = a.leg || (a.leg = a.route?.shift())
      if (!leg) return
      if (leg.walk != null) { if (!walkTo(a, leg.walk, dt)) return; a.leg = null; continue }
      if (leg.then) { a.leg = null; try { leg.then() } catch (e) { console.error('[tower:then]', e) } continue }
      if (leg.lift != null) {
        if (!a.liftPhase) {
          if (a.floor === leg.lift || !byId.has(leg.lift)) { a.leg = null; continue }
          const q = queue.get(a.floor) || []; q.push(a); queue.set(a.floor, q); a.liftPhase = 'queued'; a.queuedAt = performance.now()
        }
        if (a.liftPhase === 'queued') {
          const q = queue.get(a.floor) || [], i = q.indexOf(a)
          if (walkTo(a, DOOR_X - 10 - Math.max(0, i) * 8, dt)) { a.face = 'right'; a.dir = 'right' }
          return
        }
        if (a.liftPhase === 'boarding') {
          const k = a.car, n = k.express ? 3 : 4
          if (k.express && a.x < BW && holdFor(a, dt)) { a.face = 'right'; return }
          if (walkTo(a, k.x - 9 + (k.express ? 1 : 0) + (a.carSlot % n) * 6, dt)) { a.liftPhase = 'riding'; a.held = 0; a.face = a.carSlot % 2 ? 'left' : 'down' }
          return
        }
        if (a.liftPhase === 'riding') return
        if (a.liftPhase === 'exiting') {
          if (a.car?.express && a.x > BW + SHAFT1 - 2 && holdFor(a, dt)) { a.face = 'left'; return }
          if (!walkTo(a, DOOR_X - 14 - (a.carSlot % 3) * 4, dt)) return
          stepOut(a)
          continue
        }
      }
      return
    }
  }

  // ---------- the elevators ----------
  // Collective control per car: keep going the way it is heading while anyone wants a floor that way. A floor's call
  // goes to the nearest car that has room (the express only while it is active); riders keep the car they boarded.
  let calls = new Map()
  function dispatch() {
    calls = new Map()
    const load = new Map(cars.map(k => [k, k.riders.length]))
    for (const [id, q] of queue) {
      if (!q.length || !byId.has(id)) continue
      const y = fy(id)
      let best = car, bc = Infinity
      for (const k of cars) {
        if (!k.active || k.riders.length >= CAP) continue
        // distance, a detour if it is heading the other way, and a little for every rider and call it already has
        const away = k.state === 'moving' && Math.abs(y - k.y) > 1 && Math.sign(y - k.y) !== k.dir
        const c = Math.abs(y - k.y) + (away ? 160 : 0) + load.get(k) * 30 + (k.express ? 4 : 0)
        if (c < bc) { bc = c; best = k }
      }
      calls.set(id, best); load.set(best, load.get(best) + q.length)
    }
  }
  function stops(k) {
    const s = new Set()
    // a rider whose floor is gone gets off at the nearest one; so does a car whose own floor is gone
    for (const a of k.riders) if (a.liftPhase === 'riding') s.add(byId.has(a.leg?.lift) ? a.leg.lift : nearest(k.y))
    for (const [id, c] of calls) if (c === k) s.add(id)
    if (!byId.has(k.at)) s.add(nearest(k.y))
    if (!k.active && !s.size && byId.has('lobby')) s.add('lobby')        // a closed express car parks in the lobby
    return s
  }
  function nextStop(k) {
    // k.at is the floor last served; a stop the car is about to reach still counts as ahead (it slows to < 1 px a frame)
    const s = [...stops(k)].filter(id => id !== k.at)
    if (!s.length) return null
    const pos = k.y, ahead = id => k.dir < 0 ? fy(id) < pos + 0.5 : fy(id) > pos - 0.5
    let cands = k.dir ? s.filter(ahead) : []
    if (!cands.length) cands = s
    cands.sort((p, q) => Math.abs(fy(p) - pos) - Math.abs(fy(q) - pos))
    return cands[0]
  }
  // who gets out here: riders for this floor (also one redirected to it while the doors close), or whose floor is gone
  const wantsOut = (a, k) => a.liftPhase === 'riding' && a.fade == null && (a.leg?.lift === k.at || !byId.has(a.leg?.lift))
  // who gets on: only people already at the landing, so the car never holds its doors for someone across the floor
  // or out on the street; the rest stay queued and the car comes back for them
  const atLanding = a => a.fade == null && !(a.delay > 0) && a.x > DOOR_X - 16 - 8 * CAP
  // The express is quick: a short dwell (XDWELL), it boards only until that is over, never reopens for boarders once
  // someone is aboard (the next car takes them), and waits for its leavers only until they clear its doorway.
  const boards = k => k.active && (!k.express || !k.riders.length)
  const shouldOpen = k => byId.has(k.at) && (k.riders.some(a => wantsOut(a, k)) || (boards(k) && k.riders.length < CAP && !!queue.get(k.at)?.some(atLanding)))
  const inDoorway = (a, k) => !k.express || a.liftPhase === 'boarding' || a.x > k.x - k.w / 2 - 4
  function inOut(k) {
    let n = 0
    for (const a of actors.values()) if (a.car === k && a.fade == null && (a.liftPhase === 'boarding' || a.liftPhase === 'exiting') && inDoorway(a, k)) n++
    return n
  }
  function depart(car) {
    const next = nextStop(car)
    if (next) { car.target = next; car.dir = Math.sign(fy(next) - car.y); car.state = 'moving' } else car.state = 'idle'
  }
  function stepCar(car, dt) {
    if (car.state === 'moving') {
      // rethink the target every frame, so a call from a floor on the way stops the car there
      const target = nextStop(car) ?? (byId.has(car.target) ? car.target : nearest(car.y))
      car.target = target
      const ty = fy(target); if (ty == null) { car.state = 'idle'; return }
      const d = ty - car.y, v = Math.min(car.speed, 30 + Math.abs(d) * 3) * dt
      car.dir = Math.sign(d) || car.dir
      if (Math.abs(d) <= v) { car.y = ty; car.at = target; car.state = 'open'; car.t = 0 }
      else car.y += Math.sign(d) * v
      return
    }
    if (car.state === 'open') {
      car.t += dt; car.doors = Math.min(1, car.doors + dt * 4)
      if (car.doors < 1) return
      // out first, then in
      for (const a of [...car.riders]) if (wantsOut(a, car)) {
        car.riders.splice(car.riders.indexOf(a), 1); a.floor = car.at; a.y = undefined; a.liftPhase = 'exiting'; a.liftAt = clock
      }
      const q = queue.get(car.at) || []
      for (let i = 0; car.active && (!car.express || car.t < car.dwell) && i < q.length && car.riders.length < CAP;) {
        const a = q[i]
        if (!atLanding(a)) { i++; continue }
        q.splice(i, 1)
        a.liftPhase = 'boarding'; a.car = car; a.carSlot = car.riders.length + Math.floor(Math.random() * 3); car.riders.push(a); a.ridingFrom = car.at; a.liftAt = clock
      }
      car.moving = inOut(car)
      // a backstop: nobody takes STUCK s to step in or out; send them back to the queue, or on their way
      if (car.moving) for (const a of actors.values()) if (a.car === car && inDoorway(a, car) && clock - a.liftAt > STUCK) {
        if (a.liftPhase === 'boarding') { console.warn('[tower:lift] boarder stuck', a.key); detach(a); car.moving-- }
        else if (a.liftPhase === 'exiting') { console.warn('[tower:lift] exiter stuck', a.key); stepOut(a); car.moving-- }
      }
      if (car.t > car.dwell && !car.moving) {
        for (const a of car.riders) if (a.liftPhase === 'riding') a.floor = null
        car.state = 'closing'
      }
      return
    }
    if (car.state === 'closing') {
      car.doors = Math.max(0, car.doors - dt * 4)
      if (car.doors > 0) return
      // reopen only for someone who can still get on (or off); a full car leaves them waiting and comes back for them
      if (shouldOpen(car)) { car.state = 'open'; car.t = 0; return }
      depart(car)
      return
    }
    // idle: open for someone waiting here, or set off toward the nearest call
    if (shouldOpen(car)) { car.state = 'open'; car.t = 0; return }
    depart(car)
  }

  // ---------- breaks ----------
  const resting = (a, now) => {
    if (demo) return a.kind === 'agent' ? (api.hash(a.id) + Math.floor(now / 40000)) % 3 !== 0 : true
    if (a.kind === 'agent') return a.data?.state === 'idle'
    if (asking(a.data)) return false
    return RESTING.has(a.data.state) && now - (since.get(a.id) ?? now) >= (LONG_WAIT.has(a.data.state) ? 30_000 : 20_000)
  }
  const roofOpen = () => { const k = api.daylight?.weatherKind?.(); return !/rain|storm|snow|drizzle/.test(k || '') }
  function pick(a, except) {
    const free = spots.filter(s => !claimed.has(s.id) && s.id !== except && (s.floor !== 'roof' || roofOpen()))
    if (!free.length) return null
    const w = s => {
      let n = 1
      const p = partnerOf(s.id); if (p && claimed.has(p)) n += 6
      if (except && s.floor === except.split(':')[0]) n += demo ? 0 : 3        // hop to a spot on the same floor, mostly
      if (a.kind === 'session' && /coffee|table|deck|tv/.test(s.id)) n += 2
      return n
    }
    const seed = (api.hash(a.key) + Math.floor(performance.now() / 997)) % 1000 / 1000
    let r = seed * free.reduce((n, s) => n + w(s), 0)
    for (const s of free) { r -= w(s); if (r <= 0) return s }
    return free[free.length - 1]
  }
  function goBreak(a, spot) {
    claimed.set(spot.id, a.key)
    a.brk = { spot, phase: 'going', at: 0, dwell: 0 }
    go(a, { floor: spot.floor, x: spot.x, then: () => {
      const b = a.brk; if (!b) return
      b.phase = 'there'; b.at = performance.now(); b.dwell = (demo ? 7 : a.kind === 'session' ? 25 : 15) * 1000 + (api.hash(a.key + spot.id) % (demo ? 8 : 20)) * 1000
      a.pose = 'spot'; a.face = spot.face; a.anim = spot.anim; a.activity = spot.activity; a.sitting = spot.pose === 'sit'; a.seatH = spot.seatH
    } })
  }
  function endBreak(a) {
    const b = a.brk; if (!b) return
    if (claimed.get(b.spot.id) === a.key) claimed.delete(b.spot.id)
    a.brk = null; a.sitting = false
  }
  function planBreaks(perf) {
    const now = Date.now()
    for (const a of actors.values()) {
      if (!a.data || a.leaving || a.steered || a.delay > 0 || !byId.has(a.session)) continue
      const rest = resting(a, now), b = a.brk
      if (!b) {
        if (rest && a.pose === 'desk') { const s = pick(a); if (s) goBreak(a, s) }
        continue
      }
      if (!rest && !b.returning) { endBreak(a); a.brk = { returning: true, spot: { id: '' } }; go(a, { ...home(a), then: () => { a.brk = null; sit(a) } }); continue }
      if (b.phase === 'there' && perf - b.at > b.dwell) {
        const next = pick(a, b.spot.id); if (!next) { b.at = perf; continue }
        endBreak(a); a.sitting = false; goBreak(a, next)
      }
      // a lone player at a two-player table waits for a partner
      if (b.phase === 'there' && /foos|pool/.test(b.spot.id)) { const p = partnerOf(b.spot.id), o = p && actors.get(claimed.get(p)); a.anim = o?.brk?.phase === 'there' ? 'type' : null }
    }
  }

  // ---------- sync ----------
  function sync(sessions) {
    const now = Date.now()
    for (const s of sessions) {
      if (!RESTING.has(s.state)) since.delete(s.id)
      else if (!since.has(s.id)) since.set(s.id, Math.min(now, s.lastActivity || now))
    }
    const live = new Set(sessions.map(s => s.id))
    for (const id of [...since.keys()]) if (!live.has(id)) since.delete(id)
    const seen = new Set()
    for (const s of sessions) {
      const key = 's:' + s.id; seen.add(key)
      let a = actors.get(key)
      if (!a) {
        a = { key, kind: 'session', id: s.id, session: s.id, look: api.lookOf(s.id), floor: s.id, x: SEAT.session, route: [], dir: 'right' }
        sit(a); actors.set(key, a)
      }
      a.data = s
      const used = slots.get(s.id) || new Map(); slots.set(s.id, used)
      const ids = new Set(s.agents.map(g => g.id))
      for (const [aid] of used) if (!ids.has(aid) && !actors.get('a:' + aid)?.leaving) used.delete(aid)
      let over = 0
      for (const g of s.agents) {
        const akey = 'a:' + g.id
        let b = actors.get(akey)
        if (b?.leaving || (!b && departed.has(g.id))) { if (b) { seen.add(akey); b.data = g } continue }
        if (!used.has(g.id)) {
          if (g.state === 'done' && (firstSync || !b)) continue
          const taken = new Set(used.values()); let free = -1
          for (let k = 0; k < MAX_DESKS; k++) if (!taken.has(k)) { free = k; break }
          if (free === -1) { over++; continue }
          used.set(g.id, free)
        }
        seen.add(akey)
        const slot = used.get(g.id)
        if (!b) {
          b = { key: akey, kind: 'agent', id: g.id, session: s.id, look: api.lookOf(g.id), slot, route: [], dir: 'right' }
          if (firstSync) { b.floor = s.id; b.x = SEAT.agent(slot); sit(b) }
          else { b.floor = 'lobby'; b.x = OUTSIDE; b.delay = 0.6 * arrivals++; go(b, home(b)) }
          actors.set(akey, b)
        }
        b.data = g
        if (g.state === 'done' && !b.leaving) leave(b)
      }
      overflow.set(s.id, over)
    }
    for (const [k, a] of actors) if (!seen.has(k) && !a.leaving && a.kind !== 'npc') {
      if (a.kind === 'agent' && byId.has(a.session) && live.has(a.session)) leave(a)
      else if (a.steered && a.exit) a.leaving = true          // a feature walks them out (sendTo exit); release() lets them go
      else { a.leaving = true; a.fade = 1; endBreak(a) }
    }
    for (const id of [...slots.keys()]) if (!live.has(id)) { slots.delete(id); overflow.delete(id) }
    firstSync = false; arrivals = 0
  }
  function leave(a) {
    endBreak(a); a.leaving = true; departed.add(a.id)
    slots.get(a.session)?.delete(a.id)
    const out = () => { a.steered = false; a.sitting = false; if (a.fade == null) go(a, { floor: 'lobby', x: OUTSIDE, then: () => { a.fade = 1 } }) }
    // a feature may hold them for a detour (a hand-off) and call done() when it is over; a minute at most
    let over = false, timer = null
    const done = () => { if (over) return; over = true; clearTimeout(timer); out() }
    if (ask('leaving', person(a), done) && !over) { a.steered = true; timer = setTimeout(done, 60_000) } else if (!over) { over = true; out() }
  }

  // ---------- steering, for tower features ----------
  const find = id => actors.get(id) || actors.get('s:' + id) || actors.get('a:' + id) || actors.get('n:' + id)
  function arrive(a, o) { a.pose = 'spot'; a.face = o.face || a.dir; a.anim = o.anim || null; a.activity = o.activity || null; a.sitting = o.pose === 'sit'; a.seatH = o.seatH }
  function sendTo(id, floor, x, o = {}) {
    const a = find(id)
    if (!a || a.fade != null || !byId.has(floor) || (a.leaving && !a.steered && a.kind !== 'npc')) return false
    if (a.kind !== 'npc') { endBreak(a); a.brk = null; a.steered = true; a.exit = !!o.exit }
    a.sitting = false; a.delay = 0
    go(a, { floor, x, then: () => { arrive(a, o); o.then?.(person(a)) } })
    return true
  }
  function release(id) {
    const a = find(id); if (!a || !a.steered || a.kind === 'npc') return
    a.steered = false; a.sitting = false
    if (a.leaving) go(a, { floor: 'lobby', x: OUTSIDE, then: () => { a.fade = 1 } })
    else go(a, home(a))
  }
  let npcs = 0
  function spawn(o = {}) {
    const key = 'n:' + (o.id || `npc${++npcs}`)
    const at = o.from === 'street' ? { floor: 'lobby', x: OUTSIDE - 30 } : o.from === 'door' ? { floor: 'lobby', x: DOOR.x + 14 } : { floor: o.floor || 'lobby', x: o.x ?? OUTSIDE }
    const a = { key, id: key.slice(2), kind: 'npc', look: o.look || (o.draw ? null : api.lookOf(key)), draw: o.draw || null, z: o.z, owner: o.owner, ...at, route: [], dir: o.face === 'left' ? 'left' : 'right', pose: 'spot', face: o.face || 'right' }
    actors.set(key, a)
    return {
      key, id: a.id, actor: a,
      get x() { return a.x }, get y() { return yOf(a) }, get floor() { return a.liftPhase === 'riding' ? null : a.floor }, get walking() { return a.walking }, get dir() { return a.dir },
      get gone() { return !actors.has(key) },
      go: (floor, x, opts = {}) => sendTo(key, floor, x, opts),
      pose: (opts = {}) => arrive(a, opts),
      leave: then => { a.leaving = true; go(a, { floor: 'lobby', x: OUTSIDE - 30, then: () => { a.fade = 1; then?.() } }) },
      remove: () => { a.fade = a.fade ?? 1 },
    }
  }
  function person(a) {
    return {
      id: a.id, key: a.key, kind: a.kind, session: a.session, x: a.x, y: yOf(a), floor: a.liftPhase === 'riding' ? null : a.floor,
      seated: a.pose === 'desk' || !!a.sitting, atDesk: a.pose === 'desk', walking: !!a.walking, dir: a.dir, face: a.face,
      state: a.leaving && a.kind === 'agent' ? 'done' : a.data?.state, activity: a.activity, leaving: !!a.leaving, steered: !!a.steered,
      onBreak: !!a.brk, riding: a.liftPhase === 'riding', look: a.look, data: a.data, slot: a.slot,
    }
  }

  // ---------- frame ----------
  let planAt = 0, clock = 0
  function step(dt, perf) {
    clock += dt
    if (perf - planAt > 400) { planAt = perf; planBreaks(perf) }
    dispatch(); for (const k of cars) stepCar(k, dt)
    for (const [k, a] of actors) {
      if (a.fade != null) {
        // someone fading (session over, removed, floor gone) lets go of the lift at once, wherever they were in it
        if (a.liftPhase || a.car) detach(a)
        a.fade -= dt * 1.6; if (a.fade <= 0) { endBreak(a); actors.delete(k) }
        continue
      }
      // an actor whose floor vanished (its session ended) just fades
      if (a.floor && !byId.has(a.floor)) { a.fade = 1; continue }
      stepActor(a, dt)
      if (a.leaving && !a.steered && a.floor === 'lobby' && a.x < OUTSIDE + 30 && !a.route.length && !a.leg) a.fade = a.fade ?? 1
    }
  }
  const yOf = a => a.liftPhase === 'riding' ? a.car.y : fy(a.floor) ?? a.lastY ?? 0

  // ---------- drawing ----------
  // A sitter's hips sit on the seat's cushion: HIP is the sprite row their hips end on, per sheet row (down, up, side).
  const HIP = [25, 25, 28]
  const rowOf = a => a.pose === 'desk' ? 2 : { down: 0, up: 1 }[a.face || a.dir] ?? 2
  const sitDy = (a, row = rowOf(a)) => a.walking || a.liftPhase === 'riding' || !(a.pose === 'desk' || a.sitting) ? 0 : 30 - (a.pose === 'desk' ? SEAT_H.chair : a.seatH ?? SEAT_H.chair) - HIP[row]
  function drawActor(c, a, now) {
    const y = yOf(a); a.lastY = y
    if (a.draw) { c.save(); if (a.fade != null) c.globalAlpha = Math.max(0, a.fade); a.draw(c, person(a), now); c.restore(); return }
    const sheet = api.charSheet(a.look.palette, a.look.hue)
    let row = 2, frame = 1, flip = false
    if (a.walking) { row = 2; flip = a.dir === 'left'; frame = [0, 1, 2, 1][Math.floor(now / 130) % 4] }
    else if (a.pose === 'desk') {
      const st = a.data?.state, busy = st === 'tool' || st === 'thinking' || st === 'delegating' || st === 'building'
      const reading = READING.test(a.data?.tool || '') || st === 'thinking' || st === 'delegating' || st === 'building'
      frame = !busy ? 3 : reading ? 5 + Math.floor(now / 420) % 2 : 3 + Math.floor(now / 170) % 2
    } else {
      const f = a.face || a.dir || 'right'
      row = f === 'down' ? 0 : f === 'up' ? 1 : 2; flip = f === 'left'
      frame = a.anim === 'type' ? 3 + Math.floor(now / 170) % 2 : a.anim === 'read' ? 5 + Math.floor(now / 420) % 2 : a.sitting ? 3 : 1
      if (a.liftPhase === 'riding') { row = a.face === 'left' ? 2 : 0; flip = a.face === 'left'; frame = 1 }
    }
    const dx = Math.round(a.x - 8), dy = Math.round(y - 30 + sitDy(a, row))
    c.save()
    if (a.fade != null) c.globalAlpha = Math.max(0, a.fade)
    if (flip) { c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(sheet, frame * 16, row * 32, 16, 32, 0, 0, 16, 32) }
    else { c.translate(dx, dy); c.drawImage(sheet, frame * 16, row * 32, 16, 32, 0, 0, 16, 32) }
    // features dress people (uniforms, wardrobe): api.wear = [fn(c, person, { row, frame, now })], c in sprite pixels
    if (api.wear?.length && a.data) { const p = person(a); for (const w of api.wear) { try { w(c, p, { row, frame, now }) } catch (e) { console.error('[wear]', e) } } }
    c.restore()
  }
  function drawCar(c, front, only) { for (const k of cars) if (!only || k === only) drawOne(c, k, front) }
  // an express rider stepping across the main shaft walks along its landing, in front of the main car (render.js draws
  // them between the two cars' glass), never through it
  const crossing = a => !!a.car?.express && (a.liftPhase === 'boarding' || a.liftPhase === 'exiting') && Math.abs(a.x - car.x) < car.w / 2 + 8
  function drawOne(c, car, front) {
    const W = car.w, x = car.x - W / 2, y = car.y, lit = car.lit
    if (!front) {
      c.fillStyle = `rgba(30,40,55,${0.35 + 0.15 * (1 - lit)})`; c.fillRect(x, y - CAR_H, W, CAR_H)
      c.fillStyle = '#4a4f5a'; c.fillRect(car.x - 1, car.cableTop, 2, y - CAR_H - car.cableTop)          // the cable
      return
    }
    c.fillStyle = `rgba(170,215,240,${0.1 + 0.12 * lit})`; c.fillRect(x, y - CAR_H, W, CAR_H)
    c.fillStyle = `rgba(255,255,255,${0.1 + 0.15 * lit})`; c.fillRect(x + 4, y - CAR_H + 4, 2, CAR_H - 12)
    c.fillStyle = car.express ? '#8e9aac' : '#9aa6b6'; c.fillRect(x - 1, y - CAR_H - 3, W + 2, 4); c.fillRect(x - 1, y - 2, W + 2, 3)
    c.fillRect(x - 1, y - CAR_H, 2, CAR_H); c.fillRect(x + W - 1, y - CAR_H, 2, CAR_H)
    if (car.express && lit > 0) { c.fillStyle = `rgba(255,236,170,${0.8 * lit})`; c.fillRect(x + 3, y - CAR_H, W - 6, 1) }
    // doors: the left side slides open toward the floor
    const open = car.doors
    c.fillStyle = '#c3ccd8'; c.fillRect(x - 1, y - CAR_H, 2, Math.round((CAR_H - 2) * (1 - open)))
    c.fillStyle = car.state === 'moving' ? (car.dir < 0 ? '#5fd17a' : '#f4c64f') : '#7a8494'; c.fillRect(car.x - 2, y - CAR_H - 2, 4, 2)
  }
  return {
    actors, slots, overflow, car, xcar, cars, queue, setFloors, sync, step, drawActor, drawCar, crossing, yOf, sitDy, sendTo, release, spawn, person, find,
    get spots() { return spots },
    occupied: activity => { let n = 0; for (const a of actors.values()) if (a.activity === activity && !a.walking) n++; return n },
    // riders in the main car plus whoever is queued for a lift on that floor (tower.liftLoad): features steering
    // several people somewhere send them a few at a time while it is high
    liftLoad: floorId => car.riders.length + (queue.get(floorId)?.length || 0),
  }
}
