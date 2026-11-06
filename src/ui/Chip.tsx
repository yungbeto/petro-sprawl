// A chip (docs/design-system.md): a toggle button for a filter or a scope, pressed or not, with an optional
// count. `float` for chips over the map (lifted with the map controls' shadow); `sm` inside a dialog.
// Styles in src/styles/components/pill.css.

import type { ReactNode } from 'react';

export function Chip({
  pressed,
  onClick,
  count,
  size = 'md',
  float = false,
  title,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  count?: number;
  size?: 'sm' | 'md';
  float?: boolean;
  title?: string;
  children: ReactNode;
}) {
  const className = ['chip', size === 'sm' && 'chip--sm', float && 'chip--float'].filter(Boolean).join(' ');
  return (
    <button type="button" className={className} aria-pressed={pressed} title={title} onClick={onClick}>
      {children}
      {count !== undefined && <span className="chip__count">{count.toLocaleString('en-US')}</span>}
    </button>
  );
}
