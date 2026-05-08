"use client";

import * as React from "react";
import { useActionState, useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  type RosterTalentEditState,
  type RegisterPhotoResult,
  updateRosterTalentProfile,
  updateRosterTalentWorkflow,
  registerRosterTalentPhoto,
} from "./actions";
import { MediaGalleryDrawer } from "@/components/talent/media-gallery-drawer";
import type { MediaAsset } from "@/components/talent/media-gallery-drawer";
import { setTalentAvatar, setTalentHero } from "./extended-actions";
import { actionUploadAndAssignMedia, actionDeleteMediaAssets, actionLoadTalentMediaBundle } from "@/app/(workspace)/[tenantSlug]/admin/media/actions";

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
}: {
  talentId: string;
  tenantSlug: string;
  initialUrl: string | null;
  displayName: string;
}) {
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
      setStage({ kind: "error", message: "Image must be under 20 MB." });
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
  }, [talentId, tenantSlug, supabase]);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
      {/* Avatar circle */}
      <button
        type="button"
        title="Change photo"
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
          {uploading ? "…" : "Change"}
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
        {uploading ? "Working…" : photoUrl ? "Change photo" : "Add photo"}
      </button>

      <UploadStatus stage={stage} />
    </div>
  );
}

function UploadStatus({
  stage,
}: {
  stage:
    | { kind: "idle" }
    | { kind: "preparing" }
    | { kind: "uploading" }
    | { kind: "registering" }
    | { kind: "saved"; mediaId: string }
    | { kind: "error"; message: string };
}) {
  if (stage.kind === "idle") return null;

  const steps: Array<{ key: "preparing" | "uploading" | "registering"; label: string }> = [
    { key: "preparing",   label: "Prepare image" },
    { key: "uploading",   label: "Upload to storage" },
    { key: "registering", label: "Save to database" },
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
          Saved ✓ <span style={{ color: C.inkDim, fontWeight: 400 }}>(id {stage.mediaId.slice(0, 8)}…)</span>
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

// ─── Workflow status helpers ───────────────────────────────────────────────────

const WORKFLOW_META: Record<string, { label: string; dot: string; bg: string; textColor: string }> = {
  draft:     { label: "Draft",     dot: "rgba(11,11,13,0.35)", bg: "rgba(11,11,13,0.05)", textColor: C.inkMuted },
  invited:   { label: "Invited",   dot: "#3B5E9E",              bg: "rgba(59,94,158,0.10)", textColor: "#3B5E9E" },
  approved:  { label: "Approved",  dot: C.green,                bg: C.greenSoft,            textColor: C.greenDeep },
  published: { label: "Published", dot: C.green,                bg: C.greenSoft,            textColor: C.greenDeep },
  hidden:    { label: "Hidden",    dot: C.amber,                bg: C.amberSoft,            textColor: C.amber },
};

function WorkflowBadge({ status }: { status: string }) {
  const m = WORKFLOW_META[status] ?? WORKFLOW_META.draft;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "3px 9px",
        borderRadius: 999,
        background: m.bg,
        color: m.textColor,
        fontSize: 11.5,
        fontWeight: 600,
        fontFamily: F,
      }}
    >
      <span style={{ width: 5, height: 5, borderRadius: "50%", background: m.dot }} />
      {m.label}
    </span>
  );
}

// ─── Three-slot photo panel for standalone form ───────────────────────────────

function ThreeSlotPhotoPanel({
  talentId,
  tenantSlug,
  initialPhotoUrl,
}: {
  talentId: string;
  tenantSlug: string;
  initialPhotoUrl: string | null;
}) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialPhotoUrl);
  const [heroUrl, setHeroUrl] = useState<string | null>(null);
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
      const { card, cover, gallery } = res.data;
      if (card) { all.push({ id: card.id, url: card.url, variantKind: "card", sortOrder: 0 }); setAvatarUrl(card.url); }
      if (cover) all.push({ id: cover.id, url: cover.url, variantKind: "banner", sortOrder: 0 });
      for (const g of gallery) all.push({ id: g.id, url: g.url, variantKind: "gallery", sortOrder: g.sortOrder });
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
          Photos
        </p>
        <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
          {/* Avatar slot */}
          <SlotButton
            label="Avatar" hint="1:1"
            imageUrl={avatarUrl}
            squareSize={72}
            onClick={() => { setFocusSlot("avatar"); setGalleryOpen(true); }}
          />
          {/* Hero slot */}
          <SlotButton
            label="Hero" hint="4:5"
            imageUrl={heroUrl}
            squareSize={58}
            heightPx={72}
            onClick={() => { setFocusSlot("hero"); setGalleryOpen(true); }}
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
            <span style={{ fontFamily: F, fontSize: 10, fontWeight: 600, color: C.accent }}>Gallery</span>
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
          onSetAvatar={async (mediaAssetId) => {
            const res = await setTalentAvatar(tenantSlug, talentId, mediaAssetId);
            if (res.ok) {
              const hit = assets.find(a => a.id === mediaAssetId);
              if (hit) setAvatarUrl(hit.url);
            }
            return res;
          }}
          onSetHero={async (mediaAssetId) => {
            const res = await setTalentHero(tenantSlug, talentId, mediaAssetId);
            if (res.ok) {
              const hit = assets.find(a => a.id === mediaAssetId);
              if (hit) setHeroUrl(hit.url);
            }
            return res;
          }}
          onAddToPortfolio={async (storagePath) => {
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
          onUploadFile={async (file, variantKind) => {
            const fd = new FormData();
            fd.append("file", file);
            const allowed = ["gallery", "card", "banner", "lightbox"] as const;
            const kind = allowed.includes(variantKind as typeof allowed[number])
              ? (variantKind as typeof allowed[number])
              : "gallery";
            const res = await actionUploadAndAssignMedia(fd, talentId, kind);
            if (!res.ok) return { ok: false, error: res.error };
            return {
              ok: true,
              asset: { id: res.data.id, url: res.data.publicUrl, variantKind: kind, sortOrder: 0 },
            };
          }}
        />
      )}
    </>
  );
}

function SlotButton({
  label, hint, imageUrl, squareSize, heightPx, onClick,
}: {
  label: string;
  hint: string;
  imageUrl: string | null;
  squareSize: number;
  heightPx?: number;
  onClick: () => void;
}) {
  const h = heightPx ?? squareSize;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }}>
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
      <div style={{ textAlign: "center" }}>
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
  workflowStatus,
  visibility,
  agencyVisibility,
  profileCode,
}: {
  tenantSlug: string;
  talentId: string;
  workflowStatus: string;
  visibility: string;
  agencyVisibility: string;
  profileCode: string | null;
}) {
  const router = useRouter();
  const boundAction = updateRosterTalentWorkflow.bind(null, tenantSlug, talentId);
  const [state, action, pending] = useActionState<RosterTalentEditState, FormData>(
    boundAction,
    undefined,
  );

  // Refresh page data when workflow action succeeds so sidebar reflects new state.
  useEffect(() => {
    if (state?.success) router.refresh();
  }, [state, router]);

  // Approve: set workflow_status=approved, visibility=public
  // Hide: set workflow_status=draft, visibility=hidden
  const isLive = workflowStatus === "published" || workflowStatus === "approved";

  const publicUrl = profileCode ? `https://tulala.digital/t/${profileCode}` : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
        fontFamily: F,
      }}
    >
      {/* Status card */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
          Status
        </div>
        <div style={{ marginBottom: 12 }}>
          <WorkflowBadge status={workflowStatus} />
        </div>
        <div style={{ fontSize: 11.5, color: C.inkMuted, marginBottom: 14, lineHeight: 1.5 }}>
          {isLive
            ? "This profile is visible on your site."
            : "Profile is in draft — not visible to clients."}
        </div>

        {state?.error && (
          <div
            role="alert"
            style={{
              background: C.errorSoft,
              border: `1px solid rgba(192,57,43,0.20)`,
              borderRadius: 7,
              padding: "8px 11px",
              fontSize: 12,
              color: C.error,
              marginBottom: 10,
            }}
          >
            {state.error}
          </div>
        )}

        {!isLive ? (
          <form action={action}>
            <input type="hidden" name="workflow_status" value="approved" />
            <input type="hidden" name="visibility" value="public" />
            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                background: C.accent,
                color: "#fff",
                border: "none",
                padding: "9px 0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 600,
                fontFamily: F,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Approving…" : "Approve & publish"}
            </button>
          </form>
        ) : (
          <form action={action}>
            <input type="hidden" name="workflow_status" value="draft" />
            <input type="hidden" name="visibility" value="hidden" />
            <button
              type="submit"
              disabled={pending}
              style={{
                width: "100%",
                background: "transparent",
                color: C.inkMuted,
                border: `1px solid ${C.border}`,
                padding: "9px 0",
                borderRadius: 8,
                fontSize: 13,
                fontWeight: 500,
                fontFamily: F,
                cursor: pending ? "not-allowed" : "pointer",
                opacity: pending ? 0.6 : 1,
              }}
            >
              {pending ? "Hiding…" : "Move to draft"}
            </button>
          </form>
        )}
      </div>

      {/* Agency visibility card */}
      <div
        style={{
          background: C.card,
          border: `1px solid ${C.border}`,
          borderRadius: 14,
          padding: "16px 18px",
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 10 }}>
          Roster visibility
        </div>
        <div style={{ fontSize: 12.5, color: C.inkMuted, marginBottom: 4, lineHeight: 1.5 }}>
          {agencyVisibility === "featured"
            ? "Featured on your site"
            : agencyVisibility === "site_visible"
              ? "Site visible (storefront)"
              : "Roster only (not on storefront)"}
        </div>
        <div style={{ fontSize: 11, color: C.inkDim, lineHeight: 1.4 }}>
          Change this in the main edit form below.
        </div>
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
            Public profile
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
}: {
  tenantSlug: string;
  talentId: string;
  initial: TalentEditInitial;
  talentTypes: TalentTypeOption[];
}) {
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
          Profile details
        </div>

        {state?.error && (
          <div role="alert" style={{ background: C.errorSoft, border: `1px solid rgba(192,57,43,0.20)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.error, fontFamily: F }}>
            {state.error}
          </div>
        )}
        {state?.success && (
          <div role="status" style={{ background: C.greenSoft, border: `1px solid rgba(46,125,91,0.20)`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: C.greenDeep, fontFamily: F }}>
            Saved successfully.
          </div>
        )}

        {/* ── Identity ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginBottom: 2 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>Identity</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="First name">
            <input name="first_name" autoComplete="off" defaultValue={initial.first_name ?? ""} style={inputStyle()} />
          </Field>
          <Field label="Last name">
            <input name="last_name" autoComplete="off" defaultValue={initial.last_name ?? ""} style={inputStyle()} />
          </Field>
        </div>

        <Field label="Display name" required hint="This is the name shown publicly on the roster and storefront.">
          <input name="display_name" required autoComplete="off" defaultValue={initial.display_name} style={inputStyle()} />
        </Field>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Gender">
            <select name="gender" defaultValue={initial.gender ?? ""} style={inputStyle()}>
              <option value="">— none —</option>
              <option value="woman">Woman</option>
              <option value="man">Man</option>
              <option value="non_binary">Non-binary</option>
              <option value="other">Other</option>
            </select>
          </Field>
          <Field label="Date of birth">
            <input name="date_of_birth" type="date" autoComplete="off" defaultValue={initial.date_of_birth ?? ""} style={inputStyle()} />
          </Field>
        </div>

        {/* ── Contact ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>Contact</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <Field label="Email" hint="Used for invite / booking comms. Won't be shown publicly.">
            <input name="invitation_email" type="email" autoComplete="off" defaultValue={initial.invitation_email ?? ""} placeholder="talent@example.com" style={inputStyle()} />
          </Field>
          <Field label="Phone">
            <input name="phone" type="tel" autoComplete="off" defaultValue={initial.phone ?? ""} placeholder="+1 555 000 0000" style={inputStyle()} />
          </Field>
        </div>

        <Field label="Instagram" hint="Handle only — e.g. @sofiamodel. Shown as a link on the profile.">
          <input name="instagram" type="text" autoComplete="off" defaultValue={initial.instagram ?? ""} placeholder="@handle" style={inputStyle()} />
        </Field>

        {/* ── Physical ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>Physical</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: 14, alignItems: "end" }}>
          <Field label="Height (cm)" hint="e.g. 175">
            <input name="height_cm" type="number" min={50} max={280} step={0.5} autoComplete="off"
              defaultValue={initial.height_cm != null ? String(initial.height_cm) : ""} placeholder="cm"
              style={{ ...inputStyle(false), width: 100 }}
            />
          </Field>
          <Field label="Home city" hint="Free-text city. Shown on roster card until a full location is set.">
            <input name="home_city_text" autoComplete="off" defaultValue={initial.home_city_text ?? ""} placeholder="e.g. Playa del Carmen" style={inputStyle()} />
          </Field>
        </div>

        {/* ── Primary talent type ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>Role</span>
        </div>

        <Field label="Primary talent type" hint="Drives search and filtering on your storefront.">
          <select name="talent_type_term_id" defaultValue={initial.primary_type_term_id ?? ""} style={inputStyle()}>
            <option value="">— none —</option>
            {talentTypes.map((t) => (
              <option key={t.id} value={t.id}>{t.name_en}</option>
            ))}
          </select>
        </Field>

        {/* ── Bio ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>Bio</span>
        </div>

        <Field label="Short bio" hint="2–3 lines. Shown on talent cards and inquiry threads.">
          <textarea name="short_bio" rows={3} defaultValue={initial.short_bio ?? ""} placeholder="Brief intro for clients." style={{ ...inputStyle(), resize: "vertical" }} />
        </Field>

        {/* ── Visibility & status ── */}
        <div style={{ borderBottom: `1px solid rgba(11,11,13,0.06)`, paddingBottom: 4, marginTop: 6 }}>
          <span style={{ fontFamily: F, fontSize: 10.5, fontWeight: 700, letterSpacing: 0.6, textTransform: "uppercase", color: C.inkDim }}>Status & visibility</span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 14 }}>
          <Field label="Workflow status" hint="Controls dashboard stage.">
            <select name="workflow_status" defaultValue={initial.workflow_status} style={inputStyle()}>
              <option value="draft">Draft</option>
              <option value="invited">Invited</option>
              <option value="approved">Approved</option>
              <option value="published">Published</option>
              <option value="hidden">Hidden</option>
            </select>
          </Field>
          <Field label="Profile visibility" hint="Whether the public URL is reachable.">
            <select name="visibility" defaultValue={initial.visibility} style={inputStyle()}>
              <option value="hidden">Hidden</option>
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </Field>
          <Field label="Roster visibility" hint="Where it appears on your site.">
            <select name="agency_visibility" defaultValue={initial.agency_visibility} style={inputStyle()}>
              <option value="roster_only">Roster only</option>
              <option value="site_visible">Site visible</option>
              <option value="featured">Featured</option>
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
            {pending ? "Saving…" : "Save changes"}
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
        />

        <WorkflowSidebar
          tenantSlug={tenantSlug}
          talentId={talentId}
          workflowStatus={initial.workflow_status}
          visibility={initial.visibility}
          agencyVisibility={initial.agency_visibility}
          profileCode={initial.profile_code}
        />
      </div>
    </div>
  );
}
