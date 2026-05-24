import type { FieldDetailRecommendation } from "../../../catalog-field-detail-data";
import { removePlatformFieldRecommendationAction } from "../actions";

const HQ = {
  cardSoft: "rgba(255,255,255,0.04)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';

export const FIELD_TIERS = ["universal", "global", "type-specific"] as const;
export const FIELD_KINDS = [
  "text",
  "textarea",
  "number",
  "select",
  "multiselect",
  "chips",
  "date",
  "toggle",
] as const;
export const FIELD_SECTIONS = [
  "identity",
  "location",
  "about",
  "services",
  "details",
  "logistics",
  "availability",
  "media",
  "albums",
  "polaroids",
  "rates",
  "restrictions",
  "credits",
  "trust",
  "files",
  "agency-fields",
  "admin",
  "type-specific",
  "general",
] as const;

const inputStyle: React.CSSProperties = {
  width: "100%",
  border: `1px solid ${HQ.borderSoft}`,
  borderRadius: 8,
  background: "#101014",
  color: HQ.ink,
  padding: "8px 10px",
  fontSize: 12.5,
  fontFamily: F,
};

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  fontSize: 11,
  color: HQ.inkMuted,
  fontWeight: 600,
};

export function FieldInput({
  label,
  name,
  defaultValue,
  placeholder,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        style={inputStyle}
      />
    </label>
  );
}

export function FieldTextarea({
  label,
  name,
  defaultValue,
  placeholder,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  placeholder?: string;
  rows?: number;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        placeholder={placeholder}
        rows={rows}
        style={{ ...inputStyle, resize: "vertical" }}
      />
    </label>
  );
}

export function FieldSelect({
  label,
  name,
  defaultValue,
  children,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  children: React.ReactNode;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select name={name} defaultValue={defaultValue ?? ""} style={inputStyle}>
        {children}
      </select>
    </label>
  );
}

export function Check({
  name,
  label,
  defaultChecked,
  tone,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  tone?: "danger" | "safe";
}) {
  return (
    <label
      style={{
        display: "flex",
        alignItems: "center",
        gap: 7,
        fontSize: 11.5,
        color: tone === "danger" ? HQ.red : tone === "safe" ? HQ.green : HQ.inkMuted,
      }}
    >
      <input name={name} type="checkbox" defaultChecked={!!defaultChecked} />
      {label}
    </label>
  );
}

export function SubmitButton({
  children,
  tone = "primary",
}: {
  children: React.ReactNode;
  tone?: "primary" | "danger" | "neutral";
}) {
  const palette =
    tone === "danger"
      ? { border: "rgba(243,103,114,0.35)", bg: "rgba(243,103,114,0.10)", color: HQ.red }
      : tone === "neutral"
        ? { border: HQ.borderSoft, bg: HQ.cardSoft, color: HQ.ink }
        : { border: "rgba(93,211,160,0.35)", bg: "rgba(93,211,160,0.12)", color: HQ.green };
  return (
    <button
      type="submit"
      style={{
        border: `1px solid ${palette.border}`,
        background: palette.bg,
        color: palette.color,
        borderRadius: 8,
        padding: "8px 12px",
        fontSize: 12,
        fontWeight: 700,
        fontFamily: F,
        cursor: "pointer",
      }}
    >
      {children}
    </button>
  );
}

export function SaveNotice({ saved, error }: { saved?: string; error?: string }) {
  if (!saved && !error) return null;
  const ok = !!saved;
  return (
    <div
      role={ok ? "status" : "alert"}
      style={{
        border: `1px solid ${ok ? "rgba(93,211,160,0.28)" : "rgba(243,103,114,0.32)"}`,
        background: ok ? "rgba(93,211,160,0.10)" : "rgba(243,103,114,0.10)",
        color: ok ? HQ.green : HQ.red,
        borderRadius: 10,
        padding: "9px 12px",
        fontSize: 12.5,
        marginBottom: 14,
      }}
    >
      {ok ? `Saved ${saved}.` : error}
    </div>
  );
}

export function optionsJson(value: unknown): string {
  if (value == null) return "";
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return "";
  }
}

export function MappingRow({
  rec,
  fieldKey,
}: {
  rec: FieldDetailRecommendation;
  fieldKey: string;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(0, 1fr) 120px 160px auto",
        gap: 10,
        alignItems: "center",
        padding: "8px 0",
        borderTop: `1px solid ${HQ.borderSoft}`,
        fontSize: 12,
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: HQ.ink, fontWeight: 650 }}>{rec.term_name_en}</div>
        <div style={{ color: HQ.inkDim, fontFamily: "ui-monospace, monospace", fontSize: 10.5 }}>
          {rec.term_slug} · level {rec.level} · {rec.term_type}
        </div>
      </div>
      <span style={{ color: rec.relationship === "required" ? HQ.red : HQ.green }}>
        {rec.relationship}
      </span>
      <span style={{ color: HQ.inkMuted }}>
        {rec.required_before_publish ? "blocks publish" : "optional"} · #{rec.display_order}
      </span>
      <form action={removePlatformFieldRecommendationAction}>
        <input type="hidden" name="id" value={rec.id} />
        <input type="hidden" name="field_key" value={fieldKey} />
        <SubmitButton tone="danger">Remove</SubmitButton>
      </form>
    </div>
  );
}
