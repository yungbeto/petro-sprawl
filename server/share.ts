// Shared by the link preview functions: the card a link is about, from this deployment's share index
// (dist/share/, built by jobs/build-share-index.ts).

import { parseUrlState, serializeUrlState } from '../src/app/urlState';
import { shareFile, shareKeys, type ShareCard, type ShareFile, type ShareIndex } from '../src/lib/share';

/** Per instance; the index only changes with a deploy, and a deploy starts new instances. */
const indexes = new Map<ShareFile, Promise<ShareIndex | null>>();

function loadIndex(origin: string, file: ShareFile): Promise<ShareIndex | null> {
  let index = indexes.get(file);
  if (!index) {
    index = fetch(new URL(`/share/${file}.json`, origin))
      .then((r) => (r.ok ? (r.json() as Promise<ShareIndex>) : null))
      .catch(() => null);
    indexes.set(file, index);
    // A failed read is tried again on the next request.
    index.then((value) => value ?? indexes.delete(file));
  }
  return index;
}

export interface FoundCard {
  card: ShareCard;
  /** The page's own query, without the camera or a filter: "?view=origins&sel=country/us". */
  query: string;
}

/** The card for a link to the app, or null for Home, an unknown page, or an index that didn't load. */
export async function findCard(url: URL): Promise<FoundCard | null> {
  const state = parseUrlState(url.search);
  const view = state.view ?? null;
  const file = shareFile(state.selection, view);
  if (!file) return null;
  const index = await loadIndex(url.origin, file);
  const key = index && shareKeys(state.selection, view, state.fuel).find((k) => k in index);
  if (!index || !key) return null;
  return { card: index[key]!, query: serializeUrlState({ view, selection: state.selection, fuel: state.fuel, camera: null }) };
}

/** CDN caching for both functions: fresh for six hours (data commits deploy, and a deploy starts over). */
export const SHARE_CACHE = 'public, max-age=0, s-maxage=21600, stale-while-revalidate=86400';
