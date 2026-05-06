// Phase 3 — canonical workspace admin · Add talent to roster.
//
// Minimal form: display_name (required) + first/last, talent type,
// short bio, visibility. Profile starts in draft/hidden.
// After creation, the workspace admin can fill in full details through
// the legacy talent editor (canonical editor ships in Phase 3.3).
//
// Capability gate: agency.roster.edit.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { checkRosterSeatAvailability } from "@/lib/saas/roster-seat-limit";
import { NewRosterTalentForm } from "./NewRosterTalentForm";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

const C = {
  ink:      "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.72)",
  inkDim:   "rgba(11,11,13,0.38)",
  border:   "rgba(24,24,27,0.10)",
  accent:   "#0F4F3E",
} as const;
const F  = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

async function loadTalentTypes() {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  const { data, error } = await admin
    .from("taxonomy_terms")
    .select("id, name_en")
    .eq("kind", "talent_type")
    .is("archived_at", null)
    .order("sort_order", { ascending: true });

  if (error) {
    logServerError("roster/new.loadTalentTypes", error);
    return [];
  }

  return (data ?? []).map((t) => ({
    id: t.id as string,
    name_en: t.name_en as string,
  }));
}

export default async function WorkspaceRosterNewPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canEdit = await userHasCapability("agency.roster.edit", scope.tenantId);
  if (!canEdit) notFound();

  const [talentTypes, seatCheck] = await Promise.all([
    loadTalentTypes(),
    (async () => {
      const admin = createServiceRoleClient();
      if (!admin) return null;
      return checkRosterSeatAvailability(admin, scope.tenantId, 1);
    })(),
  ]);
  const seatUsage = {
    used: seatCheck?.current ?? 0,
    limit: seatCheck?.limit ?? null,
    atLimit: seatCheck ? !seatCheck.ok : false,
    message: seatCheck && !seatCheck.ok ? seatCheck.message : null,
  };

  return (
    <div style={{ fontFamily: F, color: C.ink }}>
      {/* Back nav */}
      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/${tenantSlug}/admin/roster`}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 13,
            color: C.inkMuted,
            textDecoration: "none",
            fontFamily: F,
            padding: "6px 0",
          }}
        >
          ← Roster
        </Link>
      </div>

      {/* Page heading */}
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            fontFamily: FD,
            fontSize: 24,
            fontWeight: 600,
            letterSpacing: -0.4,
            color: C.ink,
            margin: 0,
          }}
        >
          Add talent profile
        </h1>
        <p
          style={{
            fontFamily: F,
            fontSize: 13,
            color: C.inkMuted,
            margin: "6px 0 0",
            maxWidth: 520,
            lineHeight: 1.5,
          }}
        >
          Create a roster entry without an account. The talent can claim it later
          by registering with a matching email. Draft entries stay private until
          they are approved and visible for the storefront.
        </p>
      </div>
      {seatUsage.atLimit ? (
        <div
          style={{
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: 18,
            background: "#fff",
            maxWidth: 560,
          }}
        >
          <p
            style={{
              margin: 0,
              fontFamily: F,
              color: C.ink,
              fontSize: 14,
              lineHeight: 1.5,
            }}
          >
            {seatUsage.message ?? "This workspace reached its roster limit."}
          </p>
          <div style={{ marginTop: 12, display: "flex", gap: 12 }}>
            <Link
              href={`/${tenantSlug}/admin/account`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 34,
                padding: "0 14px",
                borderRadius: 8,
                background: C.accent,
                color: "#fff",
                textDecoration: "none",
                fontFamily: F,
                fontSize: 13,
                fontWeight: 600,
              }}
            >
              Upgrade plan
            </Link>
            <Link
              href={`/${tenantSlug}/admin/roster`}
              style={{
                display: "inline-flex",
                alignItems: "center",
                height: 34,
                padding: "0 14px",
                borderRadius: 8,
                border: `1px solid ${C.border}`,
                color: C.inkMuted,
                textDecoration: "none",
                fontFamily: F,
                fontSize: 13,
                fontWeight: 500,
              }}
            >
              Back to roster
            </Link>
          </div>
        </div>
      ) : (
        <NewRosterTalentForm
          tenantSlug={tenantSlug}
          talentTypes={talentTypes}
          seatUsage={seatUsage}
        />
      )}
    </div>
  );
}
