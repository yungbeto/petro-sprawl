// Vercel Web Analytics (added 2026-11-02 at the owner's request): page views only, cookieless. The page is
// one URL whose query is the state, so a view is the surface and the open item; the camera (`at`) changes
// on every pan and is left out, and the same view twice in a row counts once. Pure.

interface Pageview {
  type: 'pageview' | 'event';
  url: string;
}

/** A page view's URL without the camera. */
export function pageviewUrl(url: string): string {
  const u = new URL(url);
  u.searchParams.delete('at');
  return u.toString();
}

/** A `beforeSend` that drops the camera and repeats of the view just counted. */
export function pageviewFilter<E extends Pageview>(): (event: E) => E | null {
  let last: string | null = null;
  return (event) => {
    if (event.type !== 'pageview') return event;
    const url = pageviewUrl(event.url);
    if (url === last) return null;
    last = url;
    return { ...event, url };
  };
}
