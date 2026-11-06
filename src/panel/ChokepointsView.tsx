import { useMemo } from 'react';
import { cardClass } from '../ui/Card';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { formatIndexShare, formatMbd, formatNumber } from '../lib/format';
import { chokepointsSummary, chokepointViewRows, type ChokepointViewRow } from '../lib/summary';
import { Band, SourceLink } from './details';
import { MiniSparkline } from './Sparkline';
import { Info } from './Info';
import { SectionTitle } from '../ui/SectionTitle';
import { Note } from '../ui/Note';

/** The chokepoints view: every strait on one page, furthest from its five-year average first. */
export function ChokepointsView({ data, onSelect }: { data: Datasets; onSelect: (selection: Selection) => void }) {
  const rows = useMemo(() => chokepointViewRows(data), [data]);
  const latest = rows.find((r) => r.transits)?.transits?.latestDate;
  const summary = useMemo(() => chokepointsSummary(rows), [rows]);
  return (
    <>
      <section className="section">
        <SectionTitle title="Chokepoints" level="page">
          <Info label="About this list">
            Tanker transits a day, averaged over 7 days, for the 90 days to <span className="mono">{latest ?? 'n/a'}</span>,
            against each strait's five-year average (dashed). The figure is the last 7 days as a share of that average;
            cargo is the same for PortWatch's estimate of the tonnage carried. Furthest from normal first.
          </Info>
        </SectionTitle>
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
      <Note kind="source">
        Transits and cargo are from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>. Cargo is
        PortWatch's estimate, in metric tons, from each tanker's draft and size.
      </Note>
    </>
  );
}

/**
 * One strait, as the storage and basin cards are laid out: the name (with its band) over the figure, the
 * share of its five-year average; the 7-day average over the last 90 days against that average (dashed)
 * where their bar sits; then the figures behind the share and, in small type, the period and source.
 */
function ChokepointRow({ row, onSelect }: { row: ChokepointViewRow; onSelect: (selection: Selection) => void }) {
  const { transits, cargo } = row;
  const index = transits?.indexFiveYear ?? null;
  const share = index !== null ? formatIndexShare(index) : null;
  return (
    <button type="button" className={cardClass({ interactive: true, className: 'view-row stat-card chokepoint-row' })} onClick={() => onSelect(row.selection)}>
      <span className="stat-card__head">
        <span className="chokepoint-row__name">
          <span className="stat-card__name">{row.name}</span>
          {transits?.band && <Band band={transits.band} />}
        </span>
        <span className="stat-card__figure">
          {share !== null ? (
            <>
              <span className="stat-card__value">
                {/* The percent sign is set smaller than its number, as on the storage cards. */}
                {share.endsWith('%') ? (
                  <>
                    {share.slice(0, -1)}
                    <span className="stat-card__percent">%</span>
                  </>
                ) : (
                  share
                )}
              </span>
              <span className="stat-card__unit">of five-year average</span>
            </>
          ) : (
            <>
              <span className="stat-card__value">{formatMbd(row.eiaReferenceMbd)}</span>
              <span className="stat-card__unit">EIA reference volume</span>
            </>
          )}
        </span>
      </span>
      {transits ? (
        <MiniSparkline
          points={transits.trend}
          reference={transits.fiveYear?.mean ?? null}
          label={`Tanker transits at ${row.name}, 7-day average over the last 90 days, against the five-year average`}
          className={transits.band ? `band--${transits.band}` : undefined}
        />
      ) : (
        <span className="stat-card__rule" aria-hidden="true" />
      )}
      <span className="stat-card__details">
        {transits ? (
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
        ) : (
          <span className="view-row__facts">
            <span>No transit data</span>
          </span>
        )}
        <span className="view-row__facts stat-card__notes">
          {transits && (
            <span>
              7-day average, to <span className="mono">{transits.latestDate}</span>
            </span>
          )}
          <span>{transits ? 'IMF PortWatch' : 'EIA'}</span>
        </span>
      </span>
    </button>
  );
}
