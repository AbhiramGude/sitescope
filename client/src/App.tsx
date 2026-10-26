import React, { useState, useCallback, useEffect, useRef } from 'react';
import { MapView } from './components/MapView';
import { SearchBox } from './components/SearchBox';
import { ScorePanel } from './components/ScorePanel';
import { GeminiPanel } from './components/GeminiPanel';
import { CatchmentComparison } from './components/CatchmentComparison';
import type {
  Site,
  Theme,
  AppView,
  AmenityCategory,
  AmenitiesByCategory,
  IsochroneResult,
  AccessibilityScore,
  CatchmentStats,
  GeminiAnalysis,
} from './types';
import { CATEGORY_META, ALL_CATEGORIES } from './types';
import { searchLocation, fetchIsochrones, fetchAmenities, fetchGeminiAnalysis } from './modules/api/client';
import { computeAccessibilityScore } from './modules/scoring/engine';
import { computeCatchmentStats, getIsochroneBBox } from './modules/geo/spatial';
import { generateReport } from './modules/report/generator';
import './index.css';

// ─── Theme management ──────────────────────────────────────────────────────────
function getInitialTheme(): Theme {
  const stored = localStorage.getItem('sitescope-theme');
  if (stored === 'light' || stored === 'dark') return stored;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme: Theme) {
  document.documentElement.setAttribute('data-theme', theme);
  document.documentElement.style.visibility = '';
}

export default function App() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme);
  const [view, setView] = useState<AppView>('map');
  const [mobilePanelOpen, setMobilePanelOpen] = useState<'left' | 'right' | null>(null);
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);

  // Data state
  const [site, setSite] = useState<Site | null>(null);
  const [isochrones, setIsochrones] = useState<IsochroneResult | null>(null);
  const [amenities, setAmenities] = useState<AmenitiesByCategory | null>(null);
  const [catchmentStats, setCatchmentStats] = useState<CatchmentStats[] | null>(null);
  const [accessibilityScore, setAccessibilityScore] = useState<AccessibilityScore | null>(null);
  const [geminiAnalysis, setGeminiAnalysis] = useState<GeminiAnalysis | null>(null);
  const [dataSource, setDataSource] = useState('');
  const [attribution, setAttribution] = useState('');

  // Filter state
  const [activeCategories, setActiveCategories] = useState<Set<AmenityCategory>>(new Set(ALL_CATEGORIES));
  const [activeCatchments, setActiveCatchments] = useState<Set<5 | 10 | 15>>(new Set([5, 10, 15]));

  // Loading/error state
  const [loadingIsochrones, setLoadingIsochrones] = useState(false);
  const [loadingAmenities, setLoadingAmenities] = useState(false);
  const [loadingGemini, setLoadingGemini] = useState(false);
  const [errorIsochrones, setErrorIsochrones] = useState<string | undefined>();
  const [errorAmenities, setErrorAmenities] = useState<string | undefined>();
  const [errorGemini, setErrorGemini] = useState<string | undefined>();

  const activeAbortController = useRef<AbortController | null>(null);

  // Apply theme
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem('sitescope-theme', theme);
  }, [theme]);

  // Initial theme apply (prevent FOUC)
  useEffect(() => {
    applyTheme(getInitialTheme());
  }, []);

  const toggleTheme = () => setTheme((t) => (t === 'light' ? 'dark' : 'light'));

  // ─── Site selection ──────────────────────────────────────────────────────────
  const selectSite = useCallback(async (lat: number, lng: number, label: string) => {
    // Avoid redundant calls if same coordinates
    if (site && site.coordinates.lat === lat && site.coordinates.lng === lng) {
      return;
    }

    const newSite: Site = { coordinates: { lat, lng }, label };
    setSite(newSite);
    setIsochrones(null);
    setAmenities(null);
    setCatchmentStats(null);
    setAccessibilityScore(null);
    setGeminiAnalysis(null);
    setErrorIsochrones(undefined);
    setErrorAmenities(undefined);
    setErrorGemini(undefined);

    // Run analysis automatically
    await runAnalysis(newSite, false);
  }, [site]);

  const handleMapClick = useCallback(async (lat: number, lng: number) => {
    // Reverse geocode to get a label
    let label = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    try {
      const res = await fetch(`http://localhost:3001/api/geocode/reverse?lat=${lat}&lon=${lng}`);
      if (res.ok) {
        const data = await res.json();
        if (data.display_name) label = data.display_name;
      }
    } catch { /* use coords as label */ }
    selectSite(lat, lng, label);
  }, [selectSite]);

  // ─── Core analysis ────────────────────────────────────────────────────────────
  const runAnalysis = useCallback(async (targetSite: Site, forceFallback = false) => {
    // Disregard / abort any previous pending request on rapid site changes
    if (activeAbortController.current) {
      activeAbortController.current.abort();
    }
    const controller = new AbortController();
    activeAbortController.current = controller;

    const { lat, lng } = targetSite.coordinates;

    // 1. Fetch isochrones
    setLoadingIsochrones(true);
    setErrorIsochrones(undefined);
    let isoResult: IsochroneResult | null = null;

    try {
      isoResult = await fetchIsochrones(lat, lng, {
        allowFallback: forceFallback,
        signal: controller.signal,
      });

      if (controller.signal.aborted) return;
      setIsochrones(isoResult);
    } catch (err: any) {
      if (controller.signal.aborted || err.name === 'AbortError') return;
      setErrorIsochrones(err.message);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingIsochrones(false);
      }
    }

    if (controller.signal.aborted) return;

    // 2. Fetch amenities based on bbox of isochrones (or fallback bbox)
    setLoadingAmenities(true);
    setErrorAmenities(undefined);

    try {
      let bbox: [number, number, number, number];
      if (isoResult?.geojson?.features?.length) {
        const computed = getIsochroneBBox(isoResult.geojson.features);
        bbox = computed ?? [lng - 0.015, lat - 0.015, lng + 0.015, lat + 0.015];
      } else {
        bbox = [lng - 0.015, lat - 0.015, lng + 0.015, lat + 0.015];
      }

      const amenityResponse = await fetchAmenities(bbox);
      if (controller.signal.aborted) return;

      setAmenities(amenityResponse.categories);
      setDataSource(amenityResponse.dataSource);
      setAttribution(amenityResponse.attribution);

      // 3. Compute catchment stats
      if (isoResult?.geojson?.features?.length) {
        const stats = computeCatchmentStats(amenityResponse.categories, isoResult.geojson.features);
        setCatchmentStats(stats);

        // 4. Compute accessibility score
        const score = computeAccessibilityScore(amenityResponse.categories, stats);
        setAccessibilityScore(score);
      }
    } catch (err: any) {
      if (controller.signal.aborted || err.name === 'AbortError') return;
      setErrorAmenities(err.message);
    } finally {
      if (!controller.signal.aborted) {
        setLoadingAmenities(false);
      }
    }
  }, []);

  const handleRerunAnalysis = useCallback((forceFallback = false) => {
    if (site) runAnalysis(site, forceFallback);
  }, [site, runAnalysis]);

  // ─── Gemini analysis ──────────────────────────────────────────────────────────
  const runGeminiAnalysis = useCallback(async () => {
    if (!site || !accessibilityScore || !catchmentStats) return;

    setLoadingGemini(true);
    setErrorGemini(undefined);

    try {
      const totalByCategory: Partial<Record<string, number>> = {};
      if (amenities) {
        for (const [cat, features] of Object.entries(amenities)) {
          totalByCategory[cat] = (features as any[]).length;
        }
      }

      const payload = {
        siteData: {
          coordinates: site.coordinates,
          label: site.label,
          accessibilityScore: accessibilityScore.overall,
          scoreComponents: accessibilityScore.components.map((c) => ({
            label: c.label,
            weight: c.weight,
            rawScore: Math.round(c.rawScore),
            measurement: c.measurement,
          })),
          catchments: catchmentStats,
          amenityCounts: totalByCategory,
          amenityDiversity: {
            '15min': catchmentStats.find((s) => s.minutes === 15)?.diversityScore ?? 0,
            '10min': catchmentStats.find((s) => s.minutes === 10)?.diversityScore ?? 0,
            '5min': catchmentStats.find((s) => s.minutes === 5)?.diversityScore ?? 0,
          },
          gaps: accessibilityScore.gaps,
          dataCompleteness: accessibilityScore.dataCompleteness,
          isochroneType: isochrones?.type ?? 'fallback',
        },
      };

      const result = await fetchGeminiAnalysis(payload);
      setGeminiAnalysis(result.analysis);
      setView('recommendations');
    } catch (err: any) {
      setErrorGemini(err.message);
    } finally {
      setLoadingGemini(false);
    }
  }, [site, accessibilityScore, catchmentStats, amenities, isochrones]);

  // ─── Category toggle ──────────────────────────────────────────────────────────
  const toggleCategory = (cat: AmenityCategory) => {
    setActiveCategories((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  const toggleCatchment = (min: 5 | 10 | 15) => {
    setActiveCatchments((prev) => {
      const next = new Set(prev);
      if (next.has(min)) next.delete(min);
      else next.add(min);
      return next;
    });
  };

  // ─── Report export ───────────────────────────────────────────────────────────
  const handleExport = () => {
    if (!site || !accessibilityScore || !catchmentStats) return;
    generateReport({
      site,
      score: accessibilityScore,
      catchmentStats,
      geminiAnalysis,
      isochrones,
      dataSource,
      attribution,
    });
  };

  // ─── New analysis ─────────────────────────────────────────────────────────────
  const handleNew = () => {
    setSite(null);
    setIsochrones(null);
    setAmenities(null);
    setCatchmentStats(null);
    setAccessibilityScore(null);
    setGeminiAnalysis(null);
    setErrorIsochrones(undefined);
    setErrorAmenities(undefined);
    setErrorGemini(undefined);
    setView('map');
  };

  // Amenity totals for category pills
  const amenityTotals: Partial<Record<AmenityCategory, number>> = {};
  if (amenities) {
    for (const cat of ALL_CATEGORIES) {
      amenityTotals[cat] = amenities[cat]?.length ?? 0;
    }
  }

  const analysisComplete = !!accessibilityScore;
  const isLoading = loadingIsochrones || loadingAmenities;

  // Responsive: determine if a panel drawer is open
  const leftPanelOpen = mobilePanelOpen === 'left';
  const rightPanelOpen = mobilePanelOpen === 'right';

  // Desktop collapse classes
  let workspaceClass = 'workspace';
  if (leftCollapsed && rightCollapsed) workspaceClass += ' workspace--both-collapsed';
  else if (leftCollapsed) workspaceClass += ' workspace--left-collapsed';
  else if (rightCollapsed) workspaceClass += ' workspace--right-collapsed';

  return (
    <div className="app-shell">
      {/* ── Header ────────────────────────────────────────────────────────── */}
      <header className="app-header">
        {/* Logo */}
        <div className="app-header__logo">
          <div className="app-header__wordmark">
            Site<span>Scope</span>
          </div>
        </div>
        <div className="app-header__divider" />

        {/* Current location */}
        {site && (
          <>
            <div className="app-header__location" title={site.label}>
              {site.label.split(',')[0]}
            </div>
            <div className="app-header__divider" />
          </>
        )}

        {/* Search */}
        <div className="app-header__search">
          <SearchBox
            onSearch={searchLocation}
            onSelect={(lat, lng, label) => selectSite(lat, lng, label)}
            placeholder="Search for a location or address…"
          />
        </div>

        {/* Actions */}
        <div className="app-header__actions">
          {analysisComplete && (
            <button
              className="btn btn--secondary btn--sm"
              onClick={handleExport}
              title="Export site intelligence report"
            >
              <span>↓</span> Export
            </button>
          )}
          <button className="btn btn--ghost btn--sm" onClick={handleNew} title="Start new analysis">
            + New
          </button>
          <button
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
            title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
          >
            {theme === 'light' ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                <circle cx="12" cy="12" r="5" />
                <line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" />
                <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                <line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" />
                <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* ── Workspace ─────────────────────────────────────────────────────── */}
      <div className={workspaceClass}>
        {/* ── Left panel: Controls ─────────────────────────────────────────── */}
        <aside
          className={`panel panel--left${leftPanelOpen ? ' panel--mobile-open' : ''}`}
          style={leftCollapsed ? { width: 0, overflow: 'hidden' } : {}}
        >
          <div className="panel__header">
            <span className="panel__title">Site Controls</span>
            <button
              className="panel-collapse-btn"
              onClick={() => { setLeftCollapsed(true); setMobilePanelOpen(null); }}
              title="Collapse panel"
            >
              ←
            </button>
          </div>
          <div className="panel__body">
            {/* Site status */}
            {!site && !isLoading && (
              <div className="panel__section">
                <div className="empty-state" style={{ padding: '24px 16px' }}>
                  <div className="empty-state__icon">📍</div>
                  <div className="empty-state__title">Select a site</div>
                  <div className="empty-state__desc">Search for an address or click anywhere on the map to begin.</div>
                </div>
              </div>
            )}

            {site && (
              <div className="panel__section">
                <div className="section-label">Selected Site</div>
                <div
                  style={{
                    padding: '10px 12px',
                    background: 'var(--accent-subtle)',
                    border: '1px solid var(--accent-subtle-2)',
                    borderRadius: 'var(--radius)',
                    marginBottom: 10,
                  }}
                >
                  <div className="text-sm font-medium" style={{ marginBottom: 4, color: 'var(--text-primary)' }}>
                    {site.label.split(',').slice(0, 2).join(', ')}
                  </div>
                  <div className="coords-display" style={{ marginTop: 6 }}>
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--accent)', flexShrink: 0 }}>
                      <circle cx="12" cy="12" r="10" />
                    </svg>
                    <span className="coords-display__value">
                      {site.coordinates.lat.toFixed(5)}, {site.coordinates.lng.toFixed(5)}
                    </span>
                  </div>
                </div>

                {isLoading ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 0' }}>
                    <div className="spinner spinner--sm" />
                    <span className="text-sm text-secondary">
                      {loadingIsochrones ? 'Computing catchments…' : 'Fetching amenity data…'}
                    </span>
                  </div>
                ) : (
                  <button className="analyse-btn" onClick={() => handleRerunAnalysis(false)}>
                    ↺ Re-run Analysis
                  </button>
                )}

                {errorIsochrones && (
                  <div className="alert-banner alert-banner--warning" style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6 }}>
                      <span>⚠</span>
                      <span>{errorIsochrones}</span>
                    </div>
                    <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
                      <button
                        className="btn btn--sm btn--secondary"
                        onClick={() => handleRerunAnalysis(false)}
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                      >
                        ↺ Retry Routing
                      </button>
                      <button
                        className="btn btn--sm btn--secondary"
                        onClick={() => handleRerunAnalysis(true)}
                        style={{ fontSize: '11px', padding: '4px 8px' }}
                        title="Generate approximate circular buffer"
                      >
                        Use Approximate Catchment
                      </button>
                    </div>
                  </div>
                )}

                {isochrones?.type === 'fallback' && (
                  <div className="alert-banner alert-banner--warning" style={{ marginTop: 8, fontSize: '12px' }}>
                    <span>⚠</span>
                    <span>
                      <strong>Approximate Catchments:</strong> Non-network geometric buffer. Mapbox walking isochrones unavailable.
                    </span>
                  </div>
                )}

                {errorAmenities && (
                  <div className="alert-banner alert-banner--error" style={{ marginTop: 8 }}>
                    <span>⚠</span>
                    <span>{errorAmenities}</span>
                  </div>
                )}
              </div>
            )}

            {/* Walking catchment controls */}
            <div className="panel__section">
              <div className="section-label">Walking Catchments</div>
              <div className="catchment-controls">
                {([5, 10, 15] as const).map((min) => (
                  <button
                    key={min}
                    className={`catchment-btn${activeCatchments.has(min) ? ' catchment-btn--active' : ''}`}
                    onClick={() => toggleCatchment(min)}
                  >
                    <div className={`catchment-dot catchment-dot--${min}`} />
                    <div>
                      <div className="catchment-btn__label">{min}-min walk</div>
                      <div className="catchment-btn__sub">~{min * 75}m radius</div>
                    </div>
                    {catchmentStats && (
                      <span
                        className="text-xs"
                        style={{
                          marginLeft: 'auto',
                          fontWeight: 600,
                          color: activeCatchments.has(min) ? 'var(--accent)' : 'var(--text-muted)',
                        }}
                      >
                        {catchmentStats.find((s) => s.minutes === min)?.totalAmenities ?? '–'}
                      </span>
                    )}
                  </button>
                ))}
              </div>
              <div
                style={{
                  marginTop: 8,
                  fontSize: 'var(--text-xs)',
                  color: 'var(--text-muted)',
                  lineHeight: 1.5,
                }}
              >
                {isochrones?.type === 'isochrone'
                  ? 'Actual walking-network isochrones at ~4.5 km/h. Travel times vary with street layout, crossings, and routing data.'
                  : 'Approximate circular buffers — routing unavailable. Not actual walking-network distances.'}
              </div>
            </div>

            {/* Amenity filters */}
            <div className="panel__section">
              <div className="section-label" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Amenity Filters</span>
                <button
                  className="btn btn--ghost btn--sm"
                  style={{ padding: '2px 6px', fontSize: 11 }}
                  onClick={() => {
                    if (activeCategories.size === ALL_CATEGORIES.length) {
                      setActiveCategories(new Set());
                    } else {
                      setActiveCategories(new Set(ALL_CATEGORIES));
                    }
                  }}
                >
                  {activeCategories.size === ALL_CATEGORIES.length ? 'None' : 'All'}
                </button>
              </div>
              <div className="category-filters">
                {CATEGORY_META.map((cat) => {
                  const count = amenityTotals[cat.key] ?? 0;
                  const active = activeCategories.has(cat.key);
                  return (
                    <button
                      key={cat.key}
                      className={`category-pill${active ? ' category-pill--active' : ''}`}
                      onClick={() => toggleCategory(cat.key)}
                    >
                      <span className="category-pill__icon">{cat.icon}</span>
                      <span className="category-pill__label">{cat.label}</span>
                      <span className="category-pill__count">
                        {loadingAmenities ? '…' : count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Attribution */}
            {attribution && (
              <div className="attribution">
                {attribution}
              </div>
            )}
          </div>
        </aside>

        {/* ── Map ───────────────────────────────────────────────────────────── */}
        <main className="map-container" style={{ position: 'relative' }}>
          {/* Desktop collapse restore buttons */}
          {leftCollapsed && (
            <button
              style={{
                position: 'absolute',
                top: 10,
                left: 10,
                zIndex: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '6px 10px',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font)',
              }}
              onClick={() => setLeftCollapsed(false)}
            >
              ☰ Controls
            </button>
          )}

          {rightCollapsed && (
            <button
              style={{
                position: 'absolute',
                top: 10,
                right: 10,
                zIndex: 10,
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                padding: '6px 10px',
                fontSize: 'var(--text-xs)',
                cursor: 'pointer',
                color: 'var(--text-secondary)',
                fontFamily: 'var(--font)',
              }}
              onClick={() => setRightCollapsed(false)}
            >
              Analysis ☰
            </button>
          )}

          <MapView
            site={site}
            isochrones={isochrones}
            amenities={amenities}
            activeCategories={activeCategories as any}
            activeCatchments={activeCatchments}
            isDark={theme === 'dark'}
            onMapClick={handleMapClick}
          />
        </main>

        {/* ── Right panel: Analysis ─────────────────────────────────────────── */}
        <aside
          className={`panel panel--right${rightPanelOpen ? ' panel--mobile-open' : ''}`}
          style={rightCollapsed ? { width: 0, overflow: 'hidden' } : {}}
        >
          <div className="panel__header">
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                className={`btn btn--ghost btn--sm${view === 'analysis' || view === 'map' ? '' : ''}`}
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  background: view !== 'recommendations' ? 'var(--accent-subtle)' : '',
                  color: view !== 'recommendations' ? 'var(--accent)' : '',
                }}
                onClick={() => setView('analysis')}
              >
                Score
              </button>
              <button
                className="btn btn--ghost btn--sm"
                style={{
                  padding: '4px 8px',
                  fontSize: 11,
                  background: view === 'recommendations' ? 'var(--accent-subtle)' : '',
                  color: view === 'recommendations' ? 'var(--accent)' : '',
                }}
                onClick={() => setView('recommendations')}
              >
                AI Recs
              </button>
            </div>
            <button
              className="panel-collapse-btn"
              onClick={() => { setRightCollapsed(true); setMobilePanelOpen(null); }}
              title="Collapse panel"
            >
              →
            </button>
          </div>

          <div className="panel__body">
            {view !== 'recommendations' ? (
              /* Analysis view */
              <>
                {!site && !isLoading && (
                  <div className="empty-state">
                    <div className="empty-state__icon">📊</div>
                    <div className="empty-state__title">No analysis yet</div>
                    <div className="empty-state__desc">Select a site to begin accessibility analysis.</div>
                  </div>
                )}

                {accessibilityScore && (
                  <ScorePanel score={accessibilityScore} loading={loadingAmenities} />
                )}

                {loadingAmenities && !accessibilityScore && (
                  <div className="panel__section">
                    <div className="gemini-status">
                      <div className="spinner spinner--lg" />
                      <div className="gemini-status__title">Analysing amenities…</div>
                    </div>
                  </div>
                )}

                {catchmentStats && (
                  <div className="panel__section">
                    <div className="section-label">Catchment Comparison</div>
                    <CatchmentComparison stats={catchmentStats} />
                  </div>
                )}

                {analysisComplete && (
                  <div className="panel__section">
                    <button
                      className="analyse-btn"
                      onClick={runGeminiAnalysis}
                      disabled={loadingGemini}
                    >
                      {loadingGemini ? (
                        <>
                          <div className="spinner spinner--sm" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} />
                          Analysing…
                        </>
                      ) : (
                        <>✦ Run AI Analysis</>
                      )}
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Recommendations view */
              <GeminiPanel
                analysis={geminiAnalysis}
                loading={loadingGemini}
                error={errorGemini}
                onAnalyse={runGeminiAnalysis}
                canAnalyse={analysisComplete}
              />
            )}
          </div>
        </aside>
      </div>

      {/* ── Mobile tabs ──────────────────────────────────────────────────────── */}
      <nav className="mobile-tabs">
        <div className="mobile-tabs__inner">
          <button
            className={`mobile-tab${view === 'map' ? ' mobile-tab--active' : ''}`}
            onClick={() => { setView('map'); setMobilePanelOpen(null); }}
          >
            <span className="mobile-tab__icon">🗺</span>
            <span className="mobile-tab__label">Map</span>
          </button>
          <button
            className={`mobile-tab${mobilePanelOpen === 'left' ? ' mobile-tab--active' : ''}`}
            onClick={() => {
              setMobilePanelOpen((p) => p === 'left' ? null : 'left');
              setView('map');
            }}
          >
            <span className="mobile-tab__icon">🎛</span>
            <span className="mobile-tab__label">Controls</span>
          </button>
          <button
            className={`mobile-tab${view === 'analysis' && mobilePanelOpen === 'right' ? ' mobile-tab--active' : ''}`}
            onClick={() => {
              setMobilePanelOpen((p) => p === 'right' ? null : 'right');
              setView('analysis');
            }}
          >
            <span className="mobile-tab__icon">📊</span>
            <span className="mobile-tab__label">Score</span>
          </button>
          <button
            className={`mobile-tab${view === 'recommendations' && mobilePanelOpen === 'right' ? ' mobile-tab--active' : ''}`}
            onClick={() => {
              setMobilePanelOpen((p) => p === 'right' ? null : 'right');
              setView('recommendations');
            }}
          >
            <span className="mobile-tab__icon">✦</span>
            <span className="mobile-tab__label">AI Recs</span>
          </button>
        </div>
      </nav>

      {/* Overlay for mobile panels */}
      {mobilePanelOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.4)',
            zIndex: 150,
            display: 'none',
          }}
          onClick={() => setMobilePanelOpen(null)}
        />
      )}
    </div>
  );
}
