"use client";

/**
 * Mockup-faithful inspector primitives (Style / Layout tabs).
 */

import { RotateCcw } from "lucide-react";
import type { ReactNode } from "react";

import { CHROME } from "../../kit/tokens";
import { BUILDER_VISUAL } from "./tokens";
import {
  InspectorField,
  InspectorInput,
  InspectorLabel,
  InspectorOverrideBadge,
} from "./inspector-ui";
import { useInspectorT } from "./use-inspector-t";
import type { OverrideDevice } from "../responsive-field-state";

export function InspectorPlaceholderField({
  label,
  message = "Desktop only",
  value,
}: {
  label?: string;
  message?: "Desktop only" | "Same as desktop";
  value?: string;
}) {
  return (
    <InspectorField label={label} help={message}>
      <div
        className="rounded-[10px] px-3 py-2 text-[13px]"
        style={{
          border: `1px solid ${CHROME.line}`,
          background: CHROME.paper,
          color: BUILDER_VISUAL.textMuted,
        }}
      >
        {value ?? message}
      </div>
    </InspectorField>
  );
}

export function InspectorTypographyRow({
  title,
  fontFamily,
  fontWeight,
  fontSize,
  overrideDevice,
  onResetOverride,
}: {
  title: string;
  fontFamily: ReactNode;
  fontWeight: ReactNode;
  fontSize: ReactNode;
  overrideDevice?: OverrideDevice | null;
  onResetOverride?: () => void;
}) {
  const cols = [
    { label: "Font", node: fontFamily },
    { label: "Weight", node: fontWeight },
    { label: "Size", node: fontSize },
  ];
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <div className="flex items-center justify-between gap-2">
        <InspectorLabel>{title}</InspectorLabel>
        {overrideDevice ? (
          <InspectorOverrideBadge device={overrideDevice} onReset={onResetOverride} />
        ) : null}
      </div>
      <div className="grid grid-cols-3 gap-2">
        {cols.map(({ label, node }) => (
          <div key={label} className="flex flex-col" style={{ gap: 4 }}>
            <span className="text-[10.5px] font-medium" style={{ color: BUILDER_VISUAL.textMuted }}>
              {label}
            </span>
            {node}
          </div>
        ))}
      </div>
    </div>
  );
}

export function InspectorColorSwatchRow({
  items,
}: {
  items: ReadonlyArray<{
    key: string;
    label: string;
    color: string;
    onClick?: () => void;
    overrideDevice?: OverrideDevice | null;
  }>;
}) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          onClick={item.onClick}
          className="flex cursor-pointer flex-col items-center gap-1.5 border-none bg-transparent p-0"
        >
          <span
            className="block rounded-lg"
            style={{
              width: 36,
              height: 36,
              background: item.color,
              border: `1px solid ${CHROME.line}`,
              boxShadow: "inset 0 0 0 1px rgba(0,0,0,0.04)",
            }}
          />
          <span className="text-[10.5px] font-medium" style={{ color: BUILDER_VISUAL.textMuted }}>
            {item.label}
          </span>
          {item.overrideDevice ? (
            <InspectorOverrideBadge device={item.overrideDevice} />
          ) : null}
        </button>
      ))}
    </div>
  );
}

export function InspectorColorHexPair({
  background,
  surface,
}: {
  background: ReactNode;
  /** Optional — omit when there is no real surface-color model to bind. */
  surface?: ReactNode;
}) {
  return (
    <div className={surface ? "grid grid-cols-2 gap-3" : undefined}>
      <InspectorField label="Background">{background}</InspectorField>
      {surface ? <InspectorField label="Surface">{surface}</InspectorField> : null}
    </div>
  );
}

export function InspectorColorHexInput({
  value,
  onChange,
  placeholder = "#FFFFFF",
}: {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        className="shrink-0 rounded-lg"
        style={{
          width: 28,
          height: 28,
          background: value || placeholder,
          border: `1px solid ${CHROME.line}`,
        }}
      />
      <InspectorInput
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

export function InspectorLayoutPresetCards<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T | undefined;
  onChange: (next: T) => void;
  options: ReadonlyArray<{ value: T; title: string; description: string }>;
}) {
  const { t } = useInspectorT();
  return (
    <div className="grid grid-cols-2 gap-2" data-layout-preset-cards="">
      {options.map((opt, index) => {
        const active = opt.value === value;
        // Schematic column weights cycle for visual variety when ids aren't ratios.
        const leftWeight = [0.5, 0.62, 0.38, 0.55][index % 4]!;
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            aria-pressed={active}
            className="cursor-pointer rounded-[12px] border px-2.5 py-2 text-left transition-[border-color,box-shadow,background-color] duration-150"
            style={{
              background: active ? BUILDER_VISUAL.accentBg : CHROME.surface,
              borderColor: active ? BUILDER_VISUAL.accentBorder : CHROME.line,
              boxShadow: active
                ? "0 1px 4px rgba(124,58,237,0.14)"
                : "0 1px 2px rgba(17,24,39,0.04)",
            }}
          >
            <span
              aria-hidden
              className="mb-1.5 flex h-7 items-stretch gap-1 overflow-hidden rounded-md"
              style={{
                background: active
                  ? "rgba(124,58,237,0.08)"
                  : "rgba(24,24,27,0.04)",
                padding: 3,
              }}
            >
              <span
                style={{
                  flex: leftWeight,
                  borderRadius: 4,
                  background: active
                    ? "rgba(124,58,237,0.45)"
                    : "rgba(24,24,27,0.18)",
                }}
              />
              <span
                style={{
                  flex: 1 - leftWeight,
                  borderRadius: 4,
                  background: active
                    ? "rgba(124,58,237,0.22)"
                    : "rgba(24,24,27,0.10)",
                }}
              />
            </span>
            <span
              className="block text-[12px] font-semibold tracking-[-0.01em]"
              style={{ color: active ? BUILDER_VISUAL.accent : CHROME.ink }}
            >
              {t(opt.title)}
            </span>
            <span
              className="mt-0.5 block text-[10.5px] leading-snug"
              style={{ color: BUILDER_VISUAL.textMuted }}
            >
              {t(opt.description)}
            </span>
          </button>
        );
      })}
    </div>
  );
}

export function InspectorResetFooter({
  label,
  onClick,
  disabled,
}: {
  label: string;
  onClick?: () => void;
  disabled?: boolean;
}) {
  const { t } = useInspectorT();
  return (
    <div className="flex justify-center pt-2">
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="inline-flex cursor-pointer items-center gap-1.5 border-none bg-transparent text-[12px] font-semibold disabled:cursor-not-allowed disabled:opacity-40"
        style={{ color: BUILDER_VISUAL.accent }}
      >
        <RotateCcw size={14} strokeWidth={2} aria-hidden />
        {t(label)}
      </button>
    </div>
  );
}
