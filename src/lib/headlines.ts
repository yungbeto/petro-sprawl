// "In the news" on Home (added 2026-11-03) and on each asset's detail (2026-11-04): the headlines the news
// scan matched to the map, each with the mapped assets it names, so a click opens one. Headlines naming
// nothing that loaded are left out of Home. Pure.

import type { Selection } from '../app/urlState';
import { NEWS } from './config';
import { resolveSelection, type Datasets } from './data';
import type { NewsHeadline } from '../types';

export interface HomeHeadline {
  headline: NewsHeadline;
  assets: { selection: Selection; name: string }[];
}

export function homeHeadlines(data: Datasets, limit: number = NEWS.headlinesShown): HomeHeadline[] {
  const rows: HomeHeadline[] = [];
  for (const headline of data.newsHeadlines) {
    const assets = namedAssets(headline, data);
    if (assets.length) rows.push({ headline, assets });
    if (rows.length === limit) break;
  }
  return rows;
}

/**
 * An asset's own "In the news" (added 2026-11-04): the headlines naming it, newest first, up to `limit`,
 * each with the other mapped assets it names (the open one is left out: it's the page you're on).
 */
export function assetHeadlines(data: Datasets, selection: Selection, limit: number = NEWS.headlinesPerAsset): HomeHeadline[] {
  const ref = `${selection.kind}/${selection.id}`;
  return data.newsHeadlines
    .filter((h) => h.refs.includes(ref))
    .slice(0, limit)
    .map((headline) => ({ headline, assets: namedAssets(headline, data).filter((a) => `${a.selection.kind}/${a.selection.id}` !== ref) }));
}

/** The mapped assets a headline names that are loaded, so each can open. */
function namedAssets(headline: NewsHeadline, data: Datasets): HomeHeadline['assets'] {
  return headline.refs.flatMap((ref) => {
    const [kind, id] = ref.split('/') as [Selection['kind'], string];
    const selection = { kind, id } as Selection;
    const resolved = resolveSelection(selection, data);
    return resolved ? [{ selection, name: resolved.item.name }] : [];
  });
}

/**
 * A publisher as a reader would name it. Feeds sometimes give a web address ("www.example.com",
 * "https://example.com/"), or a site's whole page title: "ABC News - Breaking News, Latest News and Videos"
 * puts the name first, "Crude Oil Prices Today | OilPrice.com" puts it last as an address. A title split by
 * " - " or " | " keeps its address part if it has one, otherwise its first part.
 */
export function publisherLabel(publisher: string): string {
  const parts = publisher.trim().split(/\s+[-|–—]\s+/);
  const name = (parts.length > 1 ? (parts.find((p) => !/\s/.test(p) && /\.[a-z]{2,}\/?$/i.test(p)) ?? parts[0]!) : parts[0]!).trim();
  if (/\s/.test(name) || !/\./.test(name)) return name;
  try {
    return new URL(/^https?:\/\//.test(name) ? name : `https://${name}`).hostname.replace(/^www\./, '');
  } catch {
    return name;
  }
}
