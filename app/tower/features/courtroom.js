// courtroom: while a session runs a review (session.ext.courtroom, server/features/courtroom.mjs) the meeting room is a
// court: a judge in a wig at the bench, a clerk, the session's character in the dock and its review subagents in the
// jury box; the table is dimmed. When the review answers, the clerk reads the findings as counts, the gavel bangs and a
// GUILTY / ACQUITTED stamp lands; then the court adjourns. It waits while a stand-up or a meeting holds the room, and
// steps aside if one starts. Hover the bench, dock or jury for the case. ?demo=courtroom holds a trial on a loop.
import { IX, SEAT_H } from '../building.js'
import { R, pixText } from '../draw.js'

const BENCH = { x: IX + 44, w: 66, h: 24 }, JUDGE = IX + 77, CLERK = { x: IX + 116, w: 24, h: 13 }, DOCK = { x: IX + 150, w: 24, h: 9 }
const JURY = { x: IX + 236, w: 92, h: 14 }, SEATS = [0, 1, 2, 3, 4, 5].map(i => IX + 246 + i * 15), DRAPE = { x: IX + 32, w: 90 }
const SIGN = { x: IX + 204, w: 54, h: 9 }, SOCIAL_REVIEW = /review|verif|check|judge|critiq|devil|audit|assess|inspect/i
const READ_MS = 3400, BANG_MS = 1600, HOLD_MS = 11_000, FADE_MS = 1200, LATE_MS = 120_000
const WOOD = '#5a3a22', WOOD_HI = '#7a5232', WOOD_LO = '#3e2614', BRASS = '#c9a25a'

export default function init(api, tower) {
  const { Z } = tower, esc = api.esc
  const params = api.params, demo = api.demo('courtroom')
  let court = null, planAt = 0, demoT0 = 0
  const played = new Set(), sent = new Map()   // trial ids whose verdict was read; person id -> 'dock' | 'jury'

  // ---------- data ----------
  tower.on('snapshot', snap => {
    if (!demo) return
    const now = Date.now(); demoT0 ||= now
    const s = [...(snap.sessions || [])].sort((a, b) => (b.agents?.length || 0) - (a.agents?.length || 0))[0]; if (!s) return
    const CYC = 60_000, k = Math.floor((now - demoT0) / CYC), t0 = demoT0 + k * CYC, guilty = k % 3 === 0, adjourned = k % 3 === 2
    const end = t0 + 16_000
    for (const o of snap.sessions) { if (o.tool === 'AskUserQuestion') o.tool = null; if (o.ext?.meeting) o.ext.meeting = null; for (const g of o.agents || []) if (g.phase && SOCIAL_REVIEW.test(g.phase)) g.phase = 'build' }
    s.ext ??= {}
    s.ext.courtroom = { id: 'demo-' + k, kind: 'skill', name: guilty ? 'devils-advocate-review' : 'security-review', start: t0, end: now >= end ? end : null,
      jurors: ['Review the diff', 'Check the tests'],
      ...(now >= end ? guilty
        ? { verdict: 'guilty', count: 3, nits: 0, charges: ['unwrap on user input in parse_amount', 'the retry loop never backs off', 'a test asserts on a log line'] }
        : adjourned ? { verdict: 'adjourned', count: 0, nits: 0, charges: [] }
        : { verdict: 'acquitted', count: 0, nits: 1, charges: ['a comment restates the code'] } : {}) }
  })
  const sessions = () => tower.snapshot?.sessions || []
  const sessionOf = id => sessions().find(s => s.id === id)
  const room = () => tower.floor('meeting')
  // social.js holds the room for a session asking the user something or a workflow's review-like phase; standup.js at 10:00
  const asking = s => s.tool === 'AskUserQuestion' || (s.state === 'waiting' && !!s.ext?.meeting?.asking)
  const live = id => { const p = tower.person(id); return p && !p.leaving }
  const busy = () => tower.people.some(p => !sent.has(p.id) && p.activity && (p.activity.startsWith('meeting:') || p.activity === 'standup'))
    || sessions().some(s => (asking(s) && live(s.id)) || (s.agents || []).some(g => g.phase && g.state !== 'done' && SOCIAL_REVIEW.test(g.phase)))

  function pick(now) {
    const list = []
    for (const s of sessions()) {
      const t = s.ext?.courtroom; if (!t?.id) continue
      if (!t.end) list.push({ s, t })
      else if (!played.has(t.id) && (court?.t.id === t.id || Date.now() - t.end < LATE_MS)) list.push({ s, t })
    }
    if (court) { const same = list.find(x => x.t.id === court.t.id); if (same) return same }
    return list.sort((a, b) => a.t.start - b.t.start)[0] || null
  }

  function plan(now) {
    const f = room(), m = tower.meeting
    if (!f || !m) return
    if (court?.over && now - court.over > FADE_MS) { finish(); return }
    if (court?.over) { book(false); return }
    const hit = pick(now)
    if (!hit && court && !court.verdictAt) { court.over = now; release(); return }
    if (!hit && !court) return
    if (busy()) { if (court && !court.paused) { court.paused = true; release(); book(false) } return }
    if (!court) court = { t: hit.t, s: hit.s, t0: now, said: [], paused: false, over: 0 }
    court.paused = false
    if (hit) { court.t = hit.t; court.s = hit.s }
    if (court.t.end && !court.readAt) court.readAt = now
    const n = Math.max(1, court.t.charges?.length || 0)
    if (court.readAt && !court.verdictAt && now - court.readAt > n * READ_MS + 800) court.verdictAt = now
    if (court.verdictAt && now - court.verdictAt > HOLD_MS) { played.add(court.t.id); court.over = now; release(); return }
    book(true); steer()
  }
  function steer() {
    const want = new Map()
    const me = tower.person(court.s.id)
    if (me && !me.leaving) want.set(me.id, { x: DOCK.x + DOCK.w / 2, face: 'left', pose: 'stand', role: 'dock' })
    const agents = (court.s.agents || []).filter(g => g.state !== 'done').sort((a, b) => (/review|check|audit/i.test(b.description) ? 1 : 0) - (/review|check|audit/i.test(a.description) ? 1 : 0))
    agents.slice(0, SEATS.length).forEach((g, i) => { const p = tower.person(g.id); if (p && !p.leaving) want.set(p.id, { x: SEATS[i], face: 'left', pose: 'sit', seatH: SEAT_H.dining, role: 'jury' }) })
    for (const id of [...sent.keys()]) if (!want.has(id)) { tower.release(id); sent.delete(id) }
    let budget = 2
    for (const [id, w] of want) {
      const p = tower.person(id)
      if (sent.get(id) === w.x && p?.steered) continue
      if (p && p.floor && p.floor !== 'meeting' && (budget <= 0 || tower.liftLoad(p.floor) > 3)) continue
      budget--
      if (tower.sendTo(id, 'meeting', w.x, { face: w.face, pose: w.pose, seatH: w.seatH, activity: 'court:' + w.role })) sent.set(id, w.x)
    }
  }
  function release() { for (const id of sent.keys()) tower.release(id); sent.clear() }
  function finish() { release(); book(false); court = null }
  // the room is booked: its seats come off the break list, as social.js does for a meeting
  let stash = null
  function book(on) {
    const sp = tower.crowd?.spots; if (!Array.isArray(sp)) return
    if (on) { if (stash?.arr === sp) return; const out = []; for (let i = sp.length - 1; i >= 0; i--) if (sp[i].floor === 'meeting') out.push(...sp.splice(i, 1)); stash = { arr: sp, out } }
    else if (stash) { if (stash.arr === sp) sp.push(...stash.out); stash = null }
  }

  tower.on('step', (dt, now) => {
    if (now - planAt > 700) { planAt = now; plan(now) }
    if (!court || court.paused) return
    for (const id of sent.keys()) {
      const a = tower.crowd?.find?.(id), p = tower.person(id)
      if (!a || !p || p.walking || p.floor !== 'meeting' || a.pose !== 'spot') continue
      a.face = 'left'; a.anim = p.kind === 'session' ? null : 'read'
    }
  })
  tower.on('layout', () => { planAt = 0; stash = null })

  // ---------- the scene ----------
  const fade = now => !court || court.paused ? 0 : court.over ? Math.max(0, 1 - (now - court.over) / FADE_MS) : Math.min(1, (now - court.t0) / FADE_MS)
  const phase = now => !court ? null : court.verdictAt ? 'verdict' : court.readAt ? 'reading' : 'session'
  function bang(now) {   // 0..1 while the gavel is up, else 0
    if (!court) return 0
    const at = court.verdictAt || (court.readAt && now - court.readAt < 900 ? court.readAt : 0) || (now - court.t0 < 2400 ? court.t0 + 900 : 0)
    if (!at) { const k = (now - court.t0) % 14_000; return k < 500 ? Math.sin(k / 500 * Math.PI) : 0 }
    const k = now - at; return k >= 0 && k < BANG_MS ? Math.abs(Math.sin(k / BANG_MS * Math.PI * 3)) : 0
  }
  function drape(c, f) {
    const x = DRAPE.x, y = f.top + 12, h = f.y - 24 - y
    R(c, '#4a1a1e', x, y, DRAPE.w, h); c.fillStyle = '#5e2228'; for (let i = 3; i < DRAPE.w; i += 6) c.fillRect(x + i, y, 2, h)
    R(c, BRASS, x - 2, y - 1, DRAPE.w + 4, 2)
    const cx = x + DRAPE.w / 2, cy = y + 11
    R(c, BRASS, cx - 6, cy - 6, 13, 13); R(c, '#e8d8a8', cx - 5, cy - 5, 11, 11); R(c, BRASS, cx - 4, cy - 4, 9, 9); R(c, '#4a1a1e', cx - 3, cy - 3, 7, 7)
    R(c, BRASS, cx, cy - 2, 1, 5); R(c, BRASS, cx - 2, cy - 2, 5, 1); R(c, BRASS, cx - 2, cy - 1, 1, 2); R(c, BRASS, cx + 2, cy - 1, 1, 2); R(c, BRASS, cx - 1, cy + 3, 3, 1)
  }
  function judge(c, f, now) {
    const x = JUDGE, y = f.y - BENCH.h - 2, up = bang(now)
    R(c, '#1a1a22', x - 6, y - 8, 13, 12)                           // robe
    R(c, '#f4f0e6', x - 1, y - 8, 3, 3)                             // bands
    R(c, '#f1c9a5', x - 3, y - 15, 7, 7)                            // face
    R(c, '#2a1e16', x - 2, y - 12, 1, 1); R(c, '#2a1e16', x + 2, y - 12, 1, 1)
    R(c, '#ece8de', x - 4, y - 17, 9, 3); R(c, '#ece8de', x - 5, y - 15, 2, 8); R(c, '#ece8de', x + 4, y - 15, 2, 8)   // the wig
    c.fillStyle = '#c8c2b4'; for (let i = 0; i < 4; i++) { c.fillRect(x - 5, y - 13 + i * 2, 2, 1); c.fillRect(x + 4, y - 13 + i * 2, 2, 1) }
    const hx = x + 7, hy = y - 4 - Math.round(up * 6)                // the gavel arm
    R(c, '#1a1a22', x + 5, hy, 3, y - 3 - hy + 1); R(c, '#f1c9a5', hx, hy - 1, 2, 2)
    R(c, '#8a5a2a', hx + 1, hy - 4, 1, 4); R(c, '#6a3a1a', hx - 1, hy - 6, 6, 3)
  }
  function clerk(c, f) {
    const x = CLERK.x + 12, y = f.y - CLERK.h
    R(c, '#2a3a5a', x - 4, y - 9, 9, 10); R(c, '#f4f0e6', x - 1, y - 9, 3, 2)
    R(c, '#d9a47e', x - 3, y - 15, 7, 6); R(c, '#5a3a22', x - 3, y - 16, 7, 2); R(c, '#2a2a30', x - 2, y - 13, 2, 1); R(c, '#2a2a30', x + 1, y - 13, 2, 1)
  }
  function front(c, f, now) {
    // the bench
    const b = BENCH, by = f.y - b.h
    R(c, WOOD_LO, b.x - 1, by - 2, b.w + 2, 3); R(c, WOOD_HI, b.x - 2, by - 3, b.w + 4, 2)
    R(c, WOOD, b.x, by, b.w, b.h); for (let i = 0; i < 3; i++) { R(c, WOOD_LO, b.x + 5 + i * 20, by + 5, 16, 14); R(c, WOOD_HI, b.x + 6 + i * 20, by + 6, 14, 12); R(c, WOOD, b.x + 7 + i * 20, by + 7, 12, 10) }
    R(c, BRASS, b.x + b.w / 2 - 6, by + 1, 12, 2)
    R(c, '#6a3a1a', JUDGE + 9, by - 5, 6, 2); R(c, '#4a2a12', JUDGE + 10, by - 3, 4, 1)   // the sounding block
    if (bang(now) < 0.15 && court?.verdictAt && now - court.verdictAt < BANG_MS) { c.fillStyle = '#fff4c8'; c.fillRect(JUDGE + 6, by - 9, 1, 2); c.fillRect(JUDGE + 16, by - 9, 1, 2); c.fillRect(JUDGE + 11, by - 11, 1, 2) }
    // the clerk's desk, with a typewriter
    const k = CLERK, ky = f.y - k.h
    R(c, WOOD, k.x, ky, k.w, k.h); R(c, WOOD_HI, k.x - 1, ky - 1, k.w + 2, 2); R(c, WOOD_LO, k.x + 3, ky + 3, k.w - 6, k.h - 5)
    R(c, '#3a3a42', k.x + 4, ky - 4, 10, 3); R(c, '#f4f0e6', k.x + 6, ky - 7, 6, 3)
    // the dock
    const d = DOCK, dy = f.y - d.h
    R(c, WOOD, d.x, dy, d.w, d.h); R(c, WOOD_HI, d.x - 1, dy - 1, d.w + 2, 2); R(c, WOOD_LO, d.x + 3, dy + 3, d.w - 6, d.h - 5)
    for (const px of [d.x, d.x + d.w - 2]) R(c, BRASS, px, dy - 6, 2, 6)
    R(c, BRASS, d.x, dy - 6, d.w, 1)
    // the jury box
    const j = JURY, jy = f.y - j.h
    R(c, WOOD, j.x, jy, j.w, j.h); R(c, WOOD_HI, j.x - 1, jy - 1, j.w + 2, 2)
    for (let i = 0; i < 4; i++) R(c, WOOD_LO, j.x + 4 + i * 22, jy + 3, 18, j.h - 5)
    for (let px = j.x; px <= j.x + j.w - 2; px += 23) R(c, BRASS, px, jy - 7, 2, 7)
    R(c, BRASS, j.x, jy - 7, j.w, 1)
  }
  function back(c, f) {
    // the jury's bench and a sign from the ceiling
    R(c, '#4a3020', JURY.x + 2, f.y - 20, JURY.w - 4, 3)
    const s = SIGN, y = f.top + 12
    R(c, '#4a4452', s.x + 6, f.top, 1, 12); R(c, '#4a4452', s.x + s.w - 7, f.top, 1, 12)
    R(c, '#2a1a12', s.x, y, s.w, s.h); R(c, '#3e2614', s.x + 1, y + 1, s.w - 2, s.h - 2)
    pixText(c, 'IN SESSION', s.x + 7, y + 2, BRASS)
  }
  tower.on('items', (out, now) => {
    const f = room(), m = tower.meeting, a = fade(now); if (!f || !m || a <= 0) return
    const tb = m.table, wrap = fn => c => { c.globalAlpha = a; fn(c); c.globalAlpha = 1 }
    out.push({ z: Z.WALL + 3, draw: wrap(c => { drape(c, f); back(c, f) }) })
    out.push({ z: Z.SEATED - 2, draw: wrap(c => { judge(c, f, now); clerk(c, f) }) })
    out.push({ z: Z.FRONT + 1, draw: wrap(c => R(c, 'rgba(18,16,26,.5)', tb.x - 2, tb.y - 2, tb.w + 4, tb.h + 2)) })
    out.push({ z: Z.FRONT + 2, draw: wrap(c => front(c, f, now)) })
  })
  tower.on('glow', (c, now, n) => {
    const f = room(), a = fade(now); if (!f || a <= 0 || n < 0.03) return
    const x = DRAPE.x + DRAPE.w / 2, y = f.top + 23, g = c.createRadialGradient(x, y, 0, x, y, 30)
    g.addColorStop(0, `rgba(255,210,140,${0.35 * n * a})`); g.addColorStop(1, 'rgba(255,210,140,0)'); c.fillStyle = g; c.fillRect(x - 30, y - 30, 60, 60)
  })

  // ---------- who speaks, and the stamp ----------
  function speech(now) {
    const p = phase(now), t = court.t, k = now - court.t0
    if (p === 'session') {
      if (k < 3500) return { who: 'clerk', text: 'All rise!' }
      if (k < 8000) return { who: 'judge', text: `Order! The court hears ${t.name}.` }
      const cyc = Math.floor((k - 8000) / 9000) % 4, on = (k - 8000) % 9000 < 3800
      if (!on) return null
      return [{ who: 'judge', text: 'The jury will consider the diff.' }, { who: 'clerk', text: `Exhibit ${1 + Math.floor(k / 9000) % 9}: the diff` }, { who: 'judge', text: 'Order in the court!' }, { who: 'clerk', text: 'The jury is still out…' }][cyc]
    }
    if (p === 'reading') {
      const list = t.charges || [], i = Math.floor((now - court.readAt) / READ_MS)
      if (!list.length) return { who: 'clerk', text: 'No charges filed, Your Honour.' }
      if (i >= list.length) return null
      return { who: 'clerk', text: `${t.verdict === 'guilty' ? 'Count' : 'Note'} ${i + 1}: ${list[i]}` }
    }
    if (p === 'verdict' && now - court.verdictAt < 4000) return { who: 'judge', text: t.verdict === 'guilty' ? `Guilty on ${t.count} count${t.count === 1 ? '' : 's'}!` : t.verdict === 'adjourned' ? 'Court adjourned — no ruling.' : 'Acquitted. Court is adjourned.' }
    return null
  }
  tower.on('overlay', (c, now) => {
    const f = room(); if (!f || !court || court.paused || fade(now) < 0.5) return
    const k = tower.zoom
    const sp = speech(now)
    if (sp && k >= 1.6) {
      const at = sp.who === 'judge' ? tower.worldToScreen(JUDGE, f.y - BENCH.h - 22) : tower.worldToScreen(CLERK.x + 12, f.y - CLERK.h - 20)
      const text = sp.text.length > 70 ? sp.text.slice(0, 69) + '…' : sp.text
      tower.bubble(at.x, at.y, (sp.who === 'judge' ? '⚖️ ' : '📜 ') + text, sp.who === 'judge' ? '#8a2a2a' : '#2a3a5a')
    }
    if (phase(now) !== 'verdict') return
    const t = court.t, guilty = t.verdict === 'guilty', age = now - court.verdictAt
    const o = tower.worldToScreen(IX + 200, f.top + 38), s = Math.max(0.5, k / 3) * (1 + Math.max(0, 1 - age / 260) * 0.8)
    const adj = t.verdict === 'adjourned'
    const main = guilty ? `GUILTY — ${t.count} COUNT${t.count === 1 ? '' : 'S'}` : adj ? 'ADJOURNED' : 'ACQUITTED', sub = !guilty && !adj && t.nits ? `with ${t.nits} nit${t.nits === 1 ? '' : 's'}` : ''
    const col = guilty ? '#c8352f' : adj ? '#7a7f88' : '#2f9a4a'
    c.save(); c.translate(o.x, o.y); c.rotate(-0.11); c.scale(s, s)
    c.globalAlpha = Math.min(1, age / 160) * Math.min(1, (HOLD_MS - age) / 800)
    c.font = tower.font(26, 900); const w = c.measureText(main).width + 28, h = sub ? 50 : 38
    c.fillStyle = 'rgba(255,250,240,.82)'; c.fillRect(-w / 2, -h / 2, w, h)
    c.strokeStyle = col; c.lineWidth = 4; c.strokeRect(-w / 2, -h / 2, w, h); c.lineWidth = 1.5; c.strokeRect(-w / 2 + 5, -h / 2 + 5, w - 10, h - 10)
    c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(main, 0, sub ? -6 : 1)
    if (sub) { c.font = tower.font(12, 700); c.fillText(sub, 0, 15) }
    c.restore()
  })

  // ---------- hover ----------
  tower.on('hover', (w, person) => {
    const f = room(); if (!f || !court || court.paused) return null
    if (person && !sent.has(person.id)) return null
    const on = (x, wd, top) => w.x >= x && w.x <= x + wd && w.y >= top && w.y <= f.y
    if (!person && !on(BENCH.x, BENCH.w, f.y - BENCH.h - 20) && !on(DOCK.x, DOCK.w, f.y - DOCK.h - 6) && !on(JURY.x, JURY.w, f.y - JURY.h) && !on(CLERK.x, CLERK.w, f.y - CLERK.h - 16)) return null
    const t = court.t, s = sessionOf(court.s.id) || court.s, mins = ms => Math.max(0, Math.round(ms / 60000)) + 'm'
    const st = t.end ? (t.verdict === 'guilty' ? `<b style="color:#ef5a5a">guilty — ${t.count} count${t.count === 1 ? '' : 's'}</b>` : t.verdict === 'adjourned' ? '<b style="color:#9aa0a8">adjourned</b> · no ruling' : `<b style="color:#5fd17a">acquitted</b>${t.nits ? ` · ${t.nits} nit${t.nits === 1 ? '' : 's'}` : ''}`) : `<b style="color:#f2a43a">in session</b> · ${mins(Date.now() - t.start)}`
    const counts = (t.charges || []).map((x, i) => `<div class="m">${i + 1}. ${esc(x)}</div>`).join('')
    const jury = t.jurors?.length ? `<div class="m">jury: ${t.jurors.map(esc).join(' · ')}</div>` : ''
    return `<div class="t">⚖️ ${esc(s.title || '')} v. ${esc(t.name)}</div><div class="m">${st}</div>${jury}${counts}`
  })
  tower.on('mode', on => { if (on && demo && !params.get('towerzoom')) setTimeout(() => { const f = room(); f && tower.flyTo({ x: IX + 170, y: f.y - 34 }, 4) }, 600) })
}
