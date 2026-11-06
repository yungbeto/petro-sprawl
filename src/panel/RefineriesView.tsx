import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import { REFINERIES, TERMINAL_GROUPS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { refineryStatus } from '../lib/encoding';
import { formatRefineryCapacity } from '../lib/format';
import {
  REFINERY_GROUPINGS,
  REFINERY_GROUPING_LABELS,
  REFINERY_GROUPING_NOTES,
  type RefineryGroup,
  type RefineryGrouping,
} from '../lib/refineries';
import { countStatuses, statusGroups } from '../lib/summary';
import type { Refinery } from '../types';
import { SourceLink, statusLabel } from './details';
import { GroupItem, Segmented, StatusSummary } from './GroupList';
import { Info } from './Info';
import { SectionTitle } from '../ui/SectionTitle';
import { Note } from '../ui/Note';

export interface RefineriesViewProps {
  data: Datasets;
  groups: RefineryGroup[];
  grouping: RefineryGrouping;
  onGrouping: (grouping: RefineryGrouping) => void;
  /** The open group, whose refineries the map brings out. */
  openGroup: string | null;
  onToggleGroup: (id: string) => void;
  onSelect: (selection: Selection) => void;
}

/** The refineries surface (M11): every refinery, grouped by region, company or status, each group largest first. */
export function RefineriesView({ data, groups, grouping, onGrouping, openGroup, onToggleGroup, onSelect }: RefineriesViewProps) {
  const total = data.refineries.length;
  const overall = useMemo(() => statusGroups(countStatuses(data.refineries.map(refineryStatus))), [data]);
  const us = useMemo(() => data.refineries.filter((r) => r.pointSource === 'eia'), [data]);
  const capacity = useMemo(() => us.reduce((sum, r) => sum + (r.capacity?.value ?? 0), 0), [us]);
  const europe = useMemo(() => data.refineries.filter((r) => r.pointSource === 'eea').length, [data]);
  const elsewhere = total - us.length - europe;
  return (
    <>
      <section className="section">
        <SectionTitle title="Refineries" level="page">
          <Info label="About this list">
            Every US refinery EIA lists as operable on 1 January 2026, with its crude distillation capacity and EIA's split
            of that capacity into operating and idle. In Europe, every site the EEA's industrial register lists as a working
            refinery: the register gives no capacity or running status. Then large refineries elsewhere, the UK and Norway
            among them, researched one by one, each with a capacity from a dated page.
          </Info>
        </SectionTitle>
        <p className="view-headline">
          {us.length.toLocaleString('en-US')} US refineries, {formatRefineryCapacity({ value: capacity })} of crude distillation
          capacity on 1 January 2026, from EIA
          {europe > 0 && `; ${europe.toLocaleString('en-US')} in Europe from the EEA's register, capacity not published`}
          {elsewhere > 0 && `; and ${elsewhere.toLocaleString('en-US')} more researched one by one, each with a cited capacity`}. Open a group to bring its
          refineries out on the map.
        </p>
        <StatusSummary groups={overall} total={total} />
      </section>

      <section className="section">
        <Segmented
          id="refineries-group-by"
          label="Group by"
          options={REFINERY_GROUPINGS}
          labels={REFINERY_GROUPING_LABELS}
          value={grouping}
          onChange={onGrouping}
        />
        <Note className="group-by__note">{REFINERY_GROUPING_NOTES[grouping]}</Note>
        <ul className="group-list" aria-label={`Refineries by ${REFINERY_GROUPING_LABELS[grouping].toLowerCase()}`}>
          {groups.map((group) => (
            <GroupItem
              key={group.id}
              id={`refinery-${group.id}`}
              label={group.label}
              status={group.status}
              items={group.refineries}
              limit={TERMINAL_GROUPS.listLimit}
              open={openGroup === group.id}
              onToggle={() => onToggleGroup(group.id)}
              keyOf={(r) => r.id}
              renderRow={(r) => <RefineryRow refinery={r} onSelect={onSelect} />}
            />
          ))}
        </ul>
      </section>

      <Note kind="source">
        In the US, capacity, companies and status from <SourceLink href={REFINERIES.eiaPage}>EIA's Refinery Capacity Report</SourceLink>,
        in barrels per calendar day, and locations from EIA's refinery map layer (2021); a refinery the 2021 layer doesn't
        place stays off the map. In Europe, sites, companies and locations from the European Environment Agency's{' '}
        <SourceLink href={REFINERIES.eeaPage}>Industrial Reporting database</SourceLink>, CC BY 4.0. For the rest, locations from
        Wikidata (CC0) and each capacity from the page its refinery's page links, as reported on that date.
      </Note>
    </>
  );
}

function RefineryRow({ refinery: r, onSelect }: { refinery: Refinery; onSelect: (selection: Selection) => void }) {
  const status = refineryStatus(r);
  return (
    <button type="button" className="view-row" onClick={() => onSelect({ kind: 'refinery', id: r.id })}>
      <span className="view-row__name">{r.name}</span>
      <span className="view-row__meta">
        <span className={`status status--${status}`}>{statusLabel(status)}</span>
        <span className="mono">{r.state ?? r.country}</span>
        {r.capacity && <span className="num-inline">{formatRefineryCapacity(r.capacity)}</span>}
        {r.corporation && <span>{r.corporation}</span>}
      </span>
    </button>
  );
}
