/** package_selector — comparison cards; desktop table. The act buys one package. */

import type { StorefrontRefusal } from "./refusals";

export type PackageSelectorProps = { packageIds?: string[] | "all"; locale?: string | null };

export type PackageCard = {
  id: string;
  title: string;
  description: string | null;
  amountCents: number | null;
  /** The live phase price when one applies; equals amountCents otherwise. */
  livePriceCents: number | null;
  currency: string;
  allowPayInPerson: boolean;
  requiresIdentity: boolean;
  components: Array<{ offeringId: string; title: string; qty: number; required: boolean }>;
};

export type PackageSelectorData = { packages: PackageCard[] };

export type PackageSelectorInput = {
  tenantId: string;
  packageId: string;
  units?: number;
  contact: { name: string; email: string; phone?: string | null };
  payment: "full" | "in_person";
  /** Per CART, not per click. */
  clientOrderKey: string;
  sourcePage?: string | null;
  locale?: string | null;
};

export type PackageSelectorDone = {
  ok: true;
  orderId: string;
  collectCents: number;
  checkoutUrl: string | null;
  receiptUrl: string | null;
  payInPerson: boolean;
  replayed: boolean;
};

export type PackageSelectorResult = PackageSelectorDone | StorefrontRefusal;
