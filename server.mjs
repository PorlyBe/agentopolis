// Agent Office: a read-only view of Claude Code sessions, subagents and workflow agents.
// It only reads transcripts under ~/.claude/projects — no hooks, no settings changes.
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'

const args = process.argv.slice(2)
const flag = (name, dflt) => {
  const i = args.indexOf(`--${name}`)
  return i === -1 ? dflt : args[i + 1]
}
const PORT = Number(flag('port', 4747))
const DEMO = args.includes('--demo') // synthetic data only: no transcripts, git, gh or network
const HOST = '127.0.0.1'
const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const LIVE_SESSIONS = path.join(os.homedir(), '.claude', 'sessions') // <pid>.json per running Claude
const ORCA = process.env.ORCA_CLI_BIN_DIR ? path.join(process.env.ORCA_CLI_BIN_DIR, 'orca') : 'orca'
const AGENT_LINGER_MS = 45_000 // a finished subagent stays this long so it can walk out
const AGENT_STALE_MS = 10 * 60_000 // an unfinished subagent silent this long is dropped
const WORKING_STALE_MS = 5 * 60_000
const ENDED_GRACE_MS = 20_000 // a session seen running whose Claude process exited stays this long, for the tower's move-out
const SCAN_AGENTS_WITHIN_MS = 6 * 60 * 60_000

const parseCache = new Map() // file -> { mtimeMs, size, result }; entries not used by a snapshot are dropped at its end

// Features (server/features/*.mjs) export any of:
//   session(ctx) / agent(ctx) -> plain JSON-able object, attached as session.ext[name] / agent.ext[name].
//     ctx: { kind, id, file, stat, entries (parsed tail of the transcript), sessionDir, meta?, workflow?, now }
//     Results are cached until the transcript changes, so keep anything time-based on the client.
//   snapshot(snap) -> mutate the whole snapshot after it is built (e.g. a cross-session feed).
//   after: ['other', ...] -> run this snapshot() after those features' (default: alphabetical order).
//   serves: ['tower-feature', ...] -> skip snapshot() while all of those are switched off in the settings.
//   routes: { '/api/<name>/...': (req, res, url) => void } matched by path prefix.
const ROOT = path.dirname(new URL(import.meta.url).pathname)

// Settings: saved (~/.agentopolis/settings.json, written by the page's settings panel) > CLI flag > built-in default.
// The flags are only startup defaults; a null in a POST drops the saved value, back to the flag's. --demo keeps them in memory.
const OPTIONS = await import(path.join(ROOT, 'app', 'options.js'))
const SETTINGS_FILE = path.join(os.homedir(), '.agentopolis', 'settings.json')
const DEFAULTS = {
  name: flag('name', 'You'),           // the person in the CEO office
  theme: flag('theme', 'auto'),        // the tower's skin (app/tower/features/themes.js); ?theme= overrides it
  avatar: flag('avatar', ''),          // the user's look, "hair=bun,suit=navy,skin=3,pet=cat" (app/tower/features/avatar.js)
  disabled: [],                        // tower features that don't start (app/options.js FEATURE_GROUPS)
  windowMin: Number(flag('window-min', 30)),
  updateCheck: true,                   // ask GitHub whether main has new commits (server/update-check.mjs)
  customThemes: [],                    // the Look tab's own themes, 'custom:<slug>' in theme (app/options.js checkCustomTheme)
  floorRules: [],                      // title pattern → floor styling (app/tower/features/floor-decor.js)
}
const VALIDATE = {
  name: v => typeof v === 'string' && v.trim() && v.trim().length <= 40 && !/[\u0000-\u001f\u007f]/.test(v) ? v.trim() : Error('name: 1–40 characters'),
  theme: (v, next = saved) => {
    if (typeof v !== 'string' || v.length > 60) return Error('theme: a name like cyberpunk+halloween')
    const t = OPTIONS.parseTheme(v, (next.customThemes || []).map(c => OPTIONS.slugOf(c.name)))
    return t.bad.length ? Error(`theme: unknown ${t.bad.join(', ')}`) : t.name
  },
  avatar: v => {
    const pairs = typeof v === 'string' ? v.split(',').filter(Boolean).map(p => p.split('=')) : v && typeof v === 'object' && !Array.isArray(v) ? Object.entries(v) : null
    if (!pairs) return Error('avatar: "hair=bun,suit=navy" or an object')
    const look = {}
    for (const [k, val] of pairs) {
      if (!Object.hasOwn(OPTIONS.AVATAR, k) || !OPTIONS.AVATAR[k].includes(String(val))) return Error(`avatar: unknown ${k}=${val}`)
      look[k] = String(val)
    }
    return Object.keys(OPTIONS.AVATAR).filter(k => look[k]).map(k => `${k}=${look[k]}`).join(',')
  },
  disabled: v => {
    if (!Array.isArray(v)) return Error('disabled: an array of feature names')
    const bad = v.filter(f => !OPTIONS.FEATURE_NAMES.includes(f))
    return bad.length ? Error(`disabled: unknown ${bad.slice(0, 5).join(', ')}`) : OPTIONS.FEATURE_NAMES.filter(f => v.includes(f))
  },
  windowMin: v => Number.isInteger(v) && v >= 5 && v <= 240 ? v : Error('windowMin: a whole number of minutes, 5–240'),
  updateCheck: v => typeof v === 'boolean' ? v : Error('updateCheck: true or false'),
  customThemes: v => OPTIONS.checkCustomThemes(v),
  floorRules: v => OPTIONS.checkFloorRules(v),
}
// a theme naming a custom theme is checked against the custom themes of the same save
const inOrder = o => Object.entries(o).sort(([a], [b]) => (b === 'customThemes') - (a === 'customThemes'))
let saved = {}
if (!DEMO) {
  let file = {}
  try { file = JSON.parse(fs.readFileSync(SETTINGS_FILE, 'utf8')) || {} } catch {}
  for (const [k, v] of inOrder(file)) { const ok = VALIDATE[k]?.(v, saved); if (ok !== undefined && !(ok instanceof Error)) saved[k] = ok }
}
const effective = () => ({ ...DEFAULTS, ...saved })
const settingsBody = () => ({
  effective: effective(), saved, defaults: DEFAULTS,
  options: { skins: OPTIONS.SKINS, holidays: OPTIONS.HOLIDAY_KEYS, avatar: OPTIONS.AVATAR, features: OPTIONS.FEATURE_GROUPS, windowMin: [5, 240],
    themeSlots: OPTIONS.THEME_SLOTS, maxCustom: OPTIONS.MAX_CUSTOM, floorPresets: OPTIONS.FLOOR_PRESETS, maxFloorRules: OPTIONS.MAX_FLOOR_RULES },
  file: DEMO ? null : SETTINGS_FILE.replace(os.homedir(), '~'),
})

async function postSettings(req, res) {
  if (req.headers['sec-fetch-site'] !== 'same-origin') return send(res, 403, { error: 'same-origin only' })
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > 24000) return send(res, 413, { error: 'too large' }) }
  let patch
  try { patch = JSON.parse(body) } catch { return send(res, 400, { error: 'not JSON' }) }
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return send(res, 400, { error: 'expected an object' })
  const next = { ...saved }
  for (const [k, v] of inOrder(patch)) {
    if (!VALIDATE[k]) return send(res, 400, { error: `unknown setting ${k}` })
    if (v === null) { delete next[k]; continue }
    const ok = VALIDATE[k](v, next)
    if (ok instanceof Error) return send(res, 400, { error: ok.message })
    next[k] = ok
  }
  if (next.theme && !('theme' in patch) && VALIDATE.theme(next.theme, next) instanceof Error) delete next.theme   // its custom theme was deleted
  if (!DEMO) {
    try {
      fs.mkdirSync(path.dirname(SETTINGS_FILE), { recursive: true })
      const tmp = `${SETTINGS_FILE}.${process.pid}.tmp`
      fs.writeFileSync(tmp, JSON.stringify(next, null, 1))
      fs.renameSync(tmp, SETTINGS_FILE)
    } catch (e) { return send(res, 500, { error: `could not save: ${e.message}` }) }
  }
  saved = next
  send(res, 200, settingsBody())
}
const updates = DEMO ? null : (await import(path.join(ROOT, 'server', 'update-check.mjs'))).updateChecker(ROOT, () => effective().updateCheck)
async function postUpdateCheck(req, res) {
  if (req.headers['sec-fetch-site'] !== 'same-origin') return send(res, 403, { error: 'same-origin only' })
  const r = await updates.checkNow()
  send(res, r.retryIn ? 429 : 200, r)
}
const seenLive = new Set(), endedAt = new Map() // session id -> when this server first saw its process gone
const demo = DEMO ? await import(path.join(ROOT, 'server', 'demo.mjs')) : null
const transcripts = DEMO ? null : await import(path.join(ROOT, 'server', 'lib', 'transcripts.mjs'))
const loaded = []
for (const f of DEMO ? [] : fs.readdirSync(path.join(ROOT, 'server', 'features')).filter(f => f.endsWith('.mjs')).sort()) {
  try {
    const mod = (await import(path.join(ROOT, 'server', 'features', f))).default || {}
    loaded.push({ name: f.slice(0, -4), ...mod })
  } catch (e) { console.error(`feature ${f} failed to load:`, e) }
}
// Snapshot hooks run alphabetically, except that a feature declaring after: ['other', ...] waits until those have run
// (it moves later; nothing moves earlier for it).
const features = []
{
  const names = new Set(loaded.map(f => f.name))
  for (const f of loaded) for (const d of f.after || []) if (!names.has(d)) console.error(`feature ${f.name}: after unknown feature ${d}`)
  const done = new Set(), left = [...loaded]
  while (left.length) {
    let i = left.findIndex(f => (f.after || []).every(d => done.has(d) || !names.has(d)))
    if (i < 0) { console.error(`features ${left.map(f => f.name).join(', ')}: 'after' cycle`); i = 0 }
    const [f] = left.splice(i, 1)
    features.push(f); done.add(f.name)
  }
}
function extOf(kind, ctx) {
  const ext = {}
  for (const f of features) {
    if (typeof f[kind] !== 'function') continue
    try { const r = f[kind](ctx); if (r !== undefined) ext[f.name] = r } catch (e) { console.error(`[${f.name}.${kind}]`, e.message) }
  }
  return ext
}

function readTail(file, size, bytes) {
  const fd = fs.openSync(file, 'r')
  try {
    const len = Math.min(size, bytes)
    const buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    const lines = buf.toString('utf8').split('\n')
    if (len < size) lines.shift() // first line is partial
    return lines
  } finally {
    fs.closeSync(fd)
  }
}

function parseLines(lines) {
  const entries = []
  for (const l of lines) {
    if (!l) continue
    try { entries.push(JSON.parse(l)) } catch {}
  }
  return entries
}

function summarize(entries) {
  let title = null, cwd = null, branch = null
  for (const e of entries) {
    if (e.type === 'ai-title' && e.aiTitle) title = e.aiTitle
    if (e.cwd) cwd = e.cwd
    if (e.gitBranch) branch = e.gitBranch
  }
  let state = 'thinking', tool = null, detail = null
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type !== 'assistant' && e.type !== 'user') continue
    const content = e.message?.content
    const blocks = Array.isArray(content) ? content : [{ type: 'text', text: String(content ?? '') }]
    if (e.type === 'assistant') {
      const use = [...blocks].reverse().find(b => b.type === 'tool_use')
      if (use) {
        state = 'tool'
        tool = use.name
        detail = toolDetail(use)
      } else if (e.message?.stop_reason === 'end_turn' || e.message?.stop_reason === 'stop_sequence') {
        state = 'waiting'
      } else {
        state = 'thinking'
      }
    } else {
      state = isStructuredResult(entries, i) ? 'waiting' : 'thinking'
    }
    break
  }
  return { title, cwd, branch, state, tool, detail }
}

// The user entry at i carries a successful result for a StructuredOutput call: the agent has returned.
function isStructuredResult(entries, i) {
  const results = (Array.isArray(entries[i].message?.content) ? entries[i].message.content : []).filter(b => b.type === 'tool_result' && !b.is_error)
  if (!results.length) return false
  for (let j = i - 1; j >= 0; j--) {
    if (entries[j].type !== 'assistant') continue
    const uses = (entries[j].message?.content || []).filter(b => b.type === 'tool_use')
    if (uses.length) return uses.some(u => u.name === 'StructuredOutput' && results.some(r => r.tool_use_id === u.id))
  }
  return false
}

function toolDetail(use) {
  const i = use.input || {}
  const pick = i.description || i.file_path || i.pattern || i.url || i.query || i.command || i.prompt || ''
  return String(pick).split('\n')[0].slice(0, 80)
}

// ctx carries what features need about this transcript; kind is 'session' or 'agent'.
function parseTranscript(file, stat, ctx) {
  used.add(file)
  const hit = parseCache.get(file)
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.result
  let entries
  try {
    entries = parseLines(readTail(file, stat.size, 256 * 1024))
    if (entries.length < 3 && stat.size > 256 * 1024) entries = parseLines(readTail(file, stat.size, 4 * 1024 * 1024))
  } catch { return null }   // deleted since its stat
  const result = summarize(entries)
  result.ext = extOf(ctx.kind, { ...ctx, file, stat, entries, now: Date.now() })
  parseCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, result })
  return result
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const statOr = f => { try { return fs.statSync(f) } catch { return null } }
const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }

const workflowNames = new Map()
let used = new Set()   // parseCache / workflowNames keys the current snapshot touched
function workflowName(sessionDir, wf) {
  const key = path.join(sessionDir, wf)
  used.add(key)
  if (workflowNames.has(key)) return workflowNames.get(key)
  const meta = readJson(path.join(sessionDir, 'workflows', `${wf}.json`))
  const name = meta?.script?.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? wf
  workflowNames.set(key, name)
  return name
}

// files: every agent transcript listed, with its stat, for the features' index (server/lib/transcripts.mjs)
function collectAgents(sessionDir, now, files) {
  const agents = []
  const visit = (dir, workflow, workflowRun = null) => {
    for (const f of ls(dir)) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue
      const file = path.join(dir, f)
      const st = statOr(file)
      if (!st) continue
      files.push({ id: f.slice(6, -6), file, stat: st })
      const age = now - st.mtimeMs
      if (age > AGENT_STALE_MS) continue
      const meta = readJson(file.replace(/\.jsonl$/, '.meta.json')) || {}
      const s = parseTranscript(file, st, { kind: 'agent', id: f.slice(6, -6), sessionDir, meta, workflow, workflowRun })
      if (!s) continue
      const done = s.state === 'waiting'
      if (done && age > AGENT_LINGER_MS) continue
      agents.push({
        id: f.slice(6, -6),
        type: meta.agentType || 'agent',
        description: meta.description || '',
        phase: meta.workflowPhase || null,
        workflow,
        workflowRun,
        state: done ? 'done' : age > WORKING_STALE_MS ? 'idle' : s.state,
        tool: s.tool,
        detail: s.detail,
        lastActivity: st.mtimeMs,
        ext: s.ext,
      })
    }
  }
  const sub = path.join(sessionDir, 'subagents')
  visit(sub, null)
  for (const wf of ls(path.join(sub, 'workflows'))) {
    visit(path.join(sub, 'workflows', wf), workflowName(sessionDir, wf), wf)
  }
  return agents
}

// sessionId -> pid of the Claude process running it, for sessions whose process is still alive
function liveSessions(cwds) {
  const live = new Map()
  for (const f of ls(LIVE_SESSIONS)) {
    if (!f.endsWith('.json')) continue
    const d = readJson(path.join(LIVE_SESSIONS, f))
    if (!d?.sessionId || !Number.isInteger(d.pid)) continue
    try { process.kill(d.pid, 0); live.set(d.sessionId, d.pid); if (cwds && typeof d.cwd === 'string') cwds.set(d.sessionId, d.cwd) } catch {}
  }
  return live
}

// session id -> its transcript(s) under PROJECTS. Listing all ~800 project dirs every poll is the slow part of a
// snapshot, so ids are looked up here: first in the project dir named after the session's cwd, then in this index,
// which re-lists only the project dirs whose mtime moved (a new transcript changes its dir's mtime).
const fileIndex = new Map()   // session id -> Set(transcript path)
const dirMtime = new Map()    // project dir -> mtimeMs at its last listing
let indexedAt = 0
function reindex(now) {
  indexedAt = now
  for (const proj of ls(PROJECTS)) {
    const pd = path.join(PROJECTS, proj), st = statOr(pd)
    if (!st || dirMtime.get(pd) === st.mtimeMs) continue
    dirMtime.set(pd, st.mtimeMs)
    for (const f of ls(pd)) if (f.endsWith('.jsonl')) {
      const id = f.slice(0, -6)
      if (!fileIndex.has(id)) fileIndex.set(id, new Set())
      fileIndex.get(id).add(path.join(pd, f))
    }
  }
}
const projectOf = cwd => path.join(PROJECTS, cwd.replace(/[^a-zA-Z0-9]/g, '-'))
function transcriptFiles(id, cwd, now) {
  const known = fileIndex.get(id)
  if (known?.size) return [...known]
  if (cwd) { const f = path.join(projectOf(cwd), `${id}.jsonl`); if (statOr(f)) { fileIndex.set(id, new Set([f])); return [f] } }
  if (now - indexedAt > 2000) reindex(now)   // a live session with no transcript yet must not re-list every poll
  return [...(fileIndex.get(id) || [])]
}

// An Orca terminal exports ORCA_TERMINAL_HANDLE, and the Claude process started in it inherits it.
function orcaTerminal(pid) {
  return new Promise(resolve => {
    execFile('ps', ['eww', '-o', 'command=', '-p', String(pid)], (err, out) => {
      resolve(err ? null : out.match(/ORCA_TERMINAL_HANDLE=(term_[0-9a-f-]+)/)?.[1] ?? null)
    })
  })
}

async function focus(req, res) {
  // Only this page may ask: a cross-site page could otherwise POST here too.
  if (req.headers['sec-fetch-site'] !== 'same-origin') return send(res, 403, { error: 'same-origin only' })
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > 1000) break }
  const id = (() => { try { return JSON.parse(body).id } catch { return null } })()
  if (!/^[0-9a-f-]{36}$/.test(id ?? '')) return send(res, 400, { error: 'bad session id' })
  const pid = liveSessions().get(id)
  if (!pid) return send(res, 404, { error: 'This session is no longer running' })
  const handle = await orcaTerminal(pid)
  if (!handle) return send(res, 404, { error: 'This session is not running in an Orca terminal' })
  execFile(ORCA, ['terminal', 'switch', '--terminal', handle, '--json'], (err, _out, stderr) => {
    if (err) send(res, 502, { error: (stderr || err.message).trim().split('\n')[0] })
    else send(res, 200, { ok: true })
  })
}

// Open a GitHub link in the user's default browser (the office itself runs inside Orca's built-in browser).
async function openExternal(req, res) {
  if (req.headers['sec-fetch-site'] !== 'same-origin') return send(res, 403, { error: 'same-origin only' })
  let body = ''
  for await (const chunk of req) { body += chunk; if (body.length > 4000) break }
  const url = (() => { try { return new URL(JSON.parse(body).url) } catch { return null } })()
  if (!url || url.protocol !== 'https:' || url.hostname !== 'github.com') return send(res, 400, { error: 'only https://github.com links' })
  const [cmd, ...pre] = process.platform === 'darwin' ? ['open'] : process.platform === 'win32' ? ['rundll32', 'url.dll,FileProtocolHandler'] : ['xdg-open']
  execFile(cmd, [...pre, url.href], err => err ? send(res, 502, { error: err.message }) : send(res, 200, { ok: true }))
}

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function snapshot() {
  const { name: owner, theme, avatar, windowMin, customThemes, floorRules } = effective()
  if (DEMO) return { ...demo.generate(Date.now()), owner, theme, avatar, customThemes, floorRules, update: { status: 'off', ahead: 0, commits: [], checkedAt: null, branch: null } }
  const now = Date.now()
  const sessions = [], index = new Map()
  const cwds = new Map(), live = liveSessions(cwds)
  used = new Set()
  // only a session running now, or seen running by this server, can be on screen: look at those alone
  for (const id of live.keys()) { seenLive.add(id); endedAt.delete(id) }
  for (const id of [...seenLive]) {
    if (!live.has(id) && endedAt.has(id) && now - endedAt.get(id) > ENDED_GRACE_MS) { seenLive.delete(id); endedAt.delete(id); continue }
    for (const file of transcriptFiles(id, cwds.get(id), now)) {
      const st = statOr(file)
      if (!st) { fileIndex.get(id)?.delete(file); continue }
      const sessionDir = file.slice(0, -6)
      // A session running a workflow leaves its own transcript idle for long stretches, so its
      // agents count as activity — but only look inside sessions touched in the last few hours.
      if (now - st.mtimeMs > SCAN_AGENTS_WITHIN_MS) {
        // ended and long quiet: it can never come back on screen (windowMin is at most 240 min) unless it runs again
        if (!live.has(id) && now - st.mtimeMs > 2 * SCAN_AGENTS_WITHIN_MS) { seenLive.delete(id); endedAt.delete(id) }
        continue
      }
      const files = []
      const agents = collectAgents(sessionDir, now, files)
      const lastAgent = Math.max(0, ...agents.map(a => a.lastActivity))
      const last = Math.max(st.mtimeMs, lastAgent)
      if (now - last > windowMin * 60_000) continue
      if (!live.has(id) && now - (endedAt.get(id) ?? endedAt.set(id, now).get(id)) > ENDED_GRACE_MS) continue
      const s = parseTranscript(file, st, { kind: 'session', id, sessionDir })
      if (!s) continue
      const custom = readJson(path.join(sessionDir, 'custom-title.json'))?.customTitle
      const busyAgents = agents.some(a => a.state !== 'done' && a.state !== 'idle')
      let state = s.state
      if (busyAgents && (state === 'waiting' || now - st.mtimeMs > 30_000)) state = 'delegating'
      else if (state !== 'waiting' && now - st.mtimeMs > WORKING_STALE_MS) state = 'idle'
      index.set(id, { id, file, stat: st, sessionDir, agents: files })
      sessions.push({
        id,
        title: custom || s.title || id.slice(0, 8),
        cwd: s.cwd,
        branch: s.branch,
        worktree: s.cwd?.match(/\.claude\/worktrees\/([^/]+)/)?.[1] ?? null,
        running: live.has(id),
        endedAt: endedAt.get(id) ?? null,
        state,
        tool: s.tool,
        detail: s.detail,
        lastActivity: last,
        agents,
        ext: s.ext,
      })
    }
  }
  for (const k of parseCache.keys()) if (!used.has(k)) parseCache.delete(k)
  for (const k of workflowNames.keys()) if (!used.has(k)) workflowNames.delete(k)
  sessions.sort((a, b) => a.id.localeCompare(b.id))
  transcripts.setIndex(index)
  const snap = { now, owner, theme, avatar, customThemes, floorRules, sessions, update: updates.state() }
  const off = new Set(effective().disabled)
  for (const f of features) {
    if (typeof f.snapshot !== 'function' || f.serves?.every(n => off.has(n))) continue   // feeds only tower features switched off
    try { f.snapshot(snap) } catch (e) { console.error(`[${f.name}.snapshot]`, e.message) }
  }
  return snap
}

const INDEX = path.join(ROOT, 'index.html')
const ASSETS = path.join(ROOT, 'assets')
const APP = path.join(ROOT, 'app')

// A throw or a rejected promise in a handler answers 500; it never takes the server down.
const failed = (req, res) => e => {
  console.error(`[${req.method} ${req.url}]`, e)
  if (!res.headersSent) send(res, 500, { error: 'internal error' }); else res.end()
}
const server = http.createServer((req, res) => {
  try { const r = handle(req, res); if (r && typeof r.catch === 'function') r.catch(failed(req, res)) } catch (e) { failed(req, res)(e) }
})

function handle(req, res) {
  const host = (req.headers.host || '').split(':')[0]
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (req.url === '/api/settings' && req.method === 'GET') return send(res, 200, settingsBody())
  if (req.url === '/api/settings' && req.method === 'POST') return postSettings(req, res)
  if (DEMO && req.url.startsWith('/api/') && req.url !== '/api/state') return send(res, 404, { error: 'Not available in the demo' })
  if (req.url === '/api/focus' && req.method === 'POST') return focus(req, res)
  if (req.url === '/api/open' && req.method === 'POST') return openExternal(req, res)
  if (req.url === '/api/update/check' && req.method === 'POST') return postUpdateCheck(req, res)
  if (req.url === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(snapshot()))
    return
  }
  let url
  try { url = new URL(req.url, 'http://127.0.0.1') } catch { return void res.writeHead(400).end('bad url') }
  for (const f of features) for (const [prefix, handler] of Object.entries(f.routes || {})) {
    if (url.pathname.startsWith(prefix)) {
      try { return handler(req, res, url) } catch (e) { console.error(`[${f.name} route]`, e); return send(res, 500, { error: e.message }) }
    }
  }
  if (req.url.startsWith('/app/')) {
    let rel; try { rel = decodeURIComponent(url.pathname.slice('/app/'.length)) } catch { return void res.writeHead(400).end('bad path') }
    const file = path.join(APP, rel)
    if (!file.startsWith(APP + path.sep) || path.extname(file) !== '.js' || !fs.existsSync(file)) return void res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    return void res.end(fs.readFileSync(file))
  }
  if (req.url.startsWith('/assets/')) {
    let rel; try { rel = decodeURIComponent(req.url.slice('/assets/'.length).split('?')[0]) } catch { return void res.writeHead(400).end('bad path') }
    const file = path.join(ASSETS, rel)
    const type = { '.png': 'image/png', '.json': 'application/json' }[path.extname(file)]
    if (!file.startsWith(ASSETS + path.sep) || !type || !fs.existsSync(file)) {
      res.writeHead(404).end('not found')
      return
    }
    res.writeHead(200, { 'content-type': type, 'cache-control': 'max-age=3600' })
    res.end(fs.readFileSync(file))
    return
  }
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    res.end(fs.readFileSync(INDEX))
    return
  }
  res.writeHead(404).end('not found')
}

server.on('error', e => { console.error(e.code === 'EADDRINUSE' ? `Port ${PORT} is in use (is Agentopolis already running?). Try --port <n>.` : e.message); process.exit(1) })
server.listen(PORT, HOST, () => console.log(`Agentopolis${DEMO ? ' (demo)' : ''}: http://${HOST}:${PORT}`))
