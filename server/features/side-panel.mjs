// side-panel: the recent stream of one agent (or session) transcript, read from its tail.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const HOME = os.homedir()
const TAIL = 256 * 1024
const MAX_ITEMS = 80
const SESSION_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
const AGENT_RE = /^a[0-9a-f]{8,40}$/
const located = new Map() // session/agent key -> transcript path
const cache = new Map() // file -> { mtimeMs, size, body }

const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }
const statOr = f => { try { return fs.statSync(f) } catch { return null } }
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const clip = (s, n) => { s = String(s ?? '').split(HOME).join('~'); return s.length > n ? s.slice(0, n) + '…' : s }

function sessionDirOf(session) {
  for (const proj of ls(PROJECTS)) if (statOr(path.join(PROJECTS, proj, session + '.jsonl'))) return path.join(PROJECTS, proj)
  return null
}
function locate(session, agent) {
  const key = session + '/' + (agent || '')
  const hit = located.get(key)
  if (hit && statOr(hit.file)) return hit
  const proj = sessionDirOf(session); if (!proj) return null
  let found = null
  if (!agent) found = { file: path.join(proj, session + '.jsonl'), wf: null }
  else {
    const sub = path.join(proj, session, 'subagents'), name = `agent-${agent}.jsonl`
    if (statOr(path.join(sub, name))) found = { file: path.join(sub, name), wf: null }
    else for (const wf of ls(path.join(sub, 'workflows'))) {
      if (statOr(path.join(sub, 'workflows', wf, name))) { found = { file: path.join(sub, 'workflows', wf, name), wf }; break }
    }
  }
  if (found) { found.sessionDir = path.join(proj, session); located.set(key, found) }
  return found
}

function workflowName(sessionDir, wf) {
  const meta = readJson(path.join(sessionDir, 'workflows', `${wf}.json`))
  let script = meta?.script
  if (!script) {
    const f = ls(path.join(sessionDir, 'workflows', 'scripts')).find(n => n.endsWith(`${wf}.js`))
    if (f) try { script = fs.readFileSync(path.join(sessionDir, 'workflows', 'scripts', f), 'utf8').slice(0, 4000) } catch {}
  }
  return script?.match(/name:\s*['"`]([^'"`]+)['"`]/)?.[1] ?? wf
}

function inputSummary(name, i = {}) {
  const head = i.description || i.file_path || i.pattern || i.url || i.query || i.skill || i.subject || ''
  const extra = name === 'Bash' ? i.command : name === 'Edit' ? i.old_string && `${clip(i.old_string, 60)} → ${clip(i.new_string, 60)}` : i.prompt || i.content
  const rest = !head && !extra ? JSON.stringify(i) : extra
  return { head: clip(head, 160), body: rest ? clip(rest, 300) : '' }
}
function resultText(c) {
  if (typeof c === 'string') return c
  if (Array.isArray(c)) return c.map(b => b.type === 'text' ? b.text : b.type === 'image' ? '[image]' : '').join('\n')
  return ''
}

function readTail(file, size) {
  const fd = fs.openSync(file, 'r')
  try {
    const len = Math.min(size, TAIL), buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, size - len)
    const lines = buf.toString('utf8').split('\n')
    if (len < size) lines.shift()
    return lines
  } finally { fs.closeSync(fd) }
}

function stream(file, st) {
  const items = []
  for (const l of readTail(file, st.size)) {
    if (!l) continue
    let e; try { e = JSON.parse(l) } catch { continue }
    if ((e.type !== 'assistant' && e.type !== 'user') || e.isMeta) continue
    const t = Date.parse(e.timestamp) || null, c = e.message?.content
    if (typeof c === 'string') { if (e.type === 'user' && c.trim() && !c.startsWith('<')) items.push({ t, kind: 'user', text: clip(c, 600) }); continue }
    if (!Array.isArray(c)) continue
    for (const b of c) {
      if (b.type === 'text' && b.text?.trim()) items.push({ t, kind: e.type === 'user' ? 'user' : 'text', text: clip(b.text, e.type === 'user' ? 600 : 1500) })
      else if (b.type === 'tool_use') items.push({ t, kind: 'tool', id: b.id, tool: b.name, ...inputSummary(b.name, b.input) })
      else if (b.type === 'tool_result') items.push({ t, kind: 'result', id: b.tool_use_id, error: !!b.is_error, text: clip(resultText(b.content).trim(), 500) })
    }
  }
  return items.slice(-MAX_ITEMS)
}

function handle(req, res, url) {
  const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' }); res.end(JSON.stringify(obj)) }
  const session = url.searchParams.get('session') || '', agent = url.searchParams.get('id') || ''
  if (!SESSION_RE.test(session)) return send(400, { error: 'bad session id' })
  if (agent && !AGENT_RE.test(agent)) return send(400, { error: 'bad agent id' })
  const loc = locate(session, agent)
  const st = loc && statOr(loc.file)
  if (!st) return send(404, { error: 'transcript not found' })
  const hit = cache.get(loc.file)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return send(200, hit.body)
  const meta = agent ? readJson(loc.file.replace(/\.jsonl$/, '.meta.json')) || {} : {}
  const body = {
    kind: agent ? 'agent' : 'session', session, id: agent || session,
    description: meta.description || '', type: meta.agentType || (agent ? 'agent' : 'session'),
    phase: meta.workflowPhase || null, workflow: loc.wf ? workflowName(loc.sessionDir, loc.wf) : null,
    lastActivity: st.mtimeMs, items: stream(loc.file, st),
  }
  if (cache.size > 50) cache.clear()
  cache.set(loc.file, { mtimeMs: st.mtimeMs, size: st.size, body })
  send(200, body)
}

export default { routes: { '/api/side-panel/': handle } }
