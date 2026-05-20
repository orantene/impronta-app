// ============================================================================
// /[tenantSlug]/talent/profile/fields — Talent self-edit for the DB-driven
// catalog (the same fields admins see in LiveCategoryFieldsEditor, but
// scoped through the talent-side server actions: requireTalent + ownership
// check + editable_by_talent gate).
//
// Minimal route shell — looks up the signed-in talent's profile row and
// hands off to a client component that mounts LiveCategoryFieldsEditor in
// `talent-self` viewMode.
// ============================================================================

import { redirect } from "next/navigation";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { TalentSelfFieldsEditor } from "./talent-self-fields-editor";

export const dynamic = "force-dynamic";

export default async function TalentSelfFieldsPage() {
  const session = await getCachedActorSession();
  if (!session.user || !session.supabase) redirect("/login");

  // Find the talent_profile this signed-in user owns.
  const { data: profile } = await session.supabase
    .from("talent_profiles")
    .select("id, display_name")
    .eq("user_id", session.user.id)
    .maybeSingle();

  if (!profile) {
    return (
      <div style={{ padding: 32, fontFamily: "Inter, system-ui, sans-serif" }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 8 }}>
          No talent profile linked
        </h1>
        <p style={{ fontSize: 13, color: "#5A5A60" }}>
          Your account isn&apos;t linked to a talent profile yet. Ask your
          agency admin to invite you, or create one from the Identity flow.
        </p>
      </div>
    );
  }

  return (
    <div style={{
      maxWidth: 760, margin: "0 auto", padding: "24px 16px",
      fontFamily: "Inter, system-ui, sans-serif",
    }}>
      <div className="mb-4">
        <h1 style={{ fontSize: 22, fontWeight: 700, color: "#0B0B0D", margin: 0 }}>
          Profile fields
        </h1>
        <p style={{ fontSize: 13, color: "#5A5A60", marginTop: 4 }}>
          {profile.display_name ?? "Your profile"} — fields you can fill yourself.
          Visibility chips control who sees each value.
        </p>
      </div>
      <TalentSelfFieldsEditor talentProfileId={profile.id} />
    </div>
  );
}
