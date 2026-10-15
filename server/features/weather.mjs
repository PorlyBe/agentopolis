// weather: current conditions and today's sun times from Open-Meteo for a coarse location, attached as snap.weather.
// The location comes from the machine's time zone (a city per zone), or AGENT_OFFICE_LAT/LON, or --lat/--lon.
// No IP geolocation; the only request is the forecast for that rounded point.
const CITIES = {
  'Australia/Sydney': ['Sydney', -33.87, 151.21], 'Australia/Melbourne': ['Melbourne', -37.81, 144.96], 'Australia/Brisbane': ['Brisbane', -27.47, 153.03],
  'Australia/Perth': ['Perth', -31.95, 115.86], 'Australia/Adelaide': ['Adelaide', -34.93, 138.6], 'Australia/Hobart': ['Hobart', -42.88, 147.33],
  'Australia/Darwin': ['Darwin', -12.46, 130.84], 'Pacific/Auckland': ['Auckland', -36.85, 174.76], 'Pacific/Honolulu': ['Honolulu', 21.31, -157.86],
  'Asia/Tokyo': ['Tokyo', 35.68, 139.69], 'Asia/Seoul': ['Seoul', 37.57, 126.98], 'Asia/Shanghai': ['Shanghai', 31.23, 121.47],
  'Asia/Hong_Kong': ['Hong Kong', 22.32, 114.17], 'Asia/Taipei': ['Taipei', 25.03, 121.57], 'Asia/Manila': ['Manila', 14.6, 120.98],
  'Asia/Singapore': ['Singapore', 1.35, 103.82], 'Asia/Kuala_Lumpur': ['Kuala Lumpur', 3.14, 101.69], 'Asia/Bangkok': ['Bangkok', 13.76, 100.5],
  'Asia/Ho_Chi_Minh': ['Ho Chi Minh City', 10.82, 106.63], 'Asia/Jakarta': ['Jakarta', -6.21, 106.85], 'Asia/Kolkata': ['Delhi', 28.61, 77.21],
  'Asia/Calcutta': ['Delhi', 28.61, 77.21], 'Asia/Dubai': ['Dubai', 25.2, 55.27], 'Asia/Karachi': ['Karachi', 24.86, 67.0],
  'Asia/Jerusalem': ['Jerusalem', 31.77, 35.21], 'Asia/Tel_Aviv': ['Tel Aviv', 32.09, 34.78], 'Asia/Riyadh': ['Riyadh', 24.71, 46.68],
  'Europe/Istanbul': ['Istanbul', 41.01, 28.98], 'Europe/London': ['London', 51.51, -0.13], 'Europe/Dublin': ['Dublin', 53.35, -6.26],
  'Europe/Lisbon': ['Lisbon', 38.72, -9.14], 'Europe/Madrid': ['Madrid', 40.42, -3.7], 'Europe/Paris': ['Paris', 48.86, 2.35],
  'Europe/Brussels': ['Brussels', 50.85, 4.35], 'Europe/Amsterdam': ['Amsterdam', 52.37, 4.9], 'Europe/Berlin': ['Berlin', 52.52, 13.4],
  'Europe/Zurich': ['Zurich', 47.38, 8.54], 'Europe/Rome': ['Rome', 41.9, 12.5], 'Europe/Vienna': ['Vienna', 48.21, 16.37],
  'Europe/Prague': ['Prague', 50.08, 14.44], 'Europe/Warsaw': ['Warsaw', 52.23, 21.01], 'Europe/Stockholm': ['Stockholm', 59.33, 18.07],
  'Europe/Oslo': ['Oslo', 59.91, 10.75], 'Europe/Copenhagen': ['Copenhagen', 55.68, 12.57], 'Europe/Helsinki': ['Helsinki', 60.17, 24.94],
  'Europe/Athens': ['Athens', 37.98, 23.73], 'Europe/Bucharest': ['Bucharest', 44.43, 26.1], 'Europe/Kiev': ['Kyiv', 50.45, 30.52],
  'Europe/Kyiv': ['Kyiv', 50.45, 30.52], 'Europe/Moscow': ['Moscow', 55.76, 37.62], 'Europe/Belgrade': ['Belgrade', 44.79, 20.45],
  'Europe/Budapest': ['Budapest', 47.5, 19.04], 'Europe/Ljubljana': ['Ljubljana', 46.06, 14.51], 'Europe/Zagreb': ['Zagreb', 45.81, 15.98],
  'Africa/Cairo': ['Cairo', 30.04, 31.24], 'Africa/Johannesburg': ['Johannesburg', -26.2, 28.05], 'Africa/Lagos': ['Lagos', 6.52, 3.38],
  'Africa/Nairobi': ['Nairobi', -1.29, 36.82], 'Africa/Casablanca': ['Casablanca', 33.57, -7.59],
  'America/New_York': ['New York', 40.71, -74.01], 'America/Toronto': ['Toronto', 43.65, -79.38], 'America/Chicago': ['Chicago', 41.88, -87.63],
  'America/Denver': ['Denver', 39.74, -104.99], 'America/Phoenix': ['Phoenix', 33.45, -112.07], 'America/Los_Angeles': ['Los Angeles', 34.05, -118.24],
  'America/Vancouver': ['Vancouver', 49.28, -123.12], 'America/Anchorage': ['Anchorage', 61.22, -149.9], 'America/Mexico_City': ['Mexico City', 19.43, -99.13],
  'America/Bogota': ['Bogotá', 4.71, -74.07], 'America/Lima': ['Lima', -12.05, -77.04], 'America/Santiago': ['Santiago', -33.45, -70.67],
  'America/Sao_Paulo': ['São Paulo', -23.55, -46.63], 'America/Argentina/Buenos_Aires': ['Buenos Aires', -34.6, -58.38],
  'America/Buenos_Aires': ['Buenos Aires', -34.6, -58.38], 'America/Caracas': ['Caracas', 10.48, -66.9], 'America/Halifax': ['Halifax', 44.65, -63.57],
  'America/Montevideo': ['Montevideo', -34.9, -56.16], 'America/Panama': ['Panama City', 8.98, -79.52], 'America/Puerto_Rico': ['San Juan', 18.47, -66.11],
}
const EVERY = 15 * 60_000, STALE = 3 * 3600_000

const argv = process.argv.slice(2), arg = n => { const i = argv.indexOf(`--${n}`); return i === -1 ? undefined : argv[i + 1] }
function locate() {
  const lat = Number(arg('lat') ?? process.env.AGENT_OFFICE_LAT), lon = Number(arg('lon') ?? process.env.AGENT_OFFICE_LON)
  if (Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180) return { place: process.env.AGENT_OFFICE_PLACE || 'Here', lat, lon }
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone, c = CITIES[tz]
  return c ? { place: c[0], lat: c[1], lon: c[2] } : null
}
const loc = locate()

// WMO weather interpretation codes
const kindOf = c => c >= 95 ? 'storm' : (c >= 71 && c <= 77) || c === 85 || c === 86 ? 'snow' : (c >= 51 && c <= 57) ? 'drizzle'
  : (c >= 61 && c <= 67) || (c >= 80 && c <= 82) ? 'rain' : c === 45 || c === 48 ? 'fog' : c >= 2 ? 'clouds' : 'clear'

let reading = null, lastTry = 0, busy = false
async function refresh() {
  busy = true; lastTry = Date.now()
  try {
    const q = new URLSearchParams({
      latitude: loc.lat.toFixed(2), longitude: loc.lon.toFixed(2), timezone: 'auto', forecast_days: '1',
      current: 'temperature_2m,weather_code,cloud_cover,precipitation,wind_speed_10m,wind_direction_10m,is_day', daily: 'sunrise,sunset',
    })
    const r = await fetch('https://api.open-meteo.com/v1/forecast?' + q, { signal: AbortSignal.timeout(8000) })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const j = await r.json(), cur = j.current, off = (j.utc_offset_seconds || 0) * 1000
    // daily times are the location's wall clock without an offset
    const at = s => s ? Date.parse(s + 'Z') - off : null
    reading = {
      place: loc.place, temp: Math.round(cur.temperature_2m), code: cur.weather_code, kind: kindOf(cur.weather_code),
      wind: Math.round(cur.wind_speed_10m), windDir: cur.wind_direction_10m, clouds: cur.cloud_cover, precip: cur.precipitation,
      isDay: !!cur.is_day, sunrise: at(j.daily?.sunrise?.[0]), sunset: at(j.daily?.sunset?.[0]), updated: Date.now(),
    }
  } catch (e) { console.error('[weather]', e.message) } finally { busy = false }
}
if (loc) refresh()

export default {
  snapshot(snap) {
    if (!loc) return
    if (!busy && Date.now() - lastTry > EVERY) refresh()
    if (reading && Date.now() - reading.updated < STALE) snap.weather = reading
  },
}
