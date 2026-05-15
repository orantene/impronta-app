"use client";

// ─── PhotoLightbox ────────────────────────────────────────────────────────────
//
// One unified photo surface used across the talent media drawer (admin per-
// talent edit, admin shell talent drawer, talent self-edit) AND the per-
// talent edit form's GallerySection. Image left, scrollable action rail
// right (stacks as a bottom sheet on narrow viewports). Each rail section
// renders conditionally based on which callbacks the caller wires up, so
// the same component covers both the full-feature drawer use and the
// lighter form-context preview use.

import React, { useCallback, useEffect, useState } from "react";

const F = '"Inter", system-ui, sans-serif';

// ─── Keyboard handler stack ───────────────────────────────────────────────────
//
// Multiple PhotoLightbox instances could theoretically mount at once (rare —
// modal UX usually prevents it, but e.g. crop-dialog-on-lightbox-on-drawer
// could nest). Without coordination they'd all catch Esc/← →. We register
// ONE window keydown listener and dispatch to the topmost handler on the
// stack — last-mounted wins, matching how modal layering looks visually.

type KbdHandler = (e: KeyboardEvent) => void;
const kbdStack: KbdHandler[] = [];
let kbdInstalled = false;

function ensureKbdListener() {
  if (kbdInstalled || typeof window === "undefined") return;
  window.addEventListener("keydown", (e) => {
    const top = kbdStack[kbdStack.length - 1];
    if (top) top(e);
  });
  kbdInstalled = true;
}

function pushKbdHandler(handler: KbdHandler): () => void {
  ensureKbdListener();
  kbdStack.push(handler);
  return () => {
    const i = kbdStack.lastIndexOf(handler);
    if (i >= 0) kbdStack.splice(i, 1);
  };
}

export interface PhotoLightboxAsset {
  id: string;
  url: string;
  variantKind?: string;
  approvalState?: "pending" | "approved" | "rejected";
  sourceMediaAssetId?: string | null;
}

export interface PhotoLightboxProps {
  asset: PhotoLightboxAsset;
  allAssets: PhotoLightboxAsset[];
  /** Is this asset currently set as the talent's profile photo (1:1)? */
  isAvatar?: boolean;
  /** Is this asset currently set as the talent's cover photo (16:9)? */
  isHero?: boolean;
  onClose: () => void;
  onNavigate: (next: PhotoLightboxAsset) => void;
  /** When omitted, the Crop & edit section is hidden. */
  onCropAt?: (aspect: 1 | number | "free") => void;
  /** When omitted, "Use as profile" is hidden. */
  onSetAvatar?: () => Promise<void>;
  /** When omitted, "Use as cover" is hidden. */
  onSetHero?: () => Promise<void>;
  /** When omitted, the Delete section is hidden. */
  onDelete?: () => Promise<void>;
  /** When omitted, "Revert to original" is hidden even if asset has sourceMediaAssetId. */
  onRevertCrop?: () => Promise<void>;
  /** Translator. When omitted, English defaults are used. */
  t?: (key: string) => string;
  /** Optional explicit label overrides — useful for surfaces with no i18n hook. */
  labels?: Partial<Record<keyof typeof DEFAULT_LABELS, string>>;
  /** Render surface-specific JSX BELOW Open/Copy URL but above the Delete
   *  row. Used by the admin Media page to inject metadata / tags / folders
   *  / notes — admin-only stuff the talent surfaces never need. */
  extraSections?: React.ReactNode;
  /** Render surface-specific JSX ABOVE the built-in promote/crop sections.
   *  Reserved for high-priority workflow shortcuts (e.g. Approve/Reject
   *  when a photo is pending review — that flow shouldn't be buried). */
  topSections?: React.ReactNode;
  /** Render arbitrary surface-specific JSX over the image (bottom-left corner
   *  area). Used by the admin Media page for the workspace watermark
   *  preview overlay. */
  imageOverlay?: React.ReactNode;
  /** Override the rail header content. When omitted, renders the default
   *  pill + previewLabel. */
  headerContent?: React.ReactNode;
  /** When true, PhotoLightbox skips registering its own keyboard handler.
   *  Used by surfaces that have additional shortcuts (Y/N approval, etc.)
   *  and want one handler to own all keys to avoid double-firing of
   *  Esc / ← →. The surface is then responsible for syncing the displayed
   *  asset via the `asset` prop (PhotoLightbox follows it). */
  disableKeyboard?: boolean;
}

const DEFAULT_LABELS = {
  profile: "Profile",
  cover: "Cover",
  review: "Review",
  rejected: "Rejected",
  deletePhoto: "Delete photo",
  deleting: "Deleting…",
  setting: "Setting…",
  reverting: "Reverting…",
  setAsProfile: "Use as profile",
  setAsCover: "Use as cover",
  previewLabel: "Photo",
  closeAria: "Close",
  deleteConfirm: "Delete this photo? This can't be undone.",
  confirmCancel: "Cancel",
  confirmDelete: "Delete",
  confirmRevert: "Revert",
  cropSectionLabel: "Crop & edit",
  cropProfile: "Profile",
  cropCover: "Cover",
  cropFree: "Free",
  cropLineage: "Crop of an earlier original",
  revertButton: "Revert to original",
  revertConfirm: "Revert to original? The cropped version will be removed.",
  openInNewTab: "Open",
  copyUrl: "Copy URL",
  copyUrlDone: "Copied!",
  keyboardHint: "← → navigate · Esc close",
  prevPhoto: "Previous photo",
  nextPhoto: "Next photo",
} as const;

export function PhotoLightbox({
  asset, allAssets, isAvatar = false, isHero = false,
  onClose, onNavigate,
  onCropAt, onSetAvatar, onSetHero, onDelete, onRevertCrop,
  t, labels, extraSections, topSections, imageOverlay, headerContent, disableKeyboard,
}: PhotoLightboxProps) {
  // Resolve copy: caller's `labels` override > translator > English default.
  // `t` lookups that match a known key in the talent-side translations get
  // used; otherwise fall back to English defaults.
  const L = (key: keyof typeof DEFAULT_LABELS, tKey?: string): string => {
    if (labels?.[key]) return labels[key]!;
    if (t && tKey) {
      const tr = t(tKey);
      // createTranslator returns the key path on miss, so don't accept it.
      if (tr && tr !== tKey) return tr;
    }
    return DEFAULT_LABELS[key];
  };

  const initialIdx = Math.max(0, allAssets.findIndex((a) => a.id === asset.id));
  const [currentIdx, setCurrentIdx] = useState(initialIdx);
  // Sync our internal currentIdx when the parent passes a different asset
  // (used by surfaces that own navigation externally — admin Media drives
  // Y/N approval shortcuts and wants its own keyboard handler).
  useEffect(() => {
    const idx = allAssets.findIndex((a) => a.id === asset.id);
    if (idx >= 0 && idx !== currentIdx) setCurrentIdx(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id]);
  // Keep current index safe across allAssets shrinking (e.g. after delete).
  const safeIdx = Math.max(0, Math.min(allAssets.length - 1, currentIdx));
  const current = allAssets[safeIdx] ?? asset;

  // Local per-photo busy flags — reset when the visible asset changes.
  const [setAvatarBusy, setSetAvatarBusy] = useState(false);
  const [setHeroBusy, setSetHeroBusy] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [revertBusy, setRevertBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  // In-app confirmation (replaces native confirm() — consistent, testable,
  // doesn't freeze the surface). null = no dialog.
  const [pendingConfirm, setPendingConfirm] = useState<"delete" | "revert" | null>(null);
  useEffect(() => {
    setSetAvatarBusy(false);
    setSetHeroBusy(false);
    setDeleteBusy(false);
    setRevertBusy(false);
    setCopied(false);
  }, [current.id]);

  // Bubble the current asset back to the parent so its lightbox state tracks
  // navigation (keeps the cropper source URL fresh too). Depend on the id
  // string instead of the object reference — when parent passes a freshly
  // re-created allAssets array on every render, `current` is a new object
  // each time, but its id is stable, so this only fires on real navigation.
  useEffect(() => {
    if (current.id !== asset.id) onNavigate(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current.id, asset.id, onNavigate]);

  const go = useCallback((delta: number) => {
    setCurrentIdx((i) => Math.max(0, Math.min(allAssets.length - 1, i + delta)));
  }, [allAssets.length]);

  // Track viewport — stack the rail under the image on narrow screens.
  const [isNarrow, setIsNarrow] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(max-width: 820px)");
    const sync = () => setIsNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    // Push our handler onto the singleton stack — only the topmost
    // (most-recently-mounted) PhotoLightbox processes keys.
    if (disableKeyboard) return;
    return pushKbdHandler((e) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    });
  }, [onClose, go, disableKeyboard]);

  const railBtn: React.CSSProperties = {
    padding: "6px 10px", borderRadius: 7,
    border: "1px solid rgba(255,255,255,0.16)",
    background: "rgba(255,255,255,0.06)", color: "#fff",
    fontFamily: F, fontSize: 12, fontWeight: 600,
    cursor: "pointer", textDecoration: "none",
    display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 5,
  };
  const railBtnPrimary: React.CSSProperties = {
    ...railBtn,
    background: "rgba(255,255,255,0.94)",
    color: "#0f0f12",
    border: "1px solid rgba(255,255,255,0.94)",
  };
  const railBtnDanger: React.CSSProperties = {
    ...railBtn,
    background: "rgba(192,57,43,0.16)",
    color: "rgba(255,135,120,0.95)",
    border: "1px solid rgba(192,57,43,0.4)",
  };
  const sectionLabel: React.CSSProperties = {
    fontFamily: F, fontSize: 10.5, fontWeight: 700,
    color: "rgba(255,255,255,0.45)", textTransform: "uppercase", letterSpacing: 0.7,
    marginBottom: 8,
  };

  const handleSetAvatar = async () => {
    if (!onSetAvatar) return;
    setSetAvatarBusy(true);
    await onSetAvatar();
    setSetAvatarBusy(false);
  };
  const handleSetHero = async () => {
    if (!onSetHero) return;
    setSetHeroBusy(true);
    await onSetHero();
    setSetHeroBusy(false);
  };
  // Delete / Revert open the in-app confirm modal instead of native
  // confirm(). The actual work runs in runConfirmedAction once the user
  // confirms in-app.
  const handleDelete = () => { if (onDelete) setPendingConfirm("delete"); };
  const handleRevert = () => { if (onRevertCrop) setPendingConfirm("revert"); };
  const runConfirmedAction = async () => {
    const kind = pendingConfirm;
    setPendingConfirm(null);
    if (kind === "delete" && onDelete) {
      setDeleteBusy(true);
      await onDelete();
      setDeleteBusy(false);
    } else if (kind === "revert" && onRevertCrop) {
      setRevertBusy(true);
      await onRevertCrop();
      setRevertBusy(false);
    }
  };
  const copyUrl = () => {
    void navigator.clipboard.writeText(current.url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    });
  };

  // Status pill — priority Rejected › Review › Profile › Cover.
  const pill =
    current.approvalState === "rejected" ? { bg: "rgba(192,57,43,0.94)", label: L("rejected", "admin.talent.edit.mediaGallery.rejectedBadge") } :
    current.approvalState === "pending"  ? { bg: "rgba(212,151,12,0.94)", label: L("review", "admin.talent.edit.mediaGallery.pendingBadge") } :
    isAvatar                              ? { bg: "rgba(15,79,62,0.94)",  label: L("profile", "admin.talent.edit.mediaGallery.avatarBadge") } :
    isHero                                ? { bg: "rgba(78,52,114,0.94)", label: L("cover", "admin.talent.edit.mediaGallery.coverBadge") } :
    null;

  // Decide whether to render the action rail at all. If no actions are wired
  // AND no role pill applies, we'd render an empty box — better to just show
  // a minimal rail with the close + URL actions.
  const hasAnyAction = !!(onSetAvatar || onSetHero || onCropAt || onDelete || onRevertCrop);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={L("previewLabel", "admin.talent.edit.mediaGallery.previewLabel")}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 9500,
        background: "rgba(9,9,11,0.94)",
        backdropFilter: "blur(10px)",
        display: "flex",
        flexDirection: isNarrow ? "column" : "row",
      }}
      onClick={onClose}
    >
      {/* Image area */}
      <div
        style={{
          flex: 1, minWidth: 0, display: "flex", flexDirection: "column",
          alignItems: "center", justifyContent: "center", position: "relative",
          padding: isNarrow ? "44px 12px 12px" : "20px 60px",
          minHeight: isNarrow ? "50vh" : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Counter + keyboard hint (top) */}
        <div style={{
          position: "absolute", top: 14, left: 18, right: 18,
          display: "flex", alignItems: "center", justifyContent: "space-between",
          fontFamily: F, fontSize: 12, color: "rgba(255,255,255,0.55)",
          pointerEvents: "none",
        }}>
          <span>{safeIdx + 1} / {allAssets.length}</span>
          <span style={{ opacity: 0.5 }}>{L("keyboardHint", "admin.talent.edit.mediaGallery.keyboardHint")}</span>
        </div>

        {/* Prev */}
        {safeIdx > 0 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); go(-1); }}
            aria-label={L("prevPhoto", "admin.talent.edit.mediaGallery.prevPhoto")}
            style={{
              position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)",
              width: 44, height: 44, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.07)", color: "#fff",
              fontSize: 22, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>‹</button>
        )}

        {/* Image */}
        <div style={{ position: "relative", maxWidth: "100%", maxHeight: "calc(100vh - 64px)" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={current.url} alt=""
            style={{ maxWidth: "100%", maxHeight: "calc(100vh - 64px)", objectFit: "contain", borderRadius: 10, display: "block" }} />
          {imageOverlay}
        </div>

        {/* Next */}
        {safeIdx < allAssets.length - 1 && (
          <button type="button" onClick={(e) => { e.stopPropagation(); go(1); }}
            aria-label={L("nextPhoto", "admin.talent.edit.mediaGallery.nextPhoto")}
            style={{
              position: "absolute", right: 14, top: "50%", transform: "translateY(-50%)",
              width: 44, height: 44, borderRadius: "50%",
              border: "1px solid rgba(255,255,255,0.18)",
              background: "rgba(255,255,255,0.07)", color: "#fff",
              fontSize: 22, cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}>›</button>
        )}
      </div>

      {/* Rail */}
      <div
        style={{
          width: isNarrow ? "100%" : 360,
          flexShrink: 0,
          background: "rgba(20,20,24,0.96)",
          borderLeft: isNarrow ? "none" : "1px solid rgba(255,255,255,0.08)",
          borderTop:  isNarrow ? "1px solid rgba(255,255,255,0.08)" : "none",
          display: "flex", flexDirection: "column",
          color: "#fff",
          maxHeight: isNarrow ? "50vh" : undefined,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{
          padding: "14px 18px", borderBottom: "1px solid rgba(255,255,255,0.08)",
          display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
        }}>
          <div style={{ minWidth: 0, flex: 1, display: "flex", alignItems: "center", gap: 8 }}>
            {headerContent ?? (
              <>
                {pill && (
                  <span style={{
                    background: pill.bg, color: "#fff",
                    fontFamily: F, fontSize: 10, fontWeight: 700,
                    padding: "2px 8px", borderRadius: 5, letterSpacing: 0.3,
                  }}>{pill.label}</span>
                )}
                <div style={{
                  fontFamily: F, fontSize: 13, fontWeight: 600, color: "rgba(255,255,255,0.85)",
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>{L("previewLabel", "admin.talent.edit.mediaGallery.previewLabel")}</div>
              </>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label={L("closeAria", "admin.talent.edit.mediaGallery.closeAria")}
            style={{
              width: 30, height: 30, borderRadius: 7, border: "1px solid rgba(255,255,255,0.14)",
              background: "rgba(255,255,255,0.05)", color: "rgba(255,255,255,0.75)",
              cursor: "pointer", fontSize: 16, lineHeight: 1, padding: 0,
              display: "inline-flex", alignItems: "center", justifyContent: "center",
            }}>×</button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "14px 18px 24px", display: "flex", flexDirection: "column", gap: 16 }}>

          {/* Caller-injected priority sections (e.g. Approve/Reject for
              pending review — surfaces above the promote/crop chrome so
              the most important action is the first thing the user sees. */}
          {topSections}

          {/* Lineage label — when this asset is a crop derivative */}
          {current.sourceMediaAssetId && (
            <div style={{
              display: "flex", alignItems: "center", gap: 7,
              padding: "7px 10px", borderRadius: 7,
              background: "rgba(255,255,255,0.05)",
              border: "1px solid rgba(255,255,255,0.08)",
              fontFamily: F, fontSize: 11.5, color: "rgba(255,255,255,0.7)",
            }}>
              <span style={{ fontSize: 12 }}>✂</span>
              <span>{L("cropLineage", "admin.talent.edit.mediaGallery.cropLineage")}</span>
            </div>
          )}

          {/* Quick promote (no crop) — each button only shows if the caller
              wired the corresponding setter AND the asset isn't already
              filling that role. */}
          {(onSetAvatar && !isAvatar) || (onSetHero && !isHero) ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {onSetAvatar && !isAvatar && (
                <button type="button" disabled={setAvatarBusy} onClick={() => void handleSetAvatar()}
                  style={{ ...railBtnPrimary, width: "100%", padding: "9px 12px", fontSize: 12.5, opacity: setAvatarBusy ? 0.7 : 1 }}>
                  {setAvatarBusy
                    ? L("setting", "admin.talent.edit.mediaGallery.setting")
                    : `⭐  ${L("setAsProfile", "admin.talent.edit.mediaGallery.setAvatar")} (1:1)`}
                </button>
              )}
              {onSetHero && !isHero && (
                <button type="button" disabled={setHeroBusy} onClick={() => void handleSetHero()}
                  style={{ ...railBtn, width: "100%", padding: "8px 12px", fontSize: 12.5, opacity: setHeroBusy ? 0.7 : 1 }}>
                  {setHeroBusy
                    ? L("setting", "admin.talent.edit.mediaGallery.setting")
                    : `🖼  ${L("setAsCover", "admin.talent.edit.mediaGallery.setHero")} (16:9 banner)`}
                </button>
              )}
            </div>
          ) : null}

          {/* Crop & edit */}
          {onCropAt && (
            <div>
              <div style={sectionLabel}>{L("cropSectionLabel", "admin.talent.edit.mediaGallery.cropSectionLabel")}</div>
              <div style={{ display: "flex", gap: 6 }}>
                <button type="button" onClick={() => onCropAt(1)}
                  style={{ ...railBtn, flex: 1, padding: "7px 8px", fontSize: 11.5 }}>
                  ✂ {L("cropProfile", "admin.talent.edit.mediaGallery.cropProfile")}
                </button>
                <button type="button" onClick={() => onCropAt(16 / 9)}
                  style={{ ...railBtn, flex: 1, padding: "7px 8px", fontSize: 11.5 }}>
                  ✂ {L("cropCover", "admin.talent.edit.mediaGallery.cropCover")}
                </button>
                <button type="button" onClick={() => onCropAt("free")}
                  style={{ ...railBtn, flex: 1, padding: "7px 8px", fontSize: 11.5 }}>
                  ✂ {L("cropFree", "admin.talent.edit.mediaGallery.cropFree")}
                </button>
              </div>
            </div>
          )}

          {/* Revert — only when this asset is a crop AND caller wired it */}
          {onRevertCrop && current.sourceMediaAssetId && (
            <button type="button" disabled={revertBusy} onClick={handleRevert}
              style={{ ...railBtn, width: "100%", padding: "7px 12px", fontSize: 11.5, opacity: revertBusy ? 0.6 : 1 }}>
              {revertBusy
                ? L("reverting", "admin.talent.edit.mediaGallery.reverting")
                : "↺  " + L("revertButton", "admin.talent.edit.mediaGallery.revertButton")}
            </button>
          )}

          {/* External actions — Open/Copy only when we have a real URL.
              Empty url happens on broken assets; an empty href would open
              the current page in a new tab, which is worse than no-op. */}
          <div style={{ display: "flex", gap: 6 }}>
            {current.url ? (
              <a href={current.url} target="_blank" rel="noopener noreferrer" style={{ ...railBtn, flex: 1 }}>
                {L("openInNewTab", "admin.talent.edit.mediaGallery.openInNewTab")} ↗
              </a>
            ) : (
              <span style={{ ...railBtn, flex: 1, opacity: 0.4, cursor: "not-allowed" }}>
                {L("openInNewTab", "admin.talent.edit.mediaGallery.openInNewTab")} ↗
              </span>
            )}
            <button type="button" onClick={copyUrl} disabled={!current.url}
              style={{ ...railBtn, flex: 1, opacity: current.url ? 1 : 0.4 }}>
              {copied
                ? L("copyUrlDone", "admin.talent.edit.mediaGallery.copyUrlDone")
                : L("copyUrl", "admin.talent.edit.mediaGallery.copyUrl")}
            </button>
          </div>

          {/* Caller-injected sections (admin uses this for metadata, tags,
              folders, notes, approval — admin-only concepts that don't
              belong in the shared component's API surface). */}
          {extraSections}

          {/* Danger zone — only when caller wired delete */}
          {onDelete && (
            <div style={{ marginTop: "auto", paddingTop: 14, borderTop: "1px solid rgba(255,255,255,0.08)" }}>
              <button type="button" disabled={deleteBusy} onClick={handleDelete}
                style={{ ...railBtnDanger, width: "100%", padding: "8px 12px", opacity: deleteBusy ? 0.5 : 1 }}>
                {deleteBusy
                  ? L("deleting", "admin.talent.edit.mediaGallery.deleting")
                  : L("deletePhoto", "admin.talent.edit.mediaGallery.delete") + (hasAnyAction ? "" : "")}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* In-app confirm modal — replaces native confirm(). Sits above the
          lightbox (z 9600 > 9500). stopPropagation so a click on the card
          doesn't bubble to the root onClose. */}
      {pendingConfirm && (
        <div
          onClick={(e) => { e.stopPropagation(); setPendingConfirm(null); }}
          style={{
            position: "fixed", inset: 0, zIndex: 9600,
            background: "rgba(0,0,0,0.55)", backdropFilter: "blur(2px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: 20,
          }}
        >
          <div
            role="alertdialog"
            aria-modal="true"
            onClick={(e) => e.stopPropagation()}
            style={{
              width: "min(380px, 100%)", background: "#1c1c20",
              border: "1px solid rgba(255,255,255,0.12)", borderRadius: 12,
              padding: "20px 22px", color: "#fff",
              boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            }}
          >
            <div style={{ fontFamily: F, fontSize: 14, lineHeight: 1.5, color: "rgba(255,255,255,0.92)", marginBottom: 18 }}>
              {pendingConfirm === "delete"
                ? L("deleteConfirm", "admin.talent.edit.mediaGallery.deleteConfirm")
                : L("revertConfirm", "admin.talent.edit.mediaGallery.revertConfirm")}
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button type="button" onClick={() => setPendingConfirm(null)}
                style={{
                  ...railBtn, padding: "7px 14px",
                  background: "rgba(255,255,255,0.06)",
                }}>
                {L("confirmCancel", "admin.talent.edit.mediaGallery.confirmCancel")}
              </button>
              <button type="button" onClick={() => void runConfirmedAction()}
                style={{
                  ...railBtnDanger, padding: "7px 16px",
                }}>
                {pendingConfirm === "delete"
                  ? L("confirmDelete", "admin.talent.edit.mediaGallery.confirmDelete")
                  : L("confirmRevert", "admin.talent.edit.mediaGallery.confirmRevert")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
