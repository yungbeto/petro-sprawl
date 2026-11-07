export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatMbd(value: number): string {
  return `${formatNumber(value, 1)} mb/d`;
}

/** Shows the source's precision, up to three decimals: 15.75 bcm/yr, 1.486 mb/d, 55 bcm/yr. */
export function formatCapacity(capacity: { value: number; unit: string }): string {
  // Small oil lines read better in barrels a day than as a fraction of a thousandth of a million.
  if (capacity.unit === 'mb/d' && capacity.value < 0.001) return `${Math.round(capacity.value * 1e6).toLocaleString('en-US')} b/d`;
  const value = capacity.value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return `${value} ${capacity.unit}`;
}

/** A refinery's crude distillation capacity, which EIA gives in barrels per calendar day: 656,400 barrels a day. */
export function formatRefineryCapacity(capacity: { value: number; unit?: string }): string {
  if (capacity.unit === 'Mt/yr') return `${capacity.value.toLocaleString('en-US', { maximumFractionDigits: 1 })} million tonnes a year`;
  return `${Math.round(capacity.value).toLocaleString('en-US')} barrels a day`;
}

/** 26.2969° N, 56.8598° E */
export function formatLonLat([lon, lat]: [number, number]): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** ISO 3166-1 alpha-2 to an English name: SA -> Saudi Arabia. Unknown codes come back as given. */
/** A country's flag emoji from its ISO 3166-1 alpha-2 code, or '' for anything else. Windows draws the two letters instead. */
export function flagEmoji(code: string): string {
  if (!/^[A-Za-z]{2}$/.test(code)) return '';
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

export function formatCountry(code: string): string {
  try {
    return regionNames.of(code) ?? code;
  } catch {
    return code;
  }
}

/** kWh/d to GWh/d with one decimal: 565504000 -> "565.5 GWh/d". */
export function formatEnergyPerDay(kwhPerDay: number): string {
  return `${formatNumber(kwhPerDay / 1e6, 1)} GWh/d`;
}

/** ISO timestamp to 2026-10-28 (UTC). */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}

/** Flow index as a share: 0.02 -> "2%", 0.531 -> "53%", 1.04 -> "104%". Below 1% shows "<1%". */
export function formatIndexShare(index: number): string {
  const pct = Math.round(index * 100);
  return pct < 1 && index > 0 ? '<1%' : `${pct}%`;
}

export function formatIndex(index: number): string {
  return index.toFixed(2);
}

/** Metric tons, rounded for a modelled estimate: 2148000 -> "2.1 million t", 61234 -> "61,000 t". */
export function formatTonnes(tonnes: number): string {
  if (tonnes >= 1e6) return `${formatNumber(tonnes / 1e6, 1)} million t`;
  if (tonnes >= 1e3) return `${(Math.round(tonnes / 1e3) * 1e3).toLocaleString('en-US')} t`;
  return `${Math.round(tonnes).toLocaleString('en-US')} t`;
}

/**
 * A USGS volume in million barrels or billion cubic feet, shown in billion barrels or trillion cubic feet:
 * 235696 -> "235.7", 8 -> "<0.1", 0 -> "0".
 */
export function formatThousandfold(value: number): string {
  if (value === 0) return '0';
  const scaled = value / 1000;
  return scaled < 0.05 ? '<0.1' : formatNumber(scaled, 1);
}

/**
 * Gas in storage in the source's unit: billion cubic feet as published (EIA), million cubic metres as
 * bcm from 1,000 up.
 */
export function formatStorageVolume(value: number, unit: string): string {
  if (unit === 'million m³') return value >= 1000 ? `${formatNumber(value / 1000, 1)} bcm` : `${formatNumber(value, 0)} million m³`;
  return `${formatNumber(value, 0)} ${unit}`;
}

/** "+4%" or "−12%", with a true minus sign; "0%" when it rounds to nothing. */
export function formatSignedPct(value: number, digits = 0): string {
  const rounded = Number(value.toFixed(digits));
  if (rounded === 0) return '0%';
  return `${rounded > 0 ? '+' : '−'}${formatNumber(Math.abs(rounded), digits)}%`;
}


/** Shares to the nearest percent; "<1%" for anything smaller. */
export function formatShare(share: number): string {
  return share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** "2026", "March 2026" or "2 March 2026", from an ISO year, month or date: as precise as the source is. */
export function formatLongDate(iso: string): string {
  const [year, month, day] = iso.split('-');
  const name = month ? MONTHS[Number(month) - 1] : undefined;
  if (!name) return year ?? iso;
  return day ? `${Number(day)} ${name} ${year}` : `${name} ${year}`;
}

/** "6 Nov", with the year when it isn't the year of `now`: "28 Feb 2025". */
export function formatShortDate(iso: string, now: Date): string {
  const [year, month, day] = iso.split('-');
  const name = month ? MONTHS[Number(month) - 1]?.slice(0, 3) : undefined;
  if (!name) return year ?? iso;
  const parts = [day && String(Number(day)), name, Number(year) !== now.getUTCFullYear() && year].filter(Boolean);
  return parts.join(' ');
}

/** "2026-07" -> "July 2026". */
export function formatMonth(period: string): string {
  const [y, m] = period.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
