import { useMemo } from 'react';
import type { Selection } from '../app/urlState';
import { STATCAN_STORAGE, STORAGE_NOT_COVERED, STORAGE_SOURCES, JODI_GAS, type StorageSourceId } from '../lib/config';
import type { Datasets } from '../lib/data';
import { CHANGE_SPAN, storageChange, storageFigure, type Cadence } from '../lib/gasStorage';
import { flagEmoji, formatCountry, formatNumber, formatSignedPct } from '../lib/format';
import { median, storageRows, type StorageRow } from '../lib/summary';
import { SourceLink } from './details';
import { Info } from './Info';
import { MeterBar } from '../ui/Bar';

export const CADENCE_LABEL: Record<Cadence, string> = { daily: 'Daily', weekly: 'Weekly', monthly: 'Monthly' };

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
          <p className="view-headline">
            {below} of {gaps.length} countries hold less gas than a year ago
            {medianGap !== null && (
              <>
                , median {formatSignedPct(medianGap)}
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
          <ul className="view-list view-list--cards" aria-label="Gas storage by country">
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
  const change = storageChange(row, true);
  const figure = storageFigure(row);
  const flag = flagEmoji(row.country);
  return (
    <button type="button" className="view-row stat-card" onClick={() => onSelect(row.selection)}>
      <span className="stat-card__head">
        <span className="stat-card__name">
          {flag && <span aria-hidden="true">{flag} </span>}
          {label}
        </span>
        <span className="stat-card__figure">
          <span className="stat-card__value">
            {/* A fill's percent sign is set smaller than its number. */}
            {figure.endsWith('%') ? (
              <>
                {figure.slice(0, -1)}
                <span className="stat-card__percent">%</span>
              </>
            ) : (
              figure
            )}
          </span>
          <span className="stat-card__unit">{row.fill !== null ? 'full' : 'in storage'}</span>
        </span>
      </span>
      {row.fill !== null ? (
        <FillBar fill={row.fill} lastYear={row.summary.lastYear} label={label} />
      ) : (
        <span className="stat-card__rule" aria-hidden="true" />
      )}
      <span className="stat-card__details">
        <span className="view-row__facts">
          {row.vsLastYearPct !== null ? (
            <span>
              <strong>{formatSignedPct(row.vsLastYearPct)}</strong> vs last year
            </span>
          ) : (
            <span>Nothing to compare last year</span>
          )}
          {change && (
            <span>
              <strong>{change}</strong> {CHANGE_SPAN[row.cadence]}
            </span>
          )}
        </span>
        <span className="view-row__facts stat-card__notes">
          <span>
            {CADENCE_LABEL[row.cadence]}, to <span className="mono">{row.summary.latest.date}</span>
          </span>
          {row.caution && <span>use with caution</span>}
        </span>
      </span>
    </button>
  );
}

/** Fill as a bar from empty to full, with a tick where it stood on the same date last year, named on hover. */
function FillBar({ fill, lastYear, label }: { fill: number; lastYear: { date: string; value: number } | null; label: string }) {
  return (
    <MeterBar
      value={fill / 100}
      label={`${label}: ${formatNumber(fill, 1)}% full${lastYear ? `, ${formatNumber(lastYear.value, 1)}% a year ago` : ''}`}
      tick={
        lastYear
          ? {
              value: lastYear.value / 100,
              tip: (
                <>
                  {formatNumber(lastYear.value, 1)}% a year ago <span className="bar__tip-detail mono">{lastYear.date}</span>
                </>
              ),
            }
          : undefined
      }
    />
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
