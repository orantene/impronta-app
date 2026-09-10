import "server-only";

/**
 * projects-reader.ts — the I/O half of Projects and the client record.
 *
 * ONE READER, NOT A JOIN PER SCREEN. Six screens (the list, the record and its
 * five tabs) plus the client record all want the same rows in slightly
 * different shapes. Written per screen that becomes six subtly different
 * definitions of "what is owed on this project", which is exactly the
 * conflation audit finding F26 names. So: this module fetches, and
 * `lib/projects/project-record.ts` + `lib/customers/client-record.ts` decide.
 *
 * A READ ERROR IS NOT AN EMPTY LIST. Every function returns a discriminated
 * result. Returning `[]` on failure renders "no projects yet" to a workspace
 * with forty, which is the fail-open shape `_data-bridge/orders.ts` was
 * corrected for and the one the Projects screens must not reintroduce.
 *
 * WHAT COUNTS AS A PROJECT. `agency_bookings` holds two different things. A
 * commissioned job arrives from the inquiry pipeline and carries
 * `source_inquiry_id`. A point-of-sale or menu order mints a SHELL booking so
 * `booking_transactions.booking_id` has something to point at — one per order,
 * `order_id` set, no inquiry. Those are counter sales, not commissions, and
 * listing them would bury every real project under the day's coffees. The
 * predicate is stated once, below, and used by every read here.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { minorUnitDivisor } from "@/lib/orders/money-format";
import { pickTimezone } from "@/lib/spaces/venue-timezone";
import {
  isOrderShellBooking,
} from "./project-record";
import type {
  AgreementStatus,
  AgreementVersion,
  MilestoneKind,
  MilestoneStatus,
  ProjectAssignment,
  ProjectBalance,
  ProjectMilestone,
  ProjectRecord,
  ProjectStatus,
} from "./project-record";
import type {
  ClientBookingLink,
  ClientProjectLink,
  ClientPurchase,
  ClientRecord,
} from "@/lib/customers/client-record";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type ReadFailure = {
  readonly ok: false;
  readonly reason: "unavailable" | "not_found" | "invalid";
};

export type ProjectsLoad = { readonly ok: true; readonly projects: ProjectRecord[] } | ReadFailure;
export type ProjectLoad = { readonly ok: true; readonly project: ProjectRecord } | ReadFailure;
export type ClientLoad = { readonly ok: true; readonly record: ClientRecord } | ReadFailure;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const BOOKING_COLUMNS =
  "id, tenant_id, title, status, starts_at, ends_at, currency_code, source_inquiry_id, order_id, contact_name, client_account_name, calendar_lane, timezone";

const PROJECT_STATUSES: readonly string[] = [
  "draft",
  "tentative",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
];

const AGREEMENT_STATUSES: readonly string[] = [
  "draft",
  "sent",
  "accepted",
  "rejected",
  "superseded",
  "invalidated",
  "expired",
];

const MILESTONE_STATUSES: readonly string[] = [
  "draft",
  "submitted",
  "approved",
  "revision_requested",
  "cancelled",
];

/** Money is stored NUMERIC in major units on offers and assignment lines. */
function majorToCents(value: unknown, currency: string): number {
  const n = Number(value ?? 0);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * minorUnitDivisor(currency));
}

type BookingRow = {
  id: string;
  tenant_id: string;
  title: string | null;
  status: string | null;
  starts_at: string | null;
  ends_at: string | null;
  currency_code: string | null;
  source_inquiry_id: string | null;
  order_id: string | null;
  contact_name: string | null;
  client_account_name: string | null;
  calendar_lane: string | null;
  timezone: string | null;
};

/**
 * The workspace's own clock, for every date that is not a job's.
 *
 * `agencies.timezone` is rung 2 of the ladder in `lib/spaces/venue-timezone.ts`
 * and this is the only place Projects fetches it. A read error resolves to
 * `null`, which `pickTimezone` turns into UTC — the honest last resort, and
 * one rung down rather than a thrown render.
 */
async function loadWorkspaceTimezone(admin: Admin, tenantId: string): Promise<string | null> {
  const { data, error } = await admin
    .from("agencies")
    .select("timezone")
    .eq("id", tenantId)
    .maybeSingle();
  if (error) {
    logServerError("projects.loadWorkspaceTimezone", error);
    return null;
  }
  return ((data as { timezone: string | null } | null)?.timezone) ?? null;
}

/**
 * The clock a booking's dates are read in.
 *
 * The booking's own `timezone` is the venue rung: a job happens AT a place and
 * the place's clock wins. `agencies.timezone` is the workspace default beneath
 * it, and UTC is the floor. Same ladder the rest of the platform uses, so a
 * project and a reservation never disagree about what day a shoot is on.
 */
function bookingTimezone(booking: BookingRow, workspaceTz: string | null): string {
  return pickTimezone({ venue: booking.timezone, workspace: workspaceTz }).timezone;
}

function asProjectStatus(raw: string | null): ProjectStatus {
  return (PROJECT_STATUSES.includes(raw ?? "") ? raw : "draft") as ProjectStatus;
}

async function loadProjectsFor(
  admin: Admin,
  tenantId: string,
  bookings: BookingRow[],
): Promise<ProjectsLoad> {
  if (bookings.length === 0) return { ok: true, projects: [] };

  const bookingIds = bookings.map((b) => b.id);
  const inquiryIds = [
    ...new Set(bookings.map((b) => b.source_inquiry_id).filter((x): x is string => !!x)),
  ];
  const shellOrderIds = [
    ...new Set(bookings.map((b) => b.order_id).filter((x): x is string => !!x)),
  ];

  // Five reads, never a nested select. A nested PostgREST select across an RLS
  // boundary returns null for a hidden row, which renders as "no team" rather
  // than as a permission result. The fifth is the workspace clock, which is one
  // row and would otherwise be fetched once per project.
  const [talentRes, deliverableRes, offerRes, orderRes, workspaceTz] = await Promise.all([
    admin
      .from("booking_talent")
      .select(
        "id, booking_id, talent_profile_id, talent_name_snapshot, role_label, pricing_unit, units, talent_cost_total, client_charge_total",
      )
      .eq("tenant_id", tenantId)
      .in("booking_id", bookingIds),
    admin
      .from("booking_deliverables")
      .select("id, booking_id, title, kind, status, revision, revision_limit, due_at")
      .eq("tenant_id", tenantId)
      .in("booking_id", bookingIds),
    inquiryIds.length > 0
      ? admin
          .from("inquiry_offers")
          .select(
            "id, inquiry_id, version, status, total_client_price, coordinator_fee, currency_code, sent_at, accepted_at, notes",
          )
          .eq("tenant_id", tenantId)
          .in("inquiry_id", inquiryIds)
      : Promise.resolve({ data: [], error: null }),
    inquiryIds.length > 0 || shellOrderIds.length > 0
      ? loadAttachedOrders(admin, tenantId, inquiryIds, shellOrderIds)
      : Promise.resolve({ data: [], error: null }),
    loadWorkspaceTimezone(admin, tenantId),
  ]);

  if (talentRes.error || deliverableRes.error || offerRes.error || orderRes.error) {
    logServerError(
      "projects.loadProjects/related",
      talentRes.error ?? deliverableRes.error ?? offerRes.error ?? orderRes.error,
    );
    return { ok: false, reason: "unavailable" };
  }

  const currencyOf = new Map<string, string>(
    bookings.map((b) => [b.id, (b.currency_code ?? "USD").toUpperCase()]),
  );

  const assignments = new Map<string, ProjectAssignment[]>();
  for (const raw of (talentRes.data ?? []) as Array<Record<string, unknown>>) {
    const bookingId = String(raw.booking_id);
    const currency = currencyOf.get(bookingId) ?? "USD";
    const list = assignments.get(bookingId) ?? [];
    list.push({
      id: String(raw.id),
      talentProfileId: (raw.talent_profile_id as string | null) ?? null,
      name: (raw.talent_name_snapshot as string | null) ?? "",
      roleLabel: (raw.role_label as string | null) ?? null,
      pricingUnit: String(raw.pricing_unit ?? "custom"),
      units: Number(raw.units ?? 0),
      talentCostCents: majorToCents(raw.talent_cost_total, currency),
      clientChargeCents: majorToCents(raw.client_charge_total, currency),
      currency,
    });
    assignments.set(bookingId, list);
  }

  const milestones = new Map<string, ProjectMilestone[]>();
  for (const raw of (deliverableRes.data ?? []) as Array<Record<string, unknown>>) {
    const bookingId = String(raw.booking_id);
    const list = milestones.get(bookingId) ?? [];
    const status = String(raw.status ?? "draft");
    list.push({
      id: String(raw.id),
      title: String(raw.title ?? ""),
      kind: (raw.kind === "passthrough_budget" ? "passthrough_budget" : "service") as MilestoneKind,
      status: (MILESTONE_STATUSES.includes(status) ? status : "draft") as MilestoneStatus,
      revision: Number(raw.revision ?? 0),
      revisionLimit: Number(raw.revision_limit ?? 0),
      dueAt: (raw.due_at as string | null) ?? null,
    });
    milestones.set(bookingId, list);
  }

  const agreements = new Map<string, AgreementVersion[]>();
  for (const raw of (offerRes.data ?? []) as Array<Record<string, unknown>>) {
    const inquiryId = String(raw.inquiry_id);
    const currency = String(raw.currency_code ?? "USD").toUpperCase();
    const status = String(raw.status ?? "draft");
    const list = agreements.get(inquiryId) ?? [];
    list.push({
      id: String(raw.id),
      version: Number(raw.version ?? 1),
      status: (AGREEMENT_STATUSES.includes(status) ? status : "draft") as AgreementStatus,
      totalClientCents: majorToCents(raw.total_client_price, currency),
      coordinatorFeeCents: majorToCents(raw.coordinator_fee, currency),
      currency,
      sentAt: (raw.sent_at as string | null) ?? null,
      acceptedAt: (raw.accepted_at as string | null) ?? null,
      notes: (raw.notes as string | null) ?? null,
    });
    agreements.set(inquiryId, list);
  }

  const orders = (orderRes.data ?? []) as AttachedOrder[];
  const balancesByInquiry = new Map<string, ProjectBalance[]>();
  const balancesByOrderId = new Map<string, ProjectBalance>();
  const customerByInquiry = new Map<string, string>();
  const customerByOrderId = new Map<string, string>();
  for (const o of orders) {
    // No outstanding figure is computed here. `balanceOwedCents` in
    // `project-record.ts` asks the orders desk, which is the only place that
    // knows a cancelled order owes nothing.
    const balance: ProjectBalance = {
      orderId: o.id,
      status: o.status,
      currency: o.currency.toUpperCase(),
      totalCents: o.totalCents,
      collectedCents: o.collectedCents,
    };
    balancesByOrderId.set(o.id, balance);
    if (o.inquiryId) {
      const list = balancesByInquiry.get(o.inquiryId) ?? [];
      list.push(balance);
      balancesByInquiry.set(o.inquiryId, list);
      if (o.customerId && !customerByInquiry.has(o.inquiryId)) {
        customerByInquiry.set(o.inquiryId, o.customerId);
      }
    }
    if (o.customerId) customerByOrderId.set(o.id, o.customerId);
  }

  const projects: ProjectRecord[] = bookings.map((b) => {
    const currency = (b.currency_code ?? "USD").toUpperCase();
    const inquiryId = b.source_inquiry_id;
    const own: ProjectBalance[] = [];
    if (inquiryId) own.push(...(balancesByInquiry.get(inquiryId) ?? []));
    if (b.order_id) {
      const direct = balancesByOrderId.get(b.order_id);
      if (direct && !own.some((x) => x.orderId === direct.orderId)) own.push(direct);
    }
    return {
      id: b.id,
      tenantId: b.tenant_id,
      title: b.title ?? "",
      status: asProjectStatus(b.status),
      currency,
      timeZone: bookingTimezone(b, workspaceTz),
      startsAt: b.starts_at,
      endsAt: b.ends_at,
      inquiryId,
      clientName: b.client_account_name ?? b.contact_name ?? null,
      customerId:
        (inquiryId ? customerByInquiry.get(inquiryId) : null)
        ?? (b.order_id ? customerByOrderId.get(b.order_id) ?? null : null)
        ?? null,
      agreements: inquiryId ? agreements.get(inquiryId) ?? [] : [],
      assignments: assignments.get(b.id) ?? [],
      milestones: milestones.get(b.id) ?? [],
      balances: own,
    };
  });

  return { ok: true, projects };
}

type AttachedOrder = {
  id: string;
  status: string;
  currency: string;
  totalCents: number;
  collectedCents: number;
  inquiryId: string | null;
  customerId: string | null;
  createdAt: string;
  lineCount: number;
};

/**
 * Orders attached to a set of projects, with what has actually landed on each.
 *
 * `collectedCents` is summed from PAID `booking_transactions`, the identical
 * predicate `_data-bridge/orders.ts` and `lib/orders/complete-order.ts` use. A
 * third rule here would let the Projects screen chase a client the Orders desk
 * already shows as settled.
 *
 * WHAT IS OWED IS NOT DECIDED HERE AT ALL. This function returns the order's
 * status alongside its totals and stops. `balanceOwedCents` and
 * `purchaseOwedCents` apply the desk's `isMoneyOwed`, which is the half this
 * module used to drop: collected was taken from the desk and owed was invented,
 * so every draft, quote, cancelled and refunded order counted as money to chase.
 */
async function loadAttachedOrders(
  admin: Admin,
  tenantId: string,
  inquiryIds: string[],
  orderIds: string[],
): Promise<{ data: AttachedOrder[]; error: unknown }> {
  const selects: Promise<{ data: unknown; error: unknown }>[] = [];
  const columns = "id, status, currency, total_cents, inquiry_id, customer_id, created_at";
  if (inquiryIds.length > 0) {
    selects.push(
      admin.from("orders").select(columns).eq("tenant_id", tenantId).in("inquiry_id", inquiryIds),
    );
  }
  if (orderIds.length > 0) {
    selects.push(admin.from("orders").select(columns).eq("tenant_id", tenantId).in("id", orderIds));
  }
  if (selects.length === 0) return { data: [], error: null };

  const results = await Promise.all(selects);
  const failed = results.find((r) => r.error);
  if (failed) return { data: [], error: failed.error };

  const rows = new Map<string, Record<string, unknown>>();
  for (const r of results) {
    for (const row of (r.data ?? []) as Array<Record<string, unknown>>) {
      rows.set(String(row.id), row);
    }
  }
  const ids = [...rows.keys()];
  if (ids.length === 0) return { data: [], error: null };

  const [txRes, lineRes] = await Promise.all([
    admin
      .from("booking_transactions")
      .select("order_id, gross_amount_cents")
      .in("order_id", ids)
      .eq("status", "paid"),
    admin.from("order_lines").select("order_id").in("order_id", ids),
  ]);
  if (txRes.error || lineRes.error) return { data: [], error: txRes.error ?? lineRes.error };

  const collected = new Map<string, number>();
  for (const t of (txRes.data ?? []) as Array<{ order_id: string | null; gross_amount_cents: number | null }>) {
    if (!t.order_id) continue;
    collected.set(t.order_id, (collected.get(t.order_id) ?? 0) + Number(t.gross_amount_cents ?? 0));
  }
  const lineCounts = new Map<string, number>();
  for (const l of (lineRes.data ?? []) as Array<{ order_id: string }>) {
    lineCounts.set(l.order_id, (lineCounts.get(l.order_id) ?? 0) + 1);
  }

  return {
    data: [...rows.values()].map((row) => ({
      id: String(row.id),
      status: String(row.status ?? "draft"),
      currency: String(row.currency ?? "USD"),
      totalCents: Number(row.total_cents ?? 0),
      collectedCents: collected.get(String(row.id)) ?? 0,
      inquiryId: (row.inquiry_id as string | null) ?? null,
      customerId: (row.customer_id as string | null) ?? null,
      createdAt: String(row.created_at ?? ""),
      lineCount: lineCounts.get(String(row.id)) ?? 0,
    })),
    error: null,
  };
}

/** Every commissioned project in the workspace, newest first. */
export async function loadProjects(
  tenantId: string,
  opts: { limit?: number } = {},
): Promise<ProjectsLoad> {
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const limit = Math.min(Math.max(opts.limit ?? 200, 1), 500);

  const { data, error } = await admin
    .from("agency_bookings")
    .select(BOOKING_COLUMNS)
    .eq("tenant_id", tenantId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    logServerError("projects.loadProjects/bookings", error);
    return { ok: false, reason: "unavailable" };
  }
  const bookings = ((data ?? []) as BookingRow[]).filter((b) => !isOrderShellBooking(b));
  return loadProjectsFor(admin, tenantId, bookings);
}

/** One project, whole. `not_found` is a different answer from `unavailable`. */
export async function loadProject(tenantId: string, projectId: string): Promise<ProjectLoad> {
  if (!UUID.test(projectId)) return { ok: false, reason: "invalid" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data, error } = await admin
    .from("agency_bookings")
    .select(BOOKING_COLUMNS)
    .eq("tenant_id", tenantId)
    .eq("id", projectId)
    .maybeSingle();
  if (error) {
    logServerError("projects.loadProject/booking", error);
    return { ok: false, reason: "unavailable" };
  }
  if (!data) return { ok: false, reason: "not_found" };
  // The list hides order shells; a direct URL must agree with it. Rendering one
  // as a project would show a coffee with an agreement tab.
  if (isOrderShellBooking(data as BookingRow)) return { ok: false, reason: "not_found" };

  const loaded = await loadProjectsFor(admin, tenantId, [data as BookingRow]);
  if (!loaded.ok) return loaded;
  const project = loaded.projects[0];
  if (!project) return { ok: false, reason: "not_found" };
  return { ok: true, project };
}

/**
 * One client: identity, everything they bought, everything booked, every
 * project, and what is owed.
 *
 * Keyed on `customers.id` and nothing else, because that is the record
 * `orders.customer_id` points at. See the header of
 * `lib/customers/client-record.ts` for the other two things this database calls
 * a client and why neither is the spine.
 */
export async function loadClientRecord(
  tenantId: string,
  customerId: string,
): Promise<ClientLoad> {
  if (!UUID.test(customerId)) return { ok: false, reason: "invalid" };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };

  const { data: customer, error: customerErr } = await admin
    .from("customers")
    .select(
      "id, tenant_id, user_id, client_profile_id, email, phone_e164, display_name, locale, visits, no_shows, last_seen_at, notes, tags",
    )
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .maybeSingle();
  if (customerErr) {
    logServerError("projects.loadClientRecord/customer", customerErr);
    return { ok: false, reason: "unavailable" };
  }
  if (!customer) return { ok: false, reason: "not_found" };

  const row = customer as Record<string, unknown>;

  const { data: orderRows, error: orderErr } = await admin
    .from("orders")
    .select("id, status, currency, total_cents, inquiry_id, customer_id, created_at")
    .eq("tenant_id", tenantId)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (orderErr) {
    logServerError("projects.loadClientRecord/orders", orderErr);
    return { ok: false, reason: "unavailable" };
  }

  const orders = (orderRows ?? []) as Array<Record<string, unknown>>;
  const orderIds = orders.map((o) => String(o.id));
  const inquiryIds = [
    ...new Set(orders.map((o) => o.inquiry_id).filter((x): x is string => typeof x === "string")),
  ];

  const [txRes, lineRes, bookingRes, workspaceTz] = await Promise.all([
    orderIds.length > 0
      ? admin
          .from("booking_transactions")
          .select("order_id, gross_amount_cents")
          .in("order_id", orderIds)
          .eq("status", "paid")
      : Promise.resolve({ data: [], error: null }),
    orderIds.length > 0
      ? admin.from("order_lines").select("order_id").in("order_id", orderIds)
      : Promise.resolve({ data: [], error: null }),
    // Three ways a booking belongs to this client, ORed rather than picked:
    // through an order they paid, through the conversation that produced it,
    // or straight off `client_user_id` when they have an account and the
    // booking was opened for them without either. Reading only the first two
    // hid every project a client has that nobody has invoiced yet.
    admin
      .from("agency_bookings")
      .select(BOOKING_COLUMNS)
      .eq("tenant_id", tenantId)
      .or(
        [
          orderIds.length > 0 ? `order_id.in.(${orderIds.join(",")})` : null,
          inquiryIds.length > 0 ? `source_inquiry_id.in.(${inquiryIds.join(",")})` : null,
          typeof row.user_id === "string" ? `client_user_id.eq.${row.user_id}` : null,
        ]
          .filter(Boolean)
          .join(",") || "id.is.null",
      )
      .limit(200),
    loadWorkspaceTimezone(admin, tenantId),
  ]);
  if (txRes.error || lineRes.error || bookingRes.error) {
    logServerError(
      "projects.loadClientRecord/related",
      txRes.error ?? lineRes.error ?? bookingRes.error,
    );
    return { ok: false, reason: "unavailable" };
  }

  const collected = new Map<string, number>();
  for (const t of (txRes.data ?? []) as Array<{ order_id: string | null; gross_amount_cents: number | null }>) {
    if (!t.order_id) continue;
    collected.set(t.order_id, (collected.get(t.order_id) ?? 0) + Number(t.gross_amount_cents ?? 0));
  }
  const lineCounts = new Map<string, number>();
  for (const l of (lineRes.data ?? []) as Array<{ order_id: string }>) {
    lineCounts.set(l.order_id, (lineCounts.get(l.order_id) ?? 0) + 1);
  }

  const purchases: ClientPurchase[] = orders.map((o) => {
    const id = String(o.id);
    return {
      orderId: id,
      status: String(o.status ?? "draft"),
      currency: String(o.currency ?? "USD").toUpperCase(),
      totalCents: Number(o.total_cents ?? 0),
      collectedCents: collected.get(id) ?? 0,
      createdAt: String(o.created_at ?? ""),
      lineCount: lineCounts.get(id) ?? 0,
      inquiryId: (o.inquiry_id as string | null) ?? null,
    };
  });

  const bookingRows = (bookingRes.data ?? []) as BookingRow[];
  const projects: ClientProjectLink[] = bookingRows
    .filter((b) => !isOrderShellBooking(b))
    .map((b) => ({
      projectId: b.id,
      title: b.title ?? "",
      status: asProjectStatus(b.status),
      timeZone: bookingTimezone(b, workspaceTz),
      startsAt: b.starts_at,
    }));
  const bookings: ClientBookingLink[] = bookingRows
    .filter((b) => isOrderShellBooking(b))
    .map((b) => ({
      bookingId: b.id,
      title: b.title ?? "",
      timeZone: bookingTimezone(b, workspaceTz),
      startsAt: b.starts_at,
      status: asProjectStatus(b.status),
    }));

  return {
    ok: true,
    record: {
      customerId: String(row.id),
      tenantId: String(row.tenant_id),
      timeZone: pickTimezone({ workspace: workspaceTz }).timezone,
      displayName: (row.display_name as string | null) ?? null,
      email: (row.email as string | null) ?? null,
      phoneE164: (row.phone_e164 as string | null) ?? null,
      clientProfileId: (row.client_profile_id as string | null) ?? null,
      userId: (row.user_id as string | null) ?? null,
      locale: (row.locale as string | null) ?? null,
      visits: Number(row.visits ?? 0),
      noShows: Number(row.no_shows ?? 0),
      lastSeenAt: (row.last_seen_at as string | null) ?? null,
      tags: Array.isArray(row.tags) ? (row.tags as string[]) : [],
      notes: (row.notes as string | null) ?? null,
      purchases,
      projects,
      bookings,
    },
  };
}
