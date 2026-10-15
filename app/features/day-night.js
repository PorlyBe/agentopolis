// day-night: the real sun (snap.weather sunrise/sunset, else fixed clock hours) and the weather's gloom, shared as
// api.daylight for the tower's sky and night tint. ?time=HH:MM and ?weather=<kind> force both.
const params = new URLSearchParams(location.search + '&' + location.hash.slice(1))
const forcedTime = (params.get('time') || '').match(/^(\d{1,2}):(\d{2})$/)
const forcedKind = ['clear', 'clouds', 'rain', 'drizzle', 'storm', 'snow', 'fog'].includes(params.get('weather')) ? params.get('weather') : null
const sky = { weather: null }       // the latest snap.weather

const NIGHT = [38, 52, 120]
export const hourNow = () => {
  if (forcedTime) return (Number(forcedTime[1]) % 24) + Number(forcedTime[2]) / 60
  const d = new Date(); return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600
}
const hourOf = ms => { const d = new Date(ms); return d.getHours() + d.getMinutes() / 60 }
// Sunrise and sunset in local clock hours; the clock fallback matches the old fixed dawn/dusk.
export function sunHours() {
  const w = sky.weather
  if (w?.sunrise && w?.sunset) { const sr = hourOf(w.sunrise), ss = hourOf(w.sunset); if (ss > sr) return { sr, ss, real: true } }
  return { sr: 6.5, ss: 18.5, real: false }
}
// [hour, tint (multiplied over the room), tint strength, how much the lights show], placed around the sun
function keys() {
  const { sr, ss } = sunHours()
  const k = [[sr - 1.5, NIGHT, 0.62, 1], [sr, [255, 156, 120], 0.32, 0.45], [sr + 1.5, [255, 236, 200], 0.08, 0], [sr + 2.5, [255, 255, 255], 0, 0],
    [ss - 2, [255, 255, 255], 0, 0], [ss - 0.5, [255, 150, 70], 0.32, 0.25], [ss + 1, [140, 80, 120], 0.45, 0.7], [ss + 2.5, NIGHT, 0.62, 1]]
    .map(([h, ...r]) => [Math.max(0.01, Math.min(23.99, h)), ...r]).sort((a, b) => a[0] - b[0])
  return [[0, NIGHT, 0.62, 1], ...k, [24, NIGHT, 0.62, 1]]
}
export function light(h) {
  const K = keys()
  let i = 0; while (K[i + 1][0] <= h && i < K.length - 2) i++
  const [h0, c0, a0, l0] = K[i], [h1, c1, a1, l1] = K[i + 1], t = h1 > h0 ? (h - h0) / (h1 - h0) : 0
  const m = (x, y) => x + (y - x) * t
  return { color: c0.map((v, j) => Math.round(m(v, c1[j]))), a: m(a0, a1), lights: m(l0, l1) }
}
export const weatherKind = () => forcedKind || sky.weather?.kind || null
// 0 = full daylight .. 1 = dark night
export const nightness = (h = hourNow()) => Math.min(1, light(h).a / 0.62)
// How much the weather dulls daylight: the room and street darken a little under heavy cloud and rain.
export function gloom() {
  const k = weatherKind(), cover = forcedKind ? (k === 'clear' ? 0 : 95) : sky.weather?.clouds ?? 0
  return ({ storm: 0.3, rain: 0.2, snow: 0.12, drizzle: 0.12, fog: 0.12 })[k] ?? (cover > 75 ? 0.1 * (cover - 75) / 25 : 0)
}

export default function init(api) {
  api.daylight = { hourNow, sunHours, nightness, gloom, weatherKind }    // the tower's sky, night tint and roof
  api.on('sync', snap => { sky.weather = snap.weather || null })
}
