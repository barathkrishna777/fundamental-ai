/* ── State ─────────────────────────────────────────────────── */
let allStocks = [];
let scoreChartInstance = null;
let modalPriceChart = null;

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
  if (v == null) return '—';
  return Number(v).toFixed(digits) + suffix;
}
function fmtPct(v) { return v == null ? '—' : (v * 100).toFixed(1) + '%'; }

/* ── Load stocks ────────────────────────────────────────────── */
async function loadStocks() {
  const raw = document.getElementById('ticker-input').value.trim();
  const tickers = raw ? raw.split(/[\s,]+/).filter(Boolean) : [];

  setLoading(true);

  try {
    const res = await fetch('/api/stocks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tickers: tickers.length ? tickers : null })
    });
    const data = await res.json();
    allStocks = data.stocks || [];

    document.getElementById('last-updated').textContent = 'Updated ' + (data.updated || '');

    renderSummary();
    renderInsights();
    renderScoreChart();
    populateSectorFilter();
    applyFilters();

    ['summary-section', 'insights-section', 'chart-section', 'leaderboard-section'].forEach(id => {
      document.getElementById(id).classList.remove('hidden');
    });
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
  label.textContent = on ? 'Loading…' : 'Analyze';
  spinner.classList.toggle('hidden', !on);
}

/* ── Summary ────────────────────────────────────────────────── */
function renderSummary() {
  const valid = allStocks.filter(s => !s.error);
  const top = valid[0];
  const worst = valid[valid.length - 1];
  const avg = valid.reduce((a, s) => a + s.score, 0) / (valid.length || 1);
  const strongBuys = valid.filter(s => s.recommendation === 'Strong Buy').length;

  // Best sector by avg score
  const sectors = {};
  valid.forEach(s => {
    if (s.sector && s.sector !== 'N/A') {
      if (!sectors[s.sector]) sectors[s.sector] = [];
      sectors[s.sector].push(s.score);
    }
  });
  let bestSector = '—';
  let bestAvg = 0;
  Object.entries(sectors).forEach(([sec, scores]) => {
    const a = scores.reduce((x, y) => x + y, 0) / scores.length;
    if (a > bestAvg) { bestAvg = a; bestSector = sec; }
  });

  document.getElementById('s-count').textContent = valid.length;
  document.getElementById('s-top').textContent = top ? top.ticker : '—';
  document.getElementById('s-top-score').textContent = top ? `Score ${top.score}/100` : '';
  document.getElementById('s-worst').textContent = worst ? worst.ticker : '—';
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

  // Top 3 by score
  const top3 = valid.slice(0, 3);
  if (top3.length) {
    insights.push({
      icon: '🏆',
      title: 'Top Investment Picks',
      body: top3.map(s => `<strong>${s.ticker}</strong> (${s.recommendation}, score ${s.score}) — ${s.name}`).join('<br>')
    });
  }

  // Value plays: low P/E + decent score
  const value = valid.filter(s => s.pe_ratio && s.pe_ratio < 18 && s.score >= 40).slice(0, 3);
  if (value.length) {
    insights.push({
      icon: '💎',
      title: 'Value Opportunities',
      body: value.map(s => `<strong>${s.ticker}</strong> — P/E ${fmt(s.pe_ratio)}x, score ${s.score}`).join('<br>')
    });
  }

  // Growth stars
  const growth = valid.filter(s => s.revenue_growth && s.revenue_growth > 0.15).sort((a, b) => b.revenue_growth - a.revenue_growth).slice(0, 3);
  if (growth.length) {
    insights.push({
      icon: '🚀',
      title: 'High-Growth Stocks',
      body: growth.map(s => `<strong>${s.ticker}</strong> — Revenue growth ${fmtPct(s.revenue_growth)}`).join('<br>')
    });
  }

  // Dividend income
  const divs = valid.filter(s => s.dividend_yield && s.dividend_yield > 0.01).sort((a, b) => b.dividend_yield - a.dividend_yield).slice(0, 3);
  if (divs.length) {
    insights.push({
      icon: '💰',
      title: 'Dividend Income Plays',
      body: divs.map(s => `<strong>${s.ticker}</strong> — Yield ${fmtPct(s.dividend_yield)}`).join('<br>')
    });
  }

  // Avoid
  const avoid = valid.filter(s => s.score < 25).slice(0, 3);
  if (avoid.length) {
    insights.push({
      icon: '⚠️',
      title: 'Stocks to Avoid',
      body: avoid.map(s => `<strong>${s.ticker}</strong> — Score ${s.score}/100, ${s.recommendation}`).join('<br>')
    });
  }

  // Best ROE
  const roeStars = valid.filter(s => s.roe).sort((a, b) => b.roe - a.roe).slice(0, 3);
  if (roeStars.length) {
    insights.push({
      icon: '📈',
      title: 'Best Return on Equity',
      body: roeStars.map(s => `<strong>${s.ticker}</strong> — ROE ${fmtPct(s.roe)}`).join('<br>')
    });
  }

  // Sector averages
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
      body: sectorAvgs.slice(0, 4).map(s => `<strong>${s.name}</strong> — avg ${s.avg.toFixed(0)}/100`).join('<br>')
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
          ticks: { color: '#8a9bb5', font: { family: 'Helvetica Neue, Helvetica, Arial, sans-serif', size: 11 } },
          grid: { color: '#1a2233' }
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#4d617a', font: { size: 11 } },
          grid: { color: '#131922' }
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
  return `
    <div class="stock-card" style="--score-color:${color}" onclick="openModal(${JSON.stringify(s).replace(/"/g, '&quot;')})">
      <div class="card-header">
        <div>
          <div class="card-ticker">${s.ticker}</div>
          <div class="card-name" title="${s.name || ''}">${s.name || '—'}</div>
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
          <div class="metric-value">${s.price != null ? '$' + fmt(s.price) : '—'}</div>
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
  const color = scoreColor(s.score);
  const html = `
    <div class="modal-ticker">${s.ticker}</div>
    <div class="modal-name">${s.name || ''}</div>
    <div class="modal-sector-row">
      ${s.sector && s.sector !== 'N/A' ? `<span class="tag">${s.sector}</span>` : ''}
      ${s.industry && s.industry !== 'N/A' ? `<span class="tag">${s.industry}</span>` : ''}
      ${s.market_cap ? `<span class="tag">${s.market_cap} Market Cap</span>` : ''}
      ${s.beta != null ? `<span class="tag">β ${fmt(s.beta)}</span>` : ''}
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

    <div class="modal-section-title">Valuation</div>
    <div class="modal-metrics-grid">
      ${mCell('Price', s.price != null ? '$' + fmt(s.price) : '—')}
      ${mCell('P/E (TTM)', fmt(s.pe_ratio) + 'x')}
      ${mCell('Forward P/E', fmt(s.forward_pe) + 'x')}
      ${mCell('P/B Ratio', fmt(s.pb_ratio) + 'x')}
      ${mCell('EV/EBITDA', fmt(s.ev_ebitda) + 'x')}
      ${mCell('Analyst Target', s.analyst_target ? '$' + fmt(s.analyst_target) : '—')}
      ${mCell('52W High', s['52w_high'] ? '$' + fmt(s['52w_high']) : '—')}
      ${mCell('52W Low', s['52w_low'] ? '$' + fmt(s['52w_low']) : '—')}
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
      ${mCell('Debt / Equity', s.debt_to_equity != null ? fmt(s.debt_to_equity) + '%' : '—')}
      ${mCell('Current Ratio', fmt(s.current_ratio))}
    </div>

    ${s.reasons && s.reasons.length ? `
      <div class="modal-section-title">Key Factors</div>
      <ul class="reasons-list">
        ${s.reasons.map(r => `<li>${r}</li>`).join('')}
      </ul>` : ''}

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
}

function mCell(label, value) {
  return `<div class="modal-metric"><div class="modal-metric-label">${label}</div><div class="modal-metric-value">${value}</div></div>`;
}

function renderModalChart(s, color) {
  const ctx = document.getElementById('modal-price-chart');
  if (!ctx) return;
  if (modalPriceChart) modalPriceChart.destroy();

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
          grid: { color: '#131922' }
        },
        y: {
          ticks: { color: '#4d617a', font: { size: 10 }, callback: v => '$' + v },
          grid: { color: '#131922' }
        }
      }
    }
  });
}

function closeModal(e) {
  if (e && e.target !== document.getElementById('modal-overlay') && !e.target.classList.contains('modal-close')) return;
  document.getElementById('modal-overlay').classList.add('hidden');
  document.body.style.overflow = '';
  if (modalPriceChart) { modalPriceChart.destroy(); modalPriceChart = null; }
}

document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal({}); });

/* ── Auto-run on page load ───────────────────────────────────── */
window.addEventListener('DOMContentLoaded', () => {
  // Don't auto-load — let user click Analyze
});
