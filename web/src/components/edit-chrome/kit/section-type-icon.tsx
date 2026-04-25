/**
 * SectionTypeIcon — minimal SVG glyphs for each CMS section type.
 *
 * Used in three places that need to communicate section-kind at a glance:
 *   1. Floating canvas chip — "what kind of thing am I editing?"
 *   2. Inspector dock header — same identity tile
 *   3. Diff list rows in the Publish drawer + Revisions drawer
 *
 * Glyphs are wireframes that hint at the section's structure: three
 * columns for a trio, a hero block + bar for the hero, etc. They render
 * at any size against `currentColor` so the chip can pass white and the
 * dock can pass ink.
 *
 * Adding a section type? Add a key here. Unknown types fall back to a
 * generic block glyph so the chip is never empty.
 */

import type { ReactElement, SVGProps } from "react";

interface IconProps extends Omit<SVGProps<SVGSVGElement>, "size"> {
  size?: number;
}

function svgProps(size: number, p: SVGProps<SVGSVGElement>) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.4,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...p,
  };
}

function HeroIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="2" y="2" width="12" height="9" rx="1.2" />
      <path d="M5 6.5h6M6 8.5h4" />
      <rect
        x="6"
        y="12.5"
        width="4"
        height="1.4"
        rx="0.4"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function CategoryGridIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="2" y="2" width="5" height="5" rx="0.8" />
      <rect x="9" y="2" width="5" height="5" rx="0.8" />
      <rect x="2" y="9" width="5" height="5" rx="0.8" />
      <rect x="9" y="9" width="5" height="5" rx="0.8" />
    </svg>
  );
}

function CtaBannerIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="1.5" y="4.5" width="13" height="7" rx="1.2" />
      <path d="M4 8h4" />
      <rect
        x="9.5"
        y="6.5"
        width="3.5"
        height="3"
        rx="0.6"
        fill="currentColor"
        stroke="none"
      />
    </svg>
  );
}

function FeaturedTalentIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <circle cx="4" cy="6" r="2" />
      <path d="M1.5 13c.4-1.6 1.5-2.5 2.5-2.5s2.1.9 2.5 2.5" />
      <circle cx="12" cy="6" r="2" />
      <path d="M9.5 13c.4-1.6 1.5-2.5 2.5-2.5s2.1.9 2.5 2.5" />
    </svg>
  );
}

function TestimonialsTrioIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="1" y="3" width="4.2" height="10" rx="0.8" />
      <rect x="5.9" y="3" width="4.2" height="10" rx="0.8" />
      <rect x="10.8" y="3" width="4.2" height="10" rx="0.8" />
      <path d="M2.6 6.5l1 1M7.5 6.5l1 1M12.4 6.5l1 1" />
    </svg>
  );
}

function GalleryStripIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="1.5" y="3" width="4" height="10" rx="0.6" />
      <rect x="6" y="3" width="4" height="6" rx="0.6" />
      <rect x="6" y="9.5" width="4" height="3.5" rx="0.6" />
      <rect x="10.5" y="3" width="4" height="10" rx="0.6" />
    </svg>
  );
}

function TrustStripIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <line x1="1" y1="8" x2="15" y2="8" strokeDasharray="0.5 1.4" />
      <circle cx="3.5" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="12.5" cy="8" r="1.2" />
    </svg>
  );
}

function ProcessStepsIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <circle cx="3" cy="8" r="1.6" />
      <circle cx="8" cy="8" r="1.6" />
      <circle cx="13" cy="8" r="1.6" />
      <path d="M4.6 8h1.8M9.6 8h1.8" />
    </svg>
  );
}

function ValuesTrioIcon({ size = 16, ...p }: IconProps): ReactElement {
  // Three small star-like glyphs in a row.
  const star = "M3 1l0.7 1.4L5.2 2.7l-1 1 .25 1.4L3 4.4l-1.45.7.25-1.4-1-1L2.3 2.4z";
  return (
    <svg {...svgProps(size, p)}>
      <g transform="translate(0.5 4)" fill="currentColor" stroke="none">
        <path d={star} />
      </g>
      <g transform="translate(5.5 4)" fill="currentColor" stroke="none">
        <path d={star} />
      </g>
      <g transform="translate(10.5 4)" fill="currentColor" stroke="none">
        <path d={star} />
      </g>
    </svg>
  );
}

function PressStripIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="1" y="6" width="3" height="4" rx="0.4" />
      <rect x="6" y="6" width="3" height="4" rx="0.4" />
      <rect x="11" y="6" width="3" height="4" rx="0.4" />
      <line x1="1" y1="13" x2="15" y2="13" />
    </svg>
  );
}

function DestinationsMosaicIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="1.5" y="2" width="6" height="6" rx="0.6" />
      <rect x="8.5" y="2" width="6" height="3" rx="0.6" />
      <rect x="8.5" y="6" width="6" height="2" rx="0.6" />
      <rect x="1.5" y="9" width="3" height="5" rx="0.6" />
      <rect x="5.5" y="9" width="9" height="5" rx="0.6" />
    </svg>
  );
}

function ImageCopyAlternatingIcon({
  size = 16,
  ...p
}: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="1" y="2.5" width="6" height="4" rx="0.6" />
      <path d="M9 3.5h5M9 5.5h4" />
      <path d="M2 11h4M2 13h3" />
      <rect x="9" y="9.5" width="6" height="4" rx="0.6" />
    </svg>
  );
}

function GenericBlockIcon({ size = 16, ...p }: IconProps): ReactElement {
  return (
    <svg {...svgProps(size, p)}>
      <rect x="2" y="3" width="12" height="10" rx="1.2" />
      <path d="M5 7h6M5 9h4" />
    </svg>
  );
}

const ICONS: Record<string, (p: IconProps) => ReactElement> = {
  hero: HeroIcon,
  category_grid: CategoryGridIcon,
  cta_banner: CtaBannerIcon,
  featured_talent: FeaturedTalentIcon,
  testimonials_trio: TestimonialsTrioIcon,
  gallery_strip: GalleryStripIcon,
  trust_strip: TrustStripIcon,
  process_steps: ProcessStepsIcon,
  values_trio: ValuesTrioIcon,
  press_strip: PressStripIcon,
  destinations_mosaic: DestinationsMosaicIcon,
  image_copy_alternating: ImageCopyAlternatingIcon,
};

interface SectionTypeIconProps extends IconProps {
  /** The section type key (e.g. "hero", "gallery_strip"). */
  typeKey: string | null | undefined;
}

export function SectionTypeIcon({
  typeKey,
  size = 16,
  ...rest
}: SectionTypeIconProps): ReactElement {
  const Icon = (typeKey && ICONS[typeKey]) || GenericBlockIcon;
  return <Icon size={size} {...rest} />;
}
