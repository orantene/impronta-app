import type {
  FieldDetailField,
  FieldDetailRecommendation,
  FieldDetailWorkspace,
} from "../../../catalog-field-detail-data";

const HQ = {
  card: "#16161A",
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
const FD = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

function plural(value: number, singular: string, pluralWord = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : pluralWord}`;
}

function planBreakdown(workspaces: FieldDetailWorkspace[]): string {
  const counts = new Map<string, number>();
  for (const w of workspaces) counts.set(w.plan, (counts.get(w.plan) ?? 0) + 1);
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([plan, count]) => `${count} ${plan}`)
    .join(" · ");
}

function Stat({ label, value, tone }: { label: string; value: string | number; tone?: string }) {
  return (
    <div
      style={{
        background: HQ.cardSoft,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 10,
        padding: "10px 14px",
        minWidth: 110,
      }}
    >
      <div style={{ fontSize: 11, color: HQ.inkMuted, letterSpacing: 0.3 }}>{label}</div>
      <div style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, color: tone ?? HQ.ink, marginTop: 2 }}>
        {value}
      </div>
    </div>
  );
}

function ImpactRow({
  title,
  children,
  tone = "neutral",
  meta,
}: {
  title: string;
  children: React.ReactNode;
  tone?: "good" | "neutral" | "warn" | "danger";
  meta?: string;
}) {
  const color =
    tone === "good"
      ? HQ.green
      : tone === "warn"
        ? HQ.amber
        : tone === "danger"
          ? HQ.red
          : HQ.inkDim;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "12px minmax(0, 1fr)",
        gap: 10,
        padding: "10px 12px",
        borderRadius: 10,
        border: `1px solid ${HQ.borderSoft}`,
        background: HQ.cardSoft,
      }}
    >
      <span
        aria-hidden="true"
        style={{ width: 8, height: 8, borderRadius: 999, background: color, marginTop: 5 }}
      />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 10 }}>
          <div style={{ fontSize: 12.5, fontWeight: 700, color: HQ.ink }}>{title}</div>
          {meta && <div style={{ fontSize: 10.5, color: HQ.inkDim, whiteSpace: "nowrap" }}>{meta}</div>}
        </div>
        <div style={{ fontSize: 11.5, color: HQ.inkMuted, lineHeight: 1.45, marginTop: 3 }}>
          {children}
        </div>
      </div>
    </div>
  );
}

function ImpactWorkspacePill({ w }: { w: FieldDetailWorkspace }) {
  const tags = [
    w.value_count > 0 ? `${plural(w.value_count, "value")}` : null,
    w.has_override ? "override" : null,
    w.required_override === true ? "required" : null,
    w.enabled_override === false ? "disabled" : null,
  ].filter(Boolean);
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 999,
        padding: "4px 8px",
        color: HQ.inkMuted,
        background: "rgba(0,0,0,0.12)",
        fontSize: 11,
      }}
    >
      <strong style={{ color: HQ.ink, fontWeight: 650 }}>
        {w.name === w.tenant_id ? "Unnamed workspace" : w.name}
      </strong>
      <span style={{ color: HQ.inkDim }}>{w.plan}</span>
      {tags.length > 0 && <span style={{ color: HQ.green }}>{tags.join(" · ")}</span>}
    </span>
  );
}

export function ImpactPreview({
  field,
  recommendations,
  workspaces,
  riskCount,
}: {
  field: FieldDetailField;
  recommendations: FieldDetailRecommendation[];
  workspaces: FieldDetailWorkspace[];
  riskCount: number;
}) {
  const tenantRequiredCount = workspaces.filter((w) => w.required_override === true).length;
  const tenantDisabledCount = workspaces.filter((w) => w.enabled_override === false).length;
  const tenantPublicOverrideCount = workspaces.filter((w) => w.show_in_public_override === true).length;
  const tenantAdminOnlyOverrideCount = workspaces.filter((w) => w.admin_only_override === true).length;
  const requiredMappings = recommendations.filter(
    (rec) =>
      rec.relationship === "required" ||
      rec.required_at_registration ||
      rec.required_before_publish ||
      rec.required_before_verification,
  );
  const mappedTermPreview = recommendations
    .slice(0, 5)
    .map((rec) => rec.term_name_en)
    .join(", ");
  const affectedWorkspaces = workspaces
    .filter((w) => w.value_count > 0 || w.has_override)
    .slice(0, 6);
  const fieldIsPubliclyExposed =
    field.show_in_public ||
    field.default_visibility.includes("public") ||
    tenantPublicOverrideCount > 0;
  const fieldIsPublishRelevant =
    field.required_default ||
    tenantRequiredCount > 0 ||
    requiredMappings.some((rec) => rec.required_before_publish);

  return (
    <section style={{ background: HQ.card, border: `1px solid ${HQ.borderSoft}`, borderRadius: 12, padding: 16, fontFamily: F, marginBottom: 16 }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>Impact preview</div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
          Read this before saving platform-level lifecycle, visibility, required, or mapping changes.
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
        <Stat label="Stored values" value={field.total_value_count} tone={field.total_value_count > 0 ? HQ.green : HQ.inkDim} />
        <Stat label="Tenant overrides" value={field.total_override_count} tone={field.total_override_count > 0 ? HQ.amber : HQ.inkDim} />
        <Stat label="Mapped terms" value={recommendations.length} tone={recommendations.length > 0 ? HQ.green : HQ.inkDim} />
        <Stat label="Risk warnings" value={riskCount} tone={riskCount > 0 ? HQ.red : HQ.green} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <ImpactRow title={field.deprecated ? "Restore impact" : "Archive impact"} tone={field.deprecated ? "good" : field.total_value_count > 0 || field.total_override_count > 0 ? "warn" : "neutral"} meta={field.deprecated ? "makes editable again" : "soft archive"}>
          {field.deprecated
            ? "Restoring makes the field eligible for resolver surfaces again, subject to tenant settings, taxonomy mappings, and visibility safety floors."
            : `Archiving hides this field from new profile input and public/directory/registration surfaces. ${plural(field.total_value_count, "stored value")} and ${plural(field.total_override_count, "tenant override")} remain preserved for audit and migration review.`}
        </ImpactRow>
        <ImpactRow title="Public exposure" tone={field.is_sensitive && fieldIsPubliclyExposed ? "danger" : fieldIsPubliclyExposed ? "warn" : "good"} meta={tenantPublicOverrideCount > 0 ? `${tenantPublicOverrideCount} tenant override${tenantPublicOverrideCount === 1 ? "" : "s"}` : undefined}>
          {fieldIsPubliclyExposed
            ? `${field.show_in_public ? "Platform public profile flag is on. " : ""}${field.default_visibility.includes("public") ? "Default visibility includes public. " : ""}${tenantPublicOverrideCount > 0 ? `${tenantPublicOverrideCount} tenant override${tenantPublicOverrideCount === 1 ? "" : "s"} request public exposure. ` : ""}${field.is_sensitive || field.admin_only ? "This conflicts with sensitive/admin-only safety posture and should be cleaned before launch." : "Resolver safety still applies, but public-facing impact should be reviewed."}`
            : "No platform public exposure is configured. Public profile and directory should not render this field unless a future safe override explicitly allows it."}
        </ImpactRow>
        <ImpactRow title="Completion and publish" tone={fieldIsPublishRelevant ? "warn" : "neutral"} meta={requiredMappings.length > 0 ? `${plural(requiredMappings.length, "required mapping")}` : undefined}>
          {fieldIsPublishRelevant
            ? `${field.required_default ? "Field is required by platform default. " : ""}${tenantRequiredCount > 0 ? `${tenantRequiredCount} tenant override${tenantRequiredCount === 1 ? "" : "s"} mark it required. ` : ""}${requiredMappings.length > 0 ? `${requiredMappings.length} taxonomy mapping${requiredMappings.length === 1 ? "" : "s"} can make it required in registration, publish, or verification. ` : ""}Publish blockers should consume the resolver, not a hardcoded shell list.`
            : "This field is not currently a platform default publish blocker. It may still appear as optional profile data when the resolver includes it."}
        </ImpactRow>
        <ImpactRow title="Taxonomy mapping" tone={recommendations.length > 0 ? "good" : field.tier === "type-specific" ? "warn" : "neutral"} meta={field.tier}>
          {recommendations.length > 0
            ? `Mapped to ${plural(recommendations.length, "taxonomy term")}${mappedTermPreview ? `: ${mappedTermPreview}${recommendations.length > 5 ? "..." : ""}` : ""}. These mappings control Details sections for selected talent types.`
            : field.tier === "type-specific"
              ? "Type-specific field has no active taxonomy mapping, so it should not appear in Details until mapped to a talent type."
              : "Universal/global tier can resolve without type mapping, subject to tenant field settings."}
        </ImpactRow>
        <ImpactRow title="Tenant adoption" tone={workspaces.length > 0 ? "warn" : "good"} meta={workspaces.length > 0 ? planBreakdown(workspaces) : undefined}>
          {workspaces.length > 0
            ? `${plural(workspaces.length, "workspace")} already has values or overrides. ${tenantDisabledCount > 0 ? `${tenantDisabledCount} disabled it. ` : ""}${tenantAdminOnlyOverrideCount > 0 ? `${tenantAdminOnlyOverrideCount} mark it admin-only. ` : ""}Changing schema, label, or options affects tenant control-room previews immediately.`
            : "No tenant overrides and no stored values were found. This is a low-risk field to hide, rename, or remap before launch."}
        </ImpactRow>
        <ImpactRow title="Search, directory, registration" tone={field.show_in_directory || field.show_in_registration || field.is_searchable ? "warn" : "neutral"} meta={[field.show_in_directory ? "directory" : null, field.show_in_registration ? "registration" : null, field.is_searchable ? "searchable" : null].filter(Boolean).join(" · ") || undefined}>
          {field.show_in_directory || field.show_in_registration || field.is_searchable
            ? "This field can affect discoverability or onboarding. Verify directory cards, filters, public profile, and registration/self-edit surfaces after changing it."
            : "No directory, registration, or search flag is currently active for this field."}
        </ImpactRow>
      </div>
      {affectedWorkspaces.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HQ.borderSoft}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink, marginBottom: 8 }}>Affected workspace sample</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {affectedWorkspaces.map((w) => (
              <ImpactWorkspacePill key={w.tenant_id} w={w} />
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11.5, color: HQ.inkDim, lineHeight: 1.5 }}>
        This is a deterministic preview from the current engine state. It does not mutate data; saving still writes audit history and refreshes resolver-backed surfaces.
      </div>
    </section>
  );
}
