"use client";

export type { DetectedBarcode, BarcodeFormat } from './types';
import type { BarcodeFormat as BarcodeFormatT } from './types';
import { toImageData } from './frame';
import { initWorkerPool, detectInWorker } from './worker';

type CtorOpts = { formats?: BarcodeFormatT[] };

export class MyBarcodeDetector {
  private formats: Set<BarcodeFormatT>;
  private ready: Promise<void>;

  static async getSupportedFormats(): Promise<BarcodeFormatT[]> {
    // ZXing-based multi-format + jsQR for QR
    return [
      'qr_code',
      'code_128',
      'code_39',
      'ean_13',
      'ean_8',
      'upc_a',
      'upc_e',
      'itf',
      'pdf417',
      'data_matrix',
    ];
  }

  constructor(opts?: CtorOpts) {
    this.formats = new Set(opts?.formats ?? []);
    this.ready = initWorkerPool();
  }

  async detect(
    source:
      | HTMLVideoElement
      | HTMLImageElement
      | HTMLCanvasElement
      | ImageBitmap
      | ImageData
      | Blob
  ) {
    await this.ready;
    const { imageData, scale } = await toImageData(source, { maxSide: 720, grayscale: false });
    const results = await detectInWorker(imageData, { formats: this.formats.size ? [...this.formats] : [] });
    return results.map((r) => ({
      ...r,
      boundingBox: {
        x: r.boundingBox.x / scale,
        y: r.boundingBox.y / scale,
        width: r.boundingBox.width / scale,
        height: r.boundingBox.height / scale,
      },
      cornerPoints: r.cornerPoints.map((p: any) => ({ x: p.x / scale, y: p.y / scale })),
    }));
  }
}
