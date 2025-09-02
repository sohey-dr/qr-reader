/*
 * Frame acquisition and lightweight preprocessing utilities.
 * Converts various inputs into ImageData and reports applied scale.
 */

export type ToImageDataOpts = {
  maxSide?: number;
  grayscale?: boolean;
  roi?: { x: number; y: number; width: number; height: number; normalized?: boolean };
};

export async function toImageData(
  src:
    | HTMLVideoElement
    | HTMLImageElement
    | HTMLCanvasElement
    | ImageBitmap
    | ImageData
    | Blob,
  opts: ToImageDataOpts = {}
): Promise<{ imageData: ImageData; scale: number }> {
  const maxSide = opts.maxSide ?? 720;

  if (src instanceof ImageData) return { imageData: src, scale: 1 };

  // Blob → ImageBitmap first for performance where available
  if (src instanceof Blob) {
    const bmp = await createImageBitmap(src);
    return imageBitmapToImageData(bmp, { maxSide, grayscale: opts.grayscale });
  }

  if (typeof ImageBitmap !== 'undefined' && (src as any) instanceof ImageBitmap) {
    return imageBitmapToImageData(src as ImageBitmap, { maxSide, grayscale: opts.grayscale });
  }

  // HTML elements (video/canvas/image)
  const el = src as HTMLVideoElement | HTMLCanvasElement | HTMLImageElement;
  const size = measure(el);
  const scale = Math.min(1, maxSide / Math.max(size.width, size.height));
  const targetW = Math.max(1, Math.round(size.width * scale));
  const targetH = Math.max(1, Math.round(size.height * scale));

  const canvas = ensureCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d', { willReadFrequently: true }) as unknown as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  (ctx as any).drawImage(el as any, 0, 0, targetW, targetH);
  let img = (ctx as any).getImageData(0, 0, targetW, targetH) as ImageData;
  if (opts.roi) img = cropImageData(img, opts.roi);
  if (opts.grayscale) grayscaleInPlace(img.data);
  return { imageData: img, scale };
}

function ensureCanvas(w: number, h: number): HTMLCanvasElement | OffscreenCanvas {
  if (typeof OffscreenCanvas !== 'undefined') {
    const c = new OffscreenCanvas(w, h);
    return c as unknown as OffscreenCanvas;
  }
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

function measure(
  el: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement
): { width: number; height: number } {
  if ('videoWidth' in el) return { width: el.videoWidth, height: el.videoHeight };
  if ('width' in el && 'height' in el && (el as HTMLCanvasElement).getContext)
    return { width: (el as HTMLCanvasElement).width, height: (el as HTMLCanvasElement).height };
  return { width: (el as HTMLImageElement).naturalWidth, height: (el as HTMLImageElement).naturalHeight };
}

async function imageBitmapToImageData(
  bmp: ImageBitmap,
  opts: { maxSide: number; grayscale?: boolean; roi?: { x: number; y: number; width: number; height: number; normalized?: boolean } }
): Promise<{ imageData: ImageData; scale: number }> {
  const scale = Math.min(1, opts.maxSide / Math.max(bmp.width, bmp.height));
  const w = Math.max(1, Math.round(bmp.width * scale));
  const h = Math.max(1, Math.round(bmp.height * scale));
  const canvas =
    typeof OffscreenCanvas !== 'undefined'
      ? new OffscreenCanvas(w, h)
      : Object.assign(document.createElement('canvas'), { width: w, height: h });
  const ctx = canvas.getContext('2d') as unknown as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;
  (ctx as any).drawImage(bmp, 0, 0, w, h);
  let img = (ctx as any).getImageData(0, 0, w, h) as ImageData;
  if (opts.roi) img = cropImageData(img, opts.roi);
  if (opts.grayscale) grayscaleInPlace(img.data);
  return { imageData: img, scale };
}

function grayscaleInPlace(d: Uint8ClampedArray) {
  for (let i = 0; i < d.length; i += 4) {
    const y = (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) | 0;
    d[i] = d[i + 1] = d[i + 2] = y;
  }
}

function cropImageData(
  src: ImageData,
  roi: { x: number; y: number; width: number; height: number; normalized?: boolean }
): ImageData {
  let { x, y, width, height } = roi;
  if (roi.normalized) {
    x = Math.round(x * src.width);
    y = Math.round(y * src.height);
    width = Math.round(width * src.width);
    height = Math.round(height * src.height);
  }
  x = Math.max(0, Math.min(src.width - 1, Math.floor(x)));
  y = Math.max(0, Math.min(src.height - 1, Math.floor(y)));
  width = Math.max(1, Math.min(src.width - x, Math.floor(width)));
  height = Math.max(1, Math.min(src.height - y, Math.floor(height)));

  const dest = new Uint8ClampedArray(width * height * 4);
  const stride = src.width * 4;
  const start = y * stride + x * 4;
  for (let row = 0; row < height; row++) {
    const sOff = start + row * stride;
    const dOff = row * width * 4;
    dest.set(src.data.subarray(sOff, sOff + width * 4), dOff);
  }
  return new ImageData(dest, width, height);
}
