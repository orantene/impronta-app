"use server";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { logServerError } from "@/lib/server/safe-error";

export type TalentClientRow = {
  id: string;
  name: string;
  lastVisit: string | null;
  visitCount: number;
  amountOwedCents: number | null;
  currency: string | null;
  conversationHref: string | null;
  source: "inquiry" | "booking";
};

async function assertTalentOwner(talentProfileId: string): Promise<boolean> {
  const session = await getCachedActorSession();
  if (!session.user) return false;
  const admin = createServiceRoleClient();
  if (!admin) return false;
  const { data, error } = await admin
    .from("talent_profiles")
    .select("user_id")
    .eq("id", talentProfileId)
    .maybeSingle();
  if (error) return false;
  return data?.user_id === session.user.id;
}

export async function loadTalentClients(
  talentProfileId: string,
): Promise<{ ok: true; items: TalentClientRow[] } | { ok: false; error: string }> {
  try {
    if (!(await assertTalentOwner(talentProfileId))) {
      return { ok: false, error: "Forbidden." };
    }
    const admin = createServiceRoleClient();
    if (!admin) return { ok: false, error: "Server configuration error." };

    const byKey = new Map<string, TalentClientRow>();

    const { data: bookings, error: bookingsError } = await admin
      .from("talent_bookings")
      .select("id, client_name, starts_at, amount_cents, currency, inquiry_id, status")
      .eq("talent_profile_id", talentProfileId)
      .order("starts_at", { ascending: false })
      .limit(200);
    if (bookingsError) {
      logServerError("talent.clients.bookings", bookingsError);
      return { ok: false, error: "Could not load clients." };
    }

    for (const row of bookings ?? []) {
      const name = (row.client_name as string | null)?.trim() || "Client";
      const key = name.toLowerCase();
      const existing = byKey.get(key);
      const start = (row.starts_at as string | null) ?? null;
      if (!existing) {
        byKey.set(key, {
          id: `booking:${row.id}`,
          name,
          lastVisit: start,
          visitCount: 1,
          amountOwedCents: null,
          currency: (row.currency as string | null) ?? null,
          conversationHref: row.inquiry_id ? `/talent/inbox/${row.inquiry_id}` : null,
          source: "booking",
        });
      } else {
        existing.visitCount += 1;
        if (start && (!existing.lastVisit || start > existing.lastVisit)) {
          existing.lastVisit = start;
        }
      }
    }

    const { data: participants, error: participantsError } = await admin
      .from("inquiry_participants")
      .select("inquiry_id, inquiries!inner ( id, contact_name, company, created_at, status )")
      .eq("talent_profile_id", talentProfileId)
      .eq("role", "talent")
      .neq("status", "removed")
      .limit(200);
    if (participantsError) {
      logServerError("talent.clients.participants", participantsError);
      return { ok: false, error: "Could not load clients." };
    }

    for (const part of participants ?? []) {
      const inquiry = Array.isArray(part.inquiries) ? part.inquiries[0] : part.inquiries;
      if (!inquiry) continue;
      const name =
        (inquiry.contact_name as string | null)?.trim() ||
        (inquiry.company as string | null)?.trim() ||
        "Client";
      const key = name.toLowerCase();
      const existing = byKey.get(key);
      const created = (inquiry.created_at as string | null) ?? null;
      if (!existing) {
        byKey.set(key, {
          id: `inquiry:${inquiry.id}`,
          name,
          lastVisit: created,
          visitCount: 0,
          amountOwedCents: null,
          currency: null,
          conversationHref: `/talent/inbox/${inquiry.id}`,
          source: "inquiry",
        });
      } else if (!existing.conversationHref) {
        existing.conversationHref = `/talent/inbox/${inquiry.id}`;
      }
    }

    const items = Array.from(byKey.values()).sort((a, b) => {
      const left = a.lastVisit ?? "";
      const right = b.lastVisit ?? "";
      return right.localeCompare(left);
    });
    return { ok: true, items };
  } catch (err) {
    logServerError("talent.clients.load", err);
    return { ok: false, error: "Could not load clients." };
  }
}
