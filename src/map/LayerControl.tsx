import type { LayerId, LayerVisibility } from './layers';

const LAYERS: { id: LayerId; label: string }[] = [
  { id: 'basins', label: 'Basins' },
  { id: 'pipelines', label: 'Pipelines' },
  { id: 'chokepoints', label: 'Chokepoints' },
];

interface LayerControlProps {
  open: boolean;
  onToggleOpen: () => void;
  visibility: LayerVisibility;
  onChange: (id: LayerId, visible: boolean) => void;
  counts: Record<LayerId, number>;
}

export function LayerControl({ open, onToggleOpen, visibility, onChange, counts }: LayerControlProps) {
  return (
    <div className="layer-control">
      <button
        type="button"
        className="layer-control__toggle"
        aria-expanded={open}
        onClick={onToggleOpen}
        title="Layers  L"
      >
        Layers
      </button>
      {open && (
        <ul className="layer-control__list">
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
    </div>
  );
}
