"use client";

import * as React from "react";

/**
 * The sticky table of contents on a feature page.
 *
 * A Tier S page runs five or six sections, which is long enough that a reader
 * who wants one answer has to scroll hunting for it. A sidebar that tracks
 * position turns the page from a scroll into a document you can navigate, and
 * it keeps the page's own structure visible while you read it.
 *
 * Anchors are index based rather than slugified headings, so they are stable
 * across both languages and survive a copy edit.
 */
export function FeatureSectionNav({
  items,
  label,
}: {
  items: { id: string; heading: string }[];
  label: string;
}) {
  const [activeId, setActiveId] = React.useState<string | null>(items[0]?.id ?? null);

  React.useEffect(() => {
    const sections = items
      .map((i) => document.getElementById(i.id))
      .filter((el): el is HTMLElement => Boolean(el));
    if (sections.length === 0) return;

    // The topmost section still above the reading line wins, which matches
    // what a reader would call "the section I am in" better than raw
    // intersection ratios do on sections of very different heights.
    const observer = new IntersectionObserver(
      () => {
        const line = window.innerHeight * 0.3;
        let current = sections[0]!.id;
        for (const el of sections) {
          if (el.getBoundingClientRect().top <= line) current = el.id;
        }
        setActiveId(current);
      },
      { rootMargin: "-30% 0px -60% 0px", threshold: [0, 1] },
    );
    for (const el of sections) observer.observe(el);
    return () => observer.disconnect();
  }, [items]);

  if (items.length < 2) return null;

  return (
    <nav aria-label={label} className="sticky top-28">
      <p className="plt-eyebrow" style={{ color: "var(--plt-muted-soft)" }}>
        {label}
      </p>
      <ul className="mt-4 flex flex-col gap-1">
        {items.map((item) => {
          const active = item.id === activeId;
          return (
            <li key={item.id}>
              <a
                href={`#${item.id}`}
                className="mkt-toc-link block py-[6px] pl-3"
                style={{
                  borderLeft: `2px solid ${active ? "var(--plt-forest)" : "var(--plt-hairline)"}`,
                  color: active ? "var(--plt-ink)" : "var(--plt-muted)",
                  fontSize: "0.875rem",
                  lineHeight: 1.4,
                  fontWeight: active ? 600 : 400,
                }}
              >
                {item.heading}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
