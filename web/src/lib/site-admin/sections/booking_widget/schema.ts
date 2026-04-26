import { z } from "zod";
import { sectionPresentationSchema } from "../shared/presentation";

function isAllowedBookingUrl(value: string): boolean {
  try {
    const u = new URL(value);
    if (u.protocol !== "https:") return false;
    return [
      "calendly.com",
      "cal.com",
      "savvycal.com",
      "acuityscheduling.com",
      "squarespacescheduling.com",
      "youcanbook.me",
    ].some((h) => u.hostname === h || u.hostname.endsWith(`.${h}`));
  } catch {
    return false;
  }
}

export const bookingWidgetSchemaV1 = z.object({
  eyebrow: z.string().max(60).optional(),
  headline: z.string().max(200).optional(),
  intro: z.string().max(400).optional(),
  /** Booking provider URL (Calendly, Cal.com, etc). HTTPS, allow-listed. */
  url: z.string().url().max(500).refine(isAllowedBookingUrl, "URL must be on an allow-listed booking host"),
  /** Render style: inline iframe vs popup button. */
  variant: z.enum(["inline", "button"]).default("inline"),
  /** Button label when variant=button. */
  buttonLabel: z.string().max(60).default("Book a call"),
  /** Inline-only: aspect ratio for the embed. */
  ratio: z.enum(["16/9", "4/3", "1/1", "5/4"]).default("4/3"),
  /** Inline-only: minimum height in px (overrides ratio when set). */
  minHeight: z.number().int().min(300).max(1600).optional(),
  presentation: sectionPresentationSchema,
});

export type BookingWidgetV1 = z.infer<typeof bookingWidgetSchemaV1>;
export const bookingWidgetSchemasByVersion = { 1: bookingWidgetSchemaV1 } as const;
