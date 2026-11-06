import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { formatCountry, formatShare, formatThousandfold } from '../lib/format';
import { basinOilParts, basinsSummary, basinViewRows, type BasinOilPart } from '../lib/summary';
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
        <OilKey />
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
    <button type="button" className="view-row stat-card" onClick={() => onSelect({ kind: 'basin', id: basin.id })}>
      <span className="stat-card__head">
        <span className="stat-card__name">{basin.name}</span>
        <span className="stat-card__figure">
          <span className="stat-card__value">{oil !== null ? formatThousandfold(oil) : <span className="muted">n/a</span>}</span>
          <span className="stat-card__unit">{oil !== null ? 'billion barrels of oil' : 'no oil figure'}</span>
        </span>
      </span>
      <OilBar basin={basin} />
      <span className="stat-card__details">
        {gas !== null && (
          <span className="view-row__facts">
            <span>
              <strong>{formatThousandfold(gas)}</strong> trillion ft³ of gas
            </span>
          </span>
        )}
        <span className="view-row__facts stat-card__notes">
          <span>{countries}</span>
          <span>USGS, as of 2000</span>
        </span>
      </span>
    </button>
  );
}

const OIL_PART_LABEL: Record<BasinOilPart, string> = {
  produced: 'Produced',
  remaining: 'Remaining in fields found by 1996',
  undiscovered: 'Undiscovered (estimate)',
};

const OIL_PART_KEY: Record<BasinOilPart, string> = { produced: 'Produced', remaining: 'Remaining', undiscovered: 'Undiscovered' };

/** What each shade of the cards' bars is, once above the list. */
export function OilKey() {
  return (
    <ul className="oil-key" aria-label="Oil bar key">
      {(Object.keys(OIL_PART_KEY) as BasinOilPart[]).map((part) => (
        <li key={part}>
          <span className={`oil-key__swatch oil-bar__part--${part}`} aria-hidden="true" />
          {OIL_PART_KEY[part]}
        </li>
      ))}
    </ul>
  );
}

/**
 * A basin's oil as assessed in 2000, produced, remaining and undiscovered, as one bar, each part named with
 * its figure on hover. A rule where any of the three is missing.
 */
export function OilBar({ basin }: { basin: Basin }) {
  const parts = basinOilParts(basin);
  if (!parts) return <span className="stat-card__rule" aria-hidden="true" />;
  let start = 0;
  return (
    <span
      className="oil-bar"
      role="img"
      aria-label={`Oil, as assessed in 2000: ${parts.map((p) => `${formatThousandfold(p.value)} billion barrels ${p.part}`).join(', ')}`}
    >
      {parts.map((p) => {
        // The tip is centred on its part, slid along so it never runs past either end of the bar.
        const centre = start + p.share / 2;
        start += p.share;
        if (p.share === 0) return null;
        return (
          <span key={p.part} className="oil-bar__slot" style={{ flexBasis: `${p.share}%` }}>
            <span className={`oil-bar__part oil-bar__part--${p.part}`} />
            <span className="fill-bar__tip oil-bar__tip" style={{ left: `${centre}%`, translate: `-${centre}% 0` }} aria-hidden="true">
              {OIL_PART_LABEL[p.part]} <span className="fill-bar__tip-date">{formatThousandfold(p.value)} bn bbl</span>
            </span>
          </span>
        );
      })}
    </span>
  );
}
