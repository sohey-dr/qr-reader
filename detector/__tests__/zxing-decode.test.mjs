import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { prepareZXingModule, readBarcodes } from 'zxing-wasm/reader';

const wasmUrl = new URL('../../node_modules/zxing-wasm/dist/reader/zxing_reader.wasm', import.meta.url);
const wasmPath = fileURLToPath(wasmUrl);
const wasmBinary = readFileSync(wasmPath);

await prepareZXingModule({
  fireImmediately: true,
  overrides: { wasmBinary },
});

test('ZXing decodes the provided PNG (qr_code)', async () => {
  const imagePath = path.resolve(process.cwd(), 'image.png');
  const bytes = readFileSync(imagePath);

  const results = await readBarcodes(bytes, { formats: ['QRCode'], tryHarder: true });
  assert.ok(results.length > 0, 'should detect at least one code');
  const first = results[0];
  assert.equal(first.format, 'QRCode');
  assert.ok(first.text?.length || first.rawValue?.length, 'raw value should not be empty');
});
