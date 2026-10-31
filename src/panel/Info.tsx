import { useEffect, useId, useRef, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { InfoIcon } from '@phosphor-icons/react';

/** Space kept between the popover and the screen's edges, and below the button. */
const EDGE_PX = 8;

/**
 * An ⓘ button that opens a short explanation: how a figure is made, what it leaves out. The text a
 * reader needs every time stays on the page; this holds what they need once. A native popover, so
 * Escape and a tap outside close it.
 */
export function Info({ label, children }: { label: string; children: ReactNode }) {
  const id = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Below the button, kept on screen; above it when there's no room below.
  const place = () => {
    const button = buttonRef.current?.getBoundingClientRect();
    const popover = popoverRef.current;
    if (!button || !popover) return;
    const { width, height } = popover.getBoundingClientRect();
    const left = Math.min(Math.max(EDGE_PX, button.left + button.width / 2 - width / 2), window.innerWidth - width - EDGE_PX);
    const below = button.bottom + EDGE_PX;
    const top = below + height <= window.innerHeight - EDGE_PX ? below : Math.max(EDGE_PX, button.top - EDGE_PX - height);
    popover.style.left = `${left}px`;
    popover.style.top = `${top}px`;
    // Shown only once placed, so it never flashes at the corner first.
    popover.dataset.placed = 'true';
  };

  // It follows its button as the panel scrolls; a resize closes it. Escape closes it before the app
  // sees the key, which would otherwise also step the panel back.
  useEffect(() => {
    const isOpen = () => popoverRef.current?.matches(':popover-open') ?? false;
    const follow = () => isOpen() && place();
    const close = () => isOpen() && popoverRef.current?.hidePopover();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape' || !isOpen()) return;
      event.stopPropagation();
      close();
    };
    window.addEventListener('scroll', follow, { capture: true, passive: true });
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => {
      window.removeEventListener('scroll', follow, { capture: true });
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKeyDown, { capture: true });
    };
  }, []);

  return (
    <>
      <button ref={buttonRef} type="button" className="info" popoverTarget={id} aria-label={label} title={label}>
        <InfoIcon size={16} aria-hidden="true" />
      </button>
      {createPortal(
        <div
          ref={popoverRef}
          id={id}
          popover="auto"
          className="info-popover"
          role="note"
          aria-label={label}
          onToggle={(event) => {
            if (event.newState === 'open') place();
            else delete popoverRef.current?.dataset.placed;
          }}
        >
          {children}
        </div>,
        document.body,
      )}
    </>
  );
}
