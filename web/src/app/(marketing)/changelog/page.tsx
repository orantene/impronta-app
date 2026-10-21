import type { Metadata } from "next";

import { ChangelogIndex, changelogIndexMetadata } from "@/components/marketing/changelog/changelog-views";
import { getRequestLocale } from "@/i18n/request-locale";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ category?: string }> };

export async function generateMetadata(): Promise<Metadata> {
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  return changelogIndexMetadata(locale);
}

export default async function ChangelogPage({ searchParams }: Props) {
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  const { category } = await searchParams;
  return <ChangelogIndex locale={locale} category={category?.trim() || null} />;
}
