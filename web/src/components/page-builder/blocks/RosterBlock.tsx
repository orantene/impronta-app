import { createClient } from "@/lib/supabase/server";
import type { RosterBlock } from "./types";

export async function RosterBlockRenderer({
  block,
  tenantId,
}: {
  block: RosterBlock;
  tenantId: string;
}) {
  const supabase = await createClient();
  const limit = Math.min(block.maxItems ?? 12, 24);

  type TalentRow = {
    id: string;
    display_name: string | null;
    profile_code: string | null;
    media_assets: Array<{
      storage_path: string;
      variant_kind: string;
      deleted_at: string | null;
    }>;
    talent_profile_taxonomy: Array<{
      taxonomy_terms: { name_en: string } | null;
      relationship_type: string;
    }>;
  };

  const { data: talents } = supabase
    ? await supabase
        .from("agency_talent_roster")
        .select(
          `
          talent_profiles!talent_profile_id (
            id,
            display_name,
            profile_code,
            media_assets ( storage_path, variant_kind, deleted_at ),
            talent_profile_taxonomy (
              relationship_type,
              taxonomy_terms ( name_en )
            )
          )
          `,
        )
        .eq("tenant_id", tenantId)
        .eq("status", "active")
        .limit(limit)
    : { data: null };

  const rows = (talents ?? []) as unknown as Array<{ talent_profiles: TalentRow | null }>;
  const items = rows
    .map((r) => r.talent_profiles)
    .filter((p): p is TalentRow => p !== null);

  const getThumbUrl = (profile: TalentRow): string | null => {
    const approved = (profile.media_assets ?? []).find(
      (m) => m.deleted_at == null && (m.variant_kind === "thumbnail" || m.variant_kind === "gallery"),
    );
    if (!approved || !supabase) return null;
    return supabase.storage.from("media-public").getPublicUrl(approved.storage_path).data.publicUrl;
  };

  const getPrimaryType = (profile: TalentRow): string | null => {
    const primary = (profile.talent_profile_taxonomy ?? []).find(
      (t) => t.relationship_type === "primary_role",
    );
    return primary?.taxonomy_terms?.name_en ?? null;
  };

  return (
    <section style={{ padding: "40px 24px" }}>
      {block.heading && (
        <h2 style={{ textAlign: "center", fontSize: 28, fontWeight: 700, marginBottom: 28 }}>
          {block.heading}
        </h2>
      )}
      {items.length === 0 ? (
        <p style={{ textAlign: "center", opacity: 0.55 }}>No published talent yet.</p>
      ) : (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 16,
          }}
        >
          {items.map((t) => {
            const thumbUrl = getThumbUrl(t);
            const primaryType = getPrimaryType(t);
            return (
              <a
                key={t.id}
                href={t.profile_code ? `/t/${t.profile_code}` : "#"}
                style={{ textDecoration: "none", color: "inherit" }}
              >
                <div style={{ borderRadius: 12, overflow: "hidden", background: "rgba(0,0,0,0.05)" }}>
                  {thumbUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={thumbUrl}
                      alt={t.display_name ?? ""}
                      style={{ width: "100%", aspectRatio: "3/4", objectFit: "cover", display: "block" }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        aspectRatio: "3/4",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 28,
                        fontWeight: 700,
                        opacity: 0.35,
                      }}
                    >
                      {(t.display_name ?? "?")[0]?.toUpperCase()}
                    </div>
                  )}
                  <div style={{ padding: "10px 12px" }}>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{t.display_name}</div>
                    {primaryType && (
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{primaryType}</div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </section>
  );
}
