import Link from "next/link";
import {
  removePlatformTaxonomyFieldMappingAction,
  setPlatformTaxonomyFieldMappingAction,
} from "./actions";
import { interpolate } from "@/i18n/interpolate";
import { createTranslator } from "@/i18n/messages";

type Translate = (key: string) => string;

// Fallback translator for consumers that don't yet thread a request-locale `t`
// (e.g. the catalog type-detail view, localized in a later wave). Resolves the
// same catalog keys in English so the panel always renders real copy.
const enFallbackT: Translate = createTranslator("en");

const HQ = {
  cardSoft: "rgba(255,255,255,0.04)",
  borderSoft: "rgba(255,255,255,0.06)",
  ink: "#F5F2EB",
  inkMuted: "rgba(245,242,235,0.62)",
  inkDim: "rgba(245,242,235,0.38)",
  green: "#5DD3A0",
  amber: "#9BA8B7",
  red: "#F36772",
} as const;

const F = '"Inter", system-ui, sans-serif';

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

export type TaxonomyFieldOption = {
  id: string;
  field_key: string;
  label: string;
  tier: string;
  section: string | null;
  deprecated_at: string | null;
};

export type TaxonomyFieldMapping = {
  id: string;
  field_definition_id: string;
  field_key: string;
  field_label: string;
  field_tier: string;
  field_section: string | null;
  field_deprecated: boolean;
  relationship: string;
  display_order: number;
  required_at_registration: boolean;
  required_before_publish: boolean;
  required_before_verification: boolean;
  requires_verification: boolean;
  is_admin_only: boolean;
};

function Check({
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
        display: "inline-flex",
        alignItems: "center",
        gap: 7,
        color: tone === "danger" ? HQ.red : tone === "safe" ? HQ.green : HQ.inkMuted,
        fontSize: 11.5,
      }}
    >
      <input type="checkbox" name={name} defaultChecked={!!defaultChecked} />
      {label}
    </label>
  );
}

function MiniButton({
  children,
  tone = "primary",
}: {
  children: React.ReactNode;
  tone?: "primary" | "danger";
}) {
  return (
    <button
      type="submit"
      style={{
        border: `1px solid ${tone === "danger" ? "rgba(243,103,114,0.35)" : "rgba(93,211,160,0.35)"}`,
        background: tone === "danger" ? "rgba(243,103,114,0.10)" : "rgba(93,211,160,0.12)",
        color: tone === "danger" ? HQ.red : HQ.green,
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

function mappingFlags(mapping: TaxonomyFieldMapping, t: Translate): string {
  const flags: string[] = [];
  if (mapping.required_at_registration) flags.push(t("dashboard.platform.taxonomy.mappingFlagRegistration"));
  if (mapping.required_before_publish) flags.push(t("dashboard.platform.taxonomy.mappingFlagPublishBlocker"));
  if (mapping.required_before_verification) flags.push(t("dashboard.platform.taxonomy.mappingFlagVerification"));
  if (mapping.requires_verification) flags.push(t("dashboard.platform.taxonomy.mappingFlagReview"));
  if (mapping.is_admin_only) flags.push(t("dashboard.platform.taxonomy.mappingFlagAdminOnly"));
  return flags.length > 0 ? flags.join(" · ") : t("dashboard.platform.taxonomy.mappingFlagOptional");
}

export function TaxonomyFieldMappingPanel({
  term,
  mappings,
  fieldOptions,
  t = enFallbackT,
}: {
  term: { id: string; slug: string; name_en: string };
  mappings: TaxonomyFieldMapping[];
  fieldOptions: TaxonomyFieldOption[];
  /** Request-locale translator. Omitted consumers fall back to English. */
  t?: Translate;
}) {
  const activeFieldOptions = fieldOptions.filter((field) => !field.deprecated_at);

  return (
    <div style={{ border: `1px solid ${HQ.borderSoft}`, borderRadius: 12, padding: 12, background: HQ.cardSoft }}>
      <div style={{ color: HQ.ink, fontWeight: 700, fontSize: 13, marginBottom: 4 }}>
        {interpolate(t("dashboard.platform.taxonomy.mappingFieldsFor"), { name: term.name_en })}
      </div>
      <div style={{ color: HQ.inkMuted, fontSize: 11.5, marginBottom: 12 }}>
        {t("dashboard.platform.taxonomy.mappingIntro")}
      </div>

      {mappings.length === 0 ? (
        <div style={{ color: HQ.inkDim, fontSize: 12, marginBottom: 12 }}>
          {t("dashboard.platform.taxonomy.mappingNone")}
        </div>
      ) : (
        <div style={{ display: "grid", gap: 7, marginBottom: 14 }}>
          {mappings.map((mapping) => (
            <div
              key={mapping.id}
              style={{
                display: "grid",
                gridTemplateColumns: "minmax(0, 1fr) 112px 160px auto",
                gap: 10,
                alignItems: "center",
                background: "rgba(0,0,0,0.12)",
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "8px 9px",
                fontSize: 12,
              }}
            >
              <div style={{ minWidth: 0 }}>
                <Link
                  href={`/platform/admin/catalog/${encodeURIComponent(mapping.field_key)}`}
                  style={{ color: HQ.ink, fontWeight: 700, textDecoration: "none" }}
                >
                  {mapping.field_label}
                </Link>
                <div style={{ color: HQ.inkDim, fontFamily: "ui-monospace, monospace", fontSize: 10.5 }}>
                  {mapping.field_key} · {mapping.field_tier}
                  {mapping.field_section ? ` · ${mapping.field_section}` : ""}
                  {mapping.field_deprecated ? ` · ${t("dashboard.platform.taxonomy.mappingArchived")}` : ""}
                </div>
              </div>
              <span style={{ color: mapping.relationship === "required" ? HQ.red : HQ.green, fontWeight: 700 }}>
                {mapping.relationship}
              </span>
              <span style={{ color: mapping.required_before_publish ? HQ.amber : HQ.inkMuted }}>
                {mappingFlags(mapping, t)} · #{mapping.display_order}
              </span>
              <form action={removePlatformTaxonomyFieldMappingAction}>
                <input type="hidden" name="id" value={mapping.id} />
                <input type="hidden" name="return_term" value={term.slug} />
                <MiniButton tone="danger">{t("dashboard.platform.taxonomy.mappingRemove")}</MiniButton>
              </form>
            </div>
          ))}
        </div>
      )}

      <form
        action={setPlatformTaxonomyFieldMappingAction}
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.5fr) 150px 100px",
          gap: 10,
          alignItems: "end",
          paddingTop: 12,
          borderTop: `1px solid ${HQ.borderSoft}`,
        }}
      >
        <input type="hidden" name="taxonomy_term_id" value={term.id} />
        <input type="hidden" name="return_term" value={term.slug} />
        <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
          {t("dashboard.platform.taxonomy.mappingAddUpdate")}
          <select name="field_definition_id" defaultValue="" style={inputStyle}>
            <option value="">{t("dashboard.platform.taxonomy.mappingChooseField")}</option>
            {activeFieldOptions.map((field) => (
              <option key={field.id} value={field.id}>
                {field.label} · {field.field_key} · {field.tier}
              </option>
            ))}
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
          {t("dashboard.platform.taxonomy.mappingRelationship")}
          <select name="relationship" defaultValue="applies" style={inputStyle}>
            <option value="applies">{t("dashboard.platform.taxonomy.mappingRelApplies")}</option>
            <option value="recommended">{t("dashboard.platform.taxonomy.mappingRelRecommended")}</option>
            <option value="required">{t("dashboard.platform.taxonomy.mappingRelRequired")}</option>
          </select>
        </label>
        <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
          {t("dashboard.platform.taxonomy.mappingOrder")}
          <input name="display_order" type="number" defaultValue={100} style={inputStyle} />
        </label>
        <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 14 }}>
          <Check name="required_at_registration" label={t("dashboard.platform.taxonomy.mappingRequiredAtRegistration")} />
          <Check name="required_before_publish" label={t("dashboard.platform.taxonomy.mappingRequiredBeforePublish")} />
          <Check name="required_before_verification" label={t("dashboard.platform.taxonomy.mappingRequiredBeforeVerification")} />
          <Check name="requires_verification" label={t("dashboard.platform.taxonomy.mappingRequiresVerification")} />
          <Check name="is_admin_only" label={t("dashboard.platform.taxonomy.mappingAdminOnly")} tone="danger" />
        </div>
        <div style={{ gridColumn: "1 / -1" }}>
          <MiniButton>{t("dashboard.platform.taxonomy.mappingSave")}</MiniButton>
        </div>
      </form>
    </div>
  );
}
