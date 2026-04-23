/**
 * Elegant line icons — thin stroke, generous negative space, 24px canvas.
 *
 * Future systemization (Theme → Icon Family):
 *   - `editorial-line` (this set): 1.25–1.5px strokes, rounded caps.
 *   - `geometric-sans`: for modern SaaS-ish brands.
 *   - `botanical`: floral variants for wellness brands.
 *
 * Deliberately not pulled from `lucide-react` so the stroke weight and
 * sparkle accents fit the bridal feel without overriding a dependency.
 */

type IconProps = {
  size?: number;
  stroke?: number;
  className?: string;
};

const base = (size = 28, stroke = 1.4) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: stroke,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

export function IconBouquet({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M12 4.5c1.2 1.1 1.2 3.4 0 4.5-1.2-1.1-1.2-3.4 0-4.5Z" />
      <path d="M8 6.5c1.6.3 2.6 1.8 2.4 3.5-1.6-.3-2.6-1.8-2.4-3.5Z" />
      <path d="M16 6.5c-1.6.3-2.6 1.8-2.4 3.5 1.6-.3 2.6-1.8 2.4-3.5Z" />
      <path d="M6 10c1.4.7 2.1 2.3 1.7 3.9-1.4-.7-2.1-2.3-1.7-3.9Z" />
      <path d="M18 10c-1.4.7-2.1 2.3-1.7 3.9 1.4-.7 2.1-2.3 1.7-3.9Z" />
      <path d="M12 10v10" />
      <path d="M9 20h6" />
    </svg>
  );
}

export function IconBrush({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M15 4l5 5-9.5 9.5a3 3 0 0 1-2.2.9H5v-3.3c0-.8.3-1.6.9-2.1L15 4Z" />
      <path d="M10 9l5 5" />
      <path d="M4 20c.6-1.4 1.8-2.1 3-2" />
    </svg>
  );
}

export function IconScissors({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <circle cx="6" cy="7" r="2.5" />
      <circle cx="6" cy="17" r="2.5" />
      <path d="M20 4 8.5 15.5" />
      <path d="M20 20 8.5 8.5" />
      <path d="m13.5 12 3.5 1.5" />
    </svg>
  );
}

export function IconCamera({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M4 8h3l2-2.5h6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" />
      <circle cx="12" cy="13" r="3.5" />
    </svg>
  );
}

export function IconFilm({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <rect x="3" y="5" width="18" height="14" rx="1.5" />
      <path d="M3 10h18M3 14h18M8 5v14M16 5v14" />
    </svg>
  );
}

export function IconClipboard({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1Z" />
      <rect x="5" y="6" width="14" height="15" rx="1.5" />
      <path d="M9 12h6M9 16h4" />
    </svg>
  );
}

export function IconFloral({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <circle cx="12" cy="11" r="2" />
      <path d="M12 9c0-2 1-3 2.5-3S17 7 17 9s-1 3-2.5 3" />
      <path d="M12 13c0 2-1 3-2.5 3S7 15 7 13s1-3 2.5-3" />
      <path d="M10 11c-2 0-3-1-3-2.5S8 6 10 6" />
      <path d="M14 11c2 0 3 1 3 2.5S16 16 14 16" />
      <path d="M12 13v8" />
      <path d="M9 21h6" />
    </svg>
  );
}

export function IconSparkle({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M12 3v5M12 16v5M3 12h5M16 12h5M6 6l3 3M15 15l3 3M18 6l-3 3M9 15l-3 3" />
    </svg>
  );
}

export function IconMusic({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M9 18V6l11-2v12" />
      <circle cx="7" cy="18" r="2.5" />
      <circle cx="18" cy="16" r="2.5" />
    </svg>
  );
}

export function IconPin({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M12 21s7-6.1 7-11a7 7 0 1 0-14 0c0 4.9 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}

export function IconCalendar({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="1.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconPlane({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M3 13 10 9l11-5-2.5 11L14 17l-2 4-2-5-7-3Z" />
    </svg>
  );
}

export function IconRing({ size, stroke, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="m9 4 3 2.5L15 4" />
      <circle cx="12" cy="15" r="5" />
    </svg>
  );
}

export function IconArrowRight({ size = 16, stroke = 1.4, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  );
}

export function IconQuote({ size = 32, stroke = 1.2, className }: IconProps) {
  return (
    <svg {...base(size, stroke)} className={className}>
      <path d="M7 17c-2 0-3-1.2-3-3.2 0-3 2-5.8 5-6.8l.5 1.5c-1.5.5-2.5 2-2.5 3.5H7c1.5 0 2.5 1 2.5 2.5S8.5 17 7 17Z" />
      <path d="M16.5 17c-2 0-3-1.2-3-3.2 0-3 2-5.8 5-6.8l.5 1.5c-1.5.5-2.5 2-2.5 3.5h.5c1.5 0 2.5 1 2.5 2.5s-1 2.5-3 2.5Z" />
    </svg>
  );
}
