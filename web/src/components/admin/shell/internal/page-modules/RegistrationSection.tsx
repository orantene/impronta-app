"use client";

/**
 * "Open for registration" — in-dashboard management section.
 *
 * Rendered as an accordion section inside Settings → Roster (WorkspacePageView),
 * so admins manage the registration policy + review join requests without
 * leaving the workspace dashboard. Loads its data client-side via
 * loadRegistrationManageData (the SPA shell has no per-section SSR loader), and
 * reloads after an approve/reject so the queue stays in sync.
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";

import { useAdminShell } from "../state";
import {
  loadRegistrationManageData,
  type RegistrationManageData,
} from "@/app/(workspace)/[tenantSlug]/admin/roster/registration/actions";
import { RegistrationSettingsClient } from "@/components/admin/registration/RegistrationSettingsClient";
import { JoinRequestsList } from "@/components/admin/registration/JoinRequestsList";

export function RegistrationSection() {
  const t = useT();
  const { tenantSlug } = useAdminShell();
  const [data, setData] = useState<RegistrationManageData | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(() => {
    if (!tenantSlug) return;
    setLoading(true);
    loadRegistrationManageData(tenantSlug)
      .then((d) => setData(d))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  useEffect(() => {
    reload();
  }, [reload]);

  const note = (text: string) => (
    <p className="m-0 text-[12.5px] text-admin-ink-muted">{text}</p>
  );

  if (!tenantSlug) return null;
  if (loading && !data) return note(t("dashboard.adminWorkspace.registration.loading"));
  if (!data || !data.ok) {
    return note(
      data && !data.ok ? data.error : t("dashboard.adminWorkspace.registration.loadError"),
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <RegistrationSettingsClient
        tenantSlug={tenantSlug}
        canManage={data.canManage}
        planLabel={data.planLabel}
        allowedModes={data.allowedModes}
        initial={data.settings}
      />
      <JoinRequestsList
        tenantSlug={tenantSlug}
        canManage={data.canManage}
        requests={data.requests}
        onChanged={reload}
      />
    </div>
  );
}
