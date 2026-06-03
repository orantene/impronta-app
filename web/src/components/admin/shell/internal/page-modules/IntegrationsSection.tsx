"use client";

/**
 * Integrations hub — in-dashboard management section.
 *
 * Rendered as the "Integrations" accordion section inside Settings → Plan &
 * integrations (WorkspacePageView). Renders ENTIRELY from the typed catalog —
 * the server loader (loadTenantIntegrations) returns one IntegrationView per
 * catalog entry, grouped here by category into Website / Analytics card lists.
 *
 * Pattern mirrors RegistrationSection: the SPA shell has no per-section SSR
 * loader, so this loads its data client-side and reloads after every mutation.
 * It NEVER imports the server-only repository and NEVER receives a decrypted
 * secret — only masked status (present + last4), the public config values, and
 * the credential mode ever reach the client.
 */

import { useCallback, useEffect, useState } from "react";

import { useAdminShell } from "../state";
import {
  loadTenantIntegrations,
  type IntegrationView,
} from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";
import { IntegrationCard } from "@/components/admin/integrations/IntegrationCard";
import { IntegrationConfigDrawer } from "@/components/admin/integrations/IntegrationConfigDrawer";

const CATEGORY_GROUPS: { id: IntegrationView["category"]; label: string; blurb: string }[] = [
  {
    id: "website",
    label: "Website",
    blurb: "Power your public storefront with your own provider keys.",
  },
  {
    id: "analytics",
    label: "Analytics & marketing",
    blurb:
      "Drop your own measurement IDs in — tags are injected on your storefront, gated behind visitor consent.",
  },
  {
    id: "social",
    label: "Social channels",
    blurb:
      "Connect verified brand channels and decide what appears on the public site.",
  },
];

export function IntegrationsSection() {
  const { tenantSlug } = useAdminShell();
  const [integrations, setIntegrations] = useState<IntegrationView[] | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [openKey, setOpenKey] = useState<string | null>(null);

  const reload = useCallback(() => {
    if (!tenantSlug) return;
    setLoading(true);
    loadTenantIntegrations(tenantSlug)
      .then((res) => {
        if (res.ok) {
          setIntegrations(res.integrations);
          setCanManage(res.canManage);
          setLoadError(null);
        } else {
          setLoadError(res.error);
        }
      })
      .catch(() => setLoadError("Couldn't load integrations."))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  useEffect(() => {
    reload();
  }, [reload]);

  const note = (text: string) => (
    <p className="m-0 text-[12.5px] text-admin-ink-muted">{text}</p>
  );

  if (!tenantSlug) return null;
  if (loading && !integrations) return note("Loading…");
  if (loadError && !integrations) return note(loadError);
  if (!integrations) return note("Couldn't load integrations.");

  const openIntegration = integrations.find((i) => i.key === openKey) ?? null;

  return (
    <div className="flex flex-col gap-6">
      {CATEGORY_GROUPS.map((group) => {
        const items = integrations.filter((i) => i.category === group.id);
        if (items.length === 0) return null;
        return (
          <div key={group.id} className="flex flex-col gap-2">
            <div>
              <div className="text-[11px] font-bold uppercase tracking-[0.4px] text-admin-ink-dim">
                {group.label}
              </div>
              <div className="mt-0.5 text-[12px] leading-[1.45] text-admin-ink-muted">
                {group.blurb}
              </div>
            </div>
            {items.map((intg) => (
              <IntegrationCard
                key={intg.key}
                integration={intg}
                onOpen={() => setOpenKey(intg.key)}
              />
            ))}
          </div>
        );
      })}

      {openIntegration && tenantSlug && (
        <IntegrationConfigDrawer
          tenantSlug={tenantSlug}
          integration={openIntegration}
          canManage={canManage}
          onClose={() => setOpenKey(null)}
          onChanged={reload}
        />
      )}
    </div>
  );
}
