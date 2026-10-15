// refactor-crane: how big each live session's change is — its PR's additions/deletions (snap.street, matched like
// my-prs: branch == head, or the PR it opened), else its branch against the merge base with origin's default branch
// (git diff --shortstat, working tree included; read-only, one git call at a time, cached a minute per cwd+branch).
// snap.cranes = [{ sessionId, add, del, pr, title, url, src: 'pr' | 'branch' }] for changes over MIN lines.
import { execFile } from 'node:child_process'

const MIN = 1000, TTL = 60_000
const BASE_BRANCH = /^(trunk|main|master|develop|HEAD)$/
const diffs = new Map()   // cwd|branch -> { add, del, at }
let busy = false

const git = (cwd, args) => new Promise(resolve => execFile('git', ['-C', cwd, ...args], { timeout: 10_000 }, (err, out) => resolve(err ? null : String(out).trim())))
async function measure(cwd, branch) {
  const key = cwd + '|' + branch
  busy = true
  try {
    const base = (await git(cwd, ['symbolic-ref', '--short', 'refs/remotes/origin/HEAD'])) || 'origin/main'
    const mb = await git(cwd, ['merge-base', 'HEAD', base])
    const s = mb ? await git(cwd, ['diff', '--shortstat', mb]) : null
    diffs.set(key, { add: +(s?.match(/(\d+) insertion/)?.[1] || 0), del: +(s?.match(/(\d+) deletion/)?.[1] || 0), at: Date.now() })
  } finally { busy = false }
}

export default {
  snapshot(snap) {
    const st = snap.street || {}, mine = st.mine || [], post = new Map((st.post || []).map(p => [p.n, p]))
    const out = []
    for (const s of snap.sessions) {
      const kit = s.ext?.['pr-celebration']?.pr
      const p = mine.find(p => s.branch && s.branch === p.headRefName) || mine.find(p => kit?.n === p.number && (!kit.repo || !st.repo || kit.repo === st.repo))
      const size = p && post.get(p.number)
      if (size && size.additions != null) {
        if (size.additions + size.deletions > MIN) out.push({ sessionId: s.id, add: size.additions, del: size.deletions, pr: p.number, title: p.title, url: p.url, src: 'pr' })
        continue
      }
      if (!s.cwd || !s.branch || BASE_BRANCH.test(s.branch) || s.running === false) continue
      const d = diffs.get(s.cwd + '|' + s.branch)
      if ((!d || Date.now() - d.at > TTL) && !busy) measure(s.cwd, s.branch).catch(() => {})
      if (d && d.add + d.del > MIN) out.push({ sessionId: s.id, add: d.add, del: d.del, pr: null, title: s.branch, url: null, src: 'branch' })
    }
    snap.cranes = out
  },
}
