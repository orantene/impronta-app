"use client";

import {
  DndContext,
  DragOverlay,
  type DragEndEvent,
  type DragStartEvent,
  KeyboardSensor,
  PointerSensor,
  rectIntersection,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  GripVertical,
  Loader2,
  Star,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  staffRegisterGalleryMediaAsset,
  staffRegisterSlotMediaAsset,
  staffReorderGalleryMediaForTalent,
  staffSetMediaApprovalState,
  staffSetPrimaryGalleryMediaForTalent,
  staffSoftDeleteMediaAsset,
} from "@/app/(dashboard)/admin/admin-media-actions";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { AdminTalentMediaRow } from "@/lib/admin-talent-media-data";
import { GALLERY_DROP_ANIMATION } from "@/lib/media-gallery-dnd";
import { LUXURY_GOLD_BUTTON_CLASS } from "@/lib/dashboard-shell-classes";
import { cn } from "@/lib/utils";

function isPrimary(meta: Record<string, unknown>): boolean {
  return meta.is_primary === true;
}

function isLikelyImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  const name = (file.name || "").toLowerCase();
  return /\.(jpe?g|png|webp|heic|gif|avif)$/.test(name);
}

function fileExt(file: File): string {
  const n = (file.name || "").split(".").pop()?.toLowerCase();
  if (!n) return "jpg";
  if (n === "jpeg") return "jpg";
  return n;
}

async function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = document.createElement("img");
    img.decoding = "async";
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Failed to load image"));
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function toWebpFromFile(file: File): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImageFromFile(file);
  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/webp",
      0.92,
    );
  });
  return { blob, width: canvas.width, height: canvas.height };
}

/** Center-crop to aspect ratio (width/height), encode WebP. */
async function fileToWebpCoverAspect(
  file: File,
  aspectW: number,
  aspectH: number,
  maxEdge = 1600,
): Promise<{ blob: Blob; width: number; height: number }> {
  const img = await loadImageFromFile(file);
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const targetAspect = aspectW / aspectH;
  let sx = 0;
  let sy = 0;
  let sw = iw;
  let sh = ih;
  const imgAspect = iw / ih;
  if (imgAspect > targetAspect) {
    sw = ih * targetAspect;
    sx = (iw - sw) / 2;
  } else {
    sh = iw / targetAspect;
    sy = (ih - sh) / 2;
  }
  let outW = maxEdge;
  let outH = Math.round(outW / targetAspect);
  if (outH > maxEdge) {
    outH = maxEdge;
    outW = Math.round(outH * targetAspect);
  }
  const canvas = document.createElement("canvas");
  canvas.width = outW;
  canvas.height = outH;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, outW, outH);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Failed to encode image"))),
      "image/webp",
      0.9,
    );
  });
  return { blob, width: outW, height: outH };
}

function AdminGalleryTile({
  item,
  index,
  length,
  busy,
  filterAll,
  onPrimary,
  onApproval,
  onMove,
  onReplace,
  onDelete,
}: {
  item: AdminTalentMediaRow;
  index: number;
  length: number;
  busy: boolean;
  filterAll: boolean;
  onPrimary: (id: string) => void;
  onApproval: (id: string, state: "pending" | "approved" | "rejected") => void;
  onMove: (i: number, dir: -1 | 1) => void;
  onReplace?: () => void;
  onDelete?: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: busy || !filterAll,
    transition: {
      duration: 280,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const primary = isPrimary(item.metadata);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative overflow-hidden rounded-lg border bg-muted/15 shadow-sm transition-[box-shadow,transform] duration-200 ease-out",
        "hover:border-[var(--impronta-gold-border)]/50 hover:shadow-md",
        primary
          ? "border-[var(--impronta-gold)]/55 ring-2 ring-[var(--impronta-gold)]/30"
          : "border-border/60",
        isDragging && "z-20 scale-[1.02] opacity-95 shadow-lg ring-2 ring-primary/20",
      )}
    >
      {primary ? (
        <span className="absolute left-2 top-2 z-10 rounded-full border border-[var(--impronta-gold)]/35 bg-black/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--impronta-gold)] shadow-sm backdrop-blur-sm">
          Primary
        </span>
      ) : null}
      <div className="relative aspect-[4/3] w-full">
        {item.publicUrl ? (
          <>
            <Image
              src={item.publicUrl}
              alt=""
              fill
              className={cn(
                "object-cover transition-all duration-300 ease-out",
                !imgLoaded && "scale-105 blur-md",
              )}
              sizes="(max-width: 768px) 50vw, 25vw"
              onLoadingComplete={() => setImgLoaded(true)}
            />
            <a
              href={item.publicUrl}
              target="_blank"
              rel="noreferrer"
              className="absolute right-2 top-2 rounded-md bg-black/55 p-1.5 text-white opacity-0 shadow-sm transition-opacity hover:bg-black/75 group-hover:opacity-100"
              aria-label="Open full image"
            >
              <ExternalLink className="size-3.5" />
            </a>
          </>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No preview
          </div>
        )}
      </div>
      <div className="space-y-1 border-t border-border/40 bg-card/30 px-2 py-2 text-[10px] text-muted-foreground">
        <p className="font-mono text-[9px] text-foreground/80">
          {new Date(item.created_at).toLocaleString()}
        </p>
        <p>
          Uploaded by:{" "}
          <span className="text-foreground">
            {item.uploaderDisplayName ?? (item.uploaded_by_user_id ? "User" : "—")}
          </span>
        </p>
        <Badge variant="outline" className="text-[10px] font-normal">
          {item.approval_state}
        </Badge>
      </div>
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center justify-between gap-1 bg-gradient-to-t from-black/80 to-transparent p-2 pt-10">
        <button
          type="button"
          className="rounded-md p-1 text-white/90 hover:bg-white/10 disabled:opacity-30"
          aria-label="Drag to reorder"
          disabled={busy || !filterAll}
          {...attributes}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <div className="flex flex-1 justify-center gap-0.5">
          <button
            type="button"
            className="rounded-md p-1 text-white/90 hover:bg-white/10 disabled:opacity-30"
            disabled={busy || !filterAll || index === 0}
            onClick={() => onMove(index, -1)}
            aria-label="Move up"
          >
            <ChevronUp className="size-4" />
          </button>
          <button
            type="button"
            className="rounded-md p-1 text-white/90 hover:bg-white/10 disabled:opacity-30"
            disabled={busy || !filterAll || index === length - 1}
            onClick={() => onMove(index, 1)}
            aria-label="Move down"
          >
            <ChevronDown className="size-4" />
          </button>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          <button
            type="button"
            className={cn(
              "rounded-md p-1.5 hover:bg-white/10",
              primary ? "text-[var(--impronta-gold)]" : "text-white/70",
            )}
            disabled={busy}
            aria-label="Set primary"
            onClick={() => onPrimary(item.id)}
          >
            <Star className="size-4" fill={primary ? "currentColor" : "none"} />
          </button>
          <Button
            type="button"
            size="sm"
            className={cn("h-8 px-2.5 text-[10px] font-semibold", LUXURY_GOLD_BUTTON_CLASS)}
            disabled={busy || item.approval_state === "approved"}
            onClick={() => onApproval(item.id, "approved")}
          >
            <Check className="mr-1 size-3" />
            Approve
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 border-white/25 bg-white/5 px-2.5 text-[10px] text-white hover:bg-white/12"
            disabled={busy || item.approval_state === "rejected"}
            onClick={() => onApproval(item.id, "rejected")}
          >
            <X className="mr-1 size-3" />
            Reject
          </Button>
          {onReplace ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-white/25 bg-white/5 px-2 text-[10px] text-white hover:bg-white/12"
              disabled={busy}
              onClick={() => onReplace()}
            >
              <Upload className="mr-1 size-3" />
              Replace
            </Button>
          ) : null}
          {onDelete ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 border-amber-500/30 bg-white/5 px-2 text-[10px] text-amber-100 hover:bg-amber-500/15"
              disabled={busy}
              onClick={() => onDelete()}
              aria-label="Remove image"
            >
              <Trash2 className="size-3.5" />
            </Button>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function SlotReviewCard({
  label,
  item,
  busy,
  onApproval,
  onReplace,
}: {
  label: string;
  item: AdminTalentMediaRow | undefined;
  busy: boolean;
  onApproval: (id: string, state: "pending" | "approved" | "rejected") => void;
  onReplace?: () => void;
}) {
  const [loaded, setLoaded] = useState(false);
  const wide = item?.variant_kind === "banner";

  return (
    <div className="overflow-hidden rounded-2xl border border-border/45 bg-card/50 shadow-[0_14px_40px_-28px_rgba(0,0,0,0.3)] transition-[border-color,box-shadow] duration-200 hover:border-[var(--impronta-gold-border)]/45">
      <div className="flex items-center justify-between border-b border-border/45 bg-muted/[0.08] px-4 py-3">
        <span className="font-display text-sm font-medium tracking-wide text-foreground">{label}</span>
        <Badge variant="outline" className="text-[10px] font-normal">
          {item?.approval_state ?? "—"}
        </Badge>
      </div>
      <div
        className={cn(
          "relative bg-muted/10",
          wide ? "aspect-[3/1] w-full" : "mx-auto aspect-square w-full max-w-xs",
        )}
      >
        {item?.publicUrl ? (
          <Image
            src={item.publicUrl}
            alt=""
            fill
            className={cn("object-cover transition-all duration-300", !loaded && "blur-md")}
            sizes="400px"
            onLoadingComplete={() => setLoaded(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
            No asset
          </div>
        )}
      </div>
      {item ? (
        <div className="space-y-2 border-t border-border/40 px-4 py-3 text-xs text-muted-foreground">
          <p className="font-mono text-[10px] text-foreground/80">
            {new Date(item.created_at).toLocaleString()}
          </p>
          <p>
            Uploaded by:{" "}
            <span className="text-foreground">
              {item.uploaderDisplayName ?? (item.uploaded_by_user_id ? "User" : "—")}
            </span>
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              disabled={busy || item.approval_state === "approved"}
              className={cn("rounded-xl", LUXURY_GOLD_BUTTON_CLASS)}
              onClick={() => onApproval(item.id, "approved")}
            >
              <Check className="mr-1 size-3.5" />
              Approve
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl border-border/60 shadow-sm hover:border-destructive/35 hover:bg-destructive/[0.04]"
              disabled={busy || item.approval_state === "rejected"}
              onClick={() => onApproval(item.id, "rejected")}
            >
              <X className="mr-1 size-3.5" />
              Reject
            </Button>
            {onReplace ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="rounded-xl border-border/55"
                disabled={busy}
                onClick={() => onReplace()}
              >
                <Upload className="mr-1 size-3.5" />
                Replace image
              </Button>
            ) : null}
            {item.publicUrl ? (
              <Button variant="outline" size="sm" className="rounded-xl border-border/55" asChild>
                <a href={item.publicUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="mr-1 size-3.5" />
                  Preview
                </a>
              </Button>
            ) : null}
          </div>
        </div>
      ) : (
        <div className="space-y-2 border-t border-border/40 px-4 py-3">
          <p className="text-xs text-muted-foreground">No {label.toLowerCase()} uploaded.</p>
          {onReplace ? (
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="rounded-xl border-border/55"
              disabled={busy}
              onClick={() => onReplace()}
            >
              <Upload className="mr-1 size-3.5" />
              Upload image
            </Button>
          ) : null}
        </div>
      )}
    </div>
  );
}

type PendingStaffUpload =
  | null
  | { kind: "slot"; slot: "avatar" | "banner" }
  | { kind: "gallery-add" }
  | { kind: "gallery-replace"; mediaId: string; sortOrder: number; wasPrimary: boolean };

export function AdminTalentMediaManager({
  talentProfileId,
  profileCode,
  media,
  embedded = false,
}: {
  talentProfileId: string;
  profileCode: string;
  media: AdminTalentMediaRow[];
  /** Hide duplicate page chrome when rendered inside the talent hub layout. */
  embedded?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();
  const staffFileRef = useRef<HTMLInputElement>(null);
  /** Synchronous intent for file input (state would be stale when dialog returns before re-render). */
  const staffPendingRef = useRef<PendingStaffUpload>(null);
  const filter = searchParams.get("filter") === "pending" ? "pending" : "all";
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [reorderOverride, setReorderOverride] = useState<string[] | null>(null);
  /** Stable SSR/client IDs for dnd-kit (avoids global useUniqueId counter mismatch on hydrate). */
  const galleryDndId = useId();

  useEffect(() => {
    if (!actionNotice) return;
    const t = window.setTimeout(() => setActionNotice(null), 3800);
    return () => window.clearTimeout(t);
  }, [actionNotice]);

  const avatar = useMemo(
    () => media.find((m) => m.variant_kind === "card"),
    [media],
  );
  const banner = useMemo(
    () => media.find((m) => m.variant_kind === "banner"),
    [media],
  );

  const galleryAll = useMemo(
    () =>
      media
        .filter((m) => m.variant_kind === "gallery")
        .sort((a, b) => a.sort_order - b.sort_order),
    [media],
  );

  const gallery = useMemo(() => {
    if (filter !== "pending") return galleryAll;
    return galleryAll.filter((m) => m.approval_state === "pending");
  }, [galleryAll, filter]);

  const displayGallery = useMemo(() => {
    if (!reorderOverride) return gallery;
    const map = new Map(gallery.map((g) => [g.id, g]));
    return reorderOverride.map((id) => map.get(id)).filter(Boolean) as AdminTalentMediaRow[];
  }, [gallery, reorderOverride]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const triggerSlotUpload = useCallback((slot: "avatar" | "banner") => {
    staffPendingRef.current = { kind: "slot", slot };
    staffFileRef.current?.click();
  }, []);

  const triggerGalleryAdd = useCallback(() => {
    staffPendingRef.current = { kind: "gallery-add" };
    staffFileRef.current?.click();
  }, []);

  const triggerGalleryReplace = useCallback((item: AdminTalentMediaRow) => {
    staffPendingRef.current = {
      kind: "gallery-replace",
      mediaId: item.id,
      sortOrder: item.sort_order,
      wasPrimary: isPrimary(item.metadata),
    };
    staffFileRef.current?.click();
  }, []);

  const handleStaffMediaFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      const pu = staffPendingRef.current;
      staffPendingRef.current = null;
      if (!file || !pu) return;
      if (!isLikelyImageFile(file) || file.size > 20 * 1024 * 1024) {
        setError("Choose an image under 20MB (JPEG, PNG, WebP, HEIC, etc.).");
        return;
      }
      setBusy(true);
      setError(null);
      try {
        if (!supabase) throw new Error("Supabase client not available.");
        if (pu.kind === "slot") {
          const { blob, width, height } =
            pu.slot === "avatar"
              ? await fileToWebpCoverAspect(file, 1, 1)
              : await fileToWebpCoverAspect(file, 3, 1);
          const publicPath = `${talentProfileId}/public/${crypto.randomUUID()}.webp`;
          const { error: upErr } = await supabase.storage.from("media-public").upload(publicPath, blob, {
            contentType: "image/webp",
            upsert: false,
          });
          if (upErr) throw new Error(upErr.message);
          const res = await staffRegisterSlotMediaAsset(talentProfileId, {
            slot: pu.slot === "avatar" ? "avatar" : "banner",
            publicPath,
            width,
            height,
            profileCode,
          });
          if (!res.ok) throw new Error(res.error);
          setActionNotice("Image uploaded and published (approved).");
        } else {
          let sortOrder: number | undefined;
          let setPrimary = false;
          if (pu.kind === "gallery-replace") {
            const del = await staffSoftDeleteMediaAsset(talentProfileId, pu.mediaId);
            if (del.error) throw new Error(del.error);
            sortOrder = pu.sortOrder;
            setPrimary = pu.wasPrimary;
          }
          let width: number;
          let height: number;
          let uploadBody: Blob;
          let contentType: string;
          let pathSuffix: string;
          try {
            const w = await toWebpFromFile(file);
            uploadBody = w.blob;
            width = w.width;
            height = w.height;
            contentType = "image/webp";
            pathSuffix = "webp";
          } catch {
            uploadBody = file;
            const img = await loadImageFromFile(file);
            width = img.naturalWidth || img.width;
            height = img.naturalHeight || img.height;
            contentType = file.type || "application/octet-stream";
            pathSuffix = fileExt(file);
          }
          const publicPath = `${talentProfileId}/public/${crypto.randomUUID()}.${pathSuffix}`;
          const { error: upErr } = await supabase.storage.from("media-public").upload(publicPath, uploadBody, {
            contentType,
            upsert: false,
          });
          if (upErr) throw new Error(upErr.message);
          const res = await staffRegisterGalleryMediaAsset(talentProfileId, {
            publicPath,
            width,
            height,
            profileCode,
            cropMode: pu.kind === "gallery-replace" ? "staff_replace" : "staff_add",
            sortOrder,
            setPrimary,
          });
          if (!res.ok) throw new Error(res.error);
          setActionNotice(
            pu.kind === "gallery-replace"
              ? "Gallery image replaced and approved."
              : "Gallery image added and approved.",
          );
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
        refresh();
      }
    },
    [profileCode, refresh, supabase, talentProfileId],
  );

  const handleGalleryDelete = useCallback(
    async (mediaId: string) => {
      if (!window.confirm("Remove this gallery image from the profile? Storage will be deleted.")) {
        return;
      }
      setBusy(true);
      setError(null);
      const r = await staffSoftDeleteMediaAsset(talentProfileId, mediaId);
      if (r.error) setError(r.error);
      else setActionNotice("Gallery image removed.");
      setBusy(false);
      refresh();
    },
    [refresh, talentProfileId],
  );

  const setFilter = (next: "all" | "pending") => {
    const params = new URLSearchParams(searchParams.toString());
    if (next === "pending") params.set("filter", "pending");
    else params.delete("filter");
    router.replace(`/admin/talent/${talentProfileId}/media?${params.toString()}`, {
      scroll: false,
    });
  };

  const handleApproval = async (
    mediaId: string,
    state: "pending" | "approved" | "rejected",
  ) => {
    setBusy(true);
    setError(null);
    const res = await staffSetMediaApprovalState(talentProfileId, mediaId, state);
    if (res.error) {
      setError(res.error);
    } else {
      setActionNotice(
        state === "approved"
          ? "Marked approved."
          : state === "rejected"
            ? "Marked rejected."
            : "Approval state updated.",
      );
    }
    setBusy(false);
    refresh();
  };

  const handlePrimary = async (mediaId: string) => {
    setBusy(true);
    setError(null);
    const res = await staffSetPrimaryGalleryMediaForTalent(talentProfileId, mediaId);
    if (res.error) {
      setError(res.error);
    } else {
      setActionNotice("Primary image updated.");
    }
    setBusy(false);
    refresh();
  };

  const commitReorder = async (ordered: AdminTalentMediaRow[]) => {
    const snapshot = reorderOverride;
    setReorderOverride(ordered.map((g) => g.id));
    setBusy(true);
    setError(null);
    const res = await staffReorderGalleryMediaForTalent(
      talentProfileId,
      ordered.map((g) => g.id),
    );
    if (res.error) {
      setReorderOverride(snapshot);
      setError(res.error);
    } else {
      setReorderOverride(null);
      setActionNotice("Gallery order saved.");
    }
    setBusy(false);
    refresh();
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveId(null);
    if (filter !== "all") return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = displayGallery.findIndex((g) => g.id === active.id);
    const newIndex = displayGallery.findIndex((g) => g.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = arrayMove(displayGallery, oldIndex, newIndex);
    await commitReorder(next);
  };

  const moveGallery = async (index: number, dir: -1 | 1) => {
    if (filter !== "all") return;
    const j = index + dir;
    if (j < 0 || j >= displayGallery.length) return;
    const next = arrayMove(displayGallery, index, j);
    await commitReorder(next);
  };

  const activeItem = activeId ? displayGallery.find((g) => g.id === activeId) : null;

  const pendingCount = galleryAll.filter((g) => g.approval_state === "pending").length;

  return (
    <div className="space-y-8">
      <input
        ref={staffFileRef}
        type="file"
        accept="image/*"
        className="sr-only"
        aria-hidden
        onChange={handleStaffMediaFile}
      />

      {embedded ? (
        <div className="rounded-2xl border border-border/45 bg-gradient-to-br from-[var(--impronta-gold)]/[0.06] to-card/80 px-4 py-3.5 text-sm leading-relaxed text-muted-foreground shadow-sm">
          Upload or replace images (auto-approved), approve or reject, set gallery primary, and reorder.
          Reorder requires the &quot;All&quot; filter. Pending items also surface on the{" "}
          <Link
            href="/admin/media"
            className="font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
          >
            global media queue
          </Link>
          .
        </div>
      ) : (
        <div className="flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Talent · {profileCode}
            </p>
            <h2 className="font-display text-lg font-medium tracking-wide text-foreground sm:text-xl">
              Media review
            </h2>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Upload or replace images (published immediately), approve or reject, set the gallery primary,
              and reorder. Reorder requires &quot;All&quot; filter.
            </p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="rounded-xl border-border/55 shadow-sm transition-[border-color] hover:border-[var(--impronta-gold)]/40"
            asChild
          >
            <Link href={`/admin/talent/${talentProfileId}`} scroll={false}>
              ← Overview
            </Link>
          </Button>
        </div>
      )}

      {error ? (
        <p className="rounded-2xl border border-destructive/35 bg-destructive/[0.08] px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      ) : null}

      {actionNotice ? (
        <p
          className="rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.09] px-4 py-3 text-sm text-emerald-950 dark:text-emerald-50"
          role="status"
        >
          {actionNotice}
        </p>
      ) : null}

      <div className="inline-flex flex-wrap gap-1 rounded-full border border-border/50 bg-card/40 p-1 shadow-sm">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-9 rounded-full px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground",
            filter === "all" &&
              "bg-[var(--impronta-gold)]/12 text-foreground shadow-sm ring-1 ring-[var(--impronta-gold)]/25 hover:bg-[var(--impronta-gold)]/14",
          )}
          onClick={() => setFilter("all")}
        >
          All ({galleryAll.length})
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className={cn(
            "h-9 rounded-full px-4 text-[13px] font-medium text-muted-foreground hover:text-foreground",
            filter === "pending" &&
              "bg-[var(--impronta-gold)]/12 text-foreground shadow-sm ring-1 ring-[var(--impronta-gold)]/25 hover:bg-[var(--impronta-gold)]/14",
          )}
          onClick={() => setFilter("pending")}
        >
          Pending ({pendingCount})
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <SlotReviewCard
          label="Profile photo (1:1)"
          item={avatar}
          busy={busy}
          onApproval={handleApproval}
          onReplace={() => triggerSlotUpload("avatar")}
        />
        <SlotReviewCard
          label="Banner"
          item={banner}
          busy={busy}
          onApproval={handleApproval}
          onReplace={() => triggerSlotUpload("banner")}
        />
      </div>

      <div>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h3 className="text-sm font-medium">Portfolio gallery</h3>
              <p className="text-xs text-muted-foreground">
                {filter === "pending"
                  ? "Showing pending approval only — switch to All to reorder or add images."
                  : "Drag tiles or use arrows. Replace or delete per tile. Keyboard: Tab to focus, Space to pick up."}
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="shrink-0 rounded-xl border-border/55"
              disabled={busy}
              onClick={() => triggerGalleryAdd()}
            >
              <Upload className="mr-1.5 size-3.5" />
              Add image
            </Button>
          </div>
          {busy ? (
            <span className="text-xs text-muted-foreground">
              <Loader2 className="mr-1 inline size-3 animate-spin" />
              Updating…
            </span>
          ) : null}
        </div>

        {gallery.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border/70 bg-muted/5 px-6 py-16 text-center">
            <p className="text-sm font-medium text-foreground">
              {filter === "pending" ? "No pending gallery items" : "No gallery images"}
            </p>
            <p className="mt-2 text-sm text-muted-foreground">
              {filter === "pending"
                ? "All gallery assets are approved or rejected."
                : "Talent has not uploaded portfolio images yet."}
            </p>
          </div>
        ) : (
          <div className="rounded-xl border border-border/60 bg-muted/5 p-3 shadow-inner">
            <DndContext
              id={galleryDndId}
              sensors={sensors}
              collisionDetection={rectIntersection}
              onDragStart={(e: DragStartEvent) => setActiveId(String(e.active.id))}
              onDragEnd={onDragEnd}
              onDragCancel={() => setActiveId(null)}
            >
              <SortableContext
                id={`${galleryDndId}-sortable`}
                items={displayGallery.map((g) => g.id)}
                strategy={rectSortingStrategy}
              >
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {displayGallery.map((item, index) => (
                    <AdminGalleryTile
                      key={item.id}
                      item={item}
                      index={index}
                      length={displayGallery.length}
                      busy={busy}
                      filterAll={filter === "all"}
                      onPrimary={handlePrimary}
                      onApproval={handleApproval}
                      onMove={moveGallery}
                      onReplace={() => triggerGalleryReplace(item)}
                      onDelete={() => handleGalleryDelete(item.id)}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={GALLERY_DROP_ANIMATION}>
                {activeItem?.publicUrl ? (
                  <div className="w-[160px] overflow-hidden rounded-lg border-2 border-primary/25 shadow-2xl ring-1 ring-white/10 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform">
                    <div className="relative aspect-[4/3] w-full">
                      <Image
                        src={activeItem.publicUrl}
                        alt=""
                        fill
                        className="object-cover"
                        sizes="160px"
                      />
                    </div>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </div>
        )}
      </div>

      <p className="text-xs text-muted-foreground">
        Profile code <span className="font-mono text-foreground">{profileCode}</span> ·{" "}
        {media.length} media row{media.length === 1 ? "" : "s"} total
      </p>
    </div>
  );
}
