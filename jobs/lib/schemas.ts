// zod schemas for everything the jobs publish. A file is only replaced when its new contents pass.

import { z } from 'zod';
import { EIA } from '../../src/lib/config';

const isoDate = z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/);
const lonLat = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);
const position = z.array(z.number()).min(2);

export const observationSeriesSchema = z.object({
  id: z.string().min(1),
  metric: z.enum(['tanker_transits', 'tanker_port_calls', 'tanker_cargo_t', 'tanker_exports_t', 'gas_flow_kwh_d', 'storage_fill_pct', 'lng_sendout_kwh_d']),
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
  system: z.string().min(1).optional(),
  commodity: z.enum(['gas', 'oil', 'products', 'ngl']),
  fromCountry: z.string(),
  toCountry: z.string(),
  transitCountries: z.array(z.string()),
  operator: z.string().optional(),
  owners: z.array(z.object({ name: z.string(), sharePct: z.number().optional() })).optional(),
  capacity: z.object({ value: z.number().positive(), unit: z.enum(['bcm/yr', 'mb/d']) }).optional(),
  capacitySource: z.union([sourceRefSchema, pageRefSchema]).optional(),
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
  sendOutSeriesId: z.string().optional(),
});

export const curatedLngEvidenceSchema = z.object({
  id: z.string().regex(/^gem-[a-z0-9-]+$/),
  evidence: z.array(evidenceSchema.extend({ sourceType: z.enum(['operator', 'regulator', 'government', 'press']) })).min(1),
});

/** A curated oil terminal. Its claims must link a source, and can't pose as dataset or measured. */
export const oilTerminalSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  name: z.string().min(1),
  aliases: z.array(z.string()),
  role: z.enum(['export', 'import']),
  country: z.string().regex(/^[A-Z]{2}$/),
  point: lonLat,
  pointSource: z.object({ publisher: z.string().min(1), detail: z.string().min(1) }),
  pointApprox: z.boolean().optional(),
  operator: z.string().min(1).optional(),
  pipelineIds: z.array(z.string().min(1)),
  exitVia: z.array(z.enum(['hormuz', 'malacca', 'suez', 'babelm', 'danish', 'turkish', 'panama'])),
  throughput: z
    .object({ value: z.number().positive(), unit: z.literal('mb/d'), period: z.string().min(1), source: sourceRefSchema })
    .optional(),
  portwatchId: z.string().regex(/^port\d+$/).optional(),
  evidence: z.array(
    evidenceSchema.extend({
      sourceType: z.enum(['operator', 'regulator', 'government', 'press']),
      statement: z.string().min(1),
      url: z.string().url(),
    }),
  ),
});

export const disruptionSchema = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*$/),
  assetKind: z.enum(['pipeline', 'chokepoint', 'lng', 'terminal']),
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
  system: z.string().min(1).optional(),
  commodity: z.enum(['gas', 'oil', 'products', 'ngl']),
  fromCountry: z.string().regex(/^[A-Z]{2}$/),
  toCountry: z.string().regex(/^[A-Z]{2}$/),
  transitCountries: z.array(z.string().regex(/^[A-Z]{2}$/)),
  gem: z.array(z.string().regex(/^gem-/)),
  autoMatch: z.boolean().optional(),
  exclude: z.array(z.string()).optional(),
  capacity: z
    .object({
      value: z.number().positive(),
      unit: z.enum(['bcm/yr', 'mb/d']),
      source: z.union([sourceRefSchema, pageRefSchema]),
    })
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

export const countryRegionSchema = z.object({
  id: z.string().regex(/^[A-Z]{2}$/),
  name: z.string().min(1),
  region: z.string().min(1),
});

const paddRef = z.enum(['padd-1', 'padd-2', 'padd-3', 'padd-4', 'padd-5']);
const kbbl = z.number().finite().min(0);
/** Imports by partner: a country's ISO code, or EIA.unnamedPartner for what EIA's total holds beyond them. */
const importsList = z.array(
  z.object({ code: z.union([z.string().regex(/^[A-Z]{3}$/), z.literal(EIA.unnamedPartner)]), name: z.string().min(1), kbbl }),
);

export const oilOriginRegionSchema = z.object({
  id: paddRef,
  name: z.string().min(1),
  months: z
    .array(
      z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        refineryInput: kbbl,
        imports: importsList,
        receipts: z.array(z.object({ from: paddRef, kbbl, pipeline: kbbl, tankerBarge: kbbl, rail: kbbl })),
        production: z.array(z.object({ area: z.string().min(1), kbbl })),
      }),
    )
    .min(12),
  capacity: z
    .object({ asOf: z.string().regex(/^\d{4}$/), refineries: z.number().int().positive(), barrelsPerCalendarDay: z.number().positive() })
    .optional(),
});


const receiptsList = z.array(z.object({ from: paddRef, kbbl, pipeline: kbbl, tankerBarge: kbbl, rail: kbbl }));

export const fuelOriginRegionSchema = z.object({
  id: z.string().regex(/^padd-[1-5]\/(gasoline|diesel|jet)$/),
  region: paddRef,
  fuel: z.enum(['gasoline', 'diesel', 'jet']),
  months: z
    .array(
      z.object({
        period: z.string().regex(/^\d{4}-\d{2}$/),
        supplied: kbbl,
        imports: importsList,
        receipts: receiptsList,
        ethanol: z.object({ receipts: receiptsList, imports: importsList }).optional(),
      }),
    )
    .min(12),
});

export const usLookupSchema = z.object({
  states: z.array(z.string().min(1)).min(50),
  zipRanges: z.array(z.tuple([z.number().int().min(0), z.number().int().max(99999), z.number().int().min(0)])).min(50),
  cities: z.array(z.object({ name: z.string().min(1), state: z.string().min(1) })).min(100),
  hubs: z.record(paddRef, lonLat),
  countryPoints: z.record(z.string().regex(/^[A-Z]{3}$/), lonLat),
});

/** A curated export route for one country: the terminals its crude can leave from, with sources. */
export const oilRouteSchema = z.object({
  country: z.string().regex(/^[A-Z]{3}$/),
  terminals: z.array(z.string().min(1)).min(1),
  note: z.string().min(1),
  sources: z.array(sourceRefSchema).min(1),
});
