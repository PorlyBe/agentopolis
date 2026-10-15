// uniforms: the language a session or subagent works in, from the file extension of its latest Edit/Write and its
// latest Read. Files are read like groundhog.mjs: once from near their end, then only their appended bytes.
import fs from 'node:fs'
import { StringDecoder } from 'node:string_decoder'

const FIRST_READ = 1024 * 1024, CHUNK = 4 * 1024 * 1024, KEEP = 400
const EDIT = /^(Edit|Write|MultiEdit|NotebookEdit)$/
const LANGS = [
  [/\.rs$/, 'rust'], [/\.(ts|tsx|js|jsx|mjs|cjs|mts|cts)$/, 'ts'], [/\.(py|pyi|ipynb)$/, 'python'], [/\.go$/, 'go'],
  [/\.swift$/, 'swift'], [/\.(kt|kts)$/, 'kotlin'], [/\.sql$/, 'sql'], [/\.(md|mdx|markdown|rst|txt)$/, 'docs'],
  [/\.(css|scss|sass|less)$/, 'css'], [/\.(sh|bash|zsh|fish|ps1)$/, 'shell'],
]
export const langOf = p => { const f = String(p || '').toLowerCase(); for (const [re, l] of LANGS) if (re.test(f)) return l; return null }

const scans = new Map() // file -> { offset, rest, dec, skip, edit, read }

function line(s, l) {
  if (!l.includes('"tool_use"') || !l.includes('_path"')) return
  let e; try { e = JSON.parse(l) } catch { return }
  if (e.type !== 'assistant') return
  const at = Date.parse(e.timestamp) || 0
  for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
    if (b.type !== 'tool_use') continue
    const lang = langOf(b.input?.file_path || b.input?.notebook_path); if (!lang) continue
    if (EDIT.test(b.name)) s.edit = { lang, at }
    else if (b.name === 'Read') s.read = { lang, at }
  }
}

function uniforms({ file, stat }) {
  const size = stat.size
  let s = scans.get(file)
  if (!s || size < s.offset) s = { offset: Math.max(0, size - FIRST_READ), rest: '', dec: new StringDecoder('utf8'), skip: size > FIRST_READ, edit: null, read: null }
  scans.delete(file); scans.set(file, s)
  if (scans.size > KEEP) scans.delete(scans.keys().next().value)
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
        if (s.skip) { lines.shift(); s.skip = false }
        for (const l of lines) if (l) line(s, l)
      }
    } finally { fs.closeSync(fd) }
  }
  if (!s.edit && !s.read) return undefined
  return { ...(s.edit && { edit: s.edit }), ...(s.read && { read: s.read }) }
}

export default { session: uniforms, agent: uniforms }
