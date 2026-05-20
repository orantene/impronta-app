/**
 * Phase 3 — section-renderer kit.
 *
 * Extracted layout primitives that ALL sections can compose with
 * instead of inlining their own layout CSS. Keeps cross-section
 * spacing / container width / reveal semantics consistent.
 *
 * Each primitive is a server component (no client deps) that emits
 * semantically-named DOM with classes the storefront stylesheet
 * targets. The primitives never touch presentation tokens directly —
 * those still go through `presentationDataAttrs` on the section root.
 *
 * Usage example inside a section Component:
 *
 *   <Container width="standard">
 *     <Stack gap="airy">
 *       <SectionHead eyebrow="…" headline="…" />
 *       <Grid cols={3}>{...children...}</Grid>
 *     </Stack>
 *   </Container>
 */

import type { ReactNode, CSSProperties } from "react";

// ── Container ───────────────────────────────────────────────────────────

export interface ContainerProps {
  width?: "narrow" | "standard" | "wide" | "editorial" | "full-bleed";
  className?: string;
  children?: ReactNode;
}

export function Container({ width = "standard", className, children }: ContainerProps) {
  const cls = `site-prim-container site-prim-container--${width}${className ? ` ${className}` : ""}`;
  return <div className={cls}>{children}</div>;
}

// ── FullBleed escape ────────────────────────────────────────────────────

export function FullBleed({ children, className }: { children?: ReactNode; className?: string }) {
  return (
    <div className={`site-prim-fullbleed${className ? ` ${className}` : ""}`}>
      {children}
    </div>
  );
}

// ── Stack (vertical flex with gap token) ────────────────────────────────

export interface StackProps {
  gap?: "tight" | "standard" | "airy";
  align?: "start" | "center" | "end";
  className?: string;
  children?: ReactNode;
  as?: "div" | "section" | "article" | "ol" | "ul";
}

export function Stack({ gap = "standard", align, className, children, as: As = "div" }: StackProps) {
  const cls = `site-prim-stack site-prim-stack--gap-${gap}${align ? ` site-prim-stack--align-${align}` : ""}${className ? ` ${className}` : ""}`;
  return <As className={cls}>{children}</As>;
}

// ── Grid (auto-responsive) ──────────────────────────────────────────────

export interface GridProps {
  cols?: 2 | 3 | 4 | 5 | 6;
  gap?: "tight" | "standard" | "airy";
  className?: string;
  children?: ReactNode;
}

export function Grid({ cols = 3, gap = "standard", className, children }: GridProps) {
  return (
    <div
      className={`site-prim-grid site-prim-grid--gap-${gap}${className ? ` ${className}` : ""}`}
      style={{ ["--prim-cols" as string]: String(cols) } as CSSProperties}
    >
      {children}
    </div>
  );
}

// ── AspectRatio ─────────────────────────────────────────────────────────

export function AspectRatio({
  ratio = "16/9",
  className,
  children,
}: {
  ratio?: string;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <div className={`site-prim-ratio${className ? ` ${className}` : ""}`} style={{ aspectRatio: ratio }}>
      {children}
    </div>
  );
}

// ── Reveal-on-scroll wrapper ────────────────────────────────────────────

export function Reveal({
  variant = "fade-up",
  delayMs = 0,
  children,
  className,
}: {
  variant?: "fade" | "fade-up" | "fade-down" | "fade-left" | "fade-right" | "zoom";
  delayMs?: number;
  children?: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-scroll-reveal={variant}
      data-scroll-reveal-delay={delayMs > 0 ? String(delayMs) : undefined}
      className={className}
      style={delayMs > 0 ? ({ ["--scroll-reveal-delay" as string]: `${delayMs}ms` } as CSSProperties) : undefined}
    >
      {children}
    </div>
  );
}

// ── SectionHead (eyebrow + headline + intro) ────────────────────────────

/**
 * Phase E — accepts ReactNode for eyebrow / headline / intro so callers
 * can pipe through `renderInlineRich(value)` and keep marker-styled spans
 * (italic blush accent, semantic bold/italic, link styling) without
 * converting to plain text first. The primitive remains a pure layout +
 * typographic-rhythm wrapper; per-section head CSS goes away.
 */

type ReactNodeType = ReactNode;

export interface SectionHeadProps {
  eyebrow?: ReactNodeType;
  headline?: ReactNodeType;
  intro?: ReactNodeType;
  align?: "start" | "center";
  className?: string;
  eyebrowBuilderNodeId?: string;
  headlineBuilderNodeId?: string;
  introBuilderNodeId?: string;
  eyebrowStyle?: CSSProperties;
  headlineStyle?: CSSProperties;
  introStyle?: CSSProperties;
}

export function SectionHead({
  eyebrow,
  headline,
  intro,
  align = "center",
  className,
  eyebrowBuilderNodeId,
  headlineBuilderNodeId,
  introBuilderNodeId,
  eyebrowStyle,
  headlineStyle,
  introStyle,
}: SectionHeadProps) {
  if (!eyebrow && !headline && !intro) return null;
  return (
    <header
      className={`site-prim-head${align === "center" ? " site-prim-head--center" : ""}${className ? ` ${className}` : ""}`}
    >
      {eyebrow ? (
        <span
          className="site-eyebrow"
          data-builder-node-id={eyebrowBuilderNodeId}
          style={eyebrowStyle}
        >
          {eyebrow}
        </span>
      ) : null}
      {headline ? (
        <h2
          className="site-prim-head__headline"
          data-builder-node-id={headlineBuilderNodeId}
          style={headlineStyle}
        >
          {headline}
        </h2>
      ) : null}
      {intro ? (
        <p
          className="site-prim-head__intro"
          data-builder-node-id={introBuilderNodeId}
          style={introStyle}
        >
          {intro}
        </p>
      ) : null}
    </header>
  );
}

// ── Cta (button-like link) ──────────────────────────────────────────────

/**
 * Phase E (Batch 2) — public-side CTA primitive.
 *
 * Three variants only — primary / secondary / ghost — per the ratified
 * scope cap. No fourth `text-link` variant in this phase. The visual
 * design is brand-token aware (uses `--token-color-primary`,
 * `--token-color-ink`, `--site-radius`, etc.) so each tenant's theme
 * propagates without per-section CSS overrides.
 *
 * The primitive is a single anchor — sections that want two CTAs
 * compose two `<Cta>` instances inside a `<div className="site-prim-ctas">`
 * (or any wrapper), keeping layout choices at the section level.
 *
 * Why a primitive: every section that has a CTA today rolls its own
 * `<a className="site-X__cta">` with subtly different focus rings, hover
 * states, padding, and typography. Phase E unifies all of these into a
 * single anchor shape with three deliberate variants.
 */

/**
 * P0-3 — variants extended to 5 (added `outline`, `text`). All token-driven
 * via `.site-prim-cta` CSS (no hardcoded brand colors). `primary/secondary/
 * ghost` keep their exact prior visuals so existing callers are unaffected.
 */
export type CtaVariant = "primary" | "secondary" | "outline" | "ghost" | "text";
export type CtaSize = "sm" | "md" | "lg";

export interface CtaProps {
  href: string;
  /** Visible label. */
  children: ReactNodeType;
  /** Defaults to "primary". */
  variant?: CtaVariant;
  /** Defaults to "md". */
  size?: CtaSize;
  /** Optional leading icon node (hidden while loading). */
  iconLeft?: ReactNodeType;
  /** Optional trailing icon node. */
  iconRight?: ReactNodeType;
  /** Stretch to full width on narrow viewports. */
  fullWidthMobile?: boolean;
  /** Non-interactive, dimmed. Anchor de-activated (no href, aria-disabled). */
  disabled?: boolean;
  /** Shows a token-colored spinner; implies disabled. CSS-only (no client JS). */
  loading?: boolean;
  /** External-link target. Auto-set to "_blank" when href is an absolute URL. */
  newTab?: boolean;
  /** Optional class additions for section-level layout. */
  className?: string;
  /** Optional BuilderNode id marker for canvas child-node selection. */
  builderNodeId?: string;
  /** Optional inline style overrides for node-level builder controls. */
  style?: CSSProperties;
  /** Accessible label when the visible text is insufficient. */
  "aria-label"?: string;
}

export function Cta({
  href,
  children,
  variant = "primary",
  size = "md",
  iconLeft,
  iconRight,
  fullWidthMobile,
  disabled,
  loading,
  newTab,
  className,
  builderNodeId,
  style,
  "aria-label": ariaLabel,
}: CtaProps) {
  const isExternal = /^https?:\/\//i.test(href) || newTab === true;
  const inert = disabled === true || loading === true;
  const classes = [
    "site-prim-cta",
    `site-prim-cta--${variant}`,
    `site-prim-cta--${size}`,
    fullWidthMobile ? "site-prim-cta--fullw-m" : "",
    loading ? "site-prim-cta--loading" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <a
      href={inert ? undefined : href}
      data-cta-variant={variant}
      data-cta-size={size}
      data-cta-state={loading ? "loading" : disabled ? "disabled" : undefined}
      data-builder-node-id={builderNodeId}
      className={classes}
      style={style}
      role={inert ? "link" : undefined}
      aria-disabled={inert ? true : undefined}
      aria-busy={loading ? true : undefined}
      aria-label={ariaLabel}
      tabIndex={inert ? -1 : undefined}
      target={!inert && isExternal ? "_blank" : undefined}
      rel={!inert && isExternal ? "noopener noreferrer" : undefined}
    >
      {loading ? (
        <span className="site-prim-cta__spinner" aria-hidden="true" />
      ) : iconLeft ? (
        <span className="site-prim-cta__ic" aria-hidden="true">
          {iconLeft}
        </span>
      ) : null}
      <span className="site-prim-cta__label">{children}</span>
      {!loading && iconRight ? (
        <span className="site-prim-cta__ic" aria-hidden="true">
          {iconRight}
        </span>
      ) : null}
    </a>
  );
}

// ── SearchInput (P1-1.1) ────────────────────────────────────────────────
/**
 * Token-driven search field. Server component: `directory-query` mode is a
 * native GET form (no client JS). `ai-interpret` only differs by the
 * action route the caller supplies — we never fake AI. `visual-only`
 * renders a non-submitting field for demo composition (not a prod default).
 */
export type SearchInputMode = "directory-query" | "ai-interpret" | "visual-only";

export interface SearchInputProps {
  /** Form action route (e.g. "/directory"). Required for submitting modes. */
  action?: string;
  mode?: SearchInputMode;
  placeholder?: string;
  defaultValue?: string;
  /** Query param name. Default "q". */
  name?: string;
  submitLabel?: string;
  size?: "sm" | "md" | "lg";
  fullWidthMobile?: boolean;
  builderNodeId?: string;
}

export function SearchInput({
  action,
  mode = "directory-query",
  placeholder = "Search…",
  defaultValue,
  name = "q",
  submitLabel = "Search",
  size = "md",
  fullWidthMobile = true,
  builderNodeId,
}: SearchInputProps) {
  const submitting = mode !== "visual-only" && !!action;
  const cls = [
    "site-prim-search",
    `site-prim-search--${size}`,
    fullWidthMobile ? "site-prim-search--fullw-m" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <form
      className={cls}
      action={submitting ? action : undefined}
      method={submitting ? "get" : undefined}
      role="search"
      data-search-mode={mode}
      data-builder-node-id={builderNodeId}
    >
      <span className="site-prim-search__ic" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor">
          <circle cx="11" cy="11" r="7" strokeWidth="2" />
          <path d="m21 21-4.3-4.3" strokeWidth="2" strokeLinecap="round" />
        </svg>
      </span>
      <input
        className="site-prim-search__input"
        type="search"
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        aria-label={placeholder}
        autoComplete="off"
        readOnly={!submitting}
      />
      {submitting ? (
        <button className="site-prim-search__submit" type="submit">
          {submitLabel}
        </button>
      ) : null}
    </form>
  );
}

// ── StatLine (P1-1.2) ───────────────────────────────────────────────────
/**
 * Presentational stat row. The consuming section resolves any dynamic value
 * (e.g. tenant talent count, tenant-scoped) and passes it in — the primitive
 * never queries data, keeping it reusable + tenant-safe by construction.
 */
export interface StatLineProps {
  items: { value: string; label: string }[];
  separator?: "dot" | "pipe" | "slash" | "none";
  align?: "left" | "center" | "right";
  tone?: "default" | "muted" | "on-dark";
  className?: string;
}

export function StatLine({
  items,
  separator = "dot",
  align = "center",
  tone = "muted",
  className,
}: StatLineProps) {
  if (!items.length) return null;
  return (
    <p
      className={`site-prim-statline site-prim-statline--${align} site-prim-statline--${tone}${className ? ` ${className}` : ""}`}
      data-sep={separator}
    >
      {items.map((it, i) => (
        <span className="site-prim-statline__item" key={`${it.label}-${i}`}>
          <b className="site-prim-statline__value">{it.value}</b>{" "}
          <span className="site-prim-statline__label">{it.label}</span>
        </span>
      ))}
    </p>
  );
}

// ── Badge (P1-1.3) ──────────────────────────────────────────────────────
export type BadgeVariant =
  | "neutral"
  | "featured"
  | "status"
  | "availability"
  | "outline";

export interface BadgeProps {
  label: ReactNode;
  variant?: BadgeVariant;
  size?: "sm" | "md";
  icon?: ReactNode;
  className?: string;
}

export function Badge({
  label,
  variant = "neutral",
  size = "sm",
  icon,
  className,
}: BadgeProps) {
  return (
    <span
      className={`site-prim-badge site-prim-badge--${variant} site-prim-badge--${size}${className ? ` ${className}` : ""}`}
    >
      {icon ? (
        <span className="site-prim-badge__ic" aria-hidden="true">
          {icon}
        </span>
      ) : null}
      {label}
    </span>
  );
}

// ── ChipList (P1-1.4) ───────────────────────────────────────────────────
/**
 * Chips render whatever the section passes. Source (manual / serviceAreas /
 * rosterCities) is resolved tenant-scoped by the section, not here.
 */
export interface ChipItem {
  label: ReactNode;
  href?: string;
  value?: string;
  active?: boolean;
  dot?: boolean;
}

export interface ChipListProps {
  chips: ChipItem[];
  layout?: "wrap" | "scroll";
  size?: "sm" | "md";
  className?: string;
}

export function ChipList({
  chips,
  layout = "wrap",
  size = "md",
  className,
}: ChipListProps) {
  if (!chips.length) return null;
  return (
    <div
      className={`site-prim-chips site-prim-chips--${layout} site-prim-chips--${size}${className ? ` ${className}` : ""}`}
      role="list"
    >
      {chips.map((c, i) => {
        const inner = (
          <>
            {c.dot ? (
              <span className="site-prim-chip__dot" aria-hidden="true" />
            ) : null}
            {c.label}
          </>
        );
        const klass = `site-prim-chip${c.active ? " site-prim-chip--on" : ""}`;
        return c.href ? (
          <a
            key={`${c.value ?? i}`}
            href={c.href}
            className={klass}
            role="listitem"
          >
            {inner}
          </a>
        ) : (
          <span key={`${c.value ?? i}`} className={klass} role="listitem">
            {inner}
          </span>
        );
      })}
    </div>
  );
}

// ── MediaFrame (P1-1.5) ─────────────────────────────────────────────────
/**
 * Ratio-boxed media with token-driven overlay + safe fallback. Plain <img>
 * (server-component safe, no next/image domain config coupling); object-fit
 * cover. Overlay uses the P0-4 presentation overlay controls when supplied.
 */
export interface MediaFrameProps {
  src?: string | null;
  alt?: string;
  ratio?: "1/1" | "3/4" | "4/3" | "16/9" | "21/9";
  overlayColor?: string;
  overlayOpacity?: number;
  overlayStrength?: "none" | "soft" | "medium" | "strong";
  objectPosition?: string;
  /** Shown when src is absent (e.g. initials or label). */
  fallback?: ReactNode;
  caption?: ReactNode;
  className?: string;
  builderNodeId?: string;
}

export function MediaFrame({
  src,
  alt = "",
  ratio = "3/4",
  overlayColor,
  overlayOpacity,
  overlayStrength,
  objectPosition,
  fallback,
  caption,
  className,
  builderNodeId,
}: MediaFrameProps) {
  const strengthOpacity =
    overlayStrength && overlayStrength !== "none"
      ? { soft: 0.2, medium: 0.4, strong: 0.62 }[overlayStrength]
      : undefined;
  const ov = overlayOpacity ?? strengthOpacity;
  return (
    <figure
      className={`site-prim-media${className ? ` ${className}` : ""}`}
      style={{ aspectRatio: ratio.replace("/", " / ") }}
      data-builder-node-id={builderNodeId}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className="site-prim-media__img"
          src={src}
          alt={alt}
          loading="lazy"
          style={objectPosition ? { objectPosition } : undefined}
        />
      ) : (
        <span className="site-prim-media__fallback" aria-hidden={!alt}>
          {fallback ?? alt}
        </span>
      )}
      {ov != null && ov > 0 ? (
        <span
          className="site-prim-media__overlay"
          aria-hidden="true"
          style={{
            background: overlayColor ?? "#000",
            opacity: ov,
          }}
        />
      ) : null}
      {caption ? (
        <figcaption className="site-prim-media__cap">{caption}</figcaption>
      ) : null}
    </figure>
  );
}
