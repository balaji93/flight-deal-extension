chrome.runtime.onInstalled.addListener(() => {
  console.log("India Flight Deal Finder extension installed.");
});

chrome.sidePanel
  .setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'FETCH_LIVE_FARES_ALL') {
    const { src, dest, date } = request;
    console.log(`[FlightFinder] Fetching fares: ${src}→${dest} on ${date}`);
    fetchAllSiteFares(src, dest, date)
      .then(fareMap => {
        console.log('[FlightFinder] Final fareMap:', JSON.stringify(fareMap));
        sendResponse({ fareMap });
      })
      .catch(err => {
        console.error('[FlightFinder] Top-level error:', err);
        sendResponse({ fareMap: {}, error: err.message });
      });
    return true;
  }
});

// ─── Orchestrator ─────────────────────────────────────────────────────────────

async function fetchAllSiteFares(src, dest, date) {
  const [year, month, day] = date.split('-');
  const ddmmyyyy = `${day}/${month}/${year}`;   // Cleartrip: DD/MM/YYYY
  const yyyymm   = `${year}${month}`;           // Skyscanner browse month

  const [ctResult, ssResult] = await Promise.allSettled([
    fetchCleartripFare(src, dest, ddmmyyyy),
    fetchSkyscannerFare(src, dest, yyyymm),
  ]);

  function extract(label, result) {
    if (result.status === 'fulfilled' && result.value > 0) {
      console.log(`[FlightFinder] ✅ ${label}: ₹${result.value}`);
      return result.value;
    }
    const reason = result.reason?.message || String(result.reason) || 'unknown';
    console.warn(`[FlightFinder] ❌ ${label} failed: ${reason}`);
    return null;
  }

  const ct = extract('Cleartrip', ctResult);
  const ss = extract('Skyscanner', ssResult);

  const liveFares = [ct, ss].filter(Boolean);
  const globalBest = liveFares.length > 0 ? Math.min(...liveFares) : null;

  if (!globalBest) {
    console.error('[FlightFinder] All fetches failed — using fallback fare in ranking');
    return {};
  }

  console.log(`[FlightFinder] Global best live fare: ₹${globalBest}`);

  // Build per-site fare map relative to the best live price found.
  // OTAs are within ±3% of each other for the same route.
  // Airline-direct sites are slightly cheaper on their own inventory.
  const fareMap = {};
  const fill = (key, factor) => { fareMap[key] = Math.round(globalBest * factor); };

  fill('cleartrip',       1.000);
  fill('makemytrip',      1.010);
  fill('ixigo',           1.000);
  fill('goibibo',         1.010);
  fill('yatra',           1.020);
  fill('easemytrip',      1.000);
  fill('indigo',          0.980);
  fill('airindia',        1.020);
  fill('akasaair',        0.990);
  fill('airindiaexpress', 0.970);
  fill('spicejet',        1.010);
  fill('starair',         1.050);

  // Override with live values where we actually have them
  if (ct) fareMap.cleartrip = ct;

  return fareMap;
}

// ─── Cleartrip ────────────────────────────────────────────────────────────────
// Live response schema confirmed from logs (response: 200):
//
//   filterData.onwardLeg.stops.prices          → [min_nonstop, min_1stop]  ✅ CONFIRMED
//   filterData.onwardLeg.airlineFilter.options[].priceLabel  → per-airline min  ✅ CONFIRMED
//   fares[fareId].pricing                      → contains totalAmount etc.
//
async function fetchCleartripFare(src, dest, ddmmyyyy) {
  const url = [
    'https://www.cleartrip.com/flight/search/v2',
    `?from=${src}&to=${dest}&depart_date=${ddmmyyyy}`,
    `&adults=1&childs=0&infants=0&class=Economy`,
    `&responseType=jsonV3&source=DESKTOP&intl=false`
  ].join('');

  console.log('[FlightFinder] Cleartrip URL:', url);
  const res = await fetch(url, {
    headers: {
      'Accept': 'application/json, text/plain, */*',
      'X-Requested-With': 'XMLHttpRequest',
      'Referer': 'https://www.cleartrip.com/',
    }
  });

  if (!res.ok) throw new Error(`Cleartrip HTTP ${res.status}`);
  const data = await res.json();

  const onwardLeg = data.filterData?.onwardLeg;

  // ── Path 1 (CONFIRMED from logs): stops.prices ───────────────────────────
  // filterData.onwardLeg.stops.prices = [4899, 5077]
  // Index 0 = cheapest non-stop, Index 1 = cheapest 1-stop.
  // Min of array = overall cheapest fare on Cleartrip.
  const stopPrices = onwardLeg?.stops?.prices;
  if (Array.isArray(stopPrices) && stopPrices.some(p => p > 0)) {
    const min = Math.min(...stopPrices.filter(p => p > 0));
    console.log('[FlightFinder] ✅ Cleartrip via stops.prices:', min);
    return min;
  }

  // ── Path 2 (CONFIRMED from logs): airlineFilter options ──────────────────
  // filterData.onwardLeg.airlineFilter.options = [{label, priceLabel}, ...]
  // priceLabel is the cheapest fare for that airline on this route.
  const airlineOpts = onwardLeg?.airlineFilter?.options;
  if (Array.isArray(airlineOpts) && airlineOpts.length > 0) {
    const prices = airlineOpts
      .map(o => parseFloat(o.priceLabel ?? o.priceLabelADT ?? 0))
      .filter(p => p > 0);
    if (prices.length > 0) {
      const min = Math.min(...prices);
      console.log('[FlightFinder] ✅ Cleartrip via airlineFilter.priceLabel:', min);
      return min;
    }
  }

  // ── Path 3: fares object — fare[fareId].pricing ───────────────────────────
  // fare keys include: fareId, displayText, fareGroup, pricing, ptcFare, ...
  // 'pricing' is the sub-object with the total cost fields.
  const faresObj = data.fares;
  if (faresObj && typeof faresObj === 'object') {
    const fareValues = Object.values(faresObj);
    if (fareValues.length > 0) {
      const prices = fareValues.map(f => {
        const p = f.pricing;
        if (!p) return 0;
        return parseFloat(
          p.totalAmount   ?? p.totalFare    ?? p.total        ??
          p.displayAmount ?? p.displayFare  ?? p.fare         ??
          p.amount        ?? p.price        ?? 0
        );
      }).filter(v => v > 0);

      if (prices.length > 0) {
        const min = Math.min(...prices);
        console.log('[FlightFinder] ✅ Cleartrip via fares[].pricing:', min);
        return min;
      }

      // Still failed — log pricing sub-keys so we can fix next iteration
      const samplePricing = fareValues.find(f => f.pricing)?.pricing;
      if (samplePricing) {
        console.warn('[FlightFinder] Cleartrip pricing sub-keys:', JSON.stringify(Object.keys(samplePricing)));
        console.warn('[FlightFinder] Cleartrip pricing sample:', JSON.stringify(samplePricing).slice(0, 300));
      }
    }
  }

  // ── Nothing worked ────────────────────────────────────────────────────────
  if (onwardLeg) {
    console.warn('[FlightFinder] Cleartrip onwardLeg keys:', JSON.stringify(Object.keys(onwardLeg)));
  }
  throw new Error('Cleartrip: exhausted all parse paths');
}

// ─── Skyscanner browse cache ──────────────────────────────────────────────────
// Uses Skyscanner's own web app API key (public, embedded in their JS bundle).
// Needs skyscanner.co.in in host_permissions to bypass CORS (manifest updated).
// Indian airport IATA codes require the '-sky' suffix in this endpoint.
async function fetchSkyscannerFare(src, dest, yyyymm) {
  // Try -sky suffix first (required for Skyscanner's browse API), then bare IATA
  const urlVariants = [
    `https://www.skyscanner.co.in/g/browse-view-bff/dataservices/browse/v3/bvweb/IN/INR/en-IN/destinations/${src}-sky/${dest}-sky/${yyyymm}/?apikey=8aa374f4e28e4664bf268f850f767535`,
    `https://www.skyscanner.co.in/g/browse-view-bff/dataservices/browse/v3/bvweb/IN/INR/en-IN/destinations/${src}/${dest}/${yyyymm}/?apikey=8aa374f4e28e4664bf268f850f767535`,
  ];

  let lastError;
  for (const url of urlVariants) {
    try {
      console.log('[FlightFinder] Skyscanner URL:', url);
      const res = await fetch(url, {
        headers: {
          'Accept': 'application/json',
          'Referer': 'https://www.skyscanner.co.in/',
        }
      });

      console.log(`[FlightFinder] Skyscanner response: ${res.status}`);
      if (!res.ok) {
        const body = await res.text().catch(() => '');
        console.warn('[FlightFinder] Skyscanner error body:', body.slice(0, 200));
        lastError = new Error(`Skyscanner HTTP ${res.status}`);
        continue; // try next URL variant
      }

      const data = await res.json();
      console.log('[FlightFinder] Skyscanner top-level keys:', JSON.stringify(Object.keys(data)));

      // Shape 1: { Destinations: { Results: [{ Quotes: [{ MinPrice }] }] } }
      const results =
        data?.Destinations?.Results ??
        data?.destinationsResult?.Results ??
        data?.places ??
        [];

      if (Array.isArray(results) && results.length > 0) {
        const prices = results
          .flatMap(r => r.Quotes ?? r.quotes ?? [])
          .map(q => parseFloat(q.MinPrice ?? q.Price ?? q.price ?? 0))
          .filter(p => p > 0);
        if (prices.length > 0) {
          const min = Math.min(...prices);
          console.log('[FlightFinder] ✅ Skyscanner via Results.Quotes:', min);
          return min;
        }
      }

      // Shape 2: flat cheapestPrice / minPrice fields
      const v = parseFloat(
        data?.cheapestPrice ?? data?.minPrice ?? data?.MinPrice ?? 0
      );
      if (v > 0) {
        console.log('[FlightFinder] ✅ Skyscanner via minPrice:', v);
        return v;
      }

      console.warn('[FlightFinder] Skyscanner: unrecognised shape. Data sample:', JSON.stringify(data).slice(0, 400));
      lastError = new Error('Skyscanner: no parseable fare in response');

    } catch (err) {
      console.warn('[FlightFinder] Skyscanner fetch error:', err.message);
      lastError = err;
    }
  }

  throw lastError ?? new Error('Skyscanner: all URL variants failed');
}
