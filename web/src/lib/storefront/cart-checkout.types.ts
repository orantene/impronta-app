/**
 * cart_checkout — the types the island codes against.
 *
 * Bottom-sheet cart → full-screen checkout on a phone; a side panel on
 * desktop. The DRAFT ORDER IS THE CART (no second store): a draft `orders`
 * row owned by the guest session or the signed-in customer, with lines
 * mutated by version so two tabs cannot lose each other's change.
 */

import type { StorefrontRefusal } from "./refusals";

export type FulfilmentMode = "pickup" | "delivery" | "at_table";

export type CartCheckoutProps = {
  modes?: FulfilmentMode[];
  tipPresets?: number[];
  promo?: boolean;
  locale?: string | null;
};

export type CartLine = {
  id: string;
  offeringId: string | null;
  variantId: string | null;
  addonIds: string[];
  label: string;
  units: number;
  unitCents: number;
  totalCents: number;
};

export type CartData = {
  /** Null when this person has no open cart on this workspace yet. */
  order: {
    id: string;
    /** The optimistic-concurrency token; send it back as `expectedVersion`. */
    version: number;
    currency: string;
    subtotalCents: number;
    discountCents: number;
    tipCents: number;
    taxCents: number;
    totalCents: number;
    lines: CartLine[];
    fulfilment: FulfilmentMode | null;
    promo: { code: string; discountCents: number } | null;
    customer: { name: string | null; email: string | null; phone: string | null } | null;
    /** True when a line demands a named buyer before payment. */
    requiresIdentity: boolean;
  } | null;
  modes: FulfilmentMode[];
  tipPresets: number[];
  promoEnabled: boolean;
  prefill: { name: string | null; email: string | null } | null;
};

type Common = { tenantId: string; locale?: string | null };

export type CartCheckoutInput =
  | (Common & { op: "create"; fulfilment?: FulfilmentMode | null; sourcePage?: string | null })
  | (Common & {
      op: "add_line";
      orderId: string;
      line: { offeringId: string; units: number; variantId?: string | null; addonIds?: string[]; sessionId?: string | null };
    })
  | (Common & { op: "update_line"; orderId: string; lineId: string; units: number })
  | (Common & { op: "remove_line"; orderId: string; lineId: string })
  | (Common & { op: "apply_promo"; orderId: string; code: string })
  | (Common & { op: "set_fulfilment"; orderId: string; fulfilment: FulfilmentMode; spaceId?: string | null })
  | (Common & { op: "set_tip"; orderId: string; tipCents: number })
  | (Common & { op: "identify"; orderId: string; contact: { name: string; email?: string | null; phone?: string | null } })
  | (Common & {
      op: "start_payment";
      orderId: string;
      /** INTENT; the offerings' policies decide. */
      payment: "full" | "in_person";
      sourcePage?: string | null;
      /** Age attestation when something in the cart is gated. */
      confirmedAge?: number | null;
    });

export type CartCheckoutDone =
  | { ok: true; op: "create"; orderId: string; version: number; already: boolean }
  | { ok: true; op: "add_line" | "update_line" | "remove_line" | "set_fulfilment" | "set_tip" | "identify"; orderId: string; version: number }
  | { ok: true; op: "apply_promo"; orderId: string; version: number; discountCents: number }
  | {
      ok: true;
      op: "start_payment";
      /** The SALE created from the cart; the cart itself is closed. */
      orderId: string;
      receiptCode: string | null;
      receiptUrl: string | null;
      collectCents: number;
      /** Present when there is money to collect online. */
      checkoutUrl: string | null;
      payInPerson: boolean;
      replayed: boolean;
    };

export type CartCheckoutResult = CartCheckoutDone | StorefrontRefusal;
