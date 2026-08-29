"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import type { NavNode } from "./marketing-header-nav";
import { ArrowTiny, ChevronDownGlyph } from "./marketing-header-glyphs";

/**
 * The platform panel: all twenty one features, in the five stages of the
 * journey, laid out as columns.
 *
 * The old Platform dropdown was a 22rem column pointing at two homepage
 * anchors and three pages, which is a menu that describes the site rather than
 * the product. A reader deciding whether Tulala does the thing they need had
 * no way to find out from the nav. Five columns of real feature pages answer
 * that in one hover, and every entry is a crawlable link to its own page.
 *
 * The panel is centred on the viewport rather than left aligned to its
 * trigger, because a five column panel anchored to a nav item on the left
 * runs off the right edge on a laptop.
 */
export function DesktopMegaMenu({
  node,
  open,
  onOpen,
  onClose,
  onToggle,
}: {
  node: Extract<NavNode, { kind: "mega" }>;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  onToggle: () => void;
}) {
  return (
    <div className="relative" onMouseEnter={onOpen} onMouseLeave={onClose}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        onClick={onToggle}
        onFocus={onOpen}
        className={cn(
          "inline-flex items-center gap-1 rounded-md px-3 py-2 text-[0.875rem] font-medium leading-none tracking-[-0.005em] transition-colors hover:bg-[var(--plt-bg-raised)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--plt-forest)]",
          open
            ? "bg-[var(--plt-bg-raised)] text-[var(--plt-ink)]"
            : "text-[var(--plt-muted)] hover:text-[var(--plt-ink)]",
        )}
      >
        {node.label}
        <ChevronDownGlyph open={open} />
      </button>

      {open ? (
        <div
          /* The wrapper starts ABOVE the header's 72px bottom edge and pads
             itself back down, so the visible card still sits under the header
             while the hover box covers the gap between trigger and panel.
             Without the overlap the pointer leaves the container on the way
             down and the panel closes before you reach it. */
          className="mkt-rise fixed left-1/2 top-[3.25rem] z-30 w-[min(66rem,calc(100vw-2rem))] -translate-x-1/2 pt-[1.25rem]"
          role="menu"
          aria-label={node.label}
        >
          <div
            className="overflow-hidden rounded-[20px]"
            style={{
              background: "var(--plt-bg-elevated)",
              border: "1px solid var(--plt-hairline-strong)",
              boxShadow:
                "0 28px 64px -28px rgba(15,23,20,0.4), 0 2px 6px -2px rgba(15,23,20,0.08)",
            }}
          >
            <div className="grid grid-cols-5 gap-x-5 gap-y-2 px-6 pb-5 pt-6">
              {node.columns.map((col) => (
                <div key={col.stage}>
                  <p
                    className="plt-eyebrow pb-2"
                    style={{ color: "var(--plt-muted-soft)" }}
                  >
                    {col.stage}
                  </p>
                  <ul className="flex flex-col">
                    {col.items.map((item) => (
                      <li key={item.href} role="none">
                        <Link
                          href={item.href}
                          role="menuitem"
                          onClick={onClose}
                          className="flex items-baseline gap-1.5 rounded-lg px-2 py-[7px] text-[0.8125rem] leading-[1.35] transition-colors hover:bg-[var(--plt-bg-raised)]"
                          style={{ color: "var(--plt-ink)" }}
                        >
                          <span>{item.label}</span>
                          {item.coming ? (
                            <span
                              className="shrink-0 rounded-full px-[6px] py-[1px] text-[0.5625rem] uppercase tracking-[0.08em]"
                              style={{
                                background: "var(--tl-warning-bg)",
                                color: "var(--tl-warning)",
                              }}
                            >
                              {node.comingLabel}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            {/* The foot carries the platform pages that are not features, and
                the way out to the hub itself. */}
            <div
              className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-8 py-4"
              style={{
                borderTop: "1px solid var(--plt-hairline)",
                background: "var(--plt-bg-raised)",
              }}
            >
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                {node.extras.map((extra) => (
                  <Link
                    key={extra.href}
                    href={extra.href}
                    onClick={onClose}
                    className="text-[0.8125rem] transition-colors hover:underline"
                    style={{ color: "var(--plt-muted)" }}
                  >
                    {extra.label}
                  </Link>
                ))}
              </div>
              <Link
                href={node.allHref}
                onClick={onClose}
                className="inline-flex items-center gap-1.5 text-[0.8125rem] font-medium transition-colors"
                style={{ color: "var(--plt-forest)" }}
              >
                {node.allLabel}
                <ArrowTiny />
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** The same panel on mobile: stages as headings, features as a plain list. */
export function MobileMegaSection({
  node,
  expanded,
  onToggle,
}: {
  node: Extract<NavNode, { kind: "mega" }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className="rounded-2xl"
      style={{ background: expanded ? "var(--plt-bg-raised)" : "transparent" }}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-4 text-[1rem] font-medium transition-colors"
        style={{ color: "var(--plt-ink)" }}
      >
        {node.label}
        <ChevronDownGlyph open={expanded} />
      </button>
      {expanded ? (
        <div className="flex flex-col gap-4 px-4 pb-4">
          {node.columns.map((col) => (
            <div key={col.stage}>
              <p className="plt-eyebrow pb-1" style={{ color: "var(--plt-muted-soft)" }}>
                {col.stage}
              </p>
              <ul className="flex flex-col">
                {col.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className="flex items-baseline gap-1.5 rounded-lg py-[7px] text-[0.9375rem] leading-[1.35]"
                      style={{ color: "var(--plt-ink)" }}
                    >
                      <span>{item.label}</span>
                      {item.coming ? (
                        <span
                          className="shrink-0 rounded-full px-[6px] py-[1px] text-[0.5625rem] uppercase tracking-[0.08em]"
                          style={{
                            background: "var(--tl-warning-bg)",
                            color: "var(--tl-warning)",
                          }}
                        >
                          {node.comingLabel}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <div
            className="flex flex-col gap-3 border-t pt-3"
            style={{ borderColor: "var(--plt-hairline)" }}
          >
            {node.extras.map((extra) => (
              <Link
                key={extra.href}
                href={extra.href}
                className="text-[0.9375rem]"
                style={{ color: "var(--plt-muted)" }}
              >
                {extra.label}
              </Link>
            ))}
            <Link
              href={node.allHref}
              className="inline-flex items-center gap-1.5 text-[0.9375rem] font-medium"
              style={{ color: "var(--plt-forest)" }}
            >
              {node.allLabel}
              <ArrowTiny />
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
