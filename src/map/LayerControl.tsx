import { useEffect, useRef } from 'react';
import type { LayerId, LayerVisibility } from './layers';

const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'storage', label: 'EU gas storage' },
  { id: 'basins', label: 'Basins' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'chokepoints', label: 'Chokepoints' },
];

interface LayerControlProps {
  open: boolean;
  onToggleOpen: () => void;
  onClose: () => void;
  visibility: LayerVisibility;
  onChange: (id: LayerId, visible: boolean) => void;
  counts: Record<LayerId, number>;
}

/** A small button in the map's bottom-left corner; the layer list opens above it. */
export function LayerControl({ open, onToggleOpen, onClose, visibility, onChange, counts }: LayerControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // A click anywhere else closes the list.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onClose();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [open, onClose]);

  return (
    <div ref={rootRef} className="layer-control">
      {open && (
        <ul className="layer-control__list" id="layer-list" aria-label="Layers">
          {LAYERS.map(({ id, label }) => (
            <li key={id}>
              <label className="layer-control__item">
                <input
                  type="checkbox"
                  checked={visibility[id]}
                  onChange={(event) => onChange(id, event.target.checked)}
                />
                <span>{label}</span>
                <span className="layer-control__count mono">{counts[id] || 'no data'}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
      <button
        type="button"
        className="layer-control__toggle"
        aria-expanded={open}
        aria-controls="layer-list"
        onClick={onToggleOpen}
        title="Layers  L"
      >
        <LayersIcon />
        Layers
      </button>
    </div>
  );
}

function LayersIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 2.5 14 5.75 8 9 2 5.75z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M2 8.75 8 12l6-3.25" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
