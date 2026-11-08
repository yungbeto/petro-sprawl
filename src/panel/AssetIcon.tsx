import { AnchorIcon, BoatIcon, DropHalfIcon, DropIcon, FactoryIcon, FlagIcon, FlaskIcon, FlameIcon, GasPumpIcon, MountainsIcon, StackIcon, TriangleIcon } from '@phosphor-icons/react';
import type { SelectionKind } from '../app/urlState';
import type { Commodity } from '../types';

/** The kind of thing a row opens, as an icon in a neutral disc. Color stays reserved for status and flow. */
export function AssetIcon({ kind, commodity, large }: { kind: SelectionKind; commodity?: Commodity; large?: boolean }) {
  const Icon =
    kind === 'chokepoint'
      ? BoatIcon
      : kind === 'basin'
        ? MountainsIcon
        : kind === 'shale'
          ? StackIcon
        : kind === 'country'
          ? FlagIcon
          : kind === 'lng'
            ? FactoryIcon
          : kind === 'terminal'
            ? AnchorIcon
          : kind === 'refinery'
            ? FlaskIcon
          : kind === 'field'
            ? TriangleIcon
          : kind === 'region'
            ? GasPumpIcon
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

export { COMMODITY_PIPELINE } from '../lib/labels';
