import "server-only";

/**
 * projects-mode-loader.ts — the I/O the Projects point of sale mode needs
 * beyond what the projects reader already gives it.
 *
 * THE MONEY IS THE READER'S. `loadProjects` / `loadProject` in
 * `lib/projects/projects-reader.ts` fetch every project with its attached
 * orders and PAID transactions, and `project-record.ts` applies the orders
 * desk's rule to say what is owed. Nothing here re-reads a transaction or
 * re-sums a total. What this file adds is the handful of columns a point of
 * sale needs that the record does not carry: an order's `version` (so a
 * collection carries `expectedVersion` and a second tablet is refused as a
 * conflict rather than taking the money twice), its `receipt_code` and
 * `created_at`, and the client's contact details so a product that needs a
 * name can be given one.
 *
 * A READ ERROR IS NOT AN EMPTY LIST. Same discipline as the reader.
 */

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { generateOpaqueCode } from "@/lib/links/code";
import { loadProject, loadProjects } from "@/lib/projects/projects-reader";
import type { ProjectRecord } from "@/lib/projects/project-record";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = { from: (table: string) => any };

export type ProjectOrderFacts = {
  readonly orderId: string;
  readonly version: number;
  readonly receiptCode: string | null;
  readonly createdAt: string;
  readonly lineCount: number;
};

export type ProjectClientContact = {
  readonly email: string | null;
  readonly phone: string | null;
  readonly displayName: string | null;
};

export type ProjectDetailLoad =
  | {
      readonly ok: true;
      readonly project: ProjectRecord;
      readonly orders: ProjectOrderFacts[];
      readonly contact: ProjectClientContact | null;
    }
  | { readonly ok: false; readonly reason: "unavailable" | "not_found" | "invalid" };

export type ProjectsListLoad =
  | { readonly ok: true; readonly projects: ProjectRecord[] }
  | { readonly ok: false; readonly reason: "unavailable" };

/** Every project in the workspace, through the one reader. */
export async function loadProjectsForMode(tenantId: string): Promise<ProjectsListLoad> {
  const loaded = await loadProjects(tenantId);
  if (!loaded.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, projects: loaded.projects };
}

async function loadOrderFacts(
  admin: Admin,
  tenantId: string,
  orderIds: readonly string[],
): Promise<{ ok: true; rows: ProjectOrderFacts[] } | { ok: false }> {
  if (orderIds.length === 0) return { ok: true, rows: [] };
  const [orderRes, lineRes] = await Promise.all([
    admin
      .from("orders")
      .select("id, version, receipt_code, created_at")
      .eq("tenant_id", tenantId)
      .in("id", orderIds),
    admin.from("order_lines").select("order_id").in("order_id", orderIds),
  ]);
  if (orderRes.error || lineRes.error) {
    logServerError("pos.projects.loadOrderFacts", orderRes.error ?? lineRes.error);
    return { ok: false };
  }
  const lineCounts = new Map<string, number>();
  for (const l of (lineRes.data ?? []) as Array<{ order_id: string }>) {
    lineCounts.set(l.order_id, (lineCounts.get(l.order_id) ?? 0) + 1);
  }
  const rows = ((orderRes.data ?? []) as Array<{
    id: string;
    version: number | null;
    receipt_code: string | null;
    created_at: string | null;
  }>).map((row) => ({
    orderId: row.id,
    version: Number(row.version ?? 1),
    receiptCode: row.receipt_code ?? null,
    createdAt: row.created_at ?? "",
    lineCount: lineCounts.get(row.id) ?? 0,
  }));
  return { ok: true, rows };
}

async function loadContact(
  admin: Admin,
  tenantId: string,
  customerId: string | null,
): Promise<ProjectClientContact | null> {
  if (!customerId) return null;
  const { data, error } = await admin
    .from("customers")
    .select("email, phone_e164, display_name")
    .eq("tenant_id", tenantId)
    .eq("id", customerId)
    .maybeSingle();
  if (error) {
    logServerError("pos.projects.loadContact", error);
    return null;
  }
  const row = data as { email: string | null; phone_e164: string | null; display_name: string | null } | null;
  if (!row) return null;
  return { email: row.email ?? null, phone: row.phone_e164 ?? null, displayName: row.display_name ?? null };
}

/** One project, whole, plus the order and contact facts the till needs. */
export async function loadProjectForMode(
  tenantId: string,
  projectId: string,
): Promise<ProjectDetailLoad> {
  const loaded = await loadProject(tenantId, projectId);
  if (!loaded.ok) return { ok: false, reason: loaded.reason };
  const admin = createServiceRoleClient();
  if (!admin) return { ok: false, reason: "unavailable" };
  const project = loaded.project;
  const [facts, contact] = await Promise.all([
    loadOrderFacts(admin, tenantId, project.balances.map((b) => b.orderId)),
    loadContact(admin, tenantId, project.customerId),
  ]);
  if (!facts.ok) return { ok: false, reason: "unavailable" };
  return { ok: true, project, orders: facts.rows, contact };
}

/**
 * Give an order a public receipt code if it has none.
 *
 * An order minted from an accepted offer (`bookings_write_order`) is born
 * without one: only the counter's draft and the storefront's purchase mint a
 * code at creation. A collection taken here must still hand the client a
 * receipt they can open by its code, so the code is minted at the first
 * collection. `.is("receipt_code", null)` makes it a no-op on every later
 * call and never overwrites a code already printed on paper.
 */
export async function ensureReceiptCode(
  admin: Admin,
  input: { tenantId: string; orderId: string },
): Promise<string | null> {
  const { data, error } = await admin
    .from("orders")
    .select("receipt_code")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .maybeSingle();
  if (error) {
    logServerError("pos.projects.ensureReceiptCode/read", error);
    return null;
  }
  const existing = (data as { receipt_code?: string | null } | null)?.receipt_code;
  if (typeof existing === "string" && existing) return existing;
  const code = generateOpaqueCode();
  const { error: writeErr } = await admin
    .from("orders")
    .update({ receipt_code: code })
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .is("receipt_code", null);
  if (writeErr) {
    logServerError("pos.projects.ensureReceiptCode/write", writeErr);
    return null;
  }
  // Read back rather than trust the write: a concurrent mint from another
  // tablet wins the `.is(null)` race and this one must report THAT code. A
  // failed read-back is reported as "no code", never as the code this call
  // tried to write: the money still lands, and the screen says no receipt
  // could be issued instead of printing a code that may not be the row's.
  const { data: after, error: afterErr } = await admin
    .from("orders")
    .select("receipt_code")
    .eq("tenant_id", input.tenantId)
    .eq("id", input.orderId)
    .maybeSingle();
  if (afterErr) {
    logServerError("pos.projects.ensureReceiptCode/readback", afterErr);
    return null;
  }
  const final = (after as { receipt_code?: string | null } | null)?.receipt_code;
  return typeof final === "string" && final ? final : null;
}

export type ReceiptLookup =
  | {
      readonly ok: true;
      readonly code: string;
      readonly orderId: string;
      readonly status: string;
      readonly currency: string;
      readonly totalCents: number;
      readonly collectedCents: number;
      readonly createdAt: string;
      readonly inquiryId: string | null;
    }
  | { readonly ok: false; readonly reason: "not_found" | "unavailable" };

/**
 * A receipt by its public code, INSIDE this workspace only.
 *
 * `/r/<code>` is public and resolves any workspace's code on that workspace's
 * host; this lookup is for staff standing at this workspace's desk, so a code
 * from another tenant answers `not_found`, the same as a code nobody minted.
 * `collectedCents` is the sum of PAID `booking_transactions`, the desk's own
 * predicate, so the figure here matches what Sales and the project show.
 */
export async function findReceiptByCode(
  admin: Admin,
  input: { tenantId: string; code: string },
): Promise<ReceiptLookup> {
  const { data, error } = await admin
    .from("orders")
    .select("id, status, currency, total_cents, created_at, inquiry_id")
    .eq("tenant_id", input.tenantId)
    .eq("receipt_code", input.code)
    .maybeSingle();
  if (error) {
    logServerError("pos.projects.findReceiptByCode", error);
    return { ok: false, reason: "unavailable" };
  }
  const row = data as {
    id: string;
    status: string | null;
    currency: string | null;
    total_cents: number | null;
    created_at: string | null;
    inquiry_id: string | null;
  } | null;
  if (!row) return { ok: false, reason: "not_found" };
  const tx = await admin
    .from("booking_transactions")
    .select("gross_amount_cents")
    .eq("order_id", row.id)
    .eq("status", "paid");
  if (tx.error) {
    logServerError("pos.projects.findReceiptByCode/tx", tx.error);
    return { ok: false, reason: "unavailable" };
  }
  const collectedCents = ((tx.data ?? []) as Array<{ gross_amount_cents: number | null }>).reduce(
    (sum, t) => sum + Number(t.gross_amount_cents ?? 0),
    0,
  );
  return {
    ok: true,
    code: input.code,
    orderId: row.id,
    status: row.status ?? "draft",
    currency: (row.currency ?? "USD").toUpperCase(),
    totalCents: Number(row.total_cents ?? 0),
    collectedCents,
    createdAt: row.created_at ?? "",
    inquiryId: row.inquiry_id ?? null,
  };
}
