/**
 * event_program drawer — the pure decisions: which layouts open one, the
 * item CTA's label, and the video embed source.
 *
 * VIDEO ALLOWLIST. The same two providers the `embed` block admits for video
 * (`registry.ts` ALLOWED_EMBED_HOST_SUFFIXES: youtube.com, youtube-nocookie.com,
 * vimeo.com) and the CSP frame-src carries. Mirrored here rather than
 * imported so the client bundle never pulls the zod registry in; the static
 * test pins the two lists together. Anything else is not embedded, only the
 * item's own links render.
 */

import type { PublicScheduleItem } from "@/app/(public)/_events/event-program-actions";
import type { EventProgramLayout } from "./types";

/** Layouts whose rows open the drawer by default. Compact and schedule are scannable lists, not doors. */
export const DRAWER_DEFAULT_LAYOUTS: ReadonlySet<EventProgramLayout> = new Set(["timeline", "cards", "lineup"]);

export function drawerEnabled(layout: EventProgramLayout, openDrawer: boolean | undefined): boolean {
  if (openDrawer === false) return false;
  if (openDrawer === true) return true;
  return DRAWER_DEFAULT_LAYOUTS.has(layout);
}

/** Kinds whose empty CTA label reads "Reserve a spot". */
const RESERVE_KINDS: ReadonlySet<string> = new Set(["workshop", "class"]);

/**
 * The item CTA: `links.href` with `links.label`; an empty label on a
 * workshop / class reads "Reserve a spot", elsewhere "See more". Null when
 * the item has no link. No engine coupling: the organiser points it anywhere.
 */
export function itemCta(item: PublicScheduleItem, t: (k: string) => string): { href: string; label: string } | null {
  const href = (item.links.href ?? "").trim();
  if (!/^https?:\/\//i.test(href)) return null;
  const authored = (item.links.label ?? "").trim();
  const label = authored || (RESERVE_KINDS.has(item.kind) ? t("reserveSpot") : t("seeMore"));
  return { href, label };
}

const YT_ID = /^[A-Za-z0-9_-]{6,20}$/;
const VIMEO_ID = /^\d{5,15}$/;

/** `https://www.youtube-nocookie.com/embed/<id>` or `https://player.vimeo.com/video/<id>`; null for anything else. */
export function videoEmbedSrc(url: string | null | undefined): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null;
  const host = u.hostname.toLowerCase().replace(/^www\.|^m\./, "");
  if (host === "youtu.be") {
    const id = u.pathname.slice(1).split("/")[0] ?? "";
    return YT_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "youtube.com" || host === "youtube-nocookie.com") {
    const fromQuery = u.searchParams.get("v");
    const m = /^\/(?:embed|shorts|live)\/([^/?]+)/.exec(u.pathname);
    const id = fromQuery ?? m?.[1] ?? "";
    return YT_ID.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : null;
  }
  if (host === "vimeo.com" || host === "player.vimeo.com") {
    const m = /(\d{5,15})/.exec(u.pathname);
    const id = m?.[1] ?? "";
    return VIMEO_ID.test(id) ? `https://player.vimeo.com/video/${id}` : null;
  }
  return null;
}

/** A public URL for the drawer's hero: the cover, else the performer's hero, else the first gallery image. */
export function drawerHero(item: PublicScheduleItem): string | null {
  return item.coverUrl ?? item.performer?.heroUrl ?? item.media.gallery[0] ?? null;
}

/** `@handle` or a URL → an https Instagram URL. */
export function instagramHref(handle: string | null | undefined): string | null {
  const v = (handle ?? "").trim();
  if (!v) return null;
  if (/^https?:\/\//i.test(v)) return v;
  const clean = v.replace(/^@/, "").replace(/[^A-Za-z0-9._]/g, "");
  return clean ? `https://www.instagram.com/${clean}/` : null;
}
