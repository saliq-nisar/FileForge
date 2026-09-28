/**
 * OCR engine abstraction. The UI and pipeline depend only on this interface, so
 * Tesseract can be swapped for a server engine or a cloud OCR adapter later.
 */
export interface OcrPageResult {
  text: string;
  /** 0-100 average confidence reported by the engine. */
  confidence: number;
  /** Single-page searchable PDF (image + invisible text layer), when requested. */
  pdf?: Uint8Array;
}

export interface OcrRecognizeOptions {
  searchablePdf: boolean;
  onProgress?: (ratio: number, status: string) => void;
}

export type OcrImage = Blob | HTMLCanvasElement | OffscreenCanvas;

export interface OcrEngine {
  readonly id: string;
  readonly languages: Array<{ code: string; label: string }>;
  recognize(image: OcrImage, options: OcrRecognizeOptions): Promise<OcrPageResult>;
  terminate(): Promise<void>;
}
