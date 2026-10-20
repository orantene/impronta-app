import type { Metadata } from "next";

import { ChangelogEntryPage, changelogEntryMetadata } from "@/components/marketing/changelog/changelog-views";
import { getRequestLocale } from "@/i18n/request-locale";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  return changelogEntryMetadata(id, locale);
}

export default async function ChangelogEntryRoute({ params }: Props) {
  const { id } = await params;
  const locale = (await getRequestLocale()) === "es" ? "es" : "en";
  return <ChangelogEntryPage id={id} locale={locale} />;
}
