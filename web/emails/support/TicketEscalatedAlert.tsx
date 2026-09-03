import * as React from "react";
import { SupportMail, type MailFact } from "./_shared";
import type { EmailBrand } from "../components/Layout";

interface Props {
  ticketNumber: number;
  subject: string;
  requesterLabel: string;
  phone?: string | null;
  adminUrl: string;
  /** Workspace the ticket belongs to. Absent for guest and platform tickets. */
  workspace?: string | null;
  /** What the person actually asked, trimmed. */
  excerpt?: string | null;
  /** How long since escalation, e.g. "3h" or "2 days". */
  waited?: string | null;
  /** Set on a chase, not the first alert. */
  isReAlert?: boolean;
  reAlertNumber?: number;
  reAlertOf?: number;
  brand?: EmailBrand;
  unsubscribeUrl?: string;
  categoryLabel?: string;
}

/**
 * The alert that tells the owner a person is waiting.
 *
 * It used to be a heading, one sentence and a button — so deciding whether to
 * open a ticket required opening the ticket. It also had no idea it was a
 * repeat: the lifecycle cron re-sent it hourly with identical wording, and
 * production produced 61 copies of the same mail for one ticket. Four in an
 * inbox look like a bug; sixty-one train you to ignore the channel.
 *
 * So this mail now carries the facts that drive triage, and a chase says
 * plainly that it is a chase and how many are left.
 */
export default function TicketEscalatedAlert({
  ticketNumber,
  subject,
  requesterLabel,
  phone,
  adminUrl,
  workspace,
  excerpt,
  waited,
  isReAlert,
  reAlertNumber,
  reAlertOf,
  brand,
  unsubscribeUrl,
  categoryLabel,
}: Props) {
  const facts: MailFact[] = [];
  facts.push({ label: "From", value: requesterLabel });
  if (workspace) facts.push({ label: "Workspace", value: workspace });
  if (subject) facts.push({ label: "About", value: subject });
  if (waited) facts.push({ label: "Waiting", value: waited });
  if (phone) facts.push({ label: "Phone", value: phone });

  const heading = isReAlert
    ? `Still waiting: ticket #${ticketNumber}`
    : `Ticket #${ticketNumber} needs you`;

  // A chase says what it is. Silence about being a repeat is what makes a
  // duplicate feel like a system fault rather than a deliberate nudge.
  const intro = isReAlert
    ? `Nobody has replied to this yet${waited ? `, ${waited} after it was escalated` : ""}.` +
      (reAlertNumber && reAlertOf
        ? ` This is reminder ${reAlertNumber} of ${reAlertOf}; after that it stops and stays in the queue.`
        : "")
    : `${requesterLabel} asked for a person.`;

  return (
    <SupportMail
      preview={heading}
      heading={heading}
      intro={intro}
      facts={facts}
      footnote={excerpt ? `They wrote: "${excerpt}"` : undefined}
      ctaUrl={adminUrl}
      ctaLabel="Open in HQ"
      brand={brand}
      unsubscribeUrl={unsubscribeUrl}
      categoryLabel={categoryLabel}
    />
  );
}

TicketEscalatedAlert.PreviewProps = {
  ticketNumber: 142,
  subject: "Cannot publish a page",
  requesterLabel: "Giulia",
  workspace: "Impronta",
  excerpt: "I hit publish and nothing happens, the button just spins.",
  waited: "3h",
  phone: "+52 55 1234 5678",
  adminUrl: "https://tulala.digital/platform/admin/support?ticket=preview",
  categoryLabel: "platform alerts",
} satisfies Props;
