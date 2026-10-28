import type { Basin, Chokepoint, Pipeline } from '../src/types';

export const basin: Basin = {
  id: 'usgs-1',
  code: 1,
  name: 'Test Basin',
  provinceType: 'priority',
  dominant: 'oil',
  labelPoint: [5, 5],
  countries: ['SA'],
  geometry: {
    type: 'Polygon',
    coordinates: [[[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]]],
  },
};

export const chokepoint = (id: Chokepoint['id'], point: [number, number]): Chokepoint => ({
  id,
  name: id,
  point,
  eiaReferenceMbd: 4,
  transitSeriesId: `portwatch-${id}`,
});

export const pipeline = (overrides: Partial<Pipeline> = {}): Pipeline => ({
  id: 'test-line',
  name: 'Test line',
  aliases: [],
  commodity: 'gas',
  fromCountry: 'RU',
  toCountry: 'DE',
  transitCountries: [],
  geometry: { type: 'LineString', coordinates: [[-5, 5], [15, 5]] },
  geometryApprox: false,
  evidence: [],
  sources: [],
  ...overrides,
});
