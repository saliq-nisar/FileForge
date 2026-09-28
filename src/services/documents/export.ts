import { sanitizeFileName } from "@/lib/file/names";
import { downloadBlob } from "@/lib/utils/download";
import { modelToText, type DocumentModel } from "./model";

export type ExportFormat = "pdf" | "docx" | "txt";

export const EXPORT_MIME: Record<ExportFormat, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain;charset=utf-8",
};

export async function exportDocument(model: DocumentModel, format: ExportFormat): Promise<Blob> {
  if (format === "pdf") {
    const { renderPdf } = await import("./render-pdf");
    return new Blob([(await renderPdf(model)) as BlobPart], { type: EXPORT_MIME.pdf });
  }
  if (format === "docx") {
    const { renderDocx } = await import("./render-docx");
    return renderDocx(model);
  }
  return new Blob([modelToText(model)], { type: EXPORT_MIME.txt });
}

export async function downloadDocument(model: DocumentModel, format: ExportFormat, baseName: string): Promise<void> {
  const blob = await exportDocument(model, format);
  downloadBlob(blob, `${sanitizeFileName(baseName, "document")}.${format}`, EXPORT_MIME[format]);
}
