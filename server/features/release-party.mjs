// release-party: the repo's newest published releases, from one read-only gh api call every 5 min (drafts left out).
// The repo comes from github-street's part of this snapshot (it sorts first).
import { execFile } from 'node:child_process'

const TTL = 5 * 60_000, RETRY = 60_000
const state = { repo: null, list: [], at: 0, tried: 0, busy: false }

const gh = args => new Promise(resolve => execFile('gh', args, { timeout: 30_000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
  if (err) return resolve(null)
  try { resolve(JSON.parse(out)) } catch { resolve(null) }
}))

async function refresh(repo) {
  state.busy = true; state.tried = Date.now()
  try {
    const j = await gh(['api', `repos/${repo}/releases?per_page=8`])
    if (!Array.isArray(j)) return
    state.list = j.filter(r => !r.draft && r.published_at).map(r => ({
      tag: r.tag_name, name: r.name || r.tag_name, author: r.author?.login || null, publishedAt: Date.parse(r.published_at),
      prerelease: !!r.prerelease, url: r.html_url,
    })).sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 5)
    state.at = Date.now()
  } finally { state.busy = false }
}

export default {
  snapshot(snap) {
    const repo = snap.street?.repo || null
    if (repo !== state.repo) { state.repo = repo; state.list = []; state.at = 0; state.tried = 0 }
    if (repo && !state.busy && Date.now() - state.at > TTL && Date.now() - state.tried > RETRY) refresh(repo).catch(() => {})
    snap.releases = { repo, at: state.at, list: state.list }
  },
}
