"use client";

/**
 * TimesSheet (L5, board D09): "Send times". Pick a person (the roster's
 * bookable people, from the same catalog read as the items picker), read the
 * person's live free starts (`messagingLoadPersonSlots`, the public slots
 * projection), choose 3 to 6, send one `professional_times` card through
 * `messagingSendOptions`. The client's pick and the hold happen on the
 * client link (L9); here only the send. A thread with no identity cannot
 * receive a card whose pick would hold (D21, `identity_unconfirmed`).
 *
 * `TimesSheetView` is pure; `TimesSheet` is the stateful wrapper the
 * registry mounts for `send_times`.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { holdRefusal, timesPayload, timesSelectionState, TIMES_MAX, TIMES_MIN, type CatalogRow } from "@/lib/messages-v5/items-picker";
import type { ItemsCatalog } from "@/lib/messages-v5/items-catalog";
import type { MessagingRefusal } from "@/lib/messaging/types";
import type { NoSlotsReason } from "@/lib/scheduling/public-slots";

import { fill, type KitCopy } from "../../kit/copy";
import { OptionRow } from "../../kit/OptionRow";
import { Avatar, Btn, Chip } from "../../kit/primitives";
import { OkLine, RefusalLine } from "../../kit/RefusalLine";
import { Sheet } from "../../kit/Sheet";
import { EmptyState, Skeleton } from "../../kit/Skeleton";
import type { ScreenVariant } from "../contracts";
import type { ActionSheetProps } from "../sheet-registry";
import { engineItemsActions, type ItemsActions } from "./items-actions";

export type TimesPhase = "loading" | "ready" | "slots" | "busy" | "refused" | "done" | "failed";

export type TimesSlotsState = { readonly starts: readonly string[]; readonly timezone: string; readonly reason: NoSlotsReason | "hours_unreadable" | null } | null;

function dayOf(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en", { weekday: "short", month: "short", day: "numeric", timeZone: timezone }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function timeOf(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit", timeZone: timezone }).format(new Date(iso));
  } catch {
    return iso.slice(11, 16);
  }
}

export type TimesSheetViewProps = {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly copy: KitCopy;
  readonly variant: ScreenVariant;
  readonly clientName: string | null;
  readonly phase: TimesPhase;
  readonly people: readonly CatalogRow[];
  readonly services: readonly CatalogRow[];
  readonly personId: string | null;
  readonly offeringId: string | null;
  readonly slots: TimesSlotsState;
  /** True while the slots for the chosen person are being read. */
  readonly slotsLoading: boolean;
  readonly picked: readonly string[];
  readonly refusal: MessagingRefusal | null;
  readonly onPerson: (talentProfileId: string) => void;
  readonly onService: (offeringId: string | null) => void;
  readonly onPick: (startsAt: string) => void;
  readonly onSend: () => void;
};

export function TimesSheetView(p: TimesSheetViewProps) {
  const { copy, variant } = p;
  const c = copy.items;
  const mobile = variant === "mobile";
  const busy = p.phase === "busy";
  const state = timesSelectionState(p.picked.length, p.slots?.starts.length ?? 0);
  const canSend = p.phase === "slots" && state === "ok";
  const pickedSet = useMemo(() => new Set(p.picked), [p.picked]);

  const byDay = useMemo(() => {
    const tz = p.slots?.timezone ?? "UTC";
    const map = new Map<string, string[]>();
    for (const s of p.slots?.starts ?? []) {
      const key = dayOf(s, tz);
      map.set(key, [...(map.get(key) ?? []), s]);
    }
    return [...map.entries()];
  }, [p.slots]);

  const hint =
    state === "few" ? fill(c.timesFew, { min: Math.min(TIMES_MIN, p.slots?.starts.length ?? TIMES_MIN) }) : state === "many" ? fill(c.timesMany, { max: TIMES_MAX }) : c.timesPick;

  const body =
    p.phase === "loading" ? (
      <Skeleton rows={4} variant={variant} copy={copy} />
    ) : p.phase === "failed" ? (
      <EmptyState icon="alert" title={c.failedTitle} body={copy.inbox.empty.failedBody} variant={variant} />
    ) : p.people.length === 0 ? (
      <EmptyState icon="user" title={c.timesNoPeople} body={c.emptyBody} variant={variant} />
    ) : (
      <>
        <div className={mobile ? "mx-gh" : "lbl"}>{c.timesPerson}</div>
        <div className={mobile ? "mx-items-list" : "items-list"} data-times-people>
          {p.people.map((row) => (
            <OptionRow key={row.id} variant={variant} selected={p.personId === row.talentProfileId} title={row.title} sub={row.availability.kind === "busy" ? c.busy : null} disabled={busy} leading={<Avatar name={row.title} size={mobile ? "lg" : "sm"} />} onSelect={() => row.talentProfileId && p.onPerson(row.talentProfileId)} />
          ))}
        </div>
        {p.services.length > 0 ? (
          <div className={mobile ? "mx-chips" : "chips"} data-times-services>
            <Chip on={p.offeringId === null} onClick={() => p.onService(null)}>
              {c.timesAnyService}
            </Chip>
            {p.services.map((s) => (
              <Chip key={s.id} on={p.offeringId === s.offeringId} onClick={() => p.onService(s.offeringId ?? null)}>
                {s.title}
              </Chip>
            ))}
          </div>
        ) : null}
        {p.personId ? (
          <div className={mobile ? "mx-times" : undefined} data-times-slots>
            <div className={mobile ? "mx-gh" : "lbl"}>{hint}</div>
            {p.slotsLoading ? (
              <Skeleton rows={2} variant={variant} copy={copy} />
            ) : p.slots && p.slots.starts.length > 0 ? (
              <div className="times-grid">
                {byDay.map(([day, starts]) => (
                  <div key={day} className="times-grid" data-times-day={day}>
                    <div className="times-day">{day}</div>
                    {starts.map((s) => (
                      <Chip key={s} on={pickedSet.has(s)} onClick={() => p.onPick(s)} ariaLabel={`${day} ${timeOf(s, p.slots?.timezone ?? "UTC")}`}>
                        {timeOf(s, p.slots?.timezone ?? "UTC")}
                      </Chip>
                    ))}
                  </div>
                ))}
              </div>
            ) : p.slots ? (
              <EmptyState icon="clock" small title={c.timesNone} body={p.slots.reason ? c.timesReason[p.slots.reason] : copy.times.noSlots} variant={variant} />
            ) : null}
          </div>
        ) : null}
      </>
    );

  const status = p.phase === "refused" && p.refusal ? <RefusalLine code={p.refusal} copy={copy} variant={variant} /> : p.phase === "done" ? <OkLine text={c.timesDone} variant={variant} /> : null;

  const footer = mobile ? (
    <Btn variant="primary" size="xl" fill busy={busy} disabled={!canSend} onClick={p.onSend} data-times-send>
      {busy ? c.sending : `${c.timesSend} · ${p.picked.length}`}
    </Btn>
  ) : (
    <>
      <span className="hint" data-times-count>
        {p.picked.length} / {TIMES_MAX}
      </span>
      <Btn onClick={p.onClose} disabled={busy}>
        {copy.sheet.cancel}
      </Btn>
      <Btn variant="primary" busy={busy} disabled={!canSend} onClick={p.onSend} data-times-send>
        {busy ? c.sending : c.timesSend}
      </Btn>
    </>
  );

  return (
    <Sheet open={p.open} title={c.timesTitle} copy={copy} onClose={p.onClose} variant={mobile ? "mobile-h92" : "desktop"} width={520} avatarName={mobile ? undefined : p.clientName} tight={mobile} footer={footer}>
      <div className="msgv5" data-times-sheet data-phase={p.phase}>
        {body}
        {status}
      </div>
    </Sheet>
  );
}

/* ------------------------------------------------------------ stateful sheet ------------------------------------------------------------ */

export type TimesSheetProps = ActionSheetProps & { readonly actions?: ItemsActions };

export function TimesSheet({ open, onClose, ctx, copy, variant, actions: injected }: TimesSheetProps) {
  const actions = injected ?? engineItemsActions;
  const inquiryId = ctx.row?.id ?? null;
  const [phase, setPhase] = useState<TimesPhase>("loading");
  const [catalog, setCatalog] = useState<ItemsCatalog | null>(null);
  const [personId, setPersonId] = useState<string | null>(null);
  const [offeringId, setOfferingId] = useState<string | null>(null);
  const [slots, setSlots] = useState<TimesSlotsState>(null);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [refusal, setRefusal] = useState<MessagingRefusal | null>(null);

  useEffect(() => {
    if (!open || !inquiryId) return;
    let alive = true;
    setPhase("loading");
    void actions.loadCatalog({ inquiryId }).then((r) => {
      if (!alive) return;
      if (!r.ok) {
        setPhase("failed");
        return;
      }
      setCatalog(r.catalog);
      setPhase("ready");
    });
    return () => {
      alive = false;
    };
  }, [actions, inquiryId, open]);

  const people = useMemo(() => (catalog?.rows ?? []).filter((r) => r.category === "talent"), [catalog]);
  const services = useMemo(() => (catalog?.rows ?? []).filter((r) => r.category === "service" && (r.durationMinutes ?? 0) > 0), [catalog]);

  useEffect(() => {
    if (!personId) return;
    let alive = true;
    setSlotsLoading(true);
    setPicked([]);
    void actions.loadPersonSlots({ talentProfileId: personId, offeringId, from: catalog?.date ?? null, days: 7 }).then((r) => {
      if (!alive) return;
      setSlotsLoading(false);
      if (!r.ok) {
        setRefusal(r.reason);
        setPhase("refused");
        return;
      }
      setSlots({ starts: r.starts, timezone: r.timezone, reason: r.reason });
      setPhase("slots");
    });
    return () => {
      alive = false;
    };
  }, [actions, catalog?.date, offeringId, personId]);

  const onSend = useCallback(async () => {
    if (!inquiryId || !personId || phase !== "slots" || !slots) return;
    const hold = holdRefusal(ctx.essentials?.customer.identityLevel ?? null, ["professional_times"]);
    if (hold) {
      setRefusal(hold);
      setPhase("refused");
      return;
    }
    setPhase("busy");
    const person = people.find((r) => r.talentProfileId === personId) ?? null;
    const r = await actions.sendOptions({
      inquiryId,
      kind: "professional_times",
      payload: timesPayload({ starts: [...picked].sort(), professionalName: person?.title ?? null, talentProfileId: personId, offeringId, timezone: slots.timezone }),
    });
    if (!r.ok) {
      setRefusal(r.reason);
      setPhase("refused");
      return;
    }
    setPhase("done");
    ctx.notify({ kind: "ok", text: copy.kit.items.timesDone });
    await ctx.reloadThread();
    onClose();
  }, [actions, copy.kit.items.timesDone, ctx, inquiryId, offeringId, onClose, people, personId, phase, picked, slots]);

  return (
    <TimesSheetView
      open={open}
      onClose={onClose}
      copy={copy.kit}
      variant={variant}
      clientName={ctx.essentials?.customer.name || ctx.row?.contactName || null}
      phase={phase}
      people={people}
      services={services}
      personId={personId}
      offeringId={offeringId}
      slots={slots}
      slotsLoading={slotsLoading}
      picked={picked}
      refusal={refusal}
      onPerson={setPersonId}
      onService={setOfferingId}
      onPick={(s) => setPicked((list) => (list.includes(s) ? list.filter((x) => x !== s) : [...list, s]))}
      onSend={() => void onSend()}
    />
  );
}
