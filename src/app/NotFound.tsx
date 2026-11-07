import { ArrowLeftIcon } from '@phosphor-icons/react';
import { useRef } from 'react';
import { GLOBE, NOT_FOUND_OIL, SITE } from '../lib/config';
import { Globe } from './Globe';
import { OilSlosh } from './OilSlosh';
import { useTheme } from './useTheme';

/** The 404 page: what was asked for, a way back to the map, and oil across the bottom that the pointer stirs. */
export function NotFound() {
  const { theme } = useTheme();
  const pageRef = useRef<HTMLDivElement>(null);
  // The path asked for; none when the page is opened by its own name.
  const asked = window.location.pathname + window.location.search;
  const path = window.location.pathname === '/404.html' ? '' : asked;
  return (
    <div ref={pageRef} className="not-found">
      <header className="not-found__bar">
        <a className="not-found__brand" href="/">
          <Globe size={GLOBE.size} dots={GLOBE.dots} className="brand-mark" theme={theme} />
          {SITE.name}
        </a>
      </header>
      <main className="not-found__main">
        <p className="mono not-found__code">
          404{path && <span className="not-found__path">{path}</span>}
        </p>
        <h1 className="t-display not-found__title">Nothing flows here</h1>
        <p className="t-body muted">This page doesn't exist, or it has moved. The map is right where you left it.</p>
        <a className="not-found__home" href="/">
          <ArrowLeftIcon size={16} aria-hidden="true" />
          Back to the map
        </a>
      </main>
      <div className="not-found__tank">
        {/* Just above the oil at rest, and under it in the drawing order, so a big wave rolls over it. */}
        <p className="t-note not-found__hint" style={{ bottom: NOT_FOUND_OIL.depthPx + 20 }} aria-hidden="true">
          <span className="not-found__hint-pointer">Stir the oil while you're here</span>
          <span className="not-found__hint-touch">Drag across the oil while you're here</span>
        </p>
        <OilSlosh stirTarget={pageRef} theme={theme} tank={NOT_FOUND_OIL} className="not-found__oil" />
      </div>
    </div>
  );
}
