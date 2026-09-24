"use client";

import type { CSSProperties, ReactNode } from "react";
import { useId, useState } from "react";

export interface BuilderTabsTab {
  id: string;
  label: ReactNode;
  attrs: Record<string, string | undefined>;
  style: CSSProperties;
}

/**
 * The interactive half of the `tabs` node. Panels arrive already rendered on
 * the server; this only decides which one is visible. Every panel stays in the
 * DOM (hidden, not unmounted) so the content is indexable and anchor links
 * into a hidden panel still resolve.
 */
export function BuilderNodeTabsView({
  tabs,
  panels,
  defaultIndex,
  listStyle,
}: {
  tabs: BuilderTabsTab[];
  panels: ReactNode[];
  defaultIndex: number;
  listStyle: CSSProperties;
}) {
  const [active, setActive] = useState(defaultIndex);
  const base = useId();
  return (
    <>
      <div role="tablist" style={listStyle}>
        {tabs.map((tab, i) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            id={`${base}-t${i}`}
            aria-selected={i === active}
            aria-controls={`${base}-p${i}`}
            tabIndex={i === active ? 0 : -1}
            {...tab.attrs}
            style={{ ...tab.style, fontWeight: i === active ? 700 : 500, cursor: "pointer", background: "none", font: "inherit" }}
            onClick={() => setActive(i)}
            onKeyDown={(e) => {
              if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
              e.preventDefault();
              const next = (i + (e.key === "ArrowRight" ? 1 : tabs.length - 1)) % tabs.length;
              setActive(next);
              document.getElementById(`${base}-t${next}`)?.focus();
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {panels.map((panel, i) => (
        <div key={tabs[i]?.id ?? i} role="tabpanel" id={`${base}-p${i}`} aria-labelledby={`${base}-t${i}`} hidden={i !== active}>
          {panel}
        </div>
      ))}
    </>
  );
}
