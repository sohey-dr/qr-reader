export const locales = ["ja", "en", "ko"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "ja";

export function isLocale(x: string | undefined | null): x is Locale {
  return !!x && (locales as readonly string[]).includes(x);
}

