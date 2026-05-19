"use client";

// ============================================================================
// FieldEditor.tsx — Shared per-field write control for the DB-driven talent
// field catalog. Extracted from live-category-fields-editor.tsx (Phase 4,
// remediation 2026-05-19) as a strangler step: behavior-identical, same
// onBlur save contract, same status pill / validation hints / visibility
// chips. live-category-fields-editor.tsx now composes <FieldEditor/> per
// field instead of owning the per-field switch itself.
//
// Kinds: text / textarea / number / date / boolean(+toggle) / select /
// multiselect / chips (+ a plain-text fallback for unknown kinds). Writes
// happen on blur — there is no Save button. The caller's `onSave` is the
// persistence path (live-category passes `setTalentFieldValue`).
//
// Self-contained by design (own palette/helpers) so it is reusable without
// importing from a specific consumer. The palette mirrors state.tsx COLORS;
// the Phase 3 design-token codemod will consolidate these app-wide.
// ============================================================================

import { useEffect, useState, useRef, type CSSProperties, type ReactNode } from "react";
import { type ResolvedField } from "@/lib/server-actions/admin-taxonomy";

// Palette mirrors the real app COLORS tokens (state.tsx) so the Details
// editor's greys match the New Inquiry / rest of the shell exactly:
// COOL border family rgba(24,24,27,*) and the neutral #F2F2EE alt
// surface. (A prior warm rgba(35,29,16,*) / #F2EDE2 palette here read
// as an ugly beige cast on row hover — that is the bug this fixes.)
const T = {
  ink: "#0B0B0D",
  inkMuted: "#5A5A60",
  inkDim: "rgba(11,11,13,0.38)",
  surface: "#FFFFFF",
  surfaceAlt: "#F2F2EE",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.10)",
  red: "#C82828",
  amber: "#B88731",
};

const F = "Inter, system-ui, sans-serif";

// C1/C2 — read the app's `locale` cookie client-side so the editor can
// show Spanish field labels without threading a locale prop through the
// drawer. Falls back to "en" on the server / when no cookie.
export function readLocale(): string {
  if (typeof document === "undefined") return "en";
  const m = document.cookie.match(/(?:^|;\s*)locale=([^;]+)/);
  return m?.[1] === "es" ? "es" : "en";
}

/** Locale-aware field label — Spanish when locale=es AND label_es set. */
export function fieldLabel(field: { label: string; label_es?: string | null }, locale: string): string {
  if (locale === "es" && field.label_es && field.label_es.trim()) {
    return field.label_es.trim();
  }
  return field.label;
}

type FieldStatus = "idle" | "saving" | "saved" | "error";

function StatusPill({ status, error }: { status: FieldStatus; error: string | null }) {
  if (status === "idle") return null;
  const label =
    status === "saving" ? "Saving…" :
    status === "saved" ? "Saved ✓" :
    error ?? "Error";
  const color =
    status === "saved" ? T.accent :
    status === "error" ? T.red :
    T.inkMuted;
  const bg =
    status === "saved" ? T.accentSoft :
    status === "error" ? "rgba(200,40,40,0.10)" :
    "rgba(11,11,13,0.05)";
  // B1 — pill is larger + tinted background for visibility. The 10px text
  // was easy to miss; 11.5px + colored background reads at a glance.
  return (
    <span
      role="status"
      aria-live="polite"
      style={{
        fontSize: 11.5, fontWeight: 700, color,
        marginLeft: 8, fontFamily: F,
        padding: "2px 8px", borderRadius: 999,
        background: bg, letterSpacing: 0.2,
        whiteSpace: "nowrap",
      }}
    >{label}</span>
  );
}

function asString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return "";
}

function asNumber(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return String(v);
  if (typeof v === "string" && v.trim() !== "" && !Number.isNaN(Number(v))) return v;
  return "";
}

function asBoolean(v: unknown): boolean {
  return v === true;
}

type ChipsControlProps = {
  values: string[];
  placeholder: string;
  onChange: (next: string[]) => void;
};

function ChipsControl({ values, placeholder, onChange }: ChipsControlProps) {
  const [draft, setDraft] = useState("");
  const addChip = (raw: string) => {
    const v = raw.trim();
    if (!v) return;
    if (values.includes(v)) {
      setDraft("");
      return;
    }
    onChange([...values, v]);
    setDraft("");
  };
  const removeChip = (i: number) => {
    onChange(values.filter((_, idx) => idx !== i));
  };
  return (
    <div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
        {values.map((c, i) => (
          <span key={`${c}-${i}`} style={{
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "4px 10px", borderRadius: 999,
            background: T.accentSoft, color: T.ink,
            fontFamily: F, fontSize: 12, fontWeight: 600,
          }}>
            {c}
            <button type="button" aria-label="Remove" onClick={() => removeChip(i)} style={{
              background: "transparent", border: "none", padding: 0, cursor: "pointer",
              color: T.inkMuted, fontSize: 14, lineHeight: 1, fontWeight: 700,
            }}>×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            addChip(draft);
          }
        }}
        onBlur={() => { if (draft.trim()) addChip(draft); }}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box",
          padding: "8px 10px", borderRadius: 8,
          border: `1px solid ${T.border}`,
          fontFamily: F, fontSize: 13, color: T.ink,
          background: "#fff", outline: "none",
        }}
      />
    </div>
  );
}

// VisibilityChips — 3-state chip strip below each field. Multi-select:
// public + agency are sensible together; "private" is exclusive (clicking
// it clears the other two). Empty selection means "use default", which
// the editor renders as a softer neutral state. Saves are debounced
// implicitly by the click model — every click is a write.
export type VisChannel = "public" | "agency" | "private";

function VisibilityChips({
  effective,
  isOverride,
  onChange,
}: {
  /** Current effective visibility — derived from override OR default. */
  effective: VisChannel[];
  /** True when the talent has set an override (vs the inherited default). */
  isOverride: boolean;
  /** Called with the new explicit visibility list, or `[]` to clear back
   *  to the inherited default. */
  onChange: (next: VisChannel[]) => void;
}) {
  const set = new Set(effective);
  const has = (c: VisChannel) => set.has(c);

  const click = (c: VisChannel) => {
    let next: VisChannel[];
    if (c === "private") {
      // Toggle private exclusively.
      next = has("private") ? [] : ["private"];
    } else if (has(c)) {
      next = effective.filter((x) => x !== c && x !== "private");
    } else {
      next = [...effective.filter((x) => x !== "private"), c];
    }
    onChange(next);
  };
  const reset = () => onChange([]);

  // Mirrors primitives.tsx ChannelVisibilityStrip exactly — one compact
  // summary pill that expands to a labelled picker. Same dot colours,
  // descriptions, sizing, so the whole editor reads as one design.
  const DESC: Record<VisChannel, string> = {
    public:  "Discovery + your public profile page",
    agency:  "Coordinators at agencies that represent you",
    private: "Only you (admins for compliance)",
  };
  const DOT: Record<VisChannel, string> = {
    public: "#2E7D5B", agency: "#5B6BA0", private: "#C82828",
  };
  const LABEL: Record<VisChannel, string> = {
    public: "Public", agency: "Agency", private: "Private",
  };
  const channels: VisChannel[] = ["public", "agency", "private"];
  const summary = has("public")
    ? { word: "Public",  dot: DOT.public }
    : has("agency")
      ? { word: "Agency",  dot: DOT.agency }
      : has("private")
        ? { word: "Private", dot: DOT.private }
        : { word: "Hidden", dot: "rgba(11,11,13,0.28)" };

  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-flex" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="true"
        aria-expanded={open}
        title={`Visible to: ${summary.word}${isOverride ? " (custom)" : ""}`}
        style={{
          display: "inline-flex", alignItems: "center", gap: 5,
          padding: "2px 8px", borderRadius: 999,
          border: `1px solid ${open ? T.accent : T.borderSoft}`,
          background: open ? "rgba(15,79,62,0.06)" : "transparent",
          color: T.inkMuted,
          fontFamily: F, fontSize: 10.5, fontWeight: 600, cursor: "pointer",
          letterSpacing: 0.1, whiteSpace: "nowrap",
        }}
      >
        <span aria-hidden style={{
          width: 6, height: 6, borderRadius: "50%", background: summary.dot,
        }} />
        {summary.word}
        {isOverride && (
          <span aria-hidden title="Custom (differs from default)" style={{
            width: 4, height: 4, borderRadius: "50%", background: T.accent,
          }} />
        )}
        <span aria-hidden style={{ fontSize: 8, opacity: 0.55, marginLeft: 1 }}>▾</span>
      </button>
      {open && (
        <div
          role="menu"
          style={{
            position: "absolute", top: "calc(100% + 6px)", right: 0, zIndex: 60,
            minWidth: 244, padding: 6, borderRadius: 12,
            background: "#fff", border: `1px solid ${T.borderSoft}`,
            boxShadow: "0 8px 28px rgba(11,11,13,0.16)", fontFamily: F,
          }}
        >
          <div style={{
            fontSize: 9.5, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: T.inkDim, padding: "4px 8px 6px",
          }}>
            Visible to
          </div>
          {channels.map((c) => {
            const active = has(c);
            return (
              <button
                key={c}
                type="button"
                role="menuitemcheckbox"
                aria-checked={active}
                onClick={() => click(c)}
                style={{
                  width: "100%", display: "flex", alignItems: "flex-start", gap: 9,
                  padding: "7px 8px", borderRadius: 8, textAlign: "left",
                  border: "none", cursor: "pointer",
                  background: active ? "rgba(15,79,62,0.06)" : "transparent",
                }}
              >
                <span aria-hidden style={{
                  width: 8, height: 8, borderRadius: "50%", marginTop: 3, flexShrink: 0,
                  background: active ? DOT[c] : "rgba(11,11,13,0.16)",
                }} />
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{
                    display: "block", fontSize: 12, fontWeight: 600,
                    color: active ? T.ink : T.inkMuted,
                  }}>
                    {LABEL[c]}
                  </span>
                  <span style={{
                    display: "block", fontSize: 10.5, color: T.inkDim,
                    lineHeight: 1.35, marginTop: 1,
                  }}>
                    {DESC[c]}
                  </span>
                </span>
                <span aria-hidden style={{
                  fontSize: 11, color: T.accent, marginTop: 1, opacity: active ? 1 : 0,
                }}>✓</span>
              </button>
            );
          })}
          {isOverride && (
            <button
              type="button"
              onClick={() => { reset(); setOpen(false); }}
              style={{
                width: "100%", marginTop: 4, padding: "7px 8px",
                borderTop: `1px solid ${T.borderSoft}`, background: "transparent",
                border: "none", borderTopWidth: 1, cursor: "pointer",
                fontFamily: F, fontSize: 10.5, fontWeight: 600, color: T.inkMuted,
                textAlign: "left",
              }}
            >
              ↺ Reset to default visibility
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export type FieldEditorProps = {
  field: ResolvedField;
  initialValue: unknown;
  initialVisibility: string[] | null;
  onSave: (value: unknown) => Promise<{ ok: boolean; error?: string }>;
  onSaveVisibility: (next: VisChannel[]) => Promise<{ ok: boolean; error?: string }>;
  /** When the parent already shows the field label (e.g. the collapsible
   *  Details card header is the label + toggle), skip FieldEditor's own
   *  <label> so it isn't duplicated. Status/visibility/control unchanged.
   *  Omitted everywhere else → label renders exactly as before. */
  hideLabel?: boolean;
};

export function FieldEditor({
  field, initialValue, initialVisibility, onSave, onSaveVisibility, hideLabel,
}: FieldEditorProps) {
  const [draft, setDraft] = useState<unknown>(initialValue);
  const [status, setStatus] = useState<FieldStatus>("idle");
  const [error, setError] = useState<string | null>(null);
  // Local visibility state — optimistically updated on chip click. The
  // parent owns the truth; we re-sync via prop change below.
  const [localOverride, setLocalOverride] = useState<string[] | null>(initialVisibility);
  useEffect(() => { setLocalOverride(initialVisibility); }, [initialVisibility]);

  // Reset when initial changes (e.g. external reload)
  useEffect(() => {
    setDraft(initialValue);
    setStatus("idle");
    setError(null);
  }, [initialValue]);

  const lastSavedRef = useRef<unknown>(initialValue);
  const isUnchanged = JSON.stringify(draft) === JSON.stringify(lastSavedRef.current);

  const commit = async (next: unknown) => {
    if (JSON.stringify(next) === JSON.stringify(lastSavedRef.current)) return;
    setStatus("saving");
    setError(null);
    const res = await onSave(next);
    if (res.ok) {
      lastSavedRef.current = next;
      setStatus("saved");
      setTimeout(() => setStatus(s => (s === "saved" ? "idle" : s)), 1500);
    } else {
      // P0: keep the user's draft so they can correct it. Don't reset to
      // lastSavedRef. Surface the error prominently below the input —
      // small status pill alone is too easy to miss.
      setStatus("error");
      setError(res.error ?? "Save failed.");
    }
  };

  // Clear any prior error the moment the user starts editing again, so
  // they get a clean slate on the next attempt.
  const setDraftAndClearError = (next: unknown) => {
    setDraft(next);
    if (status === "error") {
      setStatus("idle");
      setError(null);
    }
  };

  const inputStyle: CSSProperties = {
    width: "100%", boxSizing: "border-box",
    padding: "8px 11px", borderRadius: 7,
    border: `1px solid ${status === "error" ? T.red : T.border}`,
    fontFamily: F, fontSize: 13, color: T.ink,
    // Faint fill — 1:1 with New Inquiry ComposerInput so Specialty
    // fields match the bespoke sections as one surface.
    background: "rgba(11,11,13,0.025)", outline: "none",
    boxShadow: status === "error" ? `0 0 0 2px rgba(200,40,40,0.10)` : "none",
  };

  let control: ReactNode = null;
  const opts = field.options ?? [];

  switch (field.kind) {
    case "text":
      control = (
        <input
          type="text"
          value={asString(draft)}
          onChange={(e) => setDraftAndClearError(e.target.value)}
          onBlur={() => commit(asString(draft).trim() || null)}
          placeholder={field.placeholder ?? ""}
          style={inputStyle}
        />
      );
      break;

    case "textarea": {
      // B4 — live char counter when validation_rules carry maxLength.
      const r = (field.validation_rules ?? {}) as Record<string, unknown>;
      const maxLen = (typeof r.maxLength === "number" ? r.maxLength : undefined)
        ?? (typeof r.max_length === "number" ? r.max_length : undefined)
        ?? (typeof r.max === "number" ? r.max : undefined)
        ?? null;
      const currentLen = asString(draft).length;
      control = (
        <div style={{ position: "relative" }}>
          <textarea
            value={asString(draft)}
            onChange={(e) => setDraftAndClearError(e.target.value)}
            onBlur={() => commit(asString(draft).trim() || null)}
            placeholder={field.placeholder ?? ""}
            rows={3}
            maxLength={maxLen ?? undefined}
            style={{ ...inputStyle, resize: "vertical", lineHeight: 1.4 }}
          />
          {maxLen !== null && (
            <div style={{
              position: "absolute", right: 8, bottom: 6,
              fontSize: 10, color: currentLen > maxLen * 0.9 ? T.amber : T.inkDim,
              fontFamily: F, fontWeight: 600, letterSpacing: 0.2,
              background: "rgba(255,255,255,0.85)", padding: "1px 4px", borderRadius: 3,
            }}>
              {currentLen} / {maxLen}
            </div>
          )}
        </div>
      );
      break;
    }

    case "number": {
      // B5 — show the unit suffix ("years", "guests") inside the field so
      // the number reads as a quantity, not a bare integer.
      const unit = field.unit?.trim();
      control = (
        <div style={{ position: "relative" }}>
          <input
            type="number"
            value={asNumber(draft)}
            onChange={(e) => setDraftAndClearError(e.target.value)}
            onBlur={() => {
              const s = asNumber(draft);
              commit(s === "" ? null : Number(s));
            }}
            placeholder={field.placeholder ?? ""}
            style={unit ? { ...inputStyle, paddingRight: 56 } : inputStyle}
          />
          {unit && (
            <span style={{
              position: "absolute", right: 10, top: "50%",
              transform: "translateY(-50%)",
              fontSize: 11.5, color: T.inkMuted, fontFamily: F,
              fontWeight: 600, pointerEvents: "none",
            }}>{unit}</span>
          )}
        </div>
      );
      break;
    }

    case "date":
      control = (
        <input
          type="date"
          value={asString(draft)}
          onChange={(e) => setDraftAndClearError(e.target.value)}
          onBlur={() => commit(asString(draft) || null)}
          style={inputStyle}
        />
      );
      break;

    case "boolean":
    case "toggle": {
      // B3 — chunky pill toggle matching the rest of the drawer instead
      // of a bare browser checkbox.
      const on = asBoolean(draft);
      control = (
        <button
          type="button"
          role="switch"
          aria-checked={on}
          onClick={() => {
            const next = !on;
            setDraftAndClearError(next);
            commit(next);
          }}
          style={{
            display: "inline-flex", alignItems: "center", gap: 8,
            padding: "5px 5px 5px 12px", borderRadius: 999,
            border: `1.5px solid ${on ? T.accent : T.border}`,
            background: on ? T.accentSoft : "#fff",
            cursor: "pointer", fontFamily: F, fontSize: 12.5, fontWeight: 600,
            color: on ? T.ink : T.inkMuted,
          }}
        >
          {on ? "Yes" : "No"}
          <span style={{
            width: 30, height: 18, borderRadius: 999,
            background: on ? T.accent : "rgba(11,11,13,0.18)",
            position: "relative", transition: "background 0.15s",
            flexShrink: 0,
          }}>
            <span style={{
              position: "absolute", top: 2, left: on ? 14 : 2,
              width: 14, height: 14, borderRadius: "50%", background: "#fff",
              transition: "left 0.15s",
            }} />
          </span>
        </button>
      );
      break;
    }

    case "select": {
      // B2 — chip-row picker matching the drawer's other pickers instead
      // of a native <select>. Falls back to a scrolling row when there
      // are many options.
      const current = asString(draft);
      control = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {opts.length === 0 && (
            <span style={{ fontSize: 11.5, color: T.inkMuted }}>No options configured.</span>
          )}
          {opts.map((o) => {
            const active = current === o;
            return (
              <button
                key={o}
                type="button"
                onClick={() => {
                  const next = active ? null : o;
                  setDraftAndClearError(next ?? "");
                  commit(next);
                }}
                style={{
                  padding: "5px 11px", borderRadius: 999,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : "#fff",
                  color: active ? T.ink : T.inkMuted,
                  fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >{o}</button>
            );
          })}
        </div>
      );
      break;
    }

    case "multiselect": {
      const arr = Array.isArray(draft) ? (draft as string[]) : [];
      const toggle = (opt: string) => {
        const has = arr.includes(opt);
        const next = has ? arr.filter((x) => x !== opt) : [...arr, opt];
        setDraftAndClearError(next);
        commit(next.length === 0 ? null : next);
      };
      control = (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {opts.length === 0 && (
            <span style={{ fontSize: 11.5, color: T.inkMuted }}>No options configured.</span>
          )}
          {opts.map((opt) => {
            const active = arr.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                onClick={() => toggle(opt)}
                style={{
                  padding: "5px 11px", borderRadius: 999,
                  border: `1.5px solid ${active ? T.accent : T.border}`,
                  background: active ? T.accentSoft : "#fff",
                  color: active ? T.ink : T.inkMuted,
                  fontFamily: F, fontSize: 12, fontWeight: 600, cursor: "pointer",
                }}
              >{opt}</button>
            );
          })}
        </div>
      );
      break;
    }

    case "chips": {
      const arr = Array.isArray(draft) ? (draft as string[]) : [];
      control = (
        <ChipsControl
          values={arr}
          placeholder={field.placeholder ?? "Type then press Enter"}
          onChange={(next) => {
            setDraftAndClearError(next);
            commit(next.length === 0 ? null : next);
          }}
        />
      );
      break;
    }

    default:
      // Unknown kind — render as plain text input as a safe fallback.
      control = (
        <input
          type="text"
          value={asString(draft)}
          onChange={(e) => setDraftAndClearError(e.target.value)}
          onBlur={() => commit(asString(draft).trim() || null)}
          placeholder={field.placeholder ?? ""}
          style={inputStyle}
        />
      );
  }

  // Compose the hint line under the input from validation_rules so users
  // see constraints up front instead of discovering them by hitting Save.
  const hint = buildValidationHint(field);
  const locale = readLocale();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 9 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, fontFamily: F, flexWrap: "wrap", rowGap: 4 }}>
        {!hideLabel && (
          <label style={{ fontSize: 12, fontWeight: 600, color: T.ink }}>
            {fieldLabel(field, locale)}
          </label>
        )}
        {field.required_before_publish && (
          <span style={{
            fontSize: 9, fontWeight: 700, padding: "1px 5px", borderRadius: 3,
            background: "rgba(200,40,40,0.10)", color: T.red,
            letterSpacing: 0.4, textTransform: "uppercase",
          }}>Required</span>
        )}
        {!isUnchanged && status === "idle" && (
          <span style={{ fontSize: 10, color: T.inkMuted, marginLeft: 4 }}>· unsaved</span>
        )}
        <StatusPill status={status} error={error} />
        {/* Visibility chips inline, right-aligned across from the label
            (small). Row wraps so they drop below cleanly when narrow. */}
        <div style={{ marginLeft: "auto" }}>
          <VisibilityChips
            effective={(localOverride && localOverride.length > 0
              ? localOverride
              : (field.default_visibility ?? [])
            ).filter((c): c is VisChannel =>
              c === "public" || c === "agency" || c === "private",
            )}
            isOverride={Array.isArray(localOverride) && localOverride.length > 0}
            onChange={async (next) => {
              setLocalOverride(next);
              const res = await onSaveVisibility(next);
              if (!res.ok) {
                setLocalOverride(initialVisibility);
              }
            }}
          />
        </div>
      </div>
      {control}
      {/* Error wins over hint when both are present, so users see the
          actionable message first. Pre-edit hints + post-edit errors
          never overlap. */}
      {status === "error" && error ? (
        <div role="alert" style={{
          fontSize: 11.5, color: T.red, fontFamily: F, fontWeight: 500,
          background: "rgba(200,40,40,0.06)", borderLeft: `3px solid ${T.red}`,
          padding: "6px 10px", borderRadius: 4,
        }}>{error}</div>
      ) : hint ? (
        <div style={{ fontSize: 10.5, color: T.inkMuted, fontFamily: F }}>{hint}</div>
      ) : null}
    </div>
  );
}

// Build a one-line constraint hint from a field's validation_rules + kind.
// Returns null when nothing useful to show.
function buildValidationHint(field: ResolvedField): string | null {
  const r = (field.validation_rules ?? {}) as Record<string, unknown>;
  const num = (k: string): number | null =>
    typeof r[k] === "number" ? (r[k] as number) : null;
  const parts: string[] = [];

  switch (field.kind) {
    case "number": {
      const lo = num("min");
      const hi = num("max");
      if (lo !== null && hi !== null) parts.push(`${lo}–${hi}`);
      else if (lo !== null) parts.push(`min ${lo}`);
      else if (hi !== null) parts.push(`max ${hi}`);
      break;
    }
    case "text":
    case "textarea": {
      const minL = num("minLength") ?? num("min_length");
      const maxL = num("maxLength") ?? num("max_length");
      if (maxL !== null) parts.push(`max ${maxL} chars`);
      if (minL !== null) parts.push(`min ${minL} chars`);
      // "pattern enforced" was jargon with no actionable info (audit #4)
      // — dropped.
      break;
    }
    case "chips": {
      const maxItems = num("maxItems") ?? num("max_items");
      if (maxItems !== null) parts.push(`up to ${maxItems} entries`);
      break;
    }
    // multiselect / select: the option count ("8 options", "pick from
    // 8") was pure noise — the options are rendered right there (audit
    // #4). No hint needed.
  }
  return parts.length === 0 ? null : parts.join(" · ");
}
