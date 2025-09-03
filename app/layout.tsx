import type { Metadata } from "next";
import { cookies } from "next/headers";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";
import Providers from "./providers";
import { isLocale } from "@/i18n/config";

export const metadata: Metadata = {
  title: "QR Reader",
  description:
    "QRコードをブラウザ内でデコードし、文字列を取り出します。Decode QR codes from images in your browser.",
  icons: {
    icon: "/favicon.ico",
  },
  openGraph: {
    title: "QR Reader",
    description:
      "QRコードをブラウザ内でデコードし、文字列を取り出します。Decode QR codes from images in your browser.",
    images: "/favicon.ico",
  },
  twitter: {
    title: "QR Reader",
    description:
      "QRコードをブラウザ内でデコードし、文字列を取り出します。Decode QR codes from images in your browser.",
    images: "/favicon.ico",
  },
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const fromCookie = cookieStore.get("NEXT_LOCALE")?.value;
  const lang = isLocale(fromCookie) ? fromCookie : "ja";
  return (
    <html lang={lang}>
      <head>
        <meta
          name="google-site-verification"
          content={process.env.GOOGLE_SITE_VERIFICATION}
        />
        <GoogleAnalytics gaId="G-ZKN8P3KR1R" />
      </head>
      <body className={`antialiased`}>
        <Analytics />
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
