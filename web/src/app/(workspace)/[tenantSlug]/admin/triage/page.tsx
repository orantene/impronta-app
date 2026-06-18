// A7 — Admin triage queue (MVP).
//
// Focused list of inquiries needing the admin team's attention right now,
// independent of the heavy Messages shell. Each row is a one-line scan:
// stage chip + company/contact + date + age + sourceChannel + "Open thread"
// link to the canonical admin Messages shell with that inquiry pinned.
//
// Filtering rule: open inquiries (not in terminal statuses) where
//   next_action_by ∈ { 'admin', 'coordinator' }
// — the engine's queue marker. Anything where the next action is on
// client/talent is correctly NOT in the admin triage queue.
//
// PLUS a leading "Unassigned · needs coordinator" bucket: open inquiries
// where coordinator_id IS NULL. The 3-tier assignment fallback
// (lib/inquiry/coordinator-assignment.ts) can leave coordinator_id NULL
// (`agency_manual_pickup`) with next_action_by pointing anywhere, so these
// would otherwise sit invisibly — nobody is driving them. They're sourced
// from the full open set (not the next_action_by queue) and deduped out of
// the other buckets so each inquiry appears once.

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { getCachedActorSession } from "@/lib/server/request-cache";
import { userHasCapability } from "@/lib/access";
import { loadWorkspaceInquiries } from "../../_data-bridge/inquiries-workspace";
import { loadNewInquiryIntakeData } from "@/lib/inquiry/new-inquiry-intake-data";
import { AdminNewInquirySheet } from "@/components/admin/admin-new-inquiry-sheet";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY = 'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';
const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  card: "#FFFFFF",
  surface: "#FAFAF7",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  amber: "rgba(245,158,11,0.10)",
  amberDeep: "#92400E",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.08)",
} as const;

const STAGE_LABELS: Record<string, { label: string; bg: string; fg: string }> = {
  submitted:     { label: "New",          bg: C.amber,       fg: C.amberDeep },
  coordination:  { label: "In review",    bg: C.accentSoft,  fg: C.accent },
  offer_pending: { label: "Offer pending", bg: C.accentSoft, fg: C.accent },
  offer_sent:    { label: "Offer sent",   bg: C.accentSoft,  fg: C.accent },
  approved:      { label: "Approved",     bg: C.successSoft, fg: C.success },
  booked:        { label: "Booked",       bg: C.successSoft, fg: C.success },
  converted:     { label: "Booked",       bg: C.successSoft, fg: C.success },
};

function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = ms / 60_000;
  if (m < 1) return "just now";
  if (m < 60) return `${Math.floor(m)}m`;
  const h = m / 60;
  if (h < 24) return `${Math.floor(h)}h`;
  const d = h / 24;
  if (d < 30) return `${Math.floor(d)}d`;
  return new Date(iso).toLocaleDateString();
}

function fmtEventDate(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "—";
  }
}

export default async function AdminTriagePage({ params }: { params: PageParams }) {
  const { tenantSlug } = await params;

  // Auth + capability gate — same as the admin layout.
  const session = await getCachedActorSession();
  if (!session.user) notFound();
  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();
  const canView = await userHasCapability("agency.workspace.view", scope.tenantId);
  if (!canView) notFound();

  const [inquiries, intake] = await Promise.all([
    loadWorkspaceInquiries(scope.tenantId),
    loadNewInquiryIntakeData(scope.tenantId),
  ]);

  // Unassigned bucket — open inquiries with NO coordinator of record. These
  // come straight from the full open set (already terminal-excluded by
  // loadWorkspaceInquiries), NOT the next_action_by queue, because the
  // 3-tier assignment fallback can leave coordinator_id NULL with the next
  // action pointing anywhere — so they'd otherwise sit invisibly. Nobody is
  // driving them: surface them first, deduped out of the other buckets.
  const unassigned = inquiries.filter((i) => !i.coordinator_id);
  const unassignedIds = new Set(unassigned.map((i) => i.id));

  const queue = inquiries.filter(
    (i) =>
      !unassignedIds.has(i.id) &&
      (i.next_action_by === "admin" || i.next_action_by === "coordinator"),
  );

  // Bucket by stage for visual grouping. "unassigned" leads (its own source
  // set above); the rest are the next_action_by queue split by status.
  type Bucket = "unassigned" | "new" | "in_progress" | "offer" | "ready";
  const buckets: Record<Bucket, typeof queue> = {
    unassigned,
    new: queue.filter((i) => i.status === "submitted"),
    in_progress: queue.filter((i) => i.status === "coordination"),
    offer: queue.filter((i) => i.status === "offer_pending" || i.status === "offer_sent"),
    ready: queue.filter((i) => i.status === "approved" || i.status === "booked" || i.status === "converted"),
  };
  const bucketMeta: Array<{ key: Bucket; label: string; hint: string }> = [
    { key: "unassigned",  label: "Unassigned · needs coordinator", hint: "No coordinator of record — claim one so it gets driven" },
    { key: "new",         label: "New inquiries",  hint: "Just landed — triage and assign a coordinator" },
    { key: "in_progress", label: "In review",      hint: "Coordinator working on talent + brief" },
    { key: "offer",       label: "Offer in flight", hint: "Sent or drafting — chase the client if stalled" },
    { key: "ready",       label: "Ready for booking", hint: "Client approved — confirm and convert" },
  ];

  // Total awaiting the team — the next_action_by queue plus every unassigned
  // inquiry (which may not be in that queue at all).
  const totalNeedingTeam = queue.length + unassigned.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 18, fontFamily: FONT }}>
      <header style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
            Triage
          </div>
          <h1 style={{ margin: "4px 0 0", fontSize: 24, fontWeight: 600, color: C.ink, letterSpacing: -0.2, fontFamily: FONT_DISPLAY }}>
            {totalNeedingTeam === 0 ? "Inbox zero" : `${totalNeedingTeam} ${totalNeedingTeam === 1 ? "inquiry" : "inquiries"} need your team`}
          </h1>
          <p style={{ margin: "6px 0 0", fontSize: 13, color: C.inkMuted, lineHeight: 1.5, maxWidth: 620 }}>
            Open inquiries where the next action belongs to admin or coordinator,
            plus any with no coordinator assigned. Anything waiting on client or
            talent has been filtered out.
          </p>
        </div>
        {/* Staff-facing intake. The talent picker inside is enriched with
            exclusivity + availability signals (see loadNewInquiryIntakeData). */}
        <div style={{ flexShrink: 0 }}>
          <AdminNewInquirySheet
            accounts={intake.accounts}
            contacts={intake.contacts}
            talents={intake.talents}
          />
        </div>
      </header>

      {totalNeedingTeam === 0 ? (
        <div
          style={{
            background: C.card,
            border: `1px dashed ${C.border}`,
            borderRadius: 14,
            padding: "32px 22px",
            textAlign: "center",
            color: C.inkMuted,
          }}
        >
          <div style={{ fontSize: 32, marginBottom: 8 }}>🎯</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>Nothing to triage right now</div>
          <div style={{ marginTop: 6, fontSize: 12.5 }}>
            Every open inquiry is waiting on client or talent. Sit back, or open Messages to nudge.
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {bucketMeta.map(({ key, label, hint }) => {
            const rows = buckets[key];
            if (rows.length === 0) return null;
            // The unassigned bucket carries an amber accent — nobody is
            // driving these, so they're the most urgent thing on the page.
            const isUrgent = key === "unassigned";
            return (
              <section
                key={key}
                style={{
                  background: C.card,
                  border: `1px solid ${isUrgent ? "rgba(245,158,11,0.30)" : C.borderSoft}`,
                  borderRadius: 14,
                  overflow: "hidden",
                }}
              >
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.borderSoft}`, background: isUrgent ? C.amber : C.surface }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: isUrgent ? C.amberDeep : C.ink, letterSpacing: -0.1 }}>
                      {label}
                    </div>
                    <span style={{ fontSize: 11.5, color: isUrgent ? C.amberDeep : C.inkMuted, fontWeight: 600 }}>
                      ({rows.length})
                    </span>
                  </div>
                  <div style={{ marginTop: 2, fontSize: 11.5, color: isUrgent ? C.amberDeep : C.inkMuted }}>{hint}</div>
                </div>
                <div>
                  {rows.map((inq, idx) => {
                    const stage = STAGE_LABELS[inq.status] ?? {
                      label: humanize(inq.status),
                      bg: "rgba(11,11,13,0.05)",
                      fg: C.inkMuted,
                    };
                    return (
                      <Link
                        key={inq.id}
                        href={`/${tenantSlug}/admin/messages?inquiry=${encodeURIComponent(inq.id)}`}
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr auto",
                          gap: 16,
                          alignItems: "center",
                          padding: "12px 18px",
                          borderBottom: idx < rows.length - 1 ? `1px solid ${C.borderSoft}` : "none",
                          textDecoration: "none",
                          color: "inherit",
                        }}
                      >
                        <div className="min-w-0">
                          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                letterSpacing: 0.4,
                                textTransform: "uppercase",
                                padding: "2px 8px",
                                borderRadius: 999,
                                background: stage.bg,
                                color: stage.fg,
                              }}
                            >
                              {stage.label}
                            </span>
                            <span style={{ fontSize: 11, color: isUrgent ? C.amberDeep : C.inkDim, fontWeight: isUrgent ? 600 : 400 }}>
                              {!inq.coordinator_id
                                ? "Needs coordinator"
                                : inq.next_action_by === "admin"
                                  ? "Admin to act"
                                  : "Coordinator to act"}
                            </span>
                            <span style={{ flex: 1 }} />
                            <span style={{ fontSize: 11, color: C.inkMuted }}>{ageLabel(inq.created_at)} ago</span>
                          </div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: C.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {inq.company || inq.contact_name}
                            {inq.company && <span style={{ marginLeft: 8, color: C.inkMuted, fontWeight: 500 }}>· {inq.contact_name}</span>}
                          </div>
                          <div style={{ marginTop: 2, fontSize: 12, color: C.inkMuted, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <span>📅 {fmtEventDate(inq.event_date)}</span>
                            {inq.event_location && <span>📍 {inq.event_location}</span>}
                            {inq.quantity != null && <span>👥 {inq.quantity}</span>}
                            {(inq.source_channel === "discover_single_talent" ||
                              inq.source_channel === "discover_shortlist") ? (
                              <span
                                title={
                                  inq.source_channel === "discover_shortlist"
                                    ? "Originated from a Discover shortlist (multi-talent fan-out — sibling agencies received their own copies)."
                                    : "Originated from Tulala Discover."
                                }
                                style={{
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 3,
                                  fontSize: 9.5,
                                  fontWeight: 700,
                                  letterSpacing: 0.3,
                                  textTransform: "uppercase",
                                  padding: "1px 6px",
                                  borderRadius: 4,
                                  background: "rgba(29,78,216,0.08)",
                                  color: "#1D4ED8",
                                }}
                              >
                                ◎ {inq.source_channel === "discover_shortlist" ? "Shortlist" : "Discover"}
                              </span>
                            ) : (
                              inq.source_channel && <span>· {humanize(inq.source_channel)}</span>
                            )}
                          </div>
                        </div>
                        <span style={{ color: C.inkMuted, fontSize: 18 }}>›</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
