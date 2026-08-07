"use client";

/**
 * Inspector CARD-GRID primitives — the device picker row (Responsive tab) and
 * the animation / composition option grid (Motion and Layout tabs).
 *
 * Carved verbatim out of `inspector-ui.tsx` when WAVE 4.4's translation
 * boundary pushed that file past the 800-line cap. Same rendered DOM, same
 * props, same export names: `inspector-ui.tsx` re-exports both, so every
 * existing import site and the kit barrel are unchanged.
 */

import { useCallback, type ReactNode } from "react";

import { CHROME } from "../../kit/tokens";
import { useInspectorT } from "./use-inspector-t";

/** Device picker card row (Responsive tab). */
export function InspectorDeviceCards<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T;
  onChange: (next: T) => void;
  options: ReadonlyArray<{
    key: T;
    label: string;
    hint?: string;
    icon: ReactNode;
    /**
     * RESP-2 — optional advisory count badge rendered in the top-right corner
     * of the card. Shows when > 0. Advisory only — never blocks navigation.
     */
    badgeCount?: number;
  }>;
}) {
  const { t, to } = useInspectorT();
  // Column count tracks the registry-driven option list (RESP-1) so adding a
  // wide/compact editable tier keeps the cards evenly sized rather than spilling.
  const columns = Math.min(Math.max(options.length, 1), 5);
  return (
    <div
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}
    >
      {options.map((opt) => {
        const active = opt.key === value;
        const hasBadge = (opt.badgeCount ?? 0) > 0;
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            aria-pressed={active}
            aria-label={
              hasBadge
                ? t(
                    opt.badgeCount === 1
                      ? "{device}: {count} mobile health issue"
                      : "{device}: {count} mobile health issues",
                  )
                    .replace("{device}", t(opt.label))
                    .replace("{count}", String(opt.badgeCount))
                : t(opt.label)
            }
            title={
              // W2-C5: the red count badge on this card had no hover
              // explanation (audit finding); the aria-label already spells it
              // out for screen readers, mirror it as a visible tooltip too.
              hasBadge
                ? t(
                    opt.badgeCount === 1
                      ? "{count} mobile health issue, review in Mobile preview"
                      : "{count} mobile health issues, review in Mobile preview",
                  ).replace("{count}", String(opt.badgeCount))
                : undefined
            }
            className="relative flex cursor-pointer flex-col items-center gap-1.5 rounded-xl border px-2 py-3 transition-colors"
            style={{
              background: active ? "rgba(124, 58, 237, 0.08)" : CHROME.surface,
              borderColor: active ? CHROME.accent : CHROME.line,
              color: active ? CHROME.accent : CHROME.muted,
            }}
          >
            {hasBadge ? (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  top: 4,
                  right: 5,
                  minWidth: 15,
                  height: 15,
                  borderRadius: 999,
                  // Issue-count badge. Was a hardcoded rust (banned in admin
                  // chrome); rose is the chrome's error/problem role and is
                  // what the comment above already called this badge.
                  background: CHROME.rose,
                  color: "#fff",
                  fontSize: 9,
                  fontWeight: 700,
                  lineHeight: "15px",
                  textAlign: "center",
                  padding: "0 3px",
                  letterSpacing: "-0.01em",
                }}
              >
                {(opt.badgeCount ?? 0) > 99 ? "99+" : opt.badgeCount}
              </span>
            ) : null}
            <span aria-hidden>{opt.icon}</span>
            <span className="text-[11px] font-semibold">{t(opt.label)}</span>
            {opt.hint ? (
              <span className="text-[9px] font-medium opacity-80">
                {to(opt.hint)}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Animation / composition option grid (Motion / Layout tabs). */
export function InspectorOptionCards<T extends string>({
  value,
  onChange,
  options,
  columns = 3,
}: {
  value: T | undefined;
  onChange: (next: T | undefined) => void;
  options: ReadonlyArray<{
    value: T;
    label: string;
    icon?: ReactNode;
  }>;
  columns?: 2 | 3 | 4 | 5;
}) {
  const { t } = useInspectorT();
  const gridCols =
    columns === 2
      ? "grid-cols-2"
      : columns === 4
        ? "grid-cols-4"
        : columns === 5
          ? "grid-cols-5"
          : "grid-cols-3";

  const toggle = useCallback(
    (next: T) => {
      onChange(value === next ? undefined : next);
    },
    [onChange, value],
  );

  return (
    <div className={`grid gap-2 ${gridCols}`}>
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            aria-pressed={active}
            className="flex cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-center transition-colors"
            style={{
              minHeight: 64,
              background: active ? "rgba(124, 58, 237, 0.08)" : CHROME.surface,
              borderColor: active ? CHROME.accent : CHROME.line,
              color: active ? CHROME.accent : CHROME.muted,
            }}
          >
            {opt.icon ? <span aria-hidden>{opt.icon}</span> : null}
            <span className="text-[10.5px] font-semibold leading-tight">
              {t(opt.label)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
