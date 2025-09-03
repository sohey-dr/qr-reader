import type { Locale } from "./config";

export type Dictionary = {
  title: string;
  description: string;
  intro: {
    line1: string;
    line2: string;
  };
  uploadLabel: string; // includes leading step number
  clear: string;
  preview: string;
  decodeButton: {
    idle: string; // includes leading step number
    decoding: string;
  };
  result: {
    placeholder: string;
    extractedLabel: string;
    formatLabel: string; // label without colon
  };
  actions: {
    copy: string;
    openUrl: string;
    openUrlAria: string;
  };
  errors: {
    noQr: string;
  };
  toasts: {
    copied: string;
    clipboardUnavailable: string;
    copyFailed: string;
  };
  footnote: string;
};

const ja: Dictionary = {
  title: "QRリーダー",
  description: "QRコードを読み取り、文字列を取り出します。",
  intro: {
    line1:
      "画像ファイル（PNG/JPEG/WebP など）のQRコードをブラウザ内でデコードし、抽出された文字列を表示します。",
    line2: "画像はブラウザ内で処理され、サーバー送信しません。",
  },
  uploadLabel: "1. 画像をアップロード",
  clear: "クリア",
  preview: "プレビュー",
  decodeButton: {
    idle: "2. 文字列を抽出する",
    decoding: "デコード中…",
  },
  result: {
    placeholder: "結果はここに表示されます。",
    extractedLabel: "抽出された文字列",
    formatLabel: "format",
  },
  actions: {
    copy: "コピー",
    openUrl: "URLを開く",
    openUrlAria: "URLを新しいタブで開く",
  },
  errors: {
    noQr: "QRコードが検出できませんでした。",
  },
  toasts: {
    copied: "コピーしました",
    clipboardUnavailable: "クリップボードを使用できません",
    copyFailed: "コピーに失敗しました",
  },
  footnote: "QRコードは株式会社デンソーウェーブの登録商標です",
};

const en: Dictionary = {
  title: "QR Reader",
  description: "Decode QR codes from images in your browser.",
  intro: {
    line1:
      "Decode QR codes from image files (PNG/JPEG/WebP, etc.) entirely in your browser and display the extracted text.",
    line2: "Images are processed locally and never uploaded to a server.",
  },
  uploadLabel: "1. Upload an image",
  clear: "Clear",
  preview: "Preview",
  decodeButton: {
    idle: "2. Extract text",
    decoding: "Decoding…",
  },
  result: {
    placeholder: "The result will appear here.",
    extractedLabel: "Extracted text",
    formatLabel: "format",
  },
  actions: {
    copy: "Copy",
    openUrl: "Open URL",
    openUrlAria: "Open URL in a new tab",
  },
  errors: {
    noQr: "No QR code detected.",
  },
  toasts: {
    copied: "Copied",
    clipboardUnavailable: "Clipboard unavailable",
    copyFailed: "Copy failed",
  },
  footnote: "QR Code is a registered trademark of DENSO WAVE.",
};

const ko: Dictionary = {
  title: "QR 리더",
  description: "이미지에서 QR 코드를 브라우저에서 디코딩합니다.",
  intro: {
    line1:
      "이미지 파일(PNG/JPEG/WebP 등)의 QR 코드를 브라우저에서 디코딩하여 추출된 문자열을 표시합니다.",
    line2: "이미지는 브라우저에서만 처리되며 서버로 업로드되지 않습니다.",
  },
  uploadLabel: "1. 이미지 업로드",
  clear: "지우기",
  preview: "미리보기",
  decodeButton: {
    idle: "2. 문자열 추출",
    decoding: "디코딩 중…",
  },
  result: {
    placeholder: "결과가 여기에 표시됩니다.",
    extractedLabel: "추출된 문자열",
    formatLabel: "format",
  },
  actions: {
    copy: "복사",
    openUrl: "URL 열기",
    openUrlAria: "새 탭에서 URL 열기",
  },
  errors: {
    noQr: "QR 코드를 감지하지 못했습니다.",
  },
  toasts: {
    copied: "복사했습니다",
    clipboardUnavailable: "클립보드를 사용할 수 없습니다",
    copyFailed: "복사 실패",
  },
  footnote: "QR 코드는 DENSO WAVE의 등록상표입니다.",
};

export async function getDictionary(locale: Locale): Promise<Dictionary> {
  // Return statically at build-time (no network access)
  switch (locale) {
    case "en":
      return en;
    case "ko":
      return ko;
    case "ja":
    default:
      return ja;
  }
}

