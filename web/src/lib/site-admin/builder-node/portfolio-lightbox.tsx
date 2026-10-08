"use client";

/**
 * A-06: the portfolio lightbox. Rendered through a portal on `document.body`
 * because a transformed ancestor (the card) turns `position: fixed` into
 * "fixed to the card". Next / back (buttons, arrow keys, swipe), a counter, and
 * "Book this look" for the photo currently shown.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import {
  PORTFOLIO_BOOK_EVENT,
  galleryCounter,
  nextIndex,
  swipeDirection,
  type PortfolioGallery,
} from "./portfolio-lightbox-logic";

export type PortfolioLightboxLabels = {
  bookLabel: string;
  closeLabel: string;
  prevLabel: string;
  nextLabel: string;
};

const navBtn: CSSProperties = {
  position: "absolute",
  top: "50%",
  transform: "translateY(-50%)",
  width: 44,
  height: 44,
  borderRadius: "50%",
  border: 0,
  background: "rgba(255,255,255,.16)",
  color: "#fff",
  fontSize: 24,
  cursor: "pointer",
};

export function PortfolioLightbox({
  gallery,
  labels,
  onClose,
}: {
  gallery: PortfolioGallery;
  labels: PortfolioLightboxLabels;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(gallery.index);
  const swipeX = useRef<number | null>(null);
  const count = gallery.items.length;
  const item = gallery.items[index] ?? gallery.items[0];
  const go = (dir: 1 | -1) => setIndex((i) => nextIndex(i, count, dir));

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft" && count > 1) setIndex((i) => nextIndex(i, count, -1));
      else if (e.key === "ArrowRight" && count > 1) setIndex((i) => nextIndex(i, count, 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [count, onClose]);

  if (!item || typeof document === "undefined") return null;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.alt}
      data-portfolio-lightbox
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onTouchStart={(e) => {
        swipeX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const end = e.changedTouches[0]?.clientX ?? null;
        if (swipeX.current !== null && end !== null && count > 1) {
          const dir = swipeDirection(end - swipeX.current);
          if (dir !== 0) go(dir);
        }
        swipeX.current = null;
      }}
      style={{ position: "fixed", inset: 0, zIndex: 2147483000, background: "rgba(8,8,10,0.92)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16, padding: 16 }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- public CDN URL */}
      <img src={item.src} alt={item.alt} style={{ maxWidth: "100%", maxHeight: "74vh", objectFit: "contain", borderRadius: 12 }} />
      {count > 1 ? (
        <span data-portfolio-lightbox-count aria-live="polite" style={{ color: "#fff", fontSize: 13, opacity: 0.8 }}>
          {galleryCounter(index, count)}
        </span>
      ) : null}
      {item.canBook ? (
        <button
          type="button"
          data-portfolio-lightbox-book
          onClick={(e) => {
            e.stopPropagation();
            onClose();
            window.dispatchEvent(new CustomEvent(PORTFOLIO_BOOK_EVENT, { detail: { shotId: item.id } }));
          }}
          style={{ minHeight: 48, padding: "0 24px", borderRadius: 999, border: 0, background: "#fff", color: "#121212", font: "inherit", fontWeight: 600, cursor: "pointer" }}
        >
          {labels.bookLabel}
        </button>
      ) : null}
      {count > 1 ? (
        <>
          <button type="button" aria-label={labels.prevLabel} data-portfolio-lightbox-prev onClick={() => go(-1)} style={{ ...navBtn, left: 12 }}>
            <span aria-hidden>‹</span>
          </button>
          <button type="button" aria-label={labels.nextLabel} data-portfolio-lightbox-next onClick={() => go(1)} style={{ ...navBtn, right: 12 }}>
            <span aria-hidden>›</span>
          </button>
        </>
      ) : null}
      <button
        type="button"
        aria-label={labels.closeLabel}
        onClick={onClose}
        style={{ position: "absolute", top: 12, right: 12, width: 44, height: 44, borderRadius: "50%", border: 0, background: "rgba(255,255,255,.16)", color: "#fff", fontSize: 22, cursor: "pointer" }}
      >
        <span aria-hidden>×</span>
      </button>
    </div>,
    document.body,
  );
}
