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
 */

import { useCallback, useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import {
  actionLoadTalentHubFace,
  actionSetTalentHubCover,
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

  const dirty =
    photos !== null &&
    JSON.stringify(selected) !==
      JSON.stringify(photos.filter((p) => p.selected).map((p) => p.assetId));

  const toggle = (assetId: string) => {
    setSaveState("idle");
    setSelected((prev) =>
      prev.includes(assetId) ? prev.filter((id) => id !== assetId) : [...prev, assetId],
    );
  };

  const saveSelection = async () => {
    setSaveState("saving");
    setSaveError(null);
    const res = await actionSetTalentHubSelection(talentProfileId, selected);
    if (!res.ok) {
      setSaveState("error");
      setSaveError(res.error);
      return;
    }
    setCover(res.data.coverAssetId);
    setSaveState("saved");
    await load();
  };

  const makeCover = async (assetId: string | null) => {
    setSaveState("saving");
    setSaveError(null);
    const res = await actionSetTalentHubCover(talentProfileId, assetId);
    if (!res.ok) {
      setSaveState("error");
      setSaveError(res.error);
      return;
    }
    setCover(res.data.coverAssetId);
    setSaveState("saved");
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
      </div>

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
            return (
              <div
                key={photo.assetId}
                className={`relative overflow-hidden rounded-lg border ${
                  isCover
                    ? "border-admin-accent"
                    : isSelected
                      ? "border-admin-indigo-deep"
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

                <button
                  type="button"
                  onClick={() => makeCover(isCover ? null : photo.assetId)}
                  disabled={!isSelected || saveState === "saving"}
                  className="w-full cursor-pointer border-t border-admin-border-soft bg-admin-surface px-2 py-1 text-[10.5px] font-semibold text-admin-ink-dim disabled:cursor-not-allowed disabled:text-admin-ink-muted"
                >
                  {isCover
                    ? t("dashboard.talentHubFace.clearCover")
                    : t("dashboard.talentHubFace.makeCover")}
                </button>
              </div>
            );
          })}
        </div>
      )}

      {photos !== null && photos.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={saveSelection}
            disabled={!dirty || saveState === "saving"}
            className="cursor-pointer rounded-lg bg-admin-indigo-deep px-3 py-1.5 text-[12px] font-semibold text-white disabled:cursor-not-allowed disabled:bg-admin-fill disabled:text-admin-ink-muted"
          >
            {saveState === "saving"
              ? t("dashboard.talentHubFace.saving")
              : t("dashboard.talentHubFace.save")}
          </button>
          <span className="text-[11.5px] text-admin-ink-muted">
            {saveState === "saved" && !dirty
              ? t("dashboard.talentHubFace.saved")
              : t("dashboard.talentHubFace.selectedCount").replace(
                  "{count}",
                  String(selected.length),
                )}
          </span>
          {saveError && <span className="text-[11.5px] text-admin-red">{saveError}</span>}
        </div>
      )}
    </div>
  );
}
