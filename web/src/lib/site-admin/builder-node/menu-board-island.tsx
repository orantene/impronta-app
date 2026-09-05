"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import {
  MAX_QTY,
  fill,
  isSoldOut,
  maxAddableQty,
  shouldPayInPerson,
} from "./menu-board-stock";

// Do NOT statically import menu-order-actions — that file is "use server" and
// pulls server-only into render.tsx → fidelity/perf Node runners blow up with
// MODULE_NOT_FOUND for `server-only`. Call via dynamic import on submit only.

export type MenuBoardOffering = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number | null;
  currency: string;
  priceType: string;
  priceDisplay: string;
  kind: string;
  /** Units left, or null when this item is not stock-limited. */
  unitsLeft: number | null;
  /** Offering policy: may the customer settle in person? */
  allowPayInPerson: boolean;
};

/**
 * Every visible string, resolved SERVER-SIDE against the page's contentLocale
 * and passed in. The island is a client component inside the builder render
 * tree, so it cannot reach the request locale itself; hardcoding English here
 * is what shipped a Spanish menu board that spoke English.
 */
export type MenuBoardCopy = {
  decrease: string;
  increase: string;
  selectQuantities: string;
  quoteOnRequest: string;
  from: string;
  soldOut: string;
  onlyLeft: string;
  formTitle: string;
  itemsSelected: string;
  itemsSelectedOne: string;
  selectAtLeastOne: string;
  name: string;
  email: string;
  phone: string;
  contactRequired: string;
  payInPerson: string;
  sending: string;
  submit: string;
  sent: string;
  failed: string;
  soldOutError: string;
  /** The operator's noun for one item / several, already substituted. */
  noun: string;
  nounPlural: string;
};

export interface MenuBoardIslandProps {
  tenantId: string;
  offerings: ReadonlyArray<MenuBoardOffering>;
  copy: MenuBoardCopy;
}

const STORAGE_PREFIX = "impronta.menu-order.";

function storageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}${tenantId}`;
}

function clampQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_QTY, Math.round(value)));
}

/**
 * May this browser persist a cart for this tenant?
 *
 * ONE predicate, called by BOTH the read and the write, because the bug this
 * replaces was an asymmetry: the read checked `!tenantId` and the write did not.
 * That is not a no-op — `storageKey("")` is the bare prefix, so a tenant-less
 * write is one cart bucket shared by every tenant a person visits in that
 * browser session.
 *
 * It was harmless only because the read guard made such a write unreadable,
 * which is precisely what made it dangerous: a guard whose partner is missing
 * reads as redundant, and deleting it as "obviously unnecessary" would have
 * turned dead data into a cross-tenant cart. Sharing the predicate means there
 * is no half to delete.
 */
export function cartStorageEnabled(tenantId: string): boolean {
  return typeof window !== "undefined" && Boolean(tenantId);
}

function loadStoredQuantities(tenantId: string): Record<string, number> {
  if (!cartStorageEnabled(tenantId)) return {};
  try {
    const raw = window.sessionStorage.getItem(storageKey(tenantId));
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== "object") return {};
    const next: Record<string, number> = {};
    for (const [key, value] of Object.entries(parsed)) {
      const qty = clampQty(Number(value));
      if (qty > 0) next[key] = qty;
    }
    return next;
  } catch {
    return {};
  }
}

function formatMenuMoney(amountCents: number, currency: string): string {
  const amount = amountCents / 100;
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency: currency.toUpperCase(),
      maximumFractionDigits: amount % 1 === 0 ? 0 : 2,
    }).format(amount);
  } catch {
    return `${currency.toUpperCase()} ${amount.toLocaleString()}`;
  }
}

export function MenuBoardIsland({ tenantId, offerings, copy }: MenuBoardIslandProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setHydrated(false);
    setQuantities(loadStoredQuantities(tenantId));
    setHydrated(true);
  }, [tenantId]);

  useEffect(() => {
    if (!hydrated || !cartStorageEnabled(tenantId)) return;
    try {
      if (Object.keys(quantities).length === 0) {
        window.sessionStorage.removeItem(storageKey(tenantId));
      } else {
        window.sessionStorage.setItem(storageKey(tenantId), JSON.stringify(quantities));
      }
    } catch {
      // sessionStorage can be disabled. The order still works in memory.
    }
  }, [hydrated, quantities, tenantId]);

  const selectedLines = useMemo(
    () =>
      offerings
        .map((offering) => ({
          offering,
          quantity: clampQty(quantities[offering.id] ?? 0),
        }))
        .filter(({ quantity }) => quantity > 0),
    [offerings, quantities],
  );

  const selectedCount = selectedLines.length;
  const selectedItemCount = selectedLines.reduce((sum, line) => sum + line.quantity, 0);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setStatus(null);
    if (selectedLines.length === 0) {
      setError(copy.selectAtLeastOne);
      return;
    }
    const name = contactName.trim();
    const email = contactEmail.trim();
    const phone = contactPhone.trim();
    if (!name || !email || !phone) {
      setError(copy.contactRequired);
      return;
    }
    const soldOutLine = selectedLines.find(({ offering }) => isSoldOut(offering));
    if (soldOutLine) {
      setError(fill(copy.soldOutError, { item: soldOutLine.offering.title }));
      return;
    }

    setIsPending(true);
    try {
      try {
        const { submitMenuOrder } = await import(
          "@/app/(public)/_menu/menu-order-actions"
        );
        const result = await submitMenuOrder({
          tenantId,
          contactName: name,
          contactEmail: email,
          contactPhone: phone,
          lines: selectedLines.map(({ offering, quantity }) => ({
            offeringId: offering.id,
            quantity,
          })),
          // A HINT ONLY. The engine re-derives this from the trusted offering
          // rows and ignores a value the policy does not permit, so this cannot
          // be used to stamp a card-only item as pay-in-person. Sending it keeps
          // the UI promise and the request in agreement for the honest case.
          payInPerson: shouldPayInPerson(selectedLines.map((l) => l.offering)),
          sourcePage:
            typeof window !== "undefined" ? window.location.pathname : null,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setStatus(copy.sent);
        setQuantities({});
        setContactName("");
        setContactEmail("");
        setContactPhone("");
        try {
          window.sessionStorage.removeItem(storageKey(tenantId));
        } catch {
          // Ignore storage failures.
        }
      } catch {
        setError(copy.failed);
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="site-builder-node--menu-board-island">
      <div className="site-builder-node--menu-board-stepper-group" aria-label={copy.selectQuantities}>
        {offerings.map((offering) => {
          const quantity = clampQty(quantities[offering.id] ?? 0);
          return (
            <div key={offering.id} className="site-builder-node--menu-board-stepper-row">
              <div className="site-builder-node--menu-board-stepper-copy">
                <span className="site-builder-node--menu-board-stepper-title">{offering.title}</span>
                {offering.description ? (
                  <p className="site-builder-node--menu-board-stepper-description">
                    {offering.description}
                  </p>
                ) : null}
              </div>
              <div className="site-builder-node--menu-board-stepper-controls">
                <button
                  type="button"
                  aria-label={fill(copy.decrease, { item: offering.title })}
                  onClick={() =>
                    setQuantities((current) => ({
                      ...current,
                      [offering.id]: clampQty((current[offering.id] ?? 0) - 1),
                    }))
                  }
                  disabled={isPending || quantity <= 0}
                >
                  -
                </button>
                <output aria-live="polite">{quantity}</output>
                <button
                  type="button"
                  aria-label={fill(copy.increase, { item: offering.title })}
                  onClick={() =>
                    setQuantities((current) => ({
                      ...current,
                      [offering.id]: clampQty((current[offering.id] ?? 0) + 1),
                    }))
                  }
                  disabled={isPending || quantity >= maxAddableQty(offering)}
                >
                  +
                </button>
                <span className="site-builder-node--menu-board-stepper-price">
                  {offering.amountCents == null ||
                  offering.priceDisplay === "quote" ||
                  offering.priceType === "custom"
                    ? copy.quoteOnRequest
                    : offering.priceDisplay === "from"
                      ? fill(copy.from, {
                          price: formatMenuMoney(offering.amountCents, offering.currency),
                        })
                      : formatMenuMoney(offering.amountCents, offering.currency)}
                </span>
                {isSoldOut(offering) ? (
                  <span className="site-builder-node--menu-board-stepper-stock" data-sold-out="true">
                    {copy.soldOut}
                  </span>
                ) : offering.unitsLeft != null ? (
                  <span className="site-builder-node--menu-board-stepper-stock">
                    {fill(copy.onlyLeft, { count: offering.unitsLeft })}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>

      <form className="site-builder-node--menu-board-form" onSubmit={handleSubmit}>
        <div className="site-builder-node--menu-board-form-head">
          <p className="site-builder-node--menu-board-form-title">{copy.formTitle}</p>
          <p className="site-builder-node--menu-board-form-meta">
            {selectedCount > 0
              ? selectedItemCount === 1
                ? copy.itemsSelectedOne
                : fill(copy.itemsSelected, { count: selectedItemCount })
              : copy.selectAtLeastOne}
          </p>
        </div>

        <label className="site-builder-node--menu-board-field">
          <span>{copy.name}</span>
          <input
            type="text"
            required
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            autoComplete="name"
          />
        </label>

        <label className="site-builder-node--menu-board-field">
          <span>{copy.email}</span>
          <input
            type="email"
            required
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="site-builder-node--menu-board-field">
          <span>{copy.phone}</span>
          <input
            type="tel"
            required
            value={contactPhone}
            onChange={(event) => setContactPhone(event.target.value)}
            autoComplete="tel"
          />
        </label>

        {error ? (
          <p className="site-builder-node--menu-board-form-error" role="alert">
            {error}
          </p>
        ) : null}
        {status ? (
          <p className="site-builder-node--menu-board-form-status" role="status">
            {status}
          </p>
        ) : null}

        {shouldPayInPerson(selectedLines.map((l) => l.offering)) ? (
          <p className="site-builder-node--menu-board-form-note">{copy.payInPerson}</p>
        ) : null}

        <button
          type="submit"
          className="site-builder-node--menu-board-submit"
          disabled={isPending || selectedCount === 0}
          // A real button on the tenant primary, like the header's Reserve.
          // No stylesheet ever styled this class, so the browser default
          // rendered: muted text on a transparent box, a ghost that computed as
          // rgb(115,115,115) on nothing and failed contrast on a live
          // restaurant. The pair is the projected tenant primary and its
          // derived foreground (`--token-color-primary-on`, #1771), so it
          // moves with the tenant's brand. Disabled keeps the fill and drops
          // opacity: still a button, still readable, visibly not yet armed.
          style={{
            background: "var(--token-color-primary, var(--primary, #111111))",
            color: "var(--token-color-primary-on, var(--primary-foreground, #ffffff))",
            border: "0",
            borderRadius: "999px",
            padding: "14px 28px",
            fontSize: "15px",
            fontWeight: 600,
            letterSpacing: "0.02em",
            cursor: isPending || selectedCount === 0 ? "not-allowed" : "pointer",
            opacity: isPending || selectedCount === 0 ? 0.6 : 1,
          }}
        >
          {isPending ? copy.sending : copy.submit}
        </button>
      </form>
    </div>
  );
}
