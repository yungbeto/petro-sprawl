// Small print (docs/design-system.md). `note`: an aside under a list or a figure. `source`: where a page's
// figures come from, closing it under a rule. `unreviewed`: under a claim or a source the pipeline added
// without a person checking it. `caption`: the finest print, under a card. Styles in src/styles/components/note.css.

import type { ReactNode } from 'react';

const KIND_CLASS = { note: 'note', source: 'source', unreviewed: 'note note--unreviewed', caption: 'note--caption' } as const;

export function Note({ kind = 'note', className, children }: { kind?: keyof typeof KIND_CLASS; className?: string; children: ReactNode }) {
  return <p className={[KIND_CLASS[kind], className].filter(Boolean).join(' ')}>{children}</p>;
}
