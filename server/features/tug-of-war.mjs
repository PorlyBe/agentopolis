// tug-of-war: a git merge/rebase/cherry-pick/pull/stash pop whose Bash output says CONFLICT, in a session's transcript
// or one of its agents'. It holds until a later git command in that same transcript gets through: a --continue or
// --abort without a new CONFLICT, a commit, a clean status, or a merge/rebase/pull that merges cleanly. Files are
// read like groundhog.mjs: once from near their end, then only their appended bytes.
import { readSync, tailState, own } from '../lib/tail.mjs'
import { transcriptsOf, sweep } from '../lib/transcripts.mjs'

const FIRST_READ = 2 * 1024 * 1024
const STALE = 3 * 3600_000, SHOW_END = 90_000, QUIET = 3 * 3600_000
const START = /\bgit\b[^\n]*?\b(merge|rebase|cherry-pick|pull|stash\s+(?:pop|apply)|revert|am)\b/
const GIT = /(^|[\s;&|(])git\s/
const RESOLVE = /\bgit\b[^\n]*?\b(?:rebase|merge|cherry-pick|revert|am)\s+--(continue|abort|skip|quit)\b|\bgit\b[^\n]*?\bcommit\b/
const scans = new Map()   // file -> { offset, rest, skip, pending: Map(id -> { cmd, at }), open, ended }

const textOf = b => (typeof b.content === 'string' ? b.content : (Array.isArray(b.content) ? b.content.map(x => x.text || '').join('\n') : '')).replace(/\r/g, '\n')
const CONFLICT = /^CONFLICT \(|^(?:error: )?[Cc]ould not apply [0-9a-f]{7}|^(?:UU|AA|DU|UD) \S|^hint: Resolve all conflicts/m
const exitCode = out => Number(out.match(/^Exit code (\d+)/)?.[1] || 0)

function filesOf(out) {
  const files = []
  for (const m of out.matchAll(/^CONFLICT \([^)]*\): (?:Merge conflict in (\S+)|(\S+) deleted in|[^\n]*?\b(?:in|of) (\S+?)\.?$)/gm)) files.push(m[1] || m[2] || m[3])
  for (const m of out.matchAll(/^(?:UU|AA|DU|UD) (\S+)/gm)) files.push(m[1])
  return [...new Set(files.filter(Boolean))]
}

function line(s, l) {
  const use = l.includes('"tool_use"'), res = l.includes('"tool_result"')
  if (!use && !res) return
  let e; try { e = JSON.parse(l) } catch { return }
  const at = Date.parse(e.timestamp) || 0
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type === 'tool_use' && e.type === 'assistant' && b.name === 'Bash') {
      const cmd = String(b.input?.command || '')
      if (!GIT.test(cmd)) continue
      s.pending.set(own(b.id), { cmd: own(cmd), at })
      if (s.pending.size > 100) s.pending.delete(s.pending.keys().next().value)
    } else if (b.type === 'tool_result') {
      const call = s.pending.get(b.tool_use_id); if (!call) continue
      s.pending.delete(b.tool_use_id)
      const out = textOf(b), ok = !b.is_error && !exitCode(out)
      if (CONFLICT.test(out) && (START.test(call.cmd) || RESOLVE.test(call.cmd))) {
        const files = filesOf(out).map(own)
        s.open = { since: s.open?.since ?? at, at, files: files.length ? files : (s.open?.files || []), cmd: call.cmd.replace(/\s+/g, ' ').trim().slice(0, 160), op: call.cmd.match(START)?.[1]?.replace(/\s+/g, ' ') || s.open?.op || 'merge' }
        s.ended = null
        continue
      }
      if (!s.open || !ok) continue
      const clean = /nothing to commit|working tree clean/.test(out) && !/Unmerged paths|both modified|rebase in progress|You have unmerged/.test(out)
      const how = RESOLVE.test(call.cmd) ? (call.cmd.match(RESOLVE)?.[1] === 'abort' ? 'aborted' : 'resolved')
        : START.test(call.cmd) ? 'resolved' : clean ? 'resolved' : null
      if (!how) continue
      s.ended = { ...s.open, end: at, how }
      s.open = null
    }
  }
}

function scan(file, size) {
  let s = scans.get(file)
  if (!s || size < s.offset) {
    s = tailState(Math.max(0, size - FIRST_READ), { pending: new Map(), open: null, ended: null })
    scans.set(file, s)
  }
  readSync(s, file, size, l => line(s, l))
  const now = Date.now()
  if (s.open && now - s.open.at > STALE) s.open = null
  if (s.ended && now - s.ended.end > SHOW_END) s.ended = null
  return s
}

export default {
  serves: ['tug-of-war'],   // only its own tower feature reads it
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const open = [], ended = []
      for (const { file: f, stat: st, who } of transcriptsOf(s.id)) {
        if (now - st.mtimeMs > QUIET && !scans.has(f)) continue
        let r; try { r = scan(f, st.size) } catch { continue }
        if (r.open) open.push({ who, ...r.open })
        if (r.ended) ended.push({ who, ...r.ended })
      }
      if (open.length || ended.length) s.ext['tug-of-war'] = { open, ended }
      else delete s.ext['tug-of-war']
    }
    sweep(scans)
  },
}
