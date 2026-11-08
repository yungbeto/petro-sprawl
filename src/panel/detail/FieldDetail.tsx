// An oil or gas field's page (M13): GEM's status and yearly production, one figure per fuel with its year,
// who runs and owns it, a project's fields, the pipelines with an end nearby and the province it sits in.

import type { Field, FieldOutput } from '../../types';
import { disruptionsFor, type Datasets } from '../../lib/data';
import { FIELDS } from '../../lib/config';
import { formatCountry, formatLonLat } from '../../lib/format';
import { fieldStatus, formatFieldOutput, pipelinesNearField } from '../../lib/fields';
import type { FilterRow } from '../../lib/filters';
import { AssetIcon } from '../AssetIcon';
import { Note } from '../../ui/Note';
import { TextButton } from '../../ui/Button';
import { SectionTitle } from '../../ui/SectionTitle';
import { type OnSelect, Row, Header, Facts, SourceLink, AssetNews, RelatedList } from './parts';
import { DisruptionList, StatusBlock, Reports } from './status';

/** When a figure is for: its year, or what GEM's project sheet says instead. */
function figureWhen(o: FieldOutput): string {
  if (o.year) return String(o.year);
  return o.summedByGem ? "GEM's sum of its fields, year not given" : 'year not given';
}

function Output({ output }: { output: FieldOutput[] }) {
  return (
    <>
      {output.map((o) => (
        <Row key={`${o.fuel}-${o.unit}`} label={o.fuel[0]!.toUpperCase() + o.fuel.slice(1)}>
          <span className="key-facts__value">{formatFieldOutput(o).replace(/^[^,]+, /, '')}</span>
          <span className="facts__aside">{figureWhen(o)}</span>
        </Row>
      ))}
    </>
  );
}

export function FieldDetail({ item, data, now, onSelect }: { item: Field; data: Datasets; now: Date; onSelect: OnSelect }) {
  const status = fieldStatus(item);
  const disruptions = disruptionsFor(data, 'field', item.id);
  const pipelineRows: FilterRow[] = pipelinesNearField(item, data.pipelines).map((p) => ({
    selection: { kind: 'pipeline', id: p.id },
    name: p.name,
    curated: p.sources.includes('curated'),
  }));
  const province = item.provinceId ? data.basins.find((b) => b.id === item.provinceId) : undefined;
  const owners = item.owners?.map((o) => (o.sharePct != null ? `${o.name} ${o.sharePct.toLocaleString('en-US', { maximumFractionDigits: 1 })}%` : o.name)).join(', ');
  return (
    <>
      <Header
        name={item.name}
        icon={<AssetIcon kind="field" large />}
        lede={[item.subnational, formatCountry(item.country), item.pointApprox && 'location approximate'].filter(Boolean).join(' · ')}
      />
      <StatusBlock status={status} current={item.evidence[0]} now={now} empty="Global Energy Monitor gives no status" />
      <dl className="facts key-facts">
        {item.output.length ? <Output output={item.output} /> : (
          <Row label="Production">
            <span className="muted">Not given by Global Energy Monitor</span>
          </Row>
        )}
        {item.operator && <Row label="Operator">{item.operator}</Row>}
        {owners && <Row label="Owners">{owners}</Row>}
        {province && (
          <Row label="Province">
            <TextButton onClick={() => onSelect({ kind: 'basin', id: province.id })}>{province.name}</TextButton>
          </Row>
        )}
      </dl>
      <DisruptionList disruptions={disruptions} now={now} />
      <Reports evidence={item.evidence} />
      <AssetNews selection={{ kind: 'field', id: item.id }} data={data} now={now} onSelect={onSelect} />
      {item.parts && (
        <section className="section">
          <SectionTitle title="Fields in this project" count={item.parts.length} />
          <dl className="facts">
            {item.parts.map((part) => (
              <Row key={part.id} label={part.name}>
                <span>
                  {part.output.length
                    ? part.output.map((o) => `${formatFieldOutput(o)}, ${figureWhen(o)}`).join('; ')
                    : <span className="muted">No figure from GEM</span>}
                  {part.status && <span className="facts__aside"> · {part.status}</span>}
                </span>
              </Row>
            ))}
          </dl>
        </section>
      )}
      {pipelineRows.length > 0 && <RelatedList title="Pipelines with an end nearby" empty="" rows={pipelineRows} data={data} onSelect={onSelect} />}
      <Facts>
        <Row label="Location">
          <span className="mono">{formatLonLat(item.point)}</span>
          <span className="facts__aside">{item.location !== 'unknown' ? `${item.location}, ` : ''}Global Energy Monitor</span>
        </Row>
        {item.production && <Row label="Production type">{item.production}</Row>}
        {item.discovered && <Row label="Discovered">{item.discovered}</Row>}
        {item.startYear && <Row label="Production since">{item.startYear}</Row>}
      </Facts>
      <Note kind="source">
        Status, owners and production from Global Energy Monitor's <SourceLink href={item.gemUrl}>page for this {item.level}</SourceLink>,
        part of its <SourceLink href={FIELDS.sourcePage}>{FIELDS.sourceTitle}</SourceLink> (CC BY 4.0). Each figure is for the year
        beside it, in GEM's converted units; fuels are never added together. Pipelines with an end nearby have one within{' '}
        <span className="num-inline">{FIELDS.linkKm}</span> km of the field's point in GEM's pipeline data, not a cited connection.
      </Note>
    </>
  );
}
