// lost-found: a lost-property cage in the lobby, right of reception, under the wall of fame. One crate per
// worktree no live session works in (snap.lostFound): a green tag when its PR merged, amber open, grey none, a red dot
// for uncommitted changes; crates untouched for a week gather dust and cobwebs. Hover a crate for it, click the cage
// for the list. Read-only: it never removes anything. ?demo=lostfound fakes a cage of crates and flies there.
import { IX } from '../building.js'

const X0 = IX + 206, W = 64, H = 26, CW = 9, CH = 7, COLS = 6, ROWS = 3, WEEK = 7 * 864e5
const TAG = { MERGED: '#5fd17a', OPEN: '#f2a43a', CLOSED: '#c25a5a', none: '#8a8f9a' }
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const inR = (w, r, pad = 0) => r && w.x >= r.x - pad && w.x <= r.x + r.w + pad && w.y >= r.y - pad && w.y <= r.y + r.h + pad
const age = ms => { const d = Math.floor(ms / 864e5); return d >= 1 ? d + 'd' : Math.max(1, Math.floor(ms / 36e5)) + 'h' }

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('lostfound')
  let data = null, flown = false, panel = null

  function fake() {
    const now = Date.now(), d = 864e5
    const mk = (name, branch, days, pr, dirty = 0) => ({ name, branch, path: `/skyline/.claude/worktrees/${name}`, mtime: now - days * d, dirty, pr, safe: pr?.state === 'MERGED' && !dirty })
    const pr = (n, state, title) => ({ number: n, state, title, url: null, mergedAt: state === 'MERGED' ? now - 3 * d : null })
    return { demo: true, total: 11, inUse: 2, prsKnown: true, crates: [
      mk('desktop-v020', 'chore/desktop-bump-to-020', 21, pr(1415, 'MERGED', 'desktop: bump to 0.2.0')),
      mk('desktop-release', 'fix/ci-desktop-release', 18, pr(1437, 'MERGED', 'ci: desktop release authenticates git')),
      mk('notification-frames', 'feat/notification-frames', 12, pr(1494, 'OPEN', 'api: notification frames'), 3),
      mk('verify-api-keep-flag', 'chore/keep-flag', 9, pr(1510, 'MERGED', 'verify-api keeps --keep')),
      mk('feed-publisher', 'feature/feed-publisher', 8, null, 1),
      mk('web-en-only-catalogue', 'feature/en-only', 4, pr(1515, 'MERGED', 'web: en-only catalogue')),
      mk('onboarding-poc', 'poc/onboarding', 3, pr(1762, 'CLOSED', 'poc: web to desktop onboarding')),
      mk('tx-details', 'feat/tx-details', 2, pr(1786, 'MERGED', 'web: transaction details')),
      mk('desktop-settings-page', 'feat/settings', 1, pr(1865, 'OPEN', 'desktop: settings as a page')),
    ] }
  }
  tower.on('sync', snap => {
    data = demo ? fake() : snap.lostFound || null
    if (panel && panel.style.display !== 'none') fill()
    if (demo && !flown && tower.lobby && !params.get('towerzoom')) { flown = true; setTimeout(() => tower.flyTo({ x: X0 + W / 2, y: tower.lobby.floor.y - 30 }, 6), 500) }
  })
  const crates = () => data?.crates || []
  // merged ones first (the ones that can go), oldest at the bottom
  const shown = () => {
    const l = [...crates()].sort((a, b) => (a.pr?.state === 'MERGED' ? 0 : 1) - (b.pr?.state === 'MERGED' ? 0 : 1) || (a.mtime ?? 0) - (b.mtime ?? 0))
    return l.length > COLS * ROWS ? l.slice(0, COLS * ROWS - 1) : l
  }
  const extra = () => Math.max(0, crates().length - (COLS * ROWS - 1))
  const dusty = k => k.mtime && Date.now() - k.mtime > WEEK
  function cage() { const f = tower.lobby?.floor; return f && { x: X0, y: f.y - H, w: W, h: H, f } }
  function slot(b, i) { const col = i % COLS, row = Math.floor(i / COLS); return { x: b.x + 2 + col * (CW + 1), y: b.f.y - 1 - (row + 1) * CH - row, w: CW, h: CH } }
  const sign = b => ({ x: b.x + 8, y: b.f.y - 38, w: 48, h: 8 })

  // ---------- world ----------
  tower.on('items', (out, now) => {
    const b = cage(); if (!b || !data) return
    out.push({ z: Z.FLOOR + 2, draw: c => drawCage(c, b, now) })
  })
  function drawCage(c, b, now) {
    const s = sign(b), y = b.f.y, list = shown()
    R(c, '#3b2617', s.x + 6, s.y - 3, 1, 3); R(c, '#3b2617', s.x + s.w - 7, s.y - 3, 1, 3)
    R(c, '#3b2617', s.x - 1, s.y - 1, s.w + 2, s.h + 2); R(c, '#f2e6c8', s.x, s.y, s.w, s.h)
    for (let i = 0; i < 9; i++) R(c, '#5a3a26', s.x + 4 + i * 4 + (i > 3 ? 4 : 0), s.y + 3, 3, 2)
    R(c, '#2c2e36', b.x, b.y - 2, b.w, 2); R(c, '#3a3d48', b.x, b.y - 2, 1, b.h + 2); R(c, '#3a3d48', b.x + b.w - 1, b.y - 2, 1, b.h + 2)
    R(c, 'rgba(60,62,72,.18)', b.x + 1, b.y, b.w - 2, b.h)
    list.forEach((k, i) => crate(c, slot(b, i), k, now))
    if (extra()) { const r = slot(b, list.length); R(c, '#6b4a30', r.x, r.y + 2, r.w, r.h - 2); R(c, '#f4efe0', r.x + 1, r.y + 3, r.w - 2, 3) }
    c.fillStyle = 'rgba(160,165,175,.32)'
    for (let x = b.x + 4; x < b.x + b.w - 1; x += 4) c.fillRect(x, b.y, 1, b.h)
    c.fillStyle = 'rgba(90,95,105,.7)'; c.fillRect(b.x + 1, b.y + Math.round(b.h / 2) - 1, b.w - 2, 1)
    R(c, '#4a4f5a', b.x, y - 1, b.w, 1)
    if (list.some(dusty)) {   // cobwebs in the cage's top corners
      c.fillStyle = 'rgba(245,245,250,.85)'
      for (let i = 0; i < 4; i++) { c.fillRect(b.x + 1 + i, b.y + i, 1, 1); c.fillRect(b.x + 1, b.y + i, 1, 1); c.fillRect(b.x + 1 + i, b.y, 1, 1) }
      for (let i = 0; i < 3; i++) { c.fillRect(b.x + b.w - 2 - i, b.y + i, 1, 1); c.fillRect(b.x + b.w - 2, b.y + i, 1, 1) }
    }
  }
  function crate(c, r, k, now) {
    R(c, '#8a5a2e', r.x, r.y, r.w, r.h); R(c, '#a8743e', r.x, r.y, r.w, 1); R(c, '#6b4424', r.x, r.y + 3, r.w, 1)
    R(c, '#6b4424', r.x, r.y, 1, r.h); R(c, '#6b4424', r.x + r.w - 1, r.y, 1, r.h)
    R(c, '#f4efe0', r.x + 2, r.y + 4, 5, 2); R(c, TAG[k.pr?.state || 'none'], r.x + 2, r.y + 4, 2, 2)
    if (k.dirty > 0) R(c, '#e8452a', r.x + r.w - 2, r.y + 1, 1, 1)
    if (dusty(k)) {
      R(c, 'rgba(214,208,196,.55)', r.x, r.y, r.w, 2)
      c.fillStyle = 'rgba(214,208,196,.45)'; for (let i = 0; i < 4; i++) c.fillRect(r.x + ((i * 5 + api.hash(k.name)) % (r.w - 1)), r.y + 2 + (i % 3) * 2, 1, 1)
    }
    if (k.safe && Math.floor((now + api.hash(k.name) * 7) / 900) % 6 === 0) R(c, '#c8ffd4', r.x + 3, r.y + 4, 1, 1)
  }
  tower.on('overlay', v => {
    const b = cage(), k = tower.zoom; if (!b || !data || 8 * k < 22) return
    const s = sign(b), a = tower.worldToScreen(s.x, s.y)
    v.save(); v.fillStyle = '#f2e6c8'; v.fillRect(a.x + 1, a.y + 1, s.w * k - 2, s.h * k - 2)
    v.font = font(Math.min(s.h * k * 0.62, 16), 700); v.fillStyle = '#5a3a26'; v.textAlign = 'center'; v.textBaseline = 'middle'
    v.fillText('LOST & FOUND', a.x + s.w * k / 2, a.y + s.h * k / 2 + 0.5)
    if (extra()) {
      const r = slot(b, shown().length), q = tower.worldToScreen(r.x, r.y + 3)
      v.font = font(Math.min(3 * k * 0.9, 12), 700); v.fillStyle = '#3b2617'; v.fillText(`+${extra()}`, q.x + r.w * k / 2, q.y + 1.5 * k)
    }
    v.restore()
  })

  // ---------- hover / click ----------
  function hit(w) {
    const b = cage(); if (!b || !data) return null
    if (!inR(w, { x: b.x, y: b.f.y - 40, w: b.w, h: 40 }, 1)) return null
    const i = shown().findIndex((k, n) => inR(w, slot(b, n)))
    return { crate: i >= 0 ? shown()[i] : null }
  }
  const state = p => !p ? (data?.prsKnown ? 'no PR' : 'PRs loading…') : p.state === 'MERGED' ? `#${p.number} merged` : p.state === 'OPEN' ? `#${p.number} open` : `#${p.number} closed unmerged`
  const verdict = k => k.safe ? '<span style="color:#5fd17a">✓ safe to remove</span> — PR merged, no uncommitted changes'
    : k.pr?.state === 'MERGED' && k.dirty > 0 ? `<span style="color:#f2a43a">PR merged, but ${k.dirty} uncommitted change${k.dirty > 1 ? 's' : ''}</span>`
    : k.pr?.state === 'MERGED' ? 'PR merged · checking for uncommitted changes…' : k.dirty > 0 ? `${k.dirty} uncommitted change${k.dirty > 1 ? 's' : ''}` : ''
  tower.on('hover', (w, person) => {
    if (person) return null
    const h = hit(w); if (!h) return null
    const l = crates(), merged = l.filter(k => k.pr?.state === 'MERGED').length, safe = l.filter(k => k.safe).length
    if (h.crate) {
      const k = h.crate
      return `<div class="t">📦 ${esc(k.name)}</div><div>${esc(k.branch || 'detached')}</div><div><i class="s" style="background:${TAG[k.pr?.state || 'none']}"></i>${esc(state(k.pr))}${k.pr?.title ? ' · ' + esc(k.pr.title.slice(0, 50)) : ''}</div><div class="m">untouched ${k.mtime ? age(Date.now() - k.mtime) : '?'}${dusty(k) ? ' · dusty' : ''}</div>${verdict(k) ? `<div>${verdict(k)}</div>` : ''}<div class="m">click for the whole list</div>`
    }
    return `<div class="t">🧳 Lost &amp; found${data.demo ? ' (demo)' : ''}</div><div>${l.length} worktree${l.length === 1 ? '' : 's'} with no live session · ${merged} merged · ${safe} safe to remove</div><div class="m">click for the list — nothing here removes anything</div>`
  })
  tower.on('click', (w, person) => {
    if (person || !hit(w)) return false
    open(); return true
  })

  // ---------- the list ----------
  function open() {
    if (!panel) {
      panel = document.createElement('div'); panel.className = 'card'; panel.id = 'lostfound'
      panel.style.cssText = 'position:absolute;top:12px;left:12px;z-index:8;width:min(560px,calc(100% - 24px));max-height:calc(100% - 24px);overflow:auto;padding:12px 14px;font-size:var(--fs)'
      panel.addEventListener('click', e => {
        const a = e.target.closest('[data-url]'); if (a) { api.openLink(a.dataset.url); return }
        if (e.target.closest('[data-close]')) panel.style.display = 'none'
      })
      document.getElementById('wrap').appendChild(panel)
    }
    panel.style.display = 'block'; fill()
  }
  function fill() {
    const l = [...crates()].sort((a, b) => (b.safe - a.safe) || (a.pr?.state === 'MERGED' ? 0 : 1) - (b.pr?.state === 'MERGED' ? 0 : 1) || (a.mtime ?? 0) - (b.mtime ?? 0))
    const row = k => `<div style="padding:6px 0;border-top:1px solid var(--card-line)">
      <div><i class="s" style="display:inline-block;width:8px;height:8px;border-radius:2px;margin-right:6px;background:${TAG[k.pr?.state || 'none']}"></i><b>${esc(k.name)}</b> <span style="color:var(--muted)">· ${k.mtime ? age(Date.now() - k.mtime) : '?'}${dusty(k) ? ' · dusty' : ''}</span></div>
      <div style="color:var(--muted)">${esc(k.branch || 'detached')}</div>
      <div>${k.pr?.url ? `<a data-url="${esc(k.pr.url)}" style="color:#9fd0ff;cursor:pointer">${esc(state(k.pr))}</a>` : esc(state(k.pr))}${k.pr?.title ? ` <span style="color:var(--muted)">${esc(k.pr.title.slice(0, 70))}</span>` : ''}</div>
      ${verdict(k) ? `<div>${verdict(k)}</div>` : ''}</div>`
    panel.innerHTML = `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><b style="flex:1">🧳 LOST &amp; FOUND · ${l.length} abandoned worktree${l.length === 1 ? '' : 's'}${data?.demo ? ' (demo)' : ''}</b><button class="hbtn" data-close title="Close">✕</button></div>
      <div style="color:var(--muted);margin-bottom:6px">Worktrees under the repo's .claude/worktrees with no live session. Read-only — nothing here removes anything.</div>
      ${l.map(row).join('') || '<div style="color:var(--muted)">nothing lost</div>'}`
  }
  addEventListener('keydown', e => { if (e.key === 'Escape' && panel) panel.style.display = 'none' })
}
