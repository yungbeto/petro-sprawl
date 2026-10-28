// Country name to ISO 3166-1 alpha-2, using the runtime's CLDR names plus GEM's spellings.

const ALIASES: Record<string, string> = {
  'czech republic': 'CZ',
  turkey: 'TR',
  palestine: 'PS',
  'republic of the congo': 'CG',
  'the gambia': 'GM',
  "côte d'ivoire": 'CI',
  'hong kong': 'HK',
  myanmar: 'MM',
  'bosnia and herzegovina': 'BA',
  'trinidad and tobago': 'TT',
  'antigua and barbuda': 'AG',
  'saint kitts and nevis': 'KN',
  'saint vincent and the grenadines': 'VC',
  'sao tome and principe': 'ST',
  // Misspelled in the GEM oil tracker, 2026-06.
  kazkahstan: 'KZ',
};

const normalize = (name: string) => name.trim().toLowerCase().replace(/’/g, "'").replace(/&/g, 'and');

let byName: Map<string, string> | null = null;

function cldrNames(): Map<string, string> {
  if (byName) return byName;
  const display = new Intl.DisplayNames(['en'], { type: 'region' });
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  byName = new Map();
  for (const a of letters) {
    for (const b of letters) {
      const code = a + b;
      // Skip deprecated codes (SU, DD, YU...), which CLDR displays under their successor's name.
      if (new Intl.Locale('und', { region: code }).region !== code) continue;
      const name = display.of(code);
      if (name && name !== code) byName.set(normalize(name), code);
    }
  }
  return byName;
}

/** Returns the ISO alpha-2 code, or null if the name isn't a recognised country. */
export function countryToIso(name: string): string | null {
  const key = normalize(name);
  return ALIASES[key] ?? cldrNames().get(key) ?? null;
}
