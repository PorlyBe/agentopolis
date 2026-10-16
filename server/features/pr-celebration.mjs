// pr-celebration: the PRs a session opened ('pr-link' entries) and its successful git commits.
// pr-link entries sit anywhere in the transcript, so each file is read whole once and then only its appended bytes,
// off the request path (server/lib/history.mjs). State per file: { prs: Map(repo#n -> pr), latest, commits, lastCommitAt, title, pending: Map(id -> ts) }
import * as history from '../lib/history.mjs'
import { own } from '../lib/tail.mjs'
import { transcriptsOf } from '../lib/transcripts.mjs'

const TITLE = /gh\s+pr\s+create[\s\S]*?--title[=\s]+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/
const COMMIT = /\bgit\b(?:\s+-C\s+\S+)?\s+commit\b/

function line(s, l) {
  if (l.includes('"pr-link"')) {
    let e; try { e = JSON.parse(l) } catch { return }
    if (e.type !== 'pr-link' || !e.prNumber) return
    const key = `${e.prRepository}#${e.prNumber}`
    if (s.prs.has(key)) return
    const pr = { n: e.prNumber, url: e.prUrl, repo: e.prRepository, title: s.title, at: Date.parse(e.timestamp) || 0 }
    s.title = null; s.prs.set(own(key), pr); s.latest = pr
  } else if (l.includes('"tool_use"') && (l.includes('gh pr create') || l.includes('commit'))) {
    let e; try { e = JSON.parse(l) } catch { return }
    for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
      const cmd = b.type === 'tool_use' && b.name === 'Bash' ? String(b.input?.command || '') : ''
      const t = cmd.match(TITLE)
      if (t) s.title = own((t[1] ?? t[2]).replace(/\\(.)/g, '$1').slice(0, 140))
      if (COMMIT.test(cmd)) s.pending.set(own(b.id), Date.parse(e.timestamp) || 0)
    }
  } else if (s.pending.size && l.includes('"tool_result"')) {
    let e; try { e = JSON.parse(l) } catch { return }
    for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (b.type !== 'tool_result' || !s.pending.has(b.tool_use_id)) continue
      const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
      if (!b.is_error && !/nothing to commit|no changes added/.test(out)) { s.commits++; s.lastCommitAt = Date.parse(e.timestamp) || s.pending.get(b.tool_use_id) }
      s.pending.delete(b.tool_use_id)
    }
  }
}

const sub = { files: new Map(), main: true, open: () => ({ prs: new Map(), latest: null, commits: 0, lastCommitAt: 0, title: null, pending: new Map() }), line }
history.subscribe(sub)

export default {
  snapshot(snap) {
    const now = Date.now()
    for (const x of snap.sessions) {
      const t = transcriptsOf(x.id)[0]
      const s = t && history.want(t, now) ? sub.files.get(t.file) : null
      if (s && (s.latest || s.commits)) x.ext['pr-celebration'] = { pr: s.latest, prCount: s.prs.size, commits: s.commits, lastCommitAt: s.lastCommitAt }
      else delete x.ext['pr-celebration']
    }
  },
}
