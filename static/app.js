/* ── Default watchlist ──────────────────────────────────────── */
const DEFAULT_STOCKS = [
  { ticker: 'AAPL',  name: 'Apple Inc.' },
  { ticker: 'MSFT',  name: 'Microsoft Corporation' },
  { ticker: 'GOOGL', name: 'Alphabet Inc.' },
  { ticker: 'AMZN',  name: 'Amazon.com Inc.' },
  { ticker: 'META',  name: 'Meta Platforms Inc.' },
  { ticker: 'NVDA',  name: 'NVIDIA Corporation' },
  { ticker: 'TSLA',  name: 'Tesla Inc.' },
  { ticker: 'AMD',   name: 'Advanced Micro Devices Inc.' },
  { ticker: 'INTC',  name: 'Intel Corporation' },
  { ticker: 'CRM',   name: 'Salesforce Inc.' },
  { ticker: 'ORCL',  name: 'Oracle Corporation' },
  { ticker: 'JPM',   name: 'JPMorgan Chase & Co.' },
  { ticker: 'BAC',   name: 'Bank of America Corp.' },
  { ticker: 'GS',    name: 'Goldman Sachs Group Inc.' },
  { ticker: 'V',     name: 'Visa Inc.' },
  { ticker: 'MA',    name: 'Mastercard Inc.' },
  { ticker: 'JNJ',   name: 'Johnson & Johnson' },
  { ticker: 'PFE',   name: 'Pfizer Inc.' },
  { ticker: 'UNH',   name: 'UnitedHealth Group Inc.' },
  { ticker: 'WMT',   name: 'Walmart Inc.' },
  { ticker: 'COST',  name: 'Costco Wholesale Corporation' },
  { ticker: 'MCD',   name: "McDonald's Corporation" },
  { ticker: 'XOM',   name: 'Exxon Mobil Corporation' },
  { ticker: 'CVX',   name: 'Chevron Corporation' },
  { ticker: 'NFLX',  name: 'Netflix Inc.' },
  { ticker: 'DIS',   name: 'The Walt Disney Company' },
];

/* ── State ─────────────────────────────────────────────────── */
const watchlist = new Map();
let allStocks = [];
let scoreChartInstance = null;
let modalPriceChart = null;
let searchDebounce = null;

// New state
let sectorBenchmarks = {};
let portfolio = {};          // { "AAPL": { shares, avgCost } }
let priceAlerts = {};        // { "AAPL": { target, direction, triggered } }
let compareSet = new Set();
let currentModalStock = null;
let modalHistoryChart = null;
let modalCharts = [];        // track all modal chart instances for cleanup

// Portfolio search state
let portfolioSearchTicker = '';
let portfolioSearchDebounce = null;

/* ── Watchlist management ───────────────────────────────────── */
function initWatchlist() {
  DEFAULT_STOCKS.forEach(({ ticker, name }) => watchlist.set(ticker, name));
  renderWatchlist();
}

function renderWatchlist() {
  const container = document.getElementById('watchlist-chips');
  const countEl = document.getElementById('watchlist-count');
  countEl.textContent = watchlist.size;

  container.innerHTML = [...watchlist.entries()].map(([ticker, name]) => `
    <div class="stock-chip">
      <span class="chip-name">${name}</span>
      <span class="chip-ticker">${ticker}</span>
      <button class="chip-remove" onclick="removeFromWatchlist('${ticker}')" title="Remove">&times;</button>
    </div>
  `).join('');
}

function removeFromWatchlist(ticker) {
  watchlist.delete(ticker);
  renderWatchlist();
}

function clearWatchlist() {
  watchlist.clear();
  renderWatchlist();
}

function addToWatchlist(ticker, name) {
  watchlist.set(ticker, name);
  renderWatchlist();
}

/* ── Company search ─────────────────────────────────────────── */
function handleSearchInput() {
  const query = document.getElementById('company-search').value.trim();
  clearTimeout(searchDebounce);

  if (query.length < 2) {
    hideDropdown();
    return;
  }

  searchDebounce = setTimeout(() => fetchSearchResults(query), 300);
}

async function fetchSearchResults(query) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    showDropdown(data.results || []);
  } catch {
    hideDropdown();
  }
}

function showDropdown(results) {
  const dropdown = document.getElementById('search-dropdown');

  if (!results.length) {
    dropdown.innerHTML = '<div class="dropdown-empty">No results found</div>';
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = results.map(r => `
    <div class="dropdown-item" onclick="selectResult('${r.ticker}', ${JSON.stringify(r.name).replace(/"/g, '&quot;')})">
      <span class="dropdown-name">${r.name}</span>
      <span class="dropdown-ticker">${r.ticker}</span>
    </div>
  `).join('');
  dropdown.classList.remove('hidden');
}

function hideDropdown() {
  const dropdown = document.getElementById('search-dropdown');
  dropdown.classList.add('hidden');
  dropdown.innerHTML = '';
}

function selectResult(ticker, name) {
  addToWatchlist(ticker, name);
  document.getElementById('company-search').value = '';
  hideDropdown();
}

/* ── Close dropdown on outside click ───────────────────────── */
document.addEventListener('click', e => {
  const wrap = document.querySelector('.search-add-wrap');
  if (wrap && !wrap.contains(e.target)) hideDropdown();

  // Portfolio dropdown
  const portfolioWrap = document.getElementById('portfolio-add-form');
  const portfolioDropdown = document.getElementById('portfolio-search-dropdown');
  if (portfolioDropdown && portfolioWrap && !portfolioWrap.contains(e.target)) {
    portfolioDropdown.classList.add('hidden');
    portfolioDropdown.innerHTML = '';
  }
});

/* ── Portfolio search ───────────────────────────────────────── */
function handlePortfolioSearchInput() {
  const query = document.getElementById('portfolio-search').value.trim();
  clearTimeout(portfolioSearchDebounce);

  if (query.length < 2) {
    hidePortfolioDropdown();
    return;
  }

  portfolioSearchDebounce = setTimeout(() => fetchPortfolioSearchResults(query), 300);
}

async function fetchPortfolioSearchResults(query) {
  try {
    const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
    const data = await res.json();
    showPortfolioDropdown(data.results || []);
  } catch {
    hidePortfolioDropdown();
  }
}

function showPortfolioDropdown(results) {
  const dropdown = document.getElementById('portfolio-search-dropdown');

  if (!results.length) {
    dropdown.innerHTML = '<div class="dropdown-empty">No results found</div>';
    dropdown.classList.remove('hidden');
    return;
  }

  dropdown.innerHTML = results.map(r => `
    <div class="dropdown-item" onclick="selectPortfolioResult('${r.ticker}', ${JSON.stringify(r.name).replace(/"/g, '&quot;')})">
      <span class="dropdown-name">${r.name}</span>
      <span class="dropdown-ticker">${r.ticker}</span>
    </div>
  `).join('');
  dropdown.classList.remove('hidden');
}

function hidePortfolioDropdown() {
  const dropdown = document.getElementById('portfolio-search-dropdown');
  if (dropdown) {
    dropdown.classList.add('hidden');
    dropdown.innerHTML = '';
  }
}

function selectPortfolioResult(ticker, name) {
  portfolioSearchTicker = ticker;
  document.getElementById('portfolio-search').value = name;
  document.getElementById('portfolio-search').dataset.ticker = ticker;
  hidePortfolioDropdown();
}

/* ── Portfolio persistence ──────────────────────────────────── */
function loadPortfolio() {
  try {
    const stored = localStorage.getItem('portfolio_v1');
    if (stored) {
      portfolio = JSON.parse(stored);
    }
  } catch {
    portfolio = {};
  }

  // Reveal portfolio section immediately if there are holdings
  if (Object.keys(portfolio).length > 0) {
    document.getElementById('portfolio-section').classList.remove('hidden');
    renderPortfolio();
  }
}

function savePortfolio() {
  localStorage.setItem('portfolio_v1', JSON.stringify(portfolio));
}

/* ── Portfolio UI ───────────────────────────────────────────── */
function showAddPositionForm() {
  document.getElementById('portfolio-add-form').classList.remove('hidden');
  // Reset fields
  portfolioSearchTicker = '';
  document.getElementById('portfolio-search').value = '';
  document.getElementById('portfolio-search').dataset.ticker = '';
  document.getElementById('portfolio-shares').value = '';
  document.getElementById('portfolio-cost').value = '';
}

function hideAddPositionForm() {
  document.getElementById('portfolio-add-form').classList.add('hidden');
}

function addPosition() {
  const ticker = portfolioSearchTicker;
  const sharesVal = document.getElementById('portfolio-shares').value;
  const costVal = document.getElementById('portfolio-cost').value;

  if (!ticker) {
    showToast('Missing ticker', 'Please search and select a company first.');
    return;
  }

  const shares = parseFloat(sharesVal);
  const avgCost = parseFloat(costVal);

  if (isNaN(shares) || shares <= 0) {
    showToast('Invalid shares', 'Please enter a valid number of shares.');
    return;
  }
  if (isNaN(avgCost) || avgCost <= 0) {
    showToast('Invalid cost', 'Please enter a valid average cost.');
    return;
  }

  portfolio[ticker] = { shares, avgCost };
  savePortfolio();
  hideAddPositionForm();
  document.getElementById('portfolio-section').classList.remove('hidden');
  renderPortfolio();
}

function removePosition(ticker) {
  delete portfolio[ticker];
  savePortfolio();
  renderPortfolio();
}

function renderPortfolio() {
  const wrap = document.getElementById('portfolio-table-wrap');
  const summaryEl = document.getElementById('portfolio-summary');
  const holdings = Object.entries(portfolio);

  if (!holdings.length) {
    wrap.innerHTML = '<div class="portfolio-empty">No positions yet. Click "+ Add position" to get started.</div>';
    summaryEl.textContent = '';
    return;
  }

  let totalValue = 0;
  let totalCost = 0;

  const rows = holdings.map(([ticker, pos]) => {
    const stockData = allStocks.find(s => s.ticker === ticker);
    const currentPrice = stockData ? stockData.price : null;
    const currentValue = currentPrice != null ? pos.shares * currentPrice : null;
    const costBasis = pos.shares * pos.avgCost;
    const pnl = currentValue != null ? currentValue - costBasis : null;
    const pnlPct = pnl != null && costBasis > 0 ? (pnl / costBasis) * 100 : null;

    if (currentValue != null) totalValue += currentValue;
    totalCost += costBasis;

    const pnlClass = pnl == null ? '' : pnl >= 0 ? 'pnl-pos' : 'pnl-neg';
    const pnlSign = pnl == null ? '' : pnl >= 0 ? '+' : '';

    return `
      <tr>
        <td><strong>${ticker}</strong></td>
        <td>${fmt(pos.shares, 4)}</td>
        <td>$${fmt(pos.avgCost)}</td>
        <td>${currentPrice != null ? '$' + fmt(currentPrice) : '\u2014'}</td>
        <td>${currentValue != null ? '$' + fmt(currentValue) : '\u2014'}</td>
        <td class="${pnlClass}">
          ${pnl != null ? pnlSign + '$' + fmt(Math.abs(pnl)) : '\u2014'}
          ${pnlPct != null ? `<span style="font-size:11px;opacity:0.8"> (${pnlSign}${fmt(Math.abs(pnlPct), 1)}%)</span>` : ''}
        </td>
        <td>
          <button class="btn-ghost" onclick="removePosition('${ticker}')" style="color:var(--red)">Remove</button>
        </td>
      </tr>
    `;
  }).join('');

  const totalPnl = totalValue - totalCost;
  const totalPnlPct = totalCost > 0 ? (totalPnl / totalCost) * 100 : 0;
  const totalPnlClass = totalPnl >= 0 ? 'pnl-pos' : 'pnl-neg';
  const totalPnlSign = totalPnl >= 0 ? '+' : '';

  wrap.innerHTML = `
    <div class="portfolio-table-wrap">
      <table class="portfolio-table">
        <thead>
          <tr>
            <th>Ticker</th>
            <th>Shares</th>
            <th>Avg Cost</th>
            <th>Current Price</th>
            <th>Current Value</th>
            <th>P&amp;L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="totals-row">
            <td colspan="4"><strong>Total</strong></td>
            <td><strong>$${fmt(totalValue)}</strong></td>
            <td class="${totalPnlClass}"><strong>${totalPnlSign}$${fmt(Math.abs(totalPnl))} (${totalPnlSign}${fmt(Math.abs(totalPnlPct), 1)}%)</strong></td>
            <td></td>
          </tr>
        </tbody>
      </table>
    </div>
  `;

  summaryEl.textContent = `${holdings.length} position${holdings.length !== 1 ? 's' : ''} \u00b7 Total $${fmt(totalValue)}`;
}

/* ── Price alerts ────────────────────────────────────────────── */
function loadAlerts() {
  try {
    const stored = localStorage.getItem('price_alerts_v1');
    if (stored) priceAlerts = JSON.parse(stored);
  } catch {
    priceAlerts = {};
  }
}

function saveAlerts() {
  localStorage.setItem('price_alerts_v1', JSON.stringify(priceAlerts));
}

function setAlert(ticker, targetStr) {
  const target = parseFloat(targetStr);
  if (isNaN(target) || target <= 0) {
    showToast('Invalid alert', 'Please enter a valid price target.');
    return;
  }

  const currentPrice = currentModalStock ? currentModalStock.price : null;
  const direction = (currentPrice != null && target > currentPrice) ? 'up' : 'down';

  priceAlerts[ticker] = { target, direction, triggered: false };
  saveAlerts();

  const alertDiv = document.getElementById('modal-alert-ui');
  if (alertDiv) {
    alertDiv.innerHTML = renderAlertUI(ticker, currentPrice);
  }
  showToast('Alert set', `Alert set for ${ticker} at $${target.toFixed(2)}.`);
}

function clearAlert(ticker) {
  delete priceAlerts[ticker];
  saveAlerts();

  const currentPrice = currentModalStock ? currentModalStock.price : null;
  const alertDiv = document.getElementById('modal-alert-ui');
  if (alertDiv) {
    alertDiv.innerHTML = renderAlertUI(ticker, currentPrice);
  }
}

function checkPriceAlerts(stocks) {
  let changed = false;
  for (const [ticker, alert] of Object.entries(priceAlerts)) {
    if (alert.triggered) continue;
    const stock = stocks.find(s => s.ticker === ticker);
    if (!stock || stock.price == null) continue;

    if (alert.direction === 'up' && stock.price >= alert.target) {
      showToast(
        `\u{1F514} Alert: ${ticker}`,
        `${ticker} reached $${stock.price.toFixed(2)} \u2014 above your target of $${alert.target.toFixed(2)}.`
      );
      priceAlerts[ticker].triggered = true;
      changed = true;
    } else if (alert.direction === 'down' && stock.price <= alert.target) {
      showToast(
        `\u{1F514} Alert: ${ticker}`,
        `${ticker} dropped to $${stock.price.toFixed(2)} \u2014 below your target of $${alert.target.toFixed(2)}.`
      );
      priceAlerts[ticker].triggered = true;
      changed = true;
    }
  }
  if (changed) saveAlerts();
}

function renderAlertUI(ticker, currentPrice) {
  const alert = priceAlerts[ticker];
  let statusHtml = '';
  if (alert) {
    const dirLabel = alert.direction === 'up' ? '\u2191 Above' : '\u2193 Below';
    const triggeredLabel = alert.triggered ? ' (triggered)' : '';
    statusHtml = `
      <div class="alert-status">
        Active: ${dirLabel} $${alert.target.toFixed(2)}${triggeredLabel}
        <button class="btn-alert-clear" onclick="clearAlert('${ticker}')">Remove</button>
      </div>
    `;
  }

  return `
    <div class="alert-row">
      <input type="number" class="alert-input" id="alert-target-input" placeholder="Target price" min="0" step="any" />
      <button class="btn-alert-set" onclick="setAlert('${ticker}', document.getElementById('alert-target-input').value)">Set Alert</button>
    </div>
    ${statusHtml}
  `;
}

/* ── Toast notifications ─────────────────────────────────────── */
function showToast(title, body) {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `
    <div class="toast-title">${title}</div>
    <div class="toast-body">${body}</div>
  `;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 6000);
}

/* ── Score history ──────────────────────────────────────────── */
async function fetchScoreHistory(ticker) {
  const requestedTicker = ticker;
  try {
    const res = await fetch(`/api/history/${ticker}`);
    const data = await res.json();

    if (currentModalStock?.ticker !== requestedTicker) return;

    const placeholder = document.getElementById('modal-history-placeholder');
    if (!placeholder) return;

    if (data.history && data.history.length >= 2) {
      renderHistoryChart(data.history, placeholder);
    } else {
      placeholder.innerHTML = '<div class="news-empty">Not enough history yet. Run analysis again on future days to build a chart.</div>';
    }
  } catch {
    const placeholder = document.getElementById('modal-history-placeholder');
    if (placeholder && currentModalStock?.ticker === requestedTicker) {
      placeholder.innerHTML = '<div class="news-empty">Could not load score history.</div>';
    }
  }
}

function renderHistoryChart(history, container) {
  const wrap = document.createElement('div');
  wrap.className = 'modal-history-wrap';
  const canvas = document.createElement('canvas');
  wrap.appendChild(canvas);
  container.innerHTML = '';
  container.appendChild(wrap);

  const lastScore = history[history.length - 1].score;
  const color = scoreColor(lastScore);

  const chart = new Chart(canvas.getContext('2d'), {
    type: 'line',
    data: {
      labels: history.map(h => h.date),
      datasets: [{
        data: history.map(h => h.score),
        borderColor: color,
        borderWidth: 2,
        backgroundColor: color + '20',
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointHoverRadius: 5,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#131922',
          borderColor: '#1f2d42',
          borderWidth: 1,
          titleColor: '#e8edf5',
          bodyColor: '#8a9bb5',
          callbacks: { label: ctx => `Score: ${ctx.raw}/100` }
        }
      },
      scales: {
        x: {
          ticks: { color: '#4d617a', font: { size: 10 } },
          grid: { color: gridColor() }
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#4d617a', font: { size: 10 } },
          grid: { color: gridColor() }
        }
      }
    }
  });

  modalCharts.push(chart);
}

/* ── News ───────────────────────────────────────────────────── */
async function fetchNews(ticker) {
  const requestedTicker = ticker;
  try {
    const res = await fetch(`/api/news/${ticker}`);
    const data = await res.json();

    if (currentModalStock?.ticker !== requestedTicker) return;

    const placeholder = document.getElementById('modal-news-placeholder');
    if (!placeholder) return;

    const items = data.news || [];
    if (!items.length) {
      placeholder.innerHTML = '<div class="news-empty">No recent news found.</div>';
      return;
    }

    placeholder.innerHTML = `
      <ul class="news-list">
        ${items.map(item => `
          <li class="news-item">
            <a class="news-headline" href="${item.url}" target="_blank" rel="noopener noreferrer">${item.title}</a>
            <div class="news-meta">${item.source ? item.source + ' \u00b7 ' : ''}${formatRelativeTime(item.published)}</div>
          </li>
        `).join('')}
      </ul>
    `;
  } catch {
    const placeholder = document.getElementById('modal-news-placeholder');
    if (placeholder && currentModalStock?.ticker === requestedTicker) {
      placeholder.innerHTML = '<div class="news-empty">Could not load news.</div>';
    }
  }
}

function formatRelativeTime(published) {
  if (!published) return '';

  let date;
  if (typeof published === 'number' || /^\d+$/.test(String(published))) {
    // Unix timestamp in seconds
    date = new Date(Number(published) * 1000);
  } else {
    date = new Date(published);
  }

  if (isNaN(date.getTime())) return published;

  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);

  if (diffSecs < 60) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  if (diffWeeks < 5) return `${diffWeeks}w ago`;
  if (diffMonths < 12) return `${diffMonths}mo ago`;
  return `${Math.floor(diffMonths / 12)}y ago`;
}

/* ── AI summary ─────────────────────────────────────────────── */
async function generateSummary(ticker) {
  const placeholder = document.getElementById('modal-summary-placeholder');
  if (!placeholder) return;

  placeholder.innerHTML = '<div class="news-loading">Generating analysis\u2026 <span class="spinner" style="display:inline-block;width:12px;height:12px;border-width:2px;vertical-align:middle"></span></div>';

  try {
    const res = await fetch(`/api/summary/${ticker}`);
    const data = await res.json();

    if (!data.available) {
      placeholder.innerHTML = '<div class="ai-unavailable">AI analysis requires an Anthropic API key. Set the ANTHROPIC_API_KEY environment variable to enable this feature.</div>';
      return;
    }

    if (data.summary) {
      placeholder.innerHTML = `<div class="ai-summary-text">${data.summary}</div>`;
    } else {
      placeholder.innerHTML = '<div class="ai-unavailable">Could not generate analysis. Please try again.</div>';
    }
  } catch {
    if (placeholder) {
      placeholder.innerHTML = '<div class="ai-unavailable">Failed to connect to AI service. Please try again.</div>';
    }
  }
}

/* ── Sector benchmarks ──────────────────────────────────────── */
function renderSectorBench(stock) {
  const sector = stock.sector;
  if (!sector || sector === 'N/A' || !sectorBenchmarks[sector]) return '';

  const bench = sectorBenchmarks[sector];

  const metricsConfig = [
    { key: 'pe_ratio',       label: 'P/E Ratio',       fmt: v => v != null ? v.toFixed(1) + 'x' : '\u2014',    lowerBetter: true },
    { key: 'roe',            label: 'ROE',              fmt: v => v != null ? (v * 100).toFixed(1) + '%' : '\u2014', lowerBetter: false },
    { key: 'revenue_growth', label: 'Rev Growth',       fmt: v => v != null ? (v * 100).toFixed(1) + '%' : '\u2014', lowerBetter: false },
    { key: 'profit_margin',  label: 'Profit Margin',    fmt: v => v != null ? (v * 100).toFixed(1) + '%' : '\u2014', lowerBetter: false },
    { key: 'score',          label: 'Score',            fmt: v => v != null ? v.toFixed(0) + '/100' : '\u2014',  lowerBetter: false },
  ];

  const rows = metricsConfig.map(m => {
    const stockVal = stock[m.key];
    const avgVal = bench[m.key];

    if (stockVal == null || avgVal == null) return '';

    let arrow = '';
    let arrowClass = '';
    const better = m.lowerBetter ? (stockVal < avgVal) : (stockVal > avgVal);
    if (better) {
      arrow = '\u2191';
      arrowClass = 'bench-up';
    } else {
      arrow = '\u2193';
      arrowClass = 'bench-down';
    }

    // Format avgVal
    const avgFormatted = m.fmt(avgVal);

    return `
      <div class="sector-bench-row">
        <span class="sector-bench-label">${m.label}</span>
        <span class="sector-bench-stock">${m.fmt(stockVal)}</span>
        <span class="sector-bench-avg">Sector avg: ${avgFormatted}</span>
        <span class="${arrowClass}">${arrow}</span>
      </div>
    `;
  }).join('');

  if (!rows.trim()) return '';

  return `
    <div class="modal-section-title">VS. Sector (${sector})</div>
    <div class="sector-bench-grid">${rows}</div>
  `;
}

/* ── Compare ─────────────────────────────────────────────────── */
function toggleCompare(ticker, event) {
  event.stopPropagation();

  if (compareSet.has(ticker)) {
    compareSet.delete(ticker);
  } else {
    if (compareSet.size >= 4) {
      compareSet.delete(ticker); // ensure not in set
      showToast('Max 4 stocks', 'You can compare up to 4 stocks at a time.');
      return;
    }
    compareSet.add(ticker);
  }

  // Update card visuals
  document.querySelectorAll('.stock-card').forEach(card => {
    const cb = card.querySelector('.compare-checkbox');
    if (!cb) return;
    const cardTicker = card.dataset.ticker;
    if (cardTicker) {
      cb.checked = compareSet.has(cardTicker);
      card.classList.toggle('compare-selected', compareSet.has(cardTicker));
    }
  });

  updateCompareBar();
}

function updateCompareBar() {
  const bar = document.getElementById('compare-bar');
  const chips = document.getElementById('compare-bar-chips');

  if (compareSet.size >= 2) {
    bar.classList.remove('hidden');
    chips.innerHTML = [...compareSet].map(t => `<span class="compare-bar-chip">${t}</span>`).join('');
  } else {
    bar.classList.add('hidden');
  }
}

function clearCompare() {
  compareSet.clear();

  document.querySelectorAll('.stock-card').forEach(card => {
    const cb = card.querySelector('.compare-checkbox');
    if (cb) cb.checked = false;
    card.classList.remove('compare-selected');
  });

  updateCompareBar();
}

function openCompareModal() {
  const tickers = [...compareSet];
  const stocks = tickers.map(t => allStocks.find(s => s.ticker === t)).filter(Boolean);

  if (stocks.length < 2) {
    showToast('Select stocks', 'Select at least 2 stocks to compare.');
    return;
  }

  const compareMetrics = [
    { key: 'score',          label: 'Score',          fmt: v => v != null ? v + '/100' : '\u2014',                lowerBetter: false, isString: false },
    { key: 'recommendation', label: 'Recommendation', fmt: v => v || '\u2014',                                    lowerBetter: false, isString: true },
    { key: 'price',          label: 'Price',          fmt: v => v != null ? '$' + fmt(v) : '\u2014',              lowerBetter: false, isString: false },
    { key: 'pe_ratio',       label: 'P/E Ratio',      fmt: v => v != null ? fmt(v) + 'x' : '\u2014',             lowerBetter: true,  isString: false },
    { key: 'forward_pe',     label: 'Forward P/E',    fmt: v => v != null ? fmt(v) + 'x' : '\u2014',             lowerBetter: true,  isString: false },
    { key: 'roe',            label: 'ROE',             fmt: v => v != null ? fmtPct(v) : '\u2014',                lowerBetter: false, isString: false },
    { key: 'revenue_growth', label: 'Revenue Growth', fmt: v => v != null ? fmtPct(v) : '\u2014',                lowerBetter: false, isString: false },
    { key: 'profit_margin',  label: 'Profit Margin',  fmt: v => v != null ? fmtPct(v) : '\u2014',                lowerBetter: false, isString: false },
    { key: 'debt_to_equity', label: 'Debt/Equity',    fmt: v => v != null ? fmt(v) + '%' : '\u2014',             lowerBetter: true,  isString: false },
    { key: 'current_ratio',  label: 'Current Ratio',  fmt: v => v != null ? fmt(v) : '\u2014',                   lowerBetter: false, isString: false },
    { key: 'dividend_yield', label: 'Dividend Yield', fmt: v => v != null ? fmtPct(v) : '\u2014',                lowerBetter: false, isString: false },
  ];

  const headerRow = `
    <tr>
      <th></th>
      ${stocks.map(s => `<th><div class="card-ticker">${s.ticker}</div><div style="font-size:11px;color:var(--text3);font-weight:400">${s.name || ''}</div></th>`).join('')}
    </tr>
  `;

  const dataRows = compareMetrics.map(m => {
    const values = stocks.map(s => s[m.key]);
    const numValues = values.filter(v => v != null && !m.isString);

    let bestIdx = -1;
    let worstIdx = -1;

    if (!m.isString && numValues.length >= 2) {
      const numericPairs = values.map((v, i) => ({ v, i })).filter(x => x.v != null);
      if (m.lowerBetter) {
        bestIdx = numericPairs.reduce((a, b) => a.v < b.v ? a : b).i;
        worstIdx = numericPairs.reduce((a, b) => a.v > b.v ? a : b).i;
      } else {
        bestIdx = numericPairs.reduce((a, b) => a.v > b.v ? a : b).i;
        worstIdx = numericPairs.reduce((a, b) => a.v < b.v ? a : b).i;
      }
    }

    const cells = values.map((v, i) => {
      let cls = '';
      if (!m.isString && i === bestIdx && bestIdx !== worstIdx) cls = 'compare-cell-best';
      else if (!m.isString && i === worstIdx && bestIdx !== worstIdx) cls = 'compare-cell-worst';

      let cellContent = m.fmt(v);
      if (m.key === 'recommendation' && v) {
        cellContent = `<span class="rec-pill ${recClass(v)}">${v}</span>`;
      }

      return `<td class="${cls}">${cellContent}</td>`;
    }).join('');

    return `<tr><td>${m.label}</td>${cells}</tr>`;
  }).join('');

  document.getElementById('compare-content').innerHTML = `
    <div class="modal-ticker" style="margin-bottom:16px">Compare Stocks</div>
    <table class="compare-table">
      <thead>${headerRow}</thead>
      <tbody>${dataRows}</tbody>
    </table>
  `;

  document.getElementById('compare-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';
}

function closeCompareModal(e) {
  if (e && e.target !== document.getElementById('compare-overlay') && !e.target.classList.contains('modal-close')) return;
  document.getElementById('compare-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ── Load stocks ────────────────────────────────────────────── */
async function loadStocks() {
  const tickers = [...watchlist.keys()];
  if (!tickers.length) { alert('Your watchlist is empty.'); return; }

  setLoading(true);

  try {
    const res = await fetch('/api/stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers })
    });
    const data = await res.json();
    allStocks = data.stocks || [];
    sectorBenchmarks = data.sector_benchmarks || {};

    document.getElementById('last-updated').textContent = 'Updated ' + (data.updated || '');

    renderSummary();
    renderInsights();
    renderScoreChart();
    populateSectorFilter();
    applyFilters();

    ['summary-section', 'insights-section', 'chart-section', 'leaderboard-section', 'portfolio-section'].forEach(id => {
      document.getElementById(id).classList.remove('hidden');
    });

    checkPriceAlerts(allStocks);
    renderPortfolio();
  } catch (e) {
    alert('Error fetching data: ' + e.message);
  } finally {
    setLoading(false);
  }
}

function setLoading(on) {
  const btn = document.getElementById('load-btn');
  const label = document.getElementById('btn-label');
  const spinner = document.getElementById('btn-spinner');
  btn.disabled = on;
  label.textContent = on ? 'Loading\u2026' : 'Analyze All';
  spinner.classList.toggle('hidden', !on);
}

/* ── Colour helpers ─────────────────────────────────────────── */
function scoreColor(s) {
  if (s >= 70) return '#22c55e';
  if (s >= 55) return '#84cc16';
  if (s >= 40) return '#f59e0b';
  if (s >= 25) return '#f97316';
  return '#ef4444';
}
function scoreClass(s) {
  if (s >= 70) return 'score-green';
  if (s >= 55) return 'score-lime';
  if (s >= 40) return 'score-amber';
  if (s >= 25) return 'score-orange';
  return 'score-red';
}
function recClass(r) {
  const m = { 'Strong Buy': 'rec-strong-buy', 'Buy': 'rec-buy', 'Hold': 'rec-hold', 'Reduce': 'rec-reduce', 'Sell': 'rec-sell' };
  return m[r] || 'rec-hold';
}
function fmt(v, digits = 2, suffix = '') {
  if (v == null) return '\u2014';
  return Number(v).toFixed(digits) + suffix;
}
function fmtPct(v) { return v == null ? '\u2014' : (v * 100).toFixed(1) + '%'; }

/* ── Summary ────────────────────────────────────────────────── */
function renderSummary() {
  const valid = allStocks.filter(s => !s.error);
  const top = valid[0];
  const worst = valid[valid.length - 1];
  const avg = valid.reduce((a, s) => a + s.score, 0) / (valid.length || 1);
  const strongBuys = valid.filter(s => s.recommendation === 'Strong Buy').length;

  const sectors = {};
  valid.forEach(s => {
    if (s.sector && s.sector !== 'N/A') {
      if (!sectors[s.sector]) sectors[s.sector] = [];
      sectors[s.sector].push(s.score);
    }
  });
  let bestSector = '\u2014';
  let bestAvg = 0;
  Object.entries(sectors).forEach(([sec, scores]) => {
    const a = scores.reduce((x, y) => x + y, 0) / scores.length;
    if (a > bestAvg) { bestAvg = a; bestSector = sec; }
  });

  document.getElementById('s-count').textContent = valid.length;
  document.getElementById('s-top').textContent = top ? top.ticker : '\u2014';
  document.getElementById('s-top-score').textContent = top ? `Score ${top.score}/100` : '';
  document.getElementById('s-worst').textContent = worst ? worst.ticker : '\u2014';
  document.getElementById('s-worst-score').textContent = worst ? `Score ${worst.score}/100` : '';
  document.getElementById('s-sector').textContent = bestSector;
  document.getElementById('s-buys').textContent = strongBuys;
  document.getElementById('s-avg').textContent = avg.toFixed(0) + '/100';
}

/* ── Insights ───────────────────────────────────────────────── */
function renderInsights() {
  const valid = allStocks.filter(s => !s.error && s.score != null);
  const container = document.getElementById('insights-content');
  const insights = [];

  const top3 = valid.slice(0, 3);
  if (top3.length) {
    insights.push({
      icon: '🏆',
      title: 'Top Investment Picks',
      body: top3.map(s => `<strong>${s.ticker}</strong> (${s.recommendation}, score ${s.score}) \u2014 ${s.name}`).join('<br>')
    });
  }

  const value = valid.filter(s => s.pe_ratio && s.pe_ratio < 18 && s.score >= 40).slice(0, 3);
  if (value.length) {
    insights.push({
      icon: '💎',
      title: 'Value Opportunities',
      body: value.map(s => `<strong>${s.ticker}</strong> \u2014 P/E ${fmt(s.pe_ratio)}x, score ${s.score}`).join('<br>')
    });
  }

  const growth = valid.filter(s => s.revenue_growth && s.revenue_growth > 0.15).sort((a, b) => b.revenue_growth - a.revenue_growth).slice(0, 3);
  if (growth.length) {
    insights.push({
      icon: '🚀',
      title: 'High-Growth Stocks',
      body: growth.map(s => `<strong>${s.ticker}</strong> \u2014 Revenue growth ${fmtPct(s.revenue_growth)}`).join('<br>')
    });
  }

  const divs = valid.filter(s => s.dividend_yield && s.dividend_yield > 0.01).sort((a, b) => b.dividend_yield - a.dividend_yield).slice(0, 3);
  if (divs.length) {
    insights.push({
      icon: '💰',
      title: 'Dividend Income Plays',
      body: divs.map(s => `<strong>${s.ticker}</strong> \u2014 Yield ${fmtPct(s.dividend_yield)}`).join('<br>')
    });
  }

  const avoid = valid.filter(s => s.score < 25).slice(0, 3);
  if (avoid.length) {
    insights.push({
      icon: '⚠️',
      title: 'Stocks to Avoid',
      body: avoid.map(s => `<strong>${s.ticker}</strong> \u2014 Score ${s.score}/100, ${s.recommendation}`).join('<br>')
    });
  }

  const roeStars = valid.filter(s => s.roe).sort((a, b) => b.roe - a.roe).slice(0, 3);
  if (roeStars.length) {
    insights.push({
      icon: '📈',
      title: 'Best Return on Equity',
      body: roeStars.map(s => `<strong>${s.ticker}</strong> \u2014 ROE ${fmtPct(s.roe)}`).join('<br>')
    });
  }

  const sectors = {};
  valid.forEach(s => {
    if (s.sector && s.sector !== 'N/A') {
      if (!sectors[s.sector]) sectors[s.sector] = [];
      sectors[s.sector].push(s.score);
    }
  });
  const sectorAvgs = Object.entries(sectors)
    .map(([k, v]) => ({ name: k, avg: v.reduce((a, b) => a + b, 0) / v.length, count: v.length }))
    .filter(s => s.count >= 2)
    .sort((a, b) => b.avg - a.avg);
  if (sectorAvgs.length) {
    insights.push({
      icon: '🗂️',
      title: 'Best Sectors (avg score)',
      body: sectorAvgs.slice(0, 4).map(s => `<strong>${s.name}</strong> \u2014 avg ${s.avg.toFixed(0)}/100`).join('<br>')
    });
  }

  container.innerHTML = insights.map(ins => `
    <div class="insight-card">
      <div class="insight-icon">${ins.icon}</div>
      <div>
        <div class="insight-title">${ins.title}</div>
        <div class="insight-body">${ins.body}</div>
      </div>
    </div>
  `).join('');
}

/* ── Theme-aware chart grid colour ──────────────────────────── */
function gridColor() {
  const light = document.documentElement.getAttribute('data-theme') === 'light';
  return light ? 'rgba(0,0,0,0.06)' : 'rgba(255,255,255,0.04)';
}

/* ── Score bar chart ─────────────────────────────────────────── */
function renderScoreChart() {
  const ctx = document.getElementById('score-chart').getContext('2d');
  const valid = allStocks.filter(s => !s.error).slice(0, 30);
  const labels = valid.map(s => s.ticker);
  const scores = valid.map(s => s.score);
  const colors = scores.map(scoreColor);

  if (scoreChartInstance) scoreChartInstance.destroy();

  scoreChartInstance = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        data: scores,
        backgroundColor: colors.map(c => c + '33'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 4,
        borderSkipped: false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#131922',
          borderColor: '#1f2d42',
          borderWidth: 1,
          titleColor: '#e8edf5',
          bodyColor: '#8a9bb5',
          callbacks: {
            label: ctx => `Score: ${ctx.raw}/100`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: '#8a9bb5', font: { family: 'Inter, Helvetica Neue, Helvetica, Arial, sans-serif', size: 11 } },
          grid: { color: gridColor() }
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#4d617a', font: { size: 11 } },
          grid: { color: gridColor() }
        }
      },
      onClick: (_, elements) => {
        if (elements.length) openModal(valid[elements[0].index]);
      }
    }
  });
}

/* ── Filters ─────────────────────────────────────────────────── */
function populateSectorFilter() {
  const sel = document.getElementById('sector-filter');
  const sectors = [...new Set(allStocks.filter(s => s.sector && s.sector !== 'N/A').map(s => s.sector))].sort();
  sel.innerHTML = '<option value="">All Sectors</option>' + sectors.map(s => `<option>${s}</option>`).join('');
}

function applyFilters() {
  const rec = document.getElementById('rec-filter').value;
  const sector = document.getElementById('sector-filter').value;
  const sortBy = document.getElementById('sort-by').value;
  const search = document.getElementById('search-input').value.toLowerCase();

  let filtered = allStocks.filter(s => {
    if (s.error) return false;
    if (rec && s.recommendation !== rec) return false;
    if (sector && s.sector !== sector) return false;
    if (search && !s.ticker.toLowerCase().includes(search) && !(s.name || '').toLowerCase().includes(search)) return false;
    return true;
  });

  filtered.sort((a, b) => {
    const av = a[sortBy] ?? -Infinity;
    const bv = b[sortBy] ?? -Infinity;
    return bv - av;
  });

  renderGrid(filtered);
}

/* ── Stock grid ──────────────────────────────────────────────── */
function renderGrid(stocks) {
  const grid = document.getElementById('stock-grid');
  if (!stocks.length) {
    grid.innerHTML = '<div style="color:var(--text3);padding:20px">No stocks match your filters.</div>';
    return;
  }
  grid.innerHTML = stocks.map(s => stockCard(s)).join('');
}

function stockCard(s) {
  const color = scoreColor(s.score);
  const isCompared = compareSet.has(s.ticker);
  return `
    <div class="stock-card${isCompared ? ' compare-selected' : ''}" style="--score-color:${color}" data-ticker="${s.ticker}" onclick="openModal(${JSON.stringify(s).replace(/"/g, '&quot;')})">
      <div class="compare-checkbox-wrap" onclick="toggleCompare('${s.ticker}', event)">
        <input type="checkbox" class="compare-checkbox" ${isCompared ? 'checked' : ''} onclick="event.stopPropagation()" />
      </div>
      <div class="card-header">
        <div>
          <div class="card-ticker">${s.ticker}</div>
          <div class="card-name" title="${s.name || ''}">${s.name || '\u2014'}</div>
          <div class="card-sector">${s.sector || ''}</div>
        </div>
        <div class="score-badge">
          <div class="score-num ${scoreClass(s.score)}">${s.score}</div>
          <div class="score-lbl">/ 100</div>
        </div>
      </div>
      <div class="score-bar-wrap">
        <div class="score-bar-track">
          <div class="score-bar-fill" style="width:${s.score}%;background:${color}"></div>
        </div>
      </div>
      <div class="rec-pill ${recClass(s.recommendation)}">${s.recommendation}</div>
      <div class="card-metrics">
        <div class="metric-item">
          <div class="metric-label">Price</div>
          <div class="metric-value">${s.price != null ? '$' + fmt(s.price) : '\u2014'}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">P/E Ratio</div>
          <div class="metric-value">${fmt(s.pe_ratio)}x</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">ROE</div>
          <div class="metric-value">${fmtPct(s.roe)}</div>
        </div>
        <div class="metric-item">
          <div class="metric-label">Rev Growth</div>
          <div class="metric-value">${fmtPct(s.revenue_growth)}</div>
        </div>
      </div>
    </div>`;
}

/* ── Modal ───────────────────────────────────────────────────── */
function openModal(s) {
  currentModalStock = s;
  const color = scoreColor(s.score);

  const html = `
    <div class="modal-ticker">${s.ticker}</div>
    <div class="modal-name">${s.name || ''}</div>
    <div class="modal-sector-row">
      ${s.sector && s.sector !== 'N/A' ? `<span class="tag">${s.sector}</span>` : ''}
      ${s.industry && s.industry !== 'N/A' ? `<span class="tag">${s.industry}</span>` : ''}
      ${s.market_cap ? `<span class="tag">${s.market_cap} Market Cap</span>` : ''}
      ${s.beta != null ? `<span class="tag">\u03b2 ${fmt(s.beta)}</span>` : ''}
    </div>

    <div class="modal-score-row">
      <div class="modal-score-big ${scoreClass(s.score)}">${s.score}</div>
      <div class="modal-score-info">
        <div class="modal-score-label">Fundamental Score</div>
        <div class="modal-rec" style="color:${color}">${s.recommendation}</div>
        <div style="margin-top:8px">
          <div class="score-bar-track" style="width:180px">
            <div class="score-bar-fill" style="width:${s.score}%;background:${color}"></div>
          </div>
        </div>
      </div>
    </div>

    <div class="modal-section-title">Price Alert</div>
    <div id="modal-alert-ui">${renderAlertUI(s.ticker, s.price)}</div>

    ${renderSectorBench(s)}

    <div class="modal-section-title">Valuation</div>
    <div class="modal-metrics-grid">
      ${mCell('Price', s.price != null ? '$' + fmt(s.price) : '\u2014')}
      ${mCell('P/E (TTM)', fmt(s.pe_ratio) + 'x')}
      ${mCell('Forward P/E', fmt(s.forward_pe) + 'x')}
      ${mCell('P/B Ratio', fmt(s.pb_ratio) + 'x')}
      ${mCell('EV/EBITDA', fmt(s.ev_ebitda) + 'x')}
      ${mCell('Analyst Target', s.analyst_target ? '$' + fmt(s.analyst_target) : '\u2014')}
      ${mCell('52W High', s['52w_high'] ? '$' + fmt(s['52w_high']) : '\u2014')}
      ${mCell('52W Low', s['52w_low'] ? '$' + fmt(s['52w_low']) : '\u2014')}
    </div>

    <div class="modal-section-title">Profitability</div>
    <div class="modal-metrics-grid">
      ${mCell('ROE', fmtPct(s.roe))}
      ${mCell('ROA', fmtPct(s.roa))}
      ${mCell('Profit Margin', fmtPct(s.profit_margin))}
      ${mCell('Revenue Growth', fmtPct(s.revenue_growth))}
      ${mCell('Earnings Growth', fmtPct(s.earnings_growth))}
      ${mCell('Dividend Yield', fmtPct(s.dividend_yield))}
    </div>

    <div class="modal-section-title">Financial Health</div>
    <div class="modal-metrics-grid">
      ${mCell('Debt / Equity', s.debt_to_equity != null ? fmt(s.debt_to_equity) + '%' : '\u2014')}
      ${mCell('Current Ratio', fmt(s.current_ratio))}
    </div>

    ${s.reasons && s.reasons.length ? `
      <div class="modal-section-title">Key Factors</div>
      <ul class="reasons-list">
        ${s.reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>` : ''}

    <div class="modal-section-title">Score History</div>
    <div id="modal-history-placeholder"><div class="news-loading">Loading history\u2026</div></div>

    <div class="modal-section-title">Recent News</div>
    <div id="modal-news-placeholder"><div class="news-loading">Loading news\u2026</div></div>

    <div class="modal-section-title">AI Analysis</div>
    <div id="modal-summary-placeholder"><button class="btn-generate" onclick="generateSummary('${s.ticker}')">Generate Analysis</button></div>

    ${s.price_history && s.price_history.length ? `
      <div class="modal-section-title">1-Year Price History</div>
      <div class="modal-chart-wrap">
        <canvas id="modal-price-chart"></canvas>
      </div>` : ''}
  `;

  document.getElementById('modal-content').innerHTML = html;
  document.getElementById('modal-overlay').classList.remove('hidden');
  document.body.style.overflow = 'hidden';

  if (s.price_history && s.price_history.length) {
    requestAnimationFrame(() => renderModalChart(s, color));
  }

  // Fire-and-forget async fetches
  fetchNews(s.ticker);
  fetchScoreHistory(s.ticker);
}

function mCell(label, value) {
  return `<div class="modal-metric"><div class="modal-metric-label">${label}</div><div class="modal-metric-value">${value}</div></div>`;
}

function renderModalChart(s, color) {
  const ctx = document.getElementById('modal-price-chart');
  if (!ctx) return;
  if (modalPriceChart) { modalPriceChart.destroy(); modalPriceChart = null; }

  const labels = s.price_history.map(p => p.date);
  const prices = s.price_history.map(p => p.price);

  modalPriceChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: prices,
        borderColor: color,
        borderWidth: 1.5,
        backgroundColor: color + '15',
        fill: true,
        tension: 0.3,
        pointRadius: 0,
        pointHoverRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#131922',
          borderColor: '#1f2d42',
          borderWidth: 1,
          titleColor: '#e8edf5',
          bodyColor: '#8a9bb5',
          callbacks: { label: ctx => `$${ctx.raw}` }
        }
      },
      scales: {
        x: {
          ticks: { color: '#4d617a', font: { size: 10 }, maxTicksLimit: 8 },
          grid: { color: gridColor() }
        },
        y: {
          ticks: { color: '#4d617a', font: { size: 10 }, callback: v => '$' + v },
          grid: { color: gridColor() }
        }
      }
    }
  });

  modalCharts.push(modalPriceChart);
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay') && !e.target.classList.contains('modal-close')) return;

  // Destroy all modal charts
  modalCharts.forEach(c => { try { c.destroy(); } catch {} });
  modalCharts = [];
  if (modalPriceChart) { try { modalPriceChart.destroy(); } catch {} modalPriceChart = null; }

  currentModalStock = null;
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
}

/* ── Escape key ─────────────────────────────────────────────── */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    const compareOverlay = document.getElementById('compare-overlay');
    const modalOverlay = document.getElementById('modal-overlay');
    if (compareOverlay && !compareOverlay.classList.contains('hidden')) {
      closeCompareModal({});
    } else if (modalOverlay && !modalOverlay.classList.contains('hidden')) {
      closeModal({});
    }
  }
});

/* ── Theme toggle ───────────────────────────────────────────── */
function toggleTheme() {
  const isLight = document.documentElement.getAttribute('data-theme') === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'dark' : 'light');
  document.getElementById('theme-toggle').textContent = isLight ? '\u263D' : '\u2600';
  localStorage.setItem('theme', isLight ? 'dark' : 'light');
  if (allStocks.length) { renderScoreChart(); }
}

/* ── Init ───────────────────────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  document.getElementById('theme-toggle').textContent = savedTheme === 'light' ? '\u2600' : '\u263D';

  initWatchlist();
  loadPortfolio();
  loadAlerts();

  const searchInput = document.getElementById('company-search');
  searchInput.addEventListener('input', handleSearchInput);

  const portfolioSearchInput = document.getElementById('portfolio-search');
  if (portfolioSearchInput) {
    portfolioSearchInput.addEventListener('input', handlePortfolioSearchInput);
  }
});
