"use client";

/**
 * useCounterCustomer — C06–C10's state and the sheet that renders it, kept
 * beside the page because it is wiring (search → pick / draft → attach at
 * collection), not a design screen of its own.
 *
 * THE BUYER IS NAMED ON THE SALE, NOT INSERTED HERE. `startCollection`
 * attaches the customer through `ensureCustomer`, idempotent on (tenant,
 * email) and (tenant, phone), so what this hook holds is the name and
 * contact the charge will send. Picking a hit copies that row's own contact
 * details, which is what resolves the collection back to the same customer
 * instead of inserting a second one (C10's rule).
 *
 * The duplicate warning on the create form is a search on the typed phone or
 * email: the same phone would resolve to the same row at collection anyway,
 * and saying so up front stops the cashier typing a second Laura.
 */

import { useCallback, useState, type ReactElement } from "react";

import { CustomerSheet, type CustomerDraft, type CustomerSheetCopy, type PosAttachedCustomer } from "@/components/admin/pos";

import { posSearchCustomers, type PosCustomerHit } from "./actions";

const EMPTY_DRAFT: CustomerDraft = { name: "", phone: "", email: "" };

export type CounterCustomer = {
  readonly attached: PosAttachedCustomer | null;
  /** The contact the charge sends: the attached row's, or the draft's. */
  readonly email: string;
  readonly phone: string;
  readonly displayName: string | undefined;
  readonly open: () => void;
  readonly reset: () => void;
  readonly sheet: ReactElement;
};

export function useCounterCustomer(copy: CustomerSheetCopy): CounterCustomer {
  const [isOpen, setOpen] = useState(false);
  const [view, setView] = useState<"search" | "create" | "failed">("search");
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<PosCustomerHit[]>([]);
  const [attached, setAttached] = useState<PosAttachedCustomer | null>(null);
  const [draft, setDraft] = useState<CustomerDraft>(EMPTY_DRAFT);
  const [duplicate, setDuplicate] = useState<PosAttachedCustomer | null>(null);
  const [failed, setFailed] = useState<PosAttachedCustomer | null>(null);

  const search = useCallback((value: string) => {
    setQuery(value);
    void posSearchCustomers(value).then((result) => {
      setHits(result.ok && "rows" in result ? result.rows : []);
    });
  }, []);

  const pick = useCallback(
    (customerId: string) => {
      const hit = hits.find((row) => row.id === customerId) ?? duplicate;
      if (!hit || hit.id !== customerId) {
        // The row vanished between render and tap. Never invent a second
        // customer for the same person: say the attach did not take.
        setFailed(attached ?? { id: customerId, displayName: draft.name || query });
        setView("failed");
        return;
      }
      setAttached({ id: hit.id, displayName: hit.displayName, email: hit.email, phone: hit.phone });
      setDraft(EMPTY_DRAFT);
      setDuplicate(null);
      setFailed(null);
      setOpen(false);
      setView("search");
    },
    [attached, draft.name, duplicate, hits, query],
  );

  const changeDraft = useCallback((next: CustomerDraft) => {
    setDraft(next);
    setDuplicate(null);
    const probe = next.phone.trim().length >= 6 ? next.phone.trim() : next.email.trim().length >= 5 ? next.email.trim() : "";
    if (!probe) return;
    void posSearchCustomers(probe).then((result) => {
      if (!result.ok || !("rows" in result)) return;
      const match = result.rows.find(
        (row) =>
          (next.phone.trim() && row.phone && row.phone.replace(/\D/g, "").endsWith(next.phone.replace(/\D/g, "").slice(-7))) ||
          (next.email.trim() && row.email && row.email.toLowerCase() === next.email.trim().toLowerCase()),
      );
      setDuplicate(match ?? null);
    });
  }, []);

  const saveDraft = useCallback(() => {
    // A walk-in becomes a named customer the moment money is collected; the
    // three fields ride on the sale until then (see the header comment).
    setAttached({
      id: `draft:${draft.email.trim() || draft.phone.trim()}`,
      displayName: draft.name.trim(),
      email: draft.email.trim() || null,
      phone: draft.phone.trim() || null,
    });
    setOpen(false);
    setView("search");
  }, [draft]);

  const walkIn = useCallback(() => {
    setAttached(null);
    setDraft(EMPTY_DRAFT);
    setDuplicate(null);
    setFailed(null);
    setOpen(false);
    setView("search");
  }, []);

  const reset = useCallback(() => {
    walkIn();
    setQuery("");
    setHits([]);
  }, [walkIn]);

  const open = useCallback(() => {
    setView(failed ? "failed" : "search");
    setOpen(true);
  }, [failed]);

  const sheet = (
    <CustomerSheet
      open={isOpen}
      view={view}
      onViewChange={(next) => {
        if (next === "create" && !draft.name && query.trim()) setDraft({ ...EMPTY_DRAFT, name: query.trim() });
        setView(next);
      }}
      onClose={() => setOpen(false)}
      query={query}
      onQueryChange={search}
      hits={hits}
      onPick={pick}
      onWalkIn={walkIn}
      draft={draft}
      onDraftChange={changeDraft}
      duplicate={duplicate}
      onUseDuplicate={pick}
      onDismissDuplicate={() => setDuplicate(null)}
      onSaveDraft={saveDraft}
      failed={failed}
      onRetryAttach={() => {
        if (failed) setAttached(failed);
        setFailed(null);
        setOpen(false);
        setView("search");
      }}
      copy={copy}
    />
  );

  return {
    attached,
    email: attached?.email ?? "",
    phone: attached?.phone ?? "",
    displayName: attached?.displayName || undefined,
    open,
    reset,
    sheet,
  };
}
