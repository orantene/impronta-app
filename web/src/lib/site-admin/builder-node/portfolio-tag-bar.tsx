"use client";

/**
 * W-12 tag filter chips. Progressive: without JS every shot shows. On click it
 * hides the figures of the enclosing portfolio block whose `data-portfolio-tag`
 * does not match.
 */
import { useState } from "react";

import type { PortfolioTag } from "./portfolio-tag-filter";

export function PortfolioTagBar({ tags, total, allLabel }: { tags: readonly PortfolioTag[]; total: number; allLabel: string }) {
  const [active, setActive] = useState<string | null>(null);

  function select(next: string | null, target: HTMLElement) {
    setActive(next);
    const block = target.closest<HTMLElement>("[data-builder-node-kind='portfolio']");
    block?.querySelectorAll<HTMLElement>("[data-portfolio-tag]").forEach((el) => {
      const tag = (el.getAttribute("data-portfolio-tag") ?? "").trim().toLowerCase();
      el.hidden = next !== null && tag !== next.trim().toLowerCase();
    });
  }

  const chip = (label: string, count: number, value: string | null) => (
    <button
      key={value ?? "__all"}
      type="button"
      className="sb-portfolio-tag"
      aria-pressed={active === value}
      onClick={(e) => select(value, e.currentTarget)}
    >
      {label} <span className="sb-portfolio-tag-n">{count}</span>
    </button>
  );

  return (
    <div className="sb-portfolio-tags" data-portfolio-tag-bar role="group">
      {chip(allLabel, total, null)}
      {tags.map((t) => chip(t.label, t.count, t.label))}
    </div>
  );
}
