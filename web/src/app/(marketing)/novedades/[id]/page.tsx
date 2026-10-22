import type { Metadata } from "next";

import { ChangelogEntryPage, changelogEntryMetadata } from "@/components/marketing/changelog/changelog-views";

export const dynamic = "force-dynamic";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  return changelogEntryMetadata(id, "es");
}

export default async function NovedadesEntryRoute({ params }: Props) {
  const { id } = await params;
  return <ChangelogEntryPage id={id} locale="es" />;
}
