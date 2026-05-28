const data = window.TRADING_AGENTS_DASHBOARD_DATA;

const state = {
  selectedSymbol: null,
  filter: "all",
  query: "",
  moduleKey: "market",
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
  decisionText: document.querySelector("#decisionText"),
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
};

function formatCurrency(value, fallback = "--") {
  if (value === null || value === undefined || Number.isNaN(value)) return fallback;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: value >= 100 ? 2 : 4,
  }).format(value);
}

function formatScore(value) {
  if (value === null || value === undefined || Number.isNaN(value)) return "--";
  return Number(value).toFixed(1);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function inlineMarkdown(value) {
  return escapeHtml(value)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
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
      const sourceMark = stock.source === "local" ? "Local list" : "E*TRADE";
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

No full TradingAgents artifact was found for this E*TRADE ticker in the local report folders scanned by this dashboard.

## Available Position Context
- E*TRADE last: ${formatCurrency(stock.last, stock.lastDisplay || "--")}
- E*TRADE day change: ${stock.chgPct === null ? "--" : `${stock.chgPct.toFixed(2)}%`}
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

  renderScoreCanvas(stock);
  renderModuleTabs(stock);

  const reportText = stock.fullReport.available ? stock.fullReport.fullMarkdown : buildUnavailableReport(stock);
  el.fullReport.innerHTML = markdownToHtml(reportText);

  const module = stock.fullReport.modules?.[state.moduleKey];
  el.moduleStatus.textContent = stock.fullReport.available
    ? `${stock.fullReport.provider || "provider"} / ${stock.fullReport.tradeDate || "date"}`
    : "coverage pending";
  el.moduleContent.innerHTML = markdownToHtml(
    module?.text ||
      `# ${moduleLabels[state.moduleKey]} Module\n\nNo ${moduleLabels[state.moduleKey]} module was found for ${stock.symbol}. Generate a full TradingAgents run to populate this section.`
  );
}

function renderPortfolioRail() {
  const portfolio = data.portfolio;
  const pct = portfolio.watchlistCount
    ? Math.round((portfolio.coverageCount / portfolio.watchlistCount) * 100)
    : 0;
  el.portfolioRating.textContent = portfolio.rating || "Not available";
  el.portfolioDecision.textContent = portfolio.decision || "No portfolio decision text was found.";
  el.dataNote.textContent = portfolio.dataNote || "No data note was provided.";
  el.coverageBadge.textContent = `${portfolio.coverageCount}/${portfolio.watchlistCount} full`;
  el.coverageText.textContent = `${portfolio.coverageCount} full TradingAgents reports mapped to ${portfolio.watchlistCount} E*TRADE tickers. ${portfolio.snapshotOverlap.length} tickers also have portfolio snapshot rows.`;
  el.coverageDonut.style.setProperty("--coverage-angle", `${pct * 3.6}deg`);
  el.coverageDonut.querySelector("span").textContent = `${pct}%`;
  el.topNames.innerHTML = (portfolio.top5Symbols || [])
    .map((symbol) => {
      const inList = data.stocks.some((stock) => stock.symbol === symbol);
      return `
        <div class="top-name">
          <button type="button" data-symbol="${symbol}" ${inList ? "" : "disabled"}>${symbol}</button>
          <span class="stock-sub">${inList ? "in E*TRADE list" : "snapshot only"}</span>
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

state.selectedSymbol =
  data.stocks.find((stock) => stock.fullReport.available)?.symbol || data.stocks[0]?.symbol || null;
renderAll();
