"use client";

import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

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
};

export interface MenuBoardIslandProps {
  tenantId: string;
  offerings: ReadonlyArray<MenuBoardOffering>;
}

const STORAGE_PREFIX = "impronta.menu-order.";
const MAX_QTY = 99;

function storageKey(tenantId: string): string {
  return `${STORAGE_PREFIX}${tenantId}`;
}

function clampQty(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(MAX_QTY, Math.round(value)));
}

function loadStoredQuantities(tenantId: string): Record<string, number> {
  if (typeof window === "undefined" || !tenantId) return {};
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

export function MenuBoardIsland({ tenantId, offerings }: MenuBoardIslandProps) {
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
    if (!hydrated || typeof window === "undefined") return;
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
      setError("Select at least one item.");
      return;
    }
    const name = contactName.trim();
    const email = contactEmail.trim();
    const phone = contactPhone.trim();
    if (!name || !email || !phone) {
      setError("Name, email, and phone are required.");
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
          sourcePage:
            typeof window !== "undefined" ? window.location.pathname : null,
        });

        if (!result.ok) {
          setError(result.error);
          return;
        }

        setStatus("Order sent.");
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
        setError("Could not send the order.");
      }
    } finally {
      setIsPending(false);
    }
  }

  return (
    <div className="site-builder-node--menu-board-island">
      <div className="site-builder-node--menu-board-stepper-group" aria-label="Select quantities">
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
                  aria-label={`Decrease ${offering.title}`}
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
                  aria-label={`Increase ${offering.title}`}
                  onClick={() =>
                    setQuantities((current) => ({
                      ...current,
                      [offering.id]: clampQty((current[offering.id] ?? 0) + 1),
                    }))
                  }
                  disabled={isPending || quantity >= MAX_QTY}
                >
                  +
                </button>
                <span className="site-builder-node--menu-board-stepper-price">
                  {offering.amountCents == null ||
                  offering.priceDisplay === "quote" ||
                  offering.priceType === "custom"
                    ? "Quote on request"
                    : offering.priceDisplay === "from"
                      ? `from ${formatMenuMoney(offering.amountCents, offering.currency)}`
                      : formatMenuMoney(offering.amountCents, offering.currency)}
                </span>
              </div>
            </div>
          );
        })}
      </div>

      <form className="site-builder-node--menu-board-form" onSubmit={handleSubmit}>
        <div className="site-builder-node--menu-board-form-head">
          <p className="site-builder-node--menu-board-form-title">Send your order</p>
          <p className="site-builder-node--menu-board-form-meta">
            {selectedCount > 0
              ? `${selectedItemCount} item${selectedItemCount === 1 ? "" : "s"} selected`
              : "Select at least one item"}
          </p>
        </div>

        <label className="site-builder-node--menu-board-field">
          <span>Name</span>
          <input
            type="text"
            required
            value={contactName}
            onChange={(event) => setContactName(event.target.value)}
            autoComplete="name"
          />
        </label>

        <label className="site-builder-node--menu-board-field">
          <span>Email</span>
          <input
            type="email"
            required
            value={contactEmail}
            onChange={(event) => setContactEmail(event.target.value)}
            autoComplete="email"
          />
        </label>

        <label className="site-builder-node--menu-board-field">
          <span>Phone</span>
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

        <button
          type="submit"
          className="site-builder-node--menu-board-submit"
          disabled={isPending || selectedCount === 0}
        >
          {isPending ? "Sending" : "Send order"}
        </button>
      </form>
    </div>
  );
}
