// readable-monitors: what the newest tool call would print on a tiny terminal — the real command, path or pattern, and for
// an Edit/Write the first changed line — for app/tower/features/readable-monitors.js. Each line is at most 120 chars.
import os from 'node:os'

const HOME = os.homedir()
const MAX = 120
const one = s => String(s ?? '').split('\n').map(l => l.trim()).find(Boolean) || ''
const lines = s => String(s ?? '').split('\n').map(l => l.trim()).filter(Boolean)
const clip = s => { s = String(s).replaceAll(HOME, '~').replace(/\s+/g, ' '); return s.length > MAX ? s.slice(0, MAX - 1) + '…' : s }

function linesOf(name, i) {
  switch (name) {
    case 'Bash': return ['$ ' + one(i.command).replace(/^(cd \S+ (&&|;) *)+/, '')]
    case 'Edit': case 'MultiEdit': {
      const e = i.edits?.[0] || i, o = lines(e.old_string), n = lines(e.new_string)
      let k = 0; while (k < o.length && k < n.length && o[k] === n[k]) k++
      return [`vi ${i.file_path || ''}`, ...(o[k] ? ['-' + o[k]] : []), ...(n[k] ? ['+' + n[k]] : [])]
    }
    case 'Write': return [`vi ${i.file_path || ''}`, ...(i.content ? ['+' + one(i.content)] : [])]
    case 'Read': return [`cat ${i.file_path || ''}`]
    case 'Grep': return [`rg ${i.pattern || ''}${i.path ? ' ' + i.path : ''}`]
    case 'Glob': return [`ls ${i.pattern || ''}`]
    case 'WebFetch': return [`curl ${i.url || ''}`]
    case 'WebSearch': return [`? ${i.query || ''}`]
    case 'Agent': case 'Task': return [`spawn ${i.subagent_type || 'agent'}`, one(i.description)]
    default: return null
  }
}

function monitor({ entries }) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type !== 'assistant' && e.type !== 'user') continue
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) return undefined
    const use = [...e.message.content].reverse().find(b => b.type === 'tool_use')
    const lines = use && linesOf(use.name, use.input || {})
    return lines ? { id: use.id, tool: use.name, lines: lines.filter(Boolean).map(clip) } : undefined
  }
  return undefined
}

export default { session: monitor, agent: monitor }
