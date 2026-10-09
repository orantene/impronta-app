/**
 * Drive a hub sale's OFFER through the real engine functions as the talent user, for the
 * paid-QA run (isolated stack only). Used when the talent has no UI to start an offer on a
 * client-initiated hub inquiry (her seat is only 'invited').
 *
 *   set -a; . ../.paidqa.server.env; set +a        # isolated env, never production
 *   export JOURNEYS_ISOLATED=1
 *   NODE_OPTIONS='--require ./scripts/register-server-only-test.cjs' \
 *     npx tsx --tsconfig tsconfig.json scripts/qa/hub-offer-drive.mts --inquiry <id> [--amount-cents 100000]
 *
 * Steps (each prints its engine result): seat check -> createOffer -> updateOfferDraft ->
 * sendOffer -> offer_review card -> the guest thread link. The FIRST step proves the offer start
 * is allowed while her seat is still 'invited' (TUL-484 gate). Writes ONLY to the isolated project:
 * the isolated-target guard refuses first, and any non-test Stripe key refuses too.
 */
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { createOffer, sendOffer, updateOfferDraft } from "@/lib/inquiry/inquiry-engine-offers";
import { insertMessage } from "@/lib/messaging/insert-message";
import { publicThreadPath, signThreadToken } from "@/lib/messaging/thread-token";

const guard = (await import("../isolated-target-guard.mjs")) as {
  assertIsolatedJourneysTarget: (env: NodeJS.ProcessEnv, opts?: { requireIsolatedFlag?: boolean }) => unknown;
};
guard.assertIsolatedJourneysTarget(process.env, { requireIsolatedFlag: true });
for (const k of ["STRIPE_SECRET_KEY", "STRIPE_MX_SECRET_KEY"]) {
  const v = process.env[k];
  if (v && !/^sk_test_/.test(v)) {
    console.error(`[hub-offer-drive] refusing: ${k} is not a Stripe test key`);
    process.exit(2);
  }
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function main() {
  const inquiryId = arg("inquiry");
  const amountCents = Number(arg("amount-cents") ?? 100_000);
  if (!inquiryId || !(amountCents > 0)) throw new Error("usage: --inquiry <id> [--amount-cents N]");
  const admin = createServiceRoleClient();
  if (!admin) throw new Error("no service role client");

  const { data: inq } = await admin.from("inquiries").select("id, tenant_id, version").eq("id", inquiryId).maybeSingle();
  if (!inq) throw new Error("inquiry not found");
  const tenantId = (inq as { tenant_id: string }).tenant_id;
  const { data: seats } = await admin.from("inquiry_participants").select("role, status, talent_profile_id").eq("inquiry_id", inquiryId).eq("role", "talent");
  const seat = ((seats ?? []) as Array<{ status: string; talent_profile_id: string | null }>)[0];
  if (!seat?.talent_profile_id) throw new Error("no talent seat on the inquiry");
  const { data: tp } = await admin.from("talent_profiles").select("user_id, profile_code").eq("id", seat.talent_profile_id).maybeSingle();
  const actorUserId = (tp as { user_id: string | null } | null)?.user_id;
  if (!actorUserId) throw new Error("the talent has no user");
  console.log(`seat: ${(tp as { profile_code: string }).profile_code} status=${seat.status} tenant=${tenantId}`);

  const versionOf = async (table: "inquiries" | "inquiry_offers", id: string): Promise<number> => {
    const { data } = await admin.from(table).select("version").eq("id", id).maybeSingle();
    return Number((data as { version?: number } | null)?.version ?? 1);
  };

  const created = (await createOffer(admin, { inquiryId, tenantId, actorUserId, expectedVersion: await versionOf("inquiries", inquiryId), currencyCode: "MXN" })) as { success: boolean; data?: { offerId?: string } };
  console.log("createOffer:", JSON.stringify(created));
  if (!created.success || !created.data?.offerId) throw new Error("createOffer refused");
  const offerId = created.data.offerId;

  const total = amountCents / 100;
  const updated = (await updateOfferDraft(admin, {
    inquiryId, tenantId, offerId, actorUserId,
    inquiryExpectedVersion: await versionOf("inquiries", inquiryId),
    offerExpectedVersion: await versionOf("inquiry_offers", offerId),
    total_client_price: total, coordinator_fee: 0, currency_code: "MXN", notes: null,
    lineItems: [{ talent_profile_id: seat.talent_profile_id, label: "QA own-workspace sale", pricing_unit: "flat_package", units: 1, unit_price: total, total_price: total, talent_cost: total, notes: null, sort_order: 0, proposed_by: "staff" }],
  })) as { success: boolean };
  console.log("updateOfferDraft:", JSON.stringify(updated));
  if (!updated.success) throw new Error("updateOfferDraft refused");

  const offerVersion = await versionOf("inquiry_offers", offerId);
  const sent = (await sendOffer(admin, { inquiryId, tenantId, offerId, actorUserId, inquiryExpectedVersion: await versionOf("inquiries", inquiryId), offerExpectedVersion: offerVersion })) as { success: boolean };
  console.log("sendOffer:", JSON.stringify(sent));
  if (!sent.success) throw new Error("sendOffer refused");

  await insertMessage(admin, {
    tenantId, inquiryId, kind: "offer_review", body: "Offer sent",
    payload: { state: "sent", offerId, version: await versionOf("inquiry_offers", offerId), totalCents: amountCents, currency: "MXN", validUntil: null },
    senderUserId: actorUserId,
  } as never);

  const token = signThreadToken(inquiryId, tenantId);
  console.log(`OFFER SENT offerId=${offerId} total=${amountCents} MXN`);
  console.log(`GUEST_THREAD_PATH ${token ? publicThreadPath(token) : "(no GUEST_COOKIE_SECRET)"}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error("FAILED", e instanceof Error ? e.message : e); process.exit(1); });
