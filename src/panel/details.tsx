import { useId, useMemo, useState, type ReactNode } from 'react';
import { ArrowUpRightIcon } from '@phosphor-icons/react';
import type { AssetStatus, Basin, Chokepoint, Company, Country, CountryCrudeImports, Evidence, LngTerminal, LngUnit, OilOriginRegion, OilRoute, OilTerminal, Pipeline } from '../types';
import type { Selection } from '../app/urlState';
import {
  CHOKEPOINT_NOTES,
  DETAIL,
  EIA_CHOKEPOINTS_SOURCE,
  EIA_REFERENCE_YEAR,
  FILTERS,
  MEASURED_FLOW,
  NEWS,
  FUELS,
  PADDS,
  PADD_SOURCE,
  REGION_FUEL_LABELS,
  STORAGE_NOT_COVERED,
  COMTRADE,
  CRUDE_IMPORTS,
  EUROSTAT_OIL,
  type FuelId,
  type RegionFuel,
  tankerCargoSeriesId,
} from '../lib/config';
import { storageByCountry, vsLastYearPct, type CountryStorage } from '../lib/gasStorage';
import { importPeriod, originsOfCountry } from '../lib/crudeImports';
import { viewEnabled, type ViewId } from '../lib/views';
import { CADENCE_LABEL, StorageSources } from './StorageView';
import { CHANGE_LABEL, STORAGE_HEADLINE, storageChange, storageFigure } from '../lib/gasStorage';
import { ALSI_URL, ENTSOG_URL, isReport, isUnverified, latestClaim, pipelineFlow, reportParts } from '../lib/evidence';
import {
  chokepointFlows,
  chokepointsInBasin,
  disruptionsFor,
  fuelOriginsFor,
  originsFor,
  lngTerminalsInBasin,
  pipelineDisruptions,
  pipelinesTouchingBasin,
  portCallsAt,
  portCallsFor,
  seriesById,
  terminalsForPipeline,
  terminalsViaChokepoint,
  type PortCalls,
  systemSections,
  type Datasets,
} from '../lib/data';
import { chokepointFlow, type ChokepointFlow, type FlowBand } from '../lib/flow';
import { formatIndex, formatIndexShare, formatNumber, formatShare, formatSignedPct, formatStorageVolume, formatThousandfold, formatTonnes } from '../lib/format';
import type { Disruption } from '../types';
import { Sparkline } from './Sparkline';
import { formatCapacity, formatCountry, formatEnergyPerDay, formatLonLat, formatMbd } from '../lib/format';
import { lngStatus, pipelineAge, pipelineStatus, shareCoverage, terminalStatus } from '../lib/encoding';
import { filterRows, type FilterRow } from '../lib/filters';
import { chokepointRows } from '../lib/summary';
import { AssetIcon } from './AssetIcon';
import { capitalize, COMMODITY_PIPELINE, LNG_FACILITY, OIL_ROLE, statusLabel } from '../lib/labels';

export { detailKind, statusLabel } from '../lib/labels';
import { FuelTabs } from './FuelTabs';
import type { ChokepointExposure, OriginRow } from '../lib/oilOrigins';
import { Info } from './Info';
import { NewsList } from './NewsList';
import { assetHeadlines } from '../lib/headlines';

/** A region can open on a given fuel (M7); everything else ignores it. */
type OnSelect = (selection: Selection, fuel?: RegionFuel) => void;

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="facts__row">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

/**
 * What kind of thing a detail shows, for the panel's top bar: "LNG export terminal", "Gas pipeline ·
 * corridor". The detail itself leads with the name.
 */
/** Icon and name, with an optional line under the name for what places the asset. */
function Header({ name, icon, lede }: { name: string; icon: ReactNode; lede?: ReactNode }) {
  return (
    <header className="detail__header">
      {icon}
      <div className="detail__heading">
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

export function SourceLink({ href, children }: { href: string; children: ReactNode }) {
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


export function ChokepointDetail({ item, data, now, onSelect }: { item: Chokepoint; data: Datasets; now: Date; onSelect: OnSelect }) {
  const note = CHOKEPOINT_NOTES[item.id];
  const terminals = oilTerminalRows(terminalsViaChokepoint(data, item.id));
  const flow = chokepointFlow(seriesById(data, item.transitSeriesId));
  const cargo = chokepointFlow(seriesById(data, tankerCargoSeriesId(item.transitSeriesId.replace(/^portwatch-/, ''))));
  const disruptions = disruptionsFor(data, 'chokepoint', item.id);
  return (
    <>
      <Header name={item.name} icon={<AssetIcon kind="chokepoint" large />} />
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
              band={flow.band}
              label={`Daily tanker transits at ${item.name}, ${flow.sparkline[0]?.date} to ${flow.latestDate}`}
              references={[
                ...(flow.fiveYear ? [{ value: flow.fiveYear.mean, label: 'Five-year average', style: 'dashed' as const }] : []),
                ...(flow.trailing ? [{ value: flow.trailing.mean, label: 'Trailing year', style: 'dotted' as const }] : []),
              ]}
            />
          </section>
          {cargo && (
            <TonnesSection
              title="Estimated tanker cargo, last 90 days"
              flow={cargo}
              noun="carried through"
              label={`Estimated daily tanker cargo through ${item.name}`}
            />
          )}
        </>
      ) : (
        <p className="muted">Tanker transits not loaded yet.</p>
      )}
      <DisruptionList disruptions={disruptions} />
      <AssetNews selection={{ kind: 'chokepoint', id: item.id }} data={data} now={now} onSelect={onSelect} />
      {terminals.length > 0 && (
        <RelatedList title="Oil terminals that ship through it" empty="" rows={terminals} data={data} onSelect={onSelect} />
      )}
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
        Transits are vessel counts from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>, and cargo
        is PortWatch's estimate from each tanker's draft and size, in metric tons of any liquid cargo. The EIA figure is
        barrels, shown for scale. They aren't compared.
        {note && ` ${note}`}
      </p>
    </>
  );
}

/**
 * Daily tanker calls at the port a pipeline ends at. Context, not status evidence: a tanker there may
 * be loading oil from elsewhere, and more than one pipeline can end at the same port.
 */
function PortCallsSection({ calls, terminal }: { calls: PortCalls; terminal?: boolean }) {
  const { port, flow, exports } = calls;
  return (
    <section className="section">
      <div className="title-row">
        <h3 className="section__title">Tanker calls at {port}, last 90 days</h3>
        <Info label={`About tanker calls at ${port}`}>
          Calls by tankers of any cargo, from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>.{' '}
          {terminal ? 'They count all tanker traffic at the port, not crude loadings.' : 'They show traffic at the port, not flow on this pipeline.'}
          {exports?.recent && " Exports are PortWatch's estimate from the change in each tanker's draft, in metric tons of any liquid cargo."}
        </Info>
      </div>
      <p className="section__lede">
        <span className="mono">{perDay(flow.recent?.mean)}</span> per day over the 7 days to{' '}
        <span className="mono">{flow.latestDate}</span>
        {flow.indexFiveYear !== null && (
          <>
            , <span className="mono">{formatIndexShare(flow.indexFiveYear)}</span> of the five-year average
          </>
        )}
        . <Band band={flow.band} />
      </p>
      <Sparkline
        points={flow.sparkline}
        unit="/day"
        band={flow.band}
        label={`Daily tanker port calls at ${port}, ${flow.sparkline[0]?.date} to ${flow.latestDate}`}
        references={[
          ...(flow.fiveYear ? [{ value: flow.fiveYear.mean, label: 'Five-year average', style: 'dashed' as const }] : []),
          ...(flow.trailing ? [{ value: flow.trailing.mean, label: 'Trailing year', style: 'dotted' as const }] : []),
        ]}
      />
      {exports?.recent && (
        <p className="section__lede">
          Estimated exports by tanker: <span className="mono">{formatTonnes(exports.recent.mean)}</span> per day
          {exports.indexFiveYear !== null && (
            <>
              , <span className="mono">{formatIndexShare(exports.indexFiveYear)}</span> of the five-year average
            </>
          )}
          .
        </p>
      )}
    </section>
  );
}

/** A PortWatch tonnage estimate: the 7-day level against the five-year average, and 90 days of it. */
function TonnesSection({ title, flow, noun, label }: { title: string; flow: ChokepointFlow; noun: string; label: string }) {
  return (
    <section className="section">
      <h3 className="section__title">{title}</h3>
      {flow.recent && (
        <p className="section__lede">
          <span className="mono">{formatTonnes(flow.recent.mean)}</span> {noun} per day over the 7 days to{' '}
          <span className="mono">{flow.latestDate}</span>
          {flow.indexFiveYear !== null && (
            <>
              , <span className="mono">{formatIndexShare(flow.indexFiveYear)}</span> of the five-year average
            </>
          )}
          . <Band band={flow.band} />
        </p>
      )}
      <Sparkline
        points={flow.sparkline}
        unit="/day"
        band={flow.band}
        format={formatTonnes}
        label={`${label}, ${flow.sparkline[0]?.date} to ${flow.latestDate}`}
        references={[
          ...(flow.fiveYear ? [{ value: flow.fiveYear.mean, label: 'Five-year average', style: 'dashed' as const }] : []),
          ...(flow.trailing ? [{ value: flow.trailing.mean, label: 'Trailing year', style: 'dotted' as const }] : []),
        ]}
      />
    </section>
  );
}

/**
 * A source the news scan added without a person checking it (SPEC M9): its headline, and a note saying
 * so. The link beside it is the way to check.
 */
export function Unreviewed({ title }: { title: string }) {
  return (
    <span className="unreviewed">
      {': '}
      {title}
      <span className="unreviewed__note"> · Not yet reviewed: added automatically from the news. Read the source to check it.</span>
    </span>
  );
}

/**
 * The headlines naming this asset (added 2026-11-04), after its disruptions and reports: as the feeds list
 * them, unreviewed, each with the other places it names. Nothing shows when no headline names it.
 */
function AssetNews({ selection, data, now, onSelect }: { selection: Selection; data: Datasets; now: Date; onSelect: OnSelect }) {
  const rows = assetHeadlines(data, selection);
  const titleId = useId();
  if (!rows.length) return null;
  return (
    <section className="section" aria-labelledby={titleId}>
      <div className="title-row">
        <h3 className="section__title" id={titleId}>
          In the news
        </h3>
        <Info label="About the headlines">
          Recent headlines from GDELT and Google News that name this place, from the last {NEWS.headlineDays} days, as the feeds list them.
          They aren't reviewed: read the article before relying on it. Disruptions and reports above are the cited record.
        </Info>
      </div>
      <NewsList rows={rows} data={data} now={now} onSelect={onSelect} />
    </section>
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
                  {s.unreviewed && <Unreviewed title={s.title} />}
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
  const pipelineRows = filterRows({ pipelines: new Set(pipelines.map((p) => p.id)), chokepoints: none, lng: none, terminals: none }, data);
  const chokepointRowsInside = filterRows(
    { pipelines: none, chokepoints: new Set(chokepoints.map((c) => c.id)), lng: none, terminals: none },
    data,
  );
  const terminalRows = filterRows({ pipelines: none, chokepoints: none, lng: new Set(terminals.map((t) => t.id)), terminals: none }, data);
  return (
    <>
      <Header name={item.name} icon={<AssetIcon kind="basin" large />} />
      <Stats>
        <Stat label="Pipelines" value={data.pipelines.length ? pipelines.length.toLocaleString('en-US') : notAvailable} aside="crossing it" />
        <Stat label="Chokepoints" value={String(chokepoints.length)} aside="inside it" />
        <Stat
          label="Dominant"
          value={item.dominant ? capitalize(item.dominant) : <span className="muted">Not given</span>}
          aside="petroleum type"
        />
      </Stats>
      <BasinVolumesSection basin={item} />
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

/** Oil and gas produced, remaining and undiscovered, as USGS assessed them in 2000. Never today's reserves. */
function BasinVolumesSection({ basin }: { basin: Basin }) {
  const { volumes } = basin;
  const titleId = useId();
  const cell = (value: number | null) => (value === null ? <span className="muted">–</span> : formatThousandfold(value));
  return (
    <section className="section" aria-labelledby={titleId}>
      <div className="title-row">
        <h3 className="section__title" id={titleId}>
          Oil and gas, as assessed in 2000
        </h3>
        <Info label="About these volumes">
          From the USGS World Petroleum Assessment 2000. Produced and remaining are for fields discovered by 1996, from an
          industry database; undiscovered is the assessment's mean estimate of what is yet to be found. Nothing produced or
          found since is counted, so remaining is not what is left today.
        </Info>
      </div>
      {volumes ? (
        <table className="table">
          <thead>
            <tr>
              <th>Petroleum</th>
              <th className="num">Produced</th>
              <th className="num">Remaining</th>
              <th className="num">Undiscovered</th>
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Oil, billion barrels', volumes.oil],
                ['Gas, trillion ft³', volumes.gas],
              ] as const
            ).map(([label, v]) => (
              <tr key={label}>
                <td>{label}</td>
                <td className="num mono">{cell(v.produced)}</td>
                <td className="num mono">{cell(v.remaining)}</td>
                <td className="num mono">{cell(v.undiscovered)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="muted">
          No volumes for this province.
          {basin.countries.includes('US') && ' The 2000 assessment left out the United States, which USGS assesses on its own.'}
        </p>
      )}
    </section>
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

/** What a report is, in the status card: "Press report", "Operator statement". */
const REPORT_KIND: Record<Evidence['sourceType'], string> = {
  operator: 'Operator statement',
  regulator: 'Regulator notice',
  government: 'Government statement',
  press: 'Press report',
  dataset: 'Dataset',
  measured: 'Measured',
};

/**
 * The status card's line for the current evidence. A report is named, credited and dated here, and read
 * in full under Reports; datasets and meters keep their one-line statement.
 */
function StatusSource({ evidence }: { evidence: Evidence }) {
  if (!isReport(evidence)) return <EvidenceLine evidence={evidence} />;
  const { publisher, host } = reportParts(evidence);
  const from = publisher ?? host;
  return (
    <>
      {REPORT_KIND[evidence.sourceType]}
      {from && ` from ${from}`}, <span className="mono">{evidence.observedAt}</span>
    </>
  );
}

/**
 * Every dated claim behind an asset's status, newest first, each an item of its own: what kind of source
 * and who, when, the status it supports, the statement, and a link out. Datasets join the list when
 * there's at least one report beside them; meters are shown with their charts.
 */
function Reports({ evidence }: { evidence: Evidence[] }) {
  const titleId = useId();
  const items = evidence.filter((e) => e.sourceType !== 'measured');
  if (!items.some(isReport)) return null;
  return (
    <section className="section" aria-labelledby={titleId}>
      <h3 className="section__title" id={titleId}>
        Reports <span className="section__count">{items.length}</span>
      </h3>
      <ol className="reports">
        {items.map((e, i) => {
          const { text, publisher, host } = reportParts(e);
          return (
            <li key={i} className="report">
              <p className="report__meta">
                <span className={`status status--${e.status}`}>{statusLabel(e.status)}</span>
                <span>
                  {SOURCE_TYPE_LABELS[e.sourceType]}
                  {publisher && ` · ${publisher}`} · <time className="mono">{e.observedAt}</time>
                </span>
              </p>
              <p className="report__text">{text || SOURCE_TYPE_LABELS[e.sourceType]}</p>
              {e.url && (
                <a className="report__link" href={e.url} target="_blank" rel="noreferrer">
                  Read on {host ?? 'the source'}
                  <ArrowUpRightIcon size={14} aria-hidden="true" />
                </a>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}

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
  const route = [item.fromCountry, ...item.transitCountries, item.toCountry].filter(Boolean).join(' → ');
  const curated = item.sources.includes('curated');
  const sections = systemSections(item, data.pipelines);
  const none = new Set<string>();
  const sectionRows = filterRows({ pipelines: new Set(sections.map((p) => p.id)), chokepoints: none, lng: none, terminals: none }, data);
  return (
    <>
      <Header
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
          <span className="status-card__line">{current ? <StatusSource evidence={current} /> : 'No sourced claim yet'}</span>
          {claim && (
            <span className="status-card__line">
              Latest claim, {statusLabel(claim.status).toLowerCase()}: <StatusSource evidence={claim} />
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
                {'accessedAt' in item.capacitySource ? (
                  <>
                    read <span className="mono">{item.capacitySource.accessedAt}</span>
                  </>
                ) : (
                  <span className="mono">{item.capacitySource.publishedAt}</span>
                )}
              </>
            )
          }
        />
        <ServiceStat history={item.history} now={now} />
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
      {portCalls.map((calls) => (
        <PortCallsSection key={calls.port} calls={calls} />
      ))}
      {endTerminals.length > 0 && (
        <RelatedList title="Ends at" empty="" rows={endTerminals} data={data} onSelect={onSelect} />
      )}
      <DisruptionList disruptions={disruptions} />
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
              <span className="mono">{formatNumber(item.lengthKm.value, 0)} km</span>
              {item.lengthKm.estimated && <span className="muted"> (estimated from the route)</span>}
            </Row>
          )}
          {item.diameter && (
            <Row label="Diameter">
              <span className="mono">{item.diameter}</span>
            </Row>
          )}
          {item.history?.proposalYear !== undefined && (
            <Row label="Proposed">
              <span className="mono">{item.history.proposalYear}</span>
            </Row>
          )}
          {item.history?.constructionYear !== undefined && (
            <Row label="Construction began">
              <span className="mono">{item.history.constructionYear}</span>
            </Row>
          )}
          {item.history && item.history.startYears.length > 1 && (
            <Row label={item.history.expected ? 'Sections expected' : 'Sections opened'}>
              <span className="mono">{item.history.startYears.join(', ')}</span>
            </Row>
          )}
          {item.history?.stopYear !== undefined && (
            <Row label="Stopped running">
              <span className="mono">{item.history.stopYear}</span>
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

/** Companies with their shares, and a note when the listed shares don't add up to the whole. */
/** GEM's page for the pipeline, where its ownership section cites what the shares come from. */
function GemOwnership({ url }: { url: string }) {
  return (
    <span className="facts__line muted">
      Ownership per <SourceLink href={url}>Global Energy Monitor</SourceLink>
    </span>
  );
}

/** Owners or parents with their shares; a name links to the company's home page where GEM gives one. */
function CompanyList({ companies }: { companies: Company[] }) {
  const covered = shareCoverage(companies);
  return (
    <>
      {companies.map((c) => (
        <span key={c.name} className="facts__line">
          {c.url ? <SourceLink href={c.url}>{c.name}</SourceLink> : c.name}
          {c.sharePct !== undefined && <span className="mono muted"> {c.sharePct}%</span>}
        </span>
      ))}
      {covered !== null && (
        <span className="facts__line muted">
          Listed shares cover <span className="mono">{formatNumber(covered, 1)}%</span>
        </span>
      )}
    </>
  );
}

/** The year the line first ran, and its age; or the year it's meant to. */
function ServiceStat({ history, now }: { history: Pipeline['history']; now: Date }) {
  const first = history?.startYears[0];
  if (first === undefined) return <Stat label="In service since" value={<span className="muted">Unknown</span>} />;
  if (history!.expected) return <Stat label="Expected start" value={String(first)} aside="target year, per GEM" />;
  const age = pipelineAge(history!, now);
  const years = (n: number) => `${n} ${n === 1 ? 'year' : 'years'}`;
  return (
    <Stat
      label="In service since"
      value={String(first)}
      aside={
        history!.stopYear !== undefined
          ? `ran ${years(age)}, to ${history!.stopYear}`
          : age === 0
            ? 'opened this year'
            : years(age)
      }
    />
  );
}

/**
 * A country's page (SPEC M10): its gas storage and where its crude imports come from, each while its
 * surface is on. On the oil origins surface the imports come first.
 */
export function CountryDetail({ item, data, view, onSelect }: { item: Country; data: Datasets; view: ViewId | null; onSelect: OnSelect }) {
  const storage = useMemo(() => storageByCountry(data.series).get(item.id) ?? null, [data, item.id]);
  const notCovered = STORAGE_NOT_COVERED.find((c) => c.country === item.id);
  const storageId = useId();
  const showStorage = viewEnabled('storage');
  const showImports = viewEnabled('origins');
  const storageSection = showStorage && (
    <section className="country-section" aria-labelledby={storageId} key="storage">
      <h3 className="country-section__title" id={storageId}>
        Gas storage
      </h3>
      {storage ? (
        <StorageFigures storage={storage} name={item.name} />
      ) : (
        <p className="muted">{notCovered ? `${notCovered.note}.` : 'No storage data for this country.'}</p>
      )}
      {storage && <StorageSources sources={[storage.source]} data={data} />}
    </section>
  );
  const importsSection = showImports && <CrudeImports key="imports" country={item.id} data={data} onSelect={onSelect} />;
  return (
    <>
      <Header name={item.name} icon={<AssetIcon kind="country" large />} />
      {view === 'origins' ? [importsSection, storageSection] : [storageSection, importsSection]}
    </>
  );
}

const IMPORT_SOURCE_NAME: Record<CountryCrudeImports['source'], string> = { eurostat: 'Eurostat', comtrade: 'UN Comtrade', eia: 'EIA' };

/** Where a country's crude imports come from, by partner, with the chokepoints on the cited routes. */
function CrudeImports({ country, data, onSelect }: { country: string; data: Datasets; onSelect: OnSelect }) {
  const origins = useMemo(() => originsOfCountry(data, country), [data, country]);
  const id = useId();
  const record = origins?.record;
  return (
    <section className="country-section" aria-labelledby={id}>
      <div className="title-row">
        <h3 className="country-section__title" id={id}>
          Where its crude comes from
        </h3>
        <Info label="About where the country's crude comes from">
          Crude oil imports by partner country, as shares of the total. Each source names the partner as it records it, so crude
          shipped through a third country can carry that country's name. Crude produced at home isn't counted here.
        </Info>
      </div>
      {!origins || !record ? (
        <p className="muted">No crude import data for this country.</p>
      ) : (
        <>
          <p className="country-section__lede">
            {IMPORT_SOURCE_NAME[record.source]}, <span className="mono">{importPeriod(record)}</span>
            {record.monthsReported !== null && record.monthsReported < CRUDE_IMPORTS.windowMonths && (
              <>
                {' '}
                ({record.monthsReported} of {CRUDE_IMPORTS.windowMonths} months reported)
              </>
            )}
            , {record.basis === 'weight' ? 'by weight' : 'by value, since no weights were reported'}.
          </p>
          <OriginList rows={origins.rows} onRegion={() => {}} />
          <OnTheWay origins={origins} data={data} onSelect={onSelect} />
          {country === 'US' && data.oilOrigins.length > 0 && (
            <section className="section" aria-labelledby={`${id}-regions`}>
              <h3 className="section__title" id={`${id}-regions`}>
                By fuel region
              </h3>
              <ul className="plain-list">
                {data.oilOrigins.map((r) => (
                  <li key={r.id}>
                    <button type="button" className="link-button" onClick={() => onSelect({ kind: 'region', id: r.id }, 'crude')}>
                      {r.name}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <CrudeImportsSource record={record} />
        </>
      )}
    </section>
  );
}

/** Each import source's credit, with what was done to it. */
export function CrudeImportsSource({ record }: { record: Pick<CountryCrudeImports, 'source' | 'basis' | 'to' | 'retrieved'> }) {
  return (
    <p className="source">
      {record.source === 'eurostat' && (
        <>
          <SourceLink href={EUROSTAT_OIL.pageUrl}>Eurostat, imports of oil and petroleum products by partner country, monthly</SourceLink> (
          {EUROSTAT_OIL.dataset}), <SourceLink href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</SourceLink>, accessed{' '}
          <span className="mono">{record.retrieved}</span>. Changed: crude oil only, summed over the months shown and turned into shares.
        </>
      )}
      {record.source === 'comtrade' && (
        <>
          Source: <SourceLink href={COMTRADE.pageUrl}>UN Comtrade</SourceLink>. Imports of crude petroleum (HS {COMTRADE.cmdCode}),{' '}
          <span className="mono">{record.to}</span>, accessed <span className="mono">{record.retrieved}</span>. Shares computed here by{' '}
          {record.basis === 'weight' ? 'net weight' : 'value'}.
        </>
      )}
      {record.source === 'eia' && (
        <>
          <SourceLink href="https://www.eia.gov/opendata/">US Energy Information Administration</SourceLink>, crude imports by country of
          origin into the five fuel regions, summed.
        </>
      )}
    </p>
  );
}


function StorageFigures({ storage, name }: { storage: CountryStorage; name: string }) {
  const { summary, series } = storage;
  const change = storageChange(storage, true);
  const value = (v: number) => (storage.fill !== null ? `${formatNumber(v, 1)}%` : formatStorageVolume(v, series.unit));
  const span = storage.cadence === 'monthly' ? 'Same month last year' : storage.cadence === 'weekly' ? 'Same week last year' : 'Same date last year';
  return (
    <>
      <section className="flow-headline">
        <p className="flow-headline__figure">{storageFigure(storage)}</p>
        <p className="flow-headline__text">
          {STORAGE_HEADLINE[storage.source]} <span className="mono">{summary.latest.date}</span>
          {storage.caution && <>. JODI marks this value to use with caution</>}
        </p>
      </section>
      <Stats>
        <Stat label={CHANGE_LABEL[storage.cadence]} value={change ?? notAvailable} />
        <Stat
          label={span}
          value={summary.lastYear ? value(summary.lastYear.value) : notAvailable}
          aside={
            storage.vsLastYearPct !== null && (
              <>
                now <span className="mono">{formatSignedPct(storage.vsLastYearPct)}</span>
              </>
            )
          }
        />
      </Stats>
      <section className="section">
        <h3 className="section__title">{storage.fill !== null ? 'Storage fill' : 'Gas in storage'}, last 12 months</h3>
        <Sparkline
          points={summary.year}
          unit={storage.fill !== null ? '%' : series.unit}
          lineLabel={CADENCE_LABEL[storage.cadence]}
          label={`${storage.fill !== null ? 'Gas storage fill' : 'Gas in storage'} in ${name}, ${summary.year[0]?.date} to ${summary.latest.date}`}
          references={summary.lastYear ? [{ value: summary.lastYear.value, label: span, style: 'dashed' as const }] : []}
        />
      </section>
      {storage.parts.length > 0 && (
        <section className="section" aria-labelledby="storage-parts">
          <h3 className="section__title" id="storage-parts">
            {storage.source === 'eia' ? 'By storage region' : 'By province'}
          </h3>
          <ul className="plain-list">
            {storage.parts.map((p) => {
              const vs = vsLastYearPct(p.summary);
              return (
                <li key={p.id}>
                  <span className="plain-list__name">{p.name}</span>{' '}
                  <span className="mono">{formatStorageVolume(p.summary.latest.value, p.series.unit)}</span>
                  {vs !== null && <span className="muted mono"> · {formatSignedPct(vs)} vs last year</span>}
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </>
  );
}

/** Capacity of the units in some states: none when there are no such units, unknown when GEM gives none. */
function unitCapacity(units: LngUnit[], states: AssetStatus[], total: number): { value: ReactNode; unit?: string } {
  const matching = units.filter((u) => states.includes(u.status));
  if (matching.length === 0) return { value: <span className="muted">None</span> };
  if (total === 0) return { value: <span className="muted">Unknown</span> };
  return { value: formatNumber(total, 1), unit: 'mtpa' };
}

export function LngDetail({ item, data, now, onSelect }: { item: LngTerminal; data: Datasets; now: Date; onSelect: OnSelect }) {
  const status = lngStatus(item);
  const disruptions = disruptionsFor(data, 'lng', item.id);
  const current = item.evidence[0];
  const claim = current?.sourceType === 'measured' ? latestClaim(item) : undefined;
  const sendOut = pipelineFlow(seriesById(data, item.sendOutSeriesId));
  const place = [item.country && formatCountry(item.country), item.pointApprox && 'location approximate'].filter(Boolean).join(' · ');
  return (
    <>
      <Header name={item.name} icon={<AssetIcon kind="lng" large />} lede={place || undefined} />
      <dl className="status-card">
        <dt className="visually-hidden">Status</dt>
        <dd>
          <span className={`status status--${status} status-card__status`}>{statusLabel(status)}</span>
          {isUnverified(current, now) && (
            <span className="unverified status-card__line">
              Unverified since <span className="mono">{current!.observedAt}</span>
            </span>
          )}
          <span className="status-card__line">{current ? <StatusSource evidence={current} /> : 'No sourced claim yet'}</span>
          {claim && (
            <span className="status-card__line">
              Latest claim, {statusLabel(claim.status).toLowerCase()}: <StatusSource evidence={claim} />
            </span>
          )}
        </dd>
      </dl>
      <Stats>
        {sendOut && (
          <Stat
            label="Send-out"
            value={
              sendOut.recentMean != null ? formatEnergyPerDay(sendOut.recentMean) : <span className="muted">Not reported</span>
            }
            aside={
              sendOut.recentMean != null && (
                <>
                  {MEASURED_FLOW.windowDays}-day mean
                  {sendOut.share !== null && (
                    <>
                      , <span className="mono">{formatIndexShare(sendOut.share)}</span> of declared capacity
                    </>
                  )}
                </>
              )
            }
          />
        )}
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
        {/* With send-out shown, the unit count makes way; the table below lists the units. */}
        {!sendOut && (
          <Stat label="Units" value={String(item.units.length)} aside={item.facility === 'export' ? 'trains' : 'regas units'} />
        )}
      </Stats>
      {sendOut && sendOut.sparkline.length > 1 && (
        <section className="section">
          <h3 className="section__title">Daily send-out, last 90 days</h3>
          <Sparkline
            points={sendOut.sparkline.map((p) => ({ date: p.date, value: p.value / 1e6 }))}
            unit=" GWh/d"
            label={`Daily LNG send-out for ${item.name}, ${sendOut.sparkline[0]?.date} to ${sendOut.latestDate}`}
            references={
              sendOut.capacity
                ? [{ value: sendOut.capacity / 1e6, label: 'Declared send-out capacity', style: 'dashed' as const }]
                : []
            }
          />
        </section>
      )}
      <DisruptionList disruptions={disruptions} />
      <Reports evidence={item.evidence} />
      <AssetNews selection={{ kind: 'lng', id: item.id }} data={data} now={now} onSelect={onSelect} />
      <section className="section">
        <div className="title-row">
          <h3 className="section__title">Units</h3>
          {current && current.sourceType !== 'dataset' && (
            <Info label="About the units">
              Unit statuses and capacities are Global Energy Monitor's, as of{' '}
              <span className="mono">{item.evidence.find((e) => e.sourceType === 'dataset')?.observedAt ?? 'its release'}</span>.{' '}
              {current.sourceType === 'measured'
                ? 'The status above comes from measured send-out.'
                : 'The status above comes from later cited reports.'}
            </Info>
          )}
        </div>
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
            <CompanyList companies={item.owners} />
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
        {sendOut && (
          <>
            {' '}
            Send-out: <SourceLink href={ALSI_URL}>GIE ALSI</SourceLink>.
          </>
        )}
      </p>
    </>
  );
}

function oilTerminalRows(terminals: OilTerminal[]): FilterRow[] {
  return terminals
    .map((t) => ({ selection: { kind: 'terminal' as const, id: t.id }, name: t.name, curated: true }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function formatThroughput(value: number): string {
  return `${formatNumber(value, value < 1 ? 2 : 1)} mb/d`;
}

export function OilTerminalDetail({ item, data, now, onSelect }: { item: OilTerminal; data: Datasets; now: Date; onSelect: OnSelect }) {
  const status = terminalStatus(item);
  const current = item.evidence[0];
  const disruptions = disruptionsFor(data, 'terminal', item.id);
  const calls = item.portwatchId ? portCallsAt(data, item.portwatchId, item.name) : null;
  const none = new Set<string>();
  const pipelineRows = filterRows({ pipelines: new Set(item.pipelineIds), chokepoints: none, lng: none, terminals: none }, data);
  const chokepointRowsOut = filterRows({ pipelines: none, chokepoints: new Set(item.exitVia), lng: none, terminals: none }, data);
  const chokepointNames = item.exitVia.map((id) => data.chokepoints.find((c) => c.id === id)?.name ?? id);
  return (
    <>
      <Header
        name={item.name}
        icon={<AssetIcon kind="terminal" large />}
        lede={[formatCountry(item.country), item.pointApprox && 'location approximate'].filter(Boolean).join(' · ')}
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
          <span className="status-card__line">
            {current ? <StatusSource evidence={current} /> : 'No dated source on its current status yet'}
          </span>
        </dd>
      </dl>
      <Stats>
        <Stat
          label="Loadings"
          value={item.throughput ? formatThroughput(item.throughput.value) : <span className="muted">Not sourced</span>}
          aside={
            item.throughput && (
              <>
                {item.throughput.period},{' '}
                <SourceLink href={item.throughput.source.url}>{item.throughput.source.publisher}</SourceLink>
              </>
            )
          }
        />
        <Stat
          label="Route to sea"
          value={chokepointNames.length ? chokepointNames.join(' or ') : 'Open sea'}
          aside={chokepointNames.length ? (chokepointNames.length > 1 ? 'chokepoints, either way' : 'chokepoint') : 'no chokepoint'}
        />
        <Stat label="Pipelines" value={String(item.pipelineIds.length)} aside="ending here" />
      </Stats>
      {calls && <PortCallsSection calls={calls} terminal />}
      <DisruptionList disruptions={disruptions} />
      <Reports evidence={item.evidence} />
      <AssetNews selection={{ kind: 'terminal', id: item.id }} data={data} now={now} onSelect={onSelect} />
      {pipelineRows.length > 0 && (
        <RelatedList title="Pipelines ending here" empty="" rows={pipelineRows} data={data} onSelect={onSelect} />
      )}
      {chokepointRowsOut.length > 0 && (
        <RelatedList title="Chokepoints on the way out" empty="" rows={chokepointRowsOut} data={data} onSelect={onSelect} />
      )}
      <Facts>
        {item.operator && <Row label="Operator">{item.operator}</Row>}
        <Row label="Location">
          <span className="mono">{formatLonLat(item.point)}</span>
          <span className="facts__aside">
            {item.pointSource.publisher}, {item.pointSource.detail}
          </span>
        </Row>
      </Facts>
      <p className="source">
        Hand-curated. Each claim links its source; a terminal with no dated source shows its status as unknown. Loadings
        are a cited average over the period shown, not capacity.
      </p>
    </>
  );
}

/** Rows that each open an asset: kind icon, name, and its status or band. */
export function AssetList({ rows, data, onSelect }: { rows: FilterRow[]; data: Datasets; onSelect: OnSelect }) {
  const pipelines = new Map(data.pipelines.map((p) => [p.id, p]));
  const terminals = new Map(data.lngTerminals.map((t) => [t.id, t]));
  const oilTerminals = new Map(data.oilTerminals.map((t) => [t.id, t]));
  const bands = new Map(chokepointRows(data).map((c) => [c.selection.id, c.band]));
  return (
    <ul className="changes">
      {rows.map((row) => {
        const pipeline = row.selection.kind === 'pipeline' ? pipelines.get(row.selection.id) : undefined;
        const terminal = row.selection.kind === 'lng' ? terminals.get(row.selection.id) : undefined;
        const oilTerminal = row.selection.kind === 'terminal' ? oilTerminals.get(row.selection.id) : undefined;
        const status = pipeline
          ? pipelineStatus(pipeline)
          : terminal
            ? lngStatus(terminal)
            : oilTerminal && terminalStatus(oilTerminal);
        return (
          <li key={`${row.selection.kind}/${row.selection.id}`}>
            <button type="button" className="change" onClick={() => onSelect(row.selection)}>
              <AssetIcon kind={row.selection.kind} commodity={pipeline?.commodity} />
              <span className="change__text">
                <span className="change__name">{row.name}</span>
                <span className="change__what">
                  {pipeline
                    ? COMMODITY_PIPELINE[pipeline.commodity]
                    : terminal
                      ? LNG_FACILITY[terminal.facility]
                      : oilTerminal
                        ? OIL_ROLE[oilTerminal.role]
                        : 'Chokepoint'}
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

/** EIA's own tables behind a region view; the imports table is per region (R10 to R50). Checked 2026-10-29. */
const eiaSeries = (eia: string) =>
  [
    ['Imports by country of origin', `https://www.eia.gov/dnav/pet/pet_move_impcp_a2_${eia.toLowerCase()}_epc0_ip0_mbbl_m.htm`],
    ['Movements between regions', 'https://www.eia.gov/dnav/pet/pet_move_ptb_a_epc0_tnr_mbbl_m.htm'],
    ['Production by state', 'https://www.eia.gov/dnav/pet/pet_crd_crpdn_adc_mbbl_m.htm'],
  ] as const;

/** "2026-07" -> "July 2026". */
function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

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
function OnTheWay({ origins, data, onSelect }: { origins: { exposure: ChokepointExposure[]; routes: OilRoute[] }; data: Datasets; onSelect: OnSelect }) {
  const flows = useMemo(() => chokepointFlows(data), [data]);
  return (
    <>
    {origins.exposure.length > 0 && (
      <section className="section">
        <div className="title-row">
          <h3 className="section__title">Chokepoints on the way</h3>
          <Info label="About chokepoints on the way">
            "Up to" where a country can also load at a terminal that avoids the chokepoint. Only countries with a cited
            route are counted.
          </Info>
        </div>
        <ul className="origins">
          {origins.exposure.map((e) => {
            const chokepoint = data.chokepoints.find((c) => c.id === e.chokepoint);
            const flow = flows.get(e.chokepoint);
            return (
              <li key={e.chokepoint}>
                <button type="button" className="origins__row origins__row--link" onClick={() => onSelect({ kind: 'chokepoint', id: e.chokepoint })}>
                  <span className="origins__head">
                    <span className="origins__label">{chokepoint?.name ?? e.chokepoint}</span>
                    <span className="origins__share mono">
                      {e.certain ? '' : 'up to '}
                      {formatShare(e.share)}
                    </span>
                  </span>
                  <span className="origins__detail">
                    {e.countries.join(' and ')}
                    {flow?.indexFiveYear != null && (
                      <>
                        {' '}
                        · tanker traffic now <span className="mono">{formatIndexShare(flow.indexFiveYear)}</span> of its five-year average
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
        <h3 className="section__title">Routes</h3>
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

/** Ranked origins with share bars. Another region's row opens that region on crude. */
function OriginList({ rows, onRegion }: { rows: (Pick<OriginRow, 'key' | 'label' | 'share' | 'detail'> & { kind: string; padd?: string })[]; onRegion: (id: string) => void }) {
  return (
    <ol className="origins">
      {rows.map((row) => {
        const body = (
          <>
            <span className="origins__head">
              <span className="origins__label">{row.label}</span>
              <span className="origins__share mono">{formatShare(row.share)}</span>
            </span>
            <span className="origins__bar" aria-hidden="true">
              <span className={`origins__fill origins__fill--${row.kind}`} style={{ width: `${Math.max(row.share * 100, 0.5)}%` }} />
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
      <Stats>
        <Stat label="Used" value={millionsPerDay(origins.suppliedPerDay)} unit="million b/d" aside="EIA product supplied" />
        <Stat
          label="Came in"
          value={`${Math.round((origins.inflowPerDay / origins.suppliedPerDay) * 100)}%`}
          aside="of that, from other regions or abroad"
        />
      </Stats>
      <section className="section">
        <div className="title-row">
          <h3 className="section__title">Where it comes from</h3>
          <Info label={`About where the region's ${label} comes from`}>
            <p>
              Where the {label} used in the region comes from. Fuel from different refineries mixes in pipelines and
              terminals, so this is the region's picture, not any one station's.
            </p>
            {origins.basis === 'inflow' && <p>More flowed in than the region used, so it passes some on. The shares are of what flowed in.</p>}
          </Info>
        </div>
        <OriginList rows={origins.rows} onRegion={(id) => onSelect({ kind: 'region', id }, 'crude')} />
      </section>
      <p className="source">
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
      </p>
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
          <Stats>
            <Stat label="Crude in" value={millionsPerDay(origins.barrelsPerDay)} unit="million b/d" aside="imported, received or pumped" />
            <Stat label="Refineries run" value={millionsPerDay(origins.refineryInputPerDay)} unit="million b/d" aside={
                origins.refineryInputPerDay < origins.barrelsPerDay ? 'the rest moves on or is stored' : 'the difference comes from stocks and other inputs'
              }
            />
            {item.capacity && (
              <Stat
                label="Refineries"
                value={item.capacity.refineries.toLocaleString('en-US')}
                aside={
                  <>
                    <span className="mono">{millionsPerDay(item.capacity.barrelsPerCalendarDay)}</span> million b/d capacity, 1 January{' '}
                    {item.capacity.asOf}
                  </>
                }
              />
            )}
          </Stats>
          <section className="section">
            <div className="title-row">
              <h3 className="section__title">Where it comes from</h3>
              <Info label="About where the region's crude comes from">
                Where the crude flowing into the region comes from: imported, received from other regions or pumped there.
                Refineries blend crude from many sources and fuel travels after refining, so this is the region's picture,
                not any one town's.
              </Info>
            </div>
            <OriginList rows={origins.rows} onRegion={(id) => onSelect({ kind: 'region', id }, 'crude')} />
          </section>
          <OnTheWay origins={origins} data={data} onSelect={onSelect} />
          <p className="source">
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
          </p>
        </>
      )}
    </>
  );
}
