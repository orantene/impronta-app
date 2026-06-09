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
  updatePlatformTaxonomyTermAction,
  setPlatformTaxonomyLifecycleAction,
} from "../../taxonomy/actions";
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

export function TalentTypeDetailView({
  detail,
  termId,
  saved,
  error,
  variant = "page",
}: {
  detail: TalentTypeDetailResult;
  /** The termId param (undefined when creating new). */
  termId?: string;
  saved?: string;
  error?: string;
  variant?: "page" | "drawer";
}) {
  const breadcrumb =
    variant === "page" ? (
      <div style={{ marginBottom: 16, fontFamily: F, fontSize: 12 }}>
        <Link href="/platform/admin/catalog?tab=types" style={{ color: HQ.inkMuted, textDecoration: "none" }}>
          ← Profile Fields
        </Link>
      </div>
    ) : null;

  // ---- create-new path (no termId, ok===false / notFound) ----
  if (!termId) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <SaveNotice saved={saved} error={error} />

        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
          <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
            New talent type
          </h1>
        </div>

        <HqCard
          title="Create talent type"
          subtitle="Adds a new canonical talent type to the platform taxonomy engine."
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
              <FieldInput label="Slug" name="slug" placeholder="e.g. chef" />
              <FieldInput label="Icon (emoji)" name="icon" placeholder="👨‍🍳" />
              <FieldInput label="Name EN" name="name_en" placeholder="e.g. Chef" />
              <FieldInput label="Name ES" name="name_es" placeholder="e.g. Chef" />
              <FieldInput label="Plural name" name="plural_name" placeholder="e.g. Chefs" />
              <FieldInput label="Sort order" name="sort_order" type="number" defaultValue={100} />
              <FieldTextarea
                label="Description"
                name="description"
                placeholder="Brief description of this talent type"
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
              <Check name="is_public_filter" label="Public filter" />
              <Check name="is_profile_badge" label="Profile badge" />
              <Check name="is_visible_by_default" label="Visible by default" />
              <Check name="is_restricted" label="Restricted" tone="danger" />
            </div>

            <div>
              <SubmitButton>Create talent type</SubmitButton>
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
          {(detail as { notFound?: boolean }).notFound ? "Talent type not found" : "Unavailable"}
        </h1>
        <HqCard title="Error">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            Could not load this talent type. The service client may be unavailable or the term does
            not exist. Retry shortly.
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
      <SaveNotice saved={saved} error={error} />

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
          {isArchived ? "Archived" : term.is_active ? "Active" : "Inactive"}
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
        title="Talent type"
        subtitle="Edits the taxonomy_terms row. Save refreshes every catalog surface that resolves this type."
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
            <FieldInput label="Slug" name="slug" defaultValue={term.slug} />
            <FieldInput label="Icon (emoji)" name="icon" defaultValue={term.icon} placeholder="👨‍🍳" />
            <FieldInput label="Name EN" name="name_en" defaultValue={term.name_en} />
            <FieldInput label="Name ES" name="name_es" defaultValue={term.name_es} />
            <FieldInput label="Plural name" name="plural_name" defaultValue={term.plural_name} />
            <FieldInput
              label="Sort order"
              name="sort_order"
              type="number"
              defaultValue={term.sort_order}
            />
            <FieldTextarea
              label="Description"
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
              label="Public filter"
              defaultChecked={term.is_public_filter}
            />
            <Check
              name="is_profile_badge"
              label="Profile badge"
              defaultChecked={term.is_profile_badge}
            />
            <Check
              name="is_visible_by_default"
              label="Visible by default"
              defaultChecked={term.is_visible_by_default}
            />
            <Check
              name="is_restricted"
              label="Restricted"
              defaultChecked={term.is_restricted}
              tone="danger"
            />
          </div>

          <div>
            <SubmitButton>Save talent type</SubmitButton>
          </div>
        </form>
      </HqCard>

      {/* Card 2: Mapped fields */}
      <HqCard
        title="Mapped fields"
        subtitle="Fields displayed for this talent type in the profile engine. Direct mappings only — parent terms also affect this type through the resolver."
      >
        <TaxonomyFieldMappingPanel
          term={{ id: term.id, slug: term.slug, name_en: term.name_en }}
          mappings={mappings}
          fieldOptions={fieldOptions}
        />
      </HqCard>

      {/* Card 3: Analytics */}
      <HqCard
        title="Analytics"
        subtitle="Counts computed from talent_profile_taxonomy and agency_talent_roster. Read-only."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat
            label="Agencies using this type"
            value={detail.agencyCount}
            tone={detail.agencyCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label="Talents assigned"
            value={detail.talentCount}
            tone={detail.talentCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label="Mapped fields"
            value={detail.mappedFieldCount}
            tone={detail.mappedFieldCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label="Required mappings"
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
            Lifecycle:{" "}
            <strong style={{ color: isArchived ? HQ.red : HQ.green }}>
              {isArchived
                ? `Archived since ${term.archived_at}`
                : term.is_active
                  ? "Active"
                  : "Inactive"}
            </strong>
            {" · "}
            {detail.talentCount} talent{detail.talentCount === 1 ? "" : "s"} assigned
          </div>
          <form action={setPlatformTaxonomyLifecycleAction}>
            <input type="hidden" name="id" value={term.id} />
            <input type="hidden" name="mode" value={isArchived ? "restore" : "archive"} />
            <SubmitButton tone={isArchived ? "neutral" : "danger"}>
              {isArchived ? "Restore type" : "Archive type"}
            </SubmitButton>
          </form>
        </div>
      </HqCard>
    </div>
  );
}
