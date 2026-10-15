// side-panel: a subagent's (or a session's) transcript, followed live and docked right. The tower opens it on a click
// (tower/features/interactions.js); ?demo=panel / ?demo=panel-session open the first one.
export default function init(api) {
  const style = document.createElement('style')
  style.textContent = `
  #sidepanel { position: absolute; top: var(--gut); right: var(--gut); bottom: var(--gut); width: 380px; max-width: calc(100% - 2 * var(--gut));
    z-index: 5; display: none; flex-direction: column; overflow: hidden; }
  #sidepanel.open { display: flex; animation: spIn .2s ease-out; }
  @keyframes spIn { from { transform: translateX(16px); opacity: 0; } }
  #sidepanel .hd { flex: none; padding: 12px 14px 10px 16px; border-bottom: 1px solid var(--card-line); position: relative; }
  #sidepanel .hd .bar { position: absolute; left: 0; top: 12px; bottom: 10px; width: 3px; border-radius: 0 2px 2px 0; }
  #sidepanel .ttl { font-weight: 700; font-size: 13px; padding-right: 30px; overflow-wrap: anywhere; }
  #sidepanel .sub { color: var(--muted); font-size: var(--fs-s); margin-top: 3px; }
  #sidepanel .sub b { color: var(--ink); font-weight: 600; }
  #sidepanel .x { position: absolute; top: 8px; right: 8px; width: 26px; height: 26px; font-size: 12px; }
  #sidepanel .bd { flex: 1; min-height: 0; overflow-y: auto; padding: 6px 10px 12px; font-size: var(--fs); scrollbar-width: thin; scrollbar-color: #3a3c48 transparent; }
  #sidepanel .ev { margin: 6px 0; padding: 7px 9px; border-radius: var(--radius-s); background: rgba(255, 255, 255, .04); border-left: 3px solid var(--line); overflow-wrap: anywhere; }
  #sidepanel .ev .h { display: flex; gap: 8px; align-items: baseline; }
  #sidepanel .ev .h .k { font-weight: 600; } #sidepanel .ev .h .a { margin-left: auto; color: var(--muted); font-size: var(--fs-xs); flex: none; }
  #sidepanel .ev .b { white-space: pre-wrap; color: #d7d5e3; margin-top: 3px; }
  #sidepanel .ev .m { color: var(--muted); margin-top: 2px; }
  #sidepanel .ev.text { border-left-color: var(--think); background: rgba(99, 179, 240, .06); }
  #sidepanel .ev.tool { border-left-color: var(--tool); }
  #sidepanel .ev.result { border-left-color: #3b3e4c; background: rgba(255, 255, 255, .025); }
  #sidepanel .ev.result .b { color: #a9a7bb; max-height: 9.5em; overflow: hidden; }
  #sidepanel .ev.error { border-left-color: #e66a6a; }
  #sidepanel .ev.user { border-left-color: var(--wait); }
  #sidepanel .note { color: var(--muted); padding: 16px 4px; }`
  document.head.append(style)

  const el = document.createElement('div'); el.id = 'sidepanel'; el.className = 'card'
  el.innerHTML = '<div class="hd"><i class="bar"></i><div class="ttl"></div><div class="sub"></div><button class="x hbtn" title="Close (Esc)">✕</button></div><div class="bd"></div>'
  api.hud.append(el)
  const ttl = el.querySelector('.ttl'), sub = el.querySelector('.sub'), bd = el.querySelector('.bd'), bar = el.querySelector('.bar')
  const zoomCol = document.getElementById('zoom'), wrapW = () => api.hud.clientWidth
  let target = null, timer = null, lastSig = ''
  el.querySelector('.x').onclick = close
  addEventListener('keydown', e => { if (e.key === 'Escape' && target) close() })

  function open(session, id) {
    target = { session, id }; lastSig = ''; delete bd.dataset.seen
    bd.innerHTML = '<div class="note">loading…</div>'; ttl.textContent = ''; sub.textContent = ''
    bar.style.background = `hsl(${api.hash(session) % 360} 55% 62%)`
    el.classList.add('open')
    // the toolbar moves left of the drawer while there is room for it
    if (zoomCol && wrapW() > el.offsetWidth + 100) zoomCol.style.right = `calc(${el.offsetWidth}px + 2 * var(--gut))`
    clearInterval(timer); timer = setInterval(load, 2000); load()
  }
  function close() {
    target = null; clearInterval(timer); el.classList.remove('open')
    if (zoomCol) zoomCol.style.right = ''
  }
  api.openPanel = open; api.closePanel = close; api.panelTarget = () => target

  const clock = t => t ? new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : ''
  function item(it) {
    const e = api.esc
    if (it.kind === 'text') return `<div class="ev text"><div class="h"><span class="k">💭 says</span><span class="a">${clock(it.t)}</span></div><div class="b">${e(it.text)}</div></div>`
    if (it.kind === 'user') return `<div class="ev user"><div class="h"><span class="k">✉ prompt</span><span class="a">${clock(it.t)}</span></div><div class="b">${e(it.text)}</div></div>`
    if (it.kind === 'tool') return `<div class="ev tool"><div class="h"><span class="k">${e(api.toolLabel(it.tool))}</span>${/^⚙/.test(api.toolLabel(it.tool)) ? '' : `<span class="m">${e(it.tool)}</span>`}<span class="a">${clock(it.t)}</span></div>`
      + `${it.head ? `<div class="b">${e(it.head)}</div>` : ''}${it.body ? `<div class="m">${e(it.body)}</div>` : ''}</div>`
    return `<div class="ev result${it.error ? ' error' : ''}"><div class="h"><span class="k">${it.error ? '✗ error' : '↳ result'}</span><span class="a">${clock(it.t)}</span></div>${it.text ? `<div class="b">${e(it.text)}</div>` : ''}</div>`
  }
  async function load() {
    const t = target; if (!t) return
    const q = new URLSearchParams({ session: t.session }); if (t.id) q.set('id', t.id)
    let d
    try {
      const r = await fetch('/api/side-panel/agent?' + q, { cache: 'no-store' })
      d = await r.json()
      if (!r.ok) throw new Error(d.error)
    } catch (err) { if (t === target && !lastSig) bd.innerHTML = `<div class="note">${api.esc(err.message || 'server offline')}</div>`; return }
    if (t !== target) return
    const s = api.sessions.find(x => x.id === t.session)
    ttl.textContent = d.kind === 'agent' ? (d.description || d.type) : (s?.title || d.id.slice(0, 8))
    const e = api.esc
    const bits = d.kind === 'agent' ? [e(d.type), d.workflow && `workflow <b>${e(d.workflow)}</b>`, d.phase && `phase <b>${e(d.phase)}</b>`]
      : ['session', e(s?.worktree || s?.branch)]
    sub.innerHTML = [...bits, e(api.ago(d.lastActivity)), !s && 'session ended'].filter(Boolean).join(' · ')
    const sig = d.lastActivity + ':' + d.items.length
    if (sig === lastSig) return
    lastSig = sig
    const atBottom = bd.scrollHeight - bd.scrollTop - bd.clientHeight < 40
    bd.innerHTML = d.items.length ? d.items.map(item).join('') : '<div class="note">nothing yet</div>'
    if (atBottom || !bd.dataset.seen) bd.scrollTop = bd.scrollHeight
    bd.dataset.seen = '1'
  }

  const demo = new URLSearchParams(location.search || location.hash.slice(1)).get('demo')
  let demoDone = false
  if (demo === 'panel' || demo === 'panel-session') api.on('sync', data => {
    if (demoDone) return
    const s = data.sessions.find(x => x.agents.length) || data.sessions[0]
    if (!s) return
    demoDone = true
    demo === 'panel' && s.agents.length ? open(s.id, s.agents[0].id) : open(s.id, null)
  })
}
