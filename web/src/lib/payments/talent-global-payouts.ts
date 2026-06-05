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
  archiveRecipientPayoutMethod,
  createGlobalPayoutsRecipient,
  createRecipientAccountLink,
  createRecipientBankPayoutMethod,
  getRecipientDefaultPayoutMethodId,
  getRecipientOnboardingState,
  listRecipientPayoutMethods,
  setRecipientDefaultPayoutMethod,
  updateRecipientIdentity,
} from "./global-payouts-onboarding";
import { resolveTalentPayoutCountry } from "./stripe-connect-talent";

/** A talent's payout destination, flattened for the UI. */
export type TalentGpMethod = {
  id: string;
  last4: string | null;
  bankName: string | null;
  country: string | null;
  currency: string | null;
  isDefault: boolean;
};

/** Real recipient status, surfaced as a pill in the UI. */
export type TalentGpStatusKind = "not_started" | "info_needed" | "pending" | "ready";

/** Build the Stripe recipient metadata from a talent profile: the TAL- code as
 *  talent_id, the profile uuid, contact, and traceability (source/environment/
 *  user). Shared by recipient creation, sync, and the hosted setup link. */
function recipientMetadata(
  talentProfileId: string,
  tp: { profile_code: string | null; display_name: string | null; phone_e164: string | null },
  opts: { email: string; userId?: string | null; workspaceId?: string | null },
): Record<string, string> {
  const code = (tp.profile_code ?? "").trim();
  const meta: Record<string, string> = {
    talent_profile_id: talentProfileId,
    source: "tulala_payout_setup",
    environment: (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_live") ? "live" : "sandbox",
    talent_name: (tp.display_name ?? "").trim(),
    talent_email: opts.email,
  };
  if (code) {
    meta.talent_id = code; // the human TAL-xxxxx code
    meta.profile_code = code;
  }
  if (tp.phone_e164) meta.whatsapp_number = tp.phone_e164;
  if (opts.userId) meta.user_id = opts.userId;
  if (opts.workspaceId) meta.workspace_id = opts.workspaceId;
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
  opts: { country: string; email: string; displayName?: string | null; userId?: string | null; workspaceId?: string | null },
): Promise<{ ok: true; recipientAccountId: string } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database unavailable." };
  const tp = await readProfile(sb, talentProfileId);
  if (!tp) return { ok: false, error: "Talent profile not found." };

  // Split the profile display name into legal given/surname so the recipient is
  // created "Ready" (Stripe requires the legal name before payouts settle), and
  // attach traceable metadata (TAL- code, ids, contact).
  const fullName = (opts.displayName ?? tp.display_name ?? "Talent").trim();
  const { givenName, surname } = splitName(fullName);
  const metadata = recipientMetadata(talentProfileId, tp, {
    email: opts.email,
    userId: opts.userId,
    workspaceId: opts.workspaceId,
  });

  // Existing recipient: keep its identity + metadata in sync with the current
  // profile (folds "sync from profile" into the flow). If that fails with a
  // permission/not-found error, the stored recipient was created in a different
  // Stripe mode/platform (e.g. a leftover sandbox id) and is unusable here, so
  // we clear it and create a fresh one below. This self-heals across env switches
  // instead of erroring forever on a stale recipient.
  if (tp.gp_recipient_account_id) {
    const upd = await updateRecipientIdentity({
      recipientAccountId: tp.gp_recipient_account_id,
      givenName,
      surname,
      metadata,
    });
    if (upd.ok) return { ok: true, recipientAccountId: tp.gp_recipient_account_id };
    const stale =
      upd.status === 403 ||
      upd.status === 404 ||
      /permission|no such|does not exist|cannot find/i.test(upd.error.message ?? "");
    if (!stale) {
      // Transient error: the recipient still exists, keep using it.
      return { ok: true, recipientAccountId: tp.gp_recipient_account_id };
    }
    logServerError(
      "talent-gp.staleRecipient",
      new Error(`clearing unusable recipient ${tp.gp_recipient_account_id}: ${upd.error.message ?? upd.status}`),
    );
    await sb.from("talent_profiles").update({ gp_recipient_account_id: null }).eq("id", talentProfileId);
  }

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
    metadata: recipientMetadata(talentProfileId, tp, { email: opts.email }),
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
    return { ok: false, error: pm.error.message ?? "Could not add your bank. Check the details." };
  }

  // Make the new method the default destination when none is set yet (the first
  // bank), so an OutboundPayment always has somewhere to land.
  const newPmId = pm.data.payout_method?.id;
  if (newPmId) {
    const currentDefault = await getRecipientDefaultPayoutMethodId(rec.recipientAccountId);
    if (!currentDefault) await setRecipientDefaultPayoutMethod(rec.recipientAccountId, newPmId);
  }

  return { ok: true, recipientAccountId: rec.recipientAccountId };
}

/** List the talent's payout methods (bank accounts) with the default flagged,
 *  plus the talent's profile country so the add-account form can prefill it. */
export async function listTalentGpPayoutMethods(
  talentProfileId: string,
): Promise<
  | {
      ok: true;
      methods: TalentGpMethod[];
      defaultId: string | null;
      profileCountry: string | null;
      status: TalentGpStatusKind;
    }
  | { ok: false; error: string }
> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database unavailable." };
  const tp = await readProfile(sb, talentProfileId);
  const rid = tp?.gp_recipient_account_id ?? null;
  const profileCountry = await resolveTalentPayoutCountry(talentProfileId);
  if (!rid) return { ok: true, methods: [], defaultId: null, profileCountry, status: "not_started" };

  const [list, defaultId, state] = await Promise.all([
    listRecipientPayoutMethods(rid),
    getRecipientDefaultPayoutMethodId(rid),
    getRecipientOnboardingState(rid),
  ]);
  if (!list.ok) return { ok: false, error: list.error.message ?? "Could not load your accounts." };

  const methods: TalentGpMethod[] = (list.data.data ?? [])
    .filter((m) => !m.bank_account?.archived)
    .map((m) => ({
      id: m.id,
      last4: m.bank_account?.last4 ?? null,
      bankName: m.bank_account?.bank_name ?? null,
      country: m.bank_account?.country ?? null,
      currency: m.bank_account?.supported_currencies?.[0] ?? null,
      isDefault: m.id === defaultId,
    }));

  const status: TalentGpStatusKind = state.bankActive
    ? "ready"
    : state.needsUserAction
      ? "info_needed"
      : "pending";
  return { ok: true, methods, defaultId, profileCountry, status };
}

/**
 * Stripe-HOSTED setup link: ensure the recipient exists (prefilled from the
 * profile, with full metadata), then return the co-branded Stripe onboarding /
 * update URL where the talent completes bank + KYC. Replaces the custom form.
 */
export async function getTalentGpAccountLink(
  talentProfileId: string,
  opts: { email: string; userId?: string | null; returnUrl: string; refreshUrl: string },
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const country = await resolveTalentPayoutCountry(talentProfileId);
  if (!country) {
    return { ok: false, error: "Set your country of residence on your profile first." };
  }
  const rec = await getOrCreateTalentGpRecipient(talentProfileId, {
    country,
    email: opts.email,
    userId: opts.userId,
  });
  if (!rec.ok) return rec;

  let link = await createRecipientAccountLink({
    recipientAccountId: rec.recipientAccountId,
    returnUrl: opts.returnUrl,
    refreshUrl: opts.refreshUrl,
    mode: "onboarding",
  });
  if (!link.ok && /already been onboarded/i.test(link.error.message ?? "")) {
    link = await createRecipientAccountLink({
      recipientAccountId: rec.recipientAccountId,
      returnUrl: opts.returnUrl,
      refreshUrl: opts.refreshUrl,
      mode: "update",
    });
  }
  if (!link.ok) {
    logServerError("talent-gp.accountLink", new Error(link.error.message ?? "account link failed"));
    return { ok: false, error: link.error.message ?? "Could not start payout setup." };
  }
  return { ok: true, url: link.data.url };
}

/** Set one of the talent's payout methods as the default destination. */
export async function setTalentGpDefault(
  talentProfileId: string,
  payoutMethodId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database unavailable." };
  const tp = await readProfile(sb, talentProfileId);
  if (!tp?.gp_recipient_account_id) return { ok: false, error: "No payout profile yet." };
  const r = await setRecipientDefaultPayoutMethod(tp.gp_recipient_account_id, payoutMethodId);
  if (!r.ok) return { ok: false, error: r.error.message ?? "Could not set the default account." };
  return { ok: true };
}

/** Remove (archive) one of the talent's payout methods. Refuses to remove the
 *  default (set another default first) so payouts never lose their destination. */
export async function removeTalentGpPayoutMethod(
  talentProfileId: string,
  payoutMethodId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceRoleClient();
  if (!sb) return { ok: false, error: "Database unavailable." };
  const tp = await readProfile(sb, talentProfileId);
  if (!tp?.gp_recipient_account_id) return { ok: false, error: "No payout profile yet." };
  const defaultId = await getRecipientDefaultPayoutMethodId(tp.gp_recipient_account_id);
  if (payoutMethodId === defaultId) {
    return { ok: false, error: "Set another account as default before removing this one." };
  }
  const r = await archiveRecipientPayoutMethod(tp.gp_recipient_account_id, payoutMethodId);
  if (!r.ok) return { ok: false, error: r.error.message ?? "Could not remove the account." };
  return { ok: true };
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
