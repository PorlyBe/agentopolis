// cost-jar: today's (local day) estimated spend per session, from the usage on each assistant message.
// One incremental crawl of every transcript touched today; a file first seen mid-day is entered by binary search
// at local midnight, then only its appended bytes are read. Each message counts once (message id, else requestId).
// Attaches session.ext['cost-jar'] = { usdToday, tokensToday, byModel } and snap.cost (the TV shows the total).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { StringDecoder } from 'node:string_decoder'

const PROJECTS = path.join(os.homedir(), '.claude', 'projects')
const CHUNK = 4 * 1024 * 1024, PROBE = 256 * 1024, DAY = 24 * 3600_000

// USD per million tokens at Anthropic's published list prices — ESTIMATES, not a bill (no plan discounts, no batch).
// [input, output, cache write 5m, cache write 1h, cache read]; long: a pricier tier when the prompt exceeds `above` tokens.
// First match wins; ids carry dashes (claude-opus-4-5, claude-sonnet-4-5-20250929), a "[1m]" suffix is stripped.
const PRICES = [
  [/fable-5-1|mythos-5-1/, 'Fable 5.1', [10, 50, 12.5, 20, 0.25]],
  [/fable|mythos/, 'Fable 5', [10, 50, 12.5, 20, 1]],
  [/opus-5-5/, 'Opus 5.5', [4, 20, 5, 8, 0.2]],
  [/opus-(5|4-[5-9])/, 'Opus 4.5–5', [5, 25, 6.25, 10, 0.5]],
  [/opus/, 'Opus 3–4.1', [15, 75, 18.75, 30, 1.5]],
  [/sonnet-5/, 'Sonnet 5.x', [2, 10, 2.5, 4, 0.2]],
  [/sonnet-4-6/, 'Sonnet 4.6', [3, 15, 3.75, 6, 0.3]],
  [/sonnet-4(?!-6)/, 'Sonnet 4/4.5', [3, 15, 3.75, 6, 0.3], { above: 200_000, rates: [6, 22.5, 7.5, 12, 0.6] }],
  [/sonnet/, 'Sonnet 3.x', [3, 15, 3.75, 6, 0.3]],
  [/haiku-5|^haiku$/, 'Haiku 5.5', [0.1, 0.5, 0.125, 0.2, 0.01], { above: 100_000, rates: [0.5, 2.5, 0.625, 1, 0.05] }],
  [/haiku-4/, 'Haiku 4.5', [1, 5, 1.25, 2, 0.1]],
  [/haiku-3-5/, 'Haiku 3.5', [0.8, 4, 1, 1.6, 0.08]],
  [/haiku/, 'Haiku 3', [0.25, 1.25, 0.3, 0.5, 0.03]],
  [/./, 'Opus 5.5', [4, 20, 5, 8, 0.2]],   // unknown: price as the current default model
]
const FAST = 2   // fast mode bills Opus at twice the standard rate

const familyOf = id => PRICES.find(p => p[0].test(id))
function costOf(model, u) {
  const [, label, base, long] = familyOf(model)
  const w1 = u.cache_creation?.ephemeral_1h_input_tokens || 0
  const w5 = u.cache_creation ? (u.cache_creation.ephemeral_5m_input_tokens || 0) : (u.cache_creation_input_tokens || 0)
  const inp = u.input_tokens || 0, out = u.output_tokens || 0, read = u.cache_read_input_tokens || 0
  const prompt = inp + read + (u.cache_creation_input_tokens || 0)
  const r = long && prompt > long.above ? long.rates : base
  const usd = (inp * r[0] + out * r[1] + w5 * r[2] + w1 * r[3] + read * r[4]) / 1e6 * (u.speed === 'fast' ? FAST : 1)
  return { label, usd, tokens: prompt + out }
}

const files = new Map()   // file -> { offset, rest, dec, session }
const msgs = new Map()    // message id -> { session, model, usd, tokens }
let list = [], listedAt = 0, crawling = false, ready = false, crawledAt = 0, day = 0, firstScanMs = null
const midnight = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime() }
const tsOf = l => { const i = l.indexOf('"timestamp":"'); return i < 0 ? 0 : Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0 }

async function listFiles(today) {
  const out = []
  const dir = async d => { try { return await fs.promises.readdir(d) } catch { return [] } }
  const touched = async f => { try { return (await fs.promises.stat(f)).mtimeMs >= today } catch { return false } }
  const add = async (f, session) => { if (await touched(f)) out.push([f, session]) }
  for (const proj of await dir(PROJECTS)) {
    const pd = path.join(PROJECTS, proj)
    for (const f of await dir(pd)) {
      if (!f.endsWith('.jsonl')) continue
      const id = f.slice(0, -6), main = path.join(pd, f)
      let st; try { st = await fs.promises.stat(main) } catch { continue }
      if (st.mtimeMs < today - DAY) continue   // a workflow can leave its session's own transcript quiet for hours
      if (st.mtimeMs >= today) out.push([main, id])
      const sub = path.join(pd, id, 'subagents')
      const agents = d => dir(d).then(xs => xs.filter(x => x.startsWith('agent-') && x.endsWith('.jsonl')).map(x => path.join(d, x)))
      for (const a of await agents(sub)) await add(a, id)
      for (const wf of await dir(path.join(sub, 'workflows'))) for (const a of await agents(path.join(sub, 'workflows', wf))) await add(a, id)
    }
  }
  return out
}

// Byte offset of a line at or just before the first entry stamped today (transcripts are append-only, in time order).
async function seekToday(fh, size, today) {
  let lo = 0, hi = size
  while (hi - lo > PROBE) {
    const mid = Math.floor((lo + hi) / 2), buf = Buffer.alloc(Math.min(PROBE, size - mid))
    const { bytesRead } = await fh.read(buf, 0, buf.length, mid)
    const lines = buf.subarray(0, bytesRead).toString('utf8').split('\n').slice(1, -1)
    const t = lines.map(tsOf).find(Boolean)
    if (!t) return lo
    if (t < today) lo = mid; else hi = mid
  }
  return lo
}

function line(s, l, today) {
  if (!l.includes('"usage"') || !l.includes('"type":"assistant"')) return
  if (tsOf(l) < today) return
  let e; try { e = JSON.parse(l) } catch { return }
  const m = e.message, u = m?.usage, key = m?.id || e.requestId
  if (e.type !== 'assistant' || !u || !key || !m.model || m.model === '<synthetic>') return
  const had = msgs.get(key)
  if (had && had.session !== s.session) return   // copied into another transcript (resume/fork): first owner keeps it
  const model = m.model.replace(/\[.*\]$/, '')
  msgs.set(key, { session: s.session, model, ...costOf(model, u) })   // later entries of one message repeat or grow its usage
}

async function read(file, session, size, today) {
  let s = files.get(file)
  if (!s || size < s.offset) { s = { offset: 0, rest: '', dec: new StringDecoder('utf8'), session, fresh: true }; files.set(file, s) }
  if (size <= s.offset) return
  const fh = await fs.promises.open(file, 'r')
  try {
    if (s.fresh) { s.fresh = false; s.offset = await seekToday(fh, size, today); if (s.offset) s.skip = true }
    while (s.offset < size) {
      const buf = Buffer.alloc(Math.min(CHUNK, size - s.offset))
      const { bytesRead } = await fh.read(buf, 0, buf.length, s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      const lines = (s.rest + s.dec.write(buf.subarray(0, bytesRead))).split('\n')
      s.rest = lines.pop()
      if (s.skip) { lines.shift(); s.skip = false }   // entered mid-line
      for (const l of lines) if (l) line(s, l, today)
    }
  } finally { await fh.close() }
}

async function crawl() {
  if (crawling) return
  crawling = true
  const t0 = Date.now()
  try {
    const today = midnight()
    if (today !== day) { day = today; msgs.clear(); listedAt = 0 }
    if (t0 - listedAt > 20_000) { list = await listFiles(today); listedAt = t0 }
    for (const [file, session] of list) {
      let st; try { st = await fs.promises.stat(file) } catch { continue }
      await read(file, session, st.size, today)
    }
    if (!ready) { firstScanMs = Date.now() - t0; console.log(`[cost-jar] first scan: ${list.length} files in ${firstScanMs} ms`) }
    ready = true
  } catch (e) { console.error('[cost-jar crawl]', e.message) } finally { crawling = false; crawledAt = Date.now() }
}

const cents = n => Math.round(n * 100) / 100
function aggregate() {
  const by = new Map()
  for (const m of msgs.values()) {
    let s = by.get(m.session)
    if (!s) by.set(m.session, s = { usdToday: 0, tokensToday: 0, byModel: {} })
    s.usdToday += m.usd; s.tokensToday += m.tokens
    const b = s.byModel[m.model] ??= { family: m.label, usd: 0, tokens: 0, messages: 0 }
    b.usd += m.usd; b.tokens += m.tokens; b.messages++
  }
  for (const s of by.values()) { s.usdToday = cents(s.usdToday); for (const b of Object.values(s.byModel)) b.usd = cents(b.usd) }
  return by
}

let cache = null
export const costScanMs = () => firstScanMs
export default {
  snapshot(snap) {
    if (!crawling && snap.now - crawledAt > 1500) crawl()
    if (!ready) return
    if (!cache || snap.now - cache.at > 1200) {
      const by = aggregate(), bySession = {}
      let total = 0
      for (const [id, s] of by) { bySession[id] = s.usdToday; total += s.usdToday }
      cache = { at: snap.now, by, cost: { usdToday: cents(total), bySession, estimate: true } }
    }
    snap.cost = cache.cost
    for (const s of snap.sessions) s.ext = { ...s.ext, 'cost-jar': cache.by.get(s.id) || { usdToday: 0, tokensToday: 0, byModel: {} } }
  },
}
