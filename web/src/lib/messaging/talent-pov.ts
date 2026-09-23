/**
 * Talent point of view for Messages v5. Pure. The server readers call these
 * and do not trust a tenant id, an offering id, or a price from the client.
 *
 * She is the seller only when the inquiry's tenant is the platform hub.
 * Otherwise the agency owns the sale: she sees her own net, her own lines,
 * and the group thread. She never sees another talent's rate or the client total.
 */

const MONEY_PAYLOAD_KEYS = [
  "amountCents",
  "priceCents",
  "pricesCents",
  "totalCents",
  "unitCents",
  "talentCost",
  "talent_cost",
  "currency",
  "currencyCode",
] as const;

export function talentIsSeller(
  inquiryTenantId: string | null | undefined,
  hubTenantId: string | null | undefined,
): boolean {
  return Boolean(inquiryTenantId && hubTenantId && inquiryTenantId === hubTenantId);
}

/** Request payment on an agency sale is refused. Her own hub sale is allowed. */
export function talentPaymentRefusal(isSeller: boolean): "not_her_sale" | null {
  return isSeller ? null : "not_her_sale";
}

export function keepOwnConversations<T extends { id: string }>(
  rows: readonly T[],
  ownIds: ReadonlySet<string>,
): T[] {
  return rows.filter((row) => ownIds.has(row.id));
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function stringIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((id): id is string => typeof id === "string" && id.length > 0);
}

/** Talent ids named on the inquiry. Guest chats store them here, not as participants. */
export function talentIdsOnInquiry(sourceContext: unknown, interpretedQuery: unknown): string[] {
  const source = asRecord(sourceContext);
  const interpreted = asRecord(interpretedQuery);
  const talent = asRecord(interpreted?.talent);
  return [...new Set([...stringIds(source?.talent_ids), ...stringIds(talent?.selected_ids)])];
}

/**
 * Hers when she is a participant, or when the inquiry names her and nobody
 * else. A group lineup she was not invited to stays hidden.
 */
export function inquiryIsHers(input: {
  profileId: string;
  participant: boolean;
  talentIds: readonly string[];
}): boolean {
  if (input.participant) return true;
  return input.talentIds.length === 1 && input.talentIds[0] === input.profileId;
}

export type TalentOrderLine = {
  id: string;
  label: string;
  units: number;
  unitCents: number;
  talentProfileId: string | null;
  talentCostCents: number;
};

export type TalentMoneyView = {
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  currency: string;
};

export function projectTalentLines(
  lines: readonly TalentOrderLine[],
  talentProfileId: string,
  isSeller: boolean,
  herNetCents: number | null,
): TalentOrderLine[] {
  if (isSeller) return lines.map((line) => ({ ...line }));
  const hers = lines.filter((line) => line.talentProfileId === talentProfileId);
  if (herNetCents == null) {
    return hers.map((line) => ({ ...line, unitCents: line.talentCostCents }));
  }
  const weight = hers.reduce(
    (sum, line) => sum + Math.max(0, line.talentCostCents) * Math.max(1, line.units),
    0,
  );
  if (hers.length === 0) return [];
  if (weight <= 0) {
    const units = Math.max(1, hers[0].units);
    return [
      { ...hers[0], units, unitCents: Math.round(herNetCents / units) },
      ...hers.slice(1).map((line) => ({ ...line, unitCents: 0 })),
    ];
  }
  return hers.map((line) => {
    const units = Math.max(1, line.units);
    const share = (Math.max(0, line.talentCostCents) * units * herNetCents) / weight;
    return { ...line, unitCents: Math.round(share / units) };
  });
}

export function projectTalentMoney(input: {
  isSeller: boolean;
  currency: string;
  clientTotalCents: number;
  paidCents: number;
  herNetCents: number | null;
}): TalentMoneyView | null {
  const currency = input.currency.trim().toUpperCase() || "USD";
  if (input.isSeller) {
    const total = Math.max(0, Math.trunc(input.clientTotalCents));
    const paid = Math.min(Math.max(0, Math.trunc(input.paidCents)), total);
    return { totalCents: total, paidCents: paid, balanceCents: total - paid, currency };
  }
  if (input.herNetCents == null) return null;
  const total = Math.max(0, Math.trunc(input.herNetCents));
  const client = Math.max(0, Math.trunc(input.clientTotalCents));
  const paid =
    client > 0
      ? Math.min(total, Math.round((Math.max(0, Math.trunc(input.paidCents)) * total) / client))
      : 0;
  return { totalCents: total, paidCents: paid, balanceCents: total - paid, currency };
}

type TalentMessage = {
  thread: "private" | "group";
  payload: Record<string, unknown> | null;
};

function stripMoney(payload: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return payload;
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if ((MONEY_PAYLOAD_KEYS as readonly string[]).includes(key)) continue;
    next[key] = value;
  }
  return next;
}

/**
 * The group thread is the talent thread and stays amount-free. A rostered
 * talent does not receive the private client thread. On her own hub sale she
 * is the seller, so the private thread (and its money) stays.
 */
export function messagesForTalent<T extends TalentMessage>(messages: readonly T[], isSeller: boolean): T[] {
  if (isSeller) return messages.map((message) => ({ ...message }));
  return messages
    .filter((message) => message.thread === "group")
    .map((message) => ({ ...message, payload: stripMoney(message.payload) }));
}

export function talentReplyThread(isSeller: boolean): "private" | "group" {
  return isSeller ? "private" : "group";
}

const DECISION_COPY = {
  en: { approve: "Approve", decline: "Decline" },
  es: { approve: "Aceptar", decline: "Rechazar" },
  fr: { approve: "Accepter", decline: "Refuser" },
} as const;

export function talentDecisionCopy(locale: string): { approve: string; decline: string } {
  if (locale.startsWith("es")) return DECISION_COPY.es;
  if (locale.startsWith("fr")) return DECISION_COPY.fr;
  return DECISION_COPY.en;
}
