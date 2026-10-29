// "Where is my fuel from?" (SPEC M7): shares of the gasoline, diesel or jet fuel a PADD used, by where it
// came from, from EIA monthly data. Pure; the panel and the map read the result.

import type { FuelOriginRegion, PaddRef } from '../types';
import { EIA, PADDS } from './config';
import { daysInMonth, MODES, pct, sumBy, type OriginRow } from './oilOrigins';

export interface FuelOrigins {
  from: string;
  to: string;
  months: number;
  /** What the region used (EIA product supplied), barrels a day over the window. */
  suppliedPerDay: number;
  /** Received from other regions and imported, ethanol included. */
  inflowPerDay: number;
  /**
   * What the shares are of: what the region used, or, when more flowed in than it used (it passes fuel
   * on), what flowed in. The view says which.
   */
  basis: 'supplied' | 'inflow';
  rows: OriginRow[];
}

const regionName = (id: string) => PADDS.find((p) => p.id === id)?.name ?? id;

/** "Mostly by pipeline (92%)" for the largest of the mode splits, or null when EIA gives none. */
function modeDetail(receipts: FuelOriginRegion['months'][number]['receipts'], kbbl: number): string | null {
  const modes = MODES.map(([key, label]) => [label, receipts.reduce((a, r) => a + r[key], 0)] as const).sort((a, b) => b[1] - a[1]);
  const [label, main] = modes[0]!;
  return main > 0 ? `Mostly by ${label} (${pct(main, kbbl)})` : null;
}

/**
 * One fuel in one PADD over its last `windowMonths` months: receipts from each other PADD, imports by
 * country and (for gasoline) the ethanol blended in, as shares of what the region used. The rest is
 * local refining, blending and stock changes; it is shown as such, never as a measured flow.
 */
export function fuelOrigins(
  record: FuelOriginRegion,
  { windowMonths = EIA.windowMonths, minShare = EIA.minShare }: { windowMonths?: number; minShare?: number } = {},
): FuelOrigins | null {
  const months = record.months.slice(-windowMonths);
  if (months.length < windowMonths) return null;
  const days = months.reduce((a, m) => a + daysInMonth(m.period), 0);
  const supplied = months.reduce((a, m) => a + m.supplied, 0);

  const imports = months.flatMap((m) => m.imports);
  const names = new Map(imports.map((i) => [i.code, i.name]));
  const byCountry = [...sumBy(imports, (i) => i.code, (i) => i.kbbl)].sort((a, b) => b[1] - a[1]);
  const receipts = months.flatMap((m) => m.receipts);
  const byRegion = [...sumBy(receipts, (r) => r.from, (r) => r.kbbl)].sort((a, b) => b[1] - a[1]);
  const ethanolReceipts = months.flatMap((m) => m.ethanol?.receipts ?? []);
  const ethanolImported = months.flatMap((m) => m.ethanol?.imports ?? []).reduce((a, i) => a + i.kbbl, 0);
  const ethanol = ethanolReceipts.reduce((a, r) => a + r.kbbl, 0) + ethanolImported;

  const inflow = byCountry.reduce((a, [, v]) => a + v, 0) + byRegion.reduce((a, [, v]) => a + v, 0) + ethanol;
  const rest = supplied - inflow;
  const basis = rest >= 0 ? 'supplied' : 'inflow';
  const total = basis === 'supplied' ? supplied : inflow;
  if (total <= 0) return null;

  const rows: OriginRow[] = [];
  for (const [from, kbbl] of byRegion) {
    rows.push({
      key: `region/${from}`,
      kind: 'region',
      label: regionName(from),
      detail: modeDetail(receipts.filter((r) => r.from === from), kbbl),
      kbbl,
      share: kbbl / total,
      padd: from as PaddRef,
    });
  }
  let otherKbbl = 0;
  let otherCount = 0;
  for (const [code, kbbl] of byCountry) {
    if (kbbl / total < minShare) {
      otherKbbl += kbbl;
      otherCount += 1;
      continue;
    }
    rows.push({ key: `country/${code}`, kind: 'country', label: names.get(code) ?? code, detail: 'Imported', kbbl, share: kbbl / total, code });
  }
  if (ethanol > 0) {
    const [mainFrom, mainKbbl] = [...sumBy(ethanolReceipts, (r) => r.from, (r) => r.kbbl)].sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
    const detail =
      mainFrom && mainKbbl >= ethanolImported
        ? [`Mostly from the ${regionName(mainFrom)} (${pct(mainKbbl, ethanol)})`, modeDetail(ethanolReceipts.filter((r) => r.from === mainFrom), mainKbbl)?.replace(/^Mostly /, '')]
            .filter(Boolean)
            .join(', ')
        : `Mostly imported (${pct(ethanolImported, ethanol)})`;
    rows.push({ key: 'ethanol', kind: 'ethanol', label: 'Ethanol, blended in', detail, kbbl: ethanol, share: ethanol / total });
  }
  if (basis === 'supplied' && rest > 0) {
    rows.push({
      key: 'own',
      kind: 'own',
      label: 'Made in the region or drawn from stocks',
      detail: 'What the region used beyond what came in: its own refineries and blending, and changes in stocks',
      kbbl: rest,
      share: rest / total,
    });
  }
  rows.sort((a, b) => b.kbbl - a.kbbl);
  if (otherKbbl > 0) {
    rows.push({
      key: 'other',
      kind: 'other',
      label: `${otherCount} other ${otherCount === 1 ? 'country' : 'countries'}`,
      detail: `Each under ${Math.round(minShare * 100)}%`,
      kbbl: otherKbbl,
      share: otherKbbl / total,
    });
  }

  return {
    from: months[0]!.period,
    to: months.at(-1)!.period,
    months: months.length,
    suppliedPerDay: (supplied * 1000) / days,
    inflowPerDay: (inflow * 1000) / days,
    basis,
    rows,
  };
}
