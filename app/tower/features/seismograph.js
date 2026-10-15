// seismograph: a destructive command (snap.seismograph from server/features/seismograph.mjs: rm -rf, force push,
// reset --hard, clean -fd, branch -D, DROP/TRUNCATE, kubectl delete, terraform destroy, docker system prune) shakes its
// session's floor — a short jitter of that floor only — cracks the back wall, shakes dust off the ceiling and pins a
// hard-hat ⚠ tag with the command over whoever ran it. The lobby keeps a drum seismograph left of reception: today on
// the paper from 00 to 24, one spike per event (tall for force push / rm -rf, small for reset --hard). Hover the drum.
// ?demo=seismograph fakes a day of tremors and a fresh one every 10 s.
import { IX } from '../building.js'

const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const SX = IX + 52, SW = 40, PX0 = SX + 3, PW = 34, DAY = 24 * 3600_000
const SHAKE = { 3: [2, 1900], 2: [1.5, 1400], 1: [1, 1000] }, TAG_MS = 14_000, CRACK_MS = 10 * 60_000, FRESH = 90_000
const AMP = { 3: 5, 2: 3, 1: 2 }
const hhmm = t => new Date(t).toTimeString().slice(0, 5)

export default function init(api, tower) {
  const { Z, font, fitText } = tower, esc = api.esc
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('seismograph')
  const seen = new Set(), quakes = []   // { e, fid, t0, crackX, seed }
  let first = true, tmp = null

  const lobby = () => tower.floor('lobby')
  const events = () => tower.snapshot?.seismograph?.events || []
  const dayStart = () => new Date().setHours(0, 0, 0, 0)
  const colOf = t => PX0 + Math.max(0, Math.min(PW - 1, Math.floor((t - dayStart()) / DAY * PW)))

  tower.on('sync', data => {
    const now = Date.now()
    for (const e of data.seismograph?.events || []) {
      if (seen.has(e.id)) continue
      seen.add(e.id)
      if (api.live === false || now - e.at > (first ? 20_000 : FRESH) || e.at > now + 5000) continue
      const f = tower.floorOf(e.session)
      quakes.push({ e, fid: f?.id ?? null, t0: performance.now(), crackX: IX + 60 + api.hash(e.id) % 380, seed: api.hash(e.id + 'c') })
    }
    first = false
  })
  tower.on('step', (dt, now) => { while (quakes.length && now - quakes[0].t0 > CRACK_MS) quakes.shift() })

  // ---------- the floor shakes ----------
  function jitter(q, now) {
    const [amp, dur] = SHAKE[q.e.size] || SHAKE[1], t = now - q.t0
    if (t > dur) return null
    const k = 1 - t / dur
    return { dx: Math.round(amp * k * Math.sin(t / 14)), dy: Math.round(amp * 0.6 * k * Math.sin(t / 19 + 1)) }
  }
  tower.on('post', (c, now) => {
    for (const q of quakes) {
      const f = q.fid && tower.floor(q.fid), j = f && jitter(q, now)
      if (!j || (!j.dx && !j.dy)) continue
      const m = c.getTransform(), x = tower.interior.x0, w = tower.interior.x1 - x, y = f.top, h = f.y - f.top
      tmp ??= document.createElement('canvas')
      if (tmp.width !== w || tmp.height !== h) { tmp.width = w; tmp.height = h }
      const tc = tmp.getContext('2d'); tc.clearRect(0, 0, w, h)
      tc.drawImage(c.canvas, x * m.a + m.e, y * m.d + m.f, w * m.a, h * m.d, 0, 0, w, h)
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.drawImage(tmp, x + j.dx, y + j.dy); c.restore()
    }
  })

  // ---------- crack, dust ----------
  function crack(c, f, q, now) {
    const a = Math.max(0, 1 - (now - q.t0) / CRACK_MS)
    if (a <= 0) return
    const grow = Math.min(1, (now - q.t0) / 500), len = Math.round((14 + q.e.size * 6) * grow)
    c.globalAlpha = 0.85 * a
    let x = q.crackX, y = f.top + 6
    for (let i = 0; i < len; i++) {
      const s = (q.seed >>> (i % 24)) & 3
      x += s === 0 ? -1 : s === 1 ? 1 : 0; y += 1
      R(c, '#4a3f36', x, y, 1, 1)
      if (i % 7 === 3) R(c, '#6a5c50', x + (s & 1 ? 1 : -1), y, 1, 1)
      if (i === Math.floor(len * 0.5) && q.e.size > 1) for (let k = 1; k < 5; k++) R(c, '#4a3f36', x + k, y + Math.floor(k / 2), 1, 1)
    }
    c.globalAlpha = 1
  }
  function dust(c, f, q, now) {
    const t = (now - q.t0) / 1000
    if (t > 3) return
    for (let i = 0; i < 6 + q.e.size * 4; i++) {
      const h = api.hash(q.e.id + i), x = q.crackX - 30 + h % 60, v = 18 + (h >>> 8) % 30, y = f.top + 3 + v * t + 6 * t * t
      if (y > f.y - 2) continue
      c.globalAlpha = Math.max(0, 1 - t / 3) * 0.8
      R(c, (h >>> 4) & 1 ? '#cfc6b4' : '#a89c88', x + Math.sin(t * 3 + i) * 2, y, 1, 1)
    }
    if (t < 1.6) {
      const r = 4 + t * 10
      c.globalAlpha = Math.max(0, 0.45 * (1 - t / 1.6))
      c.fillStyle = '#d8d0c0'
      for (let k = -2; k <= 2; k++) { c.beginPath(); c.arc(q.crackX + k * r * 0.6, f.y - 3 - Math.abs(k) * 0.5, r * (1 - Math.abs(k) * 0.18), Math.PI, 0); c.fill() }
    }
    c.globalAlpha = 1
  }

  // ---------- the lobby instrument ----------
  function instrument(c, f, now) {
    const y = f.y, ev = events(), tNow = Date.now(), recent = quakes.find(q => now - q.t0 < 2500)
    R(c, 'rgba(0,0,0,.2)', SX, y - 1, SW, 1)
    R(c, '#5a4632', SX + 2, y - 12, 2, 12); R(c, '#5a4632', SX + SW - 4, y - 12, 2, 12); R(c, '#4a3826', SX + 2, y - 4, SW - 4, 1)
    R(c, '#7a5c40', SX, y - 14, SW, 3); R(c, '#9a7856', SX, y - 14, SW, 1)
    R(c, '#2e3240', SX + 4, y - 17, 3, 3); R(c, '#2e3240', SX + SW - 7, y - 17, 3, 3)
    R(c, '#6a7080', SX + 1, y - 29, 2, 13); R(c, '#6a7080', SX + SW - 3, y - 29, 2, 13)
    const top = y - 28, H = 11, yb = top + 5
    R(c, '#f4efdf', PX0, top, PW, H); R(c, '#d9d2bd', PX0, top + H - 2, PW, 2); R(c, '#ffffff', PX0, top + 1, PW, 1); R(c, '#e4dcc6', PX0, top, PW, 1)
    for (let h = 6; h < 24; h += 6) R(c, 'rgba(90,130,190,.35)', PX0 + Math.round(h / 24 * PW), top + 1, 1, H - 2)
    R(c, 'rgba(90,130,190,.18)', PX0, yb, PW, 1)
    const nowCol = colOf(tNow)
    for (let x = PX0; x <= nowCol; x++) R(c, '#3a3a52', x, yb + ((api.hash('sg' + x) % 5 === 0) ? ((x & 1) ? 1 : -1) : 0), 1, 1)
    for (const e of ev) {
      if (e.at < dayStart()) continue
      const x = colOf(e.at), a = AMP[e.size] || 2, col = e.size >= 3 ? '#b8282a' : e.size === 2 ? '#c06a1a' : '#3a3a52'
      R(c, col, x, yb - a, 1, a * 2 + 1)
      if (a > 2) { R(c, col, x - 1, yb - a + 2, 1, 2 * a - 3); R(c, col, x + 1, yb - 1, 1, 3) }
    }
    const wig = recent ? Math.round(Math.sin(now / 25) * (AMP[recent.e.size] || 2)) : Math.round(Math.sin(now / 400) * 0.6)
    R(c, '#2e3240', SX + SW - 3, top - 3, 2, 2)
    R(c, '#2e3240', nowCol + 1, top - 2, SX + SW - 3 - nowCol - 1, 1)
    R(c, '#2e3240', nowCol, top - 2, 1, yb - top + 2 + wig)
    R(c, recent ? '#e8402a' : '#b8282a', nowCol, yb + wig, 1, 1)
  }

  tower.on('items', (out, now) => {
    const lf = lobby()
    if (lf) out.push({ z: Z.FLOOR + 5, draw: c => instrument(c, lf, now) })
    for (const q of quakes) {
      const f = q.fid && tower.floor(q.fid); if (!f) continue
      out.push({ z: Z.WALL + 3, draw: c => crack(c, f, q, now) })
      if (now - q.t0 < 3000) out.push({ z: Z.STAND + 8, draw: c => dust(c, f, q, now) })
    }
  })

  // ---------- the hard-hat tag ----------
  function hat(c, x, y, s) {
    c.fillStyle = '#f4c21a'
    c.beginPath(); c.arc(x, y, 5 * s, Math.PI, 0); c.fill()
    c.fillRect(x - 7 * s, y - 0.5 * s, 14 * s, 2 * s)
    c.fillStyle = '#c99a0a'; c.fillRect(x - 0.75 * s, y - 5 * s, 1.5 * s, 5 * s)
  }
  tower.on('overlay', (c, now) => {
    const k = tower.zoom, H = tower.canvas.clientHeight
    if (k < tower.fitZoom() * 0.9) return
    c.save(); c.textBaseline = 'middle'
    const W = tower.canvas.clientWidth
    quakes.forEach((q, i) => {
      const age = now - q.t0; if (age > TAG_MS || quakes.slice(i + 1).some(o => o.fid === q.fid && now - o.t0 < TAG_MS)) return
      const f = q.fid && tower.floor(q.fid); if (!f) return
      const p = tower.person(q.e.who)
      const at = p && p.floor === f.id ? tower.worldToScreen(p.x, p.y - 36) : tower.worldToScreen(q.crackX, f.top + 20)
      if (at.y < -40 || at.y > H + 40) return
      const fs = Math.round(Math.max(10, Math.min(14, 3.4 * k))), s = fs / 12
      const text = fitText('⚠ ' + q.e.cmd, 320, font(fs, 700))
      c.font = font(fs, 700)
      const tw = c.measureText(text).width, w = tw + 30 * s + 10, h = fs + 12
      const x = Math.round(Math.max(8, Math.min(W - w - 8, at.x - w / 2))), y = Math.round(at.y - h - 10 - (age < 300 ? (300 - age) / 20 : 0))
      c.globalAlpha = Math.min(1, (TAG_MS - age) / 800)
      c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(x + 2, y + 3, w, h)
      c.fillStyle = '#1b1b1f'; c.fillRect(x, y, w, h)
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip(); c.fillStyle = '#f4c21a'
      for (let i = -h; i < w; i += 10) { c.beginPath(); c.moveTo(x + i, y + h); c.lineTo(x + i + 5, y + h); c.lineTo(x + i + 5 + h, y); c.lineTo(x + i + h, y); c.fill() }
      c.restore()
      c.fillStyle = '#fff6d8'; c.fillRect(x + 3, y + 3, w - 6, h - 6)
      hat(c, x + 13 * s, y + h / 2 + 2 * s, s)
      c.fillStyle = q.e.size >= 3 ? '#a8202a' : '#4a3a10'; c.fillText(text, x + 24 * s + 4, y + h / 2 + 0.5)
      c.fillStyle = '#1b1b1f'; c.beginPath(); c.moveTo(at.x - 4, y + h); c.lineTo(at.x + 4, y + h); c.lineTo(at.x, y + h + 6); c.fill()
    })
    c.globalAlpha = 1
    const lf = lobby()
    if (lf && k >= 3) {
      const n = events().filter(e => e.at >= dayStart()).length, p = tower.worldToScreen(SX + SW / 2, lf.y - 33)
      c.textAlign = 'center'; c.textBaseline = 'bottom'; c.font = font(Math.round(Math.max(8, Math.min(11, 2.4 * k))), 700); c.fillStyle = '#5a3a26'
      c.fillText(`SEISMOGRAPH · ${n} TODAY`, p.x, p.y)
    }
    c.restore()
  })

  // ---------- hover ----------
  function whoOf(e) {
    const s = tower.snapshot?.sessions?.find(x => x.id === e.session)
    const a = e.who !== e.session && s?.agents?.find(x => x.id === e.who)
    const title = s?.title || 'a closed session'
    return e.who !== e.session ? `${esc(a?.description || 'a subagent')} · <i>${esc(title)}</i>` : esc(title)
  }
  const row = e => `<div><b style="color:${e.size >= 3 ? '#e8504a' : e.size === 2 ? '#e8963a' : 'inherit'}">${esc(e.kind)}</b> · ${hhmm(e.at)} · ${whoOf(e)}</div>`
    + `<div style="font-family:ui-monospace,Menlo,monospace;white-space:pre-wrap;max-width:440px;opacity:.85">${esc(e.cmd)}</div>`
  tower.on('hover', (w, person) => {
    if (person) return null
    const lf = lobby(); if (!lf) return null
    if (w.x < SX - 1 || w.x > SX + SW + 1 || w.y < lf.y - 32 || w.y > lf.y) return null
    const ev = events().filter(e => e.at >= dayStart())
    const near = w.y < lf.y - 15 ? ev.filter(e => Math.abs(colOf(e.at) - Math.floor(w.x)) <= 1) : []
    if (near.length) return `<div class="t">⚠ Tremor${near.length > 1 ? 's' : ''} at ${hhmm(near[0].at)}</div>${near.slice(-4).map(row).join('')}`
    const big = ev.filter(e => e.size >= 3).length
    return `<div class="t">📈 Seismograph — ${ev.length} tremor${ev.length === 1 ? '' : 's'} today${big ? ` · ${big} big` : ''}</div>`
      + (ev.length ? ev.slice(-6).reverse().map(row).join('') : '<div class="m">All quiet: no force pushes, rm -rf or hard resets today.</div>')
      + `<div class="m">paper runs 00→24 · hover a spike for its tremor</div>`
  })

  // ---------- ?demo=seismograph ----------
  if (!demo) return
  const CMDS = [['git push --force origin feature/dark-mode', 'force push', 3], ['rm -rf build/ dist/ .cache', 'rm -rf', 3], ['git reset --hard origin/main', 'reset --hard', 1],
    ['git clean -fdx', 'clean -fd', 2], ['kubectl delete pod api-7f9c-x2', 'kubectl delete', 2], ['terraform destroy -target=module.preview', 'terraform destroy', 3]]
  tower.on('snapshot', data => {
    const now = Date.now(), d0 = dayStart(), ss = data.sessions.filter(s => s.running !== false)
    if (!ss.length) return
    const low = ss.map(s => ({ s, f: tower.floorOf(s.id) })).filter(x => x.f).sort((a, b) => b.f.y - a.f.y)[0]?.s || ss[0]
    const past = [[9.4, 2], [10.8, 0], [13.2, 3], [14.1, 1], [16.6, 4]].map(([h, i], k) => ({ id: 'demo-sg-' + k, at: d0 + h * 3600_000, session: ss[k % ss.length].id, who: ss[k % ss.length].id, cmd: CMDS[i][0], kind: CMDS[i][1], size: CMDS[i][2] }))
    const n = Math.floor(now / 10_000), c = CMDS[n % CMDS.length], live = { id: 'demo-sg-live-' + n, at: n * 10_000, session: low.id, who: low.id, cmd: c[0], kind: c[1], size: c[2] }
    data.seismograph = { day: d0, events: [...past.filter(e => e.at <= now), live].sort((a, b) => a.at - b.at) }
  })
  if (!params.get('towerzoom')) setTimeout(() => { const lf = lobby(), z = Number(params.get('sgzoom')) || 2.6; if (lf) tower.flyTo(z >= 4 ? { x: SX + SW / 2, y: lf.y - 20 } : { x: IX + 170, y: lf.y - 110 }, z) }, 800)
}
