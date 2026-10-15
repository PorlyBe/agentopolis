// update-check: tells you when github.com/PorlyBe/agentopolis main has commits this checkout lacks. Notify only:
// nothing is pulled or run. Checks only a git checkout whose origin is that repo, at most every 6 h (plus "Check now"),
// with one unauthenticated GET to the GitHub compare API. server.mjs wires it up; --demo never loads it.
import { execFile } from 'node:child_process'

const REPO = 'PorlyBe/agentopolis', BRANCH = 'main'
const EVERY_MS = 6 * 60 * 60_000, MANUAL_GAP_MS = 60_000, MAX_COMMITS = 20
const ORIGIN = /^(?:https:\/\/github\.com\/|git@github\.com:|ssh:\/\/git@github\.com\/)porlybe\/agentopolis(?:\.git)?\/?$/i

const git = (root, ...args) => new Promise(resolve =>
  execFile('git', ['-C', root, ...args], { timeout: 5000 }, (err, out) => resolve(err ? null : out.trim())))

export function updateChecker(root, enabled) {
  let last = { status: 'checking', ahead: 0, commits: [], checkedAt: null, branch: null }, inFlight = null, lastManual = 0

  async function check() {
    const head = await git(root, 'rev-parse', 'HEAD')
    const branch = await git(root, 'rev-parse', '--abbrev-ref', 'HEAD')
    const base = { ahead: 0, commits: [], checkedAt: Date.now(), branch }
    if (!/^[0-9a-f]{40}$/.test(head ?? '')) return { ...base, status: 'not-git' }
    if (!ORIGIN.test(await git(root, 'remote', 'get-url', 'origin') ?? '')) return { ...base, status: 'not-official' }
    try {
      const r = await fetch(`https://api.github.com/repos/${REPO}/compare/${head}...${BRANCH}`, {
        credentials: 'omit', signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/vnd.github+json', 'user-agent': 'agentopolis-update-check' },
      })
      if (r.status === 404) return { ...base, status: 'diverged' }   // this HEAD isn't on GitHub, e.g. local commits
      if (!r.ok) return { ...base, status: 'error', error: r.status === 403 || r.status === 429 ? 'rate-limited' : `HTTP ${r.status}` }
      const j = await r.json()
      const commits = (j.commits || []).slice(-MAX_COMMITS).reverse().map(c => ({
        sha: c.sha.slice(0, 7), message: String(c.commit?.message ?? '').split('\n')[0].slice(0, 200), date: c.commit?.committer?.date ?? c.commit?.author?.date ?? null,
      }))
      const status = j.status === 'ahead' ? 'behind' : j.status === 'diverged' ? 'diverged' : 'current'
      return { ...base, status, ahead: status === 'current' ? 0 : j.ahead_by || 0, commits: status === 'current' ? [] : commits, head: j.commits?.at(-1)?.sha ?? null }
    } catch (e) {
      return { ...base, status: 'error', error: e.name === 'TimeoutError' ? 'timed out' : 'offline' }
    }
  }
  const run = () => inFlight ??= check().then(s => { last = s; inFlight = null; return s })

  return {
    // the snapshot's view; also starts a background check when the last one is older than 6 h
    state() {
      if (!enabled()) return { status: 'off', ahead: 0, commits: [], checkedAt: last.checkedAt, branch: last.branch }
      if (!last.checkedAt || Date.now() - last.checkedAt > EVERY_MS) run()
      return last
    },
    async checkNow() {
      if (!enabled()) return { ok: false, state: this.state() }
      if (Date.now() - lastManual < MANUAL_GAP_MS) return { ok: false, retryIn: Math.ceil((lastManual + MANUAL_GAP_MS - Date.now()) / 1000), state: last }
      lastManual = Date.now()
      return { ok: true, state: await run() }
    },
  }
}
