// The basins surface's shale plays (SPEC M12): EIA's formations, the most tight oil first, each with its
// newest month, the last two years and its outlines; then the outlines EIA draws but reports no figure for.

import { useMemo, useState, type ReactNode } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { DETAIL, SHALE } from '../lib/config';
import { formatMonth, formatShare } from '../lib/format';
import { chartPoints, formationRows, formatShaleValue, latestMonth, playsWithoutFormation, shaleSummary, shaleUnit, type FormationRow } from '../lib/shale';
import { cardClass } from '../ui/Card';
import { SourceLink } from './details';
import { AssetIcon } from './AssetIcon';
import { MiniSparkline } from './Sparkline';
import { Note } from '../ui/Note';
import { SectionTitle } from '../ui/SectionTitle';

export function ShalePlaysView({ data, title, onSelect }: { data: Datasets; title: ReactNode; onSelect: (selection: Selection) => void }) {
  const rows = useMemo(() => formationRows(data), [data]);
  const summary = useMemo(() => shaleSummary(data), [data]);
  const without = useMemo(() => playsWithoutFormation(data.shalePlays), [data]);
  return (
    <>
      <section className="section">
        {title}
        {summary && (
          <p className="view-headline">
            In {formatMonth(summary.period)} the Lower 48 produced {formatShaleValue({ kind: 'oil' }, summary.oil)} million barrels a day
            of tight oil
            {summary.gas !== null && <> and {formatShaleValue({ kind: 'gas' }, summary.gas)} billion ft³ a day of shale gas</>}, by EIA's
            estimate.
            {summary.largest && ` ${summary.largest.label} formations gave ${formatShare(summary.largest.share)} of the oil.`}
          </p>
        )}
        <Note>
          A play is an area where companies drill one layer of rock, usually shale, and fracture it to get the oil or gas out.
          EIA estimates production by formation, so one figure covers all of a formation's outlines.
        </Note>
      </section>
      <ul className="view-list view-list--cards" aria-label="Shale formations">
        {rows.map((row) => (
          <li key={row.formation.id}>
            <FormationCard row={row} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      {without.length > 0 && <WithoutFigure plays={without} onSelect={onSelect} />}
      <Note kind="source">
        Outlines from EIA's <SourceLink href={SHALE.sourcePage}>{SHALE.sourceTitle}</SourceLink>, general areas by EIA's own
        account; production from the <SourceLink href={SHALE.steoPage}>{SHALE.steoTitle}</SourceLink>
        {summary && <>, released {formatMonth(summary.release.slice(0, 7))}</>}, history only.
      </Note>
    </>
  );
}

/**
 * One formation, laid out as the other surfaces' cards: name over the newest month, the last two years, then
 * the gas beside the oil and its outlines. Opens its largest outline; a formation EIA draws no outline for
 * is a card that opens nothing.
 */
function FormationCard({ row, onSelect }: { row: FormationRow; onSelect: (selection: Selection) => void }) {
  const lead = row.oil ?? row.gas!;
  const latest = latestMonth(lead)!;
  const gasLatest = row.oil ? latestMonth(row.gas) : null;
  const largest = row.plays[0];
  const what = lead.kind === 'oil' ? 'tight oil' : 'shale gas';
  const body = (
    <>
      <span className="stat-card__head">
        <span className="stat-card__name">{row.formation.label}</span>
        <span className="stat-card__figure">
          <span className="stat-card__value">{formatShaleValue(lead, latest.value)}</span>
          <span className="stat-card__unit">{shaleUnit(lead)}</span>
        </span>
      </span>
      <MiniSparkline points={chartPoints(lead)} reference={null} label={`${row.formation.label} ${what} by month, the last two years`} />
      <span className="stat-card__details">
        {gasLatest && (
          <span className="view-row__facts">
            <span>
              <strong>{formatShaleValue(row.gas!, gasLatest.value)}</strong> billion ft³ of gas a day
            </span>
          </span>
        )}
        <span className="view-row__facts stat-card__notes">
          <span>
            {row.plays.length
              ? row.plays.length === 1
                ? `Outline: ${row.plays[0]!.name}`
                : `${row.plays.length} outlines: ${row.plays.map((p) => p.name).join(', ')}`
              : 'No EIA outline'}
          </span>
          <span>EIA, {formatMonth(latest.period)}</span>
        </span>
      </span>
    </>
  );
  return largest ? (
    <button type="button" className={cardClass({ interactive: true, className: 'view-row stat-card' })} onClick={() => onSelect({ kind: 'shale', id: largest.id })}>
      {body}
    </button>
  ) : (
    <div className={cardClass({ className: 'view-row stat-card' })}>{body}</div>
  );
}

function WithoutFigure({ plays, onSelect }: { plays: Datasets['shalePlays']; onSelect: (selection: Selection) => void }) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? plays : plays.slice(0, DETAIL.relatedLimit);
  return (
    <section className="section" aria-labelledby="shale-without">
      <SectionTitle title="Outlines with no EIA figure" id="shale-without" count={plays.length} />
      <p className="muted">EIA draws these plays but reports no monthly production for them on their own.</p>
      <ul className="changes">
        {shown.map((p) => (
          <li key={p.id}>
            <button type="button" className="change" onClick={() => onSelect({ kind: 'shale', id: p.id })}>
              <AssetIcon kind="shale" />
              <span className="change__text">
                <span className="change__name">{p.name}</span>
                <span className="change__what">
                  {p.basin} basin · {p.areaKm2.toLocaleString('en-US')} km²
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {!expanded && plays.length > shown.length && (
        <button type="button" className="show-all" onClick={() => setExpanded(true)}>
          Show all {plays.length.toLocaleString('en-US')}
        </button>
      )}
    </section>
  );
}
