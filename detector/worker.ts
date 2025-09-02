// Worker façade used by the main thread to initialize and send work.

type WorkerRec = { w: Worker };

let pool: WorkerRec[] = [];
let rr = 0;

function ensurePool(size: number): WorkerRec[] {
  if (pool.length >= size) return pool;
  const missing = size - pool.length;
  for (let i = 0; i < missing; i++) {
    const w = new Worker(new URL('./worker_impl.ts', import.meta.url), { type: 'module' });
    pool.push({ w });
  }
  return pool;
}

export async function initWorkerPool(size?: number): Promise<void> {
  const defaultSize = Math.max(1, Math.min(4, typeof navigator !== 'undefined' ? (navigator as any).hardwareConcurrency || 2 : 1));
  const n = size ?? defaultSize;
  ensurePool(n);
  await Promise.all(pool.map((rec) => ask<boolean>(rec.w, { type: 'init' })));
}

export function detectInWorker(
  imageData: ImageData,
  opts: { formats: string[] }
): Promise<any[]> {
  if (!pool.length) ensurePool(1);
  const rec = pool[(rr = (rr + 1) % pool.length)];
  return ask<any[]>(rec.w, { type: 'detect', imageData, opts });
}

function ask<T>(w: Worker, msg: any): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const id = Math.random().toString(36).slice(2);
    const onMessage = (e: MessageEvent) => {
      const d = (e as MessageEvent<any>).data;
      if (!d || d.id !== id) return;
      w.removeEventListener('message', onMessage as any);
      if (d.ok) resolve(d.result as T);
      else reject(new Error(String(d.error ?? 'Unknown worker error')));
    };
    w.addEventListener('message', onMessage as any);
    w.postMessage({ ...msg, id });
  });
}
