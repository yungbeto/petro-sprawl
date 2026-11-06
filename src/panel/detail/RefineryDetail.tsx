// A refinery's page (M11): status and crude distillation capacity from the cited source, who runs it, the
// pipelines with an end beside it, and for a US refinery its region's refinery use, labelled as the region's.

import type { Refinery } from '../../types';
import { disruptionsFor, originsFor, type Datasets } from '../../lib/data';
import { REFINERIES } from '../../lib/config';
import { formatCountry, formatLonLat, formatRefineryCapacity } from '../../lib/format';
import { refineryStatus } from '../../lib/encoding';
import { pipelinesAtRefinery, paddName } from '../../lib/refineries';
import type { FilterRow } from '../../lib/filters';
import { AssetIcon } from '../AssetIcon';
import { Note } from '../../ui/Note';
import { TextButton } from '../../ui/Button';
import { type OnSelect, Row, Header, Facts, SourceLink, AssetNews, RelatedList, monthLabel } from './parts';
import { DisruptionList, StatusBlock, Reports } from './status';

/** Where each kind of point comes from, for the location row. */
const POINT_SOURCES: Record<Refinery['pointSource'], string> = {
  eia: "EIA's refinery locations (2021)",
  hifld: 'HIFLD Petroleum Refineries',
  eea: 'European Environment Agency, Industrial Reporting',
  wikidata: 'Wikidata',
  osm: 'OpenStreetMap',
};

const pct = (value: number) => `${value.toLocaleString('en-US', { maximumFractionDigits: 1 })}%`;

export function RefineryDetail({ item, data, now, onSelect }: { item: Refinery; data: Datasets; now: Date; onSelect: OnSelect }) {
  const status = refineryStatus(item);
  const disruptions = disruptionsFor(data, 'refinery', item.id);
  const pipelineRows: FilterRow[] = pipelinesAtRefinery(item, data.pipelines).map((p) => ({
    selection: { kind: 'pipeline', id: p.id },
    name: p.name,
    curated: p.sources.includes('curated'),
  }));
  const region = item.padd ? data.oilOrigins.find((r) => r.id === `padd-${item.padd}`) : undefined;
  const use = region ? originsFor(data, region)?.utilization : undefined;
  const company = item.corporation && item.corporation !== item.operator ? item.corporation : null;
  return (
    <>
      <Header
        name={item.name}
        icon={<AssetIcon kind="refinery" large />}
        lede={[item.state, formatCountry(item.country), item.pointApprox && 'location approximate'].filter(Boolean).join(' · ')}
      />
      <StatusBlock status={status} current={item.evidence[0]} now={now} empty="No dated source on its status yet" />
      <dl className="facts key-facts">
        <Row label="Capacity">
          {item.capacity ? (
            <>
              <span className="key-facts__value">{formatRefineryCapacity(item.capacity)}</span>
              <span className="facts__aside">
                {item.pointSource === 'wikidata' ? 'crude, as reported' : 'crude distillation'}, {item.capacity.asOf},{' '}
                <SourceLink href={item.capacity.source.url}>{item.capacity.source.publisher}</SourceLink>
              </span>
            </>
          ) : (
            <span className="muted">Capacity not published</span>
          )}
        </Row>
        {item.operator ? (
          <Row label="Operator">
            <span>
              {item.operator}
              {company && <span className="facts__aside"> · part of {company}</span>}
            </span>
          </Row>
        ) : (
          item.corporation && <Row label="Company">{item.corporation}</Row>
        )}
        {region && item.padd && (
          <Row label="Region">
            <TextButton onClick={() => onSelect({ kind: 'region', id: region.id }, 'crude')}>{paddName(item.padd)}</TextButton>
          </Row>
        )}
        {use && (
          <Row label="Region's refinery use">
            <span className="key-facts__value">{pct(use.latest.pct)}</span>
            <span className="facts__aside">
              across the region's refineries in {monthLabel(use.latest.period)}, not this plant's; EIA
            </span>
          </Row>
        )}
      </dl>
      <DisruptionList disruptions={disruptions} now={now} />
      <Reports evidence={item.evidence} />
      <AssetNews selection={{ kind: 'refinery', id: item.id }} data={data} now={now} onSelect={onSelect} />
      {pipelineRows.length > 0 && (
        <RelatedList title="Pipelines ending nearby" empty="" rows={pipelineRows} data={data} onSelect={onSelect} />
      )}
      <Facts>
        <Row label="Location">
          <span className="mono">{formatLonLat(item.point)}</span>
          <span className="facts__aside">
            {item.wikidata ? (
              <SourceLink href={`${REFINERIES.wikidataPage}${item.wikidata}`}>{`${POINT_SOURCES.wikidata} ${item.wikidata}`}</SourceLink>
            ) : (
              POINT_SOURCES[item.pointSource]
            )}
          </span>
        </Row>
      </Facts>
      <Note kind="source">
        {item.pointSource === 'wikidata' ? (
          <>
            Location from Wikidata (CC0). Capacity as the linked page reports it on that date, in its own words: sources
            measure it differently, so compare refineries with care. The status stays unknown until a dated source.
          </>
        ) : item.pointSource === 'eea' ? (
          <>
            Site, company and location from the European Environment Agency's{' '}
            <SourceLink href={REFINERIES.eeaPage}>Industrial Reporting database</SourceLink> (CC BY 4.0), which lists sites
            with a permit and their yearly reports, not whether they're running or how much they can refine, so the status
            stays unknown until a dated source.
          </>
        ) : (
          <>
            Capacity is crude distillation in barrels per calendar day, as{' '}
            <SourceLink href={REFINERIES.eiaPage}>EIA's Refinery Capacity Report</SourceLink> gives it on 1 January; the status
            is its split into operating and idle on that day until a later dated source. EIA publishes refinery use by region
            only, never for one plant.
          </>
        )}{' '}
        Pipelines ending nearby have an end within <span className="num-inline">{REFINERIES.linkKm}</span> km of the refinery's
        point in Global Energy Monitor's data, not a cited connection.
      </Note>
    </>
  );
}
