import { z } from "zod";

export const ACCOUNT_STATUS_VALUES = [
  "registered",
  "onboarding",
  "active",
  "suspended",
] as const;

export const APP_ROLE_VALUES = [
  "client",
  "talent",
  "agency_staff",
  "super_admin",
] as const;

export const WORKFLOW_STATUS_VALUES = [
  "draft",
  "submitted",
  "under_review",
  "approved",
  "hidden",
  "archived",
] as const;

export const VISIBILITY_VALUES = ["hidden", "private", "public"] as const;

export const MEMBERSHIP_TIER_VALUES = [
  "",
  "free",
  "free_trial",
  "premium",
  "featured",
] as const;

export const BOOKING_STATUS_VALUES = [
  "draft",
  "tentative",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "archived",
] as const;

export const INQUIRY_STATUS_VALUES = [
  "new",
  "reviewing",
  "waiting_for_client",
  "talent_suggested",
  "in_progress",
  "qualified",
  "converted",
  "closed",
  "closed_lost",
  "archived",
  /** Phase 2 canonical workflow */
  "draft",
  "submitted",
  "coordination",
  "offer_pending",
  "approved",
  "booked",
  "rejected",
  "expired",
] as const;

export const CLIENT_ACCOUNT_TYPE_VALUES = [
  "private_client",
  "villa",
  "resort",
  "hotel",
  "restaurant",
  "beach_club",
  "real_estate_company",
  "bar_nightclub",
  "brand_activation",
  "event_venue",
  "office_company",
  "brand",
  "agency",
  "other",
] as const;

/** Values shown when creating a work location (legacy `brand` / `agency` omitted). */
export const CLIENT_LOCATION_CREATE_TYPE_VALUES = [
  "villa",
  "resort",
  "hotel",
  "beach_club",
  "restaurant",
  "bar_nightclub",
  "real_estate_company",
  "brand_activation",
  "event_venue",
  "office_company",
  "private_client",
  "other",
] as const satisfies ReadonlyArray<(typeof CLIENT_ACCOUNT_TYPE_VALUES)[number]>;

export const CLIENT_LOCATION_TYPE_LABELS: Record<
  (typeof CLIENT_LOCATION_CREATE_TYPE_VALUES)[number],
  string
> = {
  villa: "Villa / Residence",
  resort: "Resort",
  hotel: "Hotel",
  beach_club: "Beach club",
  restaurant: "Restaurant",
  bar_nightclub: "Bar / Nightclub",
  real_estate_company: "Real estate office",
  brand_activation: "Brand activation location",
  event_venue: "Event venue",
  office_company: "Office / Company location",
  private_client: "Private client residence",
  other: "Other",
};

/** Human label for `client_accounts.account_type` (includes legacy enum values). */
export function formatClientLocationAccountType(
  accountType: string,
  detail: string | null | undefined,
): string {
  if (accountType === "other" && detail?.trim()) {
    return `Other — ${detail.trim()}`;
  }
  const k = accountType as keyof typeof CLIENT_LOCATION_TYPE_LABELS;
  if (k in CLIENT_LOCATION_TYPE_LABELS) {
    return CLIENT_LOCATION_TYPE_LABELS[k];
  }
  return accountType.replace(/_/g, " ");
}

export const INQUIRY_SOURCE_CHANNEL_VALUES = [
  "directory_guest",
  "directory_client",
  "phone",
  "whatsapp",
  "email",
  "admin",
  "other",
] as const;

export const accountStatusSchema = z.enum(ACCOUNT_STATUS_VALUES);
export const appRoleSchema = z.enum(APP_ROLE_VALUES);
export const workflowStatusSchema = z.enum(WORKFLOW_STATUS_VALUES);
export const visibilitySchema = z.enum(VISIBILITY_VALUES);
export const membershipTierSchema = z.enum(MEMBERSHIP_TIER_VALUES);
export const bookingStatusSchema = z.enum(BOOKING_STATUS_VALUES);
/** Subset for forms; DB may still contain legacy `closed` until migrated. */
export const inquiryStatusSchema = z.enum(INQUIRY_STATUS_VALUES);
export const clientAccountTypeSchema = z.enum(CLIENT_ACCOUNT_TYPE_VALUES);
export const inquirySourceChannelSchema = z.enum(INQUIRY_SOURCE_CHANNEL_VALUES);

export const PAYMENT_METHOD_VALUES = ["cash", "transfer", "other"] as const;
export const PAYMENT_STATUS_VALUES = ["unpaid", "partial", "paid", "cancelled"] as const;
export const PRICING_UNIT_VALUES = ["hour", "day", "week", "event"] as const;

export const paymentMethodSchema = z.enum(PAYMENT_METHOD_VALUES);
export const paymentStatusSchema = z.enum(PAYMENT_STATUS_VALUES);
export const pricingUnitSchema = z.enum(PRICING_UNIT_VALUES);

export function trimmedString(formData: FormData, key: string): string {
  return String(formData.get(key) ?? "").trim();
}

export function booleanFromEquals(
  formData: FormData,
  key: string,
  expected = "true",
): boolean {
  return formData.get(key) === expected;
}

export function parseWithSchema<T>(
  schema: z.ZodType<T>,
  input: unknown,
): { data: T } | { error: string } {
  const parsed = schema.safeParse(input);
  if (parsed.success) return { data: parsed.data };
  return {
    error: parsed.error.issues[0]?.message ?? "Invalid form submission.",
  };
}
