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

  const talentTypes = await loadTalentTypes();

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
          by registering with a matching email. Profile starts in draft / hidden
          until you approve it.
        </p>
      </div>

      <NewRosterTalentForm tenantSlug={tenantSlug} talentTypes={talentTypes} />
    </div>
  );
}
