// Weekly (.github/workflows/eia-release.yml): is EIA's Refinery Capacity Report newer than the one the US
// refineries were imported from? Prints the answer and, on GitHub Actions, writes `newer=<year>` to the step's
// output, so the workflow can open an issue. The import itself stays manual (npm run import:refineries-us).

import { appendFile, readFile } from 'node:fs/promises';
import { REFINERIES } from '../src/lib/config';
import { importedRefcapYear, newestRefcapYear } from './lib/eiaRelease';

const meta = JSON.parse(await readFile('data/derived/meta/refineries-us.json', 'utf8')) as { sourceVersion: string };
const imported = importedRefcapYear(meta.sourceVersion);
if (!imported) throw new Error(`no refcapNN.xlsx in data/derived/meta/refineries-us.json: ${meta.sourceVersion}`);

const response = await fetch(REFINERIES.eiaPage, {
  headers: { 'user-agent': 'Mozilla/5.0 (compatible; petro-sprawl release check)' },
  signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error(`EIA refinery capacity page responded ${response.status}`);
const newest = newestRefcapYear(await response.text());
if (!newest) throw new Error(`EIA's page links no refcapNN.xlsx or archive year: ${REFINERIES.eiaPage}`);

console.log(`eia-refineries: imported ${imported}, EIA's newest ${newest}`);
if (newest > imported && process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, `newer=${newest}\n`);
