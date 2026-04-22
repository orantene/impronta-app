/**
 * Editorial-bridal profile extensions.
 *
 * Renders the M8 editorial fields (intro_italic, event_styles,
 * destinations, team_size, lead_time_weeks, starting_from, booking_note,
 * package_teasers, social_links, embedded_media) as a premium editorial
 * block stack that sits above the existing Portfolio/About on profiles
 * rendered with `template.profile-layout-family=editorial-bridal`.
 *
 * The component is a null-renderer for any other family — non-bridal
 * tenants keep their existing render untouched. Fields that are null/empty
 * silently degrade, so a partially-filled profile still looks designed.
 *
 * Visual hierarchy matches the Muse prototype: italic serif for display
 * lines, uppercase-tracked small caps for section labels, blush/sage
 * accent pills for chips, ivory card surfaces for packages, quote-styled
 * booking notes.
 */

import Link from "next/link";
import { ExternalLink } from "lucide-react";

export type EmbeddedMediaProvider =
  | "spotify"
  | "soundcloud"
  | "vimeo"
  | "youtube";

export interface EditorialProfileInput {
  layoutFamily: string | null;
  introItalic: string | null;
  eventStyles: string[];
  destinations: string[];
  travelsGlobally: boolean;
  teamSize: string | null;
  leadTimeWeeks: string | null;
  startingFrom: string | null;
  bookingNote: string | null;
  packageTeasers: Array<{ label: string; detail?: string | null }>;
  socialLinks: Array<{ label: string; href: string }>;
  embeddedMedia: Array<{
    provider: EmbeddedMediaProvider;
    url: string;
    label?: string | null;
  }>;
  /** Copy keyed by section — lets the caller localize without this file knowing the t(). */
  copy: {
    specialties: string;
    destinations: string;
    destinationReady: string;
    packages: string;
    bookingDetails: string;
    bookingNote: string;
    social: string;
    watchListen: string;
    teamSize: string;
    leadTime: string;
    startingFrom: string;
  };
}

function hasAnyContent(p: EditorialProfileInput): boolean {
  return Boolean(
    p.introItalic?.trim() ||
      p.eventStyles.length ||
      p.destinations.length ||
      p.travelsGlobally ||
      p.teamSize?.trim() ||
      p.leadTimeWeeks?.trim() ||
      p.startingFrom?.trim() ||
      p.bookingNote?.trim() ||
      p.packageTeasers.length ||
      p.socialLinks.length ||
      p.embeddedMedia.length,
  );
}

function embedSrc(provider: EmbeddedMediaProvider, url: string): string | null {
  try {
    const u = new URL(url);
    switch (provider) {
      case "vimeo": {
        const id = u.pathname.split("/").filter(Boolean).pop();
        return id ? `https://player.vimeo.com/video/${id}` : null;
      }
      case "youtube": {
        const v =
          u.searchParams.get("v") ||
          u.pathname.replace(/^\/(embed\/|shorts\/)?/, "");
        return v ? `https://www.youtube.com/embed/${v}` : null;
      }
      case "spotify": {
        return u.pathname.startsWith("/embed")
          ? url
          : `https://open.spotify.com/embed${u.pathname}${u.search}`;
      }
      case "soundcloud": {
        return `https://w.soundcloud.com/player/?url=${encodeURIComponent(
          url,
        )}&color=%23a8958b&visual=false&show_comments=false`;
      }
      default:
        return null;
    }
  } catch {
    return null;
  }
}

export function EditorialBridalProfileBlocks(props: EditorialProfileInput) {
  // This component is only meaningful on editorial-bridal. Render nothing
  // otherwise so the classic family keeps its existing layout.
  if (props.layoutFamily !== "editorial-bridal") return null;
  if (!hasAnyContent(props)) return null;

  const {
    introItalic,
    eventStyles,
    destinations,
    travelsGlobally,
    teamSize,
    leadTimeWeeks,
    startingFrom,
    bookingNote,
    packageTeasers,
    socialLinks,
    embeddedMedia,
    copy,
  } = props;

  return (
    <section
      className="space-y-10"
      data-profile-family="editorial-bridal"
      data-profile-editorial-blocks
    >
      {introItalic ? (
        <p
          className="font-[family-name:var(--site-heading-font)] text-2xl italic leading-tight text-[var(--token-color-ink,inherit)] sm:text-3xl"
          data-profile-intro-italic
        >
          {introItalic}
        </p>
      ) : null}

      {/* Key facts ribbon — only rendered when at least one fact exists. */}
      {(teamSize || leadTimeWeeks || startingFrom) && (
        <dl
          className="grid grid-cols-1 gap-x-8 gap-y-2 border-y border-[var(--token-color-line,rgba(0,0,0,0.08))] py-5 text-sm sm:grid-cols-3"
          data-profile-key-facts
        >
          {teamSize ? (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--token-color-muted,inherit)]">
                {copy.teamSize}
              </dt>
              <dd className="mt-1 font-[family-name:var(--site-heading-font)] italic text-base">
                {teamSize}
              </dd>
            </div>
          ) : null}
          {leadTimeWeeks ? (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--token-color-muted,inherit)]">
                {copy.leadTime}
              </dt>
              <dd className="mt-1 font-[family-name:var(--site-heading-font)] italic text-base">
                {leadTimeWeeks}
              </dd>
            </div>
          ) : null}
          {startingFrom ? (
            <div>
              <dt className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--token-color-muted,inherit)]">
                {copy.startingFrom}
              </dt>
              <dd className="mt-1 font-[family-name:var(--site-heading-font)] italic text-base">
                {startingFrom}
              </dd>
            </div>
          ) : null}
        </dl>
      )}

      {/* Specialties (event styles) */}
      {eventStyles.length > 0 ? (
        <section data-profile-section="specialties">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--token-color-muted,inherit)]">
            {copy.specialties}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {eventStyles.map((label, i) => (
              <li
                key={`${label}-${i}`}
                className="rounded-full border border-[var(--token-color-blush,rgba(216,183,176,0.6))] bg-[var(--token-color-blush,rgba(216,183,176,0.25))]/40 px-3 py-1 text-xs text-[var(--token-color-ink,inherit)]"
                data-card-chip
              >
                {label}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Destinations */}
      {(destinations.length > 0 || travelsGlobally) && (
        <section data-profile-section="destinations">
          <div className="flex flex-wrap items-baseline justify-between gap-3">
            <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--token-color-muted,inherit)]">
              {copy.destinations}
            </h3>
            {travelsGlobally ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-[var(--token-color-sage,rgba(168,177,160,0.7))] bg-[var(--token-color-sage,rgba(168,177,160,0.2))]/35 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--token-color-ink,inherit)]"
                data-profile-destination-ready
              >
                <span
                  className="size-1.5 rounded-full bg-[var(--token-color-sage,#a8b1a0)]"
                  aria-hidden
                />
                {copy.destinationReady}
              </span>
            ) : null}
          </div>
          {destinations.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2">
              {destinations.map((label, i) => (
                <li
                  key={`${label}-${i}`}
                  className="rounded-full border border-[var(--token-color-line,rgba(0,0,0,0.08))] bg-[var(--token-color-surface-raised,rgba(255,255,255,0.6))]/40 px-3 py-1 text-xs text-[var(--token-color-ink,inherit)]"
                  data-card-chip
                >
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      )}

      {/* Packages */}
      {packageTeasers.length > 0 ? (
        <section data-profile-section="packages">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--token-color-muted,inherit)]">
            {copy.packages}
          </h3>
          <ul className="mt-4 space-y-3">
            {packageTeasers.map((p, i) => (
              <li
                key={`${p.label}-${i}`}
                className="flex flex-col gap-0.5 rounded-xl border border-[var(--token-color-line,rgba(0,0,0,0.08))] bg-[var(--token-color-surface-raised,#fff)]/70 px-5 py-4 shadow-sm backdrop-blur-[1px] sm:flex-row sm:items-baseline sm:justify-between sm:gap-6"
              >
                <span className="font-[family-name:var(--site-heading-font)] text-lg italic text-[var(--token-color-ink,inherit)]">
                  {p.label}
                </span>
                {p.detail ? (
                  <span className="text-sm leading-relaxed text-[var(--token-color-muted,inherit)]">
                    {p.detail}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Booking note */}
      {bookingNote ? (
        <section data-profile-section="booking-note">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--token-color-muted,inherit)]">
            {copy.bookingNote}
          </h3>
          <blockquote className="mt-3 border-l-2 border-[var(--token-color-blush,#d8b7b0)] pl-4 font-[family-name:var(--site-heading-font)] text-base italic text-[var(--token-color-ink,inherit)]">
            {bookingNote}
          </blockquote>
        </section>
      ) : null}

      {/* Embedded media */}
      {embeddedMedia.length > 0 ? (
        <section data-profile-section="embedded-media">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--token-color-muted,inherit)]">
            {copy.watchListen}
          </h3>
          <ul className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {embeddedMedia.slice(0, 4).map((em, i) => {
              const src = embedSrc(em.provider, em.url);
              if (!src) return null;
              return (
                <li
                  key={`${em.provider}-${i}`}
                  className="overflow-hidden rounded-xl border border-[var(--token-color-line,rgba(0,0,0,0.08))] bg-black"
                >
                  <div
                    className={
                      em.provider === "spotify" ||
                      em.provider === "soundcloud"
                        ? "aspect-[3/1] w-full"
                        : "aspect-video w-full"
                    }
                  >
                    <iframe
                      src={src}
                      title={em.label ?? `${em.provider} embed ${i + 1}`}
                      loading="lazy"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                      allowFullScreen
                      className="h-full w-full border-0"
                    />
                  </div>
                  {em.label ? (
                    <p className="px-3 py-2 text-xs text-white/80">
                      {em.label}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {/* Social links */}
      {socialLinks.length > 0 ? (
        <section data-profile-section="social">
          <h3 className="text-[10px] font-semibold uppercase tracking-[0.28em] text-[var(--token-color-muted,inherit)]">
            {copy.social}
          </h3>
          <ul className="mt-3 flex flex-wrap gap-2">
            {socialLinks.map((s, i) => (
              <li key={`${s.href}-${i}`}>
                <Link
                  href={s.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow"
                  className="inline-flex items-center gap-1.5 rounded-full border border-[var(--token-color-line,rgba(0,0,0,0.08))] bg-[var(--token-color-surface-raised,#fff)]/60 px-3 py-1 text-xs text-[var(--token-color-ink,inherit)] transition hover:bg-[var(--token-color-blush,#d8b7b0)]/40"
                >
                  {s.label}
                  <ExternalLink className="size-3 opacity-60" />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
