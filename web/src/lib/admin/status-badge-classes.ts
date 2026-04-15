import { cn } from "@/lib/utils";

const INQUIRY_GRAY = "border-border/55 bg-muted/40 text-muted-foreground";
const INQUIRY_BLUE = "border-sky-500/35 bg-sky-500/10 text-sky-950 dark:text-sky-100";
const INQUIRY_PURPLE = "border-violet-500/35 bg-violet-500/10 text-violet-950 dark:text-violet-100";
const INQUIRY_GREEN = "border-emerald-500/40 bg-emerald-500/10 text-emerald-950 dark:text-emerald-100";
const INQUIRY_RED = "border-red-500/40 bg-red-500/10 text-red-950 dark:text-red-100";
const INQUIRY_MUTED = "border-border/50 bg-muted/25 text-muted-foreground";

/** Inquiry workflow status — list, peek, headers, strip callouts. */
export function adminInquiryStatusBadgeClass(status: string): string {
  switch (status) {
    case "new":
      return INQUIRY_GRAY;
    case "reviewing":
    case "waiting_for_client":
    case "talent_suggested":
    case "in_progress":
      return INQUIRY_BLUE;
    case "qualified":
      return INQUIRY_PURPLE;
    case "converted":
    case "booked":
    case "approved":
      return INQUIRY_GREEN;
    case "coordination":
    case "offer_pending":
    case "submitted":
      return INQUIRY_BLUE;
    case "rejected":
    case "expired":
    case "closed_lost":
      return INQUIRY_RED;
    case "draft":
      return INQUIRY_MUTED;
    case "closed":
    case "archived":
      return INQUIRY_MUTED;
    default:
      return INQUIRY_GRAY;
  }
}

const BOOKING_GRAY = INQUIRY_GRAY;
const BOOKING_GREEN = INQUIRY_GREEN;
const BOOKING_BLUE = INQUIRY_BLUE;
const BOOKING_RED = INQUIRY_RED;
const BOOKING_MUTED = INQUIRY_MUTED;

export function adminBookingStatusBadgeClass(status: string): string {
  switch (status) {
    case "draft":
    case "tentative":
      return BOOKING_GRAY;
    case "confirmed":
    case "completed":
      return BOOKING_GREEN;
    case "in_progress":
      return BOOKING_BLUE;
    case "cancelled":
      return BOOKING_RED;
    case "archived":
      return BOOKING_MUTED;
    default:
      return BOOKING_GRAY;
  }
}

/** Client portal user `profiles.account_status`. */
export function adminClientAccountStatusBadgeClass(status: string): string {
  switch (status) {
    case "registered":
      return INQUIRY_GRAY;
    case "onboarding":
      return INQUIRY_BLUE;
    case "active":
      return INQUIRY_GREEN;
    case "suspended":
      return INQUIRY_RED;
    default:
      return INQUIRY_GRAY;
  }
}

export function adminStatusBadgePillClass(kind: "inquiry" | "booking" | "client", value: string): string {
  const inner =
    kind === "inquiry"
      ? adminInquiryStatusBadgeClass(value)
      : kind === "booking"
        ? adminBookingStatusBadgeClass(value)
        : adminClientAccountStatusBadgeClass(value);
  return cn("border font-medium capitalize", inner);
}
