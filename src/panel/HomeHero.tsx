import { useMemo, useState } from 'react';
import { GasPumpIcon } from '@phosphor-icons/react';
import type { Selection } from '../app/urlState';
import type { VisitChanges } from '../app/useVisitChanges';
import { HOME_HERO } from '../lib/config';
import type { Datasets } from '../lib/data';
import { firstSentence, situation, type Situation } from '../lib/summary';
import { AssetIcon } from './AssetIcon';

interface HomeHeroProps {
  data: Datasets;
  visit: VisitChanges | null;
  now: Date;
  onSelect: (selection: Selection) => void;
  /** Opens search on US places, for "Where is my fuel from?". */
  onFind: () => void;
  onShowChanges: () => void;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/**
 * The top of Home: today's date and what changed since last visit, the newest disruption in effect as
 * the headline, how many are in effect, then the others, newest first.
 */
export function HomeHero({ data, visit, now, onSelect, onFind, onShowChanges }: HomeHeroProps) {
  const s = useMemo(() => situation(data), [data]);
  const [showAll, setShowAll] = useState(false);
  const rest = s.ongoing.slice(1);
  const shown = showAll ? rest : rest.slice(0, HOME_HERO.disruptionsShown);
  const latest = s.latest;
  const commodityOf = (id: string) => data.pipelines.find((p) => p.id === id)?.commodity;

  return (
    <section className="hero" aria-label="Situation">
      <p className="hero__meta">
        <span>{now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</span>
        {visit?.since ? (
          <button type="button" className="link-button" onClick={onShowChanges}>
            {plural(visit.changes.length, 'change')} since your last visit
          </button>
        ) : (
          <span>First visit on this browser</span>
        )}
      </p>
      {latest ? (
        <>
          <p className="hero__kicker">
            Latest disruption, since <span className="mono">{latest.disruption.startedAt}</span>
          </p>
          <h2 className="hero__headline">
            <button type="button" className="hero__headline-link" onClick={() => onSelect(latest.selection)}>
              {latest.name}
            </button>
          </h2>
          <p className="hero__summary">{firstSentence(latest.disruption.summary)}</p>
        </>
      ) : (
        <h2 className="hero__headline">No disruptions in effect.</h2>
      )}
      {s.ongoing.length > 0 && <p className="hero__lede">{lede(s)}</p>}

      {rest.length > 0 && (
        <>
          <h3 className="section__title">
            Also in effect <span className="section__count">{rest.length}</span>
          </h3>
          <ul className="changes">
            {shown.map((o) => (
              <li key={o.disruption.id}>
                <button type="button" className="change" onClick={() => onSelect(o.selection)}>
                  <AssetIcon kind={o.selection.kind} commodity={commodityOf(o.selection.id)} />
                  <span className="change__text">
                    <span className="change__name">{o.name}</span>
                    <span className="change__what">
                      Since <span className="mono">{o.disruption.startedAt}</span>
                      {o.disruption.cause !== 'other' && `, ${o.disruption.cause}`}
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
        </>
      )}

      <button type="button" className="find-region" onClick={onFind}>
        <GasPumpIcon size={18} aria-hidden="true" />
        Where is my fuel from?
      </button>
    </section>
  );
}

/** How many disruptions are in effect, and on what. The chokepoint figures are the dashboard's. */
function lede(s: Situation): string {
  const touched = [
    s.assets.chokepoints && plural(s.assets.chokepoints, 'chokepoint'),
    s.assets.pipelines && plural(s.assets.pipelines, 'pipeline'),
    s.assets.terminals && plural(s.assets.terminals, 'terminal'),
  ].filter((p): p is string => Boolean(p));
  if (!touched.length) return '';
  const list = touched.length === 1 ? touched[0] : `${touched.slice(0, -1).join(', ')} and ${touched.at(-1)}`;
  return `${plural(s.ongoing.length, 'disruption')} in effect on ${list}.`;
}
