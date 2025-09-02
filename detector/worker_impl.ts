// Worker implementation: handles init + detect messages and calls decode core.
// Typed loosely to avoid requiring the `webworker` lib in tsconfig.

import { decodeMultiFormat } from './decodeCore';

type InitMsg = { type: 'init'; id: string };
type DetectMsg = { type: 'detect'; id: string; imageData: ImageData; opts: { formats: string[] } };
type InMsg = InitMsg | DetectMsg;

let ready = false;

self.onmessage = async (e: MessageEvent<InMsg>) => {
  const { data } = e;
  const { id, type } = data as any;
  try {
    if (type === 'init') {
      // Place for WASM/decoder init if needed later
      ready = true;
      (self as any).postMessage({ id, ok: true, result: true });
      return;
    }
    if (type === 'detect') {
      if (!ready) throw new Error('not ready');
      const { imageData, opts } = data as DetectMsg;
      const result = await decodeMultiFormat(imageData, opts);
      (self as any).postMessage({ id, ok: true, result });
      return;
    }
  } catch (err) {
    (self as any).postMessage({ id, ok: false, error: String(err) });
  }
};

