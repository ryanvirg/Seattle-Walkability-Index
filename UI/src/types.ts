export type Position = [number, number];

export type PolygonGeometry = {
  type: 'Polygon';
  coordinates: Position[][];
};

export type MultiPolygonGeometry = {
  type: 'MultiPolygon';
  coordinates: Position[][][];
};

export type PolygonalGeometry = PolygonGeometry | MultiPolygonGeometry;

export type GeoFeature<P> = {
  type: 'Feature';
  id?: string | number;
  properties: P;
  geometry: PolygonalGeometry;
};

export type GeoCollection<P> = {
  type: 'FeatureCollection';
  features: Array<GeoFeature<P>>;
};

export type FishnetProperties = {
  OBJECTID: number;
  IndexID: number | null;
  GRID_ID: string | null;
  nested: string | null;
  latitude: number | null;
  longitude: number | null;
  neighborhood_area: number | null;
  Max_Speed_Limit: number | null;
  effective_slope: number | null;
  business_density: number | null;
  crime_density_normalized: number | null;
  crash_density_normalized: number | null;
  unadjusted_walkscore: number | null;
  walk_score: number | null;
  slope_scaler: number | null;
  effective_speed_limit_scaler: number | null;
  business_density_scaler: number | null;
  crime_density_scaler: number | null;
  crash_density_scaler: number | null;
  personalized_walkscore?: number;
  display_score?: number;
};

export type NeighborhoodProperties = {
  OBJECTID: number;
  city: string;
  nested: string;
  neighborhood_area: number;
  latitude: number;
  longitude: number;
  rank_normalized_walk_score: number;
  personalized_walkscore?: number;
  display_score?: number;
};

export type Preferences = {
  slope: number;
  streets: number;
  amenity: number;
  crime: number;
};

export type NeighborhoodRank = {
  name: string;
  score: number;
  latitude: number;
  longitude: number;
};
