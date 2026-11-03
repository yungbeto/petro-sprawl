import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { formatIndexShare, formatMbd, formatNumber } from '../lib/format';
import { chokepointsSummary, chokepointViewRows, type ChokepointViewRow } from '../lib/summary';
import { Band, SourceLink } from './details';
import { MiniSparkline } from './Sparkline';
import { Info } from './Info';

/** The chokepoints view: every strait on one page, furthest from its five-year average first. */
export function ChokepointsView({ data, onSelect }: { data: Datasets; onSelect: (selection: Selection) => void }) {
  const rows = useMemo(() => chokepointViewRows(data), [data]);
  const latest = rows.find((r) => r.transits)?.transits?.latestDate;
  const summary = useMemo(() => chokepointsSummary(rows), [rows]);
  return (
    <>
      <section className="section">
        <div className="title-row">
          <h2 className="detail__title">Chokepoints</h2>
          <Info label="About this list">
            Tanker transits a day, averaged over 7 days, for the 90 days to <span className="mono">{latest ?? 'n/a'}</span>,
            against each strait's five-year average (dashed). The figure is the last 7 days as a share of that average;
            cargo is the same for PortWatch's estimate of the tonnage carried. Furthest from normal first.
          </Info>
        </div>
        {summary.measured > 0 && (
          <p className="view-headline">
            {summary.below} of {summary.measured} straits are below their five-year baseline.
            {summary.furthest && ` Furthest from normal: ${summary.furthest.name}, at ${formatIndexShare(summary.furthest.index)}.`}
          </p>
        )}
      </section>
      <ul className="view-list view-list--cards" aria-label="Chokepoints">
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

/**
 * One strait: its name and band, the share of its five-year average as the row's figure, the 7-day
 * average over the last 90 days against that average (dashed), and the figures behind the share.
 */
function ChokepointRow({ row, onSelect }: { row: ChokepointViewRow; onSelect: (selection: Selection) => void }) {
  const { transits, cargo } = row;
  return (
    <button type="button" className="view-row chokepoint-row" onClick={() => onSelect(row.selection)}>
      <span className="view-row__head">
        <span className="chokepoint-row__title">
          <span className="view-row__name">{row.name}</span>
          {transits && <Band band={transits.band} />}
        </span>
        {transits?.indexFiveYear != null && (
          <span className="view-row__figure">
            <span className="view-row__value">{formatIndexShare(transits.indexFiveYear)}</span>
            <span className="view-row__unit">of five-year</span>
          </span>
        )}
      </span>
      {transits ? (
        <>
          <MiniSparkline
            points={transits.trend}
            reference={transits.fiveYear?.mean ?? null}
            label={`Tanker transits at ${row.name}, 7-day average over the last 90 days, against the five-year average`}
            className={transits.band ? `band--${transits.band}` : undefined}
          />
          <span className="view-row__facts">
            <span>
              <strong>{transits.recent ? formatNumber(transits.recent.mean, 1) : 'n/a'}</strong> tankers a day
            </span>
            <span>
              <strong>{transits.fiveYear ? formatNumber(transits.fiveYear.mean, 1) : 'n/a'}</strong> five-year average
            </span>
            {cargo?.indexFiveYear != null && (
              <span>
                cargo <strong>{formatIndexShare(cargo.indexFiveYear)}</strong> of five-year
              </span>
            )}
          </span>
        </>
      ) : (
        <span className="view-row__facts">
          <span>
            No transit data. EIA reference volume <strong>{formatMbd(row.eiaReferenceMbd)}</strong>
          </span>
        </span>
      )}
    </button>
  );
}
