// desk-props: which language/stack a session works in, from the files it (and its subagents) edit, write and read.
// Each transcript is read whole once, then only its appended bytes, off the request path (server/lib/history.mjs);
// scores decay per event so the desk follows current work. A session's props appear once all its transcripts are read.
import * as history from '../lib/history.mjs'
import { transcriptsOf } from '../lib/transcripts.mjs'

const DECAY = 0.997
const WEIGHT = { Edit: 3, MultiEdit: 3, Write: 3, NotebookEdit: 3, Read: 1 }
const USE = /"name":"(Edit|MultiEdit|Write|NotebookEdit|Read)","input":\{[^{}]*?"(?:file_path|notebook_path)":"((?:[^"\\]|\\.)*)"/g
const RULES = [
  [/\/\.github\/workflows\/|\.ya?ml$|(^|\/)Dockerfile$|\.dockerfile$/i, 'ci'],
  [/\.rs$|(^|\/)Cargo\.(toml|lock)$/, 'rust'],
  [/\.(tsx|jsx)$/, 'react'],
  [/\.(ts|mts|cts)$/, 'ts'],
  [/\.(js|mjs|cjs)$/, 'js'],
  [/\.swift$|(^|\/)Package\.swift$|\.(xcconfig|plist|entitlements)$/, 'swift'],
  [/\.(kt|kts|gradle)$|(^|\/)AndroidManifest\.xml$/, 'kotlin'],
  [/\.(tf|tfvars|hcl)$/, 'terraform'],
  [/\.(py|pyi)$/, 'python'],
  [/\.go$|(^|\/)go\.(mod|sum)$/, 'go'],
  [/\.sql$|\/migrations?\//, 'sql'],
  [/\.(css|scss|sass|less)$/, 'css'],
  [/\.(md|mdx|rst|txt)$/, 'docs'],
  [/\.(sh|bash|zsh|fish|ps1|cmd|bat)$/, 'shell'],
]
const SKIP = /\/\.claude\/(?!worktrees\/)|^\/(private\/)?tmp\/|\/node_modules\//

const stackOf = p => { for (const [re, s] of RULES) if (re.test(p)) return s; return null }

function add(s, l) {
  if (!l.includes('_path"')) return
  USE.lastIndex = 0
  for (let m; (m = USE.exec(l));) {
    const p = m[2].replace(/\\(.)/g, '$1')
    if (SKIP.test(p)) continue
    const st = stackOf(p); if (!st) continue
    for (const k in s.score) s.score[k] *= DECAY
    s.score[st] = (s.score[st] || 0) + WEIGHT[m[1]]
    s.n++
  }
}

const sub = { files: new Map(), open: () => ({ score: {}, n: 0 }), line: add }   // file -> { score: {stack: n}, n }
history.subscribe(sub)
const done = new Map()   // session id -> { at: readers' progress, value }

function props(files) {
  const total = {}
  let n = 0
  for (const { file } of files) {
    const s = sub.files.get(file); if (!s) continue
    n += s.n
    for (const [k, v] of Object.entries(s.score)) total[k] = (total[k] || 0) + v
  }
  const sum = Object.values(total).reduce((a, b) => a + b, 0)
  if (!sum) return undefined
  const top = Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 2)
    .map(([stack, w]) => ({ stack, w: Math.round(w * 10) / 10, share: Math.round(w / sum * 100) / 100 }))
  return { top, files: n }
}

export default {
  snapshot(snap) {
    const now = Date.now()
    for (const s of snap.sessions) {
      const files = transcriptsOf(s.id)
      let ready = true
      for (const t of files) if (!history.want(t, now)) ready = false
      let d = done.get(s.id)
      if (ready) {
        const at = history.progress(files)
        if (!d || d.at !== at) done.set(s.id, d = { at, value: props(files) })
      }
      if (d?.value) s.ext['desk-props'] = d.value
      else delete s.ext['desk-props']
    }
    for (const id of done.keys()) if (!snap.sessions.some(s => s.id === id)) done.delete(id)
  },
}
