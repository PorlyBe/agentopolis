// friday-drinks: the week's tally for the roof chalkboard — PRs merged (trophies.mjs), commits and workflow runs
// since Monday 00:00 local, and today's cheapest and priciest session (cost-jar). Commits come from a slow incremental
// crawl of the week's transcripts: each successful `git commit` Bash call, once per printed hash (or per call when -q).
// Workflow runs are the <session>/workflows/<run>.json files stamped this week. Attaches snap.fridayDrinks.
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'
import { titleOf } from './tv.mjs'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CHUNK = 4 * 1024 * 1024, EVERY = 60_000
const COMMIT = /(?:^|[;&|(\n])\s*git(?:\s+-C\s+\S+)?\s+commit\b/
const COMMIT_OUT = /^\[[^\]\n]+? ([0-9a-f]{7,40})\] /gm
const files = new Map()      // transcript -> { offset, rest, dec, pending }
const runs = new Map()       // workflow meta file -> start time
const hashes = new Map()     // commit hash (or tool call id) -> time
let crawling = false, crawledAt = 0, ready = false, week = 0

const monday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - (d.getDay() + 6) % 7); return d.getTime() }
const tsOf = l => { const i = l.indexOf('"timestamp":"'); return i < 0 ? 0 : Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0 }
const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }
const stat = async f => { try { return await fs.promises.stat(f) } catch { return null } }

function line(s, l, since) {
  const bash = l.includes('"type":"assistant"') && l.includes('git') && l.includes('commit')
  const result = s.pending.size && l.includes('"tool_result"')
  if (!bash && !result) return
  const t = tsOf(l)
  if (t && t < since) return
  let e; try { e = JSON.parse(l) } catch { return }
  const content = Array.isArray(e.message?.content) ? e.message.content : []
  if (e.type === 'assistant') for (const b of content) {
    if (b.type === 'tool_use' && b.name === 'Bash' && COMMIT.test(String(b.input?.command || ''))) s.pending.add(b.id)
  } else if (e.type === 'user') for (const b of content) {
    if (b.type !== 'tool_result' || !s.pending.delete(b.tool_use_id) || b.is_error) continue
    const out = typeof b.content === 'string' ? b.content : (b.content || []).map(x => x.text || '').join('\n')
    if (/nothing to commit|no changes added/.test(out)) continue
    const found = [...out.matchAll(COMMIT_OUT)].map(m => m[1])
    for (const k of found.length ? found : [b.tool_use_id]) if (!hashes.has(k)) hashes.set(k, t || Date.now())
  }
}

async function read(file, size, since) {
  let s = files.get(file)
  if (!s || size < s.offset) { s = { offset: 0, rest: '', dec: new StringDecoder('utf8'), pending: new Set() }; files.set(file, s) }
  if (size <= s.offset) return
  const fh = await fs.promises.open(file, 'r')
  try {
    while (s.offset < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      const lines = (s.rest + s.dec.write(buf.subarray(0, bytesRead))).split('\n')
      s.rest = lines.pop()
      for (const l of lines) if (l) line(s, l, since)
    }
  } finally { await fh.close() }
}

async function runStart(file) {
  if (runs.has(file)) return
  try {
    const fh = await fs.promises.open(file, 'r'), buf = Buffer.alloc(300)
    try { await fh.read(buf, 0, 300, 0) } finally { await fh.close() }
    runs.set(file, tsOf(buf.toString('utf8')))
  } catch {}
}

async function crawl() {
  crawling = true
  try {
    const since = monday()
    if (since !== week) { week = since; files.clear(); hashes.clear() }
    for (const proj of await dir(PROJECTS)) {
      const pd = path.join(PROJECTS, proj)
      for (const f of await dir(pd)) {
        if (!f.endsWith('.jsonl')) continue
        const main = path.join(pd, f), st = await stat(main)
        if (!st || st.mtimeMs < since) continue
        await read(main, st.size, since)
        const sd = path.join(pd, f.slice(0, -6))
        for (const w of await dir(path.join(sd, 'workflows'))) if (w.endsWith('.json')) await runStart(path.join(sd, 'workflows', w))
        const sub = path.join(sd, 'subagents'), agentDirs = [sub, ...(await dir(path.join(sub, 'workflows'))).map(w => path.join(sub, 'workflows', w))]
        for (const d of agentDirs) for (const a of await dir(d)) {
          if (!a.startsWith('agent-') || !a.endsWith('.jsonl')) continue
          const af = path.join(d, a), ast = await stat(af)
          if (ast && ast.mtimeMs >= since) await read(af, ast.size, since)
        }
      }
    }
    ready = true
  } catch (e) { console.error('[friday-drinks crawl]', e.message) } finally { crawling = false; crawledAt = Date.now() }
}

export default {
  snapshot(snap) {
    if (!crawling && snap.now - crawledAt > EVERY) crawl()
    snap.fridayDrinks = { toJSON: () => tally(snap) }   // trophies.mjs runs after this feature: read it at send time
  },
}

function tally(snap) {
  const since = monday()
  const merged = (snap.trophies?.items || []).filter(i => i.state === 'MERGED' && (i.mergedAt || i.at) >= since).length
  const spend = Object.entries(snap.cost?.bySession || {}).filter(([, usd]) => usd > 0).sort((a, b) => a[1] - b[1])
  const who = ([id, usd]) => ({ id, usd, title: snap.sessions.find(s => s.id === id)?.title || titleOf(id) || id.slice(0, 8) })
  return {
    ready, since, merged, gh: snap.trophies?.gh ?? null,
    commits: [...hashes.values()].filter(t => t >= since).length,
    workflows: [...runs.values()].filter(t => t >= since).length,
    cheapest: spend.length ? who(spend[0]) : null,
    priciest: spend.length > 1 ? who(spend.at(-1)) : null,
  }
}
