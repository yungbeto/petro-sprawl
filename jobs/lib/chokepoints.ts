import { z } from 'zod';
import type { Chokepoint, ChokepointId } from '../../src/types';

export const portwatchChokepointSchema = z.object({
  portid: z.string(),
  portname: z.string(),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
});

export const portwatchResponseSchema = z.object({
  features: z.array(z.object({ attributes: portwatchChokepointSchema })),
});

export type PortwatchChokepoint = z.infer<typeof portwatchChokepointSchema>;

export interface ChokepointConfig {
  id: ChokepointId;
  name: string;
  portwatchId: string;
  eiaReferenceMbd: number;
}

const round = (n: number) => Math.round(n * 1e4) / 1e4;

/** Joins our chokepoint list (EIA values) with PortWatch locations. Throws if any is missing. */
export function buildChokepoints(
  config: readonly ChokepointConfig[],
  portwatch: PortwatchChokepoint[],
): Chokepoint[] {
  const byId = new Map(portwatch.map((p) => [p.portid, p]));
  return config.map((c) => {
    const pw = byId.get(c.portwatchId);
    if (!pw) throw new Error(`PortWatch has no ${c.portwatchId} (${c.name})`);
    return {
      id: c.id,
      name: c.name,
      point: [round(pw.lon), round(pw.lat)],
      eiaReferenceMbd: c.eiaReferenceMbd,
      transitSeriesId: `portwatch-${c.portwatchId}`,
    };
  });
}
