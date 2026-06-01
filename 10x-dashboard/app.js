const data = window.TENX_DASHBOARD_DATA || { scores: [], watchlistSeed: [] };

const state = {
  scores: data.scores || [],
  watchlist: [],
  forecasts: {},
  filter: "all",
  current: null,
  currentMarkdown: "",
};

const WATCHLIST_KEY = "tenx-dashboard-watchlist-v1";
const FORECAST_KEY = "tenx-dashboard-forecast-v2";
const LEGACY_FORECAST_KEYS = ["tenx-dashboard-forecast-v1"];
const $ = (id) => document.getElementById(id);

function initIcons() {
  if (window.lucide) window.lucide.createIcons({ attrs: { width: 18, height: 18, strokeWidth: 2.1 } });
}

function toast(message) {
  const box = $("toast");
  box.textContent = message;
  box.classList.add("show");
  window.setTimeout(() => box.classList.remove("show"), 2600);
}

function loadWatchlist() {
  try {
    const saved = JSON.parse(localStorage.getItem(WATCHLIST_KEY) || "null");
    state.watchlist = Array.isArray(saved) ? saved : data.watchlistSeed || [];
  } catch {
    state.watchlist = data.watchlistSeed || [];
  }
}

function loadForecasts() {
  try {
    const saved = parseForecastStore(FORECAST_KEY);
    if (Object.keys(saved).length) {
      state.forecasts = saved;
      return;
    }

    state.forecasts = migrateLegacyForecasts();
  } catch {
    state.forecasts = {};
  }
}

function parseForecastStore(key) {
  const saved = JSON.parse(localStorage.getItem(key) || "{}");
  return saved && typeof saved === "object" && !Array.isArray(saved) ? saved : {};
}

function forecastSignature(forecast) {
  const clean = cleanForecast(forecast);
  if (!clean) return "";
  return [
    clean.revenueGrowthPct ?? "",
    clean.epsGrowthPct ?? "",
    clean.targetUpsidePct ?? "",
    clean.analystCount ?? "",
    clean.rating || "",
    clean.revisionTrend || "",
  ].join("|");
}

function sanitizeForecastMap(map, { dropDuplicateSignatures = false } = {}) {
  const entries = Object.entries(map || {})
    .map(([symbol, forecast]) => [symbol.toUpperCase(), cleanForecast(forecast)])
    .filter(([, forecast]) => forecast);

  const signatureCounts = entries.reduce((counts, [, forecast]) => {
    const signature = forecastSignature(forecast);
    counts[signature] = (counts[signature] || 0) + 1;
    return counts;
  }, {});

  return Object.fromEntries(
    entries.filter(([, forecast]) => {
      if (!dropDuplicateSignatures) return true;
      return signatureCounts[forecastSignature(forecast)] === 1;
    })
  );
}

function migrateLegacyForecasts() {
  const migrated = {};
  for (const key of LEGACY_FORECAST_KEYS) {
    Object.assign(migrated, sanitizeForecastMap(parseForecastStore(key), { dropDuplicateSignatures: true }));
    localStorage.removeItem(key);
  }
  const clean = sanitizeForecastMap(migrated);
  if (Object.keys(clean).length) {
    localStorage.setItem(FORECAST_KEY, JSON.stringify(clean));
  }
  return clean;
}

function saveWatchlist() {
  localStorage.setItem(WATCHLIST_KEY, JSON.stringify(state.watchlist));
}

function saveForecasts() {
  localStorage.setItem(FORECAST_KEY, JSON.stringify(state.forecasts));
}

function toNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function formatPct(value) {
  const number = toNumber(value);
  if (number === null) return "N/A";
  return `${number > 0 ? "+" : ""}${number.toFixed(1)}%`;
}

function forecastInputs() {
  return {
    revenueGrowthPct: toNumber($("forecastRevenue").value),
    epsGrowthPct: toNumber($("forecastEps").value),
    targetUpsidePct: toNumber($("forecastTarget").value),
    analystCount: toNumber($("forecastAnalysts").value),
    rating: $("forecastRating").value,
    revisionTrend: $("forecastRevision").value,
    source: "E*TRADE forecast",
    updatedAt: new Date().toISOString().slice(0, 10),
  };
}

function hasForecastData(forecast) {
  if (!forecast) return false;
  return [
    forecast.revenueGrowthPct,
    forecast.epsGrowthPct,
    forecast.targetUpsidePct,
    forecast.analystCount,
    forecast.rating,
    forecast.revisionTrend,
  ].some((value) => value !== null && value !== undefined && value !== "");
}

function cleanForecast(forecast) {
  if (!hasForecastData(forecast)) return null;
  return Object.fromEntries(
    Object.entries(forecast).filter(([, value]) => value !== null && value !== undefined && value !== "")
  );
}

function applyForecastOverride(symbol, forecast) {
  const clean = cleanForecast(forecast);
  if (!clean) return false;
  state.forecasts[symbol] = clean;
  saveForecasts();
  return true;
}

function clearForecastInputs() {
  $("forecastRevenue").value = "";
  $("forecastEps").value = "";
  $("forecastTarget").value = "";
  $("forecastAnalysts").value = "";
  $("forecastRating").value = "";
  $("forecastRevision").value = "";
}

function populateForecastInputs(row) {
  clearForecastInputs();
  const forecast = row.Forecast || {};
  $("forecastRevenue").value = forecast.revenueGrowthPct ?? "";
  $("forecastEps").value = forecast.epsGrowthPct ?? "";
  $("forecastTarget").value = forecast.targetUpsidePct ?? "";
  $("forecastAnalysts").value = forecast.analystCount ?? "";
  $("forecastRating").value = forecast.rating || "";
  $("forecastRevision").value = forecast.revisionTrend || "";
}

function forecastFor(row) {
  return {
    ...(row.Forecast || {}),
    ...(state.forecasts[row.Symbol] || {}),
  };
}

function withForecast(row) {
  const forecast = forecastFor(row);
  const lens = scoreForecast(forecast);
  const baseScore = toNumber(row.InvestmentScore);
  const adjustment = lens.hasData && baseScore !== null ? Math.max(-5, Math.min(5, Math.round(lens.score - 5))) : 0;
  return {
    ...row,
    Forecast: hasForecastData(forecast) ? forecast : null,
    ForecastLens: lens,
    ForecastAdjustedScore: baseScore === null ? null : Math.max(0, Math.min(100, baseScore + adjustment)),
    ForecastAdjustment: adjustment,
  };
}

function scoreForecast(forecast) {
  const f = forecast || {};
  let score = 0;
  const notes = [];
  const revenue = toNumber(f.revenueGrowthPct);
  const eps = toNumber(f.epsGrowthPct);
  const target = toNumber(f.targetUpsidePct);
  const analysts = toNumber(f.analystCount);
  const rating = `${f.rating || ""}`;
  const revision = `${f.revisionTrend || ""}`;

  if (analysts !== null) {
    if (analysts >= 10) {
      score += 2;
      notes.push("Broad analyst coverage reduces single-model risk.");
    } else if (analysts >= 4) {
      score += 1.4;
      notes.push("Moderate coverage is useful, but still check estimate dispersion.");
    } else if (analysts >= 1) {
      score += 0.7;
      notes.push("Thin coverage can be wrong; treat the forecast as a lead, not proof.");
    }
  }

  if (revenue !== null) {
    if (revenue >= 25) score += 2;
    else if (revenue >= 15) score += 1.5;
    else if (revenue >= 8) score += 1;
    else if (revenue > 0) score += 0.5;
    notes.push(`Forward revenue growth estimate: ${formatPct(revenue)}.`);
  }

  if (eps !== null) {
    if (eps >= 30) score += 2;
    else if (eps >= 15) score += 1.5;
    else if (eps >= 5) score += 1;
    else if (eps > -10) score += 0.5;
    notes.push(`Forward EPS growth or loss-narrowing estimate: ${formatPct(eps)}.`);
  }

  if (revision) {
    if (revision === "Up") {
      score += 2;
      notes.push("Estimate revisions are moving up.");
    } else if (revision === "Stable") {
      score += 1;
      notes.push("Estimate revisions are stable.");
    } else if (revision === "Down") {
      notes.push("Estimate revisions are moving down.");
    }
  }

  if (target !== null) {
    if (target >= 15 && target <= 80) score += 1;
    else if (target > 80) score += 0.5;
    else if (target > 0) score += 0.4;
    notes.push(`Consensus target upside: ${formatPct(target)}.`);
  }

  if (rating) {
    if (rating === "Strong Buy") score += 1;
    else if (rating === "Buy") score += 0.8;
    else if (rating === "Hold") score += 0.4;
    notes.push(`Consensus rating: ${rating}.`);
  }

  const rounded = Math.round(Math.min(10, score) * 10) / 10;
  return {
    hasData: hasForecastData(f),
    score: rounded,
    max: 10,
    notes,
    verdict:
      rounded >= 8
        ? "Constructive forecast setup"
        : rounded >= 6
          ? "Useful but not decisive"
          : rounded > 0
            ? "Weak or incomplete forecast support"
            : "No forecast data entered",
  };
}

function scoreClass(score) {
  const value = Number(score) || 0;
  if (value >= 80) return "score-high";
  if (value >= 70) return "score-good";
  if (value >= 60) return "score-mid";
  return "score-low";
}

function bucketForFilter(row) {
  const score = Number(row.InvestmentScore) || 0;
  const view = `${row["Investment View"] || ""} ${row.Decision || ""}`.toLowerCase();
  if (score >= 80 || view.includes("deep")) return "deep";
  if (score >= 70 || view.includes("watchlist")) return "watch";
  if (score >= 55 || view.includes("tracker") || view.includes("speculative")) return "spec";
  return "reject";
}

function filteredScores() {
  if (state.filter === "all") return state.scores;
  return state.scores.filter((row) => bucketForFilter(row) === state.filter);
}

function renderMetrics() {
  $("trackedCount").textContent = state.scores.length;
  $("deepCount").textContent = state.scores.filter((row) => Number(row.InvestmentScore) >= 80).length;
  $("earningsCount").textContent = state.scores.filter((row) => `${row.PositiveEarningsNow_Basis || ""}`.startsWith("Yes")).length;
  $("watchCount").textContent = state.watchlist.length;
  $("asOf").textContent = `Published GitHub Pages build as of ${data.asOf || "latest"}. Watchlist is saved in this browser.`;
}

function renderTable() {
  const body = $("scoreTableBody");
  body.innerHTML = "";
  for (const row of filteredScores()) {
    const tr = document.createElement("tr");
    tr.className = state.current?.Symbol === row.Symbol ? "selected" : "";
    tr.innerHTML = `
      <td>
        <button class="row-button" type="button">
          <strong>${row.Symbol}</strong>
          <span>${row.Company || ""}</span>
        </button>
      </td>
      <td><span class="score-pill ${scoreClass(row.InvestmentScore)}">${row.InvestmentScore}</span></td>
      <td>${row.MarketCapDisplay || "N/A"}</td>
      <td><span class="moat-chip">${row.MoatStrength || "N/A"}</span></td>
    `;
    tr.querySelector("button").addEventListener("click", () => loadReport(row.Symbol));
    body.appendChild(tr);
  }
}

function renderWatchlist() {
  const body = $("watchlistBody");
  body.innerHTML = "";
  if (!state.watchlist.length) {
    body.innerHTML = `<p class="empty-state">No stocks added yet.</p>`;
    return;
  }
  for (const item of state.watchlist) {
    const card = document.createElement("article");
    card.className = "watch-card";
    card.innerHTML = `
      <button class="watch-main" type="button">
        <strong>${item.Symbol}</strong>
        <span>${item.Company || ""}</span>
      </button>
      <span class="score-pill ${scoreClass(item.InvestmentScore)}">${item.InvestmentScore ?? "--"}</span>
      <span>${item.MarketCapDisplay || "N/A"}</span>
      <button class="icon-button tiny" type="button" title="Remove ${item.Symbol}" aria-label="Remove ${item.Symbol}">
        <i data-lucide="x"></i>
      </button>
    `;
    card.querySelector(".watch-main").addEventListener("click", () => loadReport(item.Symbol));
    card.querySelector(".tiny").addEventListener("click", () => removeWatch(item.Symbol));
    body.appendChild(card);
  }
  initIcons();
}

function renderReport(row) {
  const reportRow = withForecast(row);
  state.current = reportRow;
  state.currentMarkdown = reportMarkdown(reportRow);

  $("reportTitle").textContent = `${reportRow.Symbol} - ${reportRow.Company || "Framework Report"}`;
  $("reportNextEarnings").textContent = reportRow.NextEarningsDate || "TBA";
  $("reportSector").textContent = reportRow.OfficialSector || "N/A";
  $("reportSubsector").textContent = reportRow.Subsector || reportRow.SectorTheme || "N/A";
  $("reportScore").textContent =
    reportRow.ForecastLens.hasData && reportRow.ForecastAdjustment
      ? `${reportRow.InvestmentScore ?? "--"} -> ${reportRow.ForecastAdjustedScore}/100`
      : `${reportRow.InvestmentScore ?? "--"}/100`;
  $("reportCap").textContent = reportRow.MarketCapDisplay || "N/A";
  $("reportTenX").textContent = reportRow.TenXMarketCapDisplay || "N/A";
  $("reportEarnings").textContent = `${reportRow.PositiveEarningsNow_Basis || "Unknown"}`.replace(" - ", "\n");
  $("reportForecastScore").textContent = reportRow.ForecastLens.hasData ? `${reportRow.ForecastLens.score}/10` : "No data";
  $("moatText").textContent = reportRow.MoatSummary || reportRow.MoatStrength || "Needs moat research.";
  $("leaderText").textContent = reportRow.InvestLeaderInstead || reportRow.SectorLeaderBenchmark || "Identify direct leader during diligence.";

  renderScoreLens(reportRow);
  renderForecastLens(reportRow);
  renderDorseyRules(reportRow.DorseyRules || dorseyRules(reportRow));
  $("markdownReport").innerHTML = markdownToHtml(state.currentMarkdown);
  $("tickerInput").value = reportRow.Symbol;
  populateForecastInputs(reportRow);
  renderTable();
}

function renderScoreLens(row) {
  const lens = $("scoreLens");
  lens.innerHTML = "";
  const pillars = row.Pillars || [];
  if (!pillars.length) {
    lens.innerHTML = `<p class="empty-state">Score pillars will appear after a full framework score.</p>`;
    return;
  }
  for (const p of pillars) {
    const pct = Math.max(0, Math.min(100, (Number(p.score) / Number(p.max || 1)) * 100));
    const item = document.createElement("div");
    item.className = "score-bar";
    item.innerHTML = `
      <div><span>${p.name}</span><strong>${p.score}/${p.max}</strong></div>
      <div class="bar"><span style="width:${pct}%"></span></div>
    `;
    lens.appendChild(item);
  }
}

function renderForecastLens(row) {
  const box = $("forecastLens");
  const forecast = row.Forecast || {};
  const lens = row.ForecastLens || scoreForecast(forecast);
  if (!lens.hasData) {
    box.innerHTML = `<p class="empty-state">Enter E*TRADE forecast values above to add the analyst-estimate sanity check.</p>`;
    return;
  }
  const adjustment =
    row.ForecastAdjustment > 0 ? `+${row.ForecastAdjustment}` : row.ForecastAdjustment < 0 ? `${row.ForecastAdjustment}` : "0";
  box.innerHTML = `
    <div class="forecast-summary">
      <span class="forecast-score">${lens.score}/10</span>
      <p>${lens.verdict}. Score impact: ${adjustment} points, capped so forecast data cannot overpower moat, fundamentals, and valuation.</p>
    </div>
    <div class="forecast-facts">
      <span><em>Revenue</em>${formatPct(forecast.revenueGrowthPct)}</span>
      <span><em>EPS</em>${formatPct(forecast.epsGrowthPct)}</span>
      <span><em>Target</em>${formatPct(forecast.targetUpsidePct)}</span>
      <span><em>Analysts</em>${forecast.analystCount ?? "N/A"}</span>
      <span><em>Rating</em>${forecast.rating || "N/A"}</span>
      <span><em>Revisions</em>${forecast.revisionTrend || "N/A"}</span>
    </div>
    <ul class="forecast-notes">
      ${lens.notes.map((note) => `<li>${escapeHtml(note)}</li>`).join("")}
    </ul>
  `;
}

function renderDorseyRules(rules) {
  const box = $("dorseyRules");
  box.innerHTML = "";
  for (const rule of rules) {
    const item = document.createElement("article");
    item.className = "rule-item";
    item.innerHTML = `
      <div>
        <strong>${rule.rule}</strong>
        <p>${rule.note || ""}</p>
      </div>
      <span>${rule.status || "Review"}</span>
    `;
    box.appendChild(item);
  }
}

function dorseyRules(row) {
  if (!row.Pillars || !row.Pillars.length) {
    return [
      { rule: "Homework before story", status: "Partial", note: `${row.Symbol} has a researched total score, but the full pillar breakdown still needs to be added.` },
      { rule: "Real moat", status: "Review", note: row.MoatSummary || row.MoatStrength || "Moat source needs direct evidence." },
      { rule: "Growth improves economics", status: "Review", note: "Add revenue growth, margin, FCF, and ROIC evidence before final scoring." },
      { rule: "Margin of safety", status: "Review", note: `10x target market cap is ${row.TenXMarketCapDisplay || "N/A"}.` },
      { rule: "Hold long, sell when facts break", status: "Needs triggers", note: "Define quarterly milestones before adding real capital." },
    ];
  }
  const pillars = Object.fromEntries((row.Pillars || []).map((p) => [p.name, Number(p.score) || 0]));
  const moat = pillars.Moat || 0;
  const fundamentals = pillars.Fundamentals || 0;
  const starting = pillars["Starting size"] || 0;
  const balance = pillars["Balance sheet"] || 0;
  return [
    { rule: "Homework before story", status: Number(row.InvestmentScore) >= 65 ? "Pass" : "Incomplete", note: `${row.Symbol} has enough framework data for an initial report; update after each filing.` },
    { rule: "Real moat", status: moat >= 11 ? "Pass" : moat >= 7 ? "Partial" : "Weak", note: row.MoatSummary || `Moat score is ${moat}/15; needs direct evidence.` },
    { rule: "Growth improves economics", status: fundamentals >= 11 ? "Pass" : fundamentals >= 7 ? "Partial" : "Weak", note: `Fundamental quality score is ${fundamentals}/15.` },
    { rule: "Margin of safety", status: starting >= 12 ? "Pass" : starting >= 7 ? "Partial" : "Weak", note: `10x target market cap is ${row.TenXMarketCapDisplay || "N/A"}.` },
    { rule: "Hold long, sell when facts break", status: balance >= 7 ? "Pass" : "Needs triggers", note: "Track revenue growth, margin trend, dilution, cash flow, and moat evidence quarterly." },
  ];
}

function loadReport(symbol) {
  const clean = String(symbol || "").trim().toUpperCase();
  if (!clean) return;
  const known = state.scores.find((row) => row.Symbol === clean);
  renderReport(known || createStarterRow(clean));
}

function saveForecastForCurrentTicker() {
  const symbol = String($("tickerInput").value || state.current?.Symbol || "").trim().toUpperCase();
  if (!symbol) {
    toast("Enter a ticker before saving forecast data.");
    return;
  }
  const forecast = forecastInputs();
  if (!applyForecastOverride(symbol, forecast)) {
    toast("Enter at least one E*TRADE forecast field first.");
    return;
  }
  loadReport(symbol);
  toast(`${symbol} E*TRADE forecast saved.`);
}

function createStarterRow(symbol) {
  return {
    Symbol: symbol,
    Company: `${symbol} manual research candidate`,
    InvestmentScore: 35,
    ScoreBucket: "Manual research needed",
    MarketCapDisplay: "N/A",
    TenXMarketCapDisplay: "N/A",
    PositiveEarningsNow_Basis: "Unknown",
    OfficialSector: "Manual input",
    Subsector: "Needs classification",
    NextEarningsDate: "TBA",
    MoatStrength: "Unknown",
    MoatSummary: "Moat has not been researched yet. Identify switching costs, intangible assets, network effects, cost advantage, or efficient scale.",
    SectorLeaderBenchmark: "Identify direct sector leader during diligence",
    InvestLeaderInstead: "Compare against the sector leader before adding capital.",
    KeyPainPoint: "Unknown until researched.",
    WhyCan10x: "Unknown until researched. Use this starter report as a placeholder, then fill in fundamentals, growth runway, moat, and valuation.",
    TopRisks: "No live financial data is embedded for this ticker in the GitHub Pages build.",
  };
}

function starterMarkdown(row) {
  return `# ${row.Symbol} Starter 10x Framework Report

Prepared: ${data.asOf || "latest"}

This GitHub Pages version is static. It can generate a starter report and watchlist entry for a new ticker, but a full score requires updating the data file after research.

## Decision Snapshot

| Item | Assessment |
|---|---|
| Company | ${row.Company} |
| Market cap | ${row.MarketCapDisplay} |
| 10x market cap needed | ${row.TenXMarketCapDisplay} |
| Positive earnings now | ${row.PositiveEarningsNow_Basis} |
| Next earnings | ${row.NextEarningsDate} |
| Sector | ${row.OfficialSector} |
| Subsector | ${row.Subsector} |
| Moat | ${row.MoatStrength} |
| E*TRADE forecast score | ${row.ForecastLens?.hasData ? `${row.ForecastLens.score}/10` : "Not entered"} |

## Next Research Steps

- Pull latest 10-K/10-Q and revenue growth.
- Add E*TRADE forward revenue, EPS, analyst count, target upside, rating, and estimate revisions.
- Classify sector, subsector, direct competitors, and sector leader.
- Verify positive earnings and free cash flow.
- Score all eight 10x framework pillars.
- Define milestones before adding real capital.`;
}

function reportMarkdown(row) {
  const base = row.ReportMarkdown || starterMarkdown(row);
  return `${base.trim()}

## E*TRADE Forecast Lens

${forecastMarkdown(row)}`;
}

function forecastMarkdown(row) {
  const forecast = row.Forecast || {};
  const lens = row.ForecastLens || scoreForecast(forecast);
  if (!lens.hasData) {
    return `No E*TRADE forecast values have been entered yet.

Use this lens for consensus revenue growth, EPS growth or loss narrowing, analyst count, estimate revisions, target upside, and rating. Price target is treated as a light signal; revenue, EPS, and revisions matter more.`;
  }
  const adjustment =
    row.ForecastAdjustment > 0 ? `+${row.ForecastAdjustment}` : row.ForecastAdjustment < 0 ? `${row.ForecastAdjustment}` : "0";
  return `Forecast score: ${lens.score}/10

Score impact: ${adjustment} points, capped at plus/minus 5.

| E*TRADE field | Value |
|---|---|
| Forward revenue growth | ${formatPct(forecast.revenueGrowthPct)} |
| Forward EPS growth / loss narrowing | ${formatPct(forecast.epsGrowthPct)} |
| Consensus target upside | ${formatPct(forecast.targetUpsidePct)} |
| Analyst count | ${forecast.analystCount ?? "N/A"} |
| Consensus rating | ${forecast.rating || "N/A"} |
| Estimate revisions | ${forecast.revisionTrend || "N/A"} |

${lens.notes.map((note) => `- ${note}`).join("\n")}`;
}

function addWatch() {
  if (!state.current?.Symbol) {
    toast("Generate or select a report first.");
    return;
  }
  state.watchlist = state.watchlist.filter((item) => item.Symbol !== state.current.Symbol);
  state.watchlist.unshift({
    Symbol: state.current.Symbol,
    Company: state.current.Company,
    AddedAt: new Date().toISOString().slice(0, 10),
    InvestmentScore: state.current.InvestmentScore,
    ScoreBucket: state.current.ScoreBucket,
    MarketCapDisplay: state.current.MarketCapDisplay,
    Decision: state.current.Decision || "Research before watchlist",
    MoatStrength: state.current.MoatStrength,
    ForecastScore: state.current.ForecastLens?.hasData ? state.current.ForecastLens.score : null,
    ForecastAdjustedScore: state.current.ForecastAdjustedScore,
    KnownFrameworkStock: state.scores.some((row) => row.Symbol === state.current.Symbol),
  });
  saveWatchlist();
  renderMetrics();
  renderWatchlist();
  toast(`${state.current.Symbol} added to watchlist.`);
}

function removeWatch(symbol) {
  state.watchlist = state.watchlist.filter((item) => item.Symbol !== symbol);
  saveWatchlist();
  renderMetrics();
  renderWatchlist();
  toast(`${symbol} removed.`);
}

async function copyReport() {
  if (!state.currentMarkdown) {
    toast("No report to copy yet.");
    return;
  }
  await navigator.clipboard.writeText(state.currentMarkdown);
  toast("Report copied.");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatInline(text) {
  return escapeHtml(text)
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>")
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function markdownToHtml(markdown) {
  const lines = String(markdown || "").split(/\r?\n/);
  const out = [];
  let listOpen = false;
  let table = [];
  const flushList = () => { if (listOpen) { out.push("</ul>"); listOpen = false; } };
  const flushTable = () => {
    if (!table.length) return;
    const rows = table.filter((line) => !/^\|\s*-/.test(line));
    out.push("<table>");
    rows.forEach((line, index) => {
      const cells = line.split("|").slice(1, -1).map((cell) => cell.trim());
      out.push(index === 0 ? "<thead><tr>" : index === 1 ? "<tbody><tr>" : "<tr>");
      out.push(cells.map((cell) => `<${index === 0 ? "th" : "td"}>${formatInline(cell)}</${index === 0 ? "th" : "td"}>`).join(""));
      out.push(index === 0 ? "</tr></thead>" : "</tr>");
    });
    out.push("</tbody></table>");
    table = [];
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flushList();
      flushTable();
      continue;
    }
    if (line.startsWith("|") && line.endsWith("|")) {
      flushList();
      table.push(line);
      continue;
    }
    flushTable();
    if (line.startsWith("# ")) {
      flushList();
      out.push(`<h1>${formatInline(line.slice(2))}</h1>`);
    } else if (line.startsWith("## ")) {
      flushList();
      out.push(`<h2>${formatInline(line.slice(3))}</h2>`);
    } else if (line.startsWith("### ")) {
      flushList();
      out.push(`<h3>${formatInline(line.slice(4))}</h3>`);
    } else if (line.startsWith("- ")) {
      if (!listOpen) {
        out.push("<ul>");
        listOpen = true;
      }
      out.push(`<li>${formatInline(line.slice(2))}</li>`);
    } else {
      flushList();
      out.push(`<p>${formatInline(line)}</p>`);
    }
  }
  flushList();
  flushTable();
  return out.join("");
}

function bindEvents() {
  $("tickerForm").addEventListener("submit", (event) => {
    event.preventDefault();
    loadReport($("tickerInput").value);
  });
  $("addWatchTop").addEventListener("click", addWatch);
  $("addWatchReport").addEventListener("click", addWatch);
  $("saveForecastButton").addEventListener("click", saveForecastForCurrentTicker);
  $("clearForecastButton").addEventListener("click", () => {
    const symbol = String($("tickerInput").value || state.current?.Symbol || "").trim().toUpperCase();
    clearForecastInputs();
    if (symbol && state.forecasts[symbol]) {
      delete state.forecasts[symbol];
      saveForecasts();
      loadReport(symbol);
      toast(`${symbol} forecast cleared.`);
    } else {
      toast("Forecast inputs cleared.");
    }
  });
  $("copyReportButton").addEventListener("click", copyReport);
  $("refreshButton").addEventListener("click", () => {
    renderMetrics();
    renderTable();
    renderWatchlist();
    toast("Static dashboard refreshed.");
  });
  document.querySelectorAll(".filter").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll(".filter").forEach((b) => b.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.filter;
      renderTable();
    });
  });
}

function boot() {
  loadWatchlist();
  loadForecasts();
  bindEvents();
  initIcons();
  renderMetrics();
  renderTable();
  renderWatchlist();
  loadReport(state.scores[0]?.Symbol || "TSSI");
}

boot();
