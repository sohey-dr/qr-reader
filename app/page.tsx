"use client";

import { useCallback, useMemo, useRef, useState } from "react";

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

type JsqrFn = (
  data: Uint8ClampedArray,
  width: number,
  height: number
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

  const decodeWithBarcodeDetector = useCallback(async (f: File) => {
    setResult({ status: "decoding" });
    try {
      const BD = (window as Window & { BarcodeDetector?: BarcodeDetectorStatic }).BarcodeDetector;
      if (!BD) throw new Error("BarcodeDetector API not available");

      const formats: string[] = (await BD.getSupportedFormats?.()) || [];
      const canQR = formats.includes("qr_code") || formats.includes("qr");
      const detector = new BD({ formats: canQR ? ["qr_code"] : undefined });

      // Prefer ImageBitmap for performance
      let source: ImageBitmap | HTMLImageElement;
      if ("createImageBitmap" in window) {
        source = await createImageBitmap(f);
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
      const message = err instanceof Error ? err.message : String(err);
      setResult({ status: "error", message });
    }
  }, []);

  const onDecode = useCallback(async () => {
    if (!file) return;
    if (barcodeSupported) {
      await decodeWithBarcodeDetector(file);
      return;
    }
    // Fallback: try jsQR dynamically if available
    setResult({ status: "decoding" });
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = (err) => reject(err);
        image.src = URL.createObjectURL(file);
      });

      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas が利用できません。");
      ctx.drawImage(img, 0, 0);
      const { data, width, height } = ctx.getImageData(0, 0, canvas.width, canvas.height);

      // Dynamically import jsqr if installed
      const imported = (await import("jsqr")) as unknown;
      const jsQR: JsqrFn = (typeof imported === "function"
        ? (imported as JsqrFn)
        : (imported as { default?: unknown })?.default as JsqrFn);
      if (typeof jsQR !== "function") throw new Error("jsqr の読み込みに失敗しました。");
      const code = jsQR(data, width, height);
      if (!code?.data) throw new Error("QRコードが検出できませんでした（フォールバック）。");
      setResult({ status: "success", value: code.data, format: "qr_code" });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      const needInstall = /Cannot find module|Cannot resolve module|resolve/i.test(message);
      const msg = needInstall
        ? "フォールバック用ライブラリ(jsqr)が未インストールです。必要ならインストール対応します。"
        : message;
      setResult({ status: "error", message: msg });
    }
  }, [file, barcodeSupported, decodeWithBarcodeDetector]);

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
              ドラッグ＆ドロップにも対応しています。
            </div>

            {previewUrl && (
              <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-4 items-start">
                <figure className="rounded-lg overflow-hidden border border-black/10 dark:border-white/15 bg-white/40 dark:bg-black/20">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={previewUrl}
                    alt={file?.name || "preview"}
                    className="w-full h-auto object-contain"
                  />
                  <figcaption className="text-xs p-2 text-black/60 dark:text-white/60">
                    プレビュー
                  </figcaption>
                </figure>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={onDecode}
                    disabled={!file || result.status === "decoding"}
                    className="px-3 py-2 text-sm rounded-md bg-foreground text-background disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {result.status === "decoding" ? "デコード中…" : "2. デコードする"}
                  </button>

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
