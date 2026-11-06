// The scheduled check for EIA's yearly Refinery Capacity Report (SPEC M11, "Keeping it current"). Pure, so it's
// tested (tests/eiaRelease.test.ts); jobs/check-eia-refineries.ts fetches the page and reads the import's meta.

/**
 * The newest report year EIA's page links: the current spreadsheet ("refcap26.xlsx") or a year's archive page
 * ("archive/2027/refcap2027.php"), whichever is later. Null when the page links neither, so a redesign reads
 * as a failure, not as "nothing new".
 */
export function newestRefcapYear(html: string): number | null {
  const years = [
    ...[...html.matchAll(/refcap(\d{2})\.xlsx\b/gi)].map((m) => 2000 + Number(m[1])),
    ...[...html.matchAll(/archive\/(\d{4})\/refcap\1\b/gi)].map((m) => Number(m[1])),
  ];
  return years.length ? Math.max(...years) : null;
}

/** The report year the US import last read, from its meta's sourceVersion ("... refcap26.xlsx sha256:..."). */
export function importedRefcapYear(sourceVersion: string): number | null {
  const m = sourceVersion.match(/refcap(\d{2})\.xlsx\b/i);
  return m ? 2000 + Number(m[1]) : null;
}
