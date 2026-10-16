// soundscape: the ambience button in the toolbar (off / low / high, default off) and the AudioContext it plays
// through, started inside a user gesture as browsers require. The tower's ambience (tower/features/ambience.js) makes the
// sounds: api.soundscape = { level() 0..1, ctx (null until a gesture while it is on), out, duck }. Every voice plays into
// `out`, one bus with a compressor on it, so the layers (tower ambience, a floor's close-up sounds, one-off effects) never
// sum past a cap; `duck` (0..1) is how far floor-sounds.js has the camera on one floor, and the tower ambience dips under it.
const KEY = 'agent-office.soundscape'
const MODES = [
  { id: 'off', icon: '🔇', label: 'off', gain: 0 },
  { id: 'low', icon: '🔈', label: 'low', gain: 0.45 },
  { id: 'high', icon: '🔊', label: 'high', gain: 1 },
]

export default function init(api) {
  let mode = 'off', ctx = null, bus = null
  try { const m = localStorage.getItem(KEY); if (MODES.some(x => x.id === m)) mode = m } catch {}
  const cur = () => MODES.find(x => x.id === mode)
  function wake() {
    if (!cur().gain || document.hidden) { if (ctx?.state === 'running') ctx.suspend().catch(() => {}); return }
    if (!ctx) try { ctx = new AudioContext() } catch { return }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  }
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { if (cur().gain && ctx?.state !== 'running') wake() }, { capture: true })
  document.addEventListener('visibilitychange', () => setTimeout(wake, document.hidden ? 500 : 0))

  const btn = document.createElement('button'); btn.className = 'hbtn'
  const paint = () => { btn.textContent = cur().icon; btn.title = `Office ambience: ${cur().label} (click to change)` }
  paint()
  btn.onclick = () => {
    mode = MODES[(MODES.findIndex(x => x.id === mode) + 1) % MODES.length].id
    try { localStorage.setItem(KEY, mode) } catch {}
    paint()
    setTimeout(wake, cur().gain ? 0 : 500)   // off: let the ambience fade out first
    api.toast(`Office ambience: ${cur().label}`)
  }
  document.getElementById('tbAlerts').append(btn)
  function out() {
    if (!ctx) return null
    if (bus?.context !== ctx) {
      const comp = ctx.createDynamicsCompressor()
      comp.threshold.value = -20; comp.knee.value = 10; comp.ratio.value = 8; comp.attack.value = 0.004; comp.release.value = 0.3
      bus = ctx.createGain(); bus.gain.value = 0.9; bus.connect(comp).connect(ctx.destination)
    }
    return bus
  }
  api.soundscape = { level: () => document.hidden ? 0 : cur().gain, get ctx() { return ctx }, get out() { return out() }, duck: 0, button: btn }
}
