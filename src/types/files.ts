/** Kinds of files the platform understands, detected from file content (magic bytes). */
export type FileKind =
  | "pdf"
  | "jpeg"
  | "png"
  | "webp"
  | "avif"
  | "gif"
  | "tiff"
  | "bmp"
  | "docx"
  | "xlsx"
  | "pptx"
  | "zip"
  | "text"
  | "csv"
  | "unknown";

export type FileFamily = "pdf" | "image" | "document" | "archive" | "text" | "other";

export interface DetectedFormat {
  kind: FileKind;
  family: FileFamily;
  mime: string;
  /** Canonical extension without dot, e.g. "pdf", "jpg". */
  ext: string;
  label: string;
}

/** Anything with a name, size and bytes: browser `File`, or a server-side file handle. */
export interface InputFile {
  readonly name: string;
  readonly size: number;
  readonly type: string;
  arrayBuffer(): Promise<ArrayBuffer>;
}

export interface FileMetadata {
  name: string;
  size: number;
  format: DetectedFormat;
  /** MIME type the browser/client claimed. Displayed for info only; never trusted. */
  declaredMime: string;
  lastModified?: number;
  pageCount?: number;
  width?: number;
  height?: number;
  /** Human-readable metadata key/values (PDF info dict, EXIF basics, …). */
  details: Array<{ label: string; value: string }>;
  warnings: string[];
}

export interface ProcessedFile {
  name: string;
  mime: string;
  blob: Blob;
  size: number;
}

export type UploadStatus = "idle" | "dragging" | "validating" | "ready" | "uploading" | "error";

export interface UploadState {
  status: UploadStatus;
  /** 0..1 when uploading to the server. */
  progress?: number;
  error?: string;
}

export interface SelectedFile {
  id: string;
  file: File;
  format: DetectedFormat;
}
