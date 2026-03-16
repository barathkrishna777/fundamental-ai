import json
import math
from flask import Flask, render_template, jsonify, request
import yfinance as yf
from datetime import datetime

app = Flask(__name__)

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
    return jsonify({"stocks": results, "updated": datetime.now().strftime("%Y-%m-%d %H:%M:%S")})

@app.route("/api/stock/<ticker>")
def get_single_stock(ticker):
    return jsonify(fetch_stock(ticker.upper()))

if __name__ == "__main__":
    app.run(debug=True, port=5050)
