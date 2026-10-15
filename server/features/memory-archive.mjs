// memory-archive: today's writes to instruction and memory files (CLAUDE.md, CLAUDE.local.md, AGENTS.md, .claude/rules/*.md,
// .claude/skills/**/SKILL.md, a memory dir's *.md, MEMORY.md) by any session or subagent: a successful Edit, Write or
// MultiEdit. Files touched today are entered at local midnight (binary search), then only their appended bytes are read.
// snap.memoryArchive = { day, filings: [{ id, at, file, kind, tool, session, title, agent, line }] }, the last MAX.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CHUNK = 4 * 1024 * 1024, PROBE = 256 * 1024, DAY = 24 * 3600_000, MAX = 40
const TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
const HINT = /CLAUDE(\.local)?\.md|AGENTS\.md|MEMORY\.md|SKILL\.md|\/rules\/|\/memory\//
const HOME = (() => { try { return path.dirname(fs.realpathSync(path.join(os.homedir(), '.claude'))) } catch { return os.homedir() } })()

export function kindOf(p) {
  const b = path.basename(p)
  if (b === 'CLAUDE.md' || b === 'CLAUDE.local.md') return 'claude'
  if (b === 'AGENTS.md') return 'agents'
  if (b === 'MEMORY.md' || /\/memory\/[^/]+\.md$/.test(p)) return 'memory'
  if (/\/\.claude\/rules\/.+\.md$/.test(p)) return 'rules'
  if (/\/\.claude\/skills\/.+\/SKILL\.md$/.test(p)) return 'skill'
  return null
}
function shortPath(p, cwd) {
  if (/\/memory\/[^/]+\.md$/.test(p) && p.includes('/.claude/')) return '~/…/memory/' + path.basename(p)
  let s = cwd && p.startsWith(cwd + '/') ? p.slice(cwd.length + 1) : p.startsWith(HOME + '/') ? '~/' + p.slice(HOME.length + 1) : p
  const parts = s.split('/')
  if (s.length > 56 && parts.length > 4) s = [parts[0], '…', ...parts.slice(-3)].join('/')
  return s
}
export function firstLine(text) {
  let t = String(text || '').replace(/^﻿/, '')
  t = t.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const lines = t.split('\n').map(l => l.trim()).filter(l => l && l !== '---' && !/^```/.test(l))
  const l = lines.find(l => /^#{1,6}\s/.test(l)) || lines[0] || ''
  return l.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '').replace(/\s+/g, ' ').slice(0, 100)
}
const added = (name, i) => name === 'Write' ? i.content : name === 'MultiEdit' ? (i.edits || []).map(e => e.new_string).join('\n') : i.new_string

const files = new Map()     // file -> { offset, rest, dec, session, agent, pending: Map(tool_use_id -> filing), title }
const filings = new Map()   // tool_use_id -> filing
let list = [], listedAt = 0, crawling = false, crawledAt = 0, day = 0
const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const tsOf = l => { const i = l.indexOf('"timestamp":"'); return i < 0 ? 0 : Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0 }
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }

async function listFiles(today) {
  const out = []
  const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }
  const mtime = async f => { try { return (await fs.promises.stat(f)).mtimeMs } catch { return 0 } }
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const id = f.slice(0, -6), main = path.join(pd, f), m = await mtime(main)
      if (m < today - DAY) continue
      const sessionDir = path.join(pd, id)
      if (m >= today) out.push({ file: main, session: id, sessionDir })
      const sub = path.join(sessionDir, 'subagents')
      const agents = async d => { for (const x of await dir(d)) if (x.startsWith('agent-') && x.endsWith('.jsonl') && await mtime(path.join(d, x)) >= today) out.push({ file: path.join(d, x), session: id, sessionDir, agentId: x.slice(6, -6), dir: d }) }
      await agents(sub)
      for (const wf of await dir(path.join(sub, 'workflows'))) await agents(path.join(sub, 'workflows', wf))
    }
  }
  return out
}

async function seekToday(fh, size, today) {
  let lo = 0, hi = size
  while (hi - lo > PROBE) {
    const mid = Math.floor((lo + hi) / 2), buf = Buffer.alloc(Math.min(PROBE, size - mid))
    const { bytesRead } = await fh.read(buf, 0, buf.length, mid)
    const t = buf.subarray(0, bytesRead).toString('utf8').split('\n').slice(1, -1).map(tsOf).find(Boolean)
    if (!t) return lo
    if (t < today) lo = mid; else hi = mid
  }
  return lo
}

function line(s, l, today) {
  if (l.includes('"ai-title"')) { try { const e = JSON.parse(l); if (e.type === 'ai-title' && e.aiTitle) s.title = String(e.aiTitle).slice(0, 60) } catch {} return }
  if (l.includes('"tool_result"') && s.pending.size) {
    let hit = false
    for (const id of s.pending.keys()) if (l.includes(id)) { hit = true; break }
    if (!hit) return
    let e; try { e = JSON.parse(l) } catch { return }
    for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (b.type !== 'tool_result') continue
      const f = s.pending.get(b.tool_use_id); if (!f) continue
      s.pending.delete(b.tool_use_id)
      const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
      if (!b.is_error && !out.startsWith('<tool_use_error>')) filings.set(f.id, f)
    }
    return
  }
  if (!l.includes('"tool_use"') || !l.includes('"type":"assistant"') || !HINT.test(l)) return
  const at = tsOf(l); if (at < today) return
  let e; try { e = JSON.parse(l) } catch { return }
  if (e.type !== 'assistant') return
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type !== 'tool_use' || !TOOLS.has(b.name)) continue
    const p = String(b.input?.file_path || ''), kind = kindOf(p)
    if (!kind) continue
    s.pending.set(b.id, { id: b.id, at, file: shortPath(p, e.cwd), kind, tool: b.name, session: s.session, agent: s.agent, line: firstLine(added(b.name, b.input || {})), src: s })
    if (s.pending.size > 50) s.pending.delete(s.pending.keys().next().value)
  }
}

async function read(it, size, today) {
  let s = files.get(it.file)
  if (!s || size < s.offset) {
    let agent = null
    if (it.agentId) { const m = readJson(path.join(it.dir, `agent-${it.agentId}.meta.json`)) || {}; agent = { id: it.agentId, type: m.agentType === 'workflow-subagent' ? 'workflow' : m.agentType || 'agent', description: String(m.description || '').slice(0, 60) } }
    s = { offset: 0, rest: '', dec: new StringDecoder('utf8'), session: it.session, agent, pending: new Map(), title: readJson(path.join(it.sessionDir, 'custom-title.json'))?.customTitle || null, fresh: true }
    files.set(it.file, s)
  }
  if (size <= s.offset) return
  const fh = await fs.promises.open(it.file, 'r')
  try {
    if (s.fresh) { s.fresh = false; s.offset = await seekToday(fh, size, today); if (s.offset) s.skip = true }
    while (s.offset < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      const lines = (s.rest + s.dec.write(buf.subarray(0, bytesRead))).split('\n')
      s.rest = lines.pop()
      if (s.skip) { lines.shift(); s.skip = false }
      for (const l of lines) if (l) line(s, l, today)
    }
  } finally { await fh.close() }
}

async function crawl() {
  if (crawling) return
  crawling = true
  try {
    const today = midnight(), t0 = Date.now()
    if (today !== day) { day = today; filings.clear(); files.clear(); listedAt = 0 }
    if (t0 - listedAt > 20_000) { list = await listFiles(today); listedAt = t0 }
    for (const it of list) {
      let st; try { st = await fs.promises.stat(it.file) } catch { continue }
      await read(it, st.size, today)
    }
    if (filings.size > MAX * 3) for (const f of [...filings.values()].sort((a, b) => a.at - b.at).slice(0, filings.size - MAX)) filings.delete(f.id)
  } catch (e) { console.error('[memory-archive crawl]', e.message) } finally { crawling = false; crawledAt = Date.now() }
}

export default {
  snapshot(snap) {
    if (!crawling && snap.now - crawledAt > 2000) crawl()
    const titles = new Map(snap.sessions.map(s => [s.id, s.title]))
    const out = [...filings.values()].sort((a, b) => a.at - b.at).slice(-MAX)
      .map(({ src, ...f }) => ({ ...f, title: titles.get(f.session) || src.title || f.session.slice(0, 8) }))
    const d = new Date(day || midnight())
    snap.memoryArchive = { day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, filings: out }
  },
}
