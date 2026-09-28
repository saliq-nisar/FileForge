const RESERVED_WINDOWS = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

/**
 * Make an untrusted file name safe for display and downloads:
 * strips paths, control characters, reserved characters and leading dots,
 * and limits length while keeping the extension.
 */
export function sanitizeFileName(name: string, fallback = "file"): string {
  let base = (name ?? "").normalize("NFC").split(/[\\/]/).pop() ?? "";
  base = base
    .replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "")
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, "") // bidi overrides can disguise extensions
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+/, "")
    .replace(/[. ]+$/, "");
  if (!base) base = fallback;
  const dot = base.lastIndexOf(".");
  let stem = dot > 0 ? base.slice(0, dot) : base;
  const ext = dot > 0 ? base.slice(dot + 1) : "";
  if (RESERVED_WINDOWS.test(stem)) stem = `_${stem}`;
  const maxStem = 120;
  if (stem.length > maxStem) stem = stem.slice(0, maxStem).trim();
  return ext ? `${stem}.${ext.slice(0, 10)}` : stem;
}

export function stripExtension(name: string): string {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}

/** "report.pdf" + ("compressed", "pdf") -> "report-compressed.pdf" */
export function deriveFileName(original: string, suffix: string | null, ext: string): string {
  const stem = stripExtension(sanitizeFileName(original));
  return sanitizeFileName(`${stem}${suffix ? `-${suffix}` : ""}.${ext}`);
}

/** Ensure names inside a ZIP are unique: a.pdf, a (2).pdf, … */
export function uniqueNames(names: string[]): string[] {
  const seen = new Map<string, number>();
  return names.map((n) => {
    const key = n.toLowerCase();
    const count = seen.get(key) ?? 0;
    seen.set(key, count + 1);
    if (count === 0) return n;
    const dot = n.lastIndexOf(".");
    return dot > 0 ? `${n.slice(0, dot)} (${count + 1})${n.slice(dot)}` : `${n} (${count + 1})`;
  });
}

/** RFC 5987/6266 Content-Disposition value with an ASCII fallback. */
export function contentDisposition(fileName: string, type: "attachment" | "inline" = "attachment"): string {
  const safe = sanitizeFileName(fileName, "download");
  const ascii = safe.replace(/[^\x20-\x7e]/g, "_").replace(/["\\]/g, "_");
  return `${type}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(safe)}`;
}
