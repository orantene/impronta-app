type InquiryTalentSummary = {
  id: string;
  profileCode: string;
  displayName: string | null;
};

type InquiryWhatsAppInput = {
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  company?: string | null;
  rawQuery?: string | null;
  eventTypeName?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  quantity?: number | null;
  message?: string | null;
  talents?: InquiryTalentSummary[];
};

type InquiryContextInput = {
  eventTypeId?: string | null;
  eventTypeName?: string | null;
  eventDate?: string | null;
  eventLocation?: string | null;
  quantity?: number | null;
  rawQuery?: string | null;
  sourcePage?: string | null;
  directorySearch?: {
    q: string | null;
    locationSlug: string | null;
    sort: string | null;
    taxonomyTermIds: string[];
  } | null;
  selectedTalents: InquiryTalentSummary[];
  submittedVia: "client" | "guest";
};

export const INQUIRY_STATUS_LABELS: Record<string, string> = {
  new: "New",
  reviewing: "Under review",
  waiting_for_client: "Waiting for you",
  talent_suggested: "Talent suggested",
  in_progress: "In progress",
  qualified: "Qualified",
  converted: "Converted",
  closed: "Closed",
  closed_lost: "Closed (lost)",
  archived: "Archived",
};

function normalizePhone(phone?: string | null): string {
  return (phone ?? "").replace(/[^\d]/g, "");
}

function pushLine(lines: string[], label: string, value?: string | number | null) {
  if (value == null) return;
  const normalized = typeof value === "string" ? value.trim() : String(value);
  if (!normalized) return;
  lines.push(`${label}: ${normalized}`);
}

export function formatInquiryStatus(status: string): string {
  return INQUIRY_STATUS_LABELS[status] ?? status.replace(/_/g, " ");
}

export function buildInquiryContext(input: InquiryContextInput) {
  return {
    submitted_via: input.submittedVia,
    source_page: input.sourcePage?.trim() || null,
    raw_query: input.rawQuery?.trim() || null,
    event_type: input.eventTypeId
      ? {
          id: input.eventTypeId,
          name: input.eventTypeName?.trim() || null,
        }
      : null,
    event_date: input.eventDate?.trim() || null,
    event_location: input.eventLocation?.trim() || null,
    quantity: input.quantity && input.quantity > 0 ? input.quantity : null,
    directory_search: input.directorySearch
      ? {
          q: input.directorySearch.q?.trim() || null,
          location_slug: input.directorySearch.locationSlug?.trim() || null,
          sort: input.directorySearch.sort?.trim() || null,
          taxonomy_term_ids: input.directorySearch.taxonomyTermIds,
        }
      : null,
    selected_talents: input.selectedTalents.map((talent) => ({
      id: talent.id,
      profile_code: talent.profileCode,
      display_name: talent.displayName,
    })),
  };
}

export function buildInquiryWhatsAppMessage(input: InquiryWhatsAppInput): string {
  const lines = ["Hello Impronta, I'd like help with this inquiry."];

  pushLine(lines, "Name", input.contactName);
  pushLine(lines, "Email", input.contactEmail);
  pushLine(lines, "Phone", input.contactPhone);
  pushLine(lines, "Company", input.company);
  pushLine(lines, "What I'm looking for", input.rawQuery);
  pushLine(lines, "Event type", input.eventTypeName);
  pushLine(lines, "Event date", input.eventDate);
  pushLine(lines, "Location", input.eventLocation);
  pushLine(lines, "Quantity", input.quantity);

  if (input.talents?.length) {
    lines.push(
      `Selected talent: ${input.talents
        .map((talent) =>
          [talent.profileCode, talent.displayName].filter(Boolean).join(" · "),
        )
        .join(", ")}`,
    );
  }

  if (input.message?.trim()) {
    lines.push(`Message: ${input.message.trim()}`);
  }

  return lines.join("\n");
}

export function buildWhatsAppHref(text: string, phone?: string | null): string {
  const encoded = encodeURIComponent(text);
  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone) {
    return `https://wa.me/${normalizedPhone}?text=${encoded}`;
  }
  return `https://api.whatsapp.com/send?text=${encoded}`;
}
