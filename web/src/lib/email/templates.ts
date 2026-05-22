/**
 * Simple transactional email HTML templates.
 * Plain structure — no heavy dependencies. Inline styles for email client compat.
 *
 * Branding: wordmark + footer use the platform brand as a safe default. Per-tenant
 * branding (agency name in the wordmark, custom domain in the footer) is passed in
 * through the `brand` argument when the caller has the tenant identity available.
 */

import { PLATFORM_BRAND } from "@/lib/platform/brand";

const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? `https://${PLATFORM_BRAND.domain}`).replace(/\/$/, "");

export interface EmailBrand {
  /** Wordmark label rendered in the header. Defaults to the platform brand. */
  wordmark?: string;
  /** Human name used in the footer "account with ..." line. */
  accountName?: string;
  /** Short domain rendered as the footer link. Defaults to the platform domain. */
  footerDomain?: string;
  /** Home link for the wordmark. Defaults to `NEXT_PUBLIC_SITE_URL` / platform domain. */
  homeHref?: string;
}

function resolveBrand(brand?: EmailBrand) {
  return {
    wordmark: brand?.wordmark ?? PLATFORM_BRAND.name.toUpperCase(),
    accountName: brand?.accountName ?? PLATFORM_BRAND.name,
    footerDomain: brand?.footerDomain ?? PLATFORM_BRAND.domain,
    homeHref: brand?.homeHref ?? siteUrl(),
  };
}

function layout(body: string, brand?: EmailBrand): string {
  const b = resolveBrand(brand);
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
</head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:40px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;" cellpadding="0" cellspacing="0">
          <!-- Brand header -->
          <tr>
            <td style="padding-bottom:24px;text-align:center;">
              <a href="${b.homeHref}" style="font-family:Georgia,serif;font-size:18px;letter-spacing:0.2em;color:#1a1a1a;text-decoration:none;font-weight:600;">${b.wordmark}</a>
            </td>
          </tr>
          <!-- Card -->
          <tr>
            <td style="background:#ffffff;border-radius:12px;border:1px solid #e5e5e5;padding:32px 32px 28px;">
              ${body}
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="padding-top:20px;text-align:center;font-size:12px;color:#888888;">
              You received this because you have an account with ${b.accountName}.
              <br/>
              <a href="${b.homeHref}" style="color:#888888;">${b.footerDomain}</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function button(href: string, label: string): string {
  return `<a href="${href}" style="display:inline-block;margin-top:20px;padding:12px 24px;background:#c9a227;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:600;font-size:14px;">${label}</a>`;
}

/** Sent to client when coordinator publishes an offer. */
export function offerSentEmail(data: {
  clientName: string | null;
  inquiryId: string;
  contactName: string | null;
  totalAmount: string;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const name = data.clientName ?? "there";
  const event = data.contactName ?? "your inquiry";
  const href = `${siteUrl()}/client/inquiries/${data.inquiryId}?tab=offer`;

  return {
    subject: `Offer ready for ${event}`,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Your offer is ready</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
        Hi ${name}, the agency has prepared an offer for <strong>${event}</strong>.
      </p>
      <table role="presentation" style="width:100%;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:16px;">
        <tr>
          <td style="padding:12px 16px;font-size:13px;color:#666;">Total</td>
          <td style="padding:12px 16px;font-size:14px;font-weight:700;color:#1a1a1a;text-align:right;">${data.totalAmount}</td>
        </tr>
      </table>
      <p style="margin:0;font-size:14px;color:#555555;">
        Review the offer and accept or decline from your dashboard.
      </p>
      ${button(href, "Review offer →")}
    `,
      data.brand,
    ),
  };
}

/** Sent to client + each talent when a booking is confirmed. */
export function bookingConfirmedEmail(data: {
  recipientName: string | null;
  role: "client" | "talent";
  bookingId: string;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const name = data.recipientName ?? "there";
  const event = data.contactName ?? "your booking";
  const href =
    data.role === "client"
      ? `${siteUrl()}/client/bookings/${data.bookingId}`
      : `${siteUrl()}/talent/inquiries`;

  const details = [data.eventDate, data.eventLocation].filter(Boolean);

  return {
    subject: `Booking confirmed — ${event}`,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Booking confirmed</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
        Hi ${name}, <strong>${event}</strong> has been confirmed.
      </p>
      ${
        details.length > 0
          ? `<table role="presentation" style="width:100%;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:16px;">
          ${data.eventDate ? `<tr><td style="padding:10px 16px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Date</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.eventDate}</td></tr>` : ""}
          ${data.eventLocation ? `<tr><td style="padding:10px 16px;font-size:13px;color:#666;">Location</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.eventLocation}</td></tr>` : ""}
        </table>`
          : ""
      }
      <p style="margin:0;font-size:14px;color:#555555;">
        ${data.role === "client"
          ? "The agency will be in touch with next steps. You can view your booking from your dashboard."
          : "You're confirmed for this event. The coordinator will share any additional details."}
      </p>
      ${button(href, data.role === "client" ? "View booking →" : "View my inquiries →")}
    `,
      data.brand,
    ),
  };
}

/** F.1 — Sent when an agency admin invites a new team member by email. */
export function teamInviteEmail(data: {
  inviterName: string;
  agencyName: string;
  role: "admin" | "manager" | "editor" | "viewer";
  redeemUrl: string;
  expiresAtIso: string;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const roleLabel =
    data.role === "admin" ? "Admin"
    : data.role === "manager" ? "Manager"
    : data.role === "editor" ? "Editor"
    : "Viewer";
  const expiresDate = new Date(data.expiresAtIso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
  const href = data.redeemUrl.startsWith("http") ? data.redeemUrl : `${siteUrl()}${data.redeemUrl}`;
  return {
    subject: `${data.inviterName} invited you to ${data.agencyName} on Tulala`,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Join ${data.agencyName} on Tulala</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
        ${data.inviterName} added you as <strong>${roleLabel}</strong>. Accept the invite to get into the workspace.
      </p>
      <p style="margin:0;font-size:13px;color:#777777;">Link expires ${expiresDate}.</p>
      ${button(href, "Accept invite →")}
    `,
      data.brand,
    ),
  };
}

/** F.2 — Sent when an agency invites a talent to claim their profile. */
export function talentClaimInviteEmail(data: {
  agencyName: string;
  talentDisplayName: string | null;
  redeemUrl: string;
  expiresAtIso: string;
  isResend?: boolean;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const subjectPrefix = data.isResend ? "Reminder · " : "";
  const greeting = data.talentDisplayName?.trim()
    ? `Hi ${data.talentDisplayName.split(" ")[0]}`
    : "Hi";
  const expiresDate = new Date(data.expiresAtIso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
  const href = data.redeemUrl.startsWith("http") ? data.redeemUrl : `${siteUrl()}${data.redeemUrl}`;
  return {
    subject: `${subjectPrefix}${data.agencyName} invited you to join their roster on Tulala`,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">Claim your profile on ${data.agencyName}</h2>
      <p style="margin:0 0 14px;font-size:15px;color:#444444;line-height:1.6;">${greeting},</p>
      <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
        ${data.agencyName} added you to their roster. Claim your profile to manage bookings, reply to inquiries, and edit your photos and bio.
      </p>
      <p style="margin:0;font-size:13px;color:#777777;">Link expires ${expiresDate}.</p>
      ${button(href, "Claim profile →")}
    `,
      data.brand,
    ),
  };
}

/** F.6 — Sent after a workspace cancels or downgrades their subscription. */
export function subscriptionCancelEmail(data: {
  agencyName: string;
  fromPlan: string;
  toPlan: string;
  effectiveAtIso: string;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const effectiveDate = new Date(data.effectiveAtIso).toLocaleDateString(undefined, {
    day: "numeric", month: "short", year: "numeric",
  });
  const isFullCancel = data.toPlan === "free";
  const subject = isFullCancel
    ? `${data.agencyName} — subscription canceled`
    : `${data.agencyName} — plan changed to ${data.toPlan}`;
  const body = isFullCancel
    ? "Your roster, inquiries, and booking history stay intact. Public site pages stop publishing and any custom domain disconnects. Resubscribe any time at tulala.digital."
    : "Entitlements for your new tier are active immediately. Anything that requires the higher tier (custom domain, advanced analytics) is paused; everything else continues.";
  return {
    subject,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">${isFullCancel ? "Your subscription is canceled" : "Plan change confirmed"}</h2>
      <p style="margin:0 0 12px;font-size:15px;color:#444444;line-height:1.6;">
        <strong>${data.agencyName}</strong> moved from <strong>${data.fromPlan}</strong> to <strong>${data.toPlan}</strong>, effective ${effectiveDate}.
      </p>
      <p style="margin:0;font-size:14px;color:#555555;line-height:1.6;">${body}</p>
    `,
      data.brand,
    ),
  };
}

/** Step 13 — Sent to client when their inquiry is first received (on submit). */
export function inquiryReceivedEmail(data: {
  contactName: string | null;
  agencyName: string;
  inquiryId: string;
  eventDate: string | null;
  eventLocation: string | null;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const name = data.contactName ?? "there";
  const href = `${siteUrl()}/client/inquiries/${data.inquiryId}`;
  const details = [data.eventDate, data.eventLocation].filter(Boolean);

  return {
    subject: `Your inquiry to ${data.agencyName} is received`,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">We've received your inquiry</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
        Hi ${name}, thanks for reaching out to <strong>${data.agencyName}</strong>. We'll get back to you as soon as possible.
      </p>
      ${
        details.length > 0
          ? `<table role="presentation" style="width:100%;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:16px;">
          ${data.eventDate ? `<tr><td style="padding:10px 16px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Date</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.eventDate}</td></tr>` : ""}
          ${data.eventLocation ? `<tr><td style="padding:10px 16px;font-size:13px;color:#666;">Location</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.eventLocation}</td></tr>` : ""}
        </table>`
          : ""
      }
      <p style="margin:0;font-size:14px;color:#555555;">
        You can track the status of your inquiry from your dashboard.
      </p>
      ${button(href, "View inquiry →")}
    `,
      data.brand,
    ),
  };
}

/** Step 13 — Sent to coordinator when auto-assigned to a new inquiry on submit. */
export function coordinatorAssignedEmail(data: {
  coordinatorName: string | null;
  contactName: string | null;
  inquiryId: string;
  agencyName: string;
  eventDate: string | null;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const name = data.coordinatorName ?? "there";
  const event = data.contactName ?? "a new inquiry";
  const href = `${siteUrl()}/admin/work/${data.inquiryId}`;

  return {
    subject: `You've been assigned to ${event}`,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">New inquiry assigned to you</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
        Hi ${name}, you've been assigned as coordinator for <strong>${event}</strong> at ${data.agencyName}.
        ${data.eventDate ? ` The event is on <strong>${data.eventDate}</strong>.` : ""}
      </p>
      <p style="margin:0;font-size:14px;color:#555555;">
        Review the inquiry and reach out to the client.
      </p>
      ${button(href, "Open inquiry →")}
    `,
      data.brand,
    ),
  };
}

/** Sent to talent when they are added to an inquiry roster. */
export function talentInvitedEmail(data: {
  talentName: string | null;
  talentEmail: string;
  inquiryId: string;
  contactName: string | null;
  eventDate: string | null;
  eventLocation: string | null;
  brand?: EmailBrand;
}): { subject: string; html: string } {
  const name = data.talentName ?? "there";
  const event = data.contactName ?? "a new inquiry";
  const href = `${siteUrl()}/talent/inquiries/${data.inquiryId}`;
  const details = [data.eventDate, data.eventLocation].filter(Boolean);

  return {
    subject: `You've been added to ${event}`,
    html: layout(
      `
      <h2 style="margin:0 0 8px;font-size:20px;font-weight:700;color:#1a1a1a;">You've been added to an inquiry</h2>
      <p style="margin:0 0 16px;font-size:15px;color:#444444;line-height:1.6;">
        Hi ${name}, the agency has added you to <strong>${event}</strong>.
      </p>
      ${
        details.length > 0
          ? `<table role="presentation" style="width:100%;border:1px solid #e5e5e5;border-radius:8px;margin-bottom:16px;">
          ${data.eventDate ? `<tr><td style="padding:10px 16px;font-size:13px;color:#666;border-bottom:1px solid #f0f0f0;">Date</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.eventDate}</td></tr>` : ""}
          ${data.eventLocation ? `<tr><td style="padding:10px 16px;font-size:13px;color:#666;">Location</td><td style="padding:10px 16px;font-size:13px;font-weight:600;color:#1a1a1a;text-align:right;">${data.eventLocation}</td></tr>` : ""}
        </table>`
          : ""
      }
      <p style="margin:0;font-size:14px;color:#555555;">
        You'll be notified when an offer is ready for your review. Log in to see the full details.
      </p>
      ${button(href, "View inquiry →")}
    `,
      data.brand,
    ),
  };
}
