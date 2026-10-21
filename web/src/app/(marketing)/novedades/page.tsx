import type { Metadata } from "next";

import { ChangelogIndex, changelogIndexMetadata } from "@/components/marketing/changelog/changelog-views";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ category?: string }> };

/** Spanish-slugged twin of /changelog: always Spanish. */
export async function generateMetadata(): Promise<Metadata> {
  return changelogIndexMetadata("es");
}

export default async function NovedadesPage({ searchParams }: Props) {
  const { category } = await searchParams;
  return <ChangelogIndex locale="es" category={category?.trim() || null} />;
}
