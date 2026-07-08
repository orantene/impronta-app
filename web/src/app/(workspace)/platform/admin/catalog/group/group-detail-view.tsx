// Platform HQ · Catalog · per-field-group detail VIEW.
// Shared server-component body rendered by BOTH the full-page route
// (group/[groupId]/page.tsx) and the intercepting drawer
// (@drawer/(.)group/[groupId]/page.tsx).
// For a new group (group===null) renders the create form.

import Link from "next/link";
import type { GroupDetail } from "./group-detail-data";
import {
  createPlatformFieldGroupAction,
  deletePlatformFieldGroupAction,
  setPlatformFieldGroupLifecycleAction,
  updatePlatformFieldGroupAction,
} from "../actions";
import { ConfirmSubmitButton } from "../confirm-submit-button";
import {
  FieldInput,
  FieldTextarea,
  Check,
  SubmitButton,
  SaveNotice,
} from "../[fieldKey]/field-detail-editor-parts";
import { HqCard, HQ, F, FD, CopyableId } from "../_ui";
import { interpolate } from "@/i18n/interpolate";

type Translate = (key: string) => string;
const K = "dashboard.platform.catalog";

export function GroupDetailView({
  group,
  saved,
  error,
  variant = "page",
  t,
}: {
  group: GroupDetail | null;
  saved?: string;
  error?: string;
  variant: "page" | "drawer";
  t: Translate;
}) {
  const isNew = group === null;

  const breadcrumb =
    variant === "page" ? (
      <div style={{ marginBottom: 16, fontFamily: F, fontSize: 12 }}>
        <Link
          href="/platform/admin/catalog?tab=groups"
          style={{ color: HQ.inkMuted, textDecoration: "none" }}
        >
          {t(`${K}.detailBackToFields`)}
        </Link>
      </div>
    ) : null;

  if (!isNew && !group) {
    return (
      <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
        {breadcrumb}
        <h1 style={{ fontFamily: FD, fontSize: 20, fontWeight: 600 }}>{t(`${K}.groupDetailNotFoundTitle`)}</h1>
        <HqCard title={t(`${K}.unavailableTitle`)}>
          <div style={{ fontSize: 13, color: HQ.inkMuted }}>
            {t(`${K}.groupDetailNotFoundBody`)}
          </div>
        </HqCard>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: F, color: HQ.ink, padding: 4 }}>
      {breadcrumb}
      <SaveNotice saved={saved} error={error} />

      {/* ID pill — only for existing groups */}
      {group && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <CopyableId id={group.id} />
          <span
            style={{
              fontSize: 10.5,
              fontWeight: 700,
              color: group.is_active ? HQ.green : HQ.red,
              border: `1px solid ${(group.is_active ? HQ.green : HQ.red)}44`,
              background: `${(group.is_active ? HQ.green : HQ.red)}1a`,
              borderRadius: 999,
              padding: "1px 8px",
            }}
          >
            {group.is_active ? t(`${K}.lifecycleActive`) : t(`${K}.typeArchived`)}
          </span>
        </div>
      )}

      <div style={{ display: "flex", alignItems: "baseline", gap: 14, marginBottom: 16 }}>
        <h1 style={{ fontFamily: FD, fontSize: 22, fontWeight: 600, margin: 0 }}>
          {isNew ? t(`${K}.groupDetailNewTitle`) : group.name_en}
        </h1>
        {group && (
          <span
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              fontSize: 12,
              color: HQ.inkMuted,
            }}
          >
            {group.slug}
          </span>
        )}
      </div>

      {/* Edit / Create form */}
      <HqCard
        title={isNew ? t(`${K}.createGroup`) : t(`${K}.groupDetailGroupTitle`)}
        subtitle={
          isNew
            ? t(`${K}.groupDetailCreateSubtitle`)
            : t(`${K}.groupDetailEditSubtitle`)
        }
      >
        <form
          action={isNew ? createPlatformFieldGroupAction : updatePlatformFieldGroupAction}
          style={{ display: "grid", gap: 14 }}
        >
          {group && <input type="hidden" name="id" value={group.id} />}

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
              gap: 12,
            }}
          >
            <FieldInput
              label={t(`${K}.fieldSlug`)}
              name="slug"
              defaultValue={group?.slug}
              placeholder={t(`${K}.groupDetailSlugPlaceholder`)}
            />
            <FieldInput
              label={t(`${K}.fieldSortOrder`)}
              name="sort_order"
              type="number"
              defaultValue={group?.sort_order ?? 100}
            />
            <FieldInput
              label={t(`${K}.fieldNameEn`)}
              name="name_en"
              defaultValue={group?.name_en}
              placeholder={t(`${K}.groupDetailNameEnPlaceholder`)}
            />
            <FieldInput
              label={t(`${K}.fieldNameEs`)}
              name="name_es"
              defaultValue={group?.name_es}
              placeholder={t(`${K}.groupDetailNameEsPlaceholder`)}
            />
            <FieldTextarea
              label={t(`${K}.fieldDescriptionEn`)}
              name="description_en"
              defaultValue={group?.description_en}
            />
            <FieldTextarea
              label={t(`${K}.fieldDescriptionEs`)}
              name="description_es"
              defaultValue={group?.description_es}
            />
          </div>

          {/* is_active only editable for existing groups via the lifecycle card */}
          {group && (
            <div
              style={{
                padding: "10px 12px",
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                background: HQ.cardSoft,
              }}
            >
              <Check name="is_active" label={t(`${K}.checkActive`)} defaultChecked={group.is_active} />
            </div>
          )}

          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <SubmitButton>
              {isNew ? t(`${K}.groupDetailCreateSubmit`) : t(`${K}.saveGroup`)}
            </SubmitButton>
          </div>
        </form>
      </HqCard>

      {/* Stats — only for existing groups */}
      {group && (
        <HqCard
          title={t(`${K}.groupDetailUsageTitle`)}
          subtitle={t(`${K}.groupDetailUsageSubtitle`)}
        >
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 10,
              marginBottom: group.mapped_talent_types.length > 0 ? 14 : 0,
            }}
          >
            {/* field count stat */}
            <div
              style={{
                background: HQ.cardSoft,
                border: `1px solid ${HQ.borderSoft}`,
                borderRadius: 10,
                padding: "10px 14px",
                minWidth: 110,
              }}
            >
              <div style={{ fontSize: 11, color: HQ.inkMuted, letterSpacing: 0.3 }}>{t(`${K}.colFields`)}</div>
              <div
                style={{
                  fontFamily: FD,
                  fontSize: 22,
                  fontWeight: 600,
                  color: group.field_count > 0 ? HQ.ink : HQ.inkDim,
                  marginTop: 2,
                }}
              >
                {group.field_count}
              </div>
            </div>
          </div>

          {group.mapped_talent_types.length > 0 ? (
            <div>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  color: HQ.inkMuted,
                  marginBottom: 8,
                  letterSpacing: 0.3,
                }}
              >
                {t(`${K}.groupDetailMappedTo`)}
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                {group.mapped_talent_types.map((name) => (
                  <span
                    key={name}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      color: HQ.inkMuted,
                      background: HQ.cardSoft,
                      border: `1px solid ${HQ.borderSoft}`,
                      borderRadius: 999,
                      padding: "2px 9px",
                    }}
                  >
                    {name}
                  </span>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ fontSize: 12, color: HQ.inkDim }}>
              {t(`${K}.groupDetailNoMappings`)}
            </div>
          )}
        </HqCard>
      )}

      {/* Lifecycle — only for existing groups */}
      {group && (
        <HqCard
          title={t(`${K}.lifecycleTitle`)}
          subtitle={t(`${K}.groupDetailLifecycleSubtitle`)}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 16,
            }}
          >
            <div style={{ fontSize: 12.5, color: HQ.inkMuted }}>
              {t(`${K}.lifecycleStatus`)}{" "}
              <strong style={{ color: group.is_active ? HQ.green : HQ.red }}>
                {group.is_active ? t(`${K}.lifecycleActive`) : t(`${K}.typeArchived`)}
              </strong>
              {" · "}
              {interpolate(t(`${K}.${group.field_count === 1 ? "sfSectionMetaOne" : "sfSectionMetaMany"}`), { count: group.field_count })}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <form action={setPlatformFieldGroupLifecycleAction}>
                <input type="hidden" name="id" value={group.id} />
                <input type="hidden" name="mode" value={group.is_active ? "archive" : "restore"} />
                <SubmitButton tone={group.is_active ? "danger" : "neutral"}>
                  {group.is_active ? t(`${K}.archiveGroup`) : t(`${K}.restoreGroup`)}
                </SubmitButton>
              </form>
              <form action={deletePlatformFieldGroupAction}>
                <input type="hidden" name="id" value={group.id} />
                <ConfirmSubmitButton message={t(`${K}.confirmDeleteGroup`)}>
                  {t(`${K}.permanentlyRemove`)}
                </ConfirmSubmitButton>
              </form>
            </div>
          </div>
        </HqCard>
      )}
    </div>
  );
}

