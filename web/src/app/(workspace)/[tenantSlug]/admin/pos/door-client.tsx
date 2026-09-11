"use client";

/**
 * DoorClient — the Door mode ("Tickets"), drawn as the boards.
 *
 * FIVE ROWS ON ONE RAIL (`POSGateReady`): `tickets` is the box office (E01
 * to E07: pick the event and the date, the tiers with their quantities, who
 * is coming, the cash, the issued tickets); `checkin` is the gate (G01 to
 * G08: one scan, one verdict, the lookup column, admitting by hand);
 * `lookup` finds a ticket without a QR (E09) and shows what can change on it
 * (E10, E13, E15); `receipts` lists the door's own paid sales through the
 * till and `issues` is the workspace's inbox over its one sentence.
 *
 * THE VERDICT COMES FROM THE ENGINE AND NOWHERE ELSE. A scan goes to
 * Sessions' `scanAdmission`, a tap to Events' `admitAtDoor`; the outcome is
 * mapped by `doorVerdict` (pure, tested) onto a sentence key and rendered
 * once, in the language of the request. Green is `tone === "in"`, which is
 * exactly `doorAdmits(outcome)`: no branch here decides admission.
 *
 * REFUSALS ARE SENTENCES. Money refusals go through `refusalFromResult` and
 * `PosRefusalBanner`, the counter's own path; door refusals through the
 * verdict hero. An engine word never reaches the screen.
 *
 * NO EFFECTS. Tonight's list is a prop the server resolved. Everything else
 * this screen shows is a value the operator asked for by tapping: choosing an
 * event loads its door, opening a sale creates it. Nothing synchronises after
 * mount, so there is no `useEffect` here, for the same reason the counter has
 * none.
 *
 * THE CLOCK IS THE VENUE'S. Every time printed goes through `venueClock`
 * with the workspace's zone, and the header says so.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import { POS_MESSAGES_DESTINATION, posMessagesHref } from "@/lib/pos/modes";

import {
  IssuesScreen,
  PosFrame,
  PosHeader,
  ReceiptsScreen,
  initialsOf,
  receiptsSubtitle,
  type PosCollectionMethodState,
  type PosReceiptRow,
} from "@/components/admin/pos";
import { POS_EYEBROW, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { interpolate } from "@/i18n/interpolate";
import { doorVerdict, splitTonight, venueClock, type DoorVerdict } from "@/lib/pos/door-model";
import { scanAdmission } from "@/lib/sessions/door-actions";
import type { DoorOutcome } from "@/lib/sessions/door";
import { admitAtDoor, loadDoor, loadDoorTiers, type DoorRow } from "@/app/(workspace)/[tenantSlug]/admin/_door-actions";

import { BoxOfficeScreen } from "./door-box-office";
import { GateScreen } from "./door-gate";
import { LookupScreen } from "./door-lookup";
import type { DoorTonightSession } from "./door-actions";
import { dateAt, timeAt, type DoorScreenCopy, type OpenDoor, type RecentScan } from "./door-shared";

export type DoorClientProps = {
  tenantId: string;
  /** The Messages inbox's unread count: the rail's `messages` badge (seam 10). */
  messagesUnread?: number;
  workspaceName: string;
  cashierName: string;
  drawerOpen: boolean;
  workspacePath: string;
  receiptOrigin: string;
  locale: string;
  zone: string;
  nowIso: string;
  sessions: DoorTonightSession[];
  /** The server could not read tonight's list: said in a sentence, never rendered as an empty door. */
  tonightFailed: boolean;
  /** The currency tier prices are shown in before a sale exists; the sale carries its own. */
  currency: string;
  /** The door's own paid sales through the till, for the Receipts rail. */
  receipts: PosReceiptRow[];
  /** Only cash is live at the door; the rest carry their sentence. */
  methods: PosCollectionMethodState[];
  copy: DoorScreenCopy;
};

const DESTINATIONS = ["tickets", "checkin", "lookup", "receipts", "issues"] as const;
export type DoorDestination = (typeof DESTINATIONS)[number];

function isDestination(id: string): id is DoorDestination {
  return DESTINATIONS.some((d) => d === id);
}

export function DoorClient(props: DoorClientProps) {
  const router = useRouter();
  const { copy, zone, locale } = props;
  const [destination, setDestination] = useState<DoorDestination>("checkin");
  const [busy, setBusy] = useState(false);
  const [door, setDoor] = useState<OpenDoor | null>(null);
  const [doorFailed, setDoorFailed] = useState(props.tonightFailed);
  const [verdict, setVerdict] = useState<DoorVerdict | null>(null);
  const [verdictWho, setVerdictWho] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentScan[]>([]);
  const [lookupQuery, setLookupQuery] = useState("");
  const [receiptsDay, setReceiptsDay] = useState<"today" | "yesterday" | "week">("today");
  const [receiptsQuery, setReceiptsQuery] = useState("");

  const dateFor = useCallback((iso: string) => venueClock(iso, zone, locale)?.date ?? null, [locale, zone]);

  /** (Re)read one session's door through the real reader, never from a success line. */
  const openDoor = useCallback(async (session: DoorTonightSession) => {
    setBusy(true);
    setDoorFailed(false);
    try {
      const [loaded, tiers] = await Promise.all([loadDoor(session.id), loadDoorTiers(session.id)]);
      if (!loaded.ok) {
        setDoorFailed(true);
        return;
      }
      setDoor({ session, rows: loaded.rows, counts: loaded.counts, tiers: tiers.ok ? tiers.tiers : [] });
    } finally {
      setBusy(false);
    }
  }, []);

  const showOutcome = useCallback(
    (outcome: DoorOutcome, who: string | null) => {
      const v = doorVerdict(outcome, dateFor);
      setVerdict(v);
      setVerdictWho(who);
      const headline = copy.door.gate.headline[v.key];
      setRecent((list) =>
        [{ tone: v.tone, text: who ? `${headline} · ${who}` : headline, time: timeAt(new Date().toISOString(), zone, locale) }, ...list].slice(0, 6),
      );
      return v;
    },
    [copy.door.gate.headline, dateFor, locale, zone],
  );

  const onScan = useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code || busy || !door) return;
      setBusy(true);
      try {
        const { outcome } = await scanAdmission(props.tenantId, door.session.id, code, 1);
        const v = showOutcome(outcome, null);
        if (v.tone === "in") await openDoor(door.session);
      } finally {
        setBusy(false);
      }
    },
    [busy, door, openDoor, props.tenantId, showOutcome],
  );

  const onAdmitRow = useCallback(
    async (row: DoorRow) => {
      if (busy || !door) return;
      setBusy(true);
      try {
        const { outcome } = await admitAtDoor(row.id, door.session.id);
        const v = showOutcome(outcome, row.holderName ?? row.tierLabel);
        if (v.tone === "in") await openDoor(door.session);
      } finally {
        setBusy(false);
      }
    },
    [busy, door, openDoor, showOutcome],
  );

  const { tonight, later } = splitTonight(props.sessions, props.nowIso, zone);

  const sessionPicker = (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-6 py-5" data-door-sessions>
      <div>
        <h2 className="m-0 text-[20px] font-semibold tracking-[-0.01em] text-admin-ink">{copy.door.pick.title}</h2>
        <p className="m-0 mt-0.5 text-[14px] text-admin-ink-muted">{copy.door.pick.intro}</p>
      </div>
      {props.sessions.length === 0 && !doorFailed && (
        <p className={`${POS_SURFACE} m-0 px-5 py-6 text-center text-[15px] text-admin-ink-muted`}>{copy.door.noSessions}</p>
      )}
      {[
        { label: copy.door.pick.tonight, list: tonight },
        { label: copy.door.pick.comingUp, list: later },
      ]
        .filter((g) => g.list.length > 0)
        .map((g) => (
          <section key={g.label} className="flex flex-col gap-2">
            <div className={POS_EYEBROW}>{g.label}</div>
            {g.list.map((s) => (
              <button
                key={s.id}
                type="button"
                disabled={busy}
                data-door-session={s.id}
                onClick={() => void openDoor(s)}
                className={`${POS_SURFACE} flex min-h-[64px] w-full items-center gap-4 px-4 py-3 text-left hover:bg-admin-surface-alt disabled:opacity-40`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-admin-ink">{s.title}</span>
                  <span className="block text-[13.5px] text-admin-ink-muted">
                    {dateAt(s.startsAt, zone, locale)} · {timeAt(s.startsAt, zone, locale)} ·{" "}
                    {interpolate(copy.door.pick.counts, {
                      admitted: s.admitted,
                      expected: s.expected,
                      capacity: s.capacity === null ? copy.door.pick.noPool : s.capacity,
                    })}
                  </span>
                </span>
                <span className="text-[14px] font-semibold text-admin-brand">{copy.door.pick.open}</span>
              </button>
            ))}
          </section>
        ))}
      {doorFailed && (
        <p role="alert" className="m-0 text-[14px] text-admin-red">
          {copy.door.loadFailed}
        </p>
      )}
    </div>
  );

  const eventTitle = door?.session.title ?? null;
  const sessionSubtitle = door
    ? interpolate(copy.door.header.subtitle, {
        date: dateAt(door.session.startsAt, zone, locale),
        time: timeAt(door.session.startsAt, zone, locale),
        zone: venueClock(door.session.startsAt, zone, locale)?.zoneName ?? zone,
      })
    : interpolate(copy.door.clock, { zone });

  const header = (() => {
    switch (destination) {
      case "tickets":
        return {
          title: eventTitle ? interpolate(copy.door.header.box, { event: eventTitle }) : copy.door.header.boxNoEvent,
          subtitle: door
            ? `${dateAt(door.session.startsAt, zone, locale)} · ${interpolate(copy.door.header.leftTonight, {
                count: door.tiers.reduce((sum, t) => sum + (t.remaining ?? 0), 0),
              })} · ${copy.door.header.sharedWithWebsite}`
            : sessionSubtitle,
        };
      case "lookup":
        return {
          title: copy.door.header.lookup,
          subtitle: interpolate(copy.door.header.lookupSubtitle, { date: door ? dateAt(door.session.startsAt, zone, locale) : dateAt(props.nowIso, zone, locale) }),
        };
      case "receipts":
        return { title: copy.receipts.title, subtitle: receiptsSubtitle(copy.receipts, props.receipts.filter((r) => receiptsDay === "week" || r.dayKey === receiptsDay), receiptsDay, props.currency) };
      case "issues":
        return { title: copy.issues.title, subtitle: copy.issues.subtitle };
      default:
        return {
          title: eventTitle ? interpolate(copy.door.header.gate, { event: eventTitle }) : copy.door.header.gateNoEvent,
          subtitle: sessionSubtitle,
        };
    }
  })();

  const goLookup = (query: string) => {
    setLookupQuery(query);
    setDestination("lookup");
  };

  const body =
    destination === "receipts" ? (
      <ReceiptsScreen rows={props.receipts} day={receiptsDay} onDayChange={setReceiptsDay} query={receiptsQuery} onQueryChange={setReceiptsQuery} copy={copy.receipts} />
    ) : destination === "issues" ? (
      <IssuesScreen copy={copy.issues} />
    ) : destination === "tickets" ? (
      <BoxOfficeScreen
        sessions={[...tonight, ...later]}
        tonightIds={new Set(tonight.map((s) => s.id))}
        door={door}
        doorFailed={doorFailed}
        busy={busy}
        setBusy={setBusy}
        openDoor={openDoor}
        recent={recent}
        drawerOpen={props.drawerOpen}
        methods={props.methods}
        currency={props.currency}
        receiptOrigin={props.receiptOrigin}
        zone={zone}
        locale={locale}
        copy={copy}
        onScan={() => setDestination("checkin")}
        onFindOrder={() => goLookup("")}
      />
    ) : !door ? (
      sessionPicker
    ) : destination === "lookup" ? (
      <LookupScreen
        door={door}
        busy={busy}
        setBusy={setBusy}
        query={lookupQuery}
        onQueryChange={setLookupQuery}
        onAdmitRow={onAdmitRow}
        onChanged={() => void openDoor(door.session)}
        zone={zone}
        locale={locale}
        copy={copy}
      />
    ) : (
      <GateScreen
        door={door}
        busy={busy}
        verdict={verdict}
        verdictWho={verdictWho}
        onScan={onScan}
        onAdmitRow={onAdmitRow}
        onNext={() => setVerdict(null)}
        onLookUpOrder={() => goLookup("")}
        onSwitchToBox={() => setDestination("tickets")}
        cashierName={props.cashierName}
        zone={zone}
        locale={locale}
        copy={copy.door}
      />
    );

  return (
    <div className="relative flex h-[calc(100vh-var(--proto-cbar,50px))] min-h-[560px] w-full flex-col overflow-hidden" data-door-zone={zone}>
      <PosFrame
        mode="door"
        navLabel={copy.frameNavLabel}
        activeDestination={destination}
        onSelectDestination={(id) => {
          if (id === POS_MESSAGES_DESTINATION) {
            router.push(posMessagesHref("door"));
            return;
          }
          if (isDestination(id)) setDestination(id);
        }}
        destinationLabels={copy.door.rail}
        counts={{ messages: props.messagesUnread ?? 0 }}
        modeLabel={copy.modeLabel}
        modeEyebrow={copy.chrome.modeEyebrow}
        lock={{ label: copy.chrome.lock, disabledReason: copy.chrome.lockUnavailable }}
        workspace={{ label: copy.chrome.workspace, href: props.workspacePath }}
        className="flex-1"
      >
        <PosHeader
          title={header.title}
          subtitle={header.subtitle}
          location={props.workspaceName}
          cashier={{
            initials: initialsOf(props.cashierName || props.workspaceName),
            label: `${props.cashierName || props.workspaceName} · ${props.drawerOpen ? copy.chrome.drawerOpen : copy.chrome.drawerNone}`,
          }}
          cashierMenuLabel={copy.chrome.cashierMenu}
          cashierMenu={
            door
              ? [
                  {
                    id: "change-event",
                    label: copy.door.pick.title,
                    onSelect: () => {
                      setDoor(null);
                      setVerdict(null);
                      router.refresh();
                    },
                  },
                ]
              : undefined
          }
          portraitMenu={{
            label: copy.modeLabel,
            menuLabel: copy.frameNavLabel,
            items: [
              ...DESTINATIONS.map((id) => ({ id, label: copy.door.rail[id] ?? id, onSelect: () => setDestination(id) })),
              { id: "workspace", label: copy.chrome.workspace, onSelect: () => router.push(props.workspacePath) },
            ],
          }}
          meta={
            door && destination === "checkin" ? (
              <span data-door-counts className="flex items-center gap-1.5 text-[14px] font-semibold text-admin-ink-muted" aria-live="polite">
                {interpolate(copy.door.header.inChip, { admitted: door.counts.arrived, expected: door.counts.expected })}
              </span>
            ) : null
          }
        />
        <div className="relative flex min-h-0 flex-1 flex-col">{body}</div>
      </PosFrame>
    </div>
  );
}
