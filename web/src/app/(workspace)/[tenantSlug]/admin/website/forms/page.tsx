/**
 * Forms inbox — operator list/detail/export surface for cms_form_submissions.
 *
 * Scoped per tenant; optionally filtered by ?section= (section uuid) and
 * ?status= (new|read|archived).
 *
 * Capability gate: manage_billing (owner-class). Same gate as financials —
 * form data is at minimum PII-adjacent and warrants the same tier.
 *
 * Route: /{tenantSlug}/admin/website/forms
 */

import { notFound } from "next/navigation";
import Link from "next/link";
import { getTenantScopeBySlug } from "@/lib/saas/scope";
import { userHasCapability } from "@/lib/access";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { FormsInboxClient } from "./forms-inbox-client";

export const dynamic = "force-dynamic";

type PageParams = Promise<{ tenantSlug: string }>;
type SearchParams = Promise<{ section?: string; status?: string; q?: string }>;

const C = {
  ink: "#0B0B0D",
  inkMuted: "rgba(11,11,13,0.55)",
  inkDim: "rgba(11,11,13,0.35)",
  border: "rgba(24,24,27,0.08)",
  borderSoft: "rgba(24,24,27,0.06)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  amber: "#B45309",
  amberSoft: "rgba(180,83,9,0.10)",
  green: "#2E7D5B",
  greenSoft: "rgba(46,125,91,0.10)",
  red: "#9B1C1C",
  redSoft: "rgba(155,28,28,0.08)",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

/** FORMS-3 — one file the visitor attached to this submission. */
export type FormSubmissionAttachment = {
  id: string;
  field_name: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
};

export type FormSubmissionRow = {
  id: string;
  section_id: string;
  section_name: string;
  contact_name: string | null;
  contact_email: string | null;
  created_at: string;
  source_url: string | null;
  status: string;
  payload_jsonb: Record<string, unknown>;
  attachments: FormSubmissionAttachment[];
};

function statusBadge(status: string) {
  const cfg: Record<string, { label: string; bg: string; color: string }> = {
    new:      { label: "New",      bg: C.amberSoft, color: C.amber },
    read:     { label: "Read",     bg: C.surface,   color: C.inkMuted },
    archived: { label: "Archived", bg: C.surface,   color: C.inkDim },
    spam:     { label: "Spam",     bg: C.redSoft,   color: C.red },
  };
  const s = cfg[status] ?? { label: status, bg: C.surface, color: C.inkMuted };
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 8px",
        borderRadius: 99,
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.5,
        textTransform: "uppercase" as const,
        background: s.bg,
        color: s.color,
        whiteSpace: "nowrap" as const,
      }}
    >
      {s.label}
    </span>
  );
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

export default async function FormsInboxPage({
  params,
  searchParams,
}: {
  params: PageParams;
  searchParams: SearchParams;
}) {
  const { tenantSlug } = await params;
  const { section: sectionFilter, status: statusFilter, q: searchQuery } = await searchParams;

  const scope = await getTenantScopeBySlug(tenantSlug);
  if (!scope) notFound();

  // Capability gate: owner-class (manage_billing — same as financials).
  const canManage = await userHasCapability("manage_billing", scope.tenantId);
  if (!canManage) notFound();

  const svcClient = createServiceRoleClient();
  if (!svcClient) notFound();

  // ── 1. Fetch sections for the filter strip + name lookup ──────────────────
  type SectionRow = { id: string; name: string };
  const { data: sections } = await svcClient
    .from("cms_sections")
    .select("id, name")
    .eq("tenant_id", scope.tenantId)
    .order("name");
  const sectionList = (sections ?? []) as SectionRow[];
  const sectionMap = new Map<string, string>(sectionList.map((s) => [s.id, s.name]));

  // ── 2. Query submissions ──────────────────────────────────────────────────
  type RawRow = {
    id: string;
    section_id: string;
    contact_name: string | null;
    contact_email: string | null;
    created_at: string;
    source_url: string | null;
    status: string;
    payload_jsonb: Record<string, unknown>;
  };

  let q = svcClient
    .from("cms_form_submissions")
    .select("id, section_id, contact_name, contact_email, created_at, source_url, status, payload_jsonb")
    .eq("tenant_id", scope.tenantId)
    .order("created_at", { ascending: false })
    .limit(200);

  const activeStatus = statusFilter && ["new", "read", "archived", "spam"].includes(statusFilter)
    ? statusFilter
    : "new";

  q = q.eq("status", activeStatus);

  if (sectionFilter) {
    q = q.eq("section_id", sectionFilter);
  }

  const { data: rawRows, error } = await q;
  if (error) {
    // Surface the error gracefully rather than crashing.
    return (
      <div style={{ padding: 32, fontFamily: FONT, color: C.red }}>
        Failed to load form submissions: {error.message}
      </div>
    );
  }

  // ── 2b. FORMS-3 — attachments for the fetched page of submissions ─────────
  // One extra query keyed by the ids we already have, so an inbox with no
  // attachments pays for a single empty lookup. Staff download them through
  // `getFormAttachmentDownloadUrl`, which mints a short-lived signed URL; the
  // bucket is private and has no public URL to embed here.
  const submissionIds = ((rawRows ?? []) as RawRow[]).map((r) => r.id);
  const attachmentsBySubmission = new Map<string, FormSubmissionAttachment[]>();
  if (submissionIds.length > 0) {
    const { data: attachmentRows } = await svcClient
      .from("cms_form_submission_attachments")
      .select("id, submission_id, field_name, original_filename, mime_type, byte_size")
      .eq("tenant_id", scope.tenantId)
      .in("submission_id", submissionIds)
      .order("created_at", { ascending: true });
    for (const a of (attachmentRows ?? []) as Array<
      FormSubmissionAttachment & { submission_id: string }
    >) {
      const list = attachmentsBySubmission.get(a.submission_id) ?? [];
      list.push({
        id: a.id,
        field_name: a.field_name,
        original_filename: a.original_filename,
        mime_type: a.mime_type,
        byte_size: a.byte_size,
      });
      attachmentsBySubmission.set(a.submission_id, list);
    }
  }

  const rows: FormSubmissionRow[] = ((rawRows ?? []) as RawRow[]).map((r) => ({
    ...r,
    section_name: sectionMap.get(r.section_id) ?? r.section_id,
    attachments: attachmentsBySubmission.get(r.id) ?? [],
  }));

  // Text search (client-name, email, payload values — done in-memory after DB fetch).
  const filtered = searchQuery
    ? rows.filter((r) => {
        const needle = searchQuery.toLowerCase();
        return (
          (r.contact_name ?? "").toLowerCase().includes(needle) ||
          (r.contact_email ?? "").toLowerCase().includes(needle) ||
          r.section_name.toLowerCase().includes(needle) ||
          JSON.stringify(r.payload_jsonb).toLowerCase().includes(needle)
        );
      })
    : rows;

  // ── 3. Aggregate counts for the status tabs ───────────────────────────────
  const { data: countRows } = await svcClient
    .from("cms_form_submissions")
    .select("status")
    .eq("tenant_id", scope.tenantId)
    .in("status", ["new", "read", "archived", "spam"]);

  const counts: Record<string, number> = { new: 0, read: 0, archived: 0, spam: 0 };
  for (const r of (countRows ?? []) as Array<{ status: string }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, fontFamily: FONT }}>
      {/* ── Header ── */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
        <div>
          <div style={{ fontSize: 10.5, fontWeight: 700, letterSpacing: 0.7, textTransform: "uppercase", color: C.accent, marginBottom: 4 }}>
            {scope.membership.display_name}
          </div>
          <h1 style={{ fontFamily: FONT, fontSize: 26, fontWeight: 700, color: C.ink, margin: 0, lineHeight: 1.1 }}>
            Form submissions
          </h1>
          <div style={{ marginTop: 4, fontSize: 12.5, color: C.inkMuted }}>
            All contact-form submissions from your site, scoped to this workspace.
          </div>
        </div>
        <Link
          href={`/${tenantSlug}/admin/website`}
          style={{ fontSize: 12.5, color: C.accent, textDecoration: "underline" }}
        >
          ← Website
        </Link>
      </div>

      {/* ── Status tab strip ── */}
      <nav
        style={{
          display: "flex",
          gap: 4,
          borderBottom: `1px solid ${C.border}`,
          paddingBottom: 0,
          flexWrap: "wrap" as const,
        }}
      >
        {(["new", "read", "archived", "spam"] as const).map((tab) => {
          const isActive = activeStatus === tab;
          const tabLabel = tab[0]!.toUpperCase() + tab.slice(1);
          const tabCount = counts[tab] ?? 0;
          const href = new URLSearchParams(
            [
              ["status", tab],
              ...(sectionFilter ? [["section", sectionFilter]] : []),
              ...(searchQuery ? [["q", searchQuery]] : []),
            ]
          ).toString();
          return (
            <Link
              key={tab}
              href={`/${tenantSlug}/admin/website/forms?${href}`}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "8px 14px",
                fontSize: 13,
                fontWeight: isActive ? 700 : 500,
                color: isActive ? C.ink : C.inkMuted,
                textDecoration: "none",
                borderBottom: isActive ? `2px solid ${C.ink}` : "2px solid transparent",
                marginBottom: -1,
              }}
            >
              {tabLabel}
              {tabCount > 0 && (
                <span
                  style={{
                    display: "inline-block",
                    minWidth: 18,
                    textAlign: "center" as const,
                    padding: "1px 5px",
                    borderRadius: 99,
                    fontSize: 10.5,
                    fontWeight: 700,
                    background: isActive ? C.ink : C.surface,
                    color: isActive ? "#fff" : C.inkMuted,
                  }}
                >
                  {tabCount}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* ── Filters row: section picker + search + export ── */}
      <FormsInboxClient
        tenantSlug={tenantSlug}
        sectionList={sectionList}
        activeSectionId={sectionFilter ?? null}
        activeStatus={activeStatus}
        searchQuery={searchQuery ?? ""}
        rows={filtered}
      />

      {/* ── Submission list ── */}
      {filtered.length === 0 ? (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            padding: "32px 24px",
            textAlign: "center" as const,
            color: C.inkMuted,
            fontSize: 13,
          }}
        >
          No {activeStatus} submissions
          {sectionFilter ? ` for this form` : ""}.
        </div>
      ) : (
        <div
          style={{
            background: C.cardBg,
            border: `1px solid ${C.border}`,
            borderRadius: 12,
            overflow: "hidden",
          }}
        >
          <table style={{ width: "100%", borderCollapse: "collapse" as const, fontSize: 13 }}>
            <thead>
              <tr
                style={{
                  background: C.surface,
                  color: C.inkMuted,
                  textTransform: "uppercase" as const,
                  fontSize: 10.5,
                  letterSpacing: 0.6,
                }}
              >
                <th style={{ textAlign: "left" as const, padding: "10px 14px" }}>Status</th>
                <th style={{ textAlign: "left" as const, padding: "10px 14px" }}>Form</th>
                <th style={{ textAlign: "left" as const, padding: "10px 14px" }}>Contact</th>
                <th style={{ textAlign: "left" as const, padding: "10px 14px" }}>Source</th>
                <th style={{ textAlign: "right" as const, padding: "10px 14px" }}>Received</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <tr key={row.id} style={{ borderTop: `1px solid ${C.borderSoft}` }}>
                  <td style={{ padding: "10px 14px" }}>{statusBadge(row.status)}</td>
                  <td style={{ padding: "10px 14px", color: C.ink, fontWeight: 500, maxWidth: 180 }}>
                    {row.section_name}
                  </td>
                  <td style={{ padding: "10px 14px", color: C.inkMuted }}>
                    <div style={{ fontWeight: 500, color: C.ink }}>
                      {row.contact_name ?? <span style={{ fontStyle: "italic", color: C.inkDim }}>—</span>}
                    </div>
                    {row.contact_email && (
                      <div style={{ fontSize: 11.5 }}>{row.contact_email}</div>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", color: C.inkMuted, fontSize: 11.5, maxWidth: 200 }}>
                    {row.source_url ? (
                      <span
                        style={{
                          display: "block",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap" as const,
                          maxWidth: 200,
                        }}
                        title={row.source_url}
                      >
                        {row.source_url.replace(/^https?:\/\/[^/]+/, "")}
                      </span>
                    ) : (
                      <span style={{ color: C.inkDim }}>—</span>
                    )}
                  </td>
                  <td style={{ padding: "10px 14px", textAlign: "right" as const, color: C.inkMuted, whiteSpace: "nowrap" as const }}>
                    {formatDate(row.created_at)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
