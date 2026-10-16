// tug-of-war: when a git merge/rebase/cherry-pick/pull/stash pop on a session (or one of its agents) hits a CONFLICT
// (server ext 'tug-of-war'), the one who ran it and "the other branch" — a red-capped stranger off the elevator — heave a
// rope across that floor, a red flag swaying over the chalk line and a '⚔ CONFLICT: <file>' tag above it. When a later
// git command gets through, the flag crosses, the stranger falls over in a puff of dust and leaves; an abort lets the
// rope go slack instead. Hover the rope for the files, click to open the session. ?demo=tugofwar fakes one.
import { IX } from '../building.js'
import { R } from '../draw.js'

const MID = IX + 204, HALF = 46, MIN_PULL = 9000, END = 2600, LIE = 2200, FRESH_END = 45_000
const ROPE = '#c9a66b', ROPE_D = '#8f6f3e', FLAG = '#d8352a'
const base = f => String(f || '').split('/').pop()

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('tugofwar')
  const bouts = new Map()   // session id -> bout
  const seen = new Set()
  const look = api.lookOf('the-other-branch')
  let dust = []

  function start(s, c, ended) {
    const key = `${c.who}|${c.since}`
    if (seen.has(key)) return
    const f = tower.floorOf(s.id); if (!f || f.kind !== 'session') return
    seen.add(key)
    const b = { key, s, sid: s.id, fid: f.id, who: c.who, c, phase: 'walk', t0: performance.now(), pullAt: null, endAt: null, how: null, mine: false, ready: { a: false, b: false } }
    if (ended) b.pendingEnd = ended.how
    const p = tower.person(c.who) || tower.person(s.id)
    if (p && !p.leaving && !p.steered && api.live !== false) {
      b.a = p.id
      if (tower.sendTo(p.id, f.id, MID - HALF, { face: 'right', pose: 'stand', anim: 'type', activity: 'tug-of-war', then: () => { b.ready.a = true } })) b.mine = true
      else b.a = null
    }
    if (!b.a) {
      b.stand = tower.spawn({ id: `tug-a-${s.id}`, floor: f.id, x: tower.interior.x1 - 8, z: Z.STAND + 3, look: p?.look || api.lookOf(s.id) })
      b.stand.go(f.id, MID - HALF, { face: 'right', anim: 'type', then: () => { b.ready.a = true } })
    }
    b.npc = tower.spawn({ id: `tug-b-${s.id}`, floor: f.id, x: tower.interior.x1 - 8, z: Z.STAND + 3, draw: (cx, q, now) => drawStranger(b, cx, q, now) })
    b.npc.go(f.id, MID + HALF, { face: 'left', then: () => { b.ready.b = true } })
    bouts.set(s.id, b)
  }
  function finish(b, how) {
    if (b.phase === 'end' || b.phase === 'out') return
    if (b.phase !== 'pull' || performance.now() - b.pullAt < MIN_PULL) { b.pendingEnd = how; return }
    b.phase = 'end'; b.how = how; b.endAt = performance.now()
  }
  function teardown(b) {
    if (b.mine && b.a) tower.release(b.a)
    if (b.stand && !b.stand.gone) b.stand.leave()
    if (b.npc && !b.npc.gone) b.npc.leave()
    bouts.delete(b.sid)
  }

  tower.on('sync', data => {
    const now = Date.now()
    for (const s of data.sessions) {
      const x = s.ext?.['tug-of-war'], b = bouts.get(s.id)
      if (s.running === false || !x) { if (b && b.phase !== 'end' && b.phase !== 'out') finish(b, 'resolved'); continue }
      const open = x.open?.find(o => o.who === s.id) || x.open?.[0]
      if (b) {
        b.s = s
        const done = x.ended?.find(e => `${e.who}|${e.since}` === b.key)
        if (open && `${open.who}|${open.since}` === b.key) b.c = open
        else if (done) finish(b, done.how)
        else if (b.phase !== 'end' && b.phase !== 'out') finish(b, 'resolved')
        continue
      }
      if (open) start(s, open)
      else for (const e of x.ended || []) if (now - e.end < FRESH_END) { start(s, e, e); break }
    }
    for (const [sid, b] of bouts) if (!data.sessions.some(s => s.id === sid)) teardown(b)
  })

  tower.on('step', (dt, now) => {
    for (const b of [...bouts.values()]) {
      if (!tower.floor(b.fid)) { teardown(b); continue }
      if (b.mine) { const p = tower.person(b.a); if (!p || !p.steered || (p.activity && p.activity !== 'tug-of-war')) { b.mine = false; b.a = null; b.ready.a = b.phase === 'walk' ? false : b.ready.a; if (b.phase === 'walk') { b.stand = tower.spawn({ id: `tug-a-${b.sid}`, floor: b.fid, x: tower.interior.x1 - 8, z: Z.STAND + 3, look: api.lookOf(b.sid) }); b.stand.go(b.fid, MID - HALF, { face: 'right', anim: 'type', then: () => { b.ready.a = true } }) } } }
      if (b.phase === 'walk') {
        if (b.ready.a && b.ready.b) { b.phase = 'pull'; b.pullAt = now }
        else if (now - b.t0 > 60_000) teardown(b)
      } else if (b.phase === 'pull') {
        if (b.pendingEnd && now - b.pullAt >= MIN_PULL) { const h = b.pendingEnd; b.pendingEnd = null; finish(b, h) }
      } else if (b.phase === 'end') {
        const t = now - b.endAt
        if (b.how !== 'aborted' && !b.dusted && t > END * 0.55) { b.dusted = true; puff(b) }
        if (t > END + LIE) { b.phase = 'out'; teardown(b) }
      }
    }
    dust = dust.filter(d => (d.t += dt) < d.life)
    for (const d of dust) { d.x += d.vx * dt; d.y += d.vy * dt; d.vy += 10 * dt }
  })
  function puff(b) {
    const f = tower.floor(b.fid); if (!f) return
    const x = b.npc?.x ?? MID + HALF
    for (let i = 0; i < 14; i++) dust.push({ x: x + 4 + (Math.random() - 0.3) * 14, y: f.y - 2 - Math.random() * 3, vx: (Math.random() - 0.3) * 26, vy: -8 - Math.random() * 14, t: 0, life: 0.7 + Math.random() * 0.6, r: 1 + Math.random() * 2 })
  }

  // ---------- geometry ----------
  function sway(b, now) {
    const t = (now - (b.pullAt || now)) / 1000
    let off = 5 * Math.sin(t * 1.25) + 2.5 * Math.sin(t * 3.4 + 1) + 1.2 * Math.sin(t * 7.7)
    if (b.phase === 'end') {
      const k = Math.min(1, (now - b.endAt) / (END * 0.55)), e = k * k * (3 - 2 * k)
      if (b.how === 'aborted') return { off: off * (1 - e), slack: e }
      off = off * (1 - e) - (HALF - 14) * e
    }
    return { off, slack: 0 }
  }
  function ends(b, f) {
    const pa = b.a ? tower.person(b.a) : b.stand && !b.stand.gone ? { x: b.stand.x } : null
    const xa = (pa?.x ?? MID - HALF) + 5, xb = (b.npc && !b.npc.gone ? b.npc.x : MID + HALF) - 5
    return { xa, xb, y: f.y - 14 }
  }

  // ---------- the stranger (custom sprite so he can fall over) ----------
  function drawStranger(b, c, q, now) {
    const sheet = api.charSheet(look.palette, look.hue); if (!sheet?.width) return
    const fallen = b.phase === 'end' && b.how !== 'aborted' ? Math.min(1, Math.max(0, (now - b.endAt - END * 0.35) / (END * 0.25))) : 0
    let row = 2, frame = 1, flip = false
    if (q.riding) row = 0
    else if (q.walking) { flip = q.dir === 'left'; frame = [0, 1, 2, 1][Math.floor(now / 130) % 4] }
    else { flip = true; frame = b.phase === 'pull' ? 3 + Math.floor(now / 170) % 2 : 1 }
    const lean = b.phase === 'pull' && !q.walking ? 0.16 + 0.05 * Math.sin(now / 260) : 0
    const x = Math.round(q.x), y = Math.round(q.y)
    c.save()
    c.translate(x, y)
    c.translate(0, -8 * fallen)
    c.rotate(fallen ? fallen * Math.PI / 2 : lean)
    if (flip) c.scale(-1, 1)
    c.drawImage(sheet, frame * 16, row * 32, 16, 32, -8, -30, 16, 32)
    R(c, '#c0281f', -4, -27, 8, 2); R(c, 'rgba(255,255,255,.25)', -3, -27, 6, 1); R(c, '#c0281f', 3, -25, 3, 1)
    c.restore()
    if (fallen >= 1) {
      for (let i = 0; i < 3; i++) {
        const a = now / 300 + i * 2.1
        R(c, '#f4c64f', x + 10 + Math.cos(a) * 6, y - 10 + Math.sin(a) * 2, 1, 1)
      }
    }
  }

  // ---------- drawing ----------
  tower.on('items', (out, now, ctx) => {
    const v = ctx.view
    for (const b of bouts.values()) {
      const f = tower.floor(b.fid); if (!f || f.y < v.y0 - 10 || f.top > v.y1 + 10) continue
      out.push({ z: Z.FLOOR + 3, draw: c => {
        R(c, 'rgba(240,236,226,.6)', MID, f.y - 3, 1, 3)
        R(c, 'rgba(240,236,226,.35)', MID - 6, f.y - 1, 13, 1)
      } })
      if (b.phase === 'walk') { out.push({ z: Z.FLOOR + 4, draw: c => coil(c, MID - 4, f.y) }); continue }
      out.push({ z: Z.STAND + 5, draw: c => rope(c, b, f, now) })
    }
    if (dust.length) out.push({ z: Z.STAND + 6, draw: c => {
      for (const d of dust) { const a = 1 - d.t / d.life; c.fillStyle = `rgba(200,186,160,${(0.7 * a).toFixed(2)})`; const r = d.r + d.t * 4; c.fillRect(Math.round(d.x - r / 2), Math.round(d.y - r / 2), Math.ceil(r), Math.ceil(r)) }
    } })
  })
  function coil(c, x, y) {
    R(c, ROPE_D, x - 1, y - 3, 10, 3); R(c, ROPE, x, y - 4, 8, 2); R(c, ROPE_D, x + 2, y - 4, 1, 1); R(c, ROPE_D, x + 5, y - 3, 1, 1)
    R(c, FLAG, x + 3, y - 5, 3, 2)
  }
  function rope(c, b, f, now) {
    const { xa, xb, y } = ends(b, f), { off, slack } = sway(b, now)
    const sag = 1 + slack * 11, n = Math.max(2, Math.round(xb - xa))
    let fy = y
    const fx = Math.round((xa + xb) / 2 + off)
    for (let i = 0; i <= n; i++) {
      const t = i / n, x = xa + (xb - xa) * t, yy = y + Math.sin(Math.PI * t) * sag + (slack ? 0 : Math.sin(now / 90 + t * 9) * 0.35)
      R(c, i % 3 ? ROPE : ROPE_D, x, yy, 1, 1); R(c, 'rgba(0,0,0,.18)', x, yy + 1, 1, 1)
      if (Math.abs(x - fx) < 0.5) fy = yy
    }
    // the red flag tied on in the middle, swaying with the pull
    const w = Math.sin(now / 160) * 1.5
    R(c, '#5a4030', fx, fy - 1, 1, 3)
    c.fillStyle = FLAG
    c.beginPath(); c.moveTo(fx, fy + 1); c.lineTo(fx - 3 + w, fy + 8); c.lineTo(fx + 3 + w, fy + 8); c.closePath(); c.fill()
    R(c, 'rgba(255,255,255,.3)', fx, fy + 2, 1, 4)
    b.flag = { x: fx, y: fy }
  }

  tower.on('overlay', (c, now) => {
    if (!bouts.size || tower.zoom < tower.fitZoom() * 1.1) return
    const H = tower.canvas.clientHeight
    c.save(); c.textBaseline = 'middle'
    for (const b of bouts.values()) {
      const f = tower.floor(b.fid); if (!f || b.phase === 'out') continue
      const a = tower.worldToScreen(b.flag?.x ?? MID, f.y - 40)
      if (a.y < -40 || a.y > H + 40) continue
      const files = b.c.files || [], more = files.length > 1 ? ` +${files.length - 1}` : ''
      const done = b.phase === 'end', fs = Math.round(Math.max(10, Math.min(14, 3.4 * tower.zoom)))
      const label = done ? (b.how === 'aborted' ? `↩ ${b.c.op || 'merge'} aborted` : '✓ conflict resolved') : `⚔ CONFLICT: ${base(files[0]) || b.c.op || 'merge'}${more}`
      c.font = font(fs, 800)
      const t = fitText(label, 260, c.font), tw = c.measureText(t).width + 14, h = fs + 9
      const x = Math.round(a.x - tw / 2), y = Math.round(a.y - h + (done ? 0 : Math.sin(now / 300) * 1.5))
      c.globalAlpha = done ? Math.max(0, 1 - (now - b.endAt) / (END + LIE)) : 1
      c.fillStyle = 'rgba(0,0,0,.28)'; c.beginPath(); c.roundRect(x + 2, y + 2, tw, h, 4); c.fill()
      c.fillStyle = done ? (b.how === 'aborted' ? '#6a6470' : '#2f7a41') : '#b3261e'; c.beginPath(); c.roundRect(x, y, tw, h, 4); c.fill()
      c.fillStyle = '#fff7f0'; c.fillText(t, x + 7, y + h / 2 + 0.5)
      c.globalAlpha = 1
    }
    c.restore()
  })

  // ---------- hover / click ----------
  const hit = w => {
    for (const b of bouts.values()) {
      const f = tower.floor(b.fid); if (!f || b.phase === 'out') continue
      if (w.x >= MID - HALF - 8 && w.x <= MID + HALF + 8 && w.y >= f.y - 34 && w.y <= f.y + 2) return b
    }
    return null
  }
  tower.on('hover', (w, person) => {
    const b = hit(w); if (!b || (person && person.id !== b.a)) return null
    const mins = Math.max(0, Math.round((Date.now() - b.c.since) / 60000))
    const files = (b.c.files || []).slice(0, 8).map(f => `<div style="font-family:ui-monospace,Menlo,monospace">${esc(f)}</div>`).join('')
    return `<div class="t">Merge conflict · ${esc(b.s.title)}</div><div class="m">${esc(b.c.op || 'merge')} hit a conflict${mins ? ` ${mins}m ago` : ''}${b.who !== b.sid ? ' · a subagent' : ''}${b.phase === 'end' ? ` · ${b.how}` : ''}</div>${files}`
      + `<div class="m" style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:420px">${esc(b.c.cmd || '')}</div><div class="m">click to open in Orca</div>`
  })
  tower.on('click', w => { const b = hit(w); if (!b) return false; tower.focusSession(b.s); return true })

  // ---------- ?demo=tugofwar ----------
  if (!demo) return
  let t0 = 0
  tower.on('snapshot', data => {
    const now = Date.now()
    if (!data.sessions.length) data.sessions.push({ id: '00000000-0000-4000-8000-000000000051', title: 'LEDGER', cwd: null, branch: null, worktree: null, running: true, endedAt: null, state: 'tool', tool: 'Bash', detail: null, lastActivity: now, agents: [], ext: {} })
    const s = data.sessions.find(s => s.running !== false) || data.sessions[0]
    if (!t0) { t0 = now; if (!params.get('towerzoom')) setTimeout(() => { const f = tower.floorOf(s.id); if (f) tower.flyTo({ x: MID, y: f.y - 30 }, Number(params.get('tugzoom')) || 3.2) }, 800) }
    const cyc = 40_000, k = Math.floor((now - t0) / cyc), into = (now - t0) % cyc, since = t0 + k * cyc
    const c = { who: s.id, since, at: since, files: ['web-app/src/lib/api-client/openapi.json', 'web-app/src/lib/api-client/schema.d.ts'], cmd: 'git rebase origin/trunk 2>&1 | tail -20; git status --short', op: 'rebase' }
    s.running = true
    s.ext = { ...s.ext, 'tug-of-war': into < 26_000 ? { open: [c], ended: [] } : { open: [], ended: [{ ...c, end: since + 26_000, how: k % 3 === 2 ? 'aborted' : 'resolved' }] } }
  })
}
