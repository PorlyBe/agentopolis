// workflow-phases: each running workflow's real name and phase progress, for a sign over the pod.
// The run's workflows/wf_*.json only appears when it finishes, so the name and phases come from the script
// (`export const meta = { name, phases }`): the session's workflows/scripts/<name>-<runId>.js, else the
// "Script file:" path or inline script the parent transcript's Workflow call carries.
import fs from 'node:fs'
import { readSync, tailState, own } from '../lib/tail.mjs'
import { filesOf } from '../lib/transcripts.mjs'
import path from 'node:path'
import os from 'node:os'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }
const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }
const statOr = f => { try { return fs.statSync(f) } catch { return null } }

const QUOTED = String.raw`(['"\x60])((?:\\.|(?!\1).)*)\1`
function parseMeta(script) {
  const at = script?.search(/\bmeta\s*=\s*\{/)
  if (at == null || at < 0) return null
  let i = script.indexOf('{', at), depth = 0, end = -1
  for (let q = null; i < script.length; i++) {
    const c = script[i]
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue }
    if (c === '"' || c === "'" || c === '`') q = c
    else if (c === '{' || c === '[') depth++
    else if ((c === '}' || c === ']') && --depth === 0) { end = i; break }
  }
  const body = script.slice(script.indexOf('{', at), end + 1)
  const name = body.match(new RegExp(String.raw`\bname\s*:\s*` + QUOTED))?.[2]
  const ph = body.slice(body.search(/\bphases\s*:/))
  const phases = /\bphases\s*:/.test(body) ? [...ph.matchAll(new RegExp(String.raw`\btitle\s*:\s*` + QUOTED, 'g'))].map(m => m[2]) : []
  return name || phases.length ? { name, phases } : null
}

const sessionFile = id => filesOf(id)?.file ?? null

// Incremental scan of the parent transcript for Workflow launches: runId -> { scriptPath, summary, script }.
const launches = new Map() // file -> { offset, rest, inline: Map(toolUseId -> script), runs: Map(runId -> info) }
function scanLaunches(file) {
  const st = statOr(file); if (!st) return null
  let s = launches.get(file)
  if (!s || st.size < s.offset) { s = tailState(0, { inline: new Map(), runs: new Map() }); launches.set(file, s) }
  try {
    readSync(s, file, st.size, l => {
      if (!l.includes('"Workflow"') && !l.includes('wf_')) return
      let e; try { e = JSON.parse(l) } catch { return }
      for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
        if (b.type === 'tool_use' && b.name === 'Workflow' && b.input?.script) s.inline.set(b.id, b.input.script)
        if (b.type !== 'tool_result') continue
        const text = typeof b.content === 'string' ? b.content : (b.content || []).map(c => c.text || '').join('\n')
        const run = text.match(/Transcript dir: .*?(wf_[0-9a-f]{8}-[0-9a-f]{3})/)?.[1]
        if (!run) continue
        s.runs.set(own(run), { scriptPath: own(text.match(/Script file: (\S+\.js)/)?.[1]), summary: own(text.match(/Summary: (.*)/)?.[1]), script: s.inline.get(b.tool_use_id) })
      }
    })
  } catch {}
  return s
}

const metas = new Map() // sessionDir/runId -> { name, phases }
function runMeta(sessionId, sessionDir, run) {
  const key = sessionDir + '/' + run
  if (metas.get(key)?.name) return metas.get(key)
  const done = readJson(path.join(sessionDir, 'workflows', run + '.json'))
  let m = done && (done.workflowName || done.phases) ? { name: done.workflowName, phases: (done.phases || []).map(p => p.title) } : null
  const fromFile = f => { try { return parseMeta(fs.readFileSync(f, 'utf8')) } catch { return null } }
  if (!m?.name) {
    const local = ls(path.join(sessionDir, 'workflows', 'scripts')).find(f => f.endsWith(`-${run}.js`))
    if (local) m = fromFile(path.join(sessionDir, 'workflows', 'scripts', local))
  }
  let summary
  if (!m?.name) {
    const f = sessionFile(sessionId), info = f && scanLaunches(f)?.runs.get(run)
    summary = info?.summary
    if (info?.scriptPath?.startsWith(PROJECTS + path.sep)) m = fromFile(info.scriptPath) || m
    if (!m?.name && info?.script) m = parseMeta(info.script) || m
    if (!m?.name && info?.scriptPath) m = { ...m, name: path.basename(info.scriptPath, '.js').replace(`-${run}`, '') }
  }
  m = { name: m?.name || summary?.slice(0, 60) || 'workflow', phases: m?.phases || [] }
  metas.set(key, m)
  return m
}

// A workflow agent is finished once its last turn ended without a tool call.
const agentDone = new Map() // file -> { mtimeMs, size, done }
function isDone(file, st = statOr(file)) {
  if (!st) return false
  const hit = agentDone.get(file)
  if (hit && hit.mtimeMs === st.mtimeMs && hit.size === st.size) return hit.done
  let done = false
  const fd = fs.openSync(file, 'r')
  try {
    const len = Math.min(st.size, 64 * 1024), buf = Buffer.alloc(len)
    fs.readSync(fd, buf, 0, len, st.size - len)
    const lines = buf.toString('utf8').split('\n')
    let output = null // tool_use id of a StructuredOutput call, which is how a workflow agent hands in its result
    for (let i = lines.length - 1; i >= 0; i--) {
      if (!lines[i].includes('"assistant"') && !lines[i].includes('"user"') && !lines[i].includes('SubagentStop')) continue
      let e; try { e = JSON.parse(lines[i]) } catch { continue }
      if (e.attachment?.hookEvent === 'SubagentStop') { done = true; break }
      const content = Array.isArray(e.message?.content) ? e.message.content : []
      if (e.type === 'user') {
        const r = content.find(b => b.type === 'tool_result')
        if (!r) break
        if (!r.is_error) output = r.tool_use_id
        continue
      }
      if (e.type !== 'assistant') continue
      const uses = content.filter(b => b.type === 'tool_use'), r = e.message?.stop_reason
      done = uses.length ? uses.some(b => b.name === 'StructuredOutput' && b.id === output) : r === 'end_turn' || r === 'stop_sequence'
      break
    }
  } finally { fs.closeSync(fd) }
  agentDone.set(file, { mtimeMs: st.mtimeMs, size: st.size, done })
  return done
}

// an agent's .meta.json is written once when it starts: its birth time and phase, read once
const agentMetas = new Map() // meta path -> { birth, phase }
function agentMeta(file) {
  let m = agentMetas.get(file)
  if (!m) {
    const j = readJson(file)
    m = { birth: statOr(file)?.birthtimeMs || 0, phase: j?.workflowPhase || '—' }
    if (j) agentMetas.set(file, m)
  }
  return m
}

function progress(sessionId, sessionDir, run, stats) {
  const meta = runMeta(sessionId, sessionDir, run)
  const dir = path.join(sessionDir, 'subagents', 'workflows', run)
  const byPhase = new Map()
  const agents = ls(dir).filter(f => f.endsWith('.meta.json')).map(f => ({ f, ...agentMeta(path.join(dir, f)) })).sort((a, b) => a.birth - b.birth)
  for (const { f, phase } of agents) {
    const p = byPhase.get(phase) || { done: 0, total: 0 }
    p.total++
    const jsonl = path.join(dir, f.replace(/\.meta\.json$/, '.jsonl'))
    if (isDone(jsonl, stats.has(jsonl) ? stats.get(jsonl) : undefined)) p.done++
    byPhase.set(phase, p)
  }
  const titles = [...meta.phases]
  for (const t of byPhase.keys()) if (!titles.includes(t) && t !== '—') titles.push(t)
  const finished = readJson(path.join(sessionDir, 'workflows', run + '.json'))?.status
  const lastStarted = Math.max(-1, ...titles.map((t, i) => byPhase.has(t) ? i : -1))
  const phases = titles.map((title, i) => {
    const p = byPhase.get(title) || { done: 0, total: 0 }
    const state = finished === 'completed' ? 'done'
      : p.total && p.done < p.total ? (finished ? 'stopped' : 'active')
      : i < lastStarted || (p.total && finished) ? 'done'
      : p.total ? 'active'
      : finished ? 'stopped' : 'pending'
    return { title, state, done: p.done, total: p.total }
  })
  return { run, name: meta.name, phases, status: finished || 'running' }
}

function snapshot(snap) {
  if (agentMetas.size > 5000) agentMetas.clear()
  if (agentDone.size > 5000) agentDone.clear()
  for (const s of snap.sessions) {
    const runs = [...new Set(s.agents.map(a => a.workflowRun).filter(Boolean))]
    if (!runs.length) continue
    const f = sessionFile(s.id); if (!f) continue
    const sessionDir = f.slice(0, -6)
    const stats = new Map((filesOf(s.id)?.agents || []).map(a => [a.file, a.stat]))   // already stat'ed by server.mjs
    const out = runs.map(r => {
      const p = progress(s.id, sessionDir, r, stats)
      p.last = Math.max(...s.agents.filter(a => a.workflowRun === r).map(a => a.lastActivity))
      return p
    }).sort((a, b) => b.last - a.last)
    for (const a of s.agents) if (a.workflowRun) a.workflow = out.find(o => o.run === a.workflowRun).name
    s.ext = { ...s.ext, 'workflow-phases': out }
  }
}

export default { snapshot }
