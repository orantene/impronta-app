"use client";

/**
 * Inspector Visual System — reusable primitives for all six inspector tabs.
 *
 * Canvas-first mockup (2026-06): white panel, purple active accents, sentence-
 * case section titles, rounded inputs, calm spacing. Every tab composes from
 * here — no one-off class strings in panel files.
 */

import {
  useCallback,
  useId,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useInspectorSearchFilter } from "./inspector-search";

import { CHROME } from "../../kit/tokens";
import { useEditContext } from "../../edit-context";
import {
  baseBreakpointId,
  breakpointLabelForDevice,
} from "../../breakpoint-registry";
import { useInspectorT } from "./use-inspector-t";
import { BUILDER_VISUAL } from "./tokens";
import type { OverrideDevice } from "../responsive-field-state";

// ── Typography class strings (for legacy panel migration) ───────────────────

/** Sentence-case section heading inside a tab body. */
export const INSPECTOR_SECTION_TITLE_CLASS =
  "text-[13px] font-semibold tracking-[-0.01em] text-stone-900";

/** Small field label above an input. */
export const INSPECTOR_FIELD_LABEL_CLASS =
  "text-[11.5px] font-semibold tracking-[-0.005em] text-stone-600";

/** Muted helper copy under a field or section. */
export const INSPECTOR_HELP_TEXT_CLASS =
  "text-[12px] leading-snug text-stone-500";

/** @deprecated Use INSPECTOR_SECTION_TITLE_CLASS — uppercase legacy alias. */
export const INSPECTOR_LEGACY_SECTION_CLASS =
  INSPECTOR_SECTION_TITLE_CLASS;

/** @deprecated Use INSPECTOR_FIELD_LABEL_CLASS */
export const INSPECTOR_LEGACY_FIELD_CLASS = INSPECTOR_FIELD_LABEL_CLASS;

// ── Layout tokens ───────────────────────────────────────────────────────────

export const INSPECTOR_BODY_GAP = 20;
export const INSPECTOR_SECTION_GAP = 10;
export const INSPECTOR_FIELD_GAP = 6;

// ── Primitives ──────────────────────────────────────────────────────────────

export function InspectorBody({
  children,
  className,
  ...rest
}: {
  children: ReactNode;
  className?: string;
} & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`flex flex-col ${className ?? ""}`}
      style={{ gap: INSPECTOR_BODY_GAP }}
      {...rest}
    >
      {children}
    </div>
  );
}

export function InspectorSection({
  title,
  description,
  children,
  className,
}: {
  title: ReactNode;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  const { tn, to } = useInspectorT();
  // INS-3: auto-filter from the shared search context.
  // String-only titles participate in search; ReactNode titles (icons etc.) are skipped.
  // Search matches the RENDERED text, so a Spanish operator searches in Spanish.
  const localizedTitle = tn(title);
  const localizedDescription = to(description);
  const searchLabel = typeof localizedTitle === "string" ? localizedTitle : "";
  const hidden = useInspectorSearchFilter(
    searchLabel ? [searchLabel, localizedDescription ?? ""] : [],
  );
  if (hidden) return null;

  return (
    <section
      className={`flex flex-col ${className ?? ""}`}
      style={{ gap: INSPECTOR_SECTION_GAP }}
    >
      <div className="flex flex-col gap-0.5">
        <h3 className={INSPECTOR_SECTION_TITLE_CLASS}>{localizedTitle}</h3>
        {localizedDescription ? (
          <p className={INSPECTOR_HELP_TEXT_CLASS}>{localizedDescription}</p>
        ) : null}
      </div>
      <div className="flex flex-col" style={{ gap: INSPECTOR_SECTION_GAP }}>
        {children}
      </div>
    </section>
  );
}

export function InspectorCard({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      className={`rounded-xl ${className ?? ""}`}
      style={{
        background: CHROME.surface,
        border: `1px solid ${CHROME.line}`,
        boxShadow: "0 1px 2px rgba(0,0,0,0.03)",
        padding: "12px 14px",
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function InspectorAccordion({
  title,
  description,
  defaultOpen = true,
  children,
}: {
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const { t, to } = useInspectorT();
  const localizedTitle = t(title);
  const localizedDescription = to(description);
  // INS-3: auto-filter from the shared search context.
  const hidden = useInspectorSearchFilter([
    localizedTitle,
    localizedDescription ?? "",
  ]);
  const [open, setOpen] = useState(defaultOpen);
  const panelId = useId();
  if (hidden) return null;

  return (
    <div
      className="overflow-hidden rounded-xl"
      style={{
        border: `1px solid ${CHROME.line}`,
        background: CHROME.surface,
      }}
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 border-none bg-transparent px-3.5 py-3 text-left transition-colors"
        style={{ color: CHROME.ink }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = CHROME.paper;
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        {open ? (
          <ChevronDown size={15} strokeWidth={2} aria-hidden style={{ color: CHROME.muted }} />
        ) : (
          <ChevronRight size={15} strokeWidth={2} aria-hidden style={{ color: CHROME.muted }} />
        )}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className={INSPECTOR_SECTION_TITLE_CLASS}>{localizedTitle}</span>
          {localizedDescription && !open ? (
            <span className={`truncate ${INSPECTOR_HELP_TEXT_CLASS}`}>
              {localizedDescription}
            </span>
          ) : null}
        </span>
      </button>
      {open ? (
        <div
          id={panelId}
          className="flex flex-col border-t px-3.5 pb-3.5 pt-2"
          style={{ borderColor: CHROME.line, gap: INSPECTOR_SECTION_GAP }}
        >
          {localizedDescription && open ? (
            <p className={INSPECTOR_HELP_TEXT_CLASS}>{localizedDescription}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function InspectorField({
  label,
  help,
  children,
  className,
  overrideDevice,
  onResetOverride,
  desktopOnly,
  desktopOnlyMessage = "Desktop only",
  placeholderValue,
}: {
  label?: string;
  help?: string;
  children: ReactNode;
  className?: string;
  overrideDevice?: OverrideDevice | null;
  onResetOverride?: () => void;
  /** When true and device !== desktop, renders read-only placeholder instead of children. */
  desktopOnly?: boolean;
  desktopOnlyMessage?: "Desktop only" | "Same as desktop";
  placeholderValue?: string;
}) {
  const { t, to } = useInspectorT();
  const { device } = useEditContext();
  const showPlaceholder = desktopOnly && device !== "desktop";
  const localizedLabel = to(label);
  const localizedHelp = to(help);
  // INS-3: field-level search filter — fields with a label participate.
  const hidden = useInspectorSearchFilter(
    localizedLabel ? [localizedLabel, localizedHelp ?? ""] : [],
  );
  if (hidden) return null;

  return (
    <div
      className={`flex flex-col ${className ?? ""}`}
      style={{ gap: INSPECTOR_FIELD_GAP }}
    >
      {/* Raw copy in, not `localizedLabel`: InspectorLabel / InspectorHelpText
          own the translation for every caller, so passing the already-resolved
          Spanish here would run it through the resolver twice. */}
      {label ? (
        <div className="flex items-center justify-between gap-2">
          <InspectorLabel>{label}</InspectorLabel>
          {!showPlaceholder && overrideDevice ? (
            <InspectorOverrideBadge
              device={overrideDevice}
              onReset={onResetOverride}
            />
          ) : null}
        </div>
      ) : null}
      {showPlaceholder ? (
        <div
          className="rounded-[10px] px-3 py-2 text-[13px]"
          style={{
            border: `1px solid ${CHROME.line}`,
            background: CHROME.paper,
            color: BUILDER_VISUAL.textMuted,
          }}
        >
          {t(placeholderValue ?? desktopOnlyMessage)}
        </div>
      ) : (
        children
      )}
      {help && !showPlaceholder ? (
        <InspectorHelpText>{help}</InspectorHelpText>
      ) : null}
    </div>
  );
}

export function InspectorLabel({ children }: { children: ReactNode }) {
  const { tn } = useInspectorT();
  return <label className={INSPECTOR_FIELD_LABEL_CLASS}>{tn(children)}</label>;
}

export function InspectorHelpText({ children }: { children: ReactNode }) {
  const { tn } = useInspectorT();
  return <p className={INSPECTOR_HELP_TEXT_CLASS}>{tn(children)}</p>;
}

/** Re-export KIT input classes — panels should use KIT.input via InspectorInput wrapper. */
export function InspectorInput({
  className,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={className}
      {...props}
      style={{
        width: "100%",
        borderRadius: 10,
        border: `1px solid ${CHROME.controlBorder}`,
        background: CHROME.surface,
        padding: "9px 12px",
        fontSize: 13,
        color: CHROME.ink,
        outline: "none",
        ...props.style,
      }}
    />
  );
}

export function InspectorTextarea({
  className,
  rows = 3,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      rows={rows}
      className={className}
      {...props}
      style={{
        width: "100%",
        resize: "vertical",
        borderRadius: 10,
        border: `1px solid ${CHROME.controlBorder}`,
        background: CHROME.surface,
        padding: "9px 12px",
        fontSize: 13,
        lineHeight: 1.45,
        color: CHROME.ink,
        outline: "none",
        minHeight: 72,
        ...props.style,
      }}
    />
  );
}

export function InspectorSelect({
  className,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={className}
      {...props}
      style={{
        width: "100%",
        cursor: "pointer",
        borderRadius: 10,
        border: `1px solid ${CHROME.controlBorder}`,
        background: CHROME.surface,
        padding: "9px 32px 9px 12px",
        fontSize: 13,
        color: CHROME.ink,
        outline: "none",
        ...props.style,
      }}
    >
      {children}
    </select>
  );
}

export function InspectorButton({
  variant = "outline",
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "outline" | "ghost" | "primary";
}) {
  const { tn } = useInspectorT();
  const base =
    "inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-[10px] border text-[13px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50";
  const styles: Record<string, CSSProperties> = {
    outline: {
      background: CHROME.surface,
      borderColor: CHROME.lineStrong,
      color: CHROME.ink,
      padding: "8px 14px",
    },
    ghost: {
      background: "transparent",
      borderColor: "transparent",
      color: CHROME.accent,
      padding: "6px 10px",
    },
    primary: {
      background: CHROME.accent,
      borderColor: CHROME.accent,
      color: "#fff",
      padding: "9px 16px",
      fontWeight: 600,
    },
  };
  return (
    <button
      type="button"
      className={`${base} ${className ?? ""}`}
      style={styles[variant]}
      {...props}
    >
      {tn(children)}
    </button>
  );
}

export function InspectorActionRow({
  children,
  align = "center",
}: {
  children: ReactNode;
  align?: "start" | "center" | "end";
}) {
  return (
    <div
      className="flex w-full pt-1"
      style={{
        justifyContent:
          align === "start" ? "flex-start" : align === "end" ? "flex-end" : "center",
      }}
    >
      {children}
    </div>
  );
}

export function InspectorNotice({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "info";
}) {
  const { tn } = useInspectorT();
  return (
    <div
      className="rounded-xl px-3.5 py-3 text-[12px] leading-snug"
      style={{
        background: tone === "info" ? CHROME.blueBg : CHROME.paper,
        border: `1px solid ${tone === "info" ? CHROME.blueLine : CHROME.line}`,
        color: tone === "info" ? CHROME.blue : CHROME.muted,
      }}
    >
      {tn(children)}
    </div>
  );
}

export function InspectorEmptyState({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  const { t, to } = useInspectorT();
  return (
    <div
      className="flex flex-col items-center justify-center rounded-xl px-4 py-8 text-center"
      style={{
        border: `1px dashed ${CHROME.lineStrong}`,
        background: CHROME.paper,
      }}
    >
      <p className={INSPECTOR_SECTION_TITLE_CLASS}>{t(title)}</p>
      {description ? (
        <p className={`mt-1.5 max-w-[240px] ${INSPECTOR_HELP_TEXT_CLASS}`}>
          {to(description)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Device picker row + option-card grid moved to `inspector-card-grids.tsx`
 * for the 800-line cap. Re-exported here so existing import sites and the
 * kit barrel are unchanged.
 */
export { InspectorDeviceCards, InspectorOptionCards } from "./inspector-card-grids";

/** Cream inset well for composition / stacking blocks (Layout tab mockup). */
export function InspectorControlWell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={className}
      style={{
        background: BUILDER_VISUAL.controlWellBg,
        border: `1px solid ${BUILDER_VISUAL.controlWellBorder}`,
        borderRadius: BUILDER_VISUAL.panelRadius,
        padding: "14px 16px",
      }}
    >
      {children}
    </div>
  );
}

/** Tablet/mobile override indicator on field labels. */
export function InspectorOverrideBadge({
  device,
  onReset,
  tooltip,
}: {
  device: OverrideDevice;
  onReset?: () => void;
  tooltip?: string;
}) {
  const { t, to } = useInspectorT();
  const label = t(breakpointLabelForDevice(device));
  const title =
    to(tooltip) ??
    t("{device} override. Tap Reset to inherit {base}")
      .replace("{device}", label)
      .replace(
        "{base}",
        t(breakpointLabelForDevice(baseBreakpointId())).toLowerCase(),
      );
  return (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[10px] font-semibold"
      style={{
        background: BUILDER_VISUAL.accentBg,
        color: BUILDER_VISUAL.accent,
        border: `1px solid ${BUILDER_VISUAL.accentBorder}`,
      }}
    >
      {label}
      {onReset ? (
        <button
          type="button"
          onClick={onReset}
          className="cursor-pointer border-none bg-transparent p-0 text-[10px] font-semibold underline"
          style={{ color: BUILDER_VISUAL.accent }}
          aria-label={t("Reset {device} override").replace(
            "{device}",
            label.toLowerCase(),
          )}
        >
          {t("Reset")}
        </button>
      ) : null}
    </span>
  );
}

/** Compact icon/text action beside a field row. */
export function InspectorMicroAction({
  children,
  onClick,
  title,
  disabled,
}: {
  children: ReactNode;
  onClick?: () => void;
  title?: string;
  disabled?: boolean;
}) {
  const { to } = useInspectorT();
  const localizedTitle = to(title);
  return (
    <button
      type="button"
      title={localizedTitle}
      aria-label={localizedTitle}
      disabled={disabled}
      onClick={onClick}
      className="inline-flex cursor-pointer items-center justify-center rounded-md border-none bg-transparent p-1 transition-colors disabled:cursor-not-allowed disabled:opacity-40"
      style={{ color: CHROME.muted }}
      onMouseEnter={(e) => {
        if (!disabled) e.currentTarget.style.color = CHROME.accent;
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.color = CHROME.muted;
      }}
    >
      {children}
    </button>
  );
}

/** Side-by-side padding top/bottom fields. */
export function InspectorPaddingPair({
  top,
  bottom,
}: {
  top: ReactNode;
  bottom: ReactNode;
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {top}
      {bottom}
    </div>
  );
}

export function InspectorMediaRow({
  thumbnail,
  filename,
  meta,
  onReplace,
  replaceLabel = "Replace",
}: {
  thumbnail?: ReactNode;
  filename: string;
  meta?: string;
  onReplace?: () => void;
  replaceLabel?: string;
}) {
  const { t } = useInspectorT();
  return (
    <InspectorCard>
      <div className="flex items-center gap-3">
        {thumbnail ? (
          <div
            className="shrink-0 overflow-hidden rounded-lg"
            style={{
              width: 48,
              height: 48,
              border: `1px solid ${CHROME.line}`,
              background: CHROME.paper,
            }}
          >
            {thumbnail}
          </div>
        ) : null}
        <div className="min-w-0 flex-1">
          <p className="truncate text-[13px] font-medium text-stone-900">{filename}</p>
          {meta ? <p className="text-[11px] text-stone-500">{t(meta)}</p> : null}
        </div>
        {onReplace ? (
          <InspectorButton variant="outline" onClick={onReplace} type="button">
            {replaceLabel}
          </InspectorButton>
        ) : null}
      </div>
    </InspectorCard>
  );
}
