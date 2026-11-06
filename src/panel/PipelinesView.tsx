import { useMemo } from 'react';
import { Tag } from '../ui/Tag';
import type { Selection } from '../app/urlState';
import { PIPELINE_GROUPS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { pipelineStatus } from '../lib/encoding';
import {
  PIPELINE_GROUPINGS,
  PIPELINE_GROUPING_LABELS,
  PIPELINE_GROUPING_NOTES,
  isResearched,
  type PipelineGroup,
  type PipelineGrouping,
} from '../lib/pipelineGroups';
import { statusCounts, statusGroups } from '../lib/summary';
import type { Pipeline } from '../types';
import { SourceLink, statusLabel } from './details';
import { GroupItem, Segmented, StatusSummary } from './GroupList';
import { Info } from './Info';

export interface PipelinesViewProps {
  data: Datasets;
  groups: PipelineGroup[];
  grouping: PipelineGrouping;
  onGrouping: (grouping: PipelineGrouping) => void;
  /** The open group, whose pipelines the map brings out. */
  openGroup: string | null;
  onToggleGroup: (id: string) => void;
  onSelect: (selection: Selection) => void;
}

/**
 * The pipelines surface: every mapped pipeline, grouped by region, status, commodity or owner. Opening
 * a group lists its pipelines, researched ones first, and brings them out on the map.
 */
export function PipelinesView({ data, groups, grouping, onGrouping, openGroup, onToggleGroup, onSelect }: PipelinesViewProps) {
  const overall = useMemo(() => statusGroups(statusCounts(data.pipelines)), [data]);
  const total = data.pipelines.length;
  const researched = useMemo(() => data.pipelines.filter(isResearched).length, [data]);

  return (
    <>
      <section className="section">
        <div className="title-row">
          <h2 className="detail__title">Pipelines</h2>
          <Info label="About this list">
            All <span className="num-inline">{total.toLocaleString('en-US')}</span> mapped pipelines. Researched ones, with
            cited claims or metered flow, are marked and come first in each group.
          </Info>
        </div>
        <p className="view-headline">
          {total.toLocaleString('en-US')} pipelines from Global Energy Monitor; {researched} researched, with cited claims or metered
          flow. Open a group to bring its lines out on the map.
        </p>
        <StatusSummary groups={overall} total={total} />
      </section>

      <section className="section">
        <Segmented
          id="pipelines-group-by"
          label="Group by"
          options={PIPELINE_GROUPINGS}
          labels={PIPELINE_GROUPING_LABELS}
          value={grouping}
          onChange={onGrouping}
        />
        <p className="note group-by__note">{PIPELINE_GROUPING_NOTES[grouping]}</p>

        <ul className="group-list" aria-label={`Pipelines by ${PIPELINE_GROUPING_LABELS[grouping].toLowerCase()}`}>
          {groups.map((group) => (
            <GroupItem
              key={group.id}
              id={`pipelines-${group.id}`}
              label={group.label}
              status={group.status}
              items={group.pipelines}
              limit={PIPELINE_GROUPS.listLimit}
              open={openGroup === group.id}
              onToggle={() => onToggleGroup(group.id)}
              keyOf={(p) => p.id}
              renderRow={(p) => <PipelineRow pipeline={p} onSelect={onSelect} />}
            />
          ))}
        </ul>
      </section>

      <p className="source">
        Pipelines, their dataset status and owners are from{' '}
        <SourceLink href="https://globalenergymonitor.org/">Global Energy Monitor</SourceLink>; regions from{' '}
        <SourceLink href="https://www.naturalearthdata.com/">Natural Earth</SourceLink>. Researched pipelines carry cited
        claims, or measured flow from ENTSOG where there is a metering point.
      </p>
    </>
  );
}

function PipelineRow({ pipeline: p, onSelect }: { pipeline: Pipeline; onSelect: (selection: Selection) => void }) {
  const status = pipelineStatus(p);
  const route = [p.fromCountry, ...p.transitCountries, p.toCountry].filter((c, i, all) => c && c !== all[i - 1]).join(' → ');
  return (
    <button type="button" className="view-row" onClick={() => onSelect({ kind: 'pipeline', id: p.id })}>
      <span className="view-row__name">{p.name}</span>
      <span className="view-row__meta">
        <span className={`status status--${status}`}>{statusLabel(status)}</span>
        {route && <span className="mono">{route}</span>}
        {isResearched(p) && <Tag>Researched</Tag>}
      </span>
    </button>
  );
}
