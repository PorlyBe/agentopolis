// Which terminal app a Claude process runs in, read from the environment it inherited: an Orca terminal exports
// ORCA_TERMINAL_HANDLE, a herdr pane exports HERDR_PANE_ID. A process's environment never changes, so it is cached per pid.
import path from 'node:path'
import { execFile } from 'node:child_process'

export const ORCA = process.env.ORCA_CLI_BIN_DIR ? path.join(process.env.ORCA_CLI_BIN_DIR, 'orca') : 'orca'
export const HERDR = 'herdr'

// -> { app: 'Orca' | 'herdr', id } or null
export function parseTerminal(env) {
  const orca = env.match(/ORCA_TERMINAL_HANDLE=(term_[0-9a-f-]+)/)?.[1]
  if (orca) return { app: 'Orca', id: orca }
  const herdr = env.match(/HERDR_PANE_ID=([\w:-]+)/)?.[1]
  return herdr ? { app: 'herdr', id: herdr } : null
}

const byPid = new Map()
export const terminalOf = pid => byPid.has(pid) ? Promise.resolve(byPid.get(pid)) : new Promise(resolve => {
  execFile('ps', ['eww', '-o', 'command=', '-p', String(pid)], (err, out) => {
    const t = err ? null : parseTerminal(out)
    if (!err) byPid.set(pid, t)
    resolve(t)
  })
})
// drop pids that are no longer running, so a reused pid is looked up afresh
export function forgetExcept(livePids) {
  for (const pid of byPid.keys()) if (!livePids.has(pid)) byPid.delete(pid)
}
