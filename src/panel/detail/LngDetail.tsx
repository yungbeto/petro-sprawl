// An LNG terminal's page: status, capacity by unit, and measured send-out.

import type { ReactNode } from 'react';
import type { AssetStatus, LngTerminal, LngUnit } from '../../types';
import { ALSI_URL, latestClaim, pipelineFlow } from '../../lib/evidence';
import { disruptionsFor, seriesById, type Datasets } from '../../lib/data';
import { formatNumber, formatCountry, formatLonLat } from '../../lib/format';
import { Sparkline } from '../Sparkline';
import { lngStatus } from '../../lib/encoding';
import { AssetIcon } from '../AssetIcon';
import { statusLabel } from '../../lib/labels';
import { Info } from '../Info';
import { PartsBar } from '../../ui/Bar';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { type OnSelect, Row, Header, Facts, SourceLink, AssetNews, LeadCard, FlowMeter, CompanyList } from './parts';
import { DisruptionList, StatusBlock, Reports } from './status';

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
        <Card as="section" className="section">
          <SectionTitle title="Daily send-out, last 90 days" />
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
        </Card>
      )}
      <DisruptionList disruptions={disruptions} now={now} />
      <Reports evidence={item.evidence} />
      <AssetNews selection={{ kind: 'lng', id: item.id }} data={data} now={now} onSelect={onSelect} />
      <section className="section">
        <SectionTitle title="Units">
          {current && current.sourceType !== 'dataset' && (
            <Info label="About the units">
              Unit statuses and capacities are Global Energy Monitor's, as of{' '}
              <span className="mono">{item.evidence.find((e) => e.sourceType === 'dataset')?.observedAt ?? 'its release'}</span>.{' '}
              {current.sourceType === 'measured'
                ? 'The status above comes from measured send-out.'
                : 'The status above comes from later cited reports.'}
            </Info>
          )}
        </SectionTitle>
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
      <Note kind="source">
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
      </Note>
    </>
  );
}
