// Whole-transcript readers for the sessions on screen. desk-props, pr-celebration and task-board need every line since
// a transcript's first byte; read inside a poll, a cold start blocked the server for seconds. Here each file is read once
// from byte 0 and then only its appended bytes, asynchronously and one file at a time, and every subscriber gets each line.
// A subscriber uses its state for a file once the reader has read the file up to its size when first asked for (want()
// returns true from then on; later appends are picked up a poll or so behind).
//   subscribe({ files: Map(file -> state), main: true to read only sessions' own transcripts, open() -> state, line(state, l) })
import { readAsync, tailState } from './tail.mjs'

const FORGET_MS = 30 * 60_000   // a transcript off screen this long is dropped (read again from 0 if it comes back)
const subs = [], readers = new Map()   // file -> { offset, rest, skip, want, first, seen, main }
const queue = new Set()
let busy = false

export const subscribe = sub => { subs.push(sub) }

// t: { file, stat, main } from server/lib/transcripts.mjs; queue a read when it grew. Returns whether its first read is done.
export function want(t, now = Date.now()) {
  let r = readers.get(t.file)
  if (r && t.stat.size < r.offset) { readers.delete(t.file); for (const s of subs) s.files.delete(t.file); r = null }   // rewritten
  if (!r) {
    r = tailState(0, { want: 0, first: t.stat.size, seen: now, main: t.main })
    readers.set(t.file, r)
    for (const s of subs) if (t.main || !s.main) s.files.set(t.file, s.open())
  }
  r.seen = now
  if (t.stat.size > r.offset) { r.want = Math.max(r.want, t.stat.size); queue.add(t.file); if (!busy) drain() }
  return r.offset >= r.first
}

async function drain() {
  busy = true
  try {
    while (queue.size) {
      const file = queue.values().next().value
      queue.delete(file)
      const r = readers.get(file); if (!r || r.want <= r.offset) continue
      const live = subs.filter(s => r.main || !s.main).map(s => [s, s.files.get(file)]).filter(([, x]) => x)
      try { await readAsync(r, file, r.want, l => { for (const [s, x] of live) s.line(x, l) }) }
      catch (e) { if (e.code === 'ENOENT') forget(file); else console.error('[history]', e.message) }
    }
    const now = Date.now()
    for (const [f, r] of readers) if (now - r.seen > FORGET_MS) forget(f)
  } finally { busy = false }
}
function forget(file) { readers.delete(file); for (const s of subs) s.files.delete(file) }

// the readers' total progress over some files, to know when an aggregate over them changed
export const progress = files => { let n = 0; for (const t of files) n += readers.get(t.file)?.offset || 0; return n }
