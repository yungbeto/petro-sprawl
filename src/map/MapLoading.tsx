import { useEffect, useState } from 'react';
import { Globe } from '../app/Globe';
import { GLOBE } from '../lib/config';

/**
 * Centred in the map while the data loads, flat on the map's ground: the globe, larger, turning faster.
 * Fades out once the data is in, then leaves the page.
 */
export function MapLoading({ loading, theme }: { loading: boolean; theme: string }) {
  const [shown, setShown] = useState(loading);
  useEffect(() => {
    if (loading) {
      setShown(true);
      return;
    }
    // Leaves after the fade; a timer rather than transitionend, which never fires with motion reduced.
    const timer = setTimeout(() => setShown(false), GLOBE.loader.fadeMs);
    return () => clearTimeout(timer);
  }, [loading]);
  if (!shown) return null;
  return (
    <div
      className={`map-loading${loading ? '' : ' map-loading--done'}`}
      role="status"
      aria-live="polite"
    >
      <Globe size={GLOBE.loader.size} dots={GLOBE.loader.dots} fill={GLOBE.loader.fill} secondsPerTurn={GLOBE.loader.secondsPerTurn} className="map-loading__globe" theme={theme} />
      <p className="map-loading__text">{loading ? 'Loading pipelines, terminals and flows' : 'Loaded'}</p>
    </div>
  );
}
