import { redirectLegacyTalentPath } from "@/lib/talent/legacy-talent-redirect";

export default async function LegacyTalentActivityPage() {
  await redirectLegacyTalentPath("settings");
}
