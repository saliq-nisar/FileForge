import JSZip from "jszip";
import { AppError } from "@/lib/errors";

export type Cell = string | number | boolean | null;
export type Row = Cell[];

// ---------------- CSV ----------------

export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 10).join("\n");
  const candidates = [",", ";", "\t", "|"];
  let best = ",";
  let bestCount = 0;
  for (const d of candidates) {
    let count = 0;
    let quoted = false;
    for (const ch of sample) {
      if (ch === '"') quoted = !quoted;
      else if (ch === d && !quoted) count++;
    }
    if (count > bestCount) {
      best = d;
      bestCount = count;
    }
  }
  return best;
}

/** RFC 4180 CSV parser (quoted fields, escaped quotes, CRLF/LF, embedded newlines). */
export function parseCsv(text: string, delimiter = detectDelimiter(text)): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
    } else if (ch === '"' && field === "") {
      quoted = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && src[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  if (field !== "" || row.length) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export function toCsv(rows: Row[], delimiter = ","): string {
  return rows
    .map((r) =>
      r
        .map((c) => {
          const s = c === null || c === undefined ? "" : String(c);
          // Neutralize spreadsheet formula injection when the CSV is reopened in Excel.
          const safe = /^[=+\-@\t\r]/.test(s) && Number.isNaN(Number(s)) ? `'${s}` : s;
          return /["\n\r]/.test(safe) || safe.includes(delimiter) ? `"${safe.replace(/"/g, '""')}"` : safe;
        })
        .join(delimiter),
    )
    .join("\r\n");
}

// ---------------- XLSX write ----------------

function xmlEscape(s: string): string {
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f￾￿]/g, "")
    .replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);
}

export function columnName(index: number): string {
  let n = index + 1;
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

export function columnIndex(name: string): number {
  let n = 0;
  for (const ch of name.toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

const NUMERIC = /^-?(?:\d+|\d*\.\d+)(?:[eE][-+]?\d+)?$/;

export async function buildXlsx(sheets: Array<{ name: string; rows: Row[] }>, opts: { convertNumbers?: boolean } = {}): Promise<Blob> {
  const zip = new JSZip();
  const names = sheets.map((s, i) => (s.name.replace(/[\\/?*[\]:]/g, " ").slice(0, 31).trim() || `Sheet${i + 1}`));
  zip.file(
    "[Content_Types].xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets
      .map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`)
      .join("")}</Types>`,
  );
  zip.file(
    "_rels/.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
  );
  zip.file(
    "xl/workbook.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names
      .map((n, i) => `<sheet name="${xmlEscape(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`)
      .join("")}</sheets></workbook>`,
  );
  zip.file(
    "xl/_rels/workbook.xml.rels",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets
      .map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`)
      .join("")}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  );
  zip.file(
    "xl/styles.xml",
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="1"><font><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf/></cellStyleXfs><cellXfs count="1"><xf xfId="0"/></cellXfs></styleSheet>`,
  );
  sheets.forEach((sheet, s) => {
    const rowsXml = sheet.rows
      .map((row, r) => {
        const cells = row
          .map((cell, c) => {
            if (cell === null || cell === undefined || cell === "") return "";
            const ref = `${columnName(c)}${r + 1}`;
            if (typeof cell === "number" || (opts.convertNumbers && typeof cell === "string" && NUMERIC.test(cell.trim()) && !/^0\d/.test(cell.trim()))) {
              return `<c r="${ref}"><v>${Number(cell)}</v></c>`;
            }
            if (typeof cell === "boolean") return `<c r="${ref}" t="b"><v>${cell ? 1 : 0}</v></c>`;
            return `<c r="${ref}" t="inlineStr"><is><t xml:space="preserve">${xmlEscape(String(cell))}</t></is></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${cells}</row>`;
      })
      .join("");
    zip.file(
      `xl/worksheets/sheet${s + 1}.xml`,
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${rowsXml}</sheetData></worksheet>`,
    );
  });
  return zip.generateAsync({
    type: "blob",
    compression: "DEFLATE",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

// ---------------- XLSX read ----------------

const DATE_FORMAT_IDS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

function parseXml(text: string): Document {
  const doc = new DOMParser().parseFromString(text, "application/xml");
  if (doc.getElementsByTagName("parsererror").length) throw new AppError("UNSUPPORTED_FORMAT", "This spreadsheet appears to be corrupted.");
  return doc;
}

function byTag(root: Document | Element, tag: string): Element[] {
  return Array.from(root.getElementsByTagNameNS("*", tag));
}

function excelSerialToIso(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return String(serial);
  const iso = d.toISOString();
  return serial % 1 === 0 ? iso.slice(0, 10) : iso.slice(0, 19).replace("T", " ");
}

export async function readXlsx(data: ArrayBuffer | Uint8Array): Promise<Array<{ name: string; rows: Row[] }>> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(data);
  } catch {
    throw new AppError("UNSUPPORTED_FORMAT", "This spreadsheet appears to be corrupted.");
  }
  const read = async (path: string) => {
    const f = zip.file(path);
    return f ? f.async("string") : null;
  };
  const workbookXml = await read("xl/workbook.xml");
  if (!workbookXml) throw new AppError("UNSUPPORTED_FORMAT");
  const rels = parseXml((await read("xl/_rels/workbook.xml.rels")) ?? "<Relationships/>");
  const relTargets = new Map(byTag(rels, "Relationship").map((r) => [r.getAttribute("Id") ?? "", r.getAttribute("Target") ?? ""]));

  const shared: string[] = [];
  const sst = await read("xl/sharedStrings.xml");
  if (sst) {
    for (const si of byTag(parseXml(sst), "si")) {
      shared.push(byTag(si, "t").map((t) => t.textContent ?? "").join(""));
    }
  }

  const dateStyles = new Set<number>();
  const stylesXml = await read("xl/styles.xml");
  if (stylesXml) {
    const styles = parseXml(stylesXml);
    const custom = new Map(byTag(styles, "numFmt").map((n) => [Number(n.getAttribute("numFmtId")), n.getAttribute("formatCode") ?? ""]));
    const cellXfs = byTag(styles, "cellXfs")[0];
    if (cellXfs) {
      Array.from(cellXfs.children).forEach((xf, i) => {
        const id = Number(xf.getAttribute("numFmtId") ?? 0);
        const code = custom.get(id)?.replace(/"[^"]*"|\[[^\]]*\]/g, "") ?? "";
        if (DATE_FORMAT_IDS.has(id) || /[dy]/i.test(code) || /h+:m/i.test(code)) dateStyles.add(i);
      });
    }
  }

  const sheets: Array<{ name: string; rows: Row[] }> = [];
  for (const sheetEl of byTag(parseXml(workbookXml), "sheet")) {
    const name = sheetEl.getAttribute("name") ?? `Sheet${sheets.length + 1}`;
    const rid = sheetEl.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id") ?? sheetEl.getAttribute("r:id") ?? "";
    let target = relTargets.get(rid) ?? "";
    target = target.startsWith("/") ? target.slice(1) : `xl/${target}`;
    if (target.includes("..")) continue; // never follow paths outside the package
    const xml = await read(target);
    if (!xml) continue;
    const rows: Row[] = [];
    for (const rowEl of byTag(parseXml(xml), "row")) {
      const r = Number(rowEl.getAttribute("r") ?? rows.length + 1) - 1;
      if (r > 1_048_575) break;
      const row: Row = [];
      for (const c of byTag(rowEl, "c")) {
        const ref = c.getAttribute("r") ?? "";
        const col = ref ? columnIndex(ref.replace(/\d+/g, "")) : row.length;
        if (col > 16383) continue;
        const t = c.getAttribute("t");
        const v = byTag(c, "v")[0]?.textContent ?? "";
        let value: Cell;
        if (t === "s") value = shared[Number(v)] ?? "";
        else if (t === "inlineStr") value = byTag(c, "t").map((x) => x.textContent ?? "").join("");
        else if (t === "b") value = v === "1";
        else if (t === "str" || t === "e") value = v;
        else if (v === "") value = null;
        else {
          const n = Number(v);
          const style = Number(c.getAttribute("s") ?? -1);
          value = dateStyles.has(style) ? excelSerialToIso(n) : n;
        }
        row[col] = value;
      }
      rows[r] = Array.from(row, (x) => (x === undefined ? null : x));
    }
    sheets.push({ name, rows: Array.from(rows, (x) => x ?? []) });
  }
  return sheets;
}
