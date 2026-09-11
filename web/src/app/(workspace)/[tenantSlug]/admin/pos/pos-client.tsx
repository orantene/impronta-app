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
 * counter's sentences and `PosRefusalBanner` renders it; a lapsed class
 * place (`capacityGone`) opens the hold-expired dialog instead, because that
 * refusal has choices, not a retry.
 *
 * THE CHARGE IS IDEMPOTENT BY CONSTRUCTION. `posCollectionKey` derives the
 * operation key from the sale, its version, the tender and the amount, so two
 * taps of Charge on an unchanged sale are ONE claim on the balance. Read that
 * function's comment before touching `collect()`.
 *
 * NO EFFECTS. Everything this screen shows is either a prop the server
 * resolved or a value the operator just typed — there is nothing to
 * synchronise after mount, so there is no `useEffect` here and
 * `pos-page-wire.static.test.ts` keeps it that way. (`useOnline` is a
 * `useSyncExternalStore` over the browser's own connectivity events.)
 */

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

import {
  ALL_CATEGORIES_ID,
  Basket,
  CashDoneDialog,
  CollectSheet,
  ConnectionScreen,
  DevicesScreen,
  HeldSalesList,
  IssuesScreen,
  PaidScreen,
  PosFrame,
  PosHeader,
  PosRefusalBanner,
  ReceiptsScreen,
  ScanScreen,
  ScanStatus,
  ScannerListener,
  SellSurface,
  initialsOf,
  type PosCollectionMethodId,
  type PosRefusalReason,
  type ScanToast,
} from "@/components/admin/pos";
import { POS_SECONDARY_ACTION, POS_SEGMENT, POS_SEGMENT_ACTIVE, POS_SEGMENT_IDLE, POS_SEGMENT_TRACK, POS_SURFACE } from "@/components/admin/pos/pos-classes";
import { cn } from "@/lib/utils";
import { useOnline } from "@/components/admin/pos/use-online";
import { interpolate } from "@/i18n/interpolate";
import { formatOrderMoney } from "@/lib/orders/money-format";
import { refusalFromResult } from "@/lib/pos/refusal-reason";

import { useCounterDisplayBeacon } from "./counter-display-beacon";
import { useCounterCustomer } from "./counter-customer";
import { CounterDrawer } from "./counter-drawer";
import { useCounterEngine } from "./counter-engine";
import { COUNTER_DESTINATIONS, counterHeader, isDestination, type CounterDestination as Destination } from "./counter-header";
import { useCounterLock } from "./counter-lock";
import {
  CUSTOM_AMOUNT_ID,
  chosenSessionId,
  customAmountTile,
  formatClock,
  posCollectionKey,
  saleReference,
  tenderAfterKey,
  toCategoryTabs,
  toHeldSales,
  toProductTiles,
} from "./counter-model";
import { deviceRows, type PosClientProps } from "./counter-props";
import { CounterSheets, type CounterSheet } from "./counter-sheets";
import {
  posAddLine,
  posCancelSale,
  posCreateDraft,
  posRemoveLine,
  posReprice,
  posResolveScanCode,
  posStartCollection,
  posSubmitPrep,
  posUpdateLine,
} from "./actions";

type PaidSale = { amountCents: number; tenderedCents: number; changeCents: number; receiptCode: string | null };

export function PosClient(props: PosClientProps) {
  const router = useRouter();
  const { copy, sale } = props;
  const online = useOnline();

  const [destination, setDestination] = useState<Destination>("sell");
  const [busy, setBusy] = useState(false);
  // The sale version the last accepted write was made against. Until the
  // refresh delivers a newer one, the screen is still looking at a version
  // the engine has already moved past, and a second tap would be refused as
  // a conflict (`saleReloading`) for no fault of the cashier's. Derived, not
  // effectful: it clears itself the moment `props.sale.version` changes.
  const [writtenVersion, setWrittenVersion] = useState<number | null>(null);
  const [refusal, setRefusal] = useState<PosRefusalReason | null>(null);
  // Starts as the sale's last accepted write (the row's `updated_at`), then
  // the clock of each write this screen makes.
  const [savedAt, setSavedAt] = useState<string | null>(props.savedAt);

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState(ALL_CATEGORIES_ID);
  const [sessionByProduct, setSessionByProduct] = useState<Record<string, string>>({});
  const [service, setService] = useState<"here" | "toGo">("here");
  const [pickupAtLocal, setPickupAtLocal] = useState("");

  const [sheet, setSheet] = useState<CounterSheet | null>(null);
  const [discountRefused, setDiscountRefused] = useState<null | "notCombinable" | "refused">(null);

  const [collectOpen, setCollectOpen] = useState(false);
  const [method, setMethod] = useState<PosCollectionMethodId>("cash");
  const [tenderedCents, setTenderedCents] = useState(0);
  // Has the operator pressed a key since the sheet opened — see `tenderAfterKey`.
  const [tenderTouched, setTenderTouched] = useState(false);
  const [paid, setPaid] = useState<PaidSale | null>(null);
  const [cashDone, setCashDone] = useState(false);
  const [receiptCopied, setReceiptCopied] = useState(false);

  const [receiptsDay, setReceiptsDay] = useState<"today" | "yesterday" | "week">("today");
  const [receiptsQuery, setReceiptsQuery] = useState("");
  const [scanCode, setScanCode] = useState("");
  const [scanToast, setScanToast] = useState<ScanToast | null>(null);
  const dismissScanToast = useCallback(() => setScanToast(null), []);

  const customer = useCounterCustomer(copy.customer);
  const till = useCounterLock({
    people: props.people,
    signedInName: props.cashierName,
    drawerOwnerName: props.shift ? props.cashierName : null,
    peopleHref: `${props.workspacePath}/people`,
    copy: { ...copy.lock, refusal: copy.engineRefusal },
  });
  const engine = useCounterEngine({
    sale,
    lines: props.basketLines,
    currency: props.currency,
    locale: props.locale,
    people: props.people,
    limitCents: props.customAmountLimitCents,
    cashierName: till.operatorName,
    workspaceName: props.workspaceName,
    customerName: customer.attached?.displayName ?? null,
    customerId: customer.attached?.id ?? sale?.customerId ?? null,
    paymentLinks: props.paymentLinks,
    linkProvider: props.linkProvider,
    copy: { custom: copy.custom, booking: copy.booking, tip: copy.tip, paymentLink: copy.paymentLink, refusal: copy.engineRefusal, reload: copy.refusal.reload },
    onWritten: () => {
      setSavedAt(formatClock(new Date().toISOString(), props.locale));
      router.refresh();
    },
    onOpenCustomer: customer.open,
    onCollect: () => {
      setTenderedCents(sale?.outstandingCents ?? 0);
      setTenderTouched(false);
      setMethod("cash");
      setCollectOpen(true);
    },
  });

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
      // `false` for a command whose caller navigates next (opening a sale):
      // a refresh of the OLD address racing that push painted the sale-less
      // page over a sale that was already open, and the next tap opened a
      // second one.
      refresh = true,
    ): Promise<T> => {
      setBusy(true);
      setRefusal(null);
      try {
        const result = await fn();
        const refused = refusalFromResult(result, kind);
        if (refused === "capacityGone") {
          const lapsed = props.basketLines.find((line) => line.sessionId);
          if (lapsed) setSheet({ kind: "expired", lineId: lapsed.id });
          else setRefusal(refused);
        } else {
          setRefusal(refused);
        }
        if (!refused) {
          setSavedAt(formatClock(new Date().toISOString(), props.locale));
          if (kind === "sale" && sale) setWrittenVersion(sale.version);
          if (refresh) router.refresh();
        }
        return result;
      } finally {
        setBusy(false);
      }
    },
    [props.basketLines, props.locale, router, sale],
  );
  const settling = writtenVersion !== null && sale !== null && sale.version === writtenVersion;
  // The customer display's own write (a tip) on this device: hold the next
  // command until the re-read has delivered that version (D-POS-88).
  const beacon = useCounterDisplayBeacon({ tenantId: props.tenantId, orderId: sale?.orderId ?? null, version: sale?.version ?? null });
  const working = busy || settling || beacon.stale;

  const resetForNewSale = useCallback(() => {
    setPaid(null);
    setCashDone(false);
    setCollectOpen(false);
    setTenderedCents(0);
    setDiscountRefused(null);
    setSheet(null);
    customer.reset();
  }, [customer]);

  /** Open a draft. `navigate` pushes to it at once; a caller adding a first line pushes after the line lands. */
  const startSale = useCallback(
    async (navigate = true): Promise<{ orderId: string; version: number } | null> => {
      const result = await run("sale", () => posCreateDraft(), false);
      if (result.ok && "orderId" in result && typeof result.orderId === "string") {
        resetForNewSale();
        if (navigate) router.push(saleHref(result.orderId));
        return { orderId: result.orderId, version: 1 };
      }
      return null;
    },
    [resetForNewSale, router, run, saleHref],
  );

  /**
   * A tap on a tile. With no sale open, the tap opens one AND adds the item
   * (`POSEmptySale`: the basket says "tap a product" and means it). The
   * first line is written BEFORE the address changes, so the sale the push
   * renders already carries it; a refresh racing that push is what lost the
   * first item and opened a second sale on the next tap.
   */
  const addItem = useCallback(
    async (productId: string, variantId: string | null = null) => {
      const item = props.catalog.find((row) => row.id === productId);
      const sessionId = chosenSessionId(item, sessionByProduct);
      // A SECOND TAP ON THE SAME THING IS ONE MORE UNIT, NOT A SECOND LINE
      // (`POSCounter`: `2 · Latte · $90 each`). The same offering, the same
      // variant, the same session, on a line that has not gone to
      // preparation: the quantity goes up through the line's own writer.
      // Anything else is a new line, which is what a second tap means when
      // the first was sent to the kitchen.
      const twin = sale
        ? props.basketLines.find(
            (line) =>
              !line.locked &&
              line.offeringId === productId &&
              (line.variantId ?? null) === variantId &&
              (line.sessionId ?? null) === sessionId,
          )
        : undefined;
      if (sale && twin) {
        const bumped = await run("sale", () =>
          posUpdateLine({ orderId: sale.orderId, lineId: twin.id, units: twin.units + 1, expectedVersion: sale.version }),
        );
        return bumped.ok ? sale.orderId : null;
      }
      const opening = !sale;
      const target = sale
        ? { orderId: sale.orderId, expectedVersion: sale.version }
        : await startSale(false).then((s) => (s ? { orderId: s.orderId, expectedVersion: s.version } : null));
      if (!target) return null;
      const added = await run(
        "sale",
        () => posAddLine({ ...target, offeringId: productId, units: 1, sessionId, variantId }),
        !opening,
      );
      if (opening && added.ok) router.push(saleHref(target.orderId));
      return added.ok ? target.orderId : null;
    },
    [props.basketLines, props.catalog, router, run, sale, saleHref, sessionByProduct, startSale],
  );

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
      const tendered = tender === "cash" ? Math.max(tenderedCents, amountCents) : undefined;
      const result = await run("sale", () =>
        posStartCollection({
          orderId: sale.orderId,
          method: tender,
          email: customer.email.trim() || undefined,
          phone: customer.phone.trim() || undefined,
          displayName: customer.displayName,
          amountCents: amountCents > 0 ? amountCents : undefined,
          tenderedCents: tendered,
          idempotencyKey: posCollectionKey({ orderId: sale.orderId, version: sale.version, method: tender, amountCents }),
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
          tenderedCents: tendered ?? amountCents,
          changeCents: Number(result.changeCents ?? 0),
          receiptCode: props.receiptCode,
        });
        setCashDone(true);
        setCollectOpen(false);
        setTenderedCents(0);
      }
    },
    [customer.displayName, customer.email, customer.phone, props.receiptCode, run, sale, tenderedCents],
  );

  /**
   * A SCAN IS A TAP ON A TILE. The code is looked up (`posResolveScanCode`:
   * an offering id, or a link code whose row names one), and the item goes
   * into the basket through `posAddLine`, the same write a tile uses. With no
   * sale open, a scan opens one first. The outcome is one sentence in the
   * toast; `Undo` removes the line the scan just added.
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
      const before = new Set(props.basketLines.map((line) => line.id));
      const orderId = await addItem(resolved.offeringId);
      if (!orderId) return;
      const priced = props.catalog.find((row) => row.id === resolved.offeringId);
      setScanToast({
        kind: "added",
        sentence: `${interpolate(copy.scan.added, { name: resolved.title })}${priced ? ` · ${formatOrderMoney(priced.amountCents, props.currency)}` : ""}`,
        detail: copy.scan.addedDetail,
        onUndo: () => {
          const added = props.basketLines.find((line) => !before.has(line.id));
          setScanToast(null);
          if (!sale || !added) return;
          void run("sale", () => posRemoveLine({ orderId: sale.orderId, lineId: added.id, expectedVersion: sale.version }));
        },
      });
      setDestination("sell");
      setScanCode("");
    },
    [addItem, copy.scan, props.basketLines, props.catalog, props.currency, run, sale],
  );

  const receiptHref = paid?.receiptCode && props.receiptOrigin ? `${props.receiptOrigin}/r/${paid.receiptCode}` : null;

  const products = [...toProductTiles(props.catalog, props.currency, sessionByProduct), customAmountTile(props.currency, copy.customAmountTitle)];
  const categories = toCategoryTabs(props.catalog, copy.categories);
  const needle = search.trim().toLowerCase();
  const visibleProducts = needle === "" ? products : products.filter((p) => p.title.toLowerCase().includes(needle));
  const held = toHeldSales(
    props.openSales,
    props.currency,
    sale?.orderId ?? null,
    (orderId) => `${copy.heldSaleLabel} ${saleReference(orderId)}`,
    (iso) => formatClock(iso, props.locale),
  );
  const amountDueCents = sale?.outstandingCents ?? 0;
  const reference = sale ? saleReference(sale.orderId) : null;
  const readerReady = false; // The counter cannot drive a reader yet (`collectionMethods` in page.tsx).

  /**
   * `Send N items`: the sale to preparation. `To go` is a pickup with the
   * promised time the row below asks for; `Here` is a table ticket when the
   * check was opened from the floor (the sale carries a space), else a
   * counter ticket. A second send on a sale already sent is an amendment,
   * which the engine records as a new revision on the same ticket.
   */
  const sendPrep =
    sale && props.basketLines.length > 0
      ? () => {
          const when = service === "toGo" ? new Date(pickupAtLocal) : null;
          const ahead = when !== null && !Number.isNaN(when.getTime()) && when.getTime() > Date.now();
          const prepDestination = service === "toGo" ? "pickup" : sale.spaceId ? "table" : "counter";
          void run("sale", async () =>
            service === "toGo" && !ahead
              ? { ok: false as const, error: "pickup_window" }
              : posSubmitPrep({ orderId: sale.orderId, destination: prepDestination, promisedAt: ahead && when ? when.toISOString() : null }),
          );
        }
      : null;
  const sentBefore = Boolean(sale && sale.prepState !== "not_submitted");

  const prepRow = service === "toGo" && sale && props.basketLines.length > 0 && (
    <label className="flex items-center gap-3 border-t border-admin-border bg-admin-card px-4 py-2 text-[13px] text-admin-ink-muted">
      {copy.page.pickupReadyAt}
      <input
        id="pos-pickup-at"
        type="datetime-local"
        value={pickupAtLocal}
        onChange={(event) => setPickupAtLocal(event.target.value)}
        className="h-10 flex-1 rounded-[10px] border-[1.5px] border-admin-border bg-admin-card px-3 text-[14px] text-admin-ink"
      />
    </label>
  );

  const sellScreen = (
    <div className="relative flex min-h-0 flex-1 max-[900px]:flex-col">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        <SellSurface
          products={visibleProducts}
          categories={categories}
          activeCategoryId={category}
          onSelectCategory={setCategory}
          searchValue={search}
          onSearchChange={setSearch}
          onSelectProduct={(productId) => {
            if (productId === CUSTOM_AMOUNT_ID) {
              // The sheet opens at once; with no sale open, one is started
              // underneath it and the write lands on it (`POSEmptySale`).
              engine.openCustom();
              if (!sale) void startSale();
              return;
            }
            if (working) return;
            void addItem(productId);
          }}
          onSelectVariant={(productId, variantId) => setSessionByProduct((current) => ({ ...current, [productId]: variantId }))}
          onSelectOption={(productId, optionId) => {
            if (working) return;
            void addItem(productId, optionId);
          }}
          onOpenScan={() => setDestination("scan")}
          copy={copy.sell}
        />
        <ScanStatus toast={scanToast} onDismiss={dismissScanToast} copy={copy.scan} />
      </div>
      <div className="flex min-h-0 flex-col max-[900px]:max-h-[50%]">
        <Basket
          lines={props.basketLines}
          currency={props.currency}
          discountCents={sale?.discountCents ?? 0}
          tipCents={sale?.tipCents ?? 0}
          onOpenTip={sale && sale.paymentState === "unpaid" ? engine.openTip : undefined}
          onApproveLine={engine.openApproval}
          taxState={props.taxState}
          customerName={customer.attached?.displayName ?? null}
          onOpenCustomer={customer.open}
          onOpenBooking={engine.openBooking}
          service={service}
          onServiceChange={setService}
          onEditLine={(lineId) => setSheet({ kind: "line", lineId })}
          onOpenDiscount={() => {
            setDiscountRefused(null);
            setSheet({ kind: "discount" });
          }}
          onCharge={() => {
            if (working) return;
            setTenderedCents(amountDueCents);
            setTenderTouched(false);
            setMethod("cash");
            setCollectOpen(true);
          }}
          onHold={() => setSheet({ kind: "hold" })}
          onSend={sendPrep}
          sentBefore={sentBefore}
          heldCount={held.length}
          onOpenHeld={() => setDestination("orders")}
          chargeLoading={working}
          offline={!online}
          savedAt={savedAt}
          hasSale={Boolean(sale)}
          copy={copy.basket}
        />
        {prepRow}
      </div>
    </div>
  );

  const collectScreen = sale && (
    <CollectSheet
      amountDueCents={amountDueCents}
      currency={props.currency}
      methods={props.methods}
      activeMethod={method}
      onSelectMethod={setMethod}
      tenderedCents={tenderedCents}
      onKeypadPress={(key) => {
        setTenderedCents((current) => (key === "00" ? tenderAfterKey(tenderAfterKey(current, tenderTouched, "0"), true, "0") : tenderAfterKey(current, tenderTouched, key)));
        setTenderTouched(true);
      }}
      onTender={(cents) => {
        setTenderedCents(cents);
        setTenderTouched(true);
      }}
      onConfirmCash={() => void collect("cash")}
      linkPanel={engine.paymentLinkPanel}
      confirmLoading={working}
      onBack={() => setCollectOpen(false)}
      backLabel={copy.page.backToSale}
      summary={[
        { label: copy.basket.subtotal, amountCents: sale.totalCents + sale.discountCents - sale.tipCents },
        ...(sale.discountCents > 0 ? [{ label: copy.basket.discount, amountCents: sale.discountCents, negative: true }] : []),
        ...(sale.tipCents > 0 ? [{ label: copy.basket.tip, amountCents: sale.tipCents }] : []),
      ]}
      copy={copy.collect}
    />
  );

  /**
   * The paid screen. TAKING THE MONEY IS NOT THE END OF THE SALE: a pickup
   * order is paid at the counter and only THEN sent, so `Send N items` stays
   * reachable here as well as beside the basket.
   */
  const paidScreen = paid && !cashDone && (
    <div className="flex flex-1 flex-col items-center gap-4 overflow-y-auto p-6">
      <PaidScreen
        amountCents={paid.amountCents}
        changeCents={paid.changeCents}
        currency={props.currency}
        onPrintReceipt={() => {
          if (receiptHref) window.open(receiptHref, "_blank", "noopener,noreferrer");
        }}
        onEmailReceipt={() => {
          if (!receiptHref) return;
          window.location.href = `mailto:${encodeURIComponent(customer.email.trim())}?body=${encodeURIComponent(receiptHref)}`;
        }}
        onNextCustomer={() => void startSale()}
        copy={copy.paid}
      />
      {receiptHref && (
        <div className={`${POS_SURFACE} flex w-full max-w-[520px] flex-col gap-2 p-4`}>
          <p className="m-0 text-[12px] font-bold uppercase tracking-[0.06em] text-admin-ink-muted">{copy.page.receiptLink}</p>
          <a href={receiptHref} target="_blank" rel="noopener noreferrer" data-pos-receipt-link className="break-all text-[14px] text-admin-ink underline">
            {receiptHref}
          </a>
          <button
            type="button"
            className={POS_SECONDARY_ACTION}
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
      {sendPrep && (
        <div className={`${POS_SURFACE} flex w-full max-w-[520px] flex-col gap-3 p-4`}>
          <div className={POS_SEGMENT_TRACK} role="group" aria-label={`${copy.basket.here} / ${copy.basket.toGo}`}>
            <button type="button" aria-pressed={service === "here"} onClick={() => setService("here")} className={cn(POS_SEGMENT, service === "here" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}>
              {copy.basket.here}
            </button>
            <button type="button" aria-pressed={service === "toGo"} onClick={() => setService("toGo")} className={cn(POS_SEGMENT, service === "toGo" ? POS_SEGMENT_ACTIVE : POS_SEGMENT_IDLE)}>
              {copy.basket.toGo}
            </button>
          </div>
          {prepRow}
          <button type="button" data-pos-send disabled={busy} onClick={sendPrep} className={POS_SECONDARY_ACTION}>
            {sentBefore
              ? interpolate(copy.basket.sendAgain, { count: props.basketLines.length })
              : props.basketLines.length === 1
                ? copy.basket.sendOne
                : interpolate(copy.basket.send, { count: props.basketLines.length })}
          </button>
        </div>
      )}
    </div>
  );

  const devices = deviceRows(props, copy.deviceRows, {
    openScan: () => setDestination("scan"),
    openDisplay: () =>
      window.open(sale ? `${props.posPath}/display?order=${encodeURIComponent(sale.orderId)}` : `${props.posPath}/display`, "_blank", "noopener,noreferrer"),
  });

  const header = counterHeader({
    destination,
    props,
    receiptsDay,
    heldCount: held.length,
    collectOpen,
    collectName: customer.attached?.displayName ?? null,
    reference,
  });
  const displayHref = sale ? `${props.posPath}/display?order=${encodeURIComponent(sale.orderId)}` : `${props.posPath}/display`;

  const body =
    destination === "orders" ? (
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto px-6 py-5">
        <HeldSalesList sales={held} onResume={(orderId) => { setDestination("sell"); router.push(saleHref(orderId)); }} copy={copy.held} />
      </div>
    ) : destination === "receipts" ? (
      <ReceiptsScreen rows={props.receipts} day={receiptsDay} onDayChange={setReceiptsDay} query={receiptsQuery} onQueryChange={setReceiptsQuery} copy={copy.receipts} />
    ) : destination === "shifts" ? (
      <CounterDrawer
        shift={props.shift}
        currency={props.currency}
        minorUnitDivisor={props.minorUnitDivisor}
        locale={props.locale}
        cashierName={props.cashierName}
        people={props.people}
        busy={busy}
        run={run}
        onRefuse={setRefusal}
        onRefresh={() => router.refresh()}
        copy={copy.drawer}
        movementCopy={copy.movement}
        engineRefusal={copy.engineRefusal}
      />
    ) : destination === "issues" ? (
      <IssuesScreen copy={copy.issues} />
    ) : destination === "devices" ? (
      <DevicesScreen devices={devices} online={online} linksAvailable={props.methods.some((m) => m.id === "link" && m.available)} copy={copy.devices} />
    ) : destination === "connection" ? (
      <ConnectionScreen online={online} readerReady={readerReady} onTryAgain={() => router.refresh()} copy={copy.connection} />
    ) : destination === "scan" ? (
      <div className="relative flex min-h-0 flex-1 flex-col">
        <ScanScreen code={scanCode} onCodeChange={setScanCode} onLookUp={() => void scan(scanCode.trim())} busy={busy} copy={copy.scanScreen} />
        <ScanStatus toast={scanToast} onDismiss={dismissScanToast} copy={copy.scan} />
      </div>
    ) : paidScreen || (collectOpen ? collectScreen : sellScreen);

  return (
    <div className="relative flex h-[calc(100vh-var(--proto-cbar,50px))] min-h-[560px] w-full flex-col overflow-hidden">
      <ScannerListener onScan={(code) => void scan(code)} enabled={(destination === "sell" || destination === "scan") && !paid && !collectOpen && sheet === null} />
      <PosFrame
        mode={props.mode}
        navLabel={copy.frame.navLabel}
        activeDestination={destination === "scan" ? "sell" : destination}
        onSelectDestination={(id) => {
          if (isDestination(id)) setDestination(id);
        }}
        destinationLabels={copy.frame.destinationLabels}
        counts={{ orders: held.length }}
        modeLabel={copy.modeLabel}
        modeEyebrow={copy.chrome.modeEyebrow}
        lock={{ label: copy.chrome.lock, onLock: till.lock }}
        workspace={{ label: copy.chrome.workspace, href: props.workspacePath }}
        className="flex-1"
      >
        <PosHeader
          title={header.title}
          subtitle={header.subtitle}
          alert={!online ? { label: copy.chrome.offlineChip, onSelect: () => setDestination("connection") } : props.readerConfigured ? { label: copy.chrome.readerOffChip, onSelect: () => setDestination("devices") } : null}
          location={props.workspaceName}
          cashier={{ initials: initialsOf(till.operatorName), label: `${till.operatorName} · ${props.shift ? copy.chrome.drawerOpen : copy.chrome.drawerNone}` }}
          cashierMenuLabel={copy.chrome.cashierMenu}
          cashierMenu={[
            { id: "switch", label: copy.chrome.switchOperator, onSelect: till.openSwitch },
            { id: "devices", label: copy.chrome.devices, onSelect: () => setDestination("devices") },
            { id: "connection", label: copy.chrome.connection, onSelect: () => setDestination("connection") },
            // The customer display opens as a second window (`POSDevices`:
            // "display as a window"). It sits under the cashier chip with the
            // other device doors, not on the rail: the board's rail is the
            // five destinations, Lock and Workspace, nothing else.
            { id: "display", label: copy.displayLink.label, href: displayHref },
          ]}
          portraitMenu={{
            label: copy.modeLabel,
            menuLabel: copy.frame.navLabel,
            items: [
              ...COUNTER_DESTINATIONS.filter((id) => id in copy.frame.destinationLabels).map((id) => ({ id, label: copy.frame.destinationLabels[id] ?? id, onSelect: () => setDestination(id) })),
              { id: "devices", label: copy.chrome.devices, onSelect: () => setDestination("devices") },
              { id: "connection", label: copy.chrome.connection, onSelect: () => setDestination("connection") },
              { id: "display", label: copy.displayLink.label, onSelect: () => window.open(displayHref, "_blank", "noopener,noreferrer") },
              { id: "workspace", label: copy.chrome.workspace, onSelect: () => router.push(props.workspacePath) },
            ],
          }}
        />
        {refusal && (
          <div className="px-6 pt-4">
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
        {engine.banner && <div className="px-6 pt-4">{engine.banner}</div>}
        <div className="relative flex min-h-0 flex-1 flex-col">
          {body}
          {customer.sheet}
          {engine.sheets}
          {till.overlay}
          <CounterSheets
            open={sheet}
            onChange={setSheet}
            lines={props.basketLines}
            currency={props.currency}
            saleReference={reference ?? ""}
            totalCents={sale?.totalCents ?? 0}
            discountCents={sale?.discountCents ?? 0}
            busy={working}
            discountRefused={discountRefused}
            onSaveLine={(lineId, units) => {
              if (!sale) return;
              void run("sale", () => posUpdateLine({ orderId: sale.orderId, lineId, units, expectedVersion: sale.version }));
            }}
            onDuplicateLine={(lineId) => {
              const line = props.basketLines.find((row) => row.id === lineId);
              if (!sale || !line || !line.offeringId) return;
              const offeringId = line.offeringId;
              void run("sale", () => posAddLine({ orderId: sale.orderId, offeringId, units: line.units, sessionId: line.sessionId ?? null, expectedVersion: sale.version }));
            }}
            onRemoveLine={(lineId) => {
              if (!sale) return;
              void run("sale", () => posRemoveLine({ orderId: sale.orderId, lineId, expectedVersion: sale.version }));
            }}
            onApplyCode={(code) => {
              if (!sale) return;
              void run("sale", async () => {
                const result = await posReprice({ orderId: sale.orderId, promoCode: code, expectedVersion: sale.version });
                setDiscountRefused(result.ok ? null : "reason" in result && result.reason === "promo_refused" ? "notCombinable" : "refused");
                return result;
              });
            }}
            onRemoveCode={() => {
              if (!sale) return;
              void run("sale", () => posReprice({ orderId: sale.orderId, expectedVersion: sale.version }));
            }}
            onDiscard={() => {
              if (!sale) return;
              void run("sale", async () => {
                const result = await posCancelSale(sale.orderId, sale.version);
                if (result.ok) {
                  resetForNewSale();
                  router.push(saleHref(null));
                }
                return result;
              });
            }}
            onHold={() => {
              // A hold is the draft staying open in Orders; nothing is written.
              resetForNewSale();
              router.push(saleHref(null));
            }}
            onPickAnotherSession={(lineId) => {
              if (!sale) return;
              void run("sale", () => posRemoveLine({ orderId: sale.orderId, lineId, expectedVersion: sale.version }));
            }}
            copy={{ line: copy.line, discount: copy.discount, hold: copy.hold, expired: copy.expired }}
          />
          {paid && (
            <CashDoneDialog
              open={cashDone}
              amountCents={paid.amountCents}
              tenderedCents={paid.tenderedCents}
              changeCents={paid.changeCents}
              currency={props.currency}
              onDone={() => setCashDone(false)}
              copy={copy.cashDone}
            />
          )}
        </div>
      </PosFrame>
    </div>
  );
}
