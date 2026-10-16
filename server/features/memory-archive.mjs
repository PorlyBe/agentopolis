// memory-archive: today's writes to instruction and memory files (CLAUDE.md, CLAUDE.local.md, AGENTS.md, .claude/rules/*.md,
// .claude/skills/**/SKILL.md, a memory dir's *.md, MEMORY.md) by any session or subagent: a successful Edit, Write or
// MultiEdit. Lines come from the shared crawl of today's transcripts (server/lib/crawler.mjs).
// snap.memoryArchive = { day, filings: [{ id, at, file, kind, tool, session, title, agent, line }] }, the last MAX.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import * as crawler from '../lib/crawler.mjs'
import { own, tsOf } from '../lib/tail.mjs'
import { midnight } from '../lib/transcripts.mjs'

const MAX = 40
const TOOLS = new Set(['Edit', 'Write', 'MultiEdit'])
const HINT = /CLAUDE(\.local)?\.md|AGENTS\.md|MEMORY\.md|SKILL\.md|\/rules\/|\/memory\//
const HOME = (() => { try { return path.dirname(fs.realpathSync(path.join(os.homedir(), '.claude'))) } catch { return os.homedir() } })()

function kindOf(p) {
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
function firstLine(text) {
  let t = String(text || '').replace(/^﻿/, '')
  t = t.replace(/^---\n[\s\S]*?\n---\n?/, '')
  const lines = t.split('\n').map(l => l.trim()).filter(l => l && l !== '---' && !/^```/.test(l))
  const l = lines.find(l => /^#{1,6}\s/.test(l)) || lines[0] || ''
  return l.replace(/^#{1,6}\s+/, '').replace(/^[-*]\s+/, '').replace(/\s+/g, ' ').slice(0, 100)
}
const added = (name, i) => name === 'Write' ? i.content : name === 'MultiEdit' ? (i.edits || []).map(e => e.new_string).join('\n') : i.new_string

const filings = new Map()   // tool_use_id -> filing
const readJson = f => { try { return JSON.parse(fs.readFileSync(f, 'utf8')) } catch { return null } }

function line(s, l, { today }) {
  if (l.includes('"ai-title"')) { try { const e = JSON.parse(l); if (e.type === 'ai-title' && e.aiTitle) s.title = own(String(e.aiTitle).slice(0, 60)) } catch {} return }
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
    s.pending.set(own(b.id), { id: own(b.id), at, file: own(shortPath(p, e.cwd)), kind, tool: b.name, session: s.session, agent: s.agent, line: own(firstLine(added(b.name, b.input || {}))), src: s })
    if (s.pending.size > 50) s.pending.delete(s.pending.keys().next().value)
  }
}

crawler.today.subscribe({
  files: new Map(),   // file -> { session, agent, pending: Map(tool_use_id -> filing), title }
  open(e) {
    let agent = null
    if (e.agent) { const m = readJson(e.file.replace(/\.jsonl$/, '.meta.json')) || {}; agent = { id: e.agent, type: m.agentType === 'workflow-subagent' ? 'workflow' : m.agentType || 'agent', description: String(m.description || '').slice(0, 60) } }
    return { session: e.session, agent, pending: new Map(), title: readJson(path.join(e.sessionDir, 'custom-title.json'))?.customTitle || null }
  },
  line,
  after() { if (filings.size > MAX * 3) for (const f of [...filings.values()].sort((a, b) => a.at - b.at).slice(0, filings.size - MAX)) filings.delete(f.id) },
  onDay() { filings.clear() },
})

export default {
  serves: ['memory-archive'],   // only its own tower feature reads it
  snapshot(snap) {
    crawler.today.poke(snap.now)
    const titles = new Map(snap.sessions.map(s => [s.id, s.title]))
    const out = [...filings.values()].sort((a, b) => a.at - b.at).slice(-MAX)
      .map(({ src, ...f }) => ({ ...f, title: titles.get(f.session) || src.title || f.session.slice(0, 8) }))
    const d = new Date(crawler.today.day || midnight())
    snap.memoryArchive = { day: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, filings: out }
  },
}
