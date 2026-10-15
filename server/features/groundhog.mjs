// groundhog: retry loops — the same tool call (same tool, normalized input) failing three or more times within
// WINDOW in one transcript, its own or a subagent's. A success of that same call ends the loop. Files are read like
// bugs.mjs: once from near their end, then only their appended bytes.
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

const WINDOW = 10 * 60_000, MIN = 3
const FIRST_READ = 2 * 1024 * 1024
const CHUNK = 4 * 1024 * 1024
const NOT_A_FAIL = /doesn't want to proceed|was rejected|Request interrupted|Permission for this action/
const scans = new Map() // file -> { offset, rest, dec, skip, pending: Map(tool_use_id -> call), fails: Map(key -> { call, at: [ms] }) }
const dirs = new Map()

const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }
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
      s.pending.set(b.id, { tool: b.name, ...callOf(b) })
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
    s = { offset: Math.max(0, size - FIRST_READ), rest: '', dec: new StringDecoder('utf8'), skip: size > FIRST_READ, pending: new Map(), fails: new Map() }
    scans.set(file, s)
  }
  if (size > s.offset) {
    const fd = fs.openSync(file, 'r')
    try {
      while (s.offset < size) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
        const n = fs.readSync(fd, buf, 0, buf.length, s.offset)
        if (!n) break
        s.offset += n
        const lines = (s.rest + s.dec.write(buf.subarray(0, n))).split('\n')
        s.rest = lines.pop()
        if (s.skip) { lines.shift(); s.skip = false }
        for (const l of lines) if (l) line(s, l)
      }
    } finally { fs.closeSync(fd) }
  }
  const cut = Date.now() - WINDOW, loops = []
  for (const [key, f] of s.fails) {
    if (f.at[0] < cut) f.at = f.at.filter(t => t >= cut)
    if (!f.at.length) { s.fails.delete(key); continue }
    if (f.at.length >= MIN) loops.push({ tool: f.call.tool, label: f.call.label, count: f.at.length, first: f.at[0], last: f.at.at(-1) })
  }
  return loops
}

function agentFiles(sessionDir) {
  const sub = path.join(sessionDir, 'subagents'), out = []
  const visit = d => { for (const f of ls(d)) if (f.startsWith('agent-') && f.endsWith('.jsonl')) out.push(path.join(d, f)) }
  visit(sub)
  for (const wf of ls(path.join(sub, 'workflows'))) visit(path.join(sub, 'workflows', wf))
  return out
}

export default {
  session({ id, sessionDir, file }) { dirs.set(id, { sessionDir, file }) },
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const d = dirs.get(s.id); if (!d) continue
      const loops = []
      for (const f of [d.file, ...agentFiles(d.sessionDir)]) {
        let st; try { st = fs.statSync(f) } catch { continue }
        if (now - st.mtimeMs > WINDOW && !scans.has(f)) continue
        const who = f === d.file ? s.id : path.basename(f).slice(6, -6)
        for (const l of scan(f, st.size)) loops.push({ who, ...l })
      }
      if (loops.length) s.ext.groundhog = { loops: loops.sort((a, b) => b.count - a.count) }
      else delete s.ext.groundhog
    }
    for (const f of scans.keys()) if (!fs.existsSync(f)) scans.delete(f)
  },
}
