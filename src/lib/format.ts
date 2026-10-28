export function formatNumber(value: number, digits = 1): string {
  return value.toLocaleString('en-US', { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function formatMbd(value: number): string {
  return `${formatNumber(value, 1)} mb/d`;
}

/** Shows the source's precision, up to three decimals: 15.75 bcm/yr, 1.486 mb/d, 55 bcm/yr. */
export function formatCapacity(capacity: { value: number; unit: string }): string {
  const value = capacity.value.toLocaleString('en-US', { maximumFractionDigits: 3 });
  return `${value} ${capacity.unit}`;
}

/** 26.2969° N, 56.8598° E */
export function formatLonLat([lon, lat]: [number, number]): string {
  const ns = lat >= 0 ? 'N' : 'S';
  const ew = lon >= 0 ? 'E' : 'W';
  return `${Math.abs(lat).toFixed(4)}° ${ns}, ${Math.abs(lon).toFixed(4)}° ${ew}`;
}

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });

/** ISO 3166-1 alpha-2 to an English name: SA -> Saudi Arabia. Unknown codes come back as given. */
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
