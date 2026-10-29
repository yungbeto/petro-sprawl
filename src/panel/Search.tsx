import { useId, useMemo, useState, type KeyboardEvent, type Ref } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { buildSearchIndex, search } from '../lib/search';
import { XIcon } from '@phosphor-icons/react';
import { AssetIcon } from './AssetIcon';

interface SearchProps {
  data: Datasets;
  onSelect: (selection: Selection) => void;
  inputRef: Ref<HTMLInputElement>;
  /** What the panel shows: the selected asset's name or the active filter's. Fills the bar when not typing. */
  context: string | null;
  /** Closes what the panel shows, back to the previous view. */
  onClose: () => void;
}

/**
 * Type-ahead over every selectable thing, and the title of whatever is open, like a map app's search
 * bar. Arrow keys move, Enter opens. The × clears typing, or otherwise closes what is open.
 */
export function Search({ data, onSelect, inputRef, context, onClose }: SearchProps) {
  const index = useMemo(() => buildSearchIndex(data), [data]);
  const [query, setQuery] = useState('');
  // Typing in the bar; otherwise it shows the context.
  const [editing, setEditing] = useState(false);
  const [active, setActive] = useState(0);
  const results = useMemo(() => search(index, query), [index, query]);
  const listId = useId();
  const value = editing ? query : (context ?? query);
  // The bar starts out holding the context's own name; results appear once you change it.
  const typed = editing && query.trim() !== '' && query !== context;
  const showList = typed;

  const choose = (selection: Selection, input: HTMLInputElement | null) => {
    onSelect(selection);
    setQuery('');
    setEditing(false);
    input?.blur();
  };

  const clearOrClose = (input: HTMLInputElement | null) => {
    if (typed) {
      setQuery('');
      input?.focus();
      return;
    }
    setQuery('');
    setEditing(false);
    input?.blur();
    if (context) onClose();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!results.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (i + step + results.length) % results.length);
    } else if (event.key === 'Enter') {
      const hit = results[active];
      if (hit) choose(hit.selection, event.currentTarget);
    } else if (event.key === 'Escape' && typed) {
      // First Esc clears what was typed; the app's handler blurs on the next one.
      event.stopPropagation();
      setQuery('');
    }
  };

  const activeId = showList && results[active] ? `${listId}-${active}` : undefined;

  return (
    <div className="panel__search">
      <input
        ref={inputRef}
        type="text"
        className="search-input"
        placeholder="Search pipelines, chokepoints, places"
        aria-label="Search"
        role="combobox"
        aria-expanded={showList}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={activeId}
        value={value}
        onChange={(event) => {
          setQuery(event.target.value);
          setActive(0);
        }}
        onFocus={(event) => {
          // Start from what the bar shows, selected, so typing replaces it.
          if (!editing && context) {
            setQuery(context);
            const input = event.currentTarget;
            requestAnimationFrame(() => input.select());
          }
          setEditing(true);
        }}
        onBlur={() => setEditing(false)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        spellCheck={false}
      />
      {value ? (
        <button
          type="button"
          className="icon-button search-clear"
          aria-label={typed || !context ? 'Clear search' : 'Close'}
          title={typed || !context ? 'Clear search' : 'Close  Esc'}
          // mousedown, so the input's blur doesn't run first and swap what the button does.
          onMouseDown={(event) => {
            event.preventDefault();
            clearOrClose(event.currentTarget.closest('.panel__search')?.querySelector('input') ?? null);
          }}
          onClick={(event) => {
            // Keyboard activation (Enter or Space on the focused button).
            if (event.detail === 0) clearOrClose(event.currentTarget.closest('.panel__search')?.querySelector('input') ?? null);
          }}
        >
          <XIcon size={16} />
        </button>
      ) : (
        <kbd className="search-hint" aria-hidden="true">/</kbd>
      )}
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
                <AssetIcon kind={r.selection.kind} commodity={r.commodity} />
                <span className="search-results__text">
                  <span className="search-results__name">{r.name}</span>
                  <span className="search-results__detail">{r.detail}</span>
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
