import type { Disruption, OilTerminal } from '../../src/types';

/**
 * Curated oil terminals ready to publish: evidence newest first. Throws when a terminal links a
 * pipeline that isn't published, or a terminal disruption names a terminal that doesn't exist.
 */
export function prepareTerminals(terminals: OilTerminal[], pipelineIds: Set<string>, disruptions: Disruption[]): OilTerminal[] {
  const ids = new Set(terminals.map((t) => t.id));
  const problems = [
    ...terminals.flatMap((t) => t.pipelineIds.filter((id) => !pipelineIds.has(id)).map((id) => `${t.id} links pipeline ${id}`)),
    ...disruptions.filter((d) => d.assetKind === 'terminal' && !ids.has(d.assetId)).map((d) => `${d.id} names terminal ${d.assetId}`),
    ...(ids.size < terminals.length ? ['duplicate terminal ids'] : []),
  ];
  if (problems.length) throw new Error(`curated terminals point at records that don't exist: ${problems.join('; ')}`);
  return terminals.map((t) => ({ ...t, evidence: [...t.evidence].sort((a, b) => b.observedAt.localeCompare(a.observedAt)) }));
}
