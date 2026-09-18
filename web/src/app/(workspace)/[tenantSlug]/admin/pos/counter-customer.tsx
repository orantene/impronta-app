"use client";

/**
 * useCounterCustomer — C06–C10's state and the sheet that renders it, kept
 * beside the page because it is wiring (search → pick / draft → attach at
 * collection), not a design screen of its own.
 *
 * THE BUYER IS NAMED ON THE SALE, NOT INSERTED HERE. Saving or picking a
 * buyer hands it to `options.attach` (D-170: `posAttachCustomer`, which
 * writes `orders.customer_id` on the open draft through `ensureCustomer`,
 * idempotent on (tenant, email) and (tenant, phone), so a promo code can be
 * applied before the charge); `startCollection` attaches through the same
 * `ensureCustomer` for a sale that opens later, so what this hook holds is
 * the name and contact the charge will send. Picking a hit copies that
 * row's own contact details, which is what resolves the collection back to
 * the same customer instead of inserting a second one (C10's rule).
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

/** The buyer as the sale should carry it: a picked row's id, or the draft's contact. */
export type CounterBuyer = {
  readonly customerId: string | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly displayName: string | null;
};

export type CounterCustomerOptions = {
  /** Write the buyer on the open sale. Resolves false when the attach did not take. */
  readonly attach?: (buyer: CounterBuyer) => Promise<boolean>;
};

export function useCounterCustomer(copy: CustomerSheetCopy, options: CounterCustomerOptions = {}): CounterCustomer {
  const { attach } = options;
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
      const picked = { id: hit.id, displayName: hit.displayName, email: hit.email, phone: hit.phone };
      setAttached(picked);
      setDraft(EMPTY_DRAFT);
      setDuplicate(null);
      setFailed(null);
      setOpen(false);
      setView("search");
      // C10: an attach that did not take is retried with the SAME id.
      void attach?.({ customerId: hit.id, email: hit.email ?? null, phone: hit.phone ?? null, displayName: hit.displayName }).then((ok) => {
        if (!ok) setFailed(picked);
      });
    },
    [attach, attached, draft.name, duplicate, hits, query],
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
    // The three fields ride on the sale (see the header comment); on an open
    // sale the buyer is written now (D-170), else at collection.
    const email = draft.email.trim() || null;
    const phone = draft.phone.trim() || null;
    const displayName = draft.name.trim();
    setAttached({ id: `draft:${email ?? phone ?? ""}`, displayName, email, phone });
    setOpen(false);
    setView("search");
    if (email || phone) void attach?.({ customerId: null, email, phone, displayName: displayName || null });
  }, [attach, draft]);

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
