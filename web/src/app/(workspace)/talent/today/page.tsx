import { Suspense } from "react";

import { WhatsNewCard } from "@/components/changelog/WhatsNewCard";
import { TalentPageRouteSyncer } from "../_talent-page-route-syncer";

export const dynamic = "force-dynamic";

export default function PlatformTalentTodayPage() {
  return (
    <>
      <TalentPageRouteSyncer page="today" />
      {/* TUL-1395: private dashboard only, streamed so it never blocks Today. */}
      <Suspense fallback={null}>
        <WhatsNewCard kind="talent" />
      </Suspense>
    </>
  );
}
