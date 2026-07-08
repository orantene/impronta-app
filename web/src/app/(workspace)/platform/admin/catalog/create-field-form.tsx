import { createPlatformFieldAction } from "./actions";

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

const labelStyle: React.CSSProperties = {
  display: "grid",
  gap: 5,
  color: HQ.inkMuted,
  fontSize: 11,
  fontWeight: 650,
};

// name → catalog key + whether the checkbox reads red (danger). Switch on the
// raw name; render the label via t(). Persisted `name`s are DB field flags.
const FIELD_FLAGS: ReadonlyArray<{ name: string; key: string; red?: boolean }> = [
  { name: "default_visibility_public", key: "createFlagPublicDefault" },
  { name: "default_visibility_agency", key: "createFlagAgencyDefault" },
  { name: "show_in_public", key: "createFlagShowPublic" },
  { name: "show_in_directory", key: "createFlagDirectory" },
  { name: "show_in_registration", key: "createFlagRegistration" },
  { name: "show_in_edit_drawer", key: "createFlagEditDrawer" },
  { name: "talent_editable", key: "createFlagTalentEditable" },
  { name: "required_default", key: "createFlagRequiredDefault" },
  { name: "is_searchable", key: "createFlagSearchable" },
  { name: "requires_review_on_change", key: "createFlagReviewOnChange" },
  { name: "is_sensitive", key: "createFlagSensitive", red: true },
  { name: "admin_only", key: "createFlagAdminOnly", red: true },
];

export function CreateFieldForm({
  groups,
  t,
}: {
  groups: Array<{ id: string; name: string; slug: string }>;
  t: Translate;
}) {
  const k = (key: string) => t(`dashboard.platform.catalog.${key}`);
  return (
    <form action={createPlatformFieldAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Label name="field_key" label={k("createFieldKey")} placeholder="model.runway_experience" />
        <Label name="label" label={k("createLabelEn")} placeholder="Runway experience" />
        <Label name="label_es" label={k("createLabelEs")} placeholder="Experiencia en pasarela" />
        <label style={labelStyle}>
          {k("createFieldGroup")}
          <select name="field_group_id" defaultValue="" style={inputStyle}>
            <option value="">{k("createNoGroup")}</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · {group.slug}
              </option>
            ))}
          </select>
        </label>
        <Select label={k("createTier")} name="tier" defaultValue="type-specific" options={["type-specific", "global", "universal"]} />
        <Select label={k("createFieldType")} name="kind" defaultValue="text" options={["text", "textarea", "number", "select", "multiselect", "chips", "date", "toggle"]} />
        <Label name="section" label={k("createSection")} defaultValue="type-specific" />
        <Label name="display_order" label={k("createDisplayOrder")} type="number" defaultValue="100" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Label name="helper" label={k("createHelperEn")} />
        <Label name="helper_es" label={k("createHelperEs")} />
        <Label name="placeholder" label={k("createPlaceholder")} />
      </div>
      <label style={labelStyle}>
        {k("createOptionsJson")}
        <textarea
          name="options_json"
          rows={3}
          placeholder={'[{"value":"yes","label":"Yes","label_es":"Sí"}]'}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: 12, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, background: HQ.cardSoft, fontSize: 11.5 }}>
        {FIELD_FLAGS.map((flag) => (
          <label key={flag.name} style={{ display: "inline-flex", alignItems: "center", gap: 7, color: flag.red ? HQ.red : HQ.inkMuted }}>
            <input
              type="checkbox"
              name={flag.name}
              defaultChecked={flag.name === "default_visibility_agency" || flag.name === "show_in_edit_drawer" || flag.name === "talent_editable"}
            />
            {k(flag.key)}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="submit" style={{ border: "1px solid rgba(93,211,160,0.35)", background: "rgba(93,211,160,0.12)", color: HQ.green, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
          {k("createSubmit")}
        </button>
        <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
          {k("createHint")}
        </span>
      </div>
    </form>
  );
}

function Label({
  label,
  name,
  placeholder,
  defaultValue,
  type = "text",
}: {
  label: string;
  name: string;
  placeholder?: string;
  defaultValue?: string;
  type?: string;
}) {
  return (
    <label style={labelStyle}>
      {label}
      <input name={name} type={type} placeholder={placeholder} defaultValue={defaultValue} style={inputStyle} />
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
