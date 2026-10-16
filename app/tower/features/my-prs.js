// my-prs: the user's own open PRs (snap.street.mine — the street leaves them out). A status board on the CEO office's left
// wall (CI ✓/✗/⟳, review ✓/✎/○, drafts dimmed, failing rows blink; click a row for its failing run or the PR), and on
// the floor of the live session that owns a red PR (its branch is the PR's head, or it opened it): a strobing ceiling
// alarm, the bin on fire, smoke under the ceiling and a red 🔥 tag on the plaque. Green again: steam and a toast.
// ?demo=myprs (or #demo=myprs) fakes one PR going red on a live floor, another building, and the first going green.
import * as notify from '../../features/notify.js'
import { inR } from '../draw.js'

const URGENT = [[988, 0, 0.22], [988, 0.28, 0.22], [1318.5, 0.56, 0.9]]
const ROWS = 4, STEAM_MS = 5000, NAME_WAIT = 25_000
const COL = { failed: '#ef5a5a', running: '#f2a43a', passed: '#5fd17a', null: '#7a8090' }
const CI_MARK = { failed: '✗', running: '⟳', passed: '✓' }
const REV = { APPROVED: ['✓', '#5fd17a'], CHANGES_REQUESTED: ['✎', '#f2a43a'] }
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
const rank = p => (p.ci === 'failed' ? 0 : p.ci === 'running' ? 1 : 2) + (p.draft ? 0.5 : 0)

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = api.params, demo = api.demo('myprs')
  let mine = [], repo = null, primed = false, demoT0 = 0, demoOwner = null, demoOwner2 = null
  const owners = new Map()                 // session id -> [pr] it owns
  const prevCi = new Map(), pending = new Map(), steam = new Map(), fireSince = new Map()

  // ---------- data ----------
  function fake(list, ss) {
    if (!demoT0) {
      demoT0 = Date.now()
      const real = new Set(ss.filter(s => ownedBy(s, list).some(p => p.ci === 'failed' && !p.draft)).map(s => s.id))
      const free = ss.filter(s => s.running !== false && !real.has(s.id))
      demoOwner = (free[0] || ss[0])?.id; demoOwner2 = (free[1] || ss[1])?.id
      if (!params.get('towerzoom')) setTimeout(() => demoOwner && tower.flyTo(demoOwner), 600)
    }
    const t = Date.now() - demoT0, ci = t < 3000 ? 'running' : t < 18_000 ? 'failed' : 'passed'
    const one = { number: 1914, title: 'game: save slots', url: null, draft: false, review: 'CHANGES_REQUESTED', ci, headRefName: 'demo/myprs-1914', updatedAt: Date.now(), demoOwner,
      failingCheck: ci === 'failed' ? { name: 'ci / lint', url: null } : null }
    const two = { number: 1910, title: 'gallery: lazy-load thumbnails', url: null, draft: false, review: 'APPROVED', ci: 'running', headRefName: 'demo/myprs-1910', updatedAt: Date.now() - 6e5, demoOwner: demoOwner2, failingCheck: null }
    return [one, two, ...list]
  }
  const ownedBy = (s, list) => list.filter(p => p.demoOwner ? p.demoOwner === s.id
    : (s.branch && s.branch === p.headRefName) || (s.ext?.['pr-celebration']?.pr?.n === p.number && (!repo || !s.ext['pr-celebration'].pr.repo || s.ext['pr-celebration'].pr.repo === repo)))

  tower.on('sync', data => {
    const st = data.street
    if (st?.status !== 'ok' && !demo) return
    repo = st?.repo || null
    mine = (st?.mine || []).map(p => ({ ...p }))
    if (demo) mine = fake(mine, data.sessions)
    owners.clear()
    for (const s of data.sessions) { const l = ownedBy(s, mine); if (l.length) owners.set(s.id, l) }
    const now = performance.now()
    for (const p of mine) {
      const was = prevCi.get(p.number)
      if (primed && was !== undefined && was !== p.ci) {
        if (p.ci === 'failed' && !p.draft) pending.set(p.number, Date.now())
        if (was === 'failed') {
          pending.delete(p.number)
          if (p.ci === 'passed') api.toast(`✓ #${p.number} green`, 3500)
          for (const [sid, l] of owners) if (l.includes(p) && !p.draft && !l.some(q => q.ci === 'failed' && !q.draft)) steam.set(sid, now)
        }
      }
      prevCi.set(p.number, p.ci)
    }
    for (const [n, at] of pending) {
      const p = mine.find(q => q.number === n)
      if (!p || p.ci !== 'failed' || p.draft) { pending.delete(n); continue }
      if (p.failingCheck?.name || Date.now() - at > NAME_WAIT) { pending.delete(n); alarm(p) }
    }
    for (const sid of owners.keys()) if (fireOf(sid).length && !fireSince.has(sid)) fireSince.set(sid, now)
    for (const sid of fireSince.keys()) if (!fireOf(sid).length) fireSince.delete(sid)
    primed = true
  })
  function alarm(p) {
    api.toast(`🔥 #${p.number} CI failed${p.failingCheck?.name ? ' — ' + p.failingCheck.name : ''}`, 5000)
    try { if (api.live && notify.prefs?.().sound) notify.chime?.(URGENT, 0.1) } catch {}
  }
  const fireOf = sid => (owners.get(sid) || []).filter(p => p.ci === 'failed' && !p.draft)   // a draft's red CI never burns
  const burning = () => tower.floors.filter(f => f.kind === 'session' && fireOf(f.id).length)
  const sorted = () => [...mine].sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt)

  // ---------- geometry ----------
  function board() {
    const s = tower.slots; if (!s) return null
    const x0 = tower.interior.x0, t = s.floor.top
    return { x: x0 + 4, y: t + 14, w: 78, h: 32 }
  }
  const rowRect = (b, i) => ({ x: b.x + 2, y: b.y + 8 + i * 5, w: b.w - 4, h: 5 })
  const alarmAt = f => ({ x: f.x1 - 14, y: f.top })
  const binAt = f => { const d = tower.desk(f.id); return d ? { x: d.desk.x + 13, y: f.y - 7 } : null }
  const blink = now => Math.floor(now / 450) % 2 === 0
  const strobe = now => now % 900 < 140

  // ---------- world ----------
  tower.on('items', (out, now, ctx) => {
    const b = board()
    if (b) out.push({ z: Z.WALL + 2, draw: c => drawBoard(c, b, now) })
    const v = ctx.view
    for (const f of tower.floors) {
      if (f.kind !== 'session' || f.y < v.y0 - 20 || f.top > v.y1 + 20) continue
      const fire = fireOf(f.id).length > 0, st = steam.get(f.id), bin = binAt(f)
      if (fire) out.push({ z: Z.WALL + 3, draw: c => drawAlarm(c, f, now, true) })
      if (fire && bin) out.push({ z: Z.FLOOR + 3, draw: c => flames(c, bin.x, bin.y, now) })
      if (fire) out.push({ z: Z.FRONT + 6, draw: c => smoke(c, f, bin, now) })
      if (st != null && bin) {
        if (now - st > STEAM_MS) { steam.delete(f.id); continue }
        out.push({ z: Z.FRONT + 6, draw: c => puff(c, bin.x, bin.y, (now - st) / STEAM_MS) })
      }
    }
  })
  function drawBoard(c, b, now) {
    R(c, 'rgba(0,0,0,.28)', b.x + 2, b.y + 2, b.w, b.h)
    R(c, '#3b2617', b.x - 1, b.y - 1, b.w + 2, b.h + 2); R(c, '#c9a25a', b.x, b.y, b.w, b.h); R(c, '#0d121c', b.x + 1, b.y + 1, b.w - 2, b.h - 2)
    const red = mine.some(p => p.ci === 'failed')
    R(c, red && blink(now) ? '#a8322a' : '#2a3448', b.x + 1, b.y + 1, b.w - 2, 6)
    sorted().slice(0, ROWS).forEach((p, i) => {
      const r = rowRect(b, i)
      c.globalAlpha = p.draft ? 0.55 : 1
      if (p.ci === 'failed' && blink(now)) R(c, 'rgba(239,90,90,.38)', r.x, r.y, r.w, r.h - 1)
      R(c, COL[p.ci] || COL.null, r.x + 1, r.y + 1, 3, 3)
      R(c, '#8a96aa', r.x + 6, r.y + 2, 8, 1); R(c, '#5a6478', r.x + 16, r.y + 2, 18 + api.hash(String(p.number)) % 28, 1)
      R(c, COL[p.ci] || COL.null, r.x + r.w - 9, r.y + 2, 3, 1); R(c, (REV[p.review] || [0, '#5a6478'])[1], r.x + r.w - 4, r.y + 2, 3, 1)
      c.globalAlpha = 1
    })
    R(c, Math.floor(now / 1500) % 2 ? '#5fd17a' : '#3e9a55', b.x + b.w - 3, b.y + b.h - 2, 1, 1)
  }
  function drawAlarm(c, f, now, on) {
    const { x, y } = alarmAt(f), lit = on && strobe(now)
    R(c, '#4a4452', x - 4, y, 9, 2); R(c, '#e8e4dc', x - 3, y + 2, 7, 2)
    R(c, lit ? '#ff3a2a' : '#9a2a22', x - 2, y + 4, 5, 3); R(c, lit ? '#ffd2c8' : '#c44a3a', x - 1, y + 4, 1, 1)
  }
  function flames(c, x, y, now) {
    for (let i = -3; i < 3; i += 1) {
      const h = Math.abs(Math.sin(now / 95 + i * 1.9)) * 5 + 3
      R(c, '#e8452a', x + i, y - h, 1, h); R(c, '#ff8a3a', x + i, y - h * 0.65, 1, h * 0.65); if (!(i % 2)) R(c, '#ffd84a', x + i, y - h * 0.3, 1, h * 0.3)
    }
    if (Math.floor(now / 160) % 3 === 0) R(c, '#ffd84a', x + Math.round(3 * Math.sin(now / 70)), y - 10 - (now / 40) % 4, 1, 1)
  }
  function smoke(c, f, bin, now) {
    const age = Math.min(1, (now - (fireSince.get(f.id) ?? now)) / 4000)
    c.save(); c.beginPath(); c.rect(f.x0, f.top, f.x1 - f.x0, f.y - f.top); c.clip()
    if (bin) for (let i = 0; i < 6; i++) {   // the column from the bin
      const p = ((now / 2600) + i / 6) % 1, r = 1.5 + p * 4
      c.fillStyle = `rgba(70,66,72,${0.45 * (1 - p * 0.6)})`
      c.beginPath(); c.arc(bin.x + Math.sin(p * 5 + i) * 3, bin.y - 8 - p * (bin.y - 8 - f.top - 6), r, 0, Math.PI * 2); c.fill()
    }
    for (let i = 0; i < 14; i++) {           // the layer under the ceiling
      const x = f.x0 + ((i * 37 + now / 90 * (1 + i % 3) * 0.4) % (f.x1 - f.x0 + 40)) - 20, y = f.top + 3 + (i % 3) * 2 + Math.sin(now / 900 + i) * 1.2
      c.fillStyle = `rgba(80,76,84,${0.22 * age})`; c.beginPath(); c.arc(x, y, 6 + (i % 4) * 2, 0, Math.PI * 2); c.fill()
    }
    c.restore()
  }
  function puff(c, x, y, p) {
    for (let i = 0; i < 7; i++) {
      const q = Math.min(1, p * 1.4 - i * 0.05); if (q <= 0) continue
      c.fillStyle = `rgba(${i % 2 ? '196,206,218' : '232,238,244'},${0.9 * (1 - q)})`
      c.beginPath(); c.arc(x + Math.sin(i * 2.1) * (2 + q * 6), y - 4 - q * 26 - i * 1.5, 2 + q * 5, 0, Math.PI * 2); c.fill()
    }
  }
  tower.on('glow', (c, now, n) => {
    for (const f of burning()) {
      const b = binAt(f), a = alarmAt(f)
      const pool = (x, y, r, col, al) => { const g = c.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, `rgba(${col},${al})`); g.addColorStop(1, `rgba(${col},0)`); c.fillStyle = g; c.fillRect(x - r, y - r, 2 * r, 2 * r) }
      if (b) pool(b.x, b.y - 4, 20, '255,130,40', (0.35 + 0.1 * Math.sin(now / 90)) * Math.max(n, 0.4))
      if (strobe(now)) pool(a.x, a.y + 5, 26, '255,50,40', 0.7)
    }
  })
  tower.on('post', (c, now) => {
    if (!strobe(now)) return
    for (const f of burning()) { c.fillStyle = 'rgba(255,40,30,.09)'; c.fillRect(f.x0, f.top, f.x1 - f.x0, f.y - f.top) }
  })

  // ---------- the plaque: a red 🔥 #N; replaces desk-kit's green ⚑ tag when it names the same PR ----------
  tower.on('plaque', (c, f, b) => {
    const red = fireOf(f.id); if (!red.length) return 0
    const p = red[0], fs = b.fs * 0.92, ym = b.y + b.h / 2 + 0.5
    const t = `🔥 #${p.number}${red.length > 1 ? ` +${red.length - 1}` : ''}`
    c.font = font(fs, 700)
    const w = c.measureText(t).width, kit = f.session?.ext?.['pr-celebration']?.pr
    let end = b.right, extra = fs * 0.6
    if (kit?.n === p.number) {   // desk-kit painted ⚑ #N just right of b.right; paint over it
      const kw = c.measureText(`⚑ #${kit.n}`).width, x0 = b.right + fs * 0.8
      R(c, '#2e2219', x0 - 1, b.y + 2 * b.k, kw + 2, b.h - 4 * b.k)
      end = x0 + kw; extra = Math.max(0, w - kw - fs * 0.8) + fs * 0.6
      if (extra < fs * 0.6) extra = 0
    }
    const pulse = blink(performance.now())
    c.fillStyle = pulse ? '#ff6a5a' : '#e0392a'; c.fillText(t, end - w, ym)
    return kit?.n === p.number ? extra : w + extra
  })

  // ---------- overlay: the board's text ----------
  tower.on('overlay', (v, now) => {
    const b = board(), k = tower.zoom; if (!b || 5 * k < 9) return
    const a = tower.worldToScreen(b.x, b.y), cv = tower.canvas
    if (a.x > cv.clientWidth || a.y > cv.clientHeight || a.x + b.w * k < 0 || a.y + b.h * k < 0) return
    v.save(); v.beginPath(); v.rect(a.x, a.y, b.w * k, b.h * k); v.clip(); v.textBaseline = 'middle'
    const hs = Math.min(6 * k * 0.72, 14), red = mine.filter(p => p.ci === 'failed').length
    v.font = font(hs, 700); v.fillStyle = '#f2e8d0'; v.fillText('MY PRs', a.x + 2.5 * k, a.y + 4 * k)
    const sub = mine.length ? `${mine.length} open${red ? ` · ${red} ✗` : ''}` : primed ? 'none open' : 'loading…'
    v.font = font(hs * 0.85, 600); v.fillStyle = red ? '#ffb0a8' : '#9fb0c2'; v.textAlign = 'right'; v.fillText(sub, a.x + (b.w - 2.5) * k, a.y + 4 * k); v.textAlign = 'left'
    const fs = Math.min(5 * k * 0.78, 13)
    sorted().slice(0, ROWS).forEach((p, i) => {
      const r = rowRect(b, i), s = tower.worldToScreen(r.x, r.y), ym = s.y + r.h * k / 2 + 0.5
      v.fillStyle = '#0d121c'; v.fillRect(s.x + 5.5 * k, s.y + 0.5 * k, (r.w - 16) * k, r.h * k - k)
      if (p.ci === 'failed' && blink(now)) { v.fillStyle = 'rgba(239,90,90,.38)'; v.fillRect(s.x + 5.5 * k, s.y, (r.w - 16) * k, r.h * k - k) }
      v.globalAlpha = p.draft ? 0.55 : 1
      v.font = font(fs, 700); v.fillStyle = p.ci === 'failed' ? '#ffb0a8' : '#eef3f8'
      const num = `#${p.number}`; v.fillText(num, s.x + 6 * k, ym)
      const nw = v.measureText(num).width
      v.font = font(fs * 0.92); v.fillStyle = '#b8c4d2'; v.fillText(fitText(short(p.title), (r.w - 18) * k - nw - fs * 0.5, font(fs * 0.92)), s.x + 6 * k + nw + fs * 0.5, ym)
      v.globalAlpha = 1; v.fillStyle = '#0d121c'; v.fillRect(s.x + (r.w - 10) * k, s.y + 0.5 * k, 10 * k, r.h * k - k)
      v.globalAlpha = p.draft ? 0.55 : 1; v.font = font(fs, 700); v.textAlign = 'center'
      v.fillStyle = COL[p.ci] || COL.null; v.fillText(CI_MARK[p.ci] || '·', s.x + (r.w - 7.5) * k, ym)
      const [rm, rc] = REV[p.review] || ['○', '#8a96aa']; v.fillStyle = rc; v.fillText(rm, s.x + (r.w - 2.5) * k, ym)
      v.textAlign = 'left'; v.globalAlpha = 1
    })
    if (mine.length > ROWS) { v.font = font(fs * 0.8, 600); v.fillStyle = '#7a8aa0'; v.fillText(`+${mine.length - ROWS} more`, a.x + 2.5 * k, a.y + (b.h - 1.6) * k) }
    v.restore()
  })
  const short = t => String(t || '').replace(/\s*\[[A-Z]+-\d+\]\s*$/, '').replace(/^(\w[\w-]*): /, '$1 · ')

  // ---------- hover / click ----------
  function hit(w) {
    const b = board()
    if (b && inR(w, b, 1)) {
      const i = Math.floor((w.y - b.y - 8) / 5), p = i >= 0 && i < ROWS ? sorted()[i] : null
      return { board: true, p }
    }
    for (const f of burning()) {
      const a = alarmAt(f), bin = binAt(f), pl = tower.plaque(f)
      if (inR(w, { x: a.x - 5, y: a.y, w: 10, h: 9 }) || (bin && inR(w, { x: bin.x - 5, y: bin.y - 12, w: 10, h: 19 })) || inR(w, { x: pl.x + pl.w * 0.55, y: pl.y, w: pl.w * 0.45, h: pl.h })) return { floor: f, p: fireOf(f.id)[0] }
    }
    return null
  }
  const ciText = p => p.ci === 'failed' ? `<b style="color:#ef5a5a">✗ CI failed</b>${p.failingCheck?.name ? ' — ' + esc(p.failingCheck.name) : ''}` : p.ci === 'running' ? '⟳ CI running' : p.ci === 'passed' ? '✓ CI green' : 'CI unknown (no recent run)'
  const revText = r => r === 'APPROVED' ? '✓ approved' : r === 'CHANGES_REQUESTED' ? '✎ changes requested' : '○ review pending'
  const line = (p, bold) => `<div${bold ? '' : ' class="m"'}><i class="s" style="background:${COL[p.ci] || COL.null}"></i>${bold ? '<b>' : ''}#${p.number} ${esc(short(p.title).slice(0, 52))}${bold ? '</b>' : ''}${p.draft ? ' · draft' : ''}</div>`
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    if (h.floor) { const p = h.p; return `<div class="t">🔥 ${esc(h.floor.session?.title || '')}: #${p.number} is red</div><div>${esc(p.title)}</div><div>${ciText(p)}</div><div class="m">↗ click for the failing run</div>` }
    const all = sorted()
    if (!all.length) return `<div class="t">My PRs</div><div class="m">${primed ? 'no open PRs' : 'GitHub street is still loading'}</div>`
    const p = h.p
    return `<div class="t">My PRs · ${all.length} open</div>${p ? `<div>${ciText(p)} · ${revText(p.review)}</div>` : ''}${all.slice(0, 12).map(q => line(q, q === p)).join('')}<div class="m">↗ click ${p ? `for #${p.number}${p.ci === 'failed' ? "'s failing run" : ''}` : 'for all your open PRs'}</div>`
  })
  tower.on('click', (w, person) => {
    if (person) return false
    const h = hit(w); if (!h) return false
    const p = h.p
    const url = p ? (p.ci === 'failed' && p.failingCheck?.url) || p.url : repo ? `https://github.com/${repo}/pulls?q=${encodeURIComponent('is:pr is:open author:@me')}` : null
    if (url) api.openLink(url); else if (p) api.toast(`#${p.number} · ${p.ci || 'no CI yet'}`)
    return true
  })
}
