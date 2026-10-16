// The user at his desk in the CEO office: who needs him ('attention'), his ringing phone and desk note, and opening the
// first of them in Orca. Drawn by render.js; the note card's text is overlay.js's.
export function createCeo(st) {
  const { api } = st
  const needsPaul = () => (st.snap?.sessions || []).filter(s => s.state === 'attention' && s.running !== false)
  const ringing = now => needsPaul().length > 0 && (now % 2000) < 1200
  let paulSprite = null
  function paulSheet() {   // char_0 (the suit) recoloured charcoal with a gold pocket square, so the user is nobody else
    if (paulSprite) return paulSprite
    const src = api.charSheet(0, 0); if (!src?.width) return null
    const cv = document.createElement('canvas'); cv.width = src.width; cv.height = 32
    const x = cv.getContext('2d'); x.drawImage(src, 0, 0, src.width, 32, 0, 0, src.width, 32)
    const d = x.getImageData(0, 0, cv.width, 32), p = d.data
    for (let i = 0; i < p.length; i += 4) {
      const [r, g, b] = [p[i], p[i + 1], p[i + 2]]
      if (p[i + 3] && b > r + 30 && b > g + 10) { const l = (r + g + b) / 3; p[i] = p[i + 1] = Math.round(26 + l * 0.42); p[i + 2] = Math.round(34 + l * 0.46) }
    }
    x.putImageData(d, 0, 0)
    return (paulSprite = cv)
  }
  function drawPaul(c, now) {
    const slots = st.slots
    if (!slots) return
    const sh = api.tower?.avatar?.sheet() || paulSheet(); if (!sh) return   // features/avatar.js restyles him
    const y = slots.floor.y, x = slots.seat
    // mostly at work, now and then reading the paper; looking up while the phone rings
    const frame = needsPaul().length ? 3 : Math.floor(now / 7000) % 3 === 2 ? 5 + Math.floor(now / 600) % 2 : 3 + (Math.floor(now / 900) % 4 === 0 ? 1 : 0)
    c.drawImage(sh, frame * 16, 0, 16, 32, Math.round(x - 8), Math.round(y - 46), 16, 32)   // a tall chair: he sits above the desk
  }
  const R = (c, col, x, y, w, h) => { c.fillStyle = col; c.fillRect(x, y, w, h) }
  function drawDesk(c, now) {
    const slots = st.slots
    if (!slots) return
    const p = slots.phone, n = slots.note, ring = ringing(now), list = needsPaul()
    const jx = ring ? (Math.floor(now / 45) % 2 ? 1 : -1) : 0, jy = ring ? -1 - (Math.floor(now / 90) % 2) : 0
    R(c, '#1d1d24', p.x + 1, p.y + 3, 11, 4); R(c, '#3a3a46', p.x + 2, p.y + 3, 9, 1); R(c, '#c9a25a', p.x + 5, p.y + 5, 3, 1)
    R(c, '#7a1f22', p.x + jx, p.y + jy, 13, 3); R(c, '#9a2a2e', p.x + jx, p.y + jy, 13, 1); R(c, '#7a1f22', p.x + jx, p.y + jy + 2, 3, 2); R(c, '#7a1f22', p.x + 10 + jx, p.y + jy + 2, 3, 2)
    if (ring) {
      c.fillStyle = '#ffd84a'
      for (const [sx, dir] of [[p.x - 3, -1], [p.x + 15, 1]]) { c.fillRect(sx, p.y - 1, 1, 3); c.fillRect(sx + dir * 2, p.y - 3, 1, 5); c.fillRect(sx + dir * 4, p.y - 2, 1, 3) }
    }
    R(c, '#5a4030', n.x + 4, n.y + n.h - 2, 2, 2)
    R(c, list.length ? '#fff4c0' : '#f4efe0', n.x, n.y, n.w, n.h - 2); R(c, 'rgba(0,0,0,.15)', n.x + n.w - 1, n.y, 1, n.h - 2)
    if (list.length) { R(c, '#d8383a', n.x + 2, n.y + 2, 6, 2); for (let k = 0; k < Math.min(3, list.length); k++) R(c, '#6a5a4a', n.x + 2, n.y + 5 + k * 2, 6, 1) }
    else for (let k = 0; k < 3; k++) R(c, '#c8bca4', n.x + 2, n.y + 2 + k * 3, 6, 1)
  }
  async function focusFirst() {
    const s = needsPaul()[0]
    if (!s) return api.toast('Nobody needs you right now')
    try {
      const r = await fetch('/api/focus', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: s.id }) })
      const j = await r.json(); api.toast(r.ok ? `Opened ${s.title} in Orca` : j.error)
    } catch { api.toast('Agentopolis server is offline') }
  }
  return { needsPaul, drawPaul, drawDesk, focusFirst }
}
