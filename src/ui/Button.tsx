// Buttons (docs/design-system.md). Two kinds: an icon button (an icon alone, named by `label`, with a 40px hit
// area whatever it draws at) and a text button (an action that reads like a link: show more, see changes).
// Styles in src/styles/components/button.css.

import type { ButtonHTMLAttributes, ReactNode, Ref } from 'react';

type ButtonProps = Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className'> & { className?: string; ref?: Ref<HTMLButtonElement> };

/**
 * An icon alone. `label` names it for screen readers; `title` adds a hover hint, such as its shortcut.
 * 28px in a row of controls, 32px in a bar (the panel's back and close), 40px in the header.
 */
export function IconButton({
  label,
  size = 'sm',
  className,
  children,
  ...rest
}: ButtonProps & { label: string; size?: 'sm' | 'md' | 'lg'; children: ReactNode }) {
  const classes = ['icon-button', size !== 'sm' && `icon-button--${size}`, className].filter(Boolean).join(' ');
  return (
    <button type="button" className={classes} aria-label={label} {...rest}>
      {children}
    </button>
  );
}

/** An action set as underlined text, inline or under a list. */
export function TextButton({ className, children, ...rest }: ButtonProps & { children: ReactNode }) {
  return (
    <button type="button" className={['link-button', className].filter(Boolean).join(' ')} {...rest}>
      {children}
    </button>
  );
}
