// navigator: session chips in the header, the "Following … ✕" pill and the "?" help popover (?demo=help opens it). What they do (fly to a floor, 👁 follow, outline
// on hover, stop following) is wired by the tower in tower/features/interactions.js.
export default function init(api) {
  const { COLORS } = api
  const style = document.createElement('style')
  style.textContent = `
  #navchips { flex: 1 1 auto; min-width: 60px; display: flex; gap: 6px; overflow-x: auto; scrollbar-width: none; padding: 1px 0; }
  #navchips::-webkit-scrollbar { display: none; }
  #navchips.over { mask-image: linear-gradient(90deg, #000 calc(100% - 28px), transparent); }
  #navchips.over.scrolled { mask-image: linear-gradient(90deg, transparent, #000 28px, #000 calc(100% - 28px), transparent); }
  #navchips.over.end { mask-image: linear-gradient(90deg, transparent, #000 28px); }
  .navchip { flex: none; display: flex; align-items: center; gap: 6px; height: 26px; padding: 0 3px 0 9px; border-radius: var(--radius-s); cursor: pointer;
    border: 1px solid var(--card-line); background: rgba(255, 255, 255, .04); color: var(--ink); font-size: var(--fs); user-select: none;
    transition: background .15s, border-color .15s; }
  .navchip:hover { background: hsl(var(--h) 30% 22%); border-color: hsl(var(--h) 50% 50% / .7); }
  .navchip.on { border-color: var(--hue); background: hsl(var(--h) 30% 20%); }
  .navchip .st { width: 7px; height: 7px; border-radius: 50%; flex: none; box-shadow: 0 0 0 2px hsl(var(--h) 55% 62% / .35); }
  .navchip .t { max-width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .navchip .n { color: var(--muted); font-size: var(--fs-xs); padding: 1px 5px; border-radius: 999px; background: rgba(255, 255, 255, .07); }
  .navchip .n:empty { display: none; }
  .navchip .eye { width: 20px; height: 20px; display: grid; place-items: center; border-radius: 5px; font-size: 11px; opacity: .35; }
  .navchip:hover .eye { opacity: .7; }
  .navchip .eye:hover, .navchip.on .eye { opacity: 1; background: var(--card-hi); }
  #followpill { display: none; align-items: center; gap: 8px; height: 32px; padding: 0 4px 0 12px; border-radius: 999px; font-size: var(--fs);
    border-color: var(--pill, var(--card-line)); }
  #followpill.on { display: flex; }
  #followpill .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); }
  #followpill .nm b { color: var(--pill); }
  #followpill .hbtn { width: 24px; height: 24px; border-radius: 50%; font-size: 11px; flex: none; }`
  document.head.append(style)

  const strip = document.createElement('div'); strip.id = 'navchips'
  api.header.insertBefore(strip, document.getElementById('counts'))

  const pill = document.createElement('div'); pill.id = 'followpill'; pill.className = 'card'
  pill.innerHTML = '<span class="nm">Following <b></b></span><button class="hbtn" title="Stop following (Esc)">✕</button>'
  document.getElementById('topstack').prepend(pill)

  // the "?" popover: the colour legend and the tips
  const help = document.getElementById('help'), helpBtn = document.getElementById('helpBtn')
  const showHelp = on => { help.classList.toggle('on', on); helpBtn.classList.toggle('on', on) }
  helpBtn.onclick = () => showHelp(!help.classList.contains('on'))
  addEventListener('pointerdown', e => { if (!help.contains(e.target) && e.target !== helpBtn) showHelp(false) })
  addEventListener('keydown', e => { if (e.key === 'Escape' && help.classList.contains('on')) { e.stopImmediatePropagation(); showHelp(false) } }, true)
  if (new URLSearchParams(location.search + '&' + location.hash.slice(1)).getAll('demo').includes('help')) showHelp(true)

  const chips = new Map()
  const hue = id => api.hash(id) % 360
  const busy = s => s.agents.filter(g => g.state !== 'done' && g.state !== 'idle').length
  function chip(s) {
    const el = document.createElement('div'); el.className = 'navchip'; el.dataset.id = s.id
    el.innerHTML = '<i class="st"></i><span class="t"></span><span class="n"></span><span class="eye" title="Follow this session">👁</span>'
    el.style.setProperty('--h', hue(s.id)); el.style.setProperty('--hue', `hsl(${hue(s.id)} 55% 62%)`)
    return el
  }
  function render() {
    const live = new Set(api.sessions.map(s => s.id))
    for (const [id, el] of chips) if (!live.has(id)) { el.remove(); chips.delete(id) }
    api.sessions.forEach((s, i) => {
      let el = chips.get(s.id)
      if (!el) { el = chip(s); chips.set(s.id, el) }
      if (strip.children[i] !== el) strip.insertBefore(el, strip.children[i] || null)
      el.querySelector('.st').style.background = COLORS[s.state] || COLORS.idle
      el.querySelector('.t').textContent = s.title || s.id.slice(0, 8)
      const n = busy(s)
      el.querySelector('.n').textContent = n ? '👥' + n : ''
      el.title = `${s.title || s.id}${s.worktree || s.branch ? ' — ' + (s.worktree || s.branch) : ''}\n${s.state}${n ? `, ${n} agent(s) at work` : ''}`
    })
    edges()
  }
  function edges() {
    const over = strip.scrollWidth > strip.clientWidth + 1
    strip.classList.toggle('over', over)
    strip.classList.toggle('scrolled', over && strip.scrollLeft > 2)
    strip.classList.toggle('end', over && strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2)
  }
  strip.addEventListener('scroll', edges)
  strip.addEventListener('wheel', e => { if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) { strip.scrollLeft += e.deltaY; e.preventDefault() } }, { passive: false })
  new ResizeObserver(edges).observe(strip)
  api.on('sync', render)
}
