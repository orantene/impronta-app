"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/profile-essentials — Phase 1d body chunk.
// Owns: TalentPhotoEditDrawer, TalentPolaroidsDrawer, TalentCreditsDrawer,
// TalentSkillsDrawer, TalentLimitsDrawer, TalentRateCardDrawer,
// TalentTravelDrawer.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useRef, useState } from "react";
import {
  actionDeleteMediaAssets,
  actionImportFromGoogleDrive,
  actionLoadTalentMediaBundle,
  actionRevertCropToSource,
  actionUploadAndAssignMedia,
} from "@/app/(workspace)/[tenantSlug]/admin/media/actions";
import type { MediaAsset } from "@/components/talent/media-gallery-drawer";
import { MediaGalleryDrawer } from "@/components/talent/media-gallery-drawer";
import { uploadTalentMedia } from "@/lib/client/signed-upload";
import {
  updateSelfCredits,
  updateSelfLimits,
  updateSelfLocation,
  updateSelfRates,
} from "@/lib/server-actions/talent-self-profile-sections";
import { COLORS, FONTS, MY_TALENT_PROFILE, useAdminShell } from "../state";
import {
  CapsLabel,
  Divider,
  DrawerShell,
  FieldRow,
  Icon,
  PrimaryButton,
  SecondaryButton,
  TextArea,
  TextInput,
} from "../primitives";
import { useDashboardText } from "../dashboard-i18n";
import { KvRow, ProfileSectionNotConnected, SaveErrorBanner } from "./shared";

// ─── Photo edit — real MediaGalleryDrawer ─────────────────────────

export function TalentPhotoEditDrawer() {
  const { state, closeDrawer, tenantSlug, bridgeTalentSelfProfile } = useAdminShell();
  const copy = useDashboardText();
  const open = state.drawer.drawerId === "talent-photo-edit";
  const focusSlot = (state.drawer.payload?.focusSlot as "avatar" | "hero" | "gallery") ?? "gallery";

  // Derive talentId: payload wins, then self-profile fallback.
  const talentId = (state.drawer.payload?.talentId as string | undefined)
    ?? bridgeTalentSelfProfile?.id
    ?? null;

  const [assets, setAssets] = useState<MediaAsset[]>([]);
  const [currentAvatarAssetId, setCurrentAvatarAssetId] = useState<string | null>(null);
  const [currentHeroAssetId, setCurrentHeroAssetId] = useState<string | null>(null);
  const loadedForRef = useRef<string | null>(null);

  // Load existing assets when drawer opens for a real talent.
  const loadAssets = useCallback(async (tid: string) => {
    if (loadedForRef.current === tid) return;
    loadedForRef.current = tid;
    const res = await actionLoadTalentMediaBundle(tid);
    if (!res.ok) return;
    const { gallery, card, hero } = res.data;
    const all: MediaAsset[] = [];
    if (card) all.push({ id: card.id, url: card.url, variantKind: "card", sortOrder: 0, sourceMediaAssetId: card.sourceMediaAssetId });
    if (hero) all.push({ id: hero.id, url: hero.url, variantKind: "hero", sortOrder: 0, sourceMediaAssetId: hero.sourceMediaAssetId });
    for (const g of gallery) all.push({ id: g.id, url: g.url, variantKind: "gallery", sortOrder: g.sortOrder, sourceMediaAssetId: g.sourceMediaAssetId });
    setAssets(all);
    setCurrentAvatarAssetId(card?.id ?? null);
    setCurrentHeroAssetId(hero?.id ?? null);
  }, []);

  useEffect(() => {
    if (open && talentId) void loadAssets(talentId);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- loadAssets is a stable useCallback([], []); re-run on open/talentId changes only
  }, [open, talentId]);

  if (!open) return null;

  // When there's no real talentId, show a disabled state.
  if (!talentId || !tenantSlug) {
    return (
      <div style={{
        position: "fixed", inset: 0, zIndex: 9000,
        background: "rgba(11,11,13,0.56)", display: "flex",
        alignItems: "center", justifyContent: "center",
      }}>
        <div style={{
          background: "#FAFAF7", borderRadius: 12, padding: "32px 28px",
          fontFamily: '"Inter", system-ui, sans-serif', fontSize: 14,
          color: "rgba(11,11,13,0.62)", textAlign: "center",
          boxShadow: "0 12px 40px rgba(11,11,13,0.18)",
        }}>
          <div style={{ marginBottom: 10, fontSize: 24 }}>📷</div>
          {copy.t("Photo editing requires a live talent profile.")}
          <div className="mt-4">
            <button type="button" onClick={closeDrawer} style={{
              fontFamily: '"Inter", system-ui, sans-serif', fontSize: 13,
              padding: "8px 18px", borderRadius: 8, cursor: "pointer",
              background: "#0F4F3E", border: "none", color: "#fff",
            }}>
              {copy.t("Close")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <MediaGalleryDrawer
      open={open}
      onOpenChange={(o) => { if (!o) closeDrawer(); }}
      talentId={talentId}
      tenantSlug={tenantSlug}
      assets={assets}
      onAssetsChange={setAssets}
      focusSlot={focusSlot}
      locale={copy.locale}
      currentAvatarAssetId={currentAvatarAssetId}
      currentHeroAssetId={currentHeroAssetId}
      onSetAvatar={async (mediaAssetId) => {
        const { setTalentAvatar } = await import("@/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions");
        const r = await setTalentAvatar(tenantSlug, talentId, mediaAssetId);
        if (r.ok) setCurrentAvatarAssetId(mediaAssetId);
        return r;
      }}
      onSetHero={async (mediaAssetId) => {
        const { setTalentHero } = await import("@/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions");
        const r = await setTalentHero(tenantSlug, talentId, mediaAssetId);
        if (r.ok) setCurrentHeroAssetId(mediaAssetId);
        return r;
      }}
      onAddToPortfolio={async (storagePath) => {
        const { registerPortfolioPhoto } = await import("@/app/(workspace)/[tenantSlug]/admin/roster/[id]/extended-actions");
        const res = await registerPortfolioPhoto(tenantSlug, talentId, { storagePath });
        if (res.ok) return { ok: true, id: res.data?.id };
        return { ok: false, error: res.error };
      }}
      onDeleteAsset={async (mediaAssetId) => {
        const res = await actionDeleteMediaAssets([mediaAssetId]);
        return res;
      }}
      onImportFromDrive={async (driveUrl) => {
        const res = await actionImportFromGoogleDrive(driveUrl, talentId);
        if (!res.ok) return { ok: false, error: res.error };
        return { ok: true, assets: res.data.assets };
      }}
      onUploadFile={async (file, variantKind, sourceMediaAssetId) => {
        const allowed = ["gallery", "card", "hero", "lightbox"] as const;
        const kind = allowed.includes(variantKind as typeof allowed[number])
          ? (variantKind as typeof allowed[number])
          : "gallery";

        // Try the signed-upload pipeline first (compress in browser →
        // PUT direct to Supabase → register). Falls through to the
        // legacy server-resize action on any failure so the upload
        // still completes for files / browsers the new path can't
        // handle (animated GIF, SVG, no canvas, signed PUT 5xx).
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
        if (!fast.fallbackToLegacy) {
          return { ok: false, error: fast.error };
        }

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
  );
}

// ─── Polaroids ───────────────────────────────────────────────────

export function TalentPolaroidsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-polaroids";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Polaroid set"
      description="This polaroid panel is not connected to your live media yet."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="polaroids" />
    </DrawerShell>
  );
}

// ─── Credits ─────────────────────────────────────────────────────

export function TalentCreditsDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-credits";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const [credits, setCredits] = useState(() => MY_TALENT_PROFILE.credits);
  const togglePin = (id: string) =>
    setCredits((prev) => prev.map((c) => c.id === id ? { ...c, pinned: !c.pinned } : c));

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError("No talent profile loaded — reload and try again."); return; }
    setSaving(true);
    setSaveError(null);
    const result = await updateSelfCredits({
      talent_profile_id: talentProfileId,
      credits_data: credits.map((c) => ({ id: c.id, brand: c.brand, type: c.type, credit: c.credit, role: c.role, year: c.year, pinned: c.pinned })),
    });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Credits & tearsheets"
      description="Your work history. Pin up to 3 — they show first to clients. Add new credits as bookings wrap."
      width={620}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save order"}</PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <div className="flex flex-col gap-2">
        {credits.map((c) => (
          <div
            key={c.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ width: 56, fontFamily: FONTS.mono, fontSize: 11 }} className="text-admin-ink-muted">
              {c.year}
            </span>
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
                {c.brand}
                {c.pinned && <span style={{ marginLeft: 6 }} className="text-admin-accent-deep">★</span>}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                {c.type}
                {c.role && <> · {c.role}</>}
                {c.credit && <> · {c.credit}</>}
              </div>
            </div>
            <button
              onClick={() => togglePin(c.id)}
              style={{
                background: "transparent",
                border: `1px solid ${COLORS.borderSoft}`,
                color: c.pinned ? COLORS.accentDeep : COLORS.inkMuted,
                padding: "6px 10px",
                borderRadius: 6,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              {c.pinned ? "★ Pinned" : "Pin"}
            </button>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Skills ─────────────────────────────────────────────────────

export function TalentSkillsDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-skills";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Skills"
      description="This skills panel is not connected to your live profile yet."
      width={560}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="skills" />
    </DrawerShell>
  );
}

// ─── Limits ─────────────────────────────────────────────────────

export function TalentLimitsDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-limits";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const [limits, setLimits] = useState(() => MY_TALENT_PROFILE.limits);
  const removeLimit = (id: string) => setLimits((prev) => prev.filter((l) => l.id !== id));

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError("No talent profile loaded — reload and try again."); return; }
    setSaving(true);
    setSaveError(null);
    const hardLimits = limits.filter((l) => l.enforcement === "hard").map((l) => l.label);
    const softLimits = limits.filter((l) => l.enforcement === "soft").map((l) => l.label);
    const result = await updateSelfLimits({ talent_profile_id: talentProfileId, limits_data: { hardLimits, softLimits } });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Wardrobe & lifestyle limits"
      description="Hard limits block any pitch with that brief. Soft limits trigger an extra confirmation step before you're put forward."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <div className="flex flex-col gap-2">
        {limits.map((l) => (
          <div
            key={l.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: l.enforcement === "hard" ? COLORS.red : COLORS.amber, flexShrink: 0, }}
            />
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13.5, fontWeight: 500 }} className="text-admin-ink">
                {l.label}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2, textTransform: "capitalize" }} className="text-admin-ink-muted">
                {l.category} · {l.enforcement === "hard" ? "Hard limit" : "Needs confirmation"}
              </div>
            </div>
            <button
              onClick={() => removeLimit(l.id)}
              style={{
                background: "transparent",
                border: "none",
                color: COLORS.inkMuted,
                fontFamily: FONTS.body,
                fontSize: 11.5,
                cursor: "pointer",
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, padding: "12px 14px", border: `1px solid rgba(15,79,62,0.18)`, borderRadius: 10, fontFamily: FONTS.body, fontSize: 12.5, lineHeight: 1.55 }} className="bg-admin-surface-alt text-admin-ink">
        Agencies on Tulala are contractually bound to honour your limits. If a client brief
        violates a hard limit, the offer is auto-blocked before it ever reaches your inbox.
      </div>
    </DrawerShell>
  );
}

// ─── Rate card ──────────────────────────────────────────────────

export function TalentRateCardDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-rate-card";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const rc = MY_TALENT_PROFILE.rateCard;
  const [vis, setVis] = useState(rc.visibility);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const visOptions: Array<{ value: typeof rc.visibility; label: string; hint: string }> = [
    { value: "public", label: "Public", hint: "Shown on your public profile to anyone." },
    { value: "agency-only", label: "Agency only", hint: "Only your agencies and confirmed clients see ranges." },
    { value: "on-request", label: "On request", hint: "Hidden — clients have to inquire to get a quote." },
  ];

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError("No talent profile loaded — reload and try again."); return; }
    setSaving(true);
    setSaveError(null);
    const result = await updateSelfRates({ talent_profile_id: talentProfileId, rate_card_visibility: vis });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Rate card"
      description="Reference ranges, not final fees. The actual offer is per-booking and includes usage."
      width={580}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save rate card"}</PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <CapsLabel>Visibility</CapsLabel>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6, marginBottom: 16 }}>
        {visOptions.map((o) => (
          <button
            key={o.value}
            onClick={() => setVis(o.value)}
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 10,
              padding: "10px 12px",
              background: vis === o.value ? COLORS.surfaceAlt : "#fff",
              border: `1px solid ${vis === o.value ? "rgba(15,79,62,0.32)" : COLORS.borderSoft}`,
              borderRadius: 10,
              cursor: "pointer",
              textAlign: "left",
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: "50%", border: `1.5px solid ${vis === o.value ? COLORS.accentDeep : COLORS.inkMuted}`, background: vis === o.value ? COLORS.accentDeep : "transparent", flexShrink: 0, marginTop: 2, }}
            />
            <div>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
                {o.label}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
                {o.hint}
              </div>
            </div>
          </button>
        ))}
      </div>
      <Divider label="Rate lines" />
      <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 10 }}>
        {rc.lines.map((line, i) => (
          <div
            key={i}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 160px",
              gap: 8,
              padding: "10px 12px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 8,
            }}
          >
            <div>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500 }} className="text-admin-ink">
                {line.label}
              </div>
              {line.note && (
                <div style={{ fontFamily: FONTS.body, fontSize: 11, marginTop: 2 }} className="text-admin-ink-muted">
                  {line.note}
                </div>
              )}
            </div>
            <div style={{ fontFamily: FONTS.mono, fontSize: 12.5, textAlign: "right", alignSelf: "center" }} className="text-admin-ink">
              {line.range}
            </div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14 }}>
        <FieldRow label="Usage policy" hint="One sentence on what's included and what triggers an upcharge.">
          <TextArea defaultValue={rc.usagePolicy} rows={3} />
        </FieldRow>
      </div>
    </DrawerShell>
  );
}

// ─── Travel & work auth ─────────────────────────────────────────

export function TalentTravelDrawer() {
  const { state, closeDrawer, bridgeTalentSelfProfile } = useAdminShell();
  const open = state.drawer.drawerId === "talent-travel";
  const talentProfileId = bridgeTalentSelfProfile?.id ?? null;
  const t = MY_TALENT_PROFILE.travel;

  const [basedIn, setBasedIn] = useState(t.basedIn);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!talentProfileId) { setSaveError("No talent profile loaded — reload and try again."); return; }
    setSaving(true);
    setSaveError(null);
    const result = await updateSelfLocation({ talent_profile_id: talentProfileId, home_base: basedIn });
    setSaving(false);
    if (!result.ok) { setSaveError(result.error); return; }
    closeDrawer();
  };

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Travel & work authorization"
      description="What countries can book you without visa drama, plus how far you'll fly for a job."
      width={560}
      footer={
        <>
          <SecondaryButton onClick={closeDrawer}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleSave} disabled={saving}>{saving ? "Saving…" : "Save"}</PrimaryButton>
        </>
      }
    >
      {saveError && <SaveErrorBanner error={saveError} onDismiss={() => setSaveError(null)} />}
      <div className="flex flex-col gap-3.5">
        <FieldRow label="Based in">
          <TextInput value={basedIn} onChange={(e) => setBasedIn(e.target.value)} />
        </FieldRow>
        <KvRow label="Willing to travel" value={String(t.willingTravel)} />
        <KvRow label="Home radius" value={t.homeRadius ?? "—"} />
        <KvRow label="Preferred travel class" value={t.preferredClass ?? "economy"} />
        <Divider label="Work authorization" />
        <div className="flex flex-col gap-1.5">
          {t.workAuth.map((w, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "10px 12px",
                background: "#fff",
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 8,
              }}
            >
              <Icon name="check" size={12} color={COLORS.green} />
              <span style={{ fontFamily: FONTS.body, fontSize: 13, flex: 1 }} className="text-admin-ink">{w}</span>
            </div>
          ))}
        </div>
        <Divider label="Passports" />
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {t.passports.map((p, i) => (
            <span
              key={i}
              style={{
                padding: "5px 10px",
                background: COLORS.surfaceAlt,
                border: `1px solid rgba(15,79,62,0.24)`,
                borderRadius: 999,
                fontFamily: FONTS.body,
                fontSize: 12,
                color: COLORS.ink,
              }}
            >
              {p}
            </span>
          ))}
        </div>
        {t.lastTrip && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12 }} className="text-admin-ink-muted">
            Last trip: {t.lastTrip}
          </div>
        )}
      </div>
    </DrawerShell>
  );
}
