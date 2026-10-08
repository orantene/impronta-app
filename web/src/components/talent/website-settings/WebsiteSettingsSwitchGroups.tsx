"use client";

/**
 * WSF-C: the talent_sites switches in the F1 settings screen. Each edits the
 * shared draft only; nothing is written until Save (report §7, §8, Q3).
 */

import type { TalentSiteSwitches } from "@/lib/talent/site-switches";
import { LiveOnSaveNote, SettingsCard, Switch } from "./primitives";

type T = (s: string) => string;

type SwitchProps = {
  t: T;
  switches: TalentSiteSwitches;
  setSwitches: (next: TalentSiteSwitches) => void;
};

const LIVE_NOTE = "Live on Save. Nothing changes for clients until you save.";
const SCOPE = "Applies to your website and Tulala profile.";
const AGENCY_SCOPE = "Agency bookings are managed by each agency.";

/** The one "Accept new bookings" switch, shown in two groups (prototype). */
export function AcceptBookingsCard({ t, switches, setSwitches }: SwitchProps) {
  return (
    <SettingsCard>
      <Switch
        checked={switches.acceptingBookings}
        label={t("Accept new bookings")}
        detail={t(
          "Pause keeps your website, portfolio and chat visible. Existing clients keep their booking links and conversations.",
        )}
        onChange={(v) => setSwitches({ ...switches, acceptingBookings: v })}
      />
      <p className="pb-1 text-[12.5px] text-admin-ink-muted">
        {t(SCOPE)} {t(AGENCY_SCOPE)}
      </p>
    </SettingsCard>
  );
}

export function ChatInquiriesGroup({
  t,
  switches,
  setSwitches,
  strandedTitles,
}: SwitchProps & { strandedTitles: string[] }) {
  return (
    <>
      <LiveOnSaveNote>{t(LIVE_NOTE)}</LiveOnSaveNote>
      <SettingsCard>
        <Switch
          checked={switches.chatEnabled}
          label={t("Website chat")}
          detail={t("Off hides the chat button. Existing conversations stay and you can still reply.")}
          onChange={(v) => setSwitches({ ...switches, chatEnabled: v })}
        />
        {!switches.chatEnabled ? (
          <p className="mb-2 rounded-lg bg-emerald-50 px-3 py-2 text-[12.5px] text-emerald-900">
            {t("'Consultar' will open an inquiry form so inquiry-only services still reach you.")}
          </p>
        ) : null}
        <Switch
          checked={switches.acceptingInquiries}
          label={t("Accept new inquiries")}
          detail={t("Off hides Ask and Consultar. Clients with a booking can still message you.")}
          onChange={(v) => setSwitches({ ...switches, acceptingInquiries: v })}
        />
        {strandedTitles.length > 0 ? (
          <p role="status" className="mb-2 rounded-lg bg-amber-50 px-3 py-2 text-[12.5px] text-amber-900">
            {(strandedTitles.length === 1
              ? t("This service will show as unavailable: {services}")
              : t("These {n} services will show as unavailable: {services}")
            )
              .replace("{n}", String(strandedTitles.length))
              .replace("{services}", strandedTitles.join(", "))}
          </p>
        ) : null}
        <p className="pb-1 text-[12.5px] text-admin-ink-muted">
          {t(SCOPE)} {t(AGENCY_SCOPE)}
        </p>
      </SettingsCard>
    </>
  );
}

export function VisibilityGroup(props: SwitchProps) {
  return (
    <>
      <LiveOnSaveNote>{props.t(LIVE_NOTE)}</LiveOnSaveNote>
      <AcceptBookingsCard {...props} />
    </>
  );
}

/** One-line summaries for the home list. */
export function chatSummary(t: T, s: TalentSiteSwitches): string {
  return `${s.chatEnabled ? t("Chat on") : t("Chat off")} · ${
    s.acceptingInquiries ? t("Taking inquiries") : t("Inquiries paused")
  }`;
}

export function visibilitySummary(t: T, s: TalentSiteSwitches): string {
  return s.acceptingBookings ? t("Taking new bookings") : t("New bookings paused");
}
