const data = window.TECHNICAL_ANALYSIS_DASHBOARD_DATA || {
  summary: {},
  stocks: [],
};

const state = {
  selectedSymbol: null,
  filter: "all",
  query: "",
};

const el = {
  stockSearch: document.querySelector("#stockSearch"),
  watchlist: document.querySelector("#watchlist"),
  coverageBadge: document.querySelector("#coverageBadge"),
  avgScore: document.querySelector("#avgScore"),
  bullishCount: document.querySelector("#bullishCount"),
  failedCount: document.querySelector("#failedCount"),
  selectedTicker: document.querySelector("#selectedTicker"),
  selectedLabel: document.querySelector("#selectedLabel"),
  selectedScore: document.querySelector("#selectedScore"),
  metricLast: document.querySelector("#metricLast"),
  metricChange: document.querySelector("#metricChange"),
  metricRsi: document.querySelector("#metricRsi"),
  metricAdx: document.querySelector("#metricAdx"),
  metricAtr: document.querySelector("#metricAtr"),
  metricInvestment: document.querySelector("#metricInvestment"),
  chartDate: document.querySelector("#chartDate"),
  chartFrame: document.querySelector("#chartFrame"),
  entryPlan: document.querySelector("#entryPlan"),
  entryZone: document.querySelector("#entryZone"),
  entryStop: document.querySelector("#entryStop"),
  entryTarget1: document.querySelector("#entryTarget1"),
  entryTarget2: document.querySelector("#entryTarget2"),
  entryTrigger: document.querySelector("#entryTrigger"),
  levelHeadline: document.querySelector("#levelHeadline"),
  sma20: document.querySelector("#sma20"),
  sma50: document.querySelector("#sma50"),
  support: document.querySelector("#support"),
  resistance: document.querySelector("#resistance"),
  reportStatus: document.querySelector("#reportStatus"),
  fullReport: document.querySelector("#fullReport"),
  stanceTitle: document.querySelector("#stanceTitle"),
  dataNote: document.querySelector("#dataNote"),
  topNames: document.querySelector("#topNames"),
  diagnostics: document.querySelector("#diagnostics"),
  reportNav: document.querySelector("#reportNav"),
};

function number(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return Number(value);
}

function formatCurrency(value, fallback = "--") {
  const parsed = number(value);
  if (parsed === null) return fallback;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(parsed);
}

function formatScore(value, fallback = "--") {
  const parsed = number(value);
  if (parsed === null) return fallback;
  return parsed.toFixed(0);
}

function formatDecimal(value, digits = 1, fallback = "--") {
  const parsed = number(value);
  if (parsed === null) return fallback;
  return parsed.toFixed(digits);
}

function formatPct(value, fallback = "--") {
  const parsed = number(value);
  if (parsed === null) return fallback;
  const sign = parsed > 0 ? "+" : "";
  return `${sign}${parsed.toFixed(2)}%`;
}

function formatUnsignedPct(value, fallback = "--") {
  const parsed = number(value);
  if (parsed === null) return fallback;
  return `${parsed.toFixed(2)}%`;
}

function formatEntryZone(entry) {
  if (!entry) return "--";
  const low = number(entry.zoneLow);
  const high = number(entry.zoneHigh);
  if (low !== null && high !== null) {
    return `${formatCurrency(low)} to ${formatCurrency(high)}`;
  }
  return entry.zone || "--";
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

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function linkifyUrls(value) {
  return value.replace(
    /(https?:\/\/[^\s<)]+)/g,
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

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

function renderTable(lines, startIndex) {
  const rows = [];
  let index = startIndex;
  while (index < lines.length && /^\s*\|.*\|\s*$/.test(lines[index])) {
    rows.push(lines[index]);
    index += 1;
  }
  if (rows.length < 2) {
    return { html: `<p>${inlineMarkdown(lines[startIndex])}</p>`, index: startIndex + 1 };
  }

  const bodyRows = rows.filter(
    (row) => !/^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(row)
  );
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
  if (!markdown || !markdown.trim()) {
    return '<div class="empty-state">No full report is available for this ticker yet.</div>';
  }

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
      const text = heading[2].trim();
      const id = slugify(text);
      html.push(`<h${level} id="${id}">${inlineMarkdown(text)}</h${level}>`);
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

function getReportHeadings(markdown) {
  return String(markdown || "")
    .split(/\r?\n/)
    .map((line) => line.match(/^##\s+(.*)$/))
    .filter(Boolean)
    .map((match) => match[1].trim())
    .slice(0, 9);
}

function sortedStocks() {
  return [...data.stocks].sort((a, b) => {
    const aScore = number(a.tradingScore);
    const bScore = number(b.tradingScore);
    if (aScore === null && bScore === null) return a.symbol.localeCompare(b.symbol);
    if (aScore === null) return 1;
    if (bScore === null) return -1;
    return bScore - aScore || a.symbol.localeCompare(b.symbol);
  });
}

function filteredStocks() {
  const query = state.query.trim().toUpperCase();
  return sortedStocks().filter((stock) => {
    const failed = !stock.tradingScore && stock.scoreError;
    const matchesFilter =
      state.filter === "all" ||
      (state.filter === "failed" && failed) ||
      stock.technicalLabel === state.filter;
    const haystack = [
      stock.symbol,
      stock.tradingView,
      stock.technicalLabel,
      stock.entry?.plan,
      stock.entry?.zone,
      stock.scoreError,
    ]
      .join(" ")
      .toUpperCase();
    return matchesFilter && (!query || haystack.includes(query));
  });
}

function findSelected() {
  return data.stocks.find((stock) => stock.symbol === state.selectedSymbol) || sortedStocks()[0];
}

function renderSummary() {
  const summary = data.summary || {};
  el.coverageBadge.textContent = `${summary.scoredCount || 0}/${summary.watchlistCount || 0} scored`;
  el.avgScore.textContent = formatDecimal(summary.averageTradingScore, 1);
  el.bullishCount.textContent = summary.bullishCount ?? "--";
  el.failedCount.textContent = summary.failedCount ?? "--";
  el.stanceTitle.textContent = summary.stance || "Technical Watchlist";
  el.dataNote.textContent = summary.dataNote || "";
  el.topNames.innerHTML = (summary.topSymbols || [])
    .map((symbol) => {
      const stock = data.stocks.find((item) => item.symbol === symbol);
      return `<button class="top-name" type="button" data-symbol="${escapeHtml(symbol)}">
        <span>${escapeHtml(symbol)}</span>
        <strong>${formatScore(stock?.tradingScore)}</strong>
      </button>`;
    })
    .join("");
}

function renderWatchlist() {
  const rows = filteredStocks();
  if (!rows.length) {
    el.watchlist.innerHTML = '<div class="empty-state">No symbols match the current filter.</div>';
    return;
  }

  el.watchlist.innerHTML = rows
    .map((stock) => {
      const active = stock.symbol === state.selectedSymbol ? " active" : "";
      const label = stock.technicalLabel || (stock.scoreError ? "No data" : "--");
      return `<button class="stock-row${active}" type="button" data-symbol="${escapeHtml(stock.symbol)}">
        <div>
          <div class="stock-symbol">
            <strong>${escapeHtml(stock.symbol)}</strong>
            <span class="mini-pill" data-label="${escapeHtml(stock.technicalLabel || "")}">${escapeHtml(label)}</span>
          </div>
        </div>
        <span class="stock-score">${formatScore(stock.tradingScore)}</span>
        <div class="stock-meta">
          <span>${escapeHtml(stock.tradingView || stock.scoreError || "Pending")}</span>
          <span>${formatCurrency(stock.last)}</span>
        </div>
      </button>`;
    })
    .join("");
}

function renderDiagnostics(stock) {
  const diagnostics = [
    ["MACD", `${formatDecimal(stock.indicators?.macd, 2)} / ${formatDecimal(stock.indicators?.macdSignal, 2)}`],
    ["SMA200", formatCurrency(stock.indicators?.sma200)],
    ["Dashboard trade", formatDecimal(stock.dashboardTradingScore, 1)],
    ["Near-term", formatDecimal(stock.dashboardNearTermScore, 1)],
    ["Risk", stock.dashboardRisk || "--"],
    ["Next earnings", formatDate(stock.nextEarnings)],
  ];
  el.diagnostics.innerHTML = diagnostics
    .map(
      ([label, value]) => `<div class="diagnostic"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )
    .join("");
}

function renderReportNav(stock) {
  const headings = getReportHeadings(stock.reportMarkdown);
  if (!headings.length) {
    el.reportNav.innerHTML = '<div class="empty-state">No report sections.</div>';
    return;
  }
  el.reportNav.innerHTML = headings
    .map((heading) => `<a href="#${slugify(heading)}">${inlineMarkdown(heading)}</a>`)
    .join("");
}

function renderSelected() {
  const stock = findSelected();
  if (!stock) return;
  state.selectedSymbol = stock.symbol;

  el.selectedTicker.textContent = stock.symbol;
  el.selectedLabel.textContent = stock.technicalLabel || (stock.scoreError ? "No data" : "--");
  el.selectedLabel.dataset.label = stock.technicalLabel || "";
  el.selectedScore.textContent = formatScore(stock.tradingScore);

  el.metricLast.textContent = formatCurrency(stock.last);
  el.metricChange.textContent = formatPct(stock.chgPct);
  el.metricChange.style.color = number(stock.chgPct) >= 0 ? "var(--green)" : "var(--red)";
  el.metricRsi.textContent = formatDecimal(stock.indicators?.rsi14, 1);
  el.metricAdx.textContent = formatDecimal(stock.indicators?.adx14, 1);
  el.metricAtr.textContent = formatUnsignedPct(stock.indicators?.atrPct);
  el.metricInvestment.textContent = formatScore(stock.investmentScore);

  el.chartDate.textContent = formatDate(stock.latestDate);
  if (stock.chartPath) {
    el.chartFrame.innerHTML = `<img src="${escapeHtml(stock.chartPath)}" alt="${escapeHtml(stock.symbol)} technical candlestick chart" />`;
  } else {
    el.chartFrame.innerHTML = `<div class="empty-state">${escapeHtml(stock.scoreError || "No chart is available for this ticker.")}</div>`;
  }

  el.entryPlan.textContent = stock.entry?.plan || "--";
  el.entryZone.textContent = formatEntryZone(stock.entry);
  el.entryStop.textContent = formatCurrency(stock.entry?.stop);
  el.entryTarget1.textContent = formatCurrency(stock.entry?.target1);
  el.entryTarget2.textContent = formatCurrency(stock.entry?.target2);
  el.entryTrigger.textContent = stock.entry?.trigger || "";

  el.levelHeadline.textContent = `${formatCurrency(stock.levels?.nearestSupport)} / ${formatCurrency(stock.levels?.nearestResistance)}`;
  el.sma20.textContent = formatCurrency(stock.indicators?.sma20);
  el.sma50.textContent = formatCurrency(stock.indicators?.sma50);
  el.support.textContent = formatCurrency(stock.levels?.nearestSupport);
  el.resistance.textContent = formatCurrency(stock.levels?.nearestResistance);

  el.reportStatus.textContent = stock.reportMarkdown ? "Available" : "Missing";
  el.fullReport.innerHTML = markdownToHtml(stock.reportMarkdown);
  renderDiagnostics(stock);
  renderReportNav(stock);
  renderWatchlist();
}

function bindEvents() {
  el.stockSearch.addEventListener("input", (event) => {
    state.query = event.target.value;
    renderWatchlist();
  });

  document.querySelectorAll(".segmented-button").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".segmented-button").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter || "all";
      renderWatchlist();
    });
  });

  document.addEventListener("click", (event) => {
    const button = event.target.closest("[data-symbol]");
    if (!button) return;
    state.selectedSymbol = button.dataset.symbol;
    renderSelected();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });
}

function init() {
  const first = sortedStocks()[0];
  state.selectedSymbol = first?.symbol || null;
  renderSummary();
  renderWatchlist();
  renderSelected();
  bindEvents();
}

init();
