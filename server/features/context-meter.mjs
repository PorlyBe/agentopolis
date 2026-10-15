// context-meter: how full the context window was at the last assistant turn.
// The window is 1M when the requested model id carries "[1m]" (e.g. claude-opus-5-5[1m]), else 200k.
const WINDOW_1M = 1_000_000, WINDOW_STD = 200_000

function meter({ entries }) {
  for (let i = entries.length - 1; i >= 0; i--) {
    const e = entries[i]
    if (e.type === 'system' && e.subtype === 'compact_boundary') {
      const post = e.compactMetadata?.postTokens
      if (typeof post !== 'number') return undefined
      const win = windowOf(entries, i, post)
      return { used: post, window: win, pct: post / win, compacted: true }
    }
    if (e.type !== 'assistant' || e.isApiErrorMessage) continue
    const m = e.message, u = m?.usage
    if (!u || m.model === '<synthetic>') continue
    const used = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0) + (u.output_tokens || 0)
    if (!used) continue
    const win = windowOf(entries, i, used)
    return { used, window: win, pct: used / win, model: m.model }
  }
}

function windowOf(entries, from, used) {
  for (let i = from; i >= 0; i--) {
    const r = entries[i].requestedModel
    if (r) return /\[1m\]/i.test(r) || used > WINDOW_STD ? WINDOW_1M : WINDOW_STD
  }
  return used > WINDOW_STD ? WINDOW_1M : WINDOW_STD
}

export default { session: meter, agent: meter }
