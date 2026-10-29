import type { ReactNode } from 'react';
import type { VisitChanges } from '../app/useVisitChanges';
import { formatDate, formatIndexShare, formatNumber } from '../lib/format';
import type { FilterId } from '../lib/filters';
import { median, statusGroups, type ChokepointRow, type StatusGroupId, type StorageRow } from '../lib/summary';
import type { AssetStatus } from '../types';

interface DashboardProps {
  counts: { status: AssetStatus; count: number }[];
  chokepoints: ChokepointRow[];
  storage: StorageRow[];
  visit: VisitChanges | null;
  onFilter: (filter: FilterId) => void;
  onShowStorage: () => void;
  onShowChanges: () => void;
}

const pts = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)} pts`;

/** The home view's headline: four tiles, each one number with a small picture, each opening more. */
export function Dashboard({ counts, chokepoints, storage, visit, onFilter, onShowStorage, onShowChanges }: DashboardProps) {
  const below = chokepoints.filter((c) => c.band === 'below');
  // Rows come furthest from baseline first, so the first below-baseline row is the worst.
  const worst = below[0];
  const groups = statusGroups(counts);
  const total = groups.reduce((n, g) => n + g.count, 0);
  const stopped = groups.find((g) => g.id === 'stopped')!.count;
  const gaps = storage.flatMap((s) => (s.vsLastYear === null ? [] : [s.vsLastYear]));
  const storageBelow = gaps.filter((g) => g < 0).length;
  const medianGap = median(gaps);
  const share = (id: StatusGroupId) => formatIndexShare(groups.find((g) => g.id === id)!.count / total);

  return (
    <section className="section dashboard" aria-label="Overview">
      <Tile
        label="Chokepoints"
        value={chokepoints.length ? String(below.length) : null}
        unit={chokepoints.length ? `of ${chokepoints.length} below baseline` : 'No transit data'}
        note={
          worst?.index != null
            ? `${worst.name} at ${formatIndexShare(worst.index)} of its ${worst.baseline} average`
            : 'Tanker transits, last 7 days'
        }
        action="Show on map"
        onClick={() => onFilter('below-baseline')}
      >
        <BandRings rows={chokepoints} />
      </Tile>

      <Tile
        label="Pipelines"
        value={total ? stopped.toLocaleString('en-US') : null}
        unit={total ? `of ${total.toLocaleString('en-US')} offline or idle` : 'No pipelines loaded'}
        note={total ? `${share('running')} operating, ${share('unbuilt')} not built` : ''}
        action="Show on map"
        onClick={() => onFilter('offline')}
      >
        {total > 0 && <StatusBar groups={groups} />}
      </Tile>

      <Tile
        label="EU gas storage"
        value={gaps.length ? String(storageBelow) : null}
        unit={gaps.length ? `of ${gaps.length} below last year` : 'No storage data'}
        note={medianGap !== null ? `Median gap ${pts(medianGap)}` : ''}
        action="Show storage on map"
        onClick={onShowStorage}
      >
        {gaps.length > 0 && <GapStrip gaps={gaps} />}
      </Tile>

      <Tile
        label="Since last visit"
        value={visit?.since ? String(visit.changes.length) : null}
        unit={visit?.since ? (visit.changes.length === 1 ? 'change' : 'changes') : 'Not yet'}
        note={visit?.since ? `Last visit ${formatDate(visit.since)}` : 'First visit on this browser'}
        action="Show the list"
        onClick={onShowChanges}
      />
    </section>
  );
}

function Tile({
  label,
  value,
  unit,
  note,
  action,
  onClick,
  children,
}: {
  label: string;
  /** Null when there's nothing to count; the unit line then says why. */
  value: string | null;
  unit: string;
  note: string;
  action: string;
  onClick: () => void;
  children?: ReactNode;
}) {
  return (
    <button type="button" className="tile" onClick={onClick} title={action}>
      <span className="tile__label">{label}</span>
      {value !== null && <span className="tile__value">{value}</span>}
      <span className={value === null ? 'tile__unit tile__unit--empty' : 'tile__unit'}>{unit}</span>
      {children && <span className="tile__viz">{children}</span>}
      {note && <span className="tile__note">{note}</span>}
    </button>
  );
}

/** One ring per chokepoint, drawn as on the map: band color, worst first. */
function BandRings({ rows }: { rows: ChokepointRow[] }) {
  const size = 14;
  const step = size + 6;
  return (
    <svg width={rows.length * step} height={size} aria-hidden="true">
      {rows.map((r, i) => (
        <circle
          key={r.selection.id}
          cx={i * step + size / 2}
          cy={size / 2}
          r={size / 2 - 1.5}
          className={`tile__ring tile__ring--${r.band ?? 'none'}`}
        />
      ))}
    </svg>
  );
}

const GROUP_CLASS: Record<StatusGroupId, string> = {
  running: 'operating',
  stopped: 'offline',
  unbuilt: 'unknown',
  unknown: 'unknown',
};

/** Share of pipelines in each status group; the stopped group carries the tile's number. */
function StatusBar({ groups }: { groups: ReturnType<typeof statusGroups> }) {
  const shown = groups.filter((g) => g.count > 0);
  return (
    <span className="status-bar">
      {shown.map((g) => (
        <span
          key={g.id}
          className={`status-bar__part status-bar__part--${GROUP_CLASS[g.id]}${g.id === 'unbuilt' ? ' status-bar__part--faint' : ''}`}
          style={{ flexGrow: g.count, minWidth: 3 }}
          title={`${g.label}: ${g.count.toLocaleString('en-US')}`}
        />
      ))}
    </span>
  );
}

/** One tick per country on a shared scale around zero: left of the line is below last year. */
function GapStrip({ gaps }: { gaps: number[] }) {
  const width = 160;
  const height = 18;
  const extent = Math.max(5, ...gaps.map(Math.abs));
  const x = (v: number) => width / 2 + (v / extent) * (width / 2 - 2);
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" className="gap-strip">
      <line x1={0} x2={width} y1={height / 2} y2={height / 2} className="gap-strip__axis" />
      <line x1={width / 2} x2={width / 2} y1={0} y2={height} className="gap-strip__zero" />
      {gaps.map((g, i) => (
        <line key={i} x1={x(g)} x2={x(g)} y1={4} y2={height - 4} className={`gap-strip__tick${g < 0 ? ' gap-strip__tick--below' : ''}`} />
      ))}
    </svg>
  );
}
