// price-billboard: a lit billboard on tall legs on the tower's own roof, above the terrace, cycling one coin at a time through the top ten by market cap: price in USD, a ▲/▼ and the 24h change, and a
// sparkline of the last day (server snap.priceBillboard, CoinGecko, cached a minute). No reading for ten minutes: "— offline". ?demo=pricebillboard.

const W = 104, H = 46, LEGS = 40, AT = 36
const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(Math.round(x), Math.round(y), w, h) }
const UP = '#3fe08a', DOWN = '#ff5a4e', FLAT = '#c8ccd4'
const ROT = 6000, SLIDE = 420
const TINT = { BTC: '#f7931a', ETH: '#7b8ff0', USDT: '#26a17b', XRP: '#c8ccd4', BNB: '#f3ba2f', SOL: '#a46cff', USDC: '#3a87d8', DOGE: '#c2a633',
  ADA: '#4a78e0', TRX: '#ff3a3a', STETH: '#3aa8ff', BCH: '#0ac18e', TON: '#0098ea', LINK: '#3a6ae0', AVAX: '#e84142', HYPE: '#5fe0c0', XLM: '#9aa8c8', SUI: '#4da2ff' }
const tintOf = sym => TINT[sym] || `hsl(${[...sym].reduce((h, ch) => h * 31 + ch.charCodeAt(0), 7) % 360} 70% 62%)`

export default function init(api, tower) {
  const { Z, font } = tower, esc = api.esc || (s => String(s))
  const params = new URLSearchParams(location.search + '&' + location.hash.slice(1)), demo = params.getAll('demo').includes('pricebillboard')
  let data = null

  if (demo) tower.on('snapshot', snap => {
    const t = Date.now() / 1000, wave = (k, n) => Array.from({ length: n }, (_, i) => 1 + 0.012 * Math.sin(i / 4 + k) + 0.006 * Math.sin(i * 1.7 + k * 3))
    const btc = 67000 * (1 + 0.002 * Math.sin(t / 7)), bch = 412 * (1 + 0.003 * Math.cos(t / 5))
    const coin = (i, sym, name, usd, ch) => ({ id: sym.toLowerCase(), sym, name, rank: i + 1, usd, ch24: ch + Math.sin(t / 9 + i) * 0.2, spark: wave(i, 24).map((v, j) => usd * v * (1 - ch / 100 + j * ch / 2400)) })
    snap.priceBillboard = { ok: true, at: Date.now(), list: [coin(0, 'BTC', 'Bitcoin', btc, 2.41), coin(1, 'ETH', 'Ethereum', 3480, -0.8), coin(2, 'USDT', 'Tether', 1, 0.01),
      coin(3, 'XRP', 'XRP', 2.31, 4.2), coin(4, 'BNB', 'BNB', 712, 1.1), coin(5, 'SOL', 'Solana', 182, -3.6), coin(6, 'USDC', 'USDC', 1, 0),
      coin(7, 'DOGE', 'Dogecoin', 0.231, 6.4), coin(8, 'ADA', 'Cardano', 0.78, -1.9), coin(9, 'BCH', 'Bitcoin Cash', bch, -1.37)] }
  })
  tower.on('sync', snap => { data = snap.priceBillboard || null })

  function board() {
    const f = tower.floors.at(-1), base = (f ? f.y : 0) - 5, x = tower.interior.x0 + AT
    return { x, y: base - LEGS - H, w: W, h: H, base, on: 'roof' }
  }
  const list = () => data?.ok && Array.isArray(data.list) ? data.list : []
  // the coin on show and, while the sign flips, the one leaving: q 0..1 through the slide
  function showing(now) {
    const l = list(); if (!l.length) return null
    const n = Math.floor(now / ROT), t = now - n * ROT, q = Math.min(1, t / SLIDE)
    return { cur: l[n % l.length], prev: q < 1 ? l[(n - 1 + l.length) % l.length] : null, q: 1 - (1 - q) ** 3, i: n % l.length, n: l.length }
  }
  const colOf = ch => ch == null || Math.abs(ch) < 0.005 ? FLAT : ch > 0 ? UP : DOWN
  const money = v => v >= 1000 ? '$' + Math.round(v).toLocaleString('en-US') : v >= 1 ? '$' + v.toFixed(2) : '$' + v.toPrecision(3)
  const pct = ch => ch == null ? '' : `${ch > 0 ? '+' : ''}${ch.toFixed(2)}%`
  const body = b => ({ x: b.x + 3, y: b.y + 10, w: b.w - 6, h: 29 })
  const spark = r => ({ x: r.x + r.w - 38, y: r.y + 9, w: 36, h: 17 })

  function arrow(c, x, y, up, col) {
    for (let i = 0; i < 3; i++) R(c, col, x + 2 - i, up ? y + i : y + 2 - i, 1 + i * 2, 1)
  }
  function drawSpark(c, s, pts, col) {
    if (!pts || pts.length < 2) return
    const lo = Math.min(...pts), hi = Math.max(...pts), span = hi - lo || 1
    c.fillStyle = col
    let py = null
    for (let x = 0; x < s.w; x++) {
      const v = pts[Math.round(x * (pts.length - 1) / (s.w - 1))], y = Math.round(s.y + s.h - 1 - (v - lo) / span * (s.h - 1))
      if (py == null) c.fillRect(s.x + x, y, 1, 1)
      else c.fillRect(s.x + x, Math.min(py, y), 1, Math.abs(py - y) + 1)
      py = y
    }
  }

  tower.on('items', out => {
    const b = board()
    out.push({ z: Z.BEHIND + 5, draw: (c, now) => {
      for (const lx of [b.x + 14, b.x + b.w - 16]) { R(c, '#3a3d46', lx, b.y + b.h, 3, LEGS); R(c, '#2a2c33', lx - 2, b.base - 1, 7, 1) }
      for (let y = b.y + b.h + 8; y < b.base - 4; y += 12) { R(c, '#3a3d46', b.x + 16, y, b.w - 30, 1); for (let i = 0; i < 8; i++) R(c, '#33363e', b.x + 16 + Math.round(i * (b.w - 30) / 8), y + Math.round(i * 11 / 8), 2, 1) }
      // catwalk and the two lamps on arms above
      R(c, '#4a4d56', b.x - 2, b.y + b.h, b.w + 4, 2)
      for (const lx of [b.x + 18, b.x + b.w - 22]) { R(c, '#3a3d46', lx + 1, b.y - 6, 1, 6); R(c, '#2a2c33', lx - 1, b.y - 8, 6, 3) }
      R(c, '#22242c', b.x - 2, b.y - 2, b.w + 4, b.h + 4)
      R(c, '#0d1118', b.x, b.y, b.w, b.h)
      R(c, '#0ac18e', b.x, b.y, b.w, 8); R(c, '#0a9a72', b.x, b.y + 7, b.w, 1)
      const r = body(b), sh = showing(now)
      R(c, '#141a24', r.x, r.y, r.w, r.h)
      if (!sh) { if (Math.floor(now / 900) % 2) R(c, '#5a3030', r.x + r.w - 6, r.y + 12, 3, 3) }
      else {
        c.save(); c.beginPath(); c.rect(r.x, r.y, r.w, r.h); c.clip()
        const slot = (d, dy) => {
          const col = colOf(d.ch24), sp = spark(r)
          R(c, tintOf(d.sym), r.x + 1, r.y + 2 + dy, 2, r.h - 4)
          arrow(c, sp.x - 1, r.y + 4 + dy, d.ch24 >= 0, col)
          R(c, '#1c2430', sp.x - 1, sp.y - 1 + dy, sp.w + 2, sp.h + 2)
          drawSpark(c, { ...sp, y: sp.y + dy }, d.spark, col)
        }
        if (sh.prev) slot(sh.prev, -sh.q * r.h)
        slot(sh.cur, (1 - sh.q) * r.h)
        c.restore()
        const dw = sh.n * 4 - 2, dx = b.x + Math.round((b.w - dw) / 2)
        for (let i = 0; i < sh.n; i++) R(c, i === sh.i ? '#e8f4ee' : '#3a4250', dx + i * 4, b.y + b.h - 4, 2, 2)
      }
      if (!data?.ok) R(c, 'rgba(13,17,24,.35)', b.x, b.y + 8, b.w, b.h - 8)
    } })
  })

  tower.on('glow', (c, now, n) => {
    const b = board(), k = Math.max(0.12, n)
    for (const lx of [b.x + 20, b.x + b.w - 20]) {
      const g = c.createLinearGradient(0, b.y - 6, 0, b.y + b.h)
      g.addColorStop(0, `rgba(255,240,200,${0.3 * n})`); g.addColorStop(1, 'rgba(255,240,200,0)')
      c.fillStyle = g; c.beginPath(); c.moveTo(lx - 3, b.y - 6); c.lineTo(lx + 3, b.y - 6); c.lineTo(lx + 30, b.y + b.h); c.lineTo(lx - 30, b.y + b.h); c.closePath(); c.fill()
    }
    const g = c.createRadialGradient(b.x + b.w / 2, b.y + b.h / 2, 4, b.x + b.w / 2, b.y + b.h / 2, b.w * 0.75)
    g.addColorStop(0, `rgba(10,193,142,${0.28 * k})`); g.addColorStop(1, 'rgba(10,193,142,0)')
    c.fillStyle = g; c.fillRect(b.x - b.w / 2, b.y - b.h, b.w * 2, b.h * 3)
    if (n > 0.05) { c.fillStyle = `rgba(120,255,200,${0.07 * n})`; c.fillRect(b.x, b.y, b.w, b.h) }
  })

  tower.on('overlay', (c, now) => {
    const b = board(), k = tower.zoom
    if (k < 0.9) return
    const p0 = tower.worldToScreen(b.x, b.y)
    if (p0.x > c.canvas.width || p0.x + b.w * k < 0 || p0.y > c.canvas.height || p0.y + b.h * k < 0) return
    c.save(); c.textBaseline = 'middle'
    c.beginPath(); c.rect(p0.x, p0.y, b.w * k, b.h * k); c.clip()
    const hs = Math.max(5, 5.5 * k)
    c.font = font(hs, 800); c.fillStyle = '#04241a'; c.textAlign = 'center'
    c.fillText('TOP 10 CRYPTO · LIVE', p0.x + b.w * k / 2, p0.y + 4 * k + 0.5)
    const r = body(b), sh = showing(now)
    const q0 = tower.worldToScreen(r.x, r.y)
    c.beginPath(); c.rect(q0.x, q0.y, r.w * k, r.h * k); c.clip()
    if (!sh) { c.textAlign = 'left'; c.font = font(Math.max(5, 5 * k), 700); c.fillStyle = '#9a8a8a'; c.fillText('— offline', q0.x + 6 * k, q0.y + r.h * k / 2) }
    else {
      const text = (d, dy) => {
        const x = q0.x + 6 * k, y = q0.y + dy * k
        c.textAlign = 'left'; c.font = font(Math.max(5, 6.4 * k), 800); c.fillStyle = tintOf(d.sym)
        c.fillText(d.sym, x, y + 6 * k)
        const sw = c.measureText(d.sym).width
        c.font = font(Math.max(4, 3.6 * k), 600); c.fillStyle = '#8a94a6'
        c.fillText(`#${d.rank ?? '?'} ${d.name}`.slice(0, 18), x + sw + 3 * k, y + 6.4 * k)
        c.font = font(Math.max(5, 8 * k), 800); c.fillStyle = '#f2f4f8'
        c.fillText(money(d.usd), x, y + 18 * k)
        c.font = font(Math.max(4, 4.4 * k), 700); c.fillStyle = colOf(d.ch24); c.textAlign = 'right'
        c.fillText(pct(d.ch24), q0.x + (r.w - 2) * k, y + 5.5 * k)
      }
      if (sh.prev) text(sh.prev, -sh.q * r.h)
      text(sh.cur, (1 - sh.q) * r.h)
    }
    c.restore()
  })

  tower.on('hover', (w, person) => {
    if (person) return null
    const b = board()
    if (w.x < b.x - 2 || w.x > b.x + b.w + 2 || w.y < b.y - 8 || w.y > b.y + b.h + 2) return null
    if (!data?.ok) return `<div class="t">📈 Price board</div><div>— offline${data?.at ? ` · last price ${new Date(data.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</div><div class="m">CoinGecko, refreshed every minute</div>`
    const line = d => `<div>${d.rank ?? ''}. <b>${esc(d.sym)}</b> ${esc(money(d.usd))} <span style="color:${colOf(d.ch24)}">${d.ch24 >= 0 ? '▲' : '▼'} ${esc(pct(d.ch24))}</span></div>`
    return `<div class="t">📈 Top 10 by market cap</div>${list().map(line).join('')}<div class="m">CoinGecko · ${new Date(data.at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} · 24h change · sparkline: last day</div>`
  })
}
