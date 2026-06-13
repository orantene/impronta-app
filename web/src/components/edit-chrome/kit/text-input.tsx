"use client";

/**
 * TextInput — a styled text input / textarea primitive that matches the
 * ColorRow hex-input visual language.
 *
 * Two variants:
 *   - Single-line <input>  (default)
 *   - Multi-line <textarea> via `multiline` prop
 *
 * The `mono` prop switches the font to the system monospace stack (same as
 * ColorRow's hex field). Used for type-scale values (CSS lengths) and the
 * theme JSON export.
 *
 * Visual contract:
 *   - Border: CHROME.lineMid (same as ColorRow hex input idle)
 *   - Background: CHROME.surface2
 *   - Inset shadow: CHROME_SHADOWS.inputInset
 *   - Focus: blue border + inputFocus ring
 *   - Padding: 6px 9px
 */

import type { CSSProperties } from "react";

import { CHROME, CHROME_SHADOWS } from "./tokens";

const MONO_FONT = 'ui-monospace, "SF Mono", Menlo, monospace';

interface BaseProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  disabled?: boolean;
  /** Switches to system monospace stack. */
  mono?: boolean;
  spellCheck?: boolean;
  className?: string;
  style?: CSSProperties;
  "data-theme-control"?: string;
}

interface SingleLineProps extends BaseProps {
  multiline?: false;
}

interface MultiLineProps extends BaseProps {
  multiline: true;
  /** Minimum visible rows (maps to minHeight approximation). */
  minRows?: number;
  maxRows?: number;
  resize?: "vertical" | "none" | "both";
}

type TextInputProps = SingleLineProps | MultiLineProps;

const sharedStyle = (mono: boolean, disabled: boolean): CSSProperties => ({
  width: "100%",
  padding: "6px 9px",
  border: `1px solid ${CHROME.lineMid}`,
  borderRadius: 6,
  background: CHROME.controlFill,
  boxShadow: CHROME_SHADOWS.inputInset,
  fontFamily: mono ? MONO_FONT : "inherit",
  fontSize: 12,
  color: disabled ? CHROME.muted2 : CHROME.ink,
  outline: "none",
  transition: "border-color 120ms, box-shadow 120ms",
  cursor: disabled ? "not-allowed" : undefined,
});

export function TextInput(props: TextInputProps) {
  const {
    id,
    value,
    onChange,
    placeholder,
    readOnly = false,
    disabled = false,
    mono = false,
    spellCheck = false,
    className,
    style,
    "data-theme-control": dataThemeControl,
  } = props;

  const base = sharedStyle(mono, disabled);

  const applyFocus = (el: HTMLElement) => {
    el.style.borderColor = CHROME.blue;
    el.style.boxShadow = CHROME_SHADOWS.inputFocus;
  };
  const applyBlur = (el: HTMLElement) => {
    el.style.borderColor = CHROME.lineMid;
    el.style.boxShadow = CHROME_SHADOWS.inputInset;
  };

  if (props.multiline) {
    const { minRows = 3, maxRows, resize = "vertical" } = props;
    const lineHeight = 18; // px — approx at font-size 12
    const minHeight = minRows * lineHeight + 12; // + vertical padding
    const maxHeight = maxRows ? maxRows * lineHeight + 12 : undefined;

    return (
      <textarea
        id={id}
        value={value}
        readOnly={readOnly}
        disabled={disabled}
        placeholder={placeholder}
        spellCheck={spellCheck}
        data-theme-control={dataThemeControl}
        onChange={(e) => onChange(e.target.value)}
        onFocus={(e) => applyFocus(e.currentTarget)}
        onBlur={(e) => applyBlur(e.currentTarget)}
        className={className}
        style={{
          ...base,
          minHeight,
          maxHeight,
          lineHeight: `${lineHeight}px`,
          resize,
          ...style,
        }}
      />
    );
  }

  return (
    <input
      id={id}
      type="text"
      value={value}
      readOnly={readOnly}
      disabled={disabled}
      placeholder={placeholder}
      spellCheck={spellCheck}
      data-theme-control={dataThemeControl}
      onChange={(e) => onChange(e.target.value)}
      onFocus={(e) => applyFocus(e.currentTarget)}
      onBlur={(e) => applyBlur(e.currentTarget)}
      className={className}
      style={{ ...base, ...style }}
    />
  );
}
