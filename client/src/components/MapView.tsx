import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
import type { AmenitiesByCategory, IsochroneResult, Site } from '../types';
import { CATEGORY_META } from '../types';

const STYLE_LIGHT = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 19,
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

const STYLE_DARK = {
  version: 8 as const,
  sources: {
    osm: {
      type: 'raster' as const,
      tiles: ['https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png'],
      tileSize: 256,
      attribution: '© <a href="https://stadiamaps.com/">Stadia Maps</a> © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxzoom: 20,
    },
  },
  layers: [{ id: 'osm', type: 'raster' as const, source: 'osm' }],
};

interface MapViewProps {
  site: Site | null;
  isochrones: IsochroneResult | null;
  amenities: AmenitiesByCategory | null;
  activeCategories: Set<string>;
  activeCatchments: Set<5 | 10 | 15>;
  isDark: boolean;
  onMapClick: (lat: number, lng: number) => void;
}

const CATCHMENT_COLORS = [
  { fill: 'rgba(22,184,173,0.18)', stroke: 'rgba(22,184,173,0.75)', minutes: 5 },
  { fill: 'rgba(22,184,173,0.10)', stroke: 'rgba(22,184,173,0.50)', minutes: 10 },
  { fill: 'rgba(22,184,173,0.05)', stroke: 'rgba(22,184,173,0.30)', minutes: 15 },
];

const CATCHMENT_COLORS_DARK = [
  { fill: 'rgba(53,214,198,0.22)', stroke: 'rgba(53,214,198,0.80)', minutes: 5 },
  { fill: 'rgba(53,214,198,0.12)', stroke: 'rgba(53,214,198,0.55)', minutes: 10 },
  { fill: 'rgba(53,214,198,0.06)', stroke: 'rgba(53,214,198,0.35)', minutes: 15 },
];

export const MapView: React.FC<MapViewProps> = ({
  site,
  isochrones,
  amenities,
  activeCategories,
  activeCatchments,
  isDark,
  onMapClick,
}) => {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const siteMarker = useRef<maplibregl.Marker | null>(null);
  const amenityMarkers = useRef<maplibregl.Marker[]>([]);
  const popups = useRef<maplibregl.Popup[]>([]);
  const [isLoaded, setIsLoaded] = useState(false);

  // Init map
  useEffect(() => {
    if (!mapContainer.current || map.current) return;

    const m = new maplibregl.Map({
      container: mapContainer.current,
      style: isDark ? STYLE_DARK : STYLE_LIGHT,
      center: [77.5946, 12.9716],
      zoom: 12,
      attributionControl: { compact: true },
    });

    m.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'bottom-right');
    m.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    m.on('load', () => {
      setIsLoaded(true);
      addIsochroneSources(m);
    });

    m.on('click', (e) => {
      onMapClick(e.lngLat.lat, e.lngLat.lng);
    });

    m.getCanvas().style.cursor = 'crosshair';
    map.current = m;

    return () => {
      m.remove();
      map.current = null;
    };
  }, []);

  // Switch basemap style on theme change
  useEffect(() => {
    if (!map.current || !isLoaded) return;
    const newStyle = isDark ? STYLE_DARK : STYLE_LIGHT;
    map.current.setStyle(newStyle);
    map.current.once('styledata', () => {
      addIsochroneSources(map.current!);
      renderIsochrones();
    });
  }, [isDark]);

  // Update isochrones
  useEffect(() => {
    if (!isLoaded || !map.current) return;
    renderIsochrones();
  }, [isochrones, activeCatchments, isDark, isLoaded]);

  // Update site marker
  useEffect(() => {
    if (!map.current) return;
    if (siteMarker.current) {
      siteMarker.current.remove();
      siteMarker.current = null;
    }
    if (!site) return;

    const el = document.createElement('div');
    el.className = 'site-marker';
    el.innerHTML = `
      <div style="
        width:18px;height:18px;
        background:var(--accent);
        border:3px solid white;
        border-radius:50%;
        box-shadow:0 2px 8px rgba(0,0,0,0.3);
        cursor:pointer;
      "></div>
      <div style="
        width:0;height:0;
        border-left:7px solid transparent;
        border-right:7px solid transparent;
        border-top:8px solid var(--accent);
        margin:-2px auto 0;
      "></div>
    `;
    el.style.width = '18px';
    el.style.zIndex = '50';

    siteMarker.current = new maplibregl.Marker({ element: el, anchor: 'bottom' })
      .setLngLat([site.coordinates.lng, site.coordinates.lat])
      .addTo(map.current);

    map.current.flyTo({
      center: [site.coordinates.lng, site.coordinates.lat],
      zoom: Math.max(map.current.getZoom(), 14),
      duration: 1200,
    });
  }, [site]);

  // Update amenity markers
  useEffect(() => {
    if (!map.current) return;

    // Remove existing
    amenityMarkers.current.forEach((m) => m.remove());
    amenityMarkers.current = [];
    popups.current.forEach((p) => p.remove());
    popups.current = [];

    if (!amenities) return;

    for (const catMeta of CATEGORY_META) {
      if (!activeCategories.has(catMeta.key)) continue;
      const features = amenities[catMeta.key] || [];

      // Limit markers per category for performance
      const limited = features.slice(0, 200);

      for (const feat of limited) {
        const el = document.createElement('div');
        el.style.cssText = `
          width:20px;height:20px;
          background:${catMeta.color};
          border:2px solid white;
          border-radius:50%;
          display:flex;align-items:center;justify-content:center;
          font-size:10px;cursor:pointer;
          box-shadow:0 1px 4px rgba(0,0,0,0.3);
          transition:transform 0.15s;
        `;
        el.textContent = catMeta.icon;
        el.title = feat.name || catMeta.label;

        el.addEventListener('mouseenter', () => { el.style.transform = 'scale(1.3)'; });
        el.addEventListener('mouseleave', () => { el.style.transform = 'scale(1)'; });

        const popup = new maplibregl.Popup({ offset: 16, closeButton: false, maxWidth: '200px' })
          .setHTML(`
            <div style="font-family:var(--font)">
              <div style="font-weight:600;font-size:13px;color:var(--text-primary);margin-bottom:3px">
                ${feat.name || 'Unnamed'}
              </div>
              <div style="font-size:11px;color:var(--text-muted)">${catMeta.label}</div>
            </div>
          `);

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([feat.lon, feat.lat])
          .setPopup(popup)
          .addTo(map.current!);

        amenityMarkers.current.push(marker);
        popups.current.push(popup);
      }
    }
  }, [amenities, activeCategories]);

  // Resize map when container changes
  useEffect(() => {
    if (!map.current) return;
    const ro = new ResizeObserver(() => map.current?.resize());
    if (mapContainer.current) ro.observe(mapContainer.current);
    return () => ro.disconnect();
  }, []);

  function addIsochroneSources(m: maplibregl.Map) {
    if (!m.getSource('isochrones')) {
      m.addSource('isochrones', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    }
    const colors = isDark ? CATCHMENT_COLORS_DARK : CATCHMENT_COLORS;
    // Add layers in reverse order: 15-min first (base), 10-min, then 5-min on top
    const layerColors = [...colors].sort((a, b) => b.minutes - a.minutes);
    for (const c of layerColors) {
      const fillId = `isochrone-fill-${c.minutes}`;
      const strokeId = `isochrone-stroke-${c.minutes}`;
      if (!m.getLayer(fillId)) {
        m.addLayer({
          id: fillId,
          type: 'fill',
          source: 'isochrones',
          filter: ['==', ['get', 'minutes'], c.minutes],
          paint: { 'fill-color': c.fill, 'fill-opacity': 1 },
        });
      }
      if (!m.getLayer(strokeId)) {
        m.addLayer({
          id: strokeId,
          type: 'line',
          source: 'isochrones',
          filter: ['==', ['get', 'minutes'], c.minutes],
          paint: { 'line-color': c.stroke, 'line-width': 1.5, 'line-dasharray': [4, 2] },
        });
      }
    }
  }

  function renderIsochrones() {
    const m = map.current;
    if (!m || !m.getSource('isochrones')) return;

    if (!isochrones) {
      (m.getSource('isochrones') as maplibregl.GeoJSONSource).setData({
        type: 'FeatureCollection',
        features: [],
      });
      return;
    }

    const colors = isDark ? CATCHMENT_COLORS_DARK : CATCHMENT_COLORS;
    // Update paint colors
    for (const c of colors) {
      const fillId = `isochrone-fill-${c.minutes}`;
      const strokeId = `isochrone-stroke-${c.minutes}`;
      if (m.getLayer(fillId)) {
        m.setPaintProperty(fillId, 'fill-color', c.fill);
        m.setPaintProperty(fillId, 'fill-opacity', activeCatchments.has(c.minutes as 5|10|15) ? 1 : 0);
      }
      if (m.getLayer(strokeId)) {
        m.setPaintProperty(strokeId, 'line-color', c.stroke);
        m.setPaintProperty(strokeId, 'line-opacity', activeCatchments.has(c.minutes as 5|10|15) ? 1 : 0);
      }
    }

    // Filter features by active catchments
    const features = isochrones.geojson.features.filter((f) =>
      activeCatchments.has(f.properties?.minutes as 5|10|15),
    );

    (m.getSource('isochrones') as maplibregl.GeoJSONSource).setData({
      type: 'FeatureCollection',
      features: isochrones.geojson.features,
    });
  }

  const handleRecenter = useCallback(() => {
    if (!site || !map.current) return;
    map.current.flyTo({ center: [site.coordinates.lng, site.coordinates.lat], zoom: 14, duration: 800 });
  }, [site]);

  const isFallback = isochrones?.type === 'fallback';

  return (
    <div className="map-container" style={{ position: 'relative', width: '100%', height: '100%' }}>
      <div ref={mapContainer} className="map-canvas" />

      {/* Legend */}
      {isochrones && (
        <div className="map-legend">
          <div className="map-legend__title">Walking Time</div>
          {[5, 10, 15].map((min, i) => (
            <div key={min} className="map-legend__item">
              <div
                className="map-legend__swatch"
                style={{
                  background: isDark
                    ? CATCHMENT_COLORS_DARK[i].stroke
                    : CATCHMENT_COLORS[i].stroke,
                  opacity: activeCatchments.has(min as 5|10|15) ? 1 : 0.3,
                }}
              />
              <span style={{ opacity: activeCatchments.has(min as 5|10|15) ? 1 : 0.4 }}>
                {min} min{isFallback ? ' (approx.)' : ''}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Fallback badge */}
      {isFallback && isochrones && (
        <div className="map-fallback-badge" style={{ bottom: '52px', left: '10px' }}>
          <span>⚠</span>
          <span>Approximate buffer (not walking network)</span>
        </div>
      )}

      {/* Recenter */}
      {site && (
        <button
          className="map-control-btn"
          style={{ position: 'absolute', top: 10, right: 10, zIndex: 10 }}
          onClick={handleRecenter}
          title="Re-centre map"
        >
          ◎
        </button>
      )}
    </div>
  );
};
