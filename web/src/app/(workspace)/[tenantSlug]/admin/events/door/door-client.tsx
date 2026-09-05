"use client";

/**
 * The door. One screen, two ways in, one predicate that admits.
 *
 * SCAN: the QR's text goes to Sessions' `scanAdmission`, which verifies the
 * signature and calls `check_in` with `p_mode => 'token'`. TAP: a row's Admit
 * button goes to `admitAtDoor`, which calls `check_in` with `p_mode => 'actor'`.
 * Both land on the same function under the same row lock. `doorAdmits(outcome)`
 * is the ONLY thing that decides whether the screen goes green — never
 * `kind === "admitted"` — so no surface can decide admission independently.
 *
 * ONLINE-FIRST. This is the owner's stated requirement ("phone and internet")
 * and the marketing FAQ's honest answer. The already-scanned list is kept in
 * memory so a dropped signal degrades to a warning, not a turnstile: staff can
 * still see who is in, and a scan that cannot reach the server says so rather
 * than pretending. No offline admit exists, on purpose — an admit that has not
 * reached the row lock is not an admit.
 *
 * THE CAMERA IS NOT HERE. Camera capture is where mobile browsers differ most,
 * and the only proof that counts is a real iPhone in Safari or the installed
 * PWA — on the QA list, the owner's click. This surface takes the decoded text
 * from whatever scans it: a camera component when one is added, a hardware
 * scanner that types, or a person reading a code off a receipt. Anything
 * green from the iOS Simulator, which has no camera, proves nothing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

import { scanAdmission } from "@/lib/sessions/door-actions";
import { doorAdmits, type DoorOutcome } from "@/lib/sessions/door";
import {
  admitAtDoor,
  loadDoor,
  loadNightReport,
  type DoorRow,
  type DoorSession,
  type NightReport,
} from "@/app/(workspace)/[tenantSlug]/admin/_door-actions";
import type { DoorCounts } from "@/lib/events/summary";

function outcomeLabel(o: DoorOutcome): { text: string; tone: "green" | "red" | "amber" } {
  switch (o.kind) {
    case "admitted":
      return {
        text:
          o.partySize > 1
            ? `In — ${o.admittedCount} of ${o.partySize}${o.wasMarkedNoShow ? " (was marked no-show)" : ""}`
            : `In${o.wasMarkedNoShow ? " (was marked no-show)" : ""}`,
        tone: "green",
      };
    case "already_in":
      return { text: `Already scanned — ${o.admittedCount} of ${o.partySize} in`, tone: "red" };
    case "superseded":
      return { text: "Old ticket — this one was re-issued", tone: "red" };
    case "not_valid":
      return { text: o.status === "refunded" ? "Refunded" : "Cancelled", tone: "red" };
    case "forged":
      return { text: "Not a valid ticket", tone: "red" };
    case "unknown_ticket":
      return { text: "Not found for this event", tone: "red" };
    case "too_many":
      return { text: `Only ${o.remaining} left on this ticket`, tone: "amber" };
    case "door_misconfigured":
      return { text: "Door not set up — tell the venue, not the guest", tone: "amber" };
    case "engine_error":
      return { text: "Could not reach the door — try again", tone: "amber" };
  }
}

function timeLabel(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

export function DoorClient({ sessionId, tenantId }: { sessionId: string | null; tenantId: string }) {
  const [door, setDoor] = useState<
    | { kind: "idle" }
    | { kind: "loading" }
    | { kind: "error"; message: string }
    | { kind: "ready"; session: DoorSession; rows: DoorRow[]; counts: DoorCounts }
  >({ kind: sessionId ? "loading" : "idle" });
  const [last, setLast] = useState<{ outcome: DoorOutcome; at: number } | null>(null);
  const [report, setReport] = useState<NightReport | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!sessionId) return;
    void loadDoor(sessionId).then((res) => {
      // A refusal is shown, never rendered as an empty door.
      if (res.ok) setDoor({ kind: "ready", session: res.session, rows: res.rows, counts: res.counts });
      else setDoor({ kind: "error", message: res.error });
    });
  }, [sessionId]);

  useEffect(refresh, [refresh]);

  const onScan = useCallback(
    async (raw: string) => {
      const token = raw.trim();
      if (!token || busy) return;
      setBusy(true);
      try {
        const { outcome } = await scanAdmission(tenantId, token, 1);
        setLast({ outcome, at: Date.now() });
        if (doorAdmits(outcome)) refresh();
      } finally {
        setBusy(false);
        if (inputRef.current) {
          inputRef.current.value = "";
          inputRef.current.focus();
        }
      }
    },
    [busy, refresh, tenantId],
  );

  const onAdmit = useCallback(
    async (row: DoorRow, count?: number) => {
      if (busy) return;
      setBusy(true);
      try {
        const { outcome } = await admitAtDoor(row.id, count);
        setLast({ outcome, at: Date.now() });
        if (doorAdmits(outcome)) refresh();
      } finally {
        setBusy(false);
      }
    },
    [busy, refresh],
  );

  const onReport = useCallback(async () => {
    if (!sessionId) return;
    const res = await loadNightReport(sessionId);
    if (res.ok) setReport(res.report);
  }, [sessionId]);

  if (!sessionId) {
    return (
      <div className="mx-auto max-w-lg p-6">
        <h1 className="text-xl font-semibold">Door</h1>
        <p className="mt-2 text-sm text-black/60">
          Open this from an event&apos;s Door tab, or add <code>?session=&lt;id&gt;</code> to the address.
        </p>
      </div>
    );
  }

  const lastLabel = last ? outcomeLabel(last.outcome) : null;
  const toneClass =
    lastLabel?.tone === "green"
      ? "bg-emerald-600 text-white"
      : lastLabel?.tone === "red"
        ? "bg-red-600 text-white"
        : lastLabel?.tone === "amber"
          ? "bg-amber-500 text-black"
          : "bg-black/[0.04] text-black/60";

  return (
    <div className="mx-auto flex min-h-[100dvh] max-w-lg flex-col gap-4 p-4">
      {/* Header + counts */}
      <header>
        <div className="text-xs uppercase tracking-wide text-black/50">Door</div>
        <h1 className="text-xl font-semibold">
          {door.kind === "ready" ? (door.session.eventTitle ?? "Tonight") : "Tonight"}
        </h1>
        {door.kind === "ready" ? (
          <div className="mt-2 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-lg border border-black/10 p-2">
              <div className="text-2xl font-semibold">{door.counts.arrived}</div>
              <div className="text-[11px] uppercase tracking-wide text-black/50">In</div>
            </div>
            <div className="rounded-lg border border-black/10 p-2">
              <div className="text-2xl font-semibold">{door.counts.stillToCome}</div>
              <div className="text-[11px] uppercase tracking-wide text-black/50">Still to come</div>
            </div>
            <div className="rounded-lg border border-black/10 p-2">
              <div className="text-2xl font-semibold">{door.counts.expected}</div>
              <div className="text-[11px] uppercase tracking-wide text-black/50">Expected</div>
            </div>
          </div>
        ) : null}
      </header>

      {/* The scan field — decoded text from whatever scans it */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void onScan(inputRef.current?.value ?? "");
        }}
      >
        <label className="block text-xs font-medium text-black/60" htmlFor="door-scan">
          Scan or type a ticket code
        </label>
        <input
          id="door-scan"
          ref={inputRef}
          autoFocus
          autoComplete="off"
          inputMode="text"
          disabled={busy}
          className="mt-1 w-full rounded-lg border border-black/20 px-3 py-3 font-mono text-sm"
          placeholder="Point the scanner here"
        />
      </form>

      {/* The verdict — big, one colour, from doorAdmits and nothing else */}
      <div
        role="status"
        aria-live="assertive"
        className={`rounded-xl px-4 py-5 text-center text-lg font-semibold ${toneClass}`}
      >
        {lastLabel ? lastLabel.text : "Ready"}
      </div>

      {/* The list */}
      {door.kind === "loading" ? (
        <p className="text-sm text-black/60">Loading the door…</p>
      ) : door.kind === "error" ? (
        <p className="rounded-lg border border-black/10 bg-black/[0.03] p-3 text-sm text-red-700">
          {door.message}
        </p>
      ) : door.kind === "ready" ? (
        <section className="flex-1">
          <input
            type="search"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Find by name"
            className="w-full rounded-lg border border-black/10 px-3 py-2 text-sm"
          />
          <ul className="mt-2 divide-y divide-black/10">
            {door.rows
              .filter((r) => !filter || (r.holderName ?? "").toLowerCase().includes(filter.toLowerCase()))
              .map((r) => {
                const full = r.admittedCount >= r.partySize;
                const dead = r.status !== "valid";
                return (
                  <li key={r.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <div className={`truncate text-sm font-medium ${dead ? "line-through text-black/40" : ""}`}>
                        {r.holderName ?? (r.walkUp ? "Walk-up" : r.partySize > 1 ? `Party of ${r.partySize}` : "Ticket")}
                      </div>
                      <div className="text-xs text-black/50">
                        {dead
                          ? r.status
                          : r.noShowAt && r.admittedCount === 0
                            ? "Marked no-show"
                            : full
                              ? `In${r.seatedAt ? ` · ${timeLabel(r.seatedAt)}` : ""}`
                              : r.admittedCount > 0
                                ? `${r.admittedCount} of ${r.partySize} in`
                                : r.partySize > 1
                                  ? `${r.partySize} people`
                                  : "Not yet"}
                      </div>
                    </div>
                    {!dead && !full ? (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void onAdmit(r)}
                        className="shrink-0 rounded-lg bg-black px-3 py-2 text-sm font-medium text-white disabled:opacity-40"
                      >
                        {r.partySize - r.admittedCount > 1 ? `Admit ${r.partySize - r.admittedCount}` : "Admit"}
                      </button>
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}

      {/* End of night */}
      <footer className="border-t border-black/10 pt-3">
        {report ? (
          <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
            <dt className="text-black/50">Sold</dt>
            <dd>{report.sold}</dd>
            <dt className="text-black/50">Scanned</dt>
            <dd>{report.scanned}</dd>
            <dt className="text-black/50">Not scanned</dt>
            <dd>{report.notScanned}</dd>
            <dt className="text-black/50">No-shows</dt>
            <dd>{report.noShows}</dd>
            <dt className="text-black/50">Sold at the door</dt>
            <dd>{report.walkUps}</dd>
            <dt className="text-black/50">Refunded</dt>
            <dd>{report.refunded}</dd>
          </dl>
        ) : (
          <button
            type="button"
            onClick={() => void onReport()}
            className="w-full rounded-lg border border-black/20 px-3 py-2 text-sm"
          >
            End-of-night report
          </button>
        )}
      </footer>
    </div>
  );
}
