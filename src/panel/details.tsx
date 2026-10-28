import type { ReactNode } from 'react';
import type { Basin, Chokepoint, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import {
  CHOKEPOINT_NOTES,
  EIA_CHOKEPOINTS_SOURCE,
  EIA_REFERENCE_YEAR,
} from '../lib/config';
import { chokepointsInBasin, disruptionsFor, pipelinesTouchingBasin, seriesById, type Datasets } from '../lib/data';
import { chokepointFlow, type FlowBand } from '../lib/flow';
import { formatIndex, formatIndexShare, formatNumber } from '../lib/format';
import type { Disruption } from '../types';
import { Sparkline } from './Sparkline';
import { formatCapacity, formatCountry, formatLonLat, formatMbd } from '../lib/format';
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

export function PipelineDetail({ item }: { item: Pipeline }) {
  const evidence = item.evidence[0];
  const route = [item.fromCountry, ...item.transitCountries, item.toCountry].filter(Boolean).join(' → ');
  return (
    <>
      <Header kind={`${capitalize(item.commodity)} pipeline`} name={item.name} />
      <dl className="facts">
        <Row label="Route">
          {route ? <span className="mono">{route}</span> : <span className="muted">Unknown</span>}
        </Row>
        <Row label="Capacity">
          {item.capacity ? (
            <span className="mono">{formatCapacity(item.capacity)}</span>
          ) : (
            <span className="muted">Unknown</span>
          )}
        </Row>
        <Row label="Status">
          <span className={`status status--${pipelineStatus(item)}`}>{statusLabel(pipelineStatus(item))}</span>
          {evidence ? (
            <span className="facts__aside">
              {evidence.url ? <SourceLink href={evidence.url}>{evidence.statement ?? evidence.sourceType}</SourceLink> : (evidence.statement ?? evidence.sourceType)}
              , <span className="mono">{evidence.observedAt}</span>
            </span>
          ) : (
            <span className="facts__aside">No sourced claim yet</span>
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
        <Row label="Measured flow">
          <span className="muted">Not loaded yet</span>
        </Row>
      </dl>
      {item.geometryApprox && <p className="note">Route is approximate. The source marks it as low accuracy.</p>}
      <p className="source">
        <SourceLink href="https://globalenergymonitor.org/">Global Energy Monitor</SourceLink>, CC BY 4.0
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
