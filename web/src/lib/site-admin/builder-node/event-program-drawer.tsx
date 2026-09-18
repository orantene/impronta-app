"use client";

/**
 * event_program item drawer — the same shell the ticket checkout uses
 * (`ticket-picker-checkout.tsx`): a bottom sheet on a phone (88svh), a 440px
 * right panel on desktop, both over a scrim. Body scroll is locked, focus is
 * trapped, Escape and the scrim close it, and focus returns to the row that
 * opened it.
 *
 * Content, top to bottom, each only when the item has it: hero (cover, the
 * performer's hero, or the first gallery image; 4:5), the time line, the
 * title in the heading font, the kind word, the performer (name, bio, "View
 * profile", Instagram, website), the description, the gallery thumbs (tap
 * swaps the hero), the video (YouTube / Vimeo only), the sponsor line, and
 * the item CTA as a primary button. No emoji, no glyph.
 */

import { useEffect, useRef, useState } from "react";

import { drawerHero, instagramHref, itemCta, videoEmbedSrc } from "./event-program-drawer-model";
import type { PlacedItem } from "./event-program-model";

const FOCUSABLE = 'a[href],button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),iframe,[tabindex]:not([tabindex="-1"])';

export function ProgramDrawer({ placed, place, kind, t, onClose, titleId }: {
  placed: PlacedItem;
  place: string | null;
  kind: boolean;
  t: (k: string) => string;
  onClose: () => void;
  titleId: string;
}) {
  const { item } = placed;
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  const [hero, setHero] = useState<string | null>(() => drawerHero(item));

  // Focus in, trap Tab, Escape out, body scroll locked, focus restored.
  useEffect(() => {
    const opener = (typeof document !== "undefined" ? document.activeElement : null) as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    sheetRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); return; }
      if (e.key !== "Tab" || !sheetRef.current) return;
      const nodes = Array.from(sheetRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (nodes.length === 0) return;
      const head = nodes[0]!;
      const tail = nodes[nodes.length - 1]!;
      const active = document.activeElement;
      if (e.shiftKey && (active === head || !sheetRef.current.contains(active))) { e.preventDefault(); tail.focus(); }
      else if (!e.shiftKey && active === tail) { e.preventDefault(); head.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
      opener?.focus?.();
    };
  }, []);

  const performer = item.performer;
  const performerName = performer ? (performer.tba && !performer.name ? t("performerTba") : performer.name) : null;
  const instagram = instagramHref(performer?.instagram ?? item.links.instagram);
  const website = item.links.website;
  const video = videoEmbedSrc(item.media.video);
  const cta = itemCta(item, t);
  const gallery = item.media.gallery;
  const timeLine = placed.timeLabel
    ? `${placed.timeLabel}${placed.dayOffset > 0 ? ` +${placed.dayOffset}` : ""}${placed.endTimeLabel ? ` - ${placed.endTimeLabel}` : ""}`
    : t("tba");

  return (
    <>
      <div className="ep-scrim" onClick={onClose} aria-hidden="true" data-testid="event-program-drawer-scrim" />
      <div ref={sheetRef} className="ep-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} data-testid="event-program-drawer">
        <div className="ep-sheet-head">
          <span className="ep-sheet-kicker">{timeLine}{place ? ` · ${place}` : ""}</span>
          <button type="button" className="ep-close" data-testid="event-program-drawer-close" onClick={onClose}>{t("close")}</button>
        </div>
        <div className="ep-sheet-body">
          {hero ? <img className="ep-sheet-hero" src={hero} alt="" data-testid="event-program-drawer-hero" /> : null}
          <h3 className="ep-sheet-title" id={titleId}>{item.title}</h3>
          {item.subtitle || (kind ? t(`kind_${item.kind}`) : null) ? (
            <p className="ep-meta">
              {item.subtitle ? <span>{item.subtitle}</span> : null}
              {kind ? <span className="ep-kind">{t(`kind_${item.kind}`)}</span> : null}
            </p>
          ) : null}
          {performerName ? (
            <section className="ep-sheet-performer" data-testid="event-program-drawer-performer">
              <p className="ep-sheet-name">{performerName}</p>
              {performer?.bio ? <p className="ep-sheet-bio">{performer.bio}</p> : null}
              <p className="ep-sheet-links">
                {performer?.profileHref ? <a href={performer.profileHref}>{t("viewProfile")}</a> : null}
                {instagram ? <a href={instagram} rel="noopener noreferrer" target="_blank">{t("instagram")}</a> : null}
                {website ? <a href={website} rel="noopener noreferrer" target="_blank">{t("website")}</a> : null}
              </p>
            </section>
          ) : null}
          {item.description ? <p className="ep-sheet-desc">{item.description}</p> : null}
          {gallery.length > 0 ? (
            <ul className="ep-sheet-gallery" aria-label={t("gallery")}>
              {gallery.map((url) => (
                <li key={url}>
                  <button type="button" className="ep-sheet-thumb" data-on={hero === url ? "1" : undefined} data-testid="event-program-drawer-thumb" onClick={() => setHero(url)} aria-label={t("gallery")}>
                    <img src={url} alt="" loading="lazy" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {video ? (
            <div className="ep-sheet-video">
              <iframe src={video} title={t("video")} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen data-testid="event-program-drawer-video" />
            </div>
          ) : null}
          {item.sponsor ? (
            <p className="ep-sheet-sponsor" data-testid="event-program-drawer-sponsor">
              {t("sponsoredBy")}{" "}
              {item.sponsor.url ? <a href={item.sponsor.url} rel="noopener noreferrer sponsored" target="_blank">{item.sponsor.name}</a> : <span>{item.sponsor.name}</span>}
            </p>
          ) : null}
          {cta ? <a className="ep-cta" href={cta.href} data-testid="event-program-drawer-cta">{cta.label}</a> : null}
        </div>
      </div>
    </>
  );
}
