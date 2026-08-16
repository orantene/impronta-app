"use client";

/**
 * media-library-kit.tsx — SEAM 2's primitives.
 *
 * PALETTE NOTE (owner rule, and the point of this file)
 * The picker family it replaces was on a hardcoded warm stone/cream palette —
 * `#f3f1ec`, `#e7e1d6`, `#f2f0ea`, `stone-*` utilities and a stray
 * `violet-600` — with zero use of the chrome tokens. This kit is on the cool
 * light language only: white surfaces, `FIELD_KIT` ink/border/accent,
 * `CHROME_RADII` and `CHROME_SHADOWS`. No gold, no rust, no amber, no khaki.
 * `field-kit/tokens.ts` is the reference and every value here comes from it or
 * from `CHROME`.
 *
 * There is also ONE chip. The old kit had three components — `AlbumButton`,
 * `KindButton`, `SourceButton` — that differed only in which optional
 * decoration they took, and drifted in padding and colour. `LibraryChip`
 * absorbs all three.
 */

import type { CSSProperties, ReactNode } from "react";
import { FileText, ImageIcon, Play } from "lucide-react";

import { CHROME, CHROME_RADII, CHROME_SHADOWS } from "../edit-chrome/kit/tokens";
import { FIELD_KIT } from "../edit-chrome/inspectors/field-kit/tokens";
import type { MediaLibraryAssetKind } from "@/lib/media/library-item";
import type { MediaLibraryWireItem } from "@/lib/media/library-wire";

/** Focus ring shared by every interactive element in the library. */
export const LIBRARY_FOCUS_CLASS =
  "outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-[color:var(--media-library-accent)]";

/** Set once on the library root so the focus ring can be a CSS var. */
export const LIBRARY_ROOT_STYLE: CSSProperties = {
  ["--media-library-accent" as string]: FIELD_KIT.accent,
};

export function LibraryChip({
  active,
  label,
  count,
  hint,
  icon,
  swatch,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  hint?: string;
  icon?: ReactNode;
  /** Folder colour dot. */
  swatch?: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      title={hint ? `${label} — ${hint}` : label}
      className={`inline-flex shrink-0 items-center gap-1.5 border transition-colors ${LIBRARY_FOCUS_CLASS}`}
      style={{
        background: active ? FIELD_KIT.accentFill : FIELD_KIT.surface,
        borderColor: active ? FIELD_KIT.accent : FIELD_KIT.border,
        color: active ? FIELD_KIT.accent : FIELD_KIT.muted,
        borderRadius: FIELD_KIT.radius.chip,
        fontSize: FIELD_KIT.font.label,
        fontWeight: FIELD_KIT.weight.label,
        height: FIELD_KIT.size.control,
        padding: "0 10px",
        transitionDuration: `${FIELD_KIT.motion.duration}ms`,
        transitionTimingFunction: FIELD_KIT.motion.easing,
      }}
    >
      {swatch !== undefined ? (
        <span
          aria-hidden
          className="inline-block size-2 shrink-0 rounded-full"
          style={{ background: swatch || FIELD_KIT.mutedSoft }}
        />
      ) : null}
      {icon ? <span aria-hidden>{icon}</span> : null}
      <span className="max-w-[13rem] truncate">{label}</span>
      {typeof count === "number" ? (
        <span
          style={{
            fontSize: FIELD_KIT.font.caption,
            fontWeight: FIELD_KIT.weight.caption,
            color: active ? FIELD_KIT.accent : FIELD_KIT.mutedSoft,
          }}
        >
          {count}
        </span>
      ) : null}
    </button>
  );
}

/** Kind-aware thumbnail. Images lazy-load; videos never autoplay. */
export function MediaThumb({
  item,
  kind,
}: {
  item: MediaLibraryWireItem;
  kind: MediaLibraryAssetKind;
}) {
  if (kind === "video") {
    return (
      <span
        className="relative flex aspect-[4/5] w-full items-center justify-center"
        style={{ background: CHROME.chipInkDeep }}
      >
        <video
          className="size-full object-cover"
          src={item.publicUrl}
          muted
          playsInline
          preload="metadata"
          aria-hidden
        />
        <span className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <span
            className="inline-flex size-9 items-center justify-center rounded-full"
            style={{ background: "rgba(255,255,255,0.9)", color: CHROME.chipInk }}
          >
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
      <span
        className="flex aspect-[4/5] w-full flex-col items-center justify-center gap-1.5"
        style={{ background: FIELD_KIT.surfaceRecessed, color: FIELD_KIT.accent }}
      >
        <FileText className="size-7" />
        <span
          className="uppercase tracking-wide"
          style={{
            fontSize: FIELD_KIT.font.caption,
            fontWeight: FIELD_KIT.weight.label,
            color: FIELD_KIT.muted,
          }}
        >
          {ext}
        </span>
      </span>
    );
  }

  return (
    // A real <img> rather than a CSS background, so the browser's own lazy
    // loading and decoding apply — the old picker painted 60 full-size
    // backgrounds eagerly, and this grid can hold a whole 1,900-asset library.
    <img
      src={item.publicUrl}
      alt=""
      loading="lazy"
      decoding="async"
      className="block aspect-[4/5] w-full object-cover"
      style={{ background: FIELD_KIT.surfaceRecessed }}
    />
  );
}

/** Small dark pill over a thumbnail (kind, lock, portfolio). */
export function ThumbBadge({
  children,
  tone = "ink",
  className,
}: {
  children: ReactNode;
  tone?: "ink" | "accent" | "light";
  className?: string;
}) {
  const palette =
    tone === "accent"
      ? { background: FIELD_KIT.accent, color: "#ffffff" }
      : tone === "light"
        ? { background: "rgba(255,255,255,0.94)", color: CHROME.text }
        : { background: "rgba(36, 41, 66, 0.85)", color: "#ffffff" };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 uppercase tracking-wide ${className ?? ""}`}
      style={{
        ...palette,
        borderRadius: CHROME_RADII.xl,
        fontSize: FIELD_KIT.font.caption,
        fontWeight: FIELD_KIT.weight.label,
        boxShadow: CHROME_SHADOWS.card,
      }}
    >
      {children}
    </span>
  );
}

export function KindGlyph({ kind }: { kind: MediaLibraryAssetKind }) {
  if (kind === "video") return <Play className="size-3" />;
  if (kind === "document") return <FileText className="size-3" />;
  return <ImageIcon className="size-3" />;
}

/**
 * Content-shaped loading. A skeleton that matches the tile grid, never a
 * centered spinner — the library must not flash empty while it loads, because
 * "empty" and "loading" are the two states an operator most needs told apart.
 */
export function LibrarySkeletonGrid({ tiles = 12 }: { tiles?: number }) {
  return (
    <ul
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
      aria-hidden
      data-testid="media-library-skeleton"
    >
      {Array.from({ length: tiles }).map((_, index) => (
        <li key={index}>
          <div
            className="overflow-hidden border"
            style={{
              borderColor: FIELD_KIT.border,
              borderRadius: CHROME_RADII.lg,
              background: FIELD_KIT.surface,
            }}
          >
            <div
              className="aspect-[4/5] w-full animate-pulse"
              style={{ background: FIELD_KIT.surfaceRecessed }}
            />
            <div className="p-2">
              <div
                className="h-2.5 w-2/3 animate-pulse rounded"
                style={{ background: FIELD_KIT.surfaceRecessed }}
              />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function LibraryStatePanel({
  icon,
  title,
  detail,
  action,
  tone = "neutral",
}: {
  icon: ReactNode;
  title: string;
  detail?: string;
  action?: ReactNode;
  tone?: "neutral" | "error";
}) {
  const accent = tone === "error" ? CHROME.rose : FIELD_KIT.accent;
  return (
    <div
      className="flex min-h-[260px] items-center justify-center border border-dashed p-8 text-center"
      style={{
        borderColor: tone === "error" ? CHROME.roseLine : FIELD_KIT.border,
        borderRadius: CHROME_RADII.lg,
        background: tone === "error" ? CHROME.roseBg : FIELD_KIT.surfaceRecessed,
      }}
      role={tone === "error" ? "alert" : undefined}
    >
      <div className="grid justify-items-center gap-2">
        <span
          className="inline-flex size-9 items-center justify-center rounded-full border"
          style={{
            borderColor: FIELD_KIT.border,
            background: FIELD_KIT.surface,
            color: accent,
          }}
        >
          {icon}
        </span>
        <p
          style={{
            fontSize: FIELD_KIT.font.value,
            fontWeight: FIELD_KIT.weight.label,
            color: FIELD_KIT.ink,
          }}
        >
          {title}
        </p>
        {detail ? (
          <p
            className="max-w-[42ch]"
            style={{ fontSize: FIELD_KIT.font.label, color: FIELD_KIT.muted }}
          >
            {detail}
          </p>
        ) : null}
        {action ? <div className="mt-1">{action}</div> : null}
      </div>
    </div>
  );
}

/**
 * A calm cool notice. Used for the pending-approval count and for upload
 * warnings — never gold, never alarm-red unless it IS an error.
 */
export function LibraryNotice({
  children,
  tone = "info",
}: {
  children: ReactNode;
  tone?: "info" | "error";
}) {
  const palette =
    tone === "error"
      ? { background: CHROME.roseBg, color: CHROME.rose, borderColor: CHROME.roseLine }
      : { background: CHROME.blueBg, color: CHROME.blue, borderColor: CHROME.blueLine };
  return (
    <div
      className="border px-3 py-2"
      style={{
        ...palette,
        borderRadius: CHROME_RADII.md,
        fontSize: FIELD_KIT.font.label,
      }}
      role={tone === "error" ? "alert" : "status"}
    >
      {children}
    </div>
  );
}
