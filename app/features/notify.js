// notify: alerts from the snapshot, per the 🔔 button in the toolbar (sound only / both / notifications only / off).
// A soft chime + macOS notification when a session stops working and waits for you; an urgent one when it needs your
// permission or answer ('attention'); a bell for a new PR; toasts for medals, merges, review mail and error bursts.
// New medals are also announced as a window 'office:achievement' event (the CEO office's TV takes it over).
// Demos: ?demo=wait, ?demo=attention (marks a session as needing you, before the tower reads the snapshot), ?demo=fame.
const KEY = 'agent-office.notify'
const MODES = [
  { id: 'sound', icon: '🔔', label: 'sound only', sound: true, notif: false },
  { id: 'both', icon: '📣', label: 'sound + notifications', sound: true, notif: true },
  { id: 'notif', icon: '💬', label: 'notifications only', sound: false, notif: true },
  { id: 'off', icon: '🔕', label: 'off', sound: false, notif: false },
]
const WORKING = new Set(['tool', 'thinking', 'delegating'])
const QUIET_MS = 30_000, URGENT_QUIET_MS = 20_000

let mode = 'sound'
try { const m = localStorage.getItem(KEY); if (MODES.some(x => x.id === m)) mode = m } catch {}
export const prefs = () => MODES.find(x => x.id === mode)

// One AudioContext for the page; browsers keep it suspended until a user gesture, so resume on the first one.
let actx = null
const audio = () => {
  if (!actx) try { actx = new AudioContext() } catch { return null }
  return actx
}
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { const a = audio(); if (a?.state === 'suspended') a.resume() }, { capture: true })

// notes: [frequency Hz, start s, length s]; a sine with a quick attack and an exponential tail.
export function chime(notes, gain = 0.1) {
  if (document.body.dataset.replay) return
  const a = audio(); if (!a || a.state !== 'running') return
  const t0 = a.currentTime + 0.02
  for (const [f, at, len] of notes) {
    const o = a.createOscillator(), g = a.createGain()
    o.type = 'sine'; o.frequency.value = f
    g.gain.setValueAtTime(0.0001, t0 + at)
    g.gain.exponentialRampToValueAtTime(gain, t0 + at + 0.015)
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len)
    o.connect(g).connect(a.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05)
  }
}

export default function init(api) {
  const btn = document.createElement('button'); btn.className = 'hbtn'
  const paint = () => { const m = prefs(); btn.textContent = m.icon; btn.title = `Your-turn alerts: ${m.label} (click to change)` }
  paint()
  btn.onclick = async () => {
    mode = MODES[(MODES.findIndex(x => x.id === mode) + 1) % MODES.length].id
    try { localStorage.setItem(KEY, mode) } catch {}
    paint()
    let note = ''
    if (prefs().notif) {
      if (!('Notification' in window)) note = ' — this browser has no notifications'
      else if (Notification.permission === 'default') { try { await Notification.requestPermission() } catch {} }
      if ('Notification' in window && Notification.permission === 'denied') note = ' — notifications are blocked for this page'
    }
    if (prefs().sound) chime(DING, 0.08)
    api.toast(`Your-turn alerts: ${prefs().label}${note}`)
  }
  document.getElementById('tbAlerts').prepend(btn)

  const demos = api.params.getAll('demo')
  const last = new Map()  // session id -> state at the previous poll
  const fired = new Map() // session id -> when we last alerted
  const urgent = new Map(), wasAttn = new Map()
  let demo = demos.includes('wait'), demoAttn = demos.includes('attention') ? '' : null

  api.on('sync', data => {
    const now = Date.now(), ss = data.sessions
    if (demoAttn != null) {
      const pick = ss.find(s => s.id === demoAttn) || ss.find(s => s.running && s.state !== 'attention') || ss[0]
      if (pick) { demoAttn = pick.id; pick.state = 'attention'; pick.attention ||= { kind: 'permission', label: 'allow Bash?', detail: 'rm -rf node_modules', since: now - 4000 } }
    }
    for (const s of ss) {
      const was = last.get(s.id)
      last.set(s.id, s.state)
      if (s.state === 'waiting' && WORKING.has(was) && now - (fired.get(s.id) || 0) >= QUIET_MS) { fired.set(s.id, now); ping(s) }
      const on = s.state === 'attention'
      if (on && !wasAttn.get(s.id) && now - (urgent.get(s.id) || 0) >= URGENT_QUIET_MS) { urgent.set(s.id, now); needs(s) }
      wasAttn.set(s.id, on)
    }
    for (const m of [last, wasAttn]) for (const id of m.keys()) if (!ss.some(s => s.id === id)) m.delete(id)
    if (demo && ss.length) { demo = false; setTimeout(() => ping(ss[0]), 1500) }
    news(data)
  })

  function notice(msg, body, tag, extra, id) {
    const m = prefs()
    // The page already shows it when focused; the notification is for when you are elsewhere.
    if (!m.notif || !('Notification' in window) || Notification.permission !== 'granted' || document.hasFocus()) return
    try {
      const n = new Notification(msg, { body, tag, silent: m.sound, ...extra })
      n.onclick = () => {
        window.focus(); n.close()
        fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }).catch(() => {})
      }
    } catch {}
  }
  function ping(s) {
    if (!api.live) return
    const msg = `${s.title} is waiting for you`
    if (prefs().sound) chime(DING)
    api.toast('💬 ' + msg)
    notice(msg, s.worktree || s.branch || '', 'agent-office:' + s.id, {}, s.id)
  }
  function needs(s) {
    if (!api.live) return
    const msg = `✋ ${s.title} ${s.attention?.kind === 'question' ? 'has a question for you' : 'needs your permission'}`
    if (prefs().sound) chime(URGENT, 0.1)
    api.toast(msg, 4000)
    notice(msg, [s.attention?.label, s.attention?.detail].filter(Boolean).join(' — '), 'agent-office:needs:' + s.id, { requireInteraction: true }, s.id)
  }

  // ---------- news: what changed since the last snapshot (nothing on the first one: that is history) ----------
  const loadT = Date.now(), seen = new Set(), prs = new Map(), alarms = new Map(), demoFame = []
  let primed = false
  const once = k => !seen.has(k) && seen.add(k)
  const burstEnd = errs => { let end = 0; for (let i = 2; i < errs.length; i++) if (errs[i] - errs[i - 2] <= 60_000) end = errs[i]; return end }
  if (demos.includes('fame')) {
    const fake = (i, t = Date.now()) => { const [id, title, icon, tier] = FAME[i % FAME.length], ss = api.sessions; return { key: id + '|demo' + i, id, title, icon, tier, holder: ss.length && i % 3 ? ss[i % ss.length].title : 'office', earnedAt: t } }
    let i = 0
    const tick = () => { if (demoFame.length < 12) { demoFame.unshift(fake(i++)); setTimeout(tick, 9000) } }
    setTimeout(tick, 4000)
  }
  function news(d) {
    const quiet = !primed
    for (const a of [...(d.achievements?.list || []), ...demoFame].reverse()) if (once('medal:' + a.key) && !quiet) {
      api.toast(`🏅 ${a.holder} earned ${a.title}`, 3500)
      window.dispatchEvent(new CustomEvent('office:achievement', { detail: a }))
    }
    for (const it of d.trophies?.items || []) if (it.state === 'MERGED' && it.mergedAt > loadT && once('merged:' + it.repo + '#' + it.n) && !quiet) api.toast(`🏆 PR #${it.n} merged${it.title ? ' — ' + it.title : ''}`)
    if (d.street?.status === 'ok') for (const m of d.street.forMe || []) if (once('mail:' + m.id) && !quiet && !m.bot)
      api.toast(m.kind === 'request' ? `✉ ${m.who} requested your review on #${m.pr}` : `✉ ${m.who} ${m.kind === 'review' ? 'reviewed' : 'commented on'} #${m.pr}`, 4000)
    for (const s of d.sessions) {
      const pr = s.ext?.['pr-celebration']?.pr, k = pr ? `${pr.repo}#${pr.n}` : null
      if (k && prs.has(s.id) && prs.get(s.id) !== k) { if (prefs().sound) chime(BELL, 0.12); api.toast(`🎉 ${s.title} opened PR #${pr.n}${pr.title ? ' — ' + pr.title : ''}`) }
      prs.set(s.id, k)
      const end = burstEnd(s.ext?.bugs?.errs || [])
      if (end && Date.now() - end < 40_000) { if (!alarms.has(s.id)) api.toast(`🚨 ${s.title}: a burst of tool errors`); alarms.set(s.id, end) } else alarms.delete(s.id)
    }
    primed = true
  }
}

const DING = [[880, 0, 0.9], [1318.5, 0.16, 1.1]] // A5 then E6
const URGENT = [[988, 0, 0.22], [988, 0.28, 0.22], [1318.5, 0.56, 0.9]] // B5 B5 E6
const BELL = [[1568, 0, 1.2], [2093, 0.09, 1.0], [2637, 0.18, 0.9]]
const FAME = [
  ['first-pr', 'First PR of the day', '🥇', 'gold'], ['calls-1k', '1,000 tool calls', '🔨', 'silver'], ['clean-hour', 'Clean hour', '✨', 'silver'],
  ['six-at-once', 'Six at once', '👥', 'gold'], ['marathon', 'Marathon', '🏃', 'gold'], ['night-owl', 'Night owl', '🦉', 'bronze'],
  ['big-context', 'Big context', '🧠', 'silver'], ['wrangler', 'Workflow wrangler', '🤠', 'gold'], ['merge-streak', 'Merge streak', '🔥', 'gold'],
  ['phoenix', 'Phoenix', '🐦‍🔥', 'gold'], ['commit-machine', 'Commit machine', '📦', 'silver'], ['full-house', 'Full house', '🏠', 'bronze'],
]
