"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { loadTalentClients } from "@/lib/talent/clients-actions";
import {
  clientInitials,
  clientsRowAction,
  countClientsByFilter,
  filterClientsDirectory,
  hasRepeatServices,
  type ClientsFilter,
  type ClientsRowAction,
} from "@/lib/talent/clients-directory";
import type { TalentClientRow } from "@/lib/talent/clients-merge";
import { useDashboardText } from "../../dashboard-i18n";
import { useAdminShell } from "../../state";
import { PageHeader } from "../shared/page-chrome-1";
import { restoreClient } from "@/lib/talent/client-records-actions";
import { ClientArchiveSheet, ClientDetailsPanel, ClientNoteInline } from "./ClientPanels";

const FILTERS: { id: ClientsFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "upcoming", label: "Upcoming" },
  { id: "outstanding", label: "Outstanding" },
  { id: "follow", label: "Due for a refill" },
  { id: "fresh", label: "New" },
];

/** Set by TalentClientsPage each render (children format after the parent runs). */
let dateLocale: string | undefined;

function formatMoney(cents: number, currency: string | null): string {
  const amount = Math.round(cents) / 100;
  const code = (currency ?? "").trim().toUpperCase();
  const formatted = amount.toLocaleString(undefined, {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  });
  return code ? `$${formatted} ${code}` : `$${formatted}`;
}

function formatMonthYear(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(dateLocale, { month: "long", year: "numeric" });
  } catch {
    return "";
  }
}

function formatDay(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(dateLocale, {
      weekday: "short",
      day: "numeric",
      month: "short",
    });
  } catch {
    return "";
  }
}

function actionLabel(action: ClientsRowAction, t: (s: string) => string): string {
  switch (action.kind) {
    case "review_request":
      return t("Review request");
    case "view_hold":
      return t("View hold");
    case "view_appointment":
      return t("View appointment");
    case "request_payment":
      return t("Request payment");
    case "book_appointment":
      return t("Book appointment");
  }
}

function nextStatusLabel(
  status: TalentClientRow["nextStatus"],
  t: (s: string) => string,
): string {
  if (status === "hold") return t("On hold");
  if (status === "requested") return t("Requested");
  if (status === "confirmed") return t("Confirmed");
  return "";
}

type HistoryEntry = NonNullable<TalentClientRow["history"]>[number];

function historyService(h: HistoryEntry, clientName: string): string | null {
  const title = h.title?.trim();
  if (!title || title.toLowerCase() === clientName.trim().toLowerCase()) return null;
  return title;
}

function lastCompleted(row: TalentClientRow): HistoryEntry | null {
  return (row.history ?? []).find((h) => (h.state ?? (h.past ? "completed" : null)) === "completed") ?? null;
}

function historyStateLabel(h: HistoryEntry, t: (s: string) => string): string {
  const state = h.state ?? (h.past ? "completed" : "confirmed");
  if (state === "completed") return t("Completed");
  if (state === "hold") return t("On hold");
  if (state === "requested") return t("Requested");
  return h.past ? t("Not marked complete") : t("Confirmed");
}

function StatusTag({ row, t }: { row: TalentClientRow; t: (s: string) => string }) {
  const returning = row.completedCount > 0;
  return (
    <span
      className={`ml-1.5 inline-flex h-5 items-center rounded-full px-2 align-middle text-[11px] font-semibold ${
        returning ? "bg-black/[0.05] text-admin-ink-muted" : "bg-admin-accent/10 text-admin-accent"
      }`}
    >
      {returning ? t("Returning") : t("New")}
    </span>
  );
}

function Avatar({ name, size = "md" }: { name: string; size?: "md" | "lg" }) {
  return (
    <span
      aria-hidden
      className={`inline-flex shrink-0 items-center justify-center rounded-full bg-black/[0.06] font-admin-body font-semibold text-admin-ink ${
        size === "lg" ? "h-14 w-14 text-[17px]" : "h-10 w-10 text-[13px]"
      }`}
    >
      {clientInitials(name)}
    </span>
  );
}

function FilterChips(props: {
  filter: ClientsFilter;
  counts: Record<ClientsFilter, number>;
  onChange: (f: ClientsFilter) => void;
  t: (s: string) => string;
  showRefill: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={props.t("Clients")}
      className="flex gap-2 overflow-x-auto pb-1"
      data-clients-filters
    >
      {FILTERS.filter((f) => f.id !== "follow" || props.showRefill).map((f) => {
        const selected = props.filter === f.id;
        return (
          <button
            key={f.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => props.onChange(f.id)}
            className={
              selected
                ? "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-admin-ink px-3.5 font-admin-body text-[14px] font-semibold text-white"
                : "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border border-admin-border-soft bg-white px-3.5 font-admin-body text-[14px] text-admin-ink"
            }
          >
            {props.t(f.label)}
            <span className="opacity-75 tabular-nums">{props.counts[f.id]}</span>
          </button>
        );
      })}
    </div>
  );
}

function OutstandingCell({ row, t }: { row: TalentClientRow; t: (s: string) => string }) {
  if (row.amountOwedCents == null || row.amountOwedCents <= 0) {
    return <span className="text-admin-ink-muted">{t("None")}</span>;
  }
  const risk = row.overdue;
  return (
    <span className={risk ? "text-destructive" : "text-admin-ink"}>
      <span className="font-semibold">{formatMoney(row.amountOwedCents, row.currency)}</span>
      <span className="mt-0.5 block text-[12px]">
        {risk ? t("overdue") : t("at the appointment")}
      </span>
    </span>
  );
}

function ClientRecord(props: {
  row: TalentClientRow;
  talentId: string | null;
  onEdit: () => void;
  onArchive: () => void;
  onNote: (note: string | null) => void;
  onBack: () => void;
  t: (s: string) => string;
  router: ReturnType<typeof useRouter>;
}) {
  const { row, t, router } = props;
  const action = clientsRowAction(row);
  const history = row.history ?? [];
  const completed = history.filter((h) => (h.state ?? (h.past ? "completed" : null)) === "completed");
  const paidCents = completed
    .filter((h) => h.paymentStatus === "paid" && h.amountCents != null)
    .reduce((sum, h) => sum + (h.amountCents ?? 0), 0);
  const currency = history.find((h) => h.currency)?.currency ?? row.currency;
  const first = completed[completed.length - 1] ?? null;
  const btn =
    "inline-flex h-11 items-center justify-center rounded-full border border-admin-border-soft bg-white px-4 font-admin-body text-[14px] font-semibold text-admin-ink";
  return (
    <div data-clients-record className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="min-w-0">
        <button
          type="button"
          onClick={props.onBack}
          className="mb-3 min-h-[32px] font-admin-body text-[13.5px] font-medium text-admin-accent"
        >
          ‹ {t("Clients")}
        </button>
        <div className="flex items-start gap-3.5">
          <Avatar name={row.name} size="lg" />
          <div className="min-w-0 flex-1">
            <h2 className="font-admin-display text-[22px] font-semibold text-admin-ink">{row.name}</h2>
            <p className="mt-0.5 font-admin-body text-[14px] text-admin-ink-muted">
              {[row.phone, row.email].filter(Boolean).join(" · ") || t("No phone or email on file")}
            </p>
            <p className="mt-0.5 font-admin-body text-[13px] text-admin-ink-muted">
              {row.firstSeenAt ? `${t("Client since")} ${formatMonthYear(row.firstSeenAt)} · ` : ""}
              {row.source === "booking" ? t("From a booking") : t("From a message")}
            </p>
          </div>
          <button type="button" className={btn} onClick={props.onEdit} data-client-edit>
            {t("Edit details")}
          </button>
        </div>

        <div className="mt-4 rounded-[12px] border-[1.5px] border-admin-ink bg-white p-4">
          <div className="text-[12px] font-bold uppercase tracking-wide text-admin-ink-muted">{t("Next")}</div>
          {row.nextStartsAt ? (
            <>
              <div className="mt-1 font-admin-body text-[17px] font-bold text-admin-ink">
                {formatDay(row.nextStartsAt)}
              </div>
              <div className="mt-1 text-[13px] font-semibold text-admin-ink-muted">
                {nextStatusLabel(row.nextStatus, t)}
              </div>
            </>
          ) : (
            <div className="mt-1 font-admin-body text-[15px] text-admin-ink-muted">{t("Nothing booked")}</div>
          )}
          {row.amountOwedCents != null && row.amountOwedCents > 0 ? (
            <div className="mt-2.5 border-t border-admin-border-soft pt-2.5">
              <div className="flex items-baseline gap-2">
                <span className="flex-1 text-[14.5px]">{t("Outstanding")}</span>
                <span className="font-semibold">{formatMoney(row.amountOwedCents, row.currency)}</span>
              </div>
              <p className="mt-1 text-[13px] text-admin-ink-muted">
                {t("Due at the appointment · the same amount shows in Money and on the booking")}
              </p>
            </div>
          ) : null}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" className={btn} onClick={props.onArchive} data-client-archive>
            {t("Archive")}
          </button>
          {row.conversationHref ? (
            <button type="button" className={btn} onClick={() => router.push(row.conversationHref!)}>
              {t("Message")}
            </button>
          ) : null}
          {action.kind !== "book_appointment" && action.href ? (
            <button type="button" className={btn} onClick={() => router.push(action.href!)}>
              {actionLabel(action, t)}
            </button>
          ) : null}
          <button
            type="button"
            className="inline-flex h-11 items-center justify-center rounded-full bg-admin-ink px-4 font-admin-body text-[14px] font-semibold text-white"
            onClick={() => router.push("/talent/bookings/new")}
          >
            {t("Book appointment")}
          </button>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline gap-2">
            <h3 className="flex-1 font-admin-body text-[16px] font-semibold text-admin-ink">{t("Work and payments")}</h3>
            <span className="text-[13px] text-admin-ink-muted">
              {completed.length > 0 ? `${completed.length} ${t("completed")}` : t("No completed work yet")}
            </span>
          </div>
          {history.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-[12px] border border-admin-border-soft bg-white">
              {history.map((h, i) => (
                <button
                  key={h.bookingId}
                  type="button"
                  onClick={() => router.push(h.href)}
                  className={`flex min-h-[44px] w-full items-start gap-3 px-4 py-3 text-left ${
                    i ? "border-t border-admin-border-soft" : ""
                  }`}
                >
                  <span className="w-[96px] shrink-0 font-admin-body text-[13.5px] text-admin-ink">
                    {formatDay(h.startsAt)}
                  </span>
                  <span className="min-w-0 flex-1 font-admin-body text-[13px]">
                    <span className="block text-[14px] text-admin-ink">
                      {historyService(h, row.name) ?? t("No service set")}
                    </span>
                    <span className="mt-0.5 block text-admin-ink-muted">
                      {historyStateLabel(h, t)}
                      {h.paymentStatus ? (
                        <span
                          className={`font-semibold ${
                            h.paymentStatus === "paid"
                              ? "text-admin-success-deep"
                              : h.past
                                ? "text-admin-critical"
                                : "text-admin-ink-muted"
                          }`}
                        >
                          {" · "}
                          {h.paymentStatus === "paid"
                            ? t("Paid")
                            : h.paymentStatus === "partial"
                              ? t("Part paid")
                              : t("Not paid yet")}
                        </span>
                      ) : null}
                    </span>
                  </span>
                  {h.amountCents != null ? (
                    <span className="whitespace-nowrap font-admin-body text-[14px] font-semibold text-admin-ink">
                      {formatMoney(h.amountCents, h.currency)}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-[13px] text-admin-ink-muted">{t("No appointments yet.")}</p>
          )}
        </div>
      </div>

      <aside className="flex flex-col gap-3 lg:pt-10">
        {props.talentId ? (
          <ClientNoteInline key={`${row.id}:${row.note ?? ""}`} talentId={props.talentId} row={row} t={t} onSaved={props.onNote} />
        ) : null}
        <details className="rounded-[12px] border border-admin-border-soft bg-white px-4 py-3" open>
          <summary className="cursor-pointer font-admin-body text-[14px] font-semibold text-admin-ink">
            {t("History in numbers")}
          </summary>
          <dl className="mt-2 space-y-1.5 font-admin-body text-[13px]">
            <div className="flex justify-between gap-3">
              <dt className="text-admin-ink-muted">{t("Completed")}</dt>
              <dd className="text-admin-ink">{completed.length}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-admin-ink-muted">{t("Paid to you")}</dt>
              <dd className="text-admin-ink">{paidCents > 0 ? formatMoney(paidCents, currency) : t("None yet")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-admin-ink-muted">{t("First visit")}</dt>
              <dd className="text-admin-ink">{first ? formatDay(first.startsAt) : t("None yet")}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-admin-ink-muted">{t("Last visit")}</dt>
              <dd className="text-admin-ink">{completed[0] ? formatDay(completed[0].startsAt) : t("None yet")}</dd>
            </div>
          </dl>
        </details>
      </aside>
    </div>
  );
}

export function TalentClientsPage() {
  const { bridgeTalentSelfProfile, toast } = useAdminShell();
  const copy = useDashboardText();
  dateLocale = copy.isSpanish ? "es-MX" : "en-US";
  const t = copy.t;
  const router = useRouter();
  const [items, setItems] = useState<TalentClientRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ClientsFilter>("all");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [panel, setPanel] = useState<
    { kind: "add" } | { kind: "edit"; row: TalentClientRow } | { kind: "archive"; row: TalentClientRow } | null
  >(null);
  const [reloadKey, setReloadKey] = useState(0);
  const talentId = bridgeTalentSelfProfile?.id ?? null;

  useEffect(() => {
    if (!talentId) return;
    let cancelled = false;
    void loadTalentClients(talentId).then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setError(res.error);
        setItems([]);
        return;
      }
      setItems(res.items);
    });
    return () => {
      cancelled = true;
    };
  }, [talentId, reloadKey]);

  const counts = useMemo(
    () => countClientsByFilter(items ?? []),
    [items],
  );
  const visible = useMemo(
    () =>
      filterClientsDirectory({
        items: items ?? [],
        filter,
        query,
      }),
    [items, filter, query],
  );
  const selected = items?.find((r) => r.id === selectedId) ?? null;

  const panels = talentId ? (
    <>
      {panel && (panel.kind === "add" || panel.kind === "edit") ? (
        <ClientDetailsPanel
          talentId={talentId}
          row={panel.kind === "edit" ? panel.row : undefined}
          t={t}
          onClose={() => setPanel(null)}
          onSaved={({ key, message }) => {
            setPanel(null);
            toast(message);
            setReloadKey((n) => n + 1);
            if (panel.kind === "add") setSelectedId(key);
          }}
        />
      ) : null}
      {panel?.kind === "archive" ? (
        <ClientArchiveSheet
          talentId={talentId}
          row={panel.row}
          t={t}
          onClose={() => setPanel(null)}
          onArchived={() => {
            const archivedRow = panel.row;
            setPanel(null);
            setSelectedId(null);
            setReloadKey((n) => n + 1);
            toast(t("Client archived"), {
              action: {
                label: t("Undo"),
                onClick: () => {
                  void restoreClient(talentId, archivedRow.id).then((r) => {
                    if (r.ok) setReloadKey((n) => n + 1);
                    else toast(t("Could not save. Try again."));
                  });
                },
              },
            });
          }}
        />
      ) : null}
    </>
  ) : null;

  if (selected) {
    return (
      <div>
        <PageHeader title={selected.name} subtitle={t("Client")} />
        <ClientRecord
          row={selected}
          talentId={talentId}
          onEdit={() => setPanel({ kind: "edit", row: selected })}
          onArchive={() => setPanel({ kind: "archive", row: selected })}
          onNote={(note) => {
            toast(t("Note saved"));
            setItems((prev) => prev?.map((r) => (r.id === selected.id ? { ...r, note } : r)) ?? prev);
          }}
          onBack={() => setSelectedId(null)}
          t={t}
          router={router}
        />
        {panels}
      </div>
    );
  }

  const total = items?.length ?? 0;
  const showRefill = hasRepeatServices(items ?? []);
  const baseSubtitle =
    items == null
      ? t("People who booked or messaged you")
      : `${total} ${t(total === 1 ? "person you have worked with or talked to" : "people you have worked with or talked to")}`;
  const subtitle =
    items != null && showRefill
      ? t("{people} · {due} due for a refill")
          .replace("{people}", `${total} ${t(total === 1 ? "person" : "people")}`)
          .replace("{due}", String(counts.follow))
      : baseSubtitle;

  return (
    <div data-clients-directory>
      <PageHeader
        title={t("Clients")}
        subtitle={subtitle}
        actions={
          <button
            type="button"
            className="inline-flex h-9 items-center rounded-full bg-admin-ink px-3.5 font-admin-body text-[13px] font-semibold text-white"
            onClick={() => setPanel({ kind: "add" })}
            disabled={!talentId}
            data-client-add
          >
            {t("Add a client")}
          </button>
        }
      />

      {!talentId && (
        <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink-muted">
          {t("Your clients will appear here once your talent profile is set up.")}
        </p>
      )}
      {talentId && items === null && (
        <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink-muted">{t("Loading")}</p>
      )}
      {error && (
        <p className="px-1 py-4 font-admin-body text-[13px] text-admin-ink">
          {error} {t("Refresh the page and try again.")}
        </p>
      )}

      {items && (
        <div className="flex flex-col gap-3">
          <label className="relative block">
            <span className="sr-only">{t("Search name, phone or email")}</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t("Search name, phone or email")}
              className="h-11 w-full rounded-[12px] border border-admin-border-soft bg-white px-4 sm:w-[340px] font-admin-body text-[14px] text-admin-ink outline-none placeholder:text-admin-ink-muted focus:border-admin-ink"
              data-clients-search
            />
          </label>

          <FilterChips filter={filter} counts={counts} onChange={setFilter} t={t} showRefill={showRefill} />

          <p className="px-0.5 font-admin-body text-[13.5px] text-admin-ink-muted">
            {visible.length} {t("of")} {total} {t("clients")}
            {filter === "follow"
              ? ` · ${t("Based on how often each client repeats a service.")}`
              : ""}
          </p>

          {visible.length === 0 ? (
            <p className="rounded-[12px] border border-dashed border-admin-border-soft px-4 py-6 text-center font-admin-body text-[14px] text-admin-ink-muted">
              {query.trim()
                ? t("No matching clients")
                : t("No one has booked or messaged you yet.")}
            </p>
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden overflow-hidden rounded-[12px] border border-admin-border-soft bg-white md:block">
                <div className="grid grid-cols-[1.5fr_1.4fr_1.1fr_0.8fr_190px] gap-3.5 bg-[color-mix(in_srgb,var(--admin-ink)_4%,transparent)] px-4 py-2.5 font-admin-body text-[12.5px] font-semibold text-admin-ink-muted">
                  <span>{t("Client")}</span>
                  <span>{t("Last completed")}</span>
                  <span>{t("Next")}</span>
                  <span className="text-right">{t("Outstanding")}</span>
                  <span />
                </div>
                {visible.map((row) => {
                  const action = clientsRowAction(row);
                  return (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1.5fr_1.4fr_1.1fr_0.8fr_190px] items-center gap-3.5 border-t border-admin-border-soft px-4 py-3"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedId(row.id)}
                        className="flex min-w-0 items-center gap-2.5 text-left"
                      >
                        <Avatar name={row.name} />
                        <span className="min-w-0">
                          <span className="block truncate text-[14.5px] font-bold text-admin-ink">
                            {row.name}
                            <StatusTag row={row} t={t} />
                          </span>
                          {row.phone ? (
                            <span className="block truncate text-[13px] text-admin-ink-muted">
                              {row.phone}
                            </span>
                          ) : null}
                        </span>
                      </button>
                      <div className="text-[13.5px] text-admin-ink">
                        {row.completedCount > 0 ? (
                          <>
                            {[
                              formatDay(lastCompleted(row)?.startsAt ?? row.lastVisit),
                              (() => {
                                const h = lastCompleted(row);
                                return h ? historyService(h, row.name) : null;
                              })(),
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                            <div className="text-[12.5px] text-admin-ink-muted">
                              {row.completedCount} {t("completed")}
                            </div>
                          </>
                        ) : (
                          <span className="text-admin-ink-muted">{t("No work yet")}</span>
                        )}
                      </div>
                      <div className="text-[13.5px] text-admin-ink">
                        {row.nextStartsAt ? (
                          <>
                            {formatDay(row.nextStartsAt)}
                            <div className="mt-0.5 text-[12px] font-semibold text-admin-ink-muted">
                              {nextStatusLabel(row.nextStatus, t)}
                            </div>
                          </>
                        ) : (
                          <span className="text-admin-ink-muted">{t("Nothing booked")}</span>
                        )}
                      </div>
                      <div className="text-right text-[13.5px]">
                        <OutstandingCell row={row} t={t} />
                      </div>
                      <div className="text-right">
                        <button
                          type="button"
                          className="inline-flex h-9 items-center rounded-full border border-admin-border-soft px-3 font-admin-body text-[13px] font-semibold text-admin-ink"
                          onClick={() => {
                            router.push(action.kind === "book_appointment" ? "/talent/bookings/new" : action.href || "/talent/calendar");
                          }}
                        >
                          {actionLabel(action, t)}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Phone cards */}
              <ul className="overflow-hidden rounded-[12px] border border-admin-border-soft bg-white md:hidden">
                {visible.map((row, i) => {
                  const action = clientsRowAction(row);
                  return (
                    <li
                      key={row.id}
                      className={i ? "border-t border-admin-border-soft" : undefined}
                    >
                      <div className="p-3.5">
                        <button
                          type="button"
                          onClick={() => setSelectedId(row.id)}
                          className="flex w-full items-start gap-3 text-left"
                        >
                          <Avatar name={row.name} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-baseline gap-2">
                              <span className="flex-1 truncate text-[16px] font-bold text-admin-ink">
                                {row.name}
                              </span>
                              {row.amountOwedCents != null && row.amountOwedCents > 0 ? (
                                <span
                                  className={
                                    row.overdue
                                      ? "text-[15px] font-semibold text-destructive"
                                      : "text-[15px] font-semibold text-admin-ink"
                                  }
                                >
                                  {formatMoney(row.amountOwedCents, row.currency)}
                                </span>
                              ) : null}
                            </span>
                            <span className="mt-0.5 block text-[14px] text-admin-ink-muted">
                              {row.nextStartsAt
                                ? `${t("Next")}: ${formatDay(row.nextStartsAt)} · ${nextStatusLabel(row.nextStatus, t)}`
                                : row.completedCount > 0
                                  ? `${row.completedCount} ${t("completed")}${row.lastVisit ? ` · ${formatDay(row.lastVisit)}` : ""}`
                                  : t("No work yet")}
                            </span>
                          </span>
                        </button>
                        {filter === "follow" ? (
                          <div className="mt-2.5 flex gap-2">
                            {row.conversationHref ? (
                              <button
                                type="button"
                                className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-admin-border-soft font-admin-body text-[14px] font-semibold"
                                onClick={() => router.push(row.conversationHref!)}
                              >
                                {t("Message")}
                              </button>
                            ) : null}
                            <button
                              type="button"
                              className="inline-flex h-11 flex-1 items-center justify-center rounded-full border border-admin-border-soft font-admin-body text-[14px] font-semibold"
                              onClick={() => router.push("/talent/calendar")}
                            >
                              {t("Book")}
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="mt-2.5 inline-flex h-11 w-full items-center justify-center rounded-full border border-admin-border-soft font-admin-body text-[14px] font-semibold text-admin-ink"
                            onClick={() => {
                              if (action.href) router.push(action.href);
                            }}
                          >
                            {actionLabel(action, t)}
                          </button>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      )}
      {panels}
    </div>
  );
}
