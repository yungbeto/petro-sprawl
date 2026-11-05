// Headlines laid out like a news site's latest list (SPEC M9): the outlet and age over the headline, linking
// to the article, then the places on the map it names, each opening that place. Home leads with the newest
// one larger; an asset's detail lists them evenly. Shared so the two read the same.

import { useId, useMemo, useState } from 'react';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import type { HomeHeadline } from '../lib/headlines';
import { publisherLabel } from '../lib/headlines';
import { dateAgo } from '../lib/summary';
import { THUMBNAIL } from '../lib/config';
import { headlineFrame, headlineThumb } from '../lib/thumbnail';
import { useShowOnMap } from '../app/showOnMap';
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
          <article className="news__story" aria-labelledby={`${id}-${i}`}>
            <HeadlineThumb refs={headline.refs} data={data} />
            <p className="news__kicker">
              {headline.icon && <PublisherIcon icon={headline.icon} />}
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

/** The publisher's icon, saved by the news scan and served from this site; gone if it fails to load. */
function PublisherIcon({ icon }: { icon: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;
  return (
    <img
      className="news__icon"
      src={`${import.meta.env.BASE_URL}${icon}`}
      alt=""
      width={14}
      height={14}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
    />
  );
}

/**
 * A small map of the places the headline names (src/lib/thumbnail.ts), in the map's colors. In the app it's
 * a button that moves the map to the same square without opening anything (added 2026-11-05); the picture
 * itself is hidden from screen readers, since the button's label and the chips name the places.
 */
function HeadlineThumb({ refs, data }: { refs: string[]; data: Datasets }) {
  const showOnMap = useShowOnMap();
  const thumb = useMemo(() => headlineThumb(refs, data), [refs, data]);
  if (!thumb) return null;
  const picture = <ThumbPicture thumb={thumb} />;
  if (!showOnMap) return <span className="news__thumb">{picture}</span>;
  const label = `Show ${listNames(thumb.names)} on the map`;
  return (
    <button
      type="button"
      className="news__thumb news__thumb--button"
      aria-label={label}
      title={label}
      onClick={() => {
        const corners = headlineFrame(refs, data);
        if (corners) showOnMap(corners);
      }}
    >
      {picture}
    </button>
  );
}

/** "A", "A and B", "A, B and C": the places a thumbnail shows, for its label. */
function listNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? 'this place';
  return `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`;
}

function ThumbPicture({ thumb }: { thumb: NonNullable<ReturnType<typeof headlineThumb>> }) {
  const { size } = THUMBNAIL;
  return (
    <svg className="news__thumb-svg" viewBox={`0 0 ${size} ${size}`} aria-hidden="true" focusable="false">
      <path className="news__thumb-land" d={thumb.land} />
      {thumb.marks.map((m, i) =>
        m.kind === 'line' ? (
          <g key={i} className={`news__thumb-mark news__thumb-mark--${m.tone}`}>
            <path className="news__thumb-halo" d={m.d} />
            <path className="news__thumb-line" d={m.d} />
          </g>
        ) : (
          <circle
            key={i}
            className={`news__thumb-mark news__thumb-mark--${m.tone} news__thumb-${m.kind}`}
            cx={m.x}
            cy={m.y}
            r={m.kind === 'ring' ? 5 : 3.5}
          />
        ),
      )}
    </svg>
  );
}
