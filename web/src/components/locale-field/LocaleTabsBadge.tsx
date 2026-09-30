"use client";

/**
 * LocaleTabsBadge: the `[● ES | ● EN] [✦ AI]` cluster beside a translatable
 * field's label. Presentation only: no i18n hook, no colours of its own. The
 * caller passes every label (already translated) and a `theme` of token
 * classes / styles, so the dashboard (admin tokens) and the page builder
 * (CHROME tokens) share one anatomy.
 *
 * A11y: `role="tablist"`, roving tabindex (Left / Right / Home / End), each tab
 * `aria-controls` the input and carries its status in `aria-label`
 * ("English, missing"). The AI button has its own `aria-label`.
 */
import { useRef, type CSSProperties, type KeyboardEvent } from "react";

import { nextTabIndex, type LocaleStatus } from "@/lib/i18n/locale-field-model";

export type LocaleTabItem = {
  code: string;
  status: LocaleStatus;
  /** Accessible name incl. status, e.g. "English, missing". */
  ariaLabel: string;
  /** Tooltip, e.g. "Español · principal". */
  title: string;
};

export type LocaleTabsBadgeAi = {
  ariaLabel: string;
  title: string;
  /** Visual state; `disabled` still renders (with the tooltip explaining why). */
  state: "enabled" | "disabled" | "loading" | "success" | "error";
  onClick: () => void;
};

export type LocaleTabsBadgeTheme = {
  tablist?: string;
  tab?: string;
  tabActive: string;
  tabIdle: string;
  dot: Record<LocaleStatus, { className?: string; style?: CSSProperties }>;
  ai: string;
  aiDisabled?: string;
  spinner?: string;
};

export function LocaleTabsBadge({
  tabs,
  active,
  onSelect,
  controlsId,
  tablistLabel,
  ai,
  size = "md",
  theme,
}: {
  tabs: readonly LocaleTabItem[];
  active: string;
  onSelect: (code: string) => void;
  /** id of the input these tabs drive. */
  controlsId?: string;
  tablistLabel: string;
  ai?: LocaleTabsBadgeAi | null;
  size?: "md" | "xs";
  theme: LocaleTabsBadgeTheme;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = Math.max(
    0,
    tabs.findIndex((t) => t.code === active),
  );
  const h = size === "xs" ? "h-[18px]" : "h-[22px]";

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const next = nextTabIndex(index, event.key, tabs.length);
    if (next === index) return;
    event.preventDefault();
    const tab = tabs[next];
    if (!tab) return;
    onSelect(tab.code);
    refs.current[next]?.focus();
  };

  const aiBusy = ai?.state === "loading";
  const aiOff = ai?.state === "disabled" || aiBusy;

  return (
    <div className="inline-flex shrink-0 items-center gap-1.5">
      <div
        role="tablist"
        aria-label={tablistLabel}
        className={`inline-flex items-center gap-px rounded-[6px] p-px ${theme.tablist ?? ""}`}
      >
        {tabs.map((tab, i) => {
          const isActive = i === activeIndex;
          const dot = theme.dot[tab.status];
          return (
            <button
              key={tab.code}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-controls={controlsId}
              aria-label={tab.ariaLabel}
              title={tab.title}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onSelect(tab.code)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={`inline-flex ${h} cursor-pointer items-center gap-1 rounded-[5px] px-1.5 font-mono text-[10px] font-semibold uppercase leading-none tracking-[0.04em] ${theme.tab ?? ""} ${
                isActive ? theme.tabActive : theme.tabIdle
              }`}
            >
              <span
                aria-hidden
                className={`inline-block h-[6px] w-[6px] shrink-0 rounded-full ${dot.className ?? ""}`}
                style={dot.style}
              />
              {tab.code}
            </button>
          );
        })}
      </div>
      {ai ? (
        <button
          type="button"
          aria-label={ai.ariaLabel}
          title={ai.title}
          disabled={aiOff}
          aria-busy={aiBusy || undefined}
          onClick={ai.onClick}
          className={`inline-flex ${h} items-center gap-1 rounded-[5px] px-1.5 text-[10px] font-semibold leading-none ${theme.ai} ${
            aiOff ? `cursor-not-allowed ${theme.aiDisabled ?? "opacity-50"}` : "cursor-pointer"
          }`}
        >
          {aiBusy ? (
            <span
              aria-hidden
              className={`inline-block h-[9px] w-[9px] animate-spin rounded-full border border-current border-t-transparent ${theme.spinner ?? ""}`}
            />
          ) : (
            <span aria-hidden>{ai.state === "success" ? "✓" : ai.state === "error" ? "↻" : "✦"}</span>
          )}
          <span aria-hidden>AI</span>
        </button>
      ) : null}
    </div>
  );
}
