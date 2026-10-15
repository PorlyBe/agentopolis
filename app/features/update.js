// update: a ⬆ in the toolbar when GitHub main has commits this checkout lacks (snap.update, server/update-check.mjs).
// It opens a card with the new commits and the commands to update; the page itself never pulls or runs anything.
// "Dismiss until next version" hides it until main moves again. ?demo=update fakes three commits; ?update=open opens the card.
const KEY = 'agent-office.update-dismissed'

export default function init(api) {
  const { esc } = api
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1))
  const demo = params.getAll('demo').includes('update')
  let dismissed = null, u = null, isOpen = false, autoOpen = params.get('update') === 'open'
  try { dismissed = localStorage.getItem(KEY) } catch {}

  const style = document.createElement('style')
  style.textContent = `
  #tbUpdate .hbtn { position: relative; color: var(--think); }
  #tbUpdate .hbtn i { position: absolute; right: 1px; bottom: 1px; min-width: 13px; height: 13px; padding: 0 3px; border-radius: 7px; font: 600 9px/13px var(--font);
    font-style: normal; color: var(--ink); background: rgba(99, 179, 240, .3); }
  #updCard { position: absolute; z-index: 7; width: min(380px, calc(100% - 2 * var(--gut))); max-height: calc(100% - 2 * var(--gut)); overflow-y: auto; display: none;
    padding: 12px 14px; font-size: var(--fs); scrollbar-width: thin; scrollbar-color: #3a3c48 transparent; }
  #updCard.on { display: block; }
  #updCard h2 { margin: 0 0 2px; font-size: 12px; letter-spacing: 1.5px; display: flex; align-items: center; }
  #updCard h2 .hbtn { margin-left: auto; width: 24px; height: 24px; font-size: 11px; }
  #updCard p { margin: 6px 0; color: var(--muted); }
  #updCard ul { list-style: none; margin: 8px 0; padding: 0; display: grid; gap: 5px; }
  #updCard li { display: grid; grid-template-columns: auto 1fr; gap: 0 8px; }
  #updCard li code { color: var(--think); }
  #updCard li small { grid-column: 2; color: var(--muted); font-size: var(--fs-xs); }
  #updCard pre { margin: 6px 0; padding: 8px 10px; border-radius: var(--radius-s); background: rgba(255, 255, 255, .05); border: 1px solid var(--card-line);
    white-space: pre-wrap; user-select: all; }
  #updCard .btn { height: 28px; padding: 0 10px; border-radius: var(--radius-s); border: 1px solid var(--card-line); background: rgba(255, 255, 255, .05);
    color: var(--ink); font: 600 var(--fs-s) var(--font); cursor: pointer; }
  #updCard .btn:hover { background: var(--card-hi); }`
  document.head.append(style)

  const grp = document.createElement('div'); grp.className = 'grp'; grp.id = 'tbUpdate'
  const btn = document.createElement('button'); btn.className = 'hbtn'; btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false')
  grp.append(btn); grp.style.display = 'none'
  document.getElementById('zoom').append(grp)
  const card = document.createElement('div'); card.id = 'updCard'; card.className = 'card'; card.setAttribute('role', 'dialog'); card.setAttribute('aria-label', 'New version')
  api.hud.append(card)

  const shown = () => u?.status === 'behind' && u.ahead > 0 && (!u.head || u.head !== dismissed)
  function paint() {
    grp.style.display = shown() ? '' : 'none'
    if (!shown()) { if (isOpen) close(); return }
    btn.innerHTML = `⬆<i>${u.ahead > 99 ? '99+' : u.ahead}</i>`
    btn.title = `${u.ahead} new commit${u.ahead === 1 ? '' : 's'} on GitHub main`
    btn.setAttribute('aria-label', btn.title)
  }
  function open() {
    const zoom = document.getElementById('zoom'), wrap = api.hud.getBoundingClientRect(), r = btn.getBoundingClientRect()
    card.style.top = Math.max(8, r.top - wrap.top) + 'px'
    card.style.right = (wrap.right - zoom.getBoundingClientRect().left + 8) + 'px'
    const day = d => d ? new Date(d).toLocaleDateString([], { month: 'short', day: 'numeric' }) : ''
    const more = u.ahead - u.commits.length
    card.innerHTML = `<h2>⬆ NEW ON MAIN<button class="hbtn" title="Close (Esc)" aria-label="Close">✕</button></h2>
      <p>${u.ahead} commit${u.ahead === 1 ? '' : 's'} since this checkout.</p>
      <ul>${u.commits.map(c => `<li><code>${esc(c.sha)}</code><span>${esc(c.message)}</span><small>${esc(day(c.date))}</small></li>`).join('')}</ul>
      ${more > 0 ? `<p>…and ${more} more.</p>` : ''}
      <p>To update, in the Agentopolis folder${u.branch && u.branch !== 'main' && u.branch !== 'HEAD' ? ` (you’re on <b>${esc(u.branch)}</b>, so switch to main first)` : ''}:</p>
      <pre>git pull</pre>
      <p>then restart the server: stop it and run <code>npm start</code> (or <code>./start.sh</code>).</p>
      <div style="display:flex;justify-content:flex-end;margin-top:8px"><button class="btn" data-a="dismiss">Dismiss until next version</button></div>`
    card.querySelector('h2 .hbtn').onclick = close
    card.querySelector('[data-a="dismiss"]').onclick = () => {
      dismissed = u.head
      try { localStorage.setItem(KEY, dismissed) } catch {}
      close(); paint()
    }
    card.classList.add('on'); isOpen = true; btn.setAttribute('aria-expanded', 'true')
  }
  function close() { card.classList.remove('on'); isOpen = false; btn.setAttribute('aria-expanded', 'false') }
  btn.onclick = () => isOpen ? close() : open()
  addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') close() })
  addEventListener('pointerdown', e => { if (isOpen && !card.contains(e.target) && !btn.contains(e.target)) close() })

  api.on('sync', data => {
    if (demo) data.update = {
      status: 'behind', ahead: 3, branch: 'main', checkedAt: Date.now(), head: 'demo',
      commits: [['3c9e1a2', 'tower: a rooftop garden on quiet afternoons'], ['b71f04d', 'settings: remember the zoom level'], ['0a5d6e9', 'gazette: fix the date on Sunday editions']]
        .map(([sha, message], i) => ({ sha, message, date: new Date(Date.now() - (i + 1) * 864e5).toISOString() })),
    }
    if (!api.live || !data.update) return
    u = data.update; paint()
    if (autoOpen && shown()) { autoOpen = false; open() }
  })
}
