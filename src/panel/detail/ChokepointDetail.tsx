// A chokepoint's page: tanker transits and cargo against the five-year average, and what passes through.

import type { Chokepoint } from '../../types';
import { CHOKEPOINT_NOTES, EIA_CHOKEPOINTS_SOURCE, EIA_REFERENCE_YEAR, tankerCargoSeriesId } from '../../lib/config';
import { disruptionsFor, seriesById, terminalsViaChokepoint, type Datasets } from '../../lib/data';
import { chokepointFlow, type ChokepointFlow } from '../../lib/flow';
import { formatIndexShare, formatTonnes, formatLonLat, formatMbd } from '../../lib/format';
import { Sparkline } from '../Sparkline';
import { AssetIcon } from '../AssetIcon';
import { Card } from '../../ui/Card';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { type OnSelect, Row, Header, Facts, SourceLink, Band, perDay, AssetNews, RelatedList } from './parts';
import { DisruptionList } from './status';
import { oilTerminalRows } from './OilTerminalDetail';

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
          <Card as="section" className="section">
            <SectionTitle title="Daily tanker transits, last 90 days" />
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
          </Card>
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
      <Note kind="source">
        Transits are vessel counts from <SourceLink href="https://portwatch.imf.org/">IMF PortWatch</SourceLink>, and cargo
        is PortWatch's estimate from each tanker's draft and size, in metric tons of any liquid cargo. The EIA figure is
        barrels, shown for scale. They aren't compared.
        {note && ` ${note}`}
      </Note>
    </>
  );
}

/** A PortWatch tonnage estimate: the 7-day level against the five-year average, and 90 days of it. */
function TonnesSection({ title, flow, noun, label }: { title: string; flow: ChokepointFlow; noun: string; label: string }) {
  return (
    <Card as="section" className="section">
      <SectionTitle title={title} aside={flow.recent && <Band band={flow.band} />} />
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
    </Card>
  );
}
