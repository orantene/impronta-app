"use client";

/**
 * FlyingAvatar — the body-portal clone that arcs from a directory card photo to
 * the launcher pill when a talent is added to the cart (plan §4.A.5).
 *
 * Renders into <body> at a very high z-index (FLY_CLONE_Z) so it floats over the
 * directory grid, the launcher, and any open panel. On mount it runs the Web
 * Animations API arc (520ms, eased, with a lifted apex + scale 64→36 + fade-in),
 * then calls onDone so the host clears the flight and the REAL rail avatar's
 * landing bounce takes over (the clone unmounts the instant the rail avatar
 * mounts — no double image).
 *
 * Reduced motion is handled UPSTREAM in useFlyToRail (no flight is produced), so
 * this component never even mounts under prefers-reduced-motion. It is purely a
 * presentational, self-contained clone: it reads ONLY its `flight` prop.
 *
 * Usage (host, e.g. the launcher):
 *   const launcherRef = useRef<HTMLButtonElement>(null);
 *   const { flight, onFlightDone } = useFlyToRail(launcherRef);
 *   return <FlyingAvatar flight={flight} onDone={onFlightDone} />;
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { FlightState } from "./use-fly-to-rail";
import {
  AVATAR_DIAMETER_DESKTOP,
  AVATAR_GROUND,
  FACE_OBJECT_POSITION,
  FLY_ARC_APEX_PX,
  FLY_CLONE_Z,
  FLY_DURATION_MS,
  FLY_EASING,
  FLY_START_DIAMETER,
  PERSON_SILHOUETTE_SVG,
} from "./use-fly-to-rail-consts";

export type FlyingAvatarProps = {
  /** The active flight (from useFlyToRail), or null when idle. */
  flight: FlightState | null;
  /** Called when the flight animation finishes (clears the flight upstream). */
  onDone: () => void;
};

export function FlyingAvatar({ flight, onDone }: FlyingAvatarProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted || !flight) return null;
  return createPortal(
    <FlyingClone key={flight.key} flight={flight} onDone={onDone} />,
    document.body,
  );
}

function FlyingClone({
  flight,
  onDone,
}: {
  flight: FlightState;
  onDone: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const dx = flight.to.x - flight.from.x;
    const dy = flight.to.y - flight.from.y;
    const startScale = FLY_START_DIAMETER / AVATAR_DIAMETER_DESKTOP; // 64 → 36
    const endScale = 1;

    // Arc: lift the midpoint above the straight-line interpolation by the apex,
    // and scale 64 → 36 while fading in by offset 0.08 (§4.A.5).
    let anim: Animation | null = null;
    try {
      anim = el.animate(
        [
          { transform: `translate(0px, 0px) scale(${startScale})`, opacity: 0 },
          { opacity: 1, offset: 0.08 },
          {
            transform: `translate(${dx / 2}px, ${dy / 2 + FLY_ARC_APEX_PX}px) scale(${
              (startScale + endScale) / 2
            })`,
            offset: 0.5,
          },
          {
            transform: `translate(${dx}px, ${dy}px) scale(${endScale})`,
            opacity: 1,
          },
        ],
        {
          duration: FLY_DURATION_MS,
          easing: FLY_EASING,
          fill: "forwards",
        },
      );
    } catch {
      // WAAPI unavailable (very old engine) → skip straight to done.
      onDone();
      return;
    }

    const finish = () => onDone();
    anim.addEventListener("finish", finish);
    anim.addEventListener("cancel", finish);
    return () => {
      anim?.removeEventListener("finish", finish);
      anim?.removeEventListener("cancel", finish);
      anim?.cancel();
    };
  }, [flight, onDone]);

  const showImage = Boolean(flight.portraitUrl);

  return (
    <div
      ref={ref}
      aria-hidden="true"
      style={{
        position: "fixed",
        // The translate is relative to this origin; place it at the card center
        // and offset by half a (36px) avatar so scale pivots around the center.
        left: flight.from.x - AVATAR_DIAMETER_DESKTOP / 2,
        top: flight.from.y - AVATAR_DIAMETER_DESKTOP / 2,
        width: AVATAR_DIAMETER_DESKTOP,
        height: AVATAR_DIAMETER_DESKTOP,
        borderRadius: "50%",
        overflow: "hidden",
        background: showImage ? AVATAR_GROUND : "#33507a",
        color: "#ffffff",
        border: "1.5px solid #ffffff",
        boxShadow:
          "0 0 0 2px rgba(20,24,31,0.85), 0 8px 20px -6px rgba(20,24,31,0.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        font: "600 13px -apple-system, BlinkMacSystemFont, sans-serif",
        pointerEvents: "none",
        zIndex: FLY_CLONE_Z,
        willChange: "transform, opacity",
      }}
    >
      {showImage ? (
        <img
          src={flight.portraitUrl ?? undefined}
          alt=""
          decoding="async"
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
            color: "rgba(255,255,255,0.85)",
          }}
          dangerouslySetInnerHTML={{ __html: PERSON_SILHOUETTE_SVG }}
        />
      )}
    </div>
  );
}
