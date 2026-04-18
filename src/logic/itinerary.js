import { GEMINI_API_KEY } from '../config.js';

const GEMINI_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-preview:generateContent?key=${GEMINI_API_KEY}`;

// City code → full name map (extend as needed)
const CITY_NAMES = {
  DEL: 'Delhi', BOM: 'Mumbai', BLR: 'Bengaluru', MAA: 'Chennai',
  HYD: 'Hyderabad', CCU: 'Kolkata', AMD: 'Ahmedabad', PNQ: 'Pune',
  GOI: 'Goa', JAI: 'Jaipur', COK: 'Kochi', IXC: 'Chandigarh',
  IXB: 'Bagdogra', GAU: 'Guwahati', BHO: 'Bhopal', LKO: 'Lucknow',
  VNS: 'Varanasi', TRV: 'Thiruvananthapuram', IDR: 'Indore',
};

function cityName(code) {
  return CITY_NAMES[code.toUpperCase()] || code;
}

/** Subtract hours from a "HH:MM" time string → "HH:MM" */
function subtractHours(timeStr, hours) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  let total = h * 60 + m - hours * 60;
  if (total < 0) total = 0;
  const rh = String(Math.floor(total / 60)).padStart(2, '0');
  const rm = String(total % 60).padStart(2, '0');
  return `${rh}:${rm}`;
}

/** Add minutes to a "HH:MM" time string → "HH:MM" */
function addMinutes(timeStr, mins) {
  if (!timeStr) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const total = h * 60 + m + mins;
  const rh = String(Math.floor(total / 60) % 24).padStart(2, '0');
  const rm = String(total % 60).padStart(2, '0');
  return `${rh}:${rm}`;
}

/** Format a date string (yyyy-mm-dd) → "Mon, 20 Apr 2026" */
function fmtDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

/** How many days between two date strings (inclusive = returnDate - departDate + 1) */
function dayCount(departDate, returnDate) {
  const d1 = new Date(departDate + 'T00:00:00');
  const d2 = new Date(returnDate + 'T00:00:00');
  const diff = Math.round((d2 - d1) / 86_400_000);
  return diff + 1; // inclusive
}

/**
 * Build the PEACE-principle prompt for Gemini.
 *
 * @param {object} opts
 * @param {string} opts.src            IATA code of origin
 * @param {string} opts.dest           IATA code of destination
 * @param {string} opts.departDate     yyyy-mm-dd
 * @param {string|null} opts.returnDate yyyy-mm-dd or null for one-way
 * @param {boolean} opts.isRoundTrip
 * @param {string|null} opts.cheapestDepartArrTime  "HH:MM" when outbound lands at dest
 * @param {string|null} opts.cheapestReturnDepTime  "HH:MM" when return flight departs dest
 */
function buildPrompt(opts) {
  const {
    src, dest, departDate, returnDate, isRoundTrip,
    cheapestDepartArrTime, cheapestReturnDepTime,
  } = opts;

  const destCity = cityName(dest);
  const srcCity = cityName(src);

  // For one-way, fake a 2-day trip from departure date
  const effectiveReturn = returnDate || (() => {
    const d = new Date(departDate + 'T00:00:00');
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  })();

  const numDays = dayCount(departDate, effectiveReturn);
  const landTime = cheapestDepartArrTime || '11:00';
  const firstActTime = addMinutes(landTime, 90); // hotel check-in + freshen up
  const mustLeaveBy = cheapestReturnDepTime
    ? subtractHours(cheapestReturnDepTime, 2)
    : null;

  // Build day-date list for context
  const dayDates = [];
  for (let i = 0; i < numDays; i++) {
    const d = new Date(departDate + 'T00:00:00');
    d.setDate(d.getDate() + i);
    dayDates.push(d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }));
  }

  const tripTypeNote = isRoundTrip
    ? `Round trip. Return from ${destCity} on ${fmtDate(returnDate)}.`
    : `One-way trip — plan a 2-day itinerary.`;

  const returnNote = mustLeaveBy
    ? `⚑ Last active stop on Day ${numDays} must end by ${mustLeaveBy} IST (return flight departs ${cheapestReturnDepTime}, 2 hr airport transit buffer).`
    : ``;

  return `[Purpose]
You are a concise travel itinerary assistant embedded in a compact Chrome extension sidepanel.

[Explicit context]
Trip: ${srcCity} → ${destCity}
${tripTypeNote}
Duration: ${numDays} day${numDays > 1 ? 's' : ''} (${dayDates.join(' | ')})
Cheapest outbound flight lands at ${destCity}: ${landTime} IST → first activity ~${firstActTime} IST after airport transit.
${returnNote}

[Audience]
Indian traveller, moderate budget, wants efficient sightseeing.

[Concise output rules — STRICT]
• Total output MUST be under 500 tokens.
• No prose introductions. No filler sentences. No markdown headers like "##".
• Start directly with Day 1.
• Format each day exactly as:
  Day N (Date):
  • HH:MM Activity — 1 short line
  • HH:MM Activity — 1 short line
  (3–5 bullets per day)
• Suggest 2–3 must-see attractions + 1 local food recommendation per day.
• Day 1 morning: check-in / freshen up after airport arrival at ${landTime}.
${returnNote ? `• ${returnNote}` : ''}
• No bullet should exceed 12 words.

[Example format — follow exactly]
Day 1 (Sat, 20 Apr):
• 11:30 Check-in hotel near [area]
• 12:00 Lunch – [local dish], [area]
• 14:00 Visit [Landmark]
• 17:00 [Landmark 2]
• 19:30 Street food dinner at [market]

Now generate the itinerary for ${destCity}:`;
}

/**
 * Call Gemini and return the itinerary text.
 * Throws on network / API error.
 */
export async function generateItinerary(opts) {
  const prompt = buildPrompt(opts);

  const body = {
    contents: [{ parts: [{ text: prompt }] }],
    generationConfig: {
      maxOutputTokens: 600,
      temperature: 0.7,
      topP: 0.9,
    },
  };

  const res = await fetch(GEMINI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gemini API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}
