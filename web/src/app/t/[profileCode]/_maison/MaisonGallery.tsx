"use client";

/**
 * MaisonGallery — the curated results grid and its lightbox.
 *
 * Deliberately small: 6 to 8 images in controlled aspect ratios (4:5 portraits,
 * one 16:10 wide), never a masonry wall with arbitrary crop heights. Each shot
 * carries the service it shows, so the gallery answers "what would I be
 * booking" rather than just filling the page.
 *
 * The lightbox is its own component rather than the directory one because that
 * component owns its grid and is authored on the dark Impronta tokens; here the
 * grid IS the design. Keyboard: arrows move, Escape closes, focus returns to
 * the thumb that opened it.
 */

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

import { useFocusTrap } from "@/app/t/[profileCode]/_chat/use-focus-trap";

export type MaisonShot = {
  id: string;
  url: string;
  /** The service this result shows — the caption and the lightbox label. */
  label: string;
  /** One shot per grid may run wide for rhythm. */
  wide?: boolean;
};

export function MaisonGallery({
  shots,
  name,
  emptyTitle,
  emptyBody,
  closeLabel,
  prevLabel,
  nextLabel,
  enlargeLabel,
}: {
  shots: MaisonShot[];
  name: string;
  emptyTitle: string;
  emptyBody: string;
  closeLabel: string;
  prevLabel: string;
  nextLabel: string;
  /** Verb in the page's language for the thumbnail's accessible name. */
  enlargeLabel: string;
}) {
  const [open, setOpen] = useState<number | null>(null);
  const openerRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // Tab must not walk out of an aria-modal dialog and leave the keyboard user
  // stranded behind the scrim. The platform's own hook handles the wrap and
  // restores focus to the thumbnail that opened it.
  const trapRef = useFocusTrap<HTMLDivElement>(open !== null);

  const move = useCallback(
    (delta: number) => {
      setOpen((prev) => {
        if (prev === null) return prev;
        return (prev + delta + shots.length) % shots.length;
      });
    },
    [shots.length],
  );

  useEffect(() => {
    if (open === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowLeft") move(-1);
      if (e.key === "ArrowRight") move(1);
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, move]);

  if (shots.length === 0) {
    return (
      <div className="mn-empty">
        <h3 className="mn-display">{emptyTitle}</h3>
        <p>{emptyBody}</p>
      </div>
    );
  }

  const active = open === null ? null : shots[open] ?? null;

  return (
    <>
      <div className="mn-gallery">
        {shots.map((s, i) => (
          <figure key={s.id} className={`mn-shot${s.wide ? " mn-shot-wide" : ""}`} data-mn-reveal="media" style={{ "--mn-delay": `${(i % 4) * 70}ms` } as React.CSSProperties}>
            <button
              type="button"
              ref={(el) => {
                openerRefs.current[i] = el;
              }}
              onClick={() => setOpen(i)}
              aria-label={`${s.label} — ${enlargeLabel} ${i + 1}/${shots.length}`}
            >
              <Image
                src={s.url}
                alt={`${s.label} — ${name}`}
                fill
                sizes="(max-width: 899px) 50vw, 25vw"
                className="object-cover"
              />
              <span className="mn-shot-label">{s.label}</span>
            </button>
          </figure>
        ))}
      </div>

      {active ? (
        <div
          ref={trapRef}
          className="mn-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={active.label}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setOpen(null);
          }}
        >
          <button type="button" className="mn-lb-btn mn-lb-close" onClick={() => setOpen(null)} aria-label={closeLabel}>
            ✕
          </button>
          {shots.length > 1 ? (
            <>
              <button type="button" className="mn-lb-btn mn-lb-prev" onClick={() => move(-1)} aria-label={prevLabel}>
                ←
              </button>
              <button type="button" className="mn-lb-btn mn-lb-next" onClick={() => move(1)} aria-label={nextLabel}>
                →
              </button>
            </>
          ) : null}
          <figure>
            <div className="mn-lb-img">
              <Image src={active.url} alt={`${active.label} — ${name}`} fill sizes="90vw" className="object-contain" />
            </div>
            <figcaption>{active.label}</figcaption>
          </figure>
        </div>
      ) : null}
    </>
  );
}
