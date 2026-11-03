import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { CaretLeftIcon, CaretRightIcon, NewspaperIcon } from '@phosphor-icons/react';
import type { Selection } from '../app/urlState';
import type { VisitChanges } from '../app/useVisitChanges';
import { FEATURES, HOME_HERO, MEASURED_CHANGES } from '../lib/config';
import type { Datasets } from '../lib/data';
import { homeHeadlines, publisherLabel } from '../lib/headlines';
import { describeChange, measuredChanges } from '../lib/measuredChanges';
import { dateAgo, firstSentence, lastReported, newestSource, quietSince, situation, type Situation } from '../lib/summary';
import { AssetIcon } from './AssetIcon';
import { Info } from './Info';
import { SourceLink } from './details';

interface HomeHeroProps {
  data: Datasets;
  visit: VisitChanges | null;
  now: Date;
  onSelect: (selection: Selection) => void;
  onShowChanges: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

type Ongoing = Situation['ongoing'][number];

/**
 * The top of Home, after "what's happening" feeds: what the site is in a line, a row of cards for the
 * disruptions in effect with the newest reports (when each was reported and by whom), then the others in
 * effect, then what the meters and ship counts show moving (SPEC M8).
 */
export function HomeHero({ data, visit, now, onSelect, onShowChanges }: HomeHeroProps) {
  const s = useMemo(() => situation(data), [data]);
  const changes = useMemo(() => measuredChanges(data, now), [data, now]);
  const headlines = useMemo(() => homeHeadlines(data), [data]);
  const [showAll, setShowAll] = useState(false);
  const [showAllChanges, setShowAllChanges] = useState(false);
  const shownChanges = showAllChanges ? changes : changes.slice(0, HOME_HERO.changesShown);
  const cards = s.ongoing.slice(0, HOME_HERO.cards);
  const rest = s.ongoing.slice(HOME_HERO.cards);
  const shown = showAll ? rest : rest.slice(0, HOME_HERO.disruptionsShown);
  const commodityOf = (id: string) => data.pipelines.find((p) => p.id === id)?.commodity;

  /** "Oil pipeline", "LNG export terminal": what kind of asset a disruption or a change is on. */
  const kindOf = ({ selection }: { selection: Selection }): string => {
    switch (selection.kind) {
      case 'pipeline': {
        const commodity = commodityOf(selection.id);
        return commodity === 'gas' ? 'Gas pipeline' : commodity === 'oil' ? 'Oil pipeline' : 'Pipeline';
      }
      case 'lng': {
        const facility = data.lngTerminals.find((t) => t.id === selection.id)?.facility;
        return facility ? `LNG ${facility} terminal` : 'LNG terminal';
      }
      case 'terminal':
        return 'Oil terminal';
      default:
        return 'Chokepoint';
    }
  };
  const cause = (o: Ongoing) => (o.disruption.cause !== 'other' ? o.disruption.cause : null);

  return (
    <section className="hero" aria-label="Situation">
      <div className="hero__top">
        <h2 className="hero__title">What's happening</h2>
        <time className="hero__date" dateTime={now.toISOString().slice(0, 10)}>
          {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
        </time>
      </div>
      <p className="hero__intro">Where oil and gas flows are disrupted now, each from a cited report.</p>
      {FEATURES.visitChanges && (
        <p className="hero__visit">
          {visit?.since ? (
            <button type="button" className="link-button" onClick={onShowChanges}>
              {plural(visit.changes.length, 'change')} since your last visit
            </button>
          ) : (
            <span>First visit on this browser</span>
          )}
        </p>
      )}

      {cards.length ? (
        <HeroCards
          cards={cards}
          now={now}
          byline={(o) => [kindOf(o), cause(o)].filter(Boolean).join(' · ')}
          onSelect={onSelect}
        />
      ) : (
        <p className="hero__headline">No disruptions in effect.</p>
      )}

      {headlines.length > 0 && (
        <section className="hero__rest" aria-labelledby="hero-news">
          <div className="title-row">
            <h3 className="section__title" id="hero-news">
              In the news
            </h3>
            <Info label="About the headlines">
              The newest headlines from GDELT and Google News that name a place on the map, as the feeds list them.
              They aren't reviewed: read the article before relying on it.
            </Info>
          </div>
          {/* Laid out like a news site's latest list: the outlet and age over the headline, the newest one larger,
              then the places on the map it names, each opening that place. */}
          <ol className="news" aria-label="Headlines, newest first">
            {headlines.map(({ headline, assets }, i) => (
              <li key={headline.url} className={i === 0 ? 'news__item news__item--lead' : 'news__item'}>
                <article aria-labelledby={`hero-news-${i}`}>
                  <p className="news__kicker">
                    <span className="news__publisher">{publisherLabel(headline.publisher)}</span>
                    {' · '}
                    <time dateTime={headline.publishedAt}>{dateAgo(headline.publishedAt, now)}</time>
                  </p>
                  <h4 className="news__title" id={`hero-news-${i}`}>
                    <a href={headline.url} target="_blank" rel="noopener noreferrer">
                      {headline.title}
                    </a>
                  </h4>
                  <p className="news__assets">
                    {assets.map((a) => (
                      <button
                        key={`${a.selection.kind}/${a.selection.id}`}
                        type="button"
                        className="news__asset"
                        onClick={() => onSelect(a.selection)}
                      >
                        <AssetIcon kind={a.selection.kind} commodity={commodityOf(a.selection.id)} />
                        {a.name}
                      </button>
                    ))}
                  </p>
                </article>
              </li>
            ))}
          </ol>
        </section>
      )}

      {rest.length > 0 && (
        <section className="hero__rest" aria-labelledby="hero-rest">
          <h3 className="section__title" id="hero-rest">
            Also in effect <span className="section__count">{rest.length}</span>
          </h3>
          <p className="hero__tally">{tally(s)}</p>
          <ul className="changes">
            {shown.map((o) => {
              const quiet = quietSince(o.disruption, now);
              return (
                <li key={o.disruption.id}>
                  <button type="button" className="change" onClick={() => onSelect(o.selection)}>
                    <AssetIcon kind={o.selection.kind} commodity={commodityOf(o.selection.id)} />
                    <span className="change__text">
                      <span className="change__name">{o.name}</span>
                      <span className="change__what">
                        {[kindOf(o), cause(o)].filter(Boolean).join(' · ')} · since <span className="mono">{o.disruption.startedAt}</span>
                        {quiet && (
                          <>
                            {' · '}no report since <span className="mono">{quiet}</span>
                          </>
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          {rest.length > shown.length && (
            <button type="button" className="link-button hero__more" onClick={() => setShowAll(true)}>
              Show all {rest.length}
            </button>
          )}
        </section>
      )}

      <section className="hero__rest" aria-labelledby="hero-measured">
        <div className="title-row">
          <h3 className="section__title" id="hero-measured">
            Measured changes {changes.length > 0 && <span className="section__count">{changes.length}</span>}
          </h3>
          <Info label="About measured changes">
            The latest {MEASURED_CHANGES.recentDays} days of meters and ship counts against the {MEASURED_CHANGES.priorDays / 7} weeks
            before. What moved, not why.
          </Info>
        </div>
        {changes.length === 0 && (
          <p className="hero__tally">Nothing past its threshold in the latest {MEASURED_CHANGES.recentDays} days of meters and ship counts.</p>
        )}
        {changes.length > 0 && (
          <ul className="changes">
            {shownChanges.map((c) => (
              <li key={`${c.selection.kind}/${c.selection.id}`}>
                <button type="button" className="change" onClick={() => onSelect(c.selection)}>
                  <AssetIcon kind={c.selection.kind} commodity={commodityOf(c.selection.id)} />
                  <span className="change__text">
                    <span className="change__name">{c.name}</span>
                    <span className="change__what">
                      {kindOf(c)} · {describeChange(c)} · to <span className="mono">{c.latestDate}</span> ({c.source.name})
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {changes.length > shownChanges.length && (
          <button type="button" className="link-button hero__more" onClick={() => setShowAllChanges(true)}>
            Show all {changes.length}
          </button>
        )}
      </section>
    </section>
  );
}

interface HeroCardsProps {
  cards: Ongoing[];
  now: Date;
  byline: (o: Ongoing) => string;
  onSelect: (selection: Selection) => void;
}

/**
 * The newest reports, one card per disruption, newest first, in a row that scrolls sideways. Each card is
 * narrower than the row so the next one peeks in; buttons and the arrow keys step a card at a time.
 */
function HeroCards({ cards, now, byline, onSelect }: HeroCardsProps) {
  const scroller = useRef<HTMLOListElement>(null);
  const [edges, setEdges] = useState({ start: true, end: cards.length < 2 });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft <= 1, end: el.scrollLeft + el.clientWidth >= el.scrollWidth - 1 });
  }, []);
  useEffect(() => {
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure, cards.length]);

  const step = (direction: 1 | -1) => {
    const el = scroller.current;
    const card = el?.firstElementChild as HTMLElement | null;
    if (!el || !card) return;
    const gap = parseFloat(getComputedStyle(el).columnGap) || 0;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.scrollBy({ left: direction * (card.offsetWidth + gap), behavior: reduce ? 'auto' : 'smooth' });
  };
  const onKeyDown = (e: KeyboardEvent<HTMLOListElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
      e.preventDefault();
      step(e.key === 'ArrowRight' ? 1 : -1);
    }
  };

  return (
    <section className="hero__cards" aria-labelledby="hero-latest">
      <div className="hero__cards-top">
        <h3 className="section__title" id="hero-latest">
          Latest updates <span className="section__count">{cards.length}</span>
        </h3>
        {cards.length > 1 && (
          <div className="hero__cards-nav">
            <button type="button" className="icon-button" aria-label="Previous update" disabled={edges.start} onClick={() => step(-1)}>
              <CaretLeftIcon size={16} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button" aria-label="Next update" disabled={edges.end} onClick={() => step(1)}>
              <CaretRightIcon size={16} aria-hidden="true" />
            </button>
          </div>
        )}
      </div>
      <ol className="hero__cards-row" ref={scroller} tabIndex={0} aria-label="Latest updates, newest first" onScroll={measure} onKeyDown={onKeyDown}>
        {cards.map((o, i) => {
          const reported = lastReported(o.disruption);
          const source = newestSource(o.disruption);
          const id = `hero-card-${i}`;
          return (
            <li key={o.disruption.id} className="hero-card">
              <article aria-labelledby={id}>
                <p className="hero__kicker">
                  <NewspaperIcon size={16} aria-hidden="true" />
                  <time dateTime={reported} title={`Reported ${reported} · since ${o.disruption.startedAt}`}>
                    {dateAgo(reported, now)}
                  </time>
                </p>
                <h4 className="hero-card__name" id={id}>
                  <button type="button" className="hero__headline-link" onClick={() => onSelect(o.selection)}>
                    {o.name}
                  </button>
                </h4>
                <p className="hero-card__report">{source ? `“${source.title}”` : firstSentence(o.disruption.summary)}</p>
                <p className="hero__byline">
                  {byline(o)}
                  {source && (
                    <>
                      {' · '}
                      <SourceLink href={source.url}>{source.publisher}</SourceLink>
                    </>
                  )}
                </p>
                {source?.unreviewed && <p className="hero__unreviewed">Added automatically from the news, not yet reviewed.</p>}
              </article>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

/** All disruptions in effect, the cards included, and what they're on. */
function tally(s: Situation): string {
  const touched = [
    s.assets.chokepoints && plural(s.assets.chokepoints, 'chokepoint'),
    s.assets.pipelines && plural(s.assets.pipelines, 'pipeline'),
    s.assets.terminals && plural(s.assets.terminals, 'terminal'),
  ].filter((p): p is string => Boolean(p));
  if (!touched.length) return '';
  const list = touched.length === 1 ? touched[0] : `${touched.slice(0, -1).join(', ')} and ${touched.at(-1)}`;
  return `${s.ongoing.length.toLocaleString('en-US')} in all, on ${list}.`;
}
