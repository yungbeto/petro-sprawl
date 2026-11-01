import type { ReactNode } from 'react';
import { FEATURES } from '../lib/config';
import { formatIndexShare, formatNumber, formatThousandfold } from '../lib/format';
import type { ViewId } from '../lib/views';
import { basinViewRows, median, statusGroups, type ChokepointRow, type StatusGroupId, type StorageRow } from '../lib/summary';
import type { AssetStatus, Basin } from '../types';

interface DashboardProps {
  counts: { status: AssetStatus; count: number }[];
  /** LNG and oil terminals together. */
  terminalCounts: { status: AssetStatus; count: number }[];
  chokepoints: ChokepointRow[];
  storage: StorageRow[];
  /** Shown in storage's place while gas storage is switched off. */
  basins: Basin[];
  onOpenView: (view: ViewId) => void;
}

const pts = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)} pts`;

/** Home's figures under the hero: four in a grid, each one number with a small picture, each opening its surface or more. */
export function Dashboard({ counts, terminalCounts, chokepoints, storage, basins, onOpenView }: DashboardProps) {
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
  const terminalGroups = statusGroups(terminalCounts);
  const terminals = terminalGroups.reduce((n, g) => n + g.count, 0);
  const terminalsStopped = terminalGroups.find((g) => g.id === 'stopped')!.count;

  return (
    <section className="section dashboard" aria-label="Overview">
      <Tile
        label="Pipelines"
        value={total ? stopped.toLocaleString('en-US') : null}
        unit={
          total ? (
            <>
              of {total.toLocaleString('en-US')} <span className="tile__status">offline or idle</span>
            </>
          ) : (
            'No pipelines loaded'
          )
        }
        note={total ? `${share('running')} operating, ${share('unbuilt')} not built` : ''}
        action="Open pipelines"
        onClick={() => onOpenView('pipelines')}
      >
        {total > 0 && <StatusBar groups={groups} />}
      </Tile>

      <Tile
        label="Terminals"
        value={terminals ? terminalsStopped.toLocaleString('en-US') : null}
        unit={
          terminals ? (
            <>
              of {terminals.toLocaleString('en-US')} <span className="tile__status">offline or idle</span>
            </>
          ) : (
            'No terminals loaded'
          )
        }
        note={terminals ? 'LNG and oil' : ''}
        action="Open terminals"
        onClick={() => onOpenView('terminals')}
      >
        {terminals > 0 && <StatusBar groups={terminalGroups} />}
      </Tile>

      <Tile
        label="Chokepoints"
        value={chokepoints.length ? String(below.length) : null}
        unit={chokepoints.length ? `of ${chokepoints.length} below baseline` : 'No transit data'}
        note={
          worst?.index != null
            ? `${worst.name} at ${formatIndexShare(worst.index)} of its ${worst.baseline} average`
            : 'Tanker transits, last 7 days'
        }
        action="Open chokepoints"
        onClick={() => onOpenView('chokepoints')}
      >
        <BandRings rows={chokepoints} />
      </Tile>

      {FEATURES.gasStorage ? (
        <Tile
          label="EU gas storage"
          value={gaps.length ? String(storageBelow) : null}
          unit={gaps.length ? `of ${gaps.length} below last year` : 'No storage data'}
          note={medianGap !== null ? `Median gap ${pts(medianGap)}` : ''}
          action="Open gas storage"
          onClick={() => onOpenView('storage')}
        >
          {gaps.length > 0 && <GapStrip gaps={gaps} />}
        </Tile>
      ) : (
        <BasinsTile basins={basins} onOpen={() => onOpenView('basins')} />
      )}
    </section>
  );
}

/** How many basins are mapped, and the one with the most oil remaining as USGS assessed it in 2000. */
function BasinsTile({ basins, onOpen }: { basins: Basin[]; onOpen: () => void }) {
  const top = basinViewRows(basins)[0];
  const oil = top?.volumes?.oil.remaining ?? null;
  return (
    <Tile
      label="Basins"
      value={basins.length ? basins.length.toLocaleString('en-US') : null}
      unit={basins.length ? 'oil and gas provinces' : 'No basins loaded'}
      note={top && oil !== null ? `Most oil remaining in 2000: ${top.name}, ${formatThousandfold(oil)} billion barrels` : ''}
      action="Open basins"
      onClick={onOpen}
    />
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
  unit: ReactNode;
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
  const size = 12;
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
export function StatusBar({ groups }: { groups: ReturnType<typeof statusGroups> }) {
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
  const width = 128;
  const height = 16;
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
