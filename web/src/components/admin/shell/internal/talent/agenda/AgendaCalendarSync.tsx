"use client";

import { useCallback, useEffect, useState, useTransition } from "react";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import {
  disconnectTalentIntegrationAction,
  fetchTalentConnectionSettingsAction,
  saveTalentIntegrationControlsAction,
  type TalentConnectionProviderState,
} from "@/lib/talent-integrations/actions";
import { GOOGLE_CALENDAR_TALENT_INTEGRATION_KEY } from "@/lib/talent-integrations/catalog";
import { buildIcsCalendar, downloadIcs } from "@/lib/ui/ics";
import { SecondaryButton } from "../../primitives";
import { agendaItemToIcs, downloadRange, exportableItems } from "./calendar-sync";

const MUTED = "text-[rgba(11,11,13,0.62)]";
const CARD = "rounded-[14px] border border-[rgba(11,11,13,0.10)] bg-white";

type Copy = { t: (key: string) => string; locale: string };

/**
 * Calendar sync panel body (talent Calendar). What is real:
 *  - Google Calendar status, its two switches and Disconnect read and write the
 *    talent integrations table through the existing server actions.
 *  - Download builds an .ics from the agenda items already loaded.
 * What is not (marked "Coming soon", never pretending): connecting any provider
 * (no calendar OAuth yet), Apple and Outlook, the talent subscribe link (the
 * iCal feed is workspace-scoped only), and .ics import.
 */
export function AgendaCalendarSync({
  copy,
  items,
  anchor,
  weekStart,
}: {
  copy: Copy;
  items: readonly TalentAgendaItem[];
  anchor: Date;
  weekStart: Date;
}) {
  const [google, setGoogle] = useState<TalentConnectionProviderState | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      const result = await fetchTalentConnectionSettingsAction();
      setGoogle(result.providers.find((p) => p.key === GOOGLE_CALENDAR_TALENT_INTEGRATION_KEY) ?? null);
      if (!result.ok) setMessage(result.error);
      setLoaded(true);
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const connected = google?.row?.status === "connected";
  const lastSync = google?.row?.lastSyncAt
    ? new Date(google.row.lastSyncAt).toLocaleString(copy.locale, {
        day: "numeric",
        month: "short",
        hour: "numeric",
        minute: "2-digit",
      })
    : null;

  function saveControl(key: "calendarAvailabilityEnabled" | "calendarWriteEnabled", value: boolean) {
    startTransition(async () => {
      setMessage(null);
      const result = await saveTalentIntegrationControlsAction({
        providerKey: GOOGLE_CALENDAR_TALENT_INTEGRATION_KEY,
        controls: { [key]: value },
      });
      if (!result.ok) setMessage(result.error);
      else if (result.provider) setGoogle(result.provider);
    });
  }

  function disconnect() {
    startTransition(async () => {
      setMessage(null);
      const result = await disconnectTalentIntegrationAction({ providerKey: GOOGLE_CALENDAR_TALENT_INTEGRATION_KEY });
      if (!result.ok) setMessage(result.error);
      else setGoogle(result.provider);
    });
  }

  function download(span: "week" | "month") {
    const { from, to } = downloadRange(anchor, span, weekStart);
    const rows = exportableItems(items, from, to);
    if (rows.length === 0) {
      setMessage(copy.t("Nothing to download in this range."));
      return;
    }
    setMessage(null);
    const payload = buildIcsCalendar(rows.map((r) => agendaItemToIcs(r, copy.t("Blocked"))));
    const stamp = `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, "0")}-${String(from.getDate()).padStart(2, "0")}`;
    downloadIcs(`tulala-${span}-${stamp}`, payload);
  }

  const soon = (
    <span className="rounded-full bg-[rgba(11,11,13,0.06)] px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
      {copy.t("Coming soon")}
    </span>
  );

  const providers: { id: string; name: string; live: boolean }[] = [
    { id: "google", name: "Google Calendar", live: true },
    { id: "apple", name: "Apple (iCloud)", live: false },
    { id: "outlook", name: "Outlook / Microsoft 365", live: false },
  ];

  return (
    <div className="space-y-5">
      {message ? (
        <p role="status" className="rounded-[10px] bg-[rgba(11,11,13,0.05)] px-3 py-2 text-[13px]">
          {message}
        </p>
      ) : null}

      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Connect a calendar")}</h3>
        <div className={`divide-y divide-[rgba(11,11,13,0.08)] ${CARD}`}>
          {providers.map((p) => {
            const isGoogle = p.live;
            const on = isGoogle && connected;
            const status = !isGoogle
              ? copy.t("Not connected")
              : !loaded
                ? copy.t("Checking…")
                : on
                  ? `${copy.t("Connected")}${lastSync ? ` · ${copy.t("last synced")} ${lastSync}` : ""}`
                  : copy.t("Not connected");
            const controls = google?.row?.controls;
            return (
              <div key={p.id} className="space-y-2 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1">
                    <span className="block text-[15px] font-semibold text-[var(--tc-primary)]">{p.name}</span>
                    <span className={`block text-[13px] ${MUTED}`}>{status}</span>
                  </span>
                  {on ? (
                    <>
                      <SecondaryButton onClick={load} disabled={pending}>
                        {copy.t("Refresh")}
                      </SecondaryButton>
                      <SecondaryButton onClick={disconnect} disabled={pending}>
                        {copy.t("Disconnect")}
                      </SecondaryButton>
                    </>
                  ) : (
                    <>
                      {soon}
                      <SecondaryButton disabled>{copy.t("Connect")}</SecondaryButton>
                    </>
                  )}
                </div>
                {on ? (
                  <div className="space-y-1">
                    {(
                      [
                        ["calendarAvailabilityEnabled", "Show busy times from this calendar"],
                        ["calendarWriteEnabled", "Add my Tulala bookings to it"],
                      ] as const
                    ).map(([key, label]) => (
                      <label key={key} className="flex min-h-[44px] items-center gap-3 text-[14px]">
                        <input
                          type="checkbox"
                          className="h-5 w-5"
                          checked={Boolean(controls?.[key])}
                          disabled={pending}
                          onChange={(e) => saveControl(key, e.target.checked)}
                        />
                        {copy.t(label)}
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
        <p className={`text-[12px] ${MUTED}`}>
          {copy.t("Calendar connections are on the way. Nothing is connected until you see Connected here.")}
        </p>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Subscribe (export)")}</h3>
          {soon}
        </div>
        <div className={`space-y-2 p-4 ${CARD}`}>
          <p className={`text-[13px] ${MUTED}`}>
            {copy.t("A private link your calendar app can follow to show your Tulala bookings.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton disabled>{copy.t("Copy link")}</SecondaryButton>
            <SecondaryButton disabled>{copy.t("Reset link")}</SecondaryButton>
          </div>
        </div>
      </section>

      <section className="space-y-2">
        <div className="flex items-center gap-2">
          <h3 className="flex-1 text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Import")}</h3>
          {soon}
        </div>
        <div className={`space-y-2 p-4 ${CARD}`}>
          <p className={`text-[13px] ${MUTED}`}>
            {copy.t("Bring events in from an .ics file. Not available yet.")}
          </p>
          <SecondaryButton disabled>{copy.t("Import an .ics file")}</SecondaryButton>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t("Download")}</h3>
        <div className={`space-y-2 p-4 ${CARD}`}>
          <p className={`text-[13px] ${MUTED}`}>
            {copy.t("Save your bookings and blocked time as an .ics file for any calendar app.")}
          </p>
          <div className="flex flex-wrap gap-2">
            <SecondaryButton onClick={() => download("week")}>{copy.t("This week")}</SecondaryButton>
            <SecondaryButton onClick={() => download("month")}>{copy.t("This month")}</SecondaryButton>
          </div>
        </div>
      </section>
    </div>
  );
}
