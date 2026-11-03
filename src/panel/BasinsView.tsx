import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { formatCountry, formatShare, formatThousandfold } from '../lib/format';
import { basinsSummary, basinViewRows } from '../lib/summary';
import type { Basin } from '../types';
import { SourceLink } from './details';
import { Info } from './Info';

/** The basins view: every mapped oil and gas province, the most oil remaining (as of 2000) first. */
export function BasinsView({ data, onSelect }: { data: Datasets; onSelect: (selection: Selection) => void }) {
  const rows = useMemo(() => basinViewRows(data.basins), [data]);
  const total = useMemo(() => basinsSummary(data.basins), [data]);
  return (
    <>
      <section className="section">
        <div className="title-row">
          <h2 className="detail__title">Basins</h2>
          <Info label="About this list">
            Oil and gas provinces from the USGS World Petroleum Assessment 2000. Ordered by oil remaining in fields
            discovered by 1996, in billion barrels; nothing produced or found since is counted. Provinces with no oil
            figure, the United States among them, come last.
          </Info>
        </div>
        {total && (
          <p className="view-headline">
            {total.provinces} provinces hold {formatThousandfold(total.oil)} billion barrels of oil in fields found by 1996 (USGS,
            2000). The {total.top} largest hold {formatShare(total.topShare)}.
          </p>
        )}
      </section>
      <ul className="view-list view-list--cards" aria-label="Basins">
        {rows.map((basin) => (
          <li key={basin.id}>
            <BasinRow basin={basin} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      <p className="source">
        Outlines and volumes from the{' '}
        <SourceLink href="https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3">
          USGS World Petroleum Assessment 2000
        </SourceLink>
        .
      </p>
    </>
  );
}

function BasinRow({ basin, onSelect }: { basin: Basin; onSelect: (selection: Selection) => void }) {
  const oil = basin.volumes?.oil.remaining ?? null;
  const gas = basin.volumes?.gas.remaining ?? null;
  const countries = basin.countries.length ? basin.countries.map(formatCountry).sort().join(', ') : 'Offshore';
  return (
    <button type="button" className="view-row" onClick={() => onSelect({ kind: 'basin', id: basin.id })}>
      <span className="view-row__head">
        <span className="view-row__name">{basin.name}</span>
        <span className="view-row__figure">
          <span className="view-row__value">{oil !== null ? formatThousandfold(oil) : <span className="muted">n/a</span>}</span>
          <span className="view-row__unit">{oil !== null ? 'billion barrels of oil' : 'no oil figure'}</span>
        </span>
      </span>
      <span className="view-row__facts">
        {gas !== null && (
          <span>
            <strong>{formatThousandfold(gas)}</strong> trillion ft³ of gas
          </span>
        )}
        <span>USGS, as of 2000</span>
      </span>
      <span className="view-row__meta">{countries}</span>
    </button>
  );
}
