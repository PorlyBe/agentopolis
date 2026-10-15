// printer-jam: the transcript's last tool_use when it has no tool_result yet, for foreground tools that can stall
// silently (Bash without run_in_background, WebFetch/WebSearch, a foreground Agent). The result is cached until the
// transcript changes, so its mtime is the time it went silent; the client decides when that counts as a jam.
const TOOLS = new Set(['Bash', 'WebFetch', 'WebSearch', 'Agent', 'Task'])

function jam({ entries, stat }) {
  const done = new Set()
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i], blocks = Array.isArray(e.message?.content) ? e.message.content : []
    if (e.type === 'user') { for (const b of blocks) if (b.type === 'tool_result') done.add(b.tool_use_id); continue }
    if (e.type !== 'assistant') continue
    const use = [...blocks].reverse().find(b => b.type === 'tool_use')
    if (!use) { if (blocks.some(b => b.type === 'text' && b.text?.trim())) return undefined; continue }
    if (done.has(use.id) || !TOOLS.has(use.name)) return undefined
    const i0 = use.input || {}
    if (i0.run_in_background) return undefined
    const text = String(i0.command || i0.url || i0.query || i0.description || i0.prompt || '').slice(0, 600)
    return { id: use.id, tool: use.name, text, description: i0.command ? String(i0.description || '').slice(0, 160) : '', at: Date.parse(e.timestamp) || stat.mtimeMs, mtime: stat.mtimeMs }
  }
  return undefined
}

export default { session: jam, agent: jam }
