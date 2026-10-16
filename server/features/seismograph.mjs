// seismograph: today's destructive Bash commands (rm -r on a non-temp path, force push, reset --hard, clean -fd,
// branch -D, DROP/TRUNCATE through a db client, kubectl delete, terraform destroy, docker system prune) across every
// transcript touched today, its own and its subagents'. Quoted strings and heredoc bodies are ignored for the git/rm/…
// checks; a call the user rejected is dropped. Lines come from the shared crawl of today's transcripts (server/lib/crawler.mjs). Attaches snap.seismograph = { day, events: [{ id, at, session, who, cmd, kind, size }] }.
import * as crawler from '../lib/crawler.mjs'
import { own } from '../lib/tail.mjs'

const MAX = 300
const REJECTED = /doesn't want to proceed|was rejected|Permission for this action|Request interrupted/
const TEMP = /^["']?([$_]\{?TMPDIR|\/tmp\b|\/private\/tmp\b|\/var\/folders\b|\/private\/var\/folders\b)|(^|\/)(tmp|temp|\.tmp|scratchpad)(\/|$)/i
const DB = /\b(psql|mysql|mariadb|sqlite3|mongosh|clickhouse(-client)?|cockroach|duckdb|sqlcmd|pg_ctl)\b/

const strip = cmd => cmd
  .replace(/<<-?\s*(['"]?)(\w+)\1[^\n]*\n[\s\S]*?\n\s*\2\b/g, ' ')
  .replace(/'[^']*'|"(?:\\.|[^"\\])*"/g, m => m.replace(/[\s;&|()`]/g, '_'))

// -> { kind, size 1..3 } | null
function classify(raw) {
  const cmd = String(raw || '')
  const plain = strip(cmd), vars = new Map()
  for (const m of plain.matchAll(/(?:^|[\s;&|(])(\w+)=(\S+)/g)) vars.set(m[1], /mktemp/.test(m[2]) ? '/tmp/mktemp' : m[2].replace(/^["']|["']$/g, ''))
  const expand = x => x.replace(/^(["']?)\$\{?(\w+)\}?/, (all, q, v) => vars.has(v) ? vars.get(v) : all)
  if (DB.test(plain.replace(/["'][^"']*["']/g, ' '))) {
    if (/\bDROP\s+(DATABASE|SCHEMA)\b/i.test(cmd)) return { kind: 'drop database', size: 3 }
    if (/\bDROP\s+TABLE\b/i.test(cmd)) return { kind: 'drop table', size: 2 }
    if (/\bTRUNCATE\b/i.test(cmd)) return { kind: 'truncate', size: 2 }
  }
  let best = null
  const hit = (kind, size) => { if (!best || size > best.size) best = { kind, size } }
  for (let seg of plain.split(/&&|\|\||[;|\n&()]|\$\(|`/)) {
    seg = seg.trim().replace(/^(sudo\s+|command\s+|exec\s+|\w+=\S*\s+)+/, '')
    const t = seg.split(/\s+/)
    if (t[0] === 'rm') {
      const flags = t.slice(1).filter(x => x.startsWith('-')), targets = t.slice(1).filter(x => x && !x.startsWith('-')).map(expand)
      const rec = flags.some(f => f === '--recursive' || /^-[a-zA-Z]*[rR]/.test(f))
      if (rec && targets.length && targets.some(x => !TEMP.test(x))) hit('rm -rf', 3)
    } else if (t[0] === 'git') {
      const i = t.findIndex((x, k) => k > 0 && !x.startsWith('-') && !/^-C$|^-c$/.test(t[k - 1]))
      const sub = t[i], rest = t.slice(i + 1)
      if (sub === 'push' && rest.some(x => x === '--force' || x.startsWith('--force-with-lease') || x === '--force-if-includes' || /^-[a-zA-Z]*f[a-zA-Z]*$/.test(x) || /^\+[\w/.-]/.test(x))) hit('force push', 3)
      else if (sub === 'reset' && rest.includes('--hard')) hit('reset --hard', 1)
      else if (sub === 'clean' && rest.some(x => /^-[a-zA-Z]*f/.test(x) || x === '--force') && rest.some(x => /^-[a-zA-Z]*d/.test(x))) hit('clean -fd', 2)
      else if (sub === 'branch' && rest.some(x => /^-[a-zA-Z]*D/.test(x) || x === '--delete' && rest.includes('--force'))) hit('branch -D', 2)
    } else if (t[0] === 'kubectl' && t.includes('delete')) hit('kubectl delete', 2)
    else if ((t[0] === 'terraform' || t[0] === 'tofu') && (t.includes('destroy') || (t.includes('apply') && t.includes('-destroy')))) hit('terraform destroy', 3)
    else if (t[0] === 'docker' && t[1] === 'system' && t[2] === 'prune') hit('docker prune', 2)
  }
  return best
}

const events = new Map()  // tool_use id -> event

function line(s, l, { today }) {
  const use = l.includes('"name":"Bash"'), res = events.size && l.includes('"tool_result"')
  if (!use && !res) return
  let e; try { e = JSON.parse(l) } catch { return }
  const content = Array.isArray(e.message?.content) ? e.message.content : []
  if (use && e.type === 'assistant') {
    const at = Date.parse(e.timestamp) || 0
    if (at < today) return
    for (const b of content) {
      if (b.type !== 'tool_use' || b.name !== 'Bash' || events.has(b.id)) continue
      const cmd = String(b.input?.command || ''), c = classify(cmd)
      if (c) events.set(own(b.id), { id: own(b.id), at, session: s.session, who: s.who, cmd: own(cmd.replace(/\s+/g, ' ').trim().slice(0, 200)), ...c })
    }
  } else for (const b of content) {
    if (b.type !== 'tool_result' || !events.has(b.tool_use_id)) continue
    const out = typeof b.content === 'string' ? b.content : JSON.stringify(b.content || '')
    if (REJECTED.test(out.slice(0, 300))) events.delete(b.tool_use_id)
  }
}

crawler.today.subscribe({
  files: new Map(),   // file -> { session, who }
  open: e => ({ session: e.session, who: e.agent || e.session }),
  line,
  onDay() { events.clear() },
})

export default {
  snapshot(snap) {
    crawler.today.poke(snap.now)
    if (!crawler.today.day) return
    snap.seismograph = { day: crawler.today.day, events: [...events.values()].sort((a, b) => a.at - b.at).slice(-MAX) }
  },
}
