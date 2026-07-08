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
  deletePlatformTaxonomyTermAction,
  updatePlatformTaxonomyTermAction,
  setPlatformTaxonomyLifecycleAction,
} from "../../taxonomy/actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import {
  FieldInput,
  FieldTextarea,
  Check,
  SubmitButton,
  SaveNotice,
} from "../[fieldKey]/field-detail-editor-parts";
import { HqCard, Stat, CopyableId, HQ, F, FD } from "../_ui";
import { interpolate } from "@/i18n/interpolate";

type Kind = "parent_category" | "category_group";
type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export function TermDetailView({
  detail,
  termId,
  kind,
  parentId,
  saved,
  error,
  variant = "page",
  t,
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
  t: Translate;
}) {
  const resolvedKind: Kind = (detail && detail.ok ? (detail.term.term_type as Kind) : null) ?? kind ?? "parent_category";
  const isGroup = resolvedKind === "category_group";
  const kindLabel = isGroup ? t(`${K}.termKindCategoryGroup`) : t(`${K}.termKindParentCategory`);
  const kindLower = isGroup ? t(`${K}.termKindCategoryGroupLower`) : t(`${K}.termKindParentCategoryLower`);

  const breadcrumb =
    variant === "page" ? (
      <div style={{ marginBottom: 16, fontFamily: F, fontSize: 12 }}>
        <Link
          href="/platform/admin/catalog?tab=types"
          style={{ color: HQ.inkMuted, textDecoration: "none" }}
        >
          {t(`${K}.detailBackToFields`)}
        </Link>
      </div>
    ) : null;

  // ---- create-new path ----
  if (!termId) {
    const levelValue = isGroup ? 2 : 1;
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <SaveNotice saved={saved} error={error} t={t} />

        <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
          <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
            {interpolate(t(`${K}.termDetailNewTitle`), { kind: kindLower })}
          </h1>
        </div>

        <HqCard
          title={interpolate(t(`${K}.termDetailCreateTitle`), { kind: kindLower })}
          subtitle={interpolate(t(`${K}.termDetailCreateSubtitle`), { kind: kindLower })}
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
              <FieldInput label={t(`${K}.fieldSlug`)} name="slug" placeholder={t(`${K}.termSlugPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldIcon`)} name="icon" placeholder="🎭" />
              <FieldInput label={t(`${K}.fieldNameEn`)} name="name_en" placeholder={t(`${K}.termNameEnPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldNameEs`)} name="name_es" placeholder={t(`${K}.termNameEsPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldPluralName`)} name="plural_name" placeholder={t(`${K}.termPluralPlaceholder`)} />
              <FieldInput label={t(`${K}.fieldSortOrder`)} name="sort_order" type="number" defaultValue={100} />
            </div>
            <FieldTextarea
              label={t(`${K}.fieldDescription`)}
              name="description"
              placeholder={interpolate(t(`${K}.termDescriptionPlaceholder`), { kind: kindLower })}
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
              <Check name="is_public_filter" label={t(`${K}.checkPublicFilter`)} />
              <Check name="is_profile_badge" label={t(`${K}.checkProfileBadge`)} />
              <Check name="is_visible_by_default" label={t(`${K}.checkVisibleByDefault`)} />
              <Check name="is_restricted" label={t(`${K}.checkRestricted`)} tone="danger" />
            </div>

            <div>
              <SubmitButton>{interpolate(t(`${K}.termDetailCreateTitle`), { kind: kindLower })}</SubmitButton>
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
          {notFound ? interpolate(t(`${K}.termDetailNotFoundTitle`), { kind: kindLabel }) : t(`${K}.unavailableTitle`)}
        </h1>
        <HqCard title={t(`${K}.errorCardTitle`)}>
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            {t(`${K}.termDetailNotFoundBody`)}
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
      <SaveNotice saved={saved} error={error} t={t} />

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
          {kindLower}
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
        title={kindLabel}
        subtitle={t(`${K}.termDetailEditSubtitle`)}
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
            <FieldInput label={t(`${K}.fieldSlug`)} name="slug" defaultValue={term.slug} />
            <FieldInput label={t(`${K}.fieldIcon`)} name="icon" defaultValue={term.icon} placeholder="🎭" />
            <FieldInput label={t(`${K}.fieldNameEn`)} name="name_en" defaultValue={term.name_en} />
            <FieldInput label={t(`${K}.fieldNameEs`)} name="name_es" defaultValue={term.name_es} />
            <FieldInput label={t(`${K}.fieldPluralName`)} name="plural_name" defaultValue={term.plural_name} />
            <FieldInput
              label={t(`${K}.fieldSortOrder`)}
              name="sort_order"
              type="number"
              defaultValue={term.sort_order}
            />
          </div>
          <FieldTextarea label={t(`${K}.fieldDescription`)} name="description" defaultValue={term.description} />

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
            <SubmitButton>{interpolate(t(`${K}.termDetailSaveSubmit`), { kind: kindLower })}</SubmitButton>
          </div>
        </form>
      </HqCard>

      {/* Card 2: Children list */}
      <HqCard
        title={isGroup ? t(`${K}.termChildrenTypesTitle`) : t(`${K}.termChildrenGroupsTitle`)}
        subtitle={
          isGroup
            ? t(`${K}.termChildrenTypesSubtitle`)
            : t(`${K}.termChildrenGroupsSubtitle`)
        }
      >
        {detail.children.length === 0 ? (
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            {t(`${K}.termChildrenEmpty`)}{" "}
            {isGroup ? (
              <Link
                href={`/platform/admin/catalog/type/new`}
                style={{ color: HQ.green, textDecoration: "none" }}
              >
                {t(`${K}.termChildrenAddType`)}
              </Link>
            ) : (
              <Link
                href={`/platform/admin/catalog/term/new?kind=category_group&parent=${term.id}`}
                style={{ color: HQ.green, textDecoration: "none" }}
              >
                {t(`${K}.termChildrenAddGroup`)}
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
                        {interpolate(t(`${K}.${child.agencyCount === 1 ? "termChildAgenciesOne" : "termChildAgenciesMany"}`), { count: child.agencyCount })}
                      </span>
                    ) : (
                      <span>{interpolate(t(`${K}.termChildAgenciesMany`), { count: 0 })}</span>
                    )}
                    {" · "}
                    {interpolate(t(`${K}.${child.talentCount === 1 ? "termChildTalentsOne" : "termChildTalentsMany"}`), { count: child.talentCount })}
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
          {t(`${K}.termReorderHintPrefix`)}{" "}
          <span style={{ fontFamily: "ui-monospace, monospace" }}>sort_order</span>{" "}
          {t(`${K}.termReorderHintSuffix`)}
        </div>
      </HqCard>

      {/* Card 3: Analytics */}
      <HqCard
        title={t(`${K}.analyticsTitle`)}
        subtitle={t(`${K}.termAnalyticsSubtitle`)}
      >
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <Stat
            label={t(`${K}.termStatAgenciesRolledUp`)}
            value={detail.agencyCount}
            tone={detail.agencyCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label={t(`${K}.termStatTalentsRolledUp`)}
            value={detail.talentCount}
            tone={detail.talentCount > 0 ? HQ.green : HQ.inkDim}
          />
          <Stat
            label={isGroup ? t(`${K}.typesStatTypes`) : t(`${K}.typesStatGroups`)}
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
            {t(`${K}.lifecycleLabel`)}{" "}
            <strong style={{ color: isArchived ? HQ.red : HQ.green }}>
              {isArchived
                ? interpolate(t(`${K}.lifecycleArchivedSince`), { date: term.archived_at ?? "" })
                : term.is_active
                  ? t(`${K}.lifecycleActive`)
                  : t(`${K}.statusInactive`)}
            </strong>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <form action={setPlatformTaxonomyLifecycleAction}>
              <input type="hidden" name="id" value={term.id} />
              <input type="hidden" name="mode" value={isArchived ? "restore" : "archive"} />
              <SubmitButton tone={isArchived ? "neutral" : "danger"}>
                {isArchived
                  ? interpolate(t(`${K}.termLifecycleRestore`), { kind: kindLower })
                  : interpolate(t(`${K}.termLifecycleArchive`), { kind: kindLower })}
              </SubmitButton>
            </form>
            <form action={deletePlatformTaxonomyTermAction}>
              <input type="hidden" name="id" value={term.id} />
              <input type="hidden" name="return_to" value={`/platform/admin/catalog/term/${term.id}`} />
              <ConfirmSubmitButton message={t(`${K}.termConfirmDelete`)}>
                {t(`${K}.permanentlyRemove`)}
              </ConfirmSubmitButton>
            </form>
          </div>
        </div>
      </HqCard>
    </div>
  );
}
