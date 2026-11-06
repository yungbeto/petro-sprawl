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
  DISRUPTION_CARD,
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
import { formatIndexShare, formatLongDate, formatNumber, formatShortDate, formatShare, formatSignedPct, formatStorageVolume, formatThousandfold, formatTonnes } from '../lib/format';
import type { Disruption } from '../types';
import { Sparkline } from './Sparkline';
import { formatCapacity, formatCountry, formatLonLat, formatMbd } from '../lib/format';
import { lngStatus, pipelineAge, pipelineStatus, shareCoverage, terminalStatus } from '../lib/encoding';
import { filterRows, type FilterRow } from '../lib/filters';
import { basinOilParts, chokepointRows } from '../lib/summary';
import { AssetIcon } from './AssetIcon';
import { capitalize, COMMODITY_PIPELINE, LNG_FACILITY, OIL_ROLE, statusLabel } from '../lib/labels';

export { detailKind, statusLabel } from '../lib/labels';
import { FuelTabs } from './FuelTabs';
import type { ChokepointExposure, OriginRow } from '../lib/oilOrigins';
import { Info } from './Info';
import { NewsList } from './NewsList';
import { OilBar, OilKey } from './BasinsView';
import { MeterBar, PartsBar, type BarTone } from '../ui/Bar';
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
          <dl className="facts key-facts">
            <Row label="Last 7 days">
              <span className="key-facts__value">{perDay(flow.recent?.mean)} per day</span>
              <span className="facts__aside">
                to <span className="mono">{flow.latestDate}</span>
              </span>
            </Row>
            <Row label="Trailing year">
              <span className="key-facts__value">{perDay(flow.trailing?.mean)} per day</span>
              {flow.indexTrailing !== null && (
                <span className="facts__aside">the last 7 days ran at {formatIndexShare(flow.indexTrailing)} of it</span>
              )}
            </Row>
            <Row label="Five years">
              <span className="key-facts__value">{perDay(flow.fiveYear?.mean)} per day</span>
              {flow.fiveYear && (
                <span className="facts__aside">
                  average, {flow.fiveYear.from.slice(0, 4)} to {flow.fiveYear.to.slice(0, 4)}
                </span>
              )}
            </Row>
          </dl>
          <section className="section chart-card">
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
      <DisruptionList disruptions={disruptions} now={now} />
      <AssetNews selection={{ kind: 'chokepoint', id: item.id }} data={data} now={now} onSelect={onSelect} />
      {terminals.length > 0 && (
        <RelatedList title="Oil terminals that ship through it" empty="" rows={terminals} data={data} onSelect={onSelect} />
      )}
      <Facts>
        <Row label="EIA reference volume">
          <span className="num-inline">{formatMbd(item.eiaReferenceMbd)}</span>
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
    <section className="section chart-card">
      <div className="title-row">
        <span className="title-row__main">
          <h3 className="section__title">Tanker calls at {port}, last 90 days</h3>
          <Info label={`About tanker calls at ${port}`}>
          Calls by tankers of any cargo, from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>.{' '}
          {terminal ? 'They count all tanker traffic at the port, not crude loadings.' : 'They show traffic at the port, not flow on this pipeline.'}
          {exports?.recent && " Exports are PortWatch's estimate from the change in each tanker's draft, in metric tons of any liquid cargo."}
          </Info>
        </span>
        <Band band={flow.band} />
      </div>
      <p className="section__lede">
        <span className="num-inline">{perDay(flow.recent?.mean)}</span> per day over the 7 days to{' '}
        <span className="mono">{flow.latestDate}</span>
        {flow.indexFiveYear !== null && (
          <>
            , <span className="num-inline">{formatIndexShare(flow.indexFiveYear)}</span> of the five-year average
          </>
        )}
        .
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
          Estimated exports by tanker: <span className="num-inline">{formatTonnes(exports.recent.mean)}</span> per day
          {exports.indexFiveYear !== null && (
            <>
              , <span className="num-inline">{formatIndexShare(exports.indexFiveYear)}</span> of the five-year average
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
    <section className="section chart-card">
      <div className="title-row">
        <h3 className="section__title">{title}</h3>
        {flow.recent && <Band band={flow.band} />}
      </div>
      {flow.recent && (
        <p className="section__lede">
          <span className="num-inline">{formatTonnes(flow.recent.mean)}</span> {noun} per day over the 7 days to{' '}
          <span className="mono">{flow.latestDate}</span>
          {flow.indexFiveYear !== null && (
            <>
              , <span className="num-inline">{formatIndexShare(flow.indexFiveYear)}</span> of the five-year average
            </>
          )}
          .
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

function DisruptionList({ disruptions, now }: { disruptions: Disruption[]; now: Date }) {
  if (disruptions.length === 0) return null;
  return (
    <section className="section">
      <h3 className="section__title">Disruptions</h3>
      <ul className="disruptions">
        {disruptions.map((d) => (
          <DisruptionCard key={d.id} disruption={d} now={now} />
        ))}
      </ul>
    </section>
  );
}

const UNREVIEWED_NOTE = 'Not yet reviewed: added automatically from the news. Read the source to check it.';

/**
 * One disruption as a card (2026-11-05): when and why in the header, the summary cut to a few lines, then the
 * sources newest first, each by its headline, the rest behind Show more. What "not yet reviewed" means is
 * said once, under the list, not after every source.
 */
function DisruptionCard({ disruption: d, now }: { disruption: Disruption; now: Date }) {
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const summaryId = useId();
  const sources = [...d.sources].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt));
  const shown = sourcesOpen ? sources : sources.slice(0, DISRUPTION_CARD.sourcesShown);
  const hidden = sources.length - shown.length;
  const long = d.summary.length > DISRUPTION_CARD.summaryClampChars;
  const when = d.endedAt ? `${formatLongDate(d.startedAt)} to ${formatLongDate(d.endedAt)}` : `Ongoing since ${formatLongDate(d.startedAt)}`;
  return (
    <li className={`disruption chart-card${d.endedAt ? ' disruption--ended' : ''}`}>
      <p className="disruption__head">
        <span className="disruption__when">{when}</span>
        <span className="disruption__cause">{capitalize(d.cause)}</span>
      </p>
      <p id={summaryId} className={`disruption__summary${long && !summaryOpen ? ' disruption__summary--clamped' : ''}`}>
        {d.summary}
      </p>
      {long && (
        <button type="button" className="link-button disruption__toggle" aria-expanded={summaryOpen} aria-controls={summaryId} onClick={() => setSummaryOpen((v) => !v)}>
          {summaryOpen ? 'Show less' : 'Read more'}
        </button>
      )}
      <div className="disruption__sources-head">
        <h4 className="disruption__label">Sources</h4>
        <span className="disruption__count">
          {sources.length}
          {sources.length > 1 && ' · newest first'}
        </span>
      </div>
      <ul className="disruption__sources">
        {shown.map((s) => (
          <li key={s.url} className="disruption__source">
            <SourceLink href={s.url}>{s.title || s.publisher}</SourceLink>
            <span className="disruption__source-meta">
              {s.title ? `${s.publisher} · ` : ''}
              <time dateTime={s.publishedAt} title={s.publishedAt}>
                {formatShortDate(s.publishedAt, now)}
              </time>
              {s.unreviewed && <span className="disruption__unreviewed"> · Not yet reviewed</span>}
            </span>
          </li>
        ))}
      </ul>
      {sources.length > DISRUPTION_CARD.sourcesShown && (
        <button type="button" className="link-button disruption__toggle" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((v) => !v)}>
          {sourcesOpen ? 'Show fewer' : `Show ${hidden} more`}
        </button>
      )}
      {shown.some((s) => s.unreviewed) && <p className="disruption__note">{UNREVIEWED_NOTE}</p>}
    </li>
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
      <BasinOilCard basin={item} />
      <dl className="facts key-facts">
        <Row label="Petroleum type">{item.dominant ? capitalize(item.dominant) : <span className="muted">Not given</span>}</Row>
        <Row label="Pipelines">
          {data.pipelines.length ? (
            <span>
              {pipelines.length.toLocaleString('en-US')} <span className="facts__aside">crossing it</span>
            </span>
          ) : (
            notAvailable
          )}
        </Row>
        {chokepoints.length > 0 && (
          <Row label="Chokepoints">
            <span>
              {chokepoints.length} <span className="facts__aside">inside it</span>
            </span>
          </Row>
        )}
      </dl>
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

/** The basin's oil remaining as its lead card, with the basin list's bar of produced, remaining and undiscovered. */
function BasinOilCard({ basin }: { basin: Basin }) {
  const oil = basin.volumes?.oil.remaining;
  if (oil == null) return null;
  return (
    <LeadCard
      label="Oil remaining, as assessed in 2000"
      value={formatThousandfold(oil)}
      unit="billion barrels"
      bar={<OilBar basin={basin} />}
      notes="In fields found by 1996 · USGS"
    >
      {basinOilParts(basin) && <OilKey />}
    </LeadCard>
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
                <td className="num num-inline">{cell(v.produced)}</td>
                <td className="num num-inline">{cell(v.remaining)}</td>
                <td className="num num-inline">{cell(v.undiscovered)}</td>
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
/**
 * An asset's status at the top of its page (docs/design-system.md): the status, a warning when the claim
 * behind it is old, its source, and the latest claim when measured data set the status over it.
 */
function StatusBlock({
  status,
  current,
  claim,
  now,
  empty = 'No sourced claim yet',
}: {
  status: AssetStatus;
  current: Evidence | undefined;
  claim?: Evidence;
  now: Date;
  empty?: string;
}) {
  return (
    <dl className="status-card">
      <dt className="visually-hidden">Status</dt>
      <dd>
        <span className={`status status--${status} status-card__status`}>{statusLabel(status)}</span>
        {current && isUnverified(current, now) && (
          <span className="unverified status-card__line">
            Unverified since <span className="mono">{current.observedAt}</span>
          </span>
        )}
        <span className="status-card__line">{current ? <StatusSource evidence={current} /> : empty}</span>
        {claim && (
          <span className="status-card__line">
            Latest claim, {statusLabel(claim.status).toLowerCase()}: <StatusSource evidence={claim} />
          </span>
        )}
      </dd>
    </dl>
  );
}

function StatusSource({ evidence }: { evidence: Evidence }) {
  if (!isReport(evidence)) return <EvidenceLine evidence={evidence} />;
  const { publisher, host } = reportParts(evidence);
  const from = publisher ?? host;
  return (
    <>
      {REPORT_KIND[evidence.sourceType]}
      {from && ` from ${from}`}, <span className="mono">{evidence.observedAt}</span>
      {evidence.unreviewed && ', not yet reviewed'}
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
              {e.unreviewed && (
                <p className="report__unreviewed">Not yet reviewed: added automatically by the claims refresh. Read the source to check it.</p>
              )}
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
        <section className="section chart-card">
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
          {c.sharePct !== undefined && <span className="num-inline muted"> {c.sharePct}%</span>}
        </span>
      ))}
      {covered !== null && (
        <span className="facts__line muted">
          Listed shares cover <span className="num-inline">{formatNumber(covered, 1)}%</span>
        </span>
      )}
    </>
  );
}

type Flow = NonNullable<ReturnType<typeof pipelineFlow>>;

/**
 * A page's lead figure as a card (2026-11-05): a label, the figure with what it's measured against on the
 * right, then a bar, small notes and, below, a chart or a key. Used where one figure has a whole to be
 * read against (a share of capacity, parts of a total); the page's other figures go in rows (`.key-facts`).
 */
function LeadCard({
  label,
  value,
  unit,
  against,
  bar,
  notes,
  children,
}: {
  label: string;
  value: ReactNode;
  unit?: string;
  against?: ReactNode;
  bar?: ReactNode;
  notes?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <dl className="lead-card chart-card">
      <dt className="lead-card__label">{label}</dt>
      <dd className="lead-card__body">
        <span className="lead-card__figure">
          <span className="stat-card__figure">
            <span className="stat-card__value">{value}</span>
            {unit && <span className="stat-card__unit">{unit}</span>}
          </span>
          {against && <span className="lead-card__against">{against}</span>}
        </span>
        {bar}
        {notes && <span className="stat-card__notes">{notes}</span>}
        {children && <div className="lead-card__more">{children}</div>}
      </dd>
    </dl>
  );
}

/**
 * Measured flow or send-out as the lead card: the 7-day mean, a bar of how full it runs when the meter gives
 * a capacity, and the last 90 days. The bar uses the meter's own capacity, never the asset's capacity
 * figure, which is in other units and from another source.
 */
function FlowMeter({ label, flow, recentMean, capacity, chartLabel }: { label: string; flow: Flow; recentMean: number; capacity: string; chartLabel: string }) {
  const share = flow.share;
  const chart = flow.sparkline.length > 1;
  return (
    <LeadCard
      label={label}
      value={formatNumber(recentMean / 1e6, 1)}
      unit="GWh/d"
      against={
        share !== null && (
          <>
            <span className="num-inline">{formatIndexShare(share)}</span> of {capacity}
          </>
        )
      }
      bar={
        share !== null && (
          <MeterBar value={share} label={`Running at ${formatIndexShare(share)} of ${capacity}`} />
        )
      }
      notes={
        // Where it was metered is on the status line above; the chart's dates say when.
        <>
          {MEASURED_FLOW.windowDays}-day mean
          {chart ? (
            ' · chart: daily, last 90 days'
          ) : (
            <>
              , to <span className="mono">{flow.latestDate}</span>
            </>
          )}
        </>
      }
    >
      {chart && (
        <Sparkline
          points={flow.sparkline.map((p) => ({ date: p.date, value: p.value / 1e6 }))}
          unit=" GWh/d"
          label={`${chartLabel}, ${flow.sparkline[0]?.date} to ${flow.latestDate}`}
          references={flow.capacity ? [{ value: flow.capacity / 1e6, label: capitalize(capacity), style: 'dashed' as const }] : []}
        />
      )}
    </LeadCard>
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


/** "now 46% lower", "now 12% higher", "about the same": a change on last year in words, not signs. */
function vsLastYearWords(pct: number): string {
  const rounded = Math.round(pct);
  if (rounded === 0) return 'about the same';
  return `now ${formatNumber(Math.abs(rounded), 0)}% ${rounded < 0 ? 'lower' : 'higher'}`;
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
      <dl className="facts key-facts">
        <Row label={CHANGE_LABEL[storage.cadence]}>{change ?? notAvailable}</Row>
        <Row label="A year earlier">
          {summary.lastYear ? (
            <span>
              {value(summary.lastYear.value)}
              {storage.vsLastYearPct !== null && <span className="facts__aside"> · {vsLastYearWords(storage.vsLastYearPct)}</span>}
            </span>
          ) : (
            notAvailable
          )}
        </Row>
      </dl>
      <section className="section chart-card">
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
                  <span className="num-inline">{formatStorageVolume(p.summary.latest.value, p.series.unit)}</span>
                  {vs !== null && <span className="muted num-inline"> · {formatSignedPct(vs)} vs last year</span>}
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

const RUNNING: AssetStatus[] = ['operating', 'reduced'];
const COMING: AssetStatus[] = ['under_construction', 'planned'];

/** "2 trains: 1 operating, 1 building or proposed", leaving out a part with no units. */
function lngUnitsLine(item: LngTerminal): string {
  const noun = (n: number) => (item.facility === 'export' ? (n === 1 ? 'train' : 'trains') : n === 1 ? 'regas unit' : 'regas units');
  const running = item.units.filter((u) => RUNNING.includes(u.status)).length;
  const coming = item.units.filter((u) => COMING.includes(u.status)).length;
  const parts = [running && `${running} operating`, coming && `${coming} building or proposed`].filter(Boolean);
  return `${item.units.length} ${noun(item.units.length)}${parts.length ? `: ${parts.join(', ')}` : ''}`;
}

/**
 * Capacity as the lead card (2026-11-05): what runs now and, when more is coming, a bar of operating against
 * the total once built. Rows instead when GEM gives no capacity for the units that run.
 */
function LngCapacity({ item }: { item: LngTerminal }) {
  const { operating, planned } = item.capacityMtpa;
  const running = item.units.some((u) => RUNNING.includes(u.status));
  const coming = item.units.some((u) => COMING.includes(u.status));
  // A unit running with no capacity given would make the figure an undercount: say it in rows instead.
  if ((running && operating === 0) || (coming && planned === 0) || operating + planned === 0) return <LngCapacityRows item={item} units />;
  const total = operating + planned;
  const both = operating > 0 && planned > 0;
  return (
    <LeadCard
      label="Capacity"
      value={formatNumber(operating > 0 ? operating : planned, 1)}
      unit={operating > 0 ? 'mtpa operating' : 'mtpa planned'}
      against={
        both && (
          <>
            {formatNumber(total, 1)} mtpa when built
          </>
        )
      }
      bar={
        both && (
          <PartsBar
            label={`${formatNumber(operating, 1)} mtpa operating, ${formatNumber(planned, 1)} mtpa building or proposed`}
            parts={[
              { key: 'operating', value: operating, tone: 'neutral' },
              { key: 'planned', value: planned, tone: 'outline' },
            ]}
          />
        )
      }
      notes={`${lngUnitsLine(item)} · GEM`}
    />
  );
}

/** Operating and planned capacity as rows, and the unit count when no card says it. */
function LngCapacityRows({ item, units = false }: { item: LngTerminal; units?: boolean }) {
  const row = (label: string, states: AssetStatus[], total: number) => {
    const { value, unit } = unitCapacity(item.units, states, total);
    return (
      <Row label={label}>
        <span className="key-facts__value">
          {value}
          {unit && <span className="facts__aside"> {unit}</span>}
        </span>
      </Row>
    );
  };
  return (
    <dl className="facts key-facts">
      {row('Operating', RUNNING, item.capacityMtpa.operating)}
      {item.units.some((u) => COMING.includes(u.status)) && row('Planned', COMING, item.capacityMtpa.planned)}
      {units && <Row label="Units">{lngUnitsLine(item)}</Row>}
    </dl>
  );
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
      <StatusBlock status={status} current={current} claim={claim} now={now} />
      {sendOut?.recentMean != null ? (
        <>
          <FlowMeter
            label="Send-out"
            flow={sendOut}
            recentMean={sendOut.recentMean}
            capacity="declared send-out capacity"
            chartLabel={`Daily LNG send-out for ${item.name}`}
          />
          <LngCapacityRows item={item} />
        </>
      ) : (
        <LngCapacity item={item} />
      )}
      {/* Send-out with too few days for a mean: the chart on its own. */}
      {sendOut && sendOut.recentMean == null && sendOut.sparkline.length > 1 && (
        <section className="section chart-card">
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
      <DisruptionList disruptions={disruptions} now={now} />
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
                <td className="num num-inline">{u.capacityMtpa !== undefined ? formatNumber(u.capacityMtpa, 1) : '–'}</td>
                <td className="num num-inline">{u.startYear ?? '–'}</td>
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
      <StatusBlock status={status} current={current} now={now} empty="No dated source on its current status yet" />
      <dl className="facts key-facts">
        <Row label="Loadings">
          {item.throughput ? (
            <>
              <span className="key-facts__value">{formatThroughput(item.throughput.value)}</span>
              <span className="facts__aside">
                {item.throughput.period}, <SourceLink href={item.throughput.source.url}>{item.throughput.source.publisher}</SourceLink>
              </span>
            </>
          ) : (
            <span className="muted">Not sourced</span>
          )}
        </Row>
        <Row label="Route to sea">
          {chokepointNames.length ? (
            <span>
              {chokepointNames.join(' or ')}
              {chokepointNames.length > 1 && <span className="facts__aside"> · either way</span>}
            </span>
          ) : (
            <span>
              Open sea <span className="facts__aside">· no chokepoint</span>
            </span>
          )}
        </Row>
        {item.pipelineIds.length > 0 && (
          <Row label="Pipelines">
            <span>
              {item.pipelineIds.length} <span className="facts__aside">ending here</span>
            </span>
          </Row>
        )}
      </dl>
      {calls && <PortCallsSection calls={calls} terminal />}
      <DisruptionList disruptions={disruptions} now={now} />
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
              Showing the first <span className="num-inline">{shown.length}</span>; the map shows all of them.
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

/** Origins bars in the map's arc tones: countries in ink, regions and ethanol muted, the rest quieter. */
const ORIGIN_TONE: Record<string, BarTone | undefined> = { country: 'ink', region: 'muted', ethanol: 'muted', own: 'strong', other: 'strong' };

/** Ranked origins with share bars. Another region's row opens that region on crude. */
function OriginList({ rows, onRegion }: { rows: (Pick<OriginRow, 'key' | 'label' | 'share' | 'detail'> & { kind: string; padd?: string })[]; onRegion: (id: string) => void }) {
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
