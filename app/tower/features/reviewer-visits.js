// reviewer-visits: a colleague who reviews or comments on one of the user's PRs (snap.street.events, target == the user) walks
// out of their building on the street, into the lobby, up the elevator to the floor that owns the PR (its branch is the
// head, or the session opened it; else the CEO office), sticks a note on the wall (✓ approved, ✎ changes requested,
// 💬 comment) and walks home. A note stays an hour, or until the PR's branch gets a push. Hover: who, what, which PR;
// click opens the PR. ?demo=reviewervisits sends three neighbours up, one after another.
import { R } from '../draw.js'
const KIND = {
  approved: { glyph: '✓', paper: '#9fe0a0', edge: '#5aa860', ink: '#1f5a2a', label: 'approved' },
  changes: { glyph: '✎', paper: '#ffc98a', edge: '#d0883a', ink: '#7a3a10', label: 'requested changes on' },
  comment: { glyph: '💬', paper: '#fff08a', edge: '#d0b83a', ink: '#5a4a10', label: 'commented on' },
}
const RANK = { comment: 0, changes: 1, approved: 2 }
const LIFE = 3600_000, MERGE = 3 * 60_000, STICK = 1.6, MAX_WALKERS = 3, PER_ROW = 6
const kindOf = e => e.type === 'review' && e.review === 'approved' ? 'approved' : e.type === 'review' && e.review === 'changes_requested' ? 'changes' : 'comment'

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = api.params, demo = api.demo('reviewervisits')
  const notes = new Map()          // actor|pr -> { key, who, pr, kind, at, posted, said }
  const seen = new Set(), queue = [], walkers = []
  let st = null, sessions = [], primed = false, demoT0 = 0, demoN = 0, demoPrs = new Map(), npcN = 0

  // ---------- data ----------
  function floorFor(pr) {
    if (demoPrs.has(pr)) return tower.floor(demoPrs.get(pr)) ? demoPrs.get(pr) : 'ceo'
    const head = st?.mine?.find(p => p.number === pr)?.headRefName
    const s = sessions.find(s => head && s.branch === head) || sessions.find(s => { const k = s.ext?.['pr-celebration']?.pr; return k?.n === pr && (!k.repo || !st?.repo || k.repo === st.repo) })
    return s && tower.floor(s.id) ? s.id : 'ceo'
  }
  function take(e, walk) {
    const key = `${e.actor}|${e.pr}`, kind = kindOf(e), old = notes.get(key)
    const said = st?.said?.find(s => s.actor === e.actor && s.pr === e.pr && Math.abs(s.at - e.at) < MERGE)?.said || null
    if (old && Math.abs(e.at - old.at) < MERGE + (old.posted ? 0 : 60_000)) {   // the same review's several events: one note
      if (RANK[kind] > RANK[old.kind]) old.kind = kind
      old.at = Math.max(old.at, e.at); old.said = old.said || said
      return
    }
    const n = { key, who: e.actor, pr: e.pr, kind, at: e.at, posted: !walk, said, title: st?.mine?.find(p => p.number === e.pr)?.title || '' }
    notes.set(key, n)
    if (walk) queue.push(n)
  }
  tower.on('sync', data => {
    sessions = data.sessions
    if (demo) fakeTick(data)
    if (data.street?.status !== 'ok') return
    st = data.street
    const now = Date.now()
    const evs = (st.events || []).filter(e => (e.type === 'review' || e.type === 'comment') && e.target === st.me && e.actor !== st.me && !e.bot && e.pr != null)
    for (const e of evs) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      if (now - e.at < LIFE) take(e, primed && now - e.at < 10 * 60_000)
    }
    for (const [k, n] of notes) {
      if (n.demo) continue
      const pushed = (st.events || []).some(e => e.type === 'push' && e.pr === n.pr && e.at > n.at)
      if (now - n.at > LIFE || pushed) notes.delete(k)
    }
    primed = true
  })

  // ---------- the walk: their building's door → lobby → elevator → the wall → back home ----------
  const bOf = login => (tower.street.buildings || []).find(b => b.e.login === login)
  const homeX = login => { const b = bOf(login); return b ? b.x0 + b.w / 2 + 13 : null }
  function slots(fid) {
    const f = tower.floor(fid); if (!f) return null
    if (f.kind === 'ceo') {
      const fame = tower.slots?.fame, x0 = fame ? fame.x + 2 : f.x0 + 86, y0 = (fame ? fame.y + fame.h : f.top + 55) + 3
      return { at: i => ({ x: x0 + (i % 8 < 4 ? (i % 4) * 9 : 108 + (i % 4) * 9), y: y0 + Math.floor(i / 8) * 9 }), max: 16 }
    }
    const x0 = f.x1 - 92, y0 = f.top + 8
    return { at: i => ({ x: x0 + (i % PER_ROW) * 9, y: y0 + Math.floor(i / PER_ROW) * 9 }), max: PER_ROW * 2 }
  }
  const standAt = fid => { const s = slots(fid), i = onFloor(fid).length + walkers.filter(w => w.fid === fid && !w.n.posted).length; return s.at(Math.min(s.max - 1, i)).x + 3 }
  const onFloor = fid => [...notes.values()].filter(n => n.posted && floorFor(n.pr) === fid).sort((a, b) => a.at - b.at)
  function startWalk(n) {
    const fid = floorFor(n.pr), s = slots(fid); if (!s) { n.posted = true; return }
    const hx = homeX(n.who), id = `reviewer-${++npcN}`
    const npc = tower.spawn({ id, look: api.lookOf(n.who), ...(hx != null ? { floor: 'lobby', x: hx } : { from: 'street' }), z: Z.WALK })
    const w = { n, npc, fid, home: hx ?? npc.x, phase: 'up', t: 0 }, x = standAt(fid)
    walkers.push(w)
    npc.go(fid, x, { face: 'up', then: () => { w.phase = 'stick'; w.t = STICK } })
  }
  tower.on('step', dt => {
    while (queue.length && walkers.length < MAX_WALKERS) startWalk(queue.shift())
    for (let i = walkers.length - 1; i >= 0; i--) {
      const w = walkers[i]
      if (w.npc.gone) { w.n.posted = true; walkers.splice(i, 1); continue }
      if (w.phase === 'up' && !tower.floor(w.fid)) { w.fid = null; const x = standAt('ceo'); w.fid = 'ceo'; w.npc.go('ceo', x, { face: 'up', then: () => { w.phase = 'stick'; w.t = STICK } }) }
      if (w.phase === 'stick') {
        w.npc.pose({ face: 'up', anim: 'type' })
        if ((w.t -= dt) < STICK / 2 && !w.n.posted) { w.n.posted = true; w.n.stuckAt = performance.now() }
        if (w.t <= 0) { w.phase = 'home'; w.npc.go('lobby', w.home, { then: () => w.npc.remove() }) }
      }
    }
  })

  // ---------- the notes ----------
  function placed(view) {
    const out = []
    for (const f of tower.floors) {
      if (f.kind !== 'session' && f.kind !== 'ceo') continue
      if (view && (f.y < view.y0 - 10 || f.top > view.y1 + 10)) continue
      const list = onFloor(f.id); if (!list.length) continue
      const s = slots(f.id)
      list.slice(-s.max).forEach((n, i) => out.push({ n, ...s.at(i) }))
    }
    return out
  }
  tower.on('items', (out, now, ctx) => {
    const ps = placed(ctx.view)
    if (ps.length) out.push({ z: Z.WALL + 6, draw: c => { for (const p of ps) note(c, p, now) } })
  })
  function note(c, { n, x, y }, now) {
    const k = KIND[n.kind], age = n.stuckAt ? (now - n.stuckAt) / 400 : 1, sway = age < 1 ? Math.round(Math.sin(age * 9) * (1 - age)) : 0
    const h = n === hovered ? 1 : 0
    R(c, 'rgba(0,0,0,.22)', x + 1, y + 1, 7, 7)
    R(c, k.paper, x, y + sway - h, 7, 7); R(c, k.edge, x, y + 6 + sway - h, 7, 1); R(c, 'rgba(255,255,255,.45)', x, y + sway - h, 7, 1)
    R(c, '#c64545', x + 3, y + sway - h, 1, 1)
    c.fillStyle = k.ink; const g = x, gy = y + sway - h
    if (n.kind === 'approved') { c.fillRect(g + 1, gy + 3, 1, 1); c.fillRect(g + 2, gy + 4, 1, 1); c.fillRect(g + 3, gy + 3, 1, 1); c.fillRect(g + 4, gy + 2, 1, 1); c.fillRect(g + 5, gy + 1, 1, 1) }
    else if (n.kind === 'changes') { for (let i = 0; i < 4; i++) c.fillRect(g + 2 + i, gy + 5 - i, 1, 1); c.fillRect(g + 1, gy + 5, 1, 1) }
    else { c.fillRect(g + 1, gy + 2, 5, 1); c.fillRect(g + 1, gy + 4, 4, 1) }
    if (h) { c.strokeStyle = '#ffd84a'; c.lineWidth = 1; c.strokeRect(x - 0.5, y - 1.5, 8, 8) }
  }
  let hovered = null
  const hit = w => placed().find(p => w.x >= p.x - 1 && w.x <= p.x + 8 && w.y >= p.y - 1 && w.y <= p.y + 8)?.n || null
  const ago = at => { const m = Math.round((Date.now() - at) / 60_000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago` }
  tower.on('hover', (w, person) => {
    hovered = person ? null : hit(w)
    const n = hovered; if (!n) return null
    const k = KIND[n.kind]
    return `<div class="t">${k.glyph} ${esc(n.who)} ${k.label} #${n.pr}</div>${n.title ? `<div>${esc(n.title.slice(0, 70))}</div>` : ''}`
      + `${n.said ? `<div class="m">“${esc(n.said.slice(0, 140))}”</div>` : ''}<div class="m">${ago(n.at)} · ↗ click for the PR</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const n = hit(w); if (!n) return false
    const repo = st?.repo
    if (repo && !n.demo) api.openLink(`https://github.com/${repo}/pull/${n.pr}`); else api.toast(`${KIND[n.kind].glyph} ${n.who} · #${n.pr}`)
    return true
  })

  // ---------- demo ----------
  function fakeTick(data) {
    const ss = data.sessions.filter(s => s.running !== false)
    if (!demoT0) {
      demoT0 = Date.now()
      if (ss[0]) demoPrs.set(9001, ss[0].id)
      if (ss[1]) demoPrs.set(9002, ss[1].id)
      if (!params.get('towerzoom')) setTimeout(() => tower.flyTo({ x: -60, y: -40 }, 2.2), 400)
    }
    const t = Date.now() - demoT0, b = tower.street.buildings || [], who = i => b[i]?.e.login || ['bob-codes', 'alice-dev', 'erin-reviews'][i]
    const plan = [[1500, 0, 9001, 'review', 'approved', 'LGTM, ship it'], [7000, 1, 9002, 'review', 'changes_requested', 'Can we split the migration out?'], [12000, 2, 9003, 'comment', null, 'nit: rename this']]
    while (demoN < plan.length && t > plan[demoN][0]) {
      const [, i, pr, type, review, said] = plan[demoN++], at = Date.now()
      const n = { key: `${who(i)}|${pr}`, who: who(i), pr, kind: kindOf({ type, review }), at, posted: false, said, title: ['search every asset', 'export to CSV', 'token verifier'][pr - 9001], demo: true }
      notes.set(n.key, n); queue.push(n)
      if (demoN === 2 && !params.get('towerzoom')) setTimeout(() => tower.flyTo(floorFor(9001), 3), 9000)
    }
  }
}
