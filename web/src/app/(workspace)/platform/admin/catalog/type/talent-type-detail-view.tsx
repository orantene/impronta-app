// Platform HQ · Catalog · per-talent-type detail VIEW.
// Shared server-component body rendered by BOTH the full-page route
// (type/[termId]/page.tsx) and the intercepting drawer
// (@drawer/(.)type/[termId]/page.tsx).
// For a new type (detail.term===null) renders the create form.
// All mutation forms post to taxonomy actions which redirect back to
// /platform/admin/catalog/type/${termId}?saved=… (re-intercepted → drawer stays open).

import Link from "next/link";
import type { TalentTypeDetailResult } from "../../../talent-types-data";
import {
  createPlatformTaxonomyTermAction,
  deletePlatformTaxonomyTermAction,
  updatePlatformTaxonomyTermAction,
  setPlatformTaxonomyLifecycleAction,
} from "../../taxonomy/actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import {
  TaxonomyFieldMappingPanel,
  type TaxonomyFieldMapping,
  type TaxonomyFieldOption,
} from "../../taxonomy/taxonomy-field-mapping-panel";
import {
  FieldInput,
  FieldTextarea,
  Check,
  SubmitButton,
  SaveNotice,
} from "../[fieldKey]/field-detail-editor-parts";
import { HqCard, Stat, CopyableId, HQ, F, FD } from "../_ui";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export function TalentTypeDetailView({
  detail,
  termId,
  saved,
  error,
  variant = "page",
  t,
}: {
  detail: TalentTypeDetailResult;
  /** The termId param (undefined when creating new). */
  termId?: string;
  saved?: string;
  error?: string;
  variant?: "page" | "drawer";
  t: Translate;
}) {
  const breadcrumb =
    variant === "page" ? (
      <div style={{ marginBottom: 16, fontFamily: F, fontSize: 12 }}>
        <Link href="/platform/admin/catalog?tab=types" style={{ color: HQ.inkMuted, textDecoration: "none" }}>
          {t(`${K}.detailBackToFields`)}
        </Link>
      </div>
    ) : null;

  // ---- create-new path (no termId, ok===false / notFound) ----
  if (!termId) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <SaveNotice saved={saved} error={error} t={t} />

        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
          <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
            {t(`${K}.typeDetailNewTitle`)}
          </h1>
        </div>

        <HqCard
          title={t(`${K}.typeDetailCreateTitle`)}
          subtitle={t(`${K}.typeDetailCreateSubtitle`)}
        >
          <form action={createPlatformTaxonomyTermAction} style={{ display: "grid", gap: 14 }}>
            {/* Fixed hidden fields for the taxonomy action */}
            <input type="hidden" name="term_type" value="talent_type" />
            <input type="hidden" name="return_to" value="/platform/admin/catalog/type" />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <FieldInput label={t(`${K}.fieldSlug`)} name="slug" placeholder={t(`${K}.typeSlugPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldIcon`)} name="icon" placeholder="👨‍🍳" />
              <FieldInput label={t(`${K}.fieldNameEn`)} name="name_en" placeholder={t(`${K}.typeNameEnPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldNameEs`)} name="name_es" placeholder={t(`${K}.typeNameEsPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldPluralName`)} name="plural_name" placeholder={t(`${K}.typePluralPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldSortOrder`)} name="sort_order" type="number" defaultValue={100} />
              <FieldTextarea
                label={t(`${K}.fieldDescription`)}
                name="description"
                placeholder={t(`${K}.typeDescriptionPlaceholder`)}
              />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 10,
                padding: "10px 12px",
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                background: HQ.cardSoft,
              }}
            >
              <Check name="is_public_filter" label={t(`${K}.checkPublicFilter`)} />
              <Check name="is_profile_badge" label={t(`${K}.checkProfileBadge`)} />
              <Check name="is_visible_by_default" label={t(`${K}.checkVisibleByDefault`)} />
              <Check name="is_restricted" label={t(`${K}.checkRestricted`)} tone="danger" />
            </div>

            <div>
              <SubmitButton>{t(`${K}.typeDetailCreateTitle`)}</SubmitButton>
            </div>
          </form>
        </HqCard>
      </div>
    );
  }

  // ---- load-failed / not-found path ----
  if (!detail.ok) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>
          {(detail as { notFound?: boolean }).notFound ? t(`${K}.typeDetailNotFoundTitle`) : t(`${K}.unavailableTitle`)}
        </h1>
        <HqCard title={t(`${K}.errorCardTitle`)}>
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            {t(`${K}.typeDetailNotFoundBody`)}
          </div>
        </HqCard>
      </div>
    );
  }

  const term = detail.term;
  const isArchived = !!term.archived_at;

  // Convert loader recommendations → TaxonomyFieldMapping shape expected by the panel
  const mappings: TaxonomyFieldMapping[] = detail.recommendations.map((rec) => ({
    id: rec.id,
    field_definition_id: rec.field_definition_id,
    field_key: rec.field_key,
    field_label: rec.field_label,
    field_tier: rec.field_tier,
    field_section: null,
    field_deprecated: false,
    relationship: rec.relationship,
    display_order: rec.display_order,
    required_at_registration: rec.required_at_registration,
    required_before_publish: rec.required_before_publish,
    required_before_verification: rec.required_before_verification,
    requires_verification: rec.requires_verification,
    is_admin_only: rec.is_admin_only,
  }));

  // Convert loader fieldOptions → TaxonomyFieldOption shape expected by the panel
  const fieldOptions: TaxonomyFieldOption[] = detail.fieldOptions.map((f) => ({
    id: f.id,
    field_key: f.field_key,
    label: f.label,
    tier: f.tier,
    section: f.section,
    deprecated_at: f.deprecated_at,
  }));

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {breadcrumb}
      <SaveNotice saved={saved} error={error} t={t} />

      {/* ID pill + status badge */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <CopyableId id={term.id} />
        <span
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: isArchived ? HQ.red : HQ.green,
            border: `1px solid ${(isArchived ? HQ.red : HQ.green)}44`,
            background: `${(isArchived ? HQ.red : HQ.green)}1a`,
            borderRadius: 999,
            padding: "1px 8px",
          }}
        >
          {isArchived ? t(`${K}.typeArchived`) : term.is_active ? t(`${K}.lifecycleActive`) : t(`${K}.statusInactive`)}
        </span>
      </div>

      <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
        <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
          {term.icon ? `${term.icon} ` : ""}
          {term.name_en}
        </h1>
        <span
          style={{
            fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
            fontSize: 12,
            color: HQ.inkMuted,
          }}
        >
          {term.slug}
        </span>
      </div>

      {/* Card 1: Edit form */}
      <HqCard
        title={t(`${K}.typeDetailEditTitle`)}
        subtitle={t(`${K}.typeDetailEditSubtitle`)}
      >
        <form action={updatePlatformTaxonomyTermAction} style={{ display: "grid", gap: 14 }}>
          <input type="hidden" name="id" value={term.id} />
          <input type="hidden" name="term_type" value="talent_type" />
          <input type="hidden" name="return_to" value={`/platform/admin/catalog/type/${term.id}`} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <FieldInput label={t(`${K}.fieldSlug`)} name="slug" defaultValue={term.slug} />
            <FieldInput label={t(`${K}.fieldIcon`)} name="icon" defaultValue={term.icon} placeholder="👨‍🍳" />
            <FieldInput label={t(`${K}.fieldNameEn`)} name="name_en" defaultValue={term.name_en} />
            <FieldInput label={t(`${K}.fieldNameEs`)} name="name_es" defaultValue={term.name_es} />
            <FieldInput label={t(`${K}.fieldPluralName`)} name="plural_name" defaultValue={term.plural_name} />
            <FieldInput
              label={t(`${K}.fieldSortOrder`)}
              name="sort_order"
              type="number"
              defaultValue={term.sort_order}
            />
            <FieldTextarea
              label={t(`${K}.fieldDescription`)}
              name="description"
              defaultValue={term.description}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
              padding: "10px 12px",
              border: `1px solid ${HQ.borderSoft}`,
              borderRadius: 10,
              background: HQ.cardSoft,
            }}
          >
            <Check
              name="is_public_filter"
              label={t(`${K}.checkPublicFilter`)}
              defaultChecked={term.is_public_filter}
            />
            <Check
              name="is_profile_badge"
              label={t(`${K}.checkProfileBadge`)}
              defaultChecked={term.is_profile_badge}
            />
            <Check
              name="is_visible_by_default"
              label={t(`${K}.checkVisibleByDefault`)}
              defaultChecked={term.is_visible_by_default}
            />
            <Check
              name="is_restricted"
              label={t(`${K}.checkRestricted`)}
              defaultChecked={term.is_restricted}
              tone="danger"
            />
          </div>

          <div>
            <SubmitButton>{t(`${K}.typeDetailSaveSubmit`)}</SubmitButton>
          </div>
        </form>
      </HqCard>

      {/* Card 2: Mapped fields */}
      <HqCard
        title={t(`${K}.typeMappedFieldsTitle`)}
        subtitle={t(`${K}.typeMappedFieldsSubtitle`)}
      >
        <TaxonomyFieldMappingPanel
          term={{ id: term.id, slug: term.slug, name_en: term.name_en }}
          mappings={mappings}
          fieldOptions={fieldOptions}
          t={t}
        />
      </HqCard>

      {/* Card 3: Analytics */}
      <HqCard
        title={t(`${K}.analyticsTitle`)}
        subtitle={t(`${K}.typeAnalyticsSubtitle`)}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat
            label={t(`${K}.typeStatAgenciesUsing`)}
            value={detail.agencyCount}
            tone={detail.agencyCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label={t(`${K}.typeStatTalentsAssigned`)}
            value={detail.talentCount}
            tone={detail.talentCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label={t(`${K}.typeStatMappedFields`)}
            value={detail.mappedFieldCount}
            tone={detail.mappedFieldCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label={t(`${K}.typeStatRequiredMappings`)}
            value={detail.requiredMappingCount}
            tone={detail.requiredMappingCount > 0 ? HQ.amber : HQ.inkDim}
          />
        </div>

        {/* Lifecycle archive/restore */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingTop: 12,
            borderTop: `1px solid ${HQ.borderSoft}`,
          }}
        >
          <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
            {t(`${K}.lifecycleLabel`)}{" "}
            <strong style={{ color: isArchived ? HQ.red : HQ.green }}>
              {isArchived
                ? interpolate(t(`${K}.lifecycleArchivedSince`), { date: term.archived_at ?? "" })
                : term.is_active
                  ? t(`${K}.lifecycleActive`)
                  : t(`${K}.statusInactive`)}
            </strong>
            {" · "}
            {interpolate(t(`${K}.${detail.talentCount === 1 ? "typeLifecycleAssignedOne" : "typeLifecycleAssignedMany"}`), { count: detail.talentCount })}
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <form action={setPlatformTaxonomyLifecycleAction}>
              <input type="hidden" name="id" value={term.id} />
              <input type="hidden" name="mode" value={isArchived ? "restore" : "archive"} />
              <SubmitButton tone={isArchived ? "neutral" : "danger"}>
                {isArchived ? t(`${K}.typeLifecycleRestore`) : t(`${K}.typeLifecycleArchive`)}
              </SubmitButton>
            </form>
            <form action={deletePlatformTaxonomyTermAction}>
              <input type="hidden" name="id" value={term.id} />
              <input type="hidden" name="return_to" value="/platform/admin/catalog/type" />
              <ConfirmSubmitButton message={t(`${K}.typeConfirmDelete`)}>
                {t(`${K}.permanentlyRemove`)}
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>
      </HqCard>
    </div>
  );
}
