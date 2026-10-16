// photo-booth: 📸 saves a PNG of the view to ~/Downloads; shift-click (or right-click → GIF) records a 10 s GIF.
// Files go through the server because downloads may not work in Orca's browser. ?demo=photo / ?demo=gif (3 s) / ?demo=photomenu for tests.
import { prefs } from './notify.js'

const BG = '#14151c'
const GIF_SECONDS = 10, FPS = 10, GIF_W = 900

// A streaming GIF89a encoder: one global palette seeded by median cut on the first frame and grown as new
// colours appear, frame differencing into a transparent sub-rectangle, and LZW. Runs in a Worker built from its source.
function GifEncoder(w, h) {
  const pal = new Uint8Array(768), lut = new Int16Array(32768).fill(-1)
  let n = 1, prev = null, frames = 0
  const parts = []
  const codes = new Int16Array(4096 * 256), stamps = new Int32Array(4096 * 256)
  let gen = 0
  const keyRGB = k => [(k >> 10 & 31) << 3 | 4, (k >> 5 & 31) << 3 | 4, (k & 31) << 3 | 4]
  function nearest(k) {
    const [r, g, b] = keyRGB(k)
    let best = 1, bd = Infinity
    for (let i = 1; i < n; i++) {
      const dr = pal[i * 3] - r, dg = pal[i * 3 + 1] - g, db = pal[i * 3 + 2] - b, d = dr * dr + dg * dg + db * db
      if (d < bd) { bd = d; best = i }
    }
    return [best, bd]
  }
  function index(k) {
    const i = lut[k]
    if (i >= 0) return i
    let [j, d] = nearest(k)
    if (d > 300 && n < 256) { const c = keyRGB(k); pal.set(c, n * 3); j = n++ }
    return (lut[k] = j)
  }
  function seed(keys, rgba) {
    const cnt = new Uint32Array(32768), sum = new Float64Array(32768 * 3)
    for (let p = 0; p < keys.length; p++) { const k = keys[p]; cnt[k]++; sum[k * 3] += rgba[p * 4]; sum[k * 3 + 1] += rgba[p * 4 + 1]; sum[k * 3 + 2] += rgba[p * 4 + 2] }
    const all = []
    for (let k = 0; k < 32768; k++) if (cnt[k]) all.push(k)
    const target = all.length <= 255 ? all.length : 224
    const ch = (k, c) => c === 0 ? k >> 10 & 31 : c === 1 ? k >> 5 & 31 : k & 31
    const range = box => { let best = [0, -1]; for (let c = 0; c < 3; c++) { let lo = 31, hi = 0; for (const k of box) { const v = ch(k, c); if (v < lo) lo = v; if (v > hi) hi = v } if (hi - lo > best[1]) best = [c, hi - lo] } return best }
    let boxes = [all]
    while (boxes.length < target) {
      let bi = -1, br = 0, bc = 0
      boxes.forEach((b, i) => { if (b.length < 2) return; const [c, r] = range(b); const s = r * Math.log2(b.length + 1); if (s > br) { br = s; bi = i; bc = c } })
      if (bi < 0) break
      const box = boxes[bi].sort((a, b) => ch(a, bc) - ch(b, bc))
      let total = 0, acc = 0, cut = 1
      for (const k of box) total += cnt[k]
      for (let i = 0; i < box.length - 1; i++) { acc += cnt[box[i]]; if (acc >= total / 2) { cut = i + 1; break } }
      boxes.splice(bi, 1, box.slice(0, cut), box.slice(cut))
    }
    for (const box of boxes) {
      let c = 0, r = 0, g = 0, b = 0
      for (const k of box) { c += cnt[k]; r += sum[k * 3]; g += sum[k * 3 + 1]; b += sum[k * 3 + 2] }
      pal.set([Math.round(r / c), Math.round(g / c), Math.round(b / c)], n * 3)
      for (const k of box) lut[k] = n
      n++
    }
  }
  function lzw(idx) {
    const buf = new Uint8Array(idx.length * 2 + 1024)
    let len = 0, cur = 0, bits = 0, size = 9, next = 258
    const emit = code => { cur |= code << bits; bits += size; while (bits >= 8) { buf[len++] = cur & 255; cur >>>= 8; bits -= 8 } }
    gen++; emit(256)
    let prefix = idx[0]
    for (let i = 1; i < idx.length; i++) {
      const k = idx[i], slot = prefix << 8 | k
      if (stamps[slot] === gen) { prefix = codes[slot]; continue }
      emit(prefix)
      if (next === 4096) { emit(256); gen++; next = 258; size = 9 }
      else { if (next >= 1 << size) size++; codes[slot] = next++; stamps[slot] = gen }
      prefix = k
    }
    emit(prefix); emit(257)
    if (bits > 0) buf[len++] = cur & 255
    const out = new Uint8Array(1 + len + Math.ceil(len / 255) + 1)
    let o = 0; out[o++] = 8
    for (let i = 0; i < len; i += 255) { const m = Math.min(255, len - i); out[o++] = m; out.set(buf.subarray(i, i + m), o); o += m }
    out[o++] = 0
    return out.subarray(0, o)
  }
  return {
    addFrame(rgba, delay) {
      const keys = new Uint16Array(w * h)
      for (let p = 0, q = 0; p < keys.length; p++, q += 4) keys[p] = (rgba[q] >> 3) << 10 | (rgba[q + 1] >> 3) << 5 | rgba[q + 2] >> 3
      if (!frames) seed(keys, rgba)
      let x0 = 0, y0 = 0, x1 = w - 1, y1 = h - 1
      if (prev) {
        x0 = w; y0 = h; x1 = -1; y1 = -1
        for (let y = 0, p = 0; y < h; y++) for (let x = 0; x < w; x++, p++) if (keys[p] !== prev[p]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; y1 = y }
        if (x1 < 0) { x0 = y0 = x1 = y1 = 0 }
      }
      const rw = x1 - x0 + 1, rh = y1 - y0 + 1, idx = new Uint8Array(rw * rh)
      for (let y = 0, i = 0; y < rh; y++) for (let x = 0, p = (y + y0) * w + x0; x < rw; x++, p++, i++) idx[i] = prev && keys[p] === prev[p] ? 0 : index(keys[p])
      parts.push(new Uint8Array([0x21, 0xf9, 4, 1 << 2 | (prev ? 1 : 0), delay & 255, delay >> 8, 0, 0,
        0x2c, x0 & 255, x0 >> 8, y0 & 255, y0 >> 8, rw & 255, rw >> 8, rh & 255, rh >> 8, 0]), lzw(idx))
      prev = keys; frames++
    },
    finish() {
      const head = new Uint8Array([...'GIF89a'].map(c => c.charCodeAt(0)).concat([w & 255, w >> 8, h & 255, h >> 8, 0xf7, 0, 0]))
      const loop = new Uint8Array([0x21, 0xff, 11, ...[...'NETSCAPE2.0'].map(c => c.charCodeAt(0)), 3, 1, 0, 0, 0])
      const all = [head, pal, loop, ...parts, new Uint8Array([0x3b])]
      const out = new Uint8Array(all.reduce((s, a) => s + a.length, 0))
      let o = 0; for (const a of all) { out.set(a, o); o += a.length }
      return out
    },
  }
}

const WORKER_SRC = `const GifEncoder = ${GifEncoder.toString()}
let enc
onmessage = ({ data: m }) => {
  if (m.type === 'init') enc = GifEncoder(m.w, m.h)
  else if (m.type === 'frame') { enc.addFrame(new Uint8Array(m.buf), m.delay); postMessage({ type: 'progress' }) }
  else if (m.type === 'end') { const out = enc.finish(); postMessage({ type: 'done', out }, [out.buffer]) }
}`

// Same messages as the Worker; the fallback encodes one frame per task so the office keeps animating.
function encoder(onMsg) {
  try {
    const url = URL.createObjectURL(new Blob([WORKER_SRC], { type: 'text/javascript' }))
    const wk = new Worker(url); URL.revokeObjectURL(url)
    wk.onmessage = e => onMsg(e.data)
    return { post: (m, t) => wk.postMessage(m, t || []), stop: () => wk.terminate() }
  } catch {
    let enc, q = Promise.resolve()
    const tick = () => new Promise(r => setTimeout(r, 0))
    return {
      post: m => { q = q.then(tick).then(() => {
        if (m.type === 'init') enc = GifEncoder(m.w, m.h)
        else if (m.type === 'frame') { enc.addFrame(new Uint8Array(m.buf), m.delay); onMsg({ type: 'progress' }) }
        else if (m.type === 'end') onMsg({ type: 'done', out: enc.finish() })
      }) },
      stop: () => {},
    }
  }
}

let actx = null
function shutter() {
  if (!prefs().sound || document.body.dataset.replay) return
  try { actx ||= new AudioContext() } catch { return }
  if (actx.state === 'suspended') actx.resume()
  const t0 = actx.currentTime + 0.01, len = Math.floor(actx.sampleRate * 0.05)
  const noise = actx.createBuffer(1, len, actx.sampleRate), d = noise.getChannelData(0)
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3
  for (const [at, f, g] of [[0, 3200, 0.5], [0.09, 1800, 0.35]]) {
    const src = actx.createBufferSource(), bp = actx.createBiquadFilter(), gain = actx.createGain()
    src.buffer = noise; bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = 0.9; gain.gain.value = g
    src.connect(bp).connect(gain).connect(actx.destination); src.start(t0 + at)
  }
}

const toB64 = blob => new Promise((ok, fail) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1]); r.onerror = fail; r.readAsDataURL(blob) })

export default function init(api) {
  const btn = document.createElement('button'); btn.className = 'hbtn'
  btn.textContent = '📸'
  btn.title = 'Photo booth: click for a PNG · shift-click or right-click for a 10 s GIF (saved to Downloads)'
  document.getElementById('tbPhoto').append(btn)

  const style = document.createElement('style')
  style.textContent = `
  #pbPill { display: none; padding: 6px 12px; border-radius: 999px; font: 600 var(--fs) var(--font); pointer-events: none; }
  #pbPill.rec { background: #b8302ff0; border-color: #ff8a8a55; color: #fff; }
  #pbMenu { position: absolute; z-index: 5; display: none; flex-direction: column; gap: 2px; padding: 4px; }
  #pbMenu button { all: unset; cursor: pointer; padding: 6px 10px; border-radius: var(--radius-s); color: var(--ink); font: 600 var(--fs) var(--font); white-space: nowrap; }
  #pbMenu button:hover { background: var(--card-hi); }`
  document.head.append(style)
  const css = (el, s) => { el.style.cssText = s; return el }
  const pill = document.createElement('div'); pill.id = 'pbPill'; pill.className = 'card'
  const flash = css(document.createElement('div'), 'position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none;z-index:4;transition:opacity .35s ease-out')
  const menu = document.createElement('div'); menu.id = 'pbMenu'; menu.className = 'card'
  for (const [label, fn] of [['📸 Photo', () => photo()], ['🎞 GIF 10 s', () => gif(GIF_SECONDS)]]) {
    const b = document.createElement('button')
    b.textContent = label
    b.onclick = () => { menu.style.display = 'none'; fn() }
    menu.append(b)
  }
  document.getElementById('wrap').append(flash)
  document.getElementById('topstack').append(pill)
  api.hud.append(menu)
  addEventListener('pointerdown', e => { if (!menu.contains(e.target) && e.target !== btn) menu.style.display = 'none' })
  // the menu opens to the left of the toolbar, level with the 📸 button
  function openMenu() {
    const w = api.hud.getBoundingClientRect(), r = btn.getBoundingClientRect(), bar = btn.closest('.card').getBoundingClientRect()
    menu.style.right = (w.right - bar.left + 8) + 'px'; menu.style.top = (r.top - w.top - 4) + 'px'; menu.style.display = 'flex'
  }
  const showPill = (text, rec) => { pill.textContent = text; pill.classList.toggle('rec', !!rec); pill.style.display = text ? 'block' : 'none' }

  let busy = null // 'rec' | 'enc' | 'save'
  let stopRec = null
  btn.onclick = e => { if (busy === 'rec') return stopRec?.(); if (e.shiftKey) gif(GIF_SECONDS); else photo() }
  btn.oncontextmenu = e => { e.preventDefault(); if (!busy) menu.style.display === 'flex' ? menu.style.display = 'none' : openMenu() }

  // The view canvas is transparent where the page background shows through, so paint that under it.
  function grab(w, h) {
    const c = document.createElement('canvas'); c.width = w; c.height = h
    const x = c.getContext('2d', { willReadFrequently: true })
    x.fillStyle = BG; x.fillRect(0, 0, w, h)
    x.imageSmoothingEnabled = true; x.imageSmoothingQuality = 'high'
    x.drawImage(api.view, 0, 0, w, h)
    return [c, x]
  }

  async function upload(kind, blob) {
    busy = 'save'
    try {
      const r = await fetch('/api/photo-booth/save', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, data: await toB64(blob) }) })
      const j = await r.json().catch(() => ({}))
      api.toast(r.ok ? 'Saved to Downloads — revealed in Finder' : `Photo booth: ${j.error || 'save failed'}`, 3500)
      if (r.ok) console.log('[photo-booth] saved', j.path)
    } catch { api.toast('Agentopolis server is offline') }
    busy = null
  }

  function photo() {
    if (busy || !api.view.width) return
    const [c] = grab(api.view.width, api.view.height)
    shutter()
    flash.style.transition = 'none'; flash.style.opacity = '0.85'
    requestAnimationFrame(() => requestAnimationFrame(() => { flash.style.transition = 'opacity .35s ease-out'; flash.style.opacity = '0' }))
    busy = 'save'
    c.toBlob(b => b ? upload('png', b) : (busy = null, api.toast('Photo booth: could not make a PNG')), 'image/png')
  }

  function gif(seconds) {
    if (busy || !api.view.width) return
    const w = Math.min(GIF_W, Math.round(api.view.width / (devicePixelRatio || 1))), h = Math.round(w * api.view.height / api.view.width)
    let sent = 0, done = 0, ended = false
    const t0 = performance.now()
    const enc = encoder(m => {
      if (m.type === 'progress') { done++; if (ended) showPill(`encoding… ${Math.round(done / sent * 100)}%`) }
      else if (m.type === 'done') {
        enc.stop(); showPill('')
        console.log(`[photo-booth] gif ${w}x${h}, ${sent} frames, ${m.out.length} bytes, encoded ${Math.round(performance.now() - stopAt)} ms after recording`)
        upload('gif', new Blob([m.out], { type: 'image/gif' }))
      }
    })
    enc.post({ type: 'init', w, h })
    busy = 'rec'; shutter()
    let stopAt = 0
    const capture = () => {
      const now = performance.now(), [, x] = grab(w, h), img = x.getImageData(0, 0, w, h)
      enc.post({ type: 'frame', buf: img.data.buffer, delay: 100 / FPS }, [img.data.buffer])
      sent++
      const left = Math.ceil(seconds - (now - t0) / 1000)
      showPill(`● REC ${Math.max(0, left)}s`, true)
    }
    const finish = () => {
      clearInterval(timer); clearTimeout(cap); stopRec = null
      ended = true; busy = 'enc'; stopAt = performance.now()
      showPill(`encoding… ${Math.round(done / sent * 100)}%`)
      enc.post({ type: 'end' })
    }
    capture()
    const timer = setInterval(capture, 1000 / FPS), cap = setTimeout(finish, seconds * 1000)
    stopRec = finish
  }

  const q = api.params, demo = q.getAll('demo')
  if (demo.includes('photo')) setTimeout(photo, 4000)
  if (demo.includes('photomenu')) setTimeout(openMenu, 3000)
  if (demo.includes('gif')) setTimeout(() => gif(Math.min(GIF_SECONDS, +q.get('seconds') || 3)), 4000)
}
