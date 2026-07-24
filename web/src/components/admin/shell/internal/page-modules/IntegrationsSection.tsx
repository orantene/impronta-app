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

import { useT } from "@/i18n/use-t";

import { useAdminShell } from "../state";
import {
  loadTenantIntegrations,
  type IntegrationView,
} from "@/app/(workspace)/[tenantSlug]/admin/settings/integration-actions";
import { IntegrationCard } from "@/components/admin/integrations/IntegrationCard";
import { IntegrationConfigDrawer } from "@/components/admin/integrations/IntegrationConfigDrawer";
import { CustomCodeDrawer } from "@/components/admin/integrations/CustomCodeDrawer";
import { CaptchaDrawer } from "@/components/admin/integrations/CaptchaDrawer";
import { EmailDomainDrawer } from "@/components/admin/integrations/EmailDomainDrawer";

const CATEGORY_GROUPS: {
  id: IntegrationView["category"];
  labelKey: string;
  blurbKey: string;
}[] = [
  {
    id: "website",
    labelKey: "dashboard.adminWorkspace.integrations.groupWebsite",
    blurbKey: "dashboard.adminWorkspace.integrations.groupWebsiteBlurb",
  },
  {
    id: "analytics",
    labelKey: "dashboard.adminWorkspace.integrations.groupAnalytics",
    blurbKey: "dashboard.adminWorkspace.integrations.groupAnalyticsBlurb",
  },
  {
    id: "social",
    labelKey: "dashboard.adminWorkspace.integrations.groupSocial",
    blurbKey: "dashboard.adminWorkspace.integrations.groupSocialBlurb",
  },
  {
    id: "security",
    labelKey: "dashboard.adminWorkspace.integrations.groupSecurity",
    blurbKey: "dashboard.adminWorkspace.integrations.groupSecurityBlurb",
  },
  {
    id: "comms",
    labelKey: "dashboard.adminWorkspace.integrations.groupComms",
    blurbKey: "dashboard.adminWorkspace.integrations.groupCommsBlurb",
  },
  {
    id: "money",
    labelKey: "dashboard.adminWorkspace.integrations.groupMoney",
    blurbKey: "dashboard.adminWorkspace.integrations.groupMoneyBlurb",
  },
];

/** Internal sentinel for "the load threw" — never rendered verbatim. */
const GENERIC_LOAD_ERROR = "__integrations_load_failed__";

export function IntegrationsSection() {
  const t = useT();
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
      // Sentinel, not user copy: `reload` must not close over the translator
      // (a fresh `t` identity every render would re-trigger the load effect).
      // Resolved to a localized string at render time.
      .catch(() => setLoadError(GENERIC_LOAD_ERROR))
      .finally(() => setLoading(false));
  }, [tenantSlug]);

  useEffect(() => {
    reload();
  }, [reload]);

  const note = (text: string) => (
    <p className="m-0 text-[12.5px] text-admin-ink-muted">{text}</p>
  );

  if (!tenantSlug) return null;
  const genericLoadError = t("dashboard.adminWorkspace.integrations.loadError");
  if (loading && !integrations) return note(t("dashboard.adminWorkspace.integrations.loading"));
  if (loadError && !integrations) {
    return note(loadError === GENERIC_LOAD_ERROR ? genericLoadError : loadError);
  }
  if (!integrations) return note(genericLoadError);

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
                {t(group.labelKey)}
              </div>
              <div className="mt-0.5 text-[12px] leading-[1.45] text-admin-ink-muted">
                {t(group.blurbKey)}
              </div>
            </div>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {items.map((intg) => (
                <IntegrationCard
                  key={intg.key}
                  integration={intg}
                  onOpen={() => {
                    // Link (surfaced) cards navigate via their anchor; only
                    // credential integrations open a drawer.
                    if (intg.connection !== "link") setOpenKey(intg.key);
                  }}
                />
              ))}
            </div>
          </div>
        );
      })}

      {openIntegration && tenantSlug && openIntegration.key === "custom_code" && (
        <CustomCodeDrawer
          tenantSlug={tenantSlug}
          integration={openIntegration}
          canManage={canManage}
          onClose={() => setOpenKey(null)}
          onChanged={reload}
        />
      )}
      {openIntegration && tenantSlug && openIntegration.key === "captcha" && (
        <CaptchaDrawer
          tenantSlug={tenantSlug}
          integration={openIntegration}
          canManage={canManage}
          onClose={() => setOpenKey(null)}
          onChanged={reload}
        />
      )}
      {openIntegration && tenantSlug && openIntegration.key === "email_domain" && (
        <EmailDomainDrawer
          tenantSlug={tenantSlug}
          integration={openIntegration}
          canManage={canManage}
          onClose={() => setOpenKey(null)}
          onChanged={reload}
        />
      )}
      {openIntegration &&
        tenantSlug &&
        openIntegration.connection !== "link" &&
        openIntegration.key !== "custom_code" &&
        openIntegration.key !== "captcha" &&
        openIntegration.key !== "email_domain" && (
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
