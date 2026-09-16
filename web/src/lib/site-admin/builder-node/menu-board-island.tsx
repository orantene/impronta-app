"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  MAX_QTY,
  REFRESH_MIN_INTERVAL_MS,
  fill,
  isSoldOut,
  maxAddableQty,
  mergeLiveOfferings,
  reconcileQuantities,
  shouldPayInPerson,
} from "./menu-board-stock";

// Do NOT statically import menu-order-actions or menu-board-actions — those
// files are "use server" and pull server-only into render.tsx → fidelity/perf
// Node runners blow up with MODULE_NOT_FOUND for `server-only`. Call via
// dynamic import, on submit and on refresh only.

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
  /**
   * The server-rendered board. First paint, no-JS and SEO all read this, and it
   * stays the fallback whenever a refresh cannot complete — a menu thirty
   * seconds old beats a menu that is not there.
   */
  offerings: ReadonlyArray<MenuBoardOffering>;
  copy: MenuBoardCopy;
  /**
   * The page's content locale, so a refresh resolves the same translated titles
   * the server did. Absent → English, matching `fetchWorkspaceMenuOfferings`'s
   * own default; a board that silently swapped to English on refresh would be
   * the same defect the `copy` prop exists to prevent.
   */
  locale?: string | null;
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

/**
 * The board's own stylesheet, injected once per island the way the ticket
 * picker ships `TP_CSS`. Every rule reads the tenant's projected tokens and
 * nothing else, so the same block is gold-on-black on Impronta and ink-on-
 * cream on a bakery. Mobile first: one column, 44px steppers, the stepper row
 * widens into two columns from 640px. No hex literals (the token-ground gate).
 */
const MB_CSS = `
.site-builder-node--menu-board-island{display:grid;gap:1.35rem;color:var(--token-color-ink);font:inherit}
.site-builder-node--menu-board-stepper-group{display:grid;gap:0.7rem}
.site-builder-node--menu-board-stepper-row{display:grid;grid-template-columns:1fr;gap:0.75rem;padding:0.95rem 1rem;border:1px solid var(--token-color-line);border-radius:14px;background:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent))}
@media (min-width:640px){.site-builder-node--menu-board-stepper-row{grid-template-columns:1fr auto;align-items:center}}
.site-builder-node--menu-board-stepper-copy{min-width:0}
.site-builder-node--menu-board-stepper-title{display:block;font-weight:600;line-height:1.3}
.site-builder-node--menu-board-stepper-description{margin:0.3rem 0 0;font-size:0.85rem;line-height:1.45;color:var(--token-color-muted)}
.site-builder-node--menu-board-stepper-controls{display:flex;flex-wrap:wrap;align-items:center;gap:0.5rem 0.75rem}
.site-builder-node--menu-board-stepper-controls>button{width:2.75rem;height:2.75rem;border:1px solid var(--token-color-line);border-radius:999px;background:transparent;color:var(--token-color-ink);font:inherit;font-size:1.2rem;line-height:1;cursor:pointer;transition:background-color 160ms ease,border-color 160ms ease}
.site-builder-node--menu-board-stepper-controls>button:not(:disabled):hover{border-color:var(--token-color-primary);background:color-mix(in srgb,var(--token-color-primary) 16%,transparent)}
.site-builder-node--menu-board-stepper-controls>button:disabled{opacity:0.35;cursor:not-allowed}
.site-builder-node--menu-board-stepper-controls>output{min-width:1.6rem;text-align:center;font-weight:600;font-variant-numeric:tabular-nums}
.site-builder-node--menu-board-stepper-price{margin-left:auto;font-weight:600;white-space:nowrap;font-variant-numeric:tabular-nums}
.site-builder-node--menu-board-stepper-stock{flex-basis:100%;font-size:0.78rem;letter-spacing:0.04em;text-transform:uppercase;color:var(--token-color-primary)}
@media (min-width:640px){.site-builder-node--menu-board-stepper-stock{flex-basis:auto}}
.site-builder-node--menu-board-stepper-stock[data-sold-out="true"]{color:var(--token-color-muted);text-decoration:line-through}
.site-builder-node--menu-board-form{display:grid;gap:0.9rem;padding:1.15rem 1.2rem;border:1px solid var(--token-color-line);border-radius:18px;background:color-mix(in srgb,var(--token-color-ink) 4%,var(--token-color-surface-raised,transparent))}
@media (min-width:640px){.site-builder-node--menu-board-form{grid-template-columns:repeat(3,1fr);align-items:end}.site-builder-node--menu-board-form-head,.site-builder-node--menu-board-form-error,.site-builder-node--menu-board-form-status,.site-builder-node--menu-board-form-note,.site-builder-node--menu-board-submit{grid-column:1/-1}}
.site-builder-node--menu-board-form-head{display:grid;gap:0.2rem}
.site-builder-node--menu-board-form-title{margin:0;font-weight:600;font-size:1.05rem}
.site-builder-node--menu-board-form-meta{margin:0;font-size:0.85rem;color:var(--token-color-muted)}
.site-builder-node--menu-board-field{display:grid;gap:0.4rem;font-size:0.82rem;font-weight:600}
.site-builder-node--menu-board-field>input{width:100%;box-sizing:border-box;font:inherit;font-size:16px;font-weight:400;line-height:1.45;color:var(--token-color-ink);background:color-mix(in srgb,var(--token-color-ink) 8%,var(--token-color-surface-raised,transparent));border:1px solid color-mix(in srgb,var(--token-color-ink) 28%,transparent);border-radius:12px;padding:0.8rem 0.95rem;outline:none;transition:border-color 160ms ease,box-shadow 160ms ease}
.site-builder-node--menu-board-field>input:focus-visible{border-color:var(--token-color-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--token-color-primary) 26%,transparent)}
.site-builder-node--menu-board-form-error{margin:0;padding:0.75rem 0.9rem;border-radius:12px;background:color-mix(in srgb,var(--token-color-primary) 12%,transparent);font-size:0.9rem;line-height:1.4}
.site-builder-node--menu-board-form-status{margin:0;font-size:0.9rem;font-weight:600;color:var(--token-color-primary)}
.site-builder-node--menu-board-form-note{margin:0;font-size:0.85rem;color:var(--token-color-muted)}
.site-builder-node--menu-board-submit{display:block;width:100%;border:0;border-radius:999px;padding:0.9rem 1.6rem;font:inherit;font-size:0.95rem;font-weight:600;letter-spacing:0.02em;background:var(--token-color-primary);color:var(--token-color-primary-on,var(--primary-foreground));cursor:pointer;transition:filter 160ms ease}
.site-builder-node--menu-board-submit:not(:disabled):hover{filter:brightness(1.06)}
.site-builder-node--menu-board-submit:disabled{opacity:0.55;cursor:not-allowed}
`;

export function MenuBoardIsland({
  tenantId,
  offerings: rendered,
  copy,
  locale,
}: MenuBoardIslandProps) {
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [live, setLive] = useState<ReadonlyArray<MenuBoardOffering> | null>(null);

  const offerings = useMemo(
    () => (live ? mergeLiveOfferings(rendered, live) : rendered),
    [live, rendered],
  );

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

  const lastRefreshAt = useRef(0);
  const refreshing = useRef(false);

  /**
   * The renderer emits the menu twice on purpose: a plain server list (what a
   * restaurant is indexed on, and what a no-JS reader sees) and this island's
   * stepper rows. Once the island is on screen the server list is a duplicate,
   * so mark the section and let the renderer sheet visually hide it. The
   * attribute is set after mount, never rendered, so hydration sees the same
   * markup the server sent.
   */
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const section = rootRef.current?.closest(".site-builder-node--menu-board");
    if (!section) return;
    section.setAttribute("data-menu-board-live", "1");
    return () => section.removeAttribute("data-menu-board-live");
  }, []);

  /**
   * Re-read prices and stock, and reconcile the cart against the answer.
   *
   * NEVER surfaces a failure. A refresh is an improvement on what is already on
   * screen, not a precondition for using the board: the submit path re-resolves
   * every line server-side and refuses there, so a swallowed refresh error can
   * only cost freshness, never money. Setting `error` here would instead put a
   * red alert over a working menu every time a phone came back onto a flaky
   * network.
   */
  const refresh = useCallback(async () => {
    if (!tenantId || refreshing.current) return;
    const now = Date.now();
    if (now - lastRefreshAt.current < REFRESH_MIN_INTERVAL_MS) return;
    refreshing.current = true;
    lastRefreshAt.current = now;
    try {
      const { loadLiveMenuBoard } = await import(
        "@/app/(public)/_menu/menu-board-actions"
      );
      const result = await loadLiveMenuBoard({ tenantId, locale: locale ?? null });
      if (!result.ok) return;
      setLive(result.offerings);
    } catch {
      // Offline, a deploy mid-navigation, an aborted action. The rendered board
      // stands.
    } finally {
      refreshing.current = false;
    }
  }, [locale, tenantId]);

  /**
   * Mount, tab-visible and bfcache restore — the three moments a board can be
   * on screen while being older than it looks.
   *
   * `pageshow` is the one that matters most and the one an interval would not
   * catch: a back-button return restores the whole page from memory, timers
   * included but already-fired effects not re-run, so without it the stalest
   * board a visitor can see is the one they reach by the most ordinary
   * navigation there is. No polling interval on purpose — a menu board is a
   * page people leave open, and a background poll on every restaurant tab is a
   * cost with no reader.
   */
  useEffect(() => {
    void refresh();
    if (typeof document === "undefined") return;
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const onPageShow = () => {
      void refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pageshow", onPageShow);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [refresh]);

  useEffect(() => {
    if (!live) return;
    setQuantities((current) => reconcileQuantities(current, offerings));
  }, [live, offerings]);

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
          // The engine just refused with the truth about stock, which makes
          // whatever is on screen provably behind it. Clearing the floor is
          // what lets the retry read a board that agrees with the refusal
          // instead of the one that produced it.
          lastRefreshAt.current = 0;
          void refresh();
          setError(result.error);
          return;
        }

        lastRefreshAt.current = 0;
        void refresh();
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
    <div ref={rootRef} className="site-builder-node--menu-board-island">
      <style>{MB_CSS}</style>
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
        >
          {isPending ? copy.sending : copy.submit}
        </button>
      </form>
    </div>
  );
}
