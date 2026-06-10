// Platform HQ · Catalog · Generic taxonomy term detail VIEW.
// Handles parent_category and category_group nodes.
// Shared by the full-page routes (term/[termId]/page.tsx, term/new/page.tsx)
// and the intercepting drawer (@drawer/(.)term/*).

import Link from "next/link";
import type {
  TaxonomyTermDetailResult,
} from "../../../talent-types-data";
import {
  createPlatformTaxonomyTermAction,
  updatePlatformTaxonomyTermAction,
  setPlatformTaxonomyLifecycleAction,
} from "../../taxonomy/actions";
import {
  FieldInput,
  FieldTextarea,
  Check,
  SubmitButton,
  SaveNotice,
} from "../[fieldKey]/field-detail-editor-parts";
import { HqCard, Stat, CopyableId, HQ, F, FD } from "../_ui";

type Kind = "parent_category" | "category_group";

export function TermDetailView({
  detail,
  termId,
  kind,
  parentId,
  saved,
  error,
  variant = "page",
}: {
  detail: TaxonomyTermDetailResult | null;
  /** The termId param (undefined / null when creating new). */
  termId?: string;
  /** Term type — required when creating new. */
  kind?: Kind;
  /** Parent ID — required when creating a new category_group. */
  parentId?: string;
  saved?: string;
  error?: string;
  variant?: "page" | "drawer";
}) {
  const resolvedKind: Kind = (detail && detail.ok ? (detail.term.term_type as Kind) : null) ?? kind ?? "parent_category";
  const isGroup = resolvedKind === "category_group";
  const kindLabel = isGroup ? "Category group" : "Parent category";

  const breadcrumb =
    variant === "page" ? (
      <div style={{ marginBottom: 16, fontFamily: F, fontSize: 12 }}>
        <Link
          href="/platform/admin/catalog?tab=types"
          style={{ color: HQ.inkMuted, textDecoration: "none" }}
        >
          ← Profile Fields
        </Link>
      </div>
    ) : null;

  // ---- create-new path ----
  if (!termId) {
    const levelValue = isGroup ? 2 : 1;
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <SaveNotice saved={saved} error={error} />

        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
          <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
            New {kindLabel.toLowerCase()}
          </h1>
        </div>

        <HqCard
          title={`Create ${kindLabel.toLowerCase()}`}
          subtitle={`Adds a new ${kindLabel.toLowerCase()} to the platform taxonomy.`}
        >
          <form action={createPlatformTaxonomyTermAction} style={{ display: "grid", gap: 14 }}>
            <input type="hidden" name="term_type" value={resolvedKind} />
            <input type="hidden" name="level" value={levelValue} />
            {parentId && <input type="hidden" name="parent_id" value={parentId} />}
            <input
              type="hidden"
              name="return_to"
              value="/platform/admin/catalog?tab=types"
            />

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
                gap: 12,
              }}
            >
              <FieldInput label="Slug" name="slug" placeholder="e.g. performing-arts" />
              <FieldInput label="Icon (emoji)" name="icon" placeholder="🎭" />
              <FieldInput label="Name EN" name="name_en" placeholder="e.g. Performing Arts" />
              <FieldInput label="Name ES" name="name_es" placeholder="e.g. Artes escénicas" />
              <FieldInput label="Plural name" name="plural_name" placeholder="e.g. Performing Arts" />
              <FieldInput label="Sort order" name="sort_order" type="number" defaultValue={100} />
            </div>
            <FieldTextarea
              label="Description"
              name="description"
              placeholder={`Brief description of this ${kindLabel.toLowerCase()}`}
            />

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
              <SubmitButton>Create {kindLabel.toLowerCase()}</SubmitButton>
            </div>
          </form>
        </HqCard>
      </div>
    );
  }

  // ---- load-failed / not-found path ----
  if (!detail || !detail.ok) {
    const notFound = detail && (detail as { notFound?: boolean }).notFound;
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>
          {notFound ? `${kindLabel} not found` : "Unavailable"}
        </h1>
        <HqCard title="Error">
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            Could not load this taxonomy term. The service client may be unavailable or the term
            does not exist. Retry shortly.
          </div>
        </HqCard>
      </div>
    );
  }

  const term = detail.term;
  const isArchived = !!term.archived_at;
  const HQ_CARD_SOFT = "rgba(255,255,255,0.04)";
  const HQ_BORDER_SOFT = "rgba(255,255,255,0.06)";

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {breadcrumb}
      <SaveNotice saved={saved} error={error} />

      {/* ID pill + term_type badge + status */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
        <CopyableId id={term.id} />
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            color: HQ.inkDim,
            border: `1px solid ${HQ.borderSoft}`,
            background: HQ_CARD_SOFT,
            borderRadius: 999,
            padding: "1px 7px",
            textTransform: "uppercase",
            letterSpacing: 0.3,
          }}
        >
          {term.term_type.replace("_", " ")}
        </span>
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
        title={kindLabel}
        subtitle="Edits the taxonomy_terms row. Save refreshes every catalog surface that resolves this term."
      >
        <form action={updatePlatformTaxonomyTermAction} style={{ display: "grid", gap: 14 }}>
          <input type="hidden" name="id" value={term.id} />
          <input type="hidden" name="term_type" value={term.term_type} />
          <input
            type="hidden"
            name="return_to"
            value={`/platform/admin/catalog/term/${term.id}`}
          />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <FieldInput label="Slug" name="slug" defaultValue={term.slug} />
            <FieldInput label="Icon (emoji)" name="icon" defaultValue={term.icon} placeholder="🎭" />
            <FieldInput label="Name EN" name="name_en" defaultValue={term.name_en} />
            <FieldInput label="Name ES" name="name_es" defaultValue={term.name_es} />
            <FieldInput label="Plural name" name="plural_name" defaultValue={term.plural_name} />
            <FieldInput
              label="Sort order"
              name="sort_order"
              type="number"
              defaultValue={term.sort_order}
            />
          </div>
          <FieldTextarea label="Description" name="description" defaultValue={term.description} />

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 10,
              padding: "10px 12px",
              border: `1px solid ${HQ_BORDER_SOFT}`,
              borderRadius: 10,
              background: HQ_CARD_SOFT,
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
            <SubmitButton>Save {kindLabel.toLowerCase()}</SubmitButton>
          </div>
        </form>
      </HqCard>

      {/* Card 2: Children list */}
      <HqCard
        title={isGroup ? "Talent types in this group" : "Category groups"}
        subtitle={
          isGroup
            ? "Talent types that belong to this group. Click to open the type editor."
            : "Groups under this parent category. Click to open the group editor."
        }
      >
        {detail.children.length === 0 ? (
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            No children yet.{" "}
            {isGroup ? (
              <Link
                href={`/platform/admin/catalog/type/new`}
                style={{ color: HQ.green, textDecoration: "none" }}
              >
                + Add talent type
              </Link>
            ) : (
              <Link
                href={`/platform/admin/catalog/term/new?kind=category_group&parent=${term.id}`}
                style={{ color: HQ.green, textDecoration: "none" }}
              >
                + Add group
              </Link>
            )}
          </div>
        ) : (
          <div>
            {detail.children.map((child) => {
              const href = isGroup
                ? `/platform/admin/catalog/type/${child.id}`
                : `/platform/admin/catalog/term/${child.id}`;
              return (
                <Link
                  key={child.id}
                  href={href}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 0",
                    borderTop: `1px solid ${HQ_BORDER_SOFT}`,
                    fontSize: 12.5,
                    color: HQ.ink,
                    textDecoration: "none",
                  }}
                >
                  <CopyableId id={child.id} />
                  <span style={{ flex: 1, fontWeight: 600 }}>
                    {child.name_en}
                    {child.name_es && (
                      <span style={{ fontWeight: 400, fontSize: 11, color: HQ.inkDim, marginLeft: 6 }}>
                        {child.name_es}
                      </span>
                    )}
                  </span>
                  <span style={{ fontSize: 11, color: HQ.inkMuted }}>
                    {child.agencyCount > 0 ? (
                      <span style={{ color: HQ.green }}>
                        {child.agencyCount} agenc{child.agencyCount === 1 ? "y" : "ies"}
                      </span>
                    ) : (
                      <span>0 agencies</span>
                    )}
                    {" · "}
                    {child.talentCount} talent{child.talentCount === 1 ? "" : "s"}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
        <div
          style={{
            marginTop: 12,
            paddingTop: 10,
            borderTop: `1px solid ${HQ_BORDER_SOFT}`,
            fontSize: 12,
            color: HQ.inkMuted,
          }}
        >
          To reorder siblings, adjust{" "}
          <span style={{ fontFamily: "ui-monospace, monospace" }}>sort_order</span> on each term&apos;s
          edit form.
        </div>
      </HqCard>

      {/* Card 3: Analytics */}
      <HqCard
        title="Analytics"
        subtitle="Rolled up from all descendant talent_types. Read-only."
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat
            label="Agencies (rolled up)"
            value={detail.agencyCount}
            tone={detail.agencyCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label="Talents (rolled up)"
            value={detail.talentCount}
            tone={detail.talentCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label={isGroup ? "Talent types" : "Category groups"}
            value={detail.children.length}
            tone={detail.children.length > 0 ? HQ.green : HQ.inkDim}
          />
        </div>

        {/* Lifecycle */}
        <div
          style={{
            marginTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            paddingTop: 12,
            borderTop: `1px solid ${HQ_BORDER_SOFT}`,
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
          </div>
          <form action={setPlatformTaxonomyLifecycleAction}>
            <input type="hidden" name="id" value={term.id} />
            <input type="hidden" name="mode" value={isArchived ? "restore" : "archive"} />
            <SubmitButton tone={isArchived ? "neutral" : "danger"}>
              {isArchived ? `Restore ${kindLabel.toLowerCase()}` : `Archive ${kindLabel.toLowerCase()}`}
            </SubmitButton>
          </form>
        </div>
      </HqCard>
    </div>
  );
}
