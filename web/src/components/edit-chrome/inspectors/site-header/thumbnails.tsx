/**
 * Mini-mockups for the SiteHeaderInspector chip groups.
 *
 * Every chip in the inspector shows a small visual preview alongside its
 * label so operators don't have to translate "split-around-logo" or
 * "espresso-column" from text alone. Each thumbnail is ~80×40px,
 * monochromatic with restrained contrast, and uses the warm-paper
 * palette so it sits comfortably inside the editor chrome.
 *
 * Design rules:
 *   - Background lozenge: soft warm tone, 4px radius
 *   - Brand glyph: solid, ink/700
 *   - Nav indicators: short bars, 500-tone
 *   - Utility cluster: 2-3 small dots/circles, 400-tone
 *   - CTA: filled rounded rectangle, indigo-accent on active state only
 *
 * Each component takes no props; the chip group's outer wrapper supplies
 * active/hover styling.
 */

const VB = "0 0 80 40"; // shared viewbox; keeps stroke widths consistent

const STYLES = {
  bg: "fill-stone-100",
  ink: "fill-stone-700",
  mute: "fill-stone-400",
  pale: "fill-stone-300",
  accent: "fill-indigo-400",
};

// ── BRAND LAYOUT ────────────────────────────────────────────────────────

export function BrandLayoutThumb_Inline() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className={STYLES.bg} />
      {/* mark */}
      <rect x="22" y="17" width="6" height="6" rx="1" className={STYLES.ink} />
      {/* text */}
      <rect x="32" y="18" width="26" height="4" rx="1" className={STYLES.ink} />
    </svg>
  );
}

export function BrandLayoutThumb_Stacked() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className={STYLES.bg} />
      <rect x="36" y="11" width="8" height="8" rx="1" className={STYLES.ink} />
      <rect x="28" y="23" width="24" height="4" rx="1" className={STYLES.ink} />
    </svg>
  );
}

export function BrandLayoutThumb_LogoOnly() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className={STYLES.bg} />
      <rect x="34" y="14" width="12" height="12" rx="2" className={STYLES.ink} />
    </svg>
  );
}

export function BrandLayoutThumb_TextOnly() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className={STYLES.bg} />
      <rect x="22" y="18" width="36" height="4" rx="1" className={STYLES.ink} />
    </svg>
  );
}

// ── NAV ALIGNMENT ────────────────────────────────────────────────────────
// Each thumb: search dot left, brand center, utility dots right.
// Nav bars are positioned per alignment.

function NavBar({ x, w, fill = STYLES.mute }: { x: number; w: number; fill?: string }) {
  return <rect x={x} y="18" width={w} height="3" rx="1" className={fill} />;
}

function HeaderFrame() {
  return <rect x="0" y="0" width="80" height="40" rx="4" className={STYLES.bg} />;
}

function HeaderUtilities() {
  return (
    <>
      <circle cx="64" cy="20" r="1.5" className={STYLES.pale} />
      <circle cx="69" cy="20" r="1.5" className={STYLES.pale} />
      <circle cx="74" cy="20" r="1.5" className={STYLES.pale} />
    </>
  );
}

function HeaderSearch() {
  return <circle cx="6" cy="20" r="1.6" className={STYLES.pale} />;
}

function HeaderBrandDot({ cx = 40 }: { cx?: number }) {
  return <rect x={cx - 4} y="17" width="8" height="6" rx="1" className={STYLES.ink} />;
}

// ── BRAND POSITION ──────────────────────────────────────────────────────
// Where the logo + label anchors in the bar — independent of nav.

export function BrandPositionThumb_Left() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot cx={14} />
      <HeaderUtilities />
    </svg>
  );
}

export function BrandPositionThumb_Center() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot cx={40} />
      <HeaderUtilities />
    </svg>
  );
}

export function BrandPositionThumb_Right() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot cx={56} />
      <HeaderUtilities />
    </svg>
  );
}

export function NavAlignThumb_Left() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <NavBar x={11} w={6} />
      <NavBar x={19} w={6} />
      <HeaderBrandDot />
      <HeaderUtilities />
    </svg>
  );
}

export function NavAlignThumb_Center() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot cx={26} />
      <NavBar x={34} w={6} />
      <NavBar x={42} w={6} />
      <NavBar x={50} w={6} />
      <HeaderUtilities />
    </svg>
  );
}

export function NavAlignThumb_Right() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot cx={20} />
      <NavBar x={38} w={6} />
      <NavBar x={46} w={6} />
      <NavBar x={54} w={6} />
      <HeaderUtilities />
    </svg>
  );
}

export function NavAlignThumb_Split() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <NavBar x={12} w={6} />
      <NavBar x={20} w={6} />
      <HeaderBrandDot />
      <NavBar x={50} w={6} />
      <HeaderUtilities />
    </svg>
  );
}

// ── CTA PLACEMENT ────────────────────────────────────────────────────────

function CtaPill({ x, accent }: { x: number; accent?: boolean }) {
  return (
    <rect
      x={x}
      y="15"
      width="14"
      height="10"
      rx="2"
      className={accent ? STYLES.accent : STYLES.ink}
    />
  );
}

export function CtaPlacementThumb_Right() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot />
      <CtaPill x={54} accent />
      <circle cx="74" cy="20" r="1.5" className={STYLES.pale} />
    </svg>
  );
}

export function CtaPlacementThumb_InsideMenuOnly() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot />
      <HeaderUtilities />
      {/* small "inside menu" indicator */}
      <rect x="48" y="11" width="4" height="2" rx="0.5" className={STYLES.accent} />
      <rect x="48" y="15" width="4" height="2" rx="0.5" className={STYLES.accent} />
      <rect x="48" y="19" width="4" height="2" rx="0.5" className={STYLES.accent} />
    </svg>
  );
}

export function CtaPlacementThumb_Both() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot cx={32} />
      <CtaPill x={48} accent />
      <HeaderUtilities />
    </svg>
  );
}

export function CtaPlacementThumb_Hidden() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <HeaderFrame />
      <HeaderSearch />
      <HeaderBrandDot />
      <HeaderUtilities />
    </svg>
  );
}

// ── HEADER VARIANT ────────────────────────────────────────────────────────

export function HeaderVariantThumb_Classic() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className="fill-white" />
      <rect x="0" y="0" width="80" height="14" className={STYLES.bg} />
      <HeaderBrandDot />
      <HeaderUtilities />
    </svg>
  );
}

export function HeaderVariantThumb_EditorialSticky() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className="fill-stone-50" />
      <rect x="0" y="0" width="80" height="14" className="fill-stone-200/70" />
      <HeaderBrandDot />
      <HeaderUtilities />
    </svg>
  );
}

export function HeaderVariantThumb_Espresso() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className="fill-stone-100" />
      <rect x="0" y="0" width="80" height="14" className="fill-[#2d2623]" />
      <rect x="36" y="6" width="8" height="2" rx="0.5" className="fill-stone-200" />
      <circle cx="64" cy="7" r="1.2" className="fill-stone-300" />
      <circle cx="69" cy="7" r="1.2" className="fill-stone-300" />
      <circle cx="74" cy="7" r="1.2" className="fill-stone-300" />
    </svg>
  );
}

export function HeaderVariantThumb_CenteredEditorial() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className={STYLES.bg} />
      <rect x="32" y="10" width="16" height="6" rx="1" className={STYLES.ink} />
      <rect x="14" y="22" width="6" height="2" rx="0.5" className={STYLES.mute} />
      <rect x="22" y="22" width="6" height="2" rx="0.5" className={STYLES.mute} />
      <rect x="52" y="22" width="6" height="2" rx="0.5" className={STYLES.mute} />
      <rect x="60" y="22" width="6" height="2" rx="0.5" className={STYLES.mute} />
    </svg>
  );
}

export function HeaderVariantThumb_Minimal() {
  return (
    <svg viewBox={VB} className="h-9 w-[72px]" aria-hidden>
      <rect x="0" y="0" width="80" height="40" rx="4" className="fill-white" />
      <rect x="0" y="11" width="80" height="0.5" className="fill-stone-200" />
      <rect x="36" y="18" width="8" height="3" rx="0.5" className={STYLES.ink} />
    </svg>
  );
}

// ── MOBILE NAV VARIANT ─────────────────────────────────────────────────

function PhoneFrame() {
  return (
    <>
      <rect x="22" y="2" width="36" height="36" rx="4" className="fill-stone-100" />
      <rect x="22" y="2" width="36" height="6" rx="2" className={STYLES.bg} />
    </>
  );
}

export function MobileNavThumb_DrawerRight() {
  return (
    <svg viewBox={VB} className="h-10 w-[72px]" aria-hidden>
      <PhoneFrame />
      {/* drawer slid in from the right */}
      <rect x="40" y="2" width="18" height="36" rx="3" className="fill-white" />
      <rect x="44" y="14" width="10" height="2" rx="0.5" className={STYLES.mute} />
      <rect x="44" y="19" width="10" height="2" rx="0.5" className={STYLES.mute} />
      <rect x="44" y="24" width="10" height="2" rx="0.5" className={STYLES.mute} />
    </svg>
  );
}

export function MobileNavThumb_SheetBottom() {
  return (
    <svg viewBox={VB} className="h-10 w-[72px]" aria-hidden>
      <PhoneFrame />
      {/* sheet slid up from the bottom */}
      <rect x="22" y="22" width="36" height="16" rx="3" className="fill-white" />
      <rect x="36" y="25" width="8" height="1.5" rx="0.5" className="fill-stone-300" />
      <rect x="28" y="30" width="24" height="2" rx="0.5" className={STYLES.mute} />
      <rect x="28" y="34" width="20" height="2" rx="0.5" className={STYLES.mute} />
    </svg>
  );
}

export function MobileNavThumb_FullScreen() {
  return (
    <svg viewBox={VB} className="h-10 w-[72px]" aria-hidden>
      <PhoneFrame />
      {/* full-screen overlay */}
      <rect x="22" y="2" width="36" height="36" rx="4" className="fill-white" />
      <rect x="28" y="12" width="24" height="3" rx="0.5" className={STYLES.ink} />
      <rect x="28" y="18" width="24" height="3" rx="0.5" className={STYLES.ink} />
      <rect x="28" y="24" width="24" height="3" rx="0.5" className={STYLES.ink} />
      <rect x="28" y="30" width="16" height="3" rx="0.5" className={STYLES.ink} />
    </svg>
  );
}
