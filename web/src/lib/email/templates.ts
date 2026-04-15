/**
 * Simple transactional email HTML templates.
 * Plain structure — no heavy dependencies. Inline styles for email client compat.
 */

const siteUrl = () =>
  (process.env.NEXT_PUBLIC_SITE_URL ?? "https://impronta.com").replace(/\/$/, "");

function layout(body: string): string {
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
              <a href="${siteUrl()}" style="font-family:Georgia,serif;font-size:18px;letter-spacing:0.2em;color:#1a1a1a;text-decoration:none;font-weight:600;">IMPRONTA</a>
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
              You received this because you have an account with Impronta Agency.
              <br/>
              <a href="${siteUrl()}" style="color:#888888;">impronta.com</a>
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
}): { subject: string; html: string } {
  const name = data.clientName ?? "there";
  const event = data.contactName ?? "your inquiry";
  const href = `${siteUrl()}/client/inquiries/${data.inquiryId}?tab=offer`;

  return {
    subject: `Offer ready for ${event}`,
    html: layout(`
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
    `),
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
    html: layout(`
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
    `),
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
}): { subject: string; html: string } {
  const name = data.talentName ?? "there";
  const event = data.contactName ?? "a new inquiry";
  const href = `${siteUrl()}/talent/inquiries/${data.inquiryId}`;
  const details = [data.eventDate, data.eventLocation].filter(Boolean);

  return {
    subject: `You've been added to ${event}`,
    html: layout(`
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
    `),
  };
}
