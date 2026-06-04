"use client";

// Platform HQ · Operations — editable real feature-flags panel (HQ dark theme).
//
// Renders each registered settings flag as an editable row with explicit,
// PERSISTENT save state (idle → saving → saved / error). No toast-and-vanish:
// the row keeps its status until the next edit. Every save round-trips through
// the `saveFlag` server action, which re-checks isPlatformAdmin server-side.

import { useState, useTransition } from "react";
import type { FlagDef, FlagGroup } from "./flags-registry";
import { saveFlag } from "./flags-actions";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  red: "#F36772",
  amber: "#E2C275",
} as const;

const F = '"Inter", system-ui, sans-serif';
const FM = '"JetBrains Mono", "Fira Code", ui-monospace, monospace';

type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

// ── Value coercion for initial control state (mirror the getters' shapes) ──

function asBool(v: unknown): boolean {
  if (typeof v === "boolean") return v;
  if (v && typeof v === "object" && "enabled" in (v as object)) {
    return Boolean((v as { enabled?: boolean }).enabled);
  }
  if (v === "true") return true;
  return false;
}

function asStr(v: unknown): string {
  if (typeof v === "string") return v;
  if (typeof v === "number") return String(v);
  return "";
}

function summarize(def: FlagDef, value: unknown): string {
  switch (def.control.kind) {
    case "toggle":
      return asBool(value) ? "On" : "Off";
    case "select": {
      const s = asStr(value);
      const opt = def.control.options.find((o) => o.value === s);
      return opt ? opt.label : s ? s : "—";
    }
    case "number":
      return value == null || value === "" ? "Not set" : asStr(value);
    case "text":
      return asStr(value) || "Not set";
  }
}

function FlagRow({ def, initial }: { def: FlagDef; initial: unknown }) {
  const [value, setValue] = useState<string>(() => {
    switch (def.control.kind) {
      case "toggle":
        return asBool(initial) ? "true" : "false";
      default:
        return asStr(initial);
    }
  });
  const [savedValue, setSavedValue] = useState<unknown>(initial);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [pending, startTransition] = useTransition();

  function commit(next: string) {
    setStatus({ kind: "saving" });
    startTransition(async () => {
      const res = await saveFlag(def.key, next);
      if (res.ok) {
        setStatus({ kind: "saved" });
        setSavedValue(
          def.control.kind === "toggle" ? next === "true" : next,
        );
      } else {
        setStatus({ kind: "error", message: res.error });
      }
    });
  }

  const statusEl = (() => {
    if (pending || status.kind === "saving") {
      return <span style={{ color: HQ.amber, fontSize: 11 }}>Saving…</span>;
    }
    if (status.kind === "saved") {
      return <span style={{ color: HQ.green, fontSize: 11 }}>✓ Saved</span>;
    }
    if (status.kind === "error") {
      return (
        <span style={{ color: HQ.red, fontSize: 11 }}>
          ✕ {status.message}
        </span>
      );
    }
    return null;
  })();

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr auto",
        gap: 14,
        alignItems: "start",
        padding: "12px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontFamily: F,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "baseline",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span style={{ fontSize: 13, fontWeight: 600, color: HQ.ink }}>
            {def.label}
          </span>
          <span style={{ fontFamily: FM, fontSize: 11, color: HQ.inkDim }}>
            {def.key}
          </span>
        </div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, marginTop: 3 }}>
          {def.description}
        </div>
        <div style={{ fontSize: 11, color: HQ.inkDim, marginTop: 4 }}>
          Current:{" "}
          <span style={{ color: HQ.inkMuted, fontWeight: 600 }}>
            {summarize(def, savedValue)}
          </span>
        </div>
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: 6,
          minHeight: 28,
        }}
      >
        <Control
          def={def}
          value={value}
          disabled={pending}
          onChange={(next) => {
            setValue(next);
            commit(next);
          }}
          onCommitText={(next) => {
            setValue(next);
            commit(next);
          }}
        />
        <div style={{ minHeight: 14 }}>{statusEl}</div>
      </div>
    </div>
  );
}

function Control({
  def,
  value,
  disabled,
  onChange,
  onCommitText,
}: {
  def: FlagDef;
  value: string;
  disabled: boolean;
  onChange: (next: string) => void;
  onCommitText: (next: string) => void;
}) {
  const baseFieldStyle: React.CSSProperties = {
    background: HQ.cardSoft,
    border: `1px solid ${HQ.border}`,
    borderRadius: 8,
    color: HQ.ink,
    fontSize: 12.5,
    fontFamily: F,
    padding: "6px 9px",
    minWidth: 160,
  };

  switch (def.control.kind) {
    case "toggle": {
      const on = value === "true";
      return (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          disabled={disabled}
          onClick={() => onChange(on ? "false" : "true")}
          style={{
            width: 46,
            height: 26,
            borderRadius: 999,
            border: `1px solid ${on ? "rgba(93,211,160,0.5)" : HQ.border}`,
            background: on ? "rgba(93,211,160,0.22)" : HQ.cardSoft,
            position: "relative",
            cursor: disabled ? "default" : "pointer",
            opacity: disabled ? 0.6 : 1,
            transition: "background 120ms",
          }}
        >
          <span
            style={{
              position: "absolute",
              top: 2,
              left: on ? 22 : 2,
              width: 20,
              height: 20,
              borderRadius: "50%",
              background: on ? HQ.green : HQ.inkDim,
              transition: "left 120ms",
            }}
          />
        </button>
      );
    }
    case "select":
      return (
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          style={baseFieldStyle}
        >
          {/* Allow an unset row to show until the admin picks a value. */}
          {!def.control.options.some((o) => o.value === value) && (
            <option value={value}>— select —</option>
          )}
          {def.control.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    case "number":
      return (
        <input
          type="number"
          value={value}
          disabled={disabled}
          placeholder={
            def.control.placeholder != null
              ? String(def.control.placeholder)
              : undefined
          }
          min={def.control.min}
          max={def.control.max}
          onChange={(e) => onCommitText(e.target.value)}
          onBlur={(e) => onCommitText(e.target.value)}
          style={{ ...baseFieldStyle, minWidth: 110 }}
        />
      );
    case "text":
      return (
        <input
          type="text"
          defaultValue={value}
          disabled={disabled}
          placeholder={def.control.placeholder}
          onBlur={(e) => {
            if (e.target.value !== value) onCommitText(e.target.value);
          }}
          style={baseFieldStyle}
        />
      );
  }
}

export function FlagsPanel({
  groups,
  values,
}: {
  groups: ReadonlyArray<FlagGroup>;
  values: Record<string, unknown>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {groups.map((group) => (
        <section
          key={group.id}
          style={{
            background: HQ.card,
            border: `1px solid ${HQ.borderSoft}`,
            borderRadius: 12,
            padding: 16,
            fontFamily: F,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                fontSize: 10.5,
                color: HQ.inkMuted,
                fontWeight: 600,
                letterSpacing: 1.2,
                textTransform: "uppercase",
              }}
            >
              {group.title}
            </span>
            <p style={{ margin: "4px 0 0", fontSize: 12, color: HQ.inkMuted }}>
              {group.blurb}
            </p>
          </div>
          {group.flags.map((def) => (
            <FlagRow key={def.key} def={def} initial={values[def.key]} />
          ))}
        </section>
      ))}
    </div>
  );
}
