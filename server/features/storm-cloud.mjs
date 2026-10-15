// storm-cloud: how grumpy the user's last few prompts to a session read — "wtf", "ugh", "!!!", "no no", ALL CAPS, 😡 —
// as a level 0..3 and the one word that set it off (never the message). A thanks/great/perfect/nice clears it.
// Genuine prompts are found with walkabout.mjs's rules. Time-based clearing (~20 min calm) is the client's.
const INJECTED = /^\s*<(task-notification|command-name|command-message|local-command|bash-input|bash-stdout|bash-stderr|system-reminder|user-prompt-submit-hook)/
const LOOK = 6

function textOf(e) {
  const c = e.message?.content
  if (typeof c === 'string') return c
  if (!Array.isArray(c) || c.some(b => b.type === 'tool_result')) return null
  return c.filter(b => b.type === 'text').map(b => b.text).join(' ')
}

const CALM = /\b(thanks?|thank you|thx|ty|great|perfect|love it|nice|awesome|brilliant|amazing|excellent)\b|🙏|❤️|🎉|😍/i
const SIGNS = [
  [/\b(wtf|wth|ffs)\b/i, 3, m => m.toLowerCase()],
  [/\bf+u+c+k+\w*|\bsh[i1]t+\b|\bdamn+(it)?\b/i, 3, m => m[0].toLowerCase() + '***'],
  [/😡|🤬|😠|💢|😤/u, 3, m => m],
  [/\b(doesn'?t|does not|didn'?t|still (doesn'?t|not)|not) work(ing)?\b|\bstill (broken|failing)\b/i, 2, m => m.toLowerCase()],
  [/\bno[,.!\s]+no\b/i, 2, () => 'no no'],
  [/\bugh+\b|\bargh+\b|\bsigh\b/i, 2, m => m.toLowerCase()],
  [/\bstop\b/i, 1.5, () => 'stop'],
  [/\bwhy\b/i, 1, () => 'why'],
  [/[!?]*![!?]*!{2,}|\?!{2,}/, 0.8, () => '!!!'],
]

function caps(t) {
  for (const s of t.split(/[.!?\n]+/)) {
    const words = s.match(/\b[A-Za-z]{2,}\b/g) || []
    if (words.length >= 4 && words.join('').length >= 12 && words.every(w => w === w.toUpperCase())) return true
  }
  return false
}

function grade(raw) {
  const t = raw.replace(/<pasted_content[^>]*>[\s\S]*?<\/pasted_content>/g, ' ').replace(/```[\s\S]*?```/g, ' ').replace(/`[^`]*`/g, ' ')
    .replace(/^\s*>.*$/gm, ' ').replace(/<[^>]+>/g, ' ').replace(/https?:\/\/\S+/g, ' ')
  let score = 0, word = null, top = 0
  const hit = (w, s) => { score += s; if (s > top) { top = s; word = w } }
  for (const [re, s, label] of SIGNS) { const m = t.match(re); if (m) hit(label(m[0]), s) }
  if (caps(t)) hit('ALL CAPS', 2.5)
  if ((t.match(/\bno\b/gi) || []).length >= 3) hit('no no no', 1)
  return { score, word, calm: CALM.test(t) }
}

function stormCloud({ entries }) {
  const prompts = []
  for (let i = entries.length - 1; i >= 0 && prompts.length < LOOK; i--) {
    const e = entries[i]
    if (e.type !== 'user' || e.isMeta || e.isCompactSummary || e.isSidechain || e.isVisibleInTranscriptOnly) continue
    if (e.origin && e.origin.kind !== 'human') continue
    const raw = textOf(e)
    if (!raw?.trim() || INJECTED.test(raw)) continue
    prompts.push({ at: Date.parse(e.timestamp) || 0, ...grade(raw) })
  }
  if (!prompts.length) return undefined
  const calmAt = prompts.findIndex(p => p.calm && p.score < 2.5)
  if (calmAt === 0) {
    const was = storm(prompts.slice(1))
    return { level: 0, clear: { at: prompts[0].at, was: was?.level || 0, word: was?.word || null } }
  }
  return storm(calmAt < 0 ? prompts : prompts.slice(0, calmAt))
}

function storm(prompts) {
  let score = 0, word = null, at = 0, since = 0, top = 0
  for (const [i, p] of prompts.entries()) {
    if (p.calm && p.score < 2.5) break
    if (!p.score) continue
    const w = p.score * [1, 0.7, 0.5, 0.35, 0.25, 0.2][i]
    score += w
    if (w > top) { top = w; word = p.word }
    at ||= p.at; since = p.at
  }
  const level = score >= 4 ? 3 : score >= 2.2 ? 2 : score >= 1 ? 1 : 0
  return level ? { level, score: Math.round(score * 10) / 10, word, at, since } : undefined
}

export default { session: stormCloud }
