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

import type { ReactNode as ReactNodeType } from "react";

export interface SectionHeadProps {
  eyebrow?: ReactNodeType;
  headline?: ReactNodeType;
  intro?: ReactNodeType;
  align?: "start" | "center";
  className?: string;
}

export function SectionHead({ eyebrow, headline, intro, align = "center", className }: SectionHeadProps) {
  if (!eyebrow && !headline && !intro) return null;
  return (
    <header
      className={`site-prim-head${align === "center" ? " site-prim-head--center" : ""}${className ? ` ${className}` : ""}`}
    >
      {eyebrow ? <span className="site-eyebrow">{eyebrow}</span> : null}
      {headline ? <h2 className="site-prim-head__headline">{headline}</h2> : null}
      {intro ? <p className="site-prim-head__intro">{intro}</p> : null}
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

export type CtaVariant = "primary" | "secondary" | "ghost";

export interface CtaProps {
  href: string;
  /** Visible label. */
  children: ReactNodeType;
  /** Defaults to "primary". */
  variant?: CtaVariant;
  /** External-link target. Auto-set to "_blank" when href is an absolute URL. */
  newTab?: boolean;
  /** Optional class additions for section-level layout (e.g. width-full on mobile). */
  className?: string;
}

export function Cta({ href, children, variant = "primary", newTab, className }: CtaProps) {
  const isExternal = /^https?:\/\//i.test(href) || newTab === true;
  return (
    <a
      href={href}
      data-cta-variant={variant}
      className={`site-prim-cta site-prim-cta--${variant}${className ? ` ${className}` : ""}`}
      target={isExternal ? "_blank" : undefined}
      rel={isExternal ? "noopener noreferrer" : undefined}
    >
      {children}
    </a>
  );
}
