// What the panel and the share cards call things: one wording for both.

import type { Commodity, LngTerminal, OilTerminal } from '../types';
import type { Resolved } from './data';

export const COMMODITY_PIPELINE: Record<Commodity, string> = {
  gas: 'Gas pipeline',
  oil: 'Oil pipeline',
  products: 'Products pipeline',
  ngl: 'NGL pipeline',
};

export const LNG_FACILITY: Record<LngTerminal['facility'], string> = {
  export: 'LNG export terminal',
  import: 'LNG import terminal',
};

export const OIL_ROLE: Record<OilTerminal['role'], string> = {
  export: 'Oil export terminal',
  import: 'Oil import terminal',
};

export function detailKind(resolved: Resolved): string {
  switch (resolved.kind) {
    case 'chokepoint':
      return 'Chokepoint';
    case 'basin':
      return `Basin · ${resolved.item.provinceType === 'priority' ? 'priority' : 'boutique'} province`;
    case 'pipeline':
      return `${COMMODITY_PIPELINE[resolved.item.commodity]}${resolved.item.sources.includes('curated') ? ' · corridor' : ''}`;
    case 'country':
      return 'Country';
    case 'lng': {
      const t = resolved.item;
      return [LNG_FACILITY[t.facility], t.floating && 'floating', t.offshore && !t.floating && 'offshore'].filter(Boolean).join(' · ');
    }
    case 'terminal':
      return OIL_ROLE[resolved.item.role];
    case 'refinery':
      return 'Oil refinery';
    case 'region':
      return 'US fuel region';
  }
}

export function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function statusLabel(status: string): string {
  return capitalize(status.replace(/_/g, ' '));
}
