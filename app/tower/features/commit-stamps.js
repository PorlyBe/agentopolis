// commit-stamps: every git commit a session (or its agents) makes stamps a sheet into the OUT tray on the wall over its
// desk (snap.commits); hover the tray for the subjects. A git push bundles the tray's sheets for that branch, posts them
// into the floor's pneumatic-tube hatch, and the capsule drops to the post room, where the sheets land on the PR's
// parcel (matched by branch through street.mine): fresh tape and a "+N commits" sticker for STICKER_MS.
// ?demo=commitstamps fakes four commits and a push on the first floor, every 30 s.
import { IX1 } from '../building.js'

const TX = IX1 + 2, TW = 4, HX = IX1 - 9, STICKER_MS = 45 * 60_000, EMPTY_MS = 90_000, MAX_SHEETS = 9
const R = (c, col, x, y, w = 1, h = 1) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const inR = (w, r, pad = 0) => r && w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
const ease = t => t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2
const sameBranch = (a, b) => !!a && !!b && (a === b || (Math.min(a.length, b.length) >= 8 && (a.startsWith(b) || b.startsWith(a))))

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('commitstamps')
  const desks = new Map()      // session id -> { seen, tray: [doc], emptyAt, last: { branch, n, pr, at } }
  const stickers = new Map()   // PR number -> { n, at, subjects }
  const flights = []
  let mine = [], decorated = false

  // ---------- data ----------
  const prOf = branch => mine.find(p => sameBranch(p.headRefName, branch)) || null
  tower.on('sync', snap => {
    if (snap.street?.status === 'ok' && Array.isArray(snap.street.mine)) mine = snap.street.mine
    const all = snap.commits || {}
    for (const [sid, list] of Object.entries(all)) {
      let d = desks.get(sid)
      const fresh = !d
      if (!d) desks.set(sid, d = { seen: new Set(), tray: [], emptyAt: 0, last: null })
      let pushed = new Set(), delay = 0
      for (const e of list) {
        if (d.seen.has(e.id)) continue
        d.seen.add(e.id)
        if (e.k === 'c') d.tray.push({ id: e.id, subject: e.subject, sha: e.sha, branch: e.branch, t: e.t, born: fresh ? 0 : performance.now() + (delay++) * 700 })
        else if (e.k === 'a') { const top = d.tray[d.tray.length - 1]; if (top) Object.assign(top, { subject: e.subject || top.subject, sha: e.sha || top.sha, born: fresh ? 0 : performance.now() }) }
        else if (e.k === 'p') {
          const got = takeFor(d, e.branch, pushed)
          pushed.add(e.branch)
          if (!got.length) continue
          const pr = prOf(e.branch)
          d.last = { branch: e.branch, n: got.length, pr: pr?.number || null, at: e.t }
          if (fresh) continue
          d.emptyAt = Date.now()
          flights.push({ sid, docs: got, branch: e.branch, pr: pr?.number || null, phase: 'wait', t: delay ? -0.6 - delay * 0.7 : -0.3 })
        }
      }
    }
    for (const [sid] of desks) if (!all[sid] && !tower.floor(sid)) desks.delete(sid)
  })
  // the first branch a push names also takes the tray's sheets whose branch git never printed (-q commits)
  function takeFor(d, branch, pushed) {
    const out = [], keep = []
    for (const doc of d.tray) ((doc.branch ? sameBranch(doc.branch, branch) : !pushed.size) ? out : keep).push(doc)
    d.tray = keep
    return out
  }

  // ---------- geometry ----------
  function trayRect(sid) {
    const dk = tower.desk(sid); if (!dk) return null
    return { x: dk.desk.x + dk.desk.w - 14, y: dk.floor.y - 38, w: 12, h: 4 }
  }
  const hatch = f => ({ x: HX, y: f.y - 44, w: 8, h: 7 })
  const shown = d => d.tray.length || Date.now() - d.emptyAt < EMPTY_MS || flights.some(fl => fl.phase === 'wait' || fl.phase === 'lift')

  // ---------- motion ----------
  tower.on('step', (dt, now) => {
    if (!decorated && tower.postRoom) { decorated = true; tower.postRoom.decorate.push(decorate) }
    for (const fl of flights) {
      fl.t += dt
      const f = tower.floor(fl.sid), post = tower.floor('post'), tr = trayRect(fl.sid)
      if (!f || !tr) { land(fl); continue }
      if (fl.phase === 'wait' && fl.t >= 0) { fl.phase = 'lift'; fl.t = 0 }
      else if (fl.phase === 'lift' && fl.t >= 0.6) {
        fl.phase = 'out'; fl.t = 0; fl.x0 = tr.x + tr.w / 2; fl.y0 = tr.y - 3
        const h = hatch(f); fl.x1 = h.x + 4; fl.y1 = h.y + 3; fl.dur = Math.max(0.9, Math.abs(fl.x1 - fl.x0) / 240)
        if (demo) setTimeout(() => tower.flyTo({ x: IX1 - 60, y: (f.y + (post?.y ?? f.y)) / 2 - 30 }, 1.6), 300)
      } else if (fl.phase === 'out' && fl.t >= fl.dur) {
        if (!post || post.open != null) { land(fl); continue }
        fl.phase = 'tube'; fl.t = 0; fl.ya = hatch(f).y + 3; fl.yb = hatch(post).y + 3; fl.dur = Math.max(0.7, Math.abs(fl.yb - fl.ya) / 240)
      } else if (fl.phase === 'tube' && fl.t >= fl.dur) {
        fl.phase = 'pop'; fl.t = 0
        if (demo) { const q = fl.pr && tower.postRoom?.rect(fl.pr); tower.flyTo({ x: q ? (q.x + IX1) / 2 : IX1 - 120, y: post.y - 30 }, 3) }
      } else if (fl.phase === 'pop' && fl.t >= 0.45) {
        const h = hatch(post), q = fl.pr && tower.postRoom?.rect(fl.pr)
        fl.phase = 'fly'; fl.t = 0; fl.x0 = h.x + 2; fl.y0 = h.y + 5
        fl.x1 = q ? q.x + q.w / 2 : IX1 - 200; fl.y1 = q ? q.y - 1 : post.y - 24; fl.miss = !q
        fl.dur = Math.max(0.8, Math.abs(fl.x1 - fl.x0) / 200)
      } else if (fl.phase === 'fly' && fl.t >= fl.dur) land(fl)
      else if (fl.phase === 'poof' && fl.t >= 1) fl.done = true
    }
    for (let i = flights.length - 1; i >= 0; i--) if (flights[i].done) flights.splice(i, 1)
    for (const [n, s] of stickers) if (Date.now() - s.at > STICKER_MS) stickers.delete(n)
  })
  function land(fl) {
    if (fl.pr && !fl.miss) {
      const s = stickers.get(fl.pr) || { n: 0, subjects: [] }
      s.n += fl.docs.length; s.at = Date.now(); s.fresh = performance.now(); s.subjects = [...fl.docs.map(d => d.subject).filter(Boolean).reverse(), ...s.subjects].slice(0, 8)
      stickers.set(fl.pr, s)
    }
    if (fl.phase === 'fly' || fl.phase === 'pop') { fl.phase = 'poof'; fl.t = 0 } else fl.done = true
  }

  // ---------- drawing ----------
  function sheetStack(c, x, y, k, now) {
    for (let i = 0; i < k; i++) { R(c, i % 2 ? '#e8e0cc' : '#f6f2e6', x, y - i, 8, 1); R(c, i % 3 ? '#2f8a44' : '#c0392b', x + 2 + (i * 3) % 4, y - i, 1, 1) }
    R(c, '#c9302a', x + 6, y - k, 2, 1); R(c, 'rgba(0,0,0,.18)', x, y + 1, 8, 1)
  }
  function trayDraw(c, sid, d, now) {
    const r = trayRect(sid); if (!r) return
    R(c, '#4a4f5a', r.x + 2, r.y + r.h, 1, 3); R(c, '#4a4f5a', r.x + r.w - 3, r.y + r.h, 1, 3); R(c, '#4a4f5a', r.x + 1, r.y + r.h + 2, r.w - 2, 1)   // the wall bracket
    const lifting = flights.filter(fl => fl.sid === sid && (fl.phase === 'wait' || fl.phase === 'lift'))
    const sheets = d.tray.filter(doc => !doc.born || now >= doc.born + 500), k = Math.min(MAX_SHEETS, sheets.length)
    if (k) sheetStack(c, r.x + 2, r.y + r.h - 2, k, now)
    for (const fl of lifting) {
      const n = Math.min(MAX_SHEETS, fl.docs.filter(doc => !doc.born || now >= doc.born + 500).length), up = fl.phase === 'lift' ? ease(Math.min(1, fl.t / 0.6)) * 6 : 0
      sheetStack(c, r.x + 2, r.y + r.h - 2 - (k ? k : 0) - up, n, now)
      if (fl.phase === 'lift') R(c, '#c9302a', r.x + 1, r.y + r.h - 2 - k - up - Math.ceil(n / 2), 10, 1)   // the rubber band
    }
    R(c, '#6d7684', r.x, r.y + r.h - 1, r.w, 1); R(c, '#6d7684', r.x, r.y, 1, r.h); R(c, '#6d7684', r.x + r.w - 1, r.y, 1, r.h)
    R(c, '#8a93a0', r.x + 1, r.y + 1, r.w - 2, 1); R(c, '#2a2e36', r.x + 3, r.y + 2, 1, 1); R(c, '#2a2e36', r.x + 5, r.y + 2, 1, 1); R(c, '#2a2e36', r.x + 7, r.y + 2, 1, 1)   // OUT
    if (sheets.length > MAX_SHEETS) R(c, '#c0392b', r.x + r.w - 2, r.y - k, 2, 2)
    // a sheet flying in from the monitor, then the hand stamp
    const dk = tower.desk(sid)
    for (const doc of [...d.tray, ...lifting.flatMap(fl => fl.docs)]) {
      if (!doc.born) continue
      const e = (now - doc.born) / 1000
      if (e < 0 || e > 1.3) continue
      if (e < 0.5 && dk) {
        const k2 = ease(e / 0.5), sx = dk.monitor.x + 5, sy = dk.monitor.y + 4, tx = r.x + 2, ty = r.y + r.h - 2 - k
        const x = sx + (tx - sx) * k2, y = sy + (ty - sy) * k2 - Math.sin(k2 * Math.PI) * 8
        R(c, '#f6f2e6', x, y, 8, 1); R(c, '#d8d0bc', x, y + 1, 8, 1)
      } else if (e >= 0.5) {
        const s = Math.min(1, (e - 0.5) / 0.8), drop = s < 0.35 ? 1 - s / 0.35 : s < 0.6 ? 0 : (s - 0.6) / 0.4
        const sx = r.x + 4, sy = r.y + r.h - 2 - k - 1 - Math.round(drop * 9)
        R(c, '#8a5a2a', sx + 1, sy - 4, 2, 2); R(c, '#5a3a1a', sx + 1, sy - 2, 2, 1); R(c, '#2a2a30', sx, sy - 1, 4, 1); R(c, '#c0392b', sx, sy, 4, 1)
        if (drop === 0) { R(c, '#ffe08a', sx - 2, sy - 1, 1, 1); R(c, '#ffe08a', sx + 5, sy - 1, 1, 1) }
      }
    }
  }
  function bundle(c, x, y, n) {
    const k = Math.min(4, n)
    for (let i = 0; i < k; i++) R(c, i % 2 ? '#e8e0cc' : '#f6f2e6', x - 3, y - i, 7, 1)
    R(c, '#c9302a', x, y - k + 1, 1, k)
  }
  function flightDraw(c, fl, now) {
    if (fl.phase === 'out') {
      const k = ease(Math.min(1, fl.t / fl.dur))
      bundle(c, fl.x0 + (fl.x1 - fl.x0) * k, fl.y0 + (fl.y1 - fl.y0) * k - Math.sin(k * Math.PI) * 22, fl.docs.length)
    } else if (fl.phase === 'tube') {
      const y = fl.ya + (fl.yb - fl.ya) * ease(Math.min(1, fl.t / fl.dur))
      R(c, '#9aa3ad', TX, y - 4, TW, 8); R(c, '#e8ecf0', TX + 1, y - 4, 1, 8); R(c, '#2f8a44', TX, y - 1, TW, 2)
      c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(TX, y + (fl.yb > fl.ya ? -9 : 5), TW, 4)
    } else if (fl.phase === 'pop') {
      const post = tower.floor('post'); if (!post) return
      const h = hatch(post), k = Math.min(1, fl.t / 0.45)
      bundle(c, h.x + 4 - k * 4, h.y + 3 + k * 2 - Math.sin(k * Math.PI) * 5, fl.docs.length)
    } else if (fl.phase === 'fly') {
      const k = ease(Math.min(1, fl.t / fl.dur))
      bundle(c, fl.x0 + (fl.x1 - fl.x0) * k, fl.y0 + (fl.y1 - fl.y0) * k - Math.sin(k * Math.PI) * 16, fl.docs.length)
    } else if (fl.phase === 'poof') {
      const k = Math.min(1, fl.t)
      if (fl.miss) {
        c.fillStyle = `rgba(240,236,224,${0.9 * (1 - k)})`
        for (let i = 0; i < 5; i++) c.fillRect(Math.round(fl.x1 + Math.sin(i * 2.1) * (2 + k * 6)), Math.round(fl.y1 - k * 8 - i), 1, 1)
      } else {
        c.fillStyle = `rgba(255,224,120,${1 - k})`
        for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; c.fillRect(Math.round(fl.x1 + Math.cos(a) * (2 + k * 7)), Math.round(fl.y1 - 2 + Math.sin(a) * (2 + k * 5)), 1, 1) }
      }
    }
  }
  // on a parcel in the post room: new tape across it and a +N sticker
  function decorate(c, q, now) {
    const s = stickers.get(q.p.n); if (!s) return
    const { x, y, w, h } = q
    R(c, '#f0e2a8', x, y + (h >> 1) - 1, w - 1, 1); R(c, 'rgba(255,255,255,.55)', x, y + (h >> 1) - 1, Math.min(3, w - 1), 1)
    const g = (now - (s.fresh || 0)) / 1000
    if (g < 6) { const gx = x + ((g * 9) % (w + 4)) - 2; if (gx >= x && gx < x + w - 1) R(c, '#ffffff', gx, y + (h >> 1) - 1, 1, 1) }
    R(c, '#ffd84a', x + w - 4, y - 2, 4, 3); R(c, '#c0392b', x + w - 3, y - 1, 2, 1); R(c, '#c0392b', x + w - 2, y - 2, 1, 1); R(c, 'rgba(0,0,0,.25)', x + w - 4, y + 1, 4, 1)
  }

  tower.on('items', (out, now, ctx) => {
    for (const [sid, d] of desks) {
      const f = tower.floor(sid)
      if (!f || f.open != null || !shown(d) || f.y < ctx.view.y0 - 10 || f.top > ctx.view.y1 + 10) continue
      out.push({ z: Z.WALL + 6, draw: c => trayDraw(c, sid, d, now) })
    }
    for (const fl of flights) if (fl.phase !== 'wait' && fl.phase !== 'lift') out.push({ z: fl.phase === 'tube' ? Z.FRONT + 6 : Z.FRONT + 9, draw: c => flightDraw(c, fl, now) })
  })
  tower.on('glow', (c, now, n) => {
    for (const fl of flights) if (fl.phase === 'tube') {
      const y = fl.ya + (fl.yb - fl.ya) * ease(Math.min(1, fl.t / fl.dur))
      const g = c.createRadialGradient(TX + 2, y, 0, TX + 2, y, 8); g.addColorStop(0, `rgba(160,255,170,${0.45 * Math.max(n, 0.3)})`); g.addColorStop(1, 'rgba(160,255,170,0)')
      c.fillStyle = g; c.fillRect(TX - 6, y - 8, 16, 16)
    }
  })
  tower.on('overlay', v => {
    const k = tower.zoom, post = tower.floor('post'); if (k < 2 || !post || post.open != null || !tower.postRoom) return
    v.save(); v.textAlign = 'center'; v.textBaseline = 'middle'; v.font = font(Math.min(12, 3.4 * k), 700)
    for (const [n, s] of stickers) {
      const q = tower.postRoom.rect(n); if (!q) continue
      const p = tower.worldToScreen(q.x + q.w - 2, q.y - 3), t = `+${s.n} commit${s.n === 1 ? '' : 's'}`, w = v.measureText(t).width + 8, h = Math.min(16, 4.6 * k)
      if (p.x < -w || p.y < 0 || p.x > tower.canvas.clientWidth + w || p.y > tower.canvas.clientHeight) continue
      v.fillStyle = '#ffd84a'; v.strokeStyle = '#7a5a10'; v.lineWidth = 1
      v.beginPath(); v.roundRect(p.x - w / 2, p.y - h - 4, w, h, 3); v.fill(); v.stroke()
      v.fillStyle = '#5a1a14'; v.fillText(t, p.x, p.y - h / 2 - 3.5)
    }
    v.restore()
  })

  // ---------- hover ----------
  const ago = ms => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h' }
  tower.on('hover', (w, person) => {
    if (person) return null
    for (const [sid, d] of desks) {
      const r = trayRect(sid), f = tower.floor(sid)
      if (!r || !f || f.open != null || !shown(d) || !inR(w, { x: r.x, y: r.y - Math.min(MAX_SHEETS, d.tray.length) - 1, w: r.w, h: r.h + Math.min(MAX_SHEETS, d.tray.length) + 4 }, 1)) continue
      const rows = d.tray.slice().reverse().slice(0, 10).map(doc => `<div>🟩 ${doc.sha ? `<span class="m">${esc(doc.sha.slice(0, 7))}</span> ` : ''}${esc(doc.subject || '(no subject)')} <span class="m">${ago(Date.now() - doc.t)}</span></div>`).join('')
      const last = d.last ? `<div class="m">last push: ${d.last.n} sheet${d.last.n === 1 ? '' : 's'} down the tube${d.last.pr ? ` to #${d.last.pr}` : ''} · ${esc(d.last.branch || '')} · ${ago(Date.now() - d.last.at)} ago</div>` : ''
      return `<div class="t">📤 Out tray · ${d.tray.length} unpushed commit${d.tray.length === 1 ? '' : 's'}${demo ? ' (demo)' : ''}</div>${rows || '<div class="m">empty — everything is pushed</div>'}${d.tray.length > 10 ? `<div class="m">… and ${d.tray.length - 10} more</div>` : ''}${last}<div class="m">a git push sends them down the tube to the PR's parcel</div>`
    }
    return null
  })

  // ---------- ?demo=commitstamps ----------
  if (demo) {
    const SUBJ = ['desk: the out tray stamps each commit', 'post room: parcels take fresh tape', 'tube: the capsule drops to the basement', 'fix: the sticker counts every sheet']
    let T0 = 0, sid = null, flown = false
    tower.on('snapshot', data => {
      if (!T0) T0 = Date.now()
      const ss = data.sessions || []
      sid = (sid && ss.some(s => s.id === sid) && sid) || ss.find(s => tower.floor(s.id))?.id || ss[0]?.id
      if (!sid) return
      if (!flown && !params.get('towerzoom') && tower.desk(sid)) { flown = true; const r = trayRect(sid); setTimeout(() => tower.flyTo({ x: r.x + 40, y: r.y + 14 }, 7), 500) }
      const st = data.street || {}
      let pr = (st.status === 'ok' && st.mine?.[0]) || null
      if (!pr) {
        pr = { number: 4242, title: 'demo: commit stamps', headRefName: 'demo/commit-stamps', draft: false, review: null, ci: 'running', url: null, updatedAt: Date.now() }
        data.street = { ...st, status: 'ok', mine: [pr, ...(st.mine || [])], post: [...(st.post || []), { n: 4242, title: pr.title, author: 'you', mine: true, draft: false, review: null, ci: 'running', size: 320, labels: [], createdAt: Date.now() - 864e5, updatedAt: Date.now() }], merged: st.merged || [] }
      }
      const ev = [], e = Date.now() - T0
      for (let cyc = 0; cyc * 30000 <= e; cyc++) {
        const t0 = T0 + cyc * 30000 + 2500
        for (let i = 0; i < 4; i++) if (t0 + i * 3000 <= Date.now()) ev.push({ id: `demo-${cyc}-${i}`, t: t0 + i * 3000, k: 'c', branch: i === 2 ? null : pr.headRefName, sha: ((cyc * 4 + i + 1) * 2654435761 >>> 0).toString(16).padStart(8, '0').slice(0, 9), subject: SUBJ[i] })
        if (t0 + 13500 <= Date.now()) ev.push({ id: `demo-${cyc}-p`, t: t0 + 13500, k: 'p', branch: pr.headRefName })
        if (cyc === Math.floor(e / 30000) && t0 + 22000 <= Date.now() && t0 + 23600 > Date.now() && tower.desk(sid)) { const r = trayRect(sid); tower.flyTo({ x: r.x + 40, y: r.y + 14 }, 7) }
      }
      data.commits = { ...(data.commits || {}), [sid]: [...(data.commits?.[sid] || []), ...ev] }
    })
  }
}
