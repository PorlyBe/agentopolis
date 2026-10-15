// phone-booth: when the transcript tail last drove a browser (Chrome / browser MCP tools, or Bash running shot.mjs,
// playwright or headless Chrome) and the last site host it named, for the floor's phone booth.
const TOOL = /^mcp__(claude-in-chrome|Claude_Browser|playwright|puppeteer|chrome|browser)[^_]*__|browser/i
const CMD = /tools\/shot\.mjs|\bplaywright\b|--headless\b|headless[-_ ]?chrom/i
const URL_RE = /\b(?:https?|file):\/\/[^\s"'`<>)]+/
const blocks = e => Array.isArray(e.message?.content) ? e.message.content : []
const host = u => { try { const x = new URL(u); return x.protocol === 'file:' ? 'file' : x.host.replace(/^www\./, '') } catch { return null } }

function booth({ entries }) {
  let at = 0, site = null, tool = null
  for (const e of entries) {
    if (e.type !== 'assistant') continue
    for (const b of blocks(e)) {
      if (b.type !== 'tool_use') continue
      const i = b.input || {}, cmd = b.name === 'Bash' ? String(i.command || '') : ''
      if (!(b.name !== 'Bash' && TOOL.test(b.name)) && !(cmd && CMD.test(cmd))) continue
      at = Date.parse(e.timestamp) || at
      tool = b.name === 'Bash' ? (cmd.match(CMD)?.[0] || 'Bash') : b.name.split('__').pop()
      const u = typeof i.url === 'string' ? i.url : (cmd || JSON.stringify(i)).match(URL_RE)?.[0]
      const h = u && host(/^[a-z]+:\/\//.test(u) ? u : 'https://' + u)
      if (h) site = h
    }
  }
  return at ? { at, host: site, tool } : undefined
}

export default { session: booth, agent: booth }
