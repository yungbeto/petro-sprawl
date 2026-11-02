import { GLOBE } from '../lib/config';
import { Globe } from './Globe';

/** The header mark: the globe at badge size. `theme` redraws a still globe when the colors change. */
export function GlobeMark({ theme }: { theme: string }) {
  return <Globe size={GLOBE.size} dots={GLOBE.dots} className="brand-mark" theme={theme} />;
}
