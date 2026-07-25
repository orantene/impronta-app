// ---------------------------------------------------------------------------
// Intercepted /t/[profileCode] — directory quick-open profile modal.
//
// A soft (client-side) navigation to /t/<code> from anywhere in the app is
// intercepted here and rendered as a full-screen overlay on top of the
// current page. The address bar shows the REAL profile URL, so analytics,
// deep links, and the back button all behave exactly like a page visit.
// Hard navigations (refresh, direct link, crawlers) never hit this route —
// they render the canonical src/app/t/[profileCode]/page.tsx.
// ---------------------------------------------------------------------------

import { pickLocale } from "@/lib/i18n/pick-locale";
import { getRequestLocale } from "@/i18n/request-locale";
import {
  TalentProfileView,
  type TalentProfileSearchParams,
} from "@/app/t/[profileCode]/profile-view";

import { ProfileModalShell } from "./profile-modal-shell";

// Same freshness contract as the canonical profile route.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

export default async function InterceptedTalentProfileModal({
  params,
  searchParams,
}: {
  params: Promise<{ profileCode: string }>;
  searchParams: Promise<TalentProfileSearchParams>;
}) {
  const { profileCode } = await params;
  const sp = await searchParams;
  const locale = await getRequestLocale();

  return (
    <ProfileModalShell
      profileCode={profileCode}
      openFullPageLabel={pickLocale(locale, {
        en: "Open full page",
        es: "Abrir página completa",
      })}
      closeLabel={pickLocale(locale, { en: "Close", es: "Cerrar" })}
    >
      <TalentProfileView profileCode={profileCode} sp={sp} variant="modal" />
    </ProfileModalShell>
  );
}
