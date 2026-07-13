"use client";

/**
 * useOfferSave — W0 save orchestration for the offer draft editor, extracted so
 * machinery-11 stays under the 800-line admin-shell cap and the save-state logic
 * is isolated + reasoned in one place.
 *
 * It owns the save-state machine (idle → saving → saved | error), the
 * last-successful-save baseline (for the send gate), and the auth-recovery path
 * (local snapshot + silent session refresh + one retry) so an expired session
 * can never eat a coordinator's offer (2026-07-11 prod audit).
 */

import { useCallback, useEffect, useMemo, useState, useTransition, type MutableRefObject } from "react";

import { saveOfferDraft, type OfferDraftSnapshot } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";

import { canSendOffer, classifySaveError, type OfferSaveState, type SendGateResult } from "./offer-save-state";
import { writeOfferSnapshot, clearOfferSnapshot } from "./offer-local-snapshot";

export function useOfferSave(args: {
  tenantSlug: string;
  offerId: string;
  snapshotRef: MutableRefObject<OfferDraftSnapshot | null>;
  reload: () => void;
  /** Live line count of the editor (drives the send gate). */
  editorLineCount: number;
  /** Live sum of the editor's line totals (drives the send gate). */
  editorTotal: number;
  /** True once the server draft has loaded — seeds the send-gate baseline. */
  loaded: boolean;
  /** Reported the resolved send gate up to the parent (which renders Send). */
  onSendGateChange?: (gate: SendGateResult) => void;
}) {
  const { tenantSlug, offerId, snapshotRef, reload, editorLineCount, editorTotal, loaded, onSendGateChange } = args;
  const [saveState, setSaveState] = useState<OfferSaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  // Line count + total of the LAST SUCCESSFUL server save — the send gate
  // compares these against the live editor to block sending unsaved edits. Held
  // as STATE (not a ref) so the gate can read it during render without the
  // react-hooks/refs violation.
  const [lastSaved, setLastSaved] = useState<{ lineCount: number; total: number } | null>(null);

  // Seed the baseline from the first server-loaded draft so an unchanged,
  // already-persisted offer counts as "saved" (otherwise lastSaved only tracks
  // saves made in THIS editor session, so a freshly-loaded draft reads as
  // unsaved and wrongly blocks Send). This is the React-sanctioned "adjust state
  // during render" pattern — guarded so it runs exactly once and never loops.
  if (loaded && lastSaved == null) {
    setLastSaved({ lineCount: editorLineCount, total: editorTotal });
  }

  const runSave = useCallback(async () => {
    const snap = snapshotRef.current;
    if (!snap) return;
    const lineCount = snap.lineItems.length;
    const total = snap.lineItems.reduce((sum, li) => sum + (Number(li.totalPrice) || 0), 0);
    const lineItems = snap.lineItems.map((li, idx) => ({
      talent_profile_id: li.talentProfileId,
      label: li.label,
      pricing_unit: li.pricingUnit,
      units: li.units,
      unit_price: li.unitPrice,
      total_price: li.totalPrice,
      talent_cost: li.talentCost,
      notes: li.notes,
      sort_order: idx,
      source_service_id: li.sourceServiceId,
    }));
    const doSave = () =>
      saveOfferDraft(tenantSlug, offerId, {
        inquiryExpectedVersion: snap.inquiryVersion,
        offerExpectedVersion: snap.offerVersion,
        totalClientPrice: total,
        coordinatorFee: snap.coordinatorFee,
        currencyCode: snap.currencyCode,
        notes: snap.notes,
        lineItems,
      });

    setSaveState({ status: "saving" });
    let r = await doSave();

    // Auth-shaped failure → protect the work, then try to recover in place.
    if (!r.ok && classifySaveError(r.error).kind === "auth") {
      writeOfferSnapshot(offerId, { total, lineCount, data: snap });
      try {
        const sb = createSupabaseBrowserClient();
        if (sb) {
          await sb.auth.refreshSession();
          r = await doSave(); // one retry after refresh
        }
      } catch {
        /* refresh failed — banner shows the auth message; snapshot is safe */
      }
    }

    if (!r.ok) {
      setSaveState({ status: "error", cls: classifySaveError(r.error), rawError: r.error ?? "" });
      return;
    }
    setLastSaved({ lineCount, total });
    clearOfferSnapshot(offerId);
    setSaveState({ status: "saved", at: Date.now() });
    reload();
  }, [tenantSlug, offerId, snapshotRef, reload]);

  const save = useCallback(() => {
    startTransition(() => {
      void runSave();
    });
  }, [runSave]);

  // W0-3 — resolve the send gate from the live editor vs. the last-saved
  // baseline. All inputs are reactive state/props, so the memo recomputes
  // exactly when the gate can change (a save flips saveState + lastSaved; an
  // edit moves editorLineCount/editorTotal).
  const sendGate = useMemo<SendGateResult>(
    () =>
      canSendOffer({
        state: saveState,
        editorLineCount,
        editorTotal,
        lastSavedLineCount: lastSaved?.lineCount ?? null,
        lastSavedTotal: lastSaved?.total ?? null,
      }),
    [saveState, editorLineCount, editorTotal, lastSaved],
  );

  // Report the gate up to the component that renders the Send button. Gated on
  // `loaded` so a still-loading editor doesn't flash a misleading "empty"
  // reason before its line items arrive (parent defaults to enabled until then).
  useEffect(() => {
    if (loaded) onSendGateChange?.(sendGate);
  }, [sendGate, loaded, onSendGateChange]);

  return { saveState, setSaveState, save, pending, runSave, sendGate };
}
