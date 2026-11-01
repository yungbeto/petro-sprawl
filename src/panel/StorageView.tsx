import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import { STATCAN_STORAGE, STORAGE_NOT_COVERED, STORAGE_SOURCES, JODI_GAS, type StorageSourceId } from '../lib/config';
import type { Datasets } from '../lib/data';
import type { Cadence, CountryStorage } from '../lib/gasStorage';
import { formatCountry, formatNumber, formatSignedPct, formatStorageVolume } from '../lib/format';
import { median, storageRows, type StorageRow } from '../lib/summary';
import { SourceLink } from './details';
import { Info } from './Info';

const pts = (value: number) => `${value >= 0 ? '+' : '−'}${formatNumber(Math.abs(value), 1)} pts`;

export const CADENCE_LABEL: Record<Cadence, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

/** The headline figure: fill for AGSI+ countries, gas in storage for the rest. */
export function storageFigure(s: Pick<CountryStorage, 'fill' | 'summary' | 'series'>): string {
  return s.fill !== null ? `${formatNumber(s.fill, 1)}%` : formatStorageVolume(s.summary.latest.value, s.series.unit);
}

/** The change since the period before, in the series' own terms, with the period unless `bare`. */
export function storageChange(s: Pick<CountryStorage, 'fill' | 'summary' | 'series' | 'cadence'>, bare = false): string | null {
  const { latest, previous } = s.summary;
  if (!previous) return null;
  const delta = latest.value - previous.value;
  const change = s.fill !== null ? pts(delta) : `${delta >= 0 ? '+' : '−'}${formatStorageVolume(Math.abs(delta), s.series.unit)}`;
  return bare ? change : `${change} ${CHANGE_SPAN[s.cadence]}`;
}

const CHANGE_SPAN: Record<Cadence, string> = { daily: 'in 7 days', weekly: 'on the week', monthly: 'on the month' };
/** What the change is over, as a label. */
export const CHANGE_LABEL: Record<Cadence, string> = { daily: 'Last 7 days', weekly: 'On the week', monthly: 'On the month' };

/**
 * The gas storage surface (SPEC M10): every country with a storage series, those holding the least gas
 * against a year earlier first, each from its own source and with its own date. The countries known to
 * hold large storage without a regular series are named at the end.
 */
export function StorageView({ data, onSelect }: { data: Datasets; onSelect: (selection: Selection) => void }) {
  const rows = useMemo(() => storageRows(data), [data]);
  const gaps = rows.flatMap((r) => (r.vsLastYearPct === null ? [] : [r.vsLastYearPct]));
  const below = gaps.filter((g) => g < 0).length;
  const medianGap = median(gaps);
  const sources = [...new Set(rows.map((r) => r.source))];

  return (
    <>
      <section className="section">
        <div className="title-row">
          <h2 className="detail__title">Gas storage</h2>
          <Info label="About this list">
            How much gas each country holds against the same day, week or month a year earlier, from the most frequent source that
            reports it. Countries holding the least against last year come first. Where AGSI+ reports a country, the figure is how full
            its storage is.
          </Info>
        </div>
        {gaps.length > 0 && (
          <p className="storage-headline">
            <span className="mono">{below}</span> of <span className="mono">{gaps.length}</span> countries hold less gas than a year ago
            {medianGap !== null && (
              <>
                , median <span className="mono">{formatSignedPct(medianGap)}</span>
              </>
            )}
            .
          </p>
        )}
      </section>

      <section className="section">
        {rows.length === 0 ? (
          <p className="muted">No storage data.</p>
        ) : (
          <ul className="view-list" aria-label="Gas storage by country">
            {rows.map((row) => (
              <li key={row.country}>
                <StorageItem row={row} onSelect={onSelect} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="section" aria-labelledby="storage-not-covered">
        <h3 className="section__title" id="storage-not-covered">
          Not covered
        </h3>
        <ul className="plain-list">
          {STORAGE_NOT_COVERED.map((c) => (
            <li key={c.country}>
              <span className="plain-list__name">{formatCountry(c.country)}</span> <span className="muted">{c.note}.</span>
            </li>
          ))}
        </ul>
      </section>

      <StorageSources sources={sources} data={data} />
    </>
  );
}

function StorageItem({ row, onSelect }: { row: StorageRow; onSelect: (selection: Selection) => void }) {
  const label = formatCountry(row.country);
  const change = storageChange(row);
  return (
    <button type="button" className="view-row" onClick={() => onSelect(row.selection)}>
      <span className="view-row__head">
        <span className="view-row__name">{label}</span>
        <span className="view-row__figure mono">{storageFigure(row)}</span>
      </span>
      {row.fill !== null && (
        <FillBar fill={row.fill} lastYear={row.summary.lastYear?.value ?? null} label={label} />
      )}
      <span className="view-row__meta">
        <span className="mono">{row.vsLastYearPct !== null ? `${formatSignedPct(row.vsLastYearPct)} vs last year` : 'Nothing to compare last year'}</span>
        {change && <span className="mono">{change}</span>}
        <span>
          {CADENCE_LABEL[row.cadence]}, to <span className="mono">{row.summary.latest.date}</span>
          {row.caution && ' · use with caution'}
        </span>
      </span>
    </button>
  );
}

/** Fill as a bar from empty to full, with a tick where it stood on the same date last year. */
function FillBar({ fill, lastYear, label }: { fill: number; lastYear: number | null; label: string }) {
  const clamp = (v: number) => Math.max(0, Math.min(100, v));
  return (
    <span
      className="fill-bar"
      role="img"
      aria-label={`${label}: ${formatNumber(fill, 1)}% full${lastYear !== null ? `, ${formatNumber(lastYear, 1)}% a year ago` : ''}`}
    >
      <span className="fill-bar__fill" style={{ width: `${clamp(fill)}%` }} />
      {lastYear !== null && <span className="fill-bar__tick" style={{ left: `${clamp(lastYear)}%` }} />}
    </span>
  );
}

/** Each source in use with the attribution it asks for. */
export function StorageSources({ sources, data }: { sources: StorageSourceId[]; data: Datasets }) {
  const meta = (id: string) => data.meta.find((m) => m.id === id);
  const order = Object.keys(STORAGE_SOURCES) as StorageSourceId[];
  return (
    <>
      {order
        .filter((s) => sources.includes(s))
        .map((s) => (
          <p className="source" key={s}>
            {s === 'agsi' && (
              <>
                <SourceLink href={STORAGE_SOURCES.agsi.url}>GIE AGSI+</SourceLink>, reported daily by storage operators; fill is gas in
                storage as a share of working gas volume.
              </>
            )}
            {s === 'eia' && (
              <>
                U.S. Energy Information Administration, <SourceLink href={STORAGE_SOURCES.eia.url}>weekly natural gas storage report</SourceLink>
                : working gas in underground storage, for weeks ending Friday.
              </>
            )}
            {s === 'statcan' && (
              <>
                Adapted from Statistics Canada, <SourceLink href={STATCAN_STORAGE.tableUrl}>{STATCAN_STORAGE.tableName}</SourceLink> (table{' '}
                {STATCAN_STORAGE.table}), closing inventory to <span className="mono">{meta('gas-storage-ca')?.dataThrough ?? 'unknown'}</span>.
                This does not constitute an endorsement by Statistics Canada of this product.
              </>
            )}
            {s === 'jodi' && (
              <>
                {JODI_GAS.citation.replace('www.jodidata.org', '')}
                <SourceLink href={JODI_GAS.pageUrl}>www.jodidata.org</SourceLink>, accessed{' '}
                <span className="mono">{meta('gas-storage-jodi')?.fetchedAt.slice(0, 10) ?? 'unknown'}</span>. Closing stocks as each
                country reports them; definitions vary, so each country is compared with itself a year earlier. Only values JODI assesses
                as comparable or to use with caution are shown.
              </>
            )}
          </p>
        ))}
    </>
  );
}
