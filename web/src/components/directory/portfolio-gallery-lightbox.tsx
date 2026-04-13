"use client";

import Image from "next/image";
import { useEffect, useMemo, useRef, useState } from "react";
import type { DirectoryUiCopy } from "@/lib/directory/directory-ui-copy";

type PortfolioItem = {
  id: string;
  url: string;
  width: number | null;
  height: number | null;
};

function clampIndex(i: number, len: number) {
  if (len <= 0) return 0;
  return ((i % len) + len) % len;
}

export function PortfolioGalleryLightbox({
  name,
  items,
  lightbox,
  closeLabel,
}: {
  name: string;
  items: PortfolioItem[];
  lightbox: DirectoryUiCopy["lightbox"];
  closeLabel: string;
}) {
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const count = items.length;
  const active = items[index] ?? null;

  const aspect = useMemo(() => {
    if (!active?.width || !active?.height) return 4 / 3;
    const v = active.width / active.height;
    if (!Number.isFinite(v) || v <= 0) return 4 / 3;
    return v;
  }, [active?.width, active?.height]);

  const go = (delta: number) => {
    if (count <= 1) return;
    setIndex((prev) => clampIndex(prev + delta, count));
  };

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, count]);

  return (
    <>
      <ul className="mt-6 grid list-none grid-cols-2 gap-3 sm:grid-cols-3">
        {items.map((m, i) => {
          const a = m.width && m.height ? m.width / m.height : 3 / 4;
          const isPortrait = a < 1;
          return (
            <li
              key={m.id}
              className={isPortrait ? "col-span-1 row-span-2" : "col-span-1 row-span-1"}
            >
              <button
                type="button"
                onClick={() => onOpen(i)}
                className="group relative block w-full overflow-hidden rounded bg-[var(--impronta-surface)] text-left outline-none ring-offset-2 ring-offset-[var(--impronta-black)] focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/60"
                style={{ aspectRatio: isPortrait ? "3/4" : "4/3" }}
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
              </button>
            </li>
          );
        })}
      </ul>

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

