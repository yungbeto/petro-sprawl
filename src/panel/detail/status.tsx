// Status and its evidence: the status card, cited reports, and the disruptions list.

import { useId, useState } from 'react';
import { Tag } from '../../ui/Tag';
import { ArrowUpRightIcon } from '@phosphor-icons/react';
import type { AssetStatus, Evidence, Disruption } from '../../types';
import { DISRUPTION_CARD } from '../../lib/config';
import { isReport, isUnverified, reportParts } from '../../lib/evidence';
import { formatLongDate, formatShortDate } from '../../lib/format';
import { capitalize, statusLabel } from '../../lib/labels';
import { Card } from '../../ui/Card';
import { TextButton } from '../../ui/Button';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { SourceLink } from './parts';

export function DisruptionList({ disruptions, now }: { disruptions: Disruption[]; now: Date }) {
  if (disruptions.length === 0) return null;
  return (
    <section className="section">
      <SectionTitle title="Disruptions" />
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
    <Card as="li" className={`disruption${d.endedAt ? ' disruption--ended' : ''}`}>
      <p className="disruption__head">
        <span className="disruption__when">{when}</span>
        <Tag className="disruption__cause">{capitalize(d.cause)}</Tag>
      </p>
      <p id={summaryId} className={`disruption__summary${long && !summaryOpen ? ' disruption__summary--clamped' : ''}`}>
        {d.summary}
      </p>
      {long && (
        <TextButton className="disruption__toggle" aria-expanded={summaryOpen} aria-controls={summaryId} onClick={() => setSummaryOpen((v) => !v)}>
          {summaryOpen ? 'Show less' : 'Read more'}
        </TextButton>
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
        <TextButton className="disruption__toggle" aria-expanded={sourcesOpen} onClick={() => setSourcesOpen((v) => !v)}>
          {sourcesOpen ? 'Show fewer' : `Show ${hidden} more`}
        </TextButton>
      )}
      {shown.some((s) => s.unreviewed) && <Note kind="caption">{UNREVIEWED_NOTE}</Note>}
    </Card>
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
export function StatusBlock({
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
export function Reports({ evidence }: { evidence: Evidence[] }) {
  const titleId = useId();
  const items = evidence.filter((e) => e.sourceType !== 'measured');
  if (!items.some(isReport)) return null;
  return (
    <section className="section" aria-labelledby={titleId}>
      <SectionTitle title="Reports" id={titleId} count={items.length} />
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
                <Note kind="unreviewed">Not yet reviewed: added automatically by the claims refresh. Read the source to check it.</Note>
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
