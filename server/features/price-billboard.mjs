// price-billboard: the top ten coins by market cap in USD with their 24h change and the last day of prices, from one
// CoinGecko /coins/markets call (plain GET, no key, nothing about the user), attached as snap.priceBillboard.
// Refreshed at most once a minute; a reading older than ten minutes counts as offline.
const EVERY = 60_000, STALE = 10 * 60_000, TOP = 10
const URL_ = `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${TOP}&page=1&sparkline=true&price_change_percentage=24h`

const state = { list: null, at: 0 }
let busy = false, lastTry = 0

async function refresh() {
  busy = true; lastTry = Date.now()
  try {
    const r = await fetch(URL_, { signal: AbortSignal.timeout(8000), credentials: 'omit', headers: { accept: 'application/json' } })
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const list = (await r.json()).filter(c => Number.isFinite(c?.current_price)).map(c => ({
      id: String(c.id), sym: String(c.symbol || '').toUpperCase().slice(0, 6), name: String(c.name || '').slice(0, 24),
      rank: c.market_cap_rank ?? null, usd: c.current_price,
      ch24: Number.isFinite(c.price_change_percentage_24h) ? c.price_change_percentage_24h : null,
      spark: (c.sparkline_in_7d?.price || []).slice(-24),
    }))
    if (list.length) { state.list = list; state.at = Date.now() }
  } catch (e) { console.error('[price-billboard]', e.message) }
  finally { busy = false }
}

function snapshot(snap) {
  if (!busy && Date.now() - lastTry > EVERY) refresh()
  snap.priceBillboard = state.list && Date.now() - state.at < STALE ? { ok: true, at: state.at, list: state.list } : { ok: false, at: state.at || null }
}

export default { snapshot }
