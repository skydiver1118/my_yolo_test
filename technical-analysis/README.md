# Technical Analysis Command Center

Static dashboard for the TradingAgents automation watchlist, rebuilt with the local technical-analysis framework instead of TradingAgents narrative reports.

## Refresh

```powershell
python scripts\build_technical_analysis_dashboard.py --date 2026-05-31
```

The build script:

- Scores the merged TradingAgents watchlist.
- Generates each available symbol's candlestick technical chart and full Markdown report.
- Copies charts into `technical_analysis_dashboard/charts`.
- Writes `technical_analysis_dashboard/data/dashboard-data.js`.

## Serve Locally

```powershell
cd technical_analysis_dashboard
python -m http.server 8788 --bind 127.0.0.1
```

Open `http://127.0.0.1:8788/`.

## Publish

The intended GitHub Pages path is:

```text
https://skydiver1118.github.io/my_yolo_test/technical-analysis/
```
