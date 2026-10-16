// Read-only git and gh calls for the server features, one wrapper for all of them.
import path from 'node:path'
import { execFile } from 'node:child_process'

// -> { err, out (string | null), stderr }
export const run = (cmd, args, { timeout = 30_000, maxBuffer = 16 * 1024 * 1024 } = {}) => new Promise(resolve =>
  execFile(cmd, args, { timeout, maxBuffer }, (err, out, stderr) => resolve({ err, out: err ? null : String(out), stderr: String(stderr || '') })))

// git -C cwd ...args -> stdout, or null on any failure
export const git = (cwd, args, opts) => run('git', ['-C', cwd, ...args], opts).then(r => r.out)

const isDown = r => r.err?.code === 'ENOENT' || /auth|401/i.test(String(r.err?.message || ''))
// gh ...args -> parsed JSON, or null; onDown() is called when gh is missing or signed out (each caller keeps its own back-off)
export async function gh(args, opts, onDown) {
  const r = await run('gh', args, opts)
  if (r.err) { if (isDown(r)) onDown?.(); return null }
  try { return JSON.parse(r.out) } catch { return null }
}

// session cwd -> the main checkout of its repo (a worktree's common git dir sits in it); null until known or when none
const roots = new Map()
export function rootOf(cwd) {
  if (!roots.has(cwd)) {
    roots.set(cwd, null)
    git(cwd, ['rev-parse', '--path-format=absolute', '--git-common-dir']).then(out => roots.set(cwd, out ? path.dirname(out.trim()) : null))
  }
  return roots.get(cwd)
}
// the main checkout the most running sessions work in
export function mainRoot(sessions) {
  const count = new Map()
  for (const s of sessions) {
    if (!s.running || !s.cwd) continue
    const r = rootOf(s.cwd); if (r) count.set(r, (count.get(r) || 0) + 1)
  }
  return [...count].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
}
