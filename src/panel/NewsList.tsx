// Headlines laid out like a news site's latest list (SPEC M9): the outlet and age over the headline, linking
// to the article, then the places on the map it names, each opening that place. Home leads with the newest
// one larger; an asset's detail lists them evenly. Shared so the two read the same.

import { useId } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import type { HomeHeadline } from '../lib/headlines';
import { publisherLabel } from '../lib/headlines';
import { dateAgo } from '../lib/summary';
import { AssetIcon } from './AssetIcon';

export function NewsList({
  rows,
  data,
  now,
  onSelect,
  lead = false,
}: {
  rows: HomeHeadline[];
  data: Datasets;
  now: Date;
  onSelect: (selection: Selection) => void;
  /** Set the newest one larger, as Home does. */
  lead?: boolean;
}) {
  const id = useId();
  const commodityOf = (pipelineId: string) => data.pipelines.find((p) => p.id === pipelineId)?.commodity;
  return (
    <ol className="news" aria-label="Headlines, newest first">
      {rows.map(({ headline, assets }, i) => (
        <li key={headline.url} className={lead && i === 0 ? 'news__item news__item--lead' : 'news__item'}>
          <article aria-labelledby={`${id}-${i}`}>
            <p className="news__kicker">
              <span className="news__publisher">{publisherLabel(headline.publisher)}</span>
              {' · '}
              <time dateTime={headline.publishedAt}>{dateAgo(headline.publishedAt, now)}</time>
            </p>
            <h4 className="news__title" id={`${id}-${i}`}>
              <a href={headline.url} target="_blank" rel="noopener noreferrer">
                {headline.title}
              </a>
            </h4>
            {assets.length > 0 && (
              <p className="news__assets">
                {assets.map((a) => (
                  <button key={`${a.selection.kind}/${a.selection.id}`} type="button" className="news__asset" onClick={() => onSelect(a.selection)}>
                    <AssetIcon kind={a.selection.kind} commodity={commodityOf(a.selection.id)} />
                    {a.name}
                  </button>
                ))}
              </p>
            )}
          </article>
        </li>
      ))}
    </ol>
  );
}
