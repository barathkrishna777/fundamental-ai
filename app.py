import json
import math
import sqlite3
import threading
import os
from flask import Flask, render_template, jsonify, request
import yfinance as yf
from datetime import datetime

try:
    import anthropic
    _anthropic_available = True
except ImportError:
    _anthropic_available = False

app = Flask(__name__)

# ── SQLite thread-safe setup ─────────────────────────────────────────────────
DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'scores.db')
_db_local = threading.local()

def get_db():
    if not hasattr(_db_local, 'conn'):
        _db_local.conn = sqlite3.connect(DB_PATH)
        _db_local.conn.row_factory = sqlite3.Row
    return _db_local.conn

def init_db():
    conn = get_db()
    conn.execute('''CREATE TABLE IF NOT EXISTS score_history
                    (ticker TEXT, date TEXT, score INTEGER,
                     PRIMARY KEY (ticker, date))''')
    conn.commit()

init_db()

# ── AI summary cache ──────────────────────────────────────────────────────────
_summary_cache = {}

# ── Default tickers ──────────────────────────────────────────────────────────
DEFAULT_TICKERS = [
    "AAPL", "MSFT", "GOOGL", "AMZN", "META", "NVDA", "TSLA", "AMD",
    "JPM", "BAC", "GS", "V", "MA",
    "JNJ", "PFE", "UNH",
    "WMT", "COST", "MCD",
    "XOM", "CVX",
    "NFLX", "DIS", "INTC", "CRM", "ORCL"
]

def safe(val, default=None):
    if val is None:
        return default
    try:
        if isinstance(val, float) and math.isnan(val):
            return default
        return val
    except Exception:
        return default

def score_stock(info):
    """Compute a 0–100 fundamental score."""
    score = 0
    reasons = []

    # Valuation (lower P/E is better, up to a point)
    pe = safe(info.get("trailingPE"))
    if pe:
        if pe < 15:
            score += 20; reasons.append("Low P/E (value opportunity)")
        elif pe < 25:
            score += 15; reasons.append("Fair P/E valuation")
        elif pe < 40:
            score += 8
        else:
            reasons.append("High P/E (expensive valuation)")

    # Profitability: ROE
    roe = safe(info.get("returnOnEquity"))
    if roe:
        if roe > 0.25:
            score += 20; reasons.append("Excellent ROE (>25%)")
        elif roe > 0.15:
            score += 12; reasons.append("Good ROE (>15%)")
        elif roe > 0:
            score += 5
        else:
            reasons.append("Negative ROE (not profitable)")

    # Revenue growth
    rev_growth = safe(info.get("revenueGrowth"))
    if rev_growth:
        if rev_growth > 0.20:
            score += 20; reasons.append(f"Strong revenue growth ({rev_growth*100:.1f}%)")
        elif rev_growth > 0.10:
            score += 12; reasons.append(f"Healthy revenue growth ({rev_growth*100:.1f}%)")
        elif rev_growth > 0:
            score += 5
        else:
            reasons.append("Revenue declining")

    # Debt: D/E ratio (lower is safer)
    de = safe(info.get("debtToEquity"))
    if de is not None:
        if de < 50:
            score += 15; reasons.append("Low debt-to-equity (<50%)")
        elif de < 100:
            score += 10; reasons.append("Moderate debt levels")
        elif de < 200:
            score += 3
        else:
            reasons.append("High debt burden")

    # Profit margin
    margin = safe(info.get("profitMargins"))
    if margin:
        if margin > 0.20:
            score += 15; reasons.append(f"High profit margin ({margin*100:.1f}%)")
        elif margin > 0.10:
            score += 8
        elif margin > 0:
            score += 3
        else:
            reasons.append("Negative profit margin")

    # Current ratio (liquidity)
    cr = safe(info.get("currentRatio"))
    if cr:
        if cr > 2:
            score += 10; reasons.append("Strong liquidity (CR>2)")
        elif cr > 1:
            score += 5
        else:
            reasons.append("Liquidity risk (CR<1)")

    return min(100, max(0, score)), reasons

def get_recommendation(score, info):
    pe = safe(info.get("trailingPE"), 999)
    roe = safe(info.get("returnOnEquity"), 0)
    rev_growth = safe(info.get("revenueGrowth"), 0)

    if score >= 70:
        return "Strong Buy"
    elif score >= 55:
        return "Buy"
    elif score >= 40:
        return "Hold"
    elif score >= 25:
        return "Reduce"
    else:
        return "Sell"

def fetch_stock(ticker):
    try:
        t = yf.Ticker(ticker)
        info = t.info

        # Price history for 1-year chart
        hist = t.history(period="1y")
        price_history = []
        if not hist.empty:
            sampled = hist["Close"].resample("W").last().dropna()
            price_history = [
                {"date": str(d.date()), "price": round(float(p), 2)}
                for d, p in sampled.items()
            ]

        score, reasons = score_stock(info)
        rec = get_recommendation(score, info)

        market_cap = safe(info.get("marketCap"))
        market_cap_str = ""
        if market_cap:
            if market_cap >= 1e12:
                market_cap_str = f"${market_cap/1e12:.2f}T"
            elif market_cap >= 1e9:
                market_cap_str = f"${market_cap/1e9:.2f}B"
            else:
                market_cap_str = f"${market_cap/1e6:.2f}M"

        return {
            "ticker": ticker,
            "name": safe(info.get("longName"), ticker),
            "sector": safe(info.get("sector"), "N/A"),
            "industry": safe(info.get("industry"), "N/A"),
            "price": safe(info.get("currentPrice") or info.get("regularMarketPrice")),
            "change_pct": safe(info.get("52WeekChange")),
            "market_cap": market_cap_str,
            "pe_ratio": safe(info.get("trailingPE")),
            "forward_pe": safe(info.get("forwardPE")),
            "pb_ratio": safe(info.get("priceToBook")),
            "ev_ebitda": safe(info.get("enterpriseToEbitda")),
            "roe": safe(info.get("returnOnEquity")),
            "roa": safe(info.get("returnOnAssets")),
            "profit_margin": safe(info.get("profitMargins")),
            "revenue_growth": safe(info.get("revenueGrowth")),
            "earnings_growth": safe(info.get("earningsGrowth")),
            "debt_to_equity": safe(info.get("debtToEquity")),
            "current_ratio": safe(info.get("currentRatio")),
            "dividend_yield": safe(info.get("dividendYield")),
            "beta": safe(info.get("beta")),
            "52w_high": safe(info.get("fiftyTwoWeekHigh")),
            "52w_low": safe(info.get("fiftyTwoWeekLow")),
            "analyst_target": safe(info.get("targetMeanPrice")),
            "score": score,
            "reasons": reasons,
            "recommendation": rec,
            "price_history": price_history,
            "error": None,
        }
    except Exception as e:
        return {"ticker": ticker, "error": str(e), "score": 0, "recommendation": "N/A", "name": ticker}

def save_scores(stocks):
    conn = get_db()
    date = datetime.now().strftime('%Y-%m-%d')
    for s in stocks:
        if not s.get('error') and s.get('score') is not None:
            conn.execute('INSERT OR REPLACE INTO score_history VALUES (?,?,?)',
                        (s['ticker'], date, s['score']))
    conn.commit()

def compute_sector_benchmarks(stocks):
    """Group stocks by sector and compute mean metrics."""
    sectors = {}
    metrics = ['pe_ratio', 'roe', 'revenue_growth', 'profit_margin', 'score']

    for s in stocks:
        if s.get('error') or not s.get('sector') or s.get('sector') == 'N/A':
            continue
        sector = s['sector']
        if sector not in sectors:
            sectors[sector] = {m: [] for m in metrics}
        for m in metrics:
            val = s.get(m)
            if val is not None:
                sectors[sector][m].append(val)

    benchmarks = {}
    for sector, data in sectors.items():
        benchmarks[sector] = {}
        for m in metrics:
            vals = data[m]
            if vals:
                benchmarks[sector][m] = round(sum(vals) / len(vals), 4)
            else:
                benchmarks[sector][m] = None

    return benchmarks

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/api/stocks", methods=["POST"])
def get_stocks():
    data = request.get_json(silent=True) or {}
    tickers = data.get("tickers") or DEFAULT_TICKERS
    tickers = [t.strip().upper() for t in tickers if t.strip()]

    results = []
    for ticker in tickers:
        results.append(fetch_stock(ticker))

    # Sort by score descending
    results.sort(key=lambda x: x.get("score", 0), reverse=True)

    # Persist scores
    save_scores(results)

    # Compute sector benchmarks
    sector_benchmarks = compute_sector_benchmarks(results)

    return jsonify({
        "stocks": results,
        "updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
        "sector_benchmarks": sector_benchmarks,
    })

@app.route("/api/search")
def search_stocks():
    query = request.args.get("q", "").strip()
    if not query or len(query) < 2:
        return jsonify({"results": []})
    try:
        search = yf.Search(query, max_results=8)
        results = []
        for q in (search.quotes or []):
            if q.get("quoteType") in ("EQUITY", "ETF"):
                ticker = q.get("symbol", "")
                name = q.get("longname") or q.get("shortname", "")
                if ticker and name:
                    results.append({"ticker": ticker, "name": name})
        return jsonify({"results": results[:6]})
    except Exception as e:
        return jsonify({"results": [], "error": str(e)})

@app.route("/api/stock/<ticker>")
def get_single_stock(ticker):
    return jsonify(fetch_stock(ticker.upper()))

@app.route("/api/history/<ticker>")
def get_history(ticker):
    rows = get_db().execute(
        'SELECT date, score FROM score_history WHERE ticker=? ORDER BY date',
        (ticker.upper(),)
    ).fetchall()
    return jsonify({'history': [{'date': r['date'], 'score': r['score']} for r in rows]})

@app.route("/api/news/<ticker>")
def get_news(ticker):
    try:
        t = yf.Ticker(ticker.upper())
        raw = t.news or []
        items = []
        for article in raw:
            try:
                # New format: article has a "content" key
                if 'content' in article and isinstance(article['content'], dict):
                    content = article['content']
                    title = content.get('title', '')
                    url_obj = content.get('canonicalUrl') or {}
                    url = url_obj.get('url', '') if isinstance(url_obj, dict) else ''
                    pub_date = content.get('pubDate', '')
                    provider = content.get('provider') or {}
                    source = provider.get('displayName', '') if isinstance(provider, dict) else ''
                else:
                    # Old format: flat keys
                    title = article.get('title', '')
                    url = article.get('link', '')
                    pub_ts = article.get('providerPublishTime')
                    pub_date = str(pub_ts) if pub_ts is not None else ''
                    source = article.get('publisher', '')

                if title:
                    items.append({
                        'title': title,
                        'url': url,
                        'source': source,
                        'published': pub_date,
                    })
            except Exception:
                continue

            if len(items) >= 5:
                break

        return jsonify({'news': items})
    except Exception as e:
        return jsonify({'news': [], 'error': str(e)})

@app.route("/api/summary/<ticker>")
def get_summary(ticker):
    ticker = ticker.upper()

    api_key = os.environ.get('ANTHROPIC_API_KEY')
    if not _anthropic_available or not api_key:
        return jsonify({'available': False, 'summary': None})

    if ticker in _summary_cache:
        return jsonify({'available': True, 'summary': _summary_cache[ticker], 'cached': True})

    try:
        t = yf.Ticker(ticker)
        info = t.info

        name = safe(info.get('longName'), ticker)
        sector = safe(info.get('sector'), 'N/A')
        price = safe(info.get('currentPrice') or info.get('regularMarketPrice'), 0)
        pe = safe(info.get('trailingPE'))
        roe = safe(info.get('returnOnEquity'))
        rev_growth = safe(info.get('revenueGrowth'))
        profit_margin = safe(info.get('profitMargins'))

        score, _ = score_stock(info)

        pe_str = f"{pe:.1f}" if pe is not None else "N/A"
        roe_str = f"{roe*100:.1f}" if roe is not None else "N/A"
        rev_str = f"{rev_growth*100:.1f}" if rev_growth is not None else "N/A"
        margin_str = f"{profit_margin*100:.1f}" if profit_margin is not None else "N/A"

        prompt = (
            f"Analyze {name} ({ticker}) in the {sector} sector. "
            f"Key metrics: Price ${price:.2f}, P/E {pe_str}x, ROE {roe_str}%, "
            f"Revenue growth {rev_str}%, Profit margin {margin_str}%, Score {score}/100. "
            f"Write a concise 2-3 sentence investment verdict. Be specific about valuation, "
            f"key strengths, and risks. No disclaimers."
        )

        client = anthropic.Anthropic(api_key=api_key)
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=200,
            messages=[{"role": "user", "content": prompt}]
        )
        summary_text = message.content[0].text.strip()
        _summary_cache[ticker] = summary_text

        return jsonify({'available': True, 'summary': summary_text})
    except Exception as e:
        return jsonify({'available': False, 'summary': None, 'error': str(e)})

if __name__ == "__main__":
    app.run(debug=True, port=5050)
