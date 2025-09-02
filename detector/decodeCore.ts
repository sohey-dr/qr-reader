// Decoding core (swappable). For now: QR via jsQR; hooks for other formats later.

import jsQR from 'jsqr';
import type { DetectedBarcode, Point, BoundingBox, BarcodeFormat } from './types';
import { enhanceForQR } from './preprocess';

export async function decodeMultiFormat(
  imageData: ImageData,
  opts: { formats: string[] }
): Promise<DetectedBarcode[]> {
  const wantQR = !opts.formats.length || opts.formats.includes('qr_code');
  const results: DetectedBarcode[] = [];

  if (wantQR) {
    // Pass 1: full-frame detection (fast path)
    const r = tryJsqr(imageData);
    if (r) {
      results.push(r);
    } else {
      // Try an enhanced pass (contrast/unsharp or Otsu) to help tough images
      const enhanced = enhanceForQR(imageData, { grayscale: true, contrast: 0.25, unsharp: { amount: 0.6, radius: 2 }, threshold: 'otsu' });
      const r2 = tryJsqr(enhanced);
      if (r2) results.push(r2);
    }

    // Pass 2: ROI grid search (find additional or small codes)
    const foundValues = new Set(results.map((x) => x.rawValue));
    const extra = gridScanWithJsqr(imageData, { overlap: 0.5, windowRatio: 0.6 })
      .filter((x) => !foundValues.has(x.rawValue));
    results.push(...extra);

    // Deduplicate (NMS) by IoU and value
    let dedupedQR = dedupe(results);

    // Many tough cases (colored/inverted/low-contrast) succeed with ZXing.
    // Run ZXing for QR as an additional pass and merge.
    try {
      const zxingQR = await decodeWithZxing(imageData, ['qr_code']);
      if (zxingQR.length) dedupedQR = dedupe([...dedupedQR, ...zxingQR]);
    } catch {
      // Ignore ZXing errors; keep jsQR results only
    }

    // If other formats requested, run ZXing for the rest and merge
    const otherFormats = opts.formats.filter((f) => f !== 'qr_code');
    if (otherFormats.length === 0) return dedupedQR;
    const zxingOut = await decodeWithZxing(imageData, otherFormats as BarcodeFormat[]);
    return dedupe([...dedupedQR, ...zxingOut]);
  }

  // Non-QR only
  return decodeWithZxing(imageData, opts.formats as BarcodeFormat[]);
}

function tryJsqr(img: ImageData): DetectedBarcode | null {
  const r = jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' } as any);
  if (!r?.data) return null;
  const cps = [
    r.location.topLeftCorner,
    r.location.topRightCorner,
    r.location.bottomRightCorner,
    r.location.bottomLeftCorner,
  ].map((p: { x: number; y: number }) => ({ x: p.x, y: p.y }));
  return mkResult('qr_code', r.data, cps);
}

function mkResult(format: 'qr_code', rawValue: string, cps: Point[]): DetectedBarcode {
  const xs = cps.map((p) => p.x);
  const ys = cps.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return {
    rawValue,
    format,
    cornerPoints: cps,
    boundingBox: { x: minX, y: minY, width: maxX - minX, height: maxY - minY },
  };
}

function gridScanWithJsqr(
  src: ImageData,
  cfg: { overlap: number; windowRatio: number }
): DetectedBarcode[] {
  const { width: W, height: H } = src;
  const winW = Math.max(32, Math.floor(W * cfg.windowRatio));
  const winH = Math.max(32, Math.floor(H * cfg.windowRatio));
  const stepX = Math.max(16, Math.floor(winW * (1 - cfg.overlap)));
  const stepY = Math.max(16, Math.floor(winH * (1 - cfg.overlap)));

  const out: DetectedBarcode[] = [];
  const seen = new Set<string>();

  for (let y = 0; y <= H - winH; y += stepY) {
    for (let x = 0; x <= W - winW; x += stepX) {
      const tile = crop(src, x, y, winW, winH);
      const r = tryJsqr(tile);
      if (r) {
        // Map points back to full-frame coordinates
        const cps = r.cornerPoints.map((p) => ({ x: p.x + x, y: p.y + y }));
        const mapped = mkResult('qr_code', r.rawValue, cps);
        if (!seen.has(mapped.rawValue)) {
          out.push(mapped);
          seen.add(mapped.rawValue);
        }
      }
    }
  }
  return out;
}

function crop(src: ImageData, x: number, y: number, w: number, h: number): ImageData {
  const dest = new Uint8ClampedArray(w * h * 4);
  const stride = src.width * 4;
  const start = y * stride + x * 4;
  for (let row = 0; row < h; row++) {
    const sOff = start + row * stride;
    const dOff = row * w * 4;
    dest.set(src.data.subarray(sOff, sOff + w * 4), dOff);
  }
  return new ImageData(dest, w, h);
}

function iou(a: BoundingBox, b: BoundingBox): number {
  const ax2 = a.x + a.width;
  const ay2 = a.y + a.height;
  const bx2 = b.x + b.width;
  const by2 = b.y + b.height;
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a.x, b.x));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a.y, b.y));
  const inter = ix * iy;
  const union = a.width * a.height + b.width * b.height - inter;
  return union > 0 ? inter / union : 0;
}

function dedupe(items: DetectedBarcode[]): DetectedBarcode[] {
  // Merge duplicates by value and IoU threshold
  const out: DetectedBarcode[] = [];
  for (const it of items) {
    const dupIdx = out.findIndex(
      (o) => o.rawValue === it.rawValue && iou(o.boundingBox, it.boundingBox) > 0.3
    );
    if (dupIdx >= 0) {
      // Prefer larger box (heuristic for more complete detection)
      const a = out[dupIdx];
      const areaA = a.boundingBox.width * a.boundingBox.height;
      const areaB = it.boundingBox.width * it.boundingBox.height;
      if (areaB > areaA) out[dupIdx] = it;
    } else {
      out.push(it);
    }
  }
  return out;
}

export async function decodeWithZxing(
  input: ImageData | Uint8Array | ArrayBuffer | Blob,
  formats: BarcodeFormat[]
): Promise<DetectedBarcode[]> {
  const readerMod: any = await import('zxing-wasm/reader');
  const readBarcodes: any = readerMod.readBarcodes || readerMod.readBarcodesFromImageData;
  if (typeof readBarcodes !== 'function') {
    throw new Error('zxing-wasm: reader function not found');
  }
  const zxFormats = formats.map(mapToZxingFormat).filter(Boolean) as string[];
  const options: any = { tryHarder: true, maxNumberOfSymbols: 16 };
  if (zxFormats.length) options.formats = zxFormats;
  const res: any[] = await readBarcodes(input as any, options);
  const out: DetectedBarcode[] = [];
  for (const r of res) {
    const rawValue = r.text ?? r.rawValue ?? '';
    if (!rawValue) continue;
    const cps = extractPoints(r.position || r.cornerPoints);
    const bbox = cpsToBBox(cps);
    out.push({
      rawValue,
      format: mapFromZxingFormat(r.format) as BarcodeFormat,
      cornerPoints: cps,
      boundingBox: bbox,
    });
  }
  return out;
}

function mapToZxingFormat(f: BarcodeFormat): string | null {
  switch (f) {
    case 'qr_code':
      return 'QRCode';
    case 'code_128':
      return 'Code128';
    case 'code_39':
      return 'Code39';
    case 'ean_13':
      return 'EAN-13';
    case 'ean_8':
      return 'EAN-8';
    case 'upc_a':
      return 'UPC-A';
    case 'upc_e':
      return 'UPC-E';
    case 'itf':
      return 'ITF';
    case 'pdf417':
      return 'PDF417';
    case 'data_matrix':
      return 'DataMatrix';
    default:
      return null;
  }
}

function mapFromZxingFormat(s: string): BarcodeFormat {
  switch (s) {
    case 'QRCode':
      return 'qr_code';
    case 'Code128':
      return 'code_128';
    case 'Code39':
      return 'code_39';
    case 'EAN-13':
      return 'ean_13';
    case 'EAN-8':
      return 'ean_8';
    case 'UPC-A':
      return 'upc_a';
    case 'UPC-E':
      return 'upc_e';
    case 'ITF':
      return 'itf';
    case 'PDF417':
      return 'pdf417';
    case 'DataMatrix':
      return 'data_matrix';
    default:
      return 'qr_code';
  }
}

function extractPoints(position: any): Point[] {
  if (!position) return [];
  if (Array.isArray(position) && position.length && 'x' in position[0]) {
    return position as Point[];
  }
  const tl = position.topLeft || position.topLeftCorner || position.top || position.tl;
  const tr = position.topRight || position.tr;
  const br = position.bottomRight || position.br;
  const bl = position.bottomLeft || position.bl;
  const pts: Point[] = [];
  if (tl) pts.push({ x: tl.x, y: tl.y });
  if (tr) pts.push({ x: tr.x, y: tr.y });
  if (br) pts.push({ x: br.x, y: br.y });
  if (bl) pts.push({ x: bl.x, y: bl.y });
  return pts.length ? pts : [];
}

function cpsToBBox(cps: Point[]): BoundingBox {
  if (!cps.length) return { x: 0, y: 0, width: 0, height: 0 };
  const xs = cps.map((p) => p.x);
  const ys = cps.map((p) => p.y);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const maxX = Math.max(...xs);
  const maxY = Math.max(...ys);
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
