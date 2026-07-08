// Platform HQ · Catalog · per-field detail VIEW.
// Shared server-component body rendered by BOTH the full-page route
// ([fieldKey]/page.tsx) and the intercepting drawer (@drawer/(.)[fieldKey]).
// `variant` only toggles the breadcrumb — the drawer chrome supplies its own
// close affordance, so the page variant shows "← Catalog Map" and the drawer
// variant omits it. All mutation forms post to the same server actions, which
// redirect back to /catalog/[fieldKey]?saved=… (re-intercepted → drawer stays
// open with the save notice).

import Link from "next/link";
import {
  type PlatformCatalogFieldDetail,
  type FieldDetailField,
  type FieldDetailRisk,
  type FieldDetailWorkspace,
} from "../../../catalog-field-detail-data";
import {
  deletePlatformFieldAction,
  setPlatformFieldLifecycleAction,
  updatePlatformFieldAction,
  updatePlatformFieldRecommendationAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import {
  Check,
  FIELD_KINDS,
  FIELD_SECTIONS,
  FIELD_TIERS,
  FieldInput,
  FieldSelect,
  FieldTextarea,
  MappingRow,
  SaveNotice,
  SubmitButton,
  optionsJson,
} from "./field-detail-editor-parts";
import { AuditHistory } from "./field-detail-audit-parts";
import { ImpactPreview } from "./field-detail-impact-parts";
import { CopyableId } from "../copyable-id";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

const HQ = {
  card: "#16161A",
  cardSoft: "rgba(255,255,255,0.04)",
  border: "rgba(255,255,255,0.10)",
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

function HqCard({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: HQ.card,
        border: `1px solid ${HQ.borderSoft}`,
        borderRadius: 12,
        padding: 16,
        fontFamily: F,
        marginBottom: 16,
      }}
    >
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontFamily: FD, fontSize: 15, fontWeight: 600, color: HQ.ink }}>
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: 12, color: HQ.inkMuted, marginTop: 2 }}>{subtitle}</div>
        )}
      </div>
      {children}
    </section>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: string;
}) {
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
      <div
        style={{
          fontFamily: FD,
          fontSize: 22,
          fontWeight: 600,
          color: tone ?? HQ.ink,
          marginTop: 2,
        }}
      >
        {value}
      </div>
    </div>
  );
}

// enum → catalog key; render label via t(), switch on the raw union.
const VIS_LABEL_KEYS: Record<FieldDetailField["visibility"], string> = {
  public: "visPublic",
  admin: "visAdmin",
  hidden: "visHidden",
};

function VisChip({ v, t }: { v: FieldDetailField["visibility"]; t: Translate }) {
  const meta =
    v === "public"
      ? { label: t(`${K}.visPublic`), c: HQ.green }
      : v === "admin"
        ? { label: t(`${K}.visAdmin`), c: HQ.amber }
        : { label: t(`${K}.visHidden`), c: HQ.inkDim };
  return (
    <span
      style={{
        fontSize: 10.5,
        fontWeight: 700,
        color: meta.c,
        border: `1px solid ${meta.c}33`,
        borderRadius: 999,
        padding: "1px 7px",
        whiteSpace: "nowrap",
      }}
    >
      {meta.label}
    </span>
  );
}

const RISK_TONE: Record<FieldDetailRisk["kind"], string> = {
  "sensitive-but-public": HQ.red,
  "admin-but-public": HQ.red,
  "deprecated-with-values": HQ.amber,
  "deprecated-active-overrides": HQ.amber,
  unused: HQ.inkMuted,
};

// enum → catalog key; render label via t(), switch on the raw kind.
const RISK_LABEL_KEYS: Record<FieldDetailRisk["kind"], string> = {
  "sensitive-but-public": "riskSensitivePublic",
  "admin-but-public": "riskAdminPublic",
  "deprecated-with-values": "riskDeprecatedValues",
  "deprecated-active-overrides": "riskDeprecatedOverrides",
  unused: "riskUnused",
};

function summariseOverride(w: FieldDetailWorkspace, t: Translate): string {
  const parts: string[] = [];
  if (w.enabled_override === false) parts.push(t(`${K}.wsOverrideDisabled`));
  if (w.required_override === true) parts.push(t(`${K}.wsOverrideRequired`));
  if (w.required_override === false) parts.push(t(`${K}.wsOverrideOptional`));
  if (w.custom_label) parts.push(interpolate(t(`${K}.wsOverrideLabel`), { label: w.custom_label }));
  if (w.custom_helper) parts.push(t(`${K}.wsOverrideCustomHelper`));
  if (w.show_in_public_override === true) parts.push(t(`${K}.wsOverridePublic`));
  if (w.show_in_public_override === false) parts.push(t(`${K}.wsOverrideHiddenPublic`));
  if (w.admin_only_override === true) parts.push(t(`${K}.wsOverrideAdminOnly`));
  return parts.length === 0 ? t(`${K}.wsOverrideNoneLegacy`) : parts.join(" · ");
}

function WorkspaceRow({ w, isFirst, t }: { w: FieldDetailWorkspace; isFirst: boolean; t: Translate }) {
  const planTone =
    w.plan === "agency" || w.plan === "network"
      ? HQ.green
      : w.plan === "studio"
        ? HQ.amber
        : HQ.inkMuted;
  // Seed/dummy tenants often lack display_name + slug + status. The loader
  // falls back to tenant_id for name+slug and "unknown" for status. Detect
  // that fallback and render gracefully instead of leaking raw UUIDs.
  const isUnnamed = w.name === w.tenant_id;
  const hasRealSlug = w.slug !== w.tenant_id;
  const hasRealStatus = w.status !== "unknown" && w.status !== "active";
  return (
    <Link
      href={`/platform/admin/tenants/${w.tenant_id}/catalog`}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "8px 10px",
        borderTop: isFirst ? "none" : `1px solid ${HQ.borderSoft}`,
        fontSize: 12.5,
        opacity: w.status === "active" ? 1 : 0.7,
        textDecoration: "none",
        color: "inherit",
      }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span
            style={{
              fontWeight: 600,
              color: isUnnamed ? HQ.inkDim : HQ.ink,
              fontStyle: isUnnamed ? "italic" : "normal",
            }}
          >
            {isUnnamed ? t(`${K}.wsUnnamed`) : w.name}
          </span>
          {isUnnamed && (
            <span
              style={{
                fontSize: 10,
                color: HQ.inkDim,
                fontFamily: "ui-monospace, monospace",
              }}
              title={w.tenant_id}
            >
              {`${w.tenant_id.slice(0, 4)}…${w.tenant_id.slice(-4)}`}
            </span>
          )}
          <span
            style={{
              fontSize: 9.5,
              fontWeight: 700,
              padding: "1px 5px",
              borderRadius: 4,
              background: HQ.cardSoft,
              color: HQ.inkMuted,
              textTransform: "uppercase",
              letterSpacing: 0.4,
            }}
          >
            {w.entity_type}
          </span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: planTone }}>
            {w.plan}
          </span>
          {!w.has_override && (
            <span
              style={{
                fontSize: 9.5,
                fontWeight: 700,
                padding: "1px 5px",
                borderRadius: 4,
                background: HQ.cardSoft,
                color: HQ.inkDim,
                letterSpacing: 0.3,
              }}
            >
              {t(`${K}.wsNoOverride`)}
            </span>
          )}
          {hasRealStatus && (
            <span style={{ fontSize: 9.5, fontWeight: 700, color: HQ.red }}>
              {w.status.toUpperCase()}
            </span>
          )}
        </div>
        <div style={{ fontSize: 10.5, color: HQ.inkMuted, marginTop: 2 }}>
          {w.has_override ? summariseOverride(w, t) : t(`${K}.wsUsingDefaults`)}
        </div>
      </div>
      {/* Talents with a value */}
      <div style={{ textAlign: "right", minWidth: 56 }}>
        <div
          style={{
            fontFamily: "ui-monospace, monospace",
            fontSize: 15,
            fontWeight: 600,
            color: w.value_count > 0 ? HQ.green : HQ.inkDim,
          }}
        >
          {w.value_count}
        </div>
        <div style={{ fontSize: 9.5, color: HQ.inkDim, marginTop: 1 }}>{t(`${K}.wsTalents`)}</div>
      </div>
      {hasRealSlug && (
        <span
          style={{
            fontSize: 10.5,
            color: HQ.inkDim,
            fontFamily: "ui-monospace, monospace",
            minWidth: 80,
            textAlign: "right",
          }}
        >
          {w.slug}
        </span>
      )}
    </Link>
  );
}

export function FieldDetailView({
  detail,
  decoded,
  saved,
  error,
  variant = "page",
  t,
}: {
  detail: PlatformCatalogFieldDetail;
  decoded: string;
  saved?: string;
  error?: string;
  variant?: "page" | "drawer";
  t: Translate;
}) {
  // Breadcrumb only in full-page mode; the drawer has its own close button.
  const breadcrumb =
    variant === "page" ? (
      <div style={{ marginBottom: 16, fontFamily: F, fontSize: 12 }}>
        <Link
          href="/platform/admin/catalog"
          style={{ color: HQ.inkMuted, textDecoration: "none" }}
        >
          {t(`${K}.detailBackToFields`)}
        </Link>
      </div>
    ) : null;

  if (!detail.ok) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>{t(`${K}.detailTitle`)}</h1>
        <HqCard title={t(`${K}.detailUnavailableTitle`)}>
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            {t(`${K}.detailUnavailableBody`)}
          </div>
        </HqCard>
      </div>
    );
  }
  if (!detail.field) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>{t(`${K}.detailNotFoundTitle`)}</h1>
        <HqCard title={t(`${K}.detailNotFoundCardTitle`)}>
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            <span style={{ fontFamily: "ui-monospace, monospace" }}>{decoded}</span>{" "}
            {t(`${K}.detailNotFoundBody`)} <code>profile_field_definitions</code>.
          </div>
        </HqCard>
      </div>
    );
  }

  const f = detail.field;
  const fieldOptions = optionsJson(f.options);

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {breadcrumb}
      <SaveNotice saved={saved} error={error} t={t} />

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 4 }}>
        <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
          {f.label}
          {f.deprecated && (
            <span
              style={{
                marginLeft: 10,
                fontSize: 11,
                fontWeight: 700,
                color: HQ.red,
                verticalAlign: "middle",
              }}
            >
              {t(`${K}.detailDeprecatedBadge`)}
            </span>
          )}
        </h1>
        <div style={{ display: "flex", gap: 8 }}>
          <Link
            href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}/export?format=csv`}
            style={{ fontSize: 11, fontWeight: 600, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            {t(`${K}.detailExportCsv`)}
          </Link>
          <span style={{ fontSize: 11, color: HQ.inkDim }}>·</span>
          <Link
            href={`/platform/admin/catalog/${encodeURIComponent(f.field_key)}/export?format=json`}
            style={{ fontSize: 11, fontWeight: 600, color: HQ.green, textDecoration: "none", letterSpacing: 0.2 }}
          >
            {t(`${K}.detailExportJson`)}
          </Link>
        </div>
      </div>
      <div
        style={{
          fontSize: 12,
          color: HQ.inkMuted,
          marginBottom: 16,
          fontFamily: "ui-monospace, monospace",
        }}
      >
        {f.field_key}
        {" · "}
        {f.field_group_name ? `${f.field_group_name} · ` : ""}
        {f.tier}
        {f.section ? ` · ${f.section}` : ""}
      </div>
      <div style={{ marginBottom: 16 }}>
        <CopyableId id={f.id} label={interpolate(t(`${K}.detailIdLabel`), { id: f.id.slice(0, 8) })} />
      </div>

      <HqCard title={t(`${K}.summaryTitle`)}>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
          <Stat label={t(`${K}.summaryVisibility`)} value={t(`${K}.${VIS_LABEL_KEYS[f.visibility]}`)} />
          <Stat label={t(`${K}.summaryWorkspacesOverriding`)} value={f.total_override_count} />
          <Stat
            label={t(`${K}.summaryStoredValues`)}
            value={f.total_value_count}
            tone={f.deprecated && f.total_value_count > 0 ? HQ.amber : undefined}
          />
          <Stat
            label={t(`${K}.summaryTenantsWithValues`)}
            value={f.tenants_with_values}
            tone={f.tenants_with_values > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label={t(`${K}.summaryRisks`)}
            value={detail.risks.length}
            tone={detail.risks.length ? HQ.red : HQ.green}
          />
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
          <VisChip v={f.visibility} t={t} />
          {f.required_default && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.amber }}>
              {t(`${K}.summaryBadgeRequiredDefault`)}
            </span>
          )}
          {f.is_sensitive && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.red }}>{t(`${K}.rowSensitive`)}</span>
          )}
          {f.admin_only && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.amber }}>{t(`${K}.summaryBadgeAdminOnly`)}</span>
          )}
          {f.show_in_public && (
            <span style={{ fontSize: 10.5, fontWeight: 700, color: HQ.green }}>
              show_in_public
            </span>
          )}
        </div>
        {f.helper && (
          <div
            style={{
              fontSize: 12.5,
              color: HQ.inkMuted,
              fontStyle: "italic",
              borderLeft: `2px solid ${HQ.borderSoft}`,
              paddingLeft: 10,
            }}
          >
            “{f.helper}”
          </div>
        )}
      </HqCard>

      <HqCard
        title={t(`${K}.engineEditorTitle`)}
        subtitle={t(`${K}.engineEditorSubtitle`)}
      >
        <form action={updatePlatformFieldAction} style={{ display: "grid", gap: 14 }}>
          <input type="hidden" name="id" value={f.id} />
          <input type="hidden" name="current_field_key" value={f.field_key} />

          <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12 }}>
            <FieldInput label={t(`${K}.createFieldKey`)} name="field_key" defaultValue={f.field_key} />
            <FieldSelect label={t(`${K}.createFieldGroup`)} name="field_group_id" defaultValue={f.field_group_id}>
              <option value="">{t(`${K}.ungrouped`)}</option>
              {detail.fieldGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name_en}{g.is_active ? "" : ` ${t(`${K}.engineArchivedSuffix`)}`}
                </option>
              ))}
            </FieldSelect>
            <FieldInput label={t(`${K}.createLabelEn`)} name="label" defaultValue={f.label} />
            <FieldInput label={t(`${K}.createLabelEs`)} name="label_es" defaultValue={f.label_es} />
            <FieldTextarea label={t(`${K}.createHelperEn`)} name="helper" defaultValue={f.helper} />
            <FieldTextarea label={t(`${K}.createHelperEs`)} name="helper_es" defaultValue={f.helper_es} />
            <FieldInput label={t(`${K}.createPlaceholder`)} name="placeholder" defaultValue={f.placeholder} />
            <FieldInput label={t(`${K}.engineUnit`)} name="unit" defaultValue={f.unit} placeholder={t(`${K}.engineUnitPlaceholder`)} />
            <FieldSelect label={t(`${K}.createTier`)} name="tier" defaultValue={f.tier}>
              {FIELD_TIERS.map((tier) => (
                <option key={tier} value={tier}>{tier}</option>
              ))}
            </FieldSelect>
            <FieldSelect label={t(`${K}.engineInputType`)} name="kind" defaultValue={f.kind}>
              {FIELD_KINDS.map((kind) => (
                <option key={kind} value={kind}>{kind}</option>
              ))}
            </FieldSelect>
            <FieldSelect label={t(`${K}.engineEditorSection`)} name="section" defaultValue={f.section}>
              {[...new Set([...FIELD_SECTIONS, f.section ?? ""])].filter(Boolean).map((section) => (
                <option key={section} value={section}>{section}</option>
              ))}
            </FieldSelect>
            <FieldInput label={t(`${K}.engineSubsection`)} name="subsection" defaultValue={f.subsection} />
            <FieldInput label={t(`${K}.engineDisplayOrder`)} name="display_order" type="number" defaultValue={f.display_order} />
            <FieldInput label={t(`${K}.engineMinimumCount`)} name="count_min" type="number" defaultValue={f.count_min} />
          </div>

          <FieldTextarea
            label={t(`${K}.createOptionsJson`)}
            name="options_json"
            defaultValue={fieldOptions}
            placeholder='["Option A", "Option B"]'
            rows={fieldOptions ? 8 : 3}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
              gap: 12,
              padding: 12,
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              background: HQ.cardSoft,
            }}
          >
            <div style={{ display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink }}>{t(`${K}.engineDefaultVisibility`)}</div>
              <Check name="default_visibility_public" label={t(`${K}.visPublic`)} defaultChecked={f.default_visibility.includes("public")} />
              <Check name="default_visibility_agency" label={t(`${K}.engineVisAgencyAdmin`)} defaultChecked={f.default_visibility.includes("agency")} />
              <Check name="default_visibility_private" label={t(`${K}.engineVisPrivate`)} defaultChecked={f.default_visibility.includes("private")} />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink }}>{t(`${K}.engineSurfaceFlags`)}</div>
              <Check name="show_in_public" label={t(`${K}.engineFlagPublicProfile`)} defaultChecked={f.show_in_public} tone={f.is_sensitive || f.admin_only ? "danger" : undefined} />
              <Check name="show_in_directory" label={t(`${K}.engineFlagDirectorySearch`)} defaultChecked={f.show_in_directory} />
              <Check name="show_in_registration" label={t(`${K}.createFlagRegistration`)} defaultChecked={f.show_in_registration} />
              <Check name="show_in_edit_drawer" label={t(`${K}.engineFlagProfileEditor`)} defaultChecked={f.show_in_edit_drawer} />
            </div>
            <div style={{ display: "grid", gap: 7 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: HQ.ink }}>{t(`${K}.engineSafetyFlags`)}</div>
              <Check name="admin_only" label={t(`${K}.createFlagAdminOnly`)} defaultChecked={f.admin_only} tone="danger" />
              <Check name="is_sensitive" label={t(`${K}.createFlagSensitive`)} defaultChecked={f.is_sensitive} tone="danger" />
              <Check name="talent_editable" label={t(`${K}.createFlagTalentEditable`)} defaultChecked={f.talent_editable} />
              <Check name="requires_review_on_change" label={t(`${K}.engineFlagReviewOnChange`)} defaultChecked={f.requires_review_on_change} />
              <Check name="is_searchable" label={t(`${K}.createFlagSearchable`)} defaultChecked={f.is_searchable} />
            </div>
          </div>

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SubmitButton>{t(`${K}.engineSaveDefinition`)}</SubmitButton>
            <span style={{ color: HQ.inkDim, fontSize: 11.5 }}>
              {t(`${K}.engineSafetyFloorNote`)}
            </span>
          </div>
        </form>
      </HqCard>

      <HqCard
        title={t(`${K}.lifecycleTitle`)}
        subtitle={t(`${K}.lifecycleSubtitle`)}
      >
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            {t(`${K}.lifecycleStatus`)}{" "}
            <strong style={{ color: f.deprecated ? HQ.red : HQ.green }}>
              {f.deprecated ? interpolate(t(`${K}.lifecycleDeprecatedSince`), { date: f.deprecated_at }) : t(`${K}.lifecycleActive`)}
            </strong>
            {" · "}
            {interpolate(t(`${K}.${f.total_value_count === 1 ? "lifecycleStoredLiveOne" : "lifecycleStoredLiveMany"}`), { count: f.total_value_count })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <form action={setPlatformFieldLifecycleAction}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="field_key" value={f.field_key} />
              <input type="hidden" name="mode" value={f.deprecated ? "restore" : "archive"} />
              <SubmitButton tone={f.deprecated ? "neutral" : "danger"}>
                {f.deprecated ? t(`${K}.lifecycleRestoreField`) : t(`${K}.lifecycleArchiveField`)}
              </SubmitButton>
            </form>
            <form action={deletePlatformFieldAction}>
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="field_key" value={f.field_key} />
              <ConfirmSubmitButton message={t(`${K}.lifecycleDeleteConfirm`)}>
                {t(`${K}.permanentlyRemove`)}
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>
      </HqCard>

      <HqCard
        title={t(`${K}.mappingTitle`)}
        subtitle={t(`${K}.mappingSubtitle`)}
      >
        {detail.recommendations.length === 0 ? (
          <div style={{ fontSize: 12, color: HQ.inkDim, marginBottom: 12 }}>
            {t(`${K}.mappingEmpty`)}
          </div>
        ) : (
          <div style={{ marginBottom: 14 }}>
            {detail.recommendations.map((rec) => (
              <MappingRow key={rec.id} rec={rec} fieldKey={f.field_key} t={t} />
            ))}
          </div>
        )}

        <form
          action={updatePlatformFieldRecommendationAction}
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.5fr) 160px 110px",
            gap: 10,
            alignItems: "end",
            paddingTop: 12,
            borderTop: `1px solid ${HQ.borderSoft}`,
          }}
        >
          <input type="hidden" name="field_definition_id" value={f.id} />
          <input type="hidden" name="field_key" value={f.field_key} />
          <FieldSelect label={t(`${K}.mappingTaxonomyTerm`)} name="taxonomy_term_id">
            <option value="">{t(`${K}.mappingChooseTerm`)}</option>
            {detail.taxonomyTerms.map((term) => (
              <option key={term.id} value={term.id}>
                {"  ".repeat(Math.max(0, term.level - 1))}
                {term.name_en} · {term.term_type}
              </option>
            ))}
          </FieldSelect>
          <FieldSelect label={t(`${K}.mappingRelationship`)} name="relationship" defaultValue="applies">
            <option value="applies">applies</option>
            <option value="recommended">recommended</option>
            <option value="required">required</option>
          </FieldSelect>
          <FieldInput label={t(`${K}.mappingOrder`)} name="display_order" type="number" defaultValue={100} />
          <div style={{ gridColumn: "1 / -1", display: "flex", flexWrap: "wrap", gap: 14 }}>
            <Check name="required_at_registration" label={t(`${K}.mappingRequiredAtRegistration`)} />
            <Check name="required_before_publish" label={t(`${K}.mappingRequiredBeforePublish`)} />
            <Check name="required_before_verification" label={t(`${K}.mappingRequiredBeforeVerification`)} />
            <Check name="requires_verification" label={t(`${K}.mappingRequiresVerification`)} />
            <Check name="is_admin_only" label={t(`${K}.mappingAdminOnly`)} tone="danger" />
          </div>
          <div style={{ gridColumn: "1 / -1" }}>
            <SubmitButton>{t(`${K}.mappingSave`)}</SubmitButton>
          </div>
        </form>
      </HqCard>

      <ImpactPreview
        field={f}
        recommendations={detail.recommendations}
        workspaces={detail.workspaces}
        riskCount={detail.risks.length}
        t={t}
      />

      <AuditHistory audit={detail.audit} t={t} />

      {detail.risks.length > 0 && (
        <HqCard
          title={interpolate(t(`${K}.risksCardTitle`), { count: detail.risks.length })}
          subtitle={t(`${K}.risksCardSubtitle`)}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {detail.risks.map((r, i) => (
              <div
                key={`${r.kind}-${i}`}
                style={{
                  display: "flex",
                  gap: 8,
                  fontSize: 12,
                  padding: "5px 8px",
                  background: HQ.cardSoft,
                  borderRadius: 8,
                }}
              >
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 700,
                    color: RISK_TONE[r.kind],
                    minWidth: 168,
                  }}
                  title={r.kind}
                >
                  {t(`${K}.${RISK_LABEL_KEYS[r.kind]}`)}
                </span>
                <span style={{ color: HQ.inkMuted }}>{r.detail}</span>
              </div>
            ))}
          </div>
        </HqCard>
      )}

      <HqCard
        title={t(`${K}.adoptionTitle`)}
        subtitle={(() => {
          if (detail.workspaces.length === 0)
            return t(`${K}.adoptionSubtitleNone`);
          const overrideCount = detail.workspaces.filter((w) => w.has_override).length;
          const valueOnlyCount = detail.workspaces.length - overrideCount;
          const parts: string[] = [];
          if (overrideCount > 0)
            parts.push(interpolate(t(`${K}.adoptionWithOverride`), { count: overrideCount }));
          if (valueOnlyCount > 0)
            parts.push(interpolate(t(`${K}.adoptionValuesNoOverride`), { count: valueOnlyCount }));
          return interpolate(
            t(`${K}.${detail.workspaces.length === 1 ? "adoptionSubtitleOne" : "adoptionSubtitleMany"}`),
            { count: detail.workspaces.length, parts: parts.join(", ") },
          );
        })()}
      >
        {detail.workspaces.length === 0 ? (
          <div style={{ fontSize: 12, color: HQ.inkDim }}>
            {t(`${K}.adoptionEmpty`)}
          </div>
        ) : (
          <div>
            {/* Column header */}
            <div
              style={{
                display: "flex",
                gap: 10,
                padding: "4px 10px 6px",
                fontSize: 10,
                fontWeight: 700,
                color: HQ.inkDim,
                letterSpacing: 0.4,
                textTransform: "uppercase",
                borderBottom: `1px solid ${HQ.borderSoft}`,
              }}
            >
              <span style={{ flex: 1 }}>{t(`${K}.adoptionColWorkspace`)}</span>
              <span style={{ minWidth: 56, textAlign: "right" }}>{t(`${K}.wsTalents`)}</span>
              <span style={{ minWidth: 80, textAlign: "right" }}>{t(`${K}.adoptionColSlug`)}</span>
            </div>
            {detail.workspaces.map((w, i) => (
              <WorkspaceRow key={w.tenant_id} w={w} isFirst={i === 0} t={t} />
            ))}
          </div>
        )}
      </HqCard>
    </div>
  );
}
