"use client";

import { useId } from "react";

export function TextField({
  label,
  id,
  value,
  onChange,
  placeholder,
  type = "text",
  required = false,
  readOnly = false,
  error,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  type?: string;
  required?: boolean;
  readOnly?: boolean;
  error?: string;
}) {
  const fieldId = useId();
  const errId = error ? `${fieldId}-err` : undefined;
  return (
    <div>
      <label
        htmlFor={id}
        className="text-[0.8125rem] font-medium"
        style={{ color: "var(--plt-ink)" }}
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        readOnly={readOnly}
        aria-invalid={Boolean(error) || undefined}
        aria-describedby={errId}
        className="mt-2 block h-12 w-full rounded-xl border bg-[var(--plt-bg)] px-4 text-[0.9375rem] outline-none transition-all duration-200 placeholder:text-[var(--plt-muted-soft)] focus:border-[var(--plt-forest)] focus:bg-[var(--plt-bg-raised)] focus:shadow-[0_0_0_3px_rgba(46,107,82,0.1)]"
        style={{
          borderColor: error ? "rgba(194,82,58,0.55)" : "var(--plt-hairline-strong)",
          color: "var(--plt-ink)",
        }}
      />
      {error ? (
        <p id={errId} className="mt-1.5 text-[0.75rem]" style={{ color: "#8a3e2e" }}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

/**
 * Demoted, optional self-identification radio group. Extracted from
 * get-started-form.tsx to keep that file under the 800-line cap. Purely
 * presentational: parent owns the selected value + change handler.
 */
export function AudiencePicker<K extends string>({
  legend,
  options,
  value,
  onSelect,
}: {
  legend: string;
  options: { key: K; label: string; description: string }[];
  value: K;
  onSelect: (key: K) => void;
}) {
  return (
    <fieldset className="mt-6">
      <legend className="text-[0.8125rem] font-medium" style={{ color: "var(--plt-muted)" }}>
        {legend}
      </legend>
      <div className="mt-3 grid gap-2">
        {options.map((opt) => {
          const active = value === opt.key;
          return (
            <label
              key={opt.key}
              className="relative flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition-all duration-200"
              style={{
                background: active ? "rgba(46,107,82,0.08)" : "var(--plt-bg)",
                borderColor: active ? "var(--plt-forest)" : "var(--plt-hairline)",
              }}
            >
              <input
                type="radio"
                name="audience-ui"
                value={opt.key}
                checked={active}
                onChange={() => onSelect(opt.key)}
                className="sr-only"
              />
              <span
                className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors"
                style={{
                  borderColor: active ? "var(--plt-forest)" : "var(--plt-hairline-strong)",
                  background: active ? "var(--plt-forest)" : "transparent",
                }}
                aria-hidden
              >
                {active ? (
                  <span
                    className="inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: "var(--plt-on-inverse)" }}
                  />
                ) : null}
              </span>
              <span className="text-[0.875rem] font-medium" style={{ color: "var(--plt-ink)" }}>
                {opt.label}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function SuccessTick() {
  return (
    <span
      className="mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full"
      style={{ background: "rgba(46,107,82,0.14)" }}
      aria-hidden
    >
      <svg width="9" height="7" viewBox="0 0 11 9" fill="none">
        <path
          d="M1 4.5L4 7.5L10 1.5"
          stroke="var(--plt-forest)"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
