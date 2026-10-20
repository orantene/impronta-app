"use client";

/**
 * W-10 rotating word. Every word sits in the same grid cell, so the cell is as
 * wide as the longest word and the headline never reflows (no layout shift).
 * Only the active word is visible. Assistive tech reads ONE static word; the
 * animated stack is aria-hidden. `prefers-reduced-motion` and a single word
 * both mean no rotation at all.
 */
import { useEffect, useState } from "react";

import { clampRotateMs, nextWordIndex } from "./rotating-word-logic";

export const ROTATING_WORD_CSS = `
.sb-rotating{display:inline-grid;vertical-align:baseline;font-style:italic}
.sb-rotating-w{grid-area:1/1;opacity:0;transition:opacity .45s ease;white-space:nowrap}
.sb-rotating-w[data-active="true"]{opacity:1}
.sb-rotating-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
@media (prefers-reduced-motion:reduce){.sb-rotating-w{transition:none}}
`;

export function RotatingWord({ words, intervalMs }: { words: readonly string[]; intervalMs?: number }) {
  const [index, setIndex] = useState(0);
  const count = words.length;
  const ms = clampRotateMs(intervalMs);

  useEffect(() => {
    if (count < 2) return;
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => setIndex((i) => nextWordIndex(i, count)), ms);
    return () => window.clearInterval(timer);
  }, [count, ms]);

  if (count === 0) return null;
  if (count === 1) return <em className="sb-rotating-static">{words[0]}</em>;
  return (
    <>
      <span className="sb-rotating-sr">{words[0]}</span>
      <span className="sb-rotating" data-rotating-word aria-hidden="true">
        <style>{ROTATING_WORD_CSS}</style>
        {words.map((w, i) => (
          <span key={`${i}-${w}`} className="sb-rotating-w" data-active={i === index ? "true" : "false"}>
            {w}
          </span>
        ))}
      </span>
    </>
  );
}
