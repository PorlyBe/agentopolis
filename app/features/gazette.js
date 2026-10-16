// gazette: the broadsheet of today's recap (snap.gazette from server/features/gazette.mjs), opened through api.gazette
// by the tower's news stand and the CEO's desk. ?demo=gazette (or #demo=gazette) opens it, with a fake paper if none is printed.
export default function init(api) {
  const { esc } = api
  const demo = api.demo('gazette')
  let paper = null, open = false, shownAt = 0, demoOpened = false

  api.on('sync', snap => {
    const g = snap.gazette || (demo ? fake() : null)
    if (!g) return
    paper = g
    if (open && g.at !== shownAt) render()
    if (demo && !demoOpened) { demoOpened = true; setTimeout(show, 900) }
  })

  // ---------- the broadsheet ----------
  const style = document.createElement('style')
  style.textContent = `
  .gz-back { position:absolute; inset:0; display:none; place-items:center; background:rgba(10,11,16,.62); z-index:7; padding:18px }
  .gz-back.on { display:grid }
  .gz { position:relative; width:min(940px,100%); max-height:100%; overflow:auto; background:#efe6cf; color:#1f1a14;
    font:14px/1.45 Georgia,'Times New Roman',serif; padding:22px 28px 16px; border-radius:3px;
    box-shadow:0 18px 50px rgba(0,0,0,.55), inset 0 0 70px rgba(150,120,70,.22);
    background-image:repeating-linear-gradient(0deg,rgba(120,100,60,.035) 0 1px,transparent 1px 3px) }
  .gz::-webkit-scrollbar { width:8px } .gz::-webkit-scrollbar-thumb { background:#b9ac8e; border-radius:4px }
  .gz-x { position:absolute; top:10px; right:12px; width:30px; height:30px; border:1px solid #3a3127; background:#e4d9bd; color:#1f1a14;
    font:700 16px Georgia,serif; border-radius:50%; cursor:pointer } .gz-x:hover { background:#1f1a14; color:#efe6cf }
  .gz-strip { display:flex; justify-content:space-between; gap:12px; font:11px/1.3 ui-monospace,Menlo,monospace; text-transform:uppercase; letter-spacing:.06em; color:#4a4034; padding-right:36px }
  .gz-mast { text-align:center; font:900 clamp(30px,5.4vw,54px)/1 'Bodoni 72',Didot,'Playfair Display',Georgia,serif; letter-spacing:.02em; margin:8px 0 4px }
  .gz-tag { text-align:center; font-style:italic; color:#4a4034; font-size:13px }
  .gz-rule { border:0; border-top:3px double #1f1a14; margin:8px 0 }
  .gz-rule.thin { border-top:1px solid #1f1a14 }
  .gz-meta { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; font:12px/1.3 ui-monospace,Menlo,monospace; color:#3a3127 }
  .gz-grid { display:grid; grid-template-columns:2fr 1fr; gap:0 22px }
  .gz-row { display:grid; grid-template-columns:repeat(3,1fr); gap:0 22px }
  .gz-col + .gz-col { border-left:1px solid #b5a98c; padding-left:22px; margin-left:-11px }
  @media (max-width:720px) { .gz-grid,.gz-row { grid-template-columns:1fr } .gz-col + .gz-col { border:0; padding:0; margin:0 } }
  .gz-kick { font:700 11px ui-monospace,Menlo,monospace; letter-spacing:.14em; color:#b8402f; margin-top:6px }
  .gz-head { font:900 clamp(24px,3.4vw,36px)/1.08 'Bodoni 72',Didot,Georgia,serif; margin:4px 0 6px }
  .gz-deck { font-style:italic; font-size:16px; color:#3a3127; margin:0 0 8px }
  .gz-by { font:11px ui-monospace,Menlo,monospace; color:#6b5f4c; text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px }
  .gz-body { columns:2 220px; column-gap:18px; text-align:justify; hyphens:auto; margin:0 }
  .gz-body::first-letter { float:left; font:900 40px/0.9 'Bodoni 72',Didot,Georgia,serif; padding:4px 5px 0 0 }
  .gz h3 { font:900 15px/1.2 'Bodoni 72',Didot,Georgia,serif; text-transform:uppercase; letter-spacing:.08em; margin:12px 0 6px;
    border-bottom:1px solid #1f1a14; padding-bottom:3px }
  .gz ul { list-style:none; margin:0; padding:0 } .gz li { padding:3px 0; border-bottom:1px dotted #b5a98c }
  .gz li:last-child { border-bottom:0 }
  .gz a { color:#1f1a14; text-decoration:underline; text-decoration-color:#b8a57c; text-underline-offset:2px; cursor:pointer }
  .gz a:hover { color:#b8402f; text-decoration-color:#b8402f }
  .gz-n { font:700 12px ui-monospace,Menlo,monospace; color:#2f7a46 } .gz-who { color:#6b5f4c; font-style:italic }
  .gz-box { border:2px solid #1f1a14; padding:6px 10px 8px; margin-top:12px; background:rgba(255,250,235,.45) }
  .gz-box h3 { margin-top:2px }
  .gz-stat { display:flex; justify-content:space-between; gap:8px; font:12px/1.7 ui-monospace,Menlo,monospace }
  .gz-stat b { font-size:14px }
  .gz-ci { color:#b8402f; font-weight:700 } .gz-ok { color:#2f7a46; font-weight:700 }
  .gz-quote { font-style:italic; font-size:15px; border-left:3px solid #f29a4e; padding-left:10px; margin:4px 0 }
  .gz-muted { color:#6b5f4c; font-style:italic }
  .gz-foot { text-align:center; font:11px ui-monospace,Menlo,monospace; color:#6b5f4c; margin-top:12px }`
  document.head.append(style)
  const back = document.createElement('div'); back.className = 'gz-back'
  back.innerHTML = '<article class="gz" role="dialog" aria-label="The Daily Gazette"></article>'
  api.hud.append(back)
  const sheet = back.firstElementChild
  back.addEventListener('pointerdown', e => { if (e.target === back) hide() })
  sheet.addEventListener('click', e => {
    if (e.target.closest('.gz-x')) return hide()
    const a = e.target.closest('a[data-url]'); if (a) { e.preventDefault(); api.openLink(a.dataset.url) }
  })
  addEventListener('keydown', e => { if (open && e.key === 'Escape') { e.stopPropagation(); hide() } }, true)
  function show() { if (!paper) return; open = true; render(); back.classList.add('on'); sheet.scrollTop = 0 }
  function hide() { open = false; back.classList.remove('on') }
  // open(g) shows the broadsheet, optionally with the caller's own copy
  api.gazette = { open: g => { if (g) paper = g; show(); return open }, close: hide }

  const fmt = n => n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e6 ? (n / 1e6).toFixed(1) + 'M' : n >= 1e4 ? Math.round(n / 1e3) + 'k' : String(n ?? 0)
  const clock = t => new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const agoL = t => { const s = Math.max(0, Math.round((Date.now() - t) / 1000)); return s < 60 ? 'just now' : s < 3600 ? Math.round(s / 60) + 'm ago' : Math.round(s / 3600) + 'h ago' }
  const link = (url, text) => url && /^https:\/\/github\.com\//.test(url) ? `<a data-url="${esc(url)}" href="${esc(url)}">${text}</a>` : text
  const pl = (n, w, p = w + 's') => `${n} ${n === 1 ? w : p}`

  function story(g) {
    const s = g.stats, bits = []
    bits.push(`The office logged ${pl(s.toolsToday, 'tool call')}${s.since ? ` since ${clock(s.since)}` : ' today'} and pushed ${fmt(s.tokens)} tokens through its agents, with ${pl(s.online.sessions, 'session')} at their desks and ${pl(s.online.agents, 'subagent')} on shift.`)
    if (g.mergedCount || g.openedCount) bits.push(`On the street, ${pl(g.mergedCount, 'pull request')} merged and ${pl(g.openedCount, 'new one')} opened.`)
    else bits.push(g.street === 'ok' ? 'The street was calm: no merges or new pull requests reported so far.' : 'Our street correspondent is still on the way with the GitHub news.')
    if (g.ci.failsToday) bits.push(`CI turned red ${pl(g.ci.failsToday, 'time')}${g.ci.culprits.length ? `, on branches by ${g.ci.culprits.join(', ')}` : ''}.`)
    else if (g.street === 'ok') bits.push('Not a single CI beacon flashed red on the street today.')
    if (s.commits) bits.push(`The printer by the TV spat out ${pl(s.commits, 'commit')}.`)
    if (g.busiest.peak) bits.push(`The busiest stretch belonged to ${g.busiest.peak.name}, with ${g.busiest.peak.calls} tool calls in ten minutes.`)
    if (g.workflows[0]) bits.push(`Workflow “${g.workflows[0].name}” finished at ${clock(g.workflows[0].doneAt)} with ${pl(g.workflows[0].agents, 'agent')}.`)
    return bits.join(' ')
  }

  function render() {
    const g = paper; shownAt = g.at
    const d = new Date(g.date), h = g.headline || {}
    const date = d.toLocaleDateString([], { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
    const merged = g.merged.length ? '<ul>' + g.merged.map(m => `<li><span class="gz-n">#${m.n}</span> ${m.title ? link(m.url, esc(m.title)) : link(m.url, '<i>read it on GitHub</i>')} <span class="gz-who">— ${esc(m.author || 'someone')}, ${clock(m.at)}</span></li>`).join('') + '</ul>'
      : `<p class="gz-muted">${g.street === 'ok' ? 'Nothing merged yet today. The trunk waits.' : 'The street report has not come in yet.'}</p>`
    const opened = g.opened.length ? '<ul>' + g.opened.slice(0, 5).map(m => `<li><span class="gz-n" style="color:#2f6fb0">#${m.n}</span> ${link(m.url, esc(m.title || 'a new pull request'))} <span class="gz-who">— ${esc(m.author || '')}</span></li>`).join('') + '</ul>' : '<p class="gz-muted">No new pull requests yet.</p>'
    const s = g.stats
    const stat = (label, val) => `<div class="gz-stat"><span>${label}</span><b>${val}</b></div>`
    const b = g.busiest
    const around = [
      b.now ? `<li><b>${esc(b.now.name)}</b> is the busiest right now: ${b.now.calls} calls in 10 min${b.now.agent ? ' (a subagent)' : ''}.</li>` : '',
      ...b.leaders.slice(0, 3).map((l, i) => `<li>${['🥇', '🥈', '🥉'][i]} ${esc(l.name)} <span class="gz-who">topped the chart for ${pl(l.minutes, 'minute')}</span></li>`),
      ...b.desks.slice(0, 4).map(x => `<li>${esc(x.title)} <span class="gz-who">— ${esc(x.state)}${x.agents ? `, ${pl(x.agents, 'agent')} on shift` : ''}</span></li>`),
    ].filter(Boolean).join('')
    const ci = g.ci
    const ciBody = (ci.failsHour >= 3 ? `<p class="gz-ci">⚠ ${pl(ci.failsHour, 'red build')} in the last hour.</p>` : '')
      + `${stat('Red today', `<span class="${ci.failsToday ? 'gz-ci' : 'gz-ok'}">${ci.failsToday}</span>`)}${stat('Running now', ci.running)}`
      + (ci.red.length ? '<ul>' + ci.red.map(r => `<li><span class="gz-n" style="color:#b8402f">#${r.n}</span> ${link(r.url, esc(r.title))} <span class="gz-who">— ${esc(r.author)}</span></li>`).join('') + '</ul>' : `<p class="gz-muted">${g.street === 'ok' ? 'All open PRs are green or pending. Smooth sailing.' : 'Awaiting the wire from GitHub.'}</p>`)
    const r = g.coderabbit
    const rabbit = r ? `<p class="gz-quote">${r.kind === 'review' ? (r.review === 'changes_requested' ? 'Requested changes on' : r.review === 'approved' ? 'Approved' : 'Reviewed') : 'Commented on'} ${link(r.url, `#${r.pr}`)}${r.title ? ` “${esc(r.title)}”` : ''}${r.target ? ` by ${esc(r.target)}` : ''}.</p><p class="gz-who">${agoL(r.at)} · ${pl(r.today, 'remark')} across ${pl(r.prs, 'PR')} today</p>`
      : '<p class="gz-muted">The rabbit has been quiet today. Suspiciously quiet.</p>'
    const e = g.engineer
    const eng = e ? `<p><b style="font-size:16px">${esc(e.login)}</b></p><p>${e.score ? `${e.score} points today: ${[['merged', 'merge'], ['review', 'review'], ['comment', 'comment'], ['push', 'push', 'pushes'], ['opened', 'PR opened', 'PRs opened']].filter(([k]) => e.by?.[k]).map(([k, one, many]) => pl(e.by[k], one, many)).join(', ')}` : e.actions ? `${pl(e.actions, 'action')} today` : 'Busiest on the street right now'}${e.openPrs ? `, ${pl(e.openPrs, 'open PR')}` : ''}${e.merges ? `, ${pl(e.merges, 'merge')}` : ''}.</p>` : '<p class="gz-muted">The street is empty, for now.</p>'
    sheet.innerHTML = `<button class="gz-x" title="Close (Esc)">✕</button>
      <div class="gz-strip"><span>Vol. I · No. ${g.edition}</span><span>${esc(g.repo || 'Agentopolis')}</span><span>Price: one coffee</span></div>
      <div class="gz-mast">THE DAILY GAZETTE</div>
      <div class="gz-tag">All the news that fits in a context window</div>
      <hr class="gz-rule">
      <div class="gz-meta"><span>${esc(date)}</span><span>${g.weather ? '☁ ' + esc(g.weather) : 'Late edition · printed ' + clock(g.at)}</span></div>
      <hr class="gz-rule thin">
      <div class="gz-grid">
        <section class="gz-col">
          <div class="gz-kick">${esc(h.kicker || '')}</div>
          <h2 class="gz-head">${esc(h.title || '')}</h2>
          <p class="gz-deck">${esc(h.deck || '')}</p>
          <div class="gz-by">By the Office Desk · ${clock(h.at || g.at)}</div>
          <p class="gz-body">${esc(story(g))}</p>
          <h3>Merged today${g.mergedCount ? ` · ${g.mergedCount}` : ''}</h3>${merged}
        </section>
        <aside class="gz-col">
          <div class="gz-box"><h3>By the numbers</h3>
            ${stat('Tool calls today', fmt(s.toolsToday))}${stat('Last hour', fmt(s.toolsHour))}${stat('Tokens today', fmt(s.tokens))}
            ${stat('PRs merged', g.mergedCount)}${stat('PRs opened', g.openedCount)}${stat('Commits printed', s.commits)}
            ${stat('Sessions / agents', `${s.online.sessions} / ${s.online.agents}`)}
          </div>
          <h3>CI corner</h3>${ciBody}
        </aside>
      </div>
      <hr class="gz-rule thin">
      <div class="gz-row">
        <section class="gz-col"><h3>Around the office</h3><ul>${around || '<li class="gz-muted">Everyone is on a coffee break.</li>'}</ul></section>
        <section class="gz-col"><h3>CodeRabbit’s hottest take</h3>${rabbit}</section>
        <section class="gz-col"><h3>Engineer of the day</h3>${eng}<h3>New on the street${g.openedCount ? ` · ${g.openedCount}` : ''}</h3>${opened}</section>
      </div>
      <div class="gz-foot">Printed ${clock(g.at)} · a fresh edition every minute · Esc to close</div>`
  }

  function fake() {
    const now = Date.now(), url = n => `https://github.com/demo/office/pull/${n}`
    return {
      at: now, date: now, edition: 1, repo: 'demo/office', street: 'ok',
      headline: { kind: 'merge', kicker: 'MERGE DAY', title: '3 PRs land on main', deck: 'Latest: #1878 recipes: search by ingredient by alice-dev.', at: now - 600_000 },
      merged: [1878, 1877, 1865].map((n, i) => ({ n, title: ['recipes: search by ingredient', 'game: save slots', 'site: dark mode'][i], author: ['alice-dev', 'bob-builds', 'erin-docs'][i], at: now - i * 3600_000, url: url(n) })),
      mergedCount: 3, opened: [{ n: 1880, title: 'a demo PR', author: 'dave-ships', at: now, url: url(1880) }], openedCount: 1,
      stats: { toolsToday: 4210, since: 0, toolsHour: 312, tokens: 48_200_000, commits: 9, online: { sessions: 4, active: 3, agents: 6 } },
      busiest: { now: { name: 'TRAIL MAP', calls: 54 }, peak: { name: 'RECIPE BOX', calls: 88 }, leaders: [{ name: 'RECIPE BOX', minutes: 41 }], desks: [{ title: 'RECIPE BOX', state: 'tool', agents: 3 }] },
      workflows: [], ci: { failsToday: 2, failsHour: 1, red: [{ n: 1871, title: 'flaky e2e', author: 'carol-ci', url: url(1871) }], running: 2, culprits: ['carol-ci'] },
      engineer: { login: 'alice-dev', actions: 14, score: 26, by: { merged: 2, review: 3, comment: 4, push: 3, opened: 2 }, openPrs: 3, merges: 1 },
      coderabbit: { pr: 1878, title: 'recipes: search by ingredient', target: 'alice-dev', kind: 'review', review: 'commented', at: now - 900_000, today: 6, prs: 4, url: url(1878) },
      weather: null,
    }
  }
}
