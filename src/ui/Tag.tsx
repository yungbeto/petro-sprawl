// A tag (docs/design-system.md): a small static label beside a name, never a control. Square corners say
// it isn't clickable; chips and the news's place links are round. Styles in src/styles/components/pill.css.

import type { ReactNode } from 'react';

export function Tag({ children, className }: { children: ReactNode; className?: string }) {
  return <span className={className ? `tag ${className}` : 'tag'}>{children}</span>;
}
