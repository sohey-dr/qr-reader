import type { Metadata } from "next";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "QRリーダー",
  description: "QRリーダー",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <head>
        <GoogleAnalytics gaId="G-ZKN8P3KR1R" />
      </head>
      <body className={`antialiased`}>
        <Analytics />
        {children}
      </body>
    </html>
  );
}
