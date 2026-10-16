// The tower's input: drag to pan, pinch / wheel / + - 0 and the zoom buttons to zoom, hover tooltips and clicks.
// Features' hover / click / dblclick hooks are asked first; the built-in hit test covers people, plaques, the CEO's
// desk, the server racks and the neighbours' buildings.
import { RACKS, rackX, plaqueBox } from './building.js'
import { squeezed } from './render.js'

export function createInput(st, camera, ceo, overlay) {
  const { api, cv, tip, people, city, hooks, ask } = st
  const { cam, vw, vh, toWorld, zoomAt, fit } = camera
  let mouse = null, drag = null
  function thingAt(m) {
    if (!m) return null
    const w = toWorld(m.sx, m.sy), slots = st.slots, noteCard = overlay.noteCard
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
      if (w.x > slots.seat - 8 && w.x < slots.seat + 8 && w.y > slots.floor.y - 48 && w.y < slots.desk.y) return { ceo: 'owner' }
    }
    for (const f of st.floors) if (f.kind === 'session' && !squeezed(f)) { const b = plaqueBox(f); if (w.x >= b.x && w.x <= b.x + b.w && w.y >= b.y && w.y <= b.y + b.h) return { sign: f } }
    const base = st.floors[0]
    if (base && w.y > base.y - 46 && w.y < base.y) {
      const jobs = [...(st.snap?.serverRoom?.running || []), ...(st.snap?.serverRoom?.failed || []).map(j => ({ ...j, failed: true }))]
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
      const state = a?.leaving ? 'done' : d.state, doing = d.tool ? `${api.toolLabel(d.tool)}${d.detail ? ' — ' + d.detail : ''}` : state
      const where = a?.brk?.spot?.floor ? ` · on a break (${a.brk.spot.floor})` : a?.liftPhase ? ' · in the elevator' : ''
      html = !a || a.kind === 'session'
        ? `<div class="t">${esc(d.title)}</div><div class="m">${esc(d.worktree || d.branch || '')}</div><div>${sw(api.COLORS[state] || api.COLORS.idle)}${esc(doing)}</div><div class="m">${d.agents.length} subagent(s) · ${ago(d.lastActivity)}${where}</div><div class="m">${d.running ? '↗ click to open in Orca' : 'no longer running'}</div>`
        : `<div class="t">${esc(d.description || d.type)}</div><div class="m">${esc(d.type)}${d.workflow ? ' · ' + esc(d.workflow) : ''}${d.phase ? ' · ' + esc(d.phase) : ''}</div><div>${sw(api.COLORS[state] || api.COLORS.idle)}${esc(a.leaving ? 'done' : doing)}</div><div class="m">${ago(d.lastActivity)}${where}</div>`
    } else if (hit.ceo) {
      const list = ceo.needsPaul()
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
    if (hit.ceo) return ceo.focusFirst()
    if (hit.actor) { const d = hit.actor.data; return api.toast(`${d.description || d.type} · ${d.state}${d.tool ? ' · ' + api.toolLabel(d.tool) : ''}`, 3500) }
    if (hit.job) return api.toast(`${hit.job.kind}: ${hit.job.label}`)
    if (hit.building) {
      const pr = hit.building.prs[hit.pr]
      if (pr?.url) return api.openLink(pr.url)
      const login = hit.building.e.login, repo = city.repo
      api.openLink(repo ? `https://github.com/${repo}/pulls?q=${encodeURIComponent(`is:pr is:open author:${login}`)}` : `https://github.com/${login}`)
    }
  }

  // ---------- pointer, wheel, keys ----------
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
    if (drag.moved) { camera.stop(); cam.cx = drag.cx0 - dx / cam.zoom; cam.cy = drag.cy0 - dy / cam.zoom; cam.auto = false; camera.clampCam() }
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
    camera.stop(false)
    zoomAt(cam.zoom * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015)), camera.following ? vw() / 2 : m.sx, camera.following ? vh() / 2 : m.sy)
  }, { passive: false })
  document.getElementById('zoomIn').addEventListener('click', () => st.active && zoomAt(cam.zoom * 1.25))
  document.getElementById('zoomOut').addEventListener('click', () => st.active && zoomAt(cam.zoom / 1.25))
  document.getElementById('zoomFit').addEventListener('click', () => st.active && fit())
  addEventListener('keydown', e => {
    if (!st.active || e.target.closest?.('input, textarea')) return
    if (e.key === '+' || e.key === '=') zoomAt(cam.zoom * 1.25)
    else if (e.key === '-') zoomAt(cam.zoom / 1.25)
    else if (e.key === '0') fit()
  })
  return { hover, showTip }
}
