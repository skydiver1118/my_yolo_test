const data = window.TRADING_AGENTS_DASHBOARD_DATA;

const state = {
  selectedSymbol: null,
  filter: "all",
  query: "",
  moduleKey: "market",
  backendUrl: "http://127.0.0.1:8790",
  runnerBusy: false,
};

const moduleOrder = [
  "market",
  "sentiment",
  "news",
  "fundamentals",
  "research",
  "trader",
  "risk",
  "portfolio",
];

const moduleLabels = {
  market: "Market",
  sentiment: "Sentiment",
  news: "News",
  fundamentals: "Fundamentals",
  research: "Research",
  trader: "Trader",
  risk: "Risk",
  portfolio: "Portfolio",
};

const el = {
  watchlist: document.querySelector("#watchlist"),
  stockSearch: document.querySelector("#stockSearch"),
  selectedTicker: document.querySelector("#selectedTicker"),
  selectedFlag: document.querySelector("#selectedFlag"),
  sourceBadge: document.querySelector("#sourceBadge"),
  reportPath: document.querySelector("#reportPath"),
  metricLast: document.querySelector("#metricLast"),
  metricChange: document.querySelector("#metricChange"),
  metricTrading: document.querySelector("#metricTrading"),
  metricInvestment: document.querySelector("#metricInvestment"),
  metricRisk: document.querySelector("#metricRisk"),
  chartRange: document.querySelector("#chartRange"),
  priceChartCanvas: document.querySelector("#priceChartCanvas"),
  decisionText: document.querySelector("#decisionText"),
  decisionNextEarnings: document.querySelector("#decisionNextEarnings"),
  fullReport: document.querySelector("#fullReport"),
  moduleTabs: document.querySelector("#moduleTabs"),
  moduleContent: document.querySelector("#moduleContent"),
  moduleStatus: document.querySelector("#moduleStatus"),
  scoreCanvas: document.querySelector("#scoreCanvas"),
  portfolioRating: document.querySelector("#portfolioRating"),
  portfolioDecision: document.querySelector("#portfolioDecision"),
  dataNote: document.querySelector("#dataNote"),
  topNames: document.querySelector("#topNames"),
  coverageBadge: document.querySelector("#coverageBadge"),
  coverageText: document.querySelector("#coverageText"),
  coverageDonut: document.querySelector("#coverageDonut"),
  tickerRunner: document.querySelector("#tickerRunner"),
  runnerSymbol: document.querySelector("#runnerSymbol"),
  runnerButton: document.querySelector("#runnerButton"),
  watchlistButton: document.querySelector("#watchlistButton"),
  runnerStatus: document.querySelector("#runnerStatus"),
};

function formatCurrency(value, fallback = "--") {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return Number(value).toFixed(1);
}

function formatCompactNumber(value, fallback = "--") {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatDate(value, fallback = "--") {
  if (!value) return fallback;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed);
}

function formatShortDate(value, fallback = "--") {
  if (!value) return fallback;
  const parsed = new Date(`${value}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return String(value);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(parsed);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkifyUrls(value) {
  return value.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
  );
}

function inlineMarkdown(value) {
  return linkifyUrls(
    escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
  );
}

function roundPriceLikeText(markdown) {
  const priceContext =
    /\b(price|closed at|close|sma|ema|vwma|bollinger|atr|52 week|day average|analyst target|target data|book value)\b/i;
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => {
      if (!priceContext.test(line)) return line;
      return line.replace(/(-?\d+\.\d{3,})/g, (match) => Number(match).toFixed(2));
    })
    .join("\n");
}

function renderTable(lines, startIndex) {
  const rows = [];
  let index = startIndex;
  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    rows.push(lines[index]);
    index += 1;
  }
  if (rows.length < 2) return { html: `<p>${inlineMarkdown(lines[startIndex])}</p>`, index: startIndex + 1 };
  const bodyRows = rows.filter((row) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row));
  const htmlRows = bodyRows.map((row, rowIndex) => {
    const cells = row
      .trim()
      .replace(/^\|/, "")
      .replace(/\|$/, "")
      .split("|")
      .map((cell) => inlineMarkdown(cell.trim()));
    const tag = rowIndex === 0 ? "th" : "td";
    return `<tr>${cells.map((cell) => `<${tag}>${cell}</${tag}>`).join("")}</tr>`;
  });
  return { html: `<table>${htmlRows.join("")}</table>`, index };
}

function markdownToHtml(markdown) {
  markdown = roundPriceLikeText(markdown);
  if (!markdown || !markdown.trim()) return '<div class="empty-state">No report text is available for this section.</div>';
  const lines = markdown.split(/\r?\n/);
  const html = [];
  let inList = false;

  function closeList() {
    if (inList) {
      html.push("</ul>");
      inList = false;
    }
  }

  for (let i = 0; i < lines.length; ) {
    const line = lines[i].trimEnd();
    if (!line.trim()) {
      closeList();
      i += 1;
      continue;
    }
    if (/^\s*\|.*\|\s*$/.test(line)) {
      closeList();
      const table = renderTable(lines, i);
      html.push(table.html);
      i = table.index;
      continue;
    }
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      closeList();
      const level = heading[1].length;
      html.push(`<h${level}>${inlineMarkdown(heading[2])}</h${level}>`);
      i += 1;
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${inlineMarkdown(bullet[1])}</li>`);
      i += 1;
      continue;
    }
    closeList();
    html.push(`<p>${inlineMarkdown(line)}</p>`);
    i += 1;
  }
  closeList();
  return html.join("");
}

function renderPriceChart(stock) {
  const canvas = el.priceChartCanvas;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(360, Math.floor(canvas.clientWidth || 640));
  const height = 340;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  const bars = Array.isArray(stock.chart) ? stock.chart : [];
  if (!bars.length) {
    el.chartRange.textContent = "Chart unavailable";
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = "#627082";
    ctx.font = "700 14px Segoe UI, sans-serif";
    ctx.fillText("No recent daily chart data is available for this ticker.", 24, 44);
    return;
  }

  el.chartRange.textContent = `${formatShortDate(bars[0].date)} to ${formatShortDate(bars[bars.length - 1].date)}`;

  const lowValues = bars.map((bar) => Number(bar.low)).filter((value) => !Number.isNaN(value));
  const highValues = bars.map((bar) => Number(bar.high)).filter((value) => !Number.isNaN(value));
  const volumeValues = bars.map((bar) => Number(bar.volume)).filter((value) => !Number.isNaN(value));
  const minLow = Math.min(...lowValues);
  const maxHigh = Math.max(...highValues);
  const maxVolume = Math.max(...volumeValues, 1);

  const padding = { top: 26, right: 18, bottom: 30, left: 56 };
  const volumeHeight = 86;
  const gap = 14;
  const priceHeight = height - padding.top - padding.bottom - volumeHeight - gap;
  const priceBottom = padding.top + priceHeight;
  const volumeTop = priceBottom + gap;
  const usableWidth = width - padding.left - padding.right;
  const xStep = bars.length > 1 ? usableWidth / (bars.length - 1) : usableWidth;
  const priceRange = maxHigh - minLow || Math.max(1, maxHigh * 0.04);
  const priceMin = minLow - priceRange * 0.12;
  const priceMax = maxHigh + priceRange * 0.12;

  ctx.fillStyle = "#fbfcfe";
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = "#e1e8f0";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i += 1) {
    const y = padding.top + (priceHeight / 3) * i;
    ctx.beginPath();
    ctx.moveTo(padding.left, y);
    ctx.lineTo(width - padding.right, y);
    ctx.stroke();
  }

  ctx.fillStyle = "#627082";
  ctx.font = "700 11px Segoe UI, sans-serif";
  [priceMax, (priceMax + priceMin) / 2, priceMin].forEach((value, index) => {
    const y = padding.top + (priceHeight / 2) * index;
    ctx.fillText(formatCurrency(value), 6, y + 4);
  });

  const points = bars.map((bar, index) => {
    const close = Number(bar.close);
    const x = padding.left + xStep * index;
    const y = padding.top + ((priceMax - close) / (priceMax - priceMin || 1)) * priceHeight;
    return { x, y, close };
  });

  const candleWidth = Math.max(5, Math.min(18, usableWidth / Math.max(bars.length * 1.5, 10)));
  bars.forEach((bar, index) => {
    const x = padding.left + xStep * index;
    const open = Number(bar.open);
    const high = Number(bar.high);
    const low = Number(bar.low);
    const close = Number(bar.close);
    const highY = padding.top + ((priceMax - high) / (priceMax - priceMin || 1)) * priceHeight;
    const lowY = padding.top + ((priceMax - low) / (priceMax - priceMin || 1)) * priceHeight;
    const openY = padding.top + ((priceMax - open) / (priceMax - priceMin || 1)) * priceHeight;
    const closeY = padding.top + ((priceMax - close) / (priceMax - priceMin || 1)) * priceHeight;
    const rising = close >= open;
    ctx.strokeStyle = rising ? "#11824d" : "#c74343";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, highY);
    ctx.lineTo(x, lowY);
    ctx.stroke();

    const bodyTop = Math.min(openY, closeY);
    const bodyHeight = Math.max(2, Math.abs(closeY - openY));
    ctx.fillStyle = rising ? "rgba(17, 130, 77, 0.78)" : "rgba(199, 67, 67, 0.8)";
    ctx.fillRect(x - candleWidth / 2, bodyTop, candleWidth, bodyHeight);
  });

  points.slice(-1).forEach((point) => {
    ctx.fillStyle = "#1d4ed8";
    ctx.beginPath();
    ctx.arc(point.x, point.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
  });

  const barWidth = Math.max(4, Math.min(18, usableWidth / Math.max(bars.length * 1.7, 10)));
  bars.forEach((bar, index) => {
    const x = padding.left + xStep * index - barWidth / 2;
    const ratio = Number(bar.volume) / maxVolume;
    const barHeight = Math.max(2, ratio * (volumeHeight - 18));
    const y = volumeTop + (volumeHeight - barHeight);
    ctx.fillStyle = Number(bar.close) >= Number(bar.open) ? "rgba(17, 130, 77, 0.72)" : "rgba(199, 67, 67, 0.7)";
    ctx.fillRect(x, y, barWidth, barHeight);
  });

  ctx.fillStyle = "#627082";
  ctx.font = "700 11px Segoe UI, sans-serif";
  ctx.fillText("Volume", 8, volumeTop + 12);
  ctx.fillText(formatCompactNumber(maxVolume), 8, volumeTop + 30);
  ctx.fillText(formatShortDate(bars[0].date), padding.left, height - 10);
  ctx.fillText(formatShortDate(bars[bars.length - 1].date), width - padding.right - 52, height - 10);
}

function splitBlocks(lines) {
  const blocks = [];
  let current = [];
  lines.forEach((line) => {
    if (!line.trim()) {
      if (current.length) {
        blocks.push(current);
        current = [];
      }
      return;
    }
    current.push(line);
  });
  if (current.length) blocks.push(current);
  return blocks;
}

function isKeyValueLine(line) {
  return /^[A-Za-z0-9][A-Za-z0-9 /%&().,'+\-]{1,42}:\s+.+$/.test(line.trim()) && !/^Link:/i.test(line.trim());
}

function renderKeyValueGrid(lines) {
  const items = lines
    .map((line) => line.match(/^([^:]+):\s+(.+)$/))
    .filter(Boolean)
    .map(([, label, value]) => `
      <div class="kv-item">
        <span>${inlineMarkdown(label.trim())}</span>
        <strong>${inlineMarkdown(value.trim())}</strong>
      </div>
    `);
  return `<div class="kv-grid">${items.join("")}</div>`;
}

function renderFeedCards(lines) {
  const cards = lines.map((line) => {
    const match = line.match(/^\[(.+?)\]\s*(.*)$/);
    const header = match ? match[1] : "";
    const body = match ? match[2] : line;
    return `
      <article class="feed-card">
        <p class="feed-meta">${inlineMarkdown(header)}</p>
        <p>${inlineMarkdown(body)}</p>
      </article>
    `;
  });
  return `<div class="feed-grid">${cards.join("")}</div>`;
}

function renderLinkRow(line) {
  const url = line.replace(/^Link:\s*/i, "").trim();
  return `<p class="link-row"><span>Source link</span><a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(url)}</a></p>`;
}

function renderMarketMetricsBlock(lines) {
  const parts = lines.join(" ").split(";").map((part) => part.trim()).filter(Boolean);
  const items = parts.map((part) => `<li>${inlineMarkdown(part)}</li>`).join("");
  return `<ul class="metric-bullets">${items}</ul>`;
}

function renderSentimentSummaryTable(line) {
  const introMatch = line.match(/^(.*?)(StockTwits:\s*.+)$/i);
  const intro = introMatch ? introMatch[1].trim() : "";
  const summary = introMatch ? introMatch[2].trim() : line.trim();
  const entries = [...summary.matchAll(/(Bullish|Bearish|Unlabeled|Total):\s*([^-]+?)(?=(?:\s*-\s*(?:Bullish|Bearish|Unlabeled|Total):)|$)/gi)];
  if (!entries.length) {
    return `<p>${inlineMarkdown(line)}</p>`;
  }
  const rows = entries
    .map(([, label, value]) => `<tr><th>${inlineMarkdown(label)}</th><td>${inlineMarkdown(value.trim())}</td></tr>`)
    .join("");
  return `${intro ? `<p>${inlineMarkdown(intro)}</p>` : ""}<table class="summary-table"><tbody>${rows}</tbody></table>`;
}

function renderReadableBlock(moduleKey, lines) {
  if (!lines.length) return "";
  if (moduleKey === "market" && lines.length === 1 && lines[0].includes(";")) {
    return renderMarketMetricsBlock(lines);
  }
  if (moduleKey === "sentiment" && lines.length === 1 && /StockTwits:\s*/i.test(lines[0])) {
    return renderSentimentSummaryTable(lines[0]);
  }
  if (lines.every((line) => /^\s*\|.*\|\s*$/.test(line))) {
    return renderTable(lines, 0).html;
  }
  if (lines.every((line) => /^\s*[-*]\s+/.test(line))) {
    return `<ul>${lines.map((line) => `<li>${inlineMarkdown(line.replace(/^\s*[-*]\s+/, ""))}</li>`).join("")}</ul>`;
  }
  if (lines.length >= 3 && lines.every(isKeyValueLine)) {
    return renderKeyValueGrid(lines);
  }
  if (lines.length >= 2 && lines.every((line) => /^\[.+\]/.test(line.trim()))) {
    return renderFeedCards(lines);
  }
  if (lines.length === 1 && /^Link:\s+https?:\/\//i.test(lines[0].trim())) {
    return renderLinkRow(lines[0]);
  }
  if (lines.length >= 2 && lines.every((line) => /\s{2,}/.test(line) || /^Earnings Date/.test(line))) {
    return `<pre class="data-pre">${escapeHtml(lines.join("\n"))}</pre>`;
  }
  return lines.map((line) => `<p>${inlineMarkdown(line)}</p>`).join("");
}

function normalizeModuleText(moduleKey, markdown) {
  let normalized = roundPriceLikeText(markdown);
  if (moduleKey === "news") {
    normalized = normalized
      .replace(/^Ticker news:\s*##\s*(.+)$/m, "## Ticker news\n$1")
      .replace(/^Macro\/global news sample:\s*##\s*(.+)$/m, "## Macro and global news\n$1");
  }
  return normalized;
}

function renderReadableModule(moduleKey, markdown) {
  const normalized = normalizeModuleText(moduleKey, markdown);
  if (!normalized || !normalized.trim()) {
    return '<div class="empty-state">No report text is available for this section.</div>';
  }

  const sections = [];
  let current = { title: "", level: 0, lines: [] };
  normalized.split(/\r?\n/).forEach((line) => {
    const heading = line.match(/^(#{1,3})\s+(.*)$/);
    if (heading) {
      if (current.title || current.lines.length) sections.push(current);
      current = { title: heading[2].trim(), level: heading[1].length, lines: [] };
      return;
    }
    current.lines.push(line);
  });
  if (current.title || current.lines.length) sections.push(current);

  return sections
    .map((section, index) => {
      const body = splitBlocks(section.lines)
        .map((block) => renderReadableBlock(moduleKey, block))
        .join("");
      const headingHtml = section.title
        ? `<header class="module-section-head"><h3>${inlineMarkdown(section.title)}</h3></header>`
        : "";
      return `<section class="module-section-card level-${section.level || 0}">${headingHtml}${body}</section>`;
    })
    .join("");
}

function flagClass(flag) {
  return `flag-pill flag-${String(flag || "hold").toLowerCase()}`;
}

function getSelectedStock() {
  return data.stocks.find((stock) => stock.symbol === state.selectedSymbol) || data.stocks[0];
}

function filteredStocks() {
  const query = state.query.trim().toUpperCase();
  return data.stocks.filter((stock) => {
    const matchesFilter = state.filter === "all" || stock.flag.toLowerCase() === state.filter;
    const text = `${stock.symbol} ${stock.action} ${stock.risk} ${stock.flag}`.toUpperCase();
    return matchesFilter && (!query || text.includes(query));
  });
}

function renderWatchlist() {
  const stocks = filteredStocks();
  if (!stocks.length) {
    el.watchlist.innerHTML = '<div class="empty-state">No matching stocks.</div>';
    return;
  }

  el.watchlist.innerHTML = stocks
    .map((stock) => {
      const active = stock.symbol === state.selectedSymbol ? " active" : "";
      const changeClass = stock.chgPct >= 0 ? "chg-up" : "chg-down";
      const reportMark = stock.fullReport.available ? "Full report" : "Coverage pending";
      const sourceMark =
        stock.source === "local" ? "Local list" : stock.source === "on-demand" ? "On-demand" : "Owned watchlist";
      return `
        <button class="stock-row${active}" type="button" data-symbol="${stock.symbol}" role="option" aria-selected="${stock.symbol === state.selectedSymbol}">
          <div>
            <div class="stock-symbol">${stock.symbol}</div>
            <div class="stock-sub">${escapeHtml(reportMark)} / ${sourceMark}</div>
          </div>
          <div>
            <span class="${flagClass(stock.flag)}">${stock.flag}</span>
            <div class="stock-sub">${escapeHtml(stock.action || stock.flagSource)}</div>
          </div>
          <div class="stock-price">
            <strong>${formatCurrency(stock.last, stock.lastDisplay || "--")}</strong>
            <span class="${changeClass}">${stock.chgPct === null ? "--" : `${stock.chgPct.toFixed(2)}%`}</span>
          </div>
        </button>
      `;
    })
    .join("");
}

function buildUnavailableReport(stock) {
  const sma = stock.sma;
  const smaText = sma
    ? `SMA50 status: price ${formatCurrency(sma.price)} vs SMA50 ${formatCurrency(sma.sma50)}, ${sma.below_sma50 ? "below" : "above"} the 50-day average.`
    : "SMA50 status was not found in the local alert state.";
  return `
# ${stock.symbol} TradingAgents Coverage Pending

No full TradingAgents artifact was found for this owned-watchlist ticker in the local report folders scanned by this dashboard.

## Available Position Context
- Owned-watchlist last: ${formatCurrency(stock.last, stock.lastDisplay || "--")}
- Owned-watchlist day change: ${stock.chgPct === null ? "--" : `${stock.chgPct.toFixed(2)}%`}
- Dashboard flag: ${stock.flag} (${stock.flagSource})
- ${smaText}

## Next Useful Action
Run a grounded TradingAgents full report for ${stock.symbol}. Once the markdown/json artifact lands in the report folder, this panel will render its Market, Sentiment, News, Fundamentals, Research, Trader, Risk, and Portfolio modules automatically.
  `.trim();
}

function renderScoreCanvas(stock) {
  const canvas = el.scoreCanvas;
  const ctx = canvas.getContext("2d");
  const dpr = window.devicePixelRatio || 1;
  const width = Math.max(260, Math.floor(canvas.clientWidth || 360));
  const height = 180;
  canvas.width = Math.floor(width * dpr);
  canvas.height = Math.floor(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#fbfcfe";
  ctx.fillRect(0, 0, width, height);

  const bars = [
    ["Trading", stock.scores.trading, "#2662d9"],
    ["Investment", stock.scores.investment, "#008f8a"],
    ["Near-term", stock.scores.nearTerm, "#b36b00"],
  ];
  const left = Math.min(104, Math.max(82, width * 0.28));
  const top = 34;
  const barHeight = 24;
  const gap = 30;
  const maxWidth = Math.max(120, width - left - 72);

  ctx.font = "700 15px Inter, Segoe UI, sans-serif";
  ctx.fillStyle = "#17202a";
  ctx.fillText("TradingAgents score stack", 20, 22);

  ctx.font = "700 12px Inter, Segoe UI, sans-serif";
  bars.forEach(([label, value, color], index) => {
    const y = top + index * (barHeight + gap);
    ctx.fillStyle = "#627082";
    ctx.fillText(label, 20, y + 17);
    ctx.fillStyle = "#e4eaf1";
    ctx.fillRect(left, y, maxWidth, barHeight);
    const safeValue = value === null || value === undefined ? 0 : Math.max(0, Math.min(100, value));
    ctx.fillStyle = color;
    ctx.fillRect(left, y, (safeValue / 100) * maxWidth, barHeight);
    ctx.fillStyle = "#17202a";
    ctx.fillText(value === null || value === undefined ? "not scored" : value.toFixed(1), left + maxWidth + 14, y + 17);
  });
}

function renderModuleTabs(stock) {
  const modules = stock.fullReport.modules || {};
  el.moduleTabs.innerHTML = moduleOrder
    .map((key) => {
      const available = Boolean(modules[key]?.text);
      const active = key === state.moduleKey ? " active" : "";
      return `<button class="module-tab${active}" type="button" data-module="${key}">${moduleLabels[key]}${available ? "" : " *"}</button>`;
    })
    .join("");
}

function renderSelectedStock() {
  const stock = getSelectedStock();
  if (!stock) return;
  state.selectedSymbol = stock.symbol;

  el.selectedTicker.textContent = stock.symbol;
  el.selectedFlag.textContent = stock.flag;
  el.selectedFlag.className = flagClass(stock.flag);
  el.sourceBadge.textContent = stock.fullReport.available
    ? `TradingAgents ${stock.fullReport.processedRating || stock.flag}`
    : stock.flagSource;
  el.reportPath.textContent = stock.fullReport.available ? "full artifact loaded" : "no full artifact yet";
  el.metricLast.textContent = formatCurrency(stock.last, stock.lastDisplay || "--");
  el.metricChange.textContent = stock.chgPct === null ? "--" : `${stock.chgPct.toFixed(2)}%`;
  el.metricChange.className = stock.chgPct >= 0 ? "chg-up" : "chg-down";
  el.metricTrading.textContent = formatScore(stock.scores.trading);
  el.metricInvestment.textContent = formatScore(stock.scores.investment);
  el.metricRisk.textContent = stock.risk || "--";
  el.decisionText.textContent = stock.decision || "";
  el.decisionNextEarnings.textContent = formatDate(stock.nextEarningsDate);

  renderPriceChart(stock);
  renderScoreCanvas(stock);
  renderModuleTabs(stock);

  const reportText = stock.fullReport.available ? stock.fullReport.fullMarkdown : buildUnavailableReport(stock);
  el.fullReport.innerHTML = markdownToHtml(reportText);

  const module = stock.fullReport.modules?.[state.moduleKey];
  el.moduleStatus.textContent = stock.fullReport.available
    ? `${stock.fullReport.provider || "provider"} / ${stock.fullReport.tradeDate || "date"}`
    : "coverage pending";
  el.moduleContent.innerHTML = renderReadableModule(
    state.moduleKey,
    module?.text ||
      `# ${moduleLabels[state.moduleKey]} Module\n\nNo ${moduleLabels[state.moduleKey]} module was found for ${stock.symbol}. Generate a full TradingAgents run to populate this section.`
  );
}

function renderPortfolioRail() {
  const portfolio = data.portfolio;
  const ownedCount = data.stocks.filter((stock) => stock.source === "etrade").length;
  const pct = portfolio.watchlistCount
    ? Math.round((portfolio.coverageCount / portfolio.watchlistCount) * 100)
    : 0;
  el.portfolioRating.textContent = portfolio.rating || "Not available";
  el.portfolioDecision.textContent = portfolio.decision || "No portfolio decision text was found.";
  el.dataNote.textContent = portfolio.dataNote || "No data note was provided.";
  el.coverageBadge.textContent = `${portfolio.coverageCount}/${portfolio.watchlistCount} full`;
  el.coverageText.textContent = `${portfolio.coverageCount} full TradingAgents reports mapped to ${portfolio.watchlistCount} current watchlist tickers, including ${ownedCount} owned-watchlist names. ${portfolio.snapshotOverlap.length} tickers have both watchlist coverage and portfolio snapshot data.`;
  el.coverageDonut.style.setProperty("--coverage-angle", `${pct * 3.6}deg`);
  el.coverageDonut.querySelector("span").textContent = `${pct}%`;
  el.topNames.innerHTML = (portfolio.top5Symbols || [])
    .map((symbol) => {
      const inList = data.stocks.some((stock) => stock.symbol === symbol);
      return `
        <div class="top-name">
          <button type="button" data-symbol="${symbol}" ${inList ? "" : "disabled"}>${symbol}</button>
          <span class="stock-sub">${inList ? "in owned watchlist" : "not in current watchlist"}</span>
        </div>
      `;
    })
    .join("");
}

function renderAll() {
  renderWatchlist();
  renderSelectedStock();
  renderPortfolioRail();
}

function setRunnerStatus(message, tone = "idle") {
  el.runnerStatus.textContent = message;
  el.runnerStatus.dataset.tone = tone;
}

function normalizeRunnerSymbol(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9.\-]/g, "")
    .slice(0, 15);
}

function updatePortfolioCounts() {
  data.portfolio.watchlistCount = data.stocks.length;
  data.portfolio.coverageCount = data.stocks.filter((stock) => stock.fullReport?.available).length;
  data.portfolio.snapshotOverlap = data.portfolio.snapshotOverlap || [];
}

function upsertStock(stock) {
  const symbol = stock.symbol.toUpperCase();
  const index = data.stocks.findIndex((item) => item.symbol === symbol);
  if (index >= 0) {
    data.stocks[index] = stock;
  } else {
    data.stocks.unshift(stock);
  }
  updatePortfolioCounts();
  state.selectedSymbol = symbol;
  state.moduleKey = "market";
  state.filter = "all";
  document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button.dataset.filter === "all"));
  renderAll();
}

async function checkBackend() {
  try {
    const response = await fetch(`${state.backendUrl}/health`, { cache: "no-store" });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    setRunnerStatus("Backend ready", "ready");
  } catch {
    setRunnerStatus("Start local backend on port 8790", "warn");
  }
}

async function runOnDemandReport(symbol) {
  if (state.runnerBusy) return;
  state.runnerBusy = true;
  el.runnerButton.disabled = true;
  el.watchlistButton.disabled = true;
  setRunnerStatus(`Running ${symbol}`, "busy");
  try {
    const response = await fetch(`${state.backendUrl}/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok || !payload.ok || !payload.stock) {
      throw new Error(payload.error || payload.log || `HTTP ${response.status}`);
    }
    upsertStock(payload.stock);
    setRunnerStatus(`${symbol} report loaded`, "ready");
  } catch (error) {
    setRunnerStatus(error.message || "TradingAgents run failed", "error");
  } finally {
    state.runnerBusy = false;
    el.runnerButton.disabled = false;
    el.watchlistButton.disabled = false;
  }
}

function isUnknownEndpoint(response, payload) {
  const message = String(payload?.error || payload?.message || "");
  return response.status === 404 || /unknown endpoint/i.test(message);
}

async function analyzeWithWatchlistFallback(symbol) {
  const response = await fetch(`${state.backendUrl}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ symbol, persistToWatchlist: true }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload.ok || !payload.stock) {
    throw new Error(payload.error || payload.log || `HTTP ${response.status}`);
  }
  upsertStock(payload.stock);
  setRunnerStatus(payload.message || `${symbol} added to watchlist`, "ready");
}

async function addToWatchlist(symbol) {
  if (state.runnerBusy) return;
  state.runnerBusy = true;
  el.runnerButton.disabled = true;
  el.watchlistButton.disabled = true;
  setRunnerStatus(`Adding ${symbol} to watchlist`, "busy");
  try {
    const response = await fetch(`${state.backendUrl}/watchlist`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ symbol }),
    });
    const payload = await response.json().catch(() => ({}));
    if (isUnknownEndpoint(response, payload)) {
      await analyzeWithWatchlistFallback(symbol);
      return;
    }
    if (!response.ok || !payload.ok || !payload.stock) {
      throw new Error(payload.error || payload.log || `HTTP ${response.status}`);
    }
    upsertStock(payload.stock);
    setRunnerStatus(payload.message || `${symbol} added to watchlist`, "ready");
  } catch (error) {
    setRunnerStatus(error.message || "Watchlist update failed", "error");
  } finally {
    state.runnerBusy = false;
    el.runnerButton.disabled = false;
    el.watchlistButton.disabled = false;
  }
}

function selectStock(symbol) {
  if (!data.stocks.some((stock) => stock.symbol === symbol)) return;
  state.selectedSymbol = symbol;
  state.moduleKey = "market";
  renderAll();
  document.querySelector(".report-panel")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

document.addEventListener("click", (event) => {
  const stockButton = event.target.closest("[data-symbol]");
  if (stockButton && !stockButton.disabled) {
    selectStock(stockButton.dataset.symbol);
    return;
  }

  const filterButton = event.target.closest("[data-filter]");
  if (filterButton) {
    state.filter = filterButton.dataset.filter;
    document.querySelectorAll("[data-filter]").forEach((button) => button.classList.toggle("active", button === filterButton));
    renderWatchlist();
    return;
  }

  const moduleButton = event.target.closest("[data-module]");
  if (moduleButton) {
    state.moduleKey = moduleButton.dataset.module;
    renderSelectedStock();
  }
});

el.stockSearch.addEventListener("input", (event) => {
  state.query = event.target.value;
  renderWatchlist();
});

el.runnerSymbol.addEventListener("input", (event) => {
  event.target.value = normalizeRunnerSymbol(event.target.value);
});

el.tickerRunner.addEventListener("submit", (event) => {
  event.preventDefault();
  const symbol = normalizeRunnerSymbol(el.runnerSymbol.value);
  if (!symbol) {
    setRunnerStatus("Enter a ticker", "warn");
    return;
  }
  el.runnerSymbol.value = symbol;
  runOnDemandReport(symbol);
});

el.watchlistButton.addEventListener("click", () => {
  const typed = normalizeRunnerSymbol(el.runnerSymbol.value);
  const symbol = typed || state.selectedSymbol;
  if (!symbol) {
    setRunnerStatus("Enter or select a ticker", "warn");
    return;
  }
  el.runnerSymbol.value = symbol;
  addToWatchlist(symbol);
});

window.addEventListener("resize", () => {
  if (state.selectedSymbol) {
    renderSelectedStock();
  }
});

state.selectedSymbol =
  data.stocks.find((stock) => stock.fullReport.available)?.symbol || data.stocks[0]?.symbol || null;
renderAll();
checkBackend();
