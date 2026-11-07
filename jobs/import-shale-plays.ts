// Manual import (SPEC M12 phase 1): EIA's tight oil and shale gas play outlines -> public/data/shale-plays.json.
// Source: https://www.eia.gov/maps/map_data/TightOil_ShaleGas_Plays_Lower48_EIA.zip (layer
// ShalePlays_US_EIA_Dec2021, listed on https://www.eia.gov/maps/oil-naturalgas.php), public domain: the
// metadata's use limits read "None (public use)". Put the zip in data/raw/eia/ and unzip it into
// data/raw/eia/shale-plays/, then: npm run import:shale-plays (after import:basins, which it joins to).
// Each play is tagged with the USGS province it overlaps most, and with its EIA formation where
// SHALE.formations names it.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import mapshaper from 'mapshaper';
import type { FeatureCollection, MultiPolygon, Polygon } from 'geojson';
import { SHALE } from '../src/lib/config';
import type { Basin } from '../src/types';
import { publishDataset, report, sha256File } from './lib/output';
import { missingPlays, toShalePlay, type EiaPlayProps } from './lib/shale';
import { shalePlaySchema } from './lib/schemas';

const ZIP = 'data/raw/eia/TightOil_ShaleGas_Plays_Lower48_EIA.zip';
const SHP = 'data/raw/eia/shale-plays/ShalePlays_US_EIA_Dec2021.shp';
const REPORT_PATH = 'data/reports/import-shale-plays.json';
const SIMPLIFY = '10%';

const result = await publishDataset({
  id: 'shale-plays',
  schema: shalePlaySchema,
  produce: async () => {
    const basins = JSON.parse(await readFile('public/data/basins.json', 'utf8')) as Basin[];
    const provinces: FeatureCollection = {
      type: 'FeatureCollection',
      features: basins.map((b) => ({ type: 'Feature', properties: { CODE: b.code }, geometry: b.geometry })),
    };
    const output = await mapshaper.applyCommands(
      [
        `-i ${SHP} name=plays`,
        // Before simplifying, so the province is the one the whole outline overlaps most.
        `-join provinces.json largest-overlap min-overlap-pct=${SHALE.minProvinceOverlap} fields=CODE`,
        `-simplify ${SIMPLIFY} keep-shapes`,
        `-each 'lx=this.innerX, ly=this.innerY'`,
        '-filter-fields ID,Shale_play,Basin,Lithology,Age_shale,Area_sq_km,References,lx,ly,CODE',
        '-o out.json format=geojson precision=0.001',
      ].join(' '),
      { 'provinces.json': provinces },
    );
    const collection = JSON.parse(String(output['out.json'])) as FeatureCollection<Polygon | MultiPolygon, EiaPlayProps>;
    const ids = collection.features.map((f) => f.properties.ID);
    const missing = missingPlays(ids);
    if (missing.length) throw new Error(`SHALE.formations names outlines the shapefile doesn't have: ${missing.join(', ')}`);
    const plays = collection.features
      .map((f) => toShalePlay(f.properties, f.geometry))
      .sort((a, b) => b.areaKm2 - a.areaKm2);
    await mkdir('data/reports', { recursive: true });
    await writeFile(
      REPORT_PATH,
      JSON.stringify(
        {
          recordedAt: new Date().toISOString().slice(0, 10),
          plays: plays.length,
          withFormation: plays.filter((p) => p.formation).length,
          // Outlines EIA draws but reports no formation figure for, or whose coverage isn't confirmed.
          withoutFormation: plays.filter((p) => !p.formation).map((p) => `${p.name} (${p.basin}, ${p.id})`),
          withoutProvince: plays.filter((p) => !p.provinceId).map((p) => `${p.name} (${p.basin}, ${p.id})`),
        },
        null,
        2,
      ) + '\n',
    );
    return {
      records: plays,
      meta: {
        sourceUrl: SHALE.sourcePage,
        sourceVersion: `EIA ShalePlays_US_EIA_Dec2021 (released 2019-10-08, updated December 2021); ${ZIP.split('/').pop()} sha256:${await sha256File(ZIP)}; simplified ${SIMPLIFY}; provinces joined from basins.json`,
        license: 'Public domain (EIA; use limits: none)',
      },
    };
  },
});
report(result, 'shale-plays');
