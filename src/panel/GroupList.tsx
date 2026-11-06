import { useState, type ReactNode } from 'react';
import { SegmentedOptions } from '../ui/Segmented';
import { CaretDownIcon, CaretRightIcon } from '@phosphor-icons/react';
import { formatIndexShare } from '../lib/format';
import type { StatusGroupId } from '../lib/summary';
import { StatusBar } from './Dashboard';

type StatusGroups = { id: StatusGroupId; label: string; count: number }[];

/** A surface's status split across all its assets: the bar, then counts and shares. */
export function StatusSummary({ groups, total }: { groups: StatusGroups; total: number }) {
  if (total === 0) return null;
  return (
    <div className="status-summary">
      <StatusBar groups={groups} />
      <table className="table status-groups">
        <tbody>
          {groups.map((g) => (
            <tr key={g.id}>
              <td>{g.label}</td>
              <td className="num">{g.count.toLocaleString('en-US')}</td>
              <td className="num muted">{formatIndexShare(g.count / total)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** A labelled segmented switch: what a surface groups by, or which kind it lists. */
export function Segmented<T extends string>({
  id,
  label,
  options,
  labels,
  value,
  onChange,
  hideLabel = false,
}: {
  id: string;
  label: string;
  /** Name the switch for screen readers only, where its place says what it is (beside a title). */
  hideLabel?: boolean;
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
}) {
  return (
    <div className="group-by">
      <span className={hideLabel ? 'visually-hidden' : 'group-by__label'} id={id}>
        {label}
      </span>
      <SegmentedOptions options={options} labels={labels} value={value} onChange={onChange} labelledBy={id} />
    </div>
  );
}

/**
 * One group in a surface's list: a disclosure row with the count and status bar. Open, it lists its
 * items, the first `limit` and then "Show all".
 */
export function GroupItem<T>({
  id,
  label,
  status,
  items,
  limit,
  open,
  onToggle,
  keyOf,
  renderRow,
}: {
  id: string;
  label: string;
  status: StatusGroups;
  items: T[];
  limit: number;
  open: boolean;
  onToggle: () => void;
  keyOf: (item: T) => string;
  renderRow: (item: T) => ReactNode;
}) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? items : items.slice(0, limit);
  const listId = `group-${id.replace(/[^a-z0-9-]/gi, '-')}`;
  return (
    <li className="group-list__item">
      <button type="button" className="group-row" aria-expanded={open} aria-controls={listId} onClick={onToggle}>
        {open ? <CaretDownIcon size={14} aria-hidden="true" /> : <CaretRightIcon size={14} aria-hidden="true" />}
        <span className="group-row__label">{label}</span>
        <span className="group-row__count">{items.length.toLocaleString('en-US')}</span>
        <span className="group-row__bar">
          <StatusBar groups={status} size="sm" />
        </span>
      </button>
      {open && (
        <div id={listId}>
          <ul className="view-list" aria-label={label}>
            {shown.map((item) => (
              <li key={keyOf(item)}>{renderRow(item)}</li>
            ))}
          </ul>
          {items.length > shown.length && (
            <button type="button" className="link-button group-list__more" onClick={() => setShowAll(true)}>
              Show all {items.length.toLocaleString('en-US')}
            </button>
          )}
        </div>
      )}
    </li>
  );
}
