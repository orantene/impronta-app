import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadTalentSelfProfile } from "../../../_data-bridge";
import ParticipantThreadShell from "../../../_ParticipantThreadShell";
import {
  markTalentInquiryThreadRead,
  sendTalentInquiryMessage,
} from "./actions";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string; id: string }>;
type SearchParams = Promise<{ ok?: string; err?: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  borderSoft: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  accentSoft: "rgba(15,79,62,0.08)",
  red: "#A33A3A",
  redSoft: "rgba(163,58,58,0.10)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    submitted: "Submitted",
    coordination: "In review",
    offer_pending: "Offer pending",
    approved: "Approved",
    booked: "Booked",
    converted: "Booked",
    rejected: "Rejected",
    expired: "Expired",
    draft: "Draft",
  };
  return map[status] ?? status;
}

function participantLabel(status: string): string {
  const map: Record<string, string> = {
    invited: "Invited",
    active: "Active",
    declined: "Declined",
    removed: "Removed",
  };
  return map[status] ?? status;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
    });
  } catch {
    return "—";
  }
}

type MsgRow = {
  id: string;
  sender_user_id: string | null;
  body: string;
  created_at: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

type ParticipantRow = {
  status: string;
  inquiries:
    | {
        id: string;
        status: string;
        event_date: string | null;
        event_location: string | null;
        company: string | null;
        quantity: number | null;
        created_at: string;
        contact_name: string;
      }
    | {
        id: string;
        status: string;
        event_date: string | null;
        event_location: string | null;
        company: string | null;
        quantity: number | null;
        created_at: string;
        contact_name: string;
      }[]
    | null;
};

export default async function TalentInquiryThreadPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug, id: inquiryId } = await params;
  const { ok, err } = await searchParams;

  const session = await getCachedActorSession();
  if (!session.user) {
    redirect(`/login?next=/${tenantSlug}/talent/inbox/${inquiryId}`);
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const talent = await loadTalentSelfProfile(session.user.id, scope.tenantId);
  if (!talent) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const { data: participantData } = await supabase
    .from("inquiry_participants")
    .select(`
      status,
      inquiries!inner (
        id,
        status,
        event_date,
        event_location,
        company,
        quantity,
        created_at,
        contact_name,
        tenant_id
      )
    `)
    .eq("inquiry_id", inquiryId)
    .eq("talent_profile_id", talent.id)
    .eq("inquiries.tenant_id", scope.tenantId)
    .in("status", ["invited", "active"])
    .maybeSingle();
  if (!participantData) notFound();

  const participant = participantData as unknown as ParticipantRow;
  const inquiryJoin = participant.inquiries;
  const inquiry = Array.isArray(inquiryJoin) ? inquiryJoin[0] : inquiryJoin;
  if (!inquiry) notFound();

  const { data: messagesData, error: messagesError } = await supabase
    .from("inquiry_messages")
    .select("id, sender_user_id, body, created_at, profiles:sender_user_id(display_name)")
    .eq("inquiry_id", inquiryId)
    .eq("thread_type", "group")
    .eq("tenant_id", scope.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (messagesError) {
    logServerError("talent.thread.loadMessages", messagesError);
  }

  const messages = ((messagesData ?? []) as MsgRow[]).map((m) => {
    const profile = Array.isArray(m.profiles) ? m.profiles[0] : m.profiles;
    const isMine = m.sender_user_id === session.user.id;
    return {
      id: m.id,
      sender_user_id: m.sender_user_id,
      body: m.body,
      created_at: m.created_at,
      is_mine: isMine,
      sender_name: isMine
        ? "You"
        : profile?.display_name?.trim() || m.sender_user_id?.slice(0, 8) || "Unknown",
    };
  });

  const { error: readErr } = await supabase.rpc("inquiry_mark_thread_read", {
    p_inquiry_id: inquiryId,
    p_thread_type: "group",
  });
  if (readErr) {
    logServerError("talent.thread.markRead.page", readErr);
  }

  const sendMessageForThread = sendTalentInquiryMessage.bind(null, tenantSlug, inquiryId);
  const markReadForThread = markTalentInquiryThreadRead.bind(null, tenantSlug, inquiryId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 12,
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              fontSize: 11,
              color: C.inkMuted,
              letterSpacing: 0.6,
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Group thread
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                borderRadius: 999,
                background: C.accentSoft,
                color: C.accent,
                padding: "1px 7px",
                fontSize: 10.5,
                letterSpacing: 0.2,
              }}
            >
              {participantLabel(participant.status)}
            </span>
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 22, color: C.ink, letterSpacing: 0 }}>
            {inquiry.contact_name}
          </h1>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted }}>
            {statusLabel(String(inquiry.status))} · {fmtDate(inquiry.event_date)} ·{" "}
            {inquiry.event_location ?? "Location TBD"}
          </div>
        </div>
        <Link
          href={`/${tenantSlug}/talent/inbox`}
          style={{
            height: 32,
            padding: "0 12px",
            borderRadius: 8,
            border: `1px solid ${C.borderSoft}`,
            display: "inline-flex",
            alignItems: "center",
            textDecoration: "none",
            color: C.ink,
            fontSize: 12.5,
          }}
        >
          Back to inbox
        </Link>
      </div>

      {ok ? (
        <div
          style={{
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            background: C.accentSoft,
            color: C.accent,
            padding: "9px 12px",
            fontSize: 12.5,
          }}
        >
          {ok}
        </div>
      ) : null}
      {err ? (
        <div
          style={{
            border: `1px solid ${C.borderSoft}`,
            borderRadius: 10,
            background: C.redSoft,
            color: C.red,
            padding: "9px 12px",
            fontSize: 12.5,
          }}
        >
          {err}
        </div>
      ) : null}

      <ParticipantThreadShell
        inquiryId={inquiryId}
        threadType="group"
        initialMessages={messages}
        accent={C.accent}
        accentSoft={C.accentSoft}
        sendMessage={sendMessageForThread}
        markRead={markReadForThread}
      />
    </div>
  );
}
