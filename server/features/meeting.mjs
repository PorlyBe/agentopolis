// meeting: does a session's last turn end by asking the user something? Only the closing line counts, so a
// question buried mid-reply doesn't send it to the meeting room; AskUserQuestion is read from the tool itself.
function session({ entries }) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type === 'user') return undefined
    if (e.type !== 'assistant') continue
    const r = e.message?.stop_reason
    if (r !== 'end_turn' && r !== 'stop_sequence') return undefined
    const content = e.message.content
    const text = typeof content === 'string' ? content : (content || []).filter(b => b.type === 'text').map(b => b.text).join('\n')
    const last = text.trim().split('\n').pop().replace(/[*_`)\]\s]+$/, '')
    return last.endsWith('?') ? { asking: true } : undefined
  }
  return undefined
}

export default { session }
