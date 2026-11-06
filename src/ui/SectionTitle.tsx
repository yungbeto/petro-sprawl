// A heading and what sits beside it (docs/design-system.md): a count, an ⓘ (children, usually one
// <Info>), and an aside at the end of the row (a chart's band). The ⓘ sits beside the heading, not in it,
// so the heading's name stays its text. Three levels: `page` (a page's own name), `section` (a card or
// block on it) and `part` (a part of a country's page). Type in src/styles/text.css, the row in base.css.

import type { ReactNode } from 'react';

const LEVEL_CLASS = { page: 'detail__title', section: 'section__title', part: 'country-section__title' } as const;

export function SectionTitle({
  title,
  level = 'section',
  as,
  id,
  count,
  aside,
  className,
  children,
}: {
  title: ReactNode;
  level?: keyof typeof LEVEL_CLASS;
  /** Defaults to h2 for a page, h3 for the rest. */
  as?: 'h2' | 'h3';
  id?: string;
  /** How many things the section lists, set quieter after the name. */
  count?: number;
  /** At the end of the row; drops under the title when they don't fit. */
  aside?: ReactNode;
  className?: string;
  /** Beside the heading: its ⓘ. */
  children?: ReactNode;
}) {
  const Heading = as ?? (level === 'page' ? 'h2' : 'h3');
  const heading = (
    <Heading className={[LEVEL_CLASS[level], className].filter(Boolean).join(' ')} id={id}>
      {title}
      {count !== undefined && (
        <>
          {' '}
          <span className="section__count">{count.toLocaleString('en-US')}</span>
        </>
      )}
    </Heading>
  );
  if (!children && !aside) return heading;
  return (
    <div className="title-row">
      {aside && children ? (
        <span className="title-row__main">
          {heading}
          {children}
        </span>
      ) : (
        <>
          {heading}
          {children}
        </>
      )}
      {aside}
    </div>
  );
}
