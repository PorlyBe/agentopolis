// needs-you: a session blocked on the user — a permission prompt above all, or a question — turns 'attention'.
// Transcripts can't show a pending permission prompt, so this reads the terminal app the session runs in.
// Orca: its Claude hooks put a pane in state 'waiting' on PermissionRequest (toolName = the tool asking) and on an
// AskUserQuestion. herdr: it marks an agent 'blocked' when it recognises an approval or question on screen.
// Either way a pane counts only once its rendered screen also shows a choice, because the app's state can outlive a
// prompt answered with Esc. Read-only commands only, on a 3 s timer of its own so the snapshot never waits on them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { watched } from '../lib/transcripts.mjs'
import { ORCA, HERDR, terminalOf, forgetExcept } from '../lib/terminal.mjs'

const LIVE_SESSIONS = path.join(os.homedir(), '.claude', 'sessions')
const POLL_MS = 3000, OFFLINE_RETRY_MS = 30_000, MIN_AGE_MS = 1000
const CHOICE = /^\s*[❯›>]\s*1\.\s+\S/
const ASKING = /Do you want to (proceed|make this edit|create|allow|run|fetch|use)|Would you like to proceed/i

let blocked = new Map()        // session id -> { kind, label, detail, since }
const herdrSince = new Map()   // herdr pane id -> when it was first seen blocked

const run = (cmd, args, timeout = 2500) => new Promise(resolve => {
  execFile(cmd, args, { timeout, maxBuffer: 8 << 20 }, (err, out) => resolve(err ? { err } : { out }))
})
const json = async (cmd, args) => {
  const r = await run(cmd, args)
  if (r.err) return r
  try { return JSON.parse(r.out).result ?? {} } catch { return {} }
}
const orca = args => json(ORCA, [...args, '--json'])
const offline = r => r.err?.code === 'ENOENT'
const asksChoice = lines => lines.some(l => CHOICE.test(l) || ASKING.test(l))
function liveSessions() {
  const live = new Map()
  let files = []
  try { files = fs.readdirSync(LIVE_SESSIONS) } catch {}
  for (const f of files) {
    if (!f.endsWith('.json')) continue
    let d = null
    try { d = JSON.parse(fs.readFileSync(path.join(LIVE_SESSIONS, f), 'utf8')) } catch {}
    if (!d?.sessionId || !Number.isInteger(d.pid)) continue
    try { process.kill(d.pid, 0); live.set(d.sessionId, d.pid) } catch {}
  }
  forgetExcept(new Set(live.values()))
  return live
}

const short = t => String(t ?? '').replace(/^mcp__.*?__/, '').slice(0, 18)
function describe(agent) {
  const tool = agent.toolName || ''
  if (/^askuserquestion$|^requestuserinput$/i.test(tool.replace(/[^a-z]/gi, ''))) return { kind: 'question', label: 'question for you' }
  if (tool === 'ExitPlanMode') return { kind: 'permission', label: 'approve the plan' }
  return { kind: 'permission', label: tool ? `allow ${short(tool)}?` : 'permission?' }
}

// -> Map of 'Orca:<handle>' -> attention, or { err } when Orca isn't installed
async function pollOrca(now) {
  const ps = await orca(['worktree', 'ps', '--limit', '200'])
  if (ps.err) return ps
  const waiting = new Map() // paneKey -> agent row
  for (const w of ps.worktrees || []) for (const a of w.agents || []) {
    if (a.agentType !== 'claude' || !a.paneKey) continue
    if (a.state === 'waiting' && now - (a.stateStartedAt || now) >= MIN_AGE_MS) waiting.set(a.paneKey, a)
  }
  const confirmed = new Map()
  if (!waiting.size) return confirmed
  const list = await orca(['terminal', 'list'])
  const paneHandle = new Map((list.terminals || []).map(t => [`${t.tabId}:${t.leafId}`, t.handle]))
  for (const [pane, a] of waiting) {
    const handle = paneHandle.get(pane); if (!handle) continue
    const read = await orca(['terminal', 'read', '--terminal', handle, '--screen'])
    if (!asksChoice((read.terminal?.tail || []).slice(-30))) continue
    confirmed.set(`Orca:${handle}`, { ...describe(a), detail: String(a.toolInput ?? '').split('\n')[0].slice(0, 120), since: a.stateStartedAt || now })
  }
  return confirmed
}

// -> Map of 'herdr:<pane id>' -> attention, or { err } when herdr isn't installed
async function pollHerdr(now) {
  const list = await json(HERDR, ['agent', 'list'])
  if (list.err) return list
  const confirmed = new Map(), seen = new Set()
  for (const a of list.agents || []) {
    if (a.agent !== 'claude' || a.agent_status !== 'blocked' || !a.pane_id) continue
    seen.add(a.pane_id)
    const since = herdrSince.get(a.pane_id) ?? now
    herdrSince.set(a.pane_id, since)
    if (now - since < MIN_AGE_MS) continue
    const read = await run(HERDR, ['pane', 'read', a.pane_id, '--source', 'visible', '--lines', '30'])
    const lines = String(read.out ?? '').split('\n')
    if (!asksChoice(lines)) continue
    // herdr doesn't say which tool is asking; a permission dialog says "Do you want to …", a question doesn't
    const kind = lines.some(l => ASKING.test(l)) ? { kind: 'permission', label: 'permission?' } : { kind: 'question', label: 'question for you' }
    confirmed.set(`herdr:${a.pane_id}`, { ...kind, detail: '', since })
  }
  for (const pane of herdrSince.keys()) if (!seen.has(pane)) herdrSince.delete(pane)
  return confirmed
}

async function poll() {
  const now = Date.now()
  const [o, h] = [await pollOrca(now), await pollHerdr(now)]
  const confirmed = new Map([...(o instanceof Map ? o : []), ...(h instanceof Map ? h : [])])
  const next = new Map()
  if (confirmed.size) for (const [id, pid] of liveSessions()) {
    const t = await terminalOf(pid)
    const att = t && confirmed.get(`${t.app}:${t.id}`)
    if (att) next.set(id, att)
  }
  blocked = next
  return offline(o) && offline(h) ? OFFLINE_RETRY_MS : POLL_MS
}
async function loop() {
  let wait = POLL_MS
  if (watched()) try { wait = await poll() } catch (e) { console.error('[needs-you]', e.message) }   // nobody looking: skip the terminal apps
  setTimeout(loop, wait).unref()
}
loop()

export default {
  snapshot(snap) {
    for (const s of snap.sessions) {
      if (!s.running) continue
      let att = blocked.get(s.id)
      // a pending AskUserQuestion in the transcript is a question even when the terminal app can't be read
      if (!att && s.tool === 'AskUserQuestion' && (s.state === 'tool' || s.state === 'idle')) att = { kind: 'question', label: 'question for you', since: s.lastActivity }
      if (!att) continue
      s.state = 'attention'
      s.attention = att
    }
  },
}
