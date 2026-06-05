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
  updateRecipientIdentity,
} from "./global-payouts-onboarding";

/** Build the Stripe recipient metadata from a talent profile (TAL- code, ids,
 *  contact). Shared by recipient creation and the "Sync from profile" action. */
function recipientMetadata(
  talentProfileId: string,
  tp: { profile_code: string | null; display_name: string | null; phone_e164: string | null },
  email: string,
): Record<string, string> {
  const meta: Record<string, string> = {
    talent_code: tp.profile_code ?? "",
    talent_profile_id: talentProfileId,
    talent_name: (tp.display_name ?? "").trim(),
    talent_email: email,
  };
  if (tp.phone_e164) meta.talent_phone = tp.phone_e164;
  for (const k of Object.keys(meta)) if (!meta[k]) delete meta[k];
  return meta;
}

/** Split a display name into legal given/surname for Stripe identity. */
function splitName(fullName: string): { givenName: string; surname: string } {
  const parts = fullName.trim().split(/\s+/);
  return { givenName: parts[0] ?? "", surname: parts.length > 1 ? parts.slice(1).join(" ") : "" };
}

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
  // created "Ready" (Stripe requires the legal name before payouts settle), and
  // attach traceable metadata (TAL- code, ids, contact).
  const fullName = (opts.displayName ?? tp.display_name ?? "Talent").trim();
  const { givenName, surname } = splitName(fullName);
  const metadata = recipientMetadata(talentProfileId, tp, opts.email);

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

/**
 * Push the talent's current profile (legal name + metadata) up to their existing
 * Stripe recipient. Powers the manual "Sync from profile" button: fixes a
 * recipient stuck on a missing-name requirement and refreshes the TAL-/contact
 * metadata. Email + country are immutable, so they are never touched here.
 */
export async function syncTalentGpRecipient(
  talentProfileId: string,
  opts: { email: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database unavailable." };
  const tp = await readProfile(sb, talentProfileId);
  if (!tp) return { ok: false, error: "Talent profile not found." };
  if (!tp.gp_recipient_account_id) {
    return { ok: false, error: "No global payouts profile yet. Add a bank first." };
  }
  const fullName = (tp.display_name ?? "Talent").trim();
  const { givenName, surname } = splitName(fullName);
  const r = await updateRecipientIdentity({
    recipientAccountId: tp.gp_recipient_account_id,
    givenName,
    surname,
    metadata: recipientMetadata(talentProfileId, tp, opts.email),
  });
  if (!r.ok) {
    logServerError("talent-gp.sync", new Error(r.error.message ?? "sync failed"));
    return { ok: false, error: r.error.message ?? "Could not sync your details." };
  }
  return { ok: true };
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
