// settings: the ⚙ panel, in tabs (You · Look · Features · Updates · Advanced). Name, look, theme, the update check and
// the inactive-session window save to the server as you change them (POST /api/settings, ~/.agentopolis/settings.json)
// and show on the next poll; tower features are switched on or off with "Apply & reload", since the tower starts them
// once. ?demo=settings or ?settings=open opens it on the last tab; ?settings=<tab> (you, look, features…) on that tab.
// The Look tab holds the skin grid, the custom theme editor (live on the tower through api.theme.preview until saved) and
// the floor decorator's rules; ?settings=editor opens the editor.
import { parseTheme, slugOf, checkCustomTheme, checkFloorRules } from '../options.js'
import { thumb, skinLabel, coloursOf, builtinSkin } from '../tower/features/themes.js'
import { HOLIDAYS, calendarOf } from '../tower/features/holidays.js'
import { parseLook } from '../tower/features/avatar.js'

const LOOK_LABEL = { hair: 'Hair', haircolour: 'Hair colour', suit: 'Suit', skin: 'Skin', glasses: 'Glasses', pet: 'Pet' }
const TABS = [['you', 'You'], ['look', 'Look'], ['features', 'Features'], ['updates', 'Updates'], ['advanced', 'Advanced']]
const TAB_KEY = 'agent-office.settings-tab'
const cap = s => s[0].toUpperCase() + s.slice(1)
const words = s => cap(s.replace(/-/g, ' '))
const SLOT_LABEL = { sky: 'Sky', horizon: 'Horizon', night: 'Night sky', skyline: 'Skyline', facade: 'Facade', floor: 'Floor walls', slab: 'Slabs', street: 'Street', accent: 'Accent / neon' }
const RULE_LABEL = { wallpaper: 'Wallpaper', carpet: 'Carpet', plants: 'Plants', props: 'Props' }

export default function init(api) {
  const { esc } = api
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1))
  const demos = params.getAll('demo')
  const urlTheme = params.get('theme') || (demos.includes('themes') ? 'cycling' : null)
  const urlAvatar = params.get('avatar') || (demos.includes('avatar') ? 'cycling' : null)
  const running = new Set(api.settings?.effective?.disabled || [])   // what this page started with
  let st = api.settings, staged = new Set(running), isOpen = false, lastFocus = null, filter = ''
  let tab = 'you'
  try { const t = localStorage.getItem(TAB_KEY); if (TABS.some(([k]) => k === t)) tab = t } catch {}
  const expanded = new Set()

  const style = document.createElement('style')
  style.textContent = `
  #stBack { position: absolute; inset: 0; z-index: 8; display: none; place-items: center; padding: var(--gut); background: rgba(10, 11, 16, .5); }
  #stBack.on { display: grid; }
  #settings { position: relative; width: min(520px, 100%); height: min(600px, 100%); display: flex; flex-direction: column; overflow: hidden; font-size: var(--fs); }
  #settings [hidden] { display: none !important; }
  #settings .hd { flex: none; display: flex; align-items: center; gap: 10px; padding: 12px 10px 10px 16px; }
  #settings h2 { margin: 0; font-size: 13px; letter-spacing: 1.5px; }
  #settings .hd .hbtn { margin-left: auto; width: 26px; height: 26px; font-size: 12px; }
  #settings [role=tablist] { flex: none; display: flex; gap: 2px; padding: 0 10px; border-bottom: 1px solid var(--card-line); overflow-x: auto; scrollbar-width: none; }
  #settings [role=tab] { flex: none; height: 32px; padding: 0 10px; border: 0; border-bottom: 2px solid transparent; background: none; color: var(--muted);
    font: 600 var(--fs) var(--font); cursor: pointer; }
  #settings [role=tab]:hover { color: var(--ink); }
  #settings [role=tab][aria-selected=true] { color: var(--ink); border-bottom-color: var(--think); }
  #settings [role=tab] small { color: var(--wait); font-weight: 400; }
  #settings .bd { flex: 1; min-height: 0; overflow-y: auto; padding: 14px 16px; scrollbar-width: thin; scrollbar-color: #3a3c48 transparent; }
  #settings label.f { display: grid; gap: 4px; color: var(--muted); font-size: var(--fs-s); }
  #settings input[type=text], #settings input[type=search], #settings input[type=number], #settings select { width: 100%; height: 30px; padding: 0 8px;
    border-radius: var(--radius-s); border: 1px solid var(--card-line); background: rgba(255, 255, 255, .05); color: var(--ink); font: var(--fs) var(--font); }
  #settings select option { background: #1e2029; }
  #settings :is(input, select, button):focus-visible { outline: 2px solid var(--think); outline-offset: 1px; }
  #settings .note { color: var(--muted); font-size: var(--fs-s); margin: 6px 0 0; }
  #settings .note.warn { color: var(--wait); }
  #settings .skins { display: grid; grid-template-columns: repeat(auto-fill, minmax(88px, 1fr)); gap: 6px; }
  #settings .sk { position: relative; display: grid; gap: 3px; justify-items: center; padding: 5px 4px 4px; border: 1px solid var(--card-line); border-radius: var(--radius-s);
    background: rgba(255, 255, 255, .03); color: var(--muted); font: var(--fs-s) var(--font); cursor: pointer; text-align: center; }
  #settings .sk:hover { background: var(--card-hi); color: var(--ink); }
  #settings .sk input { position: absolute; opacity: 0; pointer-events: none; }
  #settings .sk canvas { width: 100%; aspect-ratio: 64 / 44; image-rendering: pixelated; border-radius: 3px; }
  #settings .sk:has(input:checked) { border-color: var(--think); color: var(--ink); background: var(--card-hi); }
  #settings .sk:has(input:focus-visible) { outline: 2px solid var(--think); outline-offset: 1px; }
  #settings .sk.new { place-content: center; border-style: dashed; min-height: 70px; }
  #settings .sk.new b { font-size: 18px; font-weight: 400; }
  #settings h3 { margin: 18px 0 6px; font-size: var(--fs-s); letter-spacing: 1px; color: var(--muted); text-transform: uppercase; }
  #settings .ed { margin-top: 10px; padding: 10px; border: 1px solid var(--card-line); border-radius: var(--radius-s); display: grid; gap: 10px; }
  #settings .cols { display: grid; grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px 10px; }
  #settings .cols label { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: var(--fs-s); cursor: pointer; }
  #settings input[type=color] { width: 30px; height: 22px; padding: 0; border: 1px solid var(--card-line); border-radius: 4px; background: none; cursor: pointer; }
  #settings textarea { width: 100%; padding: 6px 8px; border-radius: var(--radius-s); border: 1px solid var(--card-line); background: rgba(255, 255, 255, .05); color: var(--ink);
    font: var(--fs-xs) ui-monospace, monospace; resize: vertical; }
  #settings .rule { display: grid; grid-template-columns: minmax(90px, 1.3fr) repeat(4, minmax(70px, 1fr)) auto auto; gap: 4px; align-items: center; margin-bottom: 4px; }
  #settings .rule :is(input, select) { height: 26px; font-size: var(--fs-s); padding: 0 4px; }
  #settings .rule .hbtn { width: 24px; height: 24px; font-size: 11px; }
  #settings .look { display: grid; grid-template-columns: 78px 1fr; gap: 12px; align-items: start; margin-top: 12px; }
  #settings .look canvas { width: 78px; height: 138px; padding: 4px 6px; image-rendering: pixelated; border-radius: var(--radius-s); background: rgba(255, 255, 255, .04);
    border: 1px solid var(--card-line); }
  #settings .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px 10px; }
  #settings .acc { border: 1px solid var(--card-line); border-radius: var(--radius-s); margin-top: 8px; }
  #settings .acc-h { display: flex; align-items: center; gap: 8px; padding: 0 8px 0 0; }
  #settings .acc-h > button { flex: 1; display: flex; align-items: center; gap: 8px; height: 34px; padding: 0 10px; border: 0; background: none; color: var(--ink);
    font: 600 var(--fs) var(--font); cursor: pointer; text-align: left; border-radius: var(--radius-s); }
  #settings .acc-h > button:hover { background: var(--card-hi); }
  #settings .acc-h > button::before { content: '▸'; color: var(--muted); transition: transform .15s; }
  #settings .acc-h > button[aria-expanded=true]::before { transform: rotate(90deg); }
  #settings .acc-h small { margin-left: auto; color: var(--muted); font-weight: 400; }
  #settings .acc-h label { display: flex; align-items: center; gap: 4px; color: var(--muted); font-size: var(--fs-xs); cursor: pointer; }
  #settings .acc-h input { margin: 0; accent-color: var(--tool); }
  #settings .acc-b { padding: 0 6px 6px; }
  #settings .tog { display: grid; grid-template-columns: auto 1fr; gap: 1px 8px; align-items: baseline; padding: 4px 6px; border-radius: var(--radius-s); cursor: pointer; }
  #settings .tog:hover { background: var(--card-hi); }
  #settings .tog input { grid-row: span 2; margin: 0; accent-color: var(--tool); transform: translateY(2px); }
  #settings .tog b { font-weight: 600; }
  #settings .tog span { color: var(--muted); font-size: var(--fs-s); }
  #settings .tog.off b { color: var(--muted); text-decoration: line-through; }
  #settings .btn { height: 30px; padding: 0 12px; border-radius: var(--radius-s); border: 1px solid var(--card-line); background: rgba(255, 255, 255, .05);
    color: var(--ink); font: 600 var(--fs) var(--font); cursor: pointer; }
  #settings .btn:hover { background: var(--card-hi); }
  #settings .btn:disabled { opacity: .45; cursor: default; }
  #settings .btn.go { border-color: #5fd17a88; background: #5fd17a22; }
  #settings .btn.danger { border-color: #ef5a5a66; color: #f3b0b0; }
  #settings .row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
  #settings .apply { flex: none; padding: 10px 16px; border-top: 1px solid var(--card-line); display: none; }
  #settings .apply.on { display: flex; }
  #settings .ft { flex: none; padding: 8px 16px; border-top: 1px solid var(--card-line); color: var(--muted); font-size: var(--fs-xs); }
  @media (max-width: 460px) { #settings .rule { grid-template-columns: 1fr 1fr; } #settings .grid { grid-template-columns: 1fr; } #settings .look { grid-template-columns: 1fr; } #settings .look canvas { margin: 0 auto; } }`
  document.head.append(style)

  const btn = document.createElement('button'); btn.className = 'hbtn'; btn.id = 'settingsBtn'
  btn.textContent = '⚙'; btn.title = 'Settings'; btn.setAttribute('aria-label', 'Settings'); btn.setAttribute('aria-haspopup', 'dialog'); btn.setAttribute('aria-expanded', 'false')
  document.getElementById('tbSettings').append(btn)

  const id = s => 'st-' + s
  const back = document.createElement('div'); back.id = 'stBack'
  back.innerHTML = `<div id="settings" class="card" role="dialog" aria-modal="true" aria-labelledby="stTitle">
    <div class="hd"><h2 id="stTitle">⚙ SETTINGS</h2><button class="hbtn x" title="Close (Esc)" aria-label="Close settings">✕</button></div>
    <div role="tablist" aria-label="Settings sections">${TABS.map(([k, l]) => `<button role="tab" id="${id('tab-' + k)}" aria-controls="${id('panel-' + k)}">${l}</button>`).join('')}</div>
    <div class="bd"></div>
    <div class="apply row"><button class="btn go" data-a="apply">Apply &amp; reload</button><span class="note" style="margin:0">Features start once, so switching them needs a reload.</span></div>
    <div class="ft"></div></div>`
  api.hud.append(back)
  const dlg = back.firstElementChild, bd = dlg.querySelector('.bd'), ft = dlg.querySelector('.ft'), applyBar = dlg.querySelector('.apply')
  const tablist = dlg.querySelector('[role=tablist]'), tabBtns = [...tablist.children]

  btn.onclick = () => isOpen ? close() : open()
  dlg.querySelector('.x').onclick = () => close()
  back.addEventListener('pointerdown', e => { if (e.target === back) close() })
  addEventListener('keydown', e => { if (isOpen && e.key === 'Escape') { e.stopImmediatePropagation(); e.preventDefault(); close() } }, true)
  dlg.addEventListener('keydown', e => {
    e.stopPropagation()   // the tower's zoom keys and the replay's space stay out of the form
    if (e.key !== 'Tab') return
    const f = [...dlg.querySelectorAll('button, input, select, textarea')].filter(x => !x.disabled && x.offsetParent && x.tabIndex >= 0)
    if (!f.length) return
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f.at(-1).focus() }
    else if (!e.shiftKey && document.activeElement === f.at(-1)) { e.preventDefault(); f[0].focus() }
  })
  tablist.addEventListener('click', e => { const b = e.target.closest('[role=tab]'); if (b) showTab(b.id.slice(id('tab-').length)) })
  tablist.addEventListener('keydown', e => {
    const i = TABS.findIndex(([k]) => k === tab)
    const j = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: TABS.length - 1 }[e.key]
    if (j === undefined) return
    e.preventDefault(); showTab(TABS[(j + TABS.length) % TABS.length][0]); tabBtns.find(b => b.getAttribute('aria-selected') === 'true').focus()
  })

  function showTab(k) {
    tab = k
    try { localStorage.setItem(TAB_KEY, k) } catch {}
    for (const b of tabBtns) { const on = b.id === id('tab-' + k); b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1 }
    for (const p of bd.querySelectorAll('[role=tabpanel]')) p.hidden = p.id !== id('panel-' + k)
    bd.scrollTop = 0
  }

  async function open(at) {
    lastFocus = document.activeElement
    try { const r = await fetch('/api/settings', { cache: 'no-store' }); if (r.ok) st = api.settings = await r.json() } catch {}
    if (!st) return api.toast('Settings need a newer Agentopolis server')
    isOpen = true; render(); showTab(TABS.some(([k]) => k === at) ? at : tab); back.classList.add('on'); btn.setAttribute('aria-expanded', 'true')
    tabBtns.find(b => b.tabIndex === 0)?.focus()
  }
  function close() {
    if (!isOpen) return
    endEdit(); flush(); isOpen = false; back.classList.remove('on'); btn.setAttribute('aria-expanded', 'false')
    ;(lastFocus?.isConnected ? lastFocus : btn).focus?.()
  }

  // ---------- saving ----------
  let pending = {}, timer = 0
  const save = (patch, ms = 300) => { Object.assign(pending, patch); clearTimeout(timer); timer = setTimeout(flush, ms) }
  async function flush() {
    clearTimeout(timer)
    const patch = pending; pending = {}
    if (!Object.keys(patch).length) return true
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
      const j = await r.json()
      if (!r.ok) { api.toast(`Not saved: ${j.error}`); return false }
      st = api.settings = j; api.refresh(); api.toast('Saved', 1200); paintNotes()
      return true
    } catch { api.toast('Agentopolis server is offline'); return false }
  }

  // ---------- the form ----------
  function render() {
    endEdit()
    const e = st.effective, o = st.options, look = parseLook(e.avatar), t = parseTheme(e.theme)
    const today = calendarOf(new Date())
    const sel = (name, opts, cur, label) => `<label class="f" for="${id(name)}">${label}<select id="${id(name)}" data-k="${name}">${opts.map(([v, l]) => `<option value="${esc(v)}"${v === cur ? ' selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`
    const panel = (k, html) => `<div role="tabpanel" id="${id('panel-' + k)}" aria-labelledby="${id('tab-' + k)}" hidden>${html}</div>`
    bd.innerHTML = panel('you', `
      <label class="f" for="${id('name')}">Name on the CEO office<input type="text" id="${id('name')}" maxlength="40" autocomplete="off" spellcheck="false" value="${esc(e.name)}"></label>
      <div class="look"><canvas width="16" height="32" role="img" aria-label="Preview of your character"></canvas>
        <div class="grid">${Object.entries(o.avatar).map(([k, vals]) => sel('look-' + k, vals.map(v => [v, k === 'skin' ? 'Tone ' + v : cap(v)]), look[k], LOOK_LABEL[k] || k)).join('')}</div></div>
      <p class="note warn" data-n="avatar"></p>`)
    + panel('look', `
      <div class="skins" role="radiogroup" aria-label="Theme">
        ${skinChoices().map(([v, l]) => `<label class="sk"><input type="radio" name="${id('skin')}" data-k="skin" value="${esc(v)}"${v === (e.theme === 'auto' ? 'auto' : t.skin) ? ' checked' : ''}><canvas width="64" height="44" data-thumb="${esc(v)}" aria-hidden="true"></canvas>${esc(l)}</label>`).join('')}
        <button type="button" class="sk new" data-a="cnew" title="Make your own theme from the selected one"><b>＋</b>Custom…</button>
      </div>
      <div class="row" style="margin-top:8px"><button class="btn" data-a="cedit" hidden>Edit this theme</button></div>
      <div class="ed" hidden role="group" aria-label="Theme editor">
        <div class="row" style="align-items:end">
          <label class="f" for="${id('cname')}" style="flex:1 1 140px">Name<input type="text" id="${id('cname')}" maxlength="24" autocomplete="off" spellcheck="false"></label>
          <label class="f" for="${id('cbase')}" style="flex:1 1 140px">Start from<select id="${id('cbase')}">${skinChoices().filter(([v]) => v !== 'auto').map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select></label>
          <button class="btn" data-a="cdup">Duplicate</button>
        </div>
        <div class="cols">${o.themeSlots.map(k => `<label><input type="color" data-slot="${k}">${esc(SLOT_LABEL[k] || k)}</label>`).join('')}</div>
        <div class="row"><button class="btn go" data-a="csave">Save</button><button class="btn" data-a="cexport">Export</button><button class="btn danger" data-a="cdel">Delete</button><button class="btn" data-a="ccancel">Cancel</button></div>
        <textarea id="${id('cjson')}" rows="3" spellcheck="false" aria-label="Theme JSON, to share or import" placeholder="Paste a shared theme’s JSON here, then Import"></textarea>
        <div class="row"><button class="btn" data-a="cimport">Import</button><span class="note" style="margin:0" data-n="cmsg" role="status"></span></div>
      </div>
      <div class="grid" style="margin-top:12px">
        ${sel('holiday', [['none', 'No holiday'], ...HOLIDAYS.filter(h => o.holidays.includes(h.key)).map(h => [h.key, `${h.icon} ${h.name}`])], t.holiday && t.holiday !== 'none' ? t.holiday : 'none', 'Holiday decor')}
      </div>
      <p class="note">Auto is Classic with the date’s holiday — today ${today ? `${today.icon} ${esc(today.name)}` : 'none'}.</p>
      <p class="note warn" data-n="theme"></p>
      <h3>Floor decorator</h3>
      <p class="note" style="margin:0 0 8px">Style a session’s floor by its title: <code>*api*</code> matches any title with “api” in it. The first matching rule wins.</p>
      <div class="rules"></div>
      <div class="row"><button class="btn" data-a="radd">Add rule</button><span class="note warn" style="margin:0" data-n="rules"></span></div>`)
    + panel('features', `
      <input type="search" id="${id('filter')}" placeholder="Filter features…" aria-label="Filter features" autocomplete="off" spellcheck="false" value="${esc(filter)}">
      ${o.features.map(g => `<div class="acc" data-g="${g.id}">
        <div class="acc-h"><button type="button" id="${id('acc-' + g.id)}" aria-controls="${id('accb-' + g.id)}" aria-expanded="false">${esc(g.label)}<small data-c="${g.id}"></small></button>
          <label title="Switch the whole group"><input type="checkbox" data-all="${g.id}" aria-label="All ${esc(g.label)} on">all</label></div>
        <div class="acc-b" id="${id('accb-' + g.id)}" role="region" aria-labelledby="${id('acc-' + g.id)}">
          ${g.features.map(([f, d]) => `<label class="tog"><input type="checkbox" data-f="${f}"${staged.has(f) ? '' : ' checked'}><b>${esc(f)}</b><span>${esc(d)}</span></label>`).join('')}
        </div></div>`).join('')}
      <p class="note" data-n="nomatch" hidden>No feature matches.</p>`)
    + panel('updates', `
      <label class="tog"><input type="checkbox" id="${id('upd')}"${e.updateCheck === false ? '' : ' checked'}><b>Check GitHub for new versions</b><span>Every 6 hours, one request to the GitHub API. It only tells you; updating is <code>git pull</code> and a restart.</span></label>
      <div class="row" style="margin-top:10px"><button class="btn" data-a="updcheck">Check now</button><span class="note" style="margin:0" data-n="upd"></span></div>`)
    + panel('advanced', `
      <label class="f" for="${id('win')}">Minutes an inactive session keeps its floor (${o.windowMin[0]}–${o.windowMin[1]})<input type="number" id="${id('win')}" min="${o.windowMin[0]}" max="${o.windowMin[1]}" step="1" value="${e.windowMin}"></label>
      <div class="row" style="margin-top:16px"><button class="btn danger" data-a="reset">Reset all to defaults</button></div>`)
    ft.textContent = st.file ? `Saved to ${st.file}. Command-line flags are startup defaults; what you set here wins.` : 'Demo: settings last until the server stops.'
    paintTheme(); paintFeatures(); paintNotes(); preview(); paintThumbs(); rules = (e.floorRules || []).map(r => ({ ...r })); paintRules()
  }
  const val = k => bd.querySelector(`[data-k="${k}"]`)?.value
  const lookNow = () => Object.keys(st.options.avatar).map(k => `${k}=${val('look-' + k)}`).join(',')
  const skinNow = () => bd.querySelector('[data-k="skin"]:checked')?.value || 'auto'
  const themeNow = () => skinNow() === 'auto' ? 'auto' : skinNow() + (val('holiday') !== 'none' ? '+' + val('holiday') : '')
  function paintTheme() {
    const h = bd.querySelector('[data-k="holiday"]'); h.disabled = skinNow() === 'auto'; if (h.disabled) h.value = 'none'
    bd.querySelector('[data-a="cedit"]').hidden = !customOf(skinNow())
  }

  // ---------- custom themes ----------
  const customs = () => st.effective.customThemes || []
  const customOf = v => v?.startsWith('custom:') ? customs().find(d => 'custom:' + slugOf(d.name) === v) || null : null
  const skinChoices = () => [['auto', 'Auto'], ...st.options.skins.map(k => [k, skinLabel(k)]), ...customs().map(d => ['custom:' + slugOf(d.name), d.name])]
  function paintThumbs() { for (const cv of bd.querySelectorAll('canvas[data-thumb]')) { const v = cv.dataset.thumb; thumb(cv, v === 'auto' ? 'classic' : customOf(v) || v) } }
  let ed = null, previewRaf = 0                                 // { orig: the saved name being edited or null, name, base, colours }
  const edEl = () => bd.querySelector('.ed'), cmsg = (t, warn) => { const n = bd.querySelector('[data-n="cmsg"]'); n.textContent = t; n.classList.toggle('warn', !!warn) }
  function startEdit(def, orig) {
    ed = { orig, name: def.name, base: def.base, colours: { ...def.colours } }
    const el = edEl(); el.hidden = false
    el.querySelector('#' + id('cname')).value = ed.name
    el.querySelector('[data-a="cdel"]').hidden = !orig
    paintEditor(); cmsg(''); livePreview()
    el.querySelector('#' + id('cname')).focus(); el.scrollIntoView({ block: 'nearest' })
  }
  function fromChoice(v) {
    const d = customOf(v); if (d) return { name: d.name, base: d.base, colours: coloursOf(d) }
    const base = v === 'auto' ? 'classic' : v
    return { name: '', base, colours: coloursOf(base) }
  }
  function freeName(stem) { const used = new Set(customs().map(d => slugOf(d.name))); let n = stem.slice(0, 21), k = 2; while (used.has(slugOf(n))) n = `${stem.slice(0, 20)} ${k++}`; return n }
  function paintEditor() {
    const el = edEl(); if (!ed || el.hidden) return
    for (const i of el.querySelectorAll('[data-slot]')) i.value = ed.colours[i.dataset.slot]
    const b = el.querySelector('#' + id('cbase')); if (builtinSkin(ed.base)) b.value = ed.base
  }
  const exportJson = () => JSON.stringify({ agentopolisTheme: 1, name: ed.name, base: ed.base, colours: ed.colours })
  function livePreview() { cancelAnimationFrame(previewRaf); previewRaf = requestAnimationFrame(() => { if (ed) api.theme?.preview({ name: ed.name || 'preview', base: ed.base, colours: ed.colours }) }) }
  function endEdit() { if (!ed) return; ed = null; cancelAnimationFrame(previewRaf); api.theme?.preview(null); const el = edEl(); if (el) el.hidden = true }
  async function saveCustom() {
    ed.name = bd.querySelector('#' + id('cname')).value.trim().toLowerCase()
    const ok = checkCustomTheme(ed)
    if (ok instanceof Error) return cmsg(ok.message.replace(/^custom theme:? ?/, ''), true)
    const others = customs().filter(d => d.name !== ed.orig)
    if (others.some(d => slugOf(d.name) === slugOf(ok.name))) return cmsg(`There is already a theme called ${ok.name}.`, true)
    if (!ed.orig && others.length >= st.options.maxCustom) return cmsg(`Up to ${st.options.maxCustom} custom themes; delete one first.`, true)
    const list = ed.orig ? customs().map(d => d.name === ed.orig ? ok : d) : [...customs(), ok]
    const h = val('holiday')
    Object.assign(pending, { customThemes: list, theme: 'custom:' + slugOf(ok.name) + (h && h !== 'none' ? '+' + h : '') })
    if (await flush()) { endEdit(); render(); showTab('look'); api.toast(`Saved ${ok.name}`, 1400) }
  }
  async function deleteCustom() {
    const gone = 'custom:' + slugOf(ed.orig), list = customs().filter(d => d.name !== ed.orig)
    Object.assign(pending, { customThemes: list }, parseTheme(st.effective.theme).skin === gone ? { theme: 'auto' } : {})
    if (await flush()) { endEdit(); render(); showTab('look') }
  }
  function importCustom() {
    const txt = bd.querySelector('#' + id('cjson')).value.trim()
    let obj; try { obj = JSON.parse(txt) } catch { return cmsg('That isn’t theme JSON — paste what Export copied.', true) }
    const ok = checkCustomTheme(obj)
    if (ok instanceof Error) return cmsg(ok.message, true)
    const taken = customs().some(d => slugOf(d.name) === slugOf(ok.name))
    startEdit({ ...ok, name: taken ? freeName(ok.name) : ok.name }, null)
    cmsg(`Imported ${ok.name}${taken ? ' under a new name' : ''}. Save to keep it.`)
  }

  // ---------- floor rules ----------
  let rules = []
  const ruleRow = (r, i) => `<div class="rule" data-i="${i}">
      <input type="text" data-r="pattern" value="${esc(r.pattern)}" maxlength="40" placeholder="*api*" aria-label="Rule ${i + 1}: title pattern" spellcheck="false">
      ${Object.entries(st.options.floorPresets).map(([k, vals]) => `<select data-r="${k}" aria-label="Rule ${i + 1}: ${RULE_LABEL[k]}" title="${RULE_LABEL[k]}">${vals.map(v => `<option value="${v}"${v === r[k] ? ' selected' : ''}>${v === 'none' ? RULE_LABEL[k] + ': none' : words(v)}</option>`).join('')}</select>`).join('')}
      <button type="button" class="hbtn" data-a="rup" aria-label="Move rule ${i + 1} up" title="Move up"${i ? '' : ' disabled'}>↑</button>
      <button type="button" class="hbtn" data-a="rdel" aria-label="Remove rule ${i + 1}" title="Remove">✕</button></div>`
  function paintRules() {
    const box = bd.querySelector('.rules'); if (!box) return
    box.innerHTML = rules.map(ruleRow).join('') || '<p class="note" style="margin:0 0 6px">No rules yet.</p>'
    bd.querySelector('[data-a="radd"]').disabled = rules.length >= st.options.maxFloorRules
  }
  function saveRules(ms = 600) {
    const ok = checkFloorRules(rules), n = bd.querySelector('[data-n="rules"]')
    n.textContent = ok instanceof Error ? ok.message.replace(/^floorRules: /, '') : ''
    if (!(ok instanceof Error)) save({ floorRules: ok }, ms)
  }
  function paintFeatures() {
    const q = filter.trim().toLowerCase()
    let any = false
    for (const g of st.options.features) {
      const acc = bd.querySelector(`.acc[data-g="${g.id}"]`), on = g.features.filter(([f]) => !staged.has(f)).length
      bd.querySelector(`[data-c="${g.id}"]`).textContent = `${on} of ${g.features.length} on`
      const all = bd.querySelector(`[data-all="${g.id}"]`); all.checked = on === g.features.length; all.indeterminate = on > 0 && on < g.features.length
      let hits = 0
      for (const [f, d] of g.features) {
        const hit = !q || f.includes(q) || d.toLowerCase().includes(q) || g.label.toLowerCase().includes(q)
        acc.querySelector(`[data-f="${f}"]`).closest('.tog').hidden = !hit; hits += hit
      }
      acc.hidden = !hits; any ||= hits > 0
      const openG = q ? hits > 0 : expanded.has(g.id)
      acc.querySelector('.acc-h > button').setAttribute('aria-expanded', String(openG)); acc.querySelector('.acc-b').hidden = !openG
    }
    bd.querySelector('[data-n="nomatch"]').hidden = any
    for (const i of bd.querySelectorAll('[data-f]')) i.closest('.tog').classList.toggle('off', !i.checked)
    const changed = staged.size !== running.size || [...staged].some(f => !running.has(f))
    applyBar.classList.toggle('on', changed)
    tabBtns[2].innerHTML = 'Features' + (changed ? ' <small>•</small>' : '')
  }
  function paintNotes() {
    if (!isOpen) return
    const n = k => bd.querySelector(`[data-n="${k}"]`)
    n('avatar').textContent = urlAvatar ? `?avatar= in the address (${urlAvatar}) is overriding your look on this page.` : ''
    n('theme').textContent = urlTheme ? `?theme= in the address (${urlTheme}) is overriding the theme on this page.` : ''
    paintUpdate()
  }
  const UPD = {
    off: () => 'Off.', checking: () => 'Checking…', 'not-git': () => 'Not a git checkout, so there is nothing to compare.',
    'not-official': () => 'This checkout’s origin isn’t github.com/PorlyBe/agentopolis, so it isn’t checked.',
    current: () => 'Up to date with main.', behind: u => `${u.ahead} new commit${u.ahead === 1 ? '' : 's'} on main — see ⬆ in the toolbar.`,
    diverged: () => 'This checkout has commits that aren’t on GitHub main, so it can’t say what’s new.',
    error: u => `Couldn’t reach GitHub (${u.error || 'error'}). It tries again later.`,
  }
  function paintUpdate() {
    const n = bd.querySelector('[data-n="upd"]'), b = bd.querySelector('[data-a="updcheck"]'), u = api.lastSnapshot?.update
    if (!n) return
    const off = !bd.querySelector('#' + id('upd')).checked || !u || u.status === 'off'
    b.disabled = off || !st.file
    n.textContent = !st.file ? 'Never checked in the demo.' : !u ? '' : (UPD[u.status]?.(u) ?? u.status) + (u.checkedAt && u.status !== 'off' ? ` Checked ${new Date(u.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}.` : '')
  }
  function preview() {
    const cv = bd.querySelector('.look canvas'), sh = api.tower?.avatar?.preview(lookNow())
    if (!cv) return
    const c = cv.getContext('2d'); c.clearRect(0, 0, 16, 32)
    if (sh) c.drawImage(sh, 16, 0, 16, 32, 0, 0, 16, 32)   // standing, facing you
    cv.dataset.drawn = sh ? '1' : ''
  }
  api.on('sync', () => { if (isOpen && !bd.querySelector('.look canvas')?.dataset.drawn) preview(); if (isOpen) paintUpdate() })

  bd.addEventListener('input', e => {
    const el = e.target
    if (el.id === id('name')) { const v = el.value.trim(); if (v) save({ name: v }, 700) }
    else if (el.id === id('win')) { const v = Number(el.value); if (Number.isInteger(v) && v >= st.options.windowMin[0] && v <= st.options.windowMin[1]) save({ windowMin: v }, 700) }
    else if (el.id === id('filter')) { filter = el.value; paintFeatures() }
    else if (el.dataset.slot && ed) { ed.colours[el.dataset.slot] = el.value; livePreview() }
    else if (el.id === id('cname') && ed) ed.name = el.value.trim().toLowerCase()
    else if (el.dataset.r === 'pattern') { rules[+el.closest('.rule').dataset.i].pattern = el.value; saveRules(900) }
  })
  bd.addEventListener('change', e => {
    const el = e.target, k = el.dataset.k
    if (k?.startsWith('look-')) { preview(); save({ avatar: lookNow() }) }
    else if (k === 'skin' || k === 'holiday') { paintTheme(); save({ theme: themeNow() }) }
    else if (el.dataset.r && el.tagName === 'SELECT') { rules[+el.closest('.rule').dataset.i][el.dataset.r] = el.value; saveRules(200) }
    else if (el.id === id('upd')) save({ updateCheck: el.checked }, 0)
    else if (el.dataset.f) { if (el.checked) staged.delete(el.dataset.f); else staged.add(el.dataset.f); paintFeatures() }
    else if (el.dataset.all) {
      for (const [f] of st.options.features.find(g => g.id === el.dataset.all).features) { if (el.checked) staged.delete(f); else staged.add(f); bd.querySelector(`[data-f="${f}"]`).checked = el.checked }
      paintFeatures()
    }
    else if (el.id === id('name') && !el.value.trim()) { el.value = st.effective.name; api.toast('Your name can’t be empty') }
    else if (el.id === id('win') && !(Number.isInteger(+el.value) && +el.value >= st.options.windowMin[0] && +el.value <= st.options.windowMin[1])) { el.value = st.effective.windowMin; api.toast(`Pick ${st.options.windowMin.join('–')} minutes`) }
  })
  let armed = 0
  dlg.addEventListener('click', async e => {
    const acc = e.target.closest('.acc-h > button')
    if (acc) {
      const g = acc.closest('.acc').dataset.g, on = acc.getAttribute('aria-expanded') !== 'true'
      if (on) expanded.add(g); else expanded.delete(g)
      acc.setAttribute('aria-expanded', String(on)); acc.closest('.acc').querySelector('.acc-b').hidden = !on
      return
    }
    const a = e.target.closest('[data-a]')?.dataset.a
    if (a === 'cnew') { const d = fromChoice(skinNow()); startEdit({ ...d, name: freeName(d.name || ('my ' + skinLabel(d.base).toLowerCase())) }, null) }
    else if (a === 'cedit') { const d = customOf(skinNow()); if (d) startEdit({ ...d, colours: coloursOf(d) }, d.name) }
    else if (a === 'cdup' && ed) { const d = fromChoice(bd.querySelector('#' + id('cbase')).value); ed.base = d.base; ed.colours = d.colours; paintEditor(); livePreview(); cmsg(`Colours from ${customOf(bd.querySelector('#' + id('cbase')).value)?.name || skinLabel(d.base)}.`) }
    else if (a === 'csave' && ed) saveCustom()
    else if (a === 'cdel' && ed?.orig) deleteCustom()
    else if (a === 'ccancel') endEdit()
    else if (a === 'cexport' && ed) {
      const box = bd.querySelector('#' + id('cjson')); box.value = exportJson(); box.select()
      try { await navigator.clipboard.writeText(box.value); cmsg('Copied — send it to a colleague to Import.') } catch { cmsg('Copy the text above to share it.') }
    }
    else if (a === 'cimport') importCustom()
    else if (a === 'radd') { rules.push({ pattern: '*', ...Object.fromEntries(Object.keys(st.options.floorPresets).map(k => [k, 'none'])) }); paintRules(); bd.querySelector('.rule:last-child [data-r="pattern"]')?.focus() }
    else if (a === 'rdel' || a === 'rup') {
      const i = +e.target.closest('.rule').dataset.i
      if (a === 'rdel') rules.splice(i, 1); else if (i > 0) [rules[i - 1], rules[i]] = [rules[i], rules[i - 1]]
      paintRules(); saveRules(200)
    }
    else if (a === 'apply') {
      pending.disabled = [...staged]
      if (await flush()) location.reload()
    } else if (a === 'updcheck') {
      const b = e.target.closest('button'); b.disabled = true
      try {
        const r = await fetch('/api/update/check', { method: 'POST' }), j = await r.json()
        if (j.retryIn) api.toast(`Checked a moment ago; try again in ${j.retryIn}s`)
        api.refresh()
      } catch { api.toast('Agentopolis server is offline') }
      setTimeout(paintUpdate, 1600)
    } else if (a === 'reset') {
      const b = e.target.closest('button')
      if (Date.now() > armed) { armed = Date.now() + 4000; b.textContent = 'Sure? Click again to reset'; setTimeout(() => { if (b.isConnected) b.textContent = 'Reset all to defaults' }, 4000); return }
      armed = 0; pending = Object.fromEntries(Object.keys(st.effective).map(k => [k, null]))
      if (await flush()) { staged = new Set(st.effective.disabled); render(); showTab(tab); bd.querySelector('[data-a="reset"]').focus() }
    }
  })

  const at = params.get('settings')
  if (demos.includes('settings') || at) setTimeout(async () => { await open(at === 'editor' ? 'look' : at); if (at === 'editor') bd.querySelector('[data-a="cnew"]')?.click() }, 300)
}
