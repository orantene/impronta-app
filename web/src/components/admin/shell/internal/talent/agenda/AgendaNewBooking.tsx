"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { resolveTradeProfile } from "@/lib/talent-agenda/trades";
import { createOwnSlotBooking } from "@/lib/talent-agenda/create-slot";
import { blocksTime } from "@/lib/talent-agenda/derive";
import type { TalentAgendaItem } from "@/lib/talent-agenda/types";
import type { BookingHours } from "@/lib/scheduling/hours-types";
import { loadTalentOfferingsForEditor } from "@/lib/talent/offerings-actions";
import { formatOfferingPrice, type TalentOffering } from "@/lib/talent/offerings-types";
import { loadTalentClients } from "@/lib/talent/clients-actions";
import { clientPickerHint, dedupeClientsByPerson, type TalentClientRow } from "@/lib/talent/clients-merge";
import { TaskShell } from "./primitives/TaskShell";
import { AgendaEventQuote, AgendaProjectQuote } from "./AgendaQuotes";
import { dayWindows } from "./AgendaCalendarViews";
import { useAgendaCopy } from "./use-agenda-copy";

type PayChoice = "received" | "due_later" | "request_link" | null;

type PickedClient = { name: string; phone: string | null; email: string | null; existing: boolean };

const OTHER = "__other__";

const FIELD =
  "mt-1 w-full min-h-[44px] rounded-xl border border-black/15 bg-white px-3 text-[14px] text-[var(--tc-primary)] disabled:bg-black/[0.04] disabled:text-black/45";
const LABEL = "block text-[13px] font-semibold text-[var(--tc-primary)]";
const MUTED = "text-black/55";

/**
 * T7.1–T7.3 New booking / quote. Kind comes from TRADE_PROFILES.
 */
export function AgendaNewBooking({
  talentTypeSlug,
  talentProfileId,
  agendaItems,
  hours,
  onCancel,
  onSaved,
  embedded = false,
}: {
  /** Inside the shared New booking panel: single column, no page header. */
  embedded?: boolean;
  talentTypeSlug?: string | null;
  talentProfileId?: string;
  newLabel?: string;
  /** The loaded agenda: drives the conflict explanation before save. */
  agendaItems?: readonly TalentAgendaItem[];
  hours?: BookingHours | null;
  onCancel: () => void;
  onSaved?: (bookingId?: string) => void;
}) {
  const profile = resolveTradeProfile(talentTypeSlug);
  const newLabel = profile.words.newLabel[0];

  if (profile.kind === "event") {
    return (
      <AgendaEventQuote
        title={newLabel}
        talentProfileId={talentProfileId}
        onCancel={onCancel}
        onSent={onSaved}
      />
    );
  }
  if (profile.kind === "project") {
    return <AgendaProjectQuote onCancel={onCancel} onSent={onSaved} />;
  }

  return (
    <SlotComposer
      talentProfileId={talentProfileId}
      agendaItems={agendaItems ?? []}
      hours={hours ?? null}
      onCancel={onCancel}
      onSaved={onSaved}
      embedded={embedded}
    />
  );
}

function ymdOf(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addMinutes(hhmm: string, minutes: number): string {
  const [h, m] = hhmm.split(":").map(Number);
  const total = Math.min(24 * 60 - 1, (h ?? 0) * 60 + (m ?? 0) + minutes);
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function toMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function Card({ children }: { children: ReactNode }) {
  return <section className="space-y-3 border-b border-black/10 px-5 py-5 last:border-b-0">{children}</section>;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string | null; strong?: boolean }) {
  return (
    <div className={`flex items-baseline justify-between gap-3 ${strong ? "text-[15px] font-semibold" : "text-[13.5px]"}`}>
      <span className={strong ? "text-[var(--tc-primary)]" : MUTED}>{label}</span>
      <span className="text-right text-[var(--tc-primary)]">{value ?? "·"}</span>
    </div>
  );
}

function SlotComposer({
  talentProfileId,
  agendaItems,
  hours,
  onCancel,
  onSaved,
  embedded = false,
}: {
  embedded?: boolean;
  talentProfileId?: string;
  agendaItems: readonly TalentAgendaItem[];
  hours: BookingHours | null;
  onCancel: () => void;
  onSaved?: (bookingId?: string) => void;
}) {
  const copy = useAgendaCopy();
  const locale = copy.locale === "es" ? "es" : "en";
  const dateLocale = copy.locale === "es" ? "es-MX" : "en-GB";
  const [client, setClient] = useState<PickedClient | null>(null);
  const [query, setQuery] = useState("");
  const [clients, setClients] = useState<TalentClientRow[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ name: "", phone: "", email: "" });
  const [service, setService] = useState("");
  const [offeringId, setOfferingId] = useState<string>("");
  const [offerings, setOfferings] = useState<TalentOffering[]>([]);
  const [addonIds, setAddonIds] = useState<string[]>([]);
  const [showExtras, setShowExtras] = useState(false);
  const [date, setDate] = useState(() => ymdOf(new Date()));
  const [starts, setStarts] = useState("");
  const [ends, setEnds] = useState("");
  const [pay, setPay] = useState<PayChoice>(null);
  const [saving, setSaving] = useState(false);
  const [conflict, setConflict] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<string[]>([]);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  useEffect(() => {
    if (!talentProfileId) return;
    let cancelled = false;
    void loadTalentOfferingsForEditor(talentProfileId).then((res) => {
      if (cancelled || !res.ok) return;
      setOfferings(res.items.filter((item) => item.status === "published"));
    });
    void loadTalentClients(talentProfileId).then((res) => {
      if (cancelled || !res.ok) return;
      setClients(res.items);
    });
    return () => {
      cancelled = true;
    };
  }, [talentProfileId]);

  const selected = offeringId && offeringId !== OTHER ? offerings.find((o) => o.id === offeringId) : undefined;
  const addons = selected?.addOns ?? [];
  const pickedAddons = addons.filter((a) => addonIds.includes(a.id));
  const duration =
    selected?.durationMinutes != null
      ? selected.durationMinutes + pickedAddons.reduce((sum, a) => sum + (a.durationMinutes ?? 0), 0)
      : null;
  const currency = selected?.currency ?? "MXN";
  const totalCents =
    selected?.amountCents != null
      ? selected.amountCents + pickedAddons.reduce((sum, a) => sum + a.amountCents, 0)
      : null;

  // Ends follows the service length when the catalog knows it.
  useEffect(() => {
    if (starts && duration) setEnds(addMinutes(starts, duration));
  }, [starts, duration]);

  const people = useMemo(() => dedupeClientsByPerson(clients), [clients]);
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people.slice(0, 6);
    return people
      .filter((c) => [c.name, c.phone ?? "", c.email ?? ""].some((v) => v.toLowerCase().includes(q)))
      .slice(0, 6);
  }, [people, query]);

  const serviceName = selected?.title ?? (offeringId === OTHER ? service.trim() : "");
  const serviceReady = Boolean(serviceName);

  // Conflict explanation, before the server re-checks on save.
  const clash = useMemo(() => {
    if (!date || !starts || !ends || toMin(ends) <= toMin(starts)) return null;
    const start = new Date(`${date}T${starts}:00`);
    const end = new Date(`${date}T${ends}:00`);
    for (const item of agendaItems) {
      if (!blocksTime(item)) continue;
      if (item.booking !== "confirmed" && item.booking !== "hold") continue;
      if (start.getTime() < Date.parse(item.endsAt) && end.getTime() > Date.parse(item.startsAt)) return item;
    }
    return null;
  }, [agendaItems, date, starts, ends]);
  const outsideHours = useMemo(() => {
    if (!date || !starts || !ends) return false;
    const day = new Date(`${date}T00:00:00`);
    const wins = dayWindows(hours, day);
    return !wins.some((w) => toMin(starts) >= w.startMin && toMin(ends) <= w.endMin);
  }, [hours, date, starts, ends]);

  const timeInvalid = Boolean(starts && ends && toMin(ends) <= toMin(starts));
  const missing = !client
    ? "Add a client to continue"
    : !serviceReady
      ? "Choose a service to continue"
      : !starts || !ends
        ? "Pick a start time to continue"
        : timeInvalid
          ? "The end must be after the start"
          : !pay
            ? "Choose how the client pays"
            : null;
  const canSave = !missing && !saving;

  async function save() {
    if (!canSave || !pay || !client) return;
    setSaving(true);
    setConflict(null);
    setAlternatives([]);
    try {
      const result = await createOwnSlotBooking({
        clientName: client.name,
        contactEmail: client.email,
        contactPhone: client.phone,
        title: serviceName,
        startsAt: new Date(`${date}T${starts}:00`).toISOString(),
        endsAt: new Date(`${date}T${ends}:00`).toISOString(),
        paymentChoice: pay,
        offeringId: selected?.id ?? null,
        addonIds: pickedAddons.length > 0 ? pickedAddons.map((a) => a.id) : null,
      });
      if (!result.ok) {
        setConflict(result.message ?? copy.t("Could not save. Try another time."));
        setAlternatives(result.alternatives ?? []);
        return;
      }
      setSavedNote(
        pay === "received"
          ? copy.t("Payment recorded as received. The client has not been told.")
          : pay === "request_link"
            ? copy.t("Saved as unpaid. Request a payment link from the booking when you are ready. The client has not been told.")
            : copy.t("Due later. The client has not been told."),
      );
      // F63: one outcome for every payment choice; the caller toasts with a View booking link.
      onSaved?.(result.id);
    } finally {
      setSaving(false);
    }
  }

  const whenLabel =
    date && starts
      ? `${new Date(`${date}T${starts}:00`).toLocaleDateString(dateLocale, { weekday: "short", day: "numeric", month: "short" })} · ${starts}${ends ? `–${ends}` : ""}`
      : null;
  const payLabel =
    pay === "received"
      ? copy.t("Record payment received")
      : pay === "due_later"
        ? copy.t("Payment due later")
        : pay === "request_link"
          ? copy.t("Request payment")
          : null;

  const payOptions: [Exclude<PayChoice, null>, string, string][] = [
    ["received", "Record payment received", "The client already paid you: cash, transfer or card."],
    ["due_later", "Payment due later", "The client pays at the appointment. Shows as Due."],
    [
      "request_link",
      "Request payment",
      "Collect later (no link yet). Does not create a pay link. The booking opens so you can send one.",
    ],
  ];

  return (
    <div className={embedded ? "space-y-3" : "mx-auto max-w-[1100px] space-y-3"}>
      {embedded ? null : <header>
        <h1 className="text-[20px] font-semibold text-[var(--tc-primary)]">{copy.t("New booking")}</h1>
        <p className={`text-[12.5px] ${MUTED}`}>{copy.t("Add a booking you arranged yourself")}</p>
        <button
          type="button"
          onClick={onCancel}
          className="mt-1 min-h-[32px] text-[13px] font-medium text-[var(--tc-accent)]"
        >
          ‹ {copy.t("Calendar")}
        </button>
      </header>}

      <div className={embedded ? "grid gap-4" : "grid gap-4 lg:grid-cols-[minmax(0,1fr)_340px]"}>
        <div className="overflow-hidden rounded-2xl border border-black/10 bg-white">
          {savedNote ? (
            <p className="m-5 mb-0 rounded-xl border border-[rgba(31,92,66,0.25)] bg-[rgba(31,92,66,0.08)] px-3 py-2 text-[13px] text-[var(--tc-ok)]">
              {savedNote}
            </p>
          ) : null}

          <Card>
            <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">{copy.t("Client")}</h2>
            {client ? (
              <div className="flex min-h-[48px] items-center justify-between gap-3 rounded-xl border border-black/15 px-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-[var(--tc-primary)]">{client.name}</div>
                  <div className={`truncate text-[12px] ${MUTED}`}>
                    {[client.phone, client.email].filter(Boolean).join(" · ") ||
                      copy.t(client.existing ? "Existing client" : "New client")}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setClient(null)}
                  className="min-h-[40px] px-2 text-[13px] font-medium text-[var(--tc-accent)]"
                >
                  {copy.t("Change")}
                </button>
              </div>
            ) : (
              <div className="space-y-1.5">
                <input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={copy.t("Search clients or add a new one")}
                  aria-label={copy.t("Search clients or add a new one")}
                  className={FIELD}
                />
                {query.trim() || clients.length > 0 ? (
                  <ul className="overflow-hidden rounded-xl border border-black/10">
                    {matches.map((c) => (
                      <li key={c.id} className="border-b border-black/5 last:border-b-0">
                        <button
                          type="button"
                          onClick={() => {
                            setClient({ name: c.name, phone: c.phone, email: c.email, existing: true });
                            setQuery("");
                          }}
                          className="flex min-h-[44px] w-full items-center justify-between gap-3 px-3 text-left text-[13.5px] hover:bg-black/[0.03]"
                        >
                          <span className="min-w-0 truncate font-medium text-[var(--tc-primary)]">
                            {c.name}
                            {clientPickerHint(c, people) ? <span className={`ml-2 font-normal ${MUTED}`}>{clientPickerHint(c, people)}</span> : null}
                          </span>
                          <span className={`shrink-0 text-[12px] ${MUTED}`}>
                            {c.completedCount > 0
                              ? `${c.completedCount} ${copy.t(c.completedCount === 1 ? "visit" : "visits")}`
                              : copy.t("New")}
                          </span>
                        </button>
                      </li>
                    ))}
                    <li>
                      <button
                        type="button"
                        onClick={() => {
                          setDraft({ name: query.trim(), phone: "", email: "" });
                          setAdding(true);
                        }}
                        className="flex min-h-[44px] w-full items-center px-3 text-left text-[13.5px] font-medium text-[var(--tc-accent)] hover:bg-black/[0.03]"
                      >
                        {query.trim() ? `+ ${copy.t("Add")} "${query.trim()}" ${copy.t("as a new client")}` : `+ ${copy.t("Add a new client")}`}
                      </button>
                    </li>
                  </ul>
                ) : null}
              </div>
            )}
          </Card>

          <Card>
            <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">{copy.t("Work and time")}</h2>
            <label className={LABEL}>
              {copy.t("Service")}
              <select
                className={FIELD}
                value={offeringId}
                onChange={(e) => {
                  setOfferingId(e.target.value);
                  setAddonIds([]);
                  if (e.target.value !== OTHER) setService("");
                }}
              >
                <option value="">{copy.t("Choose a service")}</option>
                {offerings.map((o) => {
                  const price = o.amountCents != null ? formatOfferingPrice(o.amountCents, o.currency, locale) : "";
                  const mins = o.durationMinutes ? `${o.durationMinutes} ${copy.t("min")}` : "";
                  return (
                    <option key={o.id} value={o.id}>
                      {[o.title, mins, price].filter(Boolean).join(" · ")}
                    </option>
                  );
                })}
                <option value={OTHER}>{copy.t("Custom item")}</option>
              </select>
            </label>
            {offeringId === OTHER ? (
              <label className={LABEL}>
                {copy.t("Describe the work")}
                <input className={FIELD} value={service} onChange={(e) => setService(e.target.value)} />
                <span className={`mt-1 block text-[12px] font-normal ${MUTED}`}>
                  {copy.t("A custom item has no catalog price. Agree the amount with the client.")}
                </span>
              </label>
            ) : null}
            <div className="flex flex-wrap items-center gap-4 text-[13px] font-medium">
              <button
                type="button"
                disabled={addons.length === 0}
                onClick={() => setShowExtras((v) => !v)}
                className="min-h-[36px] text-[var(--tc-accent)] disabled:text-black/35"
                title={addons.length === 0 ? copy.t("This service has no extras") : undefined}
              >
                + {copy.t("Add extra")}
              </button>
              <button
                type="button"
                onClick={() => {
                  setOfferingId(OTHER);
                  setAddonIds([]);
                }}
                className="min-h-[36px] text-[var(--tc-accent)]"
              >
                + {copy.t("Custom item")}
              </button>
              {selected && addons.length === 0 ? (
                <span className={`text-[12px] font-normal ${MUTED}`}>{copy.t("This service has no extras")}</span>
              ) : null}
            </div>
            {showExtras && addons.length > 0 ? (
              <ul className="space-y-1">
                {addons.map((a) => (
                  <li key={a.id}>
                    <label className="flex min-h-[40px] items-center gap-2 text-[13.5px]">
                      <input
                        type="checkbox"
                        checked={addonIds.includes(a.id)}
                        onChange={(e) =>
                          setAddonIds((ids) => (e.target.checked ? [...ids, a.id] : ids.filter((id) => id !== a.id)))
                        }
                      />
                      <span className="flex-1">{a.label}</span>
                      <span className={MUTED}>
                        {a.amountCents > 0 ? `+ ${formatOfferingPrice(a.amountCents, currency, locale)}` : ""}
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-2">
              <label className={LABEL}>
                {copy.t("Date")}
                <input type="date" className={FIELD} value={date} onChange={(e) => setDate(e.target.value)} />
              </label>
              <label className={LABEL}>
                {copy.t("Starts")}
                <input
                  type="time"
                  className={FIELD}
                  value={starts}
                  onChange={(e) => {
                    setStarts(e.target.value);
                    setConflict(null);
                  }}
                />
              </label>
              <label className={LABEL}>
                {copy.t("Ends")}
                <input
                  type="time"
                  className={FIELD}
                  value={ends}
                  disabled={Boolean(duration)}
                  onChange={(e) => {
                    setEnds(e.target.value);
                    setConflict(null);
                  }}
                />
              </label>
            </div>
            {duration ? (
              <p className={`text-[12px] ${MUTED}`}>
                {`${copy.t("Ends is set from the service length")}: ${duration} ${copy.t("min")}.`}
              </p>
            ) : null}
            {clash ? (
              <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
                {`${copy.t("This time overlaps")} ${clash.client?.name ?? clash.title} (${new Date(clash.startsAt).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false })}–${new Date(clash.endsAt).toLocaleTimeString(dateLocale, { hour: "2-digit", minute: "2-digit", hour12: false })}). ${copy.t("Saving will be refused unless you pick another time.")}`}
              </p>
            ) : outsideHours && starts && ends && !timeInvalid ? (
              <p className="rounded-xl bg-black/[0.04] px-3 py-2 text-[13px] text-[var(--tc-primary)]">
                {copy.t("This is outside your working hours. You can still save it.")}
              </p>
            ) : null}
            {conflict ? <p className="text-[13px] text-[var(--tc-risk)]">{conflict}</p> : null}
            {alternatives.length > 0 ? (
              <div className="space-y-1">
                <p className="text-[12px] font-medium text-[var(--tc-primary)]">{copy.t("Try one of these:")}</p>
                {alternatives.map((iso) => {
                  const d = new Date(iso);
                  return (
                    <button
                      key={iso}
                      type="button"
                      className="mr-2 min-h-[44px] rounded-full border border-black/10 px-3 text-[12px]"
                      onClick={() => {
                        const lengthMin = Math.max(15, toMin(ends) - toMin(starts));
                        setDate(ymdOf(d));
                        const hhmm = d.toTimeString().slice(0, 5);
                        setStarts(hhmm);
                        setEnds(addMinutes(hhmm, lengthMin));
                        setConflict(null);
                        setAlternatives([]);
                      }}
                    >
                      {d.toLocaleString(dateLocale, { weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false })}
                    </button>
                  );
                })}
              </div>
            ) : null}
            <label className={LABEL}>
              {copy.t("Where")}
              <select className={FIELD} disabled value="studio" aria-describedby="nb-where-note">
                <option value="studio">{copy.t("At your studio")}</option>
              </select>
              <span id="nb-where-note" className={`mt-1 block text-[12px] font-normal ${MUTED}`}>
                {copy.t("Choosing another place is not available yet. Add the address in a message to the client.")}
              </span>
            </label>
          </Card>

          <Card>
            <h2 className="text-[16px] font-semibold text-[var(--tc-primary)]">{copy.t("Payment")}</h2>
            {payOptions.map(([id, label, sub]) => (
              <label
                key={id}
                className={`flex min-h-[64px] cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 ${
                  pay === id ? "border-[var(--tc-primary)]" : "border-black/15"
                }`}
              >
                <input type="radio" name="pay" className="mt-1" checked={pay === id} onChange={() => setPay(id)} />
                <span>
                  <span className="block text-[14px] font-semibold text-[var(--tc-primary)]">{copy.t(label)}</span>
                  <span className={`block text-[13px] ${MUTED}`}>{copy.t(sub)}</span>
                </span>
              </label>
            ))}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/10 bg-black/[0.02] px-5 py-3">
            <span className={`text-[13px] ${MUTED}`}>{missing ? copy.t(missing) : ""}</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onCancel}
                className="min-h-[44px] px-3 text-[13.5px] font-medium text-[var(--tc-primary)]"
              >
                {copy.t("Cancel")}
              </button>
              <button
                type="button"
                disabled={!canSave}
                onClick={() => void save()}
                className="min-h-[44px] rounded-xl bg-[var(--tc-action)] hover:bg-[var(--tc-action-hover)] px-4 text-[13.5px] font-semibold text-white disabled:bg-black/[0.08] disabled:text-black/40"
              >
                {saving ? copy.t("Saving…") : copy.t("Save booking")}
              </button>
            </div>
          </div>
        </div>

        <aside className="space-y-3">
          <section className="space-y-2 rounded-2xl border border-black/10 bg-white p-5">
            <h2 className="text-[15px] font-semibold text-[var(--tc-primary)]">{copy.t("Summary")}</h2>
            <SummaryRow label={copy.t("Client")} value={client?.name ?? null} />
            <SummaryRow label={copy.t("Service")} value={serviceName || null} />
            {pickedAddons.map((a) => (
              <SummaryRow key={a.id} label={`+ ${a.label}`} value={formatOfferingPrice(a.amountCents, currency, locale)} />
            ))}
            <SummaryRow label={copy.t("When")} value={whenLabel} />
            <div className="border-t border-black/10 pt-2">
              <SummaryRow
                strong
                label={copy.t("Total")}
                value={
                  totalCents != null
                    ? formatOfferingPrice(totalCents, currency, locale)
                    : serviceName
                      ? copy.t("Price not set")
                      : null
                }
              />
            </div>
            <SummaryRow label={copy.t("Payment")} value={payLabel} />
          </section>
          <p className={`px-1 text-[12.5px] ${MUTED}`}>
            {copy.t("Nothing is sent to the client when you save.")}
          </p>
        </aside>
      </div>

      {adding ? (
        <TaskShell
          open
          onClose={() => setAdding(false)}
          title={copy.t("Add a new client")}
          primaryActionLabel={copy.t("Use this client")}
          onPrimaryAction={
            draft.name.trim()
              ? () => {
                  setClient({
                    name: draft.name.trim(),
                    phone: draft.phone.trim() || null,
                    email: draft.email.trim() || null,
                    existing: false,
                  });
                  setAdding(false);
                  setQuery("");
                }
              : undefined
          }
          secondaryActionLabel={copy.t("Back")}
        >
          <div className="space-y-3">
            <label className={LABEL}>
              {copy.t("Name")}
              <input className={FIELD} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
            </label>
            <label className={LABEL}>
              {copy.t("Phone (optional)")}
              <input
                type="tel"
                className={FIELD}
                value={draft.phone}
                onChange={(e) => setDraft({ ...draft, phone: e.target.value })}
              />
            </label>
            <label className={LABEL}>
              {copy.t("Email (optional)")}
              <input
                type="email"
                className={FIELD}
                value={draft.email}
                onChange={(e) => setDraft({ ...draft, email: e.target.value })}
              />
            </label>
            <p className={`text-[12.5px] ${MUTED}`}>
              {copy.t("The client is saved with the booking. Nothing is sent to them.")}
            </p>
          </div>
        </TaskShell>
      ) : null}
    </div>
  );
}
