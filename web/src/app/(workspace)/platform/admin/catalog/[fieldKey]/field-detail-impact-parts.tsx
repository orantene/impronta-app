import type {
  FieldDetailField,
  FieldDetailRecommendation,
  FieldDetailWorkspace,
} from "../../../catalog-field-detail-data";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

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

// Count-aware localized noun phrase. `baseKey` resolves to `${baseKey}One` /
// `${baseKey}Many` catalog entries, each interpolating {count}.
function plural(t: Translate, value: number, baseKey: string): string {
  return interpolate(t(`${K}.${baseKey}${value === 1 ? "One" : "Many"}`), { count: value });
}

// NOTE: `plan` is a persisted enum value (free/studio/agency/network) rendered
// raw here as a compact per-plan tally; the tier labels live in
// dashboard.platform.tier.* but this breakdown is a terse identifier list.
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

function ImpactWorkspacePill({ w, t }: { w: FieldDetailWorkspace; t: Translate }) {
  const tags = [
    w.value_count > 0 ? plural(t, w.value_count, "impactValue") : null,
    w.has_override ? t(`${K}.impactTagOverride`) : null,
    w.required_override === true ? t(`${K}.wsOverrideRequired`) : null,
    w.enabled_override === false ? t(`${K}.wsOverrideDisabled`) : null,
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
        {w.name === w.tenant_id ? t(`${K}.wsUnnamed`) : w.name}
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
  t,
}: {
  field: FieldDetailField;
  recommendations: FieldDetailRecommendation[];
  workspaces: FieldDetailWorkspace[];
  riskCount: number;
  t: Translate;
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
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>{t(`${K}.impactTitle`)}</div>
        <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>
          {t(`${K}.impactIntro`)}
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 10, marginBottom: 14 }}>
        <Stat label={t(`${K}.summaryStoredValues`)} value={field.total_value_count} tone={field.total_value_count > 0 ? HQ.green : HQ.inkDim} />
        <Stat label={t(`${K}.impactTenantOverrides`)} value={field.total_override_count} tone={field.total_override_count > 0 ? HQ.amber : HQ.inkDim} />
        <Stat label={t(`${K}.impactMappedTerms`)} value={recommendations.length} tone={recommendations.length > 0 ? HQ.green : HQ.inkDim} />
        <Stat label={t(`${K}.impactRiskWarnings`)} value={riskCount} tone={riskCount > 0 ? HQ.red : HQ.green} />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
        <ImpactRow title={field.deprecated ? t(`${K}.impactRestoreTitle`) : t(`${K}.impactArchiveTitle`)} tone={field.deprecated ? "good" : field.total_value_count > 0 || field.total_override_count > 0 ? "warn" : "neutral"} meta={field.deprecated ? t(`${K}.impactMakesEditable`) : t(`${K}.impactSoftArchive`)}>
          {field.deprecated
            ? t(`${K}.impactRestoreBody`)
            : interpolate(t(`${K}.impactArchiveBody`), { values: plural(t, field.total_value_count, "impactStoredValue"), overrides: plural(t, field.total_override_count, "impactTenantOverride") })}
        </ImpactRow>
        <ImpactRow title={t(`${K}.impactPublicExposureTitle`)} tone={field.is_sensitive && fieldIsPubliclyExposed ? "danger" : fieldIsPubliclyExposed ? "warn" : "good"} meta={tenantPublicOverrideCount > 0 ? plural(t, tenantPublicOverrideCount, "impactTenantOverride") : undefined}>
          {fieldIsPubliclyExposed
            ? `${field.show_in_public ? t(`${K}.impactPublicFlagOn`) + " " : ""}${field.default_visibility.includes("public") ? t(`${K}.impactPublicDefaultIncludes`) + " " : ""}${tenantPublicOverrideCount > 0 ? interpolate(t(`${K}.${tenantPublicOverrideCount === 1 ? "impactPublicOverrideRequestOne" : "impactPublicOverrideRequestMany"}`), { count: tenantPublicOverrideCount }) + " " : ""}${field.is_sensitive || field.admin_only ? t(`${K}.impactPublicConflict`) : t(`${K}.impactPublicReview`)}`
            : t(`${K}.impactPublicNone`)}
        </ImpactRow>
        <ImpactRow title={t(`${K}.impactCompletionTitle`)} tone={fieldIsPublishRelevant ? "warn" : "neutral"} meta={requiredMappings.length > 0 ? plural(t, requiredMappings.length, "impactRequiredMapping") : undefined}>
          {fieldIsPublishRelevant
            ? `${field.required_default ? t(`${K}.impactCompletionRequiredDefault`) + " " : ""}${tenantRequiredCount > 0 ? interpolate(t(`${K}.${tenantRequiredCount === 1 ? "impactCompletionOverrideRequiredOne" : "impactCompletionOverrideRequiredMany"}`), { count: tenantRequiredCount }) + " " : ""}${requiredMappings.length > 0 ? interpolate(t(`${K}.${requiredMappings.length === 1 ? "impactCompletionMappingOne" : "impactCompletionMappingMany"}`), { count: requiredMappings.length }) + " " : ""}${t(`${K}.impactCompletionResolverNote`)}`
            : t(`${K}.impactCompletionNone`)}
        </ImpactRow>
        <ImpactRow title={t(`${K}.impactTaxonomyTitle`)} tone={recommendations.length > 0 ? "good" : field.tier === "type-specific" ? "warn" : "neutral"} meta={field.tier}>
          {recommendations.length > 0
            ? interpolate(t(`${K}.impactTaxonomyMapped`), { terms: plural(t, recommendations.length, "impactTaxonomyTerm"), preview: mappedTermPreview ? `: ${mappedTermPreview}${recommendations.length > 5 ? "..." : ""}` : "" })
            : field.tier === "type-specific"
              ? t(`${K}.impactTaxonomyTypeSpecific`)
              : t(`${K}.impactTaxonomyUniversal`)}
        </ImpactRow>
        <ImpactRow title={t(`${K}.impactAdoptionTitle`)} tone={workspaces.length > 0 ? "warn" : "good"} meta={workspaces.length > 0 ? planBreakdown(workspaces) : undefined}>
          {workspaces.length > 0
            ? `${interpolate(t(`${K}.${workspaces.length === 1 ? "impactAdoptionHasOne" : "impactAdoptionHasMany"}`), { count: workspaces.length })} ${tenantDisabledCount > 0 ? interpolate(t(`${K}.impactAdoptionDisabled`), { count: tenantDisabledCount }) + " " : ""}${tenantAdminOnlyOverrideCount > 0 ? interpolate(t(`${K}.impactAdoptionAdminOnly`), { count: tenantAdminOnlyOverrideCount }) + " " : ""}${t(`${K}.impactAdoptionChangeNote`)}`
            : t(`${K}.impactAdoptionNone`)}
        </ImpactRow>
        <ImpactRow title={t(`${K}.impactSearchTitle`)} tone={field.show_in_directory || field.show_in_registration || field.is_searchable ? "warn" : "neutral"} meta={[field.show_in_directory ? t(`${K}.impactMetaDirectory`) : null, field.show_in_registration ? t(`${K}.impactMetaRegistration`) : null, field.is_searchable ? t(`${K}.impactMetaSearchable`) : null].filter(Boolean).join(" · ") || undefined}>
          {field.show_in_directory || field.show_in_registration || field.is_searchable
            ? t(`${K}.impactSearchActive`)
            : t(`${K}.impactSearchNone`)}
        </ImpactRow>
      </div>
      {affectedWorkspaces.length > 0 && (
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: `1px solid ${HQ.borderSoft}` }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink, marginBottom: 8 }}>{t(`${K}.impactAffectedSample`)}</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {affectedWorkspaces.map((w) => (
              <ImpactWorkspacePill key={w.tenant_id} w={w} t={t} />
            ))}
          </div>
        </div>
      )}
      <div style={{ marginTop: 12, fontSize: 11.5, color: HQ.inkDim, lineHeight: 1.5 }}>
        {t(`${K}.impactFooter`)}
      </div>
    </section>
  );
}
