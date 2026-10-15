// toolbar-tips: a label beside each toolbar button on hover or keyboard focus, saying what it does. It reads the
// button's title (moved to data-tip so the slow native tooltip doesn't double up), so features keep setting `title`.
export default function init() {
  const bar = document.getElementById('zoom'); if (!bar) return
  const style = document.createElement('style')
  style.textContent = `
  #tbTip { position: fixed; z-index: 20; pointer-events: none; padding: 5px 9px; border-radius: 6px; white-space: nowrap;
    background: var(--card); border: 1px solid var(--card-line); box-shadow: var(--shadow); font-size: var(--fs-s);
    opacity: 0; transform: translateX(4px); transition: opacity .12s, transform .12s; }
  #tbTip.on { opacity: 1; transform: none; }`
  document.head.append(style)
  const tip = document.createElement('div'); tip.id = 'tbTip'; tip.setAttribute('role', 'tooltip'); document.body.append(tip)
  let cur = null

  function show(btn) {
    if (btn.title) { btn.dataset.tip = btn.title; btn.removeAttribute('title') }
    const text = btn.dataset.tip || btn.getAttribute('aria-label'); if (!text) return hide()
    if (!btn.getAttribute('aria-label')) btn.setAttribute('aria-label', text)
    cur = btn; tip.textContent = text
    const r = btn.getBoundingClientRect(), w = tip.offsetWidth, h = tip.offsetHeight
    const left = r.left - w - 8 >= 8 ? r.left - w - 8 : Math.min(innerWidth - w - 8, r.right + 8)
    tip.style.left = left + 'px'; tip.style.top = Math.round(r.top + r.height / 2 - h / 2) + 'px'
    tip.classList.add('on')
  }
  function hide() { cur = null; tip.classList.remove('on') }

  bar.addEventListener('pointerover', e => { const b = e.target.closest('button'); if (b && b !== cur) show(b) })
  bar.addEventListener('pointerleave', hide)
  bar.addEventListener('focusin', e => { const b = e.target.closest('button'); if (b) show(b) })
  bar.addEventListener('focusout', hide)
  bar.addEventListener('click', () => requestAnimationFrame(() => cur && show(cur)))   // a toggle may have changed its label
  addEventListener('scroll', hide, true); addEventListener('resize', hide)
}
