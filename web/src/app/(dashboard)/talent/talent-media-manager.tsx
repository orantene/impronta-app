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
  ChevronDown,
  ChevronUp,
  GripVertical,
  ImageIcon,
  ImagePlus,
  Images,
  Layers,
  LayoutGrid,
  Loader2,
  Star,
  Trash2,
  UserCircle,
} from "lucide-react";
import Image from "next/image";
import dynamic from "next/dynamic";
import { toast } from "sonner";
import { useRouter, useSearchParams } from "next/navigation";
import type { ComponentType } from "react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Area } from "react-easy-crop";
import {
  registerGalleryMediaAsset,
  registerSlotMediaAsset,
  reorderGalleryMedia,
  setPrimaryGalleryMedia,
  softDeleteMediaAsset,
} from "@/app/(dashboard)/talent/media-actions";
import {
  TalentFlashBanner,
  TalentSectionLabel,
} from "@/components/talent/talent-dashboard-primitives";
import { Button } from "@/components/ui/button";
import { MediaProgressBar } from "@/components/media/media-progress-bar";
import {
  dispatchTalentMediaSaved,
  dispatchTalentWorkspaceState,
} from "@/lib/talent-workspace-events";
import { getCroppedImageBlob } from "@/lib/crop-image";
import type { TalentMediaRow } from "@/lib/talent-dashboard-data";
import { createClient } from "@/lib/supabase/client";
import { GALLERY_DROP_ANIMATION } from "@/lib/media-gallery-dnd";
import { cn } from "@/lib/utils";

type CropKind = "avatar" | "banner" | "portfolio";

type EasyCropperComponent = ComponentType<{
  image: string;
  crop: { x: number; y: number };
  zoom: number;
  aspect: number;
  onCropChange: (crop: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onCropComplete: (area: Area, areaPixels: Area) => void;
}>;

const Cropper = dynamic(() => import("react-easy-crop").then((m) => m.default), {
  ssr: false,
}) as unknown as EasyCropperComponent;

const ASPECT: Record<Exclude<CropKind, "portfolio">, number> = {
  avatar: 1,
  banner: 3,
};

function isPrimary(meta: Record<string, unknown>): boolean {
  return meta.is_primary === true;
}

function isTempId(id: string) {
  return id.startsWith("temp-");
}

function isLikelyImageFile(file: File): boolean {
  const t = (file.type || "").toLowerCase();
  if (t.startsWith("image/")) return true;
  // Some browsers report empty or generic types for HEIC/JPG from camera roll.
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

function SortableGalleryItem({
  item,
  index,
  onDelete,
  onPrimary,
  onMove,
  busy,
  canMoveUp,
  canMoveDown,
  moveBlockedHint,
  deleteConfirmId,
  setDeleteConfirmId,
  uploadProgress,
  onAbortUpload,
}: {
  item: TalentMediaRow;
  index: number;
  onDelete: (id: string) => void;
  onPrimary: (id: string) => void;
  onMove: (index: number, dir: -1 | 1) => void;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  moveBlockedHint?: string;
  deleteConfirmId: string | null;
  setDeleteConfirmId: (id: string | null) => void;
  uploadProgress: number | null;
  onAbortUpload: () => void;
}) {
  const optimistic = isTempId(item.id);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    disabled: busy || optimistic,
    transition: {
      duration: 280,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
    },
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const confirming = deleteConfirmId === item.id;
  const primary = isPrimary(item.metadata);
  const [imgLoaded, setImgLoaded] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group relative overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-sm transition-[box-shadow,transform,border-color,background-color] duration-200 ease-out",
        "hover:-translate-y-px hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.04] hover:shadow-md",
        "motion-reduce:hover:translate-y-0",
        primary
          ? "border-[var(--impronta-gold)]/55 ring-2 ring-[var(--impronta-gold)]/40"
          : "border-border/40",
        isDragging &&
          "z-20 scale-[1.02] opacity-95 shadow-xl ring-2 ring-primary/25 motion-reduce:scale-100",
      )}
    >
      <div className="absolute left-2 top-2 z-10 flex flex-wrap gap-1">
        {primary ? (
          <span className="rounded-full border border-[var(--impronta-gold)]/35 bg-black/75 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--impronta-gold)] shadow-sm backdrop-blur-sm">
            Primary
          </span>
        ) : null}
        {item.approval_state === "pending" ? (
          <span className="rounded-full border border-amber-500/40 bg-amber-950/80 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100 shadow-sm backdrop-blur-sm">
            Pending review
          </span>
        ) : null}
        {item.approval_state === "rejected" ? (
          <span className="rounded-full border border-destructive/45 bg-destructive/90 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground shadow-sm backdrop-blur-sm">
            Rejected
          </span>
        ) : null}
      </div>

      <div className="relative z-0 aspect-[3/4] w-full">
        {item.publicUrl ? (
          <Image
            src={item.publicUrl}
            alt=""
            fill
            className={cn(
              "pointer-events-none object-cover transition-all duration-500 ease-out",
              optimistic && "opacity-90",
              !optimistic && !imgLoaded && "scale-105 blur-lg",
            )}
            sizes="(max-width: 768px) 50vw, 25vw"
            unoptimized={optimistic}
            onLoadingComplete={() => setImgLoaded(true)}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-muted-foreground">
            No preview
          </div>
        )}
        {optimistic && uploadProgress !== null ? (
          <div className="pointer-events-auto absolute inset-0 z-[1] flex flex-col items-center justify-center gap-2 bg-background/55 backdrop-blur-[2px]">
            <Loader2 className="size-7 animate-spin text-[var(--impronta-gold)]" aria-hidden />
            <div className="w-[70%] max-w-[140px]">
              <MediaProgressBar value={uploadProgress} />
            </div>
            <span className="text-[10px] font-medium text-foreground">Uploading…</span>
            <button
              type="button"
              className="text-[10px] font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              onClick={onAbortUpload}
            >
              Cancel
            </button>
          </div>
        ) : null}
      </div>
      {confirming ? (
        <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-2 bg-background/90 p-3 text-center">
          <p className="text-xs font-medium text-foreground">Remove this image?</p>
          <div className="flex gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setDeleteConfirmId(null)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="destructive"
              className="h-8"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                onDelete(item.id);
                setDeleteConfirmId(null);
              }}
            >
              Remove
            </Button>
          </div>
        </div>
      ) : (
        <div className="pointer-events-auto absolute inset-x-0 bottom-0 z-20 mx-1.5 mb-1.5 flex items-center justify-between gap-1 rounded-xl border border-white/10 bg-black/45 px-1.5 py-1.5 shadow-lg backdrop-blur-md supports-[backdrop-filter]:bg-black/35">
          <button
            type="button"
            className="rounded-lg p-1.5 text-white/95 hover:bg-white/15 disabled:opacity-30"
            aria-label="Drag to reorder"
            disabled={busy || optimistic}
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-4" />
          </button>
          <div className="flex flex-1 justify-center gap-0.5">
            <button
              type="button"
              className="rounded-lg p-1.5 text-white/95 hover:bg-white/15 disabled:opacity-30"
              aria-label="Move up"
              disabled={!canMoveUp}
              title={!canMoveUp ? moveBlockedHint : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMove(index, -1)}
            >
              <ChevronUp className="size-4" />
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 text-white/95 hover:bg-white/15 disabled:opacity-30"
              aria-label="Move down"
              disabled={!canMoveDown}
              title={!canMoveDown ? moveBlockedHint : undefined}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onMove(index, 1)}
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
          <div className="flex gap-0.5">
            <button
              type="button"
              className={cn(
                "rounded-lg p-1.5 hover:bg-white/15 disabled:opacity-30",
                primary ? "text-[var(--impronta-gold)]" : "text-white/80",
              )}
              aria-label="Set as primary"
              disabled={busy || optimistic}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => onPrimary(item.id)}
            >
              <Star className="size-4" fill={primary ? "currentColor" : "none"} />
            </button>
            <button
              type="button"
              className="rounded-lg p-1.5 text-white/90 hover:bg-white/15 hover:text-destructive disabled:opacity-30"
              aria-label="Remove image"
              disabled={busy || optimistic}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setDeleteConfirmId(item.id)}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export function TalentMediaManager({
  talentProfileId,
  profileCode,
  media,
  initialTab,
}: {
  talentProfileId: string;
  profileCode: string;
  media: TalentMediaRow[];
  /** Deep-link from `/talent/portfolio?tab=…` (also read client-side for in-app navigation). */
  initialTab?: string | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("tab") ?? initialTab ?? null;
  const supabase = createClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const originalFileRef = useRef<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cropOpen, setCropOpen] = useState(false);
  const [cropKind, setCropKind] = useState<CropKind>("avatar");
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);
  const pendingKindRef = useRef<CropKind>("portfolio");
  const formId = useId();
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [uploadPct, setUploadPct] = useState(0);
  const [progressLabel, setProgressLabel] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [optimisticRows, setOptimisticRows] = useState<TalentMediaRow[]>([]);
  const [optimisticUploadPct, setOptimisticUploadPct] = useState<Record<string, number>>({});
  const previewUrlsRef = useRef<Map<string, string>>(new Map());
  /** Remaining files after a multi-select; processed one crop at a time. */
  const portfolioQueueRef = useRef<File[]>([]);
  const uploadAbortRef = useRef(false);
  const [reorderOverride, setReorderOverride] = useState<string[] | null>(null);
  const [activeDragId, setActiveDragId] = useState<string | null>(null);
  /** How many files are waiting after the current crop (multi-select). */
  const [queueRemaining, setQueueRemaining] = useState(0);
  /** Same source file after a failed portfolio upload — enables Retry. */
  const [portfolioRetryFile, setPortfolioRetryFile] = useState<File | null>(null);
  const saveHintId = useId();
  /** Stable SSR/client IDs for dnd-kit (avoids global useUniqueId counter mismatch on hydrate). */
  const portfolioDndId = useId();

  const topAnchorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = tab?.trim() || null;
    if (typeof document === "undefined") return;
    const reduceMotion =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scrollBehavior: ScrollBehavior = reduceMotion ? "auto" : "smooth";
    if (!t || t === "manager") {
      topAnchorRef.current?.scrollIntoView({ behavior: scrollBehavior, block: "start" });
      return;
    }
    const id =
      t === "profile-photo"
        ? "talent-media-profile-photo"
        : t === "cover"
          ? "talent-media-cover"
          : t === "portfolio"
            ? "talent-media-portfolio"
            : null;
    if (!id) return;
    document.getElementById(id)?.scrollIntoView({ behavior: scrollBehavior, block: "start" });
  }, [tab]);

  useEffect(() => {
    [
      "/talent/portfolio",
      "/talent/portfolio?tab=profile-photo",
      "/talent/portfolio?tab=cover",
      "/talent/portfolio?tab=portfolio",
    ].forEach((href) => {
      router.prefetch(href);
    });
  }, [router]);

  const avatar = useMemo(
    () => media.find((m) => m.variant_kind === "card"),
    [media],
  );
  const banner = useMemo(
    () => media.find((m) => m.variant_kind === "banner"),
    [media],
  );

  const galleryMerged = useMemo(() => {
    const server = media
      .filter((m) => m.variant_kind === "gallery")
      .sort((a, b) => a.sort_order - b.sort_order);
    const merged = [...server];
    for (const o of optimisticRows) {
      if (!merged.some((m) => m.id === o.id)) merged.push(o);
    }
    return merged.sort((a, b) => a.sort_order - b.sort_order);
  }, [media, optimisticRows]);

  const gallery = useMemo(() => {
    if (!reorderOverride) return galleryMerged;
    const map = new Map(galleryMerged.map((g) => [g.id, g]));
    return reorderOverride
      .map((id) => map.get(id))
      .filter(Boolean) as TalentMediaRow[];
  }, [galleryMerged, reorderOverride]);

  const uploadDisabled = !supabase || busy;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const refresh = useCallback(() => {
    router.refresh();
  }, [router]);

  const notifyBlocked = useCallback((msg: string) => {
    setError(msg);
    toast.error(msg);
  }, []);

  const onCropComplete = useCallback((_area: Area, pixels: Area) => {
    setCroppedAreaPixels(pixels);
  }, []);

  const saveFooterHint = useMemo(() => {
    if (busy) return "Please wait — saving in progress.";
    if (!supabase) return "Upload client is unavailable. Sign in and ensure Supabase is configured.";
    if (!imageSrc) return "Select an image first.";
    if (!croppedAreaPixels) return "Move or zoom the image to set a crop.";
    return "Press Save to upload your crop.";
  }, [busy, supabase, imageSrc, croppedAreaPixels]);

  const cropAspect = useMemo(
    () => ASPECT[cropKind === "portfolio" ? "avatar" : cropKind],
    [cropKind],
  );

  const openCrop = (kind: CropKind) => {
    if (!supabase) {
      const msg =
        "Upload client is unavailable. Sign in and ensure Supabase environment variables are set.";
      setError(msg);
      toast.error(msg);
      return;
    }
    pendingKindRef.current = kind;
    if (kind !== "portfolio") setCropKind(kind);
    setError(null);
    fileInputRef.current?.click();
  };

  const uploadPortfolioFiles = useCallback(
    async (files: File[]) => {
      if (!supabase) {
        const msg =
          "Upload is unavailable. Sign in and ensure Supabase environment variables are set.";
        setError(msg);
        toast.error(msg);
        return;
      }
      const valid = files.filter((f) => isLikelyImageFile(f) && f.size <= 15 * 1024 * 1024);
      if (valid.length === 0) {
        const msg = "Choose an image under 15MB.";
        setError(msg);
        toast.error(msg);
        return;
      }

      uploadAbortRef.current = false;
      setBusy(true);
      setError(null);
      dispatchTalentWorkspaceState({ mediaSaving: true });

      try {
        const maxExistingSort = Math.max(0, ...galleryMerged.map((g) => g.sort_order));
        let nextSort = maxExistingSort + 10;
        const hasRealGallery = galleryMerged.some((g) => !isTempId(g.id));
        let primaryAssigned = hasRealGallery;
        let successCount = 0;

        for (const file of valid) {
          if (uploadAbortRef.current) break;

          const tempId = `temp-${crypto.randomUUID()}`;
          let publicBlob: Blob | File = file;
          let width: number | null = null;
          let height: number | null = null;
          let publicExt = fileExt(file);
          let contentType = file.type || "application/octet-stream";

          try {
            const webp = await toWebpFromFile(file);
            publicBlob = webp.blob;
            width = webp.width;
            height = webp.height;
            publicExt = "webp";
            contentType = "image/webp";
          } catch {
            // If conversion fails (e.g. HEIC unsupported), upload original bytes.
          }

          const publicPath = `${talentProfileId}/public/${crypto.randomUUID()}.${publicExt}`;
          const previewUrl = URL.createObjectURL(publicBlob);
          previewUrlsRef.current.set(tempId, previewUrl);

          const isFirst = !primaryAssigned;
          if (isFirst) primaryAssigned = true;

          const optimisticRow: TalentMediaRow = {
            id: tempId,
            bucket_id: "media-public",
            storage_path: publicPath,
            variant_kind: "gallery",
            approval_state: "pending",
            sort_order: nextSort,
            width,
            height,
            metadata: {
              profile_code: profileCode,
              slot: "portfolio",
              crop_mode: "none",
              is_primary: isFirst,
              optimistic: true,
            },
            created_at: new Date().toISOString(),
            publicUrl: previewUrl,
          };
          nextSort += 10;

          setOptimisticRows((prev) => [...prev, optimisticRow]);
          setOptimisticUploadPct((m) => ({ ...m, [tempId]: 8 }));

          const cleanupOptimistic = (msg?: string, offerRetry?: boolean) => {
            setOptimisticRows((prev) => prev.filter((r) => r.id !== tempId));
            revokePreview(tempId);
            setOptimisticUploadPct((m) => {
              const n = { ...m };
              delete n[tempId];
              return n;
            });
            if (msg) {
              setError(msg);
              toast.error(msg);
              if (offerRetry) setPortfolioRetryFile(file);
            }
          };

          let originalPath: string | null = null;
          if (file.size < 20 * 1024 * 1024) {
            setProgressLabel("Uploading original…");
            setOptimisticUploadPct((m) => ({ ...m, [tempId]: 18 }));
            const ext = fileExt(file);
            originalPath = `${talentProfileId}/originals/${crypto.randomUUID()}.${ext}`;
            const { error: oErr } = await supabase.storage
              .from("media-originals")
              .upload(originalPath, file, { contentType: file.type || "application/octet-stream", upsert: false });
            if (oErr) {
              console.warn("[media] originals upload:", oErr.message);
              originalPath = null;
            }
          }

          if (uploadAbortRef.current) {
            cleanupOptimistic();
            break;
          }

          setProgressLabel("Uploading image…");
          setOptimisticUploadPct((m) => ({ ...m, [tempId]: 45 }));
          const { error: upErr } = await supabase.storage
            .from("media-public")
            .upload(publicPath, publicBlob, { contentType, upsert: false });
          if (upErr) {
            cleanupOptimistic(upErr.message, true);
            await supabase.storage.from("media-public").remove([publicPath]).catch(() => {});
            continue;
          }

          if (uploadAbortRef.current) {
            cleanupOptimistic();
            await supabase.storage.from("media-public").remove([publicPath]).catch(() => {});
            break;
          }

          setProgressLabel("Saving to profile…");
          setOptimisticUploadPct((m) => ({ ...m, [tempId]: 78 }));
          const registered = await registerGalleryMediaAsset({
            publicPath,
            originalStoragePath: originalPath,
            width: width ?? 0,
            height: height ?? 0,
            profileCode,
            cropMode: "none",
          });

          if (!registered.ok) {
            cleanupOptimistic(registered.error, true);
            await supabase.storage.from("media-public").remove([publicPath]).catch(() => {});
            continue;
          }

          setOptimisticUploadPct((m) => ({ ...m, [tempId]: 100 }));
          cleanupOptimistic();
          setPortfolioRetryFile(null);
          successCount += 1;
          dispatchTalentMediaSaved();
          refresh();
        }

        if (successCount > 0) {
          toast.success(
            successCount === 1
              ? "Image uploaded — pending staff review for the public directory."
              : `${successCount} images uploaded — pending staff review for the public directory.`,
          );
        }
      } finally {
        setBusy(false);
        setProgressLabel("");
        dispatchTalentWorkspaceState({ mediaSaving: false });
      }
    },
    [galleryMerged, profileCode, refresh, supabase, talentProfileId],
  );

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      const list = e.target.files;
      // IMPORTANT: copy out the File objects BEFORE clearing the input value.
      // Some browsers treat FileList as a live view that becomes empty when value is reset.
      const files = list ? Array.from(list) : [];
      if (!files.length) return;
      const kind = pendingKindRef.current;
      e.target.value = "";
      if (kind === "portfolio") {
        // Portfolio uploads are immediate (no crop modal).
        void uploadPortfolioFiles(files);
        return;
      }
      if (files.length > 1) {
        toast.info("Only one image can be used for profile photo or banner. Using the first file you selected.");
      }
      // Avatar/banner: open crop modal for the first selected file.
      handleFile(files[0]);
    } catch (err) {
      console.error("FILE_CHANGE_ERROR", err);
    }
  };

  const handleFile = (file: File | undefined) => {
    if (!supabase) {
      const msg =
        "Upload client is unavailable. Sign in and ensure Supabase environment variables are set.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!file) {
      const msg = "Select an image first.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!isLikelyImageFile(file)) {
      const msg = "Choose an image file.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      const msg = "Image must be under 15MB.";
      setError(msg);
      toast.error(msg);
      return;
    }
    setError(null);
    setPortfolioRetryFile(null);
    setCroppedAreaPixels(null);
    originalFileRef.current = file;
    const url = URL.createObjectURL(file);
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(url);
    setCropOpen(true);
    setZoom(1);
    setCrop({ x: 0, y: 0 });
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragActive(false);
    const list = e.dataTransfer.files;
    if (!list?.length) {
      const msg = "Drop one or more image files here.";
      setError(msg);
      toast.error(msg);
      return;
    }
    const files = Array.from(list).filter((f) => isLikelyImageFile(f) && f.size <= 15 * 1024 * 1024);
    if (files.length === 0) {
      const msg = "No supported images in that drop (JPEG, PNG, WebP, HEIC — max 15MB each).";
      setError(msg);
      toast.error(msg);
      return;
    }
    pendingKindRef.current = "portfolio";
    void uploadPortfolioFiles(files);
  };

  const closeCrop = (preserveQueue = false) => {
    setCropOpen(false);
    if (imageSrc) URL.revokeObjectURL(imageSrc);
    setImageSrc(null);
    setCroppedAreaPixels(null);
    originalFileRef.current = null;
    setUploadPct(0);
    setProgressLabel("");
    if (!preserveQueue) {
      portfolioQueueRef.current = [];
      setQueueRemaining(0);
    }
  };

  const revokePreview = (tempId: string) => {
    const url = previewUrlsRef.current.get(tempId);
    if (url) {
      URL.revokeObjectURL(url);
      previewUrlsRef.current.delete(tempId);
    }
  };

  const finalizeUpload = async () => {
    if (!supabase) {
      const msg =
        "Upload is unavailable. Sign in and ensure Supabase environment variables are set.";
      setError(msg);
      toast.error(msg);
      return;
    }
    if (!imageSrc || !croppedAreaPixels) {
      const msg = !imageSrc
        ? "No image is loaded."
        : "The crop is still initializing — move or zoom the image slightly, then tap Save again.";
      setError(msg);
      toast.error(msg);
      return;
    }

    const kind = pendingKindRef.current;
    uploadAbortRef.current = false;
    setBusy(true);
    setError(null);
    dispatchTalentWorkspaceState({ mediaSaving: true });

    try {
      setProgressLabel("Preparing image…");
      setUploadPct(5);
      const blob = await getCroppedImageBlob(imageSrc, croppedAreaPixels, "image/webp");
      const publicPath = `${talentProfileId}/public/${crypto.randomUUID()}.webp`;

      if (kind === "portfolio") {
        // Portfolio uploads are immediate (no crop modal), so reaching here is a no-op.
        toast.error("Portfolio uploads don't use crop — use the Portfolio upload area instead.");
        return;
      }

      /* avatar / banner — keep modal open */
      setProgressLabel("Preparing…");
      setUploadPct(8);

      const originalFile = originalFileRef.current;
      let originalPath: string | null = null;
      if (originalFile && originalFile.size < 20 * 1024 * 1024) {
        if (uploadAbortRef.current) {
          toast.info("Upload cancelled.");
          return;
        }
        setProgressLabel("Uploading original…");
        setUploadPct(22);
        const ext = originalFile.name.split(".").pop()?.toLowerCase() || "jpg";
        originalPath = `${talentProfileId}/originals/${crypto.randomUUID()}.${ext}`;
        const { error: oErr } = await supabase.storage
          .from("media-originals")
          .upload(originalPath, originalFile, {
            contentType: originalFile.type || "application/octet-stream",
            upsert: false,
          });
        if (oErr) {
          console.warn("[media] originals upload:", oErr.message);
          originalPath = null;
        }
      }

      if (uploadAbortRef.current) {
        toast.info("Upload cancelled.");
        return;
      }

      setProgressLabel("Uploading image…");
      setUploadPct(40);
      const { error: upErr } = await supabase.storage
        .from("media-public")
        .upload(publicPath, blob, { contentType: "image/webp", upsert: false });
      if (upErr) {
        setError(upErr.message);
        toast.error(upErr.message);
        return;
      }

      if (uploadAbortRef.current) {
        await supabase.storage.from("media-public").remove([publicPath]);
        toast.info("Upload cancelled.");
        return;
      }

      setProgressLabel("Saving…");
      setUploadPct(72);
      const slot = kind === "avatar" ? "avatar" : "banner";
      const registered = await registerSlotMediaAsset({
        slot,
        publicPath,
        originalStoragePath: originalPath,
        width: croppedAreaPixels.width,
        height: croppedAreaPixels.height,
        profileCode,
      });

      if (!registered.ok) {
        setError(registered.error);
        await supabase.storage.from("media-public").remove([publicPath]);
        toast.error(registered.error);
        return;
      }

      setUploadPct(100);
      closeCrop();
      toast.success(
        kind === "avatar"
          ? "Profile photo saved — pending staff review."
          : "Banner saved — pending staff review.",
      );
      dispatchTalentMediaSaved();
      refresh();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Upload failed.";
      setError(msg);
      toast.error(msg);
    } finally {
      setBusy(false);
      setUploadPct(0);
      setProgressLabel("");
      dispatchTalentWorkspaceState({ mediaSaving: false });
    }
  };

  const handleDelete = async (id: string) => {
    if (isTempId(id)) {
      toast.error("Wait until the current upload finishes before removing this tile.");
      return;
    }
    setBusy(true);
    setError(null);
    dispatchTalentWorkspaceState({ mediaSaving: true });
    const res = await softDeleteMediaAsset(id);
    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      dispatchTalentMediaSaved();
    }
    setBusy(false);
    dispatchTalentWorkspaceState({ mediaSaving: false });
    refresh();
  };

  const handlePrimary = async (id: string) => {
    if (isTempId(id)) {
      toast.error("Wait until the current upload finishes before setting primary.");
      return;
    }
    setBusy(true);
    setError(null);
    dispatchTalentWorkspaceState({ mediaSaving: true });
    const res = await setPrimaryGalleryMedia(id);
    if (res.error) {
      setError(res.error);
      toast.error(res.error);
    } else {
      dispatchTalentMediaSaved();
    }
    setBusy(false);
    dispatchTalentWorkspaceState({ mediaSaving: false });
    refresh();
  };

  const onDragStart = (event: DragStartEvent) => {
    setActiveDragId(String(event.active.id));
  };

  const onDragEnd = async (event: DragEndEvent) => {
    setActiveDragId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = gallery.findIndex((g) => g.id === active.id);
    const newIndex = gallery.findIndex((g) => g.id === over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    if (isTempId(String(active.id)) || isTempId(String(over.id))) {
      notifyBlocked("Reordering is locked while uploads are in progress. Please wait for uploads to finish.");
      return;
    }

    const next = arrayMove(gallery, oldIndex, newIndex);
    const snapshot = reorderOverride;
    setReorderOverride(next.map((g) => g.id));
    setBusy(true);
    setError(null);
    dispatchTalentWorkspaceState({ mediaSaving: true });
    const res = await reorderGalleryMedia(next.map((g) => g.id));
    if (res.error) {
      setReorderOverride(snapshot);
      setError(res.error);
      toast.error(res.error);
    } else {
      setReorderOverride(null);
      dispatchTalentMediaSaved();
      refresh();
    }
    setBusy(false);
    dispatchTalentWorkspaceState({ mediaSaving: false });
  };

  const moveGallery = async (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= gallery.length) return;
    const item = gallery[index];
    const other = gallery[j];
    if (isTempId(item.id) || isTempId(other.id)) {
      notifyBlocked("Reordering is locked while uploads are in progress. Please wait for uploads to finish.");
      return;
    }
    const next = arrayMove(gallery, index, j);
    const snapshot = reorderOverride;
    setReorderOverride(next.map((g) => g.id));
    setBusy(true);
    setError(null);
    dispatchTalentWorkspaceState({ mediaSaving: true });
    const res = await reorderGalleryMedia(next.map((g) => g.id));
    if (res.error) {
      setReorderOverride(snapshot);
      setError(res.error);
      toast.error(res.error);
    } else {
      setReorderOverride(null);
      dispatchTalentMediaSaved();
      refresh();
    }
    setBusy(false);
    dispatchTalentWorkspaceState({ mediaSaving: false });
  };

  const activeItem = activeDragId ? gallery.find((g) => g.id === activeDragId) : null;

  const slotCard = (
    label: string,
    kind: CropKind,
    item: TalentMediaRow | undefined,
    tall?: boolean,
    anchorId?: string,
  ) => (
    <div
      id={anchorId}
      className={cn(
        "group/slot w-full self-start overflow-hidden rounded-2xl border border-border/40 bg-card/80 shadow-sm transition-all duration-200",
        "hover:border-[var(--impronta-gold)]/45 hover:bg-[var(--impronta-gold)]/[0.06] hover:shadow-md",
        tall ? "md:col-span-2" : "",
      )}
    >
      <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 lg:px-5">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-[15px] font-semibold tracking-tight text-foreground">{label}</span>
          {item?.approval_state === "pending" ? (
            <span className="rounded-full border border-amber-500/35 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-900 dark:text-amber-100">
              Pending review
            </span>
          ) : null}
          {item?.approval_state === "rejected" ? (
            <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-destructive-foreground">
              Rejected
            </span>
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          className="h-10 shrink-0 gap-2 rounded-2xl border-border/70 bg-background/70 px-4 text-[15px] font-medium backdrop-blur-sm sm:h-11"
          disabled={uploadDisabled}
          title={!supabase ? "Upload client unavailable" : undefined}
          onClick={() => openCrop(kind)}
        >
          <ImagePlus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          {item ? "Replace" : "Upload"}
        </Button>
      </div>
      <div
        className={cn(
          "relative min-h-0 w-full overflow-hidden bg-muted/15",
          kind === "banner"
            ? "aspect-[21/9] w-full sm:aspect-[3/1]"
            : "mx-auto aspect-square max-w-xs",
        )}
      >
        {item?.publicUrl ? (
          <Image
            src={item.publicUrl}
            alt=""
            fill
            className="object-cover object-center"
            sizes={kind === "banner" ? "(max-width:768px) 100vw, 50vw" : "400px"}
            priority={kind === "banner"}
          />
        ) : (
          <button
            type="button"
            className="flex h-full w-full flex-col items-center justify-center gap-2 p-6 text-center text-sm text-muted-foreground transition-colors hover:bg-[var(--impronta-gold)]/[0.04] active:scale-[0.99] motion-reduce:active:scale-100"
            disabled={uploadDisabled}
            title={!supabase ? "Upload client unavailable" : undefined}
            onClick={() => openCrop(kind)}
          >
            <span className="flex size-12 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/20">
              <ImagePlus className="size-6 opacity-90" aria-hidden />
            </span>
            <span className="font-medium text-foreground/90">Drop or tap to upload</span>
          </button>
        )}
      </div>
    </div>
  );

  const mediaTabs = [
    { key: null, label: "All" },
    { key: "profile-photo", label: "Profile Photo" },
    { key: "cover", label: "Cover" },
    { key: "portfolio", label: "Portfolio" },
  ] as const;

  const activeTabKey = tab?.trim() || null;

  const switchTab = (key: string | null) => {
    const url = key ? `/talent/portfolio?tab=${key}` : "/talent/portfolio";
    router.replace(url, { scroll: false });
  };

  return (
    <div ref={topAnchorRef} className="space-y-5 lg:space-y-6">
      <div className="space-y-2 lg:space-y-3">
        <TalentSectionLabel icon={LayoutGrid}>Sections</TalentSectionLabel>
        <div className="rounded-2xl border border-border/40 bg-card/80 p-1.5 shadow-sm">
          <div
            className="flex gap-1 overflow-x-auto pb-0.5 scrollbar-none"
            role="tablist"
            aria-label="Media sections"
          >
            {mediaTabs.map((t) => (
              <button
                key={t.key ?? "all"}
                type="button"
                role="tab"
                aria-selected={activeTabKey === t.key}
                onClick={() => switchTab(t.key)}
                className={cn(
                  "shrink-0 rounded-xl px-3.5 py-2.5 text-sm font-semibold tracking-tight transition-all duration-200",
                  "motion-reduce:transition-none",
                  activeTabKey === t.key
                    ? "bg-[var(--impronta-gold)]/14 text-[var(--impronta-gold)] shadow-sm ring-1 ring-[var(--impronta-gold)]/25"
                    : "text-muted-foreground hover:bg-[var(--impronta-gold)]/[0.06] hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,image/heic"
        className="sr-only"
        aria-hidden
        id={formId}
        multiple
        onChange={onFileChange}
      />

      {!supabase ? (
        <TalentFlashBanner variant="warning">
          Upload client is unavailable. Sign in and ensure Supabase environment variables are set —
          uploads stay disabled until then.
        </TalentFlashBanner>
      ) : null}

      {portfolioRetryFile ? (
        <div className="flex flex-col gap-3 rounded-2xl border border-border/40 bg-card/80 px-4 py-4 text-sm shadow-sm sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <p className="text-muted-foreground">
            Last portfolio upload failed — retry with the same file.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              className="rounded-2xl"
              onClick={() => {
                const f = portfolioRetryFile;
                setPortfolioRetryFile(null);
                setError(null);
                void uploadPortfolioFiles([f]);
              }}
            >
              Retry upload
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="rounded-2xl"
              onClick={() => setPortfolioRetryFile(null)}
            >
              Dismiss
            </Button>
          </div>
        </div>
      ) : null}

      {(!activeTabKey || activeTabKey === "profile-photo" || activeTabKey === "cover") ? (
        <div className="space-y-2 lg:space-y-3">
          <TalentSectionLabel
            icon={
              activeTabKey === "cover"
                ? ImageIcon
                : activeTabKey === "profile-photo"
                  ? UserCircle
                  : Layers
            }
          >
            {activeTabKey === "cover"
              ? "Cover image"
              : activeTabKey === "profile-photo"
                ? "Profile photo"
                : "Profile & cover"}
          </TalentSectionLabel>
          <div
            className={cn(
              "grid items-start gap-4 lg:gap-5",
              activeTabKey ? "" : "md:grid-cols-2",
            )}
          >
            {(!activeTabKey || activeTabKey === "profile-photo")
              ? slotCard("Profile photo (1:1)", "avatar", avatar, false, "talent-media-profile-photo")
              : null}
            {(!activeTabKey || activeTabKey === "cover")
              ? slotCard("Banner (wide)", "banner", banner, activeTabKey === "cover", "talent-media-cover")
              : null}
          </div>
        </div>
      ) : null}

      {(!activeTabKey || activeTabKey === "portfolio") ? (
      <div id="talent-media-portfolio" className="space-y-2 lg:space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <TalentSectionLabel icon={Images}>Portfolio gallery</TalentSectionLabel>
            <p className="text-xs leading-relaxed text-muted-foreground lg:text-sm">
              Use the grip to drag, arrows to nudge, or the star for your featured directory photo.
            </p>
          </div>
          <Button
            type="button"
            className="h-11 shrink-0 gap-2 rounded-2xl bg-[var(--impronta-gold)] px-4 text-[15px] font-semibold text-white shadow-md shadow-black/10 transition hover:bg-[var(--impronta-gold)]/92 sm:mt-1 lg:h-12"
            disabled={uploadDisabled}
            title={!supabase ? "Upload client unavailable" : undefined}
            onClick={() => openCrop("portfolio")}
          >
            <ImagePlus className="mr-1.5 size-4" aria-hidden />
            Add image
          </Button>
        </div>

        <div
          className={cn(
            "rounded-2xl border border-dashed transition-colors duration-200 motion-reduce:transition-none",
            dragActive
              ? "border-[var(--impronta-gold)]/55 bg-[var(--impronta-gold)]/[0.08] shadow-inner"
              : "border-border/40 bg-card/80 shadow-sm",
          )}
          onDragEnter={(e) => {
            e.preventDefault();
            setDragActive(true);
          }}
          onDragLeave={(e) => {
            e.preventDefault();
            if (e.currentTarget === e.target) setDragActive(false);
          }}
          onDragOver={(e) => {
            e.preventDefault();
          }}
          onDrop={onDrop}
        >
          {gallery.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-4 py-20 text-center sm:py-24">
              <div className="mb-5 flex size-16 items-center justify-center rounded-2xl bg-[var(--impronta-gold)]/12 text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/25">
                <Images className="size-8" aria-hidden />
              </div>
              <p className="font-display text-base font-semibold tracking-tight text-foreground">
                Show your work in the directory
              </p>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
                Optimized previews for the directory; you can add several photos at once.
              </p>
              <div className="mt-7">
                <Button
                  type="button"
                  className="h-12 gap-2 rounded-2xl bg-[var(--impronta-gold)] px-6 text-[15px] font-semibold text-white shadow-md shadow-black/10 hover:bg-[var(--impronta-gold)]/92"
                  disabled={uploadDisabled}
                  title={!supabase ? "Upload client unavailable" : undefined}
                  onClick={() => openCrop("portfolio")}
                >
                  <ImagePlus className="size-4 shrink-0" aria-hidden />
                  Add photos
                </Button>
              </div>
              <p className="mt-4 max-w-md text-center text-[11px] leading-relaxed text-muted-foreground">
                Or drag files anywhere in this area · multi-select · JPEG, PNG, WebP, HEIC · max 15MB ·
                staff reviews before publishing
              </p>
            </div>
          ) : (
            <div>
              <div className="border-b border-border/40 bg-muted/20 px-3 py-2.5 text-center sm:px-4">
                <p className="text-[11px] leading-snug text-muted-foreground sm:text-xs">
                  <span className="font-medium text-foreground/85">Add more</span> — drop images
                  anywhere in this area, or tap{" "}
                  <span className="whitespace-nowrap font-medium text-foreground/85">Add image</span>{" "}
                  above.
                </p>
              </div>
              <div className="p-3 lg:p-4">
              <DndContext
                id={portfolioDndId}
                sensors={sensors}
                collisionDetection={rectIntersection}
                onDragStart={onDragStart}
                onDragEnd={onDragEnd}
                onDragCancel={() => setActiveDragId(null)}
              >
                <SortableContext
                  id={`${portfolioDndId}-sortable`}
                  items={gallery.map((g) => g.id)}
                  strategy={rectSortingStrategy}
                >
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-4">
                    {gallery.map((item, index) => {
                      const optimistic = isTempId(item.id);
                      const aboveTemp = index > 0 ? isTempId(gallery[index - 1]?.id ?? "") : false;
                      const belowTemp =
                        index < gallery.length - 1
                          ? isTempId(gallery[index + 1]?.id ?? "")
                          : false;
                      const moveBlockedHint =
                        optimistic || aboveTemp || belowTemp
                          ? "Wait for uploads to finish before reordering."
                          : busy
                            ? "Please wait — changes are being saved."
                            : undefined;
                      const canMoveUp = !(busy || optimistic || index === 0 || aboveTemp);
                      const canMoveDown = !(busy || optimistic || index === gallery.length - 1 || belowTemp);

                      return (
                        <SortableGalleryItem
                          key={item.id}
                          item={item}
                          index={index}
                          busy={busy}
                          canMoveUp={canMoveUp}
                          canMoveDown={canMoveDown}
                          moveBlockedHint={moveBlockedHint}
                          deleteConfirmId={deleteConfirmId}
                          setDeleteConfirmId={setDeleteConfirmId}
                          onDelete={handleDelete}
                          onPrimary={handlePrimary}
                          onMove={moveGallery}
                          uploadProgress={
                            optimistic ? (optimisticUploadPct[item.id] ?? 0) : null
                          }
                          onAbortUpload={() => {
                            uploadAbortRef.current = true;
                          }}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
                <DragOverlay adjustScale dropAnimation={GALLERY_DROP_ANIMATION}>
                  {activeItem?.publicUrl ? (
                    <div className="w-[160px] overflow-hidden rounded-2xl border-2 border-primary/30 shadow-2xl ring-1 ring-white/10 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-transform motion-reduce:transition-none">
                      <div className="relative aspect-[3/4] w-full">
                        <Image
                          src={activeItem.publicUrl}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="160px"
                          unoptimized={isTempId(activeItem.id)}
                        />
                      </div>
                    </div>
                  ) : null}
                </DragOverlay>
              </DndContext>
              </div>
            </div>
          )}
        </div>
      </div>
      ) : null}

      {cropOpen && imageSrc ? (
        <div
          className="fixed inset-0 z-[100] flex flex-col bg-background/95 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-labelledby="crop-title"
        >
          <div className="flex items-center justify-between border-b border-border/50 px-4 py-3.5 lg:px-5">
            <h2 id="crop-title" className="font-display text-base font-semibold tracking-tight">
              Crop & upload
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="rounded-xl"
              onClick={() => {
                if (busy) uploadAbortRef.current = true;
                closeCrop();
              }}
            >
              Cancel
            </Button>
          </div>
          {error ? (
            <div className="border-b border-destructive/35 bg-destructive/10 px-4 py-3 text-sm text-destructive lg:px-5">
              <p>{error}</p>
              {cropKind !== "portfolio" && croppedAreaPixels && !busy ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  className="mt-3 rounded-xl"
                  onClick={() => void finalizeUpload()}
                >
                  Try again
                </Button>
              ) : null}
            </div>
          ) : null}
          <div className="relative min-h-0 flex-1">
            {/* Always show a basic preview; cropper sits on top. */}
            <Image
              src={imageSrc}
              alt=""
              fill
              sizes="(min-width: 1024px) 640px, 100vw"
              className="object-contain opacity-90"
              priority
              draggable={false}
            />
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={cropAspect as unknown as number}
              onCropChange={setCrop}
              onZoomChange={setZoom}
              onCropComplete={onCropComplete}
            />
          </div>
          <div className="space-y-3 border-t border-border/50 p-4 lg:p-5">
            {/* Portfolio uploads do not use crop modal. */}
            <label className="flex items-center gap-3 text-sm text-muted-foreground">
              <span className="w-16 shrink-0">Zoom</span>
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={zoom}
                onChange={(e) => setZoom(Number(e.target.value))}
                className="flex-1"
              />
            </label>
            {busy && uploadPct > 0 ? (
              <div className="space-y-1.5">
                {progressLabel ? (
                  <p className="text-xs font-medium text-muted-foreground">{progressLabel}</p>
                ) : null}
                <MediaProgressBar value={uploadPct} />
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                className="rounded-xl"
                onClick={() => {
                  if (busy) uploadAbortRef.current = true;
                  closeCrop();
                }}
              >
                Cancel
              </Button>
              <Button
                type="button"
                className="rounded-xl bg-[var(--impronta-gold)] text-white shadow-md hover:bg-[var(--impronta-gold)]/92"
                onClick={finalizeUpload}
                aria-describedby={saveHintId}
                disabled={busy || !croppedAreaPixels || !supabase}
              >
                {busy ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" />
                    Working…
                  </>
                ) : (
                  "Save to profile"
                )}
              </Button>
            </div>
            <p
              id={saveHintId}
              className="text-center text-[11px] leading-relaxed text-muted-foreground"
            >
              {saveFooterHint}
            </p>
            {queueRemaining > 0 ? (
              <p className="text-center text-[11px] text-muted-foreground">
                {queueRemaining} more file{queueRemaining === 1 ? "" : "s"} queued after this one.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
