import { NextResponse, type NextRequest } from "next/server";
import { defaultLocale, isLocale } from "./i18n/config";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Ignore next internals and assets
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/favicon")
  ) {
    return NextResponse.next();
  }

  const segments = pathname.split("/").filter(Boolean);
  const maybeLocale = segments[0];

  if (isLocale(maybeLocale)) {
    const res = NextResponse.next();
    // Keep cookie in sync when user navigates directly to a locale path
    res.cookies.set("NEXT_LOCALE", maybeLocale, { path: "/" });
    return res;
  }

  // Redirect to default locale-prefixed path
  const url = request.nextUrl.clone();
  url.pathname = `/${defaultLocale}${pathname}`;
  const res = NextResponse.redirect(url);
  res.cookies.set("NEXT_LOCALE", defaultLocale, { path: "/" });
  return res;
}

export const config = {
  matcher: ["/((?!_next|.*\\..*|api).*)"],
};
