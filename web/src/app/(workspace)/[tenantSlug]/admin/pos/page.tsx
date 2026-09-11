import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";

// Copy comes from `pos-copy` and NOT the `@/components/admin/pos` barrel: the
// barrel re-exports every "use client" component of the frame, and a server
// import of it makes each one a client reference of THIS route — downloaded
// on every load, whichever mode renders. The modes import the frame
// themselves, inside their own chunks (`mode-clients.tsx`).
import {
  basketCopy,
  cashDoneCopy,
  cashDrawerCopy,
  chromeCopy,
  collectMethodUnavailableCopy,
  collectSheetCopy,
  connectionCopy,
  counterPageCopy,
  customAmountCopy,
  customerSheetCopy,
  deviceRowsCopy,
  devicesCopy,
  discountSheetCopy,
  heldSalesListCopy,
  holdExpiredCopy,
  holdSaleCopy,
  issuesCopy,
  lineEditCopy,
  linkBookingCopy,
  paidScreenCopy,
  posModeLabel,
  railCopy,
  railNavLabel,
  receiptsCopy,
  refusalCopy,
  scanScreenCopy,
  sellSurfaceCopy,
} from "@/components/admin/pos/pos-copy";
import type { PosBasketLine, PosCollectionMethodState, PosReceiptRow } from "@/components/admin/pos";
import { customerDisplayLinkCopy, scanCopy } from "@/components/admin/pos/customer-display-copy";
import { createTranslator } from "@/i18n/messages";
import { getRequestLocale } from "@/i18n/request-locale";
import { isKnownTenantRole } from "@/lib/access";
import { userHasCapability } from "@/lib/access";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { reportTerminalAvailability } from "@/lib/payments/terminal-availability";
import { orderTax } from "@/lib/catalog/tax";
import { addonCentsOnLine } from "@/lib/pos/addons";
import { listOpenPosSales, loadPosSale } from "@/lib/pos/draft";
import { listPaidPosSales } from "@/lib/pos/sale-read";
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
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { classesCopy, classesRailCopy, classesRailNavLabel } from "@/components/admin/pos/classes-copy";
import { clampDayOffset, loadClassesDay } from "@/lib/pos/classes/day";
import { loadClassesExtras } from "@/lib/pos/classes/extras";
import { loadWalkInServices } from "@/lib/pos/classes/walkin";
import { resolveTenantTimezone } from "@/lib/spaces/venues";

import { PageRouteSyncer } from "../_page-route-syncer";

import { loadCounterCatalog, loadCounterLineFacts } from "./counter-catalog";
import { formatClock } from "./counter-model";
import { doorCopy } from "./door-copy";
import { receiptRows } from "./receipt-rows";
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
 * The signed-in person, as the cashier chip names them: the profile's own
 * display name, else the account's email up to the `@`, else nothing. Read
 * with the service role by the user's own id (the session says who they
 * are; the profile row is not RLS-readable through the anon client here).
 */
async function loadCashierName(admin: NonNullable<ReturnType<typeof createServiceRoleClient>>): Promise<string> {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return "";
  const auth = await supabase.auth.getUser();
  if (auth.error) logServerError("pos.page.cashier.auth", auth.error);
  const user = auth.data.user;
  if (!user) return "";
  const profile = await admin
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle<{ display_name: string | null }>();
  if (profile.error) logServerError("pos.page.cashier", profile.error);
  const name = profile.data?.display_name?.trim();
  return name || user.email?.split("@")[0] || "";
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
  const defaultLoc = await admin
    .from("venue_locations")
    .select("name")
    .eq("tenant_id", scope.tenantId)
    .eq("is_default", true)
    .maybeSingle();
  if (defaultLoc.error) logServerError("pos.page.venue_locations", defaultLoc.error);
  const locationName =
    (typeof (defaultLoc.data as { name?: string | null } | null)?.name === "string" &&
      (defaultLoc.data as { name: string }).name.trim()) ||
    workspaceName;
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
    const now = new Date();
    const [dayLoad, servicesLoad, extrasLoad, venueRead] = await Promise.all([
      loadClassesDay(admin, { tenantId: scope.tenantId, timeZone: timezone, now, dayOffset }),
      loadWalkInServices(admin, scope.tenantId),
      loadClassesExtras(admin, scope.tenantId),
      // The location pill (B01): the workspace's venue, when it names one.
      admin.from("venues").select("name").eq("tenant_id", scope.tenantId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
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
    if (!extrasLoad.ok) logServerError("pos.page.classes.extras", new Error(extrasLoad.error));
    if (venueRead.error) logServerError("pos.page.classes.venue", venueRead.error);
    const venueName = typeof venueRead.data?.name === "string" && venueRead.data.name.trim() ? venueRead.data.name.trim() : null;
    // The operator pill (B01): the signed-in person, by their own name.
    const sessionClient = await createSupabaseServerClient();
    const signedIn = sessionClient ? (await sessionClient.auth.getUser()).data.user : null;
    const metadataName = (signedIn?.user_metadata as { full_name?: unknown } | null)?.full_name;
    const operatorName =
      (typeof metadataName === "string" && metadataName.trim()) || signedIn?.email?.split("@")[0] || "";
    return (
      <>
        <PageRouteSyncer page="pos" />
        <ClassesClient
          tenantId={scope.tenantId}
          workspaceName={workspaceName}
          venueName={venueName ?? locationName}
          operatorName={operatorName}
          posPath={classesPath}
          workspacePath={classesPath.replace(/\/pos$/, "")}
          modeLabel={posModeLabel(tr, mode)}
          locale={locale}
          currency="USD"
          nowIso={now.toISOString()}
          day={dayLoad.day}
          services={servicesLoad.ok ? servicesLoad.services : []}
          extras={extrasLoad.ok ? extrasLoad.extras : []}
          copy={{
            frame: { navLabel: classesRailNavLabel(tr), destinationLabels: classesRailCopy(tr) },
            classes: classesCopy(tr),
            counterRefusal: refusalCopy(tr),
            chrome: chromeCopy(tr),
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
    const doorPath = await currentAdminPath(tenantSlug);
    const doorRequestedAt = new Date();
    const doorWeekAgo = new Date(doorRequestedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const [tonight, doorCashier, doorShift, doorPaid] = await Promise.all([
      loadDoorTonight(admin, scope.tenantId),
      loadCashierName(admin),
      currentShift(admin, { tenantId: scope.tenantId }),
      // The door's Receipts rail: the door's own paid sales through the till.
      listPaidPosSales(admin, { tenantId: scope.tenantId, sinceIso: doorWeekAgo, sourcePage: "door" }),
    ]);
    const doorHdrs = await headers();
    const doorHost = doorHdrs.get("x-forwarded-host") ?? doorHdrs.get("host") ?? "";
    const doorProto = doorHdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
    const doorOrigin = doorHost ? `${doorProto}://${doorHost}` : "";
    const cashOnly = tr("dashboard.pos.door.sell.cashOnly");
    const doorReceipts = receiptRows(doorPaid.ok ? doorPaid.rows : [], doorRequestedAt, locale, doorOrigin);
    return (
      <>
        <PageRouteSyncer page="pos" />
        <DoorClient
          tenantId={scope.tenantId}
          workspaceName={workspaceName}
          locationName={locationName}
          cashierName={doorCashier}
          drawerOpen={doorShift.ok ? doorShift.shift !== null : false}
          workspacePath={doorPath.replace(/\/pos$/, "")}
          receiptOrigin={doorOrigin}
          locale={locale}
          zone={tonight.ok ? tonight.zone : "UTC"}
          nowIso={tonight.ok ? tonight.nowIso : new Date().toISOString()}
          sessions={tonight.ok ? tonight.sessions : []}
          tonightFailed={!tonight.ok}
          currency="USD"
          receipts={doorReceipts}
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
            chrome: chromeCopy(tr),
            receipts: receiptsCopy(tr),
            issues: issuesCopy(tr),
            modeLabel: posModeLabel(tr, "door"),
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
    // The header's cashier chip is the same fact the counter reads: the
    // signed-in person and whether a drawer is open.
    const [floorCashier, floorShift] = await Promise.all([
      loadCashierName(admin),
      currentShift(admin, { tenantId: scope.tenantId }),
    ]);
    return (
      <>
        <PageRouteSyncer page="pos" />
        <FloorScreen
          admin={admin}
          tenantId={scope.tenantId}
          locale={locale}
          workspaceName={workspaceName}
          locationName={locationName}
          posPath={await currentAdminPath(tenantSlug)}
          cashierName={floorCashier}
          drawerOpen={Boolean(floorShift.ok && floorShift.shift)}
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
    // The header's cashier chip and the footer's `Drawer open` are the same
    // facts the counter reads: the signed-in person and the open shift.
    const [projectsCashier, projectsShift] = await Promise.all([
      loadCashierName(admin),
      currentShift(admin, { tenantId: scope.tenantId }),
    ]);
    return (
      <>
        <PageRouteSyncer page="pos" />
        <ProjectsModePage
          tenantId={scope.tenantId}
          workspaceName={workspaceName}
          locationName={locationName}
          posPath={projectsPath}
          workspacePath={projectsPath.replace(/\/pos$/, "")}
          receiptOrigin={projectsHost ? `${projectsProto}://${projectsHost}` : ""}
          methods={collectionMethods(tr)}
          cashierName={projectsCashier}
          drawerOpen={Boolean(projectsShift.ok && projectsShift.shift)}
          tr={tr}
          search={{ project: q.project, view: q.view }}
        />
      </>
    );
  }

  // ── The counter's data ───────────────────────────────────────────────
  const orderId = typeof q.order === "string" ? q.order : null;
  const requestedAt = new Date();
  const now = requestedAt.toISOString();
  // Receipts (`POSReceipts`) show today, yesterday and this week: seven days
  // back is the widest window the screen offers.
  const weekAgo = new Date(requestedAt.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const [open, saleLoad, catalog, shiftLoad, paidLoad, cashierName] = await Promise.all([
    listOpenPosSales(admin, scope.tenantId),
    orderId && /^[0-9a-f-]{36}$/i.test(orderId)
      ? loadPosSale(admin, { tenantId: scope.tenantId, orderId })
      : Promise.resolve(null),
    // Tiles, their price variants (`Options`) and their stock (`N left`,
    // `Sold out`), plus the upcoming sessions (`Pick session`): counter-catalog.ts.
    loadCounterCatalog(admin, { tenantId: scope.tenantId, nowIso: now }),
    currentShift(admin, { tenantId: scope.tenantId }),
    listPaidPosSales(admin, { tenantId: scope.tenantId, sinceIso: weekAgo }),
    loadCashierName(admin),
  ]);

  const sale = saleLoad && saleLoad.ok ? saleLoad.sale : null;

  // The receipt's PUBLIC code, which is what "share the receipt" resolves.
  // `orders.receipt_code` is not on `ORDER_COLUMNS` (the shared read/write
  // shape both POS commands use), and widening that shared constant for one
  // screen's benefit is how a column gets added to a writer's select and
  // forgotten in a reader's — the defect `sale-rows.ts` was extracted during.
  // One extra tenant-scoped read here costs less than that risk.
  // `updated_at` rides along: it is the last accepted write on the sale, the
  // `Saved 09:58` line under the basket's actions until this screen writes.
  let receiptCode: string | null = null;
  let savedAtIso: string | null = null;
  if (sale) {
    const receipt = await admin
      .from("orders")
      .select("receipt_code, updated_at")
      .eq("id", sale.orderId)
      .eq("tenant_id", scope.tenantId)
      .maybeSingle();
    if (receipt.error) logServerError("pos.page.receiptCode", receipt.error);
    const row = receipt.data as { receipt_code?: string | null; updated_at?: string | null } | null;
    receiptCode = typeof row?.receipt_code === "string" && row.receipt_code ? row.receipt_code : null;
    savedAtIso = typeof row?.updated_at === "string" && row.updated_at ? row.updated_at : null;
  }

  const { items, sessionsByOffering } = catalog;

  // The variant labels and live holds behind the sale's lines (counter-catalog.ts).
  const lineFacts = await loadCounterLineFacts(admin, {
    tenantId: scope.tenantId,
    lineIds: (sale?.lines ?? []).map((line) => line.id),
    variantIds: (sale?.lines ?? []).flatMap((line) => (line.variantId ? [line.variantId] : [])),
    nowIso: now,
  });

  // The basket, built HERE and not in the browser: `addonCentsOnLine` is the
  // one function that recovers a line's extras from its stored total, and it
  // lives in a `server-only` module because the same file prices those extras
  // against the catalog. A second copy of that subtraction in the client is a
  // receipt that can disagree with the charge.
  const basketLines: PosBasketLine[] = (sale?.lines ?? []).map((line) => {
    const heldUntil = lineFacts.heldUntilByLine.get(line.id);
    return {
      id: line.id,
      label: line.label,
      units: line.units,
      unitCents: line.unitCents,
      addonCents: addonCentsOnLine({
        unitCents: line.unitCents,
        units: line.units,
        totalCents: line.totalCents,
      }),
      offeringId: line.offeringId,
      sessionId: line.sessionId,
      variantId: line.variantId,
      variantLabel: line.variantId ? lineFacts.variantLabels.get(line.variantId) ?? null : null,
      sessionLabel: line.sessionId
        ? (sessionsByOffering.get(line.offeringId ?? "") ?? []).find((s) => s.id === line.sessionId)?.title ?? null
        : null,
      heldUntil: heldUntil ? formatClock(heldUntil, locale) : null,
    };
  });

  // THE TAX ROW READS THE TAX OUTCOME, NOT A NUMBER. `orderTax` answers
  // `unset` when not one line carries a configured category, and today no
  // line can: `talent_offerings` has no tax category column yet, so every
  // line is `category: null` and the row says the tax is not set up rather
  // than showing a zero nobody decided. The day a category reaches the
  // offering, this is the one place that changes.
  const tax = orderTax((sale?.lines ?? []).map((line) => ({ lineTotalCents: line.totalCents, category: null })));

  const currency = sale?.currency ?? "USD";
  const hdrs = await headers();
  const host = hdrs.get("x-forwarded-host") ?? hdrs.get("host") ?? "";
  const proto = hdrs.get("x-forwarded-proto") === "http" ? "http" : "https";
  const adminPath = await currentAdminPath(tenantSlug);
  const receiptOrigin = host ? `${proto}://${host}` : "";

  // The receipts rows, bucketed on the reader's own clock into today /
  // yesterday / this week. Each row links to the same `/r/<code>` page the
  // customer holds.
  const receipts: PosReceiptRow[] = receiptRows(paidLoad.ok ? paidLoad.rows : [], requestedAt, locale, receiptOrigin);

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
        tenantId={scope.tenantId}
        workspaceName={workspaceName}
        locationName={locationName}
        cashierName={cashierName}
        locale={locale}
        posPath={adminPath}
        workspacePath={adminPath.replace(/\/pos$/, "")}
        receiptOrigin={receiptOrigin}
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
                spaceId: sale.spaceId,
              }
            : null
        }
        basketLines={basketLines}
        taxState={tax.kind}
        savedAt={savedAtIso ? formatClock(savedAtIso, locale) : null}
        openSales={open.ok ? open.rows : []}
        receipts={receipts}
        catalog={items}
        currency={currency}
        minorUnitDivisor={minorUnitDivisor(currency)}
        methods={collectionMethods(tr)}
        readerConfigured={reportTerminalAvailability().available}
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
          chrome: chromeCopy(tr),
          modeLabel: posModeLabel(tr, mode),
          sell: sellSurfaceCopy(tr),
          basket: basketCopy(tr),
          line: lineEditCopy(tr),
          customer: customerSheetCopy(tr),
          discount: discountSheetCopy(tr),
          custom: customAmountCopy(tr),
          hold: holdSaleCopy(tr),
          expired: holdExpiredCopy(tr),
          booking: linkBookingCopy(tr),
          collect: collectSheetCopy(tr),
          cashDone: cashDoneCopy(tr),
          paid: paidScreenCopy(tr),
          held: heldSalesListCopy(tr),
          drawer: cashDrawerCopy(tr),
          receipts: receiptsCopy(tr),
          issues: issuesCopy(tr),
          devices: devicesCopy(tr),
          deviceRows: deviceRowsCopy(tr),
          connection: connectionCopy(tr),
          scanScreen: scanScreenCopy(tr),
          refusal: refusalCopy(tr),
          page: counterPageCopy(tr),
          scan: scanCopy(tr),
          displayLink: customerDisplayLinkCopy(tr),
          heldSaleLabel: tr("dashboard.pos.counter.held.saleLabel"),
          customAmountTitle: tr("dashboard.pos.counter.custom.title"),
          categories: {
            service: tr("dashboard.pos.counter.category.service"),
            package: tr("dashboard.pos.counter.category.package"),
            product: tr("dashboard.pos.counter.category.product"),
          },
        }}
      />
    </>
  );
}
