"use client";

/**
 * useUnifiedInquiry — the single-record patch hook for the unified inquiry cart
 * + live chat surface (Message Impronta plan §5.4 / P0-T4).
 *
 * One inquiry record backs the whole chat panel. Every structured edit (typed in
 * the guided chat OR set in the in-panel form / chips / All-details sheet) routes
 * through this hook's `patch()`, which:
 *
 *   1. LAZILY creates the early-partial inquiry row on the FIRST structured commit
 *      (first talent add OR first chip set) via `ensureGuestChatInquiry` — never on
 *      a bare panel open, so browsers that only peek never create a row. A single
 *      in-flight guard prevents the double-creation race (§10).
 *   2. Writes the field through the extended, cookie-gated `captureGuestChip`
 *      action (interpreted_query + flat columns + a gentle inquiry_details_updated
 *      system note). No allowlist / RLS / migration change (LOCKED #5).
 *   3. Debounces writes ~350ms per field so rapid typing collapses to one write.
 *   4. Tracks a panel-level `syncState` ("idle"|"saving"|"saved"|"error") and a
 *      per-field `fieldState` map (keyed by patch kind) for the field-level
 *      micro-status (B.4).
 *
 * Inbound: the guest surface relies on the row-scoped channel in
 * useGuestDetailReconcile; the broad tenant-wide `useInquiryRealtime` is gated
 * behind `enableTenantRealtime` (OFF for guests, ON for admin/talent shells). A
 * remote edit re-pulls server data; the panel passes the freshly-loaded details
 * back in via `serverIntent`, which this hook reconciles into the exposed `intent`
 * (local optimistic edits win until their write settles, then server wins).
 *
 * Boundaries this hook respects:
 *   • It NEVER imports inquiry-permissions.ts (the guest write path is not the
 *     assertCanPerform allowlist).
 *   • It NEVER touches favorites.
 *   • It builds NO InquiryIntent for submit — it only maintains the live draft
 *     `intent` the panel renders; full submit stays with ContactCard /
 *     startGuestChatInquiry (§6.2).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useInquiryRealtime } from "@/hooks/use-inquiry-realtime";
import { trackDraftCreated, trackFieldFilled } from "@/lib/analytics/jon360-funnel-events";
import type { InquiryIntent } from "@/lib/inquiry/inquiry-intent";
import type {
  CaptureGuestChipCallback,
  EnsureGuestInquiryInput,
  EnsureGuestInquiryResult,
  GuestChipInput,
  GuestChipValue,
} from "@/lib/inquiry/guest-chat-contract";

// ─────────────────────────────────────────────────────────────────────────────
// Public contract — §5.4. Keep these shapes EXACT; other phases compile to them.
// ─────────────────────────────────────────────────────────────────────────────

export type UnifiedInquiryPatch =
  | { kind: "talent"; selectedIds: string[]; selectionMode?: "i_know_who" | "agency_recommends"; selectedNames?: string[] }
  | { kind: "brief"; summary: string }
  | { kind: "date"; status?: string; eventDate?: string | null }
  | { kind: "location"; status?: string; city?: string | null; eventLocation?: string | null }
  | { kind: "headcount"; count: number | null }
  | { kind: "event_type"; eventTypeLabel: string }
  | { kind: "budget"; preference: string; amount?: number | null; currency?: string }
  | { kind: "contact"; name?: string | null; email?: string | null; phone?: string | null };

export type UnifiedSyncState = "idle" | "saving" | "saved" | "error";

export type UseUnifiedInquiryResult = {
  /** The single inquiry record id, or null until the first structured commit. */
  inquiryId: string | null;
  /**
   * Whether the inquiry's contact is REAL (the guest supplied name/email via the
   * ContactCard gate) vs the synthetic early-row seed
   * (contact_email like "pending-…@guest.impronta"). Backed by the
   * `contactPromoted` flag the server returns from ensureGuestChatInquiry — the
   * client never string-matches the placeholder. False until promotion; flips to
   * true after a successful contact patch. Drives the send-gate (finding #1).
   */
  contactPromoted: boolean;
  /** The reconciled live draft (optimistic local edits merged with server data). */
  intent: InquiryIntent;
  /** Debounced ~350ms; ensures the early row exists first, then writes the field. */
  patch: (p: UnifiedInquiryPatch) => Promise<void>;
  /**
   * Promote the synthetic early-row contact to real values (name/email/phone) and
   * AWAIT the write. Unlike patch() this is not debounced — the caller (ContactCard
   * gate / first send) needs the contact persisted before sending the first
   * message. Flips contactPromoted to true on success. Returns ok.
   */
  promoteContact: (value: {
    name: string;
    email: string;
    phone?: string | null;
  }) => Promise<boolean>;
  /** Panel-level sync status for the sync bar (B.4). */
  syncState: UnifiedSyncState;
  /** Per-field status keyed by patch kind, for the field-level micro-status (B.4). */
  fieldState: Record<string, UnifiedSyncState>;
};

// ─────────────────────────────────────────────────────────────────────────────
// Hook args — the panel injects the two server actions (it imports no backend
// module) plus the context needed to ensure the early row and to subscribe to
// the right realtime channel.
// ─────────────────────────────────────────────────────────────────────────────

export type UseUnifiedInquiryArgs = {
  /** Tenant slug from the surface (drives ensureGuestChatInquiry). */
  tenantSlug: string;
  /** Tenant uuid for the realtime channel filter. Null = no inbound push. */
  tenantId?: string | null;
  /** The talent whose page hosts the panel, when on a talent profile. */
  talentProfileId?: string | null;
  talentProfileCode?: string | null;
  /** Attribution page (e.g. "/directory" or "/t/TA-12345"). */
  sourcePage: string;

  /**
   * An already-resolved inquiry id (returning guest resumed by a server
   * component). When present, patches skip the ensure step and target it.
   */
  existingInquiryId?: string | null;

  /**
   * The latest server-loaded details for this inquiry, in InquiryIntent shape.
   * Re-supplied by the panel after a realtime-driven router.refresh() so this
   * hook can reconcile inbound changes into `intent`. Optional — when omitted
   * the hook keeps only its own optimistic draft.
   */
  serverIntent?: InquiryIntent | null;

  /** INJECTED server actions — the hook imports no backend module. */
  ensureInquiry: (input: EnsureGuestInquiryInput) => Promise<EnsureGuestInquiryResult>;
  onCaptureChip: CaptureGuestChipCallback;

  /**
   * Open the 4 tenant-WIDE realtime channels (inquiries / messages / offers /
   * transactions) that refresh on ANY row change for the whole tenant. Defaults
   * to FALSE: the guest chat surface owns exactly ONE inquiry and gets its inbound
   * updates from the row-scoped channel in useGuestDetailReconcile, so the broad
   * tenant subscription would only be a cross-inquiry refresh amplifier. Pass true
   * only from the admin / talent shells that legitimately watch the whole tenant.
   */
  enableTenantRealtime?: boolean;

  /** Autosave debounce. Defaults to 350ms (plan exact value). */
  debounceMs?: number;
};

const DEFAULT_DEBOUNCE_MS = 350;
const SAVED_AUTO_HIDE_MS = 1600;
const EMPTY_INTENT: InquiryIntent = { source: "public_talent_profile", requester: {} };

// ─────────────────────────────────────────────────────────────────────────────
// Patch → InquiryIntent merge (local optimistic draft) + patch → GuestChipInput
// (the wire shape captureGuestChip already accepts). Both are pure helpers.
// ─────────────────────────────────────────────────────────────────────────────

/** Apply one patch onto the local draft intent (immutable). */
function mergePatchIntoIntent(intent: InquiryIntent, p: UnifiedInquiryPatch): InquiryIntent {
  switch (p.kind) {
    case "talent":
      return {
        ...intent,
        talent: {
          ...intent.talent,
          selected_ids: p.selectedIds,
          selection_mode:
            p.selectionMode ?? (p.selectedIds.length > 0 ? "i_know_who" : "agency_recommends"),
        },
      };
    case "brief":
      return { ...intent, brief: { ...intent.brief, summary: p.summary } };
    case "date":
      return {
        ...intent,
        date: {
          ...intent.date,
          ...(p.status ? { status: p.status as NonNullable<InquiryIntent["date"]>["status"] } : {}),
          ...(p.eventDate !== undefined ? { event_date: p.eventDate ?? undefined } : {}),
        },
      };
    case "location":
      return {
        ...intent,
        location: {
          ...intent.location,
          ...(p.status
            ? { status: p.status as NonNullable<InquiryIntent["location"]>["status"] }
            : {}),
          ...(p.city !== undefined ? { city: p.city ?? undefined } : {}),
        },
      };
    case "headcount":
      return {
        ...intent,
        talent: { ...intent.talent, count_needed: p.count ?? undefined },
      };
    case "event_type":
      return {
        ...intent,
        source_context: { ...intent.source_context, ai_event_type: p.eventTypeLabel },
      };
    case "budget":
      return {
        ...intent,
        budget: {
          ...intent.budget,
          preference: p.preference as NonNullable<InquiryIntent["budget"]>["preference"],
          ...(p.amount !== undefined ? { amount: p.amount ?? undefined } : {}),
          ...(p.currency ? { currency: p.currency } : {}),
        },
      };
    case "contact":
      return {
        ...intent,
        requester: {
          ...intent.requester,
          ...(p.name != null ? { name: p.name } : {}),
          ...(p.email != null ? { email: p.email } : {}),
          ...(p.phone != null ? { phone: p.phone } : {}),
        },
      };
    default:
      return intent;
  }
}

/**
 * Translate a UnifiedInquiryPatch into the GuestChipValue the extended
 * captureGuestChip action already accepts. The `kind` carries straight across;
 * the value object is the per-kind subset captureGuestChip reads.
 */
function patchToChipValue(p: UnifiedInquiryPatch): GuestChipValue {
  switch (p.kind) {
    case "talent":
      return {
        selectedIds: p.selectedIds,
        selectionMode: p.selectionMode ?? null,
        selectedNames: p.selectedNames ?? null,
      };
    case "brief":
      return { summary: p.summary };
    case "date":
      return {
        dateStatus: (p.status as GuestChipValue["dateStatus"]) ?? undefined,
        eventDate: p.eventDate ?? null,
      };
    case "location":
      return {
        locationStatus: (p.status as GuestChipValue["locationStatus"]) ?? undefined,
        city: p.city ?? null,
      };
    case "headcount":
      return { headcount: p.count };
    case "event_type":
      return { eventType: p.eventTypeLabel };
    case "budget":
      return {
        budgetPreference: (p.preference as GuestChipValue["budgetPreference"]) ?? undefined,
        budgetAmount: p.amount ?? null,
        currency: p.currency ?? null,
      };
    case "contact":
      return {
        contactName: p.name ?? null,
        contactEmail: p.email ?? null,
        contactPhone: p.phone ?? null,
      };
    default:
      return {};
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Hook
// ─────────────────────────────────────────────────────────────────────────────

export function useUnifiedInquiry(args: UseUnifiedInquiryArgs): UseUnifiedInquiryResult {
  const {
    tenantSlug,
    tenantId,
    talentProfileId,
    talentProfileCode,
    sourcePage,
    existingInquiryId,
    serverIntent,
    ensureInquiry,
    onCaptureChip,
    enableTenantRealtime = false,
    debounceMs = DEFAULT_DEBOUNCE_MS,
  } = args;

  const [inquiryId, setInquiryId] = useState<string | null>(existingInquiryId ?? null);
  const [localIntent, setLocalIntent] = useState<InquiryIntent>(serverIntent ?? EMPTY_INTENT);
  const [syncState, setSyncState] = useState<UnifiedSyncState>("idle");
  const [fieldState, setFieldState] = useState<Record<string, UnifiedSyncState>>({});
  // Real-contact flag (see UseUnifiedInquiryResult.contactPromoted). A returning
  // guest resumed with an existing id may already be promoted; ensureGuestChatInquiry
  // reports the true state, so we treat an injected existingInquiryId as promoted
  // (it was created through the real start path) and let ensure() correct it.
  const [contactPromoted, setContactPromoted] = useState<boolean>(Boolean(existingInquiryId));

  // Subscribe to the tenant-wide realtime channels so remote edits drive a
  // refresh. Gated: the guest chat surface leaves this OFF and relies on the
  // row-scoped channel in useGuestDetailReconcile (no cross-inquiry refresh
  // storm). Only admin / talent shells that watch the whole tenant pass true.
  useInquiryRealtime(enableTenantRealtime ? tenantId ?? null : null);

  // Keep the live `inquiryId` in sync if the panel later resolves one.
  useEffect(() => {
    if (existingInquiryId && existingInquiryId !== inquiryId) {
      setInquiryId(existingInquiryId);
    }
  }, [existingInquiryId, inquiryId]);

  // ── Refs for stable closures inside debounced timers ──────────────────────
  // Synced from props/state in an effect (never mutated during render) so the
  // debounced timer + single-flight callbacks always read the latest values.
  const inquiryIdRef = useRef<string | null>(inquiryId);
  const ensureInquiryRef = useRef(ensureInquiry);
  const onCaptureChipRef = useRef(onCaptureChip);
  useEffect(() => {
    inquiryIdRef.current = inquiryId;
    ensureInquiryRef.current = ensureInquiry;
    onCaptureChipRef.current = onCaptureChip;
  }, [inquiryId, ensureInquiry, onCaptureChip]);

  // Single-flight guard for the early-row create (avoids the double-create race).
  const ensurePromiseRef = useRef<Promise<string | null> | null>(null);

  // Phase 0c CRO — live lineup size, kept in a ref so the frozen ensureInquiryId
  // closure reads the current count when it fires draft_created.
  const lineupCountRef = useRef<number>(0);
  useEffect(() => {
    lineupCountRef.current = localIntent.talent?.selected_ids?.length ?? 0;
  }, [localIntent]);

  // Per-field debounce timers + the latest pending patch for each field kind,
  // so rapid edits to one field collapse to a single write of the LAST value.
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const pendingRef = useRef<Record<string, UnifiedInquiryPatch>>({});
  // Saved-state auto-hide timers, cleared on unmount.
  const savedTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cleanup every timer on unmount.
  useEffect(() => {
    const timers = timersRef.current;
    const savedTimers = savedTimersRef.current;
    return () => {
      for (const t of Object.values(timers)) clearTimeout(t);
      for (const t of Object.values(savedTimers)) clearTimeout(t);
    };
  }, []);

  /** Lazily create (or resume) the early-partial row exactly once. */
  const ensureInquiryId = useCallback(async (): Promise<string | null> => {
    if (inquiryIdRef.current) return inquiryIdRef.current;
    if (ensurePromiseRef.current) return ensurePromiseRef.current;

    const run = (async () => {
      const result = await ensureInquiryRef.current({
        tenantSlug,
        talentProfileId: talentProfileId ?? null,
        talentProfileCode: talentProfileCode ?? null,
        sourcePage,
      });
      if (result.ok) {
        inquiryIdRef.current = result.inquiryId;
        setInquiryId(result.inquiryId);
        // Adopt the server's authoritative contact state (resumed rows may
        // already be promoted; fresh early rows carry the synthetic seed).
        if (result.contactPromoted) setContactPromoted(true);
        // Phase 0c CRO — draft_created on the FIRST structured commit. This path
        // runs only when no id existed (resumed rows arrive via existingInquiryId
        // and short-circuit above), so it marks a genuine early-row creation.
        trackDraftCreated({
          inquiryId: result.inquiryId,
          tenantId: tenantId ?? null,
          lineupCount: lineupCountRef.current,
          source: sourcePage,
        });
        return result.inquiryId;
      }
      return null;
    })();

    ensurePromiseRef.current = run;
    try {
      return await run;
    } finally {
      ensurePromiseRef.current = null;
    }
  }, [tenantSlug, talentProfileId, talentProfileCode, sourcePage, tenantId]);

  /** Mark a single field's status and recompute the panel-level sync state. */
  const setField = useCallback((kind: string, state: UnifiedSyncState) => {
    setFieldState((prev) => {
      const next = { ...prev, [kind]: state };
      // Panel-level rollup: any saving wins, else any error, else any saved.
      const values = Object.values(next);
      const rollup: UnifiedSyncState = values.includes("saving")
        ? "saving"
        : values.includes("error")
          ? "error"
          : values.includes("saved")
            ? "saved"
            : "idle";
      setSyncState(rollup);
      return next;
    });
  }, []);

  /** Flush the latest pending patch for one field kind to the backend. */
  const flushField = useCallback(
    async (kind: string) => {
      const p = pendingRef.current[kind];
      if (!p) return;
      delete pendingRef.current[kind];

      setField(kind, "saving");

      // Clear any pending "saved" auto-hide for this field — we're saving again.
      if (savedTimersRef.current[kind]) {
        clearTimeout(savedTimersRef.current[kind]);
        delete savedTimersRef.current[kind];
      }

      const id = await ensureInquiryId();
      if (!id) {
        setField(kind, "error");
        return;
      }

      const chipInput: GuestChipInput = {
        inquiryId: id,
        kind: p.kind,
        value: patchToChipValue(p),
      };

      const result = await onCaptureChipRef.current(chipInput);
      if (result.ok) {
        setField(kind, "saved");
        // Phase 0c CRO — field_filled per committed structured field (the `kind`
        // identifies which: talent / brief / date / location / budget / ...).
        // Contact promotion has its own promoteContact path + conversion event,
        // so it is excluded here to avoid double-counting the gate.
        if (kind !== "contact") {
          trackFieldFilled(
            {
              inquiryId: id,
              tenantId: tenantId ?? null,
              lineupCount: lineupCountRef.current,
              source: sourcePage,
            },
            kind,
          );
        }
        savedTimersRef.current[kind] = setTimeout(() => {
          delete savedTimersRef.current[kind];
          setField(kind, "idle");
        }, SAVED_AUTO_HIDE_MS);
      } else {
        // Version-conflict / write failure — surface "error" and keep the value
        // editable. The panel renders the retry affordance (B.4).
        setField(kind, "error");
      }
    },
    [ensureInquiryId, setField, tenantId, sourcePage],
  );

  /**
   * patch — optimistic local update + debounced (~350ms) write per field kind.
   * The first structured commit lazily creates the early row inside flushField.
   */
  const patch = useCallback(
    async (p: UnifiedInquiryPatch): Promise<void> => {
      // Optimistic draft update so the UI reflects the edit immediately.
      setLocalIntent((prev) => mergePatchIntoIntent(prev, p));

      // Coalesce to the latest value for this field kind.
      pendingRef.current[p.kind] = p;
      setField(p.kind, "saving");

      if (timersRef.current[p.kind]) clearTimeout(timersRef.current[p.kind]);
      timersRef.current[p.kind] = setTimeout(() => {
        delete timersRef.current[p.kind];
        void flushField(p.kind);
      }, debounceMs);
    },
    [debounceMs, flushField, setField],
  );

  /**
   * promoteContact — overwrite the synthetic early-row contact with REAL values
   * and await the write (not debounced). Ensures the row exists first, then sends
   * the contact chip so the flat contact_name/contact_email columns + requester
   * are patched. Flips contactPromoted on success so the send-gate stops forcing
   * the ContactCard. This is the guest-safe promotion path (reuses the existing
   * captureGuestChip kind:"contact").
   */
  const promoteContact = useCallback(
    async (value: { name: string; email: string; phone?: string | null }): Promise<boolean> => {
      // Optimistic draft so the requester reflects immediately.
      setLocalIntent((prev) =>
        mergePatchIntoIntent(prev, {
          kind: "contact",
          name: value.name,
          email: value.email,
          phone: value.phone ?? null,
        }),
      );
      setField("contact", "saving");

      const id = await ensureInquiryId();
      if (!id) {
        setField("contact", "error");
        return false;
      }

      const result = await onCaptureChipRef.current({
        inquiryId: id,
        kind: "contact",
        value: {
          contactName: value.name,
          contactEmail: value.email,
          contactPhone: value.phone ?? null,
        },
      });
      if (result.ok) {
        setContactPromoted(true);
        setField("contact", "saved");
        savedTimersRef.current.contact = setTimeout(() => {
          delete savedTimersRef.current.contact;
          setField("contact", "idle");
        }, SAVED_AUTO_HIDE_MS);
        return true;
      }
      setField("contact", "error");
      return false;
    },
    [ensureInquiryId, setField],
  );

  // ── Inbound reconcile ─────────────────────────────────────────────────────
  // When the panel re-supplies server-loaded details (after a realtime refresh),
  // adopt them as the base, but let any field still mid-flight keep its local
  // optimistic value so an in-progress edit isn't clobbered by a stale read.
  useEffect(() => {
    if (!serverIntent) return;
    setLocalIntent((prev) => {
      const inFlight = new Set([
        ...Object.keys(pendingRef.current),
        ...Object.keys(timersRef.current),
      ]);
      if (inFlight.size === 0) return serverIntent;
      // Re-apply in-flight local fields on top of the fresh server base.
      let merged = serverIntent;
      if (inFlight.has("talent") && prev.talent) merged = { ...merged, talent: prev.talent };
      if (inFlight.has("headcount") && prev.talent) {
        merged = { ...merged, talent: { ...merged.talent, count_needed: prev.talent.count_needed } };
      }
      if (inFlight.has("brief") && prev.brief) merged = { ...merged, brief: prev.brief };
      if (inFlight.has("date") && prev.date) merged = { ...merged, date: prev.date };
      if (inFlight.has("location") && prev.location) merged = { ...merged, location: prev.location };
      if (inFlight.has("budget") && prev.budget) merged = { ...merged, budget: prev.budget };
      if (inFlight.has("event_type") && prev.source_context) {
        merged = { ...merged, source_context: prev.source_context };
      }
      if (inFlight.has("contact") && prev.requester) {
        merged = { ...merged, requester: prev.requester };
      }
      return merged;
    });
  }, [serverIntent]);

  const intent = useMemo(() => localIntent, [localIntent]);

  return { inquiryId, contactPromoted, intent, patch, promoteContact, syncState, fieldState };
}
