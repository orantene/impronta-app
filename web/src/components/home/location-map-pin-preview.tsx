"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import {
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type PanInfo,
} from "framer-motion";
import type { LocationFeaturedPreview, LocationSectionCopy } from "./location-section";

// ── Exported for portal pixel-offset maths ───────────────────────────────────
export const AVATAR_SIZE = 52;
export const RING_RADIUS = 78;
export const ORBIT_AREA = (RING_RADIUS + AVATAR_SIZE) * 2 + 8; // 276

/** Seconds for one unattended revolution. */
const ORBIT_DURATION_SEC = 36;
/** Idle drift in degrees per second, derived so the two cannot disagree. */
const IDLE_DEG_PER_SEC = 360 / ORBIT_DURATION_SEC;
/**
 * How long a tapped talent's name stays up before fading. The profile link
 * below the map deliberately does NOT follow it -- see `onSelect`.
 */
export const NAME_VISIBLE_MS = 3000;

/** Peak tilt of the bottom-weighted sway, in degrees. */
const BALANCE_TILT_DEG = 7;
/** Seconds for one full sway. Slower than the orbit, so the two never lock. */
const BALANCE_PERIOD_SEC = 5.5;

/**
 * Flick physics. `power` converts pointer velocity into throw distance and
 * `timeConstant` sets how long the spin takes to bleed off -- together they are
 * the difference between "it spins" and "it feels like it has mass".
 */
const FLICK_POWER = 0.28;
/** Seconds for a thrown ring to bleed back to the idle drift. */
const FLICK_SETTLE_SEC = 1.9;
/** Below this the flick is treated as a tap, not a throw. */
const FLICK_MIN_VELOCITY = 40;
/**
 * Grace period before a hover-pause is released. Long enough to absorb the
 * enter/leave flicker of a moving avatar under a still cursor, short enough
 * that moving away feels immediate.
 */
const HOVER_RESUME_DELAY_MS = 280;

type Props = {
  items: LocationFeaturedPreview[];
  copy: LocationSectionCopy;
  locationLabel: string;
  /**
   * Raised when a visitor picks a face. The parent renders the profile link
   * BELOW the map, where it persists until another face is picked -- the name
   * label inside the ring is the part that fades.
   */
  onSelect?: (item: LocationFeaturedPreview | null) => void;
  selectedTalentId?: string | null;
};

/**
 * The orbit ring: the roster for one city, circling its map pin.
 *
 * THREE THINGS THIS DOES THAT A PLAIN ROTATION DOES NOT
 *
 * 1. FACES STAY UPRIGHT. Rotating a wrapper rotates its children with it, so
 *    every face tips over as it comes round -- at the bottom of the circle the
 *    talent is upside down. Each avatar counter-rotates by exactly the ring's
 *    angle, so the ring turns and the faces do not.
 *
 * 2. THEY HANG LIKE PENDANTS. A perfectly rigid upright face reads as a sticker
 *    rather than something travelling. Each avatar carries a slow sway around
 *    its own TOP EDGE (`transformOrigin: 50% 0`), so the weight sits at the
 *    bottom of the image and settles it -- the balance comes from the body, the
 *    way it would on a real hanging charm. Phase is offset per avatar so the
 *    ring never swings as one block.
 *
 * 3. IT CAN BE THROWN. Drag anywhere on the ring and it follows the pointer;
 *    let go and it keeps the velocity, decelerating to a stop and rejoining the
 *    idle drift. Works with mouse and touch.
 *
 * Reduced motion turns off the drift, the sway and the flick, and leaves a
 * static, fully legible ring.
 */
export function LocationMapPinPreview({
  items,
  copy,
  locationLabel,
  onSelect,
  selectedTalentId = null,
}: Props) {
  const reduceMotion = useReducedMotion();
  const n = items.length;
  /**
   * Nothing derived from the live rotation may render before mount. The sway
   * angle is an irrational number of degrees, and the server and the client
   * serialise it to different precision -- `rotate(-6.06218deg)` against
   * `rotate(-6.062177826491069deg)` -- which React reports as an unpatchable
   * hydration mismatch on every avatar. So the first paint is a still ring at
   * angle 0, identical on both sides, and the motion starts a tick later.
   */
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const spins = mounted && !reduceMotion && n > 1;

  /** The ring's angle in degrees. Everything else is derived from it. */
  const rotation = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const draggingRef = useRef(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  /**
   * ONE rAF loop owns the ring's motion, and `velocityRef` is the only thing
   * that decides what it does next.
   *
   * This replaced a stack of framer `animate()` calls -- an infinite idle
   * tween, a decay tween for the flick, and stop()/restart() juggling between
   * them. Pausing on hover could not be made to hold: stopping one tween while
   * another was queued to start left the ring turning under the cursor, so a
   * visitor clicked one face and selected whichever had arrived by the time the
   * click landed. It read as the component reporting the wrong name; nothing
   * was wrong with the name, the target had moved.
   *
   * A velocity and a friction term are both easier to reason about and easier
   * to make behave: pausing is `velocity = 0`, a flick is `velocity = throw`,
   * and the drift is the value it eases back to.
   */
  const velocityRef = useRef(0);
  const pausedRef = useRef(false);

  useEffect(() => {
    if (!spins) {
      velocityRef.current = 0;
      return;
    }
    velocityRef.current = IDLE_DEG_PER_SEC;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      if (!pausedRef.current && !draggingRef.current) {
        // Ease whatever the current velocity is back toward the idle drift.
        // After a throw that reads as the ring spending its momentum; from rest
        // it is simply the drift resuming.
        const v = velocityRef.current;
        velocityRef.current = v + (IDLE_DEG_PER_SEC - v) * Math.min(1, dt / FLICK_SETTLE_SEC);
        rotation.set(rotation.get() + velocityRef.current * dt);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [spins, rotation]);

  /**
   * Resuming is DEBOUNCED, and that is the whole trick.
   *
   * Hovering a face pauses the ring, but the face the pointer is on is itself
   * moving: between the pointer arriving and the pause taking effect on the
   * next frame, the avatar slides out from under a stationary cursor and fires
   * `pointerleave`. Resuming there produced a perfect flicker -- enter, pause,
   * leave, resume, enter -- and the ring never actually stopped. Measured as
   * exactly `enter:Sofia, leave:Sofia` with the ring still turning.
   *
   * So a leave only counts if no other face has claimed the pointer shortly
   * after. Crossing between two adjacent avatars, or a face slipping out from
   * under the cursor, both land inside the window and the ring stays put.
   */
  const resumeTimerRef = useRef<number | null>(null);

  const holdForHover = useCallback(() => {
    if (resumeTimerRef.current) {
      window.clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
    pausedRef.current = true;
    velocityRef.current = 0;
  }, []);

  const releaseFromHover = useCallback(() => {
    if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => {
      pausedRef.current = false;
      resumeTimerRef.current = null;
    }, HOVER_RESUME_DELAY_MS);
  }, []);

  useEffect(
    () => () => {
      if (resumeTimerRef.current) window.clearTimeout(resumeTimerRef.current);
    },
    [],
  );

  const handleDragStart = useCallback(() => {
    draggingRef.current = true;
    setDragging(true);
    velocityRef.current = 0;
  }, []);

  /**
   * Pointer delta → ring angle, measured about the CENTRE. Using the X delta
   * alone would make the ring feel wrong on its left-hand side, where dragging
   * right should turn it the other way.
   */
  const handleDrag = useCallback(
    (_: unknown, info: PanInfo) => {
      const el = wrapRef.current;
      if (!el) return;
      const box = el.getBoundingClientRect();
      const cx = box.left + box.width / 2;
      const cy = box.top + box.height / 2;
      const { x, y } = info.point;
      const a1 = Math.atan2(y - info.delta.y - cy, x - info.delta.x - cx);
      const a2 = Math.atan2(y - cy, x - cx);
      let deltaDeg = ((a2 - a1) * 180) / Math.PI;
      // Unwrap the ±180° seam so a drag across it does not jump a half-turn.
      if (deltaDeg > 180) deltaDeg -= 360;
      if (deltaDeg < -180) deltaDeg += 360;
      rotation.set(rotation.get() + deltaDeg);
    },
    [rotation],
  );

  const handleDragEnd = useCallback(
    (_: unknown, info: PanInfo) => {
      draggingRef.current = false;
      setDragging(false);
      if (!spins) return;
      const el = wrapRef.current;
      const box = el?.getBoundingClientRect();
      const radiusPx = box ? Math.max(1, box.width / 2) : RING_RADIUS;
      const speed = Math.hypot(info.velocity.x, info.velocity.y);
      if (speed < FLICK_MIN_VELOCITY) {
        // A tap, not a throw. Leave the velocity alone so the loop eases back
        // to the drift on its own -- unless the pointer is still on a face, in
        // which case `pausedRef` keeps it exactly where the visitor put it.
        return;
      }
      const cx = box ? box.left + box.width / 2 : info.point.x;
      const cy = box ? box.top + box.height / 2 : info.point.y;
      // Cross product of radius and velocity gives the turn direction without
      // special-casing a quadrant, and scaling by the radius makes a flick at
      // the rim spin the ring more than one near the middle -- as a real wheel.
      const cross =
        (info.point.x - cx) * info.velocity.y - (info.point.y - cy) * info.velocity.x;
      const direction = cross >= 0 ? 1 : -1;
      velocityRef.current =
        direction * (speed / radiusPx) * (180 / Math.PI) * FLICK_POWER;
    },
    [spins],
  );

  // ── The floating name label ────────────────────────────────────────────────
  const [namedId, setNamedId] = useState<string | null>(null);
  const nameTimerRef = useRef<number | null>(null);

  const pick = useCallback(
    (item: LocationFeaturedPreview) => {
      // A drag that happens to end on an avatar must not read as a tap.
      if (draggingRef.current) return;
      setNamedId(item.talentId);
      onSelect?.(item);
      if (nameTimerRef.current) window.clearTimeout(nameTimerRef.current);
      nameTimerRef.current = window.setTimeout(() => {
        // Only the LABEL expires. The parent keeps the profile link up.
        setNamedId(null);
        nameTimerRef.current = null;
      }, NAME_VISIBLE_MS);
    },
    [onSelect],
  );

  useEffect(
    () => () => {
      if (nameTimerRef.current) window.clearTimeout(nameTimerRef.current);
    },
    [],
  );

  return (
    <motion.div
      role="region"
      aria-label={copy.mapPinPreviewAria.replace("{city}", locationLabel)}
      initial={{ scale: 0.88 }}
      animate={{ scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      style={{ width: ORBIT_AREA, height: ORBIT_AREA }}
      className="relative"
    >
      {/* Track ring */}
      <div
        aria-hidden
        className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          width: RING_RADIUS * 2,
          height: RING_RADIUS * 2,
          border: "1px solid rgba(201,162,39,0.13)",
        }}
      />

      {/* Rotating wrapper. `pointerEvents:auto` only here, so the ring is
          throwable without the whole 276px box swallowing map gestures. */}
      <motion.div
        ref={wrapRef}
        className="absolute inset-0 flex items-center justify-center"
        style={{
          rotate: rotation,
          pointerEvents: spins ? "auto" : "none",
          cursor: spins ? (dragging ? "grabbing" : "grab") : "default",
          touchAction: "none",
        }}
        drag={spins}
        dragMomentum={false}
        // The ring turns in place: framer's own x/y drag is pinned off and the
        // angle is integrated by hand in `handleDrag`.
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragElastic={0}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      >
        {items.map((item, i) => (
          <OrbitAvatar
            key={item.talentId}
            item={item}
            index={i}
            total={Math.max(n, 1)}
            rotation={rotation}
            copy={copy}
            reduceMotion={Boolean(reduceMotion) || !mounted}
            showName={namedId === item.talentId}
            selected={selectedTalentId === item.talentId}
            onPick={pick}
            onHoldStart={holdForHover}
            onHoldEnd={releaseFromHover}
          />
        ))}
      </motion.div>

      {/* Pulsing centre dot */}
      <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <motion.div
          className="size-2.5 rounded-full bg-[var(--impronta-gold)]/50"
          animate={reduceMotion ? {} : { scale: [1, 1.8, 1], opacity: [0.5, 0.1, 0.5] }}
          transition={{ duration: 2.4, repeat: Infinity, ease: "easeInOut" }}
        />
      </div>
    </motion.div>
  );
}

/**
 * One face on the ring.
 *
 * The counter-rotation is the whole trick: `-rotation` cancels the wrapper's
 * angle so the face stays level no matter where on the circle it is. The sway
 * is added on top and hangs from the avatar's top edge, which is what makes the
 * weight read as being in the body rather than the head.
 */
function OrbitAvatar({
  item,
  index,
  total,
  rotation,
  copy,
  reduceMotion,
  showName,
  selected,
  onPick,
  onHoldStart,
  onHoldEnd,
}: {
  item: LocationFeaturedPreview;
  index: number;
  total: number;
  rotation: ReturnType<typeof useMotionValue<number>>;
  copy: LocationSectionCopy;
  reduceMotion: boolean;
  showName: boolean;
  selected: boolean;
  onPick: (item: LocationFeaturedPreview) => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}) {
  const angle = (2 * Math.PI * index) / total - Math.PI / 2;
  // Rounded, and not for tidiness: React serialises `-93.54998149518619` on the
  // client against the server's `-93.55px` and calls that a hydration mismatch.
  // Two decimals is far finer than a device pixel and identical on both sides.
  const round2 = (v: number) => Math.round(v * 100) / 100;
  const x = round2(Math.cos(angle) * RING_RADIUS);
  const y = round2(Math.sin(angle) * RING_RADIUS);

  /** Exactly undoes the ring's rotation, so the face never tips over. */
  const upright = useTransform(rotation, (r) => (reduceMotion ? 0 : -r));

  // The sway rides on the ring's own angle rather than on wall-clock time, so a
  // ring that has been thrown sways faster while it is moving fast and settles
  // as it slows -- momentum you can see in the faces, not just in the orbit.
  const swayPhase = (index / Math.max(total, 1)) * Math.PI * 2;
  const sway = useTransform(rotation, (r) => {
    if (reduceMotion) return 0;
    const t = (r / 360) * (ORBIT_DURATION_SEC / BALANCE_PERIOD_SEC) * Math.PI * 2;
    return Math.sin(t + swayPhase) * BALANCE_TILT_DEG;
  });

  return (
    // Position + counter-rotation ONLY. An `initial`/`animate` pair here fought
    // the `rotate` motion value for the same transform and lost: every avatar
    // stayed at the initial opacity 0 / scale 0.3 and the ring rendered empty.
    // The container already scales in, so the per-avatar stagger is not worth
    // reintroducing that conflict for.
    <motion.div
      className="absolute"
      style={{
        left: "50%",
        top: "50%",
        marginLeft: round2(-AVATAR_SIZE / 2 + x),
        marginTop: round2(-AVATAR_SIZE / 2 + y),
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        rotate: upright,
      }}
    >
      {/* The pendant. Separate from the upright layer so the sway hangs from the
          top edge without disturbing the counter-rotation above it. */}
      <motion.button
        type="button"
        onPointerUp={() => onPick(item)}
        // `onHoverStart`/`onHoverEnd`, NOT onPointerEnter/onPointerLeave: a
        // `motion.button` consumes the React pointer props for its own gesture
        // system and never forwards them to the DOM. A native listener on the
        // same node fires; the React prop does not. Measured -- the hover pause
        // silently did nothing until this changed.
        onHoverStart={onHoldStart}
        onHoverEnd={onHoldEnd}
        onFocus={onHoldStart}
        onBlur={onHoldEnd}
        aria-label={item.name ?? copy.mapPinPreviewPhotoAlt}
        className="block overflow-hidden rounded-full border-2 bg-zinc-900"
        style={{
          width: AVATAR_SIZE,
          height: AVATAR_SIZE,
          rotate: sway,
          transformOrigin: "50% 0%",
          borderColor: selected
            ? "var(--impronta-gold)"
            : "rgba(201,162,39,0.7)",
          boxShadow: selected
            ? "0 4px 22px rgba(0,0,0,0.9), 0 0 0 2px var(--impronta-gold), 0 0 18px rgba(201,162,39,0.55)"
            : "0 4px 20px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.5)",
          cursor: "pointer",
        }}
      >
        {item.thumbnailUrl ? (
          <Image
            src={item.thumbnailUrl}
            alt={item.name ?? copy.mapPinPreviewPhotoAlt}
            width={AVATAR_SIZE}
            height={AVATAR_SIZE}
            className="size-full object-cover"
            sizes={`${AVATAR_SIZE}px`}
            draggable={false}
          />
        ) : (
          <div className="flex size-full items-center justify-center bg-zinc-800" aria-hidden>
            <div className="size-4 rounded-full bg-zinc-700" />
          </div>
        )}
      </motion.button>

      {/* Floating name. Sits on the upright layer, so it travels with the face
          and stays readable wherever on the circle that face happens to be. */}
      {item.name ? (
        <motion.span
          aria-hidden
          initial={false}
          animate={{ opacity: showName ? 1 : 0 }}
          transition={{ duration: showName ? 0.18 : 0.6 }}
          className="pointer-events-none absolute whitespace-nowrap rounded-full px-2 py-0.5 text-[10px] font-semibold"
          style={{
            left: AVATAR_SIZE + 6,
            top: AVATAR_SIZE / 2 - 9,
            letterSpacing: "0.08em",
            color: "var(--impronta-gold)",
            background: "rgba(0,0,0,0.72)",
            textShadow: "0 1px 6px rgba(0,0,0,1)",
          }}
        >
          {item.name}
        </motion.span>
      ) : null}
    </motion.div>
  );
}
