import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { formatCountry, formatDate, formatNumber } from '../lib/format';
import { median, storageRows, type StorageRow } from '../lib/summary';
import { SourceLink } from './details';

const pts = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)} pts`;

/**
 * The gas storage surface: each country AGSI+ reports, furthest below last year first, with its fill
 * against the same date last year. The map shows the storage fill.
 */
export function StorageView({ data, onSelect }: { data: Datasets; onSelect: (selection: Selection) => void }) {
  const rows = useMemo(() => storageRows(data), [data]);
  const gaps = rows.flatMap((r) => (r.vsLastYear === null ? [] : [r.vsLastYear]));
  const below = gaps.filter((g) => g < 0).length;
  const medianGap = median(gaps);
  const latest = rows.map((r) => r.latestDate).sort().at(-1);

  return (
    <>
      <section className="section">
        <h2 className="detail__title">Gas storage</h2>
        <p className="section__lede">
          How full each country's gas storage is, as a share of its working capacity, against the same date last year.
          Furthest below last year first.
        </p>
        {gaps.length > 0 && (
          <p className="storage-headline">
            <span className="mono">{below}</span> of <span className="mono">{gaps.length}</span> countries below last
            year{medianGap !== null && <>, median gap <span className="mono">{pts(medianGap)}</span></>}
            {latest && (
              <>
                {' '}
                on <span className="mono">{formatDate(latest)}</span>
              </>
            )}
            .
          </p>
        )}
      </section>

      <section className="section">
        {rows.length === 0 ? (
          <p className="muted">No storage data.</p>
        ) : (
          <ul className="view-list" aria-label="Gas storage by country">
            {rows.map((row) => (
              <li key={row.country}>
                <StorageItem row={row} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="source">
        Storage fill is from <SourceLink href="https://agsi.gie.eu/">GIE AGSI+</SourceLink>, reported daily by storage
        operators.
      </p>
    </>
  );
}

function StorageItem({ row, onSelect }: { row: StorageRow; onSelect: (selection: Selection) => void }) {
  const label = formatCountry(row.country);
  return (
    <button type="button" className="view-row" onClick={() => onSelect(row.selection)}>
      <span className="view-row__head">
        <span className="view-row__name">{label}</span>
        <span className="view-row__figure mono">{formatNumber(row.fill, 1)}%</span>
      </span>
      <FillBar fill={row.fill} lastYear={row.lastYearFill} label={label} />
      <span className="view-row__meta">
        <span className="mono">{row.vsLastYear !== null ? `${pts(row.vsLastYear)} vs last year` : 'No point last year'}</span>
        {row.change7d !== null && <span className="mono">{pts(row.change7d)} in 7 days</span>}
      </span>
    </button>
  );
}

/** Fill as a bar from empty to full, with a tick where it stood on the same date last year. */
function FillBar({ fill, lastYear, label }: { fill: number; lastYear: number | null; label: string }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return (
    <span
      className="fill-bar"
      role="img"
      aria-label={`${label}: ${formatNumber(fill, 1)}% full${lastYear !== null ? `, ${formatNumber(lastYear, 1)}% a year ago` : ''}`}
    >
      <span className="fill-bar__fill" style={{ width: `${clamp(fill)}%` }} />
      {lastYear !== null && <span className="fill-bar__tick" style={{ left: `${clamp(lastYear)}%` }} />}
    </span>
  );
}
