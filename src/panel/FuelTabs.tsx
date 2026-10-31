import { useId, type KeyboardEvent, type ReactNode } from 'react';
import { REGION_FUELS, REGION_FUEL_LABELS, type RegionFuel } from '../lib/config';

/**
 * The fuels as tabs on one line, scrolling sideways when they don't fit. Arrow keys, Home and End
 * move between them and select as they go; the content below is the tab panel.
 */
export function FuelTabs({ fuel, onFuel, children }: { fuel: RegionFuel; onFuel: (fuel: RegionFuel) => void; children: ReactNode }) {
  const id = useId();
  const tabId = (f: RegionFuel) => `${id}-${f}`;

  const select = (f: RegionFuel) => {
    onFuel(f);
    const tab = document.getElementById(tabId(f));
    tab?.focus();
    tab?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  };

  const onKeyDown = (event: KeyboardEvent) => {
    const i = REGION_FUELS.indexOf(fuel);
    const last = REGION_FUELS.length - 1;
    const next =
      event.key === 'ArrowRight' ? (i === last ? 0 : i + 1)
      : event.key === 'ArrowLeft' ? (i === 0 ? last : i - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    select(REGION_FUELS[next]!);
  };

  return (
    <>
      <div className="fuel-tabs" role="tablist" aria-label="Fuel" onKeyDown={onKeyDown}>
        {REGION_FUELS.map((f) => (
          <button
            key={f}
            id={tabId(f)}
            type="button"
            role="tab"
            className="fuel-tabs__tab"
            aria-selected={f === fuel}
            aria-controls={`${id}-panel`}
            tabIndex={f === fuel ? 0 : -1}
            onClick={() => select(f)}
          >
            {REGION_FUEL_LABELS[f]}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={tabId(fuel)}>
        {children}
      </div>
    </>
  );
}
