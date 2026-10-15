// courtroom: a session's review on trial. A trial opens on a review Skill call (or /review-like slash command), or an
// Agent / Workflow whose description says review; it stays open while that skill's turn runs and until every review
// agent it launched (background ones report through a task-notification) has answered, and closes with the findings
// as charges: ReportFindings' findings, else table rows / numbered items of the result text. Transcripts are read like
// groundhog.mjs: once from near their end, then only their appended bytes. Attached as session.ext.courtroom.
import fs from 'node:fs'
import { StringDecoder } from 'node:string_decoder'

const FIRST_READ = 2 * 1024 * 1024, CHUNK = 4 * 1024 * 1024, STALE_MS = 3 * 3600_000, KEEP_MS = 10 * 60_000, MAX_CHARGES = 5
const SKILL = /review|devils-advocate|code-review|security-review/i, DESC = /review/i, NOT_A_REVIEW = /^\W*(fix|apply|address|rebase|merge|build|implement)\b/i
const scans = new Map(), files = new Map()

const blocks = e => Array.isArray(e.message?.content) ? e.message.content : [{ type: 'text', text: String(e.message?.content ?? '') }]
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => b?.text || '').join('\n') : ''
const clip = (s, n = 60) => { s = s.replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s }
const plain = s => String(s).replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\*\*|__|`|~~/g, '').replace(/(^|\s)[*_]([^*_\s][^*_]*)[*_](?=\s|$|[.,;:])/g, '$1$2').replace(/<[^>]+>/g, '').trim()
const MINOR = /\b(minor|nit|nitpick|low|info|trivial|style)\b/i

// findings out of a review's text: a markdown table's rows (its finding/issue column), else numbered items
function charges(text) {
  const out = [], lines = String(text || '').split('\n')
  for (let i = 0; i + 1 < lines.length; i++) {
    if (!/^\s*\|/.test(lines[i]) || !/^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) continue
    const cells = l => l.trim().replace(/^\||\|$/g, '').split('|').map(c => plain(c))
    const head = cells(lines[i]).map(h => h.toLowerCase())
    let col = head.findIndex(h => /finding|issue|problem|summary|title|description|what/.test(h))
    for (let j = i + 2; j < lines.length && /^\s*\|/.test(lines[j]); j++) {
      const row = cells(lines[j]); if (!row.some(Boolean)) continue
      const pick = col >= 0 ? row[col] : row.slice().sort((a, b) => b.length - a.length)[0]
      if (pick) out.push({ text: clip(pick.split(/(?<=[.!?])\s/)[0]), minor: MINOR.test(row.join(' ')) && !/\b(major|high|critical|blocker)\b/i.test(row.join(' ')) })
    }
    if (out.length) return out
  }
  for (const l of lines) {
    const m = l.match(/^\s*(?:#{1,4}\s*)?(?:\*\*)?(?:\d+[.)]|finding\s*\d+:?)\s*(?:\*\*)?\s*(.{6,})/i)
    if (m) out.push({ text: clip(plain(m[1]).split(/(?<=[.!?])\s/)[0]), minor: MINOR.test(l) })
  }
  return out
}

function verdictOf(t) {
  let list = t.findings ?? []
  for (const r of t.results) { if (list.length) break; list = charges(r) }
  if (!list.length && t.closing) list = charges(t.closing)
  const guilty = list.some(c => !c.minor), said = list.slice(0, MAX_CHARGES).map(c => c.text)
  return guilty ? { verdict: 'guilty', count: list.length, nits: 0, charges: said } : { verdict: 'acquitted', count: 0, nits: list.length, charges: said }
}

function open(s, kind, name, at, id) {
  s.trial = { id, kind, name: clip(name, 48), start: at, end: null, pending: new Set(), jurors: [], results: [], findings: null, closing: null, turnDone: false }
  return s.trial
}
function close(t, at) { if (t && !t.end) { Object.assign(t, verdictOf(t)); t.end = at } }
function settle(t, at) { if (t && !t.end && !t.pending.size && (t.kind !== 'skill' || t.turnDone)) close(t, at) }

function line(s, l) {
  const tn = l.includes('task-notification')
  if (!tn && !/"type":"(user|assistant)"/.test(l)) return
  let e; try { e = JSON.parse(l) } catch { return }
  const at = Date.parse(e.timestamp) || Date.now(), t = s.trial?.end ? null : s.trial
  // a background agent's answer: a user turn, or queued while the session was busy (queue-operation / attachment)
  if (tn && t) {
    const raw = [e.content, e.attachment?.prompt, ...blocks(e).map(b => b.type === 'text' ? b.text : '')].filter(x => typeof x === 'string').join('\n')
    for (const [, n] of raw.matchAll(/<task-notification>([\s\S]*?)(?:<\/task-notification>|$)/g)) {
      const id = n.match(/<tool-use-id>([^<]+)</)?.[1], result = n.match(/<result>([\s\S]*?)(?:<\/result>|$)/)?.[1], status = n.match(/<status>([^<]+)</)?.[1]
      if (!id || !t.pending.has(id) || (result == null && status === 'completed')) continue
      t.pending.delete(id); t.results.push((result || '').slice(0, 40_000)); settle(t, at)
    }
    if (e.type === 'user') return
  }
  if (e.type !== 'assistant' && e.type !== 'user') return
  if (e.type === 'user') {
    const raw = typeof e.message?.content === 'string' ? e.message.content : null
    for (const b of blocks(e)) {
      if (b.type === 'tool_result' && t?.pending.has(b.tool_use_id)) {
        const txt = textOf(b.content)
        if (/Async agent launched|running in the background|launched successfully/i.test(txt.slice(0, 300))) continue
        t.pending.delete(b.tool_use_id); t.results.push(txt.slice(0, 40_000)); settle(t, at)
      } else if (b.type === 'text' && !e.isMeta) {
        const txt = b.text || ''
        if (txt.includes('<task-notification>')) continue
        const cmd = txt.match(/<command-name>\/?([^<]+)<\/command-name>/)
        if (cmd && SKILL.test(cmd[1])) { if (t) close(t, at); open(s, 'skill', cmd[1], at, 'cmd:' + at); continue }
        if (t && raw != null && txt.trim() && !/^<(system-reminder|local-command|command-)/.test(txt.trim())) { t.turnDone = true; if (!t.pending.size) close(t, at) }
      }
    }
    return
  }
  let tt = t
  for (const b of blocks(e)) {
    if (b.type !== 'tool_use') continue
    const i = b.input || {}
    if (b.name === 'Skill' && SKILL.test(String(i.skill || ''))) { if (tt) close(tt, at); tt = open(s, 'skill', String(i.skill), at, b.id); continue }
    const wf = b.name === 'Workflow', script = String(i.script || ''), wfName = wf ? script.match(/name:\s*['"`]([^'"`]+)/)?.[1] || '' : ''
    const desc = wf ? script.match(/description:\s*['"`]([^'"`]{0,200})/)?.[1] || wfName : String(i.description || '')
    const review = ((wf && SKILL.test(wfName)) || DESC.test(desc.slice(0, wf ? 60 : 200))) && !NOT_A_REVIEW.test(desc) && !/\bfix\w*\b.{0,40}\bfindings?\b/i.test(desc)
    if ((b.name === 'Agent' || b.name === 'Task' || wf) && (review || tt?.kind === 'skill')) {
      if (!tt) tt = open(s, b.name === 'Workflow' ? 'workflow' : 'agent', desc || b.name, at, b.id)
      tt.pending.add(b.id); tt.jurors.push(clip(desc || b.name, 40))
    }
    if (b.name === 'ReportFindings' && tt && Array.isArray(i.findings)) {
      tt.findings = i.findings.map(f => ({ text: clip(plain(f.short_summary || f.summary || '')), minor: false })).filter(f => f.text)
    }
  }
  const r = e.message?.stop_reason
  if (tt?.kind === 'skill' && (r === 'end_turn' || r === 'stop_sequence')) {
    const txt = blocks(e).filter(b => b.type === 'text').map(b => b.text).join('\n')
    if (txt.trim()) tt.closing = txt.slice(0, 40_000)
    tt.turnDone = true; settle(tt, at)
  }
}

function scan(file, size) {
  let s = scans.get(file)
  if (!s || size < s.offset) {
    s = { offset: Math.max(0, size - FIRST_READ), rest: '', dec: new StringDecoder('utf8'), skip: size > FIRST_READ, trial: null }
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
  return s.trial
}

export default {
  session({ id, file }) { files.set(id, file) },
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const f = files.get(s.id); if (!f) continue
      let st; try { st = fs.statSync(f) } catch { continue }
      const t = scan(f, st.size)
      if (!t || (t.end ? now - t.end > KEEP_MS : now - t.start > STALE_MS)) { delete s.ext.courtroom; continue }
      s.ext.courtroom = { id: t.id, kind: t.kind, name: t.name, start: t.start, end: t.end, jurors: t.jurors.slice(0, 6),
        ...(t.end ? { verdict: t.verdict, count: t.count, nits: t.nits, charges: t.charges } : {}) }
    }
    for (const f of scans.keys()) if (!fs.existsSync(f)) scans.delete(f)
  },
}
