import { createPlatformFieldAction } from "./actions";

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

export function CreateFieldForm({
  groups,
}: {
  groups: Array<{ id: string; name: string; slug: string }>;
}) {
  return (
    <form action={createPlatformFieldAction} style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 12 }}>
        <Label name="field_key" label="Field key" placeholder="model.runway_experience" />
        <Label name="label" label="Label EN" placeholder="Runway experience" />
        <Label name="label_es" label="Label ES" placeholder="Experiencia en pasarela" />
        <label style={labelStyle}>
          Field group
          <select name="field_group_id" defaultValue="" style={inputStyle}>
            <option value="">No group</option>
            {groups.map((group) => (
              <option key={group.id} value={group.id}>
                {group.name} · {group.slug}
              </option>
            ))}
          </select>
        </label>
        <Select label="Tier" name="tier" defaultValue="type-specific" options={["type-specific", "global", "universal"]} />
        <Select label="Field type" name="kind" defaultValue="text" options={["text", "textarea", "number", "select", "multiselect", "chips", "date", "toggle"]} />
        <Label name="section" label="Section" defaultValue="type-specific" />
        <Label name="display_order" label="Display order" type="number" defaultValue="100" />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 12 }}>
        <Label name="helper" label="Helper EN" />
        <Label name="helper_es" label="Helper ES" />
        <Label name="placeholder" label="Placeholder" />
      </div>
      <label style={labelStyle}>
        Options JSON
        <textarea
          name="options_json"
          rows={3}
          placeholder={'[{"value":"yes","label":"Yes","label_es":"Sí"}]'}
          style={{ ...inputStyle, resize: "vertical" }}
        />
      </label>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 14, padding: 12, border: `1px solid ${HQ.borderSoft}`, borderRadius: 10, background: HQ.cardSoft, fontSize: 11.5 }}>
        {[
          ["default_visibility_public", "Public default"],
          ["default_visibility_agency", "Agency default"],
          ["show_in_public", "Show public"],
          ["show_in_directory", "Directory"],
          ["show_in_registration", "Registration"],
          ["show_in_edit_drawer", "Edit drawer"],
          ["talent_editable", "Talent editable"],
          ["required_default", "Required default"],
          ["is_searchable", "Searchable"],
          ["requires_review_on_change", "Review on change"],
          ["is_sensitive", "Sensitive"],
          ["admin_only", "Admin only"],
        ].map(([name, label]) => (
          <label key={name} style={{ display: "inline-flex", alignItems: "center", gap: 7, color: label === "Sensitive" || label === "Admin only" ? HQ.red : HQ.inkMuted }}>
            <input
              type="checkbox"
              name={name}
              defaultChecked={name === "default_visibility_agency" || name === "show_in_edit_drawer" || name === "talent_editable"}
            />
            {label}
          </label>
        ))}
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <button type="submit" style={{ border: "1px solid rgba(93,211,160,0.35)", background: "rgba(93,211,160,0.12)", color: HQ.green, borderRadius: 8, padding: "8px 12px", fontSize: 12, fontWeight: 700, fontFamily: F, cursor: "pointer" }}>
          Create field
        </button>
        <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
          After creation, open the field to map it to Model, DJ, Performer, or any taxonomy term.
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
