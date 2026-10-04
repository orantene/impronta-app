import { redirectLegacyTalentPath } from "@/lib/talent/legacy-talent-redirect";

export const dynamic = "force-dynamic";

export default async function LegacyTalentAttentionPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectLegacyTalentPath("attention", searchParams);
}
