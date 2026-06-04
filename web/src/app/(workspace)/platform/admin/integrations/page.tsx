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

export const dynamic = "force-dynamic";

const HQ = {
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

export default async function PlatformIntegrationsPage() {
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
          Integration defaults
        </h1>
        <p style={{ fontFamily: F, fontSize: 13, color: HQ.inkMuted, margin: "5px 0 0" }}>
          The platform&apos;s own integration keys. Every workspace INHERITS these unless it sets
          its own. Resolution order: tenant-custom → these HQ defaults → environment variable.
          When a default is unset here the runtime falls back to the env var exactly as before.
        </p>
      </div>

      {!view.ok ? (
        <div style={{ fontFamily: F, fontSize: 13, color: HQ.inkMuted }}>
          You don&apos;t have access to platform integration defaults.
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
