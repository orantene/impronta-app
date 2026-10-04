"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";

import {
  SWITCHER_LINE_RATIO,
  hashTargetOf,
  pickActiveSection,
  sectionIndexLabel,
  switchDirection,
  type SwitcherLink,
} from "./section-switcher-logic";

/**
 * H-4: the phone section switcher. The current section's number and name sit
 * in the header bar (the name slides up or down as you scroll, an accent
 * underline draws in on change); a tap opens a menu of every section. Escape
 * or a tap outside closes it. Scroll-spy runs over the in-page anchors of the
 * header's own section links, so one list (Navigation tab) drives both the
 * desktop links and this switcher. The bar shows only on phones; the header's
 * per-breakpoint item behaviour (`data-bp-*`) hides it elsewhere. All motion
 * is in CSS and is switched off by `prefers-reduced-motion`.
 */
export function SectionSwitcher({
  links,
  showIndex,
  label,
  attrs,
}: {
  links: ReadonlyArray<SwitcherLink>;
  showIndex: boolean;
  /** Accessible name of the control, in the page's language. */
  label: string;
  attrs: Record<string, string | undefined>;
}) {
  const menuId = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  // Only links whose anchor exists on this page count; resolved after mount.
  const [live, setLive] = useState<ReadonlyArray<SwitcherLink>>(links);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [dir, setDir] = useState<"up" | "down">("up");
  const [open, setOpen] = useState(false);
  const activeIndexRef = useRef(0);
  const activeIdRef = useRef<string | null>(null);

  useEffect(() => {
    setLive(links.filter((l) => {
      const id = hashTargetOf(l.href);
      return id !== null && document.getElementById(id) !== null;
    }));
  }, [links]);

  const measure = useCallback(() => {
    const tops = live.flatMap((l) => {
      const id = hashTargetOf(l.href);
      const el = id ? document.getElementById(id) : null;
      return id && el ? [{ id, top: el.getBoundingClientRect().top }] : [];
    });
    const next = pickActiveSection(tops, window.innerHeight * SWITCHER_LINE_RATIO);
    if (next === activeIdRef.current) return;
    const nextIndex = Math.max(0, live.findIndex((l) => hashTargetOf(l.href) === next));
    setDir(switchDirection(activeIndexRef.current, nextIndex));
    activeIndexRef.current = nextIndex;
    activeIdRef.current = next;
    setActiveId(next);
  }, [live]);

  useEffect(() => {
    if (live.length < 2) return;
    measure();
    window.addEventListener("scroll", measure, { passive: true });
    window.addEventListener("resize", measure);
    return () => {
      window.removeEventListener("scroll", measure);
      window.removeEventListener("resize", measure);
    };
  }, [live, measure]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    const onPointer = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [open]);

  if (live.length < 2) return null;

  const current = Math.max(0, live.findIndex((l) => hashTargetOf(l.href) === activeId));
  const go = (href: string) => {
    const id = hashTargetOf(href);
    const el = id ? document.getElementById(id) : null;
    setOpen(false);
    if (!el) return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true;
    el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    window.history.replaceState(null, "", href);
  };

  return (
    <div
      ref={rootRef}
      {...attrs}
      className="site-header__ritem site-header__secsw"
      data-open={open ? "true" : "false"}
      data-section-switcher=""
    >
      <button
        type="button"
        className="site-header__secsw-btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        aria-label={label}
        onClick={() => setOpen((v) => !v)}
      >
        {showIndex ? <span className="site-header__secsw-idx">{sectionIndexLabel(current)}</span> : null}
        <span className="site-header__secsw-clip">
          <span key={`n-${current}`} className="site-header__secsw-name" data-dir={dir}>
            {live[current]!.label}
          </span>
        </span>
        <span key={`l-${current}`} className="site-header__secsw-line" aria-hidden />
        <svg className="site-header__secsw-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      {open ? (
        <ul id={menuId} className="site-header__secsw-menu" data-secsw-menu="">
          {live.map((l, i) => (
            <li key={l.href}>
              <a
                href={l.href}
                aria-current={i === current ? "true" : undefined}
                onClick={(e) => {
                  e.preventDefault();
                  go(l.href);
                }}
              >
                {showIndex ? <span className="site-header__secsw-idx">{sectionIndexLabel(i)}</span> : null}
                {l.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
