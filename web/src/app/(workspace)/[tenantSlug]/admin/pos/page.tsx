import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

// Copy comes from `pos-copy` and NOT the `@/components/admin/pos` barrel: the
// barrel re-exports every "use client" component of the frame, and a server
// import of it makes each one a client reference of THIS route — downloaded
// on every load, whichever mode renders. The modes import the frame
// themselves, inside their own chunks (`mode-clients.tsx`).
import {
  basketCopy,
  collectMethodUnavailableCopy,
  collectSheetCopy,
  counterPageCopy,
  customerPanelCopy,
  heldSalesListCopy,
  paidScreenCopy,
  posModeLabel,
  railCopy,
  railNavLabel,
  refusalCopy,
  sellSurfaceCopy,
  shiftBarCopy,
} from "@/components/admin/pos/pos-copy";
import type { PosBasketLine, PosCollectionMethodState } from "@/components/admin/pos";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { isKnownTenantRole } from "@/lib/access";
import { userHasCapability } from "@/lib/access";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import { addonCentsOnLine } from "@/lib/pos/addons";
import { listOpenPosSales, loadPosSale } from "@/lib/pos/draft";
import {
  POS_MODE_META,
  enabledPosModesFromSettings,
  modesForPerson,
  parsePosMode,
  sellingModesAllowCounter,
  type PosMode,
  type PosPersonRole,
} from "@/lib/pos/modes";
import { loadDoorTonight } from "@/lib/pos/door-tonight";
import { currentShift } from "@/lib/pos/shift";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { logServerError } from "@/lib/server/safe-error";
import { isStripeConfigured } from "@/lib/stripe/client";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { classesCopy, classesRailCopy, classesRailNavLabel } from "@/components/admin/pos/classes-copy";
import { clampDayOffset, loadClassesDay } from "@/lib/pos/classes/day";
import { loadWalkInServices } from "@/lib/pos/classes/walkin";
import { resolveTenantTimezone } from "@/lib/spaces/venues";

import { PageRouteSyncer } from "../_page-route-syncer";

import type { PosCatalogItem } from "./counter-model";
import { doorCopy } from "./door-copy";
import { FloorScreen } from "./floor-screen";
// The three client modes this route mounts directly, each behind
// `next/dynamic` so the register's initial bundle carries only the mode
// asked for (`mode-clients.tsx` says why). The floor and projects modes are
// server halves (`server-only`); their client halves go through the same file.
import { ClassesClient, DoorClient, PosClient } from "./mode-clients";
import { ProjectsModePage } from "./_projects/projects-mode-page";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type Search = Promise<{ order?: string; mode?: string; day?: string; project?: string; view?: string }>;

/**
 * `agency_memberships.role` as the POS mode vocabulary wants it.
 *
 * Fails to `viewer` — the rank with NO modes at all. A role string nobody
 * recognises must not be handed the till: the direction that costs an unknown
 * role a screen it should have had is a support ticket, the other direction is
 * a stranger taking money.
 */
function posRole(raw: unknown): PosPersonRole {
  const value = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  return isKnownTenantRole(value) ? value : "viewer";
}

/**
 * The browser-facing path of THIS request, so a redirect keeps the host shape
 * it arrived on.
 *
 * Middleware sets `x-impronta-original-pathname` before its branded rewrite,
 * so on `improntamodels.com` it reads `/admin/pos` and on the shared app host
 * `/impronta/admin/pos`. Rebuilding the path from the slug instead would hand
 * a custom-domain user `improntamodels.com/impronta/admin/pos`, which is the
 * doubled-prefix bug the admin layout documents.
 */
async function currentAdminPath(tenantSlug: string): Promise<string> {
  const hdrs = await headers();
  const fallback = `/${tenantSlug}/admin/pos`;
  const raw = hdrs.get("x-impronta-original-pathname") ?? fallback;
  return raw.split("?")[0] || fallback;
}

/**
 * Which tenders this counter can honestly offer, and the sentence for each one
 * it cannot.
 *
 * Every arm below is a REAL state read on the server, never an optimistic
 * default. The rule from the brief: a method with no provider behind it says
 * so rather than appearing to work.
 *
 *   cash — always. It is the one tender that needs nothing configured.
 *   link — the hosted Checkout path `startCollection` really drives
 *          (`method: "online_card"`). Live exactly when Stripe has a secret
 *          key; without one, `createCheckoutSessionForTransaction` returns a
 *          mock and a cashier would watch a customer "pay" nothing.
 *   card — CARD-PRESENT, a different thing from the link. `pos/actions.ts`
 *          accepts `cash | online_card` only, so no terminal request can be
 *          started from this screen whatever the environment says. It is
 *          therefore never offered as available, and the two reasons are kept
 *          apart: no reader configured at all, versus a reader that exists
 *          and that this surface cannot yet drive. Telling an operator with a
 *          working reader that they have no reader would send them to buy
 *          hardware they already own.
 *   pass — pass credits have NO table. `docs/plans/program/specs/counter.md`
 *          §3 records C20 as blocked for exactly that reason: there is no
 *          credit ledger to debit, so there is nothing to offer.
 */
function collectionMethods(tr: (key: string) => string): PosCollectionMethodState[] {
  const unavailable = collectMethodUnavailableCopy(tr);
  const terminal = reportTerminalAvailability();
  return [
    { id: "cash", available: true },
    isStripeConfigured()
      ? { id: "link", available: true }
      : { id: "link", available: false, unavailableReason: unavailable.link },
    terminal.available
      ? {
          id: "card",
          available: false,
          unavailableReason: tr("dashboard.pos.counter.collect.cardNotWired"),
        }
      : { id: "card", available: false, unavailableReason: unavailable.card },
    { id: "pass", available: false, unavailableReason: unavailable.pass },
  ];
}

export default async function PosPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: Search;
}) {
  const { tenantSlug } = await params;
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const allowed = await userHasCapability("booking.payment.request", scope.tenantId);
  if (!allowed) notFound();

  const locale = await getRequestLocale();
  const tr = await createTranslator(locale);
  const admin = createServiceRoleClient();
  if (!admin) notFound();

  // THE COUNTER IS A MODE THIS WORKSPACE CAN SWITCH OFF. This route IS the
  // counter (its rail is `POS_MODE_META.counter.destinations`), so when
  // Settings › Point of sale has the counter off, there is no register to
  // render. Refuse in a sentence in the reader's own language rather than
  // `notFound()`: the person following the link is staff who just turned it
  // off, and a 404 would not tell them why or where to turn it back on.
  const modesRes = await admin
    .from("agencies")
    .select("settings")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (modesRes.error) logServerError("pos.page.modes", modesRes.error);
  const enabledModes = enabledPosModesFromSettings(
    (modesRes.data as { settings?: unknown } | null)?.settings,
  );
  //
  // THE FLOOR IS NOT THE COUNTER. A workspace that has the counter off and
  // Tables on (a host stand with no register) still owns `?mode=floor`, so the
  // counter-off sentence is only for a request that would land on the
  // counter: no mode asked for, or the counter itself. A built, switched-on
  // sibling mode goes on to the person-and-mode resolution below.
  const q = await searchParams;
  const requestedEarly = parsePosMode(q.mode);
  const asksForOpenSibling =
    requestedEarly !== undefined &&
    requestedEarly !== "counter" &&
    POS_MODE_META[requestedEarly].built &&
    enabledModes.includes(requestedEarly);
  if (!sellingModesAllowCounter(enabledModes) && !asksForOpenSibling) {
    return (
      <>
        <PageRouteSyncer page="pos" />
        <main style={{ padding: "32px 28px", maxWidth: 720, margin: "0 auto" }}>
          <h1 style={{ fontSize: 26, fontWeight: 600, margin: 0 }}>
            {tr("dashboard.pos.counterOffTitle")}
          </h1>
          <p style={{ color: "rgba(11,11,13,0.55)", marginTop: 10, lineHeight: 1.6 }}>
            {tr("dashboard.pos.counterOffBody")}
          </p>
        </main>
      </>
    );
  }

  // ── Which modes this person may actually use ─────────────────────────
  //
  // Two facts, intersected: what this workspace has switched on
  // (`agencies.settings.pos.locations.default.modes`, which defaults to
  // `["counter"]` and NOT to an empty list), and what this person's rank is
  // eligible for. The PLATFORM kill switch is deliberately NOT part of this:
  // it gates the DOOR (the top-bar switch, and the phone's More sheet row),
  // so the counter ships dark while its own URL stays reachable for the people
  // building and QA'ing it. A route that 404s on the kill switch would make
  // the surface unverifiable until the day it is turned on for everyone.
  //
  // `display_name` rides along on the same read — NOT `name`, which does not
  // exist on this table and which PostgREST answers with 42703 for the WHOLE
  // select, settings included. That failure is invisible from the screen: the
  // mode parser's documented answer to a missing settings blob is
  // `["counter"]`, which is also the right answer for most workspaces, so a
  // broken read renders a working till. It cost one QA run to find.
  //
  // The name itself is here because the counter drops the sidebar, and the
  // sidebar's tenant chip was the only place the workspace's own name
  // appeared. Without it a cashier on two workspaces cannot tell which till
  // they are standing at, which is the one thing a person taking money must
  // not be unsure of.
  const settingsRow = await admin
    .from("agencies")
    .select("display_name, settings")
    .eq("id", scope.tenantId)
    .maybeSingle();
  if (settingsRow.error) logServerError("pos.page.settings", settingsRow.error);
  const agencyRow = settingsRow.data as {
    display_name?: string | null;
    settings?: unknown;
  } | null;
  const workspaceName = agencyRow?.display_name?.trim() || tenantSlug;
  const workspaceEnabledModes = enabledPosModesFromSettings(agencyRow?.settings);
  const usableModes = modesForPerson({
    role: posRole(scope.membership.role),
    workspaceEnabledModes,
  });

  // NOT `notFound()`. A person who is signed in, on a workspace they belong
  // to, looking at a real address, has not found nothing — they have found a
  // surface nobody has given them. Saying so is the difference between a
  // support ticket and a shrug.
  if (usableModes.length === 0) {
    return (
      <>
        <PageRouteSyncer page="pos" />
        <main className="mx-auto flex min-h-[60vh] w-full max-w-[560px] flex-col justify-center gap-3 px-7 py-16">
          <h1 className="m-0 text-[22px] font-semibold text-admin-ink">
            {tr("dashboard.pos.counter.gate.title")}
          </h1>
          <p className="m-0 text-[14px] leading-relaxed text-admin-ink-muted">
            {tr("dashboard.pos.counter.gate.body")}
          </p>
          <a
            href={await currentAdminPath(tenantSlug).then((p) => p.replace(/\/pos$/, ""))}
            className="mt-2 text-[14px] font-semibold text-admin-ink underline"
          >
            {tr("dashboard.pos.counter.gate.back")}
          </a>
        </main>
      </>
    );
  }

  const requested = parsePosMode(q.mode);
  const mode: PosMode | null =
    requested && usableModes.includes(requested) ? requested : null;
  if (!mode) {
    // A mode this person cannot use — a stale bookmark, a demoted cashier's
    // remembered tablet, a hand-typed URL — lands on the first one they can,
    // carrying whatever sale was already open.
    const path = await currentAdminPath(tenantSlug);
    const order = typeof q.order === "string" && q.order ? `&order=${encodeURIComponent(q.order)}` : "";
    redirect(`${path}?mode=${usableModes[0]}${order}`);
  }

  const railLabels = railCopy(tr);
  const frameCopy = { navLabel: railNavLabel(tr), destinationLabels: railLabels };

  if (!POS_MODE_META[mode].built) {
    // A mode the workspace switched on that has no screen behind it yet. The
    // frame and its rail still render, so the switch is not a dead end; the
    // panel says plainly that there is nothing here rather than showing an
    // empty counter that looks broken.
    return (
      <>
        <PageRouteSyncer page="pos" />
        <main className="flex min-h-[60vh] w-full flex-col gap-4 p-4">
          <h1 className="m-0 text-[18px] font-semibold text-admin-ink">
            {posModeLabel(tr, mode)}
          </h1>
          <p className="m-0 text-[14px] text-admin-ink-muted">
            {tr("dashboard.pos.counter.mode.notBuilt")}
          </p>
        </main>
      </>
    );
  }

  if (mode === "classes") {
    // ── Appointments & Classes: one venue day, read here, rendered there.
    //
    // The day is decided against the VENUE's zone (`resolveTenantTimezone`,
    // the same rung the Appointments board and the schedule use), never the
    // reader's clock. `day=<n>` pages from today; a hand-typed value is
    // clamped, not trusted.
    const { timezone } = await resolveTenantTimezone(scope.tenantId);
    const dayOffset = clampDayOffset(q.day);
    const [dayLoad, servicesLoad] = await Promise.all([
      loadClassesDay(admin, { tenantId: scope.tenantId, timeZone: timezone, now: new Date(), dayOffset }),
      loadWalkInServices(admin, scope.tenantId),
    ]);
    const classesPath = await currentAdminPath(tenantSlug);
    if (!dayLoad.ok) {
      return (
        <>
          <PageRouteSyncer page="pos" />
          <main className="flex min-h-[60vh] w-full flex-col gap-4 p-4">
            <h1 className="m-0 text-[18px] font-semibold text-admin-ink">{posModeLabel(tr, mode)}</h1>
            <p role="alert" className="m-0 text-[14px] text-admin-ink-muted">
              {tr("dashboard.pos.classes.refusal.unavailable")}
            </p>
          </main>
        </>
      );
    }
    if (!servicesLoad.ok) logServerError("pos.page.classes.services", new Error(servicesLoad.error));
    return (
      <>
        <PageRouteSyncer page="pos" />
        <ClassesClient
          tenantId={scope.tenantId}
          workspaceName={workspaceName}
          posPath={classesPath}
          locale={locale}
          currency="USD"
          day={dayLoad.day}
          services={servicesLoad.ok ? servicesLoad.services : []}
          copy={{
            frame: { navLabel: classesRailNavLabel(tr), destinationLabels: classesRailCopy(tr) },
            classes: classesCopy(tr),
            counterRefusal: refusalCopy(tr),
          }}
        />
      </>
    );
  }

  // ── The door ─────────────────────────────────────────────────────────
  //
  // Its own client, its own loader, the same frame, the same chrome. The
  // door takes cash only at this till (every other tender says so in a
  // sentence), and the money goes through the counter's own `startCollection`
  // so the shift's expected cash, the Payments page and the door's guest list
  // read the same rows. See `door-actions.ts` for why it is not `sellAtDoor`.
  if (mode === "door") {
    const tonight = await loadDoorTonight(admin, scope.tenantId);
    const doorHdrs = await headers();
    const doorHost = doorHdrs.get("x-forwarded-host") ?? doorHdrs.get("host") ?? "";
    const doorProto = doorHdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
    const cashOnly = tr("dashboard.pos.door.sell.cashOnly");
    return (
      <>
        <PageRouteSyncer page="pos" />
        <DoorClient
          tenantId={scope.tenantId}
          workspaceName={workspaceName}
          receiptOrigin={doorHost ? `${doorProto}://${doorHost}` : ""}
          locale={locale}
          zone={tonight.ok ? tonight.zone : "UTC"}
          nowIso={tonight.ok ? tonight.nowIso : new Date().toISOString()}
          sessions={tonight.ok ? tonight.sessions : []}
          tonightFailed={!tonight.ok}
          currency="USD"
          methods={[
            { id: "cash", available: true },
            { id: "card", available: false, unavailableReason: cashOnly },
            { id: "link", available: false, unavailableReason: cashOnly },
            { id: "pass", available: false, unavailableReason: cashOnly },
          ]}
          copy={{
            door: doorCopy(tr),
            collect: collectSheetCopy(tr),
            refusal: refusalCopy(tr),
            frameNavLabel: tr("dashboard.pos.door.rail.label"),
          }}
        />
      </>
    );
  }

  // ── The floor ────────────────────────────────────────────────────────
  //
  // A sibling of the counter in the same frame, entered from the same top-bar
  // switch. Its reads and writes are the workspace Spaces page's own
  // (`floor-screen.tsx`); this route only decides that `?mode=floor` means
  // that screen and hands it the identity the counter would have had.
  if (mode === "floor") {
    return (
      <>
        <PageRouteSyncer page="pos" />
        <FloorScreen
          admin={admin}
          tenantId={scope.tenantId}
          locale={locale}
          workspaceName={workspaceName}
          posPath={await currentAdminPath(tenantSlug)}
        />
      </>
    );
  }

  if (mode === "projects") {
    // The Projects mode: a sibling of the counter over the same engine. Its
    // data comes from the projects reader, not from the counter's catalog, so
    // it branches here before any of the counter's reads run. Same chrome,
    // same syncer, same host-shaped paths.
    const projectsHdrs = await headers();
    const projectsHost = projectsHdrs.get("x-forwarded-host") ?? projectsHdrs.get("host") ?? "";
    const projectsProto = projectsHdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
    const projectsPath = await currentAdminPath(tenantSlug);
    return (
      <>
        <PageRouteSyncer page="pos" />
        <ProjectsModePage
          tenantId={scope.tenantId}
          workspaceName={workspaceName}
          posPath={projectsPath}
          workspacePath={projectsPath.replace(/\/pos$/, "")}
          receiptOrigin={projectsHost ? `${projectsProto}://${projectsHost}` : ""}
          methods={collectionMethods(tr)}
          tr={tr}
          search={{ project: q.project, view: q.view }}
        />
      </>
    );
  }

  // ── The counter's data ───────────────────────────────────────────────
  const orderId = typeof q.order === "string" ? q.order : null;
  const now = new Date().toISOString();
  const [open, saleLoad, catalog, shiftLoad, upcoming] = await Promise.all([
    listOpenPosSales(admin, scope.tenantId),
    orderId && /^[0-9a-f-]{36}$/i.test(orderId)
      ? loadPosSale(admin, { tenantId: scope.tenantId, orderId })
      : Promise.resolve(null),
    admin
      .from("talent_offerings")
      .select("id, title, amount_cents, kind, owner_kind, status")
      .eq("tenant_id", scope.tenantId)
      .eq("owner_kind", "workspace")
      .eq("status", "published")
      .order("sort_order", { ascending: true }),
    currentShift(admin, { tenantId: scope.tenantId }),
    admin
      .from("sessions")
      .select("id, offering_id, title, starts_at")
      .eq("tenant_id", scope.tenantId)
      .eq("status", "scheduled")
      .gte("starts_at", now)
      .order("starts_at", { ascending: true })
      .limit(80),
  ]);
  if (catalog.error) logServerError("pos.page.catalog", catalog.error);
  if (upcoming.error) logServerError("pos.page.sessions", upcoming.error);

  const sale = saleLoad && saleLoad.ok ? saleLoad.sale : null;

  // The receipt's PUBLIC code, which is what "share the receipt" resolves.
  // `orders.receipt_code` is not on `ORDER_COLUMNS` (the shared read/write
  // shape both POS commands use), and widening that shared constant for one
  // screen's benefit is how a column gets added to a writer's select and
  // forgotten in a reader's — the defect `sale-rows.ts` was extracted during.
  // One extra tenant-scoped read here costs less than that risk.
  let receiptCode: string | null = null;
  if (sale) {
    const receipt = await admin
      .from("orders")
      .select("receipt_code")
      .eq("id", sale.orderId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (receipt.error) logServerError("pos.page.receiptCode", receipt.error);
    const code = (receipt.data as { receipt_code?: string | null } | null)?.receipt_code;
    receiptCode = typeof code === "string" && code ? code : null;
  }

  const sessionsByOffering = new Map<string, Array<{ id: string; title: string; startsAt: string }>>();
  for (const row of (upcoming.data ?? []) as Array<{
    id: string;
    offering_id: string | null;
    title: string | null;
    starts_at: string;
  }>) {
    if (!row.offering_id) continue;
    const list = sessionsByOffering.get(row.offering_id) ?? [];
    if (list.length >= 8) continue;
    list.push({
      id: row.id,
      title: row.title?.trim() || row.starts_at,
      startsAt: row.starts_at,
    });
    sessionsByOffering.set(row.offering_id, list);
  }

  const items: PosCatalogItem[] = ((catalog.data ?? []) as Array<{
    id: string;
    title: string | null;
    amount_cents: number | null;
    kind: string | null;
  }>).map((row) => ({
    id: row.id,
    title: row.title ?? row.id.slice(0, 8),
    amountCents: row.amount_cents ?? 0,
    kind: row.kind ?? "service",
    sessions: sessionsByOffering.get(row.id) ?? [],
  }));

  // The basket, built HERE and not in the browser: `addonCentsOnLine` is the
  // one function that recovers a line's extras from its stored total, and it
  // lives in a `server-only` module because the same file prices those extras
  // against the catalog. A second copy of that subtraction in the client is a
  // receipt that can disagree with the charge.
  const basketLines: PosBasketLine[] = (sale?.lines ?? []).map((line) => ({
    id: line.id,
    label: line.label,
    units: line.units,
    unitCents: line.unitCents,
    addonCents: addonCentsOnLine({
      unitCents: line.unitCents,
      units: line.units,
      totalCents: line.totalCents,
    }),
  }));

  const currency = sale?.currency ?? "USD";
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
  const adminPath = await currentAdminPath(tenantSlug);

  return (
    <>
      {/*
        THE SHELL HAS TO BE TOLD, NOT JUST THE URL.

        `WorkspaceShell` drops the workspace sidebar when `state.page` resolves
        to a destination carrying `chrome: "pos"` — it deliberately does NOT
        read the live pathname (that reads `null` during the server render and
        painted the rail for a frame on every hard refresh). On a HARD load the
        admin layout seeds `state.page` from the request path and the counter
        gets the whole screen. On a SOFT navigation the layout does not re-run,
        so without this the shell kept `page: "overview"`: the top bar's own
        Workspace/Counter switch — the only desktop door into the till — pushed
        `/admin/pos` and delivered the counter INSIDE the admin rail, with
        "Workspace" still reading as the selected half. Every static test
        passed, because each one measured a different half of the door.

        A syncer here rather than a `syncPage` call in the switch: it mounts
        with THIS route's own children, so every way in (the switch, a
        bookmark, a link from anywhere else in the shell) lands in the same
        chrome, and there is no frame where the layout has changed but the
        route has not.
      */}
      <PageRouteSyncer page="pos" />
      <PosClient
        mode={mode}
        workspaceName={workspaceName}
        posPath={adminPath}
        workspacePath={adminPath.replace(/\/pos$/, "")}
        receiptOrigin={host ? `${proto}://${host}` : ""}
        receiptCode={receiptCode}
        sale={
          sale
            ? {
                orderId: sale.orderId,
                version: sale.version,
                currency: sale.currency,
                customerId: sale.customerId,
                discountCents: sale.discountCents,
                totalCents: sale.totalCents,
                outstandingCents: sale.outstandingCents,
                paymentState: sale.paymentState,
                prepState: sale.prepState,
              }
            : null
        }
        basketLines={basketLines}
        openSales={open.ok ? open.rows : []}
        catalog={items}
        currency={currency}
        minorUnitDivisor={minorUnitDivisor(currency)}
        methods={collectionMethods(tr)}
        shift={
          shiftLoad.ok && shiftLoad.shift
            ? {
                id: shiftLoad.shift.id,
                version: shiftLoad.shift.version,
                openingCashCents: shiftLoad.shift.openingCashCents,
                openedAt: shiftLoad.shift.openedAt,
              }
            : null
        }
        copy={{
          frame: frameCopy,
          sell: sellSurfaceCopy(tr),
          basket: basketCopy(tr),
          customer: customerPanelCopy(tr),
          collect: collectSheetCopy(tr),
          paid: paidScreenCopy(tr),
          held: heldSalesListCopy(tr),
          shiftBar: shiftBarCopy(tr),
          refusal: refusalCopy(tr),
          page: counterPageCopy(tr),
          heldSaleLabel: tr("dashboard.pos.counter.held.saleLabel"),
          categories: {
            service: tr("dashboard.pos.counter.category.service"),
            package: tr("dashboard.pos.counter.category.package"),
            product: tr("dashboard.pos.counter.category.product"),
          },
          legacy: {
            contactHint: tr("dashboard.pos.contactHint"),
            email: tr("dashboard.pos.email"),
            phone: tr("dashboard.pos.phone"),
            guest: tr("dashboard.pos.guest"),
            outstanding: tr("dashboard.pos.outstanding"),
            sendToPrep: tr("dashboard.pos.sendToPrep"),
            prepDestination: tr("dashboard.pos.prepDestination"),
            prepPickup: tr("dashboard.pos.prepPickup"),
            prepTable: tr("dashboard.pos.prepTable"),
            prepCounter: tr("dashboard.pos.prepCounter"),
            prepPromisedAt: tr("dashboard.pos.prepPromisedAt"),
            pageTitle: tr("dashboard.pos.pageTitle"),
            newSale: tr("dashboard.pos.newSale"),
            amount: tr("dashboard.pos.amount"),
          },
        }}
      />
    </>
  );
}
