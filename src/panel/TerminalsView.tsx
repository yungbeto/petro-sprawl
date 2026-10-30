import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import { TERMINAL_GROUPS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { lngStatus, terminalStatus } from '../lib/encoding';
import { countStatuses, statusGroups } from '../lib/summary';
import {
  TERMINAL_GROUPINGS,
  TERMINAL_GROUPING_LABELS,
  TERMINAL_KINDS,
  TERMINAL_KIND_LABELS,
  isResearchedLng,
  type TerminalGroup,
  type TerminalGrouping,
  type TerminalKind,
} from '../lib/terminalGroups';
import type { LngTerminal, OilTerminal } from '../types';
import { SourceLink, statusLabel } from './details';
import { GroupItem, Segmented, StatusSummary } from './GroupList';

export type TerminalListing =
  | { kind: 'lng'; groups: TerminalGroup<LngTerminal>[] }
  | { kind: 'oil'; groups: TerminalGroup<OilTerminal>[] };

export interface TerminalsViewProps {
  data: Datasets;
  listing: TerminalListing;
  onKind: (kind: TerminalKind) => void;
  grouping: TerminalGrouping;
  onGrouping: (grouping: TerminalGrouping) => void;
  /** The open group, whose terminals the map brings out. */
  openGroup: string | null;
  onToggleGroup: (id: string) => void;
  onSelect: (selection: Selection) => void;
}

/**
 * The terminals surface: LNG terminals or oil terminals, with a switch between them, each grouped a
 * few ways. Opening a group lists its terminals and brings them out on the map.
 */
export function TerminalsView({ data, listing, onKind, grouping, onGrouping, openGroup, onToggleGroup, onSelect }: TerminalsViewProps) {
  const { kind } = listing;
  const overall = useMemo(
    () => statusGroups(countStatuses(kind === 'lng' ? data.lngTerminals.map(lngStatus) : data.oilTerminals.map(terminalStatus))),
    [data, kind],
  );
  const total = kind === 'lng' ? data.lngTerminals.length : data.oilTerminals.length;
  const groupList = `${TERMINAL_KIND_LABELS[kind]} terminals by ${TERMINAL_GROUPING_LABELS[grouping].toLowerCase()}`;

  return (
    <>
      <section className="section">
        <h2 className="detail__title">Terminals</h2>
        <Segmented id="terminals-kind" label="Kind" options={TERMINAL_KINDS} labels={TERMINAL_KIND_LABELS} value={kind} onChange={onKind} />
        {kind === 'lng' ? (
          <p className="section__lede">
            All <span className="mono">{total.toLocaleString('en-US')}</span> LNG terminals Global Energy Monitor tracks,
            built or not. Terminals with measured send-out or cited claims come first in each group, then the largest.
          </p>
        ) : (
          <p className="section__lede">
            <span className="mono">{total.toLocaleString('en-US')}</span> crude oil terminals, researched one by one:
            where a pipeline meets the sea, or a major export port. Without a cited claim the status stays unknown.
          </p>
        )}
        <StatusSummary groups={overall} total={total} />
      </section>

      <section className="section">
        <Segmented
          id="terminals-group-by"
          label="Group by"
          options={TERMINAL_GROUPINGS[kind]}
          labels={TERMINAL_GROUPING_LABELS}
          value={grouping}
          onChange={onGrouping}
        />
        {grouping === 'route' && <p className="note">By the chokepoints a tanker leaving the terminal has to pass.</p>}
        {grouping === 'region' && <p className="note">By the country the terminal is in.</p>}

        <ul className="group-list" aria-label={groupList}>
          {listing.kind === 'lng'
            ? listing.groups.map((group) => (
                <GroupItem
                  key={group.id}
                  id={`lng-${group.id}`}
                  label={group.label}
                  status={group.status}
                  items={group.terminals}
                  limit={TERMINAL_GROUPS.listLimit}
                  open={openGroup === group.id}
                  onToggle={() => onToggleGroup(group.id)}
                  keyOf={(t) => t.id}
                  renderRow={(t) => <LngRow terminal={t} onSelect={onSelect} />}
                />
              ))
            : listing.groups.map((group) => (
                <GroupItem
                  key={group.id}
                  id={`oil-${group.id}`}
                  label={group.label}
                  status={group.status}
                  items={group.terminals}
                  limit={TERMINAL_GROUPS.listLimit}
                  open={openGroup === group.id}
                  onToggle={() => onToggleGroup(group.id)}
                  keyOf={(t) => t.id}
                  renderRow={(t) => <OilRow terminal={t} onSelect={onSelect} />}
                />
              ))}
        </ul>
      </section>

      {kind === 'lng' ? (
        <p className="source">
          LNG terminals, their units, capacity and dataset status are from{' '}
          <SourceLink href="https://globalenergymonitor.org/">Global Energy Monitor</SourceLink>; measured send-out from{' '}
          <SourceLink href="https://alsi.gie.eu/">GIE ALSI</SourceLink>; regions from{' '}
          <SourceLink href="https://www.naturalearthdata.com/">Natural Earth</SourceLink>.
        </p>
      ) : (
        <p className="source">
          Oil terminals are researched, each claim with its source. Locations come from{' '}
          <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>'s ports or the end of a Global Energy
          Monitor pipeline; regions from <SourceLink href="https://www.naturalearthdata.com/">Natural Earth</SourceLink>.
        </p>
      )}
    </>
  );
}

function LngRow({ terminal: t, onSelect }: { terminal: LngTerminal; onSelect: (selection: Selection) => void }) {
  const status = lngStatus(t);
  const { operating, planned } = t.capacityMtpa;
  return (
    <button type="button" className="view-row" onClick={() => onSelect({ kind: 'lng', id: t.id })}>
      <span className="view-row__name">{t.name}</span>
      <span className="view-row__meta">
        <span className={`status status--${status}`}>{statusLabel(status)}</span>
        {t.country && <span className="mono">{t.country}</span>}
        {operating > 0 ? (
          <span className="mono">{formatMtpa(operating)} Mtpa</span>
        ) : (
          planned > 0 && <span className="mono">{formatMtpa(planned)} Mtpa planned</span>
        )}
        {t.sendOutSeriesId && <span className="tag">Send-out measured</span>}
        {!t.sendOutSeriesId && isResearchedLng(t) && <span className="tag">Researched</span>}
        {t.floating && <span className="tag">Floating</span>}
      </span>
    </button>
  );
}

function OilRow({ terminal: t, onSelect }: { terminal: OilTerminal; onSelect: (selection: Selection) => void }) {
  const status = terminalStatus(t);
  return (
    <button type="button" className="view-row" onClick={() => onSelect({ kind: 'terminal', id: t.id })}>
      <span className="view-row__name">{t.name}</span>
      <span className="view-row__meta">
        <span className={`status status--${status}`}>{statusLabel(status)}</span>
        <span className="mono">{t.country}</span>
        {t.throughput && (
          <span className="mono">
            {t.throughput.value} {t.throughput.unit} loaded
          </span>
        )}
        {t.role === 'import' && <span className="tag">Import</span>}
      </span>
    </button>
  );
}

const formatMtpa = (value: number) => (value >= 10 ? Math.round(value).toString() : value.toFixed(1).replace(/\.0$/, ''));
