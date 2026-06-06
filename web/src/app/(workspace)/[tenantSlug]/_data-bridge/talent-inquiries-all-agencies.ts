import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

import type { TalentInquiryRow } from "./talent";
import { loadMyOfferApprovalStatus } from "./talent-approvals";
import { loadCoordinatorInquiriesForUser } from "./talent-coordinator-inquiries";

/**
 * _data-bridge/talent-inquiries-all-agencies.ts — Tulala-canonical unified
 * inbox loader for the platform `/talent/*` shell.
 *
 * Extracted from `_data-bridge/talent.ts` to keep that file under the 800-
 * line cap (lint rule `max-lines`). The cross-talent RLS test in
 * `src/lib/inquiry/inquiry-rls.cross-talent.test.ts` reads this file
 * directly to verify the loader keys on `talent_profile_id` (not user_id)
 * and does not gate on a single tenant.
 */

/** Cross-agency inquiry row — includes agency context for unified inbox. */
export type TalentInquiryAllAgenciesRow = TalentInquiryRow & {
  tenantId: string;
  agencySlug: string;
  agencyName: string | null;
};

/**
 * Load the talent's inquiries across every agency roster they belong to.
 * Used by the platform `/talent/*` shell — agency is a filter, not a data gate.
 */
export async function loadTalentInquiriesAllAgencies(
  talentProfileId: string,
): Promise<TalentInquiryAllAgenciesRow[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const myUserId = user?.id ?? null;

    const { data, error } = await supabase
      .from("inquiry_participants")
      .select(`
        id,
        status,
        inquiries!inner (
          id,
          status,
          contact_name,
          company,
          message,
          event_date,
          event_location,
          created_at,
          updated_at,
          tenant_id,
          trust_level_at_submission,
          source_channel,
          current_offer_id,
          client_user_id,
          guest_session_id
        )
      `)
      .eq("talent_profile_id", talentProfileId)
      .eq("role", "talent")
      .neq("status", "removed")
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      logServerError("talent.loadInquiriesAllAgencies", error);
      return [];
    }

    type PartRow = {
      /** inquiry_participants.id — this talent's participant row (audit #12). */
      id: string;
      status: string;
      inquiries: {
        id: string;
        status: string;
        contact_name: string;
        company: string | null;
        message: string | null;
        event_date: string | null;
        event_location: string | null;
        created_at: string;
        updated_at: string;
        tenant_id: string;
        trust_level_at_submission: "basic" | "verified" | "silver" | "gold" | null;
        source_channel: string | null;
        current_offer_id: string | null;
        client_user_id: string | null;
        guest_session_id: string | null;
      } | null;
    };

    const partRows = ((data ?? []) as unknown as PartRow[]).filter((r) => r.inquiries);

    // Audit #12 — read THIS talent's own approval status on each inquiry's
    // current offer so the unified-inbox thread can stop re-showing "Approve
    // offer" after the talent has already approved.
    const approvalByInquiry = await loadMyOfferApprovalStatus(
      supabase,
      partRows.map((r) => ({
        inquiryId: r.inquiries!.id,
        participantId: r.id,
        currentOfferId: r.inquiries!.current_offer_id,
      })),
    );

    // F3 — identity tier derived from contact linkage. The array is explicitly
    // typed so the coordinator-append section (below) can push rows with
    // clientIdentity: null without a narrowing mismatch from the map result.
    type PartialRow = TalentInquiryRow & { tenantId: string };
    const partialRows: PartialRow[] = (partRows.map((r) => {
      const clientUserId = r.inquiries!.client_user_id;
      const guestSessionId = r.inquiries!.guest_session_id;
      // Identity ladder — keys off the real anonymity signal (guest_session_id),
      // checked FIRST. The guest-chat front door auto-provisions a confirmed
      // client_user_id shell account for EVERY guest, so keying "registered"
      // off client_user_id presence mislabels every guest as registered. Order:
      //   guest_session_id set → originated from the guest door → "guest"
      //   else client_user_id  → registered account, no guest origin → "registered"
      //   neither              → email-only legacy/manual row → "client"
      const clientIdentity: TalentInquiryRow["clientIdentity"] = guestSessionId
        ? "guest"
        : clientUserId
          ? "registered"
          : "client";
      return {
        id: r.inquiries!.id,
        status: r.inquiries!.status,
        contact_name: r.inquiries!.contact_name,
        company: r.inquiries!.company,
        message: r.inquiries!.message,
        event_date: r.inquiries!.event_date,
        event_location: r.inquiries!.event_location,
        created_at: r.inquiries!.created_at,
        updated_at: r.inquiries!.updated_at,
        participantStatus: r.status,
        unreadCount: 0,
        trustLevel: r.inquiries!.trust_level_at_submission ?? null,
        sourceChannel: r.inquiries!.source_channel ?? null,
        myApprovalStatus: approvalByInquiry.get(r.inquiries!.id) ?? null,
        clientIdentity,
        tenantId: r.inquiries!.tenant_id,
        // Flipped to true below when the talent ALSO coordinates this inquiry.
        iAmCoordinator: false,
      } satisfies PartialRow;
    }) as PartialRow[]);

    // Hub self-coordination (2026-06-02) — surface the talent's COORDINATOR
    // role across every tenant (RLS talent-select only returns role='talent').
    // loadCoordinatorInquiriesForUser resolves it via service-role; we then
    // (a) flip `iAmCoordinator` on lineup rows they also coordinate and
    // (b) append coordinator-only inquiries (they run the booking but aren't
    // performing). No tenant filter — this is the cross-agency unified inbox.
    if (myUserId) {
      const coordInquiries = await loadCoordinatorInquiriesForUser(myUserId);
      const coordIds = new Set(coordInquiries.map((i) => i.id));
      for (const row of partialRows) {
        if (coordIds.has(row.id)) row.iAmCoordinator = true;
      }
      const seenIds = new Set(partialRows.map((r) => r.id));
      for (const i of coordInquiries) {
        if (seenIds.has(i.id)) continue;
        seenIds.add(i.id);
        partialRows.push({
          id: i.id,
          status: i.status,
          contact_name: i.contact_name,
          company: i.company,
          message: i.message,
          event_date: i.event_date,
          event_location: i.event_location,
          created_at: i.created_at,
          updated_at: i.updated_at,
          participantStatus: "active",
          unreadCount: 0,
          trustLevel: i.trust_level_at_submission ?? null,
          sourceChannel: i.source_channel ?? null,
          myApprovalStatus: null,
          // F3 — coordinator-only rows come from a service-role query that
          // doesn't select client_user_id / guest_session_id; identity unknown.
          clientIdentity: null,
          tenantId: i.tenant_id,
          iAmCoordinator: true,
        });
      }
      partialRows.sort((a, b) =>
        a.created_at < b.created_at ? 1 : a.created_at > b.created_at ? -1 : 0,
      );
    }

    if (partialRows.length === 0) return [];

    const tenantIds = [...new Set(partialRows.map((row) => row.tenantId))];
    const { data: agencyRows, error: agencyError } = await supabase
      .from("agencies")
      .select("id, slug, display_name")
      .in("id", tenantIds);

    if (agencyError) {
      logServerError("talent.loadInquiriesAllAgencies.agencies", agencyError);
    }

    const agencyById = new Map(
      ((agencyRows ?? []) as { id: string; slug: string; display_name: string | null }[]).map(
        (agency) => [agency.id, agency],
      ),
    );

    const rows = partialRows.map((row) => {
      const agency = agencyById.get(row.tenantId);
      return {
        ...row,
        agencySlug: agency?.slug ?? "",
        agencyName: agency?.display_name ?? null,
      };
    });

    if (!myUserId) return rows;

    const inquiryIds = rows.map((row) => row.id);

    const [readsRes, messagesRes] = await Promise.all([
      supabase
        .from("inquiry_message_reads")
        .select("inquiry_id, tenant_id, last_read_at")
        .eq("user_id", myUserId)
        .eq("thread_type", "group")
        .in("inquiry_id", inquiryIds)
        .in("tenant_id", tenantIds),
      supabase
        .from("inquiry_messages")
        .select("inquiry_id, tenant_id, sender_user_id, created_at")
        .eq("thread_type", "group")
        .is("deleted_at", null)
        .in("inquiry_id", inquiryIds)
        .in("tenant_id", tenantIds),
    ]);

    if (readsRes.error) {
      logServerError("talent.loadInquiriesAllAgencies.reads", readsRes.error);
    }
    if (messagesRes.error) {
      logServerError("talent.loadInquiriesAllAgencies.messages", messagesRes.error);
    }

    const lastReadKey = (inquiryId: string, tenantId: string) => `${tenantId}:${inquiryId}`;
    const lastReadAtByInquiry = new Map<string, string>();
    for (const row of (readsRes.data ?? []) as {
      inquiry_id: string;
      tenant_id: string;
      last_read_at: string | null;
    }[]) {
      if (row.last_read_at) {
        lastReadAtByInquiry.set(lastReadKey(row.inquiry_id, row.tenant_id), row.last_read_at);
      }
    }

    const unreadByInquiry = new Map<string, number>();
    for (const row of (messagesRes.data ?? []) as {
      inquiry_id: string;
      tenant_id: string;
      sender_user_id: string | null;
      created_at: string;
    }[]) {
      if (row.sender_user_id && row.sender_user_id === myUserId) continue;
      const key = lastReadKey(row.inquiry_id, row.tenant_id);
      const lastReadAt = lastReadAtByInquiry.get(key);
      if (lastReadAt && new Date(row.created_at).getTime() <= new Date(lastReadAt).getTime()) {
        continue;
      }
      unreadByInquiry.set(key, (unreadByInquiry.get(key) ?? 0) + 1);
    }

    return rows.map((row) => ({
      ...row,
      unreadCount: unreadByInquiry.get(lastReadKey(row.id, row.tenantId)) ?? 0,
    }));
  } catch (err) {
    logServerError("talent.loadInquiriesAllAgencies", err);
    return [];
  }
}
