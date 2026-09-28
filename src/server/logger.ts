import "server-only";

type Level = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(msg: string, meta?: Record<string, unknown>): void;
  info(msg: string, meta?: Record<string, unknown>): void;
  warn(msg: string, meta?: Record<string, unknown>): void;
  error(msg: string, meta?: Record<string, unknown>): void;
}

const LEVELS: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const minLevel: Level = process.env.NODE_ENV === "production" ? "info" : "debug";

/** Structured JSON logs to stdout/stderr. Swap this module to ship logs elsewhere. */
function write(level: Level, msg: string, meta?: Record<string, unknown>): void {
  if (LEVELS[level] < LEVELS[minLevel]) return;
  const line = JSON.stringify({ level, time: new Date().toISOString(), msg, ...sanitize(meta) });
  if (level === "error" || level === "warn") console.error(line);
  else console.log(line);
}

/** Never log file contents or secrets; errors are reduced to name + message. */
function sanitize(meta?: Record<string, unknown>): Record<string, unknown> | undefined {
  if (!meta) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(meta)) {
    if (/password|secret|token|key/i.test(k)) out[k] = "[redacted]";
    else if (v instanceof Error) out[k] = { name: v.name, message: v.message };
    else out[k] = v;
  }
  return out;
}

export const logger: Logger = {
  debug: (m, meta) => write("debug", m, meta),
  info: (m, meta) => write("info", m, meta),
  warn: (m, meta) => write("warn", m, meta),
  error: (m, meta) => write("error", m, meta),
};
