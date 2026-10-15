// pr-celebration: the PRs a session opened ('pr-link' entries) and its successful git commits.
// pr-link entries sit anywhere in the transcript, so each file is scanned once and then only its appended bytes.
import fs from 'node:fs'
import { StringDecoder } from 'node:string_decoder'

const scans = new Map() // file -> { offset, rest, prs: Map(n -> pr), latest, commits, lastCommitAt, title, pending: Map(id -> ts) }
const CHUNK = 4 * 1024 * 1024
const TITLE = /gh\s+pr\s+create[\s\S]*?--title[=\s]+(?:"((?:[^"\\]|\\.)*)"|'([^']*)')/
const COMMIT = /\bgit\b(?:\s+-C\s+\S+)?\s+commit\b/

function line(s, l) {
  if (l.includes('"pr-link"')) {
    let e; try { e = JSON.parse(l) } catch { return }
    if (e.type !== 'pr-link' || !e.prNumber) return
    const key = `${e.prRepository}#${e.prNumber}`
    if (s.prs.has(key)) return
    const pr = { n: e.prNumber, url: e.prUrl, repo: e.prRepository, title: s.title, at: Date.parse(e.timestamp) || 0 }
    s.title = null; s.prs.set(key, pr); s.latest = pr
  } else if (l.includes('"tool_use"') && (l.includes('gh pr create') || l.includes('commit'))) {
    let e; try { e = JSON.parse(l) } catch { return }
    for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
      const cmd = b.type === 'tool_use' && b.name === 'Bash' ? String(b.input?.command || '') : ''
      const t = cmd.match(TITLE)
      if (t) s.title = (t[1] ?? t[2]).replace(/\\(.)/g, '$1').slice(0, 140)
      if (COMMIT.test(cmd)) s.pending.set(b.id, Date.parse(e.timestamp) || 0)
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

function scan(file, size) {
  let s = scans.get(file)
  if (!s || size < s.offset) s = { offset: 0, rest: '', prs: new Map(), latest: null, commits: 0, lastCommitAt: 0, title: null, pending: new Map(), dec: new StringDecoder('utf8') }
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
        for (const l of lines) if (l) line(s, l)
      }
    } finally { fs.closeSync(fd) }
  }
  scans.set(file, s)
  return s
}

export default {
  session({ file, stat }) {
    const s = scan(file, stat.size)
    if (!s.latest && !s.commits) return undefined
    return { pr: s.latest, prCount: s.prs.size, commits: s.commits, lastCommitAt: s.lastCommitAt }
  },
}
