/**
 * Generates search URLs for all 12 booking sites.
 * Format: DDMMYYYY or YYYYMMDD depending on site.
 */
export function generateDeepLinks(src, dest, dateStr) {
  // dateStr is CCYY-MM-DD from <input type="date">
  const [yyyy, mm, dd] = dateStr.split('-');
  const ddmmyyyy = `${dd}${mm}${yyyy}`;
  const ddmmyy = `${dd}/${mm}/${yyyy}`;
  const yyyymmdd = `${yyyy}${mm}${dd}`;

  return {
    makemytrip: `https://www.makemytrip.com/flight/search?itinerary=${src}-${dest}-${ddmmyy}&tripType=O&paxType=A-1_C-0_I-0&intl=false&cabinClass=E`,
    easemytrip: `https://www.easemytrip.com/flight-search/listing?srch=${src}|${dest}|${ddmmyy}&px=1-0-0&cbn=0&isow=true`,
    cleartrip: `https://www.cleartrip.com/flights/results?from=${src}&to=${dest}&depart_date=${ddmmyy}&adults=1&class=Economy`,
    ixigo: `https://www.ixigo.com/search/result/flight/${src}/${dest}/${ddmmyyyy}/1/0/0/e`,
    yatra: `https://flights.yatra.com/air-flights/dom/listing?type=O&viewName=normal&flexi=0&noOfAdlt=1&noOfChld=0&noOfInfnt=0&pClass=Economy&origin=${src}&destination=${dest}&depDate=${ddmmyy}`,
    goibibo: `https://www.goibibo.com/flights/air-${src}-${dest}-${yyyymmdd}--1-0-0-E-D/`,
    indigo: `https://www.goindigo.in/#search/${src}/${dest}/1/0/0/ED/${yyyy}-${mm}-${dd}`,
    airindia: `https://www.airindia.com/in/en/book/exclusive-deals.html`, // Deep link restricted, landing on offers
    akasaair: `https://www.akasaair.com/`,
    airindiaexpress: `https://www.airindiaexpress.com/`,
    spicejet: `https://www.spicejet.com/`,
    starair: `https://www.starair.in/`
  };
}

export function getDeepLink(siteId, src, dest, dateStr) {
  const links = generateDeepLinks(src, dest, dateStr);
  return links[siteId] || links.makemytrip;
}
