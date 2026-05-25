import { redirect } from "next/navigation";

import { buildQuerySuffix } from "@/lib/saas/redirect-query";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string; id: string }>;
type SearchParams = Promise<Record<string, string | string[] | undefined>> | undefined;

export default async function LegacyTalentInboxThreadPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams?: SearchParams;
}) {
  const { id } = await params;
  const sp = (await searchParams) ?? {};
  const querySuffix = buildQuerySuffix(sp);
  redirect(`/talent/inbox/${encodeURIComponent(id)}${querySuffix}`);
}
