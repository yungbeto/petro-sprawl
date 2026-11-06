// A basin's page: oil and gas as assessed in 2000, and the assets inside it.

import { useId } from 'react';
import type { Basin } from '../../types';
import { chokepointsInBasin, lngTerminalsInBasin, pipelinesTouchingBasin, type Datasets } from '../../lib/data';
import { formatThousandfold, formatCountry } from '../../lib/format';
import { filterRows } from '../../lib/filters';
import { basinOilParts } from '../../lib/summary';
import { AssetIcon } from '../AssetIcon';
import { capitalize } from '../../lib/labels';
import { Info } from '../Info';
import { OilBar, OilKey } from '../BasinsView';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { type OnSelect, Row, Header, Facts, SourceLink, notAvailable, LeadCard, RelatedList } from './parts';

export function BasinDetail({ item, data, onSelect }: { item: Basin; data: Datasets; onSelect: OnSelect }) {
  const chokepoints = chokepointsInBasin(item, data.chokepoints);
  const pipelines = pipelinesTouchingBasin(item, data.pipelines);
  const terminals = lngTerminalsInBasin(item, data.lngTerminals);
  const none = new Set<string>();
  const pipelineRows = filterRows({ pipelines: new Set(pipelines.map((p) => p.id)), chokepoints: none, lng: none, terminals: none, refineries: none }, data);
  const chokepointRowsInside = filterRows(
    { pipelines: none, chokepoints: new Set(chokepoints.map((c) => c.id)), lng: none, terminals: none, refineries: none },
    data,
  );
  const terminalRows = filterRows({ pipelines: none, chokepoints: none, lng: new Set(terminals.map((t) => t.id)), terminals: none, refineries: none }, data);
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
      <Note kind="source">
        <SourceLink href="https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3">
          USGS World Petroleum Assessment 2000
        </SourceLink>
        ; countries from <SourceLink href="https://www.naturalearthdata.com/">Natural Earth</SourceLink>
      </Note>
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
      <SectionTitle title="Oil and gas, as assessed in 2000" id={titleId}>
        <Info label="About these volumes">
          From the USGS World Petroleum Assessment 2000. Produced and remaining are for fields discovered by 1996, from an
          industry database; undiscovered is the assessment's mean estimate of what is yet to be found. Nothing produced or
          found since is counted, so remaining is not what is left today.
        </Info>
      </SectionTitle>
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
