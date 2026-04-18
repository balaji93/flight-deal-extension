/**
 * Generates search URLs for all 12 booking sites.
 * Supports both one-way and round-trip with Economy cabin class.
 *
 * @param {string} src                  - Origin IATA code (e.g. "DEL")
 * @param {string} dest                 - Destination IATA code (e.g. "BOM")
 * @param {string} dateStr              - Departure date in YYYY-MM-DD
 * @param {string|null} [returnDateStr] - Return date in YYYY-MM-DD (null = one-way)
 */
export function generateDeepLinks(src, dest, dateStr, returnDateStr = null) {
  const [yyyy, mm, dd] = dateStr.split('-');
  const ddmmyy   = `${dd}/${mm}/${yyyy}`;   // 15/05/2026
  const ddmmyyyy = `${dd}${mm}${yyyy}`;     // 15052026
  const yyyymmdd = `${yyyy}${mm}${dd}`;     // 20260515

  const isRT = !!returnDateStr;

  let rddmmyy = '', rddmmyyyy = '', ryyyymmdd = '', ryyyy = '', rmm = '', rdd = '';
  if (isRT) {
    [ryyyy, rmm, rdd] = returnDateStr.split('-');
    rddmmyy   = `${rdd}/${rmm}/${ryyyy}`;   // 20/05/2026
    rddmmyyyy = `${rdd}${rmm}${ryyyy}`;     // 20052026
    ryyyymmdd = `${ryyyy}${rmm}${rdd}`;     // 20260520
  }

  return {

    // ── MakeMyTrip ──────────────────────────────────────────────────────────────
    // One-way:    itinerary=SRC-DEST-DEP
    // Round-trip: itinerary=SRC-DEST-DEP_DEST-SRC-RET  (verified from browser)
    // cabinClass=E → Economy
    makemytrip: isRT
      ? `https://www.makemytrip.com/flight/search?itinerary=${src}-${dest}-${ddmmyy}_${dest}-${src}-${rddmmyy}&tripType=R&paxType=A-1_C-0_I-0&intl=false&cabinClass=E`
      : `https://www.makemytrip.com/flight/search?itinerary=${src}-${dest}-${ddmmyy}&tripType=O&paxType=A-1_C-0_I-0&intl=false&cabinClass=E`,

    // ── EaseMyTrip ───────────────────────────────────────────────────────────────
    // One-way:    srch=SRC|DEST|DEP   &isow=true
    // Round-trip: srch=SRC|DEST|DEP-RET  &isow=false  (verified from browser)
    // cbn=0 → Economy
    easemytrip: isRT
      ? `https://www.easemytrip.com/flight-search/listing?srch=${src}|${dest}|${ddmmyy}-${rddmmyy}&px=1-0-0&cbn=0&isow=false`
      : `https://www.easemytrip.com/flight-search/listing?srch=${src}|${dest}|${ddmmyy}&px=1-0-0&cbn=0&isow=true`,

    // ── Cleartrip ────────────────────────────────────────────────────────────────
    // class=Economy works as query param (verified from browser ✓)
    cleartrip: isRT
      ? `https://www.cleartrip.com/flights/results?from=${src}&to=${dest}&depart_date=${ddmmyy}&return_date=${rddmmyy}&adults=1&class=Economy`
      : `https://www.cleartrip.com/flights/results?from=${src}&to=${dest}&depart_date=${ddmmyy}&adults=1&class=Economy`,

    // ── Ixigo ────────────────────────────────────────────────────────────────────
    // Path-based URL format was broken (404). Correct format is query params.
    // Verified from browser tab URL: ?from=DEL&to=BOM&date=15052026&returnDate=...
    // class=e → economy
    ixigo: isRT
      ? `https://www.ixigo.com/search/result/flight?from=${src}&to=${dest}&date=${ddmmyyyy}&returnDate=${rddmmyyyy}&adults=1&children=0&infants=0&class=e`
      : `https://www.ixigo.com/search/result/flight?from=${src}&to=${dest}&date=${ddmmyyyy}&adults=1&children=0&infants=0&class=e`,

    // ── Yatra ─────────────────────────────────────────────────────────────────────
    // type=O (one-way) | R (round-trip); pClass=Economy ✓
    yatra: isRT
      ? `https://flights.yatra.com/air-flights/dom/listing?type=R&viewName=normal&flexi=0&noOfAdlt=1&noOfChld=0&noOfInfnt=0&pClass=Economy&origin=${src}&destination=${dest}&depDate=${ddmmyy}&retDate=${rddmmyy}`
      : `https://flights.yatra.com/air-flights/dom/listing?type=O&viewName=normal&flexi=0&noOfAdlt=1&noOfChld=0&noOfInfnt=0&pClass=Economy&origin=${src}&destination=${dest}&depDate=${ddmmyy}`,

    // ── Goibibo ───────────────────────────────────────────────────────────────────
    // Path: air-SRC-DEST-YYYYMMDD[-RYYYYMMDD]-pax-E-[R|D]/
    // E = Economy; R = Round-trip; D = One-way (Domestic)
    goibibo: isRT
      ? `https://www.goibibo.com/flights/air-${src}-${dest}-${yyyymmdd}-${ryyyymmdd}-1-0-0-E-R/`
      : `https://www.goibibo.com/flights/air-${src}-${dest}-${yyyymmdd}--1-0-0-E-D/`,

    // ── IndiGo ────────────────────────────────────────────────────────────────────
    // Hash-path: #search/SRC/DEST/pax/ED or ER/DEP[/RET]
    // E = Economy; D = One-way; R = Round-trip
    indigo: isRT
      ? `https://www.goindigo.in/#search/${src}/${dest}/1/0/0/ER/${yyyy}-${mm}-${dd}/${ryyyy}-${rmm}-${rdd}`
      : `https://www.goindigo.in/#search/${src}/${dest}/1/0/0/ED/${yyyy}-${mm}-${dd}`,

    // ── Airlines without functional deep-links (land on homepage / offers page) ──
    airindia:        `https://www.airindia.com/in/en/book/exclusive-deals.html`,
    akasaair:        `https://www.akasaair.com/`,
    airindiaexpress: `https://www.airindiaexpress.com/`,
    spicejet:        `https://www.spicejet.com/`,
    starair:         `https://www.starair.in/`
  };
}

export function getDeepLink(siteId, src, dest, dateStr, returnDateStr = null) {
  const links = generateDeepLinks(src, dest, dateStr, returnDateStr);
  return links[siteId] || links.makemytrip;
}
