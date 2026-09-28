import "server-only";
import { execFile } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { AppError } from "@/lib/errors";
import type { EngineId } from "@/types/tools";
import { serverConfig } from "../config";
import { logger } from "../logger";

/**
 * Adapters for optional native engines. Each is used only when its executable
 * path is configured. Commands run with execFile (no shell), fixed arguments,
 * timeouts and a private working directory that is always removed.
 */
export function engineAvailable(id: EngineId): boolean {
  const path = serverConfig.enginePaths[id];
  return Boolean(path && existsSync(path));
}

export function engineAvailability(): Record<EngineId, boolean> {
  return { libreoffice: engineAvailable("libreoffice"), qpdf: engineAvailable("qpdf"), ghostscript: engineAvailable("ghostscript") };
}

function run(id: EngineId, args: string[], cwd: string): Promise<void> {
  const bin = serverConfig.enginePaths[id];
  if (!bin || !existsSync(bin)) throw new AppError("ENGINE_UNAVAILABLE");
  return new Promise((resolve, reject) => {
    execFile(bin, args, { cwd, timeout: serverConfig.engineTimeoutMs, maxBuffer: 4 * 1024 * 1024, windowsHide: true }, (error, _stdout, stderr) => {
      // qpdf exits with 3 for warnings but still produces valid output.
      if (error && !(id === "qpdf" && (error as NodeJS.ErrnoException & { code?: number }).code === 3)) {
        logger.warn("engine failed", { engine: id, stderr: String(stderr).slice(0, 500) });
        const text = String(stderr);
        if (id === "qpdf" && /invalid password/i.test(text)) return reject(new AppError("INVALID_OPTIONS", "The password is incorrect."));
        return reject(new AppError("PROCESSING_FAILED"));
      }
      resolve();
    });
  });
}

/** Run a job inside a private temp directory, cleaned up afterwards. */
export async function withWorkdir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = join(tmpdir(), "fileforge-work", randomUUID());
  await mkdir(dir, { recursive: true, mode: 0o700 });
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function libreofficeConvert(dir: string, input: string, target: "pdf" | "pptx"): Promise<string> {
  const profile = pathToFileURL(join(dir, "lo-profile")).href;
  const outDir = join(dir, "out");
  await mkdir(outDir);
  const args = [`-env:UserInstallation=${profile}`, "--headless", "--norestore", "--nolockcheck"];
  if (target === "pptx") args.push("--infilter=impress_pdf_import");
  args.push("--convert-to", target, "--outdir", outDir, input);
  await run("libreoffice", args, dir);
  const produced = (await readdir(outDir)).find((f) => f.toLowerCase().endsWith(`.${target}`));
  if (!produced) throw new AppError("PROCESSING_FAILED");
  return join(outDir, produced);
}

export async function ghostscriptPdfA(dir: string, input: string): Promise<string> {
  const out = join(dir, "out.pdf");
  await run(
    "ghostscript",
    ["-dSAFER", "-dBATCH", "-dNOPAUSE", "-dQUIET", "-dPDFA=2", "-dPDFACompatibilityPolicy=1", "-sColorConversionStrategy=RGB", "-sDEVICE=pdfwrite", `-sOutputFile=${out}`, input],
    dir,
  );
  return out;
}

/** qpdf reads arguments from a 0600 file so passwords never appear in the process list. */
async function qpdfWithArgFile(dir: string, args: string[]): Promise<void> {
  const argFile = join(dir, "args.txt");
  await writeFile(argFile, args.join("\n"), { mode: 0o600 });
  await run("qpdf", [`@${argFile}`], dir);
}

export async function qpdfEncrypt(dir: string, input: string, password: string, perms: { print: boolean; copy: boolean }): Promise<string> {
  const out = join(dir, "out.pdf");
  const owner = randomBytes(24).toString("hex");
  await qpdfWithArgFile(dir, [
    "--encrypt", password, owner, "256",
    `--print=${perms.print ? "full" : "none"}`,
    `--extract=${perms.copy ? "y" : "n"}`,
    "--",
    input, out,
  ]);
  return out;
}

export async function qpdfDecrypt(dir: string, input: string, password: string): Promise<string> {
  const out = join(dir, "out.pdf");
  await qpdfWithArgFile(dir, [`--password=${password}`, "--decrypt", input, out]);
  return out;
}
