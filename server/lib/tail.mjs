// Incremental JSONL reading shared by the server features: each caller keeps a state per transcript
// ({ offset, rest, skip }) and gets only the lines appended since its last read.
// Lines are cut from the bytes (a newline byte never occurs inside a UTF-8 sequence) and each is decoded on its own,
// so a line never shares memory with its read chunk. A regex match or slice of 13+ characters still points into its
// line, though: copy anything kept long-term (a Map key, a stored field) with own().
import fs from 'node:fs'

export const CHUNK = 4 * 1024 * 1024
const NL = 10

// a flat copy of a string, so a long-lived key or field does not keep the (possibly huge) line it came from alive
export const own = s => typeof s === 'string' && s.length >= 13 ? Buffer.from(s, 'utf8').toString('utf8') : s

// A reader state: start > 0 skips the (assumed partial) line at that byte, as the tail-from-near-the-end readers want.
export const tailState = (start = 0, extra) => ({ offset: start, rest: null, skip: start > 0, ...extra })

// cut buf[0..n) (after s.rest) into whole lines, keep the trailing partial one in s.rest
function cut(s, buf, n, onLine) {
  let data = buf, len = n
  if (s.rest) { data = Buffer.concat([s.rest, buf.subarray(0, n)]); len = data.length; s.rest = null }
  let a = 0
  for (let i = data.indexOf(NL, 0); i !== -1 && i < len; i = data.indexOf(NL, a)) {
    if (s.skip) s.skip = false
    else if (i > a) onLine(data.toString('utf8', a, i))
    a = i + 1
  }
  if (a < len) s.rest = Buffer.from(data.subarray(a, len))   // a copy: the chunk buffer is not kept alive
}

// Read file from s.offset up to size, calling onLine for each whole line. A file that shrank is the caller's to reset.
export function readSync(s, file, size, onLine) {
  if (size <= s.offset) return 0
  const fd = fs.openSync(file, 'r'), start = s.offset
  try {
    const buf = Buffer.allocUnsafe(Math.min(CHUNK, size - s.offset))
    while (s.offset < size) {
      const n = fs.readSync(fd, buf, 0, Math.min(buf.length, size - s.offset), s.offset)
      if (!n) break
      s.offset += n
      cut(s, buf, n, onLine)
    }
  } finally { fs.closeSync(fd) }
  return s.offset - start
}

export async function readAsync(s, file, size, onLine, fh) {
  if (size <= s.offset) return 0
  const own_ = !fh
  if (own_) fh = await fs.promises.open(file, 'r')
  const start = s.offset
  try {
    const buf = Buffer.allocUnsafe(Math.min(CHUNK, size - s.offset))
    while (s.offset < size) {
      const { bytesRead } = await fh.read(buf, 0, Math.min(buf.length, size - s.offset), s.offset)
      if (!bytesRead) break
      s.offset += bytesRead
      cut(s, buf, bytesRead, onLine)
    }
  } finally { if (own_) await fh.close() }
  return s.offset - start
}

// the "timestamp" of a JSONL line (its first one, or its last with last = true), 0 when none
export function tsOf(l, last = false) {
  const i = last ? l.lastIndexOf('"timestamp":"') : l.indexOf('"timestamp":"')
  return i < 0 ? 0 : Date.parse(l.slice(i + 13, l.indexOf('"', i + 13))) || 0
}

// Byte offset of a line at or just before the first entry stamped at or after `since` (transcripts are append-only,
// in time order), by bisection over probes of PROBE bytes.
export async function seekSince(fh, size, since, probe = 256 * 1024) {
  let lo = 0, hi = size
  while (hi - lo > probe) {
    const mid = Math.floor((lo + hi) / 2), buf = Buffer.alloc(Math.min(probe, size - mid))
    const { bytesRead } = await fh.read(buf, 0, buf.length, mid)
    const t = buf.subarray(0, bytesRead).toString('utf8').split('\n').slice(1, -1).map(l => tsOf(l)).find(Boolean)
    if (!t) return lo
    if (t < since) lo = mid; else hi = mid
  }
  return lo
}
