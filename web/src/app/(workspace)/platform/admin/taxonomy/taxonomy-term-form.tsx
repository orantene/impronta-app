import {
  movePlatformTaxonomyTermAction,
  setPlatformTaxonomyLifecycleAction,
  updatePlatformTaxonomyTermAction,
} from "./actions";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;

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

type TaxonomyTermFormTerm = {
  id: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  plural_name: string | null;
  description: string | null;
  icon: string | null;
  term_type: string;
  level: number;
  parent_id: string | null;
  sort_order: number;
  aliases: string[];
  search_synonyms: string[];
  ai_keywords: string[];
  is_active: boolean;
  archived_at: string | null;
  is_public_filter: boolean;
  is_visible_by_default: boolean;
  is_profile_badge: boolean;
  is_restricted: boolean;
  is_generic_fallback: boolean;
  restriction_level: string | null;
  tenant_count: number;
};

function Input({
  label,
  name,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  defaultValue?: string | number | null;
  type?: string;
}) {
  return (
    <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
      {label}
      <input name={name} type={type} defaultValue={defaultValue ?? ""} style={inputStyle} />
    </label>
  );
}

function Textarea({
  label,
  name,
  defaultValue,
  rows = 3,
}: {
  label: string;
  name: string;
  defaultValue?: string | null;
  rows?: number;
}) {
  return (
    <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
      {label}
      <textarea
        name={name}
        defaultValue={defaultValue ?? ""}
        rows={rows}
        style={{ ...inputStyle, resize: "vertical" }}
      />
    </label>
  );
}

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

function listText(values: string[]): string {
  return values.join("\n");
}

export function TaxonomyTermForm({
  term,
  allTerms,
  open = false,
  t,
}: {
  term: TaxonomyTermFormTerm;
  allTerms: TaxonomyTermFormTerm[];
  open?: boolean;
  t: Translate;
}) {
  const status = term.archived_at
    ? t("dashboard.platform.taxonomy.statusArchived")
    : term.is_active
      ? t("dashboard.platform.taxonomy.statusActive")
      : t("dashboard.platform.taxonomy.statusInactive");
  const statusColor = term.archived_at || !term.is_active ? HQ.red : HQ.green;

  return (
    <details open={open} style={{ borderTop: `1px solid ${HQ.borderSoft}`, padding: "10px 0" }}>
      <summary
        style={{
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 10,
          listStyle: "none",
        }}
      >
        <span style={{ width: 24, color: HQ.inkDim, fontSize: 12 }}>L{term.level}</span>
        <span style={{ minWidth: 24, textAlign: "center" }}>{term.icon ?? "•"}</span>
        <span style={{ flex: 1, color: HQ.ink, fontWeight: 700 }}>{term.name_en}</span>
        <span style={{ color: HQ.inkDim, fontFamily: "ui-monospace, monospace", fontSize: 10.5 }}>{term.slug}</span>
        <span style={{ color: statusColor, fontSize: 10.5, fontWeight: 800, textTransform: "uppercase" }}>{status}</span>
        {term.is_public_filter && <span style={{ color: HQ.green, fontSize: 10.5, fontWeight: 800 }}>{t("dashboard.platform.taxonomy.badgePublicFilter")}</span>}
        {term.is_restricted && <span style={{ color: HQ.red, fontSize: 10.5, fontWeight: 800 }}>{t("dashboard.platform.taxonomy.badgeRestricted")}</span>}
      </summary>

      <div style={{ marginTop: 12, paddingLeft: 34, display: "grid", gap: 12 }}>
        <form action={updatePlatformTaxonomyTermAction} style={{ display: "grid", gap: 12 }}>
          <input type="hidden" name="id" value={term.id} />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <Input label={t("dashboard.platform.taxonomy.fieldSlug")} name="slug" defaultValue={term.slug} />
            <Input label={t("dashboard.platform.taxonomy.fieldNameEn")} name="name_en" defaultValue={term.name_en} />
            <Input label={t("dashboard.platform.taxonomy.fieldNameEs")} name="name_es" defaultValue={term.name_es} />
            <Input label={t("dashboard.platform.taxonomy.fieldPluralName")} name="plural_name" defaultValue={term.plural_name} />
            <Input label={t("dashboard.platform.taxonomy.fieldIcon")} name="icon" defaultValue={term.icon} />
            <Input label={t("dashboard.platform.taxonomy.fieldSortOrder")} name="sort_order" type="number" defaultValue={term.sort_order} />
            <Input label={t("dashboard.platform.taxonomy.fieldTermType")} name="term_type" defaultValue={term.term_type} />
            <Input label={t("dashboard.platform.taxonomy.fieldLevel")} name="level" type="number" defaultValue={term.level} />
            <label style={{ display: "grid", gap: 5, color: HQ.inkMuted, fontSize: 11, fontWeight: 650 }}>
              {t("dashboard.platform.taxonomy.fieldParent")}
              <select name="parent_id" defaultValue={term.parent_id ?? ""} style={inputStyle}>
                <option value="">{t("dashboard.platform.taxonomy.fieldNoParent")}</option>
                {allTerms
                  .filter((candidate) => candidate.id !== term.id)
                  .map((candidate) => (
                    <option key={candidate.id} value={candidate.id}>
                      {"  ".repeat(Math.max(0, candidate.level - 1))}
                      {candidate.name_en} · L{candidate.level}
                    </option>
                  ))}
              </select>
            </label>
          </div>

          <Textarea label={t("dashboard.platform.taxonomy.fieldDescription")} name="description" defaultValue={term.description} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
            <Textarea label={t("dashboard.platform.taxonomy.fieldAliases")} name="aliases" defaultValue={listText(term.aliases)} rows={4} />
            <Textarea label={t("dashboard.platform.taxonomy.fieldSearchSynonyms")} name="search_synonyms" defaultValue={listText(term.search_synonyms)} rows={4} />
            <Textarea label={t("dashboard.platform.taxonomy.fieldAiKeywords")} name="ai_keywords" defaultValue={listText(term.ai_keywords)} rows={4} />
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: 12, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, background: HQ.cardSoft }}>
            <Check name="is_active" label={t("dashboard.platform.taxonomy.checkActive")} defaultChecked={term.is_active} tone="safe" />
            <Check name="is_public_filter" label={t("dashboard.platform.taxonomy.checkPublicFilter")} defaultChecked={term.is_public_filter} />
            <Check name="is_visible_by_default" label={t("dashboard.platform.taxonomy.checkVisibleDefault")} defaultChecked={term.is_visible_by_default} />
            <Check name="is_profile_badge" label={t("dashboard.platform.taxonomy.checkProfileBadge")} defaultChecked={term.is_profile_badge} />
            <Check name="is_restricted" label={t("dashboard.platform.taxonomy.checkRestricted")} defaultChecked={term.is_restricted} tone="danger" />
            <Check name="is_generic_fallback" label={t("dashboard.platform.taxonomy.checkGenericFallback")} defaultChecked={term.is_generic_fallback} />
            <Input label={t("dashboard.platform.taxonomy.fieldRestrictionLevel")} name="restriction_level" defaultValue={term.restriction_level} />
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <button type="submit" style={{ border: "1px solid rgba(93,211,160,0.35)", background: "rgba(93,211,160,0.12)", color: HQ.green, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
              {t("dashboard.platform.taxonomy.saveTermBtn")}
            </button>
            <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
              {interpolate(
                term.tenant_count === 1
                  ? t("dashboard.platform.taxonomy.tenantOverrideOne")
                  : t("dashboard.platform.taxonomy.tenantOverrideMany"),
                { count: term.tenant_count },
              )}
            </span>
          </div>
        </form>

        <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8 }}>
          <form action={movePlatformTaxonomyTermAction}>
            <input type="hidden" name="id" value={term.id} />
            <input type="hidden" name="direction" value="up" />
            <button type="submit" style={{ border: `1px solid ${HQ.borderSoft}`, background: HQ.cardSoft, color: HQ.inkMuted, borderRadius: 8, padding: "7px 10px", fontSize: 11.5, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
              {t("dashboard.platform.taxonomy.moveUp")}
            </button>
          </form>
          <form action={movePlatformTaxonomyTermAction}>
            <input type="hidden" name="id" value={term.id} />
            <input type="hidden" name="direction" value="down" />
            <button type="submit" style={{ border: `1px solid ${HQ.borderSoft}`, background: HQ.cardSoft, color: HQ.inkMuted, borderRadius: 8, padding: "7px 10px", fontSize: 11.5, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
              {t("dashboard.platform.taxonomy.moveDown")}
            </button>
          </form>
          <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
            {t("dashboard.platform.taxonomy.orderingHint")}
          </span>
        </div>

        <form action={setPlatformTaxonomyLifecycleAction}>
          <input type="hidden" name="id" value={term.id} />
          <input type="hidden" name="mode" value={term.archived_at ? "restore" : "archive"} />
          <button type="submit" style={{ border: `1px solid ${term.archived_at ? "rgba(93,211,160,0.35)" : "rgba(243,103,114,0.35)"}`, background: term.archived_at ? "rgba(93,211,160,0.12)" : "rgba(243,103,114,0.10)", color: term.archived_at ? HQ.green : HQ.red, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
            {term.archived_at ? t("dashboard.platform.taxonomy.restoreTermBtn") : t("dashboard.platform.taxonomy.archiveTermBtn")}
          </button>
        </form>
      </div>
    </details>
  );
}
