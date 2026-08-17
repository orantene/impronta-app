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
import { getRequestLocale } from "@/i18n/request-locale";
import { createTranslator } from "@/i18n/messages";
import { selectableTalentTypeIds } from "@/lib/taxonomy/tenant-talent-type-options";

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

async function loadTalentTypes(tenantId: string) {
  const admin = createServiceRoleClient();
  if (!admin) return [];

  // The tree (all levels — ancestors are needed for the enablement walk) and
  // the tenant overlay. Offering a type the save-path validator
  // (evaluateTenantTalentTypeAvailability) would reject is the bug this
  // guards against: the admin picks it, saves, and hits an error about a
  // setting they cannot see.
  const [{ data: typeRows, error }, { data: treeRows, error: treeError }, { data: settingRows, error: settingsError }] =
    await Promise.all([
      admin
        .from("taxonomy_terms")
        .select("id, name_i18n")
        .eq("kind", "talent_type")
        .is("archived_at", null)
        .order("sort_order", { ascending: true }),
      admin
        .from("taxonomy_terms")
        .select("id, parent_id, term_type, is_active")
        .is("archived_at", null),
      admin
        .from("agency_taxonomy_settings")
        .select("taxonomy_term_id, is_enabled, allow_as_primary")
        .eq("tenant_id", tenantId),
    ]);

  if (error || treeError || settingsError) {
    logServerError("roster/new.loadTalentTypes", error ?? treeError ?? settingsError);
    return [];
  }

  const types = (typeRows ?? []).map((t) => ({
    id: t.id as string,
    name_en: ((t as { name_i18n?: Record<string, string | null> | null }).name_i18n?.en ?? "") as string,
  }));
  const selectable = selectableTalentTypeIds({
    terms: (treeRows ?? []) as { id: string; parent_id: string | null; term_type: string | null; is_active: boolean | null }[],
    settings: (settingRows ?? []) as { taxonomy_term_id: string; is_enabled: boolean | null; allow_as_primary: boolean | null }[],
    talentTypeIds: types.map((t) => t.id),
  });
  return types.filter((t) => selectable.has(t.id));
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

  const locale = await getRequestLocale();
  const t = createTranslator(locale);

  const [talentTypes, seatCheck] = await Promise.all([
    loadTalentTypes(scope.tenantId),
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
      <div className="mb-5">
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
          {t("admin.roster.new.backToRoster")}
        </Link>
      </div>

      {/* Page heading */}
      <div className="mb-6">
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
          {t("admin.roster.new.title")}
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
          {t("admin.roster.new.description")}
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
            {seatUsage.message ?? t("admin.roster.new.seatLimitFallback")}
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
              {t("admin.roster.new.upgradePlan")}
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
              {t("admin.roster.new.backToRosterBtn")}
            </Link>
          </div>
        </div>
      ) : (
        <NewRosterTalentForm
          tenantSlug={tenantSlug}
          talentTypes={talentTypes}
          seatUsage={seatUsage}
          locale={locale}
        />
      )}
    </div>
  );
}
