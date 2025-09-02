"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

// Minimal types for the BarcodeDetector Web API and jsqr
type BarcodeFormat = string;
type DetectedBarcode = { rawValue?: string; format?: string };
type BarcodeDetectorInstance = {
  detect: (
    source:
      | ImageBitmap
      | HTMLImageElement
      | HTMLVideoElement
      | HTMLCanvasElement
      | ImageData
      | Blob
  ) => Promise<ReadonlyArray<DetectedBarcode>>;
};
type BarcodeDetectorCtor = new (opts?: { formats?: BarcodeFormat[] }) => BarcodeDetectorInstance;
type BarcodeDetectorStatic = BarcodeDetectorCtor & {
  getSupportedFormats?: () => Promise<BarcodeFormat[]>;
};

type JsqrOptions = { inversionAttempts?: "dontInvert" | "onlyInvert" | "attemptBoth" | "invertFirst" };
type JsqrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number,
  options?: JsqrOptions
) => { data?: string } | null;

type DecodeState =
  | { status: "idle" }
  | { status: "decoding" }
  | { status: "success"; value: string; format: string }
  | { status: "error"; message: string };

export default function Home() {
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<DecodeState>({ status: "idle" });
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previewBoxRef = useRef<HTMLDivElement | null>(null);
  const [useGuide, setUseGuide] = useState<boolean>(true);
  const [guideSize, setGuideSize] = useState<number>(0.6); // relative to min(image dim), 0..1
  // Camera scan mode (mobile-friendly)
  const [camActive, setCamActive] = useState<boolean>(false);
  const [camError, setCamError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const scanRafRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const reset = useCallback(() => {
    setFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    setResult({ status: "idle" });
    inputRef.current?.focus();
  }, [previewUrl]);

  const onSelectFile = useCallback((f: File) => {
    setFile(f);
    const url = URL.createObjectURL(f);
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return url;
    });
    setResult({ status: "idle" });
  }, []);

  const onChange = useCallback<React.ChangeEventHandler<HTMLInputElement>>(
    (e) => {
      const f = e.target.files?.[0];
      if (f) onSelectFile(f);
    },
    [onSelectFile]
  );

  const barcodeSupported = useMemo(() => {
    if (typeof window === "undefined") return false;
    const BD = (window as Window & { BarcodeDetector?: BarcodeDetectorStatic }).BarcodeDetector;
    return !!BD;
  }, []);

  // Helpers to start/stop camera
  const stopCamera = useCallback(() => {
    if (scanRafRef.current) { cancelAnimationFrame(scanRafRef.current); scanRafRef.current = null; }
    const stream = streamRef.current;
    if (stream) {
      stream.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      v.pause();
      (v as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCamera();
  }, [stopCamera]);

  const decodeWithBarcodeDetector = useCallback(async (f: File) => {
    try {
      const BD = (window as Window & { BarcodeDetector?: BarcodeDetectorStatic }).BarcodeDetector;
      if (!BD) throw new Error("BarcodeDetector API not available");

      const formats: string[] = (await BD.getSupportedFormats?.()) || [];
      const canQR = formats.includes("qr_code") || formats.includes("qr");
      const detector = new BD({ formats: canQR ? ["qr_code"] : undefined });

      // Prefer ImageBitmap for performance
      let source: ImageBitmap | HTMLImageElement;
      if ("createImageBitmap" in window) {
        source = await createImageBitmap(f, {
          imageOrientation: "from-image", // EXIFの向きを反映
          colorSpaceConversion: "default", // sRGB へ変換（広色域→sRGB）
          premultiplyAlpha: "default", // 念のため
        });
      } else {
        source = await new Promise<HTMLImageElement>((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = (err) => reject(err);
          img.src = URL.createObjectURL(f);
        });
      }

      const barcodes = await detector.detect(source);
      if (!barcodes || barcodes.length === 0) {
        throw new Error("QRコードが検出できませんでした。");
      }
      const first = barcodes[0];
      const value = first.rawValue || first.rawValue?.toString?.() || "";
      if (!value) throw new Error("デコード結果が空でした。");
      setResult({ status: "success", value, format: first.format || "qr_code" });
    } catch (err: unknown) {
      // Re-throw so caller can fallback to jsQR
      throw err;
    }
  }, []);

  const decodeWithJsqr = useCallback(async (f: File) => {
    const isHeic = /heic|heif/i.test(f.type || "");
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.crossOrigin = "anonymous";
        image.onload = () => resolve(image);
        image.onerror = (err) => reject(err);
        image.src = URL.createObjectURL(f);
      });

      const imported = (await import("jsqr")) as unknown;
      const jsQR: JsqrFn = (typeof imported === "function"
        ? (imported as JsqrFn)
        : (imported as { default?: unknown })?.default as JsqrFn);
      if (typeof jsQR !== "function") throw new Error("jsqr の読み込みに失敗しました。");

      // Helper: compute tiles (center-focused grid or guide ROI)
      const iw = img.naturalWidth;
      const ih = img.naturalHeight;
      const minDim = Math.min(iw, ih);
      type Rect = { sx: number; sy: number; sw: number; sh: number };

      const tiles: Rect[] = [];
      if (useGuide) {
        const side = Math.max(50, Math.round(minDim * Math.max(0.2, Math.min(1, guideSize))));
        const sx = Math.max(0, Math.round((iw - side) / 2));
        const sy = Math.max(0, Math.round((ih - side) / 2));
        tiles.push({ sx, sy, sw: Math.min(side, iw - sx), sh: Math.min(side, ih - sy) });
        // Always add full image as a fallback so off-center codes still decode on mobile uploads
        tiles.push({ sx: 0, sy: 0, sw: iw, sh: ih });
      } else {
        // Full image first, then center tiles
        tiles.push({ sx: 0, sy: 0, sw: iw, sh: ih });
        const base = Math.round(minDim * 0.6);
        const centers = [-0.2, 0, 0.2] as const;
        for (const dx of centers) {
          for (const dy of centers) {
            const cx = iw / 2 + dx * minDim;
            const cy = ih / 2 + dy * minDim;
            const sx = Math.max(0, Math.round(cx - base / 2));
            const sy = Math.max(0, Math.round(cy - base / 2));
            const sw = Math.min(base, iw - sx);
            const sh = Math.min(base, ih - sy);
            tiles.push({ sx, sy, sw, sh });
          }
        }
      }

      // Try to estimate a red-dominant ROI (for red QR on dark background)
      try {
        const sampleW = Math.min(256, iw);
        const sampleH = Math.max(1, Math.round((sampleW / iw) * ih));
        const sCanvas = document.createElement("canvas");
        sCanvas.width = sampleW;
        sCanvas.height = sampleH;
        const sctx = sCanvas.getContext("2d");
        if (sctx) {
          sctx.drawImage(img, 0, 0, sampleW, sampleH);
          const sdata = sctx.getImageData(0, 0, sampleW, sampleH).data;
          let xMin = sampleW, yMin = sampleH, xMax = -1, yMax = -1;
          for (let y = 0; y < sampleH; y++) {
            for (let x = 0; x < sampleW; x++) {
              const i = (y * sampleW + x) * 4;
              const r = sdata[i], g = sdata[i + 1], b = sdata[i + 2];
              // redness metric
              const rd = r - Math.max(g, b);
              if (rd > 35) {
                if (x < xMin) xMin = x;
                if (x > xMax) xMax = x;
                if (y < yMin) yMin = y;
                if (y > yMax) yMax = y;
              }
            }
          }
          if (xMax > xMin && yMax > yMin) {
            // map back to original coords and add margin
            const mx = iw / sampleW;
            const my = ih / sampleH;
            const pad = Math.round(Math.min(iw, ih) * 0.06);
            const sx = Math.max(0, Math.floor(xMin * mx) - pad);
            const sy = Math.max(0, Math.floor(yMin * my) - pad);
            const sw = Math.min(iw - sx, Math.floor((xMax - xMin) * mx) + pad * 2);
            const sh = Math.min(ih - sy, Math.floor((yMax - yMin) * my) + pad * 2);
            // Prepend as highest-priority tile
            tiles.unshift({ sx, sy, sw, sh });
          }
        }
      } catch {}

      // Try multiple scales/rotations with local binarization per tile
      const maxBaseSide = 2000;
      const scalesBase = [1, 0.8, 0.6];
      const rotations = [0, 90, 180, 270];
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", {
        willReadFrequently: true,
        colorSpace: "srgb",
      });
      ctx!.imageSmoothingEnabled = false;
      if (!ctx) throw new Error("Canvas が利用できません。");

      const binarize = (imgData: ImageData, mode: 'luma' | 'red' | 'green' | 'blue' | 'redness' = 'luma', invert = false) => {
        const { data, width, height } = imgData;
        const blocks = Math.max(4, Math.round(Math.min(width, height) / 64));
        const bx = blocks, by = blocks;
        const sums = new Array(bx * by).fill(0);
        const counts = new Array(bx * by).fill(0);
        for (let y = 0; y < height; y++) {
          const gy = Math.min(by - 1, Math.floor((y * by) / height));
          for (let x = 0; x < width; x++) {
            const gx = Math.min(bx - 1, Math.floor((x * bx) / width));
            const idx = (y * width + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            let l = 0;
            if (mode === 'redness') {
              l = Math.max(0, r - Math.max(g, b));
            } else if (mode === 'red') {
              l = r;
            } else if (mode === 'green') {
              l = g;
            } else if (mode === 'blue') {
              l = b;
            } else {
              l = (r * 299 + g * 587 + b * 114) / 1000;
            }
            const bi = gy * bx + gx;
            sums[bi] += l;
            counts[bi]++;
          }
        }
        const means = sums.map((s, i) => s / Math.max(1, counts[i]));
        const C = 8; // slightly弱めのバイアス
        for (let y = 0; y < height; y++) {
          const gy = Math.min(by - 1, Math.floor((y * by) / height));
          for (let x = 0; x < width; x++) {
            const gx = Math.min(bx - 1, Math.floor((x * bx) / width));
            const idx = (y * width + x) * 4;
            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
            let l = 0;
            if (mode === 'redness') {
              l = Math.max(0, r - Math.max(g, b));
            } else if (mode === 'red') {
              l = r;
            } else if (mode === 'green') {
              l = g;
            } else if (mode === 'blue') {
              l = b;
            } else {
              l = (r * 299 + g * 587 + b * 114) / 1000;
            }
            const th = means[gy * bx + gx] - C;
            let v = l > th ? 255 : 0;
            if (invert) v = v ? 0 : 255;
            data[idx] = data[idx + 1] = data[idx + 2] = v;
          }
        }
        return imgData;
      };

      const binarizeOtsu = (imgData: ImageData, mode: 'luma' | 'redness' | 'red' = 'luma', invert = false) => {
        const { data, width, height } = imgData;
        const hist = new Array(256).fill(0);
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          let l = 0;
          if (mode === 'redness') l = Math.max(0, r - Math.max(g, b));
          else if (mode === 'red') l = r; else l = (r * 299 + g * 587 + b * 114) / 1000;
          hist[Math.max(0, Math.min(255, l | 0))]++;
        }
        const total = width * height;
        let sum = 0;
        for (let t = 0; t < 256; t++) sum += t * hist[t];
        let sumB = 0, wB = 0, wF = 0, varMax = 0, threshold = 127;
        for (let t = 0; t < 256; t++) {
          wB += hist[t];
          if (wB === 0) continue;
          wF = total - wB;
          if (wF === 0) break;
          sumB += t * hist[t];
          const mB = sumB / wB;
          const mF = (sum - sumB) / wF;
          const varBetween = wB * wF * (mB - mF) * (mB - mF);
          if (varBetween > varMax) { varMax = varBetween; threshold = t; }
        }
        for (let i = 0; i < data.length; i += 4) {
          const r = data[i], g = data[i + 1], b = data[i + 2];
          let l = 0;
          if (mode === 'redness') l = Math.max(0, r - Math.max(g, b));
          else if (mode === 'red') l = r; else l = (r * 299 + g * 587 + b * 114) / 1000;
          let v = l > threshold ? 255 : 0;
          if (invert) v = v ? 0 : 255;
          data[i] = data[i + 1] = data[i + 2] = v;
        }
        return imgData;
      };

      const morphClose = (imgData: ImageData) => {
        const { data, width, height } = imgData;
        const dil = new Uint8ClampedArray(data.length);
        // dilation
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let on = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
                const idx = (ny * width + nx) * 4;
                if (data[idx] > 127) { on = 255; dy = 2; dx = 2; break; }
              }
            }
            const i = (y * width + x) * 4;
            dil[i] = dil[i + 1] = dil[i + 2] = on;
            dil[i + 3] = 255;
          }
        }
        // erosion
        const ero = new Uint8ClampedArray(data.length);
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            let on = 255;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < width && ny < height) {
                const idx = (ny * width + nx) * 4;
                if (dil[idx] <= 127) { on = 0; dy = 2; dx = 2; break; }
              }
            }
            const i = (y * width + x) * 4;
            ero[i] = ero[i + 1] = ero[i + 2] = on;
            ero[i + 3] = 255;
          }
        }
        return new ImageData(ero, width, height);
      };

      const withQuietZone = (imgData: ImageData, pad = 16, white = true) => {
        const padded = document.createElement('canvas');
        padded.width = imgData.width + pad * 2;
        padded.height = imgData.height + pad * 2;
        const pctx = padded.getContext('2d');
        if (!pctx) return imgData;
        pctx.fillStyle = white ? '#fff' : '#000';
        pctx.fillRect(0, 0, padded.width, padded.height);
        const tmp = document.createElement('canvas');
        tmp.width = imgData.width;
        tmp.height = imgData.height;
        const tctx = tmp.getContext('2d');
        if (!tctx) return imgData;
        tctx.putImageData(imgData, 0, 0);
        pctx.drawImage(tmp, pad, pad);
        return pctx.getImageData(0, 0, padded.width, padded.height);
      };

      let decoded: string | null = null;
      outer: for (const tile of tiles) {
        const longest = Math.max(tile.sw, tile.sh);
        const baseScale = Math.min(1, maxBaseSide / longest);
        const scales = scalesBase.map((t) => baseScale * t).filter((s) => s > 0.2);
        for (const s of scales) {
          const w0 = Math.max(1, Math.round(tile.sw * s));
          const h0 = Math.max(1, Math.round(tile.sh * s));
          for (const deg of rotations) {
            const rad = (deg * Math.PI) / 180;
            const rotatedW = deg % 180 === 0 ? w0 : h0;
            const rotatedH = deg % 180 === 0 ? h0 : w0;
            canvas.width = rotatedW;
            canvas.height = rotatedH;
            ctx.imageSmoothingEnabled = false;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, rotatedW, rotatedH);
            ctx.translate(rotatedW / 2, rotatedH / 2);
            ctx.rotate(rad);
            ctx.drawImage(
              img,
              tile.sx,
              tile.sy,
              tile.sw,
              tile.sh,
              -w0 / 2,
              -h0 / 2,
              w0,
              h0
            );
            ctx.setTransform(1, 0, 0, 1, 0, 0);

            // Build candidates: luma/red binarized, with/without inversion and with quiet zone
            const base = ctx.getImageData(0, 0, rotatedW, rotatedH);
            const variants: ImageData[] = [];
            const makeLocal = (mode: 'luma'|'red'|'redness', inv: boolean, pad: boolean, close = false) => {
              const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
              let bw = binarize(copy, mode, inv);
              if (close) bw = morphClose(bw);
              return pad ? withQuietZone(bw, 24, true) : bw;
            };
            const makeOtsu = (mode: 'luma'|'redness'|'red', inv: boolean, pad: boolean, close = false) => {
              const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
              let bw = binarizeOtsu(copy, mode, inv);
              if (close) bw = morphClose(bw);
              return pad ? withQuietZone(bw, 24, true) : bw;
            };
            variants.push(makeLocal('luma', false, false));
            variants.push(makeLocal('luma', true, false));
            variants.push(makeLocal('red', false, false));
            variants.push(makeLocal('red', true, false));
            variants.push(makeLocal('redness', false, false));
            variants.push(makeLocal('redness', true, false));
            variants.push(makeLocal('redness', false, true, true));
            variants.push(makeOtsu('redness', false, true, true));
            variants.push(makeOtsu('luma', false, true));
            variants.push(makeOtsu('red', false, true));

            for (const v of variants) {
              const code = jsQR(v.data, v.width, v.height, { inversionAttempts: "attemptBoth" });
              if (code?.data) { decoded = code.data; break outer; }
            }
          }
        }
      }

      if (!decoded) throw new Error("QRコードが検出できませんでした（フォールバック）。");
      setResult({ status: "success", value: decoded, format: "qr_code" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (isHeic) {
        throw new Error("HEIC/HEIF 画像はブラウザの制約で処理できない場合があります。JPEG/PNG でお試しください。");
      }
      throw new Error(message);
    }
  }, [useGuide, guideSize]);

  // Camera scan loop (tries BarcodeDetector → jsQR)
  const startCameraScan = useCallback(async () => {
    setCamError(null);
    setResult({ status: "idle" });
    try {
      if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
        throw new Error("このブラウザではカメラが利用できません。");
      }
      // iOS requires https (localhost は不可の場合があります)
      if (typeof location !== "undefined" && location.protocol !== "https:" && location.hostname !== "localhost") {
        // ユーザーへの注意。動作自体は試みる。
        console.warn("Camera on iOS typically requires HTTPS.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });
      streamRef.current = stream;
      const v = videoRef.current!;
      (v as HTMLVideoElement & { srcObject: MediaStream | null }).srcObject = stream;
      v.playsInline = true; // iOS Safari inline
      v.muted = true; // avoid autoplay block
      await v.play().catch(() => {});

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) throw new Error("Canvas が利用できません。");

      let stopping = false;
      const loop = async () => {
        if (stopping) return;
        const vw = v.videoWidth;
        const vh = v.videoHeight;
        if (vw && vh) {
          // Downscale for speed on mobile
          const maxSide = 800;
          const scale = Math.min(1, maxSide / Math.max(vw, vh));
          const rw = Math.max(1, Math.round(vw * scale));
          const rh = Math.max(1, Math.round(vh * scale));
          canvas.width = rw;
          canvas.height = rh;
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(v, 0, 0, rw, rh);

          try {
            if (barcodeSupported) {
              const BD = (window as Window & { BarcodeDetector?: BarcodeDetectorStatic }).BarcodeDetector!;
              const detector = new BD({ formats: ["qr_code"] });
              const codes = await detector.detect(canvas);
              const value = codes?.[0]?.rawValue;
              if (value) {
                setResult({ status: "success", value, format: codes?.[0]?.format || "qr_code" });
                setCamActive(false); stopping = true; stopCamera(); return;
              }
            }
          } catch {}

          try {
            const imported = (await import("jsqr")) as unknown;
            const jsQR: JsqrFn = (typeof imported === "function" ? (imported as JsqrFn) : (imported as { default?: unknown })?.default as JsqrFn);
            const id = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(id.data, id.width, id.height, { inversionAttempts: "attemptBoth" });
            if (code?.data) {
              setResult({ status: "success", value: code.data, format: "qr_code" });
              setCamActive(false); stopping = true; stopCamera(); return;
            }
          } catch {}
        }
        scanRafRef.current = requestAnimationFrame(loop);
      };
      scanRafRef.current = requestAnimationFrame(loop);
      setCamActive(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setCamError(msg);
      stopCamera();
    }
  }, [barcodeSupported, stopCamera]);

  const decodeWithZxing = useCallback(async (f: File) => {
    // Optional stronger fallback using @zxing/browser (if installed)
    // Use eval(import()) to avoid bundlers requiring the module at build time
    const imported = (await (eval("import('@zxing/browser')") as Promise<unknown>).catch(() => null));
    if (!imported) throw new Error("zxing フォールバックが未インストールです。");
    type ZxingResult = { getText?: () => string; text?: string };
    type ZxingReader = {
      decodeFromImageElement?: (img: HTMLImageElement) => Promise<ZxingResult>;
      decodeFromImage?: (img: HTMLImageElement | HTMLCanvasElement) => Promise<ZxingResult>;
      decodeFromCanvas?: (canvas: HTMLCanvasElement) => Promise<ZxingResult>;
    };
    type ZxingReaderCtor = new () => ZxingReader;
    const mod = imported as { BrowserQRCodeReader?: ZxingReaderCtor; BrowserMultiFormatReader?: ZxingReaderCtor };
    const Reader = mod.BrowserQRCodeReader ?? mod.BrowserMultiFormatReader;
    if (!Reader) throw new Error("zxing の読み込みに失敗しました。");
    // TryHarder + format hint if library is available
    let reader: ZxingReader;
    try {
      const lib = (await (eval("import('@zxing/library')") as Promise<{
        Map: typeof Map;
        DecodeHintType?: { TRY_HARDER: unknown; POSSIBLE_FORMATS: unknown };
        BarcodeFormat?: { QR_CODE: unknown };
      }>));
      const hints = new lib.Map<unknown, unknown>();
      if (lib.DecodeHintType && lib.BarcodeFormat) {
        hints.set(lib.DecodeHintType.TRY_HARDER, true);
        hints.set(lib.DecodeHintType.POSSIBLE_FORMATS, [lib.BarcodeFormat.QR_CODE]);
      }
      // Some builds of @zxing/browser readers accept hints via setHints rather than ctor.
      const r = new (Reader as unknown as ZxingReaderCtor)();
      try { (r as unknown as { setHints?: (h: Map<unknown, unknown>) => void }).setHints?.(hints); } catch {}
      reader = r;
    } catch {
      reader = new (Reader as unknown as ZxingReaderCtor)();
    }

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.crossOrigin = "anonymous";
      image.onload = () => resolve(image);
      image.onerror = (err) => reject(err);
      image.src = URL.createObjectURL(f);
    });

    // Prefer decode from image element; retry with downscale if needed
    try {
      const result = await (reader.decodeFromImageElement
        ? reader.decodeFromImageElement(img)
        : reader.decodeFromImage?.(img) ?? Promise.reject(new Error("decodeFromImage が利用できません")));
      const text = result?.getText ? result.getText() : result?.text || "";
      if (!text) throw new Error("検出結果が空でした。");
      setResult({ status: "success", value: text, format: "qr_code" });
      return;
    } catch {
      // Helper to try ZXing on a given region with rotations and simple preprocessing
      const tryRegion = async (region: { sx: number; sy: number; sw: number; sh: number }) => {
        const maxSide = 2000;
        const scale = Math.min(1, maxSide / Math.max(region.sw, region.sh));
        const w0 = Math.max(1, Math.round(region.sw * scale));
        const h0 = Math.max(1, Math.round(region.sh * scale));
        const rotations = [0, 90, 180, 270];
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) throw new Error("Canvas が利用できません。");
        ctx.imageSmoothingEnabled = false;
        for (const deg of rotations) {
          const rad = (deg * Math.PI) / 180;
          const rw = deg % 180 === 0 ? w0 : h0;
          const rh = deg % 180 === 0 ? h0 : w0;
          canvas.width = rw;
          canvas.height = rh;
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          ctx.clearRect(0, 0, rw, rh);
          ctx.translate(rw / 2, rh / 2);
          ctx.rotate(rad);
          ctx.drawImage(img, region.sx, region.sy, region.sw, region.sh, -w0 / 2, -h0 / 2, w0, h0);
          ctx.setTransform(1, 0, 0, 1, 0, 0);
          // direct
          const tryDecode = async () => {
            const res = await (reader.decodeFromCanvas
              ? reader.decodeFromCanvas(canvas)
              : reader.decodeFromImage?.(canvas) ?? Promise.reject(new Error("decodeFromImage が利用できません")));
            const t = res?.getText ? res.getText() : res?.text || "";
            return t as string;
          };
          let text = await tryDecode().catch(() => "");
          if (text) return text;
          // simple binarized variants
          const base = ctx.getImageData(0, 0, rw, rh);
          const variants: ImageData[] = [];
          const makeLocal = (mode: 'luma'|'red'|'redness', inv: boolean, addPad = true) => {
            const copy = new ImageData(new Uint8ClampedArray(base.data), base.width, base.height);
            const d = copy.data; const w = copy.width; const h = copy.height;
            const hist = new Array(256).fill(0);
            for (let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];const L=mode==='redness'?Math.max(0,r-Math.max(g,b)):mode==='red'?r:(r*299+g*587+b*114)/1000;hist[Math.max(0,Math.min(255,L|0))]++;}
            const total=w*h;let sum=0;for(let t=0;t<256;t++)sum+=t*hist[t];let sumB=0,wB=0,varMax=0,thr=127;for(let t=0;t<256;t++){wB+=hist[t];if(!wB)continue;const wF=total-wB;if(!wF)break;sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF;const vb=wB*wF*(mB-mF)*(mB-mF);if(vb>varMax){varMax=vb;thr=t;}}
            for (let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];const L=mode==='redness'?Math.max(0,r-Math.max(g,b)):mode==='red'?r:(r*299+g*587+b*114)/1000;let v=L>thr?255:0;if(inv)v=v?0:255;d[i]=d[i+1]=d[i+2]=v;}
            if (!addPad) return copy;
            const padPx = 24; const can = document.createElement('canvas'); can.width=copy.width+padPx*2; can.height=copy.height+padPx*2; const c=can.getContext('2d'); if(!c) return copy; c.fillStyle='#fff'; c.fillRect(0,0,can.width,can.height); const tmp=document.createElement('canvas'); tmp.width=copy.width; tmp.height=copy.height; (tmp.getContext('2d') as CanvasRenderingContext2D).putImageData(copy,0,0); c.drawImage(tmp,padPx,padPx); return c.getImageData(0,0,can.width,can.height);
          };
          variants.push(makeLocal('redness', false));
          variants.push(makeLocal('redness', true));
          variants.push(makeLocal('red', false));
          for (const v of variants) {
            ctx.canvas.width = v.width; ctx.canvas.height = v.height; ctx.putImageData(v,0,0);
            text = await tryDecode().catch(() => "");
            if (text) return text;
          }
        }
        return "";
      };

      const iw = img.naturalWidth; const ih = img.naturalHeight; const minDim = Math.min(iw, ih);
      const baseSide = Math.round(minDim * (useGuide ? Math.max(0.2, Math.min(1, guideSize)) : 0.8));
      const guideRegion = useGuide
        ? { sx: Math.max(0, Math.round((iw - baseSide) / 2)), sy: Math.max(0, Math.round((ih - baseSide) / 2)), sw: Math.min(baseSide, iw), sh: Math.min(baseSide, ih) }
        : { sx: Math.max(0, Math.round(iw / 2 - baseSide / 2)), sy: Math.max(0, Math.round(ih / 2 - baseSide / 2)), sw: Math.min(baseSide, iw), sh: Math.min(baseSide, ih) };

      // 1) Try full image first (common for uploads)
      let text = await tryRegion({ sx: 0, sy: 0, sw: iw, sh: ih });
      if (text) { setResult({ status: "success", value: text, format: "qr_code" }); return; }
      // 2) Then try guided crop
      text = await tryRegion(guideRegion);
      if (text) { setResult({ status: "success", value: text, format: "qr_code" }); return; }

      throw new Error("QRコードが検出できませんでした（zxing フォールバック）。");
    }
  }, [useGuide, guideSize]);

  const onDecode = useCallback(async () => {
    if (!file) return;
    setResult({ status: "decoding" });
    try {
      if (barcodeSupported) {
        try {
          await decodeWithBarcodeDetector(file);
          return;
        } catch {}
      }
      // Prefer ZXing if available; otherwise jsQR
      try {
        await decodeWithZxing(file);
        return;
      } catch {}
      await decodeWithJsqr(file);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const needInstall = /Cannot find module|Cannot resolve module|resolve/i.test(message);
      const msg = needInstall
        ? "フォールバック用ライブラリ（zxing もしくは jsqr）が未インストールです。必要ならインストール対応します。"
        : message;
      setResult({ status: "error", message: msg });
    }
  }, [file, barcodeSupported, decodeWithBarcodeDetector, decodeWithJsqr, decodeWithZxing]);

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onSelectFile(f);
  }, [onSelectFile]);

  const onDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
  }, []);

  return (
    <div className="min-h-screen p-8 sm:p-12">
      <main className="mx-auto w-full max-w-2xl flex flex-col gap-6">
        <h1 className="text-2xl font-semibold tracking-tight">QR デコーダー</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          画像ファイル（PNG/JPEG/WebP など）のQRコードをブラウザ内でデコードします。
          対応ブラウザでは BarcodeDetector API を使用します。
        </p>

        <div
          onDrop={onDrop}
          onDragOver={onDragOver}
          className="rounded-xl border border-black/10 dark:border-white/15 p-4 sm:p-6 bg-black/[.02] dark:bg-white/[.03]"
        >
          <div className="flex flex-col gap-3">
            <label htmlFor="file" className="text-sm font-medium">
              1. 画像をアップロード
            </label>
            <div className="flex items-center gap-2">
              <input
                id="file"
                ref={inputRef}
                type="file"
                accept="image/*"
                onChange={onChange}
                className="block text-sm"
              />
              {!camActive ? (
                <button
                  type="button"
                  onClick={startCameraScan}
                  className="text-sm px-3 py-1.5 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                >
                  カメラでスキャン
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => { setCamActive(false); stopCamera(); }}
                  className="text-sm px-3 py-1.5 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                >
                  カメラ停止
                </button>
              )}
              {file && (
                <button
                  type="button"
                  onClick={reset}
                  className="text-sm px-3 py-1.5 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                >
                  クリア
                </button>
              )}
            </div>

            <div className="text-xs text-black/60 dark:text-white/60">
              ドラッグ＆ドロップにも対応しています。iOS では HEIC 画像だと読み込めない場合があります。カメラ撮影（JPEG）か PNG/JPEG/WebP をご利用ください。
            </div>

            {previewUrl && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <figure className="rounded-lg overflow-hidden border border-black/10 dark:border-white/15 bg-white/40 dark:bg-black/20">
                  <div ref={previewBoxRef} className="relative w-full aspect-video sm:aspect-square bg-white/40 dark:bg-black/20">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={previewUrl}
                      alt={file?.name || "preview"}
                      className="absolute inset-0 w-full h-full object-contain"
                    />
                    {useGuide && (
                      <div className="absolute inset-0 pointer-events-none">
                        <div
                          className="absolute border-2 border-emerald-500/90 shadow-[0_0_0_9999px_rgba(0,0,0,0.35)] rounded"
                          style={{
                            width: `${Math.round(guideSize * 100)}%`,
                            paddingBottom: `${Math.round(guideSize * 100)}%`,
                            left: `${(1 - guideSize) * 50}%`,
                            top: `${(1 - guideSize) * 50}%`,
                          }}
                        />
                      </div>
                    )}
                  </div>
                  <figcaption className="text-xs p-2 text-black/60 dark:text-white/60">プレビュー（中央ガイド枠）</figcaption>
                </figure>

                <div className="flex flex-col gap-3">
                  {camActive && (
                    <div className="rounded-md overflow-hidden border border-black/10 dark:border-white/15 bg-black/80 relative">
                      <video ref={videoRef} className="w-full h-auto block" playsInline muted autoPlay />
                      {camError && (
                        <div className="absolute inset-x-0 bottom-0 p-2 text-xs text-red-300 bg-black/60">{camError}</div>
                      )}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={onDecode}
                    disabled={!file || result.status === "decoding"}
                    className="px-3 py-2 text-sm rounded-md bg-foreground text-background disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {result.status === "decoding" ? "デコード中…" : "2. 抽出する"}
                  </button>
                  <label className="flex items-center gap-2 text-xs text-black/80 dark:text-white/80">
                    <input type="checkbox" checked={useGuide} onChange={(e) => setUseGuide(e.target.checked)} />
                    ガイド枠で自動クロップして解析
                  </label>
                  <div className="flex items-center gap-2 text-xs text-black/60 dark:text-white/60">
                    <label className="min-w-20">枠サイズ</label>
                    <input
                      type="range"
                      min={30}
                      max={100}
                      value={Math.round(guideSize * 100)}
                      onChange={(e) => setGuideSize(Number(e.target.value) / 100)}
                    />
                    <span className="tabular-nums">{Math.round(guideSize * 100)}%</span>
                  </div>

                  {!barcodeSupported && (
                    <div className="text-xs text-amber-700 dark:text-amber-300">
                      このブラウザでは BarcodeDetector API が無効です。Chrome/Edge での利用を推奨します。
                      もしくはフォールバック用ライブラリ（jsqr）の導入が可能です。
                    </div>
                  )}

                  <div className="rounded-md border border-black/10 dark:border-white/15 p-3 min-h-16 bg-white/60 dark:bg-black/20">
                    {result.status === "idle" && (
                      <span className="text-sm text-black/60 dark:text-white/60">結果はここに表示されます。</span>
                    )}
                    {result.status === "decoding" && (
                      <span className="text-sm">デコード中…</span>
                    )}
                    {result.status === "success" && (
                      <div className="flex flex-col gap-2">
                        <div className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">抽出された文字列</div>
                        <div className="text-sm break-words whitespace-pre-wrap">{result.value}</div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] text-black/50 dark:text-white/50">format: {result.format}</div>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                            onClick={() => navigator.clipboard?.writeText(result.value)}
                          >
                            コピー
                          </button>
                        </div>
                      </div>
                    )}
                    {result.status === "error" && (
                      <div className="text-sm text-red-600 dark:text-red-400">{result.message}</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        <section className="text-xs text-black/60 dark:text-white/60">
          <p className="mb-1 font-medium">動作メモ</p>
          <ul className="list-disc list-inside space-y-1">
            <li>画像はローカルだけで処理され、サーバー送信しません。</li>
            <li>対応ブラウザでは BarcodeDetector API を利用してQRを検出します。</li>
            <li>未対応ブラウザ向けのフォールバック（JSライブラリ）も追加可能です。</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
