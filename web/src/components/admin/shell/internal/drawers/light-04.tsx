"use client";
import { logServerError } from "@/lib/server/safe-error";

import React, { useState, useEffect, useRef, useMemo, useId, useTransition, useCallback, startTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  BioTone,
  COLORS,
  ACCENT_FALLBACK,
  DEFAULT_WATERMARK_PRESET,
  DrawerShell,
  FONTS,
  FieldRow,
  PendingTalent,
  Personality,
  PhotoGalleryPro,
  PrimaryButton,
  ProfileLanguage,
  SecondaryButton,
  Section,
  StandardFooter,
  TAXONOMY,
  TextArea,
  TextInput,
  ToggleControl,
  WatermarkPositionGrid,
  WatermarkPreset,
  WatermarkPreviewCard,
  actionSetMediaWatermarkOverride,
  loadAgencyBrandingSettings,
  meetsPlan,
  updateAgencyBranding,
  uploadAgencyLogo,
  useAdminShell,
  useQueuedRouterRefresh
} from "./drawer-shared";
import { useDashboardText } from "../dashboard-i18n";

// Phase 1d (remediation §4): 3 leaf drawer bodies, byte-for-byte from
// drawers.tsx; referenced ONLY by the DrawerSwitch barrel (zero cross-edges).

export function TalentApprovalsDrawer() {
  const { state, closeDrawer, openDrawer, toast, pendingTalent, resolveApproval } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const open = state.drawer.drawerId === "talent-approvals";

  // Read the queue from proto state so approve/reject changes propagate
  // to topbar nav badges + mobile bottom nav + Settings row immediately.
  const queue = pendingTalent;
  const [active, setActive] = useState<string | null>(queue[0]?.id ?? null);
  const cur = queue.find(p => p.id === active);
  const [rejectModalFor, setRejectModalFor] = useState<{ id: string; name: string } | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  // If the active item gets resolved, advance to the next one.
  useEffect(() => {
    if (active && !queue.some(p => p.id === active)) {
      setActive(queue[0]?.id ?? null);
    }
  }, [queue, active]);

  // Compose mock photos for review — uses talent's thumb + variants since
  // we don't have real submitted photos yet. Real impl pulls from the
  // pending_submissions.photos[] array.
  const composePhotos = (p: PendingTalent): string[] => {
    if (!p.thumb.includes("?img=")) return [p.thumb];
    const base = parseInt(p.thumb.match(/img=(\d+)/)?.[1] ?? "5", 10);
    return Array.from({ length: Math.min(p.photoCount, 5) })
      .map((_, i) => p.thumb.replace(/img=\d+/, `img=${(base + i * 7) % 70 + 1}`));
  };

  const handleApprove = (p: PendingTalent) => {
    toast(`${p.name} ${tt("approved · profile created")}`);
    resolveApproval(p.id);
    openDrawer("talent-profile-shell", {
      mode: "edit-admin",
      seed: {
        stageName: p.name,
        primaryType: p.childTypes[0],
        secondaryTypes: p.childTypes.slice(1),
        homeBase: p.city,
        photoCount: p.photoCount,
        fields: p.fields,
        languages: p.languages.map<ProfileLanguage>((l, i) => ({
          language: l, level: i === 0 ? "native" : "fluent",
        })),
      },
    });
  };

  const handleRequestChanges = (p: PendingTalent) => {
    toast(
      copy.isSpanish
        ? `Cambios solicitados a ${p.name}. Recibirán un correo.`
        : `Asked ${p.name} for changes. They'll get an email.`,
    );
    // Stays in queue with state flag in real impl; for prototype just toast.
  };

  const openRejectModal = (p: PendingTalent) => {
    setRejectReason("");
    setRejectModalFor({ id: p.id, name: p.name });
  };
  const confirmReject = () => {
    if (!rejectModalFor) return;
    if (!rejectReason.trim()) {
      toast(tt("Please add a reason. Talent will see it."));
      return;
    }
    toast(`${tt("Rejected")} ${rejectModalFor.name} · ${tt("reason sent")}`);
    resolveApproval(rejectModalFor.id);
    setRejectModalFor(null);
    setRejectReason("");
  };

  return (
    <>
      <DrawerShell
        open={open}
        onClose={closeDrawer}
        title={tt("Pending approvals")}
        description={queue.length === 0 ? tt("All caught up.") : `${queue.length} ${tt("talent waiting for review.")}`}
        width={620}
        footer={
          cur ? (
            <>
              <SecondaryButton onClick={() => handleRequestChanges(cur)}>{tt("Request changes")}</SecondaryButton>
              <SecondaryButton onClick={() => openRejectModal(cur)}>{tt("Reject")}</SecondaryButton>
              <PrimaryButton onClick={() => handleApprove(cur)}>{tt("Approve & open profile")}</PrimaryButton>
            </>
          ) : <SecondaryButton onClick={closeDrawer}>{tt("Close")}</SecondaryButton>
        }
      >
        {queue.length === 0 ? (
          <div style={{ padding: "32px 16px", textAlign: "center", borderRadius: 12, fontFamily: FONTS.body }} className="bg-admin-success-soft text-admin-success-deep">
            <div style={{ fontSize: 24, marginBottom: 8 }}>✓</div>
            <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>{tt("All caught up")}</div>
            <div className="text-admin-ink-muted text-xs">
              {tt("New self-registrations will land here. You'll get a notification too.")}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-2.5">
            {queue.map(p => {
              const isActive = active === p.id;
              const parent = TAXONOMY.find(x => x.id === p.parentCategory);
              const photos = composePhotos(p);
              return (
                <button key={p.id} type="button" onClick={() => setActive(p.id)} style={{
                  background: isActive ? "rgba(15,79,62,0.04)" : "#fff",
                  border: `1.5px solid ${isActive ? COLORS.accent : COLORS.borderSoft}`,
                  borderRadius: 12, padding: 12,
                  cursor: "pointer", textAlign: "left", fontFamily: FONTS.body,
                  display: "flex", flexDirection: "column", gap: 10,
                }}>
                  <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                    <span style={{
                      width: 48, height: 48, borderRadius: "50%", flexShrink: 0,
                      background: `url(${p.thumb}) center/cover, ${COLORS.surfaceAlt}`,
                    }} />
                    <div className="flex-1 min-w-0">
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <span className="text-admin-ink text-sm font-semibold">{p.name}</span>
                        <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 8px", borderRadius: 999 }} className="bg-admin-amber-soft text-admin-amber-deep">{tt("Pending")} · {p.submittedAgo}</span>
                      </div>
                      <div style={{ fontSize: 12, marginBottom: 4 }} className="text-admin-ink-muted">
                        {parent?.emoji} {parent?.label} · {p.city}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 4 }}>
                        {p.childTypes.map(t => {
                          const c = parent?.children.find(x => x.id === t);
                          return c ? (
                            <span key={t} style={{
                              fontSize: 10.5, fontWeight: 500,
                              padding: "2px 8px", borderRadius: 999,
                              background: "rgba(11,11,13,0.05)", color: COLORS.inkMuted,
                            }}>{c.label}</span>
                          ) : null;
                        })}
                      </div>
                      <div className="text-admin-ink-dim text-admin-11">
                        {p.photoCount} {copy.isSpanish ? (p.photoCount === 1 ? "foto" : "fotos") : `photo${p.photoCount === 1 ? "" : "s"}`} · {p.languages.join(" · ")}
                      </div>
                    </div>
                  </div>
                  {/* Photo strip — review actual submitted photos at a glance */}
                  {isActive && photos.length > 0 && (
                    <div style={{ display: "flex", gap: 4, overflowX: "auto", scrollbarWidth: "none", marginLeft: 60 }}>
                      {photos.map((src, i) => (
                        <div key={i} style={{
                          flexShrink: 0,
                          width: 56, aspectRatio: "3 / 4", borderRadius: 6,
                          background: `url(${src}) center/cover, ${COLORS.surfaceAlt}`,
                          border: `1px solid ${COLORS.borderSoft}`,
                        }} />
                      ))}
                      {p.photoCount > photos.length && (
                        <div style={{ flexShrink: 0, width: 56, aspectRatio: "3 / 4", borderRadius: 6, border: `1px dashed ${COLORS.borderSoft}`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }} className="text-admin-ink-muted">+{p.photoCount - photos.length}</div>
                      )}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </DrawerShell>

      {/* Rejection reason modal */}
      {rejectModalFor && (
        <div
          onClick={() => setRejectModalFor(null)}
          style={{
            position: "fixed", inset: 0, zIndex: 220,
            background: "rgba(11,11,13,0.42)", backdropFilter: "blur(6px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONTS.body,
          }}
        >
          <div onClick={(e) => e.stopPropagation()} style={{
            width: "calc(100% - 48px)", maxWidth: 460,
            background: "#fff", borderRadius: 16, padding: 22,
            boxShadow: "0 24px 80px -20px rgba(11,11,13,0.45)",
          }}>
            <div style={{ fontFamily: FONTS.display, fontSize: 18, fontWeight: 600, letterSpacing: -0.2, marginBottom: 6 }} className="text-admin-ink">
              {tt("Reject")} {rejectModalFor.name}?
            </div>
            <div style={{ fontSize: 12.5, marginBottom: 14, lineHeight: 1.5 }} className="text-admin-ink-muted">
              {tt("Talent will receive your reason by email. Be specific so they can resubmit.")}
            </div>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder={tt("e.g. Photos don't meet the quality bar. Please resubmit with higher resolution shots.")}
              rows={4}
              autoFocus
              style={{
                width: "100%", boxSizing: "border-box", padding: "10px 12px",
                borderRadius: 10, border: `1px solid ${COLORS.border}`,
                fontFamily: FONTS.body, fontSize: 13, color: COLORS.ink, outline: "none",
                resize: "vertical", marginBottom: 14,
              }}
            />
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
              <button type="button" onClick={() => setRejectModalFor(null)} style={{
                padding: "9px 16px", borderRadius: 999, border: `1px solid ${COLORS.border}`,
                background: "transparent", color: COLORS.ink,
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600, cursor: "pointer",
              }}>{tt("Cancel")}</button>
              <button type="button" onClick={confirmReject} disabled={!rejectReason.trim()} style={{
                padding: "9px 16px", borderRadius: 999, border: "none",
                background: rejectReason.trim() ? COLORS.red : "rgba(11,11,13,0.10)",
                color: rejectReason.trim() ? "#fff" : COLORS.inkDim,
                fontFamily: FONTS.body, fontSize: 12.5, fontWeight: 600,
                cursor: rejectReason.trim() ? "pointer" : "default",
              }}>{tt("Send rejection")}</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ════════════════════════════════════════════════════════════════════
// Phase 4 +30 — premium editor components
// (Identity, SkillsPro, BioTone, Personality, PhotoGalleryPro,
//  HelloReelEditor, AlbumsEditorPro, SeasonalEditor, RecurringEditor,
//  PackageRatesEditor, PastClientsEditor, NextTierCoach,
//  TemplatesPicker, InviteTrackingPanel)
// ════════════════════════════════════════════════════════════════════


export function BrandingDrawer() {
  const { state, closeDrawer, openUpgrade, toast, tenantSlug, effectiveTenant, adminBasePath } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const queueRouterRefresh = useQueuedRouterRefresh();
  const isStudioPlus = meetsPlan(state.plan, "studio");

  const [tagline, setTagline]         = useState("");
  const [description, setDescription] = useState("");
  const [primaryColor, setPrimaryColor] = useState("#0B0B0D");
  // Seed from the raw hex, never COLORS.accent — that's now a var() and an
  // <input type="color"> would render black and drop the value on save.
  const [accentColor, setAccentColor]   = useState(ACCENT_FALLBACK);

  const logoFileRef = useRef<HTMLInputElement | null>(null);
  const [logoPreview, setLogoPreview]   = useState<string | null>(null);
  const [logoFile, setLogoFile]         = useState<File | null>(null);
  const [logoFileName, setLogoFileName] = useState<string>(tt("No logo uploaded"));
  const [isUploadingLogo, setIsUploadingLogo] = useState(false);
  const [loadingSettings, setLoadingSettings] = useState(true);

  const [wm, setWm] = useState<WatermarkPreset>({ ...DEFAULT_WATERMARK_PRESET });
  const setWmField = <K extends keyof WatermarkPreset>(k: K, v: WatermarkPreset[K]) =>
    setWm(prev => ({ ...prev, [k]: v }));

  const [isSaving, setIsSaving] = useState(false);

  // Load saved branding settings on open
  useEffect(() => {
    if (!tenantSlug) { setLoadingSettings(false); return; }
    void (async () => {
      try {
        const result = await loadAgencyBrandingSettings();
        if (result.ok) {
          const d = result.data;
          if (d.logoUrl) { setLogoPreview(d.logoUrl); setLogoFileName(tt("Saved logo")); }
          if (d.primaryColor) setPrimaryColor(d.primaryColor);
          if (d.accentColor) setAccentColor(d.accentColor);
          if (d.tagline) setTagline(d.tagline);
          if (d.description) setDescription(d.description);
          if (d.watermarkPreset) setWm(d.watermarkPreset);
        }
      } finally {
        setLoadingSettings(false);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- mount-only: load branding settings once; server action has no deps that should trigger a re-fetch
  }, []);

  const onLogoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setLogoFile(file);
    setLogoFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => setLogoPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
  };

  const onSave = async () => {
    if (isSaving) return;
    if (!tenantSlug) {
      toast(tt("Branding saved (demo)"));
      closeDrawer();
      return;
    }
    setIsSaving(true);
    try {
      let logoUrl: string | undefined;
      if (logoFile) {
        setIsUploadingLogo(true);
        const upResult = await uploadAgencyLogo({ file: logoFile });
        setIsUploadingLogo(false);
        if (!upResult.ok) { toast(upResult.error || tt("Logo upload failed.")); setIsSaving(false); return; }
        logoUrl = upResult.logoUrl;
      }
      const result = await updateAgencyBranding({
        tagline: tagline.trim() || undefined,
        description: description.trim() || undefined,
        primary_color: /^#[0-9a-fA-F]{6}$/u.test(primaryColor) ? primaryColor : undefined,
        accent_color: /^#[0-9a-fA-F]{6}$/u.test(accentColor) ? accentColor : undefined,
        logo_url: logoUrl,
        watermark_preset: isStudioPlus ? wm : undefined,
      });
      if (!result.ok) { toast(result.error || tt("Couldn't save. Try again.")); return; }
      toast(tt("Branding saved"));
      queueRouterRefresh();
      closeDrawer();
    } catch (err) {
      logServerError("brandingdrawer_save", err);
      toast(tt("Couldn't save. Try again."));
    } finally {
      setIsSaving(false); setIsUploadingLogo(false);
    }
  };

  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={tt("Branding")}
      description={tt("Logo, voice, brand colors. What clients see across emails and storefront.")}
      width={580}
      footer={<StandardFooter onSave={onSave} saveLabel={isSaving ? (isUploadingLogo ? tt("Uploading…") : tt("Saving…")) : loadingSettings ? tt("Loading…") : tt("Save")} />}
    >
      <Section title={tt("Logo & icon")}>
        <FieldRow label={tt("Wordmark")} hint={tt("PNG, JPEG, WebP or SVG. Used in storefront header and emails.")}>
          <div style={{
            border: `1px dashed ${COLORS.border}`, borderRadius: 10, padding: 18,
            display: "flex", alignItems: "center", gap: 14, background: "#fff",
          }}>
            {logoPreview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={logoPreview} alt="logo preview" style={{
                maxWidth: 140, maxHeight: 56, width: "auto", height: "auto",
                objectFit: "contain", objectPosition: "left center",
                borderRadius: 8, background: COLORS.surfaceAlt, padding: 4, flexShrink: 0,
              }} />
            ) : (
              <span style={{ width: 56, height: 56, borderRadius: 8, color: "#fff", display: "inline-flex", alignItems: "center", justifyContent: "center", fontFamily: FONTS.display, fontSize: 22, fontWeight: 500, flexShrink: 0 }} className="bg-admin-fill">{effectiveTenant.initials}</span>
            )}
            <div className="flex-1 min-w-0">
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} className="text-admin-ink">{logoFileName}</div>
              <div style={{ fontFamily: FONTS.body, fontSize: 11.5, marginTop: 1 }} className="text-admin-ink-muted">
                {logoFile ? `${(logoFile.size / 1024).toFixed(0)} KB · ${tt("ready to save")}` : tt("Upload to use as watermark")}
              </div>
            </div>
            <SecondaryButton size="sm" onClick={() => logoFileRef.current?.click()}>
              {logoFile ? tt("Change") : tt("Upload")}
            </SecondaryButton>
            <input ref={logoFileRef} type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp"
              style={{ display: "none" }} onChange={onLogoChange} />
          </div>
        </FieldRow>
      </Section>

      <Section title={tt("Brand voice")} framed>
        <FieldRow label={tt("Tagline")} optional>
          <TextInput value={tagline} onChange={(e) => setTagline(e.target.value)} placeholder={tt("An agency built around our talent.")} />
        </FieldRow>
        <FieldRow label={tt("Brand description")} hint={tt("Used in social previews and footer.")}>
          <TextArea rows={3} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder={tt("A boutique agency representing editorial, runway, and commercial talent across Europe.")} />
        </FieldRow>
      </Section>

      <Section title={tt("Color tokens")} framed>
        <FieldRow label={tt("Primary")}>
          <div className="flex items-center gap-2.5">
            <input type="color" value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)}
              style={{ width: 38, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 6 }} />
            <TextInput value={primaryColor} onChange={(e) => setPrimaryColor(e.target.value)} />
          </div>
        </FieldRow>
        <FieldRow label={tt("Accent")}>
          <div className="flex items-center gap-2.5">
            <input type="color" value={accentColor} onChange={(e) => setAccentColor(e.target.value)}
              style={{ width: 38, height: 32, border: `1px solid ${COLORS.border}`, borderRadius: 6 }} />
            <TextInput value={accentColor} onChange={(e) => setAccentColor(e.target.value)} />
          </div>
        </FieldRow>
      </Section>

      {/* Card look/behavior (incl. the favorite icon) lives in ONE place — the
          Card Design studio — so this drawer never shows a control that a
          different editor can contradict. The old segmented here wrote a
          column no rendered surface reads (the cards follow the
          `favorite.icon` design token); it was removed rather than double-
          wired so there is exactly one source of truth. */}
      <Section title={tt("Directory cards")} framed>
        <FieldRow
          label={tt("Card design")}
          hint={tt("Card look, actions and the favorite icon are managed in Website → Card Design, so every surface stays in sync.")}
        >
          <button
            type="button"
            onClick={() => {
              closeDrawer();
              // adminBasePath, never a hardcoded slug path — on branded hosts
              // the canonical admin URL is /admin (see #912 + the
              // admin-href-invariant static test).
              window.location.assign(`${adminBasePath}/website/card-design`);
            }}
            className="cursor-pointer rounded-full border-[1.5px] border-[#18181b1a] bg-transparent px-3.5 py-[5px] text-xs font-semibold text-[#0B0B0D] transition-colors hover:border-[#4D4855]"
          >
            {tt("Open Card Design")}
          </button>
        </FieldRow>
      </Section>

      {isStudioPlus ? (
        <Section title={tt("Photo watermark")} framed>
          <div className="mb-3">
            <WatermarkPreviewCard preset={wm} logoUrl={logoPreview} />
          </div>
          <FieldRow label={tt("Enable watermark")}>
            <ToggleControl value={wm.enabled} label={wm.enabled ? tt("On. Applies to public photos") : tt("Off")}
              onChange={(v) => setWmField("enabled", v)} />
          </FieldRow>
          {wm.enabled && (
            <>
              <FieldRow label={tt("Position")} hint={tt("Where the logo sits on the photo.")}>
                <WatermarkPositionGrid value={wm.position} onChange={(p) => setWmField("position", p)} />
              </FieldRow>
              <FieldRow label={tt("Logo size")} hint={`${wm.size_pct}% ${tt("of shorter edge")}`}>
                <input type="range" min={4} max={25} step={1} value={wm.size_pct}
                  onChange={(e) => setWmField("size_pct", Number(e.target.value))}
                  style={{ width: "100%", accentColor: COLORS.fill }} />
              </FieldRow>
              <FieldRow label={tt("Opacity")} hint={`${Math.round(wm.opacity * 100)}%`}>
                <input type="range" min={0} max={1} step={0.05} value={wm.opacity}
                  onChange={(e) => setWmField("opacity", Number(e.target.value))}
                  style={{ width: "100%", accentColor: COLORS.fill }} />
              </FieldRow>
              <FieldRow label={tt("Edge padding")} hint={`${wm.padding_pct}% ${tt("inset")}`}>
                <input type="range" min={0} max={10} step={0.5} value={wm.padding_pct}
                  onChange={(e) => setWmField("padding_pct", Number(e.target.value))}
                  style={{ width: "100%", accentColor: COLORS.fill }} />
              </FieldRow>
              <FieldRow label={tt("Logo variant")}>
                <div className="flex gap-2">
                  {(["light", "dark"] as const).map((v) => (
                    <button key={v} type="button" onClick={() => setWmField("variant", v)} style={{
                      padding: "5px 14px", borderRadius: 999, border: "none", cursor: "pointer",
                      fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                      background: wm.variant === v ? COLORS.fill : COLORS.surfaceAlt,
                      color: wm.variant === v ? "#fff" : COLORS.ink,
                    }}>{v === "light" ? tt("light") : tt("dark")}</button>
                  ))}
                </div>
              </FieldRow>
            </>
          )}
        </Section>
      ) : (
        <Section title={tt("Photo watermark")} framed>
          <div style={{ padding: 16, borderRadius: 10, display: "flex", gap: 14, alignItems: "flex-start" }} className="bg-admin-surface-alt">
            <span className="text-admin-22">🔒</span>
            <div>
              <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600, marginBottom: 2 }} className="text-admin-ink">
                {tt("Logo watermark · Studio & above")}
              </div>
              <div style={{ fontFamily: FONTS.body, fontSize: 12, marginBottom: 10, lineHeight: 1.5 }} className="text-admin-ink-muted">
                {tt("Apply your logo to talent photos on public profiles and pitch links.")}
              </div>
              <SecondaryButton size="sm" onClick={() => openUpgrade({
                feature: tt("Logo watermark"), why: tt("Brand every photo your agency distributes."),
                requiredPlan: "studio",
                unlocks: [tt("Logo watermark on public photos"), tt("Position, opacity & size control"), tt("Per-image overrides")],
              })}>{tt("Upgrade to Studio")}</SecondaryButton>
            </div>
          </div>
        </Section>
      )}
    </DrawerShell>
  );
}


export function WatermarkEditorDrawer() {
  const { state, closeDrawer, openUpgrade, toast, tenantSlug } = useAdminShell();
  const copy = useDashboardText();
  const tt = copy.t;
  const isStudioPlus = meetsPlan(state.plan, "studio");
  const payload = state.drawer.payload as {
    mediaAssetId?: string;
    selectedIds?: string[];
    imageUrl?: string;
    talentName?: string;
    currentOverride?: unknown;
  } | undefined;
  const assetId    = payload?.mediaAssetId ?? "demo-asset";
  const talentName = payload?.talentName ?? tt("Sample photo");
  const isBulk     = (payload?.selectedIds?.length ?? 0) > 0;

  const initialPreset: WatermarkPreset =
    payload?.currentOverride && typeof payload.currentOverride === "object"
      ? { ...DEFAULT_WATERMARK_PRESET, ...(payload.currentOverride as Partial<WatermarkPreset>), enabled: true }
      : { ...DEFAULT_WATERMARK_PRESET, enabled: true };
  const [wm, setWm] = useState<WatermarkPreset>(initialPreset);
  const setWmField = <K extends keyof WatermarkPreset>(k: K, v: WatermarkPreset[K]) =>
    setWm(prev => ({ ...prev, [k]: v }));
  const [isSaving, setIsSaving] = useState(false);

  const targetIds = isBulk
    ? (payload!.selectedIds!)
    : (assetId !== "demo-asset" ? [assetId] : []);

  const onApply = async () => {
    if (isSaving) return;
    if (!tenantSlug || targetIds.length === 0) {
      toast(isBulk ? tt("Watermark applied (demo)") : tt("Watermark override saved (demo)"));
      closeDrawer();
      return;
    }
    setIsSaving(true);
    try {
      const results = await Promise.all(
        targetIds.map((id) => actionSetMediaWatermarkOverride(id, wm as Record<string, unknown>))
      );
      const failed = results.filter((r) => !r.ok).length;
      if (failed > 0) {
        toast(
          copy.isSpanish
            ? `${failed} foto(s) no se pudieron guardar.`
            : `${failed} photo(s) failed to save.`,
        );
        return;
      }
      toast(isBulk
        ? (copy.isSpanish ? `Marca de agua aplicada a ${targetIds.length} fotos` : `Watermark applied to ${targetIds.length} photos`)
        : tt("Watermark override saved"));
      closeDrawer();
    } catch { toast(tt("Couldn't save.")); }
    finally { setIsSaving(false); }
  };

  if (!isStudioPlus) {
    return (
      <DrawerShell open onClose={closeDrawer} title={tt("Watermark editor")} width={480}
        footer={<StandardFooter onSave={() => openUpgrade({ feature: tt("Logo watermark"), requiredPlan: "studio" })} saveLabel={tt("Upgrade to unlock")} />}>
        <div style={{ padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>🔒</div>
          <div style={{ fontFamily: FONTS.body, fontSize: 14, fontWeight: 600, marginBottom: 6 }} className="text-admin-ink">{tt("Studio plan required")}</div>
          <div style={{ fontFamily: FONTS.body, fontSize: 13 }} className="text-admin-ink-muted">{tt("Logo watermarks are a Studio & Agency feature.")}</div>
        </div>
      </DrawerShell>
    );
  }

  return (
    <DrawerShell
      open onClose={closeDrawer}
      title={tt("Edit watermark")} description={talentName} width={520}
      footer={
        <div style={{ display: "flex", gap: 8, alignItems: "center", flex: 1 }}>
          <div style={{ marginRight: "auto" }}>
            <SecondaryButton onClick={async () => {
              if (targetIds.length === 0) { toast(tt("Reset to workspace default (demo)")); closeDrawer(); return; }
              await Promise.all(targetIds.map((id) => actionSetMediaWatermarkOverride(id, null)));
              toast(isBulk
                ? (copy.isSpanish ? `${targetIds.length} fotos restablecidas al valor del espacio` : `Reset ${targetIds.length} photos to workspace default`)
                : tt("Reset to workspace default"));
              closeDrawer();
            }}>{tt("Reset to default")}</SecondaryButton>
          </div>
          <SecondaryButton onClick={closeDrawer}>{tt("Cancel")}</SecondaryButton>
          <PrimaryButton onClick={onApply} disabled={isSaving}>{isSaving ? tt("Saving…") : isBulk ? `${tt("Apply to")} ${targetIds.length}` : tt("Apply")}</PrimaryButton>
        </div>
      }
    >
      <div className="mb-5">
        <WatermarkPreviewCard preset={wm} logoUrl={null} />
      </div>
      <Section title={tt("Override")} framed>
        <FieldRow label={tt("Enable on this photo")}>
          <ToggleControl value={wm.enabled} label={wm.enabled ? tt("On") : tt("Off (uses workspace default)")}
            onChange={(v) => setWmField("enabled", v)} />
        </FieldRow>
        {wm.enabled && (
          <>
            <FieldRow label={tt("Position")}>
              <WatermarkPositionGrid value={wm.position} onChange={(p) => setWmField("position", p)} />
            </FieldRow>
            <FieldRow label={tt("Size")} hint={`${wm.size_pct}%`}>
              <input type="range" min={4} max={25} step={1} value={wm.size_pct}
                onChange={(e) => setWmField("size_pct", Number(e.target.value))}
                style={{ width: "100%", accentColor: COLORS.fill }} />
            </FieldRow>
            <FieldRow label={tt("Opacity")} hint={`${Math.round(wm.opacity * 100)}%`}>
              <input type="range" min={0} max={1} step={0.05} value={wm.opacity}
                onChange={(e) => setWmField("opacity", Number(e.target.value))}
                style={{ width: "100%", accentColor: COLORS.fill }} />
            </FieldRow>
            <FieldRow label={tt("Padding")} hint={`${wm.padding_pct}%`}>
              <input type="range" min={0} max={10} step={0.5} value={wm.padding_pct}
                onChange={(e) => setWmField("padding_pct", Number(e.target.value))}
                style={{ width: "100%", accentColor: COLORS.fill }} />
            </FieldRow>
            <FieldRow label={tt("Logo variant")}>
              <div className="flex gap-2">
                {(["light", "dark"] as const).map((v) => (
                  <button key={v} type="button" onClick={() => setWmField("variant", v)} style={{
                    padding: "5px 14px", borderRadius: 999, border: "none", cursor: "pointer",
                    fontFamily: FONTS.body, fontSize: 12, fontWeight: 600, textTransform: "capitalize",
                    background: wm.variant === v ? COLORS.fill : COLORS.surfaceAlt,
                    color: wm.variant === v ? "#fff" : COLORS.ink,
                  }}>{v === "light" ? tt("light") : tt("dark")}</button>
                ))}
              </div>
            </FieldRow>
          </>
        )}
      </Section>
    </DrawerShell>
  );
}

// ════════════════════════════════════════════════════════════════════
// Domain
// ════════════════════════════════════════════════════════════════════

