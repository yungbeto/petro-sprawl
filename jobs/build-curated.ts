// Publishes hand-curated files from data/curated/ to public/data/, validated.
// Run after editing a curated file, or after npm run import:gem: npm run build:curated
//
// - disruptions.json goes out as is.
// - pipelines-evidence.json is merged with GEM rows (data/derived/gem-pipelines.json) into
//   public/data/pipelines.json. Every merge is logged in data/reports/dedup.json for review.
// - lng-evidence.json adds cited claims to GEM terminals (data/derived/gem-lng-terminals.json) in
//   public/data/lng-terminals.json.
// - oil-terminals.json goes out with its links checked against the published pipelines and disruptions.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ALSI, ENTSOG, alsiSeriesId, entsogSeriesId } from '../src/lib/config';
import type { DatasetMeta, Disruption, LngTerminal, OilTerminal, Pipeline } from '../src/types';
import { linkSendOut, mergeLngEvidence, type CuratedLngEvidence } from './lib/curated-lng';
import { mergePipelines, type CuratedPipeline } from './lib/curated-pipelines';
import { prepareTerminals } from './lib/curated-terminals';
import { publishDataset, report, sha256File, validateRecords } from './lib/output';
import {
  curatedLngEvidenceSchema,
  curatedPipelineSchema,
  disruptionSchema,
  lngTerminalSchema,
  oilRouteSchema,
  oilTerminalSchema,
  pipelineSchema,
} from './lib/schemas';

const CURATED_PIPELINES = 'data/curated/pipelines-evidence.json';
const GEM_PIPELINES = 'data/derived/gem-pipelines.json';
const DEDUP_REPORT = 'data/reports/dedup.json';
const CURATED_LNG = 'data/curated/lng-evidence.json';
const GEM_LNG = 'data/derived/gem-lng-terminals.json';
const CURATED_TERMINALS = 'data/curated/oil-terminals.json';

const readJson = async <T>(path: string) => JSON.parse(await readFile(path, 'utf8')) as T;

const disruptions = await publishDataset({
  id: 'disruptions',
  schema: disruptionSchema,
  produce: async () => ({
    records: await readJson<unknown[]>('data/curated/disruptions.json'),
    meta: {
      sourceUrl: 'data/curated/disruptions.json',
      sourceVersion: 'Hand-curated; every record cites its sources',
      license: 'Ours; linked sources keep their own terms',
    },
  }),
});
report(disruptions, 'disruptions');

const pipelines = await publishDataset({
  id: 'pipelines',
  schema: pipelineSchema,
  produce: async () => {
    const curated = validateRecords(
      'pipelines-evidence',
      await readJson<unknown[]>(CURATED_PIPELINES),
      curatedPipelineSchema,
    ) as CuratedPipeline[];
    const gem = await readJson<Pipeline[]>(GEM_PIPELINES);
    const gemMeta = await readJson<DatasetMeta>('data/derived/meta/gem-pipelines.json');
    const flowLinks = new Map<string, string>(ENTSOG.points.map((p) => [p.pipelineId, entsogSeriesId(p)]));
    const merged = mergePipelines(curated, gem, flowLinks);
    const unlinked = [...flowLinks.keys()].filter((id) => !merged.pipelines.some((p) => p.id === id));
    if (merged.report.missing.length || unlinked.length) {
      throw new Error(
        `curated pipelines point at rows that don't exist: ${JSON.stringify({ missing: merged.report.missing, unlinkedFlows: unlinked })}`,
      );
    }
    await mkdir('data/reports', { recursive: true });
    await writeFile(
      DEDUP_REPORT,
      `${JSON.stringify({ recordedAt: new Date().toISOString().slice(0, 10), ...merged.report }, null, 2)}\n`,
    );
    return {
      records: merged.pipelines,
      meta: {
        sourceUrl: 'https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/',
        sourceVersion: `${gemMeta.sourceVersion}; curated ${CURATED_PIPELINES} sha256:${await sha256File(CURATED_PIPELINES)}`,
        license: 'CC BY 4.0, Global Energy Monitor; curated evidence ours, linked sources keep their own terms',
      },
    };
  },
});
report(pipelines, 'pipelines');
if (pipelines.ok) console.log(`dedup report in ${DEDUP_REPORT}`);

const lng = await publishDataset({
  id: 'lng-terminals',
  schema: lngTerminalSchema,
  produce: async () => {
    const curated = validateRecords('lng-evidence', await readJson<unknown[]>(CURATED_LNG), curatedLngEvidenceSchema) as CuratedLngEvidence[];
    const gemMeta = await readJson<DatasetMeta>('data/derived/meta/gem-lng-terminals.json');
    return {
      records: linkSendOut(
        mergeLngEvidence(curated, await readJson<LngTerminal[]>(GEM_LNG)),
        new Map(ALSI.terminals.map((t) => [t.terminalId, alsiSeriesId(t.terminalId)])),
      ),
      meta: {
        sourceUrl: 'https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/',
        sourceVersion: `${gemMeta.sourceVersion}; curated ${CURATED_LNG} sha256:${await sha256File(CURATED_LNG)}`,
        license: 'CC BY 4.0, Global Energy Monitor; curated evidence ours, linked sources keep their own terms',
      },
    };
  },
});
report(lng, 'lng-terminals');

const terminals = await publishDataset({
  id: 'oil-terminals',
  schema: oilTerminalSchema,
  produce: async () => {
    const curated = validateRecords('oil-terminals', await readJson<unknown[]>(CURATED_TERMINALS), oilTerminalSchema) as OilTerminal[];
    const pipelineIds = new Set((await readJson<Pipeline[]>('public/data/pipelines.json')).map((p) => p.id));
    return {
      records: prepareTerminals(curated, pipelineIds, await readJson<Disruption[]>('data/curated/disruptions.json')),
      meta: {
        sourceUrl: CURATED_TERMINALS,
        sourceVersion: `Hand-curated; locations from IMF PortWatch and Global Energy Monitor; sha256:${await sha256File(CURATED_TERMINALS)}`,
        license: 'Ours; linked sources keep their own terms',
      },
    };
  },
});
report(terminals, 'oil-terminals');

// Export routes for "Where is my oil from?": every terminal they name must be a published oil terminal.
const routes = await publishDataset({
  id: 'oil-routes',
  schema: oilRouteSchema,
  produce: async () => {
    const records = await readJson<{ country: string; terminals: string[] }[]>('data/curated/oil-routes.json');
    const terminalIds = new Set((await readJson<OilTerminal[]>('public/data/oil-terminals.json')).map((t) => t.id));
    const unknown = records.flatMap((r) => r.terminals.filter((t) => !terminalIds.has(t)).map((t) => `${r.country} names ${t}`));
    if (unknown.length) throw new Error(`oil routes name terminals that don't exist: ${unknown.join('; ')}`);
    return {
      records,
      meta: {
        sourceUrl: 'data/curated/oil-routes.json',
        sourceVersion: 'Hand-curated; every route cites its sources',
        license: 'Ours; linked sources keep their own terms',
      },
    };
  },
});
report(routes, 'oil-routes');
