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

const pageRefSchema = z.object({
  publisher: z.string().min(1),
  title: z.string().min(1),
  url: z.string().url(),
  accessedAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const year = z.number().int().min(1850).max(2100);

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
  ownersSource: pageRefSchema.optional(),
  parents: z.array(z.object({ name: z.string(), sharePct: z.number().optional() })).optional(),
  history: z
    .object({
      startYears: z.array(year),
      expected: z.boolean(),
      proposalYear: year.optional(),
      constructionYear: year.optional(),
      stopYear: year.optional(),
    })
    .optional(),
  lengthKm: z.object({ value: z.number().nonnegative(), estimated: z.boolean() }).optional(),
  diameter: z.string().min(1).optional(),
  endpoints: z.object({ start: z.string().optional(), end: z.string().optional() }).optional(),
  geometry: z.union([
    z.object({ type: z.literal('LineString'), coordinates: z.array(position).min(2) }),
    z.object({ type: z.literal('MultiLineString'), coordinates: z.array(z.array(position).min(2)).min(1) }),
  ]),
  geometryApprox: z.boolean(),
  evidence: z.array(evidenceSchema),
  flowSeriesId: z.string().optional(),
  sources: z.array(z.string()).min(1),
});

export const lngTerminalSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  facility: z.enum(['export', 'import']),
  country: z.string(),
  point: lonLat,
  pointApprox: z.boolean(),
  floating: z.boolean(),
  offshore: z.boolean(),
  operator: z.string().optional(),
  owners: z.array(z.object({ name: z.string(), sharePct: z.number().optional() })).optional(),
  capacityMtpa: z.object({ operating: z.number().nonnegative(), planned: z.number().nonnegative() }),
  units: z
    .array(
      z.object({
        name: z.string().optional(),
        status: evidenceSchema.shape.status,
        capacityMtpa: z.number().positive().optional(),
        startYear: z.number().int().optional(),
      }),
    )
    .min(1),
  evidence: z.array(evidenceSchema).min(1),
});

export const curatedLngEvidenceSchema = z.object({
  id: z.string().regex(/^gem-[a-z0-9-]+$/),
  evidence: z.array(evidenceSchema.extend({ sourceType: z.enum(['operator', 'regulator', 'government', 'press']) })).min(1),
});

export const disruptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  assetKind: z.enum(['pipeline', 'chokepoint', 'lng']),
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
  owners: z
    .object({
      list: z.array(z.object({ name: z.string().min(1), sharePct: z.number().positive().optional() })).min(1),
      source: pageRefSchema,
    })
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
