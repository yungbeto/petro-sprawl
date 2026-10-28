// zod schemas for everything the jobs publish. A file is only replaced when its new contents pass.

import { z } from 'zod';

const isoDate = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const position = z.array(z.number()).min(2);

export const observationSeriesSchema = z.object({
  id: z.string().min(1),
  metric: z.enum(['tanker_transits', 'gas_flow_kwh_d', 'storage_fill_pct']),
  unit: z.string().min(1),
  points: z.array(z.object({ date: isoDate, value: z.number().finite() })).min(1),
  capacity: z.number().positive().optional(),
  label: z.string().min(1).optional(),
  fiveYear: z
    .object({ mean: z.number().nonnegative(), from: isoDate, to: isoDate, count: z.number().int().positive() })
    .optional(),
});

export const chokepointSchema = z.object({
  id: z.enum(['hormuz', 'malacca', 'suez', 'babelm', 'danish', 'turkish', 'panama']),
  name: z.string().min(1),
  point: lonLat,
  eiaReferenceMbd: z.number().positive(),
  transitSeriesId: z.string().min(1),
});

export const basinSchema = z.object({
  id: z.string().regex(/^usgs-\d+$/),
  code: z.number().int(),
  name: z.string().min(1),
  provinceType: z.enum(['priority', 'boutique']),
  dominant: z.enum(['oil', 'gas']).nullable(),
  labelPoint: lonLat,
  countries: z.array(z.string().regex(/^[A-Z]{2}$/)),
  geometry: z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.any()).min(1) }),
});

export const sourceRefSchema = z.object({
  publisher: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  publishedAt: isoDate,
});

const evidenceSchema = z.object({
  status: z.enum(['operating', 'reduced', 'offline', 'idle', 'planned', 'under_construction', 'cancelled', 'unknown']),
  sourceType: z.enum(['operator', 'regulator', 'government', 'press', 'dataset', 'measured']),
  statement: z.string().optional(),
  url: z.string().url().optional(),
  observedAt: isoDate,
  recordedAt: isoDate,
});

export const pipelineSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  commodity: z.enum(['gas', 'oil', 'products', 'ngl']),
  fromCountry: z.string(),
  toCountry: z.string(),
  transitCountries: z.array(z.string()),
  operator: z.string().optional(),
  owners: z.array(z.object({ name: z.string(), sharePct: z.number().optional() })).optional(),
  capacity: z.object({ value: z.number().positive(), unit: z.enum(['bcm/yr', 'mb/d']) }).optional(),
  capacitySource: sourceRefSchema.optional(),
  geometry: z.union([
    z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2) }),
    z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(position).min(2)).min(1) }),
  ]),
  geometryApprox: z.boolean(),
  evidence: z.array(evidenceSchema),
  flowSeriesId: z.string().optional(),
  sources: z.array(z.string()).min(1),
});

export const disruptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  assetKind: z.enum(['pipeline', 'chokepoint']),
  assetId: z.string().min(1),
  startedAt: isoDate,
  endedAt: isoDate.optional(),
  cause: z.enum(['sabotage', 'sanction', 'maintenance', 'commercial', 'conflict', 'accident', 'other']),
  summary: z.string().min(1),
  sources: z.array(sourceRefSchema).min(1),
  recordedAt: isoDate,
});

/** A curated corridor pipeline. Its claims must link a source, and can't pose as dataset or measured. */
export const curatedPipelineSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  commodity: z.enum(['gas', 'oil', 'products', 'ngl']),
  fromCountry: z.string().regex(/^[A-Z]{2}$/),
  toCountry: z.string().regex(/^[A-Z]{2}$/),
  transitCountries: z.array(z.string().regex(/^[A-Z]{2}$/)),
  gem: z.array(z.string().regex(/^gem-/)),
  autoMatch: z.boolean().optional(),
  exclude: z.array(z.string()).optional(),
  capacity: z
    .object({ value: z.number().positive(), unit: z.enum(['bcm/yr', 'mb/d']), source: sourceRefSchema })
    .optional(),
  evidence: z.array(
    evidenceSchema.extend({
      sourceType: z.enum(['operator', 'regulator', 'government', 'press']),
      statement: z.string().min(1),
      url: z.string().url(),
    }),
  ),
});

export const countrySchema = z.object({
  id: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().min(1),
  geometry: z.object({ type: z.enum(['Polygon', 'MultiPolygon']), coordinates: z.array(z.any()).min(1) }),
});
