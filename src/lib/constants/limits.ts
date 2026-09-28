import type { FileFamily } from "@/types/files";
import { megabytes } from "@/lib/file/size";

/** Hard per-file limits for in-browser processing (memory-bound). */
export const BROWSER_MAX_BYTES: Record<FileFamily, number> = {
  pdf: megabytes(300),
  image: megabytes(100),
  document: megabytes(100),
  archive: megabytes(500),
  text: megabytes(50),
  other: megabytes(500),
};

/** Above this size we warn that processing may be slow on some devices. */
export const RECOMMENDED_MAX_BYTES: Record<FileFamily, number> = {
  pdf: megabytes(100),
  image: megabytes(30),
  document: megabytes(40),
  archive: megabytes(200),
  text: megabytes(10),
  other: megabytes(200),
};

/** Largest image (in pixels) decoded in the browser, to avoid exhausting memory. */
export const MAX_IMAGE_PIXELS = 100_000_000;

export const MAX_FILES_PER_BATCH = 100;
export const MAX_TOTAL_SELECTION_BYTES = megabytes(1500);
