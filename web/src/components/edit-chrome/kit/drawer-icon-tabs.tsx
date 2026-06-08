"use client";

import type { ComponentType } from "react";

import { CHROME } from "./tokens";

export interface DrawerIconTabItem<K extends string = string> {
  key: K;
  label: string;
  hint?: string;
  icon: ComponentType<{
    size?: number | string;
    strokeWidth?: number | string;
    "aria-hidden"?: boolean;
  }>;
}

interface DrawerIconTabsProps<K extends string> {
  items: ReadonlyArray<DrawerIconTabItem<K>>;
  active: K;
  onSelect: (key: K) => void;
  ariaLabel?: string;
  showLabels?: boolean;
  className?: string;
}

export function DrawerIconTabs<K extends string>({
  items,
  active,
  onSelect,
  ariaLabel = "Inspector sections",
  className,
}: DrawerIconTabsProps<K>) {
  const activeItem = items.find((i) => i.key === active);
  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label={ariaLabel}
      className={`flex shrink-0 flex-col items-center gap-1 overflow-y-auto py-2.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden ${className ?? ""}`}
      style={{ width: 46, background: CHROME.paper2, borderRight: `1px solid ${CHROME.line}` }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={item.hint ?? item.label}
            aria-label={item.label}
            onClick={() => onSelect(item.key)}
            className="inline-flex size-9 cursor-pointer items-center justify-center rounded-[9px] border-none transition-colors"
            style={{
              background: isActive ? CHROME.accent : "transparent",
              color: isActive ? "#ffffff" : CHROME.muted,
              boxShadow: isActive
                ? "0 1px 2px rgba(0,0,0,0.10), inset 0 1px 0 rgba(255,255,255,0.14)"
                : "none",
            }}
            onMouseEnter={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = CHROME.paper;
              e.currentTarget.style.color = CHROME.ink;
            }}
            onMouseLeave={(e) => {
              if (isActive) return;
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = CHROME.muted;
            }}
          >
            <Icon size={17} strokeWidth={1.85} aria-hidden />
          </button>
        );
      })}
      {activeItem ? (
        <div
          aria-hidden
          className="mt-auto shrink-0 pb-3 pt-1"
          style={{
            writingMode: "vertical-rl",
            transform: "rotate(180deg)",
            fontSize: 9.5,
            fontWeight: 600,
            letterSpacing: "0.07em",
            textTransform: "uppercase",
            color: CHROME.accent,
            userSelect: "none",
            lineHeight: 1,
          }}
        >
          {activeItem.label}
        </div>
      ) : null}
    </div>
  );
}

/** Horizontal icon+label tab strip — canvas-first inspector mockup. */
export function DrawerIconTabsRow<K extends string>({
  items,
  active,
  onSelect,
  ariaLabel = "Inspector sections",
  showLabels = true,
  className,
}: DrawerIconTabsProps<K>) {
  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      aria-label={ariaLabel}
      className={`flex shrink-0 items-stretch justify-around gap-0 border-b px-0.5 ${className ?? ""}`}
      style={{ background: CHROME.surface, borderColor: CHROME.line }}
    >
      {items.map((item) => {
        const isActive = item.key === active;
        const Icon = item.icon;
        return (
          <button
            key={item.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            title={item.hint ?? item.label}
            aria-label={item.label}
            onClick={() => onSelect(item.key)}
            className={`relative inline-flex min-w-[56px] flex-1 cursor-pointer flex-col items-center justify-center border-none bg-transparent transition-colors ${
              showLabels ? "gap-1 py-3 pb-3.5" : "gap-1 py-2.5"
            }`}
            style={{ color: isActive ? CHROME.accent : CHROME.muted }}
            onMouseEnter={(e) => {
              if (isActive) return;
              e.currentTarget.style.color = CHROME.ink;
            }}
            onMouseLeave={(e) => {
              if (isActive) return;
              e.currentTarget.style.color = CHROME.muted;
            }}
          >
            <Icon size={showLabels ? 17 : 18} strokeWidth={1.9} aria-hidden />
            {showLabels ? (
              <span
                className="max-w-full truncate px-0.5 text-[11px] font-semibold leading-none tracking-[-0.01em]"
                aria-hidden
              >
                {item.label}
              </span>
            ) : null}
            <span
              aria-hidden
              className="absolute inset-x-1.5 bottom-0 h-[2px] rounded-full transition-opacity"
              style={{
                background: CHROME.accent,
                opacity: isActive ? 1 : 0,
              }}
            />
          </button>
        );
      })}
    </div>
  );
}
