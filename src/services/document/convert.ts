import { AppError, throwIfAborted } from "@/lib/errors";
import { deriveFileName, sanitizeFileName, stripExtension } from "@/lib/file/names";
import { bool, str, type ToolOptions } from "@/lib/validation/options";
import type { InputFile } from "@/types/files";
import type { ProcessContext, ProcessResult } from "@/types/processing";
import { escapeHtml } from "@/lib/utils/html";
import { toProcessedFile } from "@/services/shared/output";
import { buildXlsx, parseCsv, readXlsx, toCsv } from "./spreadsheet";

type Mammoth = {
  extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>;
  convertToHtml(input: { arrayBuffer: ArrayBuffer }, options?: Record<string, unknown>): Promise<{ value: string; messages: unknown[] }>;
};

async function mammoth(): Promise<Mammoth> {
  const mod = (await import("mammoth")) as unknown as { default?: Mammoth } & Mammoth;
  return mod.default ?? mod;
}

/** Extract text from a DOCX. Also used by the resume importer. */
export async function docxToPlainText(data: ArrayBuffer): Promise<string> {
  try {
    return (await (await mammoth()).extractRawText({ arrayBuffer: data })).value;
  } catch (error) {
    throw new AppError("UNSUPPORTED_FORMAT", "This Word document couldn't be read. It may be corrupted.", { cause: error });
  }
}

export async function docxToText(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const files = [];
  let text = "";
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Reading ${inputs[i].name}` });
    const value = await docxToPlainText(await inputs[i].arrayBuffer());
    text = value;
    files.push(toProcessedFile(deriveFileName(inputs[i].name, null, "txt"), "text/plain;charset=utf-8", value));
  }
  return { files, text: inputs.length === 1 ? text : undefined };
}

export async function docxToHtml(inputs: InputFile[], _o: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const m = await mammoth();
  const files = [];
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Converting ${inputs[i].name}` });
    let body: string;
    try {
      // Images are embedded inline as data URIs by mammoth's default converter.
      body = (await m.convertToHtml({ arrayBuffer: await inputs[i].arrayBuffer() })).value;
    } catch (error) {
      throw new AppError("UNSUPPORTED_FORMAT", "This Word document couldn't be read. It may be corrupted.", { cause: error });
    }
    const title = escapeHtml(stripExtension(sanitizeFileName(inputs[i].name)));
    const html = `<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>${title}</title>\n<style>body{font:16px/1.6 system-ui,sans-serif;max-width:46rem;margin:2rem auto;padding:0 1rem;color:#1a1a1a}img{max-width:100%;height:auto}table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style>\n</head>\n<body>\n${body}\n</body>\n</html>\n`;
    files.push(toProcessedFile(deriveFileName(inputs[i].name, null, "html"), "text/html;charset=utf-8", html));
  }
  return { files };
}

export async function xlsxToCsv(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const files = [];
  const all = str(options, "sheets", "first") === "all";
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Reading ${inputs[i].name}` });
    const sheets = await readXlsx(await inputs[i].arrayBuffer());
    if (sheets.length === 0) throw new AppError("PROCESSING_FAILED", "This workbook has no readable sheets.");
    const chosen = all ? sheets : sheets.slice(0, 1);
    const stem = stripExtension(sanitizeFileName(inputs[i].name));
    for (const sheet of chosen) {
      const name = chosen.length > 1 ? `${stem}-${sanitizeFileName(sheet.name, "sheet")}.csv` : `${stem}.csv`;
      // BOM so Excel detects UTF-8 when reopening.
      files.push(toProcessedFile(name, "text/csv;charset=utf-8", "﻿" + toCsv(sheet.rows)));
    }
  }
  return { files };
}

export async function csvToXlsx(inputs: InputFile[], options: ToolOptions, ctx: ProcessContext): Promise<ProcessResult> {
  const files = [];
  for (let i = 0; i < inputs.length; i++) {
    throwIfAborted(ctx.signal);
    ctx.onProgress({ ratio: i / inputs.length, message: `Converting ${inputs[i].name}` });
    const text = new TextDecoder().decode(await inputs[i].arrayBuffer());
    const d = str(options, "delimiter", "auto");
    const rows = d === "auto" ? parseCsv(text) : parseCsv(text, d);
    if (rows.length > 1_048_576) throw new AppError("FILE_TOO_LARGE", "Excel supports up to 1,048,576 rows.");
    const blob = await buildXlsx([{ name: "Sheet1", rows }], { convertNumbers: bool(options, "convertNumbers", true) });
    files.push(toProcessedFile(deriveFileName(inputs[i].name, null, "xlsx"), "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", blob));
  }
  return { files };
}

