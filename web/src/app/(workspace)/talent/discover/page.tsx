import TalentDiscoverPage from "../../[tenantSlug]/talent/discover/page";

export const dynamic = "force-dynamic";

export default function PlatformTalentDiscoverPage() {
  return TalentDiscoverPage({ params: Promise.resolve({}) });
}
