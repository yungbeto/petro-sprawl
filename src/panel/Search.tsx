import { useId, useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { buildSearchIndex, search } from '../lib/search';

interface SearchProps {
  data: Datasets;
  onSelect: (selection: Selection) => void;
  inputRef: Ref<HTMLInputElement>;
}

/** Type-ahead over every selectable thing. Arrow keys move, Enter opens, Esc clears then leaves. */
export function Search({ data, onSelect, inputRef }: SearchProps) {
  const index = useMemo(() => buildSearchIndex(data), [data]);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const [open, setOpen] = useState(false);
  const results = useMemo(() => search(index, query), [index, query]);
  const listId = useId();
  const showList = open && query.trim() !== '';

  const choose = (selection: Selection, input: HTMLInputElement | null) => {
    onSelect(selection);
    setQuery('');
    setOpen(false);
    input?.blur();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
      setOpen(true);
    } else if (event.key === 'Enter') {
      const hit = results[active];
      if (hit) choose(hit.selection, event.currentTarget);
    } else if (event.key === 'Escape' && query) {
      // First Esc clears; the app's handler blurs on the next one.
      event.stopPropagation();
      setQuery('');
    }
  };

  const activeId = showList && results[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="panel__search">
      <input
        ref={inputRef}
        type="search"
        className="search-input"
        placeholder="Search pipelines, chokepoints, places"
        aria-label="Search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onKeyDown={onKeyDown}
      />
      {!query && <kbd className="search-hint" aria-hidden="true">/</kbd>}
      {showList && (
        <ul className="search-results" id={listId} role="listbox" aria-label="Search results">
          {results.length === 0 ? (
            <li className="search-results__empty muted">No matches</li>
          ) : (
            results.map((r, i) => (
              <li
                key={`${r.selection.kind}/${r.selection.id}`}
                id={`${listId}-${i}`}
                role="option"
                aria-selected={i === active}
                className="search-results__item"
                // mousedown, so the pick lands before the input's blur closes the list.
                onMouseDown={(event) => {
                  event.preventDefault();
                  choose(r.selection, event.currentTarget.closest('.panel__search')?.querySelector('input') ?? null);
                }}
                onMouseEnter={() => setActive(i)}
              >
                <span className="search-results__name">{r.name}</span>
                <span className="search-results__detail">{r.detail}</span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
