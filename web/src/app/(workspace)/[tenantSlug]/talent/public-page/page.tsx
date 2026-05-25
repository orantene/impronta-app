import { redirectLegacyTalentPath } from "@/lib/talent/legacy-talent-redirect";

export default async function LegacyTalentPublicPageAlias() {
  await redirectLegacyTalentPath("site");
}
