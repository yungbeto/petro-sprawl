import { useMemo, useState } from 'react';
import { NewspaperIcon } from '@phosphor-icons/react';
import type { Selection } from '../app/urlState';
import type { VisitChanges } from '../app/useVisitChanges';
import { FEATURES, HOME_HERO } from '../lib/config';
import type { Datasets } from '../lib/data';
import { firstSentence, situation, startedAgo, type Situation } from '../lib/summary';
import { AssetIcon } from './AssetIcon';
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
 * The top of Home, after "what's happening" feeds: what the site is in a line, the newest disruption in
 * effect as the lead story (when it started and who reported it), then the others in effect, newest first.
 */
export function HomeHero({ data, visit, now, onSelect, onShowChanges }: HomeHeroProps) {
  const s = useMemo(() => situation(data), [data]);
  const [showAll, setShowAll] = useState(false);
  const rest = s.ongoing.slice(1);
  const shown = showAll ? rest : rest.slice(0, HOME_HERO.disruptionsShown);
  const latest = s.latest;
  const commodityOf = (id: string) => data.pipelines.find((p) => p.id === id)?.commodity;
  // The newest report behind the lead story.
  const source = (latest ? [...latest.disruption.sources] : []).sort((a, b) => (b.publishedAt ?? '').localeCompare(a.publishedAt ?? ''))[0];

  /** "Oil pipeline", "LNG export terminal": what kind of asset a disruption is on. */
  const kindOf = (o: Ongoing): string => {
    switch (o.selection.kind) {
      case 'pipeline': {
        const commodity = commodityOf(o.selection.id);
        return commodity === 'gas' ? 'Gas pipeline' : commodity === 'oil' ? 'Oil pipeline' : 'Pipeline';
      }
      case 'lng': {
        const facility = data.lngTerminals.find((t) => t.id === o.selection.id)?.facility;
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

      {latest ? (
        <article className="hero__lead" aria-labelledby="hero-lead">
          <p className="hero__kicker">
            <NewspaperIcon size={16} aria-hidden="true" />
            <span>
              Latest update ·{' '}
              <time dateTime={latest.disruption.startedAt} title={`Since ${latest.disruption.startedAt}`}>
                {startedAgo(latest.disruption.startedAt, now)}
              </time>
            </span>
          </p>
          <h3 className="hero__headline" id="hero-lead">
            <button type="button" className="hero__headline-link" onClick={() => onSelect(latest.selection)}>
              {latest.name}
            </button>
          </h3>
          <p className="hero__summary">{firstSentence(latest.disruption.summary)}</p>
          <p className="hero__byline">
            {[kindOf(latest), cause(latest)].filter(Boolean).join(' · ')}
            {source && (
              <>
                {' · '}
                <SourceLink href={source.url}>{source.publisher}</SourceLink>
              </>
            )}
          </p>
        </article>
      ) : (
        <p className="hero__headline">No disruptions in effect.</p>
      )}

      {rest.length > 0 && (
        <section className="hero__rest" aria-labelledby="hero-rest">
          <h3 className="section__title" id="hero-rest">
            Also in effect <span className="section__count">{rest.length}</span>
          </h3>
          <p className="hero__tally">{tally(s)}</p>
          <ul className="changes">
            {shown.map((o) => (
              <li key={o.disruption.id}>
                <button type="button" className="change" onClick={() => onSelect(o.selection)}>
                  <AssetIcon kind={o.selection.kind} commodity={commodityOf(o.selection.id)} />
                  <span className="change__text">
                    <span className="change__name">{o.name}</span>
                    <span className="change__what">
                      {[kindOf(o), cause(o)].filter(Boolean).join(' · ')} · since <span className="mono">{o.disruption.startedAt}</span>
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {rest.length > shown.length && (
            <button type="button" className="link-button hero__more" onClick={() => setShowAll(true)}>
              Show all {rest.length}
            </button>
          )}
        </section>
      )}
    </section>
  );
}

/** All disruptions in effect, lead story included, and what they're on. */
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
