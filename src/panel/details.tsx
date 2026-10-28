import type { ReactNode } from 'react';
import type { Basin, Chokepoint, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import {
  CHOKEPOINT_NOTES,
  EIA_CHOKEPOINTS_SOURCE,
  EIA_REFERENCE_YEAR,
} from '../lib/config';
import { chokepointsInBasin, pipelinesTouchingBasin, type Datasets } from '../lib/data';
import { formatCapacity, formatLonLat, formatMbd } from '../lib/format';
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

export function ChokepointDetail({ item }: { item: Chokepoint }) {
  const note = CHOKEPOINT_NOTES[item.id];
  return (
    <>
      <Header kind="Chokepoint" name={item.name} />
      <dl className="facts">
        <Row label="EIA reference volume">
          <span className="mono">{formatMbd(item.eiaReferenceMbd)}</span>
          <span className="facts__aside">
            {EIA_REFERENCE_YEAR}, crude oil and petroleum liquids,{' '}
            <SourceLink href={EIA_CHOKEPOINTS_SOURCE}>EIA</SourceLink>
          </span>
        </Row>
        <Row label="Location">
          <span className="mono">{formatLonLat(item.point)}</span>
          <span className="facts__aside">IMF PortWatch</span>
        </Row>
        <Row label="Tanker transits">
          <span className="muted">Not loaded yet</span>
        </Row>
      </dl>
      {note && <p className="note">{note}</p>}
    </>
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
