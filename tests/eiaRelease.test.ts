import { describe, expect, it } from 'vitest';
import { importedRefcapYear, newestRefcapYear } from '../jobs/lib/eiaRelease';

describe('newestRefcapYear', () => {
  it("takes the later of the current spreadsheet and the archive's years", () => {
    const page = '<a href="archive/2025/refcap2025.php">2025</a><a href="archive/2026/refcap2026.php">2026</a><a href="refcap26.xlsx">xlsx</a>';
    expect(newestRefcapYear(page)).toBe(2026);
    expect(newestRefcapYear(`${page}<a href="refcap27.xlsx">`)).toBe(2027);
    expect(newestRefcapYear('<a href="archive/2027/refcap2027.php">')).toBe(2027);
  });

  it('is null when the page links neither, so a redesign fails the check', () => {
    expect(newestRefcapYear('<a href="refcap26.pdf">pdf</a>')).toBeNull();
  });
});

describe('importedRefcapYear', () => {
  it("reads the spreadsheet's year from the import's sourceVersion", () => {
    expect(importedRefcapYear('EIA ...; refcap26.xlsx sha256:5b3c')).toBe(2026);
    expect(importedRefcapYear('no file')).toBeNull();
  });
});
