/**
 * A-06: pure rules for the portfolio lightbox (no React), unit-tested alone.
 */

export type PortfolioGalleryItem = {
  id: string;
  src: string;
  alt: string;
  /** TUL-15: the caption shown under the lightbox photo, and its language hint when it is not the visitor's language. */
  caption?: string | null;
  captionHint?: string | null;
  /** True when this photo has a linked, loaded offering, so "Book this look" can open it. */
  canBook?: boolean;
};

export type PortfolioGallery = { items: PortfolioGalleryItem[]; index: number };

/** window event: the lightbox asks the link that owns `shotId` to open its booking. */
export const PORTFOLIO_BOOK_EVENT = "tulala:portfolio-book";

/**
 * TUL-139: every link with the same shot id listens on `window`, so a photo used
 * in two portfolio blocks answered one tap twice. The first listener to claim the
 * event's shared `detail` object books; later ones see it claimed and stand down.
 */
export function claimPortfolioBook(event: Event, shotId: string): boolean {
  const detail = (event as CustomEvent<{ shotId?: string; claimed?: boolean }>).detail;
  if (!detail || detail.shotId !== shotId || detail.claimed) return false;
  detail.claimed = true;
  return true;
}

/**
 * TUL-440: which booking buttons the lightbox shows for one photo. A linked photo books its own
 * look; a photo-only one gets a secondary general "Book an appointment" (the header CTA's sheet)
 * when the site has something bookable, and nothing otherwise (never a dead button).
 */
export function lightboxCtas(input: { canBook: boolean; hasBookableOffering: boolean }): {
  look: boolean;
  general: boolean;
} {
  return { look: input.canBook, general: !input.canBook && input.hasBookableOffering };
}

/** Label of the general booking button. */
export function generalBookLabel(es: boolean): string {
  return es ? "Reservar cita" : "Book an appointment";
}

/** A horizontal swipe longer than this changes photo. */
export const PORTFOLIO_SWIPE_PX = 60;

/** Next / previous index, wrapping at both ends. */
export function nextIndex(index: number, count: number, dir: 1 | -1): number {
  if (count <= 0) return 0;
  return (((index + dir) % count) + count) % count;
}

/** A swipe left (negative dx) goes to the next photo, right to the previous; short moves do nothing. */
export function swipeDirection(dx: number): 1 | -1 | 0 {
  if (Math.abs(dx) <= PORTFOLIO_SWIPE_PX) return 0;
  return dx < 0 ? 1 : -1;
}

/** "3 / 8" for the 0-based `index`. */
export function galleryCounter(index: number, count: number): string {
  return `${index + 1} / ${count}`;
}

/** The lightbox list for one portfolio block: every visible shot, in order. */
export function buildPortfolioGallery(
  shots: ReadonlyArray<{
    id: string;
    url: string;
    alt?: string | null;
    caption?: string | null;
    offeringId?: string | null;
    offeringTitle?: string | null;
  }>,
  hasOffering: (offeringId: string) => boolean,
  es: boolean,
  captionHintFor?: (shot: { id: string; caption?: string | null }) => string | null,
): PortfolioGalleryItem[] {
  return shots.map((s) => ({
    id: s.id,
    src: s.url,
    alt: s.alt || s.caption?.trim() || s.offeringTitle?.trim() || (es ? "Foto del portafolio" : "Portfolio photo"),
    ...(s.caption?.trim() ? { caption: s.caption.trim(), captionHint: captionHintFor?.(s) ?? null } : {}),
    canBook: Boolean(s.offeringId && hasOffering(s.offeringId)),
  }));
}
