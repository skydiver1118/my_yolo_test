# TradingAgents Stock Command Center

Static dashboard for the E*TRADE watchlist and local TradingAgents artifacts.

## Data Sources

- E*TRADE watchlist: `C:\Users\skydiver1118\Downloads\etrade_26May2026_2040.csv`
- Local dashboard watchlist: `C:\Users\skydiver1118\Documents\New project\tradingagents_dashboard\watchlist.local.json`
- Portfolio snapshot: `C:\Users\skydiver1118\Documents\Stock Analysis\TradingAgents\reports\portfolio_decision_snapshots_2026-05-26`
- Full TradingAgents reports: `C:\Users\skydiver1118\Documents\Stock Analysis\TradingAgents\reports\full_tradingagents_batch_2026-05-26\2026-05-22_ollama_qwen3_1.7b`
- SMA fallback state: `C:\Users\skydiver1118\Documents\New project\data\owned_stocks_sma50_state.json`

## Local Watchlist

Add persistent manual symbols in `watchlist.local.json`. These are merged with the latest E*TRADE import and deduped by ticker. Current local additions:

- `POWL`
- `EUV`

## Refresh

Run this after new TradingAgents reports or a new E*TRADE export is available:

```powershell
python scripts\refresh_tradingagents_dashboard.py --reports missing
```

To regenerate every grounded TradingAgents report before rebuilding the dashboard:

```powershell
python scripts\refresh_tradingagents_dashboard.py --reports all
```

Then serve the dashboard:

```powershell
cd tradingagents_dashboard
python -m http.server 8787 --bind 127.0.0.1
```

Open `http://127.0.0.1:8787/`.

## Static Hosting

Live GitHub Pages dashboard:

```text
https://skydiver1118.github.io/my_yolo_test/
```

Refresh, publish to GitHub Pages, and send the completion email:

```powershell
python scripts\publish_tradingagents_dashboard.py --reports missing --email-to skydiver1118@gmail.com
```

## On-Demand Backend

The GitHub Pages dashboard can request a fresh TradingAgents run from this local backend:

```powershell
python scripts\serve_tradingagents_backend.py
```

Then open the GitHub Pages dashboard and type a ticker in the `Run` box. The page calls `http://127.0.0.1:8790/analyze`, waits for the local TradingAgents report to finish, and renders the returned full report in the same top panel and module tabs as the saved watchlist reports.

The dashboard is plain HTML, CSS, JavaScript, and a generated `data/dashboard-data.js` file, so it can also be uploaded to a static host such as Cloudflare Pages or Netlify.
