import type Tesseract from "tesseract.js";
import { AppError } from "@/lib/errors";
import type { OcrEngine, OcrImage, OcrPageResult, OcrRecognizeOptions } from "./engine";

/**
 * Tesseract (WebAssembly) running in a Web Worker. All assets — worker script,
 * WASM core and the English model — are served from /vendor on our own origin,
 * so images never leave the browser and no third-party CDN is contacted.
 */
export class TesseractEngine implements OcrEngine {
  readonly id = "tesseract";
  readonly languages = [{ code: "eng", label: "English" }];
  private worker: Tesseract.Worker | null = null;
  private progress: ((ratio: number, status: string) => void) | undefined;

  private async getWorker(): Promise<Tesseract.Worker> {
    if (this.worker) return this.worker;
    const { createWorker, OEM } = await import("tesseract.js");
    try {
      this.worker = await createWorker("eng", OEM.LSTM_ONLY, {
        workerPath: "/vendor/tesseract/worker.min.js",
        corePath: "/vendor/tesseract/core",
        langPath: "/vendor/tesseract/lang",
        workerBlobURL: false,
        gzip: true,
        logger: (m) => {
          const status = m.status.startsWith("recognizing") ? "Recognizing text" : "Loading OCR engine";
          this.progress?.(m.progress, status);
        },
      });
    } catch (error) {
      throw new AppError("BROWSER_UNSUPPORTED", "The OCR engine couldn't start in this browser.", { cause: error });
    }
    return this.worker;
  }

  async recognize(image: OcrImage, options: OcrRecognizeOptions): Promise<OcrPageResult> {
    const worker = await this.getWorker();
    this.progress = options.onProgress;
    try {
      const { data } = await worker.recognize(
        image as Tesseract.ImageLike,
        { pdfTitle: "OCR result" },
        { text: true, pdf: options.searchablePdf, blocks: false, hocr: false, tsv: false },
      );
      return {
        text: data.text ?? "",
        confidence: data.confidence ?? 0,
        pdf: data.pdf ? new Uint8Array(data.pdf) : undefined,
      };
    } catch (error) {
      throw new AppError("PROCESSING_FAILED", "Text recognition failed for this image.", { cause: error });
    } finally {
      this.progress = undefined;
    }
  }

  async terminate(): Promise<void> {
    await this.worker?.terminate();
    this.worker = null;
  }
}
