// waiting-line: what a session waiting on the user last said to him — its AskUserQuestion question, or the closing words
// of its last reply — about 120 characters, for the queue outside the CEO office. Only waiting/attention sessions keep it.
const MAX = 120
const clean = t => String(t ?? '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>|]+/g, '').replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim()
function cut(t) {
  if (t.length <= MAX) return t
  const q = t.match(/[^.!?]*\?/g)?.pop()?.trim()
  if (q && q.length <= MAX && q.length > 12) return q
  return t.slice(0, MAX - 1).replace(/\s+\S*$/, '') + '…'
}
function closing(text) {
  const paras = String(text).split(/\n\s*\n/).map(clean).filter(Boolean)
  if (!paras.length) return null
  let last = paras.at(-1)
  if (last.length < 25 && paras.length > 1 && !last.endsWith('?')) last = paras.at(-2) + ' ' + last
  return cut(last)
}

function session({ entries }) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type === 'user') {
      const c = e.message?.content
      if (Array.isArray(c) && c.every(b => b.type === 'tool_result')) continue
      return undefined
    }
    if (e.type !== 'assistant') continue
    const blocks = Array.isArray(e.message?.content) ? e.message.content : [{ type: 'text', text: String(e.message?.content ?? '') }]
    const ask = blocks.find(b => b.type === 'tool_use' && b.name === 'AskUserQuestion')
    if (ask) {
      const qs = ask.input?.questions || []
      const q = clean(qs[0]?.question || qs[0]?.header || '')
      return q ? { text: cut(q), kind: 'question', more: Math.max(0, qs.length - 1) } : undefined
    }
    const text = blocks.filter(b => b.type === 'text' && b.text?.trim()).map(b => b.text).join('\n\n')
    if (text) { const t = closing(text); return t ? { text: t, kind: 'reply' } : undefined }
  }
  return undefined
}

export default {
  session,
  snapshot(snap) {
    for (const s of snap.sessions) if (s.ext?.['waiting-line'] && s.state !== 'waiting' && s.state !== 'attention') {
      const { ['waiting-line']: _, ...rest } = s.ext   // ext is the parse cache's own object: never mutate it
      s.ext = rest
    }
  },
}
