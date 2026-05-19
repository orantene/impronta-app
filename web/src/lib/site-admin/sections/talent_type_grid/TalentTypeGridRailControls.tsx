"use client";

import { useCallback, useEffect, useState } from "react";

interface Props {
  targetId: string;
}

export function TalentTypeGridRailControls({ targetId }: Props) {
  const [atStart, setAtStart] = useState(true);
  const [atEnd, setAtEnd] = useState(false);

  const getRail = useCallback(
    () =>
      typeof document === "undefined"
        ? null
        : document.getElementById(targetId),
    [targetId],
  );

  const update = useCallback(() => {
    const rail = getRail();
    if (!rail) return;
    setAtStart(rail.scrollLeft < 8);
    setAtEnd(rail.scrollLeft + rail.clientWidth >= rail.scrollWidth - 8);
  }, [getRail]);

  useEffect(() => {
    const rail = getRail();
    if (!rail) return;
    update();
    rail.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      rail.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [getRail, update]);

  const scroll = (dir: -1 | 1) => {
    const rail = getRail();
    if (!rail) return;
    rail.scrollBy({
      left: dir * Math.max(rail.clientWidth * 0.82, 300),
      behavior: "smooth",
    });
    window.setTimeout(update, 60);
    window.setTimeout(update, 440);
  };

  return (
    <>
      <button
        type="button"
        className={`site-tt-railnav site-tt-railnav--prev${
          atStart ? " is-dim" : ""
        }`}
        onClick={() => scroll(-1)}
        aria-label="Previous talent types"
        aria-disabled={atStart ? "true" : undefined}
        disabled={atStart}
      >
        <span aria-hidden="true">‹</span>
      </button>
      <button
        type="button"
        className={`site-tt-railnav site-tt-railnav--next${
          atEnd ? " is-dim" : ""
        }`}
        onClick={() => scroll(1)}
        aria-label="More talent types"
        aria-disabled={atEnd ? "true" : undefined}
        disabled={atEnd}
      >
        <span aria-hidden="true">›</span>
      </button>
    </>
  );
}
