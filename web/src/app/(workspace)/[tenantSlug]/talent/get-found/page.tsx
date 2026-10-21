import { redirectLegacyTalentPath } from "@/lib/talent/legacy-talent-redirect";

export const dynamic = "force-dynamic";

export default async function LegacyTalentGetFoundPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await redirectLegacyTalentPath("get-found", searchParams);
}
