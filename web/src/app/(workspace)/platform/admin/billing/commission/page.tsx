// Platform HQ · Billing · Commission config
// Singleton editor for platform_commission_config: default take + per-tier
// overrides. Super-admin gated. No migration needed — table already exists.

import { redirect, notFound } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { getPlatformRole } from "@/lib/access/platform-role";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { interpolate } from "@/i18n/interpolate";
import { loadPlatformCommissionConfig } from "./actions";
import { CommissionConfigShell } from "./CommissionConfigShell";

export const dynamic = "force-dynamic";

const HQ = {
  ink:     "#F5F2EB",
  inkMuted:"rgba(245,242,235,0.62)",
  green:   "#5DD3A0",
} as const;

const F  = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export default async function PlatformCommissionPage() {
  const session = await getCachedActorSession();
  if (!session.user) redirect("/login?next=/platform/admin/billing/commission");

  const role = getPlatformRole(session.profile);
  if (role !== "super_admin") notFound();

  const result = await loadPlatformCommissionConfig();
  const config = result.ok ? result.data : null;
  const loadError = result.ok ? null : result.error;

  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: F, color: HQ.ink }}>
      {/* Header */}
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: HQ.green,
            marginBottom: 6,
          }}
        >
          {t("dashboard.platform.billing.commission.eyebrow")}
        </div>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 28,
            fontWeight: 600,
            margin: 0,
            letterSpacing: -0.5,
            lineHeight: 1.1,
          }}
        >
          {t("dashboard.platform.billing.commission.title")}
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            color: HQ.inkMuted,
            maxWidth: 720,
            lineHeight: 1.5,
          }}
        >
          {t("dashboard.platform.billing.commission.subtitle")}
        </p>
      </div>

      {loadError && (
        <div
          style={{
            background: "rgba(243,103,114,0.06)",
            border: "1px solid rgba(243,103,114,0.18)",
            borderRadius: 12,
            padding: 14,
            color: "#F36772",
            fontSize: 13,
          }}
        >
          {interpolate(
            t("dashboard.platform.billing.commission.loadFailed"),
            { error: loadError },
          )}
        </div>
      )}

      {config && <CommissionConfigShell initial={config} />}
    </div>
  );
}
