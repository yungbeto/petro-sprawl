import type { Selection } from '../app/urlState';
import { FILTERS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { FILTER_DESCRIPTIONS, FILTER_LABELS, filterRows, type FilterId, type FilterMatches } from '../lib/filters';
import { AssetList } from './details';

interface FilterListProps {
  filter: FilterId;
  matches: FilterMatches;
  data: Datasets;
  onSelect: (selection: Selection) => void;
  /** The surface the chip belongs to, when it isn't Home: the list keeps to it. */
  within: string | null;
}

/** The panel while a chip is on: what matched, each opening its asset. */
export function FilterList({ filter, matches, data, onSelect, within }: FilterListProps) {
  const rows = filterRows(matches, data);
  const shown = rows.slice(0, FILTERS.listLimit);
  return (
    <section className="section">
      <h2 className="detail__title">{FILTER_LABELS[filter]}</h2>
      <p className="muted section__lede">
        <span className="mono">{rows.length.toLocaleString('en-US')}</span> {rows.length === 1 ? 'match' : 'matches'}.{' '}
        {FILTER_DESCRIPTIONS[filter]}
        {within && ` Only ${within.toLowerCase()} show here.`}
      </p>
      {rows.length === 0 ? (
        <p className="muted">Nothing matches right now.</p>
      ) : (
        <AssetList rows={shown} data={data} onSelect={onSelect} />
      )}
      {rows.length > shown.length && (
        <p className="note">
          Showing the first <span className="mono">{shown.length}</span>; the map shows all of them.
        </p>
      )}
    </section>
  );
}
