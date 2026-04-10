/**
 * Precise convenience fee matrix for major Indian travel sites.
 * Fees are typically per passenger, per segment (Domestic).
 */
export const FEE_MATRIX = {
  makemytrip: (pax, isRoundTrip) => 400 * pax * (isRoundTrip ? 2 : 1),
  easemytrip: (pax, isRoundTrip) => 0,
  cleartrip: (pax, isRoundTrip) => 350 * pax * (isRoundTrip ? 2 : 1),
  ixigo: (pax, isRoundTrip) => 399 * pax * (isRoundTrip ? 2 : 1),
  yatra: (pax, isRoundTrip) => 425 * pax * (isRoundTrip ? 2 : 1),
  goibibo: (pax, isRoundTrip) => 400 * pax * (isRoundTrip ? 2 : 1),
  indigo: (pax, isRoundTrip) => 315 * pax * (isRoundTrip ? 2 : 1),
  airindia: (pax, isRoundTrip) => 300 * pax * (isRoundTrip ? 2 : 1),
  akasaair: (pax, isRoundTrip) => 300 * pax * (isRoundTrip ? 2 : 1),
  airindiaexpress: (pax, isRoundTrip) => 300 * pax * (isRoundTrip ? 2 : 1),
  spicejet: (pax, isRoundTrip) => 300 * pax * (isRoundTrip ? 2 : 1),
  starair: (pax, isRoundTrip) => 300 * pax * (isRoundTrip ? 2 : 1)
};

export const getConvenienceFee = (siteId, pax, isRoundTrip) => {
  const calculator = FEE_MATRIX[siteId.toLowerCase().replace(/\s/g, '')];
  return calculator ? calculator(pax, isRoundTrip) : 400 * pax; // Default fallback
};
