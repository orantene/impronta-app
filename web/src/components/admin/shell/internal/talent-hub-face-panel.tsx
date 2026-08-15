"use client";

/**
 * talent-hub-face-panel.tsx — "Photos on this site" (media-ownership phase 2).
 *
 * Staff pick which of a talent's photos represent that talent on THIS
 * workspace's site, and which one is the cover. The selection is a POINTER
 * list, never a copy: it writes `agency_talent_media` rows plus
 * `agency_talent_overlays.cover_media_asset_id` for this tenant only, and the
 * same talent keeps a different face on every other hub.
 *
 * Rendered inside the roster drawer's "Photos & video" section, staff-only.
 * Styling is Tailwind admin-* tokens exclusively — the shell forbids new
 * inline styles (ratchet/no-new-inline-style).
 *
 * The panel always shows explicit load / save / error state (admin edit-UX
 * rule: never a silent wait, never a save that looks like nothing happened).
 *
 * ── UX honesty pass, 2026-08-15 (execution plan §3 B2-B8) ──────────────────
 * The panel worked; it lied by omission. Four things changed and each one is
 * load-bearing:
 *
 *  • ONE COMMIT MODEL. "Make cover" used to write immediately while the photo
 *    selection was deferred behind "Save selection", so clicking it during a
 *    dirty selection changed the live site with no save and no confirmation —
 *    and `setHubMediaSelection` would then clear that very cover if it fell
 *    outside the saved list. Cover now auto-selects its tile and rides the
 *    same deferred save. Caption / visibility / reorder still write
 *    immediately, but they are only reachable on ALREADY-SAVED photos, so
 *    they can never straddle an unsaved selection.
 *  • NO FALSE EMPTY. "0 selected" reads as "nothing on my site". With no
 *    curation the site serves the DEFAULT RANK, so the panel now says that,
 *    and outlines the tile the default is actually picking.
 *  • NO SILENT NO-OP. With MEDIA_PER_HUB_FACES_ENABLED off, every write here
 *    succeeds and changes nothing visible. The banner says so; the writes stay
 *    on so a selection can be prepared ahead of the flip.
 *  • NO INVERTED CONTRAST. The disabled tokens used to be LOUDER than the
 *    enabled ones (`admin-ink-dim` = 0.38 alpha, `admin-ink-muted` = 0.72), so
 *    dead buttons shouted and live ones whispered. Enabled controls are
 *    `text-admin-ink-muted`, disabled ones `text-admin-ink-dim`. Keep it that
 *    way — the token names read backwards and this trap will recur.
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  actionLoadTalentHubFace,
  actionReorderTalentHubMedia,
  actionSetTalentHubCover,
  actionSetTalentHubMediaCaption,
  actionSetTalentHubMediaVisibility,
  actionSetTalentHubSelection,
  type HubFacePhoto,
} from "@/lib/server-actions/admin-talent-hub-face";

type SaveState = "idle" | "saving" | "saved" | "error";

export function TalentHubFacePanel({ talentProfileId }: { talentProfileId: string }) {
  const t = useT();
  const [photos, setPhotos] = useState<HubFacePhoto[] | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [cover, setCover] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveError, setSaveError] = useState<string | null>(null);
  /**
   * What the LIVE site is serving, straight from the storefront resolver. When
   * this is "default" the site is showing the default rank, which is a real
   * face — not an empty site. See `HubFaceState.source`.
   */
  const [liveSource, setLiveSource] = useState<"curation" | "default">("default");
  const [defaultCoverAssetId, setDefaultCoverAssetId] = useState<string | null>(null);
  /** MEDIA_PER_HUB_FACES_ENABLED — off means every write below is invisible. */
  const [facesEnabled, setFacesEnabled] = useState(true);

  // Per-photo state for the immediate-write controls (caption, visibility,
  // reorder) — these bypass the "Save selection" button entirely, so each
  // gets its own explicit status keyed by asset id (admin edit-UX rule: never
  // a silent wait).
  const [captionDrafts, setCaptionDrafts] = useState<Record<string, string>>({});
  const [captionState, setCaptionState] = useState<Record<string, SaveState>>({});
  const [captionError, setCaptionError] = useState<Record<string, string>>({});
  const [visibilityState, setVisibilityState] = useState<Record<string, SaveState>>({});
  const [orderState, setOrderState] = useState<SaveState>("idle");
  const [orderError, setOrderError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setPhotos(null);
    setLoadError(null);
    const res = await actionLoadTalentHubFace(talentProfileId);
    if (!res.ok) {
      setLoadError(res.error);
      setPhotos([]);
      return;
    }
    setPhotos(res.data.photos);
    setSelected(res.data.selectedAssetIds);
    setCover(res.data.coverAssetId);
    setLiveSource(res.data.source);
    setDefaultCoverAssetId(res.data.defaultCoverAssetId);
    setFacesEnabled(res.data.perHubFacesEnabled);
    setCaptionDrafts(
      Object.fromEntries(res.data.photos.map((p) => [p.assetId, p.caption ?? ""])),
    );
  }, [talentProfileId]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      if (!cancelled) await load();
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  const persistedSelected = photos?.filter((p) => p.selected).map((p) => p.assetId) ?? [];
  const persistedCover = photos?.find((p) => p.isCover)?.assetId ?? null;
  const selectionDirty =
    photos !== null && JSON.stringify(selected) !== JSON.stringify(persistedSelected);
  const coverDirty = photos !== null && cover !== persistedCover;
  // ONE commit model: the button is live when EITHER half of the draft differs
  // from what the server holds. Cover used to write behind the user's back.
  const dirty = selectionDirty || coverDirty;

  const toggle = (assetId: string) => {
    setSaveState("idle");
    setSelected((prev) => {
      const next = prev.includes(assetId)
        ? prev.filter((id) => id !== assetId)
        : [...prev, assetId];
      // A cover outside the selection is not a state the server will keep
      // (`setHubMediaSelection` clears it), so the draft must not pretend
      // otherwise. Drop the cover the moment its tile leaves the selection.
      if (!next.includes(assetId)) setCover((c) => (c === assetId ? null : c));
      return next;
    });
  };

  /**
   * Draft-only. Choosing a cover auto-SELECTS its tile — a cover that is not in
   * the selection cannot survive the save, and offering it would be a control
   * that silently undoes itself. Nothing is written until "Save selection".
   */
  const chooseCover = (assetId: string | null) => {
    setSaveState("idle");
    setCover(assetId);
    if (assetId) {
      setSelected((prev) => (prev.includes(assetId) ? prev : [...prev, assetId]));
    }
  };

  const saveSelection = async () => {
    setSaveState("saving");
    setSaveError(null);
    // Order matters: the selection write clears a cover that sits outside the
    // list, so the selection lands FIRST and the cover second.
    const res = await actionSetTalentHubSelection(talentProfileId, selected);
    if (!res.ok) {
      setSaveState("error");
      setSaveError(res.error);
      return;
    }
    if (cover !== res.data.coverAssetId) {
      const coverRes = await actionSetTalentHubCover(talentProfileId, cover);
      if (!coverRes.ok) {
        setSaveState("error");
        setSaveError(coverRes.error);
        await load();
        return;
      }
      setCover(coverRes.data.coverAssetId);
    } else {
      setCover(res.data.coverAssetId);
    }
    setSaveState("saved");
    await load();
  };

  const saveCaption = async (assetId: string) => {
    const draft = captionDrafts[assetId] ?? "";
    setCaptionState((prev) => ({ ...prev, [assetId]: "saving" }));
    setCaptionError((prev) => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
    const res = await actionSetTalentHubMediaCaption(talentProfileId, assetId, draft);
    if (!res.ok) {
      setCaptionState((prev) => ({ ...prev, [assetId]: "error" }));
      setCaptionError((prev) => ({ ...prev, [assetId]: res.error }));
      return;
    }
    setCaptionState((prev) => ({ ...prev, [assetId]: "saved" }));
    setPhotos((prev) =>
      prev ? prev.map((p) => (p.assetId === assetId ? { ...p, caption: res.data.caption } : p)) : prev,
    );
  };

  const toggleVisibility = async (photo: HubFacePhoto) => {
    const nextVisible = !photo.visible;
    setVisibilityState((prev) => ({ ...prev, [photo.assetId]: "saving" }));
    const res = await actionSetTalentHubMediaVisibility(talentProfileId, photo.assetId, nextVisible);
    if (!res.ok) {
      setVisibilityState((prev) => ({ ...prev, [photo.assetId]: "error" }));
      setSaveError(res.error);
      return;
    }
    setVisibilityState((prev) => ({ ...prev, [photo.assetId]: "saved" }));
    setPhotos((prev) =>
      prev
        ? prev.map((p) => (p.assetId === photo.assetId ? { ...p, visible: res.data.visible } : p))
        : prev,
    );
  };

  const moveMedia = async (assetId: string, direction: -1 | 1) => {
    if (!photos) return;
    const orderedSelectedIds = photos.filter((p) => p.selected).map((p) => p.assetId);
    const index = orderedSelectedIds.indexOf(assetId);
    const targetIndex = index + direction;
    if (index < 0 || targetIndex < 0 || targetIndex >= orderedSelectedIds.length) return;

    const next = [...orderedSelectedIds];
    [next[index], next[targetIndex]] = [next[targetIndex], next[index]];

    setOrderState("saving");
    setOrderError(null);
    const res = await actionReorderTalentHubMedia(talentProfileId, next);
    if (!res.ok) {
      setOrderState("error");
      setOrderError(res.error);
      return;
    }
    setOrderState("saved");
    await load();
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-lg border border-admin-border-soft bg-admin-indigo-soft p-3">
        <div className="text-[12.5px] font-semibold text-admin-indigo-deep">
          {t("dashboard.talentHubFace.title")}
        </div>
        <div className="mt-1 text-[11.5px] leading-relaxed text-admin-ink-muted">
          {t("dashboard.talentHubFace.body")}
        </div>
        {/*
          B8 — two different "Cover" concepts live on this one screen: the
          profile banner further up (16:9, the talent's own page) and the card
          face chosen here (1:1-ish, this site's roster cards). The per-hub one
          silently outranks the profile one on cards, so the difference is
          named rather than left to be discovered.
        */}
        <div className="mt-2 text-[11px] leading-relaxed text-admin-ink-muted">
          {t("dashboard.talentHubFace.coverVsBannerHint")}
        </div>
      </div>

      {/*
        P0-4 — with MEDIA_PER_HUB_FACES_ENABLED off, everything below still
        saves, audits and busts caches while the live site stays byte-identical.
        Say so instead of printing "Selection saved." over an unchanged site.
        Cool attention colour (indigo), never amber/gold — admin chrome rule.
      */}
      {!facesEnabled && photos !== null && (
        <div className="rounded-lg border border-admin-indigo-deep bg-admin-indigo-soft p-3 text-[11.5px] leading-relaxed text-admin-indigo-deep">
          <span className="font-semibold">{t("dashboard.talentHubFace.flagOffTitle")}</span>{" "}
          {t("dashboard.talentHubFace.flagOffBody")}
        </div>
      )}

      {photos === null && (
        <div className="text-[12px] text-admin-ink-muted">
          {t("dashboard.talentHubFace.loading")}
        </div>
      )}

      {loadError && (
        <div className="rounded-lg border border-admin-border bg-admin-surface-alt p-3 text-[12px] text-admin-red">
          {loadError}
        </div>
      )}

      {photos !== null && photos.length === 0 && !loadError && (
        <div className="rounded-lg border border-dashed border-admin-border bg-admin-surface-alt p-4 text-center text-[12px] text-admin-ink-muted">
          {t("dashboard.talentHubFace.empty")}
        </div>
      )}

      {photos !== null && photos.length > 0 && (
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo) => {
            const index = selected.indexOf(photo.assetId);
            const isSelected = index >= 0;
            const isCover = cover === photo.assetId;
            const orderedSelectedIds = photos.filter((p) => p.selected).map((p) => p.assetId);
            const orderIndex = orderedSelectedIds.indexOf(photo.assetId);
            const canMoveUp = photo.selected && orderIndex > 0;
            const canMoveDown = photo.selected && orderIndex >= 0 && orderIndex < orderedSelectedIds.length - 1;
            const captionSave = captionState[photo.assetId] ?? "idle";
            const visibilitySave = visibilityState[photo.assetId] ?? "idle";
            // P0-3 — the tile the DEFAULT rank is currently serving, when
            // nothing is curated. Outlined so "showing the default selection"
            // points at a photo instead of being an abstract claim.
            const isDefaultFace =
              liveSource === "default" && defaultCoverAssetId === photo.assetId;
            return (
              <div
                key={photo.assetId}
                className={`relative overflow-hidden rounded-lg border ${
                  isCover
                    ? "border-admin-accent"
                    : isSelected
                      ? "border-admin-indigo-deep"
                      : isDefaultFace
                        ? "border-dashed border-admin-indigo-deep"
                        : "border-admin-border-soft"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(photo.assetId)}
                  className="block w-full cursor-pointer bg-admin-surface-alt"
                  aria-pressed={isSelected}
                  title={
                    isSelected
                      ? t("dashboard.talentHubFace.removeFromSite")
                      : t("dashboard.talentHubFace.addToSite")
                  }
                >
                  {/* eslint-disable-next-line @next/next/no-img-element -- media-public URLs are already optimized crops; the shell renders them as plain img everywhere. */}
                  <img
                    src={photo.url}
                    alt={photo.alt ?? ""}
                    loading="lazy"
                    className="aspect-[3/4] w-full object-cover"
                  />
                </button>

                {isSelected && (
                  <span className="absolute left-1.5 top-1.5 rounded bg-admin-indigo-deep px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {index + 1}
                  </span>
                )}
                {isCover && (
                  <span className="absolute right-1.5 top-1.5 rounded bg-admin-accent px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {t("dashboard.talentHubFace.coverBadge")}
                  </span>
                )}
                {isDefaultFace && !isSelected && (
                  <span className="pointer-events-none absolute right-1.5 top-1.5 rounded bg-admin-indigo-deep px-1.5 py-0.5 text-[10px] font-bold text-white">
                    {t("dashboard.talentHubFace.defaultFaceBadge")}
                  </span>
                )}

                {/*
                  B4 — the cover control is HIDDEN, not greyed, until the tile
                  is selected. A permanently visible "Make cover" that does
                  nothing on 90% of tiles is exactly the dead-looking chrome
                  the pass is removing. Enabled ink is `-muted` (0.72) and
                  disabled is `-dim` (0.38): the token names read backwards.
                */}
                {isSelected && (
                  <button
                    type="button"
                    onClick={() => chooseCover(isCover ? null : photo.assetId)}
                    disabled={saveState === "saving"}
                    title={t("dashboard.talentHubFace.coverButtonHint")}
                    className="w-full cursor-pointer border-t border-admin-border-soft bg-admin-surface px-2 py-1 text-[10.5px] font-semibold text-admin-ink-muted disabled:cursor-not-allowed disabled:text-admin-ink-dim"
                  >
                    {isCover
                      ? t("dashboard.talentHubFace.clearCover")
                      : t("dashboard.talentHubFace.makeCover")}
                  </button>
                )}

                {/*
                  B6 — the strip used to gate on the SERVER-persisted
                  `photo.selected`, so caption / order / visibility were
                  invisible until you saved once and looked like missing
                  features. It now appears as soon as the tile is selected in
                  the DRAFT, with the controls disabled and an explicit reason
                  until the selection is saved (they write immediately and the
                  server refuses a photo with no curation row).
                */}
                {isSelected && (
                  <div className="flex flex-col gap-1 border-t border-admin-border-soft bg-admin-surface p-1.5">
                    {!photo.selected && (
                      <span className="text-[10px] leading-snug text-admin-ink-dim">
                        {t("dashboard.talentHubFace.saveFirstHint")}
                      </span>
                    )}
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveMedia(photo.assetId, -1)}
                        disabled={!canMoveUp || orderState === "saving"}
                        aria-label={t("dashboard.talentHubFace.moveUpAria")}
                        title={
                          photo.selected
                            ? t("dashboard.talentHubFace.moveUpAria")
                            : t("dashboard.talentHubFace.saveFirstHint")
                        }
                        className="flex-1 cursor-pointer rounded border border-admin-border-soft bg-admin-surface-alt py-0.5 text-[10px] font-semibold text-admin-ink-muted disabled:cursor-not-allowed disabled:text-admin-ink-dim"
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => moveMedia(photo.assetId, 1)}
                        disabled={!canMoveDown || orderState === "saving"}
                        aria-label={t("dashboard.talentHubFace.moveDownAria")}
                        title={
                          photo.selected
                            ? t("dashboard.talentHubFace.moveDownAria")
                            : t("dashboard.talentHubFace.saveFirstHint")
                        }
                        className="flex-1 cursor-pointer rounded border border-admin-border-soft bg-admin-surface-alt py-0.5 text-[10px] font-semibold text-admin-ink-muted disabled:cursor-not-allowed disabled:text-admin-ink-dim"
                      >
                        ↓
                      </button>
                      {/*
                        B7 — one label everywhere. The old control used ◉ / ◎
                        glyphs with a tooltip and an aria-label that disagreed,
                        and the semantic that actually matters (a hidden photo
                        KEEPS its caption and position) lived only in a server
                        type comment. Eye-slash icon + one string, used as both
                        title and aria-label so they cannot drift again.
                      */}
                      <button
                        type="button"
                        onClick={() => toggleVisibility(photo)}
                        disabled={!photo.selected || visibilitySave === "saving"}
                        aria-pressed={!photo.visible}
                        aria-label={
                          photo.visible
                            ? t("dashboard.talentHubFace.hideAria")
                            : t("dashboard.talentHubFace.showAria")
                        }
                        title={
                          photo.selected
                            ? photo.visible
                              ? t("dashboard.talentHubFace.hideAria")
                              : t("dashboard.talentHubFace.showAria")
                            : t("dashboard.talentHubFace.saveFirstHint")
                        }
                        className={`flex flex-1 cursor-pointer items-center justify-center rounded border py-0.5 text-[10px] font-semibold disabled:cursor-not-allowed disabled:text-admin-ink-dim ${
                          photo.visible
                            ? "border-admin-border-soft bg-admin-surface-alt text-admin-ink-muted"
                            : "border-admin-indigo-deep bg-admin-indigo-soft text-admin-indigo-deep"
                        }`}
                      >
                        {photo.visible ? <EyeIcon /> : <EyeOffIcon />}
                      </button>
                    </div>
                    {!photo.visible && photo.selected && (
                      <span className="text-[10px] leading-snug text-admin-indigo-deep">
                        {t("dashboard.talentHubFace.hiddenKeepsHint")}
                      </span>
                    )}

                    <input
                      type="text"
                      value={captionDrafts[photo.assetId] ?? ""}
                      onChange={(e) =>
                        setCaptionDrafts((prev) => ({ ...prev, [photo.assetId]: e.target.value }))
                      }
                      onBlur={() => {
                        if ((captionDrafts[photo.assetId] ?? "") !== (photo.caption ?? "")) {
                          void saveCaption(photo.assetId);
                        }
                      }}
                      disabled={!photo.selected}
                      title={
                        photo.selected ? undefined : t("dashboard.talentHubFace.saveFirstHint")
                      }
                      placeholder={
                        photo.selected
                          ? t("dashboard.talentHubFace.captionPlaceholder")
                          : t("dashboard.talentHubFace.captionPlaceholderLocked")
                      }
                      className="w-full rounded border border-admin-border-soft bg-admin-surface-alt px-1.5 py-1 text-[10.5px] text-admin-ink focus:border-admin-indigo-deep focus:outline-none disabled:cursor-not-allowed disabled:text-admin-ink-dim"
                    />
                    {captionSave === "saving" && (
                      <span className="text-[10px] text-admin-ink-muted">
                        {t("dashboard.talentHubFace.captionSaving")}
                      </span>
                    )}
                    {captionSave === "error" && (
                      <span className="text-[10px] text-admin-red">
                        {captionError[photo.assetId] ?? t("dashboard.talentHubFace.captionError")}
                      </span>
                    )}
                    {captionSave === "saved" && (
                      <span className="text-[10px] text-admin-ink-muted">
                        {t("dashboard.talentHubFace.captionSaved")}
                      </span>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/*
        P0-3 — the honest empty state. With nothing curated the site is NOT
        blank: it serves the default rank. `liveSource` comes from the
        storefront resolver, so this cannot drift from what visitors see.
      */}
      {photos !== null && photos.length > 0 && liveSource === "default" && (
        <div className="rounded-lg border border-dashed border-admin-border bg-admin-surface-alt p-3 text-[11.5px] leading-relaxed text-admin-ink-muted">
          <span className="font-semibold text-admin-ink">
            {t("dashboard.talentHubFace.defaultSelectionTitle")}
          </span>{" "}
          {t("dashboard.talentHubFace.defaultSelectionBody")}
          {defaultCoverAssetId && (
            <span className="mt-1 block text-admin-ink-muted">
              {t("dashboard.talentHubFace.defaultSelectionOutlineHint")}
            </span>
          )}
        </div>
      )}

      {photos !== null && photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveSelection}
            disabled={!dirty || saveState === "saving"}
            className="cursor-pointer rounded-lg bg-admin-indigo-deep px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-admin-fill disabled:text-admin-ink-dim"
          >
            {saveState === "saving"
              ? t("dashboard.talentHubFace.saving")
              : t("dashboard.talentHubFace.save")}
          </button>
          <span className="text-[11.5px] text-admin-ink-muted">
            {saveState === "saved" && !dirty
              ? t("dashboard.talentHubFace.saved")
              : dirty
                ? t("dashboard.talentHubFace.unsavedCount").replace(
                    "{count}",
                    String(selected.length),
                  )
                : selected.length === 0
                  ? t("dashboard.talentHubFace.noneSelectedShowingDefault")
                  : t("dashboard.talentHubFace.selectedCount").replace(
                      "{count}",
                      String(selected.length),
                    )}
          </span>
          {saveError && <span className="text-[11.5px] text-admin-red">{saveError}</span>}
          {orderState === "saving" && (
            <span className="text-[11.5px] text-admin-ink-muted">
              {t("dashboard.talentHubFace.orderSaving")}
            </span>
          )}
          {orderState === "error" && orderError && (
            <span className="text-[11.5px] text-admin-red">{orderError}</span>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Eye / eye-slash for the include-exclude toggle (B7). Replaces the ◉ / ◎
 * glyph pair, which nobody could read as "on the site" vs "kept but hidden".
 * Inline SVG rather than an icon package: this tree is frozen against new
 * inline styles, not against markup, and the shell has no icon dependency.
 * `currentColor` so the button's own token drives the stroke.
 */
function EyeIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M10.6 5.1A10.9 10.9 0 0 1 12 5c6.5 0 10 7 10 7a18.3 18.3 0 0 1-3 4.1" />
      <path d="M6.2 6.2A18.3 18.3 0 0 0 2 12s3.5 7 10 7a10.7 10.7 0 0 0 5.1-1.2" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
