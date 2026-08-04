"use client";

/**
 * PhotoStep — the onboarding wizard's "Profile photo" step.
 *
 * Photos upload INLINE here via the talent-self media endpoint
 * (`/api/talent/media/upload`, the same one the media-picker drawer uses), so a
 * talent never has to leave the wizard to add their first images. On success it
 * calls `onSaved()` → the page re-reads the SERVER-canonical media count, so the
 * progress card + this step's "done" dot update without a local re-derivation.
 *
 * The "Manage photos" link still hands off to the full media editor for the
 * things the wizard intentionally doesn't do (reorder, delete, albums, video).
 *
 * Extracted to its own file so `onboarding-steps.tsx` stays under the 800-line
 * lint ceiling; re-exported from there so importers are unchanged.
 */

import { useState, useTransition } from "react";
import Link from "next/link";
import { C, FONT, saveBtn, secondaryBtn } from "./onboarding-shared";
import { compressImage } from "@/lib/client/image-compress";

export function PhotoStep({
  mediaCount,
  talentProfileId,
  onSaved,
}: {
  mediaCount: number;
  talentProfileId: string;
  onSaved: () => void;
}) {
  const hasMedia = mediaCount > 0;
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addedCount, setAddedCount] = useState(0);
  const [, startTransition] = useTransition();

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const list = Array.from(files);
    setUploading(true);
    setError(null);
    setAddedCount(0);
    startTransition(async () => {
      let added = 0;
      for (const file of list) {
        try {
          // Compress in the browser before the POST. Raw phone photos are
          // 5-15 MB — over Vercel's ~4.5 MB request-body cap AND the API
          // route's own 5 MB limit, so the un-compressed POST failed for
          // typical camera files. Post-compression bytes are ~150 KB; the
          // original file passes through only when compression can't run
          // (GIF, decode failure) — small ones still fit.
          const compressed = await compressImage(file);
          const form = new FormData();
          form.set("talentProfileId", talentProfileId);
          form.set("file", compressed.file, compressed.file.name || file.name);
          const res = await fetch("/api/talent/media/upload", { method: "POST", body: form });
          const body = await res.json().catch(() => ({}));
          if (!res.ok || !body.ok) {
            setError(body.error ?? `Upload failed (HTTP ${res.status}).`);
            break;
          }
          added += 1;
        } catch {
          setError("Upload failed. Check your connection and try again.");
          break;
        }
      }
      setUploading(false);
      if (added > 0) {
        setAddedCount(added);
        onSaved();
        setTimeout(() => setAddedCount(0), 2600);
      }
    });
  };

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          padding: "12px 14px",
          borderRadius: 12,
          border: `1px solid ${hasMedia ? "rgba(22,163,74,0.3)" : C.borderSoft}`,
          background: hasMedia ? "rgba(22,163,74,0.06)" : C.surface,
        }}
      >
        <span style={{ fontSize: 22 }} aria-hidden>
          {hasMedia ? "✓" : "📷"}
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>
            {hasMedia ? `${mediaCount} photo${mediaCount === 1 ? "" : "s"} uploaded` : "No photos yet"}
          </div>
          <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 2, lineHeight: 1.45 }}>
            {hasMedia
              ? "Great — your profile has imagery. Add more below, or fine-tune order in the editor."
              : "Upload at least one image so review and matching can begin."}
          </div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14, flexWrap: "wrap" }}>
        <label
          style={{
            ...saveBtn,
            marginTop: 0,
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            cursor: uploading ? "default" : "pointer",
            opacity: uploading ? 0.6 : 1,
          }}
        >
          {uploading ? "Uploading…" : hasMedia ? "Add more photos" : "Upload photos"}
          <input
            type="file"
            accept="image/*"
            multiple
            disabled={uploading}
            onChange={(e) => {
              upload(e.target.files);
              e.target.value = "";
            }}
            style={{ display: "none" }}
            aria-label="Upload photos"
          />
        </label>
        <Link
          href="/talent/public-page"
          style={{
            ...secondaryBtn,
            textDecoration: "none",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontFamily: FONT,
          }}
        >
          Manage photos →
        </Link>
      </div>

      {error ? (
        <div style={{ fontSize: 11.5, color: C.error, marginTop: 8 }}>{error}</div>
      ) : uploading ? (
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginTop: 8 }}>Uploading…</div>
      ) : addedCount > 0 ? (
        <div style={{ fontSize: 11.5, color: C.success, marginTop: 8 }}>
          Added {addedCount} photo{addedCount === 1 ? "" : "s"} ✓
        </div>
      ) : null}

      <p style={{ fontSize: 11, color: C.inkMuted, marginTop: 10, lineHeight: 1.45 }}>
        Add your strongest shots here. Reordering, albums, and video live in the full media editor.
      </p>
    </div>
  );
}
