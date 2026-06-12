"use client";

/**
 * CardSubHead — a sub-section heading inside a CardBody, replacing ad-hoc
 * inline <div> headings used in the Code tab's "Theme preset" block and other
 * places that need a visual divider + label without the full CardHead chrome.
 *
 * Visually lighter than CardHead: no icon tile, no separator bar, same CAPS
 * typography (11px, 700, tracking 0.04em) but in stone-tone so it reads as
 * "section within card" rather than "card title."
 *
 * Optional `borderTop` adds a hairline separator above (useful when the
 * sub-head divides a card body into two regions).
 */

import type { ReactNode } from "react";

import { CHROME } from "./tokens";

interface CardSubHeadProps {
  /** The heading text. */
  children: ReactNode;
  /** Add a hairline separator above this sub-head. */
  borderTop?: boolean;
  /** Override marginBottom (default 6). */
  marginBottom?: number;
  /** Override marginTop (default 0, 12 when borderTop). */
  marginTop?: number;
  className?: string;
}

export function CardSubHead({
  children,
  borderTop = false,
  marginBottom = 6,
  marginTop,
  className,
}: CardSubHeadProps) {
  const mt = marginTop ?? (borderTop ? 12 : 0);
  return (
    <div
      className={className}
      style={{
        fontSize: 11,
        fontWeight: 600,
        color: CHROME.text2,
        letterSpacing: "0.03em",
        marginBottom,
        marginTop: mt,
        paddingTop: borderTop ? 12 : 0,
        borderTop: borderTop ? `1px solid ${CHROME.line}` : undefined,
      }}
    >
      {children}
    </div>
  );
}
