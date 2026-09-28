/** Minimal, defensive EXIF reader for JPEG files (orientation, camera, date, GPS presence). */
export interface ExifSummary {
  orientation?: number;
  make?: string;
  model?: string;
  dateTime?: string;
  software?: string;
  hasGps: boolean;
}

const TAGS: Record<number, keyof ExifSummary> = {
  0x0112: "orientation",
  0x010f: "make",
  0x0110: "model",
  0x0132: "dateTime",
  0x0131: "software",
};

export function readExif(bytes: Uint8Array): ExifSummary | null {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 2;
  while (offset + 4 < bytes.length) {
    if (bytes[offset] !== 0xff) return null;
    const marker = bytes[offset + 1];
    const size = view.getUint16(offset + 2);
    if (marker === 0xe1 && view.getUint32(offset + 4) === 0x45786966) {
      return parseTiff(view, offset + 10, size - 8);
    }
    if (marker === 0xda || size < 2) break; // start of scan: no more metadata
    offset += 2 + size;
  }
  return null;
}

function parseTiff(view: DataView, start: number, length: number): ExifSummary | null {
  const end = Math.min(view.byteLength, start + length);
  if (start + 8 > end) return null;
  const little = view.getUint16(start) === 0x4949;
  const u16 = (o: number) => view.getUint16(o, little);
  const u32 = (o: number) => view.getUint32(o, little);
  const out: ExifSummary = { hasGps: false };
  const ifd0 = start + u32(start + 4);
  const readAscii = (o: number, count: number) => {
    let s = "";
    for (let i = 0; i < count && o + i < end; i++) {
      const c = view.getUint8(o + i);
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s.trim();
  };
  const walk = (ifd: number) => {
    if (ifd + 2 > end) return;
    const count = Math.min(u16(ifd), 200);
    for (let i = 0; i < count; i++) {
      const entry = ifd + 2 + i * 12;
      if (entry + 12 > end) return;
      const tag = u16(entry);
      const type = u16(entry + 2);
      const n = u32(entry + 4);
      if (tag === 0x8825) out.hasGps = true;
      if (tag === 0x8769) walk(start + u32(entry + 8)); // Exif sub-IFD
      if (tag === 0x9003 && type === 2) out.dateTime = readAscii(n > 4 ? start + u32(entry + 8) : entry + 8, n);
      const key = TAGS[tag];
      if (!key) continue;
      if (key === "orientation") out.orientation = u16(entry + 8);
      else if (type === 2) {
        const value = readAscii(n > 4 ? start + u32(entry + 8) : entry + 8, n);
        if (value) (out as unknown as Record<string, string>)[key] = value;
      }
    }
  };
  try {
    walk(ifd0);
  } catch {
    /* malformed EXIF: return what we have */
  }
  return out;
}
