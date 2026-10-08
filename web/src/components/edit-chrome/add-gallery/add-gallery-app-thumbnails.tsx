"use client";

/**
 * Apps tab card thumbnails, keyed by `AddGalleryItem.appThumbnail` (set from
 * `apps-registry.ts`). Static SVG wireframes in the gallery's own purple tint,
 * so the Apps tab previews what each app IS without running it.
 */
import type { ReactNode } from "react";

function NailDesignerThumb() {
  // Five fingers, each with a shaped, differently-finished nail.
  const fingers = [
    { x: 14, h: 34, nail: "french" },
    { x: 36, h: 44, nail: "solid" },
    { x: 58, h: 50, nail: "dots" },
    { x: 80, h: 44, nail: "stripes" },
  ];
  return (
    <svg viewBox="0 0 120 64" className="size-full" aria-hidden="true">
      <rect x="10" y="44" width="82" height="20" rx="9" fill="currentColor" opacity="0.14" />
      {fingers.map((f) => (
        <g key={f.x}>
          <rect x={f.x} y={64 - f.h} width="16" height={f.h} rx="8" fill="currentColor" opacity="0.14" />
          <path
            d={`M${f.x + 2.5} ${64 - f.h + 13} V${64 - f.h + 6} Q${f.x + 8} ${64 - f.h - 3} ${f.x + 13.5} ${64 - f.h + 6} V${64 - f.h + 13} Z`}
            fill="currentColor"
            opacity={f.nail === "solid" ? 0.85 : 0.55}
          />
        </g>
      ))}
      <g transform="rotate(26 106 46)">
        <rect x="98" y="30" width="18" height="30" rx="9" fill="currentColor" opacity="0.14" />
        <path d="M100.5 40 V35 Q107 27 113.5 35 V40 Z" fill="currentColor" opacity="0.7" />
      </g>
      <circle cx="28" cy="20" r="2.4" fill="currentColor" opacity="0.9" />
    </svg>
  );
}

const THUMBNAILS: Record<string, () => ReactNode> = {
  "nail-designer": NailDesignerThumb,
};

export function AppThumbnail({ name }: { name: string | undefined }) {
  const Thumb = name ? THUMBNAILS[name] : undefined;
  if (!Thumb) return null;
  return <Thumb />;
}
