import { useMemo } from 'react';
import { MeterBar } from '../ui/Bar';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { Selection } from '../app/urlState';
import { CRUDE_IMPORTS, REGION_FUEL_LABELS, type RegionFuel } from '../lib/config';
import { countryOrigins, crudeImportList, importPeriod, topSuppliers, topSuppliersLine } from '../lib/crudeImports';
import { originsByRegion, type Datasets } from '../lib/data';
import { flagEmoji, formatCountry, formatShare } from '../lib/format';
import { CrudeImportsSource, SourceLink } from './details';
import { FuelTabs } from './FuelTabs';
import { Info } from './Info';
import { SectionTitle } from '../ui/SectionTitle';
import { Note } from '../ui/Note';
import { cardClass } from '../ui/Card';

export interface OriginsViewProps {
  data: Datasets;
  fuel: RegionFuel;
  onFuel: (fuel: RegionFuel) => void;
  /** Opens search on US places, to find a region by ZIP code, city or state. */
  onFind: () => void;
  onSelect: (selection: Selection, fuel?: RegionFuel) => void;
}

const TOP = 3;

/** A share's bar, against the card's largest, so the top rows compare at a glance. */
/** A row's bar, scaled to the card's largest share so the bars compare the rows. */
const barShare = (share: number, top: number) => (top > 0 ? share / top : 0);
const SOURCE_NAME = { eurostat: 'Eurostat', comtrade: 'UN Comtrade', eia: 'EIA' } as const;

/**
 * The oil origins surface (SPEC M10): where each large importer's crude comes from, largest importer
 * first, then the US by fuel region (M6, M7): find your region, or pick one of the five, for the fuel
 * the switch shows.
 */
export function OriginsView({ data, fuel, onFuel, onFind, onSelect }: OriginsViewProps) {
  const regions = useMemo(() => originsByRegion(data, fuel), [data, fuel]);
  const countries = useMemo(() => crudeImportList(data).map((record) => countryOrigins(record)), [data]);
  const leaders = useMemo(() => topSuppliersLine(topSuppliers(data.crudeImports)), [data]);
  const noun = fuel === 'crude' ? 'crude oil' : REGION_FUEL_LABELS[fuel].toLowerCase();

  return (
    <>
      <section className="section">
        <SectionTitle title="Oil origins" level="page">
          <Info label="About this list">
            Where each country's crude oil imports come from, by partner country, for the {CRUDE_IMPORTS.largest} largest importers and
            every country Eurostat reports. Largest importer by value first. Crude produced at home isn't counted.
          </Info>
        </SectionTitle>
        {leaders && <p className="view-headline">Largest supplier to the most importers: {leaders}.</p>}
        {countries.length === 0 ? (
          <p className="muted">No crude import data.</p>
        ) : (
          <ul className="view-list view-list--cards" aria-label="Crude imports by country">
            {countries.map(({ record, rows }) => (
              <li key={record.id}>
                <button type="button" className={cardClass({ interactive: true, className: 'view-row' })} onClick={() => onSelect({ kind: 'country', id: record.id.toLowerCase() })}>
                  <span className="stat-card__name">
                    {flagEmoji(record.id) && <span aria-hidden="true">{flagEmoji(record.id)} </span>}
                    {formatCountry(record.id)}
                  </span>
                  <span className="origin-tops">
                    {rows.slice(0, TOP).map((row) => (
                      <span key={row.key} className="origin-tops__row">
                        <span className="origin-tops__label">{row.label}</span>
                        <span className="origin-tops__bar">
                          <MeterBar value={barShare(row.share, rows[0]!.share)} tone="muted" size="md" />
                        </span>
                        <span className="origin-tops__share">{formatShare(row.share)}</span>
                      </span>
                    ))}
                  </span>
                  <span className="view-row__meta">
                    <span>
                      {SOURCE_NAME[record.source]}, <span className="mono">{importPeriod(record)}</span>
                      {record.basis === 'value' && ', by value'}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section">
        <SectionTitle title="United States, by fuel region" />
        <button type="button" className="find-region" onClick={onFind}>
          <MagnifyingGlassIcon size={18} aria-hidden="true" />
          Find your region by ZIP code, city or state
        </button>
      </section>

      <section className="section">
        <FuelTabs fuel={fuel} onFuel={onFuel}>
          {regions.length === 0 ? (
            <p className="muted">No data for {noun}.</p>
          ) : (
            <ul className="view-list view-list--cards" aria-label="US fuel regions">
              {regions.map(({ region, rows }) => {
                return (
                  <li key={region.id}>
                    <button type="button" className={cardClass({ interactive: true, className: 'view-row' })} onClick={() => onSelect({ kind: 'region', id: region.id }, fuel)}>
                      <span className="view-row__name">{region.name}</span>
                      {/* Spans, not a list: a button holds phrasing content only. */}
                      <span className="origin-tops">
                        {rows.slice(0, TOP).map((row) => (
                          <span key={row.key} className="origin-tops__row">
                            <span className="origin-tops__label">{row.label}</span>
                            <span className="origin-tops__bar">
                          <MeterBar value={barShare(row.share, rows[0]!.share)} tone="muted" size="md" />
                        </span>
                            <span className="origin-tops__share">{formatShare(row.share)}</span>
                          </span>
                        ))}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </FuelTabs>
      </section>

      {(['eurostat', 'comtrade'] as const).map((source) => {
        const record = countries.find((c) => c.record.source === source)?.record;
        return record ? <CrudeImportsSource key={source} record={record} /> : null;
      })}
      <Note kind="source">
        Monthly supply by region from the <SourceLink href="https://www.eia.gov/opendata/">US Energy Information
        Administration</SourceLink>, averaged over the latest months it reports.
      </Note>
    </>
  );
}
