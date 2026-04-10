import { crawlAllOffers, fetchAllSiteFares } from './logic/scraper.js';
import { rankDeals, getSplitSuggestions } from './logic/ranking.js';
import { getDeepLink } from './logic/deepLinks.js';

const elements = {
  source:       document.getElementById('source'),
  destination:  document.getElementById('destination'),
  date:         document.getElementById('date'),
  passengers:   document.getElementById('passengers'),
  bankInput:    document.getElementById('bank-input'),
  bankChips:    document.getElementById('bank-chips'),
  searchBtn:    document.getElementById('search-btn'),
  loading:      document.getElementById('loading'),
  loadingMsg:   document.querySelector('#loading p'),
  results:      document.getElementById('results'),
  dealsList:    document.getElementById('deals-list'),
  splitSection: document.getElementById('split-suggestion'),
  splitText:    document.getElementById('split-text')
};

let preferredBanks = [];

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

// ─── Search Logic ─────────────────────────────────────────────────────────────
elements.searchBtn.addEventListener('click', async () => {
  const src  = elements.source.value.toUpperCase().trim();
  const dest = elements.destination.value.toUpperCase().trim();
  const date = elements.date.value;
  const pax  = parseInt(elements.passengers.value);

  if (!src || !dest || !date) {
    alert('Please fill in Source, Destination, and Date.');
    return;
  }

  // UI state: show loading
  elements.loading.classList.remove('hidden');
  elements.results.classList.add('hidden');
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
    const isRoundTrip = false;
    const topDeals = rankDeals(fareMap, allOffers, pax, isRoundTrip, preferredBanks);

    // Step 4: Render results
    renderResults(topDeals, src, dest, date, pax, liveSiteCount, bestFare);

    // Step 5: Split suggestions
    const suggestions = getSplitSuggestions(pax, isRoundTrip, topDeals);
    if (suggestions.length > 0) {
      elements.splitSection.classList.remove('hidden');
      elements.splitText.innerHTML = suggestions.map(s => `• ${s}`).join('<br><br>');
    } else {
      elements.splitSection.classList.add('hidden');
    }

  } catch (error) {
    console.error(error);
    alert('Failed to fetch deals. Please try again.');
  } finally {
    elements.loading.classList.add('hidden');
    elements.results.classList.remove('hidden');
  }
});

function setLoadingMsg(msg) {
  if (elements.loadingMsg) elements.loadingMsg.innerText = msg;
}

// ─── Render ───────────────────────────────────────────────────────────────────
function renderResults(deals, src, dest, date, pax, liveSiteCount, bestFare) {
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
      <a href="${getDeepLink(deal.site, src, dest, date)}" target="_blank" class="direct-link">Book Now on ${deal.siteName}</a>
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
