"use client";

/**
 * DetailsTab — the canonical job-record view inside the client Messages
 * shell. Reads from loadClientInquiryDetails (server-side) and renders
 * the 10 sections defined in spec §6.4.
 *
 * Read-only in Phase C. Editable fields (brief, date, location, etc.)
 * land in a follow-up commit using the per-field server actions.
 */

import { useState, useTransition } from "react";
import type { ClientInquiryDetails } from "../../_data-bridge/client-inquiry-details";
import { cancelInquiryAsClient } from "../_actions/inquiry-cancel-actions";

const FONT = '"Inter", system-ui, sans-serif';
const FONT_DISPLAY =
  'var(--font-geist-sans), "Inter", -apple-system, system-ui, sans-serif';

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.10)",
  borderSoft: "rgba(24,24,27,0.06)",
  card: "#FFFFFF",
  accent: "#1D4ED8",
  accentSoft: "rgba(29,78,216,0.08)",
  success: "#0F5132",
  successSoft: "rgba(15,81,50,0.08)",
  amber: "#92400E",
  amberSoft: "rgba(146,64,14,0.08)",
} as const;

function humanize(s: string): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

const OFFER_STATUS_LABELS: Record<string, string> = {
  draft: "drafted",
  sent: "sent",
  withdrawn: "withdrawn",
  superseded: "updated",
  accepted: "accepted",
  rejected: "declined",
  expired: "expired",
};

function offerStatusLabel(status: string): string {
  return OFFER_STATUS_LABELS[status] ?? humanize(status);
}

const INQUIRY_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  submitted: "Submitted",
  coordination: "In review",
  offer_pending: "Offer pending",
  offer_sent: "Offer sent",
  approved: "Approved",
  booked: "Booked",
  converted: "Booked",
  rejected: "Declined",
  cancelled: "Cancelled",
  expired: "Expired",
  closed: "Closed",
  closed_lost: "Closed",
  archived: "Archived",
};

function inquiryStatusLabel(status: string): string {
  return INQUIRY_STATUS_LABELS[status] ?? humanize(status);
}

export function DetailsTab({
  details,
  tenantSlug,
}: {
  details: ClientInquiryDetails | null;
  tenantSlug?: string;
}) {
  if (!details) {
    return (
      <div style={{ padding: 24, color: C.inkMuted, fontFamily: FONT, fontSize: 13 }}>
        Loading details…
      </div>
    );
  }

  return (
    <div style={{ padding: "16px 22px 32px", display: "flex", flexDirection: "column", gap: 14, fontFamily: FONT }}>
      <JobHeader details={details} />

      <Section title="Project brief">
        {details.brief.summary ? (
          <p style={paragraphStyle}>{details.brief.summary}</p>
        ) : (
          <EmptyPrompt label="Add a brief" hint="Help the coordinator triage and match the right talent." />
        )}
      </Section>

      <SectionGrid>
        <Section title="Schedule" inline>
          <KV label="Date" value={formatDate(details.schedule.event_date)} fallback="Not set" />
          <KV label="Time" value={details.schedule.start_time} fallback="—" />
          <KV label="Duration" value={details.schedule.duration} fallback="—" />
          <KV
            label="Status"
            value={statusLabel(details.schedule.date_status)}
            fallback="Exact"
          />
        </Section>

        <Section title="Location" inline>
          <KV label="Venue" value={details.location.venue_name} fallback="—" />
          <KV label="City" value={details.location.city} fallback="—" />
          <KV label="Country" value={details.location.country} fallback="—" />
          <KV
            label="Status"
            value={statusLabel(details.location.status)}
            fallback="Unconfirmed"
            badge={details.location.status === "confirmed" ? "success" : details.location.status === "unconfirmed" ? "warn" : undefined}
          />
          {details.location.notes && (
            <KV label="Notes" value={details.location.notes} multiline />
          )}
        </Section>
      </SectionGrid>

      <Section title="Your coordinator">
        {details.coordinator.assigned && details.coordinator.name ? (
          <div className="flex items-center gap-3">
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: C.accentSoft,
                color: C.accent,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 14,
                fontWeight: 700,
                fontFamily: FONT,
              }}
            >
              {initials(details.coordinator.name)}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 600, color: C.ink }}>
                {details.coordinator.name}
              </div>
              <div style={{ fontSize: 12, color: C.inkMuted, marginTop: 2 }}>
                {details.coordinator.assigned_at
                  ? `Coordinating since ${formatDate(details.coordinator.assigned_at)}`
                  : "Coordinating your booking"}
              </div>
            </div>
          </div>
        ) : (
          <EmptyPrompt label="No coordinator yet" hint="The workspace will assign one shortly." />
        )}
      </Section>

      <Section title="Talent lineup">
        {details.talent.selected.length > 0 ? (
          <div className="flex flex-col gap-2">
            {details.talent.selected.map((t) => (
              <div
                key={t.participant_id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "8px 10px",
                  borderRadius: 10,
                  border: `1px solid ${C.borderSoft}`,
                  background: "#fff",
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: "rgba(11,11,13,0.06)",
                    color: C.inkMuted,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 12,
                    fontWeight: 700,
                  }}
                >
                  {initials(t.name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div style={{ fontSize: 13.5, fontWeight: 600, color: C.ink }}>
                    {t.name}
                  </div>
                  {t.profile_code && (
                    <div style={{ fontSize: 11, color: C.inkDim, marginTop: 1 }}>
                      {t.profile_code}
                    </div>
                  )}
                </div>
                <TalentStatusPill status={t.status} />
              </div>
            ))}
          </div>
        ) : details.talent.selection_mode === "agency_recommends" ? (
          <EmptyPrompt
            label="Agency to recommend"
            hint={
              details.talent.count_needed
                ? `${details.talent.count_needed} talent needed — the coordinator will propose options.`
                : "The coordinator will propose talent based on your brief."
            }
          />
        ) : (
          <EmptyPrompt label="No talent yet" hint="Pick talent or let the agency recommend." />
        )}
        {details.talent.notes && (
          <div style={{ marginTop: 10, fontSize: 12, color: C.inkMuted, lineHeight: 1.5 }}>
            {details.talent.notes}
          </div>
        )}
      </Section>

      <Section title="Budget">
        <KV
          label="Pricing"
          value={budgetLabel(details.budget.preference)}
          fallback="Let agency recommend"
        />
        {details.budget.amount != null && (
          <KV
            label="Amount"
            value={`${details.budget.amount.toLocaleString()} ${details.budget.currency ?? ""}`.trim()}
          />
        )}
        {details.budget.notes && <KV label="Notes" value={details.budget.notes} multiline />}
      </Section>

      <Section title="Logistics">
        <KV
          label="What talent should do"
          value={details.brief.role_expectations.join(", ")}
          fallback="—"
          multiline
        />
        <KV label="Wardrobe" value={details.brief.wardrobe_notes} fallback="—" />
        <KV label="Equipment" value={details.brief.equipment_notes} fallback="—" />
        <KV label="Travel / parking" value={details.brief.travel_notes} fallback="—" />
        <KV label="Media usage" value={details.brief.media_usage} fallback="—" />
        <KV
          label="Special requirements"
          value={details.brief.special_requirements}
          fallback="—"
          multiline
        />
      </Section>

      <Section title="Contact">
        <KV label="Name" value={details.contact.name} />
        <KV label="Email" value={details.contact.email} />
        <KV label="Phone" value={details.contact.phone} fallback="—" />
        {details.contact.company && <KV label="Company" value={details.contact.company} />}
        {details.contact.booking_for && (
          <KV label="Booking for" value={statusLabel(details.contact.booking_for)} />
        )}
      </Section>

      <Section title="Files & references">
        {details.attachments.files.length === 0 && details.attachments.links.length === 0 ? (
          <EmptyPrompt label="No files yet" hint="Moodboards, briefs, references — upload coming soon." />
        ) : (
          <>
            {details.attachments.files.map((f, i) => (
              <a
                key={i}
                href={f.url}
                target="_blank"
                rel="noreferrer"
                style={fileRowStyle}
              >
                <span>📎 {f.name}</span>
              </a>
            ))}
            {details.attachments.links.map((l, i) => (
              <a key={i} href={l} target="_blank" rel="noreferrer" style={fileRowStyle}>
                <span>🔗 {l}</span>
              </a>
            ))}
          </>
        )}
      </Section>

      <Section title="Activity">
        {details.activity.length === 0 ? (
          <EmptyPrompt label="No activity yet" hint="Coordinator actions will show up here." />
        ) : (
          <ul style={{ margin: 0, padding: 0, listStyle: "none", display: "flex", flexDirection: "column", gap: 6 }}>
            {details.activity.map((a) => (
              <li
                key={a.id}
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 10,
                  fontSize: 12.5,
                  color: C.ink,
                  paddingBottom: 6,
                  borderBottom: `1px solid ${C.borderSoft}`,
                }}
              >
                <span className="flex-1">
                  <strong>{a.actor_name ?? actorRoleLabel(a.actor_role) ?? "System"}</strong>{" "}
                  <span style={{ color: C.inkMuted }}>{eventLabel(a.event_type)}</span>
                </span>
                <span style={{ color: C.inkDim, fontSize: 11, whiteSpace: "nowrap" }}>
                  {formatRelative(a.created_at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* B3 — Cancel inquiry. Hidden once the project is booked/converted
          (separate cancellation flow needed at that point with refund +
          talent release). Also hidden once already rejected/expired. */}
      {tenantSlug && details &&
        !["rejected", "expired", "archived", "booked", "converted", "cancelled"].includes(details.status) && (
        <CancelInquiryRow tenantSlug={tenantSlug} inquiryId={details.id} />
      )}
    </div>
  );
}

function CancelInquiryRow({ tenantSlug, inquiryId }: { tenantSlug: string; inquiryId: string }) {
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  function go() {
    if (!confirm("Cancel this inquiry? Your coordinator will be notified. This can't be undone — for booked projects, message your coordinator instead.")) return;
    const reason = window.prompt("Optional: tell your coordinator why (helps them improve):") ?? "";
    setErr(null);
    startTransition(async () => {
      const r = await cancelInquiryAsClient(tenantSlug, inquiryId, reason.trim() || null);
      if (!r.ok) setErr(r.error);
      else window.location.reload();
    });
  }
  return (
    <section
      style={{
        background: "rgba(239,68,68,0.04)",
        border: "1px solid rgba(239,68,68,0.18)",
        borderRadius: 12,
        padding: "14px 16px",
        marginTop: 8,
        fontFamily: FONT,
      }}
    >
      <div style={{ fontSize: 11, fontWeight: 700, color: "#991B1B", textTransform: "uppercase", letterSpacing: 0.6 }}>
        Cancel inquiry
      </div>
      <div style={{ marginTop: 6, fontSize: 12.5, color: C.inkMuted, lineHeight: 1.5 }}>
        If your plans changed, cancel this inquiry. Your coordinator will be notified.
      </div>
      {err && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#991B1B" }}>
          {err}
        </div>
      )}
      <button
        type="button"
        onClick={go}
        disabled={pending}
        style={{
          marginTop: 10,
          padding: "8px 14px",
          borderRadius: 8,
          background: pending ? "rgba(239,68,68,0.4)" : "#991B1B",
          color: "#fff",
          border: "none",
          fontFamily: FONT,
          fontSize: 12.5,
          fontWeight: 600,
          cursor: pending ? "wait" : "pointer",
        }}
      >
        {pending ? "Cancelling…" : "Cancel inquiry"}
      </button>
    </section>
  );
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function JobHeader({ details }: { details: ClientInquiryDetails }) {
  return (
    <div
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div style={{ fontSize: 10.5, fontWeight: 700, color: C.inkMuted, textTransform: "uppercase", letterSpacing: 0.6 }}>
        Project
      </div>
      <h2
        style={{
          margin: "3px 0 0",
          fontSize: 20,
          fontWeight: 600,
          fontFamily: FONT_DISPLAY,
          color: C.ink,
          letterSpacing: -0.2,
        }}
      >
        {details.job.title ?? "Inquiry"}
      </h2>
      <div style={{ marginTop: 6, fontSize: 12, color: C.inkMuted, display: "flex", gap: 10, flexWrap: "wrap" }}>
        <span>Submitted {formatDate(details.created_at)}</span>
        <span>·</span>
        <span>{inquiryStatusLabel(details.status)}</span>
        {details.offer && (
          <>
            <span>·</span>
            <span style={{ color: C.accent, fontWeight: 600 }}>Offer {offerStatusLabel(details.offer.status)}</span>
          </>
        )}
      </div>
    </div>
  );
}

function Section({
  title,
  children,
  inline,
}: {
  title: string;
  children: React.ReactNode;
  inline?: boolean;
}) {
  return (
    <section
      style={{
        background: C.card,
        border: `1px solid ${C.borderSoft}`,
        borderRadius: 12,
        padding: "14px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          fontWeight: 700,
          color: C.inkMuted,
          textTransform: "uppercase",
          letterSpacing: 0.6,
          marginBottom: 8,
        }}
      >
        {title}
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: inline ? "column" : "column",
          gap: 6,
        }}
      >
        {children}
      </div>
    </section>
  );
}

function SectionGrid({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
        gap: 14,
      }}
    >
      {children}
    </div>
  );
}

function KV({
  label,
  value,
  fallback,
  multiline,
  badge,
}: {
  label: string;
  value: string | null | undefined;
  fallback?: string;
  multiline?: boolean;
  badge?: "success" | "warn";
}) {
  const display = value?.trim() ? value : fallback ?? null;
  const empty = !value?.trim();
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "120px 1fr",
        gap: 12,
        alignItems: multiline ? "flex-start" : "baseline",
        paddingBottom: 4,
      }}
    >
      <div style={{ fontSize: 11.5, color: C.inkMuted, fontWeight: 600 }}>{label}</div>
      <div
        style={{
          fontSize: 13,
          color: empty ? C.inkDim : C.ink,
          lineHeight: 1.45,
          whiteSpace: multiline ? "pre-wrap" : "normal",
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          flexWrap: "wrap",
        }}
      >
        {display}
        {badge && (
          <span
            style={{
              padding: "1px 7px",
              borderRadius: 999,
              fontSize: 9.5,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: 0.4,
              background: badge === "success" ? C.successSoft : C.amberSoft,
              color: badge === "success" ? C.success : C.amber,
            }}
          >
            {badge === "success" ? "Confirmed" : "TBD"}
          </span>
        )}
      </div>
    </div>
  );
}

function EmptyPrompt({ label, hint }: { label: string; hint: string }) {
  return (
    <div
      style={{
        padding: "10px 12px",
        background: "rgba(11,11,13,0.02)",
        border: `1px dashed ${C.border}`,
        borderRadius: 8,
        fontSize: 12.5,
        color: C.inkMuted,
        lineHeight: 1.5,
      }}
    >
      <strong style={{ color: C.ink }}>{label}</strong>
      <span> — {hint}</span>
    </div>
  );
}

function TalentStatusPill({ status }: { status: string }) {
  const palette = (() => {
    switch (status) {
      case "active":
        return { bg: C.successSoft, fg: C.success, label: "Confirmed" };
      case "invited":
        return { bg: C.accentSoft, fg: C.accent, label: "Invited" };
      case "declined":
        return { bg: "rgba(239,68,68,0.08)", fg: "#991B1B", label: "Declined" };
      default:
        return { bg: "rgba(11,11,13,0.06)", fg: C.inkMuted, label: humanize(status) };
    }
  })();
  return (
    <span
      style={{
        padding: "3px 9px",
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.3,
        textTransform: "uppercase",
      }}
    >
      {palette.label}
    </span>
  );
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function statusLabel(s: string | null | undefined): string | null {
  if (!s) return null;
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function budgetLabel(p: string | null | undefined): string | null {
  if (!p) return null;
  const map: Record<string, string> = {
    agency_recommends: "Let agency recommend",
    total_budget: "Total budget",
    per_hour: "Per hour",
    per_day: "Per day",
    per_week: "Per week",
    per_contract: "Per contract",
    per_talent: "Per talent",
    not_sure: "Not sure yet",
  };
  return map[p] ?? statusLabel(p);
}

function eventLabel(t: string): string {
  const map: Record<string, string> = {
    INQUIRY_SUBMITTED: "submitted this inquiry",
    INQUIRY_MOVED_TO_COORDINATION: "started coordination",
    COORDINATOR_ASSIGNED: "assigned a coordinator",
    COORDINATOR_ACCEPTED: "took over coordination",
    ROSTER_TALENT_INVITED: "invited a talent",
    ROSTER_TALENT_ACCEPTED: "confirmed",
    ROSTER_TALENT_DECLINED: "declined",
    OFFER_CREATED: "drafted an offer",
    OFFER_SENT: "sent you an offer",
    OFFER_CLIENT_REJECTED: "rejected the offer",
    OFFER_CLIENT_ACCEPTED: "accepted the offer",
    APPROVAL_SUBMITTED: "submitted an approval",
    APPROVALS_COMPLETED: "completed all approvals",
    INQUIRY_CONVERTED_TO_BOOKING: "converted this to a booking",
    BOOKING_CONFIRMED: "confirmed the booking",
    INQUIRY_FROZEN: "froze this inquiry",
    INQUIRY_UNFROZEN: "unfroze this inquiry",
    INQUIRY_ARCHIVED: "archived this inquiry",
  };
  return map[t] ?? t.toLowerCase().replace(/_/g, " ");
}

function actorRoleLabel(role: string | null): string | null {
  if (!role) return null;
  if (role === "client") return "You";
  if (role === "admin") return "Coordinator";
  return statusLabel(role);
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function formatRelative(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    if (ms < 60_000) return "just now";
    const m = Math.floor(ms / 60_000);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return formatDate(iso);
  } catch {
    return "";
  }
}

const paragraphStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 13.5,
  color: C.ink,
  lineHeight: 1.55,
  whiteSpace: "pre-wrap",
};

const fileRowStyle: React.CSSProperties = {
  display: "block",
  padding: "8px 10px",
  borderRadius: 8,
  background: "rgba(29,78,216,0.04)",
  color: C.accent,
  textDecoration: "none",
  fontSize: 12.5,
  fontWeight: 500,
};
