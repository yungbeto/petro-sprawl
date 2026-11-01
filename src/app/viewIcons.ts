import { AnchorIcon, BoatIcon, CylinderIcon, GasPumpIcon, HouseIcon, MountainsIcon, PipeIcon } from '@phosphor-icons/react';
import type { ViewId } from '../lib/views';

/** Each rail view's icon, in the rail and in search. Home is the summary. */
export const VIEW_ICONS: Record<ViewId, typeof BoatIcon> = {
  chokepoints: BoatIcon,
  pipelines: PipeIcon,
  terminals: AnchorIcon,
  basins: MountainsIcon,
  storage: CylinderIcon,
  origins: GasPumpIcon,
};

export const HOME_ICON = HouseIcon;
