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

/** ISO timestamp to 2026-10-28 (UTC). */
export function formatDate(iso: string): string {
  return iso.slice(0, 10);
}
