/**
 * lib/payments/talent-global-payouts.ts
 *
 * Talent-keyed Global Payouts (v2) setup — lets a talent receive payouts to
 * their LOCAL bank in their own country via the OutboundPayments rail, as an
 * alternative to the Connect/Express path. Wraps the GP onboarding helpers and
 * persists the recipient account id on `talent_profiles.gp_recipient_account_id`
 * (the target executeBookingTransfers' `global_payouts` rail pays out to).
 *
 * Server-only.
 */

import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import {
  createGlobalPayoutsRecipient,
  createRecipientBankPayoutMethod,
  listRecipientPayoutMethods,
} from "./global-payouts-onboarding";

export type TalentGpStatus = {
  recipientAccountId: string | null;
  hasBank: boolean;
  country: string | null;
  currency: string | null;
  bankLast4: string | null;
};

const EMPTY: TalentGpStatus = {
  recipientAccountId: null,
  hasBank: false,
  country: null,
  currency: null,
  bankLast4: null,
};

type Admin = NonNullable<ReturnType<typeof createServiceRoleClient>>;

async function readProfile(sb: Admin, talentProfileId: string) {
  const { data } = await sb
    .from("talent_profiles")
    .select("id, display_name, gp_recipient_account_id, profile_code, phone_e164")
    .eq("id", talentProfileId)
    .maybeSingle();
  return data as
    | {
        id: string;
        display_name: string | null;
        gp_recipient_account_id: string | null;
        profile_code: string | null;
        phone_e164: string | null;
      }
    | null;
}

/** Create-or-get the talent's GP recipient (v2 core account), persisting its id. */
export async function getOrCreateTalentGpRecipient(
  talentProfileId: string,
  opts: { country: string; email: string; displayName?: string | null },
): Promise<{ ok: true; recipientAccountId: string } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database unavailable." };
  const tp = await readProfile(sb, talentProfileId);
  if (!tp) return { ok: false, error: "Talent profile not found." };
  if (tp.gp_recipient_account_id) return { ok: true, recipientAccountId: tp.gp_recipient_account_id };

  // Split the profile display name into legal given/surname so the recipient is
  // created "Ready" (Stripe requires the legal name before payouts settle).
  const fullName = (opts.displayName ?? tp.display_name ?? "Talent").trim();
  const nameParts = fullName.split(/\s+/);
  const givenName = nameParts[0] ?? "";
  const surname = nameParts.length > 1 ? nameParts.slice(1).join(" ") : "";

  // Rich, queryable metadata on the Stripe recipient so a payout can be traced
  // back to the talent from the Stripe dashboard: the human TAL- code, the
  // internal id, name, and contact. (Stripe metadata: string values, <=40-char keys.)
  const metadata: Record<string, string> = {
    talent_code: tp.profile_code ?? "",
    talent_profile_id: talentProfileId,
    talent_name: fullName,
    talent_email: opts.email,
  };
  if (tp.phone_e164) metadata.talent_phone = tp.phone_e164;
  // Drop empty values (Stripe rejects empty-string metadata on some keys).
  for (const k of Object.keys(metadata)) if (!metadata[k]) delete metadata[k];

  const r = await createGlobalPayoutsRecipient({
    email: opts.email,
    displayName: fullName,
    country: opts.country,
    givenName,
    surname,
    metadata,
  });
  if (!r.ok) {
    logServerError("talent-gp.createRecipient", new Error(r.error.message ?? "recipient create failed"));
    return { ok: false, error: r.error.message ?? "Could not create your global payouts profile." };
  }

  const { error: writeErr } = await sb
    .from("talent_profiles")
    .update({ gp_recipient_account_id: r.data.id })
    .eq("id", talentProfileId);
  if (writeErr) {
    logServerError("talent-gp.persistRecipient", writeErr);
    return { ok: false, error: "Could not save your global payouts profile." };
  }
  return { ok: true, recipientAccountId: r.data.id };
}

/** Set up a bank payout method for the talent's GP recipient (creates the
 *  recipient first if needed). */
export async function setupTalentGpBank(
  talentProfileId: string,
  opts: {
    country: string;
    currency: string;
    accountNumber: string;
    routingNumber?: string | null;
    email: string;
    displayName?: string | null;
  },
): Promise<{ ok: true; recipientAccountId: string } | { ok: false; error: string }> {
  const rec = await getOrCreateTalentGpRecipient(talentProfileId, {
    country: opts.country,
    email: opts.email,
    displayName: opts.displayName,
  });
  if (!rec.ok) return rec;

  const pm = await createRecipientBankPayoutMethod({
    recipientAccountId: rec.recipientAccountId,
    bank: {
      country: opts.country,
      currency: opts.currency,
      accountNumber: opts.accountNumber,
      routingNumber: opts.routingNumber,
    },
  });
  if (!pm.ok) {
    logServerError("talent-gp.addBank", new Error(pm.error.message ?? "bank add failed"));
    return { ok: false, error: pm.error.message ?? "Could not add your bank — check the details." };
  }
  return { ok: true, recipientAccountId: rec.recipientAccountId };
}

/** Current GP setup status for the talent (recipient + first bank method). */
export async function getTalentGpStatus(talentProfileId: string): Promise<TalentGpStatus> {
  const sb = createServiceRoleClient();
  if (!sb) return EMPTY;
  const tp = await readProfile(sb, talentProfileId);
  const rid = tp?.gp_recipient_account_id ?? null;
  if (!rid) return EMPTY;

  const pms = await listRecipientPayoutMethods(rid);
  if (pms.ok && pms.data.data?.length) {
    const ba = pms.data.data[0].bank_account ?? null;
    return {
      recipientAccountId: rid,
      hasBank: true,
      country: ba?.country ?? null,
      currency: ba?.supported_currencies?.[0] ?? null,
      bankLast4: ba?.last4 ?? null,
    };
  }
  return { recipientAccountId: rid, hasBank: false, country: null, currency: null, bankLast4: null };
}
