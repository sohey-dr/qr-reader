QR 画像をアップロードしてブラウザ内でデコードし、結果文字列を表示する Web アプリです。ベースは [Next.js](https://nextjs.org)（App Router）です。

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Usage

- 画像ファイル（PNG/JPEG/WebPなど）をアップロード、またはドラッグ＆ドロップします。
- 対応ブラウザでは BarcodeDetector API を使ってローカルでデコードします（サーバー送信なし）。
- 未対応ブラウザではフォールバック用のライブラリ（`html5-qrcode` または `jsqr`）を使用できます（要インストール）。

### Optional fallbacks

- `html5-qrcode`: 画像ファイルを `scanFile` でデコードするフォールバック。BarcodeDetector が失敗/未対応の際に自動的に試行します。
- `jsqr`: Canvas ピクセルからの直接デコードによるフォールバック。`html5-qrcode` が見つからない/失敗した場合に試行します。

インストール例:

```bash
npm i html5-qrcode jsqr
```

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
