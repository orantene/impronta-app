/**
 * client-thread-adapter — the CLIENT "role prop-interface" backing the
 * shared <ThreadShell> (remediation plan §3 / Phase 2, 2026-05-19).
 *
 * Plan §3 mandates "three role prop-interfaces backing one shell, NOT a
 * god-component". This module is the client one: the pure, role-specific
 * ~40% (inbox filter/search taxonomy + the row→view-model projection).
 * The shared ~60% (list iteration, region composition, scaffold seam)
 * lives once in ThreadShell. The bespoke client pixels (InquiryRow,
 * ThreadPaneWithTabs, the grid + mobile CSS) are injected by
 * ClientMessagesShell through ThreadShell's optional slots — they are
 * NOT in ThreadShell and NOT here, which is what keeps the shell a
 * primitive and this a thin adapter.
 *
 * Both exports are pure → pinned byte-for-byte by the Lane-E-style
 * characterization oracle (client-thread-adapter.test.ts). The filter
 * predicate is lifted VERBATIM from the prior inline
 * `inquiries.filter((i) => { … })` in ClientMessagesShell so the
 * behaviour is provably unchanged; the oracle is the zero-behaviour-
 * change proof the plan requires.
 */

import type { ClientInquiryRow } from "../../_data-bridge";
import type { ThreadShellListItem } from "@/components/shared/ThreadShell";

/** Client inbox filter chips (was the local `Filter` union in the shell). */
export type ClientMessagesFilter = "all" | "needs-me" | "active" | "booked" | "past";

/**
 * VERBATIM port of the prior inline client inbox predicate. Logic is
 * byte-for-byte the original `inquiries.filter((i) => { … })` body — only
 * relocated so it is pure + oracle-pinnable. Do not "tidy" it: the golden
 * spec asserts these exact quirks (e.g. `active` excludes `approved`;
 * `booked` accepts `approved`; search haystack = company·location·status·id,
 * `Boolean`-filtered, lowercased, substring).
 */
export function clientInquiryMatchesFilter(
  i: ClientInquiryRow,
  filter: ClientMessagesFilter,
  search: string,
): boolean {
  if (filter === "needs-me" && i.next_action_by !== "client") return false;
  if (filter === "active" && !["submitted", "coordination", "offer_pending", "offer_sent"].includes(i.status)) return false;
  if (filter === "booked" && i.status !== "booked" && i.status !== "approved") return false;
  if (filter === "past" && !["cancelled", "archived"].includes(i.status)) return false;
  if (search.trim()) {
    const q = search.toLowerCase();
    const haystack = [i.company, i.event_location, i.status, i.id].filter(Boolean).join(" ").toLowerCase();
    if (!haystack.includes(q)) return false;
  }
  return true;
}

/**
 * Project already-filtered client rows onto ThreadShell's role-agnostic
 * list view-model. In the scaffold + `renderRow` adoption path the shell
 * consumes only `id` (React key, active-identity compare, select wiring);
 * `title` is supplied because ThreadShellListItem requires it but the
 * client surface renders its bespoke <InquiryRow> via `renderRow`, so the
 * projected `title` is intentionally never painted. Kept deterministic
 * (company → id fallback) so the projection is itself oracle-pinnable.
 * Order is preserved 1:1 — the shell iterates in exactly this order, so
 * the prior `filtered.map(<InquiryRow/>)` ordering is unchanged.
 */
export function toClientThreadItems(rows: ClientInquiryRow[]): ThreadShellListItem[] {
  return rows.map((r) => ({ id: r.id, title: r.company ?? r.id }));
}
