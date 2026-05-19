import { useState, useEffect } from "react";
import { setInquiryPinned, setInquiryManuallyUnread, setInquiryArchived } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { getInquiryFlagsUserId, getInquiryFlagsTenantSlug } from "../inquiry-flags-tenant-slug";
import { MOCK_OFFER_FOR_CONV, RICH_OFFER_ALIAS } from "./shared/machinery-10";
import { TalentBookingTab } from "./shared/machinery-2";
import { ClientProjectViewTab } from "./shared/machinery-3";
import type { LineupRow, Offer, TimelineEvent } from "./shared/machinery-9";


// ════════════════════════════════════════════════════════════════════
// ROUTER — picks the right shell per pov
// ════════════════════════════════════════════════════════════════════

/**
 * Pending conversation id, set by callers (e.g. the Today bookings row)
 * just before they navigate to the messages page. The shell consumes it
 * on mount and clears it. Module-level so it survives the lazy-import
 * boundary; one-shot so a refresh doesn't keep re-pinning the same row.
 */
export let __pendingActiveConversationId: string | null = null;
export function pinNextConversation(id: string) { __pendingActiveConversationId = id; }
export function consumePendingConversation(): string | null {
  const v = __pendingActiveConversationId;
  __pendingActiveConversationId = null;
  return v;
}

// ── Local row-override store ──
// Submit-rate / Withdraw flows write into this module-level map keyed
// by `${convId}:${rowId}`. Any consumer reading an offer for a conv
// merges the matching overrides on top before rendering, so a rate the
// talent just submitted shows up in:
//   • the offer-tab lineup row (status flips to "submitted")
//   • the conversation header take-home pill (re-derived via the rate Proxy)
//   • the inbox row's right-side rate
//   • Today's calendar tile + earnings "in flight" strip
//   • the historical-offer card on the booking tab
// Without this lift, the override died the moment the user clicked
// away from the offer tab — a demo killer.
export const __rowOverrides: Record<string, Partial<LineupRow>> = {};
export const __rowOverrideSubscribers = new Set<() => void>();
export function setRowOverride(convId: string, rowId: string, patch: Partial<LineupRow>) {
  const key = `${convId}:${rowId}`;
  __rowOverrides[key] = { ...__rowOverrides[key], ...patch };
  __rowOverrideSubscribers.forEach(fn => fn());
  // Notify offer-stash subscribers too so any consumer of
  // getEffectiveOffer re-renders when row overrides change.
  __offerSubscribers.forEach(fn => fn());
}
export function clearRowOverrides(convId: string) {
  for (const key of Object.keys(__rowOverrides)) {
    if (key.startsWith(`${convId}:`)) delete __rowOverrides[key];
  }
  __rowOverrideSubscribers.forEach(fn => fn());
}
export function getRowOverride(convId: string, rowId: string): Partial<LineupRow> | undefined {
  return __rowOverrides[`${convId}:${rowId}`];
}
export function applyRowOverrides(convId: string, offer: Offer): Offer {
  const hasAny = offer.rows.some(r => __rowOverrides[`${convId}:${r.id}`]);
  if (!hasAny) return offer;
  return {
    ...offer,
    rows: offer.rows.map(r => {
      const o = __rowOverrides[`${convId}:${r.id}`];
      return o ? ({ ...r, ...o } as LineupRow) : r;
    }),
  };
}
export function useRowOverrideSubscription() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __rowOverrideSubscribers.add(fn);
    return () => { __rowOverrideSubscribers.delete(fn); };
  }, []);
}

// ── Module-level offer-override store ──
// Talent-side rate submissions, client-side approvals, admin-side
// stage transitions all write into this single store, keyed by conv
// id. Every shell reads through `getEffectiveOffer(convId)` instead
// of `MOCK_OFFER_FOR_CONV` directly, so a mutation made by talent
// is visible to client + admin in real time (within a session).
export type OfferOverride = {
  /** Local stage override — wins over the seed offer.stage. */
  stage?: Offer["stage"];
  /** Per-row patches keyed by row.id. */
  rows?: Record<string, Partial<LineupRow>>;
  /** Extra timeline events appended after the seed timeline. */
  appendedTimeline?: TimelineEvent[];
};
export const __offerOverrides: Record<string, OfferOverride> = {};
export const __offerSubscribers = new Set<() => void>();
export function getEffectiveOffer(convId: string): Offer | undefined {
  const seed = MOCK_OFFER_FOR_CONV[convId] ?? MOCK_OFFER_FOR_CONV[RICH_OFFER_ALIAS[convId] ?? ""];
  if (!seed) return undefined;
  const ov = __offerOverrides[convId];
  // Layer 1 — apply offer-level overrides (stage + new timeline events).
  const withOfferOv: Offer = ov ? {
    ...seed,
    stage: ov.stage ?? seed.stage,
    rows: ov.rows
      ? seed.rows.map(r => ov.rows?.[r.id] ? { ...r, ...ov.rows[r.id] } as LineupRow : r)
      : seed.rows,
    timeline: ov.appendedTimeline
      ? [...seed.timeline, ...ov.appendedTimeline]
      : seed.timeline,
  } : seed;
  // Layer 2 — apply per-row overrides (the older talent-shell store).
  // Both stores can be writing to the same conv, e.g. talent submits a
  // rate (→ __rowOverrides) and client approves (→ __offerOverrides).
  return applyRowOverrides(convId, withOfferOv);
}
export function applyOfferOverride(convId: string, patch: OfferOverride): void {
  const prev = __offerOverrides[convId] ?? {};
  __offerOverrides[convId] = {
    stage: patch.stage ?? prev.stage,
    rows: patch.rows ? { ...(prev.rows ?? {}), ...patch.rows } : prev.rows,
    appendedTimeline: patch.appendedTimeline
      ? [...(prev.appendedTimeline ?? []), ...patch.appendedTimeline]
      : prev.appendedTimeline,
  };
  __offerSubscribers.forEach(fn => fn());
}
export function useOfferStashSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __offerSubscribers.add(fn);
    return () => { __offerSubscribers.delete(fn); };
  }, []);
}

// ── Per-conv "My notes" store ──
// TalentBookingTab + ClientProjectViewTab both render a notes
// textarea. Without per-conv keying the same draft showed on every
// conversation. Now keyed by conv.id so each project has its own.
export const __notesStash: Record<string, string> = {};
export const __notesSubscribers = new Set<() => void>();
export function readConvNote(convId: string): string {
  return __notesStash[convId] ?? "";
}
export function writeConvNote(convId: string, text: string): void {
  __notesStash[convId] = text;
  __notesSubscribers.forEach(fn => fn());
}
export function useNotesSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __notesSubscribers.add(fn);
    return () => { __notesSubscribers.delete(fn); };
  }, []);
}

// ── Local message stash ──
// Module-level appendable store of "messages I just sent" keyed by
// thread id (e.g. "c1:talent" / "c7:client" / bare "c1"). Composer
// sends push into this store; thread renderers concat seed +
// stashed when reading. Survives unmount/remount within a session;
// resets on full reload. Lets the demo "send → see your bubble"
// without a backend.
// Sender on a stashed message — supports both "you" (default — sent
// as the individual user) and "workspace" (Phase 4 of System User
// direction — sent on behalf of the workspace, e.g. "Atelier Roma:
// Booking confirmed").
export type StashedMsg = { id: string; body: string; ts: string; sender: "you" | "workspace" };
export const __localMsgStash: Record<string, StashedMsg[]> = {};
export const __msgSubscribers = new Set<() => void>();
export function appendLocalMessage(threadKey: string, body: string, sender: "you" | "workspace" = "you") {
  const trimmed = body.trim();
  if (!trimmed) return;
  const arr = __localMsgStash[threadKey] ?? [];
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  arr.push({ id: `local-${threadKey}-${arr.length + 1}`, body: trimmed, ts: `Just now · ${stamp}`, sender });
  __localMsgStash[threadKey] = arr;
  __msgSubscribers.forEach(fn => fn());
}
export function readLocalMessages(threadKey: string): StashedMsg[] {
  return __localMsgStash[threadKey] ?? [];
}
export function useMessageStashSubscription() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __msgSubscribers.add(fn);
    return () => { __msgSubscribers.delete(fn); };
  }, []);
}

// ── Conv flags store (pinned + manual-unread) ──
// User-curated row state that persists across reloads. Pinning floats
// a conv to the top of the inbox; manual-unread flips the row's seen
// state back to unseen so the user can come back to it later. Both
// signals live in one store keyed by conv id, persisted to
// localStorage so they survive refresh.
//
// Storage keys are user-scoped so that:
//   (a) Two tabs signed in as different users don't stomp each other.
//   (b) Flags from a previous user don't bleed to the next login.
//
// Legacy keys (v1, no user suffix) are read once on first load as a
// migration fallback — users don't lose their pins on the first deploy
// post-upgrade. After ~30 days, strip the fallback read from the IIFE.
export type ConvFlags = { pinned?: boolean; manualUnread?: boolean; archived?: boolean };
export const __FLAGS_LEGACY_KEY = "tulala.proto.convFlags.v1";
export function __flagsStorageKey(): string {
  const uid = getInquiryFlagsUserId();
  return uid ? `tulala_inquiry_flags_v1_${uid}` : __FLAGS_LEGACY_KEY;
}
export const __convFlags: Record<string, ConvFlags> = (() => {
  if (typeof window === "undefined") return {};
  try {
    // Try the user-scoped key first (set after login). Falls back to the
    // legacy global key on first load post-deploy so existing pins survive.
    const uid = getInquiryFlagsUserId();
    const scopedKey = uid ? `tulala_inquiry_flags_v1_${uid}` : null;
    const rawScoped = scopedKey ? window.localStorage.getItem(scopedKey) : null;
    const raw = rawScoped ?? window.localStorage.getItem(__FLAGS_LEGACY_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Record<string, ConvFlags>;
  } catch { return {}; }
})();
export function __persistFlags() {
  if (typeof window === "undefined") return;
  try { window.localStorage.setItem(__flagsStorageKey(), JSON.stringify(__convFlags)); } catch { /* ignore */ }
}
export const __flagsSubscribers = new Set<() => void>();
export function isPinned(id: string): boolean {
  return !!__convFlags[id]?.pinned;
}
export function isManualUnread(id: string): boolean {
  return !!__convFlags[id]?.manualUnread;
}
export function togglePin(id: string) {
  const cur = __convFlags[id] ?? {};
  const next = !cur.pinned;
  __convFlags[id] = { ...cur, pinned: next };
  __persistFlags();
  __flagsSubscribers.forEach(fn => fn());
  // Persist to DB for real inquiry UUIDs. Synthetic mock ids stay
  // local-only so the demo continues to work.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const slug = getInquiryFlagsTenantSlug();
    if (slug) void setInquiryPinned(slug, id, next);
  }
}
export function toggleManualUnread(id: string) {
  const cur = __convFlags[id] ?? {};
  const next = !cur.manualUnread;
  __convFlags[id] = { ...cur, manualUnread: next };
  // When marking manual-unread, also remove from the locally-seen
  // set so the NEW pill / coral wash returns. When clearing, leave
  // locally-seen alone (the user already saw it once).
  if (next) {
    __locallySeenConvs.delete(id);
    __persistSeen();
    __seenSubscribers.forEach(fn => fn());
  }
  __persistFlags();
  __flagsSubscribers.forEach(fn => fn());
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const slug = getInquiryFlagsTenantSlug();
    if (slug) void setInquiryManuallyUnread(slug, id, next);
  }
}
export function archiveInquiry(id: string) {
  // Local archive flag (drives the inbox filter chip "Archived"). Persists
  // to DB for real inquiry UUIDs.
  const cur = __convFlags[id] ?? {};
  const next = !cur.archived;
  __convFlags[id] = { ...cur, archived: next };
  __persistFlags();
  __flagsSubscribers.forEach(fn => fn());
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    const slug = getInquiryFlagsTenantSlug();
    if (slug) void setInquiryArchived(slug, id, next);
  }
}
export function useFlagsSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __flagsSubscribers.add(fn);
    return () => { __flagsSubscribers.delete(fn); };
  }, []);
}
// Sort items so pinned ones float to the top while preserving the
// caller's existing order otherwise. Stable across rerenders.
export function sortPinnedFirst<T extends { id: string }>(items: T[]): T[] {
  // Use a partition to avoid in-place sort allocating; keeps original
  // order within each bucket which matters because filters sort the
  // input by recency / SLA before this point.
  const pinned: T[] = [];
  const rest: T[] = [];
  for (const i of items) {
    if (isPinned(i.id)) pinned.push(i); else rest.push(i);
  }
  return pinned.length === 0 ? items : [...pinned, ...rest];
}

// ── Handoff queue store ──
// Module-level log of coordinator reassignments. When a Reassign
// happens, we push an entry here so the receiving coord sees an
// "Incoming handoff" badge on the affected inbox row + can filter to
// just their incoming queue. Clears when the receiving coord opens
// the row (clearHandoff).
export type HandoffEntry = {
  inquiryId: string;
  fromCoordName: string;
  toCoordName: string;
  note: string;
  ts: number;
};
export const __handoffStash: HandoffEntry[] = [];
export const __handoffSubscribers = new Set<() => void>();
export function recordHandoff(entry: Omit<HandoffEntry, "ts">) {
  __handoffStash.push({ ...entry, ts: Date.now() });
  __handoffSubscribers.forEach(fn => fn());
}
export function clearHandoff(inquiryId: string, toCoordName: string) {
  const before = __handoffStash.length;
  for (let i = __handoffStash.length - 1; i >= 0; i--) {
    const h = __handoffStash[i]!;
    if (h.inquiryId === inquiryId && h.toCoordName === toCoordName) {
      __handoffStash.splice(i, 1);
    }
  }
  if (__handoffStash.length !== before) __handoffSubscribers.forEach(fn => fn());
}
export function getIncomingHandoffs(coordName: string): HandoffEntry[] {
  return __handoffStash.filter(h => h.toCoordName === coordName);
}
export function useHandoffSubscription(): void {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __handoffSubscribers.add(fn);
    return () => { __handoffSubscribers.delete(fn); };
  }, []);
}

// ── Seen-state store ──
// Tracks which "brand-new" conversations the user has opened. Started
// as a session-only Set; now persisted to localStorage so the demo
// doesn't re-pill every fresh session (a row that's been opened stays
// opened). Falls back to in-memory only when localStorage isn't
// available (SSR, private browsing, sandboxed previews).
//
// Storage keys are user-scoped — same rationale as __convFlags above.
// Legacy key (v1, no user suffix) is read once as a migration fallback.
// Strip the fallback read after ~30 days.
export const __SEEN_LEGACY_KEY = "tulala.proto.seenConvs.v1";
export function __seenStorageKey(): string {
  const uid = getInquiryFlagsUserId();
  return uid ? `tulala_inquiry_seen_v1_${uid}` : __SEEN_LEGACY_KEY;
}
export const __locallySeenConvs: Set<string> = (() => {
  if (typeof window === "undefined") return new Set<string>();
  try {
    // Try the user-scoped key first; fall back to legacy on first post-deploy load.
    const uid = getInquiryFlagsUserId();
    const scopedKey = uid ? `tulala_inquiry_seen_v1_${uid}` : null;
    const rawScoped = scopedKey ? window.localStorage.getItem(scopedKey) : null;
    const raw = rawScoped ?? window.localStorage.getItem(__SEEN_LEGACY_KEY);
    if (!raw) return new Set<string>();
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed.filter((x): x is string => typeof x === "string")) : new Set<string>();
  } catch {
    return new Set<string>();
  }
})();
export function __persistSeen() {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(__seenStorageKey(), JSON.stringify(Array.from(__locallySeenConvs)));
  } catch { /* quota / private mode — keep in-memory copy */ }
}
export const __seenSubscribers = new Set<() => void>();
export function markConvSeen(id: string) {
  if (__locallySeenConvs.has(id)) return;
  __locallySeenConvs.add(id);
  __persistSeen();
  __seenSubscribers.forEach(fn => fn());
}
export function isLocallySeen(id: string): boolean {
  return __locallySeenConvs.has(id);
}
export function useSeenSubscription() {
  const [, force] = useState(0);
  useEffect(() => {
    const fn = () => force(n => n + 1);
    __seenSubscribers.add(fn);
    return () => { __seenSubscribers.delete(fn); };
  }, []);
}

/**
 * Pending thread-tab id, paired with pinNextConversation. Lets a caller
 * deep-link not just to the right thread but to the right tab inside
 * it — e.g. Today's "Next on the calendar" pins a booked conversation
 * AND opens the Logistics tab so the talent lands on the call sheet,
 * not the chat. One-shot like the conversation pin.
 */
export let __pendingThreadTab: string | null = null;
export function pinNextThreadTab(tabId: string) { __pendingThreadTab = tabId; }
export function consumePendingThreadTab(): string | null {
  const v = __pendingThreadTab;
  __pendingThreadTab = null;
  return v;
}

/**
 * Inquiry RI-* → talent/client conversation cN. Centralized so every
 * caller routing into the message shell (Today rows, calendar marks,
 * workspace inbox, talent inbox, etc.) maps consistently. Wrapped/
 * past inquiries still resolve — the shell renders read-only stages.
 */
export const INQUIRY_TO_CONV_GLOBAL: Record<string, string> = {
  "RI-201": "c1",  // Mango spring lookbook
  "RI-202": "c3",  // Vogue Italia
  "RI-203": "c2",  // Bvlgari jewelry
  "RI-204": "c1",  // Estudio Roca
  "RI-205": "c2",  // Valentino SS26
  "RI-207": "c5",  // H&M past
};

/**
 * One-call helper: pin the matching conversation and return the page
 * setter the caller should pair with. Use like:
 *   const route = useInquiryRoute();
 *   route(inquiryId, "talent")  // or "client" or "admin"
 * The drawer-based legacy `openDrawer("inquiry-workspace", ...)` is
 * deprecated; this is the single replacement.
 */
export function routeToInquiry(
  inquiryId: string,
  pov: "talent" | "client" | "admin",
  setPageFns: { setTalentPage?: (p: string) => void; setClientPage?: (p: string) => void; setPage?: (p: string) => void },
) {
  // Resolve to a conv id when possible — talent + client shells are
  // keyed by cN, the admin shell handles RI-* directly via reverse map.
  const convId = INQUIRY_TO_CONV_GLOBAL[inquiryId] ?? inquiryId;
  pinNextConversation(convId);
  if (pov === "talent") setPageFns.setTalentPage?.("messages");
  else if (pov === "client") setPageFns.setClientPage?.("messages");
  else setPageFns.setPage?.("messages");
}
