// A crude oil terminal's page: cited status and loadings, port calls, and the pipelines that end there.

import type { OilTerminal } from '../../types';
import { disruptionsFor, portCallsAt, type Datasets } from '../../lib/data';
import { formatNumber, formatCountry, formatLonLat } from '../../lib/format';
import { terminalStatus } from '../../lib/encoding';
import { filterRows, type FilterRow } from '../../lib/filters';
import { AssetIcon } from '../AssetIcon';
import { Note } from '../../ui/Note';
import { type OnSelect, Row, Header, Facts, SourceLink, PortCallsSection, AssetNews, RelatedList } from './parts';
import { DisruptionList, StatusBlock, Reports } from './status';

export function oilTerminalRows(terminals: OilTerminal[]): FilterRow[] {
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
      <Note kind="source">
        Hand-curated. Each claim links its source; a terminal with no dated source shows its status as unknown. Loadings
        are a cited average over the period shown, not capacity.
      </Note>
    </>
  );
}
