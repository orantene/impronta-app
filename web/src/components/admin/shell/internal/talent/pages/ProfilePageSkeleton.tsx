"use client";

import { useDashboardText } from "../../dashboard-i18n";

/**
 * TUL-220: shown while the Profile page chunk loads. The dynamic import used to
 * render `null`, so a slow chunk (or a client re-render after a discarded
 * server tree) left the content area empty with no sign of life.
 */
export function ProfilePageSkeleton() {
  const copy = useDashboardText();
  return (
    <div role="status" aria-busy="true" aria-label={copy.t("Loading")} data-testid="profile-page-skeleton" className="flex flex-col gap-4">
      <div className="h-7 w-48 rounded-md bg-admin-surface-alt" />
      <div className="h-24 rounded-2xl bg-admin-surface-alt opacity-60" />
      <div className="h-56 rounded-2xl bg-admin-surface-alt opacity-40" />
    </div>
  );
}
