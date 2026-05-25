import { redirectLegacyTalentPath } from "@/lib/talent/legacy-talent-redirect";

export default async function LegacyTalentReachPage() {
  await redirectLegacyTalentPath("agencies");
}
