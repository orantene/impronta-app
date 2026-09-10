import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { ensureCustomer } from "@/lib/customers/ensure-customer";
import { identityVerdict } from "@/lib/orders/identity-requirement";
import type { Catalog } from "@/lib/orders/purchase-catalog";
import type { PricedLine } from "@/lib/orders/purchase-pricing";

/**
 * WHO the purchase is for, resolved before the order row exists.
 *
 * Split out of `purchase.ts` when it crossed the 800-line cap, along the same
 * kind of seam the catalog reads were cut on: this ANSWERS ONE QUESTION and
 * decides nothing else about the purchase. It is also the half most likely to
 * be read on its own, because the rule it implements is the surprising one.
 *
 * THE RULE. Money does not require a name; a PRODUCT may. A ticket the door
 * checks a person against, something that has to be delivered, credit spent
 * later — those need a buyer we can reach. A pastry does not, and the anonymous
 * buyer is reached through `orders.receipt_code` at `/r/<code>`.
 *
 * The demand itself is `lib/orders/identity-requirement`, which is pure and
 * shared with the POS counter (`lib/pos/collection.ts`), so the web and the
 * till cannot answer the same question two ways.
 */

export type PurchaseBuyer =
  | {
      ok: true;
      /** Null on an anonymous purchase. Never invented. */
      customerId: string | null;
      /**
       * Set only when there is no customer, because
       * `orders_draft_has_an_identity` still needs SOMETHING on the row. It
       * identifies the browser that opened the cart, which is why it does not
       * satisfy an identity demand: the door cannot check a browser.
       */
      guestSessionId: string | null;
    }
  | { ok: false; reason: "no_contact" | "engine_error"; error: string };

export async function resolvePurchaseBuyer(
  admin: SupabaseClient,
  input: {
    tenantId: string;
    contact: { email?: string | null; phone?: string | null; displayName?: string | null };
    actorUserId: string | null;
    locale?: string | null;
    lines: readonly PricedLine[];
    catalog: Extract<Catalog, { ok: true }>;
  },
): Promise<PurchaseBuyer> {
  const givenContact = Boolean(
    (input.contact.email ?? "").trim() || (input.contact.phone ?? "").trim(),
  );

  if (givenContact) {
    // Never creates an auth.users row.
    const customer = await ensureCustomer(
      {
        tenantId: input.tenantId,
        email: input.contact.email,
        phone: input.contact.phone,
        displayName: input.contact.displayName,
        userId: input.actorUserId,
        locale: input.locale,
      },
      // The SAME client the rest of the purchase uses. A helper that builds its
      // own would run one logical purchase across two connections.
      { admin },
    );
    if (!customer.ok) {
      // Contact WAS given and could not be resolved. That is a bad address or a
      // failed read, not an anonymous sale, and inventing a placeholder for it
      // would put the receipt beyond reach of the person who asked for one.
      return {
        ok: false,
        reason: customer.reason === "unavailable" ? "engine_error" : "no_contact",
        error: customer.error,
      };
    }
    return { ok: true, customerId: customer.customerId, guestSessionId: null };
  }

  const demanded = identityVerdict({
    hasCustomer: false,
    lines: input.lines.map((line) => {
      const raw = input.catalog.rawOfferings.get(line.offeringId);
      return {
        offeringId: line.offeringId,
        offeringTitle: input.catalog.offerings.get(line.offeringId)?.label ?? line.label,
        requiresIdentity: raw?.requiresIdentity === true,
        identityReason: raw?.identityReason ?? null,
      };
    }),
  });
  if (!demanded.ok) {
    return { ok: false, reason: "no_contact", error: demanded.message };
  }

  return { ok: true, customerId: null, guestSessionId: `web:${crypto.randomUUID()}` };
}
