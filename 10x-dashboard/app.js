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
  const score = moduleScoreSet(row).average;
  if (score >= 80) return "deep";
  if (score >= 70) return "watch";
  if (score >= 55) return "spec";
  return "reject";
}

function filteredScores() {
  const rows =
    state.filter === "all"
      ? state.scores
      : state.scores.filter((row) => bucketForFilter(row) === state.filter);
  return [...rows].sort((a, b) => {
    const avgDiff = moduleScoreSet(b).average - moduleScoreSet(a).average;
    return avgDiff || String(a.Symbol).localeCompare(String(b.Symbol));
  });
}

function renderMetrics() {
  $("asOf").textContent = `Published GitHub Pages build as of ${data.asOf || "latest"}. Watchlist is saved in this browser.`;
}

function renderTable() {
  const body = $("scoreTableBody");
  body.innerHTML = "";
  for (const row of filteredScores()) {
    const scores = moduleScoreSet(row);
    const tr = document.createElement("tr");
    tr.className = state.current?.Symbol === row.Symbol ? "selected" : "";
    tr.innerHTML = `
      <td>
        <button class="row-button" type="button">
          <strong>${row.Symbol}</strong>
          <span>${row.Company || ""}</span>
        </button>
      </td>
      <td><span class="score-pill ${scoreClass(scores.average)}">${scores.average}</span></td>
      <td><span class="mini-score ${scoreClass(scores.own.score)}">${scores.own.score}</span></td>
      <td><span class="mini-score ${scoreClass(scores.dorsey.score)}">${scores.dorsey.score}</span></td>
      <td><span class="mini-score ${scoreClass(scores.baillie.score)}">${scores.baillie.score}</span></td>
    `;
    tr.querySelector("button").addEventListener("click", () => loadReport(row.Symbol));
    body.appendChild(tr);
  }
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

  renderForecastLens(reportRow);
  renderIndependentModules(reportRow);
  $("markdownReport").innerHTML = markdownToHtml(state.currentMarkdown);
  $("tickerInput").value = reportRow.Symbol;
  populateForecastInputs(reportRow);
  renderTable();
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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function numericField(row, key) {
  return toNumber(row[key]) || 0;
}

function usefulText(value) {
  return Boolean(value) && !/(unknown|needs research|needs customer|not researched|n\/a)/i.test(String(value));
}

function componentScore(row, key, fallback = 0) {
  const value = numericField(row, key);
  return value > 0 ? value : fallback;
}

function moduleLabel(score) {
  if (score >= 80) return "Strong";
  if (score >= 65) return "Watch";
  if (score >= 45) return "Mixed";
  return "Weak";
}

function scoreStatus(score, max) {
  const pct = max ? (score / max) * 100 : 0;
  if (pct >= 80) return "Pass";
  if (pct >= 60) return "Partial";
  if (pct >= 40) return "Review";
  return "Weak";
}

function renderIndependentModules(row) {
  const { own, dorsey, baillie, average } = moduleScoreSet(row);
  $("ownResearchScore").textContent = `${own.score}/100`;
  $("dorseyScore").textContent = `${dorsey.score}/100`;
  $("baillieScore").textContent = `${baillie.score}/100`;
  $("summaryOwnScore").textContent = own.score;
  $("summaryDorseyScore").textContent = dorsey.score;
  $("summaryBaillieScore").textContent = baillie.score;
  $("summaryAverageScore").textContent = average;
  $("summaryOwnVerdict").textContent = own.shortVerdict;
  $("summaryDorseyVerdict").textContent = dorsey.shortVerdict;
  $("summaryBaillieVerdict").textContent = baillie.shortVerdict;
  $("summaryAverageVerdict").textContent = moduleLabel(average);
  $("summaryOwnRationale").textContent = compactModuleRationale(own);
  $("summaryDorseyRationale").textContent = compactModuleRationale(dorsey);
  $("summaryBaillieRationale").textContent = compactModuleRationale(baillie);
  $("summaryAverageRationale").textContent = averageModuleRationale({ own, dorsey, baillie, average });
  renderModuleCard("ownResearchModule", own);
  renderModuleCard("dorseyModule", dorsey);
  renderModuleCard("baillieModule", baillie);
}

function moduleScoreSet(row) {
  const reportRow = row.ForecastLens ? row : withForecast(row);
  const own = ownResearchModule(reportRow);
  const dorsey = dorseyModule(reportRow);
  const baillie = baillieModule(reportRow);
  const average = Math.round((own.score + dorsey.score + baillie.score) / 3);
  return { own, dorsey, baillie, average };
}

function renderModuleCard(id, module) {
  const box = $(id);
  box.innerHTML = `
    <p class="module-verdict">${escapeHtml(module.verdict)}</p>
    <div class="module-rationale">
      <strong>Score rationale</strong>
      <ul>
        ${module.rationale.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}
      </ul>
    </div>
    <div class="module-detail-title">Detailed support</div>
    <div class="module-checks">
      ${module.checks
        .map(
          (check) => `
            <article class="module-check">
              <div><strong>${escapeHtml(check.name)}</strong><em>${escapeHtml(check.status)}</em></div>
              <p>${escapeHtml(check.note)}</p>
            </article>
          `
        )
        .join("")}
    </div>
    <p class="module-source">${escapeHtml(module.source)}</p>
  `;
}

function compactModuleRationale(module) {
  return (module.rationale || [])
    .slice(0, 2)
    .map((item) => String(item).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function averageModuleRationale({ own, dorsey, baillie, average }) {
  const modules = [
    { name: "Independent", score: own.score },
    { name: "Dorsey", score: dorsey.score },
    { name: "Baillie", score: baillie.score },
  ].sort((a, b) => b.score - a.score);
  return `Rounded mean of ${own.score}/${dorsey.score}/${baillie.score} = ${average}. Strongest support: ${modules[0].name} ${modules[0].score}; biggest drag: ${modules[modules.length - 1].name} ${modules[modules.length - 1].score}.`;
}

function ownResearchModule(row) {
  const checks = [
    {
      name: "Starting size / valuation",
      score: numericField(row, "StartingSizeValuationScore_15"),
      max: 15,
      note: `${row.MarketCapDisplay || "N/A"} today; 10x target ${row.TenXMarketCapDisplay || "N/A"}.`,
    },
    {
      name: "Pain point / market pull",
      score: numericField(row, "PainPointMarketPullScore_15"),
      max: 15,
      note: row.KeyPainPoint || "Customer pain point needs direct research.",
    },
    {
      name: "Growth runway",
      score: numericField(row, "GrowthRunwayScore_15"),
      max: 15,
      note: row.WhyCan10x || "Add revenue growth and TAM evidence.",
    },
    {
      name: "Fundamental quality",
      score: numericField(row, "FundamentalQualityScore_15"),
      max: 15,
      note: row.PositiveEarningsNow_Basis || "Verify margin, cash flow, and earnings quality.",
    },
    {
      name: "Moat durability",
      score: numericField(row, "MoatDurabilityScore_15"),
      max: 15,
      note: row.MoatSummary || row.MoatStrength || "Moat evidence needed.",
    },
    {
      name: "Management / ownership",
      score: numericField(row, "ManagementOwnershipScore_10"),
      max: 10,
      note: "Check founder ownership, incentives, execution record, and capital allocation.",
    },
    {
      name: "Balance sheet / dilution",
      score: numericField(row, "BalanceSheetDilutionScore_10"),
      max: 10,
      note: "Check cash runway, debt, share issuance, and ability to fund growth.",
    },
    {
      name: "Variant perception / catalyst",
      score: numericField(row, "VariantPerceptionCatalystScore_5"),
      max: 5,
      note: row.TopRisks || "Define what the market is missing and what would prove it.",
    },
  ];
  const hasDetailedScores = checks.some((check) => check.score > 0);
  if (!hasDetailedScores && toNumber(row.InvestmentScore) !== null) {
    const score = Math.round(toNumber(row.InvestmentScore));
    return {
      score,
      verdict: `${moduleLabel(score)} independent research setup. Detailed pillars are not embedded for this row, so this module is using the existing independent research total and raw notes.`,
      checks: [
        {
          name: "Independent research total",
          status: `${score}/100 Imported`,
          note: "Detailed pillar scores are missing from the static data row; refresh the research file to expose the full breakdown.",
        },
        {
          name: "Growth thesis",
          status: usefulText(row.WhyCan10x) ? "Present" : "Review",
          note: row.WhyCan10x || "Add 10x thesis evidence.",
        },
        {
          name: "Moat evidence",
          status: usefulText(row.MoatSummary) ? "Present" : "Review",
          note: row.MoatSummary || row.MoatStrength || "Add moat evidence.",
        },
        {
          name: "Risk evidence",
          status: usefulText(row.TopRisks) ? "Present" : "Review",
          note: row.TopRisks || "Add failure modes and kill triggers.",
        },
      ],
      rationale: [
        `Imported independent score is ${score}/100 because detailed pillar scores are missing for this static row.`,
        usefulText(row.WhyCan10x) ? `Growth thesis: ${row.WhyCan10x}` : "Growth thesis still needs primary evidence.",
        usefulText(row.MoatSummary) ? `Moat evidence: ${row.MoatSummary}` : "Moat evidence still needs primary research.",
      ],
      shortVerdict: moduleLabel(score),
      source: "Separate module: original 10x research only; no Dorsey or Baillie outputs used.",
    };
  }
  const score = Math.round(checks.reduce((sum, check) => sum + check.score, 0));
  const topChecks = [...checks].sort((a, b) => b.score / b.max - a.score / a.max).slice(0, 2);
  const weakChecks = [...checks].sort((a, b) => a.score / a.max - b.score / b.max).slice(0, 1);
  return {
    score,
    verdict: `${moduleLabel(score)} independent research setup. This module uses only the original 10x research pillars and raw company facts.`,
    checks: checks.map((check) => ({ ...check, status: `${check.score}/${check.max} ${scoreStatus(check.score, check.max)}` })),
    rationale: [
      `Strongest evidence: ${topChecks.map((check) => `${check.name} ${check.score}/${check.max}`).join("; ")}.`,
      `Main drag: ${weakChecks.map((check) => `${check.name} ${check.score}/${check.max}`).join("; ")}.`,
      `Raw thesis: ${row.WhyCan10x || "not yet documented"}`,
    ],
    shortVerdict: moduleLabel(score),
    source: "Separate module: original 10x research only; no Dorsey or Baillie outputs used.",
  };
}

function dorseyModule(row) {
  const rules = row.DorseyRules || dorseyRules(row);
  const points = {
    Pass: 20,
    Partial: 12,
    Review: 10,
    "Needs triggers": 8,
    Incomplete: 4,
    Weak: 4,
  };
  const score = rules.reduce((sum, rule) => sum + (points[rule.status] ?? 8), 0);
  const passCount = rules.filter((rule) => rule.status === "Pass").length;
  const weakCount = rules.filter((rule) => ["Weak", "Incomplete"].includes(rule.status)).length;
  return {
    score,
    verdict: `${moduleLabel(score)} Dorsey discipline. This module only asks whether the business can be owned patiently under quality/value rules.`,
    checks: rules.map((rule) => ({
      name: rule.rule,
      status: rule.status || "Review",
      note: rule.note || "Needs direct evidence.",
    })),
    rationale: [
      `${passCount} of 5 rules are full passes under this module.`,
      weakCount ? `${weakCount} rules are weak or incomplete and need proof before patient ownership.` : "No rule is marked weak or incomplete.",
      "This score rewards quality, moat, margin of safety, and durable hold discipline only.",
    ],
    shortVerdict: moduleLabel(score),
    source: "Separate module: Dorsey Five Rules only; no independent-research or Baillie scores used.",
  };
}

function baillieModule(row) {
  const hasMarketCapMath = usefulText(row.MarketCapDisplay) && usefulText(row.TenXMarketCapDisplay);
  const hasPositiveEarnings = `${row.PositiveEarningsNow_Basis || ""}`.startsWith("Yes");
  const growth = componentScore(row, "GrowthRunwayScore_15", usefulText(row.WhyCan10x) ? 9 : 0);
  const moat = componentScore(row, "MoatDurabilityScore_15", usefulText(row.MoatSummary) ? 7 : 0);
  const management = componentScore(row, "ManagementOwnershipScore_10", 4);
  const fundamentals = componentScore(row, "FundamentalQualityScore_15", hasPositiveEarnings ? 10 : 4);
  const balance = componentScore(row, "BalanceSheetDilutionScore_10", 4);
  const starting = componentScore(row, "StartingSizeValuationScore_15", hasMarketCapMath ? 8 : 0);
  const catalyst = componentScore(row, "VariantPerceptionCatalystScore_5", usefulText(row.Decision) ? 2 : 0);
  const pain = componentScore(row, "PainPointMarketPullScore_15", usefulText(row.KeyPainPoint) ? 8 : 0);
  const combinedText = `${row.WhyCan10x || ""} ${row.MoatSummary || ""} ${row.KeyPainPoint || ""} ${row.SectorTheme || ""}`.toLowerCase();
  const flexibleAssets = /(platform|ecosystem|data|software|cloud|network|integration|infrastructure|model|workflow|device|marketplace)/.test(combinedText);
  const founderSignal = /(founder|owner|insider|entrepreneur|ceo)/.test(combinedText);
  const agileSignal = /(speed|faster|rapid|agile|flat|experiment|iterate|adapt|deployment)/.test(combinedText);
  const forecast = row.Forecast || {};
  const forwardGrowth = Math.max(toNumber(forecast.revenueGrowthPct) || 0, toNumber(forecast.epsGrowthPct) || 0);

  const questions = [
    ["Double sales in five years", clamp(Math.round((growth / 15) * 10 + (forwardGrowth >= 25 ? 1 : 0)), 0, 10), row.WhyCan10x || "Add five-year sales growth evidence."],
    ["Ten years and beyond", clamp(Math.round((growth / 15) * 6 + (starting / 15) * 4), 0, 10), row.SectorTheme || "Define the long-term growth driver."],
    ["Competitive advantage", clamp(Math.round((moat / 15) * 10), 0, 10), row.MoatSummary || "Moat evidence is thin."],
    ["Culture and adaptability", clamp(Math.round((management / 10) * 5 + (flexibleAssets ? 2 : 0) + (founderSignal ? 1.5 : 0) + (agileSignal ? 1.5 : 0)), 0, 10), adaptabilityNote(flexibleAssets, founderSignal, agileSignal)],
    ["Customer love / society", clamp(Math.round((pain / 15) * 10), 0, 10), row.KeyPainPoint || "Identify why customers pull the product."],
    ["Returns worthwhile", clamp(Math.round((fundamentals / 15) * 10), 0, 10), row.PositiveEarningsNow_Basis || "Verify returns and cash conversion."],
    ["Returns rising or falling", clamp(Math.round((fundamentals / 15) * 6 + (growth / 15) * 4), 0, 10), "Check whether scale improves margin and returns."],
    ["Capital deployment", clamp(Math.round((balance / 10) * 5 + (management / 10) * 5), 0, 10), "Check reinvestment discipline, dilution, debt, and owner mindset."],
    ["Could be worth 5x or more", clamp(Math.round((starting / 15) * 8 + (growth / 15) * 2), 0, 10), `5x/10x math: ${row.TenXMarketCapDisplay || "N/A"}.`],
    ["Why market misses it", clamp(Math.round((catalyst / 5) * 7 + (agileSignal || flexibleAssets ? 2 : 0)), 0, 10), "Look for time-horizon arbitrage, second acts, and under-modeled optionality."],
  ];

  const score = questions.reduce((sum, [, value]) => sum + value, 0);
  const strongQuestions = questions.filter(([, value]) => value >= 8).length;
  const weakQuestions = questions.filter(([, value]) => value < 5).length;
  return {
    score,
    verdict: `${moduleLabel(score)} Baillie-style outlier setup. This module emphasizes 10Q upside, adaptability, second acts, and time-horizon arbitrage.`,
    checks: questions.map(([name, value, note]) => ({ name, status: `${value}/10 ${scoreStatus(value, 10)}`, note })),
    rationale: [
      `${strongQuestions} of 10 Baillie-style questions score 8/10 or better.`,
      weakQuestions ? `${weakQuestions} questions remain below 5/10, usually from missing culture/adaptability or market-mispricing evidence.` : "No Baillie question is below 5/10.",
      adaptabilityNote(flexibleAssets, founderSignal, agileSignal),
    ],
    shortVerdict: moduleLabel(score),
    source: "Separate module: Baillie Gifford LTGG 10Q plus adaptability lens from the Wenxuecity article; no other module scores used.",
  };
}

function adaptabilityNote(flexibleAssets, founderSignal, agileSignal) {
  const parts = [];
  parts.push(flexibleAssets ? "Flexible core assets visible" : "Flexible core assets need proof");
  parts.push(founderSignal ? "founder/owner signal visible" : "founder/owner signal not yet shown");
  parts.push(agileSignal ? "agility signal visible" : "agility signal needs proof");
  return parts.join("; ");
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
  const modules = moduleScoreSet(row);
  return `# ${row.Symbol} 10x Three-Module Report

Prepared: ${data.asOf || "latest"}

## Raw Company Snapshot

| Item | Assessment |
|---|---|
| Company | ${row.Company || "N/A"} |
| Market cap | ${row.MarketCapDisplay || "N/A"} |
| 10x market cap needed | ${row.TenXMarketCapDisplay || "N/A"} |
| Positive earnings now | ${row.PositiveEarningsNow_Basis || "Unknown"} |
| Next earnings | ${row.NextEarningsDate || "TBA"} |
| Sector | ${row.OfficialSector || "N/A"} |
| Subsector | ${row.Subsector || row.SectorTheme || "N/A"} |
| Pain point | ${row.KeyPainPoint || "Needs research"} |
| Why it can 10x | ${row.WhyCan10x || "Needs research"} |
| Top risks | ${row.TopRisks || "Needs research"} |

## Module Score Summary

| Module | Score |
|---|---:|
| Independent Research | ${modules.own.score}/100 |
| Dorsey Five Rules | ${modules.dorsey.score}/100 |
| Baillie Gifford Outlier | ${modules.baillie.score}/100 |
| Average | ${modules.average}/100 |

${moduleMarkdown("Module 1 - Independent Research", modules.own)}

${moduleMarkdown("Module 2 - Dorsey Five Rules", modules.dorsey)}

${moduleMarkdown("Module 3 - Baillie Gifford Outlier", modules.baillie)}

## E*TRADE Forecast Lens

${forecastMarkdown(row)}

## Source Notes

- Baillie Gifford LTGG 10-question framework and adaptability article were used only for Module 3 design.
- Wenxuecity article was used only for the adaptability emphasis in Module 3.
- The three modules share the raw company facts above, but they do not use each other's scores or verdicts.`;
}

function moduleMarkdown(title, module) {
  return `## ${title}

Score: ${module.score}/100

Verdict: ${module.verdict}

Rationale:
${module.rationale.map((item) => `- ${item}`).join("\n")}

${module.checks.map((check) => `- ${check.name}: ${check.status} - ${check.note}`).join("\n")}

Source boundary: ${module.source}`;
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
  toast(`${state.current.Symbol} added to watchlist.`);
}

function removeWatch(symbol) {
  state.watchlist = state.watchlist.filter((item) => item.Symbol !== symbol);
  saveWatchlist();
  renderMetrics();
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
  loadReport(state.scores[0]?.Symbol || "TSSI");
}

boot();
