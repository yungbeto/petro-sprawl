import type { Selection } from '../app/urlState';
import { FILTERS } from '../lib/config';
import type { Datasets } from '../lib/data';
import { FILTER_DESCRIPTIONS, FILTER_LABELS, filterRows, groupByBasis, type FilterId, type FilterMatches } from '../lib/filters';
import { AssetList } from './details';
import { SectionTitle } from '../ui/SectionTitle';
import { Note } from '../ui/Note';

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
      <SectionTitle title={FILTER_LABELS[filter]} level="page" />
      <p className="muted section__lede">
        <span className="num-inline">{rows.length.toLocaleString('en-US')}</span> {rows.length === 1 ? 'match' : 'matches'}.{' '}
        {FILTER_DESCRIPTIONS[filter]}
        {within && ` Only ${within.toLowerCase()} show here.`}
      </p>
      {rows.length === 0 ? (
        <p className="muted">Nothing matches right now.</p>
      ) : (
        // Offline or idle: cited stops apart from a dataset's listings (src/lib/filters.ts, groupByBasis).
        (filter === 'offline' ? groupByBasis(shown) : [{ title: '', rows: shown }]).map((g) =>
          g.title ? (
            <section key={g.title} className="section">
              <SectionTitle title={g.title} count={g.rows.length} />
              <AssetList rows={g.rows} data={data} onSelect={onSelect} />
            </section>
          ) : (
            <AssetList key="all" rows={g.rows} data={data} onSelect={onSelect} />
          ),
        )
      )}
      {rows.length > shown.length && (
        <Note>
          Showing the first <span className="num-inline">{shown.length}</span>; the map shows all of them.
        </Note>
      )}
    </section>
  );
}
