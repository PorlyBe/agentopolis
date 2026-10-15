// window-cleaner: the transcript tail's last formatter / auto-fix runs (Bash), for the gondola on the floor's facade.
const FMT = /\bcargo\s+(?:\+\S+\s+)?fmt\b|\bprettier\b|\bpnpm\s+(?:run\s+)?format\b|\beslint\b[^|;&]*--fix\b|\bbiome\s+format\b|\bcargo\s+clippy\b[^|;&]*--fix\b|\bruff\s+format\b/
const blocks = e => Array.isArray(e.message?.content) ? e.message.content : []

function cleaner({ entries }) {
  const runs = []
  for (const e of entries) {
    if (e.type !== 'assistant') continue
    for (const b of blocks(e)) {
      if (b.type !== 'tool_use' || b.name !== 'Bash') continue
      const m = String(b.input?.command || '').match(FMT)
      if (m) runs.push({ at: Date.parse(e.timestamp) || 0, cmd: m[0].replace(/\s+/g, ' ').slice(0, 40) })
    }
  }
  return runs.length ? { runs: runs.slice(-3) } : undefined
}

export default { session: cleaner, agent: cleaner }
