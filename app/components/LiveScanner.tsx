"use client";

import { useCallback } from "react";
import { useBarcodeScan } from "@/detector/useBarcodeScan";

export default function LiveScanner() {
  const { videoRef, start, stop, isRunning, error, lastResult } = useBarcodeScan({
    formats: ["qr_code"],
    fps: 10,
    maxSide: 720,
  });

  const onStart = useCallback(() => void start(), [start]);
  const onStop = useCallback(() => void stop(), [stop]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={isRunning}
          className="text-sm px-3 py-1.5 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        >
          カメラ開始
        </button>
        <button
          type="button"
          onClick={onStop}
          disabled={!isRunning}
          className="text-sm px-3 py-1.5 rounded-md border border-black/10 dark:border-white/15 hover:bg-black/[.04] dark:hover:bg-white/[.06] disabled:opacity-50"
        >
          停止
        </button>
      </div>

      <div className="relative rounded-lg overflow-hidden border border-black/10 dark:border-white/15 bg-black/80">
        <video
          ref={videoRef}
          className="w-full h-auto object-contain"
          playsInline
          muted
          autoPlay
        />
      </div>

      <div className="rounded-md border border-black/10 dark:border-white/15 p-3 min-h-16 bg-white/60 dark:bg-black/20">
        {error ? (
          <div className="text-sm text-red-600 dark:text-red-400">{error}</div>
        ) : lastResult?.length ? (
          <div className="text-sm">
            <div className="text-xs uppercase tracking-wide text-black/60 dark:text-white/60">検出結果（{lastResult.length}）</div>
            <div className="mt-1 break-words whitespace-pre-wrap text-sm">
              {lastResult[0].rawValue}
            </div>
            <div className="text-[11px] text-black/50 dark:text-white/50">format: {lastResult[0].format}</div>
          </div>
        ) : (
          <span className="text-sm text-black/60 dark:text-white/60">検出結果はここに表示されます。</span>
        )}
      </div>
    </div>
  );
}

