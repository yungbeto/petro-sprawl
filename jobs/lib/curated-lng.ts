// Pure merge of hand-curated LNG terminal evidence (data/curated/lng-evidence.json) into GEM terminals.

import type { Evidence, LngTerminal } from '../../src/types';
import { byRankThenObservedDesc } from './curated-pipelines';

/** Cited claims for one GEM terminal, by its id. */
export interface CuratedLngEvidence {
  id: string;
  evidence: Evidence[];
}

/** Adds each record's claims to its terminal, ranked like pipeline evidence. Throws on an id that isn't there. */
export function mergeLngEvidence(curated: CuratedLngEvidence[], terminals: LngTerminal[]): LngTerminal[] {
  const byId = new Map(curated.map((c) => [c.id, c.evidence]));
  const missing = [...byId.keys()].filter((id) => !terminals.some((t) => t.id === id));
  if (missing.length) throw new Error(`curated LNG evidence points at terminals that don't exist: ${missing.join(', ')}`);
  return terminals.map((t) => {
    const cited = byId.get(t.id);
    return cited ? { ...t, evidence: [...cited, ...t.evidence].sort(byRankThenObservedDesc) } : t;
  });
}

/** Links terminals to their send-out series by terminal id. Throws on a link to a terminal that isn't there. */
export function linkSendOut(terminals: LngTerminal[], links: Map<string, string>): LngTerminal[] {
  const missing = [...links.keys()].filter((id) => !terminals.some((t) => t.id === id));
  if (missing.length) throw new Error(`ALSI terminals that don't exist in GEM: ${missing.join(', ')}`);
  return terminals.map((t) => {
    const sendOutSeriesId = links.get(t.id);
    return sendOutSeriesId ? { ...t, sendOutSeriesId } : t;
  });
}
