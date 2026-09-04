import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const uiDir = path.resolve(scriptDir, '..');
const repoDir = path.resolve(uiDir, '..');
const outputDir = path.join(uiDir, 'public', 'data');
const sourceFishnet = path.join(uiDir, 'walkscore_fishnet.json');
const neighborhoodsUrl =
  'https://services5.arcgis.com/aqBhwniULpSJewJV/arcgis/rest/services/Seattle_Walkability_Index_WFL1/FeatureServer/581/query?where=city%3D%27Seattle%27&outFields=OBJECTID%2Ccity%2Cnested%2Cneighborhood_area%2Clatitude%2Clongitude%2Crank_normalized_walk_score&returnGeometry=true&outSR=4326&f=geojson';

const retainedFields = [
  'OBJECTID',
  'IndexID',
  'GRID_ID',
  'nested',
  'latitude',
  'longitude',
  'neighborhood_area',
  'Max_Speed_Limit',
  'effective_slope',
  'business_density',
  'crime_density_normalized',
  'crash_density_normalized',
  'unadjusted_walkscore',
  'walk_score',
  'slope_scaler',
  'effective_speed_limit_scaler',
  'business_density_scaler',
  'crime_density_scaler',
  'crash_density_scaler',
];

function signedArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return area / 2;
}

function pointInRing(point, ring) {
  let inside = false;
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current, current += 1) {
    const [x1, y1] = ring[current];
    const [x2, y2] = ring[previous];
    if ((y1 > point[1]) !== (y2 > point[1]) && point[0] < ((x2 - x1) * (point[1] - y1)) / (y2 - y1) + x1) {
      inside = !inside;
    }
  }
  return inside;
}

function webMercatorToWgs84([x, y]) {
  const longitude = (x / 20037508.34) * 180;
  const latitudeRadians = 2 * Math.atan(Math.exp((y / 6378137) )) - Math.PI / 2;
  return [Number(longitude.toFixed(6)), Number((latitudeRadians * 180 / Math.PI).toFixed(6))];
}

function arcgisRingsToGeoJSON(rings) {
  const converted = rings
    .filter((ring) => Array.isArray(ring) && ring.length >= 4)
    .map((ring) => ring.map(webMercatorToWgs84));
  const outers = converted.filter((ring) => signedArea(ring) < 0);
  const holes = converted.filter((ring) => signedArea(ring) >= 0);
  const polygons = (outers.length ? outers : converted).map((outer) => [
    signedArea(outer) < 0 ? [...outer].reverse() : outer,
  ]);

  for (const hole of holes) {
    const container = polygons.find((polygon) => pointInRing(hole[0], polygon[0]));
    if (container) container.push(signedArea(hole) > 0 ? [...hole].reverse() : hole);
  }

  return polygons.length === 1
    ? { type: 'Polygon', coordinates: polygons[0] }
    : { type: 'MultiPolygon', coordinates: polygons };
}

function selectProperties(attributes) {
  return Object.fromEntries(retainedFields.map((field) => [field, attributes[field] ?? null]));
}

async function prepareFishnet() {
  const source = JSON.parse(await readFile(sourceFishnet, 'utf8'));
  const features = source.features.map((feature) => ({
    type: 'Feature',
    id: feature.attributes.OBJECTID,
    properties: selectProperties(feature.attributes),
    geometry: arcgisRingsToGeoJSON(feature.geometry.rings),
  }));
  return { type: 'FeatureCollection', features };
}

async function prepareNeighborhoods() {
  const response = await fetch(neighborhoodsUrl);
  if (!response.ok) throw new Error(`Neighborhood download failed: ${response.status} ${response.statusText}`);
  const collection = await response.json();
  if (collection.type !== 'FeatureCollection' || !Array.isArray(collection.features)) {
    throw new Error('Neighborhood response was not a GeoJSON FeatureCollection');
  }
  return collection;
}

await mkdir(outputDir, { recursive: true });
const [fishnet, neighborhoods] = await Promise.all([prepareFishnet(), prepareNeighborhoods()]);
await Promise.all([
  writeFile(path.join(outputDir, 'walkscore_fishnet.geojson'), JSON.stringify(fishnet)),
  writeFile(path.join(outputDir, 'walkscore_neighborhoods.geojson'), JSON.stringify(neighborhoods)),
]);

console.log(`Prepared ${fishnet.features.length.toLocaleString()} fishnet fragments and ${neighborhoods.features.length} neighborhoods.`);
console.log(`Output: ${path.relative(repoDir, outputDir)}`);
