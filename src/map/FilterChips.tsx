import { FILTER_DESCRIPTIONS, FILTER_LABELS, type FilterId } from '../lib/filters';

interface FilterChipsProps {
  /** The surface's chips, in order. */
  ids: FilterId[];
  active: FilterId | null;
  counts: Record<FilterId, number>;
  onChange: (filter: FilterId | null) => void;
}

/** One filter at a time; pressing the active chip clears it. */
export function FilterChips({ ids, active, counts, onChange }: FilterChipsProps) {
  return (
    <div className="chips" role="toolbar" aria-label="Filters">
      {ids.map((id) => (
        <button
          key={id}
          type="button"
          className="chip"
          aria-pressed={active === id}
          title={FILTER_DESCRIPTIONS[id]}
          onClick={() => onChange(active === id ? null : id)}
        >
          {FILTER_LABELS[id]}
          <span className="chip__count">{counts[id].toLocaleString('en-US')}</span>
        </button>
      ))}
    </div>
  );
}
