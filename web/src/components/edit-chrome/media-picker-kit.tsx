"use client";

import type { ReactNode } from "react";
import { FileText, FolderOpen, Play, X } from "lucide-react";

import { CHROME } from "./kit";
import { KIT } from "./inspectors/kit/tokens";

/** MEDIA-1 — the library discriminant carried from the shared data layer. */
export type MediaPickerAssetKind = "image" | "video" | "document";

export interface MediaPickerItem {
  id: string;
  publicUrl: string;
  storagePath: string;
  variantKind: string;
  /** MEDIA-1 — image (default) | video | document. */
  assetKind?: MediaPickerAssetKind | null;
  width: number | null;
  height: number | null;
  createdAt: string;
  alt?: string | null;
  /** MEDIA-1 — free-text workspace tags. */
  tags?: string[] | null;
  folderIds?: string[];
  mime?: string | null;
}

export interface MediaPickerFolder {
  id: string;
  name: string;
  color: string | null;
  assetIds: string[];
}

/** Resolve a picker item's kind, defaulting legacy/absent values to image. */
export function pickerKind(item: MediaPickerItem): MediaPickerAssetKind {
  return item.assetKind === "video" || item.assetKind === "document"
    ? item.assetKind
    : "image";
}

/** MEDIA-1 — infer the upload kind from a chosen file's MIME / extension. */
export function detectUploadKind(file: File): MediaPickerAssetKind {
  const mime = (file.type || "").toLowerCase();
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("image/")) return "image";
  if (
    mime === "application/pdf" ||
    mime.startsWith("application/vnd.") ||
    mime === "application/msword" ||
    mime === "text/plain" ||
    mime === "text/csv"
  ) {
    return "document";
  }
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["mp4", "mov", "webm", "avi", "mkv", "m4v"].includes(ext)) return "video";
  if (
    ["pdf", "doc", "docx", "xls", "xlsx", "ppt", "pptx", "txt", "csv"].includes(ext)
  ) {
    return "document";
  }
  return "image";
}

/** File-input accept lists, by surface. Talents stay image-only; staff/agency
 *  surfaces also accept video + document. */
export const IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";
export const STAFF_ACCEPT = [
  IMAGE_ACCEPT,
  "video/mp4,video/quicktime,video/webm",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain,text/csv",
].join(",");

export function StatusNotice({ message }: { message: string }) {
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

/** MEDIA-1 — kind-aware thumbnail: an image bg for images, an inline (muted,
 *  no-autoplay) <video> for videos, a document tile for docs. */
export function MediaThumb({
  item,
  kind,
}: {
  item: MediaPickerItem;
  kind: MediaPickerAssetKind;
}) {
  if (kind === "video") {
    return (
      <span className="relative flex aspect-[4/5] w-full items-center justify-center bg-[#1c2030]">
        <video
          className="size-full object-cover"
          src={item.publicUrl}
          muted
          playsInline
          preload="metadata"
          aria-hidden
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span className="inline-flex size-9 items-center justify-center rounded-full bg-white/85 text-[#242942]">
            <Play className="size-4" />
          </span>
        </span>
      </span>
    );
  }
  if (kind === "document") {
    const ext =
      item.storagePath.split(".").pop()?.toLowerCase().slice(0, 4) ?? "doc";
    return (
      <span className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5 bg-[#f3f1ec] text-[#3d4f7c]">
        <FileText className="size-7" />
        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">
          {ext}
        </span>
      </span>
    );
  }
  return (
    <span
      className="block aspect-[4/5] w-full bg-cover bg-center"
      style={{ backgroundImage: `url(${item.publicUrl})` }}
      aria-hidden
    />
  );
}

export function KindButton({
  active,
  label,
  count,
  icon,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  icon?: ReactNode;
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
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span>{label}</span>
      <span className="text-[10px] text-stone-400">{count}</span>
    </button>
  );
}

/** MEDIA-1 — central tag manager: a chip list + an inline add-tag input. */
export function TagEditor({
  item,
  value,
  saving,
  onChange,
  onAdd,
  onRemove,
}: {
  item: MediaPickerItem;
  value: string;
  saving: boolean;
  onChange: (value: string) => void;
  onAdd: () => void;
  onRemove: (tag: string) => void;
}) {
  const tags = item.tags ?? [];
  return (
    <div className="grid gap-1" onClick={(event) => event.stopPropagation()}>
      {tags.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag) => (
            <span
              key={tag}
              className="inline-flex items-center gap-1 rounded-full bg-[#eef0f6] px-2 py-0.5 text-[10px] font-medium text-[#3d4f7c]"
            >
              {tag}
              <button
                type="button"
                aria-label={`Remove tag ${tag}`}
                disabled={saving}
                onClick={() => onRemove(tag)}
                className="text-[#3d4f7c]/70 transition hover:text-[#242942]"
              >
                <X className="size-2.5" />
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <input
        className={KIT.input}
        value={value}
        placeholder="Add tag + Enter"
        disabled={saving}
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key !== "Enter") return;
          event.preventDefault();
          onAdd();
        }}
      />
    </div>
  );
}

export function SourceButton({
  active,
  label,
  hint,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  hint?: string;
  count: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex shrink-0 flex-col items-start gap-0.5 rounded-md border px-3 py-1.5 text-left transition"
      style={{
        background: active ? "#f2f0ea" : "#ffffff",
        borderColor: active ? CHROME.accent : CHROME.lineStrong,
        color: active ? "#25304f" : "#5f605d",
      }}
      title={hint ? `${label} — ${hint}` : label}
    >
      <span className="flex items-center gap-1.5 text-xs font-semibold">
        {label}
        <span className="text-[10px] font-medium text-stone-400">{count}</span>
      </span>
      {hint ? (
        <span className="text-[10px] font-medium text-stone-400">{hint}</span>
      ) : null}
    </button>
  );
}

export function AlbumButton({
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

export function StatePanel({
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
