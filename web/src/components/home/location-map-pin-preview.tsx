"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import type { LocationFeaturedPreview, LocationSectionCopy } from "./location-section";

// ── Exported for portal pixel-offset maths ───────────────────────────────────
export const AVATAR_SIZE = 52;
export const RING_RADIUS = 78;
export const ORBIT_AREA = (RING_RADIUS + AVATAR_SIZE) * 2 + 8; // 276

const ORBIT_DURATION_SEC = 36;

type Props = {
  items: LocationFeaturedPreview[];
  copy: LocationSectionCopy;
  locationLabel: string;
};

/** Pure orbit ring — no text. City name + link are rendered as a top-bar by the portal. */
export function LocationMapPinPreview({ items, copy, locationLabel }: Props) {
  const reduceMotion = useReducedMotion();
  const n = items.length;
  const orbit = !reduceMotion && n > 1;

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

      {/* Rotating wrapper */}
      <motion.div
        className="absolute inset-0 flex items-center justify-center"
        animate={orbit ? { rotate: 360 } : false}
        transition={
          orbit
            ? { repeat: Infinity, ease: "linear", duration: ORBIT_DURATION_SEC }
            : undefined
        }
      >
        {items.map((item, i) => {
          const angle = (2 * Math.PI * i) / Math.max(n, 1) - Math.PI / 2;
          const x = Math.cos(angle) * RING_RADIUS;
          const y = Math.sin(angle) * RING_RADIUS;
          return (
            <motion.div
              key={item.talentId}
              className="absolute overflow-hidden rounded-full border-2 border-[var(--impronta-gold)]/70 bg-zinc-900"
              style={{
                width: AVATAR_SIZE,
                height: AVATAR_SIZE,
                left: "50%",
                top: "50%",
                marginLeft: -AVATAR_SIZE / 2 + x,
                marginTop: -AVATAR_SIZE / 2 + y,
                boxShadow: "0 4px 20px rgba(0,0,0,0.85), 0 0 0 1px rgba(0,0,0,0.5)",
              }}
              initial={{ opacity: 0, scale: 0.3 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{
                opacity: { duration: 0.2, delay: i * 0.07 },
                scale: { duration: 0.38, delay: i * 0.07, ease: [0.16, 1, 0.3, 1] },
              }}
            >
              {item.thumbnailUrl ? (
                <Image
                  src={item.thumbnailUrl}
                  alt={copy.mapPinPreviewPhotoAlt}
                  width={AVATAR_SIZE}
                  height={AVATAR_SIZE}
                  className="size-full object-cover"
                  sizes={`${AVATAR_SIZE}px`}
                />
              ) : (
                <div className="flex size-full items-center justify-center bg-zinc-800" aria-hidden>
                  <div className="size-4 rounded-full bg-zinc-700" />
                </div>
              )}
            </motion.div>
          );
        })}
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
