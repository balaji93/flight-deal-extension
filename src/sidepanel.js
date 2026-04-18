import { crawlAllOffers, fetchAllSiteFares } from './logic/scraper.js';
import { rankDeals, getSplitSuggestions } from './logic/ranking.js';
import { getDeepLink } from './logic/deepLinks.js';
import { generateItinerary } from './logic/itinerary.js';

const elements = {
  source:              document.getElementById('source'),
  destination:         document.getElementById('destination'),
  date:                document.getElementById('date'),
  returnDate:          document.getElementById('return-date'),
  returnDateGroup:     document.getElementById('return-date-group'),
  btnOneway:           document.getElementById('btn-oneway'),
  btnRoundtrip:        document.getElementById('btn-roundtrip'),
  passengers:          document.getElementById('passengers'),
  bankInput:           document.getElementById('bank-input'),
  bankChips:           document.getElementById('bank-chips'),
  searchBtn:           document.getElementById('search-btn'),
  loading:             document.getElementById('loading'),
  loadingMsg:          document.querySelector('#loading p'),
  // Tab bar
  resultTabs:          document.getElementById('result-tabs'),
  tabDeals:            document.getElementById('tab-deals'),
  tabItinerary:        document.getElementById('tab-itinerary'),
  // Panels
  panelDeals:          document.getElementById('panel-deals'),
  panelItinerary:      document.getElementById('panel-itinerary'),
  // Deals panel
  dealsList:           document.getElementById('deals-list'),
  splitSection:        document.getElementById('split-suggestion'),
  splitText:           document.getElementById('split-text'),
  // Itinerary panel
  itineraryLoader:     document.getElementById('itinerary-loader'),
  itineraryContent:    document.getElementById('itinerary-content'),
  itineraryPlaceholder:document.getElementById('itinerary-placeholder'),
};

let isRoundTrip   = false;
let preferredBanks = [];

// ── Itinerary state ────────────────────────────────────────────────────────────
let itineraryCache    = null;  // cached Gemini response text
let itineraryGenerated = false; // has the current-search generation run?
let currentSearchOpts  = null;  // opts passed to generateItinerary

// ─── Trip Type Toggle ──────────────────────────────────────────────────────────
function setTripType(roundTrip) {
  isRoundTrip = roundTrip;
  if (roundTrip) {
    elements.btnRoundtrip.classList.add('active');
    elements.btnOneway.classList.remove('active');
    elements.returnDate.disabled = false;
    elements.returnDateGroup.classList.remove('disabled-group');
  } else {
    elements.btnOneway.classList.add('active');
    elements.btnRoundtrip.classList.remove('active');
    elements.returnDate.disabled = true;
    elements.returnDate.value = '';
    elements.returnDateGroup.classList.add('disabled-group');
  }
}

elements.btnOneway.addEventListener('click', () => setTripType(false));
elements.btnRoundtrip.addEventListener('click', () => setTripType(true));

// Initialise greyed-out state
setTripType(false);

// Bank Chips logic
elements.bankInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter' && elements.bankInput.value.trim()) {
    const bank = elements.bankInput.value.trim();
    if (!preferredBanks.includes(bank)) {
      preferredBanks.push(bank);
      renderBanks();
    }
    elements.bankInput.value = '';
  }
});

function renderBanks() {
  const input = elements.bankInput;
  elements.bankChips.innerHTML = '';
  preferredBanks.forEach(bank => {
    const chip = document.createElement('div');
    chip.className = 'chip';
    chip.innerHTML = `${bank} <span data-bank="${bank}">&times;</span>`;
    elements.bankChips.appendChild(chip);
  });
  elements.bankChips.appendChild(input);
  input.focus();
}

elements.bankChips.addEventListener('click', (e) => {
  if (e.target.tagName === 'SPAN') {
    const bank = e.target.dataset.bank;
    preferredBanks = preferredBanks.filter(b => b !== bank);
    renderBanks();
  }
});

// ─── Tab Switching ────────────────────────────────────────────────────────────
function activateTab(tabId) {
  // Toggle tab buttons
  elements.tabDeals.classList.toggle('active', tabId === 'deals');
  elements.tabItinerary.classList.toggle('active', tabId === 'itinerary');

  // Toggle panels
  elements.panelDeals.classList.toggle('hidden', tabId !== 'deals');
  elements.panelItinerary.classList.toggle('hidden', tabId !== 'itinerary');

  // Trigger itinerary generation on first activation
  if (tabId === 'itinerary' && !itineraryGenerated && currentSearchOpts) {
    runItineraryGeneration();
  }
}

elements.tabDeals.addEventListener('click', () => activateTab('deals'));
elements.tabItinerary.addEventListener('click', () => activateTab('itinerary'));

// ─── Itinerary Generation ─────────────────────────────────────────────────────
async function runItineraryGeneration() {
  if (itineraryGenerated) return; // already done
  itineraryGenerated = true;

  // Show loader, hide placeholder & content
  elements.itineraryPlaceholder.classList.add('hidden');
  elements.itineraryContent.classList.add('hidden');
  elements.itineraryLoader.classList.remove('hidden');

  try {
    const text = await generateItinerary(currentSearchOpts);
    itineraryCache = text;
    renderItinerary(text);
  } catch (err) {
    console.error('Itinerary generation failed:', err);
    elements.itineraryContent.innerHTML = `
      <div class="itinerary-placeholder">
        <span style="font-size:1.5rem">⚠️</span>
        <p>Could not generate itinerary.<br><small>${err.message}</small></p>
      </div>`;
    elements.itineraryContent.classList.remove('hidden');
  } finally {
    elements.itineraryLoader.classList.add('hidden');
  }
}

/**
 * Convert Gemini plain-text itinerary to styled HTML day blocks.
 * Expected format per day:
 *   Day N (Date):
 *   • HH:MM Some activity
 */
function renderItinerary(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const dayBlocks = [];
  let currentBlock = null;

  lines.forEach(line => {
    // Match: "Day 1 ..." or "Day N (..." — case-insensitive
    if (/^day\s+\d+/i.test(line)) {
      if (currentBlock) dayBlocks.push(currentBlock);
      currentBlock = { title: line.replace(/:$/, ''), bullets: [] };
    } else if (currentBlock && /^[•\-\*]/.test(line)) {
      const content = line.replace(/^[•\-\*]\s*/, '');
      currentBlock.bullets.push(content);
    } else if (currentBlock && line) {
      // Continuation line without a bullet — append to last bullet or add as-is
      if (currentBlock.bullets.length > 0) {
        currentBlock.bullets[currentBlock.bullets.length - 1] += ' ' + line;
      } else {
        currentBlock.bullets.push(line);
      }
    }
  });
  if (currentBlock) dayBlocks.push(currentBlock);

  const html = [];

  // Header
  html.push(`
    <div class="itinerary-header">
      <span class="ai-star">✦</span>
      AI-Curated Itinerary · Powered by Gemini
    </div>`);

  if (dayBlocks.length === 0) {
    // Fallback: render raw text in a single block
    html.push(`<div class="day-block">
      <ul>${lines.map(l => `<li>${escHtml(l)}</li>`).join('')}</ul>
    </div>`);
  } else {
    dayBlocks.forEach(block => {
      html.push(`
        <div class="day-block">
          <div class="day-block-title">${escHtml(block.title)}</div>
          <ul>
            ${block.bullets.map(b => {
              // Detect HH:MM at start and wrap in chip
              const timeMatch = b.match(/^(\d{1,2}:\d{2})\s+(.*)/);
              if (timeMatch) {
                return `<li><span class="time-chip">${timeMatch[1]}</span>${escHtml(timeMatch[2])}</li>`;
              }
              return `<li>${escHtml(b)}</li>`;
            }).join('\n            ')}
          </ul>
        </div>`);
    });
  }

  html.push(`<p class="itinerary-note">✦ Generated by Gemini AI · Times are approximate</p>`);

  elements.itineraryContent.innerHTML = html.join('\n');
  elements.itineraryContent.classList.remove('hidden');
}

function escHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ─── Search Logic ─────────────────────────────────────────────────────────────
elements.searchBtn.addEventListener('click', async () => {
  const src        = elements.source.value.toUpperCase().trim();
  const dest       = elements.destination.value.toUpperCase().trim();
  const date       = elements.date.value;
  const returnDate = isRoundTrip ? elements.returnDate.value : null;
  const pax        = parseInt(elements.passengers.value);

  if (!src || !dest || !date) {
    alert('Please fill in Source, Destination, and Date.');
    return;
  }
  if (isRoundTrip && !returnDate) {
    alert('Please select a Return Date for Round Trip.');
    return;
  }

  // Reset itinerary state for fresh search
  itineraryCache     = null;
  itineraryGenerated = false;
  currentSearchOpts  = null;
  elements.itineraryContent.classList.add('hidden');
  elements.itineraryContent.innerHTML = '';
  elements.itineraryLoader.classList.add('hidden');
  elements.itineraryPlaceholder.classList.remove('hidden');

  // UI state: show loading, hide tabs & panels
  elements.loading.classList.remove('hidden');
  elements.resultTabs.classList.add('hidden');
  elements.panelDeals.classList.add('hidden');
  elements.panelItinerary.classList.add('hidden');
  elements.dealsList.innerHTML = '';

  try {
    // Step 1: Fetch cheapest fare from each site in parallel
    setLoadingMsg('Fetching live prices from Cleartrip, Ixigo, MMT & more…');
    const fareMap = await fetchAllSiteFares(src, dest, date);

    const liveSiteCount = Object.values(fareMap).filter(Boolean).length;
    const bestFare = liveSiteCount > 0
      ? Math.min(...Object.values(fareMap))
      : null;

    console.log(`Got ${liveSiteCount} live fares. Best: ₹${bestFare}`);

    // Step 2: Crawl bank offers from all sites
    setLoadingMsg('Crawling 12+ sites for bank & card offers…');
    const allOffers = await crawlAllOffers();

    // Step 3: Rank deals using per-site fares
    const topDeals = rankDeals(fareMap, allOffers, pax, isRoundTrip, preferredBanks);

    // Step 4: Store search opts for itinerary (extract cheapest flight times from top deal)
    // Top deal's site cheapest time — use heuristic "morning departure" if unavailable
    const cheapestDeal = topDeals[0];
    currentSearchOpts = {
      src,
      dest,
      departDate: date,
      returnDate,
      isRoundTrip,
      // If the deal exposes times we'd use them; for now use sensible defaults.
      // These can be upgraded when scraper returns timing data.
      cheapestDepartArrTime: cheapestDeal?.arrivalTime  || null,
      cheapestReturnDepTime: cheapestDeal?.returnDepTime || null,
    };

    // Step 5: Render results
    renderResults(topDeals, src, dest, date, returnDate, pax, liveSiteCount, bestFare);

    // Step 6: Split suggestions
    const suggestions = getSplitSuggestions(pax, isRoundTrip, topDeals);
    if (suggestions.length > 0) {
      elements.splitSection.classList.remove('hidden');
      elements.splitText.innerHTML = suggestions.map(s => `• ${s}`).join('<br><br>');
    } else {
      elements.splitSection.classList.add('hidden');
    }

    // Step 7: Reveal tabs, default to Deals tab
    elements.resultTabs.classList.remove('hidden');
    activateTab('deals');

  } catch (error) {
    console.error(error);
    alert('Failed to fetch deals. Please try again.');
  } finally {
    elements.loading.classList.add('hidden');
  }
});

function setLoadingMsg(msg) {
  if (elements.loadingMsg) elements.loadingMsg.innerText = msg;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderResults(deals, src, dest, date, returnDate, pax, liveSiteCount, bestFare) {
  if (deals.length === 0) {
    elements.dealsList.innerHTML = '<p class="no-results">No specific bank offers found for your selection. Try checking individual sites.</p>';
    return;
  }

  // Summary banner: show best live fare found
  if (liveSiteCount > 0 && bestFare) {
    const banner = document.createElement('div');
    banner.className = 'fare-summary-banner';
    banner.innerHTML = `
      <span class="live-dot"></span>
      Live prices fetched from <strong>${liveSiteCount} sites</strong>.
      Cheapest base fare found: <strong>₹${bestFare.toLocaleString('en-IN')}</strong> / person.
    `;
    elements.dealsList.appendChild(banner);
  }

  deals.forEach((deal, index) => {
    const card = document.createElement('div');
    card.className = 'deal-card';

    const liveTag = deal.isFareLive
      ? '<span class="live-badge">LIVE PRICE</span>'
      : '<span class="est-badge">EST. PRICE</span>';

    card.innerHTML = `
      <div class="rank-tag">RANK #${index + 1}</div>
      <div class="deal-header">
        <div class="site-info">
          <h3>${deal.siteName} ${liveTag}</h3>
          <p class="offer-amount">${deal.bank} Offer: Save ₹${deal.discount.toLocaleString('en-IN')}</p>
        </div>
      </div>
      <div class="price-details">
        <div class="price-row">
          <span>Base Fare (${pax} Pax):</span>
          <span>₹${Math.round(deal.baseFare).toLocaleString('en-IN')}</span>
        </div>
        <div class="price-row">
          <span>Convenience Fee:</span>
          <span>+₹${deal.convenienceFee.toLocaleString('en-IN')}</span>
        </div>
        <div class="price-row">
          <span>Bank Discount:</span>
          <span class="offer-amount">-₹${deal.discount.toLocaleString('en-IN')}</span>
        </div>
        <div class="price-row final-amount">
          <span>Final Total:</span>
          <span>₹${Math.round(deal.finalAmount).toLocaleString('en-IN')}</span>
        </div>
      </div>
      <div class="offer-code-box">
        <span class="code" id="code-${index}">${deal.code}</span>
        <button class="copy-btn" data-code-id="code-${index}">COPY CODE</button>
      </div>
      <a href="${getDeepLink(deal.site, src, dest, date, returnDate)}" target="_blank" class="direct-link">Book Now on ${deal.siteName}</a>
    `;
    elements.dealsList.appendChild(card);
  });

  // Copy code logic
  document.querySelectorAll('.copy-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const codeId = e.target.dataset.codeId;
      const codeText = document.getElementById(codeId).innerText;
      navigator.clipboard.writeText(codeText);
      e.target.innerText = 'COPIED!';
      setTimeout(() => e.target.innerText = 'COPY CODE', 2000);
    });
  });
}
