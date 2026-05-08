import "server-only";

import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/pitches.ts — pitch history (Phase 9, workspace surface).
 *
 * Split out of `_data-bridge.ts` (rev 14). The workspace bridge re-exports
 * `loadWorkspacePitches` so layout.tsx can fetch pitch history alongside
 * the rest of the bridge data in one batch.
 *
 * Service-role read because the workspace surface needs to see drafts and
 * recipient PII regardless of RLS roles. Capability check
 * (`agency.pitch.manage`) lives in the layout, not here.
 */

export type WorkspacePitchRow = {
  id: string;
  status:
    | "draft"
    | "sent"
    | "viewed"
    | "edited"
    | "converted"
    | "declined"
    | "cancelled"
    | "expired";
  recipientName: string;
  recipientCompany: string | null;
  talentCount: number;
  removedCount: number;
  sentAt: string | null;
  createdAt: string;
  lastViewedAt: string | null;
  viewCount: number;
  expiresAt: string | null;
  convertedInquiryId: string | null;
  personalNotePreview: string | null;
};

/**
 * Load pitch history rows for a tenant. Most-recent-first; capped at 200.
 * Aggregates per-pitch active vs. client-removed talent counts in a single
 * follow-up query. Returns `[]` on error — never throws.
 */
export async function loadWorkspacePitches(
  tenantId: string,
): Promise<WorkspacePitchRow[]> {
  try {
    const admin = createServiceRoleClient();
    if (!admin) return [];

    const { data: pitchRows, error: pErr } = await admin
      .from("pitches")
      .select(
        "id, status, recipient_contact, sent_at, created_at, last_viewed_at, view_count, expires_at, converted_inquiry_id, personal_note",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (pErr) {
      logServerError("workspace.loadPitches", pErr);
      return [];
    }

    type PitchRowRaw = {
      id: string;
      status: WorkspacePitchRow["status"];
      recipient_contact: {
        name?: string | null;
        email?: string | null;
        phone?: string | null;
        company?: string | null;
      } | null;
      sent_at: string | null;
      created_at: string;
      last_viewed_at: string | null;
      view_count: number;
      expires_at: string | null;
      converted_inquiry_id: string | null;
      personal_note: string | null;
    };
    const pitches = (pitchRows ?? []) as PitchRowRaw[];
    if (pitches.length === 0) return [];

    const ids = pitches.map((p) => p.id);
    const { data: talentRows } = await admin
      .from("pitch_talents")
      .select("pitch_id, removed_by_client_at")
      .in("pitch_id", ids);

    const counts = new Map<string, { active: number; removed: number }>();
    for (const r of (talentRows ?? []) as Array<{
      pitch_id: string;
      removed_by_client_at: string | null;
    }>) {
      const cur = counts.get(r.pitch_id) ?? { active: 0, removed: 0 };
      if (r.removed_by_client_at) cur.removed++;
      else cur.active++;
      counts.set(r.pitch_id, cur);
    }

    return pitches.map((p): WorkspacePitchRow => {
      const c = counts.get(p.id) ?? { active: 0, removed: 0 };
      const recipient = p.recipient_contact ?? {};
      const recipientName =
        (typeof recipient.name === "string" && recipient.name.trim()) ||
        (typeof recipient.email === "string" && recipient.email.trim()) ||
        (typeof recipient.phone === "string" && recipient.phone.trim()) ||
        "Unaddressed";
      const recipientCompany =
        typeof recipient.company === "string" && recipient.company.trim()
          ? recipient.company.trim()
          : null;
      const note = p.personal_note?.trim() ?? null;
      return {
        id: p.id,
        status: p.status,
        recipientName,
        recipientCompany,
        talentCount: c.active,
        removedCount: c.removed,
        sentAt: p.sent_at,
        createdAt: p.created_at,
        lastViewedAt: p.last_viewed_at,
        viewCount: p.view_count,
        expiresAt: p.expires_at,
        convertedInquiryId: p.converted_inquiry_id,
        personalNotePreview: note ? note.slice(0, 140) : null,
      };
    });
  } catch (err) {
    logServerError("workspace.loadPitches", err);
    return [];
  }
}
