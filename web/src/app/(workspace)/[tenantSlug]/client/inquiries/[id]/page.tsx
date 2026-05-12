import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { getTenantPortalScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { loadClientSelfProfile } from "../../../_data-bridge";
import ParticipantThreadShell from "../../../_ParticipantThreadShell";
import {
  markClientInquiryThreadRead,
  sendClientInquiryMessage,
} from "./actions";
import { logServerError } from "@/lib/server/safe-error";
import { formatClientDate } from "../../date-format";

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
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
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

function fmtDate(iso: string | null): string {
  return formatClientDate(iso, "-");
}

type MsgRow = {
  id: string;
  sender_user_id: string | null;
  body: string;
  created_at: string;
  profiles: { display_name: string | null } | { display_name: string | null }[] | null;
};

export default async function ClientInquiryThreadPage({
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
    redirect(`/login?next=/${tenantSlug}/client/inquiries/${inquiryId}`);
  }

  const scope = await getTenantPortalScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const client = await loadClientSelfProfile(session.user.id, scope.tenantId);
  if (!client) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const { data: inquiry } = await supabase
    .from("inquiries")
    .select("id, status, event_date, event_location, company, quantity, created_at")
    .eq("id", inquiryId)
    .eq("tenant_id", scope.tenantId)
    .eq("client_user_id", session.user.id)
    .maybeSingle();
  if (!inquiry) notFound();

  const { data: messagesData, error: messagesError } = await supabase
    .from("inquiry_messages")
    .select("id, sender_user_id, body, created_at, profiles:sender_user_id(display_name)")
    .eq("inquiry_id", inquiryId)
    .eq("thread_type", "private")
    .eq("tenant_id", scope.tenantId)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);
  if (messagesError) {
    logServerError("client.thread.loadMessages", messagesError);
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
    p_thread_type: "private",
  });
  if (readErr) {
    logServerError("client.thread.markRead.page", readErr);
  }

  const sendMessageForThread = sendClientInquiryMessage.bind(null, tenantSlug, inquiryId);
  const markReadForThread = markClientInquiryThreadRead.bind(null, tenantSlug, inquiryId);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6, fontWeight: 700 }}>
            Client messages
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 22, color: C.ink, letterSpacing: 0 }}>
            {inquiry.company ?? client.agencyName}
          </h1>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted }}>
            {statusLabel(String(inquiry.status))}
            {(inquiry.event_date as string | null) && ` · ${fmtDate(inquiry.event_date as string)}`}
            {(inquiry.event_location as string | null) && ` · ${(inquiry.event_location as string).split(",")[0]}`}
            {(inquiry.quantity as number | null) && (inquiry.quantity as number) > 1 && ` · ${inquiry.quantity as number} talent`}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          {["booked", "converted"].includes(String(inquiry.status)) && (
            <Link
              href={`/${tenantSlug}/client/bookings`}
              style={{
                height: 32,
                padding: "0 12px",
                borderRadius: 8,
                border: `1px solid rgba(15,79,62,0.30)`,
                background: "rgba(15,79,62,0.06)",
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                color: "#0F4F3E",
                fontSize: 12.5,
                fontWeight: 600,
              }}
            >
              View booking →
            </Link>
          )}
          <Link
            href={`/${tenantSlug}/client/inquiries`}
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
            ← Back
          </Link>
        </div>
      </div>

      {ok ? (
        <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, background: C.accentSoft, color: C.accent, padding: "9px 12px", fontSize: 12.5 }}>
          {ok}
        </div>
      ) : null}
      {err ? (
        <div style={{ border: `1px solid ${C.borderSoft}`, borderRadius: 10, background: C.redSoft, color: C.red, padding: "9px 12px", fontSize: 12.5 }}>
          {err}
        </div>
      ) : null}

      <ParticipantThreadShell
        inquiryId={inquiryId}
        threadType="private"
        initialMessages={messages}
        accent={C.accent}
        accentSoft={C.accentSoft}
        sendMessage={sendMessageForThread}
        markRead={markReadForThread}
      />
    </div>
  );
}
