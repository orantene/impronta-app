import { createPlatformTaxonomyTermAction } from "./actions";

type Translate = (key: string) => string;

type TaxonomyTermOption = {
  id: string;
  name_en: string;
  term_type: string;
  level: number;
  is_active: boolean;
  archived_at: string | null;
};

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

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  color: HQ.inkMuted,
  fontSize: 11,
  fontWeight: 650,
};

export function CreateTaxonomyTermForm({ allTerms, t }: { allTerms: TaxonomyTermOption[]; t: Translate }) {
  const parentOptions = allTerms.filter((term) =>
    ["parent_category", "category_group", "skill_group", "context_group"].includes(term.term_type)
      && term.is_active
      && !term.archived_at,
  );

  return (
    <form action={createPlatformTaxonomyTermAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Input label={t("dashboard.platform.taxonomy.fieldSlug")} name="slug" />
        <Input label={t("dashboard.platform.taxonomy.fieldNameEn")} name="name_en" />
        <Input label={t("dashboard.platform.taxonomy.fieldNameEs")} name="name_es" />
        <Input label={t("dashboard.platform.taxonomy.fieldPluralName")} name="plural_name" />
        <Select label={t("dashboard.platform.taxonomy.fieldTermType")} name="term_type" defaultValue="talent_type" options={["parent_category", "category_group", "talent_type", "specialty", "skill_group", "skill", "context_group", "context", "credential", "attribute"]} />
        <Input label={t("dashboard.platform.taxonomy.fieldLevel")} name="level" type="number" />
        <Input label={t("dashboard.platform.taxonomy.fieldSortOrder")} name="sort_order" type="number" defaultValue="100" />
        <Input label={t("dashboard.platform.taxonomy.fieldIcon")} name="icon" />
        <label style={{ ...labelStyle, gridColumn: "span 2" }}>
          {t("dashboard.platform.taxonomy.fieldParent")}
          <select name="parent_id" defaultValue="" style={inputStyle}>
            <option value="">{t("dashboard.platform.taxonomy.fieldNoParent")}</option>
            {parentOptions.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {"  ".repeat(Math.max(0, candidate.level - 1))}
                {candidate.name_en} · {candidate.term_type}
              </option>
            ))}
          </select>
        </label>
        <div style={{ gridColumn: "span 2", display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center", padding: 12, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, background: HQ.cardSoft }}>
          <Check name="is_visible_by_default" label={t("dashboard.platform.taxonomy.checkVisibleDefault")} defaultChecked />
          <Check name="is_profile_badge" label={t("dashboard.platform.taxonomy.checkProfileBadge")} defaultChecked />
          <Check name="is_public_filter" label={t("dashboard.platform.taxonomy.checkPublicFilter")} />
          <Check name="is_restricted" label={t("dashboard.platform.taxonomy.checkRestricted")} danger />
        </div>
      </div>
      <Textarea label={t("dashboard.platform.taxonomy.fieldDescription")} name="description" rows={2} />
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Textarea label={t("dashboard.platform.taxonomy.fieldAliases")} name="aliases" rows={3} />
        <Textarea label={t("dashboard.platform.taxonomy.fieldSearchSynonyms")} name="search_synonyms" rows={3} />
        <Textarea label={t("dashboard.platform.taxonomy.fieldAiKeywords")} name="ai_keywords" rows={3} />
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="submit" style={{ border: "1px solid rgba(93,211,160,0.35)", background: "rgba(93,211,160,0.12)", color: HQ.green, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
          {t("dashboard.platform.taxonomy.createBtn")}
        </button>
        <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
          {t("dashboard.platform.taxonomy.createHint")}
        </span>
      </div>
    </form>
  );
}

function Input({
  label,
  name,
  type = "text",
  defaultValue,
}: {
  label: string;
  name: string;
  type?: string;
  defaultValue?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input name={name} type={type} defaultValue={defaultValue} style={inputStyle} />
    </label>
  );
}

function Textarea({ label, name, rows = 3 }: { label: string; name: string; rows?: number }) {
  return (
    <label style={labelStyle}>
      {label}
      <textarea name={name} rows={rows} style={{ ...inputStyle, resize: "vertical" }} />
    </label>
  );
}

function Select({
  label,
  name,
  defaultValue,
  options,
}: {
  label: string;
  name: string;
  defaultValue: string;
  options: string[];
}) {
  return (
    <label style={labelStyle}>
      {label}
      <select name={name} defaultValue={defaultValue} style={inputStyle}>
        {options.map((option) => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </label>
  );
}

function Check({
  name,
  label,
  defaultChecked,
  danger,
}: {
  name: string;
  label: string;
  defaultChecked?: boolean;
  danger?: boolean;
}) {
  return (
    <label style={{ display: "inline-flex", alignItems: "center", gap: 7, color: danger ? HQ.red : HQ.inkMuted, fontSize: 11.5 }}>
      <input type="checkbox" name={name} defaultChecked={!!defaultChecked} />
      {label}
    </label>
  );
}
