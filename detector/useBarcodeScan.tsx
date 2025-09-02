"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MyBarcodeDetector } from './index';
import type { BarcodeFormat, DetectedBarcode } from './types';
import { toImageData } from './frame';
import { detectInWorker, initWorkerPool } from './worker';

export type UseBarcodeScanOptions = {
  formats?: BarcodeFormat[];
  fps?: number; // target decode FPS (throttled)
  maxSide?: number; // scale down long edge
  grayscale?: boolean;
  roi?: { x: number; y: number; width: number; height: number; normalized?: boolean };
  onResult?: (barcodes: DetectedBarcode[]) => void;
};

export function useBarcodeScan(opts: UseBarcodeScanOptions = {}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<DetectedBarcode[] | null>(null);

  const fps = opts.fps ?? 10;
  const formats = opts.formats ?? (['qr_code'] as BarcodeFormat[]);
  const maxSide = opts.maxSide ?? 720;
  const grayscale = opts.grayscale ?? false;

  const detector = useMemo(() => new MyBarcodeDetector({ formats }), [formats.join(',')]);

  // Media start/stop
  const start = useCallback(async () => {
    try {
      setError(null);
      const v = videoRef.current;
      if (!v) throw new Error('video element not ready');
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
        audio: false,
      });
      v.srcObject = stream;
      // iOS/Safari compatibility
      v.playsInline = true as any;
      v.muted = true;
      await v.play();
      setIsRunning(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  const stop = useCallback(async () => {
    const v = videoRef.current;
    if (v?.srcObject) {
      (v.srcObject as MediaStream).getTracks().forEach((t) => t.stop());
      v.srcObject = null;
    }
    setIsRunning(false);
  }, []);

  // Decode loop
  useEffect(() => {
    if (!isRunning) return;
    let raf = 0;
    let lastTs = 0;
    let busy = false;
    let cancelled = false;

    const tick = async (ts: number) => {
      if (cancelled) return;
      raf = requestAnimationFrame(tick);
      const interval = 1000 / fps;
      if (ts - lastTs < interval || busy) return;
      lastTs = ts;
      busy = true;
      try {
        const v = videoRef.current!;
        // If ROI is provided, shortcut via internal pipeline
        let barcodes: DetectedBarcode[] = [];
        if (opts.roi) {
          await initWorkerPool();
          const bmp = await getBitmapFrame(v);
          const input: HTMLVideoElement | ImageBitmap = bmp || v;
          const { imageData, scale } = await toImageData(input as any, { maxSide, grayscale, roi: opts.roi });
          const results = await detectInWorker(imageData, { formats: formats as string[] });
          barcodes = results.map((r) => ({
            ...r,
            boundingBox: {
              x: r.boundingBox.x / scale,
              y: r.boundingBox.y / scale,
              width: r.boundingBox.width / scale,
              height: r.boundingBox.height / scale,
            },
            cornerPoints: r.cornerPoints.map((p: any) => ({ x: p.x / scale, y: p.y / scale })),
          }));
        } else {
          barcodes = await detector.detect(v);
        }
        if (cancelled) return;
        if (barcodes.length) {
          setLastResult(barcodes);
          opts.onResult?.(barcodes);
        }
      } catch (err) {
        // Soft-fail; keep scanning
        if (!cancelled) setError((err as any)?.message ?? String(err));
      } finally {
        busy = false;
      }
    };

    raf = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      if (raf) cancelAnimationFrame(raf);
    };
  }, [isRunning, fps, detector, opts.roi, maxSide, grayscale, formats.join(',')]);

  async function getBitmapFrame(video: HTMLVideoElement): Promise<ImageBitmap | null> {
    try {
      // Prefer ImageCapture if available
      const anyWin = window as any;
      const stream = video.srcObject as MediaStream | null;
      if (stream && anyWin.ImageCapture) {
        const track = stream.getVideoTracks?.()[0];
        if (track) {
          const cap = new anyWin.ImageCapture(track);
          const frame = await cap.grabFrame();
          return frame as ImageBitmap;
        }
      }
      if ('createImageBitmap' in window) {
        return await createImageBitmap(video);
      }
    } catch {}
    return null;
  }

  return { videoRef, start, stop, isRunning, error, lastResult } as const;
}
