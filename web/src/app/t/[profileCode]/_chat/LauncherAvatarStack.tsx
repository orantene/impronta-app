"use client";

/**
 * LauncherAvatarStack — the face-focus avatar cart that sits above the
 * "Message {agency}" launcher pill (plan §4.A). A row of overlapping circular
 * avatars (newest on top); once over the cap a neutral "+N" chip takes the last
 * slot and deep-links the panel to the Talent section. The stack is DISPLAY-ONLY
 * for the count — the faces plus the single "+N" chip ARE the count. Individual
 * removal lives in the panel's lineup surface (routed via the launcher's
 * onRegisterRemoveTalent), NOT on the pill: W1-D removed the per-avatar X so
 * overlapping X badges can no longer collide with neighbours or steal pill
 * clicks. Tapping a face (or the +N chip) opens the panel to the Talent section.
 *
 * SELF-CONTAINED + REUSABLE:
 *   • Reads NOTHING globally — `cartTalents` (AvatarStackItem[]) is derived at
 *     the page level by joining the live cart (useInquiryCart().cartIds) with
 *     portraits (loadTalentCardThumbs / GuestInquirySummary.talentPortraitUrl)
 *     and passed in. No second cart store (house rule / single source of truth).
 *
 * Empty cart → renders nothing (§4.A.8). Accent-token themed; the +N chip stays
 * neutral ink/white by design (§4.A.11). Keyboard + aria accessible (§4.A.12);
 * reduced-motion-safe (§4.A.10).
 */

import { useEffect, useRef, useState } from "react";

import type { AvatarStackItem } from "@/lib/inquiry/guest-chat-contract";
import type { Translator } from "@/i18n/interpolate";
import { interpolate } from "@/i18n/interpolate";

import {
  AVATAR_DIAMETER_DESKTOP,
  AVATAR_DIAMETER_MOBILE,
  AVATAR_GROUND,
  AVATAR_OVERLAP_DESKTOP,
  AVATAR_OVERLAP_MOBILE,
  FACE_OBJECT_POSITION,
  MAX_AVATARS_DESKTOP,
  MAX_AVATARS_MOBILE,
  PERSON_SILHOUETTE_SVG,
  UIC,
  ensureAvatarKeyframes,
} from "./launcher-avatar-styles";

export type LauncherAvatarStackProps = {
  /** Derived at the page level from cartIds + portraits. Empty → renders null. */
  cartTalents: AvatarStackItem[];
  /** Deep-link the panel to the Talent section (tapped from the +N chip). */
  onOpenToTalentSection?: () => void;
  /** Brand accent (the pill's color) — used only for the initials medallion. */
  accent: string;
  /** Readable ink on the accent — the medallion text + the avatar ring color. */
  accentInk: string;
  /** Guest-locale translator (resolved from brand.locale). */
  t: Translator;
  /** Compact (mobile) geometry: 32px circles, -11px overlap, max 2. */
  compact?: boolean;
};

const NEUTRAL_WHITE = "#ffffff";

export function LauncherAvatarStack({
  cartTalents,
  onOpenToTalentSection,
  accent,
  accentInk,
  t,
  compact = false,
}: LauncherAvatarStackProps) {
  useEffect(() => {
    ensureAvatarKeyframes();
  }, []);

  // Roving tabindex across the avatar buttons (§4.A.12 — arrow-left/right).
  const [activeIndex, setActiveIndex] = useState(0);
  const avatarRefs = useRef<(HTMLButtonElement | null)[]>([]);

  // Track the most-recently-added id so ONLY the new avatar plays the landing
  // bounce (the others must not re-animate when the list grows/shrinks). The
  // full prev snapshot lets the remove path resolve the removed talent's NAME
  // (it is gone from cartTalents by the time the effect runs) for the aria-live
  // announce, giving parity with the add path (finding #7).
  const prevIdsRef = useRef<string[]>([]);
  const prevTalentsRef = useRef<AvatarStackItem[]>([]);
  const [landingId, setLandingId] = useState<string | null>(null);
  // aria-live announcement (motion substitute for everyone, §4.A.10).
  const [announce, setAnnounce] = useState("");

  // Keep the latest translator in a ref so the announce effect (which fires on
  // cart membership change, NOT every render) reads the current locale without
  // listing the per-render `t` identity as a dependency (which would re-fire it).
  const tRef = useRef(t);
  useEffect(() => {
    tRef.current = t;
  }, [t]);

  useEffect(() => {
    const tt = tRef.current;
    const ids = cartTalents.map((item) => item.talentProfileId);
    const prev = prevIdsRef.current;
    const prevTalents = prevTalentsRef.current;
    const added = ids.find((id) => !prev.includes(id));
    const removed = prev.find((id) => !ids.includes(id));
    prevIdsRef.current = ids;
    prevTalentsRef.current = cartTalents;

    const fallbackName = tt("public.guestChat.avatarNameFallback");

    if (added) {
      setLandingId(added);
      const name =
        cartTalents.find((item) => item.talentProfileId === added)?.displayName ??
        fallbackName;
      setAnnounce(
        interpolate(tt("public.guestChat.avatarAddedAnnounce"), {
          name,
          count: ids.length,
        }),
      );
      const timer = window.setTimeout(() => setLandingId(null), 420);
      return () => window.clearTimeout(timer);
    }
    if (removed) {
      // Finding #7: name the removed talent (resolved from the prev snapshot) for
      // parity with the add announce.
      const name =
        prevTalents.find((item) => item.talentProfileId === removed)?.displayName ??
        fallbackName;
      setAnnounce(
        interpolate(tt("public.guestChat.avatarRemovedAnnounce"), {
          name,
          count: ids.length,
        }),
      );
    }
    return undefined;
  }, [cartTalents]);

  // Re-clamp the roving activeIndex when the list shrinks so tabIndex=0 never
  // lands on a slot that no longer exists (§4.A.12).
  const focusableCount = (() => {
    const max = compact ? MAX_AVATARS_MOBILE : MAX_AVATARS_DESKTOP;
    // Overflowing → (max-1) visible avatars + the +N chip = max focusable slots.
    if (cartTalents.length - max > 0) return max;
    return cartTalents.length;
  })();
  useEffect(() => {
    if (activeIndex > focusableCount - 1) {
      setActiveIndex(Math.max(0, focusableCount - 1));
    }
  }, [activeIndex, focusableCount]);

  if (cartTalents.length === 0) return null;

  const diameter = compact ? AVATAR_DIAMETER_MOBILE : AVATAR_DIAMETER_DESKTOP;
  const overlap = compact ? AVATAR_OVERLAP_MOBILE : AVATAR_OVERLAP_DESKTOP;
  const maxAvatars = compact ? MAX_AVATARS_MOBILE : MAX_AVATARS_DESKTOP;

  const overflowCount = cartTalents.length - maxAvatars;
  const hasOverflow = overflowCount > 0;
  // When overflowing, the last slot is the +N chip → show one fewer avatar.
  const visible = hasOverflow
    ? cartTalents.slice(0, maxAvatars - 1)
    : cartTalents.slice(0, maxAvatars);

  // Newest renders first (row-reverse keeps it rightmost + fully exposed, §4.A.3).
  const ordered = [...visible].reverse();
  const total = visible.length + (hasOverflow ? 1 : 0);
  // The +N chip, when present, is the deepest/leftmost slot and the LAST entry in
  // the roving group — its avatarRefs slot is the one past the avatars (§4.A.12).
  const chipIndex = hasOverflow ? ordered.length : -1;
  // Last focusable index in the roving group (avatars + optional +N chip).
  const lastIndex = hasOverflow ? ordered.length : ordered.length - 1;

  const focusAt = (index: number) => {
    const clamped = Math.max(0, Math.min(index, lastIndex));
    setActiveIndex(clamped);
    avatarRefs.current[clamped]?.focus();
  };

  return (
    <>
    <ul
      role="list"
      aria-label={t("public.guestChat.avatarStackAria")}
      style={{
        display: "flex",
        flexDirection: "row-reverse",
        alignItems: "center",
        listStyle: "none",
        margin: 0,
        padding: 0,
        // Rail-level drop-shadow so the circles read as lifted off the pill.
        filter: "drop-shadow(0 3px 6px rgba(20,24,31,0.22))",
      }}
    >
      {/* +N overflow chip occupies the first (leftmost, deepest) slot. It is the
          LAST entry in the roving group (avatarRefs[chipIndex]). */}
      {hasOverflow && (
        <li style={{ position: "relative", marginLeft: overlap, zIndex: 0 }}>
          <button
            type="button"
            ref={(el) => {
              avatarRefs.current[chipIndex] = el;
            }}
            tabIndex={chipIndex === activeIndex ? 0 : -1}
            onFocus={() => setActiveIndex(chipIndex)}
            onClick={onOpenToTalentSection}
            onKeyDown={(e) => {
              // row-reverse: visual-right is a lower index; there is no slot to
              // the visual-left of the chip (it is the deepest).
              if (e.key === "ArrowRight") {
                e.preventDefault();
                focusAt(chipIndex - 1);
              } else if (e.key === "ArrowLeft") {
                e.preventDefault();
                focusAt(chipIndex); // clamp — stays put
              }
            }}
            aria-label={interpolate(t("public.guestChat.avatarShowAllAria"), {
              count: cartTalents.length,
            })}
            style={{
              width: diameter,
              height: diameter,
              borderRadius: "50%",
              // Jon 360 Phase 7 — frosted/translucent +N chip. The old solid
              // near-black circle (#16181d) read as a harsh dark dot on a light or
              // gold accent pill. A dark-glass fill + white text keeps the count
              // legible (white on rgba(20,24,31,0.55) clears AA) while reading as a
              // soft "+more" affordance rather than a black hole.
              background: "rgba(20,24,31,0.55)",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
              color: NEUTRAL_WHITE,
              border: `1.5px solid rgba(255,255,255,0.55)`,
              boxShadow: "0 2px 6px rgba(20,24,31,0.28)",
              font: "600 12px -apple-system, BlinkMacSystemFont, sans-serif",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              cursor: onOpenToTalentSection ? "pointer" : "default",
              padding: 0,
              outline: chipIndex === activeIndex ? `2px solid ${accentInk}` : "none",
              outlineOffset: 2,
            }}
          >
            +{overflowCount}
          </button>
        </li>
      )}

      {ordered.map((talent, i) => {
        // z-index: newest on top. `ordered` is newest-first, so index 0 = top.
        const z = total - i;
        const isLanding = talent.talentProfileId === landingId;
        return (
          <li
            key={talent.talentProfileId}
            style={{
              position: "relative",
              // The newest (i === 0, rendered first / rightmost) keeps no overlap;
              // every other avatar overlaps the one visually beneath it.
              marginLeft: i === ordered.length - 1 ? 0 : overlap,
              zIndex: z,
            }}
          >
            <AvatarCircle
              talent={talent}
              diameter={diameter}
              accent={accent}
              accentInk={accentInk}
              t={t}
              landing={isLanding}
              isActive={i === activeIndex}
              buttonRef={(el) => {
                avatarRefs.current[i] = el;
              }}
              onFocus={() => setActiveIndex(i)}
              onKeyNav={(dir) => {
                if (dir === "next") focusAt(i + 1);
                else if (dir === "prev") focusAt(i - 1);
              }}
              onActivate={onOpenToTalentSection}
            />
          </li>
        );
      })}
    </ul>

      {/* Visually-hidden live region — motion substitute for everyone (§4.A.10).
          Rendered as a sibling of the <ul> so it is not a phantom list item. */}
      <span
        aria-live="polite"
        style={{
          position: "absolute",
          width: 1,
          height: 1,
          padding: 0,
          margin: -1,
          overflow: "hidden",
          clipPath: "inset(50%)",
          whiteSpace: "nowrap",
          border: 0,
        }}
      >
        {announce}
      </span>
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// One circular face-focus avatar. DISPLAY + deep-link only — the per-avatar
// X-remove was removed in W1-D (removal now lives in the panel's lineup surface),
// so nothing on the pill overlaps a neighbour or steals the pill's clicks.
// ─────────────────────────────────────────────────────────────────────────────

type AvatarCircleProps = {
  talent: AvatarStackItem;
  diameter: number;
  accent: string;
  accentInk: string;
  t: Translator;
  landing: boolean;
  isActive: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onKeyNav: (dir: "next" | "prev") => void;
  onActivate?: () => void;
};

function AvatarCircle({
  talent,
  diameter,
  accent,
  accentInk,
  t,
  landing,
  isActive,
  buttonRef,
  onFocus,
  onKeyNav,
  onActivate,
}: AvatarCircleProps) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(talent.portraitUrl) && !imgFailed;

  const landingClass = landing ? `${UIC}-avatar--landing` : "";

  return (
    <span
      style={{ position: "relative", display: "inline-flex" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {/* The avatar itself — a button that deep-links into the Talent section. */}
      <button
        type="button"
        ref={buttonRef}
        tabIndex={isActive ? 0 : -1}
        onFocus={onFocus}
        onClick={onActivate}
        onKeyDown={(e) => {
          if (e.key === "ArrowRight") {
            e.preventDefault();
            onKeyNav("prev"); // row-reverse: visual-right is the previous index
          } else if (e.key === "ArrowLeft") {
            e.preventDefault();
            onKeyNav("next");
          }
        }}
        aria-label={interpolate(t("public.guestChat.avatarOpenInquiryAria"), {
          name: talent.displayName,
        })}
        className={landingClass}
        style={{
          width: diameter,
          height: diameter,
          borderRadius: "50%",
          overflow: "hidden",
          padding: 0,
          background: showImage ? AVATAR_GROUND : accent,
          color: accentInk,
          border: "1.5px solid #ffffff",
          boxShadow: `0 0 0 2px ${accentInk}`,
          cursor: onActivate ? "pointer" : "default",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          font: "600 13px -apple-system, BlinkMacSystemFont, sans-serif",
          outline: isActive ? `2px solid ${accent}` : "none",
          outlineOffset: 2,
          transition: "transform 120ms ease",
          transform: hovered ? "translateY(-2px) scale(1.05)" : "none",
        }}
      >
        {showImage ? (
          <img
            src={talent.portraitUrl ?? undefined}
            alt={talent.displayName}
            loading="eager"
            decoding="async"
            onError={() => setImgFailed(true)}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
              objectPosition: FACE_OBJECT_POSITION,
              display: "block",
            }}
          />
        ) : (
          <span
            aria-hidden="true"
            style={{
              display: "inline-flex",
              width: "100%",
              height: "100%",
              alignItems: "center",
              justifyContent: "center",
              color: "rgba(90,102,120,0.7)",
            }}
            dangerouslySetInnerHTML={{ __html: PERSON_SILHOUETTE_SVG }}
          />
        )}
      </button>
    </span>
  );
}
