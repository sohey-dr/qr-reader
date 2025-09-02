export type EnhanceOptions = {
  grayscale?: boolean;
  contrast?: number; // -1..1
  brightness?: number; // -1..1
  unsharp?: { amount: number; radius: 1 | 2 | 3 } | false;
  threshold?: 'otsu' | 'none';
};

export function enhanceForQR(src: ImageData, opts: EnhanceOptions = {}): ImageData {
  const { grayscale = true, contrast = 0.2, brightness = 0.0, unsharp = { amount: 0.5, radius: 2 }, threshold = 'none' } = opts;
  const out = new ImageData(new Uint8ClampedArray(src.data), src.width, src.height);
  if (grayscale) toGrayscale(out.data);
  if (contrast !== 0 || brightness !== 0) applyBrightnessContrast(out.data, brightness, contrast);
  if (unsharp) applyUnsharp(out, unsharp.radius, unsharp.amount);
  if (threshold === 'otsu') applyOtsu(out);
  return out;
}

function toGrayscale(data: Uint8ClampedArray) {
  for (let i = 0; i < data.length; i += 4) {
    const y = (data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114) | 0;
    data[i] = data[i + 1] = data[i + 2] = y;
  }
}

function applyBrightnessContrast(data: Uint8ClampedArray, brightness: number, contrast: number) {
  const b = Math.max(-1, Math.min(1, brightness)) * 255;
  const c = Math.max(-1, Math.min(1, contrast));
  const k = 259 * (c + 1) / (255 * (1 - c));
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clamp(k * (data[i] + b - 128) + 128);
    data[i + 1] = clamp(k * (data[i + 1] + b - 128) + 128);
    data[i + 2] = clamp(k * (data[i + 2] + b - 128) + 128);
  }
}

function applyUnsharp(img: ImageData, radius: 1 | 2 | 3, amount: number) {
  // Simple 3x3 or 5x5 box blur approximation + subtract
  const blurred = boxBlur(img, radius);
  const d = img.data, s = blurred.data;
  const amt = Math.max(0, Math.min(2, amount));
  for (let i = 0; i < d.length; i += 4) {
    d[i] = clamp(d[i] + (d[i] - s[i]) * amt);
    d[i + 1] = clamp(d[i + 1] + (d[i + 1] - s[i + 1]) * amt);
    d[i + 2] = clamp(d[i + 2] + (d[i + 2] - s[i + 2]) * amt);
  }
}

function boxBlur(img: ImageData, radius: 1 | 2 | 3): ImageData {
  const w = img.width, h = img.height, d = img.data;
  const out = new ImageData(w, h);
  const tmp = new Uint8ClampedArray(d.length);
  const kernel = 2 * radius + 1;
  const div = kernel;

  // Horizontal
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const xx = Math.max(0, Math.min(w - 1, x + k));
        const off = (y * w + xx) * 4;
        r += d[off]; g += d[off + 1]; b += d[off + 2];
      }
      const o = (y * w + x) * 4;
      tmp[o] = r / div; tmp[o + 1] = g / div; tmp[o + 2] = b / div; tmp[o + 3] = 255;
    }
  }
  // Vertical
  for (let x = 0; x < w; x++) {
    for (let y = 0; y < h; y++) {
      let r = 0, g = 0, b = 0;
      for (let k = -radius; k <= radius; k++) {
        const yy = Math.max(0, Math.min(h - 1, y + k));
        const off = (yy * w + x) * 4;
        r += tmp[off]; g += tmp[off + 1]; b += tmp[off + 2];
      }
      const o = (y * w + x) * 4;
      out.data[o] = r / div; out.data[o + 1] = g / div; out.data[o + 2] = b / div; out.data[o + 3] = 255;
    }
  }
  return out;
}

function applyOtsu(img: ImageData) {
  // Expect grayscale input, operate on R
  const w = img.width * img.height;
  const hist = new Uint32Array(256);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) hist[d[i]]++;
  let sum = 0; for (let t = 0; t < 256; t++) sum += t * hist[t];
  let sumB = 0, wB = 0, wF = 0, varMax = 0, th = 0;
  for (let t = 0; t < 256; t++) {
    wB += hist[t]; if (wB === 0) continue;
    wF = w - wB; if (wF === 0) break;
    sumB += t * hist[t];
    const mB = sumB / wB; const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) * (mB - mF);
    if (between > varMax) { varMax = between; th = t; }
  }
  for (let i = 0; i < d.length; i += 4) {
    const v = d[i] >= th ? 255 : 0;
    d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255;
  }
}

function clamp(v: number) { return v < 0 ? 0 : v > 255 ? 255 : v | 0; }

