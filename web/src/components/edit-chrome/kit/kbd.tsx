"use client";

/**
 * Kbd — physical-keycap style tag for keyboard shortcut display.
 *
 * Used in the keyboard shortcuts overlay (mockup surface 26), command
 * palette result rows, top-bar button tooltips, helper text in fields.
 *
 * Visual: paper-tinted background, 1px border, inset bottom shadow that
 * makes the tag read as a depressed keycap rather than a flat label.
 *
 * Auto-detects modifier glyphs based on platform (⌘ vs Ctrl). Pass tokens
 * either as separate <Kbd> children for compound shortcuts:
 *
 *   <Kbd>⌘</Kbd><Kbd>K</Kbd>
 *
 * Or use <KbdSequence keys={["⌘", "K"]} /> for the same.
 */

import type { ReactNode } from "react";

import { CHROME } from "./tokens";

interface KbdProps {
  children: ReactNode;
  className?: string;
}

export function Kbd({ children, className }: KbdProps) {
  return (
    <kbd
      className={`inline-flex items-center justify-center ${className ?? ""}`}
      style={{
        fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
        fontSize: 10.5,
        fontWeight: 600,
        color: CHROME.ink,
        background: CHROME.paper2,
        border: `1px solid ${CHROME.lineMid}`,
        borderRadius: 4,
        padding: "3px 7px",
        boxShadow: `inset 0 -1px 0 ${CHROME.lineMid}`,
        lineHeight: 1,
      }}
    >
      {children}
    </kbd>
  );
}

interface KbdSequenceProps {
  /** Array of key tokens to render. */
  keys: ReadonlyArray<string>;
  /** Render mode: " " gap (default) or "+" between keys ("⌘+K"). */
  separator?: "gap" | "plus";
  className?: string;
}

export function KbdSequence({
  keys,
  separator = "gap",
  className,
}: KbdSequenceProps) {
  if (separator === "plus") {
    return (
      <span className={`inline-flex items-center ${className ?? ""}`}>
        {keys.map((k, i) => (
          <span key={i} className="inline-flex items-center">
            {i > 0 ? (
              <span
                aria-hidden
                style={{
                  margin: "0 4px",
                  color: CHROME.muted2,
                  fontSize: 10,
                }}
              >
                +
              </span>
            ) : null}
            <Kbd>{k}</Kbd>
          </span>
        ))}
      </span>
    );
  }
  return (
    <span className={`inline-flex items-center gap-[3px] ${className ?? ""}`}>
      {keys.map((k, i) => (
        <Kbd key={i}>{k}</Kbd>
      ))}
    </span>
  );
}
