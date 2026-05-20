"use client";

// ════════════════════════════════════════════════════════════════════
// talent-drawers/availability — Phase 1d body chunk.
// Owns: TalentProfileSectionDrawer, TalentAvailabilityDrawer,
// TalentBlockDatesDrawer, TalentPortfolioDrawer.
// Private helpers: AvailabilityAddAction, AvailabilityToggleRow.
// Bodies copied byte-for-byte from talent-drawers.tsx; no behavior change.
// ════════════════════════════════════════════════════════════════════

import { useState } from "react";
import { AVAILABILITY_BLOCKS, COLORS, FONTS, MY_TALENT_PROFILE, TRANSITION, useAdminShell } from "../state";
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
  const open = state.drawer.drawerId === "talent-profile-section";
  const label = (state.drawer.payload?.label as string) ?? "Section";

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title={`Edit · ${label}`}
      description="This section is not connected to your live profile yet."
      width={520}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="profile section" />
    </DrawerShell>
  );
}

// ─── Availability ────────────────────────────────────────────────

export function TalentAvailabilityDrawer() {
  const { state, closeDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-availability";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Availability"
      description="Your blocks are visible to your agencies — they won't pitch you when you're unavailable."
      width={520}
      footer={<StandardFooter onSave={() => closeDrawer()} saveLabel="Done" />}
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
  const { state, closeDrawer, openDrawer } = useAdminShell();
  const open = state.drawer.drawerId === "talent-block-dates";
  const p = MY_TALENT_PROFILE;

  const [location, setLocation] = useState(p.currentLocation);
  const [availableForWork, setAvailableForWork] = useState(p.availableForWork);
  const [availableToTravel, setAvailableToTravel] = useState(p.availableToTravel);

  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Availability"
      description="Where you are, what you're up for, and dates you can't work. Visible to your agencies."
      width={540}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
        {/* ─── 1. Where are you? — C7 location autocomplete suggestions ── */}
        <section>
          <SubsectionLabel>Where are you?</SubsectionLabel>
          <div className="mt-2.5">
            <FieldRow
              label="Current location"
              hint="Synced with your profile · helps agencies pitch you the right local jobs first."
            >
              <TextInput
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="City · Country"
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
                Quick pick:
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
          <SubsectionLabel>Taking work</SubsectionLabel>
          <div
            style={{
              marginTop: 10,
              border: `1px solid ${COLORS.borderSoft}`,
              borderRadius: 10,
              overflow: "hidden",
            }}
          >
            <AvailabilityToggleRow
              label="Available for new work"
              hint="When off, you're hidden from new pitches. Existing bookings aren't affected."
              on={availableForWork}
              onChange={setAvailableForWork}
            />
            <AvailabilityToggleRow
              label="Open to travel"
              hint={
                availableForWork
                  ? "When off, you'll only see local jobs in your current location."
                  : "Pause availability before changing travel preferences."
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
                Travel preferences
              </div>
              <FieldRow label="Willing to fly to" optional hint="Cities or regions you'll travel for. Leave blank for anywhere.">
                <TextInput placeholder="Paris, Milan, NYC · or leave blank for anywhere" />
              </FieldRow>
              <div style={{ height: 8 }} />
              <FieldRow label="Min booking value when traveling" optional hint="Bookings below this amount won't be pitched if travel is required.">
                <TextInput placeholder="e.g. €1,500" />
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
                  Travel costs must be covered by client
                </div>
              </button>
            </div>
          )}
        </section>

        {/* ─── 3. Existing blocks (A5) ──────────────────────────── */}
        {AVAILABILITY_BLOCKS.length > 0 && (
          <section>
            <SubsectionLabel>Your existing blocks · {AVAILABILITY_BLOCKS.length}</SubsectionLabel>
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
                    aria-label={`Remove block ${b.startDate}-${b.endDate}`}
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

        {/* ─── 4. Add to your calendar ────────────────────────────
            Two action paths into the full Add Event drawer. Replaces the
            prior inline From/To/Reason form because the dedicated drawer
            does it better — reason chips, currency picker, advanced
            details, source attribution. The Availability drawer now
            handles the simple state (location + toggles) and hands off
            to the richer flow when the talent needs to log or block. */}
        <section>
          <SubsectionLabel>Add to your calendar</SubsectionLabel>
          <div style={{ marginTop: 6, fontFamily: FONTS.body, fontSize: 12, marginBottom: 10 }} className="text-admin-ink-muted">
            Track work you did off-platform, or block dates when you can&apos;t work.
          </div>
          <div className="flex flex-col gap-2">
            <AvailabilityAddAction
              icon="credit"
              tone="success"
              title="Log work"
              body="Off-platform booking — adds to earnings + calendar."
              onClick={() => {
                openDrawer("talent-add-event", { mode: "work" });
              }}
            />
            <AvailabilityAddAction
              icon="lock"
              tone="caution"
              title="Block time"
              body="Vacation, day job, school, family — anything that means you're not available."
              onClick={() => {
                openDrawer("talent-add-event", { mode: "block" });
              }}
            />
          </div>
        </section>
      </div>
    </DrawerShell>
  );
}

/**
 * Compact action row used inside the Availability drawer's "Add to your
 * calendar" section. Tinted icon chip + title + body + chevron. Click
 * launches the full TalentAddEventDrawer in the appropriate mode.
 */
function AvailabilityAddAction({
  icon,
  tone,
  title,
  body,
  onClick,
}: {
  icon: "credit" | "lock";
  tone: "success" | "caution";
  title: string;
  body: string;
  onClick: () => void;
}) {
  const palette = {
    success: { bg: COLORS.successSoft, fg: COLORS.green },
    caution: { bg: COLORS.amberSoft, fg: COLORS.amber },
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        width: "100%",
        padding: "12px 14px",
        background: "#fff",
        border: `1px solid ${COLORS.borderSoft}`,
        borderRadius: 10,
        cursor: "pointer",
        fontFamily: FONTS.body,
        textAlign: "left",
        transition: `border-color ${TRANSITION.micro}, transform ${TRANSITION.micro}`,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = COLORS.border;
        e.currentTarget.style.transform = "translateY(-1px)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = COLORS.borderSoft;
        e.currentTarget.style.transform = "translateY(0)";
      }}
    >
      <span
        aria-hidden
        style={{
          width: 28,
          height: 28,
          borderRadius: 7,
          background: palette.bg,
          color: palette.fg,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          flexShrink: 0,
        }}
      >
        <Icon name={icon} size={13} stroke={1.7} />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-admin-ink text-admin-13 font-semibold">
          {title}
        </div>
        <div style={{ fontSize: 11.5, marginTop: 2, lineHeight: 1.4 }} className="text-admin-ink-muted">
          {body}
        </div>
      </div>
      <Icon name="chevron-right" size={13} color={COLORS.inkDim} />
    </button>
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
  const open = state.drawer.drawerId === "talent-portfolio";
  return (
    <DrawerShell
      open={open}
      onClose={closeDrawer}
      title="Portfolio"
      description="This portfolio panel is not connected to your live media yet."
      width={620}
      footer={<SecondaryButton onClick={closeDrawer}>Close</SecondaryButton>}
    >
      <ProfileSectionNotConnected section="portfolio" />
    </DrawerShell>
  );
}
