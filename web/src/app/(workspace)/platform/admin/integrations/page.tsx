// Platform HQ · Integration defaults
//
// The super-admin sets the PLATFORM's default integration keys (Google Maps,
// GA4, captcha, email-from) here. Those become the values every tenant INHERITS
// (the platform-DB layer of the tenant-custom → platform-DB → env fallback
// chain). Stored as integration rows under the canonical platform tenant id.
//
// Dark HQ theme. Writes are gated on super_admin in the server actions.

import { loadPlatformIntegrationDefaults } from "./platform-integration-actions";
import { PlatformIntegrationCard } from "./PlatformIntegrationEditors";
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";

export const dynamic = "force-dynamic";

const HQ = {
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export default async function PlatformIntegrationsPage() {
  const locale = await getRequestLocale();
  const t = createTranslator(locale);
  const view = await loadPlatformIntegrationDefaults();

  return (
    <>
      <div className="mb-6">
        <h1
          style={{
            fontFamily: FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: HQ.ink,
            margin: 0,
          }}
        >
          {t("dashboard.platform.integrations.title")}
        </h1>
        <p style={{ fontFamily: F, fontSize: 13, color: HQ.inkMuted, margin: "5px 0 0" }}>
          {t("dashboard.platform.integrations.subtitle")}
        </p>
      </div>

      {!view.ok ? (
        <div style={{ fontFamily: F, fontSize: 13, color: HQ.inkMuted }}>
          {t("dashboard.platform.integrations.noAccess")}
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 12 }}>
          {view.items.map((item) => (
            <PlatformIntegrationCard key={item.key} item={item} />
          ))}
        </div>
      )}
    </>
  );
}
