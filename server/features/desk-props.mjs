// desk-props: which language/stack a session works in, from the files it (and its subagents) edit, write and read.
// Each transcript is scanned once and then only its appended bytes; scores decay per event so the desk follows current work.
import fs from 'node:fs'
import path from 'node:path'
import { StringDecoder } from 'node:string_decoder'

const CHUNK = 4 * 1024 * 1024
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
const scans = new Map() // file -> { offset, rest, dec, score: {stack: n} }

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

function scan(file) {
  let size; try { size = fs.statSync(file).size } catch { return null }
  let s = scans.get(file)
  if (!s || size < s.offset) s = { offset: 0, rest: '', dec: new StringDecoder('utf8'), score: {}, n: 0 }
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
        for (const l of lines) if (l) add(s, l)
      }
    } finally { fs.closeSync(fd) }
  }
  scans.set(file, s)
  return s
}

const ls = d => { try { return fs.readdirSync(d) } catch { return [] } }
function agentFiles(sessionDir) {
  const sub = path.join(sessionDir, 'subagents'), out = []
  const take = d => { for (const f of ls(d)) if (f.startsWith('agent-') && f.endsWith('.jsonl')) out.push(path.join(d, f)) }
  take(sub)
  for (const wf of ls(path.join(sub, 'workflows'))) take(path.join(sub, 'workflows', wf))
  return out
}

export default {
  session({ file, sessionDir }) {
    const total = {}
    let n = 0
    for (const f of [file, ...agentFiles(sessionDir)]) {
      const s = scan(f); if (!s) continue
      n += s.n
      for (const [k, v] of Object.entries(s.score)) total[k] = (total[k] || 0) + v
    }
    const sum = Object.values(total).reduce((a, b) => a + b, 0)
    if (!sum) return undefined
    const top = Object.entries(total).sort((a, b) => b[1] - a[1]).slice(0, 2)
      .map(([stack, w]) => ({ stack, w: Math.round(w * 10) / 10, share: Math.round(w / sum * 100) / 100 }))
    return { top, files: n }
  },
}
