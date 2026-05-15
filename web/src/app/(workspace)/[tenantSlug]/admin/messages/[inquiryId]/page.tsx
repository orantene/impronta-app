// Phase 2.1 — Canonical thread inspect surface.
//
// Read-only deep-link view of a single inquiry. Mirrors the shape of
// /admin/work/[id]/page.tsx (the booking equivalent). Surfaces all the
// inquiry's metadata + lineup + active offer + recent messages in a
// clean server-rendered layout, plus an A4 source badge when the
// inquiry came via Discover.
//
// Actions (compose, accept/decline offer, assign coordinator, change
// status, attach files) still live in the mega Messages shell — clicking
// "Open in Messages" deep-links there. This page is the inspector, not
// the editor; that split lets the canonical route ship without
// rebuilding the entire shell.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";

export const dynamic = "force-dynamic";
type PageParams = Promise<{ tenantSlug: string; inquiryId: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink:        "#0B0B0D",
  inkMuted:   "rgba(11,11,13,0.55)",
  inkDim:     "rgba(11,11,13,0.35)",
  border:     "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg:     "#ffffff",
  surface:    "rgba(11,11,13,0.02)",
  accent:     "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success:    "#1A7348",
  successSoft: "rgba(26,115,72,0.10)",
  amber:      "#8A6F1A",
  amberSoft:  "rgba(180,130,20,0.10)",
} as const;

function statusTone(status: string): { bg: string; color: string; label: string } {
  const map: Record<string, { bg: string; color: string; label: string }> = {
    submitted:     { bg: C.accentSoft,   color: C.accent,  label: "Submitted" },
    coordination:  { bg: C.accentSoft,   color: C.accent,  label: "In coordination" },
    offer_pending: { bg: C.amberSoft,    color: C.amber,   label: "Offer pending" },
    approved:      { bg: C.successSoft,  color: C.success, label: "Approved" },
    booked:        { bg: C.successSoft,  color: C.success, label: "Booked" },
    converted:     { bg: C.successSoft,  color: C.success, label: "Booked" },
    rejected:      { bg: "rgba(11,11,13,0.05)", color: C.inkDim, label: "Rejected" },
    expired:       { bg: "rgba(11,11,13,0.05)", color: C.inkDim, label: "Expired" },
    closed:        { bg: "rgba(11,11,13,0.05)", color: C.inkDim, label: "Closed" },
    closed_lost:   { bg: "rgba(11,11,13,0.05)", color: C.inkDim, label: "Closed" },
    archived:      { bg: "rgba(11,11,13,0.05)", color: C.inkDim, label: "Archived" },
    draft:         { bg: "rgba(11,11,13,0.05)", color: C.inkDim, label: "Draft" },
  };
  return (
    map[status] ?? {
      bg: "rgba(11,11,13,0.05)",
      color: C.inkDim,
      label: status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    }
  );
}

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      day: "numeric", month: "short", year: "numeric",
    });
  } catch {
    return "—";
  }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      dateStyle: "medium", timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = ms / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m ago`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h ago`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d ago`;
  return fmtDate(iso);
}

export default async function AdminInquiryInspectPage({
  params,
}: {
  params: PageParams;
}) {
  const { tenantSlug, inquiryId } = await params;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  // ── Core inquiry row ──
  const { data: inquiryRow, error: iqErr } = await supabase
    .from("inquiries")
    .select(
      `id, status, contact_name, contact_email, contact_phone, company,
       event_date, event_location, quantity, message,
       created_at, updated_at, expires_at, booked_at,
       next_action_by, priority, trust_level_at_submission,
       source_channel, source_pitch_id, source_context,
       coordinator_id, current_offer_id`,
    )
    .eq("tenant_id", scope.tenantId)
    .eq("id", inquiryId)
    .maybeSingle();
  if (iqErr) logServerError("admin.inquiryInspect.loadInquiry", iqErr);
  if (!inquiryRow) notFound();

  type InquiryRow = {
    id: string;
    status: string;
    contact_name: string | null;
    contact_email: string | null;
    contact_phone: string | null;
    company: string | null;
    event_date: string | null;
    event_location: string | null;
    quantity: number | null;
    message: string | null;
    created_at: string;
    updated_at: string;
    expires_at: string | null;
    booked_at: string | null;
    next_action_by: string | null;
    priority: string | null;
    trust_level_at_submission: "basic" | "verified" | "silver" | "gold" | null;
    source_channel: string | null;
    source_pitch_id: string | null;
    source_context: Record<string, unknown> | null;
    coordinator_id: string | null;
    current_offer_id: string | null;
  };
  const inquiry = inquiryRow as InquiryRow;

  // ── Participants (talent + coordinator) ──
  const { data: partRows } = await supabase
    .from("inquiry_participants")
    .select(
      `role, status, user_id, talent_profile_id,
       profiles:user_id ( display_name ),
       talent_profiles:talent_profile_id ( display_name, first_name, last_name, profile_code )`,
    )
    .eq("tenant_id", scope.tenantId)
    .eq("inquiry_id", inquiryId);
  type PartRow = {
    role: string;
    status: string;
    user_id: string | null;
    talent_profile_id: string | null;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
    talent_profiles:
      | { display_name: string | null; first_name: string | null; last_name: string | null; profile_code: string | null }
      | { display_name: string | null; first_name: string | null; last_name: string | null; profile_code: string | null }[]
      | null;
  };
  const participants = ((partRows ?? []) as unknown as PartRow[]).map((p) => {
    const tpArrOrRow = p.talent_profiles;
    const tp = Array.isArray(tpArrOrRow) ? tpArrOrRow[0] : tpArrOrRow;
    const profArrOrRow = p.profiles;
    const prof = Array.isArray(profArrOrRow) ? profArrOrRow[0] : profArrOrRow;
    const displayName =
      tp?.display_name?.trim() ||
      `${tp?.first_name ?? ""} ${tp?.last_name ?? ""}`.trim() ||
      prof?.display_name?.trim() ||
      "—";
    return {
      role: p.role,
      status: p.status,
      displayName,
      profileCode: tp?.profile_code ?? null,
    };
  });

  // ── Active offer ──
  let activeOffer: {
    id: string;
    status: string;
    totalCents: number;
    currency: string;
    validUntil: string | null;
    sentAt: string | null;
  } | null = null;
  if (inquiry.current_offer_id) {
    const { data: offerRow } = await supabase
      .from("inquiry_offers")
      .select("id, status, total_client_price, currency_code, valid_until, sent_at")
      .eq("id", inquiry.current_offer_id)
      .maybeSingle();
    if (offerRow) {
      const r = offerRow as {
        id: string;
        status: string;
        total_client_price: number | string;
        currency_code: string;
        valid_until: string | null;
        sent_at: string | null;
      };
      activeOffer = {
        id: r.id,
        status: r.status,
        totalCents: Math.round(Number(r.total_client_price) * 100),
        currency: r.currency_code,
        validUntil: r.valid_until,
        sentAt: r.sent_at,
      };
    }
  }

  // ── Recent messages (last 30 of the private thread) — preview only ──
  const { data: msgRows } = await supabase
    .from("inquiry_messages")
    .select(
      "id, sender_user_id, body, created_at, message_kind, profiles:sender_user_id(display_name)",
    )
    .eq("tenant_id", scope.tenantId)
    .eq("inquiry_id", inquiryId)
    .eq("thread_type", "private")
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(30);
  type MsgRow = {
    id: string;
    sender_user_id: string | null;
    body: string;
    created_at: string;
    message_kind: string | null;
    profiles: { display_name: string | null } | { display_name: string | null }[] | null;
  };
  const messages = ((msgRows ?? []) as unknown as MsgRow[])
    .map((m) => {
      const profArrOrRow = m.profiles;
      const prof = Array.isArray(profArrOrRow) ? profArrOrRow[0] : profArrOrRow;
      return {
        id: m.id,
        body: m.body,
        senderName: prof?.display_name?.trim() || "—",
        createdAt: m.created_at,
        messageKind: m.message_kind,
      };
    })
    .reverse(); // chronological for render

  const tone = statusTone(inquiry.status);
  const sourceLabel =
    inquiry.source_channel === "discover_single_talent"
      ? "Discover · single talent"
      : inquiry.source_channel === "discover_shortlist"
        ? "Discover · shortlist fan-out"
        : null;
  const isDiscover = sourceLabel !== null;

  const talents = participants.filter((p) => p.role === "talent");
  const coordinators = participants.filter((p) => p.role === "coordinator");

  return (
    <div style={{ fontFamily: FONT, padding: "24px 28px", maxWidth: 1080 }}>
      <div style={{ marginBottom: 18 }}>
        <Link
          href={`/${tenantSlug}/admin/messages?inquiry=${inquiry.id}`}
          style={{
            fontSize: 11.5, color: C.inkMuted, textDecoration: "none",
          }}
        >
          ← Back to Messages
        </Link>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap", marginBottom: 8 }}>
          <span style={{
            display: "inline-flex", alignItems: "center",
            padding: "3px 10px", borderRadius: 999,
            background: tone.bg, color: tone.color,
            fontSize: 11, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
          }}>
            {tone.label}
          </span>
          {isDiscover && (
            <span
              title={
                inquiry.source_channel === "discover_shortlist"
                  ? "Originated from a Discover shortlist (multi-talent fan-out)."
                  : "Originated from Tulala Discover."
              }
              style={{
                display: "inline-flex", alignItems: "center", gap: 4,
                padding: "3px 10px", borderRadius: 999,
                background: "rgba(29,78,216,0.10)", color: "#1D4ED8",
                fontSize: 11, fontWeight: 700, letterSpacing: 0.3,
              }}
            >
              ◎ {sourceLabel}
            </span>
          )}
          {inquiry.trust_level_at_submission && (
            <span style={{
              display: "inline-flex", alignItems: "center",
              padding: "3px 10px", borderRadius: 999,
              background: "rgba(217,160,58,0.14)", color: "#8A6F1A",
              fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
            }}>
              ★ {inquiry.trust_level_at_submission}
            </span>
          )}
          {inquiry.priority && inquiry.priority !== "normal" && (
            <span style={{
              padding: "3px 10px", borderRadius: 999,
              background: C.amberSoft, color: C.amber,
              fontSize: 10, fontWeight: 700, letterSpacing: 0.3, textTransform: "uppercase",
            }}>
              {inquiry.priority}
            </span>
          )}
        </div>

        <h1 style={{
          fontFamily: FONT_DISPLAY,
          fontSize: 26, fontWeight: 600, color: C.ink,
          margin: 0, marginBottom: 6, letterSpacing: -0.4,
        }}>
          {inquiry.company ?? inquiry.contact_name ?? "Unnamed inquiry"}
        </h1>
        <p style={{ fontSize: 13, color: C.inkMuted, margin: 0, lineHeight: 1.55 }}>
          Submitted {ageLabel(inquiry.created_at)} · Last activity{" "}
          {ageLabel(inquiry.updated_at)}
        </p>
      </div>

      <div style={{ marginBottom: 20 }}>
        <Link
          href={`/${tenantSlug}/admin/messages?inquiry=${inquiry.id}`}
          style={{
            display: "inline-flex", alignItems: "center",
            height: 38, padding: "0 16px", borderRadius: 9,
            background: C.accent, color: "#fff",
            fontSize: 13, fontWeight: 600, letterSpacing: -0.1,
            textDecoration: "none",
          }}
        >
          Open in Messages →
        </Link>
      </div>

      <div style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14,
        marginBottom: 18,
      }}>
        {/* Contact */}
        <section style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 14,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 8,
          }}>Contact</div>
          <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600 }}>
            {inquiry.contact_name ?? "—"}
          </div>
          {inquiry.contact_email && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              {inquiry.contact_email}
            </div>
          )}
          {inquiry.contact_phone && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              {inquiry.contact_phone}
            </div>
          )}
        </section>

        {/* Event */}
        <section style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 14,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 8,
          }}>Event</div>
          <div style={{ fontSize: 13.5, color: C.ink, fontWeight: 600 }}>
            {fmtDate(inquiry.event_date)}
          </div>
          {inquiry.event_location && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              📍 {inquiry.event_location}
            </div>
          )}
          {inquiry.quantity != null && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
              {inquiry.quantity} talent
              {inquiry.quantity === 1 ? "" : "s"}
            </div>
          )}
        </section>

        {/* Routing */}
        <section style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 14,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 8,
          }}>Routing</div>
          <div style={{ fontSize: 12.5, color: C.ink }}>
            Next action: <strong>{inquiry.next_action_by ?? "—"}</strong>
          </div>
          {coordinators.length > 0 && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
              Coordinator{coordinators.length > 1 ? "s" : ""}: {coordinators.map((c) => c.displayName).join(", ")}
            </div>
          )}
          {inquiry.expires_at && (
            <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
              Expires: {fmtDate(inquiry.expires_at)}
            </div>
          )}
        </section>
      </div>

      {/* Lineup */}
      {talents.length > 0 && (
        <section style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 14,
          marginBottom: 18,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 10,
          }}>
            Lineup ({talents.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {talents.map((t, i) => (
              <div key={`${t.profileCode ?? i}`} style={{
                display: "flex", alignItems: "center", gap: 10, fontSize: 13, color: C.ink,
              }}>
                <span style={{
                  flexShrink: 0,
                  width: 22, height: 22, borderRadius: 6,
                  background: C.accentSoft, color: C.accent,
                  display: "flex", alignItems: "center", justifyContent: "center",
                  fontSize: 11, fontWeight: 700,
                }}>
                  {i + 1}
                </span>
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.profileCode ? (
                    <Link href={`/t/${t.profileCode}`} target="_blank" rel="noopener" style={{ color: C.ink, textDecoration: "none" }}>
                      {t.displayName}
                    </Link>
                  ) : (
                    t.displayName
                  )}
                </span>
                <span style={{
                  flexShrink: 0,
                  fontSize: 10.5, fontWeight: 600, color: C.inkMuted, letterSpacing: 0.3,
                  textTransform: "uppercase",
                  padding: "1px 6px", borderRadius: 4, background: C.surface,
                }}>
                  {t.status}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Active offer */}
      {activeOffer && (
        <section style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 14,
          marginBottom: 18,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 8,
          }}>Active offer</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: C.ink, letterSpacing: -0.3 }}>
            {new Intl.NumberFormat(undefined, {
              style: "currency",
              currency: activeOffer.currency,
              maximumFractionDigits: 0,
            }).format(activeOffer.totalCents / 100)}
          </div>
          <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 4 }}>
            Status: <strong style={{ color: C.ink }}>{activeOffer.status}</strong>
            {activeOffer.sentAt && <> · Sent {fmtDate(activeOffer.sentAt)}</>}
            {activeOffer.validUntil && <> · Valid until {fmtDate(activeOffer.validUntil)}</>}
          </div>
        </section>
      )}

      {/* Brief */}
      {inquiry.message && (
        <section style={{
          background: C.surface,
          border: `1px solid ${C.borderSoft}`,
          borderRadius: 12,
          padding: 14,
          marginBottom: 18,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 8,
          }}>Brief</div>
          <p style={{
            fontSize: 13, color: C.ink, margin: 0, lineHeight: 1.6,
            whiteSpace: "pre-wrap",
          }}>
            {inquiry.message}
          </p>
        </section>
      )}

      {/* Recent messages preview */}
      {messages.length > 0 && (
        <section style={{
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: 14,
          marginBottom: 18,
        }}>
          <div style={{
            fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
            textTransform: "uppercase", color: C.inkDim, marginBottom: 10,
          }}>
            Recent messages — private thread ({messages.length})
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {messages.slice(-10).map((m) => (
              <div key={m.id} style={{
                display: "flex", flexDirection: "column", gap: 2,
                paddingBottom: 8, borderBottom: `1px dashed ${C.borderSoft}`,
              }}>
                <div style={{
                  display: "flex", justifyContent: "space-between", alignItems: "center",
                  fontSize: 11, color: C.inkMuted,
                }}>
                  <strong style={{ color: C.ink, fontSize: 12 }}>{m.senderName}</strong>
                  <span>{fmtDateTime(m.createdAt)}</span>
                </div>
                <div style={{ fontSize: 13, color: C.ink, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                  {m.body}
                </div>
                {m.messageKind && m.messageKind !== "text" && (
                  <span style={{
                    fontSize: 10, fontWeight: 700, letterSpacing: 0.3,
                    textTransform: "uppercase", color: C.inkDim, marginTop: 2,
                  }}>
                    {m.messageKind.replace(/_/g, " ")}
                  </span>
                )}
              </div>
            ))}
          </div>
          {messages.length > 10 && (
            <div style={{ fontSize: 11.5, color: C.inkDim, marginTop: 8 }}>
              Showing last 10 of {messages.length} loaded. Open in Messages for the
              full thread + composer.
            </div>
          )}
        </section>
      )}

      <p style={{
        marginTop: 24, fontSize: 11.5, color: C.inkDim, lineHeight: 1.5,
        maxWidth: 640,
      }}>
        Read-only inspect view. To compose, change status, send an offer, or
        manage lineup, open the thread in Messages (above).
      </p>
    </div>
  );
}
