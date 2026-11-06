// A segmented control (docs/design-system.md): one choice of a few, as a radio group. Name it with
// `labelledBy` (a visible label's id) or `label` (for screen readers only). Styles in pill.css.

export function SegmentedOptions<T extends string>({
  options,
  labels,
  value,
  onChange,
  label,
  labelledBy,
}: {
  options: readonly T[];
  labels: Record<T, string>;
  value: T;
  onChange: (next: T) => void;
  label?: string;
  labelledBy?: string;
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={labelledBy ? undefined : label} aria-labelledby={labelledBy}>
      {options.map((o) => (
        <button key={o} type="button" role="radio" aria-checked={value === o} className="segmented__option" onClick={() => onChange(o)}>
          {labels[o]}
        </button>
      ))}
    </div>
  );
}
