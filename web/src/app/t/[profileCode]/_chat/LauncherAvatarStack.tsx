"use client";

/**
 * LauncherAvatarStack — the face-focus avatar cart that sits ON the
 * "Message {agency}" launcher pill (plan §4.A). A row of overlapping circular
 * avatars (newest on top, breaking the top edge of the pill), each with an
 * always-visible X-remove control; once over the cap a neutral "+N" chip takes
 * the last slot and deep-links the panel to the Talent section.
 *
 * SELF-CONTAINED + REUSABLE:
 *   • Reads NOTHING globally — `cartTalents` (AvatarStackItem[]) is derived at
 *     the page level by joining the live cart (useInquiryCart().cartIds) with
 *     portraits (loadTalentCardThumbs / GuestInquirySummary.talentPortraitUrl)
 *     and passed in. No second cart store (house rule / single source of truth).
 *   • Removal is delegated up via `onRemoveTalent(id)` — the host calls
 *     `useInquiryCart().setInCart(id, false)` so the cart, the form, and this
 *     rail all reflect one source.
 *
 * Empty cart → renders nothing (§4.A.8). Accent-token themed; the X + the +N
 * chip stay neutral ink/white by design (§4.A.11). Keyboard + aria accessible
 * (§4.A.12); reduced-motion-safe (§4.A.10).
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
  UIC,
  ensureAvatarKeyframes,
  initialsOf,
} from "./launcher-avatar-styles";

export type LauncherAvatarStackProps = {
  /** Derived at the page level from cartIds + portraits. Empty → renders null. */
  cartTalents: AvatarStackItem[];
  /** Remove one talent from the cart (host calls setInCart(id, false)). */
  onRemoveTalent: (talentProfileId: string) => void;
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
  onRemoveTalent,
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

  // Keyboard remove: the focused button unmounts, so move focus to a surviving
  // sibling on the next frame instead of dropping to <body> (§4.A.12). `i` is the
  // removed avatar's roving index; after the list shrinks the next valid index is
  // min(i, lastIndex-1) (the chip may also disappear when overflow clears).
  const removeAndRefocus = (i: number, talentProfileId: string) => {
    onRemoveTalent(talentProfileId);
    const next = Math.max(0, Math.min(i, lastIndex - 1));
    requestAnimationFrame(() => {
      setActiveIndex(next);
      avatarRefs.current[next]?.focus();
    });
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
              compact={compact}
              isActive={i === activeIndex}
              buttonRef={(el) => {
                avatarRefs.current[i] = el;
              }}
              onFocus={() => setActiveIndex(i)}
              onKeyNav={(dir) => {
                if (dir === "next") focusAt(i + 1);
                else if (dir === "prev") focusAt(i - 1);
              }}
              onRemove={() => removeAndRefocus(i, talent.talentProfileId)}
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
// One circular face-focus avatar + its always-visible X-remove control.
// ─────────────────────────────────────────────────────────────────────────────

type AvatarCircleProps = {
  talent: AvatarStackItem;
  diameter: number;
  accent: string;
  accentInk: string;
  t: Translator;
  landing: boolean;
  compact: boolean;
  isActive: boolean;
  buttonRef: (el: HTMLButtonElement | null) => void;
  onFocus: () => void;
  onKeyNav: (dir: "next" | "prev") => void;
  onRemove: () => void;
  onActivate?: () => void;
};

function AvatarCircle({
  talent,
  diameter,
  accent,
  accentInk,
  t,
  landing,
  compact,
  isActive,
  buttonRef,
  onFocus,
  onKeyNav,
  onRemove,
  onActivate,
}: AvatarCircleProps) {
  const [hovered, setHovered] = useState(false);
  const [imgFailed, setImgFailed] = useState(false);
  const showImage = Boolean(talent.portraitUrl) && !imgFailed;

  const xVisible = compact ? 16 + 2 : 16; // 18px mobile / 16px desktop
  const xClass = landing ? `${UIC}-avatar--landing` : "";

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
          } else if (e.key === "Delete" || e.key === "Backspace") {
            e.preventDefault();
            onRemove();
          }
        }}
        aria-label={interpolate(t("public.guestChat.avatarOpenInquiryAria"), {
          name: talent.displayName,
        })}
        className={xClass}
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
          initialsOf(talent.displayName)
        )}
      </button>

      <RemoveAvatarButton
        displayName={talent.displayName}
        size={xVisible}
        coarse={compact}
        active={isActive}
        t={t}
        onRemove={onRemove}
      />
    </span>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// RemoveAvatarButton — the always-visible X (§4.A.4). Neutral ink/white by
// design; a transparent ::before-style hit padding gives a >=24px target.
// ─────────────────────────────────────────────────────────────────────────────

type RemoveAvatarButtonProps = {
  displayName: string;
  size: number;
  /** Coarse pointer (mobile): always full opacity + larger hit area. */
  coarse: boolean;
  /** Part of the roving group: keep the X in Tab order only when its avatar is active. */
  active: boolean;
  t: Translator;
  onRemove: () => void;
};

function RemoveAvatarButton({
  displayName,
  size,
  coarse,
  active: inTabOrder,
  t,
  onRemove,
}: RemoveAvatarButtonProps) {
  const [hovered, setHovered] = useState(false);
  const [active, setActive] = useState(false);
  // Hit padding: 40px (mobile) / 28px (desktop) total around the visible circle.
  const hitPad = coarse ? Math.max(0, (40 - size) / 2) : Math.max(0, (28 - size) / 2);

  return (
    <button
      type="button"
      tabIndex={inTabOrder ? 0 : -1}
      aria-label={interpolate(t("public.guestChat.avatarRemoveAria"), {
        name: displayName,
      })}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => {
        setHovered(false);
        setActive(false);
      }}
      onMouseDown={() => setActive(true)}
      onMouseUp={() => setActive(false)}
      onClick={(e) => {
        e.stopPropagation();
        onRemove();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " " || e.key === "Delete" || e.key === "Backspace") {
          e.preventDefault();
          e.stopPropagation();
          onRemove();
        }
      }}
      style={{
        position: "absolute",
        top: -4,
        right: -4,
        width: size,
        height: size,
        // Transparent hit padding (the >=24px target) via box-sizing + padding.
        boxSizing: "content-box",
        padding: hitPad,
        margin: -hitPad,
        borderRadius: "50%",
        background: "#16181d",
        backgroundClip: "content-box",
        border: "1.5px solid #ffffff",
        cursor: "pointer",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        opacity: coarse ? 1 : hovered ? 1 : 0.85,
        transform: active ? "scale(0.92)" : hovered ? "scale(1.12)" : "scale(1)",
        transition: "transform 120ms ease, opacity 120ms ease",
        zIndex: 1,
      }}
    >
      <svg
        width="9"
        height="9"
        viewBox="0 0 12 12"
        fill="none"
        stroke="#ffffff"
        strokeWidth="2"
        strokeLinecap="round"
        aria-hidden="true"
        style={{ display: "block" }}
      >
        <line x1="2.5" y1="2.5" x2="9.5" y2="9.5" />
        <line x1="9.5" y1="2.5" x2="2.5" y2="9.5" />
      </svg>
    </button>
  );
}
