export type BarcodeFormat =
  | 'qr_code'
  | 'code_128'
  | 'code_39'
  | 'ean_13'
  | 'ean_8'
  | 'upc_a'
  | 'upc_e'
  | 'itf'
  | 'pdf417'
  | 'data_matrix';

export type Point = { x: number; y: number };

export type BoundingBox = { x: number; y: number; width: number; height: number };

export type DetectedBarcode = {
  rawValue: string;
  format: BarcodeFormat;
  cornerPoints: Point[];
  boundingBox: BoundingBox;
};

export type DetectOptions = { formats?: BarcodeFormat[] };

