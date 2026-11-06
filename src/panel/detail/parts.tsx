// What the detail pages share: the header, fact rows, sources, the lead card and flow meter, the port calls
// chart, the news, and the lists of related assets.

import { useId, useState, type ReactNode } from 'react';
import type { Company } from '../../types';
import type { Selection } from '../../app/urlState';
import { DETAIL, FILTERS, MEASURED_FLOW, NEWS, type RegionFuel } from '../../lib/config';
import { pipelineFlow } from '../../lib/evidence';
import type { PortCalls, Datasets } from '../../lib/data';
import type { FlowBand } from '../../lib/flow';
import { formatIndexShare, formatNumber, formatTonnes } from '../../lib/format';
import { Sparkline } from '../Sparkline';
import { lngStatus, pipelineStatus, shareCoverage, terminalStatus } from '../../lib/encoding';
import type { FilterRow } from '../../lib/filters';
import { chokepointRows } from '../../lib/summary';
import { AssetIcon } from '../AssetIcon';
import { capitalize, COMMODITY_PIPELINE, LNG_FACILITY, OIL_ROLE, statusLabel } from '../../lib/labels';
import { Info } from '../Info';
import { NewsList } from '../NewsList';
import { MeterBar } from '../../ui/Bar';
import { Card } from '../../ui/Card';
import { assetHeadlines } from '../../lib/headlines';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';

/** A region can open on a given fuel (M7); everything else ignores it. */
export type OnSelect = (selection: Selection, fuel?: RegionFuel) => void;

export function Row({ label, children }: { label: string; children: ReactNode }) {
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
export function Header({ name, icon, lede }: { name: string; icon: ReactNode; lede?: ReactNode }) {
  return (
    <header className="detail__header">
      {icon}
      <div className="detail__heading">
        <SectionTitle title={name} level="page" />
        {lede && <p className="detail__lede">{lede}</p>}
      </div>
    </header>
  );
}

/** Secondary facts, label beside value, under their own heading. */
export function Facts({ children }: { children: ReactNode }) {
  return (
    <section className="section">
      <SectionTitle title="Details" />
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

export const notAvailable = <span className="muted">n/a</span>;

export function perDay(value: number | undefined): ReactNode {
  return value === undefined ? notAvailable : formatNumber(value, 1);
}

/**
 * Daily tanker calls at the port a pipeline ends at. Context, not status evidence: a tanker there may
 * be loading oil from elsewhere, and more than one pipeline can end at the same port.
 */
export function PortCallsSection({ calls, terminal }: { calls: PortCalls; terminal?: boolean }) {
  const { port, flow, exports } = calls;
  return (
    <Card as="section" className="section">
      <SectionTitle title={`Tanker calls at ${port}, last 90 days`} aside={<Band band={flow.band} />}>
        <Info label={`About tanker calls at ${port}`}>
          Calls by tankers of any cargo, from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>.{' '}
          {terminal ? 'They count all tanker traffic at the port, not crude loadings.' : 'They show traffic at the port, not flow on this pipeline.'}
          {exports?.recent && " Exports are PortWatch's estimate from the change in each tanker's draft, in metric tons of any liquid cargo."}
        </Info>
      </SectionTitle>
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
    </Card>
  );
}

/**
 * The headlines naming this asset (added 2026-11-04), after its disruptions and reports: as the feeds list
 * them, unreviewed, each with the other places it names. Nothing shows when no headline names it.
 */
export function AssetNews({ selection, data, now, onSelect }: { selection: Selection; data: Datasets; now: Date; onSelect: OnSelect }) {
  const rows = assetHeadlines(data, selection);
  const titleId = useId();
  if (!rows.length) return null;
  return (
    <section className="section" aria-labelledby={titleId}>
      <SectionTitle title="In the news" id={titleId}>
        <Info label="About the headlines">
          Recent headlines from GDELT and Google News that name this place, from the last {NEWS.headlineDays} days, as the feeds list them.
          They aren't reviewed: read the article before relying on it. Disruptions and reports above are the cited record.
        </Info>
      </SectionTitle>
      <NewsList rows={rows} data={data} now={now} onSelect={onSelect} />
    </section>
  );
}

type Flow = NonNullable<ReturnType<typeof pipelineFlow>>;

/**
 * A page's lead figure as a card (2026-11-05): a label, the figure with what it's measured against on the
 * right, then a bar, small notes and, below, a chart or a key. Used where one figure has a whole to be
 * read against (a share of capacity, parts of a total); the page's other figures go in rows (`.key-facts`).
 */
export function LeadCard({
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
    <Card as="dl" className="lead-card">
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
    </Card>
  );
}

/**
 * Measured flow or send-out as the lead card: the 7-day mean, a bar of how full it runs when the meter gives
 * a capacity, and the last 90 days. The bar uses the meter's own capacity, never the asset's capacity
 * figure, which is in other units and from another source.
 */
export function FlowMeter({ label, flow, recentMean, capacity, chartLabel }: { label: string; flow: Flow; recentMean: number; capacity: string; chartLabel: string }) {
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

/** Companies with their shares, and a note when the listed shares don't add up to the whole. */
/** GEM's page for the pipeline, where its ownership section cites what the shares come from. */
export function GemOwnership({ url }: { url: string }) {
  return (
    <span className="facts__line muted">
      Ownership per <SourceLink href={url}>Global Energy Monitor</SourceLink>
    </span>
  );
}

/** Owners or parents with their shares; a name links to the company's home page where GEM gives one. */
export function CompanyList({ companies }: { companies: Company[] }) {
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
export function RelatedList({
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
      <SectionTitle title={title} id={titleId} count={rows.length > 0 ? rows.length : undefined} />
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
            <Note>
              Showing the first <span className="num-inline">{shown.length}</span>; the map shows all of them.
            </Note>
          )}
        </>
      )}
    </section>
  );
}

/** "2026-07" -> "July 2026". */
export function monthLabel(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
