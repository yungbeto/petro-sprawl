// A card (docs/design-system.md): 16px inside, 8px corners, a hairline ring. Static by default; `interactive`
// for a card that is itself a button (the surfaces' list cards); `subtle` for a tinted fill (Home's update
// cards). Styles in src/styles/components/card.css.

import { createElement, type HTMLAttributes, type ReactNode } from 'react';

type CardTag = 'div' | 'section' | 'article' | 'li' | 'dl' | 'button';

/** The card's classes, for markup that can't use the component. */
export function cardClass({ interactive = false, subtle = false, className }: { interactive?: boolean; subtle?: boolean; className?: string } = {}): string {
  return ['card', interactive && 'card--interactive', subtle && 'card--subtle', className].filter(Boolean).join(' ');
}

export function Card({
  as = 'div',
  interactive,
  subtle,
  className,
  children,
  ...rest
}: {
  as?: CardTag;
  interactive?: boolean;
  subtle?: boolean;
  className?: string;
  children: ReactNode;
} & HTMLAttributes<HTMLElement>) {
  const props = { ...rest, className: cardClass({ interactive, subtle, className }), ...(as === 'button' ? { type: 'button' as const } : {}) };
  return createElement(as, props, children);
}
