import { useEffect, useMemo, useRef, useState } from 'react';
import maplibregl, { GeoJSONSource, Map as MapLibreMap, Marker } from 'maplibre-gl';
import { loadWalkabilityData } from './data';
import { baseCollections, personalizeWalkability, topNeighborhoods } from './scoring';
import type {
  FishnetProperties,
  GeoCollection,
  NeighborhoodProperties,
  Preferences,
} from './types';

const DEFAULT_PREFERENCES: Preferences = { slope: 2, streets: 2, amenity: 2, crime: 2 };
const VALUE_LABELS = ['Not', 'A little', 'Either way', 'A lot', 'Very'];

const SCORE_COLOR: maplibregl.ExpressionSpecification = [
  'interpolate',
  ['linear'],
  ['coalesce', ['to-number', ['get', 'display_score']], 0],
  0, '#f44336',
  25, '#ff9800',
  50, '#ffeb3b',
  75, '#adff2f',
  100, '#14af00',
];

type WalkabilityData = {
  fishnet: GeoCollection<FishnetProperties>;
  neighborhoods: GeoCollection<NeighborhoodProperties>;
};

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function score(value: unknown): string {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric.toFixed(1) : 'Not available';
}

function fishnetPopup(properties: Record<string, unknown>): string {
  return `<div class="map-popup">
    <span class="popup-kicker">Fishnet cell</span>
    <h3>${escapeHtml(properties.nested || 'Seattle')}</h3>
    <dl>
      <dt>Displayed score</dt><dd>${score(properties.display_score)}</dd>
      <dt>Base score</dt><dd>${score(properties.walk_score)}</dd>
      <dt>Effective slope</dt><dd>${score(properties.effective_slope)}</dd>
      <dt>Maximum speed</dt><dd>${score(properties.Max_Speed_Limit)} mph</dd>
      <dt>Business density</dt><dd>${score(properties.business_density)}</dd>
    </dl>
  </div>`;
}

function neighborhoodPopup(properties: Record<string, unknown>): string {
  return `<div class="map-popup">
    <span class="popup-kicker">Neighborhood</span>
    <h3>${escapeHtml(properties.nested || 'Seattle')}</h3>
    <dl>
      <dt>Displayed score</dt><dd>${score(properties.display_score)}</dd>
      <dt>Base score</dt><dd>${score(properties.rank_normalized_walk_score)}</dd>
    </dl>
  </div>`;
}

function addWalkabilityLayers(map: MapLibreMap, data: WalkabilityData) {
  map.addSource('fishnet', { type: 'geojson', data: data.fishnet as never });
  map.addSource('neighborhoods', { type: 'geojson', data: data.neighborhoods as never });

  map.addLayer({
    id: 'fishnet-fill',
    type: 'fill',
    source: 'fishnet',
    paint: { 'fill-color': SCORE_COLOR, 'fill-opacity': 0.52, 'fill-outline-color': 'rgba(70,70,70,.08)' },
  });
  map.addLayer({
    id: 'neighborhood-fill',
    type: 'fill',
    source: 'neighborhoods',
    layout: { visibility: 'none' },
    paint: { 'fill-color': SCORE_COLOR, 'fill-opacity': 0.5, 'fill-outline-color': 'rgba(55,55,55,.5)' },
  });

  map.on('click', 'fishnet-fill', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maplibregl.Popup().setLngLat(event.lngLat).setHTML(fishnetPopup(feature.properties)).addTo(map);
  });
  map.on('click', 'neighborhood-fill', (event) => {
    const feature = event.features?.[0];
    if (!feature) return;
    new maplibregl.Popup().setLngLat(event.lngLat).setHTML(neighborhoodPopup(feature.properties)).addTo(map);
  });
  ['fishnet-fill', 'neighborhood-fill'].forEach((layer) => {
    map.on('mouseenter', layer, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', layer, () => { map.getCanvas().style.cursor = ''; });
  });
}

function PreferenceRow({
  label,
  help,
  value,
  onChange,
}: {
  label: string;
  help: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="preference-row">
      <span>
        <strong>{label}</strong>
        <small>{help}</small>
      </span>
      <span className="range-control">
        <input type="range" min="0" max="4" step="1" value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <output>{VALUE_LABELS[value]}</output>
      </span>
    </label>
  );
}

export default function App() {
  const mapContainer = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRefs = useRef<Marker[]>([]);
  const [mapReady, setMapReady] = useState(false);
  const [rawData, setRawData] = useState<WalkabilityData | null>(null);
  const [displayData, setDisplayData] = useState<WalkabilityData | null>(null);
  const [preferences, setPreferences] = useState<Preferences>(DEFAULT_PREFERENCES);
  const [appliedPreferences, setAppliedPreferences] = useState<Preferences | null>(null);
  const [view, setView] = useState<'fishnet' | 'neighborhoods'>('fishnet');
  const [aboutOpen, setAboutOpen] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [mapError, setMapError] = useState('');

  const top = useMemo(() => displayData ? topNeighborhoods(displayData.neighborhoods) : [], [displayData]);

  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    let map: MapLibreMap;
    try {
      map = new maplibregl.Map({
        container: mapContainer.current,
        style: 'https://tiles.openfreemap.org/styles/positron',
        center: [-122.3321, 47.6062],
        zoom: 11.2,
        minZoom: 9.5,
        maxZoom: 18,
      });
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
      map.on('load', () => setMapReady(true));
      mapRef.current = map;
    } catch (error) {
      console.error(error);
      setMapError('The interactive map requires a browser with WebGL enabled.');
      return;
    }
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadWalkabilityData()
      .then((data) => {
        if (cancelled) return;
        const base = baseCollections(data.fishnet, data.neighborhoods);
        setRawData(data);
        setDisplayData(base);
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) setLoadError('The local walkability data could not be loaded.');
      });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !displayData) return;
    if (!map.getSource('fishnet')) addWalkabilityLayers(map, displayData);
    else {
      (map.getSource('fishnet') as GeoJSONSource).setData(displayData.fishnet as never);
      (map.getSource('neighborhoods') as GeoJSONSource).setData(displayData.neighborhoods as never);
    }
  }, [displayData, mapReady]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !map.getLayer('fishnet-fill')) return;
    map.setLayoutProperty('fishnet-fill', 'visibility', view === 'fishnet' ? 'visible' : 'none');
    map.setLayoutProperty('neighborhood-fill', 'visibility', view === 'neighborhoods' ? 'visible' : 'none');
  }, [view, mapReady, displayData]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;
    markerRefs.current.forEach((marker) => marker.remove());
    markerRefs.current = top.map((neighborhood, index) => {
      const element = document.createElement('div');
      element.className = 'rank-marker';
      element.textContent = String(index + 1);
      element.title = `${neighborhood.name}: ${neighborhood.score.toFixed(1)}`;
      return new maplibregl.Marker({ element }).setLngLat([neighborhood.longitude, neighborhood.latitude]).addTo(map);
    });
  }, [top, mapReady]);

  const updatePreference = (field: keyof Preferences, value: number) => {
    setPreferences((current) => ({ ...current, [field]: value }));
  };

  const recalculate = () => {
    if (!rawData) return;
    setDisplayData(personalizeWalkability(rawData.fishnet, rawData.neighborhoods, preferences));
    setAppliedPreferences({ ...preferences });
  };

  const reset = () => {
    if (!rawData) return;
    setPreferences(DEFAULT_PREFERENCES);
    setAppliedPreferences(null);
    setDisplayData(baseCollections(rawData.fishnet, rawData.neighborhoods));
  };

  return (
    <main className="app-shell">
      <div ref={mapContainer} id="map" aria-label="Seattle walkability map" />
      {mapError && <p className="map-error" role="alert">{mapError}</p>}
      <header className="navbar">
        <h1>Walkability in Seattle</h1>
        <nav aria-label="Application links">
          <button type="button" onClick={() => setAboutOpen(true)}>How it works</button>
          <a href="https://data.seattle.gov/" target="_blank" rel="noreferrer">Data</a>
          <a href="https://github.com/smileshey/Seattle-Walkability-Index" target="_blank" rel="noreferrer">GitHub</a>
        </nav>
      </header>
      <div className="view-toggle" role="group" aria-label="Map geography">
        <button className={view === 'fishnet' ? 'active' : ''} type="button" onClick={() => setView('fishnet')}>Fishnet</button>
        <button className={view === 'neighborhoods' ? 'active' : ''} type="button" onClick={() => setView('neighborhoods')}>Neighborhoods</button>
      </div>
      <section className="preferences-panel" aria-labelledby="preferences-title">
        <div className="panel-heading">
          <div><span className="eyebrow">Personalize the index</span><h2 id="preferences-title">What’s most important to you?</h2></div>
          <button className="info-button" type="button" onClick={() => setAboutOpen(true)} aria-label="Explain the walkability calculation">i</button>
        </div>
        {!rawData && !loadError && <p className="loading-message">Loading local walkability data…</p>}
        {loadError && <p className="error-message">{loadError}</p>}
        {rawData && <>
          <div className="preference-list">
            <PreferenceRow label="Flat ground" help="Prefer routes with gentler slopes." value={preferences.slope} onChange={(value) => updatePreference('slope', value)} />
            <PreferenceRow label="Calm streets" help="Prefer lower speeds and fewer crashes." value={preferences.streets} onChange={(value) => updatePreference('streets', value)} />
            <PreferenceRow label="Business density" help="Prefer access to more destinations." value={preferences.amenity} onChange={(value) => updatePreference('amenity', value)} />
            <PreferenceRow label="Low crime" help="Place more emphasis on lower crime density." value={preferences.crime} onChange={(value) => updatePreference('crime', value)} />
          </div>
          <div className="panel-actions">
            <button className="primary-button" type="button" onClick={recalculate}>Recalculate walkscore</button>
            {appliedPreferences && <button className="secondary-button" type="button" onClick={reset}>Reset</button>}
          </div>
          {appliedPreferences && <div className="ranking-section">
            <h3>Your most walkable neighborhoods</h3>
            <ol>{top.map((neighborhood) => <li key={neighborhood.name}><span>{neighborhood.name}</span><strong>{neighborhood.score.toFixed(1)}</strong></li>)}</ol>
          </div>}
        </>}
      </section>
      <aside className="legend" aria-label="Walkability score legend">
        <strong>Walkability spectrum</strong><div className="legend-gradient" /><div><span>Lower</span><span>Higher</span></div>
      </aside>
      {aboutOpen && <div className="modal-backdrop" role="presentation" onMouseDown={() => setAboutOpen(false)}>
        <section className="about-panel" role="dialog" aria-modal="true" aria-labelledby="about-title" onMouseDown={(event) => event.stopPropagation()}>
          <button className="modal-close" type="button" onClick={() => setAboutOpen(false)} aria-label="Close">×</button>
          <span className="eyebrow">About the index</span><h2 id="about-title">How personalized walkability is calculated</h2>
          <p>The base index combines sidewalks, parks, trails, and bicycle infrastructure. Your selections adjust that foundation using slope, street speed and crashes, business density, and crime-density scalers.</p>
          <p>Scores are recalculated for each fishnet cell, ranked from 0–100, aggregated by neighborhood, adjusted for neighborhood area, and ranked again. These are comparative planning scores—not guarantees about personal safety, accessibility, or route conditions.</p>
          <p>The web map uses MapLibre and local, precomputed GeoJSON. It does not require ArcGIS Online at runtime.</p>
          <a href="https://github.com/smileshey/Seattle-Walkability-Index#how-it-works" target="_blank" rel="noreferrer">Read the full methodology on GitHub ↗</a>
        </section>
      </div>}
    </main>
  );
}
