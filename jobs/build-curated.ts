// Publishes hand-curated files from data/curated/ to public/data/, validated.
// Run after editing a curated file, or after npm run import:gem: npm run build:curated
//
// - disruptions.json goes out as is.
// - pipelines-evidence.json is merged with GEM rows (data/derived/gem-pipelines.json) into
//   public/data/pipelines.json. Every merge is logged in data/reports/dedup.json for review.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { ENTSOG, entsogSeriesId } from '../src/lib/config';
import type { DatasetMeta, Pipeline } from '../src/types';
import { mergePipelines, type CuratedPipeline } from './lib/curated-pipelines';
import { publishDataset, report, sha256File, validateRecords } from './lib/output';
import { curatedPipelineSchema, disruptionSchema, pipelineSchema } from './lib/schemas';

const CURATED_PIPELINES = 'data/curated/pipelines-evidence.json';
const GEM_PIPELINES = 'data/derived/gem-pipelines.json';
const DEDUP_REPORT = 'data/reports/dedup.json';

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
