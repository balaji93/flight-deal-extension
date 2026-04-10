import { getConvenienceFee } from './fees.js';

/** Fallback fare if a site's live price couldn't be fetched (₹ per pax) */
const DEFAULT_FALLBACK_FARE = 5500;

/**
 * Calculates the best 3 deals based on final price.
 * Final Price = (Site-specific Base Fare × pax) + Convenience Fee - Bank Discount
 *
 * @param {Object} fareMap   - { siteId: cheapestBaseFarePerPax } from fetchAllSiteFares()
 * @param {Object} offers    - { siteId: [offerObj, ...] } from crawlAllOffers()
 * @param {number} pax       - Number of passengers
 * @param {boolean} isRoundTrip
 * @param {string[]} preferredBanks - Optional bank filter
 */
export function rankDeals(fareMap, offers, pax, isRoundTrip, preferredBanks = []) {
  const allDeals = [];

  // Determine the best overall fare for sites with no live data
  const knownFares = Object.values(fareMap).filter(v => v && v > 0);
  const globalBestFare = knownFares.length > 0
    ? Math.min(...knownFares)
    : DEFAULT_FALLBACK_FARE;

  // Flatten all offers from all sites
  Object.keys(offers).forEach(siteId => {
    const siteOffers = offers[siteId];

    // Get site-specific base fare (per person), fall back gracefully
    const siteBaseFarePerPax = fareMap[siteId] || globalBestFare;
    const totalBase = siteBaseFarePerPax * pax * (isRoundTrip ? 2 : 1);

    siteOffers.forEach(offer => {
      // Filter by preferred banks if list is provided
      if (
        preferredBanks.length > 0 &&
        !preferredBanks.some(b => offer.bank.toLowerCase().includes(b.toLowerCase()))
      ) {
        return;
      }

      const convenienceFee = getConvenienceFee(siteId, pax, isRoundTrip);

      // Capped discount: max 15% of total base (realistic bank offer cap)
      const discount = Math.min(
        offer.discount * (pax > 1 ? 1.5 : 1),
        totalBase * 0.15
      );

      const finalAmount = totalBase - discount + convenienceFee;

      allDeals.push({
        ...offer,
        siteName: formatSiteName(siteId),
        convenienceFee,
        discount: Math.round(discount),
        finalAmount,
        baseFare: totalBase,
        baseFarePerPax: siteBaseFarePerPax,
        isFareLive: Boolean(fareMap[siteId]), // was this fare fetched live?
      });
    });
  });

  // Sort by final amount ascending (cheapest first)
  allDeals.sort((a, b) => a.finalAmount - b.finalAmount);

  return allDeals.slice(0, 3);
}

/**
 * Suggests splitting strategies
 */
export function getSplitSuggestions(pax, isRoundTrip, topDeals) {
  const suggestions = [];

  if (pax > 2) {
    suggestions.push(`Save more by splitting your ${pax} passengers into two bookings. Some bank offers (like ${topDeals[0]?.bank || 'ICICI'}) cap savings per transaction. Booking 2+2 can double your total cashback.`);
  }

  if (isRoundTrip) {
    suggestions.push(`Check if booking two separate one-way tickets on different airlines (e.g., IndiGo for outbound and Air India for return) is cheaper. Our search links will help you compare.`);
  }

  return suggestions;
}

function formatSiteName(id) {
  const names = {
    makemytrip:       "MakeMyTrip",
    easemytrip:       "EaseMyTrip",
    cleartrip:        "Cleartrip",
    ixigo:            "Ixigo",
    yatra:            "Yatra",
    goibibo:          "Goibibo",
    indigo:           "IndiGo",
    airindia:         "Air India",
    akasaair:         "Akasa Air",
    airindiaexpress:  "Air India Express",
    spicejet:         "SpiceJet",
    starair:          "Star Air"
  };
  return names[id] || id;
}
