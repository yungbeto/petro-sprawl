// Reads one file out of a zip archive with node:zlib, so a job can take a zipped download without a
// dependency. Handles stored and deflated entries, which is what publishers' zips use; not zip64.

import { inflateRawSync } from 'node:zlib';

const END_OF_DIRECTORY = 0x06054b50;
const DIRECTORY_ENTRY = 0x02014b50;
const LOCAL_HEADER = 0x04034b50;

/** The entries' names, in the order the central directory lists them. */
export function zipEntries(zip: Buffer): string[] {
  return directory(zip).map((e) => e.name);
}

/** The contents of the entry whose name matches, or of the only entry when no name is given. */
export function unzipEntry(zip: Buffer, match?: (name: string) => boolean): Buffer {
  const entries = directory(zip).filter((e) => !e.name.endsWith('/'));
  const found = match ? entries.filter((e) => match(e.name)) : entries;
  const entry = found[0];
  if (!entry || found.length !== 1) throw new Error(`zip: expected one matching entry, found ${found.length} (${entries.map((e) => e.name).join(', ')})`);
  if (zip.readUInt32LE(entry.offset) !== LOCAL_HEADER) throw new Error(`zip: no local header for ${entry.name}`);
  const start = entry.offset + 30 + zip.readUInt16LE(entry.offset + 26) + zip.readUInt16LE(entry.offset + 28);
  const data = zip.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return Buffer.from(data);
  if (entry.method === 8) return inflateRawSync(data);
  throw new Error(`zip: compression method ${entry.method} not supported (${entry.name})`);
}

interface Entry {
  name: string;
  method: number;
  compressedSize: number;
  offset: number;
}

function directory(zip: Buffer): Entry[] {
  // The end-of-directory record is the last 22 bytes, plus a comment of up to 65,535 bytes.
  let end = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 0xffff); i--) {
    if (zip.readUInt32LE(i) === END_OF_DIRECTORY) {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('zip: not a zip archive');
  const count = zip.readUInt16LE(end + 10);
  let at = zip.readUInt32LE(end + 16);
  const entries: Entry[] = [];
  for (let n = 0; n < count; n++) {
    if (zip.readUInt32LE(at) !== DIRECTORY_ENTRY) throw new Error('zip: bad central directory');
    const nameLength = zip.readUInt16LE(at + 28);
    entries.push({
      method: zip.readUInt16LE(at + 10),
      compressedSize: zip.readUInt32LE(at + 20),
      offset: zip.readUInt32LE(at + 42),
      name: zip.toString('utf8', at + 46, at + 46 + nameLength),
    });
    at += 46 + nameLength + zip.readUInt16LE(at + 30) + zip.readUInt16LE(at + 32);
  }
  return entries;
}
