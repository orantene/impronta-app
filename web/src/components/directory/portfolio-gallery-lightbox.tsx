"use client";

import Image from "next/image";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

type PortfolioItem = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

type WatermarkPreset = {
  enabled: boolean;
  position: string;
  size_pct: number;
  opacity: number;
  padding_pct: number;
  variant: string;
};

function clampIndex(i: number, len: number) {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

function WatermarkOverlay({
  logoUrl,
  preset,
}: {
  logoUrl: string;
  preset: WatermarkPreset;
}) {
  const pad = `${preset.padding_pct}%`;
  const size = `${preset.size_pct}%`;

  const posStyle: React.CSSProperties = (() => {
    const p = preset.position;
    const top = p.startsWith("t") ? pad : undefined;
    const bottom = p.startsWith("b") ? pad : undefined;
    const left = p.endsWith("l") ? pad : undefined;
    const right = p.endsWith("r") ? pad : undefined;
    const isMiddleV = p.startsWith("m");
    const isCenterH = p.endsWith("c");
    return {
      top: isMiddleV ? "50%" : top,
      bottom: isMiddleV ? undefined : bottom,
      left: isCenterH ? "50%" : left,
      right: isCenterH ? undefined : right,
      transform: [
        isMiddleV ? "translateY(-50%)" : "",
        isCenterH ? "translateX(-50%)" : "",
      ]
        .filter(Boolean)
        .join(" ") || undefined,
    };
  })();

  return (
    <div
      className="pointer-events-none absolute"
      style={{ ...posStyle, width: size, opacity: preset.opacity }}
    >
      <Image
        src={logoUrl}
        alt=""
        width={200}
        height={80}
        className={`h-auto w-full object-contain ${preset.variant === "dark" ? "brightness-0" : "brightness-0 invert"}`}
        unoptimized
      />
    </div>
  );
}

/**
 * Editorial layout hook (Noir). `items` is split into consecutive runs; each
 * run renders as its own <ul> with the given class, and `after` (a
 * server-rendered node) is placed between runs. One lightbox spans them all,
 * so arrow keys walk the whole portfolio in display order. Without
 * `sections` the classic 2/3-column grid renders exactly as before.
 */
export type PortfolioLayoutSection = {
  count: number;
  listClassName: string;
  after?: React.ReactNode;
};

export function PortfolioGalleryLightbox({
  name,
  items,
  lightbox,
  closeLabel,
  watermarkPreset,
  watermarkLogoUrl,
  sections,
  tileClassName,
}: {
  name: string;
  items: PortfolioItem[];
  lightbox: DirectoryUiCopy["lightbox"];
  closeLabel: string;
  watermarkPreset?: WatermarkPreset | null;
  watermarkLogoUrl?: string | null;
  sections?: PortfolioLayoutSection[];
  /** Replaces the classic tile button classes when `sections` is used. */
  tileClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const count = items.length;
  const active = items[index] ?? null;

  // Split into consecutive runs (one per layout section); the classic grid is
  // a single run carrying its own classes.
  const runs = useMemo(() => {
    const indexed = items.map((item, index) => ({ item, index }));
    if (!sections || sections.length === 0) {
      return [
        {
          listClassName: "mt-6 grid list-none grid-cols-2 gap-3 sm:grid-cols-3",
          items: indexed,
          after: null as React.ReactNode,
        },
      ];
    }
    const out: { listClassName: string; items: typeof indexed; after: React.ReactNode }[] = [];
    let cursor = 0;
    for (const s of sections) {
      const slice = indexed.slice(cursor, cursor + s.count);
      cursor += s.count;
      if (slice.length === 0 && !s.after) continue;
      out.push({ listClassName: s.listClassName, items: slice, after: s.after ?? null });
    }
    if (cursor < indexed.length) {
      const last = out[out.length - 1];
      if (last) last.items = last.items.concat(indexed.slice(cursor));
    }
    return out;
  }, [items, sections]);

  const aspect = useMemo(() => {
    if (!active?.width || !active?.height) return 4 / 3;
    const v = active.width / active.height;
    if (!Number.isFinite(v) || v <= 0) return 4 / 3;
    return v;
  }, [active?.width, active?.height]);

  const go = useCallback((delta: number) => {
    if (count <= 1) return;
    setIndex((prev) => clampIndex(prev + delta, count));
  }, [count]);

  const onOpen = (i: number) => {
    setIndex(clampIndex(i, count));
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
      if (e.key === "ArrowLeft") go(-1);
      if (e.key === "ArrowRight") go(1);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, go]);

  return (
    <>
      {runs.map((run, r) => (
        <Fragment key={r}>
          <ul className={run.listClassName}>
            {run.items.map(({ item: m, index: i }) => {
              const a = m.width && m.height ? m.width / m.height : 3 / 4;
              const isPortrait = a < 1;
              return (
                <li
                  key={m.id}
                  data-orientation={isPortrait ? "portrait" : "landscape"}
                  className={
                    sections
                      ? undefined
                      : isPortrait
                        ? "col-span-1 row-span-2"
                        : "col-span-1 row-span-1"
                  }
                >
                  <button
                    type="button"
                    onClick={() => onOpen(i)}
                    className={
                      tileClassName ??
                      "group relative block w-full overflow-hidden rounded bg-[var(--impronta-surface)] text-left outline-none ring-offset-2 ring-offset-[var(--impronta-black)] focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/60"
                    }
                    style={sections ? undefined : { aspectRatio: isPortrait ? "3/4" : "4/3" }}
                    aria-label={`Open ${name} portfolio image ${i + 1} of ${count}`}
                  >
                    <Image
                      src={m.url}
                      alt={`${name} — portfolio image ${i + 1}`}
                      fill
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
                      sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
                      priority={i < 3}
                    />
                    <div className="absolute inset-0 bg-black/0 transition-colors duration-300 group-hover:bg-black/20" />
                    {watermarkPreset?.enabled && watermarkLogoUrl ? (
                      <WatermarkOverlay logoUrl={watermarkLogoUrl} preset={watermarkPreset} />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          {run.after}
        </Fragment>
      ))}

      {open && active ? (
        <div
          className="fixed inset-0 z-[200] bg-black/70 backdrop-blur-md"
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.dialogAria}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
          onTouchStart={(e) => {
            const t = e.touches[0];
            if (!t) return;
            touchStartX.current = t.clientX;
            touchStartY.current = t.clientY;
          }}
          onTouchEnd={(e) => {
            const t0x = touchStartX.current;
            const t0y = touchStartY.current;
            touchStartX.current = null;
            touchStartY.current = null;
            const t = e.changedTouches[0];
            if (!t || t0x == null || t0y == null) return;

            const dx = t.clientX - t0x;
            const dy = t.clientY - t0y;
            if (Math.abs(dy) > 80 && Math.abs(dy) > Math.abs(dx) * 1.3) return;
            if (Math.abs(dx) < 60) return;
            if (dx < 0) go(1);
            else go(-1);
          }}
        >
          <div className="absolute right-4 top-4 flex items-center gap-2">
            <div className="rounded-full border border-white/10 bg-black/40 px-3 py-1 font-mono text-[11px] uppercase tracking-[0.2em] text-white/80">
              {index + 1} / {count}
            </div>
            <button
              type="button"
              className="rounded-full border border-white/10 bg-black/40 px-3 py-2 text-sm text-white/90 transition hover:bg-black/55"
              onClick={() => setOpen(false)}
              aria-label={lightbox.closeAria}
            >
              {closeLabel}
            </button>
          </div>

          <button
            type="button"
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/90 transition hover:bg-black/55 disabled:opacity-30"
            onClick={() => go(-1)}
            disabled={count <= 1}
            aria-label={lightbox.prevAria}
          >
            ←
          </button>
          <button
            type="button"
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full border border-white/10 bg-black/35 px-3 py-2 text-sm text-white/90 transition hover:bg-black/55 disabled:opacity-30"
            onClick={() => go(1)}
            disabled={count <= 1}
            aria-label={lightbox.nextAria}
          >
            →
          </button>

          <div className="mx-auto flex h-full max-w-6xl items-center justify-center px-4 py-16">
            <div
              className="relative w-full overflow-hidden rounded-2xl border border-white/10 bg-black/30 shadow-[0_24px_80px_-32px_rgba(0,0,0,0.85)]"
              style={{
                aspectRatio: aspect,
                maxHeight: "78vh",
              }}
            >
              <Image
                src={active.url}
                alt={`${name} — portfolio image ${index + 1}`}
                fill
                className="object-contain"
                sizes="(max-width: 1024px) 100vw, 1024px"
                priority
              />
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_50%_at_50%_80%,rgba(201,162,39,0.10),transparent_70%)]" />
            </div>
          </div>

          <p className="absolute bottom-5 left-0 right-0 text-center font-mono text-[10px] uppercase tracking-[0.26em] text-white/55">
            Swipe · Arrow keys · Esc to close
          </p>
        </div>
      ) : null}
    </>
  );
}

