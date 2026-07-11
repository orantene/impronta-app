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

import { useCallback, useRef, useState, useTransition, type MutableRefObject } from "react";

import { saveOfferDraft, type OfferDraftSnapshot } from "@/app/(workspace)/[tenantSlug]/admin/_pipeline-actions";
import { createClient as createSupabaseBrowserClient } from "@/lib/supabase/client";

import { classifySaveError, type OfferSaveState } from "./offer-save-state";
import { writeOfferSnapshot, clearOfferSnapshot } from "./offer-local-snapshot";

export function useOfferSave(args: {
  tenantSlug: string;
  offerId: string;
  snapshotRef: MutableRefObject<OfferDraftSnapshot | null>;
  reload: () => void;
}) {
  const { tenantSlug, offerId, snapshotRef, reload } = args;
  const [saveState, setSaveState] = useState<OfferSaveState>({ status: "idle" });
  const [pending, startTransition] = useTransition();
  // Line count + total of the LAST SUCCESSFUL server save — the send gate
  // compares these against the live editor to block sending unsaved edits.
  const lastSavedRef = useRef<{ lineCount: number; total: number } | null>(null);

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
    lastSavedRef.current = { lineCount, total };
    clearOfferSnapshot(offerId);
    setSaveState({ status: "saved", at: Date.now() });
    reload();
  }, [tenantSlug, offerId, snapshotRef, reload]);

  const save = useCallback(() => {
    startTransition(() => {
      void runSave();
    });
  }, [runSave]);

  return { saveState, setSaveState, save, pending, lastSavedRef, runSave };
}
