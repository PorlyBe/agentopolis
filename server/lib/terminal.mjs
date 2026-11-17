// Which terminal app a Claude process runs in, read from the environment it inherited: an Orca terminal exports
// ORCA_TERMINAL_HANDLE, a herdr pane exports HERDR_PANE_ID. A process's environment never changes, so it is cached per pid.
import path from 'node:path'
import { execFile } from 'node:child_process'

export const ORCA = process.env.ORCA_CLI_BIN_DIR ? path.join(process.env.ORCA_CLI_BIN_DIR, 'orca') : 'orca'
export const HERDR = 'herdr'

// -> { app: 'Orca' | 'herdr', id, bundle? } or null. herdr runs inside another terminal app; on macOS its bundle id
// (inherited as __CFBundleIdentifier) lets /api/focus bring that window to the front, since the page sits in a browser.
export function parseTerminal(env) {
  const orca = env.match(/ORCA_TERMINAL_HANDLE=(term_[0-9a-f-]+)/)?.[1]
  if (orca) return { app: 'Orca', id: orca }
  const herdr = env.match(/HERDR_PANE_ID=([\w:-]+)/)?.[1]
  if (!herdr) return null
  const bundle = env.match(/__CFBundleIdentifier=([\w.-]+)/)?.[1]
  return bundle ? { app: 'herdr', id: herdr, bundle } : { app: 'herdr', id: herdr }
}

// The herdr TUI client's tty ('/dev/ttys012'), taken from `ps`: a herdr process with a tty that isn't the server.
export function herdrClientTty(psOut) {
  for (const line of psOut.split('\n')) {
    const m = line.match(/^\s*(ttys?\w+)\s+(\S*herdr)(\s.*)?$/)
    if (m && !/^\s*server\b/.test(m[3] ?? '')) return `/dev/${m[1]}`
  }
  return null
}

// iTerm2 can select the tab whose session owns a tty; any other app is only brought to the front.
const ITERM_SELECT = `on run argv
  tell application id "com.googlecode.iterm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if tty of s is (item 1 of argv) then
            select w
            select t
            select s
          end if
        end repeat
      end repeat
    end repeat
    activate
  end tell
end run`

// Bring the window showing herdr to the front (macOS only; best effort, errors are ignored).
export function raiseHerdr(bundle) {
  if (process.platform !== 'darwin' || !bundle) return
  if (bundle !== 'com.googlecode.iterm2') return execFile('open', ['-b', bundle], () => {})
  execFile('ps', ['-axo', 'tty=,command='], (err, out) => {
    const tty = err ? null : herdrClientTty(out)
    if (tty) execFile('osascript', ['-e', ITERM_SELECT, tty], () => {})
    else execFile('open', ['-b', bundle], () => {})
  })
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
