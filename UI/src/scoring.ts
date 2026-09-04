import {
  getBusinessDensityScaler,
  getCrashDensityScaler,
  getCrimeDensityScaler,
  getEffectiveSpeedLimitScaler,
  getSlopeScaler,
} from './scaler_calculations';
import type {
  FishnetProperties,
  GeoCollection,
  NeighborhoodProperties,
  NeighborhoodRank,
  Preferences,
} from './types';

const EXCLUDED_NEIGHBORHOODS = new Set([
  'Sand Point',
  'Discovery Park',
  'Seward Park',
  'University of Washington',
  'Centennial Park',
  'Pike-Market',
]);

function numberOr(value: number | null | undefined, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function rankNormalize(values: number[]): number[] {
  const unique = Array.from(new Set(values)).sort((a, b) => a - b);
  if (unique.length <= 1) return values.map(() => 100);
  const ranks = new Map(unique.map((value, index) => [value, (index / (unique.length - 1)) * 100]));
  return values.map((value) => ranks.get(value) ?? 0);
}

export function baseCollections(
  fishnet: GeoCollection<FishnetProperties>,
  neighborhoods: GeoCollection<NeighborhoodProperties>,
) {
  return {
    fishnet: {
      ...fishnet,
      features: fishnet.features.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, display_score: numberOr(feature.properties.walk_score, 0) },
      })),
    },
    neighborhoods: {
      ...neighborhoods,
      features: neighborhoods.features.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          display_score: numberOr(feature.properties.rank_normalized_walk_score, 0),
        },
      })),
    },
  };
}

export function personalizeWalkability(
  fishnet: GeoCollection<FishnetProperties>,
  neighborhoods: GeoCollection<NeighborhoodProperties>,
  preferences: Preferences,
) {
  const rawFishnetScores = fishnet.features.map(({ properties }) => {
    const slope = preferences.slope === 2
      ? numberOr(properties.slope_scaler, 1)
      : getSlopeScaler(numberOr(properties.effective_slope, -1), preferences.slope);
    const speed = preferences.streets === 2
      ? numberOr(properties.effective_speed_limit_scaler, 1)
      : getEffectiveSpeedLimitScaler(numberOr(properties.Max_Speed_Limit, -1), preferences.streets);
    const business = preferences.amenity === 2
      ? numberOr(properties.business_density_scaler, 1)
      : getBusinessDensityScaler(numberOr(properties.business_density, 0), preferences.amenity);
    const crime = preferences.crime === 2
      ? numberOr(properties.crime_density_scaler, 1)
      : getCrimeDensityScaler(numberOr(properties.crime_density_normalized, 0), preferences.crime);
    const crashes = preferences.streets === 2
      ? numberOr(properties.crash_density_scaler, 1)
      : getCrashDensityScaler(numberOr(properties.crash_density_normalized, 0), preferences.streets);
    const normalizedPositive = numberOr(properties.unadjusted_walkscore, 0) / 0.00006;
    return Math.max(0.01, Number((normalizedPositive * slope * speed * business * crime * crashes + 0.001).toFixed(2)));
  });

  const normalizedFishnetScores = rankNormalize(rawFishnetScores);
  const personalizedFishnet: GeoCollection<FishnetProperties> = {
    ...fishnet,
    features: fishnet.features.map((feature, index) => ({
      ...feature,
      properties: {
        ...feature.properties,
        personalized_walkscore: normalizedFishnetScores[index],
        display_score: normalizedFishnetScores[index],
      },
    })),
  };

  const totals = new Map<string, number>();
  personalizedFishnet.features.forEach(({ properties }) => {
    if (!properties.nested) return;
    totals.set(properties.nested, (totals.get(properties.nested) ?? 0) + numberOr(properties.personalized_walkscore, 0));
  });

  const rawNeighborhoodScores = neighborhoods.features.map(({ properties }) => {
    const total = totals.get(properties.nested) ?? 0;
    return properties.neighborhood_area > 0 ? total / Math.pow(properties.neighborhood_area, 0.85) : total;
  });
  const normalizedNeighborhoodScores = rankNormalize(rawNeighborhoodScores);
  const personalizedNeighborhoods: GeoCollection<NeighborhoodProperties> = {
    ...neighborhoods,
    features: neighborhoods.features.map((feature, index) => ({
      ...feature,
      properties: {
        ...feature.properties,
        personalized_walkscore: normalizedNeighborhoodScores[index],
        display_score: normalizedNeighborhoodScores[index],
      },
    })),
  };

  return { fishnet: personalizedFishnet, neighborhoods: personalizedNeighborhoods };
}

export function topNeighborhoods(collection: GeoCollection<NeighborhoodProperties>): NeighborhoodRank[] {
  return collection.features
    .map(({ properties }) => ({
      name: properties.nested,
      score: numberOr(properties.display_score, 0),
      latitude: properties.latitude,
      longitude: properties.longitude,
    }))
    .filter((neighborhood) => !EXCLUDED_NEIGHBORHOODS.has(neighborhood.name))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
