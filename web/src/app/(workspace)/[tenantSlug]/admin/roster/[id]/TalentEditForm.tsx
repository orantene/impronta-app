"use client";

import * as React from "react";
import { useActionState, useEffect, useRef, useState, useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createTranslator } from "@/i18n/messages";
import { createClient } from "@/lib/supabase/client";
import {
  type RosterTalentEditState,
  type RegisterPhotoResult,
  updateRosterTalentProfile,
  setRosterTalentSiteVisibility,
  registerRosterTalentPhoto,
} from "./actions";
import { MediaGalleryDrawer } from "@/components/talent/media-gallery-drawer";
import type { MediaAsset } from "@/components/talent/media-gallery-drawer";
import { setTalentAvatar, setTalentHero } from "./extended-actions";
import { actionUploadAndAssignMedia, actionDeleteMediaAssets, actionLoadTalentMediaBundle, actionImportFromGoogleDrive, actionReorderMediaAssets, actionRevertCropToSource } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import { uploadTalentMedia } from "@/lib/client/signed-upload";
import { useAdminShell } from "@/components/admin/shell/internal/state";

// ─── Design tokens (match workspace shell) ────────────────────────────────────

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.62)",
  inkDim:     "rgba(11,11,13,0.38)",
  border:     "rgba(24,24,27,0.10)",
  surface:    "#FAFAF7",
  card:       "#ffffff",
  accent:     "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  green:      "#2E7D5B",
  greenSoft:  "rgba(46,125,91,0.10)",
  greenDeep:  "#1A5E3C",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(212,160,23,0.10)",
  error:      "#c0392b",
  errorSoft:  "rgba(192,57,43,0.08)",
} as const;

const F  = '"Inter", system-ui, sans-serif';
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

// ─── Sub-types ────────────────────────────────────────────────────────────────

type TalentTypeOption = { id: string; name_en: string };

export type TalentEditInitial = {
  display_name: string;
  first_name: string | null;
  last_name: string | null;
  short_bio: string | null;
  phone: string | null;
  workflow_status: string;
  visibility: string;
  agency_visibility: string;
  /** Talent's global hide kill-switch (`talent_profiles.is_publicly_hidden`). */
  is_publicly_hidden: boolean;
  primary_type_term_id: string | null;
  profile_code: string | null;
  photo_url: string | null;
  /** Height in cm. Shown in imperial (ft/in) on roster cards. Editable as cm here. */
  height_cm: number | null;
  gender: string | null;
  date_of_birth: string | null;
  invitation_email: string | null;
  home_city_text: string | null;
  /** Instagram handle extracted from social_links JSONB. Stored back as social_links. */
  instagram: string | null;
};

// ─── Field / input helpers ────────────────────────────────────────────────────

function inputStyle(fullWidth = true): React.CSSProperties {
  return {
    display: "block",
    width: fullWidth ? "100%" : undefined,
    background: "#fff",
    border: `1px solid ${C.border}`,
    borderRadius: 8,
    padding: "9px 11px",
    fontSize: 14,
    fontFamily: F,
    color: C.ink,
    outline: "none",
    boxSizing: "border-box",
  };
}

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5 }}>
      <span
        style={{
          fontFamily: F,
          fontSize: 12,
          fontWeight: 600,
          color: C.inkMuted,
          letterSpacing: 0.2,
        }}
      >
        {label}
        {required && <span style={{ color: C.error, marginLeft: 3 }}>*</span>}
      </span>
      {children}
      {hint && (
        <span style={{ fontFamily: F, fontSize: 11.5, color: C.inkDim }}>{hint}</span>
      )}
    </label>
  );
}

// ─── Photo upload component ───────────────────────────────────────────────────

/** Centre-crop to 1:1, convert to WebP, 1200×1200 max. */
async function prepareAvatarFile(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const url = URL.createObjectURL(file);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = document.createElement("img");
    el.onload = () => res(el);
    el.onerror = () => rej(new Error("Could not load image"));
    el.src = url;
  });
  URL.revokeObjectURL(url);

  const size = Math.min(img.naturalWidth, img.naturalHeight, 1200);
  const ox = (img.naturalWidth  - Math.min(img.naturalWidth, img.naturalHeight)) / 2;
  const oy = (img.naturalHeight - Math.min(img.naturalWidth, img.naturalHeight)) / 2;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(img, ox, oy, Math.min(img.naturalWidth, img.naturalHeight), Math.min(img.naturalWidth, img.naturalHeight), 0, 0, size, size);
  const blob = await new Promise<Blob>((res, rej) =>
    canvas.toBlob((b) => (b ? res(b) : rej(new Error("Encode failed"))), "image/webp", 0.92)
  );
  return { blob, width: size, height: size };
}

function PhotoUploader({
  talentId,
  tenantSlug,
  initialUrl,
  displayName,
  locale,
}: {
  talentId: string;
  tenantSlug: string;
  initialUrl: string | null;
  displayName: string;
  locale: string;
}) {
  const t = React.useMemo(() => createTranslator(locale), [locale]);
  type Stage =
    | { kind: "idle" }
    | { kind: "preparing" }
    | { kind: "uploading" }
    | { kind: "registering" }
    | { kind: "saved"; mediaId: string }
    | { kind: "error"; message: string };

  const [photoUrl, setPhotoUrl] = useState<string | null>(initialUrl);
  const [stage, setStage] = useState<Stage>({ kind: "idle" });
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();
  const uploading =
    stage.kind === "preparing" || stage.kind === "uploading" || stage.kind === "registering";

  const initials = displayName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.replace(/[^a-zA-ZÀ-ÿ]/g, "")[0]?.toUpperCase() ?? "")
    .join("");

  const handleFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) {
      setStage({ kind: "error", message: t("admin.talent.edit.photo.errorSize") });
      return;
    }
    try {
      setStage({ kind: "preparing" });
      const { blob, width, height } = await prepareAvatarFile(file);
      const storagePath = `${talentId}/public/${crypto.randomUUID()}.webp`;
      if (!supabase) throw new Error("Storage client unavailable.");

      setStage({ kind: "uploading" });
      const { error: upErr } = await supabase.storage
        .from("media-public")
        .upload(storagePath, blob, { contentType: "image/webp", upsert: false });
      if (upErr) throw new Error(`Storage upload failed: ${upErr.message}`);

      setStage({ kind: "registering" });
      const result: RegisterPhotoResult = await registerRosterTalentPhoto(tenantSlug, talentId, storagePath, width, height);
      if (!result.ok) throw new Error(`DB save failed: ${result.error}`);
      setPhotoUrl(result.publicUrl);
      setStage({ kind: "saved", mediaId: result.mediaId });
    } catch (err) {
      setStage({ kind: "error", message: err instanceof Error ? err.message : "Upload failed." });
    }
  }, [talentId, tenantSlug, supabase, t]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {/* Avatar circle */}
      <button
        type="button"
        title={t("admin.talent.edit.photo.changePhotoAria")}
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          position: "relative",
          width: 88,
          height: 88,
          borderRadius: "50%",
          border: `2px solid ${C.border}`,
          overflow: "hidden",
          cursor: "pointer",
          background: C.accentSoft,
          flexShrink: 0,
          padding: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl}
            alt={displayName}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <span style={{
            fontFamily: F,
            fontSize: 28,
            fontWeight: 700,
            color: C.accent,
            letterSpacing: -1,
          }}>
            {initials || "?"}
          </span>
        )}
        {/* Hover overlay */}
        <span style={{
          position: "absolute",
          inset: 0,
          background: "rgba(11,11,13,0.45)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          opacity: uploading ? 1 : 0,
          transition: "opacity 120ms",
          fontSize: 11,
          fontWeight: 600,
          color: "#fff",
          fontFamily: F,
          // Show on hover via CSS class trick
        }}
          className="photo-upload-overlay"
        >
          {uploading ? "…" : t("admin.talent.edit.photo.changeOverlay")}
        </span>
      </button>

      <style dangerouslySetInnerHTML={{ __html: `
        button:hover .photo-upload-overlay { opacity: 1 !important; }
      `}} />

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFile}
      />

      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        style={{
          fontFamily: F,
          fontSize: 12,
          fontWeight: 500,
          color: C.accent,
          background: "transparent",
          border: "none",
          cursor: "pointer",
          padding: 0,
          opacity: uploading ? 0.5 : 1,
        }}
      >
        {uploading ? t("admin.talent.edit.photo.working") : photoUrl ? t("admin.talent.edit.photo.changePhoto") : t("admin.talent.edit.photo.addPhoto")}
      </button>

      <UploadStatus stage={stage} t={t} />
    </div>
  );
}

function UploadStatus({
  stage,
  t,
}: {
  stage:
    | { kind: "idle" }
    | { kind: "preparing" }
    | { kind: "uploading" }
    | { kind: "registering" }
    | { kind: "saved"; mediaId: string }
    | { kind: "error"; message: string };
  t: (key: string) => string;
}) {
  if (stage.kind === "idle") return null;

  const steps: Array<{ key: "preparing" | "uploading" | "registering"; label: string }> = [
    { key: "preparing",   label: t("admin.talent.edit.photo.stepPrepare") },
    { key: "uploading",   label: t("admin.talent.edit.photo.stepUpload") },
    { key: "registering", label: t("admin.talent.edit.photo.stepSave") },
  ];

  // Determine each step's state.
  const order = ["preparing", "uploading", "registering"] as const;
  const activeIdx = stage.kind === "preparing" ? 0
    : stage.kind === "uploading" ? 1
    : stage.kind === "registering" ? 2
    : stage.kind === "saved" ? 3
    : -1; // error: mark active = unknown

  const errorAt =
    stage.kind === "error"
      ? /storage upload failed/i.test(stage.message) ? 1
      : /db save failed|could not save|verify/i.test(stage.message) ? 2
      : 0
      : -1;

  return (
    <div
      style={{
        width: "100%",
        maxWidth: 240,
        marginTop: 4,
        padding: "8px 10px",
        border: `1px solid ${C.border}`,
        borderRadius: 8,
        background: stage.kind === "saved" ? "rgba(34,140,80,0.06)"
                  : stage.kind === "error" ? "rgba(200,55,55,0.06)"
                  : C.accentSoft,
        fontFamily: F,
        fontSize: 11.5,
        display: "flex",
        flexDirection: "column",
        gap: 4,
      }}
    >
      {steps.map((s, i) => {
        const isError = errorAt === i;
        const isDone = stage.kind === "saved" || (activeIdx > i && !isError);
        const isActive = activeIdx === i && stage.kind !== "saved";
        const icon = isError ? "✕" : isDone ? "✓" : isActive ? "…" : "·";
        const color = isError ? C.error
                    : isDone ? "#228c50"
                    : isActive ? C.ink
                    : C.inkDim;
        return (
          <div key={s.key} style={{ display: "flex", gap: 6, color }}>
            <span style={{ width: 12, textAlign: "center", fontWeight: 700 }}>{icon}</span>
            <span>{s.label}</span>
          </div>
        );
      })}
      {stage.kind === "saved" && (
        <div style={{ marginTop: 4, color: "#228c50", fontWeight: 600 }}>
          {t("admin.talent.edit.photo.savedWithId").replace("{id}", `${stage.mediaId.slice(0, 8)}…`)}
        </div>
      )}
      {stage.kind === "error" && (
        <div style={{ marginTop: 4, color: C.error, wordBreak: "break-word" }}>
          {stage.message}
        </div>
      )}
    </div>
  );
}

// ─── Three-slot photo panel for standalone form ───────────────────────────────

function ThreeSlotPhotoPanel({
  talentId,
  tenantSlug,
  initialPhotoUrl,
  locale,
}: {
  talentId: string;
  tenantSlug: string;
  initialPhotoUrl: string | null;
  locale: string;
}) {
  const t = createTranslator(locale);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialPhotoUrl);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
  const [currentAvatarAssetId, setCurrentAvatarAssetId] = useState<string | null>(null);
  const [currentHeroAssetId, setCurrentHeroAssetId] = useState<string | null>(null);
  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [focusSlot, setFocusSlot] = useState<"avatar" | "hero" | "gallery">("gallery");
  const loadedRef = useRef(false);

  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    void actionLoadTalentMediaBundle(talentId).then((res) => {
      if (!res.ok) return;
      const all: MediaAsset[] = [];
      const { card, hero, gallery } = res.data;
      if (card) {
        all.push({ id: card.id, url: card.url, variantKind: "card", sortOrder: 0, sourceMediaAssetId: card.sourceMediaAssetId });
        setAvatarUrl(card.url);
        setCurrentAvatarAssetId(card.id);
      }
      if (hero) {
        all.push({ id: hero.id, url: hero.url, variantKind: "hero", sortOrder: 0, sourceMediaAssetId: hero.sourceMediaAssetId });
        setCurrentHeroAssetId(hero.id);
      }
      for (const g of gallery) all.push({ id: g.id, url: g.url, variantKind: "gallery", sortOrder: g.sortOrder, sourceMediaAssetId: g.sourceMediaAssetId });
      setAssets(all);
    });
  }, [talentId]);

  return (
    <>
      <div style={{
        background: C.card, border: `1px solid ${C.border}`,
        borderRadius: 14, padding: "16px 14px",
        display: "flex", flexDirection: "column", gap: 10,
      }}>
        <p style={{ fontFamily: F, fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.4, textTransform: "uppercase", margin: 0 }}>
          {t("admin.talent.edit.photos.sectionTitle")}
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {/* Avatar slot */}
          <SlotButton
            label={t("admin.talent.edit.photos.avatarLabel")} hint="1:1"
            imageUrl={avatarUrl}
            squareSize={72}
            onClick={() => { setFocusSlot("avatar"); setGalleryOpen(true); }}
            onRemove={avatarUrl ? () => setAvatarUrl(null) : undefined}
            removeAriaLabel={t("admin.talent.edit.photos.removeSlotAria").replace("{label}", t("admin.talent.edit.photos.avatarLabel"))}
          />
          {/* Cover slot */}
          <SlotButton
            label={t("admin.talent.edit.photos.coverLabel")} hint="16:9"
            imageUrl={heroUrl}
            squareSize={58}
            heightPx={72}
            onClick={() => { setFocusSlot("hero"); setGalleryOpen(true); }}
            onRemove={heroUrl ? () => setHeroUrl(null) : undefined}
            removeAriaLabel={t("admin.talent.edit.photos.removeSlotAria").replace("{label}", t("admin.talent.edit.photos.coverLabel"))}
          />
          {/* Gallery */}
          <button
            type="button"
            onClick={() => { setFocusSlot("gallery"); setGalleryOpen(true); }}
            style={{
              flex: 1, height: 72,
              background: C.accentSoft,
              border: `1.5px dashed rgba(15,79,62,0.3)`,
              borderRadius: 8, cursor: "pointer",
              display: "flex", flexDirection: "column",
              alignItems: "center", justifyContent: "center", gap: 2,
            }}
          >
            <span style={{ fontSize: 18 }}>＋</span>
            <span style={{ fontFamily: F, fontSize: 10, fontWeight: 600, color: C.accent }}>{t("admin.talent.edit.photos.galleryBtn")}</span>
          </button>
        </div>
      </div>

      {galleryOpen && (
        <MediaGalleryDrawer
          open={galleryOpen}
          onOpenChange={setGalleryOpen}
          talentId={talentId}
          tenantSlug={tenantSlug}
          assets={assets}
          onAssetsChange={setAssets}
          focusSlot={focusSlot}
          currentAvatarAssetId={currentAvatarAssetId}
          currentHeroAssetId={currentHeroAssetId}
          locale={locale}
          onSetAvatar={async (mediaAssetId, assetUrl) => {
            const res = await setTalentAvatar(tenantSlug, talentId, mediaAssetId);
            if (res.ok) {
              // assetUrl is passed for freshly-cropped assets that aren't in
              // `assets` yet; fall back to the list for already-loaded photos.
              const url = assetUrl ?? assets.find(a => a.id === mediaAssetId)?.url;
              if (url) setAvatarUrl(url);
              setCurrentAvatarAssetId(mediaAssetId);
            }
            return res;
          }}
          onSetHero={async (mediaAssetId, assetUrl) => {
            const res = await setTalentHero(tenantSlug, talentId, mediaAssetId);
            if (res.ok) {
              const url = assetUrl ?? assets.find(a => a.id === mediaAssetId)?.url;
              if (url) setHeroUrl(url);
              setCurrentHeroAssetId(mediaAssetId);
            }
            return res;
          }}
          onAddToPortfolio={async (urlOrPath) => {
            // The gallery drawer passes asset.url (a full CDN URL). Extract the
            // relative storage path before persisting so storage_path stays relative.
            const BUCKET_PREFIX = process.env.NEXT_PUBLIC_SUPABASE_URL + '/storage/v1/object/public/media-public/';
            const storagePath = urlOrPath.startsWith(BUCKET_PREFIX)
              ? urlOrPath.slice(BUCKET_PREFIX.length)
              : urlOrPath;
            const { registerPortfolioPhoto } = await import("./extended-actions");
            const res = await registerPortfolioPhoto(tenantSlug, talentId, { storagePath });
            if (res.ok) return { ok: true, id: res.data?.id };
            return { ok: false, error: res.error };
          }}
          onDeleteAsset={async (mediaAssetId) => {
            const res = await actionDeleteMediaAssets([mediaAssetId]);
            if (res.ok) setAssets(prev => prev.filter(a => a.id !== mediaAssetId));
            return res;
          }}
          onImportFromDrive={async (driveUrl) => {
            const res = await actionImportFromGoogleDrive(driveUrl, talentId);
            if (!res.ok) return { ok: false, error: res.error };
            return { ok: true, assets: res.data.assets };
          }}
          onReorderAssets={async (orderedIds) => {
            const res = await actionReorderMediaAssets(orderedIds);
            if (!res.ok) return { ok: false, error: res.error };
            return { ok: true };
          }}
          onUploadFile={async (file, variantKind, sourceMediaAssetId) => {
            const allowed = ["gallery", "card", "hero", "lightbox"] as const;
            const kind = allowed.includes(variantKind as typeof allowed[number])
              ? (variantKind as typeof allowed[number])
              : "gallery";

            // Signed-upload pipeline first — see the note on the same handler in
            // TalentProfileShellDrawer. The legacy action's 4 MB Server Action
            // body cap rejects normal camera photos; compressing in the browser
            // and PUTting straight to storage sidesteps it.
            const fast = await uploadTalentMedia({
              file,
              variantKind: kind,
              talentProfileId: talentId,
              sourceMediaAssetId: sourceMediaAssetId ?? null,
            });
            if (fast.ok) {
              return {
                ok: true,
                asset: {
                  id: fast.id,
                  url: fast.publicUrl,
                  variantKind: kind,
                  sortOrder: fast.sortOrder,
                  sourceMediaAssetId: fast.sourceMediaAssetId,
                },
              };
            }
            if (!fast.fallbackToLegacy) return { ok: false, error: fast.error };

            const fd = new FormData();
            fd.append("file", file);
            const res = await actionUploadAndAssignMedia(fd, talentId, kind, {}, sourceMediaAssetId ?? null);
            if (!res.ok) return { ok: false, error: res.error };
            return {
              ok: true,
              asset: { id: res.data.id, url: res.data.publicUrl, variantKind: kind, sortOrder: res.data.sortOrder, sourceMediaAssetId: res.data.sourceMediaAssetId },
            };
          }}
          onRevertCrop={async (croppedId) => {
            const res = await actionRevertCropToSource(croppedId);
            if (!res.ok) return { ok: false, error: res.error };
            return { ok: true, sourceMediaAssetId: res.data.sourceMediaAssetId };
          }}
        />
      )}
    </>
  );
}

function SlotButton({
  label, hint, imageUrl, squareSize, heightPx, onClick, onRemove, removeAriaLabel,
}: {
  label: string;
  hint: string;
  imageUrl: string | null;
  squareSize: number;
  heightPx?: number;
  onClick: () => void;
  onRemove?: () => void;
  removeAriaLabel?: string;
}) {
  const h = heightPx ?? squareSize;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
      <div className="relative">
        <button
          type="button"
          onClick={onClick}
          style={{
            width: squareSize, height: h,
            borderRadius: 8, overflow: "hidden",
            border: imageUrl ? `2px solid rgba(15,79,62,0.25)` : `1.5px dashed rgba(15,79,62,0.3)`,
            background: imageUrl ? "transparent" : C.accentSoft,
            cursor: "pointer", padding: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
          }}
        >
          {imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={imageUrl} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          ) : (
            <span style={{ fontSize: 20, opacity: 0.35 }}>📷</span>
          )}
        </button>
        {imageUrl && onRemove && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            aria-label={removeAriaLabel ?? `Remove ${label}`}
            style={{
              position: "absolute", top: 4, right: 4,
              width: 18, height: 18, borderRadius: "50%",
              background: "rgba(0,0,0,0.6)", border: "none",
              color: "#fff", fontSize: 11, lineHeight: 1,
              cursor: "pointer", display: "flex",
              alignItems: "center", justifyContent: "center",
              padding: 0,
            }}
          >×</button>
        )}
      </div>
      <div className="text-center">
        <div style={{ fontFamily: F, fontSize: 10, fontWeight: 600, color: C.ink }}>{label}</div>
        <div style={{ fontFamily: F, fontSize: 9, color: C.inkMuted }}>{hint}</div>
      </div>
    </div>
  );
}

// ─── Sidebar: workflow quick controls ─────────────────────────────────────────

function WorkflowSidebar({
  tenantSlug,
  talentId,
  agencyVisibility,
  talentHidden,
  profileCode,
  locale,
}: {
  tenantSlug: string;
  talentId: string;
  agencyVisibility: string;
  talentHidden: boolean;
  profileCode: string | null;
  locale: string;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const { openDrawer } = useAdminShell();

  const [visible, setVisible] = useState(
    agencyVisibility === "site_visible" || agencyVisibility === "featured",
  );
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isFeatured = agencyVisibility === "featured";

  const publicUrl = profileCode ? `https://tulala.digital/t/${profileCode}` : null;

  const apply = (next: boolean) => {
    if (pending) return;
    setVisible(next); // optimistic
    setErrorMsg(null);
    startTransition(async () => {
      const res = await setRosterTalentSiteVisibility(tenantSlug, talentId, next);
      if (res && "error" in res && res.error) {
        setVisible(!next); // revert
        setErrorMsg(res.error);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: F,
      }}
    >
      {/* Directory visibility card — the agency's single public-visibility
          control. Replaces the old Draft/Published workflow picker. */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase" }}>
            {t("admin.talent.edit.workflow.visibilityLabel")}
          </div>
          <button
            type="button"
            onClick={() =>
              openDrawer("representation", {
                actor: "agency",
                talentProfileId: talentId,
              })
            }
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: C.accent,
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: F,
            }}
          >
            {t("admin.talent.edit.sidebar.fullRepresentation")}
          </button>
        </div>

        {talentHidden && (
          <div
            style={{
              background: C.amberSoft,
              border: `1px solid rgba(212,160,23,0.28)`,
              borderRadius: 8,
              padding: "9px 11px",
              marginBottom: 12,
            }}
          >
            <div style={{ fontSize: 12, fontWeight: 700, color: C.amber, marginBottom: 2 }}>
              {t("admin.talent.edit.sidebar.hiddenByTalentTitle")}
            </div>
            <div style={{ fontSize: 11, color: C.inkMuted, lineHeight: 1.45 }}>
              {t("admin.talent.edit.sidebar.hiddenByTalentBody")}
            </div>
          </div>
        )}

        <div style={{ display: "flex", alignItems: "center", gap: 11 }}>
          <span
            aria-hidden
            style={{
              width: 34,
              height: 34,
              borderRadius: 999,
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              background: visible ? C.accent : "rgba(11,11,13,0.05)",
              color: visible ? "#fff" : C.inkMuted,
              border: `1px solid ${visible ? C.accent : C.border}`,
            }}
          >
            {visible ? (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            ) : (
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c6.5 0 10 7 10 7a13.2 13.2 0 0 1-1.67 2.68" />
                <path d="M6.61 6.61A13.5 13.5 0 0 0 2 12s3.5 7 10 7a9.7 9.7 0 0 0 5.39-1.61" />
                <path d="m2 2 20 20" />
                <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
              </svg>
            )}
          </span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>
              {visible
                ? (isFeatured
                    ? t("admin.talent.edit.sidebar.stateFeatured")
                    : t("admin.talent.edit.sidebar.stateVisible"))
                : t("admin.talent.edit.sidebar.stateRosterOnly")}
            </div>
            <div style={{ fontSize: 11.5, color: C.inkMuted, lineHeight: 1.4 }}>
              {visible
                ? t("admin.talent.edit.sidebar.stateVisibleDesc")
                : t("admin.talent.edit.sidebar.stateRosterOnlyDesc")}
            </div>
          </div>
        </div>

        {errorMsg && (
          <div
            role="alert"
            style={{
              background: C.errorSoft,
              border: `1px solid rgba(192,57,43,0.20)`,
              borderRadius: 7,
              padding: "8px 11px",
              fontSize: 12,
              color: C.error,
              marginTop: 12,
            }}
          >
            {errorMsg}
          </div>
        )}

        <button
          type="button"
          onClick={() => apply(!visible)}
          disabled={pending}
          style={{
            width: "100%",
            marginTop: 12,
            background: visible ? "transparent" : C.accent,
            color: visible ? C.inkMuted : "#fff",
            border: visible ? `1px solid ${C.border}` : "none",
            padding: "9px 0",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            fontFamily: F,
            cursor: pending ? "not-allowed" : "pointer",
            opacity: pending ? 0.6 : 1,
          }}
        >
          {pending
            ? t("admin.talent.edit.sidebar.saving")
            : visible
              ? t("admin.talent.edit.sidebar.hideFromDirectory")
              : t("admin.talent.edit.sidebar.showInDirectory")}
        </button>
      </div>

      {/* Public profile link */}
      {publicUrl && (
        <div
          style={{
            background: C.card,
            border: `1px solid ${C.border}`,
            borderRadius: 14,
            padding: "14px 18px",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 8 }}>
            {t("admin.talent.edit.workflow.publicProfileLabel")}
          </div>
          <a
            href={publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              display: "block",
              fontSize: 12,
              color: C.accent,
              textDecoration: "none",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {publicUrl}
          </a>
        </div>
      )}
    </div>
  );
}

// ─── Main edit form ───────────────────────────────────────────────────────────

export function TalentEditForm({
  tenantSlug,
  talentId,
  initial,
  talentTypes,
  locale,
}: {
  tenantSlug: string;
  talentId: string;
  initial: TalentEditInitial;
  talentTypes: TalentTypeOption[];
  locale: string;
}) {
  const t = createTranslator(locale);
  const router = useRouter();
  const boundAction = updateRosterTalentProfile.bind(null, tenantSlug, talentId);
  const [state, action, pending] = useActionState<RosterTalentEditState, FormData>(
    boundAction,
    undefined,
  );

  // Refresh page data when save succeeds (updates sidebar workflow badge and photo).
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  return (
    <div
      style={{
        display: "flex",
        gap: 24,
        alignItems: "flex-start",
        flexWrap: "wrap",
      }}
    >
      {/* ── Left: edit form ── */}
      <form
        action={action}
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 18,
          flex: "1 1 360px",
          minWidth: 0,
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "20px 22px",
        }}
      >
        <div style={{ fontFamily: FD, fontSize: 14, fontWeight: 600, color: C.inkMuted, marginBottom: 2 }}>
          {t("admin.talent.edit.form.title")}
        </div>

        {state?.error && (
          <div role="alert" style={{ background: C.errorSoft, border: `1px solid rgba(192,57,43,0.20)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.error, fontFamily: F }}>
            {state.error}
          </div>
        )}
        {state?.success && (
          <div role="status" style={{ background: C.greenSoft, border: `1px solid rgba(46,125,91,0.20)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.greenDeep, fontFamily: F }}>
            {t("admin.talent.edit.form.savedSuccess")}
          </div>
        )}

        {/* ── Identity ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginBottom: 2 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>{t("admin.talent.edit.form.identitySection")}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("admin.talent.edit.form.firstName")}>
            <input name="first_name" autoComplete="off" defaultValue={initial.first_name ?? ""} style={inputStyle()} />
          </Field>
          <Field label={t("admin.talent.edit.form.lastName")}>
            <input name="last_name" autoComplete="off" defaultValue={initial.last_name ?? ""} style={inputStyle()} />
          </Field>
        </div>

        <Field label={t("admin.talent.edit.form.displayName")} required hint={t("admin.talent.edit.form.displayNameHint")}>
          <input name="display_name" required autoComplete="off" defaultValue={initial.display_name} style={inputStyle()} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("admin.talent.edit.form.gender")}>
            {/* Canonical, inclusive gender option-set — values match
                talent_profiles.gender + profile_field_definitions(identity.gender).options
                + the directory facet config (Tier-C-tail, 2026-06-10). The four
                common values keep their translated labels. */}
            <select name="gender" defaultValue={initial.gender ?? ""} style={inputStyle()}>
              <option value="">{t("admin.talent.edit.form.selectNone")}</option>
              <option value="Woman">{t("admin.talent.edit.form.genderWoman")}</option>
              <option value="Man">{t("admin.talent.edit.form.genderMan")}</option>
              <option value="Non-binary">{t("admin.talent.edit.form.genderNonBinary")}</option>
              <option value="Trans woman">{t("admin.talent.edit.gender.transWoman")}</option>
              <option value="Trans man">{t("admin.talent.edit.gender.transMan")}</option>
              <option value="Transgender">{t("admin.talent.edit.gender.transgender")}</option>
              <option value="Genderfluid">{t("admin.talent.edit.gender.genderfluid")}</option>
              <option value="Genderqueer">{t("admin.talent.edit.gender.genderqueer")}</option>
              <option value="Agender">{t("admin.talent.edit.gender.agender")}</option>
              <option value="Bigender">{t("admin.talent.edit.gender.bigender")}</option>
              <option value="Two-Spirit">{t("admin.talent.edit.gender.twoSpirit")}</option>
              <option value="Intersex">{t("admin.talent.edit.gender.intersex")}</option>
              <option value="Prefer to self-describe">{t("admin.talent.edit.gender.selfDescribe")}</option>
              <option value="Prefer not to say">{t("admin.talent.edit.gender.preferNotToSay")}</option>
            </select>
          </Field>
          <Field label={t("admin.talent.edit.form.dob")}>
            <input name="date_of_birth" type="date" autoComplete="off" defaultValue={initial.date_of_birth ?? ""} style={inputStyle()} />
          </Field>
        </div>

        {/* ── Contact ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>{t("admin.talent.edit.form.contactSection")}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label={t("admin.talent.edit.form.email")} hint={t("admin.talent.edit.form.emailHint")}>
            <input name="invitation_email" type="email" autoComplete="off" defaultValue={initial.invitation_email ?? ""} placeholder={t("admin.talent.edit.form.emailPlaceholder")} style={inputStyle()} />
          </Field>
          <Field label={t("admin.talent.edit.form.phone")}>
            <input name="phone" type="tel" autoComplete="off" defaultValue={initial.phone ?? ""} placeholder={t("admin.talent.edit.form.phonePlaceholder")} style={inputStyle()} />
          </Field>
        </div>

        <Field label={t("admin.talent.edit.form.instagram")} hint={t("admin.talent.edit.form.instagramHint")}>
          <input name="instagram" type="text" autoComplete="off" defaultValue={initial.instagram ?? ""} placeholder={t("admin.talent.edit.form.instagramPlaceholder")} style={inputStyle()} />
        </Field>

        {/* ── Physical ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>{t("admin.talent.edit.form.physicalSection")}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "end" }}>
          <Field label={t("admin.talent.edit.form.heightCm")} hint={t("admin.talent.edit.form.heightHint")}>
            <input name="height_cm" type="number" min={50} max={280} step={0.5} autoComplete="off"
              defaultValue={initial.height_cm != null ? String(initial.height_cm) : ""} placeholder="cm"
              style={{ ...inputStyle(false), width: 100 }}
            />
          </Field>
          <Field label={t("admin.talent.edit.form.homeCity")} hint={t("admin.talent.edit.form.homeCityHint")}>
            <input name="home_city_text" autoComplete="off" defaultValue={initial.home_city_text ?? ""} placeholder={t("admin.talent.edit.form.homeCityPlaceholder")} style={inputStyle()} />
          </Field>
        </div>

        {/* ── Primary talent type ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>{t("admin.talent.edit.form.roleSection")}</span>
        </div>

        <Field label={t("admin.talent.edit.form.primaryType")} hint={t("admin.talent.edit.form.primaryTypeHint")}>
          <select name="talent_type_term_id" defaultValue={initial.primary_type_term_id ?? ""} style={inputStyle()}>
            <option value="">{t("admin.talent.edit.form.selectNone")}</option>
            {talentTypes.map((tt) => (
              <option key={tt.id} value={tt.id}>
                {tt.name_en}
              </option>
            ))}
          </select>
        </Field>

        {/* ── Bio ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>{t("admin.talent.edit.form.bioSection")}</span>
        </div>

        <Field label={t("admin.talent.edit.form.shortBio")} hint={t("admin.talent.edit.form.shortBioHint")}>
          <textarea name="short_bio" rows={3} defaultValue={initial.short_bio ?? ""} placeholder={t("admin.talent.edit.form.shortBioPlaceholder")} style={{ ...inputStyle(), resize: "vertical" }} />
        </Field>

        {/* ── Visibility & status ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>{t("admin.talent.edit.form.statusSection")}</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label={t("admin.talent.edit.form.workflowStatus")} hint={t("admin.talent.edit.form.workflowStatusHint")}>
            <select name="workflow_status" defaultValue={initial.workflow_status} style={inputStyle()}>
              <option value="draft">{t("admin.talent.edit.status.draft")}</option>
              <option value="invited">{t("admin.talent.edit.status.invited")}</option>
              <option value="approved">{t("admin.talent.edit.status.approved")}</option>
              <option value="published">{t("admin.talent.edit.status.published")}</option>
              <option value="hidden">{t("admin.talent.edit.status.hidden")}</option>
            </select>
          </Field>
          <Field label={t("admin.talent.edit.form.profileVisibility")} hint={t("admin.talent.edit.form.profileVisibilityHint")}>
            <select name="visibility" defaultValue={initial.visibility} style={inputStyle()}>
              <option value="hidden">{t("admin.talent.edit.form.visibilityHidden")}</option>
              <option value="public">{t("admin.talent.edit.form.visibilityPublic")}</option>
              <option value="private">{t("admin.talent.edit.form.visibilityPrivate")}</option>
            </select>
          </Field>
          <Field label={t("admin.talent.edit.form.rosterVisibility")} hint={t("admin.talent.edit.form.rosterVisibilityHint")}>
            <select name="agency_visibility" defaultValue={initial.agency_visibility} style={inputStyle()}>
              <option value="roster_only">{t("admin.talent.edit.form.rosterOnly")}</option>
              <option value="site_visible">{t("admin.talent.edit.form.siteVisible")}</option>
              <option value="featured">{t("admin.talent.edit.form.featured")}</option>
            </select>
          </Field>
        </div>

        {/* Save */}
        <div style={{ display: "flex", gap: 10, alignItems: "center", marginTop: 8 }}>
          <button
            type="submit"
            disabled={pending}
            style={{
              background: C.accent,
              color: "#fff",
              border: "none",
              padding: "10px 22px",
              borderRadius: 9,
              fontSize: 14,
              fontWeight: 600,
              fontFamily: F,
              cursor: pending ? "not-allowed" : "pointer",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? t("admin.talent.edit.form.savingBtn") : t("admin.talent.edit.form.saveBtn")}
          </button>
        </div>
      </form>

      {/* ── Right: photo + status sidebar ── */}
      <div style={{ width: 260, flexShrink: 0, display: "flex", flexDirection: "column", gap: 16 }}>
        {/* Three-slot photo block */}
        <ThreeSlotPhotoPanel
          talentId={talentId}
          tenantSlug={tenantSlug}
          initialPhotoUrl={initial.photo_url}
          locale={locale}
        />

        <WorkflowSidebar
          tenantSlug={tenantSlug}
          talentId={talentId}
          agencyVisibility={initial.agency_visibility}
          talentHidden={initial.is_publicly_hidden}
          profileCode={initial.profile_code}
          locale={locale}
        />
      </div>
    </div>
  );
}
