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

export interface SectionHeadProps {
  eyebrow?: string;
  headline?: string;
  intro?: string;
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
