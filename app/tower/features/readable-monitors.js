// readable-monitors: zoomed in on a desk (zoom ≥ 3.5), each working monitor is a tiny live terminal: the current tool's
// command, file or pattern (server ext 'readable-monitors' carries the real command and an Edit's changed line, else the
// snapshot's tool/detail), typed out in a 3×5 pixel font with a blinking cursor. Idle monitors show a dim prompt; while the
// screensaver runs they are left to its bouncing logo. ?demo=readablemonitors flies from busy desk to busy desk.
const ZMIN = 3.2, ZFULL = 3.6, CPS = 34, KEEP = 4, ROWS = 4, IDLE = 30 * 60_000, SS_CYCLE = 30_000, SS_SLEEP = 22_000
const busySession = st => st === 'tool' || st === 'thinking' || st === 'delegating' || st === 'building'
const busyAgent = st => !!st && st !== 'idle' && st !== 'done'
const INK = { bg: '#07110b', txt: '#b9f3c6', ps: '#5fd17a', add: '#7be08f', del: '#ff8a7a', note: '#86a894', idle: '#2f5a3e' }

// 3 px wide, 6 rows (row 5 is the descender); one octal digit per row, 4 = left pixel
const G = {}
;`0 75557 1 26227 2 61247 3 61216 4 55711 5 74616 6 34757 7 71222 8 75757 9 75716
A 25755 B 65656 C 34443 D 65556 E 74647 F 74644 G 34553 H 55755 I 72227 J 11152 K 55655 L 44447 M 57755 N 65555 O 25552
P 65644 Q 25573 R 65655 S 34216 T 72222 U 55557 V 55552 W 55775 X 55255 Y 55222 Z 71247
a 035530 b 465560 c 034430 d 135530 e 037430 f 127220 g 035316 h 465550 i 202220 j 101152 k 456650 l 622270 m 067750
n 065550 o 025520 p 065564 q 035531 r 056440 s 034160 t 272210 u 055530 v 055520 w 055750 x 052250 y 055316 z 071470
. 000020 , 000024 : 002020 ; 002024 - 007000 _ 000007 = 070700 + 027200 / 112440 \\ 442110 | 222220 ( 122210 ) 422240
[ 644460 ] 311130 { 326230 } 623260 < 124210 > 421240 ! 222020 ? 612020 " 550000 ' 220000 \` 420000 * 052500 # 575750
$ 367360 % 512450 & 252530 @ 257430 ^ 250000 ~ 003600`.split(/\s+/).reduce((a, x, i, all) => { if (i % 2 === 0 && all[i + 1]) G[x] = all[i + 1].padEnd(6, '0'); return a }, 0)

const base = p => String(p).split('/').filter(Boolean).pop() || p
function fallback(tool, detail) {
  const d = detail || ''
  switch (tool) {
    case 'Bash': return ['$ ' + d]
    case 'Read': return ['cat ' + d]
    case 'Edit': case 'Write': case 'MultiEdit': case 'NotebookEdit': return ['vi ' + d]
    case 'Grep': return ['rg ' + d]
    case 'Glob': return ['ls ' + d]
    case 'WebFetch': return ['curl ' + d]
    case 'WebSearch': return ['? ' + d]
    case 'Agent': case 'Task': return ['spawn', d]
    default: return [(tool || '').replace(/^mcp__\w+__/, '').toLowerCase() + (d ? ' ' + d : '')]
  }
}
// an entry's lines as [text, colour]; files shrink to their name so the tiny screen shows what matters
function entryOf(o) {
  const m = o.ext?.['readable-monitors']
  const raw = m?.lines?.length && m.tool === o.tool ? m.lines : fallback(o.tool, o.detail)
  return raw.map((t, i) => {
    if (i === 0) {
      const [v, ...r] = t.split(' '), arg = r.join(' ')
      t = /^(cat|vi)$/.test(v) ? `${v} ${base(arg)}` : t
      return [t.startsWith('$ ') ? t : '$ ' + t, INK.txt]
    }
    return [t, t[0] === '+' ? INK.add : t[0] === '-' ? INK.del : INK.note]
  })
}

export default function init(api, tower) {
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), all = params.getAll('demo')
  const demo = all.includes('readablemonitors'), ssDemo = all.includes('screensaver'), t0 = Date.now()
  const terms = new Map()   // person key -> { sig, hist: [{ lines, at }] }
  let lastPrompt = 0

  tower.on('sync', snap => {
    let m = 0
    for (const s of snap.sessions || []) m = Math.max(m, s.ext?.walkabout?.at || 0)
    lastPrompt = m
  })
  const asleep = () => ssDemo ? (Date.now() - t0) % SS_CYCLE < SS_SLEEP : api.live !== false && Date.now() - lastPrompt > IDLE && lastPrompt > 0

  function screens() {
    const out = []
    for (const f of tower.floors) {
      if (f.kind !== 'session' || !f.sessionId) continue
      const d = tower.desk(f.sessionId); if (!d) continue
      const me = tower.person(f.sessionId), s = f.session
      out.push({ f, m: d.monitor, key: f.sessionId, o: s, sitter: me, on: !!me && !!s && me.floor === f.id && me.atDesk && busySession(s.state) })
      for (const a of d.agents || []) {
        const p = tower.people.find(p => p.kind === 'agent' && p.floor === f.id && p.slot === a.k && p.atDesk && !p.leaving)
        const ag = p?.data
        out.push({ f, m: a.monitor, key: p?.id || `${f.sessionId}:${a.k}`, o: ag, sitter: p, on: !!p && !!ag && busyAgent(ag.state) })
      }
    }
    return out
  }

  function feed(sc, now) {
    let t = terms.get(sc.key)
    if (!t) terms.set(sc.key, t = { sig: null, hist: [] })
    const o = sc.o
    if (!sc.on || !o?.tool) return t
    const sig = (o.ext?.['readable-monitors']?.id || '') + '|' + o.tool + '|' + o.detail
    if (sig !== t.sig) {
      t.sig = sig
      t.hist.push({ lines: entryOf(o), at: now })
      if (t.hist.length > KEEP) t.hist.shift()
    }
    return t
  }

  // wrap the history into rows of cols chars; the newest entry types out at CPS
  function rows(t, cols, now, state) {
    const out = []
    t.hist.forEach((e, i) => {
      let budget = i === t.hist.length - 1 ? Math.floor((now - e.at) / 1000 * CPS) + 2 : Infinity
      e.lines.forEach(([txt, col], j) => {
        if (budget <= 0) return
        const shown = txt.slice(0, budget); budget -= txt.length
        const cap = j === 0 ? Infinity : cols
        for (let k = 0; k < Math.min(shown.length, cap) || k === 0; k += cols) out.push({ txt: shown.slice(k, Math.min(k + cols, cap)), col })
      })
    })
    const last = t.hist[t.hist.length - 1]
    const typing = last && (now - last.at) / 1000 * CPS + 2 < last.lines.reduce((n, [x]) => n + x.length, 0)
    if (!typing && state !== 'tool') out.push({ txt: '$ ' + (state === 'thinking' ? '|/-\\'[Math.floor(now / 160) % 4] : ''), col: INK.ps })
    return out.slice(-ROWS)
  }

  function glyphs(c, txt, x, y, u, col) {
    c.fillStyle = col; c.beginPath()
    for (let i = 0; i < txt.length; i++) {
      const g = G[txt[i]] || (txt[i] === ' ' ? null : G[txt[i].toUpperCase()] || G['?']); if (!g) continue
      for (let r = 0; r < 6; r++) { const b = +g[r]; if (!b) continue; for (let k = 0; k < 3; k++) if (b & (4 >> k)) c.rect(x + (i * 4 + k) * u, y + r * u, u, u) }
    }
    c.fill()
  }

  tower.on('overlay', (c, now) => {
    const z = tower.zoom; if (z < ZMIN) return
    const alpha = Math.min(1, (z - ZMIN) / (ZFULL - ZMIN)), dpr = devicePixelRatio || 1
    const W = tower.canvas.clientWidth, H = tower.canvas.clientHeight, sleeping = asleep()
    const blink = Math.floor(now / 530) % 2 === 0
    for (const sc of screens()) {
      const t = feed(sc, now)
      if (!sc.sitter || (!sc.on && sleeping)) continue
      const p = tower.worldToScreen(sc.m.x + 1, sc.m.y + 1), side = (sc.m.w - 2) * z
      if (p.x > W || p.y > H || p.x + side < 0 || p.y + side < 0) continue
      if (tower.people.some(q => q !== sc.sitter && q.floor === sc.f.id && !q.seated && Math.abs(q.x - (sc.m.x + 5)) < 8)) continue
      const sx = Math.round(p.x * dpr) / dpr, sy = Math.round(p.y * dpr) / dpr, sw = Math.round(side * dpr) / dpr
      const u = Math.max(1, Math.floor(sw * dpr / 40) / dpr), cols = Math.max(4, Math.floor((sw - 2 * u) / (4 * u))), pad = u
      c.save(); c.globalAlpha = alpha
      c.beginPath(); c.rect(sx, sy, sw, sw); c.clip()
      c.fillStyle = INK.bg; c.fillRect(sx, sy, sw, sw)
      if (!sc.on) {
        c.globalAlpha = alpha * 0.8
        glyphs(c, '~ $', sx + pad, sy + pad, u, INK.idle)
        if (blink) { c.fillStyle = INK.idle; c.fillRect(sx + pad + 16 * u, sy + pad, 3 * u, 5 * u) }
      } else {
        const rs = rows(t, cols, now, sc.o.state)
        rs.forEach((r, i) => {
          const y = sy + pad + i * 7 * u
          if (r.txt.startsWith('$ ')) { glyphs(c, '$', sx + pad, y, u, INK.ps); glyphs(c, ' ' + r.txt.slice(2), sx + pad + 4 * u, y, u, r.col) }
          else glyphs(c, r.txt, sx + pad, y, u, r.col)
        })
        const lr = rs[rs.length - 1]
        if (lr && blink) { c.fillStyle = INK.txt; c.fillRect(sx + pad + Math.min(lr.txt.length, cols - 1) * 4 * u + (lr.txt.length >= cols ? 3 * u : 0), sy + pad + (rs.length - 1) * 7 * u + 5 * u, 3 * u, u) }
        c.fillStyle = 'rgba(255,255,255,.04)'; for (let y = 0; y < sw; y += 2 * u) c.fillRect(sx, sy + y, sw, u / 2)
      }
      c.restore()
    }
    const live = new Set(tower.people.map(p => p.id).concat(tower.floors.map(f => f.sessionId)))
    for (const k of terms.keys()) if (!live.has(k) && !k.includes(':')) terms.delete(k)
  })

  if (demo) {
    let i = 0
    const hop = () => {
      const busy = screens().filter(s => s.on && s.o?.tool), floors = [...new Set(busy.map(s => s.f))]
      const f = floors[i++ % Math.max(1, floors.length)] || tower.floors.find(f => f.kind === 'session'); if (!f) return
      const d = tower.desk(f.sessionId), m = busy.find(s => s.f === f)?.m || d?.monitor
      if (m) tower.flyTo({ x: m.x + 30, y: m.y + 4 }, 6)
    }
    tower.on('mode', on => { if (on) { setTimeout(hop, 1500); setInterval(hop, 14000) } })
  }
}
