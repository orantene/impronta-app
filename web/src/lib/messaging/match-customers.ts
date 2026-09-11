import { normalizeDisplayName, normalizeEmail, normalizePhoneE164 } from "@/lib/customers/customer-identity";

import type { CustomerMatch, CustomerMatchLevel } from "./types";

export type MatchCustomerRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  phone_e164: string | null;
};

export type MatchCustomersInput = {
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  customers: readonly MatchCustomerRow[];
};

/**
 * Three levels only: phone match, name-only similarity, or new.
 * Pure. No I/O. Linking is a later write; this function only ranks.
 */
export function matchCustomers(input: MatchCustomersInput): CustomerMatch[] {
  const phone = normalizePhoneE164(input.phone);
  const email = normalizeEmail(input.email);
  const name = normalizeDisplayName(input.name);
  const out: CustomerMatch[] = [];

  for (const row of input.customers) {
    const rowPhone = normalizePhoneE164(row.phone_e164);
    const rowEmail = normalizeEmail(row.email);
    const rowName = normalizeDisplayName(row.display_name);
    if (phone && rowPhone && phone === rowPhone) {
      out.push(hit(row, "phone", 1));
      continue;
    }
    if (email && rowEmail && email === rowEmail) {
      out.push(hit(row, "phone", 0.92));
      continue;
    }
    if (name && rowName && similarName(name, rowName)) {
      out.push(hit(row, "name_only", nameScore(name, rowName)));
    }
  }

  out.sort((a, b) => b.score - a.score);
  if (out.length === 0) {
    return [
      {
        customerId: null,
        level: "new",
        displayName: name,
        email,
        phoneE164: phone,
        score: 0,
      },
    ];
  }
  return out;
}

function hit(row: MatchCustomerRow, level: CustomerMatchLevel, score: number): CustomerMatch {
  return {
    customerId: row.id,
    level,
    displayName: row.display_name,
    email: row.email,
    phoneE164: row.phone_e164,
    score,
  };
}

function similarName(a: string, b: string): boolean {
  const left = tokens(a);
  const right = tokens(b);
  if (left.length === 0 || right.length === 0) return false;
  const overlap = left.filter((t) => right.includes(t));
  return overlap.length > 0;
}

function nameScore(a: string, b: string): number {
  if (a.toLowerCase() === b.toLowerCase()) return 0.8;
  const left = tokens(a);
  const right = new Set(tokens(b));
  const hits = left.filter((t) => right.has(t)).length;
  return Math.min(0.79, 0.4 + hits * 0.15);
}

function tokens(value: string): string[] {
  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((part) => part.length >= 2);
}
