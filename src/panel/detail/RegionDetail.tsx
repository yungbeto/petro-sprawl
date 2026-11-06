// A US fuel region's page (M6, M7): where its crude, gasoline, diesel or jet fuel comes from.

import { useMemo } from 'react';
import type { OilOriginRegion, OilRoute } from '../../types';
import { FUELS, PADDS, PADD_SOURCE, REGION_FUEL_LABELS, type FuelId, type RegionFuel } from '../../lib/config';
import { chokepointFlows, fuelOriginsFor, originsFor, type Datasets } from '../../lib/data';
import { formatIndexShare, formatNumber, formatShare } from '../../lib/format';
import { AssetIcon } from '../AssetIcon';
import { FuelTabs } from '../FuelTabs';
import type { ChokepointExposure, OriginRow } from '../../lib/oilOrigins';
import { Info } from '../Info';
import { MeterBar, type BarTone } from '../../ui/Bar';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { type OnSelect, Row, Header, SourceLink, LeadCard, monthLabel } from './parts';

/** EIA's own tables behind a region view; the imports table is per region (R10 to R50). Checked 2026-10-29. */
const eiaSeries = (eia: string) =>
  [
    ['Imports by country of origin', `https://www.eia.gov/dnav/pet/pet_move_impcp_a2_${eia.toLowerCase()}_epc0_ip0_mbbl_m.htm`],
    ['Movements between regions', 'https://www.eia.gov/dnav/pet/pet_move_ptb_a_epc0_tnr_mbbl_m.htm'],
    ['Production by state', 'https://www.eia.gov/dnav/pet/pet_crd_crpdn_adc_mbbl_m.htm'],
    ['Refinery utilization', 'https://www.eia.gov/dnav/pet/pet_pnp_unc_dcu_nus_m.htm'],
  ] as const;

const pct = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

function millionsPerDay(barrels: number): string {
  return formatNumber(barrels / 1e6, 2);
}

/**
 * "Where is my oil from?" for one PADD: the fuel it uses (SPEC M7) or the crude its refineries run
 * (M6), switched in place.
 */
export function RegionDetail({
  item,
  data,
  onSelect,
  fuel,
  onFuel,
}: {
  item: OilOriginRegion;
  data: Datasets;
  onSelect: OnSelect;
  fuel: RegionFuel;
  onFuel: (fuel: RegionFuel) => void;
}) {
  const padd = PADDS.find((p) => p.id === item.id);
  const states = padd ? [...padd.states] : [];
  const stateList = states.length > 1 ? `${states.slice(0, -1).join(', ')} and ${states.at(-1)}` : (states[0] ?? '');
  return (
    <>
      <Header name={item.name} icon={<AssetIcon kind="region" large />} lede={stateList} />
      <FuelTabs fuel={fuel} onFuel={onFuel}>
        {fuel === 'crude' ? (
          <CrudeOrigins item={item} data={data} onSelect={onSelect} />
        ) : (
          <FuelOriginsView item={item} fuel={fuel} data={data} onSelect={onSelect} />
        )}
      </FuelTabs>
    </>
  );
}

/** The chokepoints the cited routes pass, with their tanker traffic now, and the routes themselves. */
export function OnTheWay({ origins, data, onSelect }: { origins: { exposure: ChokepointExposure[]; routes: OilRoute[] }; data: Datasets; onSelect: OnSelect }) {
  const flows = useMemo(() => chokepointFlows(data), [data]);
  return (
    <>
    {origins.exposure.length > 0 && (
      <section className="section">
        <SectionTitle title="Chokepoints on the way">
          <Info label="About chokepoints on the way">
            "Up to" where a country can also load at a terminal that avoids the chokepoint. Only countries with a cited
            route are counted.
          </Info>
        </SectionTitle>
        <ul className="origins">
          {origins.exposure.map((e) => {
            const chokepoint = data.chokepoints.find((c) => c.id === e.chokepoint);
            const flow = flows.get(e.chokepoint);
            return (
              <li key={e.chokepoint}>
                <button type="button" className="origins__row origins__row--link" onClick={() => onSelect({ kind: 'chokepoint', id: e.chokepoint })}>
                  <span className="origins__head">
                    <span className="origins__label">{chokepoint?.name ?? e.chokepoint}</span>
                    <span className="origins__share num-inline">
                      {e.certain ? '' : 'up to '}
                      {formatShare(e.share)}
                    </span>
                  </span>
                  <span className="origins__detail">
                    {e.countries.join(' and ')}
                    {flow?.indexFiveYear != null && (
                      <>
                        {' '}
                        · tanker traffic now <span className="num-inline">{formatIndexShare(flow.indexFiveYear)}</span> of its five-year average
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
    )}
    {origins.routes.length > 0 && (
      <section className="section">
        <SectionTitle title="Routes" />
        <ul className="region__routes">
          {origins.routes.map((r) => (
            <li key={r.country}>
              {r.note}{' '}
              {r.sources.map((s, i) => (
                <span key={s.url}>
                  {i > 0 && ', '}
                  <SourceLink href={s.url}>{s.publisher}</SourceLink>
                </span>
              ))}
            </li>
          ))}
        </ul>
      </section>
    )}
    </>
  );
}

/** Origins bars in the map's arc tones: countries in ink, regions and ethanol muted, the rest quieter. */
const ORIGIN_TONE: Record<string, BarTone | undefined> = { country: 'ink', region: 'muted', ethanol: 'muted', own: 'strong', other: 'strong' };

/** Ranked origins with share bars. Another region's row opens that region on crude. */
export function OriginList({ rows, onRegion }: { rows: (Pick<OriginRow, 'key' | 'label' | 'share' | 'detail'> & { kind: string; padd?: string })[]; onRegion: (id: string) => void }) {
  return (
    <ol className="origins">
      {rows.map((row) => {
        const body = (
          <>
            <span className="origins__head">
              <span className="origins__label">{row.label}</span>
              <span className="origins__share num-inline">{formatShare(row.share)}</span>
            </span>
            <span className="origins__bar">
              <MeterBar value={row.share} tone={ORIGIN_TONE[row.kind] ?? 'neutral'} size="sm" minVisible={0.005} />
            </span>
            {row.detail && <span className="origins__detail">{row.detail}</span>}
          </>
        );
        return (
          <li key={row.key}>
            {row.kind === 'region' && row.padd ? (
              <button type="button" className="origins__row origins__row--link" onClick={() => onRegion(row.padd!)}>
                {body}
              </button>
            ) : (
              <div className="origins__row">{body}</div>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * What the region used as the lead card, with the share that came in from other regions or abroad as a bar
 * (2026-11-05). More can flow in than is used, when the region passes some on: the bar then fills.
 */
function FuelUsedCard({ supplied, inflow }: { supplied: number; inflow: number }) {
  const pct = Math.round((inflow / supplied) * 100);
  return (
    <LeadCard
      label="Used"
      value={millionsPerDay(supplied)}
      unit="million b/d"
      against={<>{pct}% from other regions or abroad</>}
      bar={
        <MeterBar value={pct / 100} label={`${pct}% came in from other regions or abroad`} />
      }
      notes="EIA product supplied"
    />
  );
}

/** M7: where the gasoline, diesel or jet fuel the region used came from. */
function FuelOriginsView({ item, fuel, data, onSelect }: { item: OilOriginRegion; fuel: FuelId; data: Datasets; onSelect: OnSelect }) {
  const origins = fuelOriginsFor(data, item.id, fuel);
  const label = REGION_FUEL_LABELS[fuel].toLowerCase();
  const eia = PADDS.find((p) => p.id === item.id)?.eia ?? 'R10';
  if (!origins) return <p className="muted">Not enough months of EIA data loaded for this fuel yet.</p>;
  return (
    <>
      <p className="section__lede">
        Over the 12 months to <span className="mono">{monthLabel(origins.to)}</span>.
      </p>
      <FuelUsedCard supplied={origins.suppliedPerDay} inflow={origins.inflowPerDay} />
      <section className="section">
        <SectionTitle title="Where it comes from">
          <Info label={`About where the region's ${label} comes from`}>
            <p>
              Where the {label} used in the region comes from. Fuel from different refineries mixes in pipelines and
              terminals, so this is the region's picture, not any one station's.
            </p>
            {origins.basis === 'inflow' && <p>More flowed in than the region used, so it passes some on. The shares are of what flowed in.</p>}
          </Info>
        </SectionTitle>
        <OriginList rows={origins.rows} onRegion={(id) => onSelect({ kind: 'region', id }, 'crude')} />
      </section>
      <Note kind="source">
        Monthly EIA data from <span className="mono">{monthLabel(origins.from)}</span> to{' '}
        <span className="mono">{monthLabel(origins.to)}</span>:{' '}
        {fuelSeries(eia, fuel).map(([text, href], i) => (
          <span key={href}>
            {i > 0 && ', '}
            <SourceLink href={href}>{text}</SourceLink>
          </span>
        ))}
        .{' '}
        {fuel === 'gasoline' &&
          'Gasoline counts finished gasoline and blending components, which most gasoline moves as before terminals finish it. Ethanol is blended in the region and shows on its own. '}
        What's left after receipts and imports is the region's own refining and blending plus changes in stocks, so it is
        not a measured flow. Regions as <SourceLink href={PADD_SOURCE}>EIA defines them</SourceLink>. Arcs on the map are
        schematic.
      </Note>
    </>
  );
}

/** EIA data pages behind a fuel view (all checked to exist): use, movements between regions, imports. */
function fuelSeries(eia: string, fuel: FuelId): [string, string][] {
  const products = FUELS.find((f) => f.id === fuel)!.products.map((p) => p.toLowerCase());
  const padd = eia.toLowerCase();
  const base = 'https://www.eia.gov/dnav/pet';
  const withEthanol = fuel === 'gasoline' ? [...products, 'epooxe'] : products;
  return [
    ['product supplied', `${base}/pet_cons_psup_dc_${padd}_mbbl_m.htm`],
    ...withEthanol.map((p): [string, string] => [`${PRODUCT_NAMES[p] ?? p} movements`, `${base}/pet_move_ptb_a_${p}_tnr_mbbl_m.htm`]),
    ...withEthanol.map((p): [string, string] => [`${PRODUCT_NAMES[p] ?? p} imports`, `${base}/pet_move_impcp_a2_${padd}_${p}_im0_mbbl_m.htm`]),
  ];
}

const PRODUCT_NAMES: Record<string, string> = {
  epm0f: 'gasoline',
  epobg: 'blending component',
  epd0: 'distillate',
  epjk: 'jet fuel',
  epooxe: 'ethanol',
};

/** M6: where the crude flowing into the region comes from, and the chokepoints on its routes. */
function CrudeOrigins({ item, data, onSelect }: { item: OilOriginRegion; data: Datasets; onSelect: OnSelect }) {
  const origins = originsFor(data, item);
  const padd = PADDS.find((p) => p.id === item.id);
  return (
    <>
      {!origins ? (
        <p className="muted">Not enough months of EIA data loaded for this region yet.</p>
      ) : (
        <>
          <p className="section__lede">
            Over the 12 months to <span className="mono">{monthLabel(origins.to)}</span>.
          </p>
          <dl className="facts key-facts">
            <Row label="Crude in">
              <span className="key-facts__value">{millionsPerDay(origins.barrelsPerDay)} million b/d</span>
              <span className="facts__aside">imported, received or pumped</span>
            </Row>
            <Row label="Refineries run">
              <span className="key-facts__value">{millionsPerDay(origins.refineryInputPerDay)} million b/d</span>
              <span className="facts__aside">
                {origins.refineryInputPerDay < origins.barrelsPerDay
                  ? 'the rest moves on or is stored'
                  : 'the difference comes from stocks and other inputs'}
              </span>
            </Row>
            {origins.utilization && (
              <Row label="Refinery use">
                <span className="key-facts__value">{pct(origins.utilization.latest.pct)}</span>
                <span className="facts__aside">
                  of operable capacity in {monthLabel(origins.utilization.latest.period)}
                  {origins.utilization.average !== null && `, ${pct(origins.utilization.average)} over the 12 months`}
                  {origins.utilization.latest.pct > 100 && '; past 100% means running above rated capacity'}
                </span>
              </Row>
            )}
            {item.capacity && (
              <Row label="Refineries">
                <span className="key-facts__value">{item.capacity.refineries.toLocaleString('en-US')}</span>
                <span className="facts__aside">
                  {millionsPerDay(item.capacity.barrelsPerCalendarDay)} million b/d capacity, 1 January {item.capacity.asOf}
                </span>
              </Row>
            )}
          </dl>
          <section className="section">
            <SectionTitle title="Where it comes from">
              <Info label="About where the region's crude comes from">
                Where the crude flowing into the region comes from: imported, received from other regions or pumped there.
                Refineries blend crude from many sources and fuel travels after refining, so this is the region's picture,
                not any one town's.
              </Info>
            </SectionTitle>
            <OriginList rows={origins.rows} onRegion={(id) => onSelect({ kind: 'region', id }, 'crude')} />
          </section>
          <OnTheWay origins={origins} data={data} onSelect={onSelect} />
          <Note kind="source">
            Monthly EIA data from <span className="mono">{monthLabel(origins.from)}</span> to{' '}
            <span className="mono">{monthLabel(origins.to)}</span>:{' '}
            {eiaSeries(padd?.eia ?? 'R10').map(([label, href], i) => (
              <span key={href}>
                {i > 0 && ', '}
                <SourceLink href={href}>{label.toLowerCase()}</SourceLink>
              </span>
            ))}
            . Imports count where the crude is refined. Some crude moves on to other regions or abroad, so the shares describe
            what flows in, not exactly what the refineries run. Regions as <SourceLink href={PADD_SOURCE}>EIA defines them</SourceLink>.
            Arcs on the map are schematic: they show where crude comes from, not the path it takes.
          </Note>
        </>
      )}
    </>
  );
}
