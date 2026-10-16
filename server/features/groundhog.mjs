// groundhog: retry loops — the same tool call (same tool, normalized input) failing three or more times within
// WINDOW in one transcript, its own or a subagent's. A success of that same call ends the loop. Files are read like
// bugs.mjs: once from near their end, then only their appended bytes.
import path from 'node:path'
import { readSync, tailState, own } from '../lib/tail.mjs'
import { transcriptsOf, sweep } from '../lib/transcripts.mjs'

const WINDOW = 10 * 60_000, MIN = 3
const FIRST_READ = 2 * 1024 * 1024
const NOT_A_FAIL = /doesn't want to proceed|was rejected|Request interrupted|Permission for this action/
const scans = new Map() // file -> { offset, rest, skip, pending: Map(tool_use_id -> call), fails: Map(key -> { call, at: [ms] }) }
const PATH = /(?:~|\.{1,2})?\/[^\s'"`;|&()<>]+/g

function callOf(b) {
  const i = b.input || {}
  if (b.name === 'Bash') {
    const cmd = String(i.command || '')
    return { key: 'Bash:' + cmd.replace(PATH, '<path>').replace(/\s+/g, ' ').trim(), label: cmd.replace(/\s+/g, ' ').trim().slice(0, 160) }
  }
  if (b.name === 'Edit') return { key: `Edit:${i.file_path}\0${i.old_string}`, label: `Edit ${path.basename(String(i.file_path || ''))}: ${String(i.old_string || '').replace(/\s+/g, ' ').trim().slice(0, 100)}` }
  const j = JSON.stringify(i)
  return { key: b.name + ':' + j.slice(0, 800), label: `${b.name} ${(i.file_path || i.url || i.pattern || i.description || j).toString().slice(0, 120)}` }
}

function failed(b) {
  const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
  if (NOT_A_FAIL.test(out.slice(0, 300))) return false
  return !!b.is_error || out.startsWith('<tool_use_error>') || /^Exit code [1-9]\d*/.test(out)
}

function line(s, l) {
  const use = l.includes('"tool_use"'), res = l.includes('"tool_result"')
  if (!use && !res) return
  let e; try { e = JSON.parse(l) } catch { return }
  const at = Date.parse(e.timestamp) || 0
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type === 'tool_use' && e.type === 'assistant') {
      const c = callOf(b)
      s.pending.set(own(b.id), { tool: own(b.name), key: own(c.key), label: own(c.label) })
      if (s.pending.size > 200) s.pending.delete(s.pending.keys().next().value)
    } else if (b.type === 'tool_result') {
      const call = s.pending.get(b.tool_use_id); if (!call) continue
      s.pending.delete(b.tool_use_id)
      if (!failed(b)) { s.fails.delete(call.key); continue }
      const f = s.fails.get(call.key) || { call, at: [] }
      f.at.push(at); f.call = call; s.fails.set(call.key, f)
    }
  }
}

function scan(file, size) {
  let s = scans.get(file)
  if (!s || size < s.offset) {
    s = tailState(Math.max(0, size - FIRST_READ), { pending: new Map(), fails: new Map() })
    scans.set(file, s)
  }
  readSync(s, file, size, l => line(s, l))
  const cut = Date.now() - WINDOW, loops = []
  for (const [key, f] of s.fails) {
    if (f.at[0] < cut) f.at = f.at.filter(t => t >= cut)
    if (!f.at.length) { s.fails.delete(key); continue }
    if (f.at.length >= MIN) loops.push({ tool: f.call.tool, label: f.call.label, count: f.at.length, first: f.at[0], last: f.at.at(-1) })
  }
  return loops
}

export default {
  serves: ['groundhog'],   // only its own tower feature reads it
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const loops = []
      for (const { file: f, stat: st, who } of transcriptsOf(s.id)) {
        if (now - st.mtimeMs > WINDOW && !scans.has(f)) continue
        try { for (const l of scan(f, st.size)) loops.push({ who, ...l }) } catch {}
      }
      if (loops.length) s.ext.groundhog = { loops: loops.sort((a, b) => b.count - a.count) }
      else delete s.ext.groundhog
    }
    sweep(scans)
  },
}
