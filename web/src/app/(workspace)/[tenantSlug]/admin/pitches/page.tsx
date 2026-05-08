/**
 * Phase 9 — Pitches surface route stub.
 *
 * Cutover-mode bridge: data is fetched in `admin/layout.tsx` and passed
 * through `initialBridgeData.pitches`; the prototype shell's PageRouter
 * renders `<PitchesPage />` from `_pages.tsx` when page state === "pitches".
 *
 * This stub mounts <PageRouteSyncer> which returns null but tells the
 * shell to switch its page state to "pitches" on hard refresh.
 */
import { PageRouteSyncer } from "../_page-route-syncer";

export const dynamic = "force-dynamic";

export default function AdminPitchesPage() {
  return <PageRouteSyncer page="pitches" />;
}
