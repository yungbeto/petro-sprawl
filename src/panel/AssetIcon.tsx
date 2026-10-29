import { BoatIcon, CylinderIcon, DropHalfIcon, DropIcon, FlameIcon, MountainsIcon, SnowflakeIcon } from '@phosphor-icons/react';
import type { SelectionKind } from '../app/urlState';
import type { Commodity } from '../types';

/** The kind of thing a row opens, as an icon in a neutral disc. Color stays reserved for status and flow. */
export function AssetIcon({ kind, commodity, large }: { kind: SelectionKind; commodity?: Commodity; large?: boolean }) {
  const Icon =
    kind === 'chokepoint'
      ? BoatIcon
      : kind === 'basin'
        ? MountainsIcon
        : kind === 'storage'
          ? CylinderIcon
          : kind === 'lng'
            ? SnowflakeIcon
          : commodity === 'gas'
            ? FlameIcon
            : commodity === 'ngl'
              ? DropHalfIcon
              : DropIcon;
  return (
    <span className={large ? 'asset-icon asset-icon--large' : 'asset-icon'} aria-hidden="true">
      <Icon size={large ? 22 : 16} weight="regular" />
    </span>
  );
}

export const COMMODITY_PIPELINE: Record<Commodity, string> = {
  gas: 'Gas pipeline',
  oil: 'Oil pipeline',
  products: 'Products pipeline',
  ngl: 'NGL pipeline',
};
