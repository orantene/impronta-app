/**
 * Mint fresh pay links for the paid-QA spec (TUL-464), ISOLATED project only.
 *
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --tsconfig tsconfig.json scripts/qa/paid-qa-mint-links.mts --currency MXN --base http://hub.localhost:3001
 *   ... scripts/qa/paid-qa-mint-links.mts --teardown docs/plans/qa-evidence/paid-qa-<day>/minted-MXN.json
 *
 * One link per card case (success, decline, threeDS), each from its own sale driven through the real
 * writers: submitInquiry (client) -> createOffer / updateOfferDraft / sendOffer (talent) -> talent and
 * client accept -> ensureAcceptedOfferPayment, the same order + link writer the thread accept uses.
 * A link is single use, so every run mints new ones.
 *
 * One currency per process: sendOffer allows 5 sends an hour per actor in an in-memory limiter, and
 * a run needs 3 per currency. `global-setup.ts` runs this once per currency in PAID_QA_CURRENCIES.
 *
 * Prints ONE JSON line on stdout: {"currency","links":{"success","decline","threeDS"},"inquiries","orders"}
 * and writes the same to docs/plans/qa-evidence/paid-qa-<day>/minted-<currency>.json for --teardown.
 * Each link URL is rebuilt on --base, so the spec opens the local app, never a tenant's public domain.
 *
 * --teardown cancels every link still open from that file (paid sales stay: they are the evidence and the
 * after-pay spec's input) and reads back the open count, which must be 0.
 *
 * Refuses first: the Supabase target must be the isolated project, every Stripe key a test key, and
 * --base a local host. The client user id is read from web/.env.paid-qa-isolated.local (mode 600) and
 * nothing secret is printed.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { submitInquiry } from "@/lib/inquiry/inquiry-engine-submit";
import { createOffer, sendOffer, updateOfferDraft } from "@/lib/inquiry/inquiry-engine-offers";
import { clientAcceptOffer, talentRespondToOffer } from "@/lib/inquiry/inquiry-engine-approvals";
import { ensureAcceptedOfferPayment } from "@/lib/messaging/accept-offer-payment";
import { cancelPaymentLink } from "@/lib/payments/links";

const guard = (await import("../isolated-target-guard.mjs")) as {
  assertIsolatedJourneysTarget: (env: NodeJS.ProcessEnv, opts?: { requireIsolatedFlag?: boolean }) => unknown;
};
guard.assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
for (const k of ["STRIPE_SECRET_KEY", "STRIPE_MX_SECRET_KEY", "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"]) {
  const v = process.env[k];
  if (v && !/^(sk|pk|rk)_test_/.test(v)) {
    console.error(`[paid-qa-mint] refusing: ${k} is not a Stripe test key`);
    process.exit(2);
  }
}

const CASES = ["success", "decline", "threeDS"] as const;
/** The hub sale of paid run #2 (2026-10-09): a QA talent sells on the hub and its own user sends the offer. */
const DEFAULT_TENANT = "00000000-0000-0000-0000-000000000002";
/** An offer must be in the seller's currency (offer_currency_seller_mismatch), so each currency has its own QA seller. */
const DEFAULT_TALENT: Record<string, string> = {
  MXN: "33330003-0000-4000-8000-000000000001", // TAL-93023 QA Journeys Talent
  USD: "21060b38-77b8-4031-8c55-a1bced061777", // TAL-93026 QA Stylist C
};
const AMOUNT_CENTS: Record<string, number> = { MXN: 90_000, USD: 5_000 };

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

function isLocalHost(url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]" || h.endsWith(".localhost");
  } catch {
    return false;
  }
}

function fixtureEnv(): Record<string, string> {
  const path = join(process.cwd(), ".env.paid-qa-isolated.local");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return out;
}

const day = new Date().toISOString().slice(0, 10);
const evidence = join(process.cwd(), "docs/plans/qa-evidence", `paid-qa-${day}`);

type Minted = { currency: string; links: Record<string, string>; inquiries: string[]; orders: string[]; tenantId: string };

function must<T extends { success: boolean }>(step: string, r: T): T {
  if (!r.success) throw new Error(`${step} refused: ${JSON.stringify(r).slice(0, 200)}`);
  return r;
}

async function mint(): Promise<void> {
  const currency = (arg("currency") ?? "MXN").toUpperCase();
  const base = (arg("base") ?? process.env.PAID_QA_BASE_URL ?? "").replace(/\/+$/, "");
  if (!AMOUNT_CENTS[currency]) throw new Error(`unsupported currency ${currency}`);
  if (!isLocalHost(base)) throw new Error("--base must be a local host (localhost / *.localhost)");
  // Without a Stripe key the link is minted on the mock provider and never reaches a Stripe checkout.
  if (!/^sk_test_/.test(process.env.STRIPE_SECRET_KEY ?? "")) throw new Error("STRIPE_SECRET_KEY (a sk_test_ key) is required to mint Stripe links");

  const fx = fixtureEnv();
  const tenantId = process.env.PAID_QA_TENANT_ID ?? DEFAULT_TENANT;
  const talentId = process.env[`PAID_QA_TALENT_ID_${currency}`] ?? DEFAULT_TALENT[currency];
  const clientUserId = process.env.PAID_QA_CLIENT_USER_ID ?? fx.QA_CLIENT_USER_ID;
  const clientEmail = process.env.PAID_QA_CLIENT_EMAIL ?? fx.QA_CLIENT_EMAIL;
  if (!clientUserId || !clientEmail) throw new Error("no QA client: run scripts/qa/paid-qa-isolated-setup.mjs --apply first");

  const admin = createServiceRoleClient();
  if (!admin) throw new Error("no service role client");
  const { data: tp } = await admin.from("talent_profiles").select("user_id").eq("id", talentId).maybeSingle();
  const talentUserId = (tp as { user_id: string | null } | null)?.user_id;
  if (!talentUserId) throw new Error("the QA talent has no user");

  const versionOf = async (table: "inquiries" | "inquiry_offers", id: string): Promise<number> => {
    const { data } = await admin.from(table).select("version").eq("id", id).maybeSingle();
    return Number((data as { version?: number } | null)?.version ?? 1);
  };

  const out: Minted = { currency, links: {}, inquiries: [], orders: [], tenantId };
  const amountCents = AMOUNT_CENTS[currency];
  const total = amountCents / 100;
  const eventDate = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);

  // Written even when a step refuses, so --teardown also finds a half-made run.
  const record = () => {
    mkdirSync(evidence, { recursive: true });
    writeFileSync(join(evidence, `minted-${currency}.json`), JSON.stringify(out, null, 2));
  };
  try {
    for (const c of CASES) await mintCase(c);
  } finally {
    record();
  }
  console.log(JSON.stringify(out));

  async function mintCase(c: (typeof CASES)[number]) {
    const sub = must("submitInquiry", (await submitInquiry(admin, {
      tenant_id: tenantId,
      contact_name: `QA paid-qa ${c} ${currency}`,
      contact_email: clientEmail,
      event_date: eventDate,
      event_location: "Cancún",
      quantity: 1,
      message: `paid-qa TUL-464 ${c} ${currency}`,
      source_channel: "agency_site",
      client_user_id: clientUserId,
      talent_profile_ids: [talentId],
      actorUserId: clientUserId,
      initiator_role: "client",
    } as never)) as { success: boolean; data?: { inquiryId: string } });
    const inquiryId = sub.data!.inquiryId;
    out.inquiries.push(inquiryId);

    const created = must("createOffer", (await createOffer(admin, { inquiryId, tenantId, actorUserId: talentUserId, expectedVersion: await versionOf("inquiries", inquiryId), currencyCode: currency })) as { success: boolean; data?: { offerId?: string } });
    const offerId = created.data!.offerId!;
    must("updateOfferDraft", (await updateOfferDraft(admin, {
      inquiryId, tenantId, offerId, actorUserId: talentUserId,
      inquiryExpectedVersion: await versionOf("inquiries", inquiryId),
      offerExpectedVersion: await versionOf("inquiry_offers", offerId),
      total_client_price: total, coordinator_fee: 0, currency_code: currency, notes: null,
      lineItems: [{ talent_profile_id: talentId, label: `QA paid ${c}`, pricing_unit: "flat_package", units: 1, unit_price: total, total_price: total, talent_cost: total, notes: null, sort_order: 0, proposed_by: "staff" }],
    })) as { success: boolean });
    must("sendOffer", (await sendOffer(admin, { inquiryId, tenantId, offerId, actorUserId: talentUserId, inquiryExpectedVersion: await versionOf("inquiries", inquiryId), offerExpectedVersion: await versionOf("inquiry_offers", offerId) })) as { success: boolean });

    // The offer's own sender may already count as accepted; a refusal here is not fatal, the client accept decides.
    await talentRespondToOffer(admin, { inquiryId, tenantId, offerId, actorUserId: talentUserId, expectedVersion: await versionOf("inquiries", inquiryId), decision: "accepted" });
    const offerVersion = await versionOf("inquiry_offers", offerId);
    must("clientAcceptOffer", (await clientAcceptOffer(admin, { inquiryId, tenantId, offerId, actorUserId: clientUserId, expectedVersion: await versionOf("inquiries", inquiryId) })) as { success: boolean });

    const pay = await ensureAcceptedOfferPayment(admin, {
      tenantId,
      inquiryId,
      offerCreatedBy: talentUserId,
      publicOrigin: base,
      offer: { id: offerId, version: offerVersion, totalCents: amountCents, currency, depositPct: 0, depositCents: 0 },
    });
    if (!pay.ok || !pay.payCode) throw new Error(`no pay link for ${c}: ${JSON.stringify(pay).slice(0, 200)}`);
    out.orders.push(pay.orderId ?? "");
    out.links[c] = `${base}/pay/${pay.payCode}`;
  }
}

async function teardown(file: string): Promise<void> {
  const minted = JSON.parse(readFileSync(file, "utf8")) as Minted;
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("no service role client");
  const open = async () => {
    const { data } = await admin.from("payment_links").select("id").eq("tenant_id", minted.tenantId).in("inquiry_id", minted.inquiries).eq("status", "open");
    return (data ?? []) as Array<{ id: string }>;
  };
  for (const row of await open()) {
    const r = await cancelPaymentLink(admin, { tenantId: minted.tenantId, linkId: row.id });
    if (!r.ok && r.reason !== "already_paid") throw new Error(`cancel ${row.id}: ${r.reason}`);
  }
  const left = (await open()).length;
  console.log(JSON.stringify({ currency: minted.currency, openLinksLeft: left }));
  if (left !== 0) process.exit(1);
}

const td = arg("teardown");
(td ? teardown(td) : mint()).then(() => process.exit(0)).catch((e) => {
  console.error("[paid-qa-mint] FAILED", e instanceof Error ? e.message : e);
  process.exit(1);
});
