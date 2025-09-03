"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { locales, type Locale } from "@/i18n/config";

function replaceLocaleInPath(pathname: string, next: Locale): string {
  const parts = pathname.split("/");
  // parts[0] is empty string because pathname starts with '/'
  if (parts.length > 1) {
    parts[1] = next;
  }
  return parts.join("/");
}

export default function LanguageSwitcher() {
  const pathname = usePathname();
  if (!pathname) return null;

  return (
    <div className="ml-auto flex items-center gap-2 text-xs">
      {locales.map((l) => (
        <Link
          key={l}
          href={replaceLocaleInPath(pathname, l)}
          prefetch
          className="rounded border border-black/10 dark:border-white/15 px-2 py-1 hover:bg-black/[.04] dark:hover:bg-white/[.06]"
        >
          {l === "ja" ? "日本語" : l === "en" ? "English" : "한국어"}
        </Link>
      ))}
    </div>
  );
}

