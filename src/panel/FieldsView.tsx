import { useMemo, type ReactNode } from 'react';
import type { Selection } from '../app/urlState';
import { FIELDS, TERMINAL_GROUPS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { FIELD_GROUPINGS, FIELD_GROUPING_LABELS, FIELD_GROUPING_NOTES, fieldLead, fieldScale, fieldStatus, formatFieldOutput, type FieldGroup, type FieldGrouping } from '../lib/fields';
import { countStatuses, statusGroups } from '../lib/summary';
import type { Field } from '../types';
import { SourceLink, statusLabel } from './details';
import { GroupItem, Segmented, StatusSummary } from './GroupList';
import { Note } from '../ui/Note';

export interface FieldsListing {
  groups: FieldGroup[];
  grouping: FieldGrouping;
  onGrouping: (grouping: FieldGrouping) => void;
  /** The open group, whose fields the map brings out. */
  openGroup: string | null;
  onToggleGroup: (id: string) => void;
}

export interface FieldsViewProps extends FieldsListing {
  data: Datasets;
  /** The surface's title row, with the switch, from BasinsView. */
  title: ReactNode;
  onSelect: (selection: Selection) => void;
}

/** Oil and gas fields on the basins surface (M13): GEM's fields and projects, grouped, each group largest first. */
export function FieldsView({ data, title, groups, grouping, onGrouping, openGroup, onToggleGroup, onSelect }: FieldsViewProps) {
  const total = data.fields.length;
  const overall = useMemo(() => statusGroups(countStatuses(data.fields.map(fieldStatus))), [data]);
  const projects = useMemo(() => data.fields.filter((f) => f.level === 'project').length, [data]);
  return (
    <>
      <section className="section">
        {title}
        <p className="view-headline">
          {total.toLocaleString('en-US')} oil and gas fields from Global Energy Monitor, {projects.toLocaleString('en-US')} of them projects that group several.
          GEM lists fields producing or holding {FIELDS.threshold}; smaller ones aren't on the map. Open a group to bring its fields out on the map.
        </p>
        <StatusSummary groups={overall} total={total} />
      </section>

      <section className="section">
        <Segmented id="fields-group-by" label="Group by" options={FIELD_GROUPINGS} labels={FIELD_GROUPING_LABELS} value={grouping} onChange={onGrouping} />
        <Note className="group-by__note">
          {FIELD_GROUPING_NOTES[grouping]} Each group lists its largest first, oil against oil and gas against gas: GEM gives no factor between them.
        </Note>
        <ul className="group-list" aria-label={`Fields by ${FIELD_GROUPING_LABELS[grouping].toLowerCase()}`}>
          {groups.map((group) => (
            <GroupItem
              key={group.id}
              id={`field-${group.id}`}
              label={group.label}
              status={group.status}
              items={group.fields}
              limit={TERMINAL_GROUPS.listLimit}
              open={openGroup === group.id}
              onToggle={() => onToggleGroup(group.id)}
              keyOf={(f) => f.id}
              renderRow={(f) => <FieldRow field={f} data={data} onSelect={onSelect} />}
            />
          ))}
        </ul>
      </section>

      <Note kind="source">
        Fields, projects, statuses, owners and yearly production from Global Energy Monitor's{' '}
        <SourceLink href={FIELDS.sourcePage}>{FIELDS.sourceTitle}</SourceLink>, CC BY 4.0. Each figure is for the year beside it; years differ from field to field.
      </Note>
    </>
  );
}

function FieldRow({ field: f, data, onSelect }: { field: Field; data: Datasets; onSelect: (selection: Selection) => void }) {
  const status = fieldStatus(f);
  const lead = fieldLead(f, fieldScale(data.fields))?.output;
  return (
    <button type="button" className="view-row" onClick={() => onSelect({ kind: 'field', id: f.id })}>
      <span className="view-row__name">{f.name}</span>
      <span className="view-row__meta">
        <span className={`status status--${status}`}>{statusLabel(status)}</span>
        <span className="mono">{f.country}</span>
        {lead && (
          <span className="num-inline">
            {formatFieldOutput(lead)}
            {lead.year ? `, ${lead.year}` : ''}
          </span>
        )}
        {f.operator && <span>{f.operator}</span>}
      </span>
    </button>
  );
}
