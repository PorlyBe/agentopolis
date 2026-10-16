// social: life between the work. The meeting floor (a session asking the user a question presents at the whiteboard while
// its idle subagents take seats; a workflow's review-like phase holds its review at the table; one meeting at a time,
// a hanging sign says who has the room), chatter emotes over people on a break, a mug or a slice in hand, the pizza
// courier for big workflow runs, and the office pets (the dog tags along with someone on a break, the cat naps on a
// desk whose owner is away). Demos: ?demo=meeting, ?demo=chatter, ?demo=pizza, ?demo=pets (pair with ?demo=towerlife).
const REVIEW = /review|verif|check|judge|critiq|devil|audit|assess|inspect/i
const READING = /^(Read|Grep|Glob|WebFetch|WebSearch|ToolSearch)$|^mcp__|claude-in-chrome/
const asking = s => s.tool === 'AskUserQuestion' || (s.state === 'waiting' && !!s.ext?.meeting?.asking)
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
const rnd = (a, b) => a + Math.random() * (b - a)
const baseOf = act => (act || '').split(':').pop().replace(/-\d+$/, '').replace(/\d+$/, '')

export default function init(api, tower) {
  const demos = api.params.getAll('demo')
  const pizza = pizzas(api, tower, demos.includes('pizza'))
  meetings(api, tower, demos.includes('meeting'))
  chatter(api, tower, demos.includes('chatter'), pizza)
  pets(api, tower, demos.includes('pets'))
}

// screen-space pixel bubble
function emote(c, tower, ax, ay, text, k, alpha = 1, pop = 1) {
  const u = Math.max(1, Math.round(k / 2)), fs = Math.round(Math.max(10, Math.min(15, 4.4 * k)))
  c.font = tower.font(fs); c.textBaseline = 'middle'; c.textAlign = 'center'
  const w = Math.round(c.measureText(text).width + 6 * u), h = Math.round(fs + 4 * u)
  const x = Math.round(ax - 2 * u), y = Math.round(ay - 3 * u - h * pop - 2 * u * (1 - pop))
  c.globalAlpha = Math.max(0, alpha)
  c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(x + u, y + u, w, h)
  c.fillStyle = '#1b1c26'; c.fillRect(x, y + u, w, h - 2 * u); c.fillRect(x + u, y, w - 2 * u, h)
  c.fillStyle = '#fbfaf4'; c.fillRect(x + u, y + u, w - 2 * u, h - 2 * u)
  c.fillStyle = '#1b1c26'; c.fillRect(x + 2 * u, y + h - u, 3 * u, 2 * u); c.fillRect(x + u, y + h + u, 2 * u, u)
  c.fillStyle = '#fbfaf4'; c.fillRect(x + 3 * u, y + h - u, u, u)
  c.fillStyle = text === 'GG!' ? '#d8453f' : '#1b1c26'
  c.fillText(text, x + w / 2, y + h / 2 + u / 2)
  c.globalAlpha = 1; c.textAlign = 'left'
}
// where a person's head is on screen, above their own status bubble or diamond
function headAt(tower, p) {
  const k = tower.zoom, s = tower.worldToScreen(p.x + 3, p.y - 31 + (p.seated ? 4 : 0))
  if (p.kind === 'session') s.y -= Math.max(10, Math.min(16, 5.6 * k)) + 16
  else if (p.state && p.state !== 'idle') s.y -= Math.max(3.5, 2.4 * k) * 2 + 2
  return s
}

// ---------- the meeting room ----------
function meetings(api, tower, demo) {
  const { Z } = tower
  let meeting = null, planAt = 0, stash = null
  const roster = new Map()      // person id -> { x, face, pose, anim, activity, seat }
  const sent = new Map()        // person id -> seat id we steered them to
  const firstSeen = new Map()
  const live = id => { const p = tower.person(id); return p && !p.leaving ? p : null }

  function candidates(sessions) {
    const out = []
    for (const s of sessions) {
      if (asking(s)) out.push({ id: 'ask:' + s.id, kind: 'ask', s, label: '❓ ' + s.title, agents: s.agents.filter(g => g.state === 'idle') })
      const groups = new Map()
      for (const g of s.agents) {
        if (!g.phase || g.state === 'done' || !REVIEW.test(g.phase)) continue
        const id = `review:${s.id}:${g.workflowRun || ''}:${g.phase}`
        if (!groups.has(id)) groups.set(id, { id, kind: 'review', s, label: '🔍 ' + (g.workflow ? g.workflow + ' · ' : '') + g.phase, agents: [] })
        groups.get(id).agents.push(g)
      }
      out.push(...groups.values())
    }
    return out
  }
  function demoMeeting(sessions) {
    const s = [...sessions].sort((a, b) => b.agents.length - a.agents.length)[0]; if (!s) return null
    const agents = [...s.agents, ...sessions.filter(x => x !== s).flatMap(x => x.agents)].filter(g => g.state !== 'done')
    return { id: 'demo', kind: 'ask', s, label: '❓ ' + s.title, agents }
  }
  // the room is booked: take its seats off the break list so nobody wanders in for a sit-down
  function book(on) {
    const sp = tower.crowd?.spots
    if (!Array.isArray(sp)) return
    if (on) {
      if (stash && stash.arr === sp) return
      const out = []
      for (let i = sp.length - 1; i >= 0; i--) if (sp[i].floor === 'meeting') out.push(...sp.splice(i, 1))
      stash = { arr: sp, out }
    } else if (stash) {
      if (stash.arr === sp) sp.push(...stash.out)
      stash = null
    }
  }
  function plan(now) {
    const m = tower.meeting, sessions = tower.snapshot?.sessions || []
    if (!m) return
    const cands = candidates(sessions)
    for (const c of cands) if (!firstSeen.has(c.id)) firstSeen.set(c.id, now)
    for (const id of firstSeen.keys()) if (!cands.some(c => c.id === id)) firstSeen.delete(id)
    let c = demo ? demoMeeting(sessions) : meeting && cands.find(x => x.id === meeting.id)
    if (!c) c = cands.filter(x => x.kind === 'ask' && live(x.s.id)).sort((a, b) => firstSeen.get(a.id) - firstSeen.get(b.id))[0]
      || cands.filter(x => x.kind === 'review').sort((a, b) => firstSeen.get(a.id) - firstSeen.get(b.id))[0]
    const prev = new Map(roster); roster.clear()
    meeting = c ? { id: c.id, kind: c.kind, session: c.s.id, label: c.label, queued: cands.filter(x => x.id !== c.id).length } : null
    if (c) {
      if (c.kind === 'ask' && live(c.s.id)) roster.set(c.s.id, { ...m.board, seat: 'board', face: 'left', anim: null, activity: 'meeting:board' })
      // members already seated keep their chairs; reviews seat working agents before idle ones
      const ids = c.agents.map(g => g.id).filter(live)
      const rank = id => (prev.has(id) ? 0 : 2) + (live(id).state === 'idle' ? 1 : 0)
      const chosen = ids.sort((a, b) => rank(a) - rank(b)).slice(0, m.seats.length)
      const free = m.seats.filter(st => !chosen.some(id => prev.get(id)?.seat === st.id))
      for (const id of chosen) {
        const st = m.seats.find(s => s.id === prev.get(id)?.seat) || free.shift()
        if (st) roster.set(id, { x: st.x, face: 'down', pose: 'sit', seatH: st.seatH, seat: st.id, activity: 'meeting:meeting' })
      }
    }
    for (const [id] of sent) if (!roster.has(id)) { tower.release(id); sent.delete(id) }
    // a few at a time, so the lift is not swamped
    let budget = 2
    for (const [id, r] of roster) {
      if (sent.get(id) === r.seat && live(id)?.steered) continue
      const p = live(id)
      if (p && p.floor !== 'meeting' && (budget <= 0 || tower.liftLoad(p.floor) > 3)) continue
      budget--
      if (tower.sendTo(id, 'meeting', r.x, { face: r.face, pose: r.pose || 'stand', seatH: r.seatH, anim: r.anim, activity: r.activity })) sent.set(id, r.seat)
    }
    book(!!meeting)
    if (meeting) for (const p of tower.people) if (p.floor === 'meeting' && p.onBreak && !roster.has(p.id) && !p.steered && !p.walking) { tower.sendTo(p.id, 'meeting', p.x); tower.release(p.id) }
  }
  const inRoom = () => [...roster.keys()].some(id => { const p = tower.person(id); return p && p.floor === 'meeting' && !p.walking && p.activity?.startsWith('meeting:') })

  tower.on('step', (dt, now) => {
    if (now - planAt > 1000) { planAt = now; plan(Date.now()) }
    if (!meeting) return
    // the presenter turns to the table now and then; seated reviewers type or read along with their work
    for (const [id, r] of roster) {
      const a = tower.crowd?.find?.(id), p = tower.person(id)
      if (!a || !p || p.walking || p.floor !== 'meeting' || a.pose !== 'spot') continue
      if (r.seat === 'board') { a.face = now % 9000 > 6000 ? 'down' : 'left'; a.anim = a.face === 'left' ? 'read' : null }
      else a.anim = p.kind === 'session' || p.state === 'idle' ? null : READING.test(p.data?.tool || '') || p.state === 'thinking' ? 'read' : 'type'
    }
  })
  tower.on('layout', () => { stash = null; planAt = 0 })

  tower.on('items', (out, now) => {
    const m = tower.meeting; if (!m || !meeting) return
    const f = m.floor, sx = 190 + 8, sw = 108, sy = f.top + 10
    out.push({ z: Z.WALL, draw(c) {   // the sign hangs from the ceiling between the lamps; its text is painted in the overlay
      R(c, '#4a4452', sx + 10, f.top, 1, 10); R(c, '#4a4452', sx + sw - 11, f.top, 1, 10)
      R(c, 'rgba(0,0,0,.18)', sx + 2, sy + 15, sw - 2, 2)
      R(c, '#3b2617', sx, sy, sw, 15); R(c, '#ecdcb4', sx + 1, sy + 1, sw - 2, 13)
      R(c, meeting.kind === 'ask' ? '#e0a83a' : '#9a78d8', sx + 1, sy + 1, 2, 13)
      R(c, '#c9a25a', sx, sy, 2, 2); R(c, '#c9a25a', sx + sw - 2, sy, 2, 2)
    } })
    if (!inRoom()) return
    const w = m.whiteboard, x = w.x + 2, y = w.y + 2
    out.push({ z: Z.WALL + 1, draw(c) {
      R(c, '#f4f6f8', x, y, w.w - 4, 22)
      if (meeting.kind === 'ask') {
        c.fillStyle = '#d8453f'
        for (const [px, py, pw, ph] of [[2, 0, 6, 2], [7, 1, 2, 5], [3, 5, 4, 2], [3, 7, 2, 3], [3, 12, 2, 2], [0, 1, 2, 3]]) c.fillRect(x + 8 + px, y + 4 + py, pw, ph)
        c.fillStyle = '#5a7fb0'; for (let i = 0; i < 4; i++) c.fillRect(x + 26, y + 5 + i * 4, 14 + (i * 11) % 22, 1)
        return
      }
      const ticked = Math.floor(now / 1800) % 5
      for (let i = 0; i < 4; i++) {
        R(c, i < ticked ? '#3fa35a' : '#9aa3ad', x + 6, y + 3 + i * 5, 3, 3)
        if (i < ticked) R(c, '#f4f6f8', x + 7, y + 4 + i * 5, 1, 1)
        R(c, '#4a6fa5', x + 12, y + 4 + i * 5, 14 + (i * 13) % 30, 1)
      }
    } })
    // the presentation screen joins in: the question or the checklist's progress bar
    const sc = m.screen
    out.push({ z: Z.WALL + 1, draw(c) {
      R(c, '#2a4a6a', sc.x + 2, sc.y + 2, sc.w - 4, sc.h - 4)
      R(c, meeting.kind === 'ask' ? '#f4c64f' : '#b996f5', sc.x + 6, sc.y + 7, 20, 2)
      c.fillStyle = '#9fd0ff'; c.fillRect(sc.x + 6, sc.y + 13, 36, 1); c.fillRect(sc.x + 6, sc.y + 17, 28, 1)
      const t = (now / 6000) % 1
      R(c, '#1a2a3a', sc.x + 6, sc.y + 24, sc.w - 12, 3); R(c, '#5fd17a', sc.x + 6, sc.y + 24, Math.round((sc.w - 12) * (meeting.kind === 'ask' ? 1 : t)), 3)
    } })
  })
  tower.on('overlay', (c, now) => {
    const m = tower.meeting; if (!m || !meeting) return
    const k = tower.zoom, f = m.floor, a = tower.worldToScreen(198 + 4, f.top + 11), b = tower.worldToScreen(198 + 108 - 2, f.top + 24)
    const h = b.y - a.y, w = b.x - a.x
    if (h < 8 || b.x < 0 || a.x > c.canvas.width) return
    const fs = Math.max(7, Math.min(h * 0.6, 24)), tail = meeting.queued ? ` +${meeting.queued}` : ''
    c.save(); c.beginPath(); c.rect(a.x, a.y, w, h); c.clip()
    c.font = tower.font(fs); const tw = tail ? c.measureText(tail).width : 0
    const text = tower.fitText(meeting.label, w - tw - 4, tower.font(fs, 700))
    c.textBaseline = 'middle'; c.fillStyle = '#2b1d12'; c.fillText(text, a.x + 2 * k / 1.5, a.y + h / 2 + 0.5)
    if (tail) { c.font = tower.font(fs); c.fillStyle = '#8a6a4a'; c.fillText(tail, b.x - tw - 2, a.y + h / 2 + 0.5) }
    c.restore()
  })
  tower.on('hover', w => {
    const m = tower.meeting; if (!m || !meeting) return null
    const f = m.floor
    if (w.x < 198 || w.x > 306 || w.y < f.top + 10 || w.y > f.top + 25) return null
    const host = tower.snapshot?.sessions?.find(s => s.id === meeting.session)
    return `<div class="t">${api.esc(meeting.label)}</div><div class="m">${meeting.kind === 'ask' ? `${api.esc(host?.title || '')} is asking you something` : 'a review at the table'}</div><div class="m">${roster.size} in the room${meeting.queued ? ` · ${meeting.queued} meeting(s) queued` : ''}</div>`
  })
}

// ---------- chatter, mugs ----------
const EMOTES = {
  tv: ['♪', '😮', '📺'], coffee: ['☕'], table: ['💬', '😂', '🍪'], fridge: ['🧃'], microwave: ['🍜'],
  foosball: ['GG!'], pool: ['GG!'], arcade: ['🕹️', '!'], pinball: ['!', '🕹️'], grill: ['🌭', '🔥'], view: ['🌇', '😌'],
  deck: ['☀️', '😎'], meeting: ['🤔', '💡', '📝'], board: ['👉', '❓'],
}
const TALK = ['💬', '😂', '💡', '💬', '😂', '👍', '🤔']
const MUG = new Set(['coffee', 'table', 'chat', 'deck'])
function chatter(api, tower, demo, pizza) {
  const { Z } = tower
  const CAP = demo ? 8 : 3
  const gap = () => demo ? 1500 + Math.random() * 3000 : 9000 + Math.random() * 14000
  const shown = new Map(), next = new Map(), convo = new Map()
  const settled = p => !p.walking && !p.riding && !p.leaving && p.floor && p.activity && (p.onBreak || p.activity.startsWith('meeting:'))
  const say = (p, text, now) => { shown.set(p.id, { text, t0: now, dur: 1500 + Math.random() * 1000 }); next.set(p.id, now + gap()) }

  tower.on('step', (dt, now) => {
    const here = tower.people.filter(settled), ids = new Set(here.map(p => p.id))
    for (const [id, e] of shown) if (now - e.t0 > e.dur || !ids.has(id)) shown.delete(id)
    for (const id of next.keys()) if (!ids.has(id)) next.delete(id)
    const chats = here.filter(p => baseOf(p.activity) === 'chat'), paired = new Set()
    for (const a of chats) for (const b of chats) {
      if (a === b || a.x > b.x || a.floor !== b.floor || paired.has(a.id) || paired.has(b.id) || b.x - a.x > 30) continue
      paired.add(a.id); paired.add(b.id)
      const id = a.id + '|' + b.id
      let cv = convo.get(id)
      if (!cv) convo.set(id, cv = { turn: Math.random() < 0.5 ? 0 : 1, left: 0, next: now + (demo ? 800 : 3000 + Math.random() * 6000) })
      cv.seen = now
      if (now < cv.next || shown.has(a.id) || shown.has(b.id) || shown.size >= CAP) continue
      const who = cv.turn++ % 2 ? b : a
      say(who, pizza.on() && Math.random() < 0.3 ? '🍕' : TALK[Math.floor(Math.random() * TALK.length)], now)
      if (cv.left <= 0) cv.left = 2 + Math.floor(Math.random() * 3)
      cv.left--
      cv.next = now + shown.get(who.id).dur + (cv.left > 0 ? 400 + Math.random() * 700 : demo ? 2000 : 10000 + Math.random() * 12000)
    }
    for (const [id, cv] of convo) if (cv.seen !== now) convo.delete(id)
    const night = tower.snapshot && (new Date().getHours() < 7 || new Date().getHours() >= 20)
    for (const p of here) {
      if (paired.has(p.id) || baseOf(p.activity) === 'chat') continue
      if (!next.has(p.id)) { next.set(p.id, now + (demo ? 500 : 3000) + Math.random() * (demo ? 4000 : 12000)); continue }
      if (now < next.get(p.id) || shown.has(p.id) || shown.size >= CAP) continue
      const kind = baseOf(p.activity)
      let list = kind === 'deck' && night ? ['🌙', '✨'] : EMOTES[kind]
      if (pizza.on() && /^(table|coffee|fridge|microwave)$/.test(kind)) list = [...(list || []), '🍕', '🍕']
      if (!list || (/^(foosball|pool)$/.test(kind) && here.filter(o => o.activity === p.activity).length < 2)) { next.set(p.id, now + gap()); continue }
      say(p, list[Math.floor(Math.random() * list.length)], now)
    }
  })
  tower.on('overlay', (c, now) => {
    if (!shown.size) return
    const k = tower.zoom
    for (const [id, e] of shown) {
      const p = tower.person(id); if (!p) continue
      const t = now - e.t0, s = headAt(tower, p)
      if (s.x < -50 || s.y < -50 || s.x > c.canvas.width || s.y > c.canvas.height) continue
      emote(c, tower, s.x, s.y, e.text, k, Math.min(1, (e.dur - t) / 250), Math.min(1, t / 120))
    }
  })
  // a mug in hand while hanging out (a slice wins when there is pizza); it rises for a sip, steam curls off it
  tower.on('items', (out, now) => {
    for (const p of tower.people) {
      if (!p.onBreak || p.walking || p.riding || !p.floor || !MUG.has(baseOf(p.activity)) || p.face === 'up' || pizza.holding(p.id)) continue
      if (baseOf(p.activity) === 'deck' && now % 30000 > 18000) continue
      const cyc = (now + api.hash(p.id) % 3000) % 5000, sip = cyc > 4200
      const side = p.face === 'right' ? 1 : p.face === 'left' ? -1 : 0
      const mx = Math.round(p.x + (side ? side * 5 : 3)) - 1, my = Math.round(p.y - (p.seated ? 17 : 13) - (sip ? 4 : 0))
      out.push({ z: p.seated && p.floor === 'cafe' ? Z.FRONT + 3 : Z.STAND + 2, draw(c) {
        R(c, '#3a2a22', mx - 1, my - 1, 5, 6); R(c, '#f4efe6', mx, my, 3, 4); R(c, '#c96f4a', mx, my + 1, 3, 1)
        R(c, '#f4efe6', side < 0 ? mx - 2 : mx + 3, my + 1, 1, 2)
        if (sip) return
        for (let i = 0; i < 2; i++) {
          const t = ((now / 1400) + i / 2) % 1
          c.fillStyle = `rgba(235,235,245,${0.6 * (1 - t)})`; c.fillRect(mx + 1 + Math.round(Math.sin(t * 6 + i) * 1.2), my - 2 - Math.round(t * 7), 1, 1)
        }
      } })
    }
  })
}

// ---------- pizza ----------
const MIN_AGENTS = 5, SLICES = 8, EAT_MS = 10 * 60_000, MAX_MS = 90 * 60_000, MIN_SHOW_MS = 20_000
const EATING = new Set(['table', 'chat', 'coffee', 'fridge', 'microwave'])
const UNIFORM = [[214, 58, 48], [182, 40, 34], [140, 28, 26]], PANTS = [[58, 60, 72], [44, 46, 56], [30, 32, 40]]
const CAP = [226, 52, 42], CAP_DK = [160, 30, 26], BRIM = [120, 20, 18]
function pizzas(api, tower, demo) {
  const { Z } = tower
  const baseline = new Set(), agentsOf = new Map(), delivered = new Set(), missing = new Map(), queue = [], boxes = []
  const holders = new Set()
  let run = null, sheet = null, primed = false, demoArmed = false

  tower.on('sync', snap => {
    if (!api.live) return
    const runs = new Map()
    for (const s of snap.sessions) {
      const ext = s.ext?.['workflow-phases'] || []
      for (const g of s.agents) {
        if (!g.workflowRun) continue
        let r = runs.get(g.workflowRun)
        if (!r) { const e = ext.find(x => x.run === g.workflowRun); runs.set(g.workflowRun, r = { name: e?.name || g.workflow || 'workflow', status: e?.status || 'running', ids: new Set() }) }
        r.ids.add(g.id)
      }
    }
    for (const [id, r] of runs) {
      if (!primed) { baseline.add(id); continue }
      const ids = agentsOf.get(id) || new Set(); for (const a of r.ids) ids.add(a); agentsOf.set(id, ids)
      if (baseline.has(id) || delivered.has(id) || r.status !== 'running' || ids.size < MIN_AGENTS) continue
      delivered.add(id); order({ run: id, name: r.name, n: ids.size })
    }
    primed = true
    for (const z of boxes) {
      if (z.ended || z.run === 'demo') continue
      const r = runs.get(z.run)
      missing.set(z.run, r ? 0 : (missing.get(z.run) || 0) + 1)
      if ((r && r.status !== 'running') || missing.get(z.run) >= 4) { z.ended = true; z.endedAt = Date.now() }
    }
    for (const id of agentsOf.keys()) if (!runs.has(id) && !boxes.some(z => z.run === id)) agentsOf.delete(id)
    if (demo && !demoArmed && snap.sessions.length) {
      demoArmed = true
      setTimeout(() => { const r = [...runs.values()][0]; order({ run: 'demo', name: r?.name || 'demo workflow', n: Math.max(MIN_AGENTS, r?.ids.size || 6), eatMs: 75_000 }) }, 2000)
    }
  })
  function order(z) {
    const used = new Set([...boxes.filter(x => !x.gone).map(x => x.slot), ...queue.map(x => x.slot), ...(run ? [run.pizza.slot] : [])])
    if (used.has(0) && used.has(1)) return
    z.slot = used.has(0) ? 1 : 0; z.eatMs ??= EAT_MS
    queue.push(z)
  }

  const PARK = -58, LANE = 11
  const slotX = slot => { const t = tower.cafe.table; return t.x + (slot ? 39 : 15) }
  const standX = () => tower.cafe.table.x + 27

  tower.on('step', (dt, now) => {
    if (!run && queue.length && tower.cafe) {
      const pizza = queue.shift()
      run = { pizza, phase: 'ride', t: 0, moped: { x: Math.max(tower.street.extent?.x0 ?? -400, -400) - 40, dir: 'right' }, npc: null }
      api.toast(`🍕 Pizza for ${pizza.name} (${pizza.n} agents)`, 4000)
    }
    const r = run
    if (r) {
      r.t += dt
      const m = r.moped
      if (r.phase === 'ride') {
        m.x = Math.min(PARK, m.x + Math.max(30, Math.min(110, (PARK - m.x) * 1.5)) * dt)
        if (m.x >= PARK) {
          r.phase = 'in'
          r.npc = tower.spawn({ id: 'pizza-courier', draw: (c, p, n) => drawCourier(c, p, n, r), floor: 'lobby', x: PARK + 8 })
          r.npc.go('cafe', standX(), { face: 'down', then: () => { r.phase = 'set'; r.t = 0 } })
        }
      } else if (r.phase === 'in' && (!r.npc || r.npc.gone)) { r.phase = 'set'; r.t = 0 }
      else if (r.phase === 'set' && r.t > 1.6) { r.phase = 'wave'; r.t = 0; boxes.push(Object.assign(r.pizza, { placedAt: Date.now() })) }
      else if (r.phase === 'wave' && r.t > 1.8) {
        r.phase = 'out'
        if (!r.npc || r.npc.gone || !r.npc.go('lobby', PARK + 8, { then: () => { r.npc.remove(); r.phase = 'gone'; r.t = 0 } })) { r.phase = 'gone'; r.t = 0 }
      } else if (r.phase === 'gone' && r.t > 0.8) {
        m.dir = 'left'; m.x -= Math.min(110, 20 + (r.t - 0.8) * 120) * dt
        if (m.x < (tower.street.extent?.x0 ?? -600) - 60) run = null
      }
    }
    const t = Date.now()
    for (const z of boxes) {
      if (z.run === 'demo' && !z.ended && t - z.placedAt > z.eatMs + 30_000) { z.ended = true; z.endedAt = t }
      if (!z.gone && ((z.ended && t - z.placedAt > MIN_SHOW_MS) || t - z.placedAt > MAX_MS)) z.gone = t
    }
    for (let i = boxes.length - 1; i >= 0; i--) if (boxes[i].gone && t - boxes[i].gone > 1200) boxes.splice(i, 1)
  })
  const slicesLeft = (z, t = Date.now()) => Math.max(0, Math.ceil(SLICES * (1 - (t - z.placedAt) / z.eatMs)))

  function courierSheet() {
    if (sheet) return sheet
    const src = api.charSheet(2, 0); if (!src?.width) return null
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = src.height
    const x = cv.getContext('2d'); x.drawImage(src, 0, 0)
    const d = x.getImageData(0, 0, cv.width, cv.height), px = d.data, Wd = cv.width
    const at = (X, Y) => (Y * Wd + X) * 4, put = (X, Y, c) => { const i = at(X, Y); px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2]; px[i + 3] = 255 }
    for (let i = 0; i < px.length; i += 4) {
      if (px[i + 3] < 128) continue
      const r = px[i], g = px[i + 1], b = px[i + 2]
      if (r === g && g === b && r >= 0xb0 && r <= 0xf0) { const c = UNIFORM[r >= 0xe8 ? 0 : r >= 0xcc ? 1 : 2]; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2] }
      else if (b > r + 25 && b > g) { const c = PANTS[b > 0x70 ? 0 : b > 0x38 ? 1 : 2]; px[i] = c[0]; px[i + 1] = c[1]; px[i + 2] = c[2] }
    }
    // a red cap with a brim
    for (let row = 0; row < 3; row++) for (let f = 0; f < 7; f++) {
      const ox = f * 16, oy = row * 32, top = []
      for (let c = 0; c < 16; c++) { top[c] = null; for (let y = 0; y < 13; y++) if (px[at(ox + c, oy + y) + 3] >= 128) { top[c] = y; break } }
      const cols = top.map((t, c) => t == null ? -1 : c).filter(c => c >= 0); if (!cols.length) continue
      const sorted = cols.map(c => top[c]).sort((a, b) => a - b), crown = sorted[Math.floor(sorted.length * 0.6)], c0 = cols[0], c1 = cols[cols.length - 1]
      const bottom = crown + 3
      for (const c of cols) {
        const start = Math.max(top[c], crown + (c <= c0 + 1 || c >= c1 - 1 ? 1 : 0))
        for (let y = 0; y < start; y++) px[at(ox + c, oy + y) + 3] = 0
        for (let y = start; y <= bottom; y++) put(ox + c, oy + y, y === start || y === bottom ? CAP_DK : CAP)
      }
      if (row === 0) for (let c = c0 + 1; c <= c1 - 1; c++) put(ox + c, oy + bottom + 1, BRIM)
      if (row === 2) for (let c = c1 - 1; c <= Math.min(15, c1 + 2); c++) put(ox + c, oy + bottom + 1, BRIM)
    }
    x.putImageData(d, 0, 0)
    return (sheet = cv)
  }
  function sprite(c, row, frame, flip, x, y) {
    const s = courierSheet(); if (!s) return
    const dx = Math.round(x - 8), dy = Math.round(y - 30)
    if (flip) { c.save(); c.translate(dx + 16, dy); c.scale(-1, 1); c.drawImage(s, frame * 16, row * 32, 16, 32, 0, 0, 16, 32); c.restore() }
    else c.drawImage(s, frame * 16, row * 32, 16, 32, dx, dy, 16, 32)
  }
  function drawCourier(c, p, now, r) {
    const side = p.walking && !p.riding, face = p.riding ? 'down' : side ? p.dir : p.face || 'down'
    const row = face === 'down' ? 0 : face === 'up' ? 1 : 2
    sprite(c, row, side ? [0, 1, 2, 1][Math.floor(now / 130) % 4] : 1, face === 'left', p.x, p.y)
    if (r.phase === 'wave') {
      const s = Math.floor(now / 220) % 2, ax = Math.round(p.x) + 5 + s, ay = Math.round(p.y) - 25
      R(c, 'rgb(182,40,34)', ax - 1, ay + 3, 2, 4); R(c, '#f0c8a0', ax - 1 + s, ay, 2, 3)
    }
    if (r.phase === 'in' && face !== 'up') stack(c, p.x + (face === 'right' ? 5 : face === 'left' ? -5 : 0), p.y - 14, 3 - r.pizza.slot)
  }
  function stack(c, x, y, n) {
    for (let i = 0; i < n; i++) { const by = Math.round(y - i * 3), bx = Math.round(x); R(c, '#9a6f3c', bx - 7, by, 14, 3); R(c, '#d8b47a', bx - 7, by, 14, 2); R(c, '#c8302a', bx - 1, by, 2, 1) }
  }
  function moped(c, x, y, flip) {
    c.save(); if (flip) { c.translate(Math.round(x) * 2, 0); c.scale(-1, 1) }
    x = Math.round(x); y = Math.round(y)
    R(c, 'rgba(0,0,0,.3)', x - 11, y + 3, 23, 1)
    R(c, '#1d1d22', x - 10, y - 2, 5, 5); R(c, '#1d1d22', x + 6, y - 2, 5, 5); R(c, '#8a8f98', x - 8, y, 1, 1); R(c, '#8a8f98', x + 8, y, 1, 1)
    R(c, '#c8302a', x - 7, y - 5, 13, 3); R(c, '#c8302a', x + 4, y - 10, 3, 6); R(c, '#e8574a', x - 7, y - 5, 13, 1)
    R(c, '#2b2d33', x - 6, y - 7, 7, 2); R(c, '#2b2d33', x + 5, y - 12, 4, 1); R(c, '#ffe9a8', x + 9, y - 9, 2, 2)
    R(c, '#f2efe6', x - 12, y - 13, 8, 6); R(c, '#c8302a', x - 12, y - 13, 8, 2); R(c, '#c8302a', x - 9, y - 10, 2, 2)
    c.restore()
  }
  function drawBox(c, z, left, alpha, part) {
    const cx = slotX(z.slot), ty = tower.cafe.table.y, x = cx - 9
    c.globalAlpha = alpha
    if (part === 'lid') { R(c, '#9a6f3c', x, ty - 11, 18, 9); R(c, '#d8b47a', x + 1, ty - 10, 16, 7); R(c, '#c8302a', x + 6, ty - 8, 6, 3); return }
    R(c, '#9a6f3c', x, ty - 3, 18, 3); R(c, '#d8b47a', x, ty - 3, 18, 1)
    for (let i = 0; i < SLICES; i++) {
      const sx = x + 1 + i * 2
      if (i < left) { R(c, '#c98a3e', sx, ty - 5, 2, 2); R(c, '#f3c74e', sx, ty - 5, 2, 1); if (i % 3 === 1) R(c, '#b8322a', sx, ty - 5, 1, 1) }
      else if (i % 2) R(c, '#c98a3e', sx, ty - 4, 1, 1)
    }
    c.globalAlpha = 1
  }
  function slice(c, x, y, flip) {
    const s = flip ? -1 : 1
    R(c, '#c98a3e', x, y, 1, 4); R(c, '#f3c74e', x + s, y, 1, 4); R(c, '#f3c74e', x + 2 * s, y + 1, 1, 2); R(c, '#f3c74e', x + 3 * s, y + 1, 1, 1); R(c, '#b8322a', x + s, y + 1, 1, 1)
  }

  tower.on('items', (out, now) => {
    if (!tower.cafe) return
    const wall = Date.now()
    for (const z of boxes) {
      const left = slicesLeft(z, wall), alpha = z.gone ? Math.max(0, 1 - (wall - z.gone) / 1200) : 1
      out.push({ z: Z.SEATED - 2, draw: c => drawBox(c, z, left, alpha, 'lid') }, { z: Z.FRONT + 1, draw: c => drawBox(c, z, left, alpha, 'base') })
    }
    const r = run
    if (r) {
      const m = r.moped, riding = r.phase === 'ride' || (r.phase === 'gone' && r.t > 0.8), flip = m.dir === 'left'
      out.push({ z: Z.OUTSIDE + 5, draw(c) {
        moped(c, m.x, LANE, flip)
        if (riding) sprite(c, 2, 3, flip, m.x + (flip ? 2 : -2), LANE - 2)
      } })
      if (r.phase === 'set' && r.npc && !r.npc.gone) {
        const down = Math.min(1, r.t / 1.2), ty = tower.cafe.table.y
        out.push({ z: Z.FRONT + 2, draw: c => stack(c, slotX(r.pizza.slot), ty - 16 + down * 13, 3 - r.pizza.slot) })
      }
    }
    holders.clear()
    const fresh = boxes.filter(z => !z.gone && (slicesLeft(z, wall) > 0 || wall - z.placedAt < z.eatMs + 60_000))
    if (!fresh.length) return
    let budget = Math.max(...fresh.map(z => Math.max(1, SLICES - slicesLeft(z, wall) + 1)))
    for (const p of tower.people) {
      if (budget <= 0) break
      if (p.floor !== 'cafe' || p.walking || !EATING.has(baseOf(p.activity)) || p.face === 'up') continue
      const d = p.face || 'down', hx = Math.round(p.x + (d === 'left' ? -6 : d === 'right' ? 5 : 4)), hy = Math.round(p.y - (p.seated ? 18 : 14))
      budget--; holders.add(p.id)
      out.push({ z: p.seated ? Z.FRONT + 3 : Z.STAND + 2, draw: c => slice(c, hx, hy, d === 'left') })
    }
  })
  tower.on('hover', w => {
    const t = tower.cafe?.table
    if (t) for (const z of boxes) if (!z.gone && Math.abs(w.x - slotX(z.slot)) < 10 && w.y > t.y - 12 && w.y < t.y + 1)
      return `<div class="t">🍕 ${api.esc(z.name)}</div><div class="m">for a run of ${z.n} agents · ${slicesLeft(z)}/${SLICES} slices left</div>`
    const p = run?.npc && !run.npc.gone ? run.npc : null
    if (p && Math.abs(w.x - p.x) < 7 && w.y > p.y - 28 && w.y < p.y + 1) return `<div class="t">🍕 Pizza courier</div><div class="m">delivering to ${api.esc(run.pizza.name)} (${run.pizza.n} agents)</div>`
    return null
  })
  return { on: () => boxes.some(z => !z.gone && slicesLeft(z) > 0), holding: id => holders.has(id) }
}

// ---------- the pets ----------
const O = '#141013', B = '#2f282d', H = '#4a3e45', P = '#d98a9c', E = '#8d8188'
const CURL = [[O, [[1, 3, 8], [2, 1, 10], [3, 0, 11], [4, 0, 11], [5, 0, 11], [6, 1, 11], [0, 10, 10], [0, 13, 13], [1, 9, 14], [2, 9, 14], [3, 9, 14], [4, 9, 14], [5, 10, 13]]],
  [B, [[2, 3, 8], [3, 1, 9], [4, 1, 10], [5, 1, 9], [2, 10, 13], [3, 10, 13], [4, 10, 13]]],
  [H, [[2, 4, 6], [5, 1, 1], [6, 2, 9], [5, 10, 10]]], [P, [[1, 10, 10], [1, 13, 13], [4, 12, 12]]], [E, [[3, 11, 11], [3, 13, 13]]]]
function pets(api, tower, demo) {
  const { Z } = tower
  const SP = demo ? 0.3 : 1
  const dog = { npc: null, st: 'wander', fav: null, until: 0, rest: 1, plan: 0, lost: 0, cmd: null, wag: false }
  const cat = { npc: null, st: 'decide', rest: 2, perch: null, t0: 0, until: 0, check: 0, recent: new Map(), up: false, lift: 0 }
  const L = () => tower.cafe?.lounge || { x0: 178, x1: 488 }
  const clampX = x => Math.max(tower.interior.x0 + 6, Math.min(tower.interior.x1 - 14, x))
  const nameOf = p => p?.data ? (p.kind === 'session' ? p.data.title : p.data.description || p.data.type) : 'someone'

  function sprite(c, img, p, now, opts = {}) {
    if (!img) return
    const x = Math.round(p.x), y = Math.round(p.y - (opts.lift || 0))
    if (opts.walk) {
      const f = opts.frame ?? Math.floor(now / 140) % 3
      c.save()
      if (opts.dir === 'left') { c.translate(x + 16, y - 29); c.scale(-1, 1); c.drawImage(img, f * 32, 64, 32, 32, 0, 0, 32, 32) }
      else c.drawImage(img, f * 32, 64, 32, 32, x - 16, y - 29, 32, 32)
      c.restore()
    } else c.drawImage(img, (opts.frame ?? 3 + Math.floor(now / 600) % 3) * 16, 0, 16, 32, x - 8, y - 29, 16, 32)
  }
  const spawnDog = () => tower.spawn({ id: 'pet-dog', floor: 'cafe', x: L().x0 + 120, draw: (c, p, now) => sprite(c, api.img.pet_claudio, p, now, p.walking ? { walk: true, dir: p.dir } : { frame: dog.wag ? 3 + Math.floor(now / 200) % 3 : 3 }) })
  const spawnCat = () => tower.spawn({ id: 'pet-cat', floor: 'cafe', x: L().x0 + 30, draw: (c, p, now) => { if (!cat.up) sprite(c, api.img.pet_gitcat, p, now, p.walking ? { walk: true, dir: p.dir, frame: Math.floor(now / 190) % 3 } : { frame: 3 + Math.floor(now / 900) % 3 }) } })

  // ---- the dog: tags along with someone on a break around the café, the lounge and the roof ----
  const goDog = (floor, x, face) => {
    const n = dog.npc; x = clampX(x)
    if (dog.cmd && dog.cmd.floor === floor && Math.abs(dog.cmd.x - x) < 6 && (n.floor === floor || n.floor == null)) return
    dog.cmd = { floor, x }; n.go(floor, x, { face })
  }
  function candidates() {
    return tower.people.filter(p => p.onBreak && !p.leaving && (p.floor === 'cafe' || p.floor === 'roof') && p.activity)
  }
  function wander(now) {
    dog.st = 'wander'; dog.fav = null; dog.until = now + rnd(15e3, 40e3) * SP
    const l = L(); goDog('cafe', rnd(l.x0 + 10, l.x1 - 30))
  }
  function dogStep(now) {
    const n = dog.npc
    dog.wag = false
    if (dog.st === 'wander') {
      if (now > dog.until) {
        const list = candidates()
        if (list.length) { const p = list[Math.floor(Math.random() * list.length)]; Object.assign(dog, { st: 'follow', fav: p.id, until: now + rnd(25e3, 60e3) * SP, lost: 0 }); return }
        dog.until = now + 3000 * SP
      }
      if (!n.walking && n.floor === 'cafe' && now > dog.rest) { dog.rest = now + rnd(3e3, 9e3); const l = L(); goDog('cafe', Math.random() < 0.7 ? rnd(l.x0 + 10, l.x1 - 30) : rnd(tower.interior.x0 + 30, l.x0)) }
      return
    }
    const f = tower.person(dog.fav)
    if (!f || f.leaving || now > dog.until) return wander(now)
    if (f.riding || f.floor == null) return
    if (f.floor !== 'cafe' && f.floor !== 'roof') { dog.lost ||= now; if (now - dog.lost > 3000) wander(now); return }
    dog.lost = 0
    if (now < dog.plan) { if (!f.walking && !n.walking && n.floor === f.floor && Math.abs(n.x - f.x) < 26) dog.wag = true; return }
    dog.plan = now + 600
    let tx
    if (f.walking) tx = f.x + (f.dir === 'right' ? -18 : 18)
    else {
      const side = n.x < f.x ? -1 : 1, busy = x => tower.people.some(o => o.id !== f.id && o.floor === f.floor && Math.abs(o.x - x) < 8)
      tx = f.x + side * 14; if (busy(tx)) tx = f.x - side * 14
    }
    goDog(f.floor, tx, f.x < tx ? 'left' : 'right')
  }

  // ---- the cat: naps on a warm desk whose owner is away, else on the fridge or the sofa's back ----
  const away = (p, fid) => p && !p.leaving && !p.atDesk && p.floor !== fid
  function perches(now) {
    const out = [], people = tower.people
    for (const f of tower.floors) {
      if (f.kind !== 'session') continue
      const g = tower.desk(f.id); if (!g) continue
      const own = tower.person(f.id)
      if (away(own, f.id)) out.push({ key: f.id, kind: 'desk', floor: f.id, owner: f.id, at: () => { const d = tower.desk(f.id); return d && { x: d.monitor.x + 5, y: d.desk.y } }, z: Z.FLOOR + 5, w: 3 })
      for (const p of people) if (p.kind === 'agent' && p.session === f.id && g.agents[p.slot] && away(p, f.id))
        out.push({ key: f.id + ':' + p.slot, kind: 'desk', floor: f.id, owner: p.id, at: () => { const d = tower.desk(f.id)?.agents[p.slot]; return d && { x: d.monitor.x + 5, y: d.desk.y } }, z: Z.FLOOR + 5, w: 2 })
    }
    const cafe = tower.cafe
    if (cafe) {
      out.push({ key: 'fridge', kind: 'fridge', floor: 'cafe', at: () => tower.cafe && { x: tower.cafe.floor.x0 + 15, y: tower.cafe.floor.y - 40 }, z: Z.FLOOR + 5, w: 0.6 })
      if (!people.some(p => p.activity === 'cafe:tv')) out.push({ key: 'sofa', kind: 'sofa', floor: 'cafe', at: () => tower.cafe && { x: tower.cafe.tv.x + 26, y: tower.cafe.floor.y - 15 }, z: Z.FRONT + 4, w: 0.6 })
    }
    return out.filter(p => !(now - (cat.recent.get(p.key) ?? -Infinity) < 180e3 * SP))
  }
  const valid = (ph, now) => {
    if (!ph.at()) return false
    if (ph.kind === 'desk') { const o = tower.person(ph.owner); return away(o, ph.floor) }
    if (ph.kind === 'sofa') return !tower.people.some(p => p.activity === 'cafe:tv' || (p.floor === 'cafe' && p.onBreak && Math.abs(p.x - ph.at().x) < 20 && p.walking))
    return true
  }
  function catStep(dt, now) {
    const n = cat.npc
    if (cat.st === 'decide') {
      if (now < cat.rest) return
      const list = perches(now), desks = list.filter(p => p.kind === 'desk')
      const pool = desks.length && Math.random() < 0.85 ? desks : list
      const ph = pool[Math.floor(Math.random() * pool.length)]
      if (!ph) { cat.rest = now + 3000; return }
      cat.perch = ph; cat.st = 'go'; cat.check = now + 1000
      const at = ph.at(); n.go(ph.floor, at.x - 8, { face: 'right' })
      return
    }
    const ph = cat.perch
    if (cat.st === 'go') {
      if (now > cat.check) { cat.check = now + 1000; if (!valid(ph, now)) { cat.st = 'decide'; cat.rest = now + rnd(1e3, 3e3) * SP; return } }
      if (n.floor === ph.floor && !n.walking && Math.abs(n.x - (ph.at().x - 8)) < 1) { cat.st = 'hop'; cat.t0 = now; cat.dirUp = true; cat.up = true }
      return
    }
    if (cat.st === 'hop') {
      const t = Math.min(1, (now - cat.t0) / 550)
      if (t < 1) return
      if (cat.dirUp) { cat.st = 'nap'; cat.until = now + (ph.kind === 'desk' ? rnd(60e3, 180e3) : rnd(40e3, 120e3)) * SP; cat.check = now + 1000 }
      else { cat.up = false; cat.st = 'decide'; cat.rest = now + rnd(4e3, 10e3) * SP }
      return
    }
    if (cat.st === 'nap') {
      if (now < cat.check) return
      cat.check = now + 1000
      const deskWaiting = ph.kind !== 'desk' && now - cat.t0 > 25e3 * SP && Math.random() < 0.05 && perches(now).some(p => p.kind === 'desk')
      if (!valid(ph, now) || now > cat.until || deskWaiting) { cat.recent.set(ph.key, now); cat.st = 'hop'; cat.t0 = now; cat.dirUp = false }
    }
  }
  // the cat's own spot while it is up on something: where it is and how high it is in the hop
  function catPose(now) {
    const n = cat.npc, ph = cat.perch, at = ph?.at(); if (!at || !n) return null
    if (cat.st === 'nap') return { x: at.x, y: at.y, curl: true }
    const t = Math.min(1, (now - cat.t0) / 550), e = cat.dirUp ? t : 1 - t
    const fx = n.x, fy = n.y
    return { x: fx + (at.x - fx) * e, y: fy + (at.y - fy) * e - Math.sin(Math.PI * t) * 8, dir: cat.dirUp ? 'right' : 'left' }
  }
  function curl(c, bx, by, now, flip) {
    const ox = Math.round(bx) - 7, oy = Math.round(by) - 7, breathe = Math.floor(now / 1500) % 2
    const px = (r, x0, x1) => c.fillRect(flip ? ox + 14 - x1 : ox + x0, oy + r, x1 - x0 + 1, 1)
    c.fillStyle = 'rgba(0,0,0,.28)'; c.fillRect(ox + 1, oy + 7, 13, 1)
    if (breathe) { c.fillStyle = O; px(0, 4, 7); c.fillStyle = B; px(1, 4, 7) }
    for (const [col, rows] of CURL) { c.fillStyle = col; for (const r of rows) px(...r) }
  }

  tower.on('step', (dt, now) => {
    if (!tower.cafe) return
    if (!dog.npc || dog.npc.gone) { dog.npc = spawnDog(); Object.assign(dog, { st: 'wander', fav: null, cmd: null, until: now + (demo ? 1500 : rnd(5e3, 20e3)) }) }
    if (!cat.npc || cat.npc.gone) { cat.npc = spawnCat(); Object.assign(cat, { st: 'decide', rest: now + (demo ? 500 : 3000), perch: null, up: false }) }
    dogStep(now); catStep(dt, now)
  })
  tower.on('layout', () => { if (cat.st === 'go' || cat.st === 'decide') { cat.st = 'decide'; cat.perch = null } })
  tower.on('items', (out, now) => {
    if (!cat.up || !cat.npc || cat.npc.gone) return
    const p = catPose(now); if (!p) { cat.up = false; cat.st = 'decide'; return }
    out.push({ z: cat.perch.z, draw: c => p.curl ? curl(c, p.x, p.y, now, false) : sprite(c, api.img.pet_gitcat, p, now, { walk: true, dir: p.dir, frame: 1 }) })
  })
  tower.on('overlay', (c, now) => {
    if (cat.st !== 'nap') return
    const p = catPose(now); if (!p) return
    const k = tower.zoom
    c.textBaseline = 'alphabetic'
    for (let i = 0; i < 2; i++) {
      const t = ((now / 2800) + i / 2) % 1, al = Math.min(1, (1 - t) * 1.8, t * 6)
      const s = tower.worldToScreen(p.x + 4 + t * 5 + Math.sin(t * 5) * 1.5, p.y - 8 - t * 11)
      c.font = `700 ${Math.max(8, Math.round((4 + 3 * t) * k))}px ${tower.MONO}`
      c.lineWidth = Math.max(2, k * 0.7); c.strokeStyle = `rgba(20,18,30,${0.7 * al})`; c.strokeText('z', s.x, s.y)
      c.fillStyle = `rgba(245,244,252,${al})`; c.fillText('z', s.x, s.y)
    }
  })
  tower.on('hover', w => {
    const d = dog.npc && !dog.npc.gone ? dog.npc : null
    if (d && Math.abs(w.x - d.x) < 9 && w.y > d.y - 16 && w.y < d.y + 1) {
      const f = dog.st === 'follow' && tower.person(dog.fav)
      return `<div class="t">🐕 Claudio</div><div class="m">${f ? 'tagging along with ' + api.esc(nameOf(f)) : 'mooching around the lounge'}</div>`
    }
    const p = cat.up ? catPose(performance.now()) : cat.npc && !cat.npc.gone ? { x: cat.npc.x, y: cat.npc.y } : null
    if (p && Math.abs(w.x - p.x) < 9 && w.y > p.y - 14 && w.y < p.y + 1) {
      const ph = cat.perch, o = ph?.kind === 'desk' && tower.person(ph.owner)
      const what = cat.st === 'nap' ? (o ? `asleep on ${api.esc(nameOf(o))}'s warm keyboard` : ph.kind === 'fridge' ? 'asleep on top of the fridge' : 'asleep on the back of the sofa') : 'looking for somewhere warm'
      return `<div class="t">🐈‍⬛ Git the cat</div><div class="m">${what}</div>`
    }
    return null
  })
}
