import { BOOKING_AUDIT, INQUIRY_AUDIT } from "@/lib/commercial-audit-events";

export type ActivityUiEntry = {
  id: string;
  created_at: string;
  event_type: string;
  actor_label: string;
  label: string;
  summary_lines: string[];
};

function idSnippet(id: unknown): string {
  if (typeof id !== "string" || id.length < 10) return typeof id === "string" && id ? id : "—";
  return `${id.slice(0, 8)}…`;
}

function humanizeEnum(s: unknown): string {
  if (s === null || s === undefined) return "—";
  return String(s).replace(/_/g, " ");
}

function asRecord(p: unknown): Record<string, unknown> {
  if (typeof p === "object" && p !== null && !Array.isArray(p)) return p as Record<string, unknown>;
  return {};
}

/** Readable title + bullet lines for staff activity panels (not raw JSON). */
export function summarizeCommercialEvent(
  eventType: string,
  payload: unknown,
): { label: string; summary_lines: string[] } {
  const p = asRecord(payload);
  const lines: string[] = [];

  switch (eventType) {
    case BOOKING_AUDIT.CREATED_MANUAL: {
      const n = p.talent_rows;
      if (typeof n === "number" && n > 0) lines.push(`Started with ${n} talent row(s).`);
      return { label: "Manual booking created", summary_lines: lines.length ? lines : ["No initial lineup rows."] };
    }
    case BOOKING_AUDIT.DUPLICATED: {
      lines.push(`Copied from booking ${idSnippet(p.source_booking_id)}.`);
      const flags: string[] = [];
      if (p.keep_client_links === true) flags.push("kept client links");
      if (p.keep_source_inquiry === true) flags.push("kept inquiry link");
      if (p.keep_talent === false) flags.push("cleared talent");
      if (p.keep_pricing === false) flags.push("reset pricing");
      if (p.clear_schedule === true) flags.push("cleared schedule/venue");
      if (flags.length) lines.push(flags.join(" · "));
      return { label: "Booking duplicated", summary_lines: lines };
    }
    case BOOKING_AUDIT.CONVERTED_FROM_INQUIRY: {
      lines.push(`Source inquiry ${idSnippet(p.inquiry_id)}.`);
      const added = p.talent_rows_added;
      if (typeof added === "number") lines.push(`${added} talent row(s) added in this step.`);
      return { label: "Converted from inquiry (new booking)", summary_lines: lines };
    }
    case BOOKING_AUDIT.LINEUP_ATTACHED_FROM_INQUIRY: {
      lines.push(`Inquiry ${idSnippet(p.inquiry_id)}.`);
      const added = p.talent_rows_added;
      if (typeof added === "number") lines.push(`${added} new talent row(s) on this booking.`);
      return { label: "Lineup added from inquiry", summary_lines: lines };
    }
    case BOOKING_AUDIT.CREATED_FROM_INQUIRY_QUICK: {
      lines.push(`Inquiry ${idSnippet(p.inquiry_id)}.`);
      if (p.talent_profile_id) lines.push(`Optional talent: ${idSnippet(p.talent_profile_id)}.`);
      return { label: "Quick booking from inquiry", summary_lines: lines };
    }
    case BOOKING_AUDIT.CLIENT_ACCOUNT_CHANGED: {
      lines.push(`Account link: ${idSnippet(p.from)} → ${idSnippet(p.to)}.`);
      if (p.refresh_account_snapshot === true) lines.push("Account snapshots refreshed from CRM.");
      return { label: "Work Location link changed", summary_lines: lines };
    }
    case BOOKING_AUDIT.CLIENT_CONTACT_CHANGED: {
      lines.push(`Contact link: ${idSnippet(p.from)} → ${idSnippet(p.to)}.`);
      if (p.refresh_contact_snapshot === true) lines.push("Contact snapshots refreshed from CRM.");
      return { label: "Contact link changed", summary_lines: lines };
    }
    case BOOKING_AUDIT.MANAGER_CHANGED: {
      lines.push(`Manager: ${idSnippet(p.from)} → ${idSnippet(p.to)}.`);
      return { label: "Manager reassigned", summary_lines: lines };
    }
    case BOOKING_AUDIT.STATUS_CHANGED: {
      lines.push(`${humanizeEnum(p.from)} → ${humanizeEnum(p.to)}.`);
      return { label: "Booking status changed", summary_lines: lines };
    }
    case BOOKING_AUDIT.PAYMENT_STATE_CHANGED: {
      const ps = asRecord(p.payment_status);
      const pm = asRecord(p.payment_method);
      if (ps.from !== undefined || ps.to !== undefined) {
        lines.push(`Payment status: ${humanizeEnum(ps.from)} → ${humanizeEnum(ps.to)}.`);
      }
      if (pm.from !== undefined || pm.to !== undefined) {
        lines.push(`Payment method: ${humanizeEnum(pm.from) || "—"} → ${humanizeEnum(pm.to) || "—"}.`);
      }
      return { label: "Payment details updated", summary_lines: lines.length ? lines : ["Payment fields updated."] };
    }
    case BOOKING_AUDIT.CLIENT_PORTAL_VISIBILITY_CHANGED: {
      const had = p.from != null && p.from !== "";
      const has = p.to != null && p.to !== "";
      if (!had && has) {
        lines.push("Portal visibility enabled for linked client user / account contact.");
        if (typeof p.to === "string") lines.push(`Effective from ${new Date(p.to).toLocaleString()}.`);
      } else if (had && !has) {
        lines.push("Portal visibility cleared — not shown via account/contact path (inquiry link may still apply).");
      } else if (typeof p.to === "string") {
        lines.push(`Timestamp updated: ${new Date(p.to).toLocaleString()}.`);
      }
      return { label: "Client portal visibility changed", summary_lines: lines };
    }
    case BOOKING_AUDIT.TALENT_ROW_SAVED: {
      const before = asRecord(p.before);
      const after = asRecord(p.after);
      if (p.talent_profile_id) lines.push(`Talent ${idSnippet(p.talent_profile_id)}.`);
      const parts: string[] = [];
      if (before.units !== after.units) parts.push(`units ${before.units}→${after.units}`);
      if (before.pricing_unit !== after.pricing_unit) parts.push(`unit type ${before.pricing_unit}→${after.pricing_unit}`);
      if (before.talent_cost_rate !== after.talent_cost_rate) parts.push(`cost rate adjusted`);
      if (before.client_charge_rate !== after.client_charge_rate) parts.push(`client rate adjusted`);
      if (before.role_label !== after.role_label) parts.push(`role updated`);
      if (parts.length) lines.push(parts.join("; ") + ".");
      else lines.push("Row saved (no field changes detected in payload).");
      return { label: "Lineup / pricing row updated", summary_lines: lines };
    }
    case BOOKING_AUDIT.TALENT_ROW_ADDED: {
      lines.push(`Talent ${idSnippet(p.talent_profile_id)} added to lineup.`);
      return { label: "Talent row added", summary_lines: lines };
    }
    case BOOKING_AUDIT.TALENT_ROW_REMOVED: {
      const code = typeof p.profile_code_snapshot === "string" ? p.profile_code_snapshot : null;
      lines.push(code ? `Removed ${code}.` : `Row ${idSnippet(p.booking_talent_id)} removed.`);
      return { label: "Talent row removed", summary_lines: lines };
    }
    case INQUIRY_AUDIT.DUPLICATED: {
      lines.push(`New inquiry ${idSnippet(p.new_inquiry_id)}.`);
      return { label: "Inquiry duplicated", summary_lines: lines };
    }
    case INQUIRY_AUDIT.CONVERTED_TO_BOOKING: {
      lines.push(`Booking ${idSnippet(p.booking_id)}.`);
      if (p.path === "quick_add") lines.push("Created via quick add from inquiry page.");
      return { label: "Linked to a booking", summary_lines: lines };
    }
    case INQUIRY_AUDIT.LINEUP_ADDED_TO_BOOKING: {
      lines.push(`Booking ${idSnippet(p.booking_id)}.`);
      const added = p.talent_rows_added;
      if (typeof added === "number") lines.push(`${added} talent row(s) added on booking.`);
      return { label: "Talent sent to existing booking", summary_lines: lines };
    }
    case INQUIRY_AUDIT.CLIENT_ACCOUNT_CHANGED: {
      lines.push(`Account link: ${idSnippet(p.from)} → ${idSnippet(p.to)}.`);
      if (p.refresh_account_snapshot === true) lines.push("Company name refreshed from account.");
      return { label: "Inquiry account link changed", summary_lines: lines };
    }
    case INQUIRY_AUDIT.CLIENT_CONTACT_CHANGED: {
      lines.push(`Contact link: ${idSnippet(p.from)} → ${idSnippet(p.to)}.`);
      if (p.refresh_contact_snapshot === true) lines.push("Contact fields refreshed from CRM.");
      return { label: "Inquiry contact link changed", summary_lines: lines };
    }
    default: {
      const pretty = eventType.replace(/^booking\./, "").replace(/^inquiry\./, "").replace(/\./g, " ");
      return {
        label: pretty.replace(/\b\w/g, (c) => c.toUpperCase()),
        summary_lines: [`Event code: ${eventType}`],
      };
    }
  }
}

export function mapRawActivityRows(
  rows: {
    id: string;
    created_at: string;
    event_type: string;
    payload: unknown;
    actor_user_id: string | null;
  }[],
  actorDisplayById: Map<string, string>,
): ActivityUiEntry[] {
  return rows.map((r) => {
    const { label, summary_lines } = summarizeCommercialEvent(r.event_type, r.payload);
    const actor =
      r.actor_user_id == null
        ? "Unknown actor"
        : (actorDisplayById.get(r.actor_user_id) ?? `Staff ${idSnippet(r.actor_user_id)}`);
    return {
      id: r.id,
      created_at: r.created_at,
      event_type: r.event_type,
      actor_label: actor,
      label,
      summary_lines,
    };
  });
}
