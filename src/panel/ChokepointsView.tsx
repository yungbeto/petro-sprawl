import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { formatIndexShare, formatMbd, formatNumber } from '../lib/format';
import { chokepointViewRows, type ChokepointViewRow } from '../lib/summary';
import { Band, SourceLink } from './details';
import { MiniSparkline } from './Sparkline';

/** The chokepoints view: every strait on one page, furthest from its five-year average first. */
export function ChokepointsView({ data, onSelect }: { data: Datasets; onSelect: (selection: Selection) => void }) {
  const rows = useMemo(() => chokepointViewRows(data), [data]);
  const latest = rows.find((r) => r.transits)?.transits?.latestDate;
  return (
    <>
      <section className="section">
        <h2 className="detail__title">Chokepoints</h2>
        <p className="section__lede">
          Daily tanker transits over the 7 days to <span className="mono">{latest ?? 'n/a'}</span>, against each strait's
          five-year average (dashed). Furthest from it first.
        </p>
      </section>
      <ul className="view-list" aria-label="Chokepoints">
        {rows.map((row) => (
          <li key={row.selection.id}>
            <ChokepointRow row={row} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      <p className="source">
        Transits and cargo are from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>. Cargo is
        PortWatch's estimate, in metric tons, from each tanker's draft and size.
      </p>
    </>
  );
}

function ChokepointRow({ row, onSelect }: { row: ChokepointViewRow; onSelect: (selection: Selection) => void }) {
  const { transits, cargo } = row;
  return (
    <button type="button" className="view-row" onClick={() => onSelect(row.selection)}>
      <span className="view-row__head">
        <span className="view-row__name">{row.name}</span>
        <span className="view-row__figure">
          {transits?.indexFiveYear != null ? formatIndexShare(transits.indexFiveYear) : <span className="muted">n/a</span>}
        </span>
      </span>
      {transits ? (
        <>
          <MiniSparkline
            points={transits.sparkline}
            reference={transits.fiveYear?.mean ?? null}
            label={`Daily tanker transits at ${row.name}, last 90 days`}
          />
          <span className="view-row__meta">
            <Band band={transits.band} />
            <span>
              <span className="mono">{transits.recent ? formatNumber(transits.recent.mean, 1) : 'n/a'}</span> a day,
              five-year <span className="mono">{transits.fiveYear ? formatNumber(transits.fiveYear.mean, 1) : 'n/a'}</span>
            </span>
          </span>
          {cargo?.indexFiveYear != null && (
            <span className="view-row__meta">
              Tanker cargo at <span className="mono">{formatIndexShare(cargo.indexFiveYear)}</span> of its five-year average
            </span>
          )}
        </>
      ) : (
        <span className="view-row__meta">
          No transit data. EIA reference volume <span className="mono">{formatMbd(row.eiaReferenceMbd)}</span>
        </span>
      )}
    </button>
  );
}
