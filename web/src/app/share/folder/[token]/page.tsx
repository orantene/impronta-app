/**
 * Public media folder share viewer.
 *
 * No auth required — the share token (UUID) IS the access boundary.
 * The folder must have share_token matching the URL token AND must
 * not have expired (share_expires_at IS NULL or > now()).
 * Increments share_view_count on every valid load.
 */

import type { Metadata } from "next";
import Link from "next/link";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Shared media folder",
};

interface PageParams {
  params: Promise<{ token: string }>;
}

type PhotoRow = {
  id: string;
  bucket_id: string;
  storage_path: string;
  variant_kind: string;
  approval_state: string;
  width: number | null;
  height: number | null;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  talent_profiles: {
    display_name: string | null;
    first_name: string | null;
    last_name: string | null;
  } | null;
};

export default async function FolderSharePage({ params }: PageParams) {
  const { token } = await params;

  if (!token || !/^[0-9a-f-]{36}$/i.test(token)) {
    return <ShareError reason="invalid" />;
  }

  const admin = createServiceRoleClient();
  if (!admin) return <ShareError reason="config" />;

  // Load folder by token
  const { data: folder, error: folderErr } = await admin
    .from("media_folders")
    .select("id, name, tenant_id, share_expires_at, share_view_count, is_private")
    .eq("share_token", token)
    .maybeSingle();

  if (folderErr) {
    logServerError("share.folder.load", folderErr);
    return <ShareError reason="error" />;
  }
  if (!folder) return <ShareError reason="not_found" />;

  // Check expiry
  if (folder.share_expires_at && new Date(folder.share_expires_at) < new Date()) {
    return <ShareError reason="expired" />;
  }

  // A.5 — view-count increment is fire-and-forget but log on failure
  // so we notice if the table schema drifts or the row gets locked.
  admin
    .from("media_folders")
    .update({ share_view_count: folder.share_view_count + 1, updated_at: new Date().toISOString() })
    .eq("id", folder.id)
    .then((res) => {
      if (res.error) console.error("[share/folder] view-count update failed", res.error);
    });

  // Load folder items → asset IDs
  const { data: items } = await admin
    .from("media_folder_items")
    .select("asset_id")
    .eq("folder_id", folder.id);

  const assetIds = (items ?? []).map((r) => (r as { asset_id: string }).asset_id);

  // Load photos for those assets
  let photos: PhotoRow[] = [];
  if (assetIds.length > 0) {
    const { data: photoData } = await admin
      .from("media_assets")
      .select(`
        id, bucket_id, storage_path, variant_kind, approval_state,
        width, height, tags, metadata,
        talent_profiles!owner_talent_profile_id (
          display_name, first_name, last_name
        )
      `)
      .in("id", assetIds)
      .eq("approval_state", "approved")
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    photos = ((photoData ?? []) as unknown as PhotoRow[]).filter(
      (r) => r.talent_profiles != null,
    );
  }

  // Build public URLs
  const resolvedPhotos = photos.map((r) => {
    const { data: urlData } = admin.storage
      .from(r.bucket_id)
      .getPublicUrl(r.storage_path);
    const tp = r.talent_profiles!;
    const talentName =
      tp.display_name?.trim() ||
      [tp.first_name, tp.last_name].filter(Boolean).join(" ") ||
      "Talent";
    return {
      id: r.id,
      url: urlData?.publicUrl ?? "",
      talentName,
      tags: r.tags ?? [],
      note: (r.metadata?.note as string | null) ?? null,
    };
  });

  return (
    <div style={{ minHeight: "100vh", background: "#f8f8f8", fontFamily: "'Inter', system-ui, sans-serif" }}>
      {/* Header */}
      <div style={{
        background: "#fff", borderBottom: "1px solid #e8e8e8",
        padding: "16px 24px", display: "flex", alignItems: "center", justifyContent: "space-between",
        position: "sticky", top: 0, zIndex: 10,
      }}>
        <div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#0b0b0d" }}>{folder.name}</div>
          <div style={{ fontSize: 12.5, color: "#888", marginTop: 2 }}>
            {resolvedPhotos.length} photo{resolvedPhotos.length !== 1 ? "s" : ""}
            {folder.share_expires_at && (
              <span style={{ marginLeft: 8 }}>
                · Expires {new Date(folder.share_expires_at).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })}
              </span>
            )}
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#aaa" }}>Powered by Impronta</div>
      </div>

      {/* Grid */}
      <div style={{ padding: "28px 24px 48px", maxWidth: 1200, margin: "0 auto" }}>
        {resolvedPhotos.length === 0 ? (
          <div style={{ padding: "64px 0", textAlign: "center", color: "#999", fontSize: 14 }}>
            This folder is empty.
          </div>
        ) : (
          <div style={{ columns: "3 220px", columnGap: 14 }}>
            {resolvedPhotos.map((photo) => (
              <div key={photo.id} style={{ breakInside: "avoid", marginBottom: 14 }}>
                <a href={photo.url} target="_blank" rel="noopener noreferrer"
                  style={{ display: "block", borderRadius: 10, overflow: "hidden", textDecoration: "none" }}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={photo.talentName}
                    loading="lazy"
                    style={{ width: "100%", display: "block", borderRadius: 10 }}
                  />
                </a>
                <div style={{ padding: "6px 2px 0" }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: "#222" }}>{photo.talentName}</div>
                  {photo.tags.length > 0 && (
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                      {photo.tags.map((t) => (
                        <span key={t} style={{
                          padding: "1px 7px", borderRadius: 999,
                          background: "#f0f0f0", fontSize: 10.5, color: "#555",
                        }}>{t}</span>
                      ))}
                    </div>
                  )}
                  {photo.note && (
                    <div style={{ fontSize: 11.5, color: "#888", marginTop: 3, lineHeight: 1.5 }}>{photo.note}</div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div style={{ borderTop: "1px solid #e8e8e8", padding: "16px 24px", textAlign: "center", fontSize: 11.5, color: "#bbb" }}>
        This folder was shared privately. Content is for intended recipients only.
      </div>
    </div>
  );
}

function ShareError({ reason }: { reason: string }) {
  const copy =
    reason === "expired"
      ? { title: "This share link has expired.", body: "Ask the sender for an updated link." }
      : reason === "not_found"
        ? { title: "This folder is no longer available.", body: "The link may have been revoked." }
        : reason === "invalid"
          ? { title: "This link isn't valid.", body: "Check the URL and try again." }
          : { title: "Something went wrong.", body: "Try again or contact the sender." };

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "#f8f8f8", padding: 24, fontFamily: "'Inter', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 380, width: "100%", borderRadius: 16, border: "1px solid #e8e8e8", background: "#fff", padding: "40px 32px", textAlign: "center", boxShadow: "0 4px 24px rgba(0,0,0,0.06)" }}>
        <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
        <div style={{ fontSize: 17, fontWeight: 700, color: "#0b0b0d", marginBottom: 8 }}>{copy.title}</div>
        <div style={{ fontSize: 13.5, color: "#888", lineHeight: 1.6, marginBottom: 24 }}>{copy.body}</div>
        <Link href="/" style={{ display: "inline-block", padding: "8px 20px", borderRadius: 8, border: "1px solid #e0e0e0", background: "#fff", fontSize: 13, fontWeight: 600, color: "#333", textDecoration: "none" }}>
          Go to homepage
        </Link>
      </div>
    </div>
  );
}
