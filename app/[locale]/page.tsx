import type { Metadata } from "next";
import { getDictionary } from "@/i18n/dictionaries";
import { locales, type Locale } from "@/i18n/config";
import HomeClient from "./HomeClient";

type PageProps = {
  params: Promise<{ locale: Locale }>;
};

export async function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  return {
    title: dict.title,
    description: dict.description,
  };
}

export default async function Page({ params }: PageProps) {
  const { locale } = await params;
  const dict = await getDictionary(locale);
  return <HomeClient dict={dict} locale={locale} />;
}
