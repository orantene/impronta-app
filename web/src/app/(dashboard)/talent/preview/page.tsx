import { redirect } from "next/navigation";
import { TalentDashboardLoadFallback } from "@/components/dashboard/dashboard-load-fallback";
import { loadTalentDashboardData } from "@/lib/talent-dashboard-data";

/** Legacy route: sidebar Preview now links straight to `/t/[profileCode]?preview=1` (or live URL). */
export default async function TalentPreviewPage() {
  const result = await loadTalentDashboardData();
  if (!result.ok) return <TalentDashboardLoadFallback reason={result.reason} />;
  redirect(result.data.previewHref);
}
