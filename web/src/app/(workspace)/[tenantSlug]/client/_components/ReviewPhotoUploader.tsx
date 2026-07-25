"use client";

/**
 * ReviewPhotoUploader — optional photos on a just-submitted review (STANDING v3
 * item 5). Rendered inside LeaveReviewCard's saved state, so the review row
 * already exists and uploadReviewMediaAction can resolve it by natural key
 * (bookingId, talentProfileId, the caller's own review). Authenticated only.
 */

import { useRef, useState } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  removeReviewMediaAction,
  uploadReviewMediaAction,
} from "@/lib/reviews/review-media-actions";

const FONT = '"Inter", system-ui, sans-serif';
const MAX_PHOTOS = 6;

type Uploaded = { id: string; url: string };

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  accent: "#1D4ED8",
  borderSoft: "rgba(24,24,27,0.14)",
  surface: "rgba(29,78,216,0.05)",
  errorDeep: "#B42318",
} as const;

export function ReviewPhotoUploader({
  bookingId,
  talentProfileId,
}: {
  bookingId: string;
  talentProfileId: string;
}) {
  const t = useT();
  const [photos, setPhotos] = useState<Uploaded[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const atCap = photos.length >= MAX_PHOTOS;

  async function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (inputRef.current) inputRef.current.value = "";
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    for (const file of files) {
      if (photos.length >= MAX_PHOTOS) {
        setError(interpolate(t("client.reviews.photoCap"), { count: MAX_PHOTOS }));
        break;
      }
      const fd = new FormData();
      fd.set("bookingId", bookingId);
      fd.set("talentProfileId", talentProfileId);
      fd.set("file", file);
      const res = await uploadReviewMediaAction(fd);
      if (res.ok) {
        setPhotos((prev) => [...prev, res.data]);
      } else {
        setError(res.error || t("client.reviews.photoAddError"));
      }
    }
    setBusy(false);
  }

  async function remove(id: string) {
    setBusy(true);
    setError(null);
    const res = await removeReviewMediaAction(id);
    if (res.ok) {
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    } else {
      setError(res.error || t("client.reviews.photoRemoveError"));
    }
    setBusy(false);
  }

  return (
    <div style={{ marginTop: 12, fontFamily: FONT }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: C.inkMuted, marginBottom: 8 }}>
        {t("client.reviews.photoPrompt")}
      </div>

      {photos.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
          {photos.map((p) => (
            <div
              key={p.id}
              style={{
                position: "relative",
                width: 72,
                height: 72,
                borderRadius: 9,
                overflow: "hidden",
                border: `1px solid ${C.borderSoft}`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={p.url}
                alt={t("client.reviews.photoAlt")}
                style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              />
              <button
                type="button"
                onClick={() => remove(p.id)}
                disabled={busy}
                aria-label={t("client.reviews.photoRemove")}
                style={{
                  position: "absolute",
                  top: 3,
                  right: 3,
                  width: 20,
                  height: 20,
                  borderRadius: 999,
                  border: "none",
                  background: "rgba(11,11,13,0.62)",
                  color: "#fff",
                  fontSize: 13,
                  lineHeight: 1,
                  cursor: busy ? "default" : "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!atCap && (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{
            padding: "7px 14px",
            fontSize: 12,
            fontWeight: 600,
            fontFamily: FONT,
            color: C.accent,
            background: C.surface,
            border: `1px dashed ${C.borderSoft}`,
            borderRadius: 9,
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy
            ? t("client.reviews.photoUploading")
            : photos.length > 0
              ? t("client.reviews.photoAddAnother")
              : t("client.reviews.photoAdd")}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif"
        multiple
        onChange={onPick}
        style={{ display: "none" }}
      />

      {error && (
        <div style={{ marginTop: 8, fontSize: 11.5, color: C.errorDeep }}>{error}</div>
      )}
    </div>
  );
}
