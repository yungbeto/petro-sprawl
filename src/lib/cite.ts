// "Cite this page" (src/panel/detail/Cite.tsx): a citation for the page that's open, in plain text for a story,
// a footnote or a reading list. It names the page by its production link, without the camera, and the
// day it was read, since the page moves with the data. Pure.

import { SITE } from './config';

/** The page's production link: the query without the camera (`at`), on `SITE.url`. */
export function citeUrl(search: string, origin: string = SITE.url): string {
  const params = new URLSearchParams(search);
  params.delete('at');
  // Slashes and commas read as they do in the app's own links (sel=chokepoint/hormuz).
  const query = params.toString().replace(/%2F/gi, '/').replace(/%2C/gi, ',');
  return `${origin}/${query ? `?${query}` : ''}`;
}

/** `Petro Sprawl, "Strait of Hormuz" (chokepoint), https://….` */
export function citation({ title, kind, url }: { title: string; kind: string; url: string }): string {
  // The page's kind without its qualifiers: "Gas pipeline · corridor" is cited as a gas pipeline.
  const what = kind.split(' · ')[0]!.toLowerCase();
  return `${SITE.name}, "${title}" (${what}), ${url}.`;
}
