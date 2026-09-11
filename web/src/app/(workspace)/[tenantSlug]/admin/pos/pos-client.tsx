"use client";

/**
 * PosClient — the counter, wired.
 *
 * WHAT THIS FILE IS AND IS NOT. Every pixel comes from the presentational
 * components in `components/admin/pos/` (they take props and fetch nothing)
 * and every write goes through `./actions.ts` into `lib/pos/*` (the money
 * engine). This file is the wire between them: it holds the screen's state,
 * turns a tap into a command, and turns a command's refusal into a sentence.
 * It draws nothing of its own beyond layout.
 *
 * REFUSALS ARE DATA, NOT EXCEPTIONS. The engine never throws; it returns
 * `{ ok: false, reason }`. `refusalFromResult` maps that word onto one of the
 * counter's sentences and `PosRefusalBanner` renders it. The screen this
 * replaced printed the raw `reason` — a cashier at a till read `not_draft`
 * and `engine_error` off the screen, in every language.
 *
 * THE CHARGE IS IDEMPOTENT BY CONSTRUCTION. `posCollectionKey` derives the
 * operation key from the sale, its version, the tender and the amount, so two
 * taps of Charge on an unchanged sale are ONE claim on the balance. Read that
 * function's comment before touching `collect()`.
 *
 * NO EFFECTS. Everything this screen shows is either a prop the server
 * resolved or a value the operator just typed — there is nothing to
 * synchronise after mount, so there is no `useEffect` here and
 * `pos-page-wire.static.test.ts` keeps it that way. A counter that paints one
 * thing on the server and another after hydration is a counter that flickers
 * a price at a customer.
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ALL_CATEGORIES_ID,
  Basket,
  CollectSheet,
  CustomerPanel,
  HeldSalesList,
  PaidScreen,
  PosFrame,
  PosRefusalBanner,
  SellSurface,
  ShiftBar,
  type BasketCopy,
  type CollectSheetCopy,
  type CustomerPanelCopy,
  type HeldSalesListCopy,
  type PaidScreenCopy,
  type PosAttachedCustomer,
  type PosBasketLine,
  type PosCollectionMethodId,
  type PosCollectionMethodState,
  type PosRefusalCopy,
  type PosRefusalReason,
  ScanStatus,
  ScannerListener,
  type ScanCopy,
  type ScanToast,
  type SellSurfaceCopy,
  type ShiftBarCopy,
} from "@/components/admin/pos";
import { POS_PRIMARY_ACTION, POS_SECONDARY_ACTION, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import type { PosCounterPageCopy } from "@/components/admin/pos/pos-copy";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import type { PosMode } from "@/lib/pos/modes";
import { refusalFromResult } from "@/lib/pos/refusal-reason";

import { CounterDisplayBeacon } from "./counter-display-beacon";
import {
  CounterContactFields,
  CounterPrepPanel,
  CounterShiftScreen,
} from "./counter-panels";
import {
  chosenSessionId,
  posCollectionKey,
  tenderAfterKey,
  toCategoryTabs,
  toHeldSales,
  toProductTiles,
  toShiftSummary,
  type PosCatalogItem,
  type PosShiftView,
} from "./counter-model";
import {
  posAddLine,
  posCancelSale,
  posCloseShift,
  posCreateDraft,
  posOpenShift,
  posRemoveLine,
  posReprice,
  posResolveScanCode,
  posSearchCustomers,
  posStartCollection,
  posSubmitPrep,
  posUpdateLine,
  type PosCustomerHit,
} from "./actions";

/** The sale, narrowed to what the counter renders. */
export type PosSaleSummary = {
  orderId: string;
  version: number;
  currency: string;
  customerId: string | null;
  discountCents: number;
  totalCents: number;
  outstandingCents: number;
  paymentState: "unpaid" | "pending" | "paid" | "cancelled";
  prepState: string;
};

export type PosClientCopy = {
  frame: { navLabel: string; destinationLabels: Readonly<Record<string, string>> };
  sell: SellSurfaceCopy;
  basket: BasketCopy;
  customer: CustomerPanelCopy;
  collect: CollectSheetCopy;
  paid: PaidScreenCopy;
  held: HeldSalesListCopy;
  shiftBar: ShiftBarCopy;
  refusal: PosRefusalCopy;
  page: PosCounterPageCopy;
  scan: ScanCopy;
  /** The rail's door to the customer display (`/admin/pos/display`). */
  displayLink: { label: string; hint: string };
  heldSaleLabel: string;
  categories: Readonly<Record<string, string>>;
  legacy: {
    contactHint: string;
    email: string;
    phone: string;
    guest: string;
    outstanding: string;
    sendToPrep: string;
    prepDestination: string;
    prepPickup: string;
    prepTable: string;
    prepCounter: string;
    prepPromisedAt: string;
    pageTitle: string;
    newSale: string;
    amount: string;
  };
};

export type PosClientProps = {
  mode: PosMode;
  /** For the customer display's beacon (`display-beacon.ts`), keyed per workspace. */
  tenantId: string;
  /** This workspace's own name. See the page's comment on why it is read. */
  workspaceName: string;
  /** This request's own `/…/admin/pos` path, so links keep the host shape. */
  posPath: string;
  workspacePath: string;
  receiptOrigin: string;
  receiptCode: string | null;
  sale: PosSaleSummary | null;
  basketLines: PosBasketLine[];
  openSales: Array<{ id: string; totalCents: number; createdAt: string | null }>;
  catalog: PosCatalogItem[];
  currency: string;
  minorUnitDivisor: number;
  methods: PosCollectionMethodState[];
  shift: PosShiftView | null;
  copy: PosClientCopy;
};

type Destination = "sell" | "orders" | "shifts";

type PaidSale = {
  amountCents: number;
  changeCents: number;
  receiptCode: string | null;
};

export function PosClient(props: PosClientProps) {
  const router = useRouter();
  const { copy, sale } = props;

  const [destination, setDestination] = useState<Destination>("sell");
  const [busy, setBusy] = useState(false);
  const [refusal, setRefusal] = useState<PosRefusalReason | null>(null);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES_ID);
  const [sessionByProduct, setSessionByProduct] = useState<Record<string, string>>({});

  const [discountCode, setDiscountCode] = useState("");
  const [discountRefused, setDiscountRefused] = useState(false);

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerHits, setCustomerHits] = useState<PosCustomerHit[]>([]);
  const [attached, setAttached] = useState<PosAttachedCustomer | null>(null);
  const [attachFailed, setAttachFailed] = useState(false);
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  const [collectOpen, setCollectOpen] = useState(false);
  const [method, setMethod] = useState<PosCollectionMethodId>("cash");
  const [tenderedCents, setTenderedCents] = useState(0);
  // Has the operator pressed a key since the sheet opened — see `tenderAfterKey`.
  const [tenderTouched, setTenderTouched] = useState(false);
  const [paid, setPaid] = useState<PaidSale | null>(null);
  const [receiptCopied, setReceiptCopied] = useState(false);

  const [openingCash, setOpeningCash] = useState("");
  const [countedCash, setCountedCash] = useState("");

  const [prepDestination, setPrepDestination] = useState<"table" | "pickup" | "counter">("counter");
  const [promisedAtLocal, setPromisedAtLocal] = useState("");

  const [scanToast, setScanToast] = useState<ScanToast | null>(null);
  const dismissScanToast = useCallback(() => setScanToast(null), []);

  const saleHref = useCallback(
    (orderId: string | null) =>
      orderId
        ? `${props.posPath}?mode=${props.mode}&order=${encodeURIComponent(orderId)}`
        : `${props.posPath}?mode=${props.mode}`,
    [props.mode, props.posPath],
  );

  /**
   * Run one command and render whatever it says.
   *
   * `kind` picks the refusal vocabulary, because `amount` means "someone else
   * took part of this balance" on a sale and "that cash-box figure is not a
   * number" on a shift. One table would have to be wrong about one of them.
   */
  const run = useCallback(
    async <T extends { ok: boolean; reason?: unknown; error?: unknown }>(
      kind: "sale" | "shift",
      fn: () => Promise<T>,
    ): Promise<T> => {
      setBusy(true);
      setRefusal(null);
      try {
        const result = await fn();
        const refused = refusalFromResult(result, kind);
        setRefusal(refused);
        if (!refused) router.refresh();
        return result;
      } finally {
        setBusy(false);
      }
    },
    [router],
  );

  const startSale = useCallback(async () => {
    const result = await run("sale", () => posCreateDraft());
    if (result.ok && "orderId" in result && typeof result.orderId === "string") {
      setPaid(null);
      setCollectOpen(false);
      setTenderedCents(0);
      setAttached(null);
      setEmail("");
      setPhone("");
      setDiscountCode("");
      setDiscountRefused(false);
      router.push(saleHref(result.orderId));
    }
  }, [router, run, saleHref]);

  /**
   * THE CHARGE.
   *
   * `idempotencyKey` is derived, never minted — see `posCollectionKey`. The
   * amount is always the whole outstanding balance for this attempt, and
   * `expectedVersion` is the version the operator is looking at, so a second
   * till that edited or collected since this screen loaded is refused as a
   * conflict instead of taking the money twice.
   */
  const collect = useCallback(
    async (tender: "cash" | "online_card") => {
      if (!sale) return;
      const amountCents = sale.outstandingCents;
      const result = await run("sale", () =>
        posStartCollection({
          orderId: sale.orderId,
          method: tender,
          email: email.trim() || undefined,
          phone: phone.trim() || undefined,
          displayName: attached?.displayName,
          amountCents: amountCents > 0 ? amountCents : undefined,
          tenderedCents: tender === "cash" ? Math.max(tenderedCents, amountCents) : undefined,
          idempotencyKey: posCollectionKey({
            orderId: sale.orderId,
            version: sale.version,
            method: tender,
            amountCents,
          }),
          expectedVersion: sale.version,
        }),
      );
      if (!result.ok) return;
      if (tender === "online_card" && "checkoutUrl" in result && typeof result.checkoutUrl === "string") {
        window.location.href = result.checkoutUrl;
        return;
      }
      if ("changeCents" in result) {
        setPaid({
          amountCents: Number(result.amountCents ?? amountCents),
          changeCents: Number(result.changeCents ?? 0),
          receiptCode: props.receiptCode,
        });
        setCollectOpen(false);
        setTenderedCents(0);
      }
    },
    [attached, email, phone, props.receiptCode, run, sale, tenderedCents],
  );

  /**
   * A SCAN IS A TAP ON A TILE. The code is looked up (`posResolveScanCode`:
   * an offering id, or a link code whose row names one), and the item goes
   * into the basket through `posAddLine`, the same write a tile uses, so the
   * basket has one write path and one set of refusals. With no sale open, a
   * scan opens one first, the way a tap on a tile does. The outcome is one
   * sentence in the toast: "Added <name>" or "Nothing matches <code>"; a
   * refusal from the engine goes to the banner like any other.
   */
  const scan = useCallback(
    async (code: string) => {
      const resolved = await posResolveScanCode(code);
      if (!resolved.ok) {
        setScanToast(
          resolved.reason === "no_match"
            ? { kind: "no_match", sentence: interpolate(copy.scan.noMatch, { code }) }
            : { kind: "unavailable", sentence: copy.scan.unavailable },
        );
        return;
      }
      let orderId: string;
      let expectedVersion: number;
      if (sale) {
        orderId = sale.orderId;
        expectedVersion = sale.version;
      } else {
        const opened = await run("sale", () => posCreateDraft());
        if (!opened.ok || !("orderId" in opened) || typeof opened.orderId !== "string") return;
        orderId = opened.orderId;
        expectedVersion = 1;
        setPaid(null);
        setCollectOpen(false);
      }
      const target = { orderId, expectedVersion };
      const added = await run("sale", () =>
        posAddLine({ ...target, offeringId: resolved.offeringId, units: 1 }),
      );
      if (!added.ok) return;
      setScanToast({ kind: "added", sentence: interpolate(copy.scan.added, { name: resolved.title }) });
      if (!sale) router.push(saleHref(orderId));
    },
    [copy.scan, router, run, sale, saleHref],
  );

  const receiptHref =
    paid?.receiptCode && props.receiptOrigin
      ? `${props.receiptOrigin}/r/${paid.receiptCode}`
      : null;

  const products = toProductTiles(props.catalog, props.currency, sessionByProduct);
  const categories = toCategoryTabs(props.catalog, copy.categories);
  const visibleProducts = products.filter((product) => {
    const needle = search.trim().toLowerCase();
    return needle === "" || product.title.toLowerCase().includes(needle);
  });
  const held = toHeldSales(
    props.openSales,
    props.currency,
    sale?.orderId ?? null,
    (orderId) => `${copy.heldSaleLabel} ${orderId.slice(0, 8)}`,
  );
  const amountDueCents = sale?.outstandingCents ?? 0;

  const sellSurface = (
    <SellSurface
      products={visibleProducts}
      categories={categories}
      activeCategoryId={category}
      onSelectCategory={setCategory}
      searchValue={search}
      onSearchChange={setSearch}
      onSelectProduct={(productId) => {
        if (!sale) {
          void startSale();
          return;
        }
        const item = props.catalog.find((row) => row.id === productId);
        const sessionId = chosenSessionId(item, sessionByProduct);
        void run("sale", () =>
          posAddLine({
            orderId: sale.orderId,
            offeringId: productId,
            units: 1,
            sessionId,
            expectedVersion: sale.version,
          }),
        );
      }}
      onSelectVariant={(productId, variantId) =>
        setSessionByProduct((current) => ({ ...current, [productId]: variantId }))
      }
      copy={copy.sell}
    />
  );

  const customerPanel = (
    <CustomerPanel
      customer={attached}
      searchValue={customerQuery}
      onSearchChange={(value) => {
        setCustomerQuery(value);
        void posSearchCustomers(value).then((result) => {
          setCustomerHits(result.ok && "rows" in result ? result.rows : []);
        });
      }}
      searchResults={customerHits}
      onSelectResult={(customerId) => {
        const hit = customerHits.find((row) => row.id === customerId);
        if (!hit) {
          // The row vanished between render and tap. C10's rule: never invent
          // a second customer for the same person, so this does nothing but
          // say the attach did not take.
          setAttachFailed(true);
          return;
        }
        // Attaching means naming the buyer with THIS customer's own contact
        // details. `ensureCustomer` is idempotent on (tenant, email) and
        // (tenant, phone), so the collection resolves back to this same row
        // rather than inserting a duplicate.
        setAttached({
          id: hit.id,
          displayName: hit.displayName,
          email: hit.email,
          phone: hit.phone,
        });
        setEmail(hit.email ?? "");
        setPhone(hit.phone ?? "");
        setAttachFailed(false);
      }}
      onCreateNew={() => {
        // A walk-in becomes a named customer the moment money is collected:
        // `startCollection` calls `ensureCustomer` with whatever is typed
        // below and writes `orders.customer_id` itself. So "create" here
        // clears the picked record and hands the cashier the two fields the
        // engine actually reads.
        setAttached(null);
        setAttachFailed(false);
        setCustomerHits([]);
        setCustomerQuery("");
      }}
      attachFailed={attachFailed}
      onRetryAttach={() => setAttachFailed(false)}
      copy={copy.customer}
    />
  );

  const contactFields = (
    <CounterContactFields
      copy={copy.legacy}
      email={email}
      phone={phone}
      onEmailChange={setEmail}
      onPhoneChange={setPhone}
    />
  );

  const prepPanel = sale ? (
    <CounterPrepPanel
      copy={copy.legacy}
      busy={busy}
      destination={prepDestination}
      onDestinationChange={setPrepDestination}
      promisedAtLocal={promisedAtLocal}
      onPromisedAtChange={setPromisedAtLocal}
      onSubmit={(promisedAt) =>
        void run("sale", async () =>
          promisedAt === null && prepDestination === "pickup"
            ? { ok: false as const, error: "pickup_window" }
            : posSubmitPrep({
                orderId: sale.orderId,
                destination: prepDestination,
                promisedAt,
              }),
        )
      }
    />
  ) : null;

  const basketColumn = collectOpen && sale ? (
    <div className="flex flex-col gap-3">
      <CollectSheet
        amountDueCents={amountDueCents}
        currency={props.currency}
        methods={props.methods}
        activeMethod={method}
        onSelectMethod={setMethod}
        tenderedCents={tenderedCents}
        onKeypadPress={(key) => {
          setTenderedCents((current) => tenderAfterKey(current, tenderTouched, key));
          setTenderTouched(true);
        }}
        onConfirmCash={() => void collect("cash")}
        onConfirmLink={() => void collect("online_card")}
        confirmLoading={busy}
        copy={copy.collect}
      />
      <button
        type="button"
        className={`${POS_SECONDARY_ACTION} h-11 w-full`}
        onClick={() => setCollectOpen(false)}
      >
        {copy.page.backToSale}
      </button>
    </div>
  ) : (
    <Basket
      lines={props.basketLines}
      currency={props.currency}
      discountCents={sale?.discountCents ?? 0}
      discountCode={discountCode}
      onDiscountCodeChange={(value) => {
        setDiscountCode(value);
        setDiscountRefused(false);
      }}
      onApplyDiscount={() => {
        if (!sale) return;
        void run("sale", async () => {
          const result = await posReprice({
            orderId: sale.orderId,
            promoCode: discountCode.trim(),
            expectedVersion: sale.version,
          });
          setDiscountRefused(!result.ok);
          return result;
        });
      }}
      discountApplying={busy}
      discountNotCombinable={discountRefused}
      onIncrement={(lineId) => {
        const line = props.basketLines.find((row) => row.id === lineId);
        if (!sale || !line) return;
        void run("sale", () =>
          posUpdateLine({
            orderId: sale.orderId,
            lineId,
            units: line.units + 1,
            expectedVersion: sale.version,
          }),
        );
      }}
      onDecrement={(lineId) => {
        const line = props.basketLines.find((row) => row.id === lineId);
        if (!sale || !line) return;
        // One unit left means removing the line, not asking the engine for a
        // quantity of zero — which it refuses as `invalid`, correctly.
        void run("sale", () =>
          line.units <= 1
            ? posRemoveLine({ orderId: sale.orderId, lineId, expectedVersion: sale.version })
            : posUpdateLine({
                orderId: sale.orderId,
                lineId,
                units: line.units - 1,
                expectedVersion: sale.version,
              }),
        );
      }}
      onRemove={(lineId) => {
        if (!sale) return;
        void run("sale", () =>
          posRemoveLine({ orderId: sale.orderId, lineId, expectedVersion: sale.version }),
        );
      }}
      onCharge={() => {
        // Pre-filled with the amount due so exact cash is one tap; the first
        // keypad press starts a fresh figure (`tenderAfterKey`).
        setTenderedCents(amountDueCents);
        setTenderTouched(false);
        setCollectOpen(true);
      }}
      chargeLoading={busy}
      copy={copy.basket}
    />
  );

  /**
   * The paid screen, and what has to stay reachable underneath it.
   *
   * TAKING THE MONEY IS NOT THE END OF THE SALE. A pickup order is paid at
   * the counter and only THEN sent to the kitchen, so hiding the preparation
   * panel behind the success state strands the ticket: the operator has the
   * customer's money, a promised pickup time, and no way to tell anyone to
   * cook it. It cost a whole journey run to find, and it is the reason the
   * prep panel is rendered here as well as beside the basket.
   */
  const paidScreen = paid ? (
    <div className="flex flex-col items-center gap-4 p-4">
      <PaidScreen
        amountCents={paid.amountCents}
        changeCents={paid.changeCents}
        currency={props.currency}
        onPrintReceipt={() => {
          if (receiptHref) window.open(receiptHref, "_blank", "noopener,noreferrer");
        }}
        onEmailReceipt={() => {
          if (!receiptHref) return;
          const to = attached?.email ?? email.trim();
          window.location.href = `mailto:${encodeURIComponent(to)}?body=${encodeURIComponent(receiptHref)}`;
        }}
        onNextCustomer={() => void startSale()}
        copy={copy.paid}
      />
      {receiptHref && (
        <div className={`${POS_SURFACE} flex w-full max-w-md flex-col gap-2 p-4`}>
          <p className="m-0 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {copy.page.receiptLink}
          </p>
          <a
            href={receiptHref}
            target="_blank"
            rel="noopener noreferrer"
            data-pos-receipt-link
            className="break-all text-sm text-foreground underline"
          >
            {receiptHref}
          </a>
          <button
            type="button"
            className={`${POS_SECONDARY_ACTION} h-11`}
            onClick={() => {
              void navigator.clipboard?.writeText(receiptHref).then(
                () => setReceiptCopied(true),
                () => setReceiptCopied(false),
              );
            }}
          >
            {receiptCopied ? copy.page.receiptCopied : copy.page.copyReceipt}
          </button>
        </div>
      )}
      {prepPanel && <div className="w-full max-w-md">{prepPanel}</div>}
    </div>
  ) : null;

  const sellScreen = paidScreen ?? (
    <div className="grid min-h-0 flex-1 gap-4 p-4 lg:grid-cols-[minmax(0,1.5fr)_minmax(320px,1fr)]">
      <div className="flex min-h-0 flex-col gap-3">
        <ScanStatus toast={scanToast} onDismiss={dismissScanToast} copy={copy.scan} />
        <div className={`${POS_SURFACE} min-h-0 flex-1 overflow-hidden`}>{sellSurface}</div>
      </div>
      <div className="flex min-h-0 flex-col gap-3 overflow-y-auto">
        <div className="flex gap-2">
          <button type="button" disabled={busy} className={`${POS_PRIMARY_ACTION} flex-1`} onClick={() => void startSale()}>
            {copy.page.startSale}
          </button>
          {sale && (
            <button
              type="button"
              disabled={busy}
              className={`${POS_SECONDARY_ACTION} flex-1`}
              onClick={() => router.push(saleHref(null))}
            >
              {copy.page.hold}
            </button>
          )}
        </div>
        <div className={POS_SURFACE}>{basketColumn}</div>
        {customerPanel}
        {contactFields}
        {prepPanel}
        {sale && (
          <button
            type="button"
            disabled={busy}
            className={`${POS_SECONDARY_ACTION} h-11`}
            onClick={() =>
              void run("sale", async () => {
                const result = await posCancelSale(sale.orderId, sale.version);
                if (result.ok) router.push(saleHref(null));
                return result;
              })
            }
          >
            {copy.page.cancelSale}
          </button>
        )}
      </div>
    </div>
  );

  const ordersScreen = (
    <div className="flex flex-col gap-4 p-4">
      <HeldSalesList sales={held} onResume={(orderId) => router.push(saleHref(orderId))} copy={copy.held} />
    </div>
  );

  const shiftsScreen = (
    <CounterShiftScreen
      shift={props.shift}
      currency={props.currency}
      minorUnitDivisor={props.minorUnitDivisor}
      busy={busy}
      copy={{ bar: copy.shiftBar, page: copy.page }}
      openingCash={openingCash}
      onOpeningCashChange={setOpeningCash}
      countedCash={countedCash}
      onCountedCashChange={setCountedCash}
      onRefuse={setRefusal}
      onOpenShift={(openingCashCents) => void run("shift", () => posOpenShift(openingCashCents))}
      onCloseShift={(closingCashCents) =>
        void run("shift", () =>
          posCloseShift({ closingCashCents, expectedVersion: props.shift?.version }),
        )
      }
    />
  );

  const displayHref = sale
    ? `${props.posPath}/display?order=${encodeURIComponent(sale.orderId)}`
    : `${props.posPath}/display`;

  return (
    <div className="flex min-h-[calc(100vh-56px)] w-full flex-col">
      <CounterDisplayBeacon tenantId={props.tenantId} orderId={sale?.orderId ?? null} />
      <ScannerListener onScan={(code) => void scan(code)} enabled={destination === "sell" && !paid && !collectOpen} />
      <ShiftBar
        shift={toShiftSummary(props.shift)}
        currency={props.currency}
        onOpenShift={() => setDestination("shifts")}
        onCloseShift={() => setDestination("shifts")}
        copy={copy.shiftBar}
      />
      <PosFrame
        mode={props.mode}
        navLabel={copy.frame.navLabel}
        activeDestination={destination}
        onSelectDestination={(id) => setDestination(id as Destination)}
        destinationLabels={copy.frame.destinationLabels}
        links={[{ id: "display", label: copy.displayLink.label, href: displayHref, hint: copy.displayLink.hint }]}
        className="flex-1 rounded-none border-0"
      >
        {/*
          A real <header>, and it names the WORKSPACE.
          The counter replaces the admin chrome, so the sidebar's tenant chip
          is gone; this is the only place left that says which business's till
          this is. A cashier who works two of them must never have to guess.
        */}
        <header className="flex items-center justify-between gap-4 border-b border-border px-4 py-3">
          <div className="min-w-0">
            <p className="m-0 truncate text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {props.workspaceName}
            </p>
            <h1 className="m-0 text-base font-semibold text-foreground">{copy.legacy.pageTitle}</h1>
          </div>
          {sale && (
            <p className="m-0 text-sm text-muted-foreground">
              {attached?.displayName ?? copy.legacy.guest} · {copy.legacy.outstanding}{" "}
              <span className="font-semibold text-foreground">
                {formatOrderMoney(sale.outstandingCents, props.currency)}
              </span>
            </p>
          )}
        </header>
        {refusal && (
          <div className="px-4 pt-4">
            <PosRefusalBanner
              reason={refusal}
              copy={copy.refusal}
              onRetry={() => {
                setRefusal(null);
                router.refresh();
              }}
            />
          </div>
        )}
        {destination === "orders"
          ? ordersScreen
          : destination === "shifts"
            ? shiftsScreen
            : sellScreen}
      </PosFrame>
    </div>
  );
}
