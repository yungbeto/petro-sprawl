import { useMemo } from 'react';
import { cardClass } from '../ui/Card';
import type { Selection } from '../app/urlState';
import type { Datasets } from '../lib/data';
import { formatCountry, formatShare, formatThousandfold } from '../lib/format';
import { basinOilParts, basinsSummary, basinViewRows, type BasinOilPart } from '../lib/summary';
import type { Basin } from '../types';
import { SourceLink } from './details';
import { Info } from './Info';
import { BarSwatch, PartsBar, type BarTone } from '../ui/Bar';
import { SectionTitle } from '../ui/SectionTitle';
import { Note } from '../ui/Note';
import { FEATURES } from '../lib/config';
import { Segmented } from './GroupList';
import { ShalePlaysView } from './ShalePlaysView';
import { FieldsView, type FieldsListing } from './FieldsView';

export type BasinsMode = 'provinces' | 'shale' | 'fields';
const BASINS_MODES = (['provinces', 'shale', 'fields'] as const).filter((m) => (m !== 'shale' || FEATURES.shale) && (m !== 'fields' || FEATURES.fields));
const BASINS_MODE_LABELS: Record<BasinsMode, string> = { provinces: 'Provinces', shale: 'Shale plays', fields: 'Fields' };

export interface BasinsViewProps {
  data: Datasets;
  /** Provinces, or EIA's shale plays (SPEC M12, while FEATURES.shale is on). */
  mode: BasinsMode;
  onMode: (mode: BasinsMode) => void;
  /** Fields' groups (SPEC M13, while FEATURES.fields is on). */
  fields: FieldsListing;
  onSelect: (selection: Selection) => void;
}

/**
 * The basins view: every mapped oil and gas province, the most oil remaining (as of 2000) first; or, switched,
 * EIA's US shale plays with their monthly production.
 */
export function BasinsView({ data, mode: chosen, onMode, fields, onSelect }: BasinsViewProps) {
  const rows = useMemo(() => basinViewRows(data.basins), [data]);
  const total = useMemo(() => basinsSummary(data.basins), [data]);
  const mode = (BASINS_MODES as readonly BasinsMode[]).includes(chosen) ? chosen : 'provinces';
  const title = (
    <SectionTitle
      title="Basins"
      level="page"
      aside={
        BASINS_MODES.length > 1 ? (
          <Segmented id="basins-mode" label="Show" options={BASINS_MODES} labels={BASINS_MODE_LABELS} value={mode} onChange={onMode} hideLabel />
        ) : undefined
      }
    >
      <Info label="About this list">
        {mode === 'fields' ? (
          <>
            Oil and gas fields from Global Energy Monitor's extraction tracker, March 2026: where each is, its status as GEM
            lists it, its operator and owners, and its latest yearly production by fuel. A GEM project that groups several
            fields shows as one, with its fields listed on its page.
          </>
        ) : mode === 'shale' ? (
          <>
            EIA's outlines of US tight oil and shale gas plays, and its monthly estimates of what each formation produces,
            from the Short-Term Energy Outlook's history. Formations with the most tight oil first, then gas-only ones.
          </>
        ) : (
          <>
            Oil and gas provinces from the USGS World Petroleum Assessment 2000. Ordered by oil remaining in fields
            discovered by 1996, in billion barrels; nothing produced or found since is counted. Provinces with no oil
            figure, the United States among them, come last.
          </>
        )}
      </Info>
    </SectionTitle>
  );
  if (mode === 'fields') {
    return <FieldsView data={data} title={title} {...fields} onSelect={onSelect} />;
  }
  if (mode === 'shale') {
    return <ShalePlaysView data={data} title={title} onSelect={onSelect} />;
  }
  return (
    <>
      <section className="section">
        {title}
        {total && (
          <p className="view-headline">
            {total.provinces} provinces hold {formatThousandfold(total.oil)} billion barrels of oil in fields found by 1996 (USGS,
            2000). The {total.top} largest hold {formatShare(total.topShare)}.
          </p>
        )}
        <OilKey />
      </section>
      <ul className="view-list view-list--cards" aria-label="Basins">
        {rows.map((basin) => (
          <li key={basin.id}>
            <BasinRow basin={basin} onSelect={onSelect} />
          </li>
        ))}
      </ul>
      <Note kind="source">
        Outlines and volumes from the{' '}
        <SourceLink href="https://www.sciencebase.gov/catalog/item/60ad2fd7d34e4043c850edb3">
          USGS World Petroleum Assessment 2000
        </SourceLink>
        .
      </Note>
    </>
  );
}

function BasinRow({ basin, onSelect }: { basin: Basin; onSelect: (selection: Selection) => void }) {
  const oil = basin.volumes?.oil.remaining ?? null;
  const gas = basin.volumes?.gas.remaining ?? null;
  const countries = basin.countries.length ? basin.countries.map(formatCountry).sort().join(', ') : 'Offshore';
  return (
    <button type="button" className={cardClass({ interactive: true, className: 'view-row stat-card' })} onClick={() => onSelect({ kind: 'basin', id: basin.id })}>
      <span className="stat-card__head">
        <span className="stat-card__name">{basin.name}</span>
        <span className="stat-card__figure">
          <span className="stat-card__value">{oil !== null ? formatThousandfold(oil) : <span className="muted">n/a</span>}</span>
          <span className="stat-card__unit">{oil !== null ? 'billion barrels of oil' : 'no oil figure'}</span>
        </span>
      </span>
      <OilBar basin={basin} />
      <span className="stat-card__details">
        {gas !== null && (
          <span className="view-row__facts">
            <span>
              <strong>{formatThousandfold(gas)}</strong> trillion ft³ of gas
            </span>
          </span>
        )}
        <span className="view-row__facts stat-card__notes">
          <span>{countries}</span>
          <span>USGS, as of 2000</span>
        </span>
      </span>
    </button>
  );
}

const OIL_PART_LABEL: Record<BasinOilPart, string> = {
  produced: 'Produced',
  remaining: 'Remaining in fields found by 1996',
  undiscovered: 'Undiscovered (estimate)',
};

const OIL_PART_KEY: Record<BasinOilPart, string> = { produced: 'Produced', remaining: 'Remaining', undiscovered: 'Undiscovered' };

/** What each shade of the cards' bars is, once above the list. */
export function OilKey() {
  return (
    <ul className="oil-key" aria-label="Oil bar key">
      {(Object.keys(OIL_PART_KEY) as BasinOilPart[]).map((part) => (
        <li key={part}>
          <BarSwatch tone={OIL_PART_TONE[part]} />
          {OIL_PART_KEY[part]}
        </li>
      ))}
    </ul>
  );
}

/** Each part of a basin's oil in the bars' tones: produced faded, remaining full, undiscovered an outline. */
const OIL_PART_TONE: Record<BasinOilPart, BarTone> = { produced: 'soft', remaining: 'neutral', undiscovered: 'outline' };

/**
 * A basin's oil as assessed in 2000, produced, remaining and undiscovered, as one bar, each part named with
 * its figure on hover. A rule where any of the three is missing.
 */
export function OilBar({ basin }: { basin: Basin }) {
  const parts = basinOilParts(basin);
  if (!parts) return <span className="stat-card__rule" aria-hidden="true" />;
  return (
    <PartsBar
      label={`Oil, as assessed in 2000: ${parts.map((p) => `${formatThousandfold(p.value)} billion barrels ${p.part}`).join(', ')}`}
      parts={parts.map((p) => ({
        key: p.part,
        value: p.value,
        tone: OIL_PART_TONE[p.part],
        tip: (
          <>
            {OIL_PART_LABEL[p.part]} <span className="bar__tip-detail">{formatThousandfold(p.value)} bn bbl</span>
          </>
        ),
      }))}
    />
  );
}
