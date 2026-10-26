/**
 * Report generation module.
 * Generates a print-optimized HTML report that is theme-independent.
 */
import type {
  Site,
  AccessibilityScore,
  CatchmentStats,
  GeminiAnalysis,
  IsochroneResult,
} from '../../types';
import { CATEGORY_META } from '../../types';

export function generateReport(params: {
  site: Site;
  score: AccessibilityScore;
  catchmentStats: CatchmentStats[];
  geminiAnalysis: GeminiAnalysis | null;
  isochrones: IsochroneResult | null;
  dataSource: string;
  attribution: string;
}): void {
  const { site, score, catchmentStats, geminiAnalysis, isochrones, dataSource, attribution } = params;
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const isFallback = isochrones?.type === 'fallback';
  const catchmentNote = isFallback
    ? 'Approximate circular buffers (non-network based)'
    : 'Walking-network isochrones via Mapbox Isochrone API';

  const scoreColor = score.overall >= 70 ? '#087F78' : score.overall >= 45 ? '#b8860b' : '#c0392b';

  const typologiesHtml = geminiAnalysis
    ? geminiAnalysis.typology_recommendations
        .map(
          (rec, i) => `
      <div class="typology">
        <div class="typology-header">
          <span class="rank">#${i + 1}</span>
          <span class="typology-name">${rec.typology}</span>
          <span class="score-badge">${Math.round(rec.suitability_score)}/100</span>
        </div>
        <p class="summary">${rec.recommendation_summary}</p>
        ${
          rec.evidence.length
            ? `<div class="tags-label">Evidence</div><div class="tags">${rec.evidence.map((e) => `<span class="tag tag-ev">${e}</span>`).join('')}</div>`
            : ''
        }
        ${
          rec.limitations.length
            ? `<div class="tags-label">Limitations</div><div class="tags">${rec.limitations.map((l) => `<span class="tag tag-lim">${l}</span>`).join('')}</div>`
            : ''
        }
        ${
          rec.missing_information.length
            ? `<div class="tags-label">Additional data needed</div><div class="tags">${rec.missing_information.map((m) => `<span class="tag tag-miss">${m}</span>`).join('')}</div>`
            : ''
        }
      </div>
    `,
        )
        .join('')
    : '<p class="no-data">AI analysis not available for this report.</p>';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SiteScope Report — ${site.label.split(',')[0]}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');
    body {
      font-family: 'Inter', system-ui, sans-serif;
      font-size: 13px;
      color: #202522;
      background: #fff;
      padding: 40px;
      max-width: 860px;
      margin: 0 auto;
      line-height: 1.5;
    }
    h1 { font-size: 22px; font-weight: 700; color: #202522; }
    h2 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.08em; color: #737A76; margin-bottom: 12px; border-bottom: 1px solid #E3E7E3; padding-bottom: 6px; }
    h3 { font-size: 14px; font-weight: 600; color: #202522; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 2px solid #202522; }
    .wordmark { font-size: 18px; font-weight: 700; }
    .wordmark span { color: #087F78; }
    .meta { font-size: 11px; color: #737A76; text-align: right; }
    .section { margin-bottom: 28px; }
    .site-info { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .info-box { background: #F4F4F1; padding: 12px 14px; border-radius: 4px; }
    .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #737A76; font-weight: 600; margin-bottom: 4px; }
    .info-value { font-size: 13px; font-weight: 500; color: #202522; }
    .score-row { display: flex; align-items: center; gap: 20px; margin-bottom: 16px; }
    .score-circle { width: 80px; height: 80px; border-radius: 50%; background: ${scoreColor}; display: flex; flex-direction: column; align-items: center; justify-content: center; color: white; flex-shrink: 0; }
    .score-num { font-size: 26px; font-weight: 700; line-height: 1; }
    .score-denom { font-size: 11px; opacity: 0.8; }
    .score-interp { font-size: 13px; color: #737A76; }
    .components { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .component { }
    .comp-header { display: flex; justify-content: space-between; margin-bottom: 4px; }
    .comp-label { font-size: 11px; font-weight: 500; color: #202522; }
    .comp-val { font-size: 11px; font-weight: 600; color: ${scoreColor}; }
    .bar-track { height: 4px; background: #E3E7E3; border-radius: 99px; }
    .bar-fill { height: 100%; border-radius: 99px; background: #16B8AD; }
    .comp-meas { font-size: 10px; color: #737A76; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #737A76; font-weight: 600; text-align: left; padding: 8px 0 6px; border-bottom: 1px solid #E3E7E3; }
    td { padding: 6px 0; border-bottom: 1px solid #F4F4F1; font-size: 12px; }
    td:last-child { text-align: right; font-weight: 600; color: #16B8AD; }
    .gaps { margin-top: 12px; padding: 10px 12px; background: #fdf3f2; border: 1px solid #f5c6c3; border-radius: 4px; }
    .gap-title { font-size: 11px; font-weight: 600; color: #c0392b; margin-bottom: 6px; }
    .gap-item { font-size: 11px; color: #c0392b; padding: 2px 0; }
    .gap-item::before { content: '▲ '; }
    .interp-box { padding: 12px 14px; background: #F0FAFA; border-left: 3px solid #16B8AD; margin-bottom: 12px; font-size: 13px; color: #202522; line-height: 1.6; }
    .list-section { margin-bottom: 10px; }
    .list-label { font-size: 10px; text-transform: uppercase; font-weight: 600; letter-spacing: 0.06em; color: #737A76; margin-bottom: 5px; }
    .list-items { list-style: none; }
    .list-items li { font-size: 12px; color: #737A76; padding: 2px 0; }
    .list-items li.str::before { content: '↑ '; color: #27AE60; font-weight: 700; }
    .list-items li.gap::before { content: '↓ '; color: #c0392b; font-weight: 700; }
    .typology { margin-bottom: 16px; padding: 12px; background: #F4F4F1; border-radius: 4px; border: 1px solid #E3E7E3; page-break-inside: avoid; }
    .typology-header { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
    .rank { width: 22px; height: 22px; border-radius: 50%; background: #16B8AD; color: white; font-size: 11px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .typology-name { font-size: 14px; font-weight: 600; flex: 1; }
    .score-badge { font-size: 11px; font-weight: 700; background: #E0F6F5; color: #087F78; padding: 2px 8px; border-radius: 99px; }
    .summary { font-size: 12px; color: #737A76; margin-bottom: 8px; line-height: 1.5; }
    .tags-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.06em; color: #9BA5A0; font-weight: 600; margin: 6px 0 3px; }
    .tags { display: flex; flex-wrap: wrap; gap: 4px; }
    .tag { font-size: 10px; padding: 2px 7px; border-radius: 99px; }
    .tag-ev { background: #E0F6F5; color: #087F78; }
    .tag-lim { background: #fdf3f2; color: #c0392b; }
    .tag-miss { background: #fef9e7; color: #b8860b; }
    .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #E3E7E3; font-size: 10px; color: #9BA5A0; }
    .no-data { font-size: 12px; color: #9BA5A0; font-style: italic; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <!-- Header -->
  <div class="header">
    <div>
      <div class="wordmark">Site<span>Scope</span></div>
      <div style="font-size:11px;color:#737A76;margin-top:4px">Architecture Accessibility Intelligence</div>
    </div>
    <div class="meta">
      <div style="font-weight:600;font-size:13px;">Site Intelligence Report</div>
      <div>${dateStr}</div>
      <div>Prototype 1</div>
    </div>
  </div>

  <!-- Site info -->
  <div class="section">
    <h2>Site Details</h2>
    <div class="site-info">
      <div class="info-box">
        <div class="info-label">Location</div>
        <div class="info-value">${site.label.split(',').slice(0, 3).join(', ')}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Coordinates</div>
        <div class="info-value" style="font-family:monospace;">${site.coordinates.lat.toFixed(5)}°N, ${site.coordinates.lng.toFixed(5)}°E</div>
      </div>
      <div class="info-box">
        <div class="info-label">Catchment Method</div>
        <div class="info-value">${catchmentNote}</div>
      </div>
      <div class="info-box">
        <div class="info-label">Walking Speeds</div>
        <div class="info-value">~4.5 km/h (flat terrain); actual times vary</div>
      </div>
    </div>
  </div>

  <!-- Score -->
  <div class="section">
    <h2>Accessibility Score</h2>
    <div class="score-row">
      <div class="score-circle">
        <div class="score-num">${score.overall}</div>
        <div class="score-denom">/ 100</div>
      </div>
      <div>
        <div style="font-size:15px;font-weight:600;margin-bottom:6px;">${getLabel(score.overall)}</div>
        <div class="score-interp">Data completeness: ${Math.round(score.dataCompleteness * 100)}% of OSM categories populated.</div>
        <div class="score-interp" style="margin-top:4px;">Score is based on OpenStreetMap data and provisional weighting. Not a validated standard.</div>
      </div>
    </div>
    <div class="components">
      ${score.components.map((c) => `
        <div class="component">
          <div class="comp-header">
            <span class="comp-label">${c.label}</span>
            <span class="comp-val">${Math.round(c.rawScore)}/100</span>
          </div>
          <div class="bar-track"><div class="bar-fill" style="width:${c.rawScore}%"></div></div>
          <div class="comp-meas">${c.measurement}</div>
        </div>
      `).join('')}
    </div>

    ${score.gaps.length ? `
    <div class="gaps">
      <div class="gap-title">Identified Service Gaps</div>
      ${score.gaps.map((g) => `<div class="gap-item">${g}</div>`).join('')}
    </div>` : ''}
  </div>

  <!-- Catchment comparison -->
  <div class="section">
    <h2>Catchment Summary</h2>
    <table>
      <thead>
        <tr>
          <th>Catchment</th>
          ${CATEGORY_META.map((c) => `<th>${c.icon} ${c.label.split(' ')[0]}</th>`).join('')}
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        ${catchmentStats.map((s) => `
          <tr>
            <td>${s.minutes}-min</td>
            ${CATEGORY_META.map((c) => `<td>${s.byCategory[c.key] ?? 0}</td>`).join('')}
            <td>${s.totalAmenities}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  </div>

  ${geminiAnalysis ? `
  <!-- Gemini analysis -->
  <div class="section">
    <h2>AI Interpretation (Gemini)</h2>
    <div class="interp-box">${geminiAnalysis.accessibility_interpretation}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:16px;">
      <div class="list-section">
        <div class="list-label">Key Strengths</div>
        <ul class="list-items">${geminiAnalysis.key_strengths.map((s) => `<li class="str">${s}</li>`).join('')}</ul>
      </div>
      <div class="list-section">
        <div class="list-label">Key Deficiencies</div>
        <ul class="list-items">${geminiAnalysis.key_gaps.map((g) => `<li class="gap">${g}</li>`).join('')}</ul>
      </div>
    </div>
  </div>

  <!-- Typologies -->
  <div class="section">
    <h2>Building Typology Recommendations</h2>
    ${typologiesHtml}
  </div>

  <!-- Confidence -->
  <div class="section">
    <h2>Confidence & Limitations</h2>
    <p style="font-size:12px;color:#737A76;line-height:1.6;">${geminiAnalysis.confidence_explanation}</p>
    ${geminiAnalysis.data_limitations ? `<p style="font-size:12px;color:#737A76;margin-top:8px;line-height:1.6;">${geminiAnalysis.data_limitations}</p>` : ''}
  </div>
  ` : ''}

  <!-- Footer -->
  <div class="footer">
    <div><strong>Data Sources:</strong> ${dataSource}</div>
    <div><strong>Map data:</strong> ${attribution}</div>
    <div style="margin-top:6px;"><strong>Disclaimer:</strong> This report is a preliminary planning tool. Scores are based on OpenStreetMap data and prototype weights. They do not constitute validated standards, regulatory guidance, architectural advice, or investment recommendations. Absence of a facility in the data does not confirm its absence in reality.</div>
    <div style="margin-top:6px;">Generated by SiteScope Prototype 1 — Architecture Accessibility Intelligence</div>
  </div>
</body>
</html>`;

  // Open in new window and trigger print
  const win = window.open('', '_blank');
  if (win) {
    win.document.write(html);
    win.document.close();
    win.focus();
    setTimeout(() => win.print(), 500);
  }
}

function getLabel(s: number) {
  if (s >= 80) return 'Excellent Accessibility';
  if (s >= 65) return 'Good Accessibility';
  if (s >= 50) return 'Moderate Accessibility';
  if (s >= 35) return 'Limited Accessibility';
  return 'Poor Accessibility';
}
