// needs-you: a session blocked on the user — a permission prompt above all, or a question — turns 'attention'.
// Transcripts can't show a pending permission prompt, so this reads Orca: its Claude hooks put a pane in state
// 'waiting' on PermissionRequest (toolName = the tool asking) and on an AskUserQuestion. A waiting pane counts
// only once its rendered screen also shows a choice, because Orca's state can outlive a prompt answered with Esc.
// Read-only orca commands only, on a 3 s timer of its own so the snapshot never waits on them.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'

const ORCA = process.env.ORCA_CLI_BIN_DIR ? path.join(process.env.ORCA_CLI_BIN_DIR, 'orca') : 'orca'
const LIVE_SESSIONS = path.join(os.homedir(), '.claude', 'sessions')
const POLL_MS = 3000, OFFLINE_RETRY_MS = 30_000, MIN_AGE_MS = 1000
const CHOICE = /^\s*[❯›>]\s*1\.\s+\S/
const ASKING = /Do you want to (proceed|make this edit|create|allow|run|fetch|use)|Would you like to proceed/i

let blocked = new Map()        // session id -> { kind, label, detail, since }
const handleOfPid = new Map()  // pid -> Orca terminal handle (a process's environment never changes)

const orca = (args, timeout = 2500) => new Promise(resolve => {
  execFile(ORCA, [...args, '--json'], { timeout, maxBuffer: 8 << 20 }, (err, out) => {
    if (err) return resolve({ err })
    try { resolve(JSON.parse(out).result ?? {}) } catch { resolve({}) }
  })
})
const handleOf = pid => handleOfPid.has(pid) ? Promise.resolve(handleOfPid.get(pid)) : new Promise(resolve => {
  execFile('ps', ['eww', '-o', 'command=', '-p', String(pid)], (err, out) => {
    const h = err ? null : out.match(/ORCA_TERMINAL_HANDLE=(term_[0-9a-f-]+)/)?.[1] ?? null
    if (!err) handleOfPid.set(pid, h)
    resolve(h)
  })
})
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
  for (const pid of handleOfPid.keys()) if (![...live.values()].includes(pid)) handleOfPid.delete(pid)
  return live
}

const short = t => String(t ?? '').replace(/^mcp__.*?__/, '').slice(0, 18)
function describe(agent) {
  const tool = agent.toolName || ''
  if (/^askuserquestion$|^requestuserinput$/i.test(tool.replace(/[^a-z]/gi, ''))) return { kind: 'question', label: 'question for you' }
  if (tool === 'ExitPlanMode') return { kind: 'permission', label: 'approve the plan' }
  return { kind: 'permission', label: tool ? `allow ${short(tool)}?` : 'permission?' }
}

async function poll() {
  const ps = await orca(['worktree', 'ps', '--limit', '200'])
  if (ps.err) { blocked = new Map(); return ps.err.code === 'ENOENT' ? OFFLINE_RETRY_MS : POLL_MS }
  const now = Date.now(), waiting = new Map() // paneKey -> agent row
  for (const w of ps.worktrees || []) for (const a of w.agents || []) {
    if (a.agentType !== 'claude' || !a.paneKey) continue
    if (a.state === 'waiting' && now - (a.stateStartedAt || now) >= MIN_AGE_MS) waiting.set(a.paneKey, a)
  }
  if (!waiting.size) { blocked = new Map(); return POLL_MS }
  const list = await orca(['terminal', 'list'])
  const paneHandle = new Map((list.terminals || []).map(t => [`${t.tabId}:${t.leafId}`, t.handle]))
  const confirmed = new Map() // handle -> attention
  for (const [pane, a] of waiting) {
    const handle = paneHandle.get(pane); if (!handle) continue
    const read = await orca(['terminal', 'read', '--terminal', handle, '--screen'])
    const lines = (read.terminal?.tail || []).slice(-30)
    if (!lines.some(l => CHOICE.test(l) || ASKING.test(l))) continue
    confirmed.set(handle, { ...describe(a), detail: String(a.toolInput ?? '').split('\n')[0].slice(0, 120), since: a.stateStartedAt || now })
  }
  const next = new Map()
  if (confirmed.size) for (const [id, pid] of liveSessions()) {
    const h = await handleOf(pid)
    if (h && confirmed.has(h)) next.set(id, confirmed.get(h))
  }
  blocked = next
  return POLL_MS
}
async function loop() {
  let wait = POLL_MS
  try { wait = await poll() } catch (e) { console.error('[needs-you]', e.message) }
  setTimeout(loop, wait).unref()
}
loop()

export default {
  snapshot(snap) {
    for (const s of snap.sessions) {
      if (!s.running) continue
      let att = blocked.get(s.id)
      // a pending AskUserQuestion in the transcript is a question even when Orca can't be read
      if (!att && s.tool === 'AskUserQuestion' && (s.state === 'tool' || s.state === 'idle')) att = { kind: 'question', label: 'question for you', since: s.lastActivity }
      if (!att) continue
      s.state = 'attention'
      s.attention = att
    }
  },
}
