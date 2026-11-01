import { CaretRightIcon } from '@phosphor-icons/react';
import { VIEW_ICONS } from '../app/viewIcons';
import { VIEW_LABELS, type ViewId } from '../lib/views';

/** Phones: the sections that don't fit in the tab bar, each with its icon and name (SPEC M10). */
export function MoreView({ views, current, onOpen }: { views: ViewId[]; current: ViewId | null; onOpen: (view: ViewId) => void }) {
  return (
    <section className="section">
      <h2 className="detail__title">More</h2>
      <ul className="view-list" aria-label="More sections">
        {views.map((id) => {
          const Icon = VIEW_ICONS[id];
          return (
            <li key={id}>
              <button type="button" className="view-row more-row" aria-current={current === id ? 'page' : undefined} onClick={() => onOpen(id)}>
                <Icon size={24} weight={current === id ? 'fill' : 'regular'} aria-hidden="true" />
                <span className="view-row__name">{VIEW_LABELS[id]}</span>
                <CaretRightIcon size={16} aria-hidden="true" className="more-row__caret" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
