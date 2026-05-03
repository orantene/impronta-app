// Phase 3.3 — talent Settings page.
// Account settings, notifications, and privacy preferences.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile } from "../../_data-bridge";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:         "#0B0B0D",
  inkMuted:    "rgba(11,11,13,0.55)",
  inkDim:      "rgba(11,11,13,0.35)",
  borderSoft:  "rgba(24,24,27,0.08)",
  cardBg:      "#ffffff",
  surfaceAlt:  "rgba(11,11,13,0.025)",
  accent:      "#0F4F3E",
  accentSoft:  "rgba(15,79,62,0.08)",
  fill:        "#0F4F3E",
  indigoDeep:  "#2B3FA3",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function SettingRow({
  label,
  description,
  href,
  external = false,
}: {
  label: string;
  description: string;
  href: string;
  external?: boolean;
}) {
  const Comp = external ? "a" : Link;
  const extra = external ? { target: "_blank" as const, rel: "noopener noreferrer" } : {};
  return (
    <Comp
      href={href}
      {...(extra as any)}
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        padding: "14px 16px",
        textDecoration: "none",
        borderBottom: `1px solid ${C.borderSoft}`,
        fontFamily: FONT,
        transition: "background 100ms",
      }}
      className="setting-row"
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink, letterSpacing: -0.1 }}>
          {label}
        </div>
        <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>{description}</div>
      </div>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={C.inkDim} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {external
          ? <><path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6M15 3h6v6M10 14L21 3" /></>
          : <path d="M9 5l7 7-7 7" />
        }
      </svg>
    </Comp>
  );
}

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase" as const, color: C.inkDim, marginBottom: 10, fontFamily: FONT }}>
      {children}
    </div>
  );
}

export default async function TalentSettingsPage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;
  const session = await getCachedActorSession();
  if (!session.user) notFound();

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talentProfile = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talentProfile) notFound();

  const publicProfileUrl = talentProfile.profileCode
    ? `https://tulala.digital/t/${talentProfile.profileCode}`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 28, fontFamily: FONT }}>
      <style>{`.setting-row:hover { background: ${C.surfaceAlt}; }`}</style>

      {/* Header */}
      <div>
        <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
          {talentProfile.agencyName}
        </div>
        <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, letterSpacing: -0.5, lineHeight: 1.1 }}>
          Settings
        </h1>
      </div>

      {/* Profile settings */}
      <section>
        <SectionHead>Profile</SectionHead>
        <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
          <SettingRow
            href="/talent/my-profile"
            label="Edit profile"
            description="Update your name, photos, measurements, and biography"
          />
          <SettingRow
            href="/talent/edit-profile"
            label="Profile fields"
            description="Agency-specific fields and custom attributes"
          />
          {publicProfileUrl && (
            <SettingRow
              href={publicProfileUrl}
              label="View public profile"
              description={`tulala.digital/t/${talentProfile.profileCode}`}
              external
            />
          )}
        </div>
      </section>

      {/* Account settings */}
      <section>
        <SectionHead>Account</SectionHead>
        <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
          <SettingRow
            href="/talent/account"
            label="Account details"
            description="Email, password, and authentication settings"
          />
          <SettingRow
            href={`/${tenantSlug}/talent/agencies`}
            label="Agency relationships"
            description="Manage your roster status with each agency"
          />
        </div>
      </section>

      {/* Notifications — placeholder */}
      <section>
        <SectionHead>Notifications</SectionHead>
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 14,
            padding: "16px 18px",
          }}
        >
          <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.5 }}>
            Notification preferences will be configurable here. You currently receive email notifications for new inquiries, offer updates, and booking confirmations.
          </p>
        </div>
      </section>

      {/* Privacy */}
      <section>
        <SectionHead>Privacy &amp; visibility</SectionHead>
        <div style={{ background: C.cardBg, border: `1px solid ${C.borderSoft}`, borderRadius: 14, overflow: "hidden" }}>
          <SettingRow
            href="/talent/status"
            label="Availability status"
            description="Set your availability for new work inquiries"
          />
          <SettingRow
            href="/talent/representations"
            label="Representation"
            description="Manage how agencies represent you"
          />
        </div>
      </section>

      {/* Identity info */}
      <div
        style={{
          padding: "14px 16px",
          borderRadius: 12,
          background: C.surfaceAlt,
          border: `1px solid ${C.borderSoft}`,
          fontSize: 12,
          color: C.inkMuted,
          fontFamily: FONT,
          lineHeight: 1.5,
        }}
      >
        Signed in as <strong style={{ color: C.ink }}>{session.user.email}</strong>.{" "}
        Profile: <strong style={{ color: C.ink }}>{talentProfile.displayName}</strong>.
      </div>
    </div>
  );
}
