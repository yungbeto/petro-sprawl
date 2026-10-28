import type { ReactNode } from 'react';
import type { Basin, Chokepoint, Country, Evidence, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import {
  CHOKEPOINT_NOTES,
  EIA_CHOKEPOINTS_SOURCE,
  EIA_REFERENCE_YEAR,
  MEASURED_FLOW,
  agsiSeriesId,
} from '../lib/config';
import { storageSummary } from '../lib/gasStorage';
import { ENTSOG_URL, isUnverified, latestClaim, pipelineFlow } from '../lib/evidence';
import { chokepointsInBasin, disruptionsFor, pipelinesTouchingBasin, seriesById, type Datasets } from '../lib/data';
import { chokepointFlow, type FlowBand } from '../lib/flow';
import { formatIndex, formatIndexShare, formatNumber } from '../lib/format';
import type { Disruption } from '../types';
import { Sparkline } from './Sparkline';
import { formatCapacity, formatCountry, formatEnergyPerDay, formatLonLat, formatMbd } from '../lib/format';
import { pipelineStatus } from '../lib/encoding';

type OnSelect = (selection: Selection) => void;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Header({ kind, name }: { kind: string; name: string }) {
  return (
    <header className="detail__header">
      <p className="muted">{kind}</p>
      <h2 className="detail__title">{name}</h2>
    </header>
  );
}

function SourceLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

const BAND_LABELS: Record<FlowBand, string> = {
  below: 'Below baseline',
  near: 'Near baseline',
  above: 'Above baseline',
};

function Band({ band }: { band: FlowBand | null }) {
  if (!band) return <span className="muted">No index</span>;
  return <span className={`band band--${band}`}>{BAND_LABELS[band]}</span>;
}

function perDay(value: number | undefined): string {
  return value === undefined ? 'n/a' : `${formatNumber(value, 1)} tankers/day`;
}

export function ChokepointDetail({ item, data }: { item: Chokepoint; data: Datasets }) {
  const note = CHOKEPOINT_NOTES[item.id];
  const flow = chokepointFlow(seriesById(data, item.transitSeriesId));
  const disruptions = disruptionsFor(data, 'chokepoint', item.id);
  return (
    <>
      <Header kind="Chokepoint" name={item.name} />
      {flow && (
        <section className="flow-headline">
          <p className="flow-headline__figure mono">
            {flow.indexFiveYear !== null ? formatIndexShare(flow.indexFiveYear) : 'n/a'}
          </p>
          <p>
            of the five-year average for tanker transits, last 7 days. <Band band={flow.band} />
          </p>
        </section>
      )}
      <dl className="facts">
        {flow ? (
          <>
            <Row label="Last 7 days">
              <span className="mono">{perDay(flow.recent?.mean)}</span>
              <span className="facts__aside">
                to <span className="mono">{flow.latestDate}</span>
              </span>
            </Row>
            <Row label="Trailing year">
              <span className="mono">{perDay(flow.trailing?.mean)}</span>
              <span className="facts__aside">
                Index <span className="mono">{flow.indexTrailing !== null ? formatIndex(flow.indexTrailing) : 'n/a'}</span>
              </span>
            </Row>
            <Row label="Five-year average">
              <span className="mono">{perDay(flow.fiveYear?.mean)}</span>
              {flow.fiveYear && (
                <span className="facts__aside">
                  <span className="mono">
                    {flow.fiveYear.from} to {flow.fiveYear.to}
                  </span>
                  , index <span className="mono">{flow.indexFiveYear !== null ? formatIndex(flow.indexFiveYear) : 'n/a'}</span>
                </span>
              )}
            </Row>
          </>
        ) : (
          <Row label="Tanker transits">
            <span className="muted">Not loaded yet</span>
          </Row>
        )}
        <Row label="EIA reference volume">
          <span className="mono">{formatMbd(item.eiaReferenceMbd)}</span>
          <span className="facts__aside">
            {EIA_REFERENCE_YEAR}, crude oil and petroleum liquids,{' '}
            <SourceLink href={EIA_CHOKEPOINTS_SOURCE}>EIA</SourceLink>
          </span>
        </Row>
        <Row label="Location">
          <span className="mono">{formatLonLat(item.point)}</span>
        </Row>
      </dl>
      {flow && (
        <section className="section">
          <h3 className="section__title">Daily tanker transits, last 90 days</h3>
          <Sparkline
            points={flow.sparkline}
            unit="/day"
            label={`Daily tanker transits at ${item.name}, ${flow.sparkline[0]?.date} to ${flow.latestDate}`}
            references={[
              ...(flow.fiveYear ? [{ value: flow.fiveYear.mean, label: 'Five-year average', style: 'dashed' as const }] : []),
              ...(flow.trailing ? [{ value: flow.trailing.mean, label: 'Trailing year', style: 'dotted' as const }] : []),
            ]}
          />
        </section>
      )}
      <DisruptionList disruptions={disruptions} />
      <p className="note">
        Transits are vessel counts from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>; the EIA
        figure is barrels, shown for scale. The two aren't compared.
        {note && ` ${note}`}
      </p>
    </>
  );
}

function DisruptionList({ disruptions }: { disruptions: Disruption[] }) {
  if (disruptions.length === 0) return null;
  return (
    <section className="section">
      <h3 className="section__title">Disruptions</h3>
      <ul className="disruptions">
        {disruptions.map((d) => (
          <li key={d.id} className="disruption">
            <p className="disruption__meta mono">
              {d.startedAt}
              {d.endedAt ? ` to ${d.endedAt}` : ', ongoing'} · {d.cause}
            </p>
            <p>{d.summary}</p>
            <ul className="disruption__sources">
              {d.sources.map((s) => (
                <li key={s.url}>
                  <SourceLink href={s.url}>{s.publisher}</SourceLink>, <span className="mono">{s.publishedAt}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function BasinDetail({ item, data, onSelect }: { item: Basin; data: Datasets; onSelect: OnSelect }) {
  const chokepoints = chokepointsInBasin(item, data.chokepoints);
  const pipelines = pipelinesTouchingBasin(item, data.pipelines);
  return (
    <>
      <Header kind="Basin" name={item.name} />
      <dl className="facts">
        <Row label="Province type">
          {item.provinceType === 'priority' ? 'Priority province' : 'Boutique province'}
        </Row>
        <Row label="Countries">
          {item.countries.length ? (
            item.countries.map(formatCountry).sort().join(', ')
          ) : (
            <span className="muted">None on land (offshore)</span>
          )}
        </Row>
        <Row label="Dominant petroleum">
          {item.dominant ? capitalize(item.dominant) : <span className="muted">Not given</span>}
        </Row>
        <Row label="USGS code">
          <span className="mono">{item.code}</span>
        </Row>
      </dl>
      <LinkList
        title="Pipelines crossing it"
        empty={data.pipelines.length ? 'None in the loaded data' : 'Pipelines not loaded yet'}
        items={pipelines.map((p) => ({ selection: { kind: 'pipeline', id: p.id }, label: p.name }))}
        onSelect={onSelect}
      />
      <LinkList
        title="Chokepoints inside it"
        empty="None"
        items={chokepoints.map((c) => ({ selection: { kind: 'chokepoint', id: c.id }, label: c.name }))}
        onSelect={onSelect}
      />
      <p className="source">
        <SourceLink href="https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3">
          USGS World Petroleum Assessment 2000
        </SourceLink>
        ; countries from <SourceLink href="https://www.naturalearthdata.com/">Natural Earth</SourceLink>
      </p>
    </>
  );
}

const SOURCE_TYPE_LABELS: Record<Evidence['sourceType'], string> = {
  operator: 'Operator',
  regulator: 'Regulator',
  government: 'Government',
  press: 'Press',
  dataset: 'Dataset',
  measured: 'Measured',
};

function EvidenceLine({ evidence }: { evidence: Evidence }) {
  // The date follows after a comma, so a closing full stop would double up the punctuation.
  const statement = (evidence.statement ?? SOURCE_TYPE_LABELS[evidence.sourceType]).replace(/\.$/, '');
  return (
    <>
      {SOURCE_TYPE_LABELS[evidence.sourceType]}:{' '}
      {evidence.url ? <SourceLink href={evidence.url}>{statement}</SourceLink> : statement},{' '}
      <span className="mono">{evidence.observedAt}</span>
    </>
  );
}

export function PipelineDetail({ item, data, now }: { item: Pipeline; data: Datasets; now: Date }) {
  const status = pipelineStatus(item);
  const current = item.evidence[0];
  const claim = current?.sourceType === 'measured' ? latestClaim(item) : undefined;
  const flow = pipelineFlow(seriesById(data, item.flowSeriesId));
  const disruptions = disruptionsFor(data, 'pipeline', item.id);
  const route = [item.fromCountry, ...item.transitCountries, item.toCountry].filter(Boolean).join(' → ');
  const curated = item.sources.includes('curated');
  return (
    <>
      <Header kind={`${capitalize(item.commodity)} pipeline`} name={item.name} />
      <dl className="facts">
        <Row label="Status">
          <span className={`status status--${status}`}>{statusLabel(status)}</span>
          {isUnverified(current, now) && (
            <span className="unverified"> · unverified since <span className="mono">{current!.observedAt}</span></span>
          )}
          <span className="facts__aside">{current ? <EvidenceLine evidence={current} /> : 'No sourced claim yet'}</span>
          {claim && (
            <span className="facts__aside">
              Latest claim, {statusLabel(claim.status).toLowerCase()}: <EvidenceLine evidence={claim} />
            </span>
          )}
        </Row>
        <Row label="Route">
          {route ? <span className="mono">{route}</span> : <span className="muted">Unknown</span>}
        </Row>
        <Row label="Capacity">
          {item.capacity ? (
            <>
              <span className="mono">{formatCapacity(item.capacity)}</span>
              {item.capacitySource && (
                <span className="facts__aside">
                  <SourceLink href={item.capacitySource.url}>{item.capacitySource.publisher}</SourceLink>,{' '}
                  <span className="mono">{item.capacitySource.publishedAt}</span>
                </span>
              )}
            </>
          ) : (
            <span className="muted">Unknown</span>
          )}
        </Row>
        <Row label="Measured flow">
          {flow?.recentMean != null ? (
            <>
              <span className="mono">{formatEnergyPerDay(flow.recentMean)}</span>
              <span className="facts__aside">
                {MEASURED_FLOW.windowDays}-day mean to <span className="mono">{flow.latestDate}</span>
                {flow.share !== null && (
                  <>
                    , <span className="mono">{formatIndexShare(flow.share)}</span> of technical capacity
                  </>
                )}
                {flow.label && `, at ${flow.label}`}
              </span>
            </>
          ) : (
            <span className="muted">{item.flowSeriesId ? 'Not loaded yet' : 'Not measured'}</span>
          )}
        </Row>
        {item.operator && <Row label="Operator">{item.operator}</Row>}
        {item.owners && item.owners.length > 0 && (
          <Row label="Owners">
            {item.owners.map((o) => (
              <span key={o.name} className="facts__line">
                {o.name}
                {o.sharePct !== undefined && <span className="mono"> {o.sharePct}%</span>}
              </span>
            ))}
          </Row>
        )}
      </dl>
      {flow && flow.sparkline.length > 1 && (
        <section className="section">
          <h3 className="section__title">Daily physical flow, last 90 days</h3>
          <Sparkline
            points={flow.sparkline.map((p) => ({ date: p.date, value: p.value / 1e6 }))}
            unit=" GWh/d"
            label={`Daily physical gas flow for ${item.name}, ${flow.sparkline[0]?.date} to ${flow.latestDate}`}
            references={
              flow.capacity ? [{ value: flow.capacity / 1e6, label: 'Technical capacity', style: 'dashed' as const }] : []
            }
          />
        </section>
      )}
      <DisruptionList disruptions={disruptions} />
      {item.evidence.length > 1 && (
        <section className="section">
          <h3 className="section__title">Status history</h3>
          <ul className="evidence">
            {item.evidence.map((e, i) => (
              <li key={i}>
                <span className={`status status--${e.status}`}>{statusLabel(e.status)}</span>{' '}
                <span className="facts__aside">
                  <EvidenceLine evidence={e} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
      {item.geometryApprox && <p className="note">Route is approximate. The source marks it as low accuracy.</p>}
      <p className="source">
        Route and inventory: <SourceLink href="https://globalenergymonitor.org/">Global Energy Monitor</SourceLink>, CC BY
        4.0{curated && '; status evidence curated from the sources linked above'}
        {flow && (
          <>
            ; flows: <SourceLink href={ENTSOG_URL}>ENTSOG Transparency Platform</SourceLink>
          </>
        )}
      </p>
    </>
  );
}

export function StorageDetail({ item, data }: { item: Country; data: Datasets }) {
  const summary = storageSummary(seriesById(data, agsiSeriesId(item.id)));
  const pct = (value: number) => `${formatNumber(value, 1)}%`;
  return (
    <>
      <Header kind="Gas storage" name={item.name} />
      {summary ? (
        <>
          <section className="flow-headline">
            <p className="flow-headline__figure mono">{pct(summary.fill)}</p>
            <p>
              of working gas volume in storage on <span className="mono">{summary.latestDate}</span>.
            </p>
          </section>
          <dl className="facts">
            <Row label="Last 7 days">
              {summary.change7d !== null ? (
                <span className="mono">
                  {summary.change7d >= 0 ? '+' : '−'}
                  {formatNumber(Math.abs(summary.change7d), 1)} pts
                </span>
              ) : (
                <span className="muted">n/a</span>
              )}
            </Row>
            <Row label="Same date last year">
              {summary.lastYear ? (
                <>
                  <span className="mono">{pct(summary.lastYear.fill)}</span>
                  <span className="facts__aside">
                    <span className="mono">{summary.lastYear.date}</span>, now{' '}
                    <span className="mono">
                      {summary.fill >= summary.lastYear.fill ? '+' : '−'}
                      {formatNumber(Math.abs(summary.fill - summary.lastYear.fill), 1)} pts
                    </span>
                  </span>
                </>
              ) : (
                <span className="muted">n/a</span>
              )}
            </Row>
          </dl>
          <section className="section">
            <h3 className="section__title">Storage fill, last 12 months</h3>
            <Sparkline
              points={summary.year}
              unit="%"
              label={`Gas storage fill in ${item.name}, ${summary.year[0]?.date} to ${summary.latestDate}`}
              references={summary.lastYear ? [{ value: summary.lastYear.fill, label: 'Same date last year', style: 'dashed' as const }] : []}
            />
          </section>
        </>
      ) : (
        <p className="muted">No storage data for this country.</p>
      )}
      <p className="source">
        <SourceLink href="https://agsi.gie.eu/">GIE AGSI+</SourceLink>; fill is gas in storage as a share of working gas
        volume.
      </p>
    </>
  );
}

function LinkList({
  title,
  empty,
  items,
  onSelect,
}: {
  title: string;
  empty: string;
  items: { selection: Selection; label: string }[];
  onSelect: OnSelect;
}) {
  return (
    <section className="section">
      <h3 className="section__title">{title}</h3>
      {items.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <ul className="link-list">
          {items.map(({ selection, label }) => (
            <li key={`${selection.kind}/${selection.id}`}>
              <button type="button" className="link-button" onClick={() => onSelect(selection)}>
                {label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function statusLabel(status: string): string {
  return capitalize(status.replace(/_/g, ' '));
}
