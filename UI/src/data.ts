import type { FishnetProperties, GeoCollection, NeighborhoodProperties } from './types';

async function loadGeoJSON<T>(file: string): Promise<GeoCollection<T>> {
  const response = await fetch(`${import.meta.env.BASE_URL}data/${file}`);
  if (!response.ok) throw new Error(`${file}: ${response.status} ${response.statusText}`);
  return response.json() as Promise<GeoCollection<T>>;
}

export async function loadWalkabilityData() {
  const [fishnet, neighborhoods] = await Promise.all([
    loadGeoJSON<FishnetProperties>('walkscore_fishnet.geojson'),
    loadGeoJSON<NeighborhoodProperties>('walkscore_neighborhoods.geojson'),
  ]);
  return { fishnet, neighborhoods };
}
