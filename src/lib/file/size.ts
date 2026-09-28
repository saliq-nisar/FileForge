const UNITS = ["B", "KB", "MB", "GB", "TB"] as const;

/** 4_800_000 -> "4.8 MB" (decimal units, like most OS file browsers). */
export function formatBytes(bytes: number, fractionDigits = 1): string {
  if (!Number.isFinite(bytes) || bytes < 0) return "—";
  if (bytes < 1000) return `${Math.round(bytes)} B`;
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.length - 1) {
    value /= 1000;
    unit++;
  }
  const digits = value >= 100 ? 0 : fractionDigits;
  return `${value.toFixed(digits).replace(/\.0+$/, "")} ${UNITS[unit]}`;
}

export function megabytes(mb: number): number {
  return Math.round(mb * 1_000_000);
}

export interface SizeComparison {
  original: number;
  result: number;
  /** Bytes saved; negative if the result is bigger. */
  saved: number;
  /** Percent reduction rounded to one decimal; negative if bigger. */
  reductionPercent: number;
}

export function compareSizes(original: number, result: number): SizeComparison {
  const saved = original - result;
  const reductionPercent = original > 0 ? Math.round((saved / original) * 1000) / 10 : 0;
  return { original, result, saved, reductionPercent };
}
