"use client";

/**
 * item-photos-field — TUL-1271 #1: add, remove and reorder-by-cover the photos
 * of a workspace catalog item. Files go to the tenant library
 * (`/api/admin/media/upload`), then `setWorkspaceItemPhotos` links them to the
 * item. The first photo is the cover. A new (unsaved) item says to save first.
 */

import { useRef, useState } from "react";

import { useT } from "@/i18n/use-t";
import { setWorkspaceItemPhotos } from "@/lib/talent/menu-offerings-actions";
import { MAX_ITEM_PHOTOS, nextPhotoIds } from "@/lib/talent/workspace-item-photos";
import { Field, INPUT } from "./catalog-ui";
import type { TabProps } from "./CatalogItemEditor";

export function ItemPhotosField({ item, editor, tenantId, isDraft }: Pick<TabProps, "item" | "editor" | "tenantId" | "isDraft">) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assets = item.imageAssets ?? [];
  const ids = assets.map((a) => a.id);

  async function apply(nextIds: string[]) {
    const res = await setWorkspaceItemPhotos(tenantId, item.id, nextIds);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    editor.syncImages(item.id, res.assets);
  }

  async function onPick(file: File | undefined) {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("tenantId", tenantId);
      const resp = await fetch("/api/admin/media/upload", { method: "POST", body });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; item?: { id?: string }; error?: string } | null;
      if (!resp.ok || !json?.ok || !json.item?.id) {
        setError(json?.error ?? t("dashboard.catalog.details.photosFailed"));
        return;
      }
      await apply(nextPhotoIds(ids, { add: [json.item.id] }));
    } catch {
      setError(t("dashboard.catalog.details.photosFailed"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const locked = isDraft || !item.id;
  return (
    <Field
      label={t("dashboard.catalog.details.photos")}
      reason={locked ? t("dashboard.catalog.details.photosSaveFirst") : null}
      hint={locked ? null : t("dashboard.catalog.details.photosHint")}
      className="col-span-2"
    >
      <div className="flex flex-wrap items-center gap-[8px]" data-testid="catalog-field-photos-list">
        {assets.map((a, i) => (
          <div key={a.id} className="relative h-[64px] w-[64px] overflow-hidden rounded-[10px] border border-admin-border bg-admin-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt="" className="h-full w-full object-cover" />
            {i === 0 ? (
              <span className="absolute bottom-0 left-0 right-0 bg-admin-ink/70 text-center font-admin-body text-[10px] text-white">
                {t("dashboard.catalog.details.photosCover")}
              </span>
            ) : null}
            <button
              type="button"
              disabled={busy}
              aria-label={t("dashboard.catalog.details.photosRemove")}
              onClick={() => {
                setBusy(true);
                void apply(nextPhotoIds(ids, { remove: a.id })).finally(() => setBusy(false));
              }}
              className="absolute right-[2px] top-[2px] h-[20px] w-[20px] cursor-pointer rounded-full border-0 bg-admin-ink/70 font-admin-body text-[12px] leading-none text-white disabled:opacity-50"
            >
              ×
            </button>
          </div>
        ))}
        {assets.length < MAX_ITEM_PHOTOS ? (
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={locked || busy}
            onChange={(e) => void onPick(e.target.files?.[0])}
            className={`${INPUT} min-w-0 flex-1 py-[6px]`}
            data-testid="catalog-field-photos"
          />
        ) : null}
      </div>
      {busy ? <p className="m-0 mt-[4px] font-admin-body text-[11px] text-admin-ink-muted">{t("dashboard.catalog.details.photosUploading")}</p> : null}
      {error ? <p className="m-0 mt-[4px] font-admin-body text-[11px] text-admin-coral" role="alert">{error}</p> : null}
    </Field>
  );
}
