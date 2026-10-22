"use client";

/**
 * item-photos-field — TUL-1271 #1: add, remove and reorder-by-cover the photos
 * of a workspace catalog item. Files go to the tenant library
 * (`/api/admin/media/upload`), then `setWorkspaceItemPhotos` links them to the
 * item. The first photo is the cover. A new (unsaved) item keeps its photos in
 * the draft and links them when it is saved (TUL-1271: the field used to be
 * disabled until a first save, and the draft showed no photos).
 */

import { useRef, useState } from "react";

import { useT } from "@/i18n/use-t";
import { compressImage } from "@/lib/client/image-compress";
import { setWorkspaceItemPhotos, setWorkspacePhotoAlt } from "@/lib/talent/menu-offerings-actions";
import { MAX_ITEM_PHOTOS, nextPhotoIds } from "@/lib/talent/workspace-item-photos";
import { Field, INPUT } from "./catalog-ui";
import type { TabProps } from "./CatalogItemEditor";

/** The upload route reads the file from this multipart field. The file is compressed first (see below). */
const UPLOAD_FIELD = "file";

export function ItemPhotosField({ item, editor, tenantId, isDraft }: Pick<TabProps, "item" | "editor" | "tenantId" | "isDraft">) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const assets = item.imageAssets ?? [];
  const ids = assets.map((a) => a.id);

  async function apply(nextIds: string[], uploaded?: { id: string; url: string }) {
    if (isDraft) {
      // Not saved yet: hold the photos on the draft; the editor links them on save.
      const next = nextIds.map((id) => assets.find((a) => a.id === id) ?? (uploaded && uploaded.id === id ? uploaded : null)).filter((a): a is { id: string; url: string; alt?: string | null } => !!a);
      editor.setDraft((d) => (d ? { ...d, imageAssets: next, imageUrls: next.map((a) => a.url) } : d));
      return;
    }
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
      // Compress in the browser first: the upload route is body-capped (~4.5 MB) and a phone photo is bigger.
      const small = (await compressImage(file)).file;
      body.set(UPLOAD_FIELD, small);
      body.set("tenantId", tenantId);
      const resp = await fetch("/api/admin/media/upload", { method: "POST", body });
      const json = (await resp.json().catch(() => null)) as { ok?: boolean; item?: { id?: string }; error?: string } | null;
      const up = json?.item as { id?: string; publicUrl?: string; url?: string } | undefined;
      if (!resp.ok || !json?.ok || !up?.id) {
        setError(json?.error ?? t("dashboard.catalog.details.photosFailed"));
        return;
      }
      await apply(nextPhotoIds(ids, { add: [up.id] }), { id: up.id, url: up.publicUrl ?? up.url ?? "" });
    } catch {
      setError(t("dashboard.catalog.details.photosFailed"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  return (
    <Field
      label={t("dashboard.catalog.details.photos")}
      reason={null}
      hint={t("dashboard.catalog.details.photosHint")}
      className="col-span-2"
    >
      <div className="flex flex-wrap items-center gap-[8px]" data-testid="catalog-field-photos-list">
        {assets.map((a, i) => (
          <div key={a.id} className="flex w-[96px] flex-col gap-[4px]">
          <div className="relative h-[64px] w-[64px] overflow-hidden rounded-[10px] border border-admin-border bg-admin-surface">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={a.url} alt={a.alt ?? ""} className="h-full w-full object-cover" />
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
          <input
            type="text"
            defaultValue={a.alt ?? ""}
            maxLength={200}
            placeholder={t("dashboard.catalog.details.photosAlt")}
            aria-label={t("dashboard.catalog.details.photosAlt")}
            data-testid={`catalog-photo-alt-${a.id}`}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v === (a.alt ?? "")) return;
              if (isDraft) {
                editor.setDraft((d) => (d ? { ...d, imageAssets: assets.map((x) => (x.id === a.id ? { ...x, alt: v || null } : x)) } : d));
                return;
              }
              void setWorkspacePhotoAlt(tenantId, a.id, v).then((res) => {
                if (!res.ok) setError(res.error);
                else editor.syncImages(item.id, assets.map((x) => (x.id === a.id ? { ...x, alt: v || null } : x)));
              });
            }}
            className="h-[26px] w-full min-w-0 rounded-[6px] border border-admin-border bg-admin-card px-[6px] font-admin-body text-[11px] text-admin-ink"
          />
          </div>
        ))}
        {assets.length < MAX_ITEM_PHOTOS ? (
          <input
            ref={fileRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            disabled={busy}
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
