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
const OWNER = flag('name', 'You')   // the person in the CEO office
const DEMO = args.includes('--demo') // synthetic data only: no transcripts, git, gh or network
const HOST = '127.0.0.1'
const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const LIVE_SESSIONS = path.join(os.homedir(), '.claude', 'sessions') // <pid>.json per running Claude
const ORCA = process.env.ORCA_CLI_BIN_DIR ? path.join(process.env.ORCA_CLI_BIN_DIR, 'orca') : 'orca'
const SESSION_WINDOW_MS = Number(flag('window-min', 30)) * 60_000
const AGENT_LINGER_MS = 45_000 // a finished subagent stays this long so it can walk out
const AGENT_STALE_MS = 10 * 60_000 // an unfinished subagent silent this long is dropped
const WORKING_STALE_MS = 5 * 60_000
const ENDED_GRACE_MS = 20_000 // a session seen running whose Claude process exited stays this long, for the tower's move-out
const SCAN_AGENTS_WITHIN_MS = 6 * 60 * 60_000

const parseCache = new Map() // file -> { mtimeMs, size, result }

// Features (server/features/*.mjs) export any of:
//   session(ctx) / agent(ctx) -> plain JSON-able object, attached as session.ext[name] / agent.ext[name].
//     ctx: { kind, id, file, stat, entries (parsed tail of the transcript), sessionDir, meta?, workflow?, now }
//     Results are cached until the transcript changes, so keep anything time-based on the client.
//   snapshot(snap) -> mutate the whole snapshot after it is built (e.g. a cross-session feed).
//   routes: { '/api/<name>/...': (req, res, url) => void } matched by path prefix.
const ROOT = path.dirname(new URL(import.meta.url).pathname)
const features = []
const seenLive = new Set(), endedAt = new Map() // session id -> when this server first saw its process gone
const demo = DEMO ? await import(path.join(ROOT, 'server', 'demo.mjs')) : null
for (const f of DEMO ? [] : fs.readdirSync(path.join(ROOT, 'server', 'features')).filter(f => f.endsWith('.mjs')).sort()) {
  try {
    const mod = (await import(path.join(ROOT, 'server', 'features', f))).default || {}
    features.push({ name: f.slice(0, -4), ...mod })
  } catch (e) { console.error(`feature ${f} failed to load:`, e) }
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
  const hit = parseCache.get(file)
  if (hit && hit.mtimeMs === stat.mtimeMs && hit.size === stat.size) return hit.result
  let entries = parseLines(readTail(file, stat.size, 256 * 1024))
  if (entries.length < 3 && stat.size > 256 * 1024) entries = parseLines(readTail(file, stat.size, 4 * 1024 * 1024))
  const result = summarize(entries)
  result.ext = extOf(ctx.kind, { ...ctx, file, stat, entries, now: Date.now() })
  parseCache.set(file, { mtimeMs: stat.mtimeMs, size: stat.size, result })
  return result
}

const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const statOr = f => { try { return fs.statSync(f) } catch { return null } }
const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }

const workflowNames = new Map()
function workflowName(sessionDir, wf) {
  const key = path.join(sessionDir, wf)
  if (workflowNames.has(key)) return workflowNames.get(key)
  const meta = readJson(path.join(sessionDir, 'workflows', `${wf}.json`))
  const name = meta?.script?.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? wf
  workflowNames.set(key, name)
  return name
}

function collectAgents(sessionDir, now) {
  const agents = []
  const visit = (dir, workflow, workflowRun = null) => {
    for (const f of ls(dir)) {
      if (!f.startsWith('agent-') || !f.endsWith('.jsonl')) continue
      const file = path.join(dir, f)
      const st = statOr(file)
      if (!st) continue
      const age = now - st.mtimeMs
      if (age > AGENT_STALE_MS) continue
      const meta = readJson(file.replace(/\.jsonl$/, '.meta.json')) || {}
      const s = parseTranscript(file, st, { kind: 'agent', id: f.slice(6, -6), sessionDir, meta, workflow, workflowRun })
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
function liveSessions() {
  const live = new Map()
  for (const f of ls(LIVE_SESSIONS)) {
    if (!f.endsWith('.json')) continue
    const d = readJson(path.join(LIVE_SESSIONS, f))
    if (!d?.sessionId || !Number.isInteger(d.pid)) continue
    try { process.kill(d.pid, 0); live.set(d.sessionId, d.pid) } catch {}
  }
  return live
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
  execFile('open', [url.href], err => err ? send(res, 502, { error: err.message }) : send(res, 200, { ok: true }))
}

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function snapshot() {
  if (DEMO) return { ...demo.generate(Date.now()), owner: OWNER }
  const now = Date.now()
  const sessions = []
  const live = liveSessions()
  for (const proj of ls(PROJECTS)) {
    const projDir = path.join(PROJECTS, proj)
    for (const f of ls(projDir)) {
      if (!f.endsWith('.jsonl')) continue
      const id = f.slice(0, -6)
      const file = path.join(projDir, f)
      const st = statOr(file)
      if (!st) continue
      const sessionDir = path.join(projDir, id)
      // A session running a workflow leaves its own transcript idle for long stretches, so its
      // agents count as activity — but only look inside sessions touched in the last few hours.
      if (now - st.mtimeMs > SCAN_AGENTS_WITHIN_MS) continue
      const agents = collectAgents(sessionDir, now)
      const lastAgent = Math.max(0, ...agents.map(a => a.lastActivity))
      const last = Math.max(st.mtimeMs, lastAgent)
      if (now - last > SESSION_WINDOW_MS) continue
      if (live.has(id)) { seenLive.add(id); endedAt.delete(id) }
      else if (!seenLive.has(id)) continue
      else if (now - (endedAt.get(id) ?? endedAt.set(id, now).get(id)) > ENDED_GRACE_MS) continue
      const s = parseTranscript(file, st, { kind: 'session', id, sessionDir })
      const custom = readJson(path.join(sessionDir, 'custom-title.json'))?.customTitle
      const busyAgents = agents.some(a => a.state !== 'done' && a.state !== 'idle')
      let state = s.state
      if (busyAgents && (state === 'waiting' || now - st.mtimeMs > 30_000)) state = 'delegating'
      else if (state !== 'waiting' && now - st.mtimeMs > WORKING_STALE_MS) state = 'idle'
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
  sessions.sort((a, b) => a.id.localeCompare(b.id))
  const snap = { now, owner: OWNER, sessions }
  for (const f of features) if (typeof f.snapshot === 'function') { try { f.snapshot(snap) } catch (e) { console.error(`[${f.name}.snapshot]`, e.message) } }
  return snap
}

const INDEX = path.join(ROOT, 'index.html')
const ASSETS = path.join(ROOT, 'assets')
const APP = path.join(ROOT, 'app')

const server = http.createServer((req, res) => {
  const host = (req.headers.host || '').split(':')[0]
  if (!['127.0.0.1', 'localhost'].includes(host)) {
    res.writeHead(403).end('forbidden')
    return
  }
  if (DEMO && req.url.startsWith('/api/') && req.url !== '/api/state') return send(res, 404, { error: 'Not available in the demo' })
  if (req.url === '/api/focus' && req.method === 'POST') return void focus(req, res)
  if (req.url === '/api/open' && req.method === 'POST') return void openExternal(req, res)
  if (req.url === '/api/state') {
    res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' })
    res.end(JSON.stringify(snapshot()))
    return
  }
  const url = new URL(req.url, `http://${req.headers.host}`)
  for (const f of features) for (const [prefix, handler] of Object.entries(f.routes || {})) {
    if (url.pathname.startsWith(prefix)) {
      try { return void handler(req, res, url) } catch (e) { console.error(`[${f.name} route]`, e); return send(res, 500, { error: e.message }) }
    }
  }
  if (req.url.startsWith('/app/')) {
    const file = path.join(APP, decodeURIComponent(url.pathname.slice('/app/'.length)))
    if (!file.startsWith(APP + path.sep) || path.extname(file) !== '.js' || !fs.existsSync(file)) return void res.writeHead(404).end('not found')
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store' })
    return void res.end(fs.readFileSync(file))
  }
  if (req.url.startsWith('/assets/')) {
    const rel = decodeURIComponent(req.url.slice('/assets/'.length).split('?')[0])
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
})

server.listen(PORT, HOST, () => console.log(`Agentopolis${DEMO ? ' (demo)' : ''}: http://${HOST}:${PORT}`))
