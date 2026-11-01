// The header's globe mark: an orthographic globe drawn on a grid of dots, like an LED panel.
// The land mask (src/lib/globeLand.ts) is generated from the country outlines by import:globe.

/** A land mask on an equirectangular grid: row 0 is the band just below 90°N, column 0 starts at 180°W. */
export interface LandMask {
  /** Degrees per cell. */
  cell: number;
  /** One hex string per row, four cells a digit, most significant bit first. */
  rows: readonly string[];
}

/** The mask cell a point falls in, as row * width + column; longitude wraps, latitude clamps. */
export function cellIndex(cell: number, lat: number, lon: number): number {
  const height = Math.round(180 / cell);
  const width = Math.round(360 / cell);
  const row = Math.min(height - 1, Math.max(0, Math.floor((90 - lat) / cell)));
  const col = ((Math.floor((lon + 180) / cell) % width) + width) % width;
  return row * width + col;
}

export function isLand(mask: LandMask, lat: number, lon: number): boolean {
  const width = Math.round(360 / mask.cell);
  const index = cellIndex(mask.cell, lat, lon);
  const row = Math.floor(index / width);
  const col = index % width;
  const digit = parseInt(mask.rows[row]![col >> 2]!, 16);
  return ((digit >> (3 - (col & 3))) & 1) === 1;
}

/** Packs one boolean a cell into the mask's hex rows. */
export function encodeLandRows(cells: readonly (readonly boolean[])[]): string[] {
  return cells.map((row) => {
    let hex = '';
    for (let i = 0; i < row.length; i += 4) {
      let digit = 0;
      for (let b = 0; b < 4; b++) digit = (digit << 1) | (row[i + b] ? 1 : 0);
      hex += digit.toString(16);
    }
    return hex;
  });
}

/** What a dot shows: off the disc, ocean (a dim dot), land (a lit one), or the place a share card is about. */
export const DOT = { none: 0, ocean: 1, land: 2, focus: 3 } as const;
export type Dot = (typeof DOT)[keyof typeof DOT];

export interface GlobeFrameInput {
  mask: LandMask;
  /** Dots across the disc. */
  dots: number;
  /** Longitude at the centre of the disc, in degrees. */
  lon: number;
  /** Tilt of the north pole towards the viewer, in degrees: the latitude at the centre of the disc. */
  tilt: number;
  /** Mask cells (`cellIndex`) drawn as `focus`, land or sea. */
  focus?: ReadonlySet<number>;
}

/**
 * One frame, row by row from the top: each dot's centre is projected back onto the sphere
 * (orthographic) and looked up in the mask. Dots past the disc's edge are `none`.
 */
export function globeFrame({ mask, dots, lon, tilt, focus }: GlobeFrameInput): Dot[] {
  const frame: Dot[] = [];
  const t = (tilt * Math.PI) / 180;
  const cosT = Math.cos(t);
  const sinT = Math.sin(t);
  for (let r = 0; r < dots; r++) {
    for (let c = 0; c < dots; c++) {
      const x = ((c + 0.5) / dots) * 2 - 1;
      const y = 1 - ((r + 0.5) / dots) * 2;
      const rr = x * x + y * y;
      if (rr > 1) {
        frame.push(DOT.none);
        continue;
      }
      const z = Math.sqrt(1 - rr);
      // Undo the tilt about the x axis, then read latitude and longitude off the sphere.
      const y0 = y * cosT + z * sinT;
      const z0 = z * cosT - y * sinT;
      const lat = (Math.asin(Math.max(-1, Math.min(1, y0))) * 180) / Math.PI;
      const dLon = (Math.atan2(x, z0) * 180) / Math.PI;
      if (focus?.has(cellIndex(mask.cell, lat, lon + dLon))) frame.push(DOT.focus);
      else frame.push(isLand(mask, lat, lon + dLon) ? DOT.land : DOT.ocean);
    }
  }
  return frame;
}

export interface GlobeSvgInput {
  frame: readonly Dot[];
  dots: number;
  /** A dot's side as a share of the space between dots. */
  fill: number;
  oceanOpacity: number;
  /** Land's opacity when the frame has a focus, so the focus stands out. */
  landOpacity?: number;
  /** False for fixed light colors and no stylesheet (the share card's renderer has no media queries). */
  themed?: boolean;
}

/**
 * A frame as an SVG, for the favicon: a disc with square dots, clipped to it. The disc and dots swap colors with
 * the system theme, as the header mark does with the app's.
 */
export function globeSvg({ frame, dots, fill, oceanOpacity, landOpacity = 1, themed = true }: GlobeSvgInput): string {
  const size = dots * 10;
  const side = Math.round(10 * fill * 100) / 100;
  const inset = Math.round(((10 - side) / 2) * 100) / 100;
  const rects = (level: Dot) =>
    frame.flatMap((d, i) => (d === level ? [`<rect x="${(i % dots) * 10 + inset}" y="${Math.floor(i / dots) * 10 + inset}" width="${side}" height="${side}"/>`] : [])).join('');
  const disc = 'class="disc" fill="#17191c"';
  const dotsAt = (opacity: number) => `<g class="dots" fill="#fff"${opacity < 1 ? ` opacity="${opacity}"` : ''}>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}">`,
    // Presentation attributes give the light colors; the stylesheet, where it applies, switches them for dark.
    themed ? '<style>@media (prefers-color-scheme:dark){.disc{fill:#e6e7e8}.dots{fill:#181a1d}}</style>' : '',
    `<clipPath id="disc"><circle cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/></clipPath>`,
    `<circle ${disc} cx="${size / 2}" cy="${size / 2}" r="${size / 2}"/>`,
    '<g clip-path="url(#disc)">',
    `${dotsAt(oceanOpacity)}${rects(DOT.ocean)}</g>`,
    `${dotsAt(landOpacity)}${rects(DOT.land)}</g>`,
    ...(frame.includes(DOT.focus) ? [`${dotsAt(1)}${rects(DOT.focus)}</g>`] : []),
    '</g>',
    '</svg>',
    '',
  ].join('');
}
