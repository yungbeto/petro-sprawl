// A pipeline's page: status, measured flow against capacity, route and owners.

import type { Pipeline } from '../../types';
import { ENTSOG_URL, latestClaim, pipelineFlow } from '../../lib/evidence';
import { pipelineDisruptions, portCallsFor, seriesById, terminalsForPipeline, systemSections, type Datasets } from '../../lib/data';
import { formatNumber, formatCapacity } from '../../lib/format';
import { Sparkline } from '../Sparkline';
import { pipelineAge, pipelineStatus } from '../../lib/encoding';
import { filterRows } from '../../lib/filters';
import { AssetIcon } from '../AssetIcon';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { type OnSelect, Row, Header, Facts, SourceLink, PortCallsSection, AssetNews, FlowMeter, GemOwnership, CompanyList, RelatedList } from './parts';
import { DisruptionList, StatusBlock, Reports } from './status';
import { oilTerminalRows } from './OilTerminalDetail';
import { refineriesAtPipeline } from '../../lib/refineries';

export function PipelineDetail({
  item,
  data,
  now,
  onSelect,
}: {
  item: Pipeline;
  data: Datasets;
  now: Date;
  onSelect: OnSelect;
}) {
  const status = pipelineStatus(item);
  const current = item.evidence[0];
  // GEM's page for the line: its ownership section cites where the owners and parents come from.
  const gemPage = item.evidence.find((e) => e.sourceType === 'dataset' && /^https:\/\/(www\.)?gem\.wiki\//.test(e.url ?? ''))?.url;
  const claim = current?.sourceType === 'measured' ? latestClaim(item) : undefined;
  const flow = pipelineFlow(seriesById(data, item.flowSeriesId));
  const disruptions = pipelineDisruptions(data, item.id);
  const portCalls = portCallsFor(data, item.id);
  const endTerminals = oilTerminalRows(terminalsForPipeline(data, item.id));
  // Refineries beside one of its ends (REFINERIES.linkKm); empty while the refineries surface is off.
  const endRefineries = refineriesAtPipeline(item, data.refineries).map((r) => ({
    selection: { kind: 'refinery' as const, id: r.id },
    name: r.name,
    curated: true,
  }));
  const route = [item.fromCountry, ...item.transitCountries, item.toCountry].filter(Boolean).join(' → ');
  const curated = item.sources.includes('curated');
  const sections = systemSections(item, data.pipelines);
  const none = new Set<string>();
  const sectionRows = filterRows({ pipelines: new Set(sections.map((p) => p.id)), chokepoints: none, lng: none, terminals: none, refineries: none }, data);
  return (
    <>
      <Header
        name={item.name}
        icon={<AssetIcon kind="pipeline" commodity={item.commodity} large />}
        lede={route ? <span className="mono">{route}</span> : undefined}
      />
      <StatusBlock status={status} current={current} claim={claim} now={now} />
      {flow?.recentMean != null && (
        <FlowMeter
          label="Measured flow"
          flow={flow}
          recentMean={flow.recentMean}
          capacity="technical capacity"
          chartLabel={`Daily physical gas flow for ${item.name}`}
        />
      )}
      <dl className="facts key-facts">
        <Row label="Capacity">
          {item.capacity ? <span className="key-facts__value">{formatCapacity(item.capacity)}</span> : <span className="muted">Unknown</span>}
          {item.capacitySource && (
            <span className="facts__aside">
              <SourceLink href={item.capacitySource.url}>{item.capacitySource.publisher}</SourceLink>,{' '}
              {'accessedAt' in item.capacitySource ? (
                <>
                  read <span className="mono">{item.capacitySource.accessedAt}</span>
                </>
              ) : (
                <span className="mono">{item.capacitySource.publishedAt}</span>
              )}
            </span>
          )}
        </Row>
        <ServiceFact history={item.history} now={now} />
        {flow?.recentMean == null && (
          <Row label="Measured flow">
            <span className="muted">{item.flowSeriesId ? 'Not loaded yet' : 'Not measured'}</span>
          </Row>
        )}
      </dl>
      {/* With a 7-day mean the chart sits in the flow card above; without one it stands alone. */}
      {flow && flow.recentMean == null && flow.sparkline.length > 1 && (
        <Card as="section" className="section">
          <SectionTitle title="Daily physical flow, last 90 days" />
          <Sparkline
            points={flow.sparkline.map((p) => ({ date: p.date, value: p.value / 1e6 }))}
            unit=" GWh/d"
            label={`Daily physical gas flow for ${item.name}, ${flow.sparkline[0]?.date} to ${flow.latestDate}`}
            references={
              flow.capacity ? [{ value: flow.capacity / 1e6, label: 'Technical capacity', style: 'dashed' as const }] : []
            }
          />
        </Card>
      )}
      {portCalls.map((calls) => (
        <PortCallsSection key={calls.port} calls={calls} />
      ))}
      {endTerminals.length + endRefineries.length > 0 && (
        <RelatedList title="Ends at" empty="" rows={[...endTerminals, ...endRefineries]} data={data} onSelect={onSelect} />
      )}
      <DisruptionList disruptions={disruptions} now={now} />
      <Reports evidence={item.evidence} />
      <AssetNews selection={{ kind: 'pipeline', id: item.id }} data={data} now={now} onSelect={onSelect} />
      {hasPipelineFacts(item, route) && (
        <Facts>
          {!route ? (
            <Row label="Route">
              <span className="muted">Unknown</span>
            </Row>
          ) : (
            item.endpoints?.start &&
            item.endpoints.end && (
              <Row label="Runs from">
                {item.endpoints.start} to {item.endpoints.end}
              </Row>
            )
          )}
          {item.lengthKm && (
            <Row label="Length">
              <span className="num-inline">{formatNumber(item.lengthKm.value, 0)} km</span>
              {item.lengthKm.estimated && <span className="muted"> (estimated from the route)</span>}
            </Row>
          )}
          {item.diameter && (
            <Row label="Diameter">
              <span className="num-inline">{item.diameter}</span>
            </Row>
          )}
          {item.history?.proposalYear !== undefined && (
            <Row label="Proposed">
              <span className="num-inline">{item.history.proposalYear}</span>
            </Row>
          )}
          {item.history?.constructionYear !== undefined && (
            <Row label="Construction began">
              <span className="num-inline">{item.history.constructionYear}</span>
            </Row>
          )}
          {item.history && item.history.startYears.length > 1 && (
            <Row label={item.history.expected ? 'Sections expected' : 'Sections opened'}>
              <span className="num-inline">{item.history.startYears.join(', ')}</span>
            </Row>
          )}
          {item.history?.stopYear !== undefined && (
            <Row label="Stopped running">
              <span className="num-inline">{item.history.stopYear}</span>
            </Row>
          )}
          {item.operator && <Row label="Operator">{item.operator}</Row>}
          {item.owners && item.owners.length > 0 && (
            <Row label="Owners">
              <CompanyList companies={item.owners} />
              {item.ownersSource ? (
                <span className="facts__line muted">
                  <SourceLink href={item.ownersSource.url}>{item.ownersSource.publisher}</SourceLink>, read{' '}
                  <span className="mono">{item.ownersSource.accessedAt}</span>
                </span>
              ) : (
                !item.parents?.length && gemPage && <GemOwnership url={gemPage} />
              )}
            </Row>
          )}
          {item.parents && item.parents.length > 0 && (
            <Row label="Parent companies">
              <CompanyList companies={item.parents} />
              {gemPage && <GemOwnership url={gemPage} />}
            </Row>
          )}
        </Facts>
      )}
      {sectionRows.length > 0 && (
        <RelatedList
          title={`Other sections of ${item.system}`}
          empty=""
          rows={sectionRows}
          data={data}
          onSelect={onSelect}
        />
      )}
      {item.geometryApprox && <Note>Route is approximate. The source marks it as low accuracy.</Note>}
      <Note kind="source">
        Route and inventory: <SourceLink href="https://globalenergymonitor.org/">Global Energy Monitor</SourceLink>, CC BY
        4.0{curated && '; status evidence curated from the sources linked above'}
        {flow && (
          <>
            ; flows: <SourceLink href={ENTSOG_URL}>ENTSOG Transparency Platform</SourceLink>
          </>
        )}
      </Note>
    </>
  );
}

function hasPipelineFacts(item: Pipeline, route: string): boolean {
  const h = item.history;
  return Boolean(
    !route ||
      (item.endpoints?.start && item.endpoints.end) ||
      item.lengthKm ||
      item.diameter ||
      item.operator ||
      item.owners?.length ||
      item.parents?.length ||
      (h && (h.proposalYear !== undefined || h.constructionYear !== undefined || h.startYears.length > 1 || h.stopYear !== undefined)),
  );
}

/** The year the line first ran, and its age; or the year it's meant to. */
function ServiceFact({ history, now }: { history: Pipeline['history']; now: Date }) {
  const first = history?.startYears[0];
  if (first === undefined)
    return (
      <Row label="In service since">
        <span className="muted">Unknown</span>
      </Row>
    );
  const fact = (label: string, value: string, aside: string) => (
    <Row label={label}>
      <span className="key-facts__value">
        {value}
        <span className="facts__aside"> · {aside}</span>
      </span>
    </Row>
  );
  if (history!.expected) return fact('Expected start', String(first), 'target year, per GEM');
  const age = pipelineAge(history!, now);
  const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;
  return fact(
    'In service since',
    String(first),
    history!.stopYear !== undefined ? `ran ${years(age)}, to ${history!.stopYear}` : age === 0 ? 'opened this year' : years(age),
  );
}
