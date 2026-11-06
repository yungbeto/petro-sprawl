import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type ReactNode, type Ref } from 'react';
import { Chip } from '../ui/Chip';
import { MagnifyingGlassIcon, XIcon } from '@phosphor-icons/react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import {
  SEARCH_GROUP_LABELS,
  ENABLED_SEARCH_SCOPES,
  SEARCH_SCOPE_LABELS,
  buildSearchIndex,
  groupResults,
  normalize,
  search,
  zipEntry,
  type SearchEntry,
  type SearchScope,
} from '../lib/search';
import { ENABLED_VIEWS, VIEW_LABELS, type ViewId } from '../lib/views';
import { FEATURES, SEARCH } from '../lib/config';
import { AssetIcon } from './AssetIcon';
import { HOME_ICON, VIEW_ICONS } from '../app/viewIcons';

// Places and ZIP codes open fuel origins, so they're offered only while it's on.
const PLACEHOLDER = FEATURES.fuelOrigins
  ? 'Search pipelines, chokepoints, places, ZIP codes'
  : FEATURES.gasStorage
    ? 'Search pipelines, chokepoints, terminals, countries'
    : 'Search pipelines, chokepoints, terminals, basins';

interface SearchBarProps {
  onOpen: () => void;
  buttonRef: Ref<HTMLButtonElement>;
}

/** The header's search: a button that opens the search dialog. The panel's own bar handles back and close. */
export function SearchBar({ onOpen, buttonRef }: SearchBarProps) {
  return (
    <div className="search-bar" role="search">
      <button ref={buttonRef} type="button" className="search-bar__trigger" onClick={onOpen} aria-haspopup="dialog">
        <MagnifyingGlassIcon size={24} className="search-bar__icon" aria-hidden="true" />
        <span className="search-bar__placeholder">{PLACEHOLDER}</span>
        <kbd className="search-hint" aria-hidden="true">
          /
        </kbd>
      </button>
    </div>
  );
}

interface Item {
  key: string;
  name: string;
  detail: string;
  icon: ReactNode;
  run: () => void;
}

interface ItemGroup {
  label: string;
  items: Item[];
}

interface SearchDialogProps {
  data: Datasets;
  onSelect: (selection: Selection) => void;
  onView: (view: ViewId | null) => void;
  onClose: () => void;
  /** The scope it opens on: all, or one kind when a surface opens it ("find your region"). */
  initialScope?: SearchScope;
}

/**
 * Search everything in one box, over the app: results grouped by kind, narrowed to one kind with the
 * scope row, and the app's views when the box is empty. Arrow keys move, Enter opens, Esc or the
 * close button closes.
 */
export function SearchDialog({ data, onSelect, onView, onClose, initialScope = 'all' }: SearchDialogProps) {
  const index = useMemo(() => buildSearchIndex(data), [data]);
  const [query, setQuery] = useState('');
  const [scope, setScope] = useState<SearchScope>(initialScope);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listId = useId();

  useEffect(() => inputRef.current?.focus(), []);

  const groups = useMemo((): ItemGroup[] => {
    const q = normalize(query);
    const entryItem = (e: SearchEntry): Item => ({
      key: `${e.selection.kind}/${e.selection.id}/${e.name}`,
      name: e.name,
      detail: e.detail,
      icon: <AssetIcon kind={e.selection.kind} commodity={e.commodity} />,
      run: () => onSelect(e.selection),
    });
    const views: ItemGroup[] =
      scope === 'all'
        ? [
            {
              label: 'Views',
              items: [
                { id: null, label: 'Home' },
                ...ENABLED_VIEWS.map((id) => ({ id, label: VIEW_LABELS[id] })),
              ]
                .filter((v) => !q || normalize(v.label).startsWith(q))
                .map((v) => {
                  const Icon = v.id ? VIEW_ICONS[v.id] : HOME_ICON;
                  return {
                    key: `view/${v.id ?? 'home'}`,
                    name: v.label,
                    detail: v.id ? 'View' : 'The summary',
                    icon: (
                      <span className="asset-icon" aria-hidden="true">
                        <Icon size={16} />
                      </span>
                    ),
                    run: () => onView(v.id),
                  };
                }),
            },
          ]
        : [];
    if (!q) {
      // Empty: the views, or a scope's first entries to browse.
      if (scope === 'all') return views;
      const browse = [...index].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
      return groupResults(browse, scope).map((g) => ({ label: g.label, items: g.entries.map(entryItem) }));
    }
    const zip = zipEntry(data, query);
    const found = zip
      ? scope === 'all' || scope === 'us-places'
        ? [{ label: SEARCH_GROUP_LABELS.region, items: [entryItem(zip)] }]
        : []
      : groupResults(search(index, query, SEARCH.limit), scope).map((g) => ({ label: g.label, items: g.entries.map(entryItem) }));
    return [...found, ...views].filter((g) => g.items.length > 0);
  }, [data, index, query, scope, onSelect, onView]);

  const items = groups.flatMap((g) => g.items);
  const activeIndex = Math.min(active, items.length - 1);
  const activeItem = items[activeIndex];
  const activeId = activeItem ? `${listId}-${activeIndex}` : undefined;

  // Keep the active result in sight as the arrow keys move past the list's edge.
  useEffect(() => {
    if (activeId) document.getElementById(activeId)?.scrollIntoView({ block: 'nearest' });
  }, [activeId]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!items.length) return;
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setActive((i) => (Math.min(i, items.length - 1) + step + items.length) % items.length);
    } else if (event.key === 'Enter' && event.target === inputRef.current) {
      event.preventDefault();
      activeItem?.run();
    }
  };

  // Esc closes from anywhere, not only from inside the dialog: a click on a heading or the dialog's
  // padding moves focus to the page behind.
  useEffect(() => {
    const onEscape = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [onClose]);

  let n = -1;
  return (
    <>
      <div className="search-scrim" onClick={onClose} aria-hidden="true" />
      <div className="search-dialog" role="dialog" aria-modal="true" aria-label="Search" onKeyDown={onKeyDown}>
        <div className="search-dialog__field">
          <MagnifyingGlassIcon size={24} className="search-bar__icon" aria-hidden="true" />
          <input
            ref={inputRef}
            type="text"
            className="search-dialog__input"
            placeholder={PLACEHOLDER}
            aria-label="Search"
            role="combobox"
            aria-expanded={items.length > 0}
            aria-controls={listId}
            aria-autocomplete="list"
            aria-activedescendant={activeId}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setActive(0);
            }}
            autoComplete="off"
            spellCheck={false}
          />
          <button type="button" className="icon-button search-dialog__close" onClick={onClose} aria-label="Close search" title="Close  Esc">
            <XIcon size={18} />
          </button>
        </div>
        <div className="search-dialog__scopes" role="toolbar" aria-label="Search in">
          {ENABLED_SEARCH_SCOPES.map((s) => (
            <Chip
              key={s}
              size="sm"
              pressed={scope === s}
              onClick={() => {
                setScope(s);
                setActive(0);
                inputRef.current?.focus();
              }}
            >
              {SEARCH_SCOPE_LABELS[s]}
            </Chip>
          ))}
        </div>
        {items.length === 0 ? (
          <p className="search-dialog__empty muted">
            {/^\d{5}$/.test(query.trim()) ? "That ZIP code isn't in our table. Try your state or city." : 'No matches'}
          </p>
        ) : (
          <ul className="search-dialog__results" id={listId} role="listbox" aria-label="Search results">
            {groups.map((group) => (
              <li key={group.label} role="presentation">
                <p className="search-dialog__group" aria-hidden="true">
                  {group.label}
                </p>
                <ul role="group" aria-label={group.label} className="search-dialog__group-list">
                  {group.items.map((item) => {
                    n += 1;
                    const i = n;
                    return (
                      <li
                        key={item.key}
                        id={`${listId}-${i}`}
                        role="option"
                        aria-selected={item === activeItem}
                        className="search-results__item"
                        // mousedown, so the pick lands before the input loses focus.
                        onMouseDown={(event) => {
                          event.preventDefault();
                          item.run();
                        }}
                        onMouseMove={() => setActive(i)}
                      >
                        {item.icon}
                        <span className="search-results__text">
                          <span className="search-results__name">{item.name}</span>
                          <span className="search-results__detail">{item.detail}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))}
          </ul>
        )}
        <p className="search-dialog__footer" aria-hidden="true">
          <kbd>↑</kbd> <kbd>↓</kbd> to move · <kbd>Enter</kbd> to open · <kbd>Esc</kbd> to close
        </p>
      </div>
    </>
  );
}
