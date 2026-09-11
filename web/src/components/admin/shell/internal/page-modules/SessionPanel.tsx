"use client";

/**
 * SessionPanel — the right panel of board W39 for the selected session: the
 * title and series line, the facts card (places, equipment, enrolment
 * closes, cancellation rule, attendance), PARTICIPANTS, CHANGE SCOPE, the
 * four actions, and "Open check-in on the POS".
 *
 * WIRED: Change capacity runs `setSessionPoolUnits` (the events night
 * editor's own writer; Capacity's shrink refusal comes back as the sentence).
 * Participants are the Front desk's roster reader (`loadSessionParticipants`)
 * plus the accepted places from the waitlist desk. The POS door opens the
 * Front desk mode when the workspace has it on.
 *
 * NOT WIRED, said on the control (D-POS-18): Substitute instructor (no
 * instructor is stored on a session), Move participant (no move between
 * sessions exists; a refund and a new ticket is the engine's path), Cancel
 * session (no session cancel writer), the Future sessions / Entire series
 * scopes (the series edit plan exists, `planSeriesEdit`, but no writer applies
 * it). Equipment positions and cancellation rules are not modelled, and the
 * facts card says so rather than inventing a value.
 */

import { useEffect, useState } from "react";

import { useT } from "@/i18n/use-t";
import { useDashboardLocale } from "@/i18n/use-dashboard-locale";
import { interpolate } from "@/i18n/interpolate";
import { setSessionPoolUnits } from "@/app/(workspace)/[tenantSlug]/admin/_events-actions";
import { loadSessionParticipants } from "@/lib/sessions/roster-actions";
import type { AdmissionRosterEntry } from "@/lib/pos/classes/day";
import { DEFAULT_WAITLIST_OFFER_MINUTES } from "@/lib/scheduling/session-waitlist";
import type { WaitlistView } from "@/lib/scheduling/waitlist-desk";
import { useAdminShell } from "../state";
import type { SessionRow } from "./appointments-classes-model";
import { ActionButton, BUTTON_PRIMARY, CARD, FactRow, INPUT, Outcome, SectionLabel, Segmented } from "./appointments-classes-ui";

const K = "dashboard.adminAppointments.board.panel";

type Scope = "this" | "future" | "series";

/** "Tue 15 Sep 11:30", the board's order, on the venue's clock. */
function whenLine(row: SessionRow, locale: string): string {
  try {
    const parts = new Intl.DateTimeFormat(locale, {
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: row.timeZone,
    }).formatToParts(new Date(row.startsAt));
    const part = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
    return `${part("weekday")} ${part("day")} ${part("month").replace(/\.$/, "")} ${part("hour")}:${part("minute")}`;
  } catch {
    return row.startsAt;
  }
}

export function SessionPanel({
  row,
  waitlist,
  tenantId,
  onChanged,
  onOpenWaitlist,
}: {
  row: SessionRow;
  waitlist: WaitlistView | null;
  tenantId: string;
  onChanged: () => void;
  onOpenWaitlist: (id: string) => void;
}) {
  const t = useT();
  const locale = useDashboardLocale();
  const { workspacePosEnabled, workspacePosModes, adminBasePath } = useAdminShell();

  const [participants, setParticipants] = useState<AdmissionRosterEntry[] | null>(null);
  const [participantsError, setParticipantsError] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [scope, setScope] = useState<Scope>("this");
  const [capacityOpen, setCapacityOpen] = useState(false);
  const [capacityValue, setCapacityValue] = useState("");
  const [capacityBusy, setCapacityBusy] = useState(false);
  const [capacityOutcome, setCapacityOutcome] = useState<{ kind: "refused" | "done"; text: string } | null>(null);

  useEffect(() => {
    let alive = true;
    setParticipants(null);
    setParticipantsError(null);
    setShowAll(false);
    setCapacityOpen(false);
    setCapacityOutcome(null);
    setCapacityValue(row.seatsTotal === null ? "" : String(row.seatsTotal));
    loadSessionParticipants(tenantId, row.id).then(
      (r) => {
        if (!alive) return;
        if (r.ok) setParticipants(r.participants);
        else {
          setParticipants([]);
          setParticipantsError(r.error);
        }
      },
      () => {
        if (!alive) return;
        setParticipants([]);
        setParticipantsError(t(`${K}.participantsUnreadable`));
      },
    );
    return () => {
      alive = false;
    };
  }, [row.id, row.seatsTotal, t, tenantId]);

  const accepted = (waitlist?.entries ?? []).filter((e) => e.state === "accepted");
  const people: Array<{ id: string; name: string; note: string }> = [
    ...(participants ?? []).map((p) => ({
      id: p.admissionId,
      name: p.name ?? t(`${K}.unnamedTicket`),
      note:
        p.status !== "valid"
          ? interpolate(t(`${K}.ticketNotValid`), { status: p.status })
          : p.admittedCount >= p.partySize && p.partySize > 0
            ? t(`${K}.ticketHere`)
            : p.partySize > 1
              ? interpolate(t(`${K}.ticketParty`), { count: p.partySize })
              : t(`${K}.ticketBooked`),
    })),
    ...accepted.map((e) => ({ id: e.id, name: e.customerName, note: t(`${K}.fromWaitlist`) })),
  ];
  const shown = showAll ? people : people.slice(0, 4);
  const hidden = people.length - shown.length;

  const posOn = workspacePosEnabled && workspacePosModes.includes("classes");
  const posHref = `${adminBasePath}/pos?mode=classes`;

  const capacityReason =
    row.state === "cancelled" || row.state === "completed"
      ? t(`${K}.capacityOffState`)
      : row.poolCount === 0
        ? t(`${K}.capacityOffNoPool`)
        : row.poolCount > 1
          ? t(`${K}.capacityOffTiers`)
          : null;

  const submitCapacity = async () => {
    const units = Number.parseInt(capacityValue, 10);
    if (!Number.isInteger(units) || units < 0) {
      setCapacityOutcome({ kind: "refused", text: t(`${K}.capacityNeedNumber`) });
      return;
    }
    if (!row.poolKey) return;
    setCapacityBusy(true);
    setCapacityOutcome(null);
    try {
      const result = await setSessionPoolUnits({ sessionId: row.id, poolKey: row.poolKey, unitsTotal: units });
      if (result.ok) {
        setCapacityOutcome({ kind: "done", text: interpolate(t(`${K}.capacitySaved`), { count: units }) });
        onChanged();
      } else {
        setCapacityOutcome({ kind: "refused", text: result.error });
      }
    } catch {
      setCapacityOutcome({ kind: "refused", text: t(`${K}.capacityUnavailable`) });
    } finally {
      setCapacityBusy(false);
    }
  };

  const placesLine =
    row.seatsTotal === null
      ? t("dashboard.adminSessions.noPool")
      : `${row.seatsTotal} · ${interpolate(t(`${K}.booked`), { count: row.booked ?? 0 })} · ${interpolate(t(`${K}.waiting`), { count: row.waiting })}`;

  return (
    <div data-testid="session-panel" className="flex h-full flex-col gap-[12px] font-admin-body">
      <div>
        <div className="text-[14px] font-semibold text-admin-ink">
          {row.title || t("dashboard.adminSessions.nights.untitled")} · {whenLine(row, locale)}
        </div>
        <div className="text-[12px] text-admin-ink-muted">
          {row.seriesTitle
            ? interpolate(t(`${K}.seriesLine`), {
                series: row.seriesTitle,
                n: row.seriesIndex ?? 0,
                of: row.seriesCount ?? 0,
              })
            : t(`${K}.oneOff`)}
          {row.room ? ` · ${row.room}` : ""}
        </div>
      </div>

      <div className={`${CARD} px-[14px] py-[12px]`}>
        <FactRow label={t(`${K}.places`)}>{placesLine}</FactRow>
        <FactRow label={t(`${K}.equipment`)} muted>
          {t(`${K}.equipmentOff`)}
        </FactRow>
        <FactRow label={t(`${K}.enrolmentCloses`)}>
          {interpolate(t(`${K}.enrolmentRule`), { minutes: DEFAULT_WAITLIST_OFFER_MINUTES })}
        </FactRow>
        <FactRow label={t(`${K}.cancellationRule`)} muted>
          {t(`${K}.cancellationOff`)}
        </FactRow>
        <FactRow label={t(`${K}.attendance`)}>{t(`${K}.attendanceRule`)}</FactRow>
      </div>

      <SectionLabel>
        {t(`${K}.participants`)} · {participants === null ? "…" : people.length}
      </SectionLabel>
      <div className="flex flex-col gap-[4px]" data-testid="session-participants">
        {participants === null ? (
          <div className="text-[12px] text-admin-ink-muted">{t(`${K}.participantsLoading`)}</div>
        ) : participantsError ? (
          <Outcome kind="refused">{participantsError}</Outcome>
        ) : people.length === 0 ? (
          <div className="rounded-[9px] border border-admin-border bg-admin-card px-[10px] py-[6px] text-[12px] text-admin-ink-muted">
            {t(`${K}.nobodyYet`)}
          </div>
        ) : (
          shown.map((p) => (
            <div key={p.id} className="flex items-center gap-[8px] rounded-[9px] border border-admin-border bg-admin-card px-[10px] py-[6px] text-[12px]">
              <span className="flex-1 font-semibold text-admin-ink">{p.name}</span>
              <span className="text-admin-ink-muted">{p.note}</span>
            </div>
          ))
        )}
        {hidden > 0 ? (
          <button
            type="button"
            className="cursor-pointer rounded-[9px] border border-admin-border bg-admin-card px-[10px] py-[6px] text-left text-[12px] font-semibold text-admin-ink hover:border-admin-border-strong"
            onClick={() => setShowAll(true)}
          >
            {interpolate(t(`${K}.more`), { count: hidden })}
          </button>
        ) : null}
        {row.state === "full" || row.waiting > 0 ? (
          <button
            type="button"
            className="cursor-pointer self-start text-[12px] font-semibold text-admin-brand underline underline-offset-2"
            onClick={() => onOpenWaitlist(row.id)}
          >
            {t("dashboard.adminAppointments.waitlist.openFromSession")}
          </button>
        ) : null}
      </div>

      <SectionLabel>{t(`${K}.changeScope`)}</SectionLabel>
      <Segmented<Scope>
        label={t(`${K}.changeScope`)}
        value={scope}
        onChange={setScope}
        options={[
          { id: "this", label: t(`${K}.scope.this`) },
          { id: "future", label: t(`${K}.scope.future`), reason: t(`${K}.scopeOff`) },
          { id: "series", label: t(`${K}.scope.series`), reason: t(`${K}.scopeOff`) },
        ]}
      />

      <div className="grid grid-cols-2 gap-[8px]">
        <ActionButton reason={t(`${K}.substituteOff`)} size="sm">
          {t(`${K}.substitute`)}
        </ActionButton>
        <ActionButton
          reason={capacityReason}
          size="sm"
          testId="session-change-capacity"
          onClick={() => {
            setCapacityOpen((v) => !v);
            setCapacityOutcome(null);
          }}
        >
          {t(`${K}.changeCapacity`)}
        </ActionButton>
        <ActionButton reason={t(`${K}.moveOff`)} size="sm">
          {t(`${K}.moveParticipant`)}
        </ActionButton>
        <ActionButton reason={t(`${K}.cancelOff`)} tone="danger" size="sm">
          {t(`${K}.cancelSession`)}
        </ActionButton>
      </div>

      {capacityOpen && !capacityReason ? (
        <form
          data-testid="session-capacity-form"
          className={`${CARD} flex flex-col gap-[8px] p-[12px]`}
          onSubmit={(e) => {
            e.preventDefault();
            void submitCapacity();
          }}
        >
          <label className="flex flex-col gap-[4px] text-[12px] text-admin-ink-muted">
            <span>{t(`${K}.capacityLabel`)}</span>
            <input
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              className={INPUT}
              value={capacityValue}
              onChange={(e) => setCapacityValue(e.target.value)}
            />
          </label>
          <p className="m-0 text-[11.5px] leading-[1.45] text-admin-ink-muted">{t(`${K}.capacityHint`)}</p>
          <div className="flex gap-[8px]">
            <button type="submit" disabled={capacityBusy} className={`${BUTTON_PRIMARY} disabled:opacity-60`}>
              {capacityBusy ? t(`${K}.capacitySaving`) : t(`${K}.capacitySave`)}
            </button>
            <ActionButton onClick={() => setCapacityOpen(false)} disabled={capacityBusy}>
              {t(`${K}.capacityClose`)}
            </ActionButton>
          </div>
          {capacityOutcome ? (
            <Outcome kind={capacityOutcome.kind} testId="session-capacity-message">
              {capacityOutcome.text}
            </Outcome>
          ) : null}
        </form>
      ) : null}

      <div className="flex-1" />

      {posOn ? (
        <a href={posHref} className={`${BUTTON_PRIMARY} h-[40px]`} data-testid="session-open-pos">
          {t(`${K}.openPos`)}
        </a>
      ) : (
        <ActionButton reason={t(`${K}.openPosOff`)} tone="primary" className="h-[40px]">
          {t(`${K}.openPos`)}
        </ActionButton>
      )}
    </div>
  );
}
