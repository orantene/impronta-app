import { CardFeatureToggles } from "./CardDesignStudio-2";
import {
  HOVER_LABEL,
  HOVER_LABEL_KEY,
  Segmented,
  ToggleRow,
} from "./CardDesignStudio-2";
import {
  GroupHeader,
  type CardAppearance,
  type CardAspect,
  type CardStyle,
  type HoverBehavior,
} from "./CardDesignStudio-3";
/**
 * The Studio's Layout block.
 *
 * `cardStyle` / `cardAspect` / `hoverBehavior` persist as tenant-wide DEFAULTS
 * (via `setLayoutDefault`); the show/hide toggles below them remain preview
 * only, because those are genuinely per-section decisions edited on the
 * directory section itself. Extracted from CardDesignStudio.tsx to keep that
 * file under the max-lines cap.
 */
export function CardAppearanceSection({
  t,
  canEdit,
  appearance,
  patchAppearance,
  setLayoutDefault,
  readTemplateToken,
  setTemplateToken,
}: {
  t: (key: string) => string;
  canEdit: boolean;
  appearance: CardAppearance;
  patchAppearance: <K extends keyof CardAppearance>(
    key: K,
    value: CardAppearance[K],
  ) => void;
  setLayoutDefault: (
    key: keyof CardAppearance,
    tokenKey: string,
    value: string,
  ) => void;
  readTemplateToken: (key: string) => string | undefined;
  setTemplateToken: (key: string, value: string) => void;
}) {
  return (
          
          <section className="rounded-admin-lg border border-admin-border bg-admin-card p-[16px]">
            <GroupHeader
              title={t("dashboard.adminCardStudio.layoutTitle")}
              hint={t("dashboard.adminCardStudio.layoutHint")}
            />
            <div className="flex flex-col gap-[14px]">
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">
                  {t("dashboard.adminCardStudio.cardStyleLabel")}
                </span>
                <Segmented<CardStyle>
                  value={appearance.cardStyle}
                  onChange={(v) => setLayoutDefault("cardStyle", "directory.card.style", v)}
                  disabled={!canEdit}
                  options={[
                    { value: "portrait", label: t("dashboard.adminCardStudio.stylePortrait") },
                    { value: "editorial", label: t("dashboard.adminCardStudio.styleEditorial") },
                  ]}
                />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">
                  {t("dashboard.adminCardStudio.imageAspectLabel")}
                </span>
                <Segmented<CardAspect>
                  value={appearance.cardAspect}
                  onChange={(v) => setLayoutDefault("cardAspect", "directory.card.aspect", v)}
                  disabled={!canEdit}
                  options={[
                    { value: "4:5", label: "4:5" },
                    { value: "1:1", label: "1:1" },
                    { value: "3:4", label: "3:4" },
                    { value: "16:9", label: "16:9" },
                  ]}
                />
              </label>
              <label className="flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">
                  {t("dashboard.adminCardStudio.hoverBehaviorLabel")}
                </span>
                <Segmented<HoverBehavior>
                  value={appearance.hoverBehavior}
                  onChange={(v) => setLayoutDefault("hoverBehavior", "directory.card.hover", v)}
                  disabled={!canEdit}
                  options={(Object.keys(HOVER_LABEL) as HoverBehavior[]).map((h) => ({
                    value: h,
                    label: t(HOVER_LABEL_KEY[h]),
                  }))}
                />
              </label>
            </div>
            <div className="mx-0 mb-[4px] mt-[14px] h-px bg-admin-border-soft" />
            <ToggleRow label={t("dashboard.adminCardStudio.rowName")} on={appearance.showName} onChange={canEdit ? (v) => patchAppearance("showName", v) : undefined} disabled={!canEdit} />
            <ToggleRow label={t("dashboard.adminCardStudio.rowTalentType")} on={appearance.showTalentType} onChange={canEdit ? (v) => patchAppearance("showTalentType", v) : undefined} disabled={!canEdit} />
            <ToggleRow label={t("dashboard.adminCardStudio.rowLocation")} on={appearance.showLocation} onChange={canEdit ? (v) => patchAppearance("showLocation", v) : undefined} disabled={!canEdit} />
            <ToggleRow label={t("dashboard.adminCardStudio.rowAttributes")} on={appearance.showAttributes} onChange={canEdit ? (v) => patchAppearance("showAttributes", v) : undefined} disabled={!canEdit} />
            <ToggleRow label={t("dashboard.adminCardStudio.rowAvailability")} on={appearance.showAvailability} onChange={canEdit ? (v) => patchAppearance("showAvailability", v) : undefined} disabled={!canEdit} />
            <ToggleRow label={t("dashboard.adminCardStudio.rowTrustBadges")} on={appearance.showBadges} onChange={canEdit ? (v) => patchAppearance("showBadges", v) : undefined} disabled={!canEdit} />
            <ToggleRow label={t("dashboard.adminCardStudio.rowRating")} on={appearance.showRating} onChange={canEdit ? (v) => patchAppearance("showRating", v) : undefined} disabled={!canEdit} />
            {/* PREVIEW-ONLY — real control is the directory section's showPriceFrom
                knob; a 2nd persistence path would just re-create the drift. */}
            <ToggleRow label={t("dashboard.adminCardStudio.rowPriceFrom")} hint={t("dashboard.adminCardStudio.rowPriceFromHint")} on={appearance.showPriceFrom} onChange={canEdit ? (v) => patchAppearance("showPriceFrom", v) : undefined} disabled={!canEdit} />

            {/* Reviews on cards — REAL persistence (template tokens; see
                setTemplateToken). Master on/off maps show-standing off↔compact;
                the style picker + profile visibility mirror the price idiom. */}
            <div className="mx-0 mb-[4px] mt-[14px] h-px bg-admin-border-soft" />
            <div className="mx-0 mb-[2px] mt-[6px] text-[12px] font-semibold text-admin-ink-muted">
              {t("dashboard.adminCardStudio2.reviewsOnCardsTitle")}
            </div>
            <ToggleRow
              label={t("dashboard.adminCardStudio2.showStandingLabel")}
              hint={t("dashboard.adminCardStudio2.showStandingHint")}
              on={readTemplateToken("directory.card.show-standing") !== "off"}
              onChange={canEdit ? (v) => setTemplateToken("directory.card.show-standing", v ? "compact" : "off") : undefined}
              disabled={!canEdit}
            />
            {readTemplateToken("directory.card.show-standing") !== "off" ? (
              <label className="mt-[10px] flex flex-col gap-[6px]">
                <span className="text-[12px] font-semibold text-admin-ink-muted">
                  {t("dashboard.adminCardStudio2.standingStyleLabel")}
                </span>
                <Segmented<"tier" | "signal" | "both">
                  value={
                    (readTemplateToken("directory.card.standing-style") as
                      | "tier"
                      | "signal"
                      | "both") || "both"
                  }
                  onChange={(v) => setTemplateToken("directory.card.standing-style", v)}
                  disabled={!canEdit}
                  options={[
                    { value: "tier", label: t("dashboard.adminCardStudio2.standingTier") },
                    { value: "signal", label: t("dashboard.adminCardStudio2.standingSignal") },
                    { value: "both", label: t("dashboard.adminCardStudio2.standingBoth") },
                  ]}
                />
              </label>
            ) : null}
            <CardFeatureToggles
              t={t}
              canEdit={canEdit}
              readTemplateToken={readTemplateToken}
              setTemplateToken={setTemplateToken}
            />
          </section>
  );
}
