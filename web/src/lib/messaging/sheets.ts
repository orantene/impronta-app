/**
 * Readers behind the Messages sheets that used to be doors onto nothing
 * (audit E / D-116, 2026-09-15): hand over, delivery, recover, offer, diff.
 *
 * Each returns rows the sheet draws and the ids its action needs, scoped by
 * tenant. Nothing here writes; the writers are in `messaging-engine.ts`.
 */

import { annotateDiffWithEvents, diffDraft, type DraftDiffLine, type DraftSnapshot, type LineEventRow } from "./diff-draft";
import type { OfferDraftLine, OfferDraftState } from "@/lib/messages-v5/offer-draft";
import { emptyTerms } from "@/lib/messages-v5/offer-draft";

type Admin = {
  // Tests inject a fake PostgREST builder.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/* ── hand over ─────────────────────────────────────────────────────────────── */

export type HandOverTarget = { userId: string; name: string; role: string };

/** Everyone who can own a thread here: active members of the workspace, minus the caller. */
export async function loadHandOverTargets(
  admin: Admin,
  input: { tenantId: string; excludeUserId?: string | null },
): Promise<HandOverTarget[]> {
  const { data, error } = await admin
    .from("agency_memberships")
    .select("profile_id, role")
    .eq("tenant_id", input.tenantId)
    .eq("status", "active");
  if (error) return [];
  const members = (data ?? []) as Array<{ profile_id: string | null; role: string | null }>;
  const ids = [...new Set(members.map((m) => m.profile_id).filter((id): id is string => Boolean(id) && id !== input.excludeUserId))];
  if (ids.length === 0) return [];
  const { data: profiles, error: pErr } = await admin.from("profiles").select("id, display_name").in("id", ids);
  if (pErr) return [];
  const names = new Map<string, string>();
  for (const row of (profiles ?? []) as Array<{ id: string; display_name: string | null }>) {
    if (row.display_name) names.set(row.id, row.display_name);
  }
  return ids
    .map((id) => ({
      userId: id,
      name: names.get(id) ?? id.slice(0, 8),
      role: members.find((m) => m.profile_id === id)?.role ?? "member",
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/* ── delivery ──────────────────────────────────────────────────────────────── */

export type DeliveryRow = {
  id: string;
  messageId: string;
  channel: string;
  state: string;
  attempts: number;
  lastError: string | null;
  updatedAt: string;
  /** The first words of the message, so a row reads as a message and not an id. */
  preview: string;
};

/** Every delivery attempt on this thread's messages, newest first. */
export async function loadThreadDelivery(admin: Admin, input: { tenantId: string; inquiryId: string }): Promise<DeliveryRow[]> {
  const { data: messages, error: mErr } = await admin
    .from("inquiry_messages")
    .select("id, body")
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", input.inquiryId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (mErr) return [];
  const rows = (messages ?? []) as Array<{ id: string; body: string | null }>;
  if (rows.length === 0) return [];
  const preview = new Map(rows.map((m) => [m.id, (m.body ?? "").trim().slice(0, 60)]));
  const { data, error } = await admin
    .from("message_delivery")
    .select("id, message_id, channel, state, attempts, last_error, updated_at")
    .eq("tenant_id", input.tenantId)
    .in(
      "message_id",
      rows.map((m) => m.id),
    )
    .order("updated_at", { ascending: false });
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    messageId: String(row.message_id),
    channel: String(row.channel),
    state: String(row.state),
    attempts: Number(row.attempts ?? 0),
    lastError: typeof row.last_error === "string" ? row.last_error : null,
    updatedAt: String(row.updated_at ?? ""),
    preview: preview.get(String(row.message_id)) ?? "",
  }));
}

/* ── recover ───────────────────────────────────────────────────────────────── */

export type SnapshotRow = {
  id: string;
  createdAt: string;
  basketVersion: number;
  lineCount: number;
  recoveredOrderId: string | null;
};

/** The saved checkouts on this thread (one per payment request), newest first. */
export async function loadCheckoutSnapshots(admin: Admin, input: { tenantId: string; inquiryId: string }): Promise<SnapshotRow[]> {
  const { data, error } = await admin
    .from("checkout_snapshots")
    .select("id, created_at, basket, basket_version, recovered_order_id")
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", input.inquiryId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => {
    const basket = (row.basket ?? {}) as { lines?: unknown[] };
    return {
      id: String(row.id),
      createdAt: String(row.created_at ?? ""),
      basketVersion: Number(row.basket_version ?? 1),
      lineCount: Array.isArray(basket.lines) ? basket.lines.length : 0,
      recoveredOrderId: typeof row.recovered_order_id === "string" ? row.recovered_order_id : null,
    };
  });
}

/* ── offer ─────────────────────────────────────────────────────────────────── */

export type OfferRow = {
  id: string;
  status: string;
  version: number;
  totalClientPrice: number;
  updatedAt: string;
  /** L7 (D-MSG-14x), additive: the offer's own deposit rule, read by
   * `lib/messages-v5/payment-view.ts`'s `depositFor`. Both null means no
   * deposit rule on this offer. */
  depositPct: number | null;
  depositAmountCents: number | null;
};

/** The inquiry's offers, newest first. `draft` can be sent; `sent` can be reminded or revised. */
export async function loadInquiryOffers(admin: Admin, input: { tenantId: string; inquiryId: string }): Promise<OfferRow[]> {
  const { data, error } = await admin
    .from("inquiry_offers")
    .select("id, status, version, total_client_price, updated_at, deposit_pct, deposit_amount_cents")
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", input.inquiryId)
    .order("created_at", { ascending: false })
    .limit(10);
  if (error) return [];
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: String(row.id),
    status: String(row.status ?? "draft"),
    version: Number(row.version ?? 1),
    totalClientPrice: Number(row.total_client_price ?? 0),
    updatedAt: String(row.updated_at ?? ""),
    depositPct: row.deposit_pct == null ? null : Number(row.deposit_pct),
    depositAmountCents: row.deposit_amount_cents == null ? null : Number(row.deposit_amount_cents),
  }));
}

/**
 * L6 (Messages v5, D-MSG-133): the FULL offer for the editor sheet — header
 * + every line item, staff-only fields included (`talent_cost`,
 * `coordinator_fee`, `proposed_by`, `confirmed_at`, price snapshot,
 * discount, tax). This is a staff-only reader for `OfferEditorSheet`; it must
 * never be reused by a client-facing surface (see
 * `client-readers.static.test.ts` — the client offer payload has its own,
 * narrower reader in `client-inquiry-details.ts`).
 *
 * Shape matches `lib/messages-v5/offer-draft.ts`'s `OfferDraftState` so the
 * sheet can load straight into the reducer with no extra mapping layer.
 */
export async function loadOfferForEditor(
  admin: Admin,
  input: { tenantId: string; inquiryId: string; offerId: string; inquiryExpectedVersion: number },
): Promise<OfferDraftState | null> {
  const { data: offer, error } = await admin
    .from("inquiry_offers")
    .select(
      "id, inquiry_id, status, version, currency_code, coordinator_fee, deposit_pct, deposit_amount_cents, valid_until, notes",
    )
    .eq("id", input.offerId)
    .eq("tenant_id", input.tenantId)
    .maybeSingle();
  if (error || !offer) return null;
  const row = offer as Record<string, unknown>;
  if (String(row.inquiry_id) !== input.inquiryId) return null;

  const { data: lines, error: linesErr } = await admin
    .from("inquiry_offer_line_items")
    .select(
      `id, talent_profile_id, owner_tenant_id, label, pricing_unit, units, unit_price, talent_cost,
       notes, sort_order, source_service_id, proposed_by, confirmed_at, price_snapshot_cents,
       catalog_price_cents_at_add, discount_cents, discount_label, tax_cents, tax_label,
       talent_profiles ( display_name )`,
    )
    .eq("offer_id", input.offerId)
    .eq("tenant_id", input.tenantId)
    .order("sort_order", { ascending: true });
  if (linesErr) return null;

  // Catalog-now lookup for the price-drift hint (D-MSG-136): one batched read
  // of `talent_offerings.amount_cents` for every distinct `source_service_id`
  // on the offer's lines. Best-effort — an empty/erroring read just means no
  // line shows a drift hint, never a blocked load.
  const sourceServiceIds = [
    ...new Set(
      ((lines ?? []) as Array<Record<string, unknown>>)
        .map((r) => r.source_service_id as string | null)
        .filter((id): id is string => !!id),
    ),
  ];
  const catalogNowById = new Map<string, number | null>();
  if (sourceServiceIds.length > 0) {
    const { data: offerings } = await admin.from("talent_offerings").select("id, amount_cents").in("id", sourceServiceIds);
    for (const o of (offerings ?? []) as Array<{ id: string; amount_cents: number | string | null }>) {
      catalogNowById.set(String(o.id), o.amount_cents == null ? null : Number(o.amount_cents));
    }
  }

  const draftLines: OfferDraftLine[] = ((lines ?? []) as Array<Record<string, unknown>>).map((r, i) => {
    const talentProfileId = (r.talent_profile_id as string | null) ?? null;
    const ownerTenantId = (r.owner_tenant_id as string | null) ?? null;
    const talentName = (r.talent_profiles as { display_name?: string | null } | null)?.display_name ?? null;
    return {
      id: String(r.id),
      kind: talentProfileId ? "talent" : ownerTenantId ? "house" : "custom",
      talentProfileId,
      ownerTenantId,
      label: String(r.label ?? talentName ?? ""),
      pricingUnit: (r.pricing_unit as OfferDraftLine["pricingUnit"]) ?? "custom",
      units: Number(r.units ?? 0),
      unitPriceCents: Math.round(Number(r.unit_price ?? 0) * 100),
      talentCostCents: Math.round(Number(r.talent_cost ?? 0) * 100),
      note: (r.notes as string | null) ?? null,
      sortOrder: Number(r.sort_order ?? i),
      sourceServiceId: (r.source_service_id as string | null) ?? null,
      proposedBy: (r.proposed_by as OfferDraftLine["proposedBy"]) ?? null,
      proposedByName: talentName,
      confirmed: !!r.confirmed_at,
      priceSnapshotCents: r.price_snapshot_cents == null ? null : Number(r.price_snapshot_cents),
      catalogPriceCentsAtAdd: r.catalog_price_cents_at_add == null ? null : Number(r.catalog_price_cents_at_add),
      catalogNowCents: (r.source_service_id as string | null) ? (catalogNowById.get(r.source_service_id as string) ?? null) : null,
      discountCents: Number(r.discount_cents ?? 0),
      discountLabel: (r.discount_label as string | null) ?? null,
      taxCents: Number(r.tax_cents ?? 0),
      taxLabel: (r.tax_label as string | null) ?? null,
      removedBy: null,
    };
  });

  // A column default of 0 is "no deposit", not an amount of $0.
  const depositPct = row.deposit_pct == null || Number(row.deposit_pct) <= 0 ? null : Number(row.deposit_pct);
  const depositAmountCents = row.deposit_amount_cents == null || Number(row.deposit_amount_cents) <= 0 ? null : Number(row.deposit_amount_cents);

  return {
    offerId: String(row.id),
    inquiryId: input.inquiryId,
    version: Number(row.version ?? 1),
    inquiryExpectedVersion: input.inquiryExpectedVersion,
    status: (row.status as OfferDraftState["status"]) ?? "draft",
    currencyCode: (row.currency_code as string | null) ?? "USD",
    lines: draftLines,
    terms: {
      ...emptyTerms(),
      depositMode: depositAmountCents != null ? "amount" : depositPct != null ? "pct" : "none",
      depositPct,
      depositAmountCents,
      validUntil: (row.valid_until as string | null) ?? null,
      noteToClient: (row.notes as string | null) ?? "",
    },
    coordinatorFeeCents: Math.round(Number(row.coordinator_fee ?? 0) * 100),
  };
}

/* ── diff ──────────────────────────────────────────────────────────────────── */

export type BasketDiff = {
  snapshotId: string;
  linkId: string;
  linkCode: string;
  linkStatus: string;
  orderId: string;
  basketVersion: number;
  orderVersion: number;
  /** Lines that moved underneath the open payment page. Empty means the sent basket still matches. */
  diff: DraftDiffLine[];
};

type SnapshotLine = {
  id: string;
  label?: string | null;
  units?: number | string | null;
  unit_cents?: number | string | null;
  /** S5: on the live `order_lines` read; a basket snapshot taken before S5 has neither. */
  proposed_by?: string | null;
  confirmed_at?: string | null;
};

export function snapshotToDraft(input: { version: number; currency: string; lines: SnapshotLine[] }): DraftSnapshot {
  return {
    version: input.version,
    currency: input.currency,
    lines: input.lines.map((l) => ({
      id: String(l.id),
      label: String(l.label ?? ""),
      units: Number(l.units ?? 0),
      unitCents: Number(l.unit_cents ?? 0),
      proposedBy: l.proposed_by === "client" || l.proposed_by === "staff" || l.proposed_by === "system" ? l.proposed_by : null,
      confirmedAt: typeof l.confirmed_at === "string" ? l.confirmed_at : null,
    })),
  };
}

/**
 * The three-way diff of a stale save (MS18 / P12), in `diffDraft`'s own
 * terms: `base` is the basket before the operator's version (the previous
 * snapshot on the thread, or nothing when this was the first request),
 * `theirs` is the order as it stands now, `yours` is the basket the customer
 * was sent and the operator is still looking at. `diffDraft` reports
 * CONFLICTS: a line both sides touched, or one side still holds and the
 * other dropped. A line only the other side added is not a conflict and is
 * not listed; "take theirs" already has it.
 */
export function basketDiffFromSnapshot(sent: DraftSnapshot, current: DraftSnapshot, base?: DraftSnapshot): DraftDiffLine[] {
  return diffDraft(base ?? { version: 0, currency: sent.currency, lines: [] }, current, sent);
}

/** The open payment page on this thread and what moved under it. Null when no page is out. */
export async function loadBasketDiff(admin: Admin, input: { tenantId: string; inquiryId: string }): Promise<BasketDiff | null> {
  const { data: snapshots, error: sErr } = await admin
    .from("checkout_snapshots")
    .select("id, basket, basket_version, payment_link_id")
    .eq("tenant_id", input.tenantId)
    .eq("inquiry_id", input.inquiryId)
    .not("payment_link_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(5);
  if (sErr) return null;
  const list = (snapshots ?? []) as Array<Record<string, unknown>>;
  for (const [index, snap] of list.entries()) {
    const { data: link, error: lErr } = await admin
      .from("payment_links")
      .select("id, code, status, order_id, currency")
      .eq("id", snap.payment_link_id as string)
      .eq("tenant_id", input.tenantId)
      .maybeSingle();
    if (lErr) continue;
    const row = link as { id: string; code: string; status: string; order_id: string | null; currency: string | null } | null;
    if (!row || row.status !== "open" || !row.order_id) continue;
    const [{ data: order, error: oErr }, { data: lines, error: lnErr }, { data: events, error: evErr }] = await Promise.all([
      admin.from("orders").select("id, version, currency").eq("id", row.order_id).eq("tenant_id", input.tenantId).maybeSingle(),
      admin.from("order_lines").select("id, label, units, unit_cents, proposed_by, confirmed_at").eq("order_id", row.order_id),
      // The line history (S5): who changed what, and every price move. A
      // missing table (migration not yet applied) leaves the rows unannotated
      // rather than hiding the diff.
      admin
        .from("order_line_events")
        .select("line_id, actor_kind, created_at, change")
        .eq("tenant_id", input.tenantId)
        .eq("order_id", row.order_id)
        .order("created_at", { ascending: true })
        .limit(500),
    ]);
    if (oErr || lnErr) continue;
    const history = evErr ? [] : ((events ?? []) as LineEventRow[]);
    const o = order as { id: string; version: number; currency: string } | null;
    if (!o) continue;
    const basket = (snap.basket ?? {}) as { lines?: SnapshotLine[]; version?: number };
    const sent = snapshotToDraft({
      version: Number(snap.basket_version ?? basket.version ?? 1),
      currency: row.currency ?? o.currency,
      lines: Array.isArray(basket.lines) ? basket.lines : [],
    });
    const current = snapshotToDraft({ version: o.version, currency: o.currency, lines: (lines ?? []) as SnapshotLine[] });
    const previous = list[index + 1];
    const prevBasket = (previous?.basket ?? null) as { lines?: SnapshotLine[] } | null;
    const base = prevBasket
      ? snapshotToDraft({
          version: Number(previous?.basket_version ?? 0),
          currency: sent.currency,
          lines: Array.isArray(prevBasket.lines) ? prevBasket.lines : [],
        })
      : undefined;
    return {
      snapshotId: String(snap.id),
      linkId: row.id,
      linkCode: row.code,
      linkStatus: row.status,
      orderId: o.id,
      basketVersion: sent.version,
      orderVersion: o.version,
      diff: annotateDiffWithEvents(basketDiffFromSnapshot(sent, current, base), history),
    };
  }
  return null;
}
