import TalentTrustPage from "../../[tenantSlug]/talent/trust/page";

export const dynamic = "force-dynamic";

export default function PlatformTalentTrustPage() {
  return TalentTrustPage({ params: Promise.resolve({}) });
}
