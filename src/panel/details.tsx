import { useId, useState, type ReactNode } from 'react';
import type { AssetStatus, Basin, Chokepoint, Country, Evidence, LngTerminal, LngUnit, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import {
  CHOKEPOINT_NOTES,
  DETAIL,
  EIA_CHOKEPOINTS_SOURCE,
  EIA_REFERENCE_YEAR,
  FILTERS,
  MEASURED_FLOW,
  agsiSeriesId,
} from '../lib/config';
import { storageSummary } from '../lib/gasStorage';
import { ENTSOG_URL, isUnverified, latestClaim, pipelineFlow } from '../lib/evidence';
import {
  chokepointsInBasin,
  disruptionsFor,
  lngTerminalsInBasin,
  pipelinesTouchingBasin,
  seriesById,
  type Datasets,
} from '../lib/data';
import { chokepointFlow, type FlowBand } from '../lib/flow';
import { formatIndex, formatIndexShare, formatNumber } from '../lib/format';
import type { Disruption } from '../types';
import { Sparkline } from './Sparkline';
import { formatCapacity, formatCountry, formatEnergyPerDay, formatLonLat, formatMbd } from '../lib/format';
import { lngStatus, pipelineStatus } from '../lib/encoding';
import { filterRows, type FilterRow } from '../lib/filters';
import { chokepointRows } from '../lib/summary';
import { AssetIcon, COMMODITY_PIPELINE } from './AssetIcon';

type OnSelect = (selection: Selection) => void;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/** Icon, kind and name, with an optional line under the name for what places the asset. */
function Header({ kind, name, icon, lede }: { kind: string; name: string; icon: ReactNode; lede?: ReactNode }) {
  return (
    <header className="detail__header">
      {icon}
      <div className="detail__heading">
        <p className="detail__kind">{kind}</p>
        <h2 className="detail__title">{name}</h2>
        {lede && <p className="detail__lede">{lede}</p>}
      </div>
    </header>
  );
}

/** The few numbers an asset is about, side by side, before the details. */
function Stats({ children }: { children: ReactNode }) {
  return <dl className="stats">{children}</dl>;
}

function Stat({ label, value, unit, aside }: { label: string; value: ReactNode; unit?: string; aside?: ReactNode }) {
  return (
    <div className="stats__item">
      <dt>{label}</dt>
      <dd>
        <span className="stats__value">
          {value}
          {unit && <span className="stats__unit"> {unit}</span>}
        </span>
        {aside && <span className="stats__aside">{aside}</span>}
      </dd>
    </div>
  );
}

/** Secondary facts, label beside value, under their own heading. */
function Facts({ children }: { children: ReactNode }) {
  return (
    <section className="section">
      <h3 className="section__title">Details</h3>
      <dl className="facts">{children}</dl>
    </section>
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

export function Band({ band }: { band: FlowBand | null }) {
  if (!band) return <span className="muted">No index</span>;
  return <span className={`band band--${band}`}>{BAND_LABELS[band]}</span>;
}

const notAvailable = <span className="muted">n/a</span>;

function perDay(value: number | undefined): ReactNode {
  return value === undefined ? notAvailable : formatNumber(value, 1);
}

function signedPts(value: number): string {
  return `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)}`;
}

export function ChokepointDetail({ item, data }: { item: Chokepoint; data: Datasets }) {
  const note = CHOKEPOINT_NOTES[item.id];
  const flow = chokepointFlow(seriesById(data, item.transitSeriesId));
  const disruptions = disruptionsFor(data, 'chokepoint', item.id);
  return (
    <>
      <Header kind="Chokepoint" name={item.name} icon={<AssetIcon kind="chokepoint" large />} />
      {flow ? (
        <>
          <section className="flow-headline">
            <p className="flow-headline__figure">
              {flow.indexFiveYear !== null ? formatIndexShare(flow.indexFiveYear) : 'n/a'}
            </p>
            <p className="flow-headline__text">
              of the five-year average for tanker transits, last 7 days
            </p>
            <Band band={flow.band} />
          </section>
          <Stats>
            <Stat
              label="Last 7 days"
              value={perDay(flow.recent?.mean)}
              unit="per day"
              aside={<>to <span className="mono">{flow.latestDate}</span></>}
            />
            <Stat
              label="Trailing year"
              value={perDay(flow.trailing?.mean)}
              unit="per day"
              aside={<>index <span className="mono">{flow.indexTrailing !== null ? formatIndex(flow.indexTrailing) : 'n/a'}</span></>}
            />
            <Stat
              label="Five years"
              value={perDay(flow.fiveYear?.mean)}
              unit="per day"
              aside={flow.fiveYear && <span className="mono">{flow.fiveYear.from.slice(0, 4)} to {flow.fiveYear.to.slice(0, 4)}</span>}
            />
          </Stats>
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
        </>
      ) : (
        <p className="muted">Tanker transits not loaded yet.</p>
      )}
      <DisruptionList disruptions={disruptions} />
      <Facts>
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
      </Facts>
      <p className="source">
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
  const terminals = lngTerminalsInBasin(item, data.lngTerminals);
  const none = new Set<string>();
  const pipelineRows = filterRows({ pipelines: new Set(pipelines.map((p) => p.id)), chokepoints: none, lng: none }, data);
  const chokepointRowsInside = filterRows({ pipelines: none, chokepoints: new Set(chokepoints.map((c) => c.id)), lng: none }, data);
  const terminalRows = filterRows({ pipelines: none, chokepoints: none, lng: new Set(terminals.map((t) => t.id)) }, data);
  const province = item.provinceType === 'priority' ? 'Priority province' : 'Boutique province';
  return (
    <>
      <Header kind={`Basin · ${province.toLowerCase()}`} name={item.name} icon={<AssetIcon kind="basin" large />} />
      <Stats>
        <Stat label="Pipelines" value={data.pipelines.length ? pipelines.length.toLocaleString('en-US') : notAvailable} aside="crossing it" />
        <Stat label="Chokepoints" value={String(chokepoints.length)} aside="inside it" />
        <Stat
          label="Dominant"
          value={item.dominant ? capitalize(item.dominant) : <span className="muted">Not given</span>}
          aside="petroleum type"
        />
      </Stats>
      <RelatedList
        title="Pipelines crossing it"
        empty={data.pipelines.length ? 'None in the loaded data.' : 'Pipelines not loaded yet.'}
        rows={pipelineRows}
        data={data}
        onSelect={onSelect}
      />
      {terminalRows.length > 0 && (
        <RelatedList title="LNG terminals inside it" empty="" rows={terminalRows} data={data} onSelect={onSelect} />
      )}
      {chokepointRowsInside.length > 0 && (
        <RelatedList title="Chokepoints inside it" empty="" rows={chokepointRowsInside} data={data} onSelect={onSelect} />
      )}
      <Facts>
        <Row label="Countries">
          {item.countries.length ? (
            item.countries.map(formatCountry).sort().join(', ')
          ) : (
            <span className="muted">None on land (offshore)</span>
          )}
        </Row>
        <Row label="USGS code">
          <span className="mono">{item.code}</span>
        </Row>
      </Facts>
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
      <Header
        kind={`${COMMODITY_PIPELINE[item.commodity]}${curated ? ' · corridor' : ''}`}
        name={item.name}
        icon={<AssetIcon kind="pipeline" commodity={item.commodity} large />}
        lede={route ? <span className="mono">{route}</span> : undefined}
      />
      <dl className="status-card">
        <dt className="visually-hidden">Status</dt>
        <dd>
          <span className={`status status--${status} status-card__status`}>{statusLabel(status)}</span>
          {isUnverified(current, now) && (
            <span className="unverified status-card__line">
              Unverified since <span className="mono">{current!.observedAt}</span>
            </span>
          )}
          <span className="status-card__line">{current ? <EvidenceLine evidence={current} /> : 'No sourced claim yet'}</span>
          {claim && (
            <span className="status-card__line">
              Latest claim, {statusLabel(claim.status).toLowerCase()}: <EvidenceLine evidence={claim} />
            </span>
          )}
        </dd>
      </dl>
      <Stats>
        <Stat
          label="Capacity"
          value={item.capacity ? formatCapacity(item.capacity) : <span className="muted">Unknown</span>}
          aside={
            item.capacitySource && (
              <>
                <SourceLink href={item.capacitySource.url}>{item.capacitySource.publisher}</SourceLink>,{' '}
                <span className="mono">{item.capacitySource.publishedAt}</span>
              </>
            )
          }
        />
        <Stat
          label="Measured flow"
          value={
            flow?.recentMean != null ? (
              formatEnergyPerDay(flow.recentMean)
            ) : (
              <span className="muted">{item.flowSeriesId ? 'Not loaded yet' : 'Not measured'}</span>
            )
          }
          aside={
            flow?.recentMean != null && (
              // Where and when it was metered is on the status line above; this says how full it runs.
              <>
                {MEASURED_FLOW.windowDays}-day mean
                {flow.share !== null && (
                  <>
                    , <span className="mono">{formatIndexShare(flow.share)}</span> of technical capacity
                  </>
                )}
              </>
            )
          }
        />
      </Stats>
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
          <ol className="timeline">
            {item.evidence.map((e, i) => (
              <li key={i} className="timeline__item">
                <span className={`status status--${e.status}`}>{statusLabel(e.status)}</span>
                <span className="timeline__detail">
                  <EvidenceLine evidence={e} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {(item.operator || (item.owners && item.owners.length > 0) || !route) && (
        <Facts>
          {!route && (
            <Row label="Route">
              <span className="muted">Unknown</span>
            </Row>
          )}
          {item.operator && <Row label="Operator">{item.operator}</Row>}
          {item.owners && item.owners.length > 0 && (
            <Row label="Owners">
              {item.owners.map((o) => (
                <span key={o.name} className="facts__line">
                  {o.name}
                  {o.sharePct !== undefined && <span className="mono muted"> {o.sharePct}%</span>}
                </span>
              ))}
            </Row>
          )}
        </Facts>
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
      <Header kind="Gas storage" name={item.name} icon={<AssetIcon kind="storage" large />} />
      {summary ? (
        <>
          <section className="flow-headline">
            <p className="flow-headline__figure">{pct(summary.fill)}</p>
            <p className="flow-headline__text">
              of working gas volume in storage on <span className="mono">{summary.latestDate}</span>
            </p>
          </section>
          <Stats>
            <Stat
              label="Last 7 days"
              value={summary.change7d !== null ? signedPts(summary.change7d) : notAvailable}
              unit={summary.change7d !== null ? 'pts' : undefined}
            />
            <Stat
              label="Same date last year"
              value={summary.lastYear ? pct(summary.lastYear.fill) : notAvailable}
              aside={
                summary.lastYear && (
                  <>
                    now <span className="mono">{signedPts(summary.fill - summary.lastYear.fill)} pts</span>
                  </>
                )
              }
            />
          </Stats>
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

const LNG_FACILITY: Record<LngTerminal['facility'], string> = {
  export: 'LNG export terminal',
  import: 'LNG import terminal',
};

/** Capacity of the units in some states: none when there are no such units, unknown when GEM gives none. */
function unitCapacity(units: LngUnit[], states: AssetStatus[], total: number): { value: ReactNode; unit?: string } {
  const matching = units.filter((u) => states.includes(u.status));
  if (matching.length === 0) return { value: <span className="muted">None</span> };
  if (total === 0) return { value: <span className="muted">Unknown</span> };
  return { value: formatNumber(total, 1), unit: 'mtpa' };
}

export function LngDetail({ item, data, now }: { item: LngTerminal; data: Datasets; now: Date }) {
  const status = lngStatus(item);
  const disruptions = disruptionsFor(data, 'lng', item.id);
  const current = item.evidence[0];
  const kind = [LNG_FACILITY[item.facility], item.floating && 'floating', item.offshore && !item.floating && 'offshore']
    .filter(Boolean)
    .join(' · ');
  const place = [item.country && formatCountry(item.country), item.pointApprox && 'location approximate'].filter(Boolean).join(' · ');
  return (
    <>
      <Header kind={kind} name={item.name} icon={<AssetIcon kind="lng" large />} lede={place || undefined} />
      <dl className="status-card">
        <dt className="visually-hidden">Status</dt>
        <dd>
          <span className={`status status--${status} status-card__status`}>{statusLabel(status)}</span>
          {isUnverified(current, now) && (
            <span className="unverified status-card__line">
              Unverified since <span className="mono">{current!.observedAt}</span>
            </span>
          )}
          <span className="status-card__line">{current ? <EvidenceLine evidence={current} /> : 'No sourced claim yet'}</span>
        </dd>
      </dl>
      <Stats>
        <Stat
          label="Operating"
          {...unitCapacity(item.units, ['operating', 'reduced'], item.capacityMtpa.operating)}
          aside="units GEM lists as running"
        />
        <Stat
          label="Planned"
          {...unitCapacity(item.units, ['under_construction', 'planned'], item.capacityMtpa.planned)}
          aside="building or proposed"
        />
        <Stat label="Units" value={String(item.units.length)} aside={item.facility === 'export' ? 'trains' : 'regas units'} />
      </Stats>
      <DisruptionList disruptions={disruptions} />
      {item.evidence.length > 1 && (
        <section className="section">
          <h3 className="section__title">Status history</h3>
          <ol className="timeline">
            {item.evidence.map((e, k) => (
              <li key={k} className="timeline__item">
                <span className={`status status--${e.status}`}>{statusLabel(e.status)}</span>
                <span className="timeline__detail">
                  <EvidenceLine evidence={e} />
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      <section className="section">
        <h3 className="section__title">Units</h3>
        {current && current.sourceType !== 'dataset' && (
          <p className="muted section__lede">
            Unit statuses and capacities are Global Energy Monitor's, as of{' '}
            <span className="mono">{item.evidence.find((e) => e.sourceType === 'dataset')?.observedAt ?? 'its release'}</span>.
            The status above comes from later cited reports.
          </p>
        )}
        <table className="table">
          <thead>
            <tr>
              <th>Unit</th>
              <th>Status</th>
              <th className="num">mtpa</th>
              <th className="num">Start</th>
            </tr>
          </thead>
          <tbody>
            {item.units.map((u, i) => (
              <tr key={i}>
                <td>{u.name ?? <span className="muted">Unit {i + 1}</span>}</td>
                <td>
                  <span className={`status status--${u.status}`}>{statusLabel(u.status)}</span>
                </td>
                <td className="num mono">{u.capacityMtpa !== undefined ? formatNumber(u.capacityMtpa, 1) : '–'}</td>
                <td className="num mono">{u.startYear ?? '–'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <Facts>
        {item.operator && <Row label="Operator">{item.operator}</Row>}
        {item.owners && item.owners.length > 0 && (
          <Row label="Owners">
            {item.owners.map((o) => (
              <span key={o.name} className="facts__line">
                {o.name}
                {o.sharePct !== undefined && <span className="mono muted"> {o.sharePct}%</span>}
              </span>
            ))}
          </Row>
        )}
        <Row label="Location">
          <span className="mono">{formatLonLat(item.point)}</span>
        </Row>
      </Facts>
      <p className="source">
        <SourceLink href="https://globalenergymonitor.org/projects/global-gas-infrastructure-tracker/">
          Global Energy Monitor
        </SourceLink>
        , Global Gas Infrastructure Tracker, CC BY 4.0. Start is the actual year, or the latest planned year for units not
        yet running.
      </p>
    </>
  );
}

/** Rows that each open an asset: kind icon, name, and its status or band. */
export function AssetList({ rows, data, onSelect }: { rows: FilterRow[]; data: Datasets; onSelect: OnSelect }) {
  const pipelines = new Map(data.pipelines.map((p) => [p.id, p]));
  const terminals = new Map(data.lngTerminals.map((t) => [t.id, t]));
  const bands = new Map(chokepointRows(data).map((c) => [c.selection.id, c.band]));
  return (
    <ul className="changes">
      {rows.map((row) => {
        const pipeline = row.selection.kind === 'pipeline' ? pipelines.get(row.selection.id) : undefined;
        const terminal = row.selection.kind === 'lng' ? terminals.get(row.selection.id) : undefined;
        const status = pipeline ? pipelineStatus(pipeline) : terminal && lngStatus(terminal);
        return (
          <li key={`${row.selection.kind}/${row.selection.id}`}>
            <button type="button" className="change" onClick={() => onSelect(row.selection)}>
              <AssetIcon kind={row.selection.kind} commodity={pipeline?.commodity} />
              <span className="change__text">
                <span className="change__name">{row.name}</span>
                <span className="change__what">
                  {pipeline ? COMMODITY_PIPELINE[pipeline.commodity] : terminal ? LNG_FACILITY[terminal.facility] : 'Chokepoint'}
                  {' · '}
                  {status ? (
                    <span className={`status status--${status}`}>{statusLabel(status)}</span>
                  ) : (
                    <Band band={bands.get(row.selection.id) ?? null} />
                  )}
                  {row.curated && pipeline && ' · corridor'}
                </span>
              </span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

/** Related assets, counted in the heading; the first few show, the rest on request. */
function RelatedList({
  title,
  empty,
  rows,
  data,
  onSelect,
}: {
  title: string;
  empty: string;
  rows: FilterRow[];
  data: Datasets;
  onSelect: OnSelect;
}) {
  const [expanded, setExpanded] = useState(false);
  const titleId = useId();
  const limit = expanded ? FILTERS.listLimit : DETAIL.relatedLimit;
  const shown = rows.slice(0, limit);
  return (
    <section className="section" aria-labelledby={titleId}>
      <h3 className="section__title" id={titleId}>
        {title}
        {rows.length > 0 && <span className="section__count">{rows.length.toLocaleString('en-US')}</span>}
      </h3>
      {rows.length === 0 ? (
        <p className="muted">{empty}</p>
      ) : (
        <>
          <AssetList rows={shown} data={data} onSelect={onSelect} />
          {!expanded && rows.length > shown.length && (
            <button type="button" className="show-all" onClick={() => setExpanded(true)}>
              Show all {rows.length.toLocaleString('en-US')}
            </button>
          )}
          {expanded && rows.length > shown.length && (
            <p className="note">
              Showing the first <span className="mono">{shown.length}</span>; the map shows all of them.
            </p>
          )}
        </>
      )}
    </section>
  );
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export function statusLabel(status: string): string {
  return capitalize(status.replace(/_/g, ' '));
}
