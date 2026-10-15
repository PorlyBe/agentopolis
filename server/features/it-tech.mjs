// it-tech: MCP/tool servers that are down, per transcript. A tool_result from an mcp__ tool reading like an outage
// ("not connected", "Connection closed", ECONNREFUSED, "MCP server ...", "No such tool available") marks that server
// down from the first failure of the streak; the next clean result from the same server clears it.
const DOWN = /not connected|MCP server|Connection closed|ECONNREFUSED|No such tool available/i
const SIGN_IN = /authori[sz]|authenticat|sign[ -]?in|log[ -]?in|oauth|needs?-auth/i   // a sign-in prompt is not an outage
const serverOf = name => String(name).startsWith('mcp__') ? String(name).split('__')[1] || name : null
const textOf = b => typeof b.content === 'string' ? b.content : Array.isArray(b.content) ? b.content.map(x => x.text || '').join(' ') : ''

function outages({ entries }) {
  const uses = new Map(), down = new Map()
  for (const e of entries) {
    const at = Date.parse(e.timestamp) || 0
    for (const b of Array.isArray(e.message?.content) ? e.message.content : []) {
      if (b.type === 'tool_use') { uses.set(b.id, b.name); continue }
      if (b.type !== 'tool_result' || !uses.has(b.tool_use_id)) continue
      const tool = uses.get(b.tool_use_id), text = textOf(b)
      const missing = /No such tool available:?\s*([\w-]+)/.exec(text)
      const server = serverOf(tool) || (b.is_error && missing ? serverOf(missing[1]) || missing[1] : null)
      if (!server) continue
      if ((b.is_error || text.length < 600) && DOWN.test(text) && !SIGN_IN.test(text)) {
        const d = down.get(server)
        down.set(server, { server, tool, text: text.replace(/<\/?tool_use_error>/g, '').trim().slice(0, 300), since: d?.since ?? at, at, n: (d?.n || 0) + 1 })
      } else if (!b.is_error) down.delete(server)
    }
  }
  return down.size ? [...down.values()] : undefined
}

export default { session: outages, agent: outages }
