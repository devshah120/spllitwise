const https = require('https');

// Rates for a base currency don't move fast enough to matter for splitting
// a bill — cache each base for half a day so the free rate API isn't hit on
// every single cross-currency expense.
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;
const cache = new Map(); // base currency -> { rates, fetchedAt }

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    https
      .get(url, (res) => {
        let body = '';
        res.on('data', (chunk) => {
          body += chunk;
        });
        res.on('end', () => {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        });
      })
      .on('error', reject);
  });
}

// Latest rates for `base`, as { CODE: rateFromBase }. Free, no API key —
// https://github.com/fawazahmed0/exchange-api's mirror at open.er-api.com.
// Returns null (never throws) when nothing usable is available, including
// on the very first call for a base with no network reachable, so callers
// decide how to degrade rather than the request 500ing.
async function getRates(base) {
  const key = base.toUpperCase();
  const cached = cache.get(key);
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.rates;
  }

  try {
    const data = await fetchJson(`https://open.er-api.com/v6/latest/${key}`);
    if (data.result !== 'success' || !data.rates) {
      return cached ? cached.rates : null;
    }
    cache.set(key, { rates: data.rates, fetchedAt: Date.now() });
    return data.rates;
  } catch {
    // A stale cached rate is still far more useful than failing outright —
    // only a genuinely first-ever request for this base has nothing to fall
    // back to.
    return cached ? cached.rates : null;
  }
}

// The raw multiplier to turn a `from`-currency amount into a `to`-currency
// one — 1 for the same currency in both directions, without ever touching
// the network. Exposed separately from [convert] so a caller converting
// several related figures (a total plus its per-person breakdown) can
// apply exactly the same rate to each rather than drifting between calls.
async function getRate(from, to) {
  const fromCode = (from || '').toUpperCase();
  const toCode = (to || '').toUpperCase();
  if (fromCode === toCode) return 1;

  const rates = await getRates(fromCode);
  if (!rates || typeof rates[toCode] !== 'number') return null;
  return rates[toCode];
}

// Converts an amount from one currency to another using the latest cached
// rates, rounded to 2 decimal places. Returns null when no rate is
// available — the caller turns that into a clear error rather than
// silently mis-recording money.
async function convert(amount, from, to) {
  const rate = await getRate(from, to);
  if (rate === null) return null;
  return Math.round(Number(amount) * rate * 100) / 100;
}

module.exports = { convert, getRate, getRates };
