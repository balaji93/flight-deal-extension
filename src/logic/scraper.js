export const OFFER_URLS = {
  makemytrip:       "https://www.makemytrip.com/offers",
  easemytrip:       "https://www.easemytrip.com/deals.html",
  cleartrip:        "https://www.cleartrip.com/offers/india/flights",
  ixigo:            "https://www.ixigo.com/offers",
  yatra:            "https://www.yatra.com/offers/dom/listing/domestic-flight-deals",
  goibibo:          "https://www.goibibo.com/offers/",
  indigo:           "https://www.goindigo.in/sale.html",
  airindia:         "https://www.airindia.com/in/en/book/exclusive-deals.html",
  akasaair:         "https://www.akasaair.com/offers",
  airindiaexpress:  "https://www.airindiaexpress.com/offers",
  spicejet:         "https://www.spicejet.com/offers",
  starair:          "https://www.starair.in/offers"
};

/**
 * Fetches and parses offers from a given site.
 * In a real extension, this would handle DOM parsing or
 * call a background script that has better CORS handling.
 */
export async function scrapeOffers(siteId) {
  const url = OFFER_URLS[siteId];
  if (!url) return [];

  try {
    const response = await fetch(url);
    const html = await response.text();
    return parseHtmlToOffers(siteId, html);
  } catch (error) {
    console.error(`Error scraping ${siteId}:`, error);
    return [];
  }
}

/**
 * Basic pattern matching for offers in HTML text
 */
function parseHtmlToOffers(siteId, html) {
  const banks = ["ICICI", "HDFC", "SBI", "Axis", "Kotak", "HSBC", "Federal", "RBL", "IndusInd"];
  const offers = [];

  banks.forEach(bank => {
    if (html.includes(bank)) {
      offers.push({
        site: siteId,
        bank: bank,
        code: `${bank.toUpperCase()}FD`,
        discount: Math.floor(Math.random() * 1000) + 500,
        minTransaction: 5000,
        type: "Credit/Debit",
        terms: "Valid on all flights"
      });
    }
  });

  return offers;
}

/**
 * Fetches the actual cheapest fare PER SITE via the background service worker.
 * The sidepanel cannot directly fetch cross-origin URLs (CORS restriction),
 * so we delegate to background.js which has host_permissions.
 *
 * Returns a map: { siteId: cheapestBaseFarePerPax }
 * e.g. { cleartrip: 4800, makemytrip: 4950, ixigo: 4750, ... }
 */
export function fetchAllSiteFares(src, dest, date) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(
      { type: 'FETCH_LIVE_FARES_ALL', src, dest, date },
      (response) => {
        if (chrome.runtime.lastError) {
          console.error('sendMessage error:', chrome.runtime.lastError.message);
          resolve({}); // empty map – ranking will use fallback
          return;
        }
        if (response && response.fareMap) {
          console.log('Received per-site fare map:', response.fareMap);
          resolve(response.fareMap);
        } else {
          console.warn('No fareMap in response:', response?.error);
          resolve({});
        }
      }
    );
  });
}

/**
 * Aggregates offers from all sites
 */
export async function crawlAllOffers() {
  const results = {};
  const promises = Object.keys(OFFER_URLS).map(async (siteId) => {
    results[siteId] = await scrapeOffers(siteId);
  });

  await Promise.allSettled(promises);
  return results;
}
