import type { Selection } from '../app/urlState';
import { FILTERS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { pipelineStatus } from '../lib/encoding';
import { FILTER_DESCRIPTIONS, FILTER_LABELS, filterRows, type FilterId, type FilterMatches } from '../lib/filters';
import { statusLabel } from './details';

interface FilterListProps {
  filter: FilterId;
  matches: FilterMatches;
  data: Datasets;
  onSelect: (selection: Selection) => void;
  onClear: () => void;
}

/** The panel while a chip is on: what matched, each opening its asset. */
export function FilterList({ filter, matches, data, onSelect, onClear }: FilterListProps) {
  const rows = filterRows(matches, data);
  const shown = rows.slice(0, FILTERS.listLimit);
  const statusOf = new Map(data.pipelines.map((p) => [p.id, pipelineStatus(p)]));
  return (
    <section className="section">
      <header className="filter-list__header">
        <h2 className="detail__title">{FILTER_LABELS[filter]}</h2>
        <button type="button" className="text-button" onClick={onClear} title="Clear filter  Esc">
          Clear
        </button>
      </header>
      <p className="muted section__lede">
        <span className="mono">{rows.length.toLocaleString('en-US')}</span> {rows.length === 1 ? 'match' : 'matches'}.{' '}
        {FILTER_DESCRIPTIONS[filter]}
      </p>
      {rows.length === 0 ? (
        <p className="muted">Nothing matches right now.</p>
      ) : (
        <ul className="changes">
          {shown.map((row) => {
            const status = row.selection.kind === 'pipeline' ? statusOf.get(row.selection.id) : undefined;
            return (
              <li key={`${row.selection.kind}/${row.selection.id}`}>
                <button type="button" className="change" onClick={() => onSelect(row.selection)}>
                  <span className="change__name">{row.name}</span>
                  <span className="change__what">
                    {row.selection.kind === 'chokepoint' ? 'Chokepoint' : 'Pipeline'}
                    {status && (
                      <>
                        {' · '}
                        <span className={`status status--${status}`}>{statusLabel(status)}</span>
                      </>
                    )}
                    {row.curated && row.selection.kind === 'pipeline' && ' · corridor'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length > shown.length && (
        <p className="note">
          Showing the first <span className="mono">{shown.length}</span>; the map shows all of them.
        </p>
      )}
    </section>
  );
}
