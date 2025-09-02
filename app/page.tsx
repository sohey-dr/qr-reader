"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { MyBarcodeDetector } from "@/detector";
import { useToast } from "@/app/components/Toast";

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
  const { show } = useToast();

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

  // Our custom detector instance (worker-backed, QR: jsQR + ZXing フォールバック)
  const detector = useMemo(() => new MyBarcodeDetector({ formats: ["qr_code"] }), []);

  const onDecode = useCallback(async () => {
    if (!file) return;
    setResult({ status: "decoding" });

    try {
      const results = await detector.detect(file);
      if (!results?.length) throw new Error("QRコードが検出できませんでした。");
      const first = results[0];
      setResult({ status: "success", value: first.rawValue, format: first.format });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setResult({ status: "error", message });
    }
  }, [file, detector]);

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
        <h1 className="text-2xl font-semibold tracking-tight">QRリーダー</h1>
        <p className="text-sm text-black/60 dark:text-white/60">
          画像ファイル（PNG/JPEG/WebP
          など）のQRコードをブラウザ内でデコードし、抽出された文字列を表示します。
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
            </div>

            {file && (
              <button
                type="button"
                onClick={reset}
                className="text-sm px-3 py-1.5 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
              >
                クリア
              </button>
            )}

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
                    {result.status === "decoding"
                      ? "デコード中…"
                      : "2. 文字列を抽出する"}
                  </button>

                  {/* Uses a custom worker-based detector; no browser API dependency */}

                  <div className="rounded-md border border-black/10 dark:border-white/15 p-3 min-h-16 bg-white/60 dark:bg-black/20">
                    {result.status === "idle" && (
                      <span className="text-sm text-black/60 dark:text-white/60">
                        結果はここに表示されます。
                      </span>
                    )}
                    {result.status === "decoding" && (
                      <span className="text-sm">デコード中…</span>
                    )}
                    {result.status === "success" && (
                      <div className="flex flex-col gap-2">
                        <div className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">
                          抽出された文字列
                        </div>
                        <div className="text-sm break-words whitespace-pre-wrap">
                          {result.value}
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] text-black/50 dark:text-white/50">
                            format: {result.format}
                          </div>
                          <button
                            type="button"
                            className="text-xs px-2 py-1 rounded border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
                            onClick={async () => {
                              try {
                                if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
                                  await navigator.clipboard.writeText(result.value);
                                  show("コピーしました");
                                } else {
                                  show("クリップボードを使用できません");
                                }
                              } catch {
                                show("コピーに失敗しました");
                              }
                            }}
                          >
                            コピー
                          </button>
                        </div>
                      </div>
                    )}
                    {result.status === "error" && (
                      <div className="text-sm text-red-600 dark:text-red-400">
                        {result.message}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* <section className="rounded-xl border border-black/10 dark:border-white/15 p-4 sm:p-6 bg-black/[.02] dark:bg-white/[.03]">
          <h2 className="text-sm font-medium mb-3">カメラスキャン（ベータ）</h2>
          {(() => {
            const LiveScanner = dynamic(() => import("./components/LiveScanner"), { ssr: false });
            return <LiveScanner />;
          })()}
        </section> */}

        <section className="text-xs text-black/60 dark:text-white/60">
          <p className="mb-1 font-medium">動作メモ</p>
          <ul className="list-disc list-inside space-y-1">
            <li>画像はローカルだけで処理され、サーバー送信しません。</li>
          </ul>
        </section>
      </main>
    </div>
  );
}
