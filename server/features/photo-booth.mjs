// photo-booth: saves a PNG or GIF the page made into ~/Downloads and reveals it in Finder.
// AGENT_OFFICE_NO_REVEAL=1 skips the Finder reveal (for test runs).
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'

const MAX_FILE = 25 * 1024 * 1024
const MAX_BODY = Math.ceil(MAX_FILE * 4 / 3) + 1024
const DIR = path.join(os.homedir(), 'Downloads')
const MAGIC = { png: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), gif: Buffer.from('GIF89a') }

function send(res, status, obj) {
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

const stamp = d => { const p = n => String(n).padStart(2, '0'); return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}` }

async function save(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' })
  if (req.headers['sec-fetch-site'] !== 'same-origin') return send(res, 403, { error: 'same-origin only' })
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > MAX_BODY) { send(res, 413, { error: 'too big (25 MB max)' }); req.destroy(); return }
    chunks.push(c)
  }
  let kind, data
  try { ({ kind, data } = JSON.parse(Buffer.concat(chunks).toString('utf8'))) } catch { return send(res, 400, { error: 'bad JSON' }) }
  if (!MAGIC[kind] || typeof data !== 'string') return send(res, 400, { error: 'kind must be png or gif' })
  const buf = Buffer.from(data, 'base64')
  if (buf.length > MAX_FILE) return send(res, 413, { error: 'too big (25 MB max)' })
  if (!buf.subarray(0, MAGIC[kind].length).equals(MAGIC[kind])) return send(res, 400, { error: `not a ${kind.toUpperCase()}` })
  const base = `agent-office-${stamp(new Date())}`
  try { fs.mkdirSync(DIR, { recursive: true }) } catch (e) { return send(res, 500, { error: e.message }) }
  let file
  for (let i = 1; i < 100 && !file; i++) {
    const f = path.join(DIR, `${base}${i > 1 ? '-' + i : ''}.${kind}`)
    try { fs.writeFileSync(f, buf, { flag: 'wx' }); file = f } catch (e) { if (e.code !== 'EEXIST') return send(res, 500, { error: e.message }) }
  }
  if (!file) return send(res, 500, { error: 'no free file name' })
  console.log(`[photo-booth] saved ${file} (${buf.length} bytes)`)
  if (process.platform === 'darwin' && process.env.AGENT_OFFICE_NO_REVEAL !== '1') execFile('open', ['-R', file], () => {})
  send(res, 200, { ok: true, path: file })
}

export default {
  routes: {
    '/api/photo-booth/save': (req, res) => { save(req, res).catch(e => { console.error('[photo-booth]', e); if (!res.headersSent) send(res, 500, { error: e.message }) }) },
  },
}
