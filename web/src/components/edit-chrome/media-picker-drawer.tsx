"use client";

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AlertCircle,
  Check,
  FolderOpen,
  ImageIcon,
  Loader2,
  Upload,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { uploadCmsMedia } from "@/lib/client/signed-upload";

import {
  CHROME,
  Drawer,
  DrawerBody,
  DrawerHead,
  DrawerSkeletonGrid,
  SaveChip,
} from "./kit";
import { KIT } from "./inspectors/kit/tokens";

export interface MediaPickerItem {
  id: string;
  publicUrl: string;
  storagePath: string;
  variantKind: string;
  width: number | null;
  height: number | null;
  createdAt: string;
  alt?: string | null;
  folderIds?: string[];
  mime?: string | null;
}

export interface MediaPickerFolder {
  id: string;
  name: string;
  color: string | null;
  assetIds: string[];
}

export interface MediaPickedItem {
  id: string;
  publicUrl: string;
  width: number | null;
  height: number | null;
  alt?: string | null;
}

interface MediaPickerDrawerProps {
  tenantId: string;
  open: boolean;
  title?: string;
  multi?: boolean;
  onPick: (publicUrl: string) => void;
  onPickItem?: (item: MediaPickedItem) => void;
  onMultiPick?: (publicUrls: string[]) => void;
  onClose: () => void;
}

const TITLE_ID = "media-picker-drawer-title";

export function MediaPickerDrawer({
  tenantId,
  open,
  title = "Media library",
  multi = false,
  onPick,
  onPickItem,
  onMultiPick,
  onClose,
}: MediaPickerDrawerProps) {
  const [items, setItems] = useState<MediaPickerItem[] | null>(null);
  const [folders, setFolders] = useState<MediaPickerFolder[]>([]);
  const [activeFolderId, setActiveFolderId] = useState<string>("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [pending, setPending] = useState<string[]>([]);
  const [altDrafts, setAltDrafts] = useState<Record<string, string>>({});
  const [savingAltId, setSavingAltId] = useState<string | null>(null);
  const [altError, setAltError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadLibrary = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/admin/media/library?tenantId=${encodeURIComponent(tenantId)}`,
        { cache: "no-store" },
      );
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      setItems(body.items as MediaPickerItem[]);
      setFolders((body.folders ?? []) as MediaPickerFolder[]);
      setAltDrafts(
        Object.fromEntries(
          ((body.items as MediaPickerItem[]) ?? []).map((item) => [
            item.id,
            item.alt ?? "",
          ]),
        ),
      );
    } catch (e) {
      setError(String(e).slice(0, 200));
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!open || items !== null || loading) return;
    void loadLibrary();
  }, [open, items, loading, loadLibrary]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  async function handleFileChosen(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      let item: MediaPickerItem;
      const fast = await uploadCmsMedia({ file, tenantId, kind: "image" });
      if (fast.ok) {
        item = fast.item as MediaPickerItem;
      } else if (!fast.fallbackToLegacy) {
        throw new Error(fast.error);
      } else {
        const form = new FormData();
        form.set("tenantId", tenantId);
        form.set("file", file);
        const res = await fetch("/api/admin/media/upload", {
          method: "POST",
          body: form,
        });
        const body = await res.json();
        if (!res.ok || !body.ok) {
          throw new Error(body.error ?? `HTTP ${res.status}`);
        }
        item = body.item as MediaPickerItem;
      }
      setActiveFolderId("all");
      setItems((prev) => [item, ...(prev ?? [])]);
      setAltDrafts((prev) => ({ ...prev, [item.id]: item.alt ?? "" }));
      if (multi) {
        setPending((prev) =>
          prev.includes(item.publicUrl) ? prev : [...prev, item.publicUrl],
        );
      } else {
        pickItem(item);
      }
    } catch (e) {
      setUploadError(String(e).slice(0, 200));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleClose() {
    setPending([]);
    onClose();
  }

  function pickItem(item: MediaPickerItem) {
    onPick(item.publicUrl);
    onPickItem?.({
      id: item.id,
      publicUrl: item.publicUrl,
      width: item.width,
      height: item.height,
      alt: item.alt ?? null,
    });
    handleClose();
  }

  function togglePending(url: string) {
    setPending((prev) =>
      prev.includes(url) ? prev.filter((value) => value !== url) : [...prev, url],
    );
  }

  function confirmMulti() {
    if (pending.length > 0) onMultiPick?.(pending);
    handleClose();
  }

  async function commitAlt(item: MediaPickerItem) {
    const nextAlt = (altDrafts[item.id] ?? "").trim();
    if (nextAlt === (item.alt ?? "")) return;
    setSavingAltId(item.id);
    setAltError(null);
    try {
      const res = await fetch("/api/admin/media/library", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenantId, id: item.id, alt: nextAlt }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      const updated = body.item as MediaPickerItem;
      setItems((prev) =>
        (prev ?? []).map((candidate) =>
          candidate.id === updated.id ? { ...candidate, alt: updated.alt } : candidate,
        ),
      );
      setAltDrafts((prev) => ({ ...prev, [updated.id]: updated.alt ?? "" }));
    } catch (e) {
      setAltError(String(e).slice(0, 200));
    } finally {
      setSavingAltId(null);
    }
  }

  if (!open) return null;

  const visibleItems =
    activeFolderId === "all"
      ? items
      : (items ?? []).filter((item) => item.folderIds?.includes(activeFolderId));
  const activeFolder =
    activeFolderId === "all"
      ? null
      : folders.find((folder) => folder.id === activeFolderId) ?? null;

  const chip = uploading ? (
    <SaveChip status="saving" label="Uploading" />
  ) : savingAltId ? (
    <SaveChip status="saving" label="Saving alt" />
  ) : error || uploadError || altError ? (
    <SaveChip status="error" label="Needs attention" />
  ) : (
    <SaveChip status="count" label={`${visibleItems?.length ?? 0} assets`} />
  );

  return (
    <>
      <div
        className="fixed inset-0 z-[119] bg-[#242942]/30 backdrop-blur-[1px]"
        aria-hidden
        onClick={handleClose}
      />
      <Drawer
        kind="assets"
        ariaLabelledBy={TITLE_ID}
        width={760}
        open
        zIndex={120}
        testId="media-picker-drawer"
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void handleFileChosen(file);
          }}
        />
        <DrawerHead
          titleId={TITLE_ID}
          title={title}
          icon={<ImageIcon className="size-3.5" />}
          saveChip={chip}
          meta={
            multi
              ? `${pending.length} selected`
              : activeFolder
                ? activeFolder.name
                : "Tenant media library"
          }
          onClose={handleClose}
        />
        <DrawerBody>
          <div className="mb-3 flex items-center justify-between gap-2">
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              title="Upload image"
            >
              {uploading ? (
                <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <Upload className="mr-1.5 size-3.5" />
              )}
              {uploading ? "Uploading" : "Upload"}
            </Button>
            {multi ? (
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={handleClose}>
                  <X className="mr-1.5 size-3.5" />
                  Cancel
                </Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={pending.length === 0}
                  onClick={confirmMulti}
                >
                  <Check className="mr-1.5 size-3.5" />
                  Add {pending.length || ""}
                </Button>
              </div>
            ) : null}
          </div>

          {folders.length > 0 ? (
            <div className="mb-3 flex gap-2 overflow-x-auto pb-1" aria-label="Media albums">
              <AlbumButton
                active={activeFolderId === "all"}
                label="All photos"
                count={items?.length ?? 0}
                onClick={() => setActiveFolderId("all")}
              />
              {folders.map((folder) => (
                <AlbumButton
                  key={folder.id}
                  active={activeFolderId === folder.id}
                  color={folder.color}
                  label={folder.name}
                  count={
                    (items ?? []).filter((item) => item.folderIds?.includes(folder.id)).length
                  }
                  onClick={() => setActiveFolderId(folder.id)}
                />
              ))}
            </div>
          ) : null}

          {uploadError || altError ? (
            <StatusNotice message={uploadError ?? altError ?? ""} />
          ) : null}

          {loading ? (
            // W3-T7: content-shaped grid skeleton (matches the 2–3 col tile
            // grid) instead of a centered spinner, so the library doesn't flash
            // empty while the asset list loads.
            <DrawerSkeletonGrid rows={6} />
          ) : error ? (
            <StatePanel
              icon={<AlertCircle className="size-4" />}
              title="Could not load assets"
              detail={error}
              action={
                <Button type="button" size="sm" variant="outline" onClick={loadLibrary}>
                  Retry
                </Button>
              }
            />
          ) : visibleItems && visibleItems.length > 0 ? (
            <ul className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {visibleItems.map((item) => {
                const selected = multi && pending.includes(item.publicUrl);
                return (
                  <li key={item.id}>
                    <div
                      className="overflow-hidden rounded-lg border bg-white shadow-sm"
                      style={{
                        borderColor: selected ? CHROME.accent : CHROME.lineStrong,
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          if (multi) togglePending(item.publicUrl);
                          else pickItem(item);
                        }}
                        className="relative block w-full bg-stone-100 text-left"
                      >
                        <span
                          className="block aspect-[4/5] w-full bg-cover bg-center"
                          style={{ backgroundImage: `url(${item.publicUrl})` }}
                          aria-hidden
                        />
                        {selected ? (
                          <span className="absolute right-2 top-2 inline-flex size-6 items-center justify-center rounded-full bg-[#3d4f7c] text-white shadow">
                            <Check className="size-3.5" />
                          </span>
                        ) : null}
                      </button>
                      <div className="grid gap-2 p-2">
                        <input
                          className={KIT.input}
                          value={altDrafts[item.id] ?? ""}
                          placeholder="Alt text"
                          onClick={(event) => event.stopPropagation()}
                          onChange={(event) => {
                            setAltDrafts((prev) => ({
                              ...prev,
                              [item.id]: event.currentTarget.value,
                            }));
                          }}
                          onBlur={() => {
                            void commitAlt(item);
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== "Enter") return;
                            event.preventDefault();
                            event.currentTarget.blur();
                          }}
                        />
                        <p className="truncate text-[10.5px] text-stone-500">
                          {item.width && item.height
                            ? `${item.width}x${item.height}`
                            : item.variantKind}
                        </p>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : activeFolder ? (
            <StatePanel
              icon={<FolderOpen className="size-4" />}
              title="No images in this album"
            />
          ) : (
            <StatePanel
              icon={<ImageIcon className="size-4" />}
              title="No assets yet"
              action={
                <Button
                  type="button"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="mr-1.5 size-3.5" />
                  Upload
                </Button>
              }
            />
          )}
        </DrawerBody>
      </Drawer>
    </>
  );
}

function StatusNotice({ message }: { message: string }) {
  const palette = { bg: CHROME.roseBg, fg: CHROME.rose, line: CHROME.roseLine };
  return (
    <div
      className="mb-3 rounded-lg border px-3 py-2 text-sm"
      style={{ background: palette.bg, color: palette.fg, borderColor: palette.line }}
      role="alert"
    >
      {message}
    </div>
  );
}

function AlbumButton({
  active,
  label,
  count,
  color,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  color?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium transition"
      style={{
        background: active ? "#f2f0ea" : "#ffffff",
        borderColor: active ? CHROME.accent : CHROME.lineStrong,
        color: active ? "#25304f" : "#5f605d",
      }}
      title={label}
    >
      <span
        className="inline-flex size-4 items-center justify-center rounded-sm"
        style={{ background: color ?? "#e7e1d6", color: active ? "#25304f" : "#6b665e" }}
        aria-hidden
      >
        <FolderOpen className="size-3" />
      </span>
      <span className="max-w-[12rem] truncate">{label}</span>
      <span className="text-[10px] text-stone-400">{count}</span>
    </button>
  );
}

function StatePanel({
  icon,
  title,
  detail,
  action,
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex min-h-[280px] items-center justify-center rounded-lg border border-dashed border-stone-300 bg-[#faf9f6] p-8 text-center">
      <div className="grid justify-items-center gap-2 text-stone-600">
        <span className="inline-flex size-9 items-center justify-center rounded-full border border-stone-200 bg-white text-[#3d4f7c]">
          {icon}
        </span>
        <p className="text-sm font-semibold text-stone-800">{title}</p>
        {detail ? <p className="max-w-[36ch] text-xs text-stone-500">{detail}</p> : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}
