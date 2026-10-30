import { useMemo } from 'react';
import { MagnifyingGlassIcon } from '@phosphor-icons/react';
import type { Selection } from '../app/urlState';
import { REGION_FUELS, REGION_FUEL_LABELS, type RegionFuel } from '../lib/config';
import { originsByRegion, type Datasets } from '../lib/data';
import { SourceLink } from './details';

export interface OriginsViewProps {
  data: Datasets;
  fuel: RegionFuel;
  onFuel: (fuel: RegionFuel) => void;
  /** Opens search on US places, to find a region by ZIP code, city or state. */
  onFind: () => void;
  onSelect: (selection: Selection, fuel?: RegionFuel) => void;
}

const TOP = 3;
const share = (value: number) => `${Math.round(value * 100)}%`;

/**
 * The fuel origins surface: find your US fuel region, or pick one of the five, for the fuel the switch
 * shows. Each region lists its largest sources; opening one shows the full breakdown on that fuel.
 */
export function OriginsView({ data, fuel, onFuel, onFind, onSelect }: OriginsViewProps) {
  const regions = useMemo(() => originsByRegion(data, fuel), [data, fuel]);
  const noun = fuel === 'crude' ? 'crude oil' : REGION_FUEL_LABELS[fuel].toLowerCase();

  return (
    <>
      <section className="section">
        <h2 className="detail__title">Fuel origins</h2>
        <p className="section__lede">
          Where the fuel used in each US fuel region comes from: other regions, imports by country, and what's made or
          pumped there.
        </p>
        <button type="button" className="find-region" onClick={onFind}>
          <MagnifyingGlassIcon size={18} aria-hidden="true" />
          Find your region by ZIP code, city or state
        </button>
      </section>

      <section className="section">
        <div className="fuel-switch" role="group" aria-label="Fuel">
          {REGION_FUELS.map((f) => (
            <button key={f} type="button" className="chip" aria-pressed={f === fuel} onClick={() => onFuel(f)}>
              {REGION_FUEL_LABELS[f]}
            </button>
          ))}
        </div>
        {regions.length === 0 ? (
          <p className="muted">No data for {noun}.</p>
        ) : (
          <ul className="view-list" aria-label="US fuel regions">
            {regions.map(({ region, rows }) => {
              return (
                <li key={region.id}>
                  <button type="button" className="view-row" onClick={() => onSelect({ kind: 'region', id: region.id }, fuel)}>
                    <span className="view-row__name">{region.name}</span>
                    {/* Spans, not a list: a button holds phrasing content only. */}
                    <span className="origin-tops">
                      {rows.slice(0, TOP).map((row) => (
                        <span key={row.key} className="origin-tops__row">
                          <span className="origin-tops__label">{row.label}</span>
                          <span className="origin-tops__bar" aria-hidden="true">
                            <span style={{ width: `${Math.min(100, row.share * 100)}%` }} />
                          </span>
                          <span className="mono num">{share(row.share)}</span>
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <p className="source">
        Monthly supply by region from the <SourceLink href="https://www.eia.gov/opendata/">US Energy Information
        Administration</SourceLink>, averaged over the latest months it reports.
      </p>
    </>
  );
}
