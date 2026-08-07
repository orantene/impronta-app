"use client";

/**
 * DebouncedRangeInput — shared debounced range slider (Wave 3 item 3.2).
 *
 * Extracted verbatim from motion-panel.tsx (QA 2026-05-13): the bare
 * `<input type="range">` used to fire `onCommit` on every tick (every step),
 * which wrote `draftProps` into the edit context per step — dragging the
 * slider re-rendered every `useEditContext()` consumer dozens of times per
 * second (and, in the style-panel case, recorded a history entry per tick).
 * We hold the value in local state for smooth visual feedback and only
 * commit after the operator settles (200ms timer that resets on each tick +
 * commits on `pointerup` / `keyup` / `blur` as a belt-and-suspenders).
 */

import { useEffect, useRef, useState } from "react";

export function DebouncedRangeInput({
  min,
  max,
  step,
  value,
  onCommit,
  ariaLabel,
  className,
}: {
  min: number;
  max: number;
  step?: number;
  value: number;
  onCommit: (next: number) => void;
  ariaLabel?: string;
  className?: string;
}) {
  const [local, setLocal] = useState(value);
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Keep local mirror in sync when the server value changes from outside
  // (undo, reset, sibling field). Doesn't fight ongoing drags because
  // the parent doesn't re-render mid-drag unless onCommit fires.
  useEffect(() => {
    setLocal(value);
  }, [value]);
  useEffect(() => {
    return () => {
      if (commitTimer.current) clearTimeout(commitTimer.current);
    };
  }, []);
  function scheduleCommit(next: number) {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(() => onCommit(next), 200);
  }
  function commitNow(next: number) {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    onCommit(next);
  }
  return (
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={local}
      aria-label={ariaLabel}
      className={className}
      onChange={(e) => {
        const next = Number(e.target.value);
        setLocal(next);
        scheduleCommit(next);
      }}
      onPointerUp={() => commitNow(local)}
      onKeyUp={() => commitNow(local)}
      onBlur={() => commitNow(local)}
    />
  );
}
