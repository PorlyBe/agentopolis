// commit-stamps: every git commit and push a session (or one of its agents) ran through Bash. A commit is the
// "[branch sha] subject" line git prints; without it (git commit -q) an exit-0 commit still counts, its subject read
// from -m or the heredoc. A push is each "old..new  src -> dst" ref line that was not rejected or deleted.
// snap.commits = { sessionId: [{ id, t, k: 'c'|'a'|'p', branch, sha, subject }] } over the last KEEP_MS.
import path from 'node:path'

const KEEP_MS = 12 * 3600_000, MAX = 80
const bySession = new Map()   // session id -> Map(id -> event)
const GIT = '(?:^|[;&|(\\n]|\\b(?:then|do|time)\\s)\\s*git(?:\\s+(?:-C\\s+\\S+|-c\\s+\\S+|--[\\w-]+(?:=\\S+)?))*\\s+'
const COMMIT_CMD = new RegExp(GIT + 'commit\\b', 'm'), PUSH_CMD = new RegExp(GIT + 'push\\b', 'm')
const BRACKET = /^\[(.+?) ([0-9a-f]{7,40})\] (.+)$/gm
const REF = /^\s*([+*=!-]?)\s*(\[[^\]]+\]|[0-9a-f]{6,40}(?:\.\.\.?)[0-9a-f]{6,40})\s+(\S+)\s+->\s+(\S+)/gm
const TRACK = /branch '([^'\n]+)' set up to track '(?:origin\/)?([^'\n]+)'/g
const textOf = c => typeof c === 'string' ? c : Array.isArray(c) ? c.map(b => typeof b === 'string' ? b : b?.type === 'text' ? b.text : '').join('\n') : ''
const clip = s => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, 100)

function subjectOf(cmd) {
  const at = cmd.slice(cmd.search(COMMIT_CMD))
  const m = at.match(/\s(?:-[a-zA-Z]*m\s*|--message[= ])(["'])((?:\\.|(?!\1)[\s\S])*?)\1/) || at.match(/^[^\n]*?\s-[a-zA-Z]*F\s*-[^\n]*<<-?\s*['"]?(\w+)['"]?\n([^\n]*)/)
  if (m) return clip(m[2].split('\n')[0].replace(/\\(["'\\])/g, '$1'))
  return at.match(/\s-[a-zA-Z]*m\s*([^\s"';&|]+)/)?.[1] || null
}

function scan(ctx) {
  const session = ctx.kind === 'session' ? ctx.id : path.basename(ctx.sessionDir)
  const agent = ctx.kind === 'agent' ? ctx.id : null
  const cut = ctx.now - KEEP_MS, uses = new Map()
  let ev = bySession.get(session)
  for (const e of ctx.entries) {
    const c = e.message?.content
    if (!Array.isArray(c)) continue
    if (e.type === 'assistant') {
      for (const b of c) if (b.type === 'tool_use' && b.name === 'Bash' && typeof b.input?.command === 'string') {
        const cmd = b.input.command
        if (COMMIT_CMD.test(cmd) || PUSH_CMD.test(cmd)) uses.set(b.id, cmd)
      }
      continue
    }
    if (e.type !== 'user') continue
    const t = Date.parse(e.timestamp) || 0
    if (t < cut) continue
    for (const b of c) {
      if (b.type !== 'tool_result' || !uses.has(b.tool_use_id)) continue
      const cmd = uses.get(b.tool_use_id), r = e.toolUseResult
      let text = textOf(b.content)
      if (r && typeof r === 'object') for (const k of ['stdout', 'stderr']) if (typeof r[k] === 'string' && r[k] && !text.includes(r[k].slice(0, 80))) text += '\n' + r[k]
      if (text.length > 400_000) continue
      const add = (k, id, o, i) => { (ev ||= new Map()).set(id, { id, t: t + i, k, agent, ...o }) }
      let i = 0
      if (COMMIT_CMD.test(cmd)) {
        const amend = /--amend\b/.test(cmd)
        let any = false
        for (const m of text.matchAll(BRACKET)) {
          const branch = m[1].replace(/ \(root-commit\)$/, '').replace(/^detached HEAD$/, '') || null
          add(amend ? 'a' : 'c', `${b.tool_use_id}:${m[2]}`, { branch, sha: m[2].slice(0, 9), subject: clip(m[3]) }, i++); any = true
        }
        if (!any && !b.is_error && !amend && !/nothing to commit|no changes added/.test(text)) add('c', `${b.tool_use_id}:c`, { branch: null, sha: null, subject: subjectOf(cmd) }, i++)
      }
      if (PUSH_CMD.test(cmd)) {
        const branches = new Set()
        for (const m of text.matchAll(REF)) {
          if (m[1] === '!' || m[1] === '-' || /rejected|deleted|new tag|up to date/.test(m[2])) continue
          if (/^refs\/tags\//.test(m[4])) continue
          branches.add(m[4].replace(/^refs\/heads\//, ''))
        }
        if (!branches.size && !b.is_error) for (const m of text.matchAll(TRACK)) branches.add(m[2])
        for (const br of branches) add('p', `${b.tool_use_id}:p:${br}`, { branch: br }, i++)
      }
    }
  }
  if (ev) bySession.set(session, ev)
}

export default {
  session(ctx) { scan(ctx) },
  agent(ctx) { scan(ctx) },
  snapshot(snap) {
    const out = {}
    for (const s of snap.sessions) {
      const ev = bySession.get(s.id); if (!ev) continue
      for (const [id, e] of ev) if (snap.now - e.t > KEEP_MS) ev.delete(id)
      if (ev.size) out[s.id] = [...ev.values()].sort((a, b) => a.t - b.t).slice(-MAX)
    }
    snap.commits = out
  },
}
