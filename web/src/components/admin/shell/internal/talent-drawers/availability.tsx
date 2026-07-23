"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/availability — Phase 1d body chunk.
// Owns: TalentProfileSectionDrawer, TalentAvailabilityDrawer,
// TalentBlockDatesDrawer, TalentPortfolioDrawer.
// Private helpers: AvailabilityToggleRow.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { useT } from "@/i18n/use-t";
import { useDashboardText } from "../dashboard-i18n";
import { interpolate } from "@/i18n/interpolate";
import { AVAILABILITY_BLOCKS, COLORS, FONTS, MY_TALENT_PROFILE, useAdminShell } from "../state";
import {
  DrawerShell,
  FieldRow,
  Icon,
  SecondaryButton,
  TextInput,
  Toggle,
} from "../primitives";
import { ProfileSectionNotConnected, StandardFooter, SubsectionLabel } from "./shared";

// ─── Section editor (used for sub-sections of profile) ───────────

export function TalentProfileSectionDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-profile-section";
  const label =
    (state.drawer.payload?.label as string) ??
    t("dashboard.talentDrawers.availability.sectionFallbackLabel");

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={interpolate(t("dashboard.talentDrawers.availability.sectionEditTitle"), { label })}
      description={t("dashboard.talentDrawers.availability.sectionEditDesc")}
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="profile section" />
    </DrawerShell>
  );
}

// ─── Availability ────────────────────────────────────────────────

export function TalentAvailabilityDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-availability";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.availability.availTitle")}
      description={t("dashboard.talentDrawers.availability.availDescSimple")}
      width={520}
      footer={<StandardFooter onSave={() => closeDrawer()} saveLabel={t("dashboard.talentDrawers.done")} />}
    >
      <div className="flex flex-col gap-2">
        {AVAILABILITY_BLOCKS.map((a) => (
          <div
            key={a.id}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              padding: "12px 14px",
              background: "#fff",
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              fontFamily: FONTS.body,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: a.type === "travel" ? COLORS.amber : COLORS.inkMuted, }}
            />
            <span style={{ flex: 1, fontSize: 13.5 }} className="text-admin-ink">
              {a.startDate} – {a.endDate}
            </span>
            <span className="text-admin-ink-muted text-admin-11h">{a.reason}</span>
          </div>
        ))}
      </div>
    </DrawerShell>
  );
}

// ─── Block dates ────────────────────────────────────────────────

/**
 * Availability drawer — formerly "Block dates", expanded to be the talent's
 * single availability surface. Three layers, in order of decision frequency:
 *
 *   1. Where are you?       → Current location. Changes weekly for traveling
 *                              talent. Drives "available to work in {city}"
 *                              hero copy + powers location-aware pitch routing.
 *   2. Taking work?         → Master availability + travel toggle. Daily/weekly.
 *   3. Block specific dates → Single-shot date-range blocks. Monthly.
 *
 * The previous "Block dates" surface only handled #3. Talents in real life
 * spend more time toggling #1 (where they ARE) and #2 (whether they're up
 * for travel) than blocking specific date ranges.
 */
export function TalentBlockDatesDrawer() {
  const { state, closeDrawer, setTalentPage, bridgeTalentSelfProfile, bridgeTalentCalendarEntries } = useAdminShell();
  const t = useT();
  const copy = useDashboardText();
  const open = state.drawer.drawerId === "talent-block-dates";
  // Seed from the REAL talent when the bridge is live — this drawer used to
  // read MY_TALENT_PROFILE unconditionally, so every real talent saw the demo
  // talent's city and toggles.
  const p = MY_TALENT_PROFILE;
  const isBridged = bridgeTalentSelfProfile != null;
  const seedLocation = isBridged
    ? (bridgeTalentSelfProfile.homeCity ?? "")
    : p.currentLocation;

  const [location, setLocation] = useState(seedLocation);
  const [availableForWork, setAvailableForWork] = useState(isBridged ? true : p.availableForWork);
  const [availableToTravel, setAvailableToTravel] = useState(isBridged ? true : p.availableToTravel);
  // Real blocks for the bridged talent (same rows the Calendar's block form
  // writes). The mock AVAILABILITY_BLOCKS fixture is demo-only.
  const realBlockCount = (bridgeTalentCalendarEntries ?? []).filter((e) => e.kind === "block").length;

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.availability.availTitle")}
      description={t("dashboard.talentDrawers.availability.availDescFull")}
      width={540}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* Sections 1+2 (location + work/travel toggles) are DEMO-ONLY: there is
            no talent_profiles column behind them, so for a real bridged talent
            they showed the demo talent's values and silently discarded edits.
            Real talents get the working blocks view below instead. */}
        {isBridged && (
          <section>
            <div className="rounded-[10px] border border-admin-border-soft bg-admin-surface-alt px-3.5 py-3">
              <div className="text-admin-ink text-[13px] font-semibold">
                {copy.t("Blocked dates")} · {realBlockCount}
              </div>
              <div className="mt-1 text-[12px] leading-[1.5] text-admin-ink-muted">
                {realBlockCount > 0
                  ? copy.t("Agencies can't pitch you for these dates.")
                  : copy.t("Block unavailable dates so agencies don't pitch you for jobs you can't take.")}
              </div>
              <button
                type="button"
                onClick={() => { closeDrawer(); setTalentPage("calendar"); }}
                className="mt-3 cursor-pointer rounded-[999px] border-none bg-admin-accent px-3.5 py-2 text-[12.5px] font-semibold text-white"
              >
                {copy.t("Manage in Calendar")}
              </button>
            </div>
          </section>
        )}

        {!isBridged && (<>
        {/* ─── 1. Where are you? — C7 location autocomplete suggestions ── */}
        <section>
          <SubsectionLabel>{t("dashboard.talentDrawers.availability.whereTitle")}</SubsectionLabel>
          <div className="mt-2.5">
            <FieldRow
              label={t("dashboard.talentDrawers.availability.currentLocation")}
              hint={t("dashboard.talentDrawers.availability.currentLocationHint")}
            >
              <TextInput
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder={t("dashboard.talentDrawers.availability.locationPlaceholder")}
              />
            </FieldRow>
            {/* C7: Quick-pick chips for fashion-cities. Production should
                replace with Google Places autocomplete. */}
            <div
              style={{
                display: "flex",
                gap: 6,
                flexWrap: "wrap",
                marginTop: 8,
              }}
            >
              <span style={{ fontSize: 10.5, fontFamily: FONTS.body, fontWeight: 500, letterSpacing: 0.4, textTransform: "uppercase", marginRight: 4, alignSelf: "center" }} className="text-admin-ink-dim">
                {t("dashboard.talentDrawers.availability.quickPick")}
              </span>
              {[
                "Madrid · Spain",
                "Paris · France",
                "Milan · Italy",
                "London · UK",
                "New York · USA",
                "Playa del Carmen · Mexico",
              ].map((city) => (
                <button
                  key={city}
                  type="button"
                  onClick={() => setLocation(city)}
                  style={{
                    padding: "3px 9px",
                    background: location === city ? COLORS.fill : "#fff",
                    border: `1px solid ${location === city ? COLORS.accent : COLORS.borderSoft}`,
                    borderRadius: 999,
                    cursor: "pointer",
                    fontFamily: FONTS.body,
                    fontSize: 11,
                    color: location === city ? "#fff" : COLORS.ink,
                  }}
                >
                  {city.split(" ·")[0]}
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* ─── 2. Taking work? — C6 travel preferences richer ─────────── */}
        <section>
          <SubsectionLabel>{t("dashboard.talentDrawers.availability.takingWorkTitle")}</SubsectionLabel>
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <AvailabilityToggleRow
              label={t("dashboard.talentDrawers.availability.availableForWork")}
              hint={t("dashboard.talentDrawers.availability.availableForWorkHint")}
              on={availableForWork}
              onChange={setAvailableForWork}
            />
            <AvailabilityToggleRow
              label={t("dashboard.talentDrawers.availability.openToTravel")}
              hint={
                availableForWork
                  ? t("dashboard.talentDrawers.availability.openToTravelHintOn")
                  : t("dashboard.talentDrawers.availability.openToTravelHintOff")
              }
              on={availableToTravel && availableForWork}
              onChange={setAvailableToTravel}
              disabled={!availableForWork}
            />
          </div>
          {/* C6: Travel preferences richer — only when travel is on */}
          {availableToTravel && availableForWork && (
            <div style={{ marginTop: 12, padding: "12px 14px", border: `1px solid ${COLORS.borderSoft}`, borderRadius: 10, fontFamily: FONTS.body }} className="bg-admin-surface-alt">
              <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.4, textTransform: "uppercase", marginBottom: 8 }} className="text-admin-ink-muted">
                {t("dashboard.talentDrawers.availability.travelPrefsTitle")}
              </div>
              <FieldRow label={t("dashboard.talentDrawers.availability.willingToFlyTo")} optional hint={t("dashboard.talentDrawers.availability.willingToFlyToHint")}>
                <TextInput placeholder={t("dashboard.talentDrawers.availability.willingToFlyToPlaceholder")} />
              </FieldRow>
              <div style={{ height: 8 }} />
              <FieldRow label={t("dashboard.talentDrawers.availability.minBookingTraveling")} optional hint={t("dashboard.talentDrawers.availability.minBookingTravelingHint")}>
                <TextInput placeholder={t("dashboard.talentDrawers.availability.minBookingPlaceholder")} />
              </FieldRow>
              <div style={{ height: 10 }} />
              <button
                type="button"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  padding: "8px 10px",
                  background: "#fff",
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 8,
                  cursor: "pointer",
                  fontFamily: FONTS.body,
                  textAlign: "left",
                }}
              >
                <span style={{ width: 14, height: 14, borderRadius: 3, background: "transparent", border: `1.5px solid ${COLORS.border}`, flexShrink: 0, }}
                />
                <div className="text-admin-ink text-xs">
                  {t("dashboard.talentDrawers.availability.travelCostsCovered")}
                </div>
              </button>
            </div>
          )}
        </section>
        </>)}

        {/* ─── 3. Existing blocks (A5) ──────────────────────────── */}
        {!isBridged && AVAILABILITY_BLOCKS.length > 0 && (
          <section>
            <SubsectionLabel>{interpolate(t("dashboard.talentDrawers.availability.existingBlocks"), { count: AVAILABILITY_BLOCKS.length })}</SubsectionLabel>
            <div
              style={{
                marginTop: 10,
                display: "flex",
                flexDirection: "column",
                gap: 0,
                border: `1px solid ${COLORS.borderSoft}`,
                borderRadius: 10,
                overflow: "hidden",
              }}
            >
              {AVAILABILITY_BLOCKS.map((b, i) => (
                <div
                  key={b.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 12px",
                    borderTop: i === 0 ? "none" : `1px solid ${COLORS.borderSoft}`,
                    fontFamily: FONTS.body,
                  }}
                >
                  <span
                    aria-hidden
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: b.type === "travel" ? COLORS.amber : COLORS.inkMuted,
                      flexShrink: 0,
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="text-admin-ink text-admin-12h font-medium">
                      {b.startDate} – {b.endDate}
                    </div>
                    <div style={{ fontSize: 11, marginTop: 1 }} className="text-admin-ink-muted">
                      {b.reason}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => undefined}
                    aria-label={interpolate(t("dashboard.talentDrawers.availability.removeBlock"), { range: `${b.startDate}-${b.endDate}` })}
                    style={{
                      background: "transparent",
                      border: "none",
                      padding: "4px 6px",
                      cursor: "pointer",
                      color: COLORS.inkDim,
                    }}
                  >
                    <Icon name="x" size={11} stroke={1.8} />
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* "Add to your calendar" (Log work / Block time) removed: both paths
            opened the talent-add-event drawer, whose modes are unpersisted
            "coming soon" stubs — dead CTAs. Re-add once that flow is built. */}
      </div>
    </DrawerShell>
  );
}


/**
 * Compact toggle row used inside the Availability drawer's grouped panels.
 * Disabled state collapses the toggle to a no-op + dims the row.
 */
function AvailabilityToggleRow({
  label,
  hint,
  on,
  onChange,
  disabled = false,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 14,
        padding: "12px 14px",
        borderBottom: `1px solid ${COLORS.borderSoft}`,
        opacity: disabled ? 0.55 : 1,
      }}
    >
      <div className="flex-1 min-w-0">
        <div style={{ fontFamily: FONTS.body, fontSize: 13, fontWeight: 600 }} className="text-admin-ink">
          {label}
        </div>
        {hint && (
          <div style={{ fontFamily: FONTS.body, fontSize: 12, marginTop: 2, lineHeight: 1.5 }} className="text-admin-ink-muted">
            {hint}
          </div>
        )}
      </div>
      <Toggle
        on={on}
        onChange={() => !disabled && onChange(!on)}
      />
    </div>
  );
}

// ─── Portfolio manager ───────────────────────────────────────────

export function TalentPortfolioDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const t = useT();
  const open = state.drawer.drawerId === "talent-portfolio";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={t("dashboard.talentDrawers.availability.portfolioTitle")}
      description={t("dashboard.talentDrawers.availability.portfolioDesc")}
      width={620}
      footer={<SecondaryButton onClick={closeDrawer}>{t("dashboard.talentDrawers.close")}</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="portfolio" />
    </DrawerShell>
  );
}
