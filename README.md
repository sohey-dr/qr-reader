QR and barcode reader that runs entirely in the browser. It decodes images locally and shows the extracted text. Built with Next.js 15 (App Router), React 19, TypeScript, and Tailwind v4. No files are uploaded to any server.

## Features
- High accuracy and speed: combines `jsQR` (fast path) with `zxing-wasm` (WASM) to boost detection rate
- Worker-based: decoding runs in a Web Worker (with graceful fallback) to keep the UI responsive
- Multi-format: supports `qr_code`, plus `code_128`, `code_39`, `ean_13`, `ean_8`, `upc_a`, `upc_e`, `itf`, `pdf417`, `data_matrix` via ZXing
- Private-by-design: all processing happens locally in the browser
- Friendly UI: upload, drag & drop, one-click extraction, copy-to-clipboard
- Live scan (beta): real-time camera scanning (`app/components/LiveScanner.tsx`)

## Quick Start
Requirements: Node.js 20+ (18.18+ works), npm 10+

```bash
# Install dependencies
npm ci

# Start dev server (Turbopack)
npm run dev

# Open http://localhost:3000
```

Verification commands:
```bash
# Lint (Next.js ESLint config)
npm run lint

# Type-check (TS strict)
npx tsc -p tsconfig.json --noEmit

# Production build
npm run build

# Tests (Node Test Runner + ZXing WASM)
npm test
```

## Usage (UI)
1. Upload or drag & drop an image (PNG/JPEG/WebP, etc.).
2. Click “Extract Text” to decode locally and display the result.
3. Use the “Copy” button to copy the decoded text.

Live scan (optional):
- Enable the commented block in `app/page.tsx` to mount `LiveScanner` and scan from the camera.

## Architecture
- `app/page.tsx`: upload/preview/decode UI and result panel
- `app/components/Toast.tsx`: lightweight toast via React context
- `app/components/LiveScanner.tsx`: camera scanning component (beta)
- `detector/`:
  - `index.ts`: public class `MyBarcodeDetector` (worker-backed)
  - `frame.ts`: converts inputs to `ImageData` (downscale/ROI/grayscale)
  - `decodeCore.ts`: core decoding (jsQR → enhancement → ROI grid → ZXing merge)
  - `preprocess.ts`: image enhancement (contrast/unsharp/Otsu)
  - `worker.ts` / `worker_impl.ts`: worker pool and message handling
  - `useBarcodeScan.tsx`: hook for live camera scanning
  - `__tests__/zxing-decode.test.mjs`: Node test using ZXing WASM

## Decode Pipeline
1. `toImageData` downsizes to 720px max side, applies grayscale/ROI if needed, and keeps a `scale` factor
2. Full-frame `jsQR` (fast path); if none, enhanced pass (contrast/unsharp/Otsu)
3. ROI grid scan to catch small or off-center codes
4. Merge additional results from `zxing-wasm` (also used for non-QR formats)
5. Non‑maximum suppression by IoU and value; prefer larger boxes
6. Normalize coordinates back to the original scale on return

## API (quick)
`MyBarcodeDetector` is a browser‑API‑independent detector.

```ts
import { MyBarcodeDetector, type DetectedBarcode } from "@/detector";

// Query supported formats
await MyBarcodeDetector.getSupportedFormats();

// Create an instance (e.g. QR only)
const detector = new MyBarcodeDetector({ formats: ["qr_code"] });

// Accepts HTMLImage/Canvas/Video, ImageBitmap, ImageData, or Blob
const results: DetectedBarcode[] = await detector.detect(fileOrImageData);

// Result item
// { rawValue: string, format: "qr_code" | ..., cornerPoints: {x,y}[], boundingBox: {x,y,width,height} }
```

If Workers are unavailable, decoding falls back to the main thread. In SSR (Node) environments, heavy work is avoided and an empty array is returned.

## Environment & Config
- Dependencies: `jsqr`, `zxing-wasm` (WASM is imported dynamically at runtime)
- `next.config.ts`: `allowedDevOrigins` is used for local dev origins
- `app/layout.tsx`: reads `GOOGLE_SITE_VERIFICATION` into a `<meta>` tag (optional)
- Import alias: `@/*` (see `tsconfig.json`)

## Security & Privacy
- Images are processed locally in the browser and never uploaded.
- No secrets required (`.env` not needed).
- Worker offloading and dynamic imports help keep the bundle responsive and lean.

## Tests
Uses Node’s built‑in test runner with ZXing WASM (Node 18.18+ recommended, 20+ preferred).

```bash
npm test
```

The first run may take a few seconds due to WASM initialization. If it fails, remove `node_modules` and run `npm ci` again.

## Contributing
- Conventions: TypeScript strict, 2‑space indent, double quotes, PascalCase components, `@/*` imports
- Commits: Conventional Commits (e.g. `feat(app): add jsqr fallback`, `fix(ui): handle missing BarcodeDetector`)
- Workflow: `npm run dev` → change → `npm run lint && npx tsc --noEmit && npm run build`
- Tests: Prefer unit tests (Vitest) and E2E (Playwright) when adding features

For onboarding and improvement ideas, see `docs/ONBOARDING.md` and `AGENTS.md`.

## License
See `LICENSE` for details.

## Troubleshooting
- Dependency issues: run `npm ci`
- WASM load failures: update to Node 18.18+ / 20+, then `npm ci`
- Slow or inconsistent results: try smaller images; lower `maxSide` in `toImageData`
- Camera permission errors: allow camera access; use `https` or `localhost`
