// A shale play's page (SPEC M12): EIA's monthly figure for the formation it is named for, the drilling in
// EIA's region around it, the other outlines that share the figure, and the province and pipelines it lies in.
// EIA reports by formation, not by outline, so every figure here is labelled as the formation's or the region's.

import { useId } from 'react';
import type { ShalePlay } from '../../types';
import { pipelinesTouchingBasin, type Datasets } from '../../lib/data';
import { SHALE } from '../../lib/config';
import { formatMonth, formatSignedPct } from '../../lib/format';
import { filterRows } from '../../lib/filters';
import {
  chartPoints,
  formationById,
  formatShaleValue,
  latestMonth,
  leadSeries,
  regionActivity,
  shaleSeries,
  shaleUnit,
  sharingPlays,
  yearChangePct,
  type RegionActivity,
} from '../../lib/shale';
import { AssetIcon } from '../AssetIcon';
import { Info } from '../Info';
import { Sparkline } from '../Sparkline';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { TextButton } from '../../ui/Button';
import { type OnSelect, Row, Header, Facts, SourceLink, LeadCard, RelatedList } from './parts';

export function ShaleDetail({ item, data, onSelect }: { item: ShalePlay; data: Datasets; onSelect: OnSelect }) {
  const formation = formationById(item.formation);
  const lead = leadSeries(data, formation);
  const gas = formation && 'gas' in formation && lead?.kind === 'oil' ? shaleSeries(data, formation.gas) : undefined;
  const gasLatest = latestMonth(gas);
  const sharing = sharingPlays(item, data.shalePlays);
  const province = item.provinceId ? data.basins.find((b) => b.id === item.provinceId) : undefined;
  const none = new Set<string>();
  const pipelineRows = filterRows(
    { pipelines: new Set(pipelinesTouchingBasin(item, data.pipelines).map((p) => p.id)), chokepoints: none, lng: none, terminals: none, refineries: none },
    data,
  );
  const release = lead?.release;
  return (
    <>
      <Header name={item.name} icon={<AssetIcon kind="shale" large />} lede={`${item.basin} basin · EIA outline`} />
      {formation && lead ? (
        <FormationCard label={formation.label} series={lead} sharing={sharing.length} />
      ) : (
        <Note>
          EIA publishes no monthly figure for this outline: its production figures are by formation, and none is reported
          for this one on its own.
        </Note>
      )}
      <dl className="facts key-facts">
        {gas && gasLatest && (
          <Row label={`${formation!.label} gas`}>
            <span>
              {formatShaleValue(gas, gasLatest.value)} <span className="facts__aside">billion ft³ a day, {formatMonth(gasLatest.period)}</span>
            </span>
          </Row>
        )}
        <Row label="Province">
          {province ? (
            <TextButton onClick={() => onSelect({ kind: 'basin', id: province.id })}>{province.name}</TextButton>
          ) : (
            <span className="muted">Not in a mapped USGS province</span>
          )}
        </Row>
        <Row label="Area">
          <span>
            {item.areaKm2.toLocaleString('en-US')} <span className="facts__aside">km², as EIA outlines it</span>
          </span>
        </Row>
      </dl>
      {formation && <ActivitySection activity={regionActivity(data, formation)} />}
      {sharing.length > 0 && (
        <SharingSection plays={sharing} label={formation!.label} onSelect={onSelect} />
      )}
      <RelatedList
        title="Pipelines crossing it"
        empty={data.pipelines.length ? 'None in the loaded data.' : 'Pipelines not loaded yet.'}
        rows={pipelineRows}
        data={data}
        onSelect={onSelect}
      />
      <Facts>
        <Row label="Rock">{item.lithology}</Row>
        <Row label="Age">{item.age}</Row>
        <Row label="EIA basin">{item.basin}</Row>
        <Row label="Outline drawn from">{item.reference}</Row>
        <Row label="EIA id">
          <span className="mono">{item.id.replace(/^eia-/, '').toUpperCase()}</span>
        </Row>
      </Facts>
      <Note>
        A play is an area where companies drill one layer of rock, usually shale or another tight rock, and fracture it to
        get the oil or gas out. EIA calls its outlines general areas: approximate, and some drawn years ago.
      </Note>
      <Note kind="source">
        Outline from EIA's <SourceLink href={SHALE.sourcePage}>{SHALE.sourceTitle}</SourceLink>
        {release && (
          <>
            ; figures from the <SourceLink href={SHALE.steoPage}>{SHALE.steoTitle}</SourceLink>, released {formatMonth(release.slice(0, 7))}, history
            only
          </>
        )}
        ; province from the USGS World Petroleum Assessment 2000
      </Note>
    </>
  );
}

/** The formation's newest month as the lead card, with the change on a year earlier and the last two years. */
function FormationCard({ label, series, sharing }: { label: string; series: NonNullable<ReturnType<typeof leadSeries>>; sharing: number }) {
  const latest = latestMonth(series)!;
  const change = yearChangePct(latest);
  const what = series.kind === 'oil' ? 'tight oil' : 'shale gas';
  return (
    <LeadCard
      label={`${label} ${what}, ${formatMonth(latest.period)}`}
      value={formatShaleValue(series, latest.value)}
      unit={shaleUnit(series)}
      against={change !== null ? <span className="mono">{formatSignedPct(change)} on a year earlier</span> : undefined}
      notes={
        <>
          EIA's estimate for the whole formation{sharing > 0 ? `, shared with ${sharing} other outline${sharing === 1 ? '' : 's'}` : ''}
        </>
      }
    >
      <Sparkline
        points={chartPoints(series)}
        references={[]}
        unit={series.kind === 'oil' ? 'mb/d' : 'billion ft³/d'}
        lineLabel="Monthly"
        format={(v) => formatShaleValue(series, v)}
        label={`${label} ${what} by month, ${series.points[0]!.period} to ${latest.period}`}
      />
    </LeadCard>
  );
}

/** Rigs and wells in EIA's region, which is wider than the play: named as the region's. */
function ActivitySection({ activity }: { activity: RegionActivity | null }) {
  const titleId = useId();
  if (!activity) return null;
  const rows = (
    [
      ['Active rigs', activity.rigs],
      ['Wells drilled', activity.wellsDrilled],
      ['Wells completed', activity.wellsCompleted],
      ['Drilled, not completed', activity.uncompleted],
    ] as const
  )
    .map(([label, series]) => ({ label, series, latest: latestMonth(series) }))
    .filter((r) => r.series && r.latest);
  if (!rows.length) return null;
  return (
    <section className="section" aria-labelledby={titleId}>
      <SectionTitle title={`Drilling in EIA's ${activity.region.label}`} id={titleId}>
        <Info label="About these counts">
          EIA's shale regions are groups of counties around the largest plays, so these counts cover more than this outline.
          Rigs are the month's average of active rigs; wells are new wells in the month; drilled, not completed are wells
          waiting to be fractured, at the month's end.
        </Info>
      </SectionTitle>
      <dl className="facts">
        {rows.map((r) => (
          <Row key={r.label} label={r.label}>
            <span>
              {formatShaleValue(r.series!, r.latest!.value)} <span className="facts__aside">{formatMonth(r.latest!.period)}</span>
            </span>
          </Row>
        ))}
      </dl>
    </section>
  );
}

function SharingSection({ plays, label, onSelect }: { plays: ShalePlay[]; label: string; onSelect: OnSelect }) {
  const titleId = useId();
  return (
    <section className="section" aria-labelledby={titleId}>
      <SectionTitle title={`Other ${label} outlines`} id={titleId} count={plays.length} />
      <ul className="changes">
        {plays.map((p) => (
          <li key={p.id}>
            <button type="button" className="change" onClick={() => onSelect({ kind: 'shale', id: p.id })}>
              <AssetIcon kind="shale" />
              <span className="change__text">
                <span className="change__name">{p.name}</span>
                <span className="change__what">
                  {p.basin} basin · {p.areaKm2.toLocaleString('en-US')} km²
                </span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
