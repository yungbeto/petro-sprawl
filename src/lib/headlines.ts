// Home's "In the news" (added 2026-11-03): the newest headlines the news scan matched to the map, each
// with the mapped assets it names, so a click opens one. Headlines naming nothing that loaded are left
// out. Pure.

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
    const assets = headline.refs.flatMap((ref) => {
      const [kind, id] = ref.split('/') as [Selection['kind'], string];
      const selection = { kind, id } as Selection;
      const resolved = resolveSelection(selection, data);
      return resolved ? [{ selection, name: resolved.item.name }] : [];
    });
    if (assets.length) rows.push({ headline, assets });
    if (rows.length === limit) break;
  }
  return rows;
}
