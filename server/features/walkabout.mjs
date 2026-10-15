// walkabout: the newest prompt the user typed into a session (not a tool result, task notification, command, meta entry
// or compaction summary): when it was sent and its first words.
const INJECTED = /^\s*<(task-notification|command-name|command-message|local-command|bash-input|bash-stdout|bash-stderr|system-reminder|user-prompt-submit-hook)/

function textOf(e) {
  const c = e.message?.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c) || c.some(b => b.type === 'tool_result')) return null
  return c.filter(b => b.type === 'text').map(b => b.text).join(' ')
}

function walkabout({ entries }) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type !== 'user' || e.isMeta || e.isCompactSummary || e.isSidechain || e.isVisibleInTranscriptOnly) continue
    if (e.origin && e.origin.kind !== 'human') continue
    const raw = textOf(e)
    if (!raw?.trim() || INJECTED.test(raw)) continue
    const text = raw.replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content>/g, ' 📋 ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
    if (!text) continue
    return { at: Date.parse(e.timestamp) || 0, text: text.slice(0, 40) + (text.length > 40 ? '…' : '') }
  }
  return undefined
}

export default { session: walkabout }
