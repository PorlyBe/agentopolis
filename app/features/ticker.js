// ticker: the ACTIVITY card, top-right beside the toolbar — the latest tool calls, newest on top. Collapsed it shows four, the older ones
// fading; a click expands the full feed in a taller scrolling card (Esc or ▾ folds it). ?demo=activity opens it expanded.
// The card registers its collapsed footprint in api.hudCorners so the tower's fit frames the building clear of it.
const ROWS = 4, ROW_H = 24

export default function init(api) {
  const style = document.createElement('style')
  style.textContent = `
  #activity { position: absolute; top: var(--gut); right: 58px; z-index: 3; width: 360px;
    max-width: calc(100% - 2 * var(--gut) - 56px); display: flex; flex-direction: column; overflow: hidden; transition: right .25s; }
  #activity .ahd { flex: none; display: flex; align-items: center; gap: 8px; height: 30px; padding: 0 4px 0 12px; cursor: pointer; user-select: none; }
  #activity .ahd .live { width: 6px; height: 6px; border-radius: 50%; background: var(--tool); box-shadow: 0 0 6px var(--tool); }
  body[data-replay] #activity .ahd .live { background: #f29a4e; box-shadow: 0 0 6px #f29a4e; }
  #activity .ahd .hbtn { width: 24px; height: 24px; margin-left: auto; font-size: 11px; color: var(--muted); }
  #activity .list { position: relative; padding: 0 6px 6px; height: ${ROWS * ROW_H + 6}px; overflow: hidden; cursor: pointer; }
  #activity.open .list { height: auto; max-height: min(560px, calc(100vh - 220px)); overflow-y: auto; cursor: default;
    scrollbar-width: thin; scrollbar-color: #3a3c48 transparent; }
  #activity .it { display: flex; align-items: center; gap: 7px; height: ${ROW_H}px; padding: 0 6px; border-radius: 5px;
    font-size: var(--fs); white-space: nowrap; transition: opacity .4s; }
  #activity .it:hover { background: var(--card-hi); }
  #activity:not(.open) .it:nth-child(n+${ROWS + 1}) { display: none; }
  #activity:not(.open) .it:nth-child(3) { opacity: .62; }
  #activity:not(.open) .it:nth-child(4) { opacity: .32; }
  #activity .it.in { animation: actIn .45s ease-out both; }
  @keyframes actIn { from { opacity: 0; transform: translateY(-6px); } }
  #activity .sw { flex: none; width: 3px; height: 14px; border-radius: 2px; }
  #activity .ic { flex: none; width: 16px; text-align: center; font-size: 11px; }
  #activity .who { flex: 0 1 auto; max-width: 42%; overflow: hidden; text-overflow: ellipsis; font-weight: 600; }
  #activity .dt { flex: 1 1 0; min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--muted); }
  #activity .ago { flex: none; color: var(--muted); font-size: var(--fs-xs); min-width: 24px; text-align: right; }
  #activity .none { color: var(--muted); font-size: var(--fs); padding: 4px 6px; }`
  document.head.append(style)

  const card = document.createElement('div'); card.id = 'activity'; card.className = 'card'
  card.innerHTML = '<div class="ahd"><i class="live"></i><span class="hlbl">Activity</span><button class="hbtn tog"></button></div><div class="list"><div class="none">no tool calls in the last two hours</div></div>'
  api.hud.append(card)
  const list = card.querySelector('.list'), tog = card.querySelector('.tog')
  const nodes = new Map() // tool_use id -> element
  let first = true, open = false

  function setOpen(on) {
    open = on; card.classList.toggle('open', on)
    tog.textContent = on ? '▾' : '▴'; tog.title = on ? 'Fold the feed (Esc)' : 'Show the full feed'
    if (on) list.scrollTop = 0
  }
  setOpen(false)
  card.querySelector('.ahd').onclick = () => setOpen(!open)
  list.addEventListener('click', () => { if (!open) setOpen(true) })
  addEventListener('keydown', e => { if (e.key === 'Escape' && open && !api.panelTarget?.() && !document.body.dataset.replay) setOpen(false) })

  // sit just left of the toolbar, following it when the side panel pushes it over
  const bar = document.getElementById('zoom')
  const dock = () => { if (bar) card.style.right = `${parseFloat(getComputedStyle(bar).right) + bar.offsetWidth + 8}px` }
  dock(); addEventListener('resize', dock)
  if (bar) new MutationObserver(dock).observe(bar, { attributes: true, attributeFilter: ['style', 'class'] })
  // the fit keeps the tower clear of the card and toolbar on the right (h: full height, so it narrows rather than lifts)
  ;(api.hudCorners ||= []).push(() => ({ w: api.hud.clientWidth - card.offsetLeft + 12, h: api.hud.clientHeight }))

  const agoShort = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? s + 's' : s < 3600 ? Math.round(s / 60) + 'm' : Math.round(s / 3600) + 'h' }
  function make(it) {
    const el = document.createElement('div'); el.className = 'it'
    const hue = api.hash(it.session) % 360, label = api.toolLabel(it.tool), sp = label.indexOf(' ')
    const icon = label.slice(0, sp), word = label.slice(sp + 1)
    el.innerHTML = `<i class="sw" style="background:hsl(${hue} 55% 62%)"></i><span class="ic">${api.esc(icon)}</span><span class="who">${api.esc(it.who)}</span>`
      + `<span class="dt">${api.esc(it.detail || word)}</span><span class="ago"></span>`
    el.title = `${it.who}\n${word} · ${it.tool}${it.detail ? '\n' + it.detail : ''}`
    el.dataset.t = it.t
    return el
  }
  api.on('sync', data => {
    const feed = data.ticker || []
    const keep = new Set(feed.map(i => i.id))
    for (const [id, el] of nodes) if (!keep.has(id)) { el.remove(); nodes.delete(id) }
    if (feed.length) list.querySelector('.none')?.remove()
    let before = list.firstChild
    // feed is newest first; walk it and keep DOM order identical
    for (const it of feed) {
      let el = nodes.get(it.id)
      if (!el) { el = make(it); nodes.set(it.id, el); if (!first) el.classList.add('in') }
      if (el !== before) list.insertBefore(el, before)
      before = el.nextSibling
    }
    first = false
    tick()
  })
  const tick = () => { for (const el of nodes.values()) el.lastChild.textContent = agoShort(+el.dataset.t) }
  setInterval(tick, 1000)

  if (new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('activity')) setOpen(true)
}
