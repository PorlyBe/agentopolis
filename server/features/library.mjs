// library: the skills loaded in the current turn (a Skill call, or a slash command's "Base directory for this skill"
// entry) and the turn's last web lookup (WebSearch query or WebFetch host), for the floor's bookshelf and window.
const BASE = /^Base directory for this skill: (\S+)/
const blocks = e => Array.isArray(e.message?.content) ? e.message.content : [{ type: 'text', text: String(e.message?.content ?? '') }]
const isPrompt = e => e.type === 'user' && !e.isMeta && !e.isCompactSummary && blocks(e).some(b => b.type === 'text' && b.text?.trim() && !BASE.test(b.text))
const host = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return String(u || '').slice(0, 40) } }

function library({ entries }) {
  let from = 0
  for (let i = entries.length - 1; i >= 0; i--) if (isPrompt(entries[i])) { from = i; break }
  const skills = [], seen = new Set()
  let web = null
  const add = (name, at) => { name = String(name || '').replace(/^\/+/, '').trim(); const key = name.split(':').pop(); if (name && !seen.has(key)) { seen.add(key); skills.push({ name: name.slice(0, 60), at }) } }
  for (let i = from; i < entries.length; i++) {
    const e = entries[i], at = Date.parse(e.timestamp) || 0
    for (const b of blocks(e)) {
      if (e.type === 'assistant' && b.type === 'tool_use') {
        if (b.name === 'Skill') add(b.input?.skill, at)
        else if (b.name === 'WebSearch') web = { kind: 'search', q: String(b.input?.query || '').slice(0, 80), at }
        else if (b.name === 'WebFetch') web = { kind: 'fetch', q: host(b.input?.url), at }
      } else if (e.type === 'user' && b.type === 'text') {
        const m = b.text?.match(BASE)
        if (m) add(m[1].split('/').filter(Boolean).pop(), at)
      }
    }
  }
  if (!skills.length && !web) return undefined
  return { skills: skills.slice(-6), web }
}

export default { session: library, agent: library }
