"use client";

/**
 * CardDesignStudio-roster.tsx — the Card Design studio's ROSTER surface panel,
 * split out of CardDesignStudio.tsx so that file stays under its max-lines
 * budget.
 *
 * Everything here writes to `agencies.settings.rosterCardBadges` through the
 * shell context (optimistic flip → persist → reconcile), which is why the
 * panel owns its own save-status state rather than taking it as props:
 *
 *   - one toggle per roster-card badge (`ROSTER_CARD_BADGE_META`), and
 *   - the category-block layout mode (`typeDisplay`), which decides whether a
 *     roster card shows the whole taxonomy, only the parent talent type with a
 *     `+` that opens the child types, or only the parent talent type.
 *
 * The roster grid is INTERNAL tooling, so these save instantly — there is no
 * draft/publish cycle here, unlike the public card surfaces.
 */

import { useCallback, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  ROSTER_CARD_BADGE_META,
  ROSTER_CARD_TYPE_DISPLAY_META,
  type RosterCardBadgeKey,
  type RosterCardTypeDisplay,
} from "@/lib/talent-cards/roster-card-badges";

import { Icon, Toggle } from "../primitives";
import { COLORS, useAdminShell } from "../state";
import { GroupHeader, Segmented, type FieldSaveState } from "./CardDesignStudio-2";

/** Shared save-status line, so every write in this panel reports the same way. */
function SaveStatus({ status }: { status: FieldSaveState | undefined }) {
  const t = useT();
  if (status === "saving") {
    return (
      <span className="text-admin-11 text-admin-ink-muted">
        {t("dashboard.adminCardStudio.saving")}
      </span>
    );
  }
  if (status === "saved") {
    return (
      <span className="inline-flex items-center gap-[3px] text-admin-11 text-admin-success-deep">
        <Icon name="check" size={12} color={COLORS.success} />
        {t("dashboard.adminCardStudio.saved")}
      </span>
    );
  }
  if (status === "error") {
    return (
      <span className="text-admin-11 text-admin-critical">
        {t("dashboard.adminCardStudio.failed")}
      </span>
    );
  }
  return null;
}

export function RosterCardBadgesPanel({ canEdit }: { canEdit: boolean }) {
  const t = useT();
  const { toast, rosterCardBadges, setRosterCardBadge, setRosterCardTypeDisplay } =
    useAdminShell();

  const [badgeStatus, setBadgeStatus] = useState<
    Partial<Record<RosterCardBadgeKey, FieldSaveState>>
  >({});
  const [typeDisplayStatus, setTypeDisplayStatus] = useState<FieldSaveState | undefined>();

  const handleToggleBadge = useCallback(
    (key: RosterCardBadgeKey, next: boolean) => {
      if (!canEdit) {
        toast(t("dashboard.adminCardStudio.toastNeedAdminBadges"));
        return;
      }
      setBadgeStatus((prev) => ({ ...prev, [key]: "saving" }));
      void (async () => {
        // setRosterCardBadge handles the optimistic flip + revert + error toast.
        const ok = await setRosterCardBadge(key, next);
        if (!ok) {
          setBadgeStatus((prev) => ({ ...prev, [key]: "error" }));
          return;
        }
        setBadgeStatus((prev) => ({ ...prev, [key]: "saved" }));
        window.setTimeout(() => {
          setBadgeStatus((prev) => {
            const nextState = { ...prev };
            if (nextState[key] === "saved") delete nextState[key];
            return nextState;
          });
        }, 1600);
      })();
    },
    [canEdit, toast, t, setRosterCardBadge],
  );

  const handleTypeDisplay = useCallback(
    (mode: RosterCardTypeDisplay) => {
      if (!canEdit) {
        toast(t("dashboard.adminCardStudio.toastNeedAdminBadges"));
        return;
      }
      setTypeDisplayStatus("saving");
      void (async () => {
        const ok = await setRosterCardTypeDisplay(mode);
        if (!ok) {
          setTypeDisplayStatus("error");
          return;
        }
        setTypeDisplayStatus("saved");
        window.setTimeout(() => {
          setTypeDisplayStatus((prev) => (prev === "saved" ? undefined : prev));
        }, 1600);
      })();
    },
    [canEdit, toast, t, setRosterCardTypeDisplay],
  );

  return (
    <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
      <GroupHeader
        title={t("dashboard.adminCardStudio.rosterBadgesTitle")}
        hint={t("dashboard.adminCardStudio.rosterBadgesHint")}
      />
      <div className="flex flex-col">
        {ROSTER_CARD_BADGE_META.map((meta, idx) => {
          const on = rosterCardBadges[meta.key];
          const showWarn = !!meta.warnOnHide && !on;
          return (
            <div
              key={meta.key}
              className={`flex items-start justify-between gap-[12px] py-[10px] ${
                idx === 0 ? "" : "border-t border-admin-border-soft"
              }`}
            >
              <div className="min-w-0">
                <div className="text-admin-13 font-medium text-admin-ink">{meta.label}</div>
                <div className="mt-[2px] text-admin-11h leading-[1.4] text-admin-ink-dim">
                  {meta.description}
                </div>
                {showWarn ? (
                  <div className="mt-[6px] inline-flex items-start gap-[5px] rounded-admin-md bg-admin-amber-soft px-[9px] py-[5px] text-admin-11 font-semibold leading-[1.35] text-admin-amber-deep">
                    <Icon name="info" size={12} color={COLORS.amberDeep} />
                    <span>{t("dashboard.adminCardStudio.badgeHideEyeWarn")}</span>
                  </div>
                ) : null}
              </div>
              <div className="flex shrink-0 items-center gap-[8px] pt-px">
                <SaveStatus status={badgeStatus[meta.key]} />
                <Toggle
                  on={on}
                  onChange={canEdit ? (v) => handleToggleBadge(meta.key, v) : undefined}
                  label={interpolate(
                    t("dashboard.adminCardStudio.showBadgeOnRosterAria"),
                    { label: meta.label },
                  )}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Category-block layout. Only meaningful while the category block is
          visible, so it hides with it rather than sitting there as a control
          that does nothing. */}
      {rosterCardBadges.categories ? (
        <div className="mt-[14px] border-t border-admin-border-soft pt-[14px]">
          <div className="flex items-start justify-between gap-[12px]">
            <div className="min-w-0">
              <div className="text-admin-13 font-medium text-admin-ink">
                {t("dashboard.adminCardStudio.rosterTypeDisplayTitle")}
              </div>
              <div className="mt-[2px] text-admin-11h leading-[1.4] text-admin-ink-dim">
                {t("dashboard.adminCardStudio.rosterTypeDisplayHint")}
              </div>
            </div>
            <div className="shrink-0 pt-px">
              <SaveStatus status={typeDisplayStatus} />
            </div>
          </div>
          <div className="mt-[10px]">
            <Segmented<RosterCardTypeDisplay>
              options={ROSTER_CARD_TYPE_DISPLAY_META.map((meta) => ({
                value: meta.value,
                label: meta.label,
              }))}
              value={rosterCardBadges.typeDisplay}
              onChange={handleTypeDisplay}
              disabled={!canEdit}
            />
          </div>
          <div className="mt-[8px] text-admin-11h leading-[1.4] text-admin-ink-dim">
            {
              ROSTER_CARD_TYPE_DISPLAY_META.find(
                (meta) => meta.value === rosterCardBadges.typeDisplay,
              )?.description
            }
          </div>
        </div>
      ) : null}
    </section>
  );
}
