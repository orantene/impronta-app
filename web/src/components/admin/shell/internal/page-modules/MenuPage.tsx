"use client";

/**
 * Workspace Menu page — catalogue of workspace-owned sellable items.
 * Reuses TalentOfferingsManager parameterized with OfferingOwner.workspace.
 */

import { useAdminShell } from "../state";
import { TalentOfferingsManager } from "@/components/talent/services/TalentOfferingsManager";
import { MenuImportPanel } from "./MenuImportPanel";
import { useT } from "@/i18n/use-t";

export function MenuPage() {
  const { bridgeTenantIdentity } = useAdminShell();
  const t = useT();
  const tenantId = bridgeTenantIdentity?.tenantId ?? null;

  if (!tenantId) {
    return (
      <div className="p-6 text-sm text-black/60">
        {t("dashboard.adminMenu.noTenant")}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 sm:p-6">
      <h1 className="mb-1 text-xl font-semibold tracking-tight text-black">
        {t("dashboard.adminMenu.title")}
      </h1>
      <p className="mb-5 text-sm text-black/60">
        {t("dashboard.adminMenu.subtitle")}
      </p>
      <MenuImportPanel tenantId={tenantId} />
      <TalentOfferingsManager owner={{ kind: "workspace", tenantId }} />
    </div>
  );
}
