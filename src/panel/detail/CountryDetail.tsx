// A country's page (M10): its gas storage, then where its crude imports come from.

import { useId, useMemo } from 'react';
import type { Country, CountryCrudeImports } from '../../types';
import { STORAGE_NOT_COVERED, COMTRADE, CRUDE_IMPORTS, EUROSTAT_OIL } from '../../lib/config';
import { storageByCountry, vsLastYearPct, type CountryStorage, CHANGE_LABEL, STORAGE_HEADLINE, storageChange, storageFigure } from '../../lib/gasStorage';
import { importPeriod, originsOfCountry } from '../../lib/crudeImports';
import { viewEnabled, type ViewId } from '../../lib/views';
import { CADENCE_LABEL, StorageSources } from '../StorageView';
import type { Datasets } from '../../lib/data';
import { formatNumber, formatSignedPct, formatStorageVolume } from '../../lib/format';
import { Sparkline } from '../Sparkline';
import { AssetIcon } from '../AssetIcon';
import { Info } from '../Info';
import { Card } from '../../ui/Card';
import { TextButton } from '../../ui/Button';
import { SectionTitle } from '../../ui/SectionTitle';
import { Note } from '../../ui/Note';
import { type OnSelect, Row, Header, SourceLink, notAvailable } from './parts';
import { OnTheWay, OriginList } from './RegionDetail';

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
      <SectionTitle title="Gas storage" level="part" id={storageId} />
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
      <SectionTitle title="Where its crude comes from" level="part" id={id}>
        <Info label="About where the country's crude comes from">
          Crude oil imports by partner country, as shares of the total. Each source names the partner as it records it, so crude
          shipped through a third country can carry that country's name. Crude produced at home isn't counted here.
        </Info>
      </SectionTitle>
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
              <SectionTitle title="By fuel region" id={`${id}-regions`} />
              <ul className="plain-list">
                {data.oilOrigins.map((r) => (
                  <li key={r.id}>
                    <TextButton onClick={() => onSelect({ kind: 'region', id: r.id }, 'crude')}>
                      {r.name}
                    </TextButton>
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
    <Note kind="source">
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
    </Note>
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
      <Card as="section" className="section">
        <SectionTitle title={`${storage.fill !== null ? 'Storage fill' : 'Gas in storage'}, last 12 months`} />
        <Sparkline
          points={summary.year}
          unit={storage.fill !== null ? '%' : series.unit}
          lineLabel={CADENCE_LABEL[storage.cadence]}
          label={`${storage.fill !== null ? 'Gas storage fill' : 'Gas in storage'} in ${name}, ${summary.year[0]?.date} to ${summary.latest.date}`}
          references={summary.lastYear ? [{ value: summary.lastYear.value, label: span, style: 'dashed' as const }] : []}
        />
      </Card>
      {storage.parts.length > 0 && (
        <section className="section" aria-labelledby="storage-parts">
          <SectionTitle title={storage.source === 'eia' ? 'By storage region' : 'By province'} id="storage-parts" />
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
