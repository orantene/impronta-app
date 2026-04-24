"use client";

/**
 * Wireframe SVGs for the starter picker and composition library.
 *
 * Shown above each tile so the operator can read the layout shape at a
 * glance without parsing a list of slot names. The wireframes are
 * intentionally schematic — thin rules, muted fills, no type — because
 * a detailed thumbnail would over-promise a visual that's actually still
 * styled by the tenant's brand tokens at publish time.
 */

interface WireProps {
  className?: string;
}

/** Shared <svg> wrapper with consistent viewBox, stroke, and fill tokens. */
function WireFrame({
  title,
  children,
  className,
}: {
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 200 110"
      role="img"
      aria-label={title}
      preserveAspectRatio="xMidYMid meet"
      className={className ?? "h-20 w-full text-zinc-400"}
    >
      <rect
        x="1"
        y="1"
        width="198"
        height="108"
        rx="6"
        fill="currentColor"
        fillOpacity="0.04"
        stroke="currentColor"
        strokeOpacity="0.28"
        strokeWidth="1"
      />
      {children}
    </svg>
  );
}

// ── starter wireframes ────────────────────────────────────────────────────

/** Editorial Bridal — 9 sections, varied shapes, image-forward. */
export function WireEditorial({ className }: WireProps) {
  return (
    <WireFrame title="Editorial wireframe" className={className}>
      {/* hero with photo band */}
      <rect x="10" y="8" width="180" height="26" rx="3" fill="currentColor" fillOpacity="0.16" />
      {/* trust band */}
      <g fill="currentColor" fillOpacity="0.3">
        <rect x="10" y="40" width="40" height="3" rx="1" />
        <rect x="55" y="40" width="40" height="3" rx="1" />
        <rect x="100" y="40" width="40" height="3" rx="1" />
        <rect x="145" y="40" width="40" height="3" rx="1" />
      </g>
      {/* services grid */}
      <g fill="currentColor" fillOpacity="0.1">
        <rect x="10" y="50" width="56" height="18" rx="2" />
        <rect x="72" y="50" width="56" height="18" rx="2" />
        <rect x="134" y="50" width="56" height="18" rx="2" />
      </g>
      {/* featured strip */}
      <g fill="currentColor" fillOpacity="0.14">
        <rect x="10" y="73" width="28" height="18" rx="2" />
        <rect x="41" y="73" width="28" height="18" rx="2" />
        <rect x="72" y="73" width="28" height="18" rx="2" />
        <rect x="103" y="73" width="28" height="18" rx="2" />
        <rect x="134" y="73" width="28" height="18" rx="2" />
        <rect x="165" y="73" width="25" height="18" rx="2" />
      </g>
      {/* cta bar */}
      <rect x="10" y="96" width="180" height="8" rx="2" fill="currentColor" fillOpacity="0.22" />
    </WireFrame>
  );
}

/** Classic — 4 sections, lean layout. */
export function WireClassic({ className }: WireProps) {
  return (
    <WireFrame title="Classic wireframe" className={className}>
      <rect x="10" y="8" width="180" height="30" rx="3" fill="currentColor" fillOpacity="0.16" />
      <g fill="currentColor" fillOpacity="0.1">
        <rect x="10" y="44" width="87" height="20" rx="2" />
        <rect x="103" y="44" width="87" height="20" rx="2" />
      </g>
      <g fill="currentColor" fillOpacity="0.14">
        <rect x="10" y="69" width="43" height="24" rx="2" />
        <rect x="56" y="69" width="43" height="24" rx="2" />
        <rect x="102" y="69" width="43" height="24" rx="2" />
        <rect x="148" y="69" width="43" height="24" rx="2" />
      </g>
      <rect x="10" y="98" width="180" height="6" rx="2" fill="currentColor" fillOpacity="0.22" />
    </WireFrame>
  );
}

/** Studio Minimal — 4 sections, gallery-forward. */
export function WireStudioMinimal({ className }: WireProps) {
  return (
    <WireFrame title="Studio Minimal wireframe" className={className}>
      <rect x="10" y="8" width="180" height="22" rx="2" fill="currentColor" fillOpacity="0.12" />
      <g fill="currentColor" fillOpacity="0.08">
        <rect x="10" y="36" width="56" height="14" rx="2" />
        <rect x="72" y="36" width="56" height="14" rx="2" />
        <rect x="134" y="36" width="56" height="14" rx="2" />
      </g>
      {/* gallery strip — larger blocks */}
      <g fill="currentColor" fillOpacity="0.2">
        <rect x="10" y="55" width="58" height="38" rx="2" />
        <rect x="71" y="55" width="58" height="38" rx="2" />
        <rect x="132" y="55" width="58" height="38" rx="2" />
      </g>
      <rect x="10" y="98" width="180" height="6" rx="2" fill="currentColor" fillOpacity="0.22" />
    </WireFrame>
  );
}

// ── section-type wireframes ───────────────────────────────────────────────

const S_HERO = (
  <rect x="10" y="12" width="180" height="50" rx="3" fill="currentColor" fillOpacity="0.18" />
);

const S_STRIP = (
  <g fill="currentColor" fillOpacity="0.28">
    <rect x="10" y="48" width="40" height="3" rx="1" />
    <rect x="55" y="48" width="40" height="3" rx="1" />
    <rect x="100" y="48" width="40" height="3" rx="1" />
    <rect x="145" y="48" width="40" height="3" rx="1" />
  </g>
);

const S_GRID = (
  <g fill="currentColor" fillOpacity="0.14">
    <rect x="10" y="30" width="56" height="40" rx="2" />
    <rect x="72" y="30" width="56" height="40" rx="2" />
    <rect x="134" y="30" width="56" height="40" rx="2" />
  </g>
);

const S_GALLERY = (
  <g fill="currentColor" fillOpacity="0.22">
    <rect x="10" y="28" width="44" height="50" rx="2" />
    <rect x="58" y="28" width="44" height="50" rx="2" />
    <rect x="106" y="28" width="44" height="50" rx="2" />
    <rect x="154" y="28" width="36" height="50" rx="2" />
  </g>
);

const S_TESTIMONIALS = (
  <g fill="currentColor" fillOpacity="0.12">
    <rect x="10" y="30" width="56" height="40" rx="2" />
    <rect x="72" y="30" width="56" height="40" rx="2" />
    <rect x="134" y="30" width="56" height="40" rx="2" />
    {[24, 86, 148].map((x, i) => (
      <circle key={i} cx={x + 8} cy={38} r={4} fillOpacity="0.5" />
    ))}
  </g>
);

const S_CTA = (
  <>
    <rect x="10" y="28" width="180" height="54" rx="3" fill="currentColor" fillOpacity="0.12" />
    <rect x="70" y="52" width="60" height="10" rx="5" fill="currentColor" fillOpacity="0.32" />
  </>
);

const S_PROCESS = (
  <g>
    {[0, 1, 2, 3].map((i) => (
      <g key={i}>
        <circle
          cx={25 + i * 50}
          cy={44}
          r={8}
          fill="currentColor"
          fillOpacity="0.22"
        />
        <rect
          x={13 + i * 50}
          y={58}
          width={24}
          height={3}
          rx={1}
          fill="currentColor"
          fillOpacity="0.3"
        />
        {i < 3 ? (
          <line
            x1={33 + i * 50}
            y1={44}
            x2={67 + i * 50}
            y2={44}
            stroke="currentColor"
            strokeOpacity={0.25}
            strokeWidth={1}
          />
        ) : null}
      </g>
    ))}
  </g>
);

const S_DESTINATIONS = (
  <g fill="currentColor" fillOpacity="0.18">
    <rect x="10" y="28" width="70" height="54" rx="2" />
    <rect x="82" y="28" width="54" height="26" rx="2" />
    <rect x="82" y="56" width="54" height="26" rx="2" />
    <rect x="138" y="28" width="52" height="54" rx="2" />
  </g>
);

const S_FEATURED = (
  <g fill="currentColor" fillOpacity="0.14">
    <rect x="10" y="30" width="34" height="50" rx="2" />
    <rect x="46" y="30" width="34" height="50" rx="2" />
    <rect x="82" y="30" width="34" height="50" rx="2" />
    <rect x="118" y="30" width="34" height="50" rx="2" />
    <rect x="154" y="30" width="36" height="50" rx="2" />
  </g>
);

const S_FAQ = (
  <g fill="currentColor" fillOpacity="0.14">
    <rect x="10" y="20" width="180" height="14" rx="2" />
    <rect x="10" y="40" width="180" height="14" rx="2" />
    <rect x="10" y="60" width="180" height="14" rx="2" />
    <rect x="10" y="80" width="180" height="14" rx="2" />
  </g>
);

const S_BANNER = (
  <rect x="10" y="30" width="180" height="50" rx="3" fill="currentColor" fillOpacity="0.2" />
);

const SECTION_WIRES: Record<string, React.ReactNode> = {
  hero: S_HERO,
  trust_strip: S_STRIP,
  category_grid: S_GRID,
  featured_talent: S_FEATURED,
  process_steps: S_PROCESS,
  destinations_mosaic: S_DESTINATIONS,
  gallery_strip: S_GALLERY,
  testimonials_trio: S_TESTIMONIALS,
  cta_banner: S_CTA,
  faq_stack: S_FAQ,
  banner: S_BANNER,
};

/** Fallback rectangle for section types without a dedicated wireframe. */
const S_DEFAULT = (
  <rect x="10" y="28" width="180" height="54" rx="3" fill="currentColor" fillOpacity="0.1" />
);

export function SectionWire({
  typeKey,
  className,
}: {
  typeKey: string;
  className?: string;
}) {
  const content = SECTION_WIRES[typeKey] ?? S_DEFAULT;
  return (
    <WireFrame title={`${typeKey} wireframe`} className={className}>
      {content}
    </WireFrame>
  );
}
