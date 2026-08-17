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
 *
 * Renders INSIDE the workspace admin shell (sidebar + top bar + Website
 * sub-nav): the path is registered in CANONICAL_ROUTE_MATCHERS, so the shell
 * hosts this body in its <main> instead of the SPA Website surface. Everything
 * below is the page body only — no page-level chrome, no back link (the
 * Website sub-nav above already owns "back").
 *
 * This file renders the header + status tabs (pure server, real <Link>s so the
 * tabs work without JS). The toolbar, list and row actions live in
 * FormsInboxClient. They used to render the same rows TWICE — a server <table>
 * plus the client's expandable list, stacked — which is why the surface read as
 * duplicated noise. One list now, owned by the client.
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
  border: "rgba(24,24,27,0.08)",
  cardBg: "#ffffff",
  surface: "rgba(11,11,13,0.02)",
  accent: "#0F4F3E",
  amber: "#B45309",
  red: "#9B1C1C",
} as const;

const FONT = '"Inter", system-ui, sans-serif';

const STATUSES = ["new", "read", "archived", "spam"] as const;
type SubmissionStatus = (typeof STATUSES)[number];

const STATUS_LABEL: Record<SubmissionStatus, string> = {
  new: "New",
  read: "Read",
  archived: "Archived",
  spam: "Spam",
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
};

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

  const activeStatus: SubmissionStatus =
    statusFilter && (STATUSES as readonly string[]).includes(statusFilter)
      ? (statusFilter as SubmissionStatus)
      : "new";

  let q = svcClient
    .from("cms_form_submissions")
    .select("id, section_id, contact_name, contact_email, created_at, source_url, status, payload_jsonb")
    .eq("tenant_id", scope.tenantId)
    .eq("status", activeStatus)
    .order("created_at", { ascending: false })
    .limit(200);

  if (sectionFilter) {
    q = q.eq("section_id", sectionFilter);
  }

  const { data: rawRows, error } = await q;
  if (error) {
    // Surface the error gracefully rather than crashing.
    return (
      <div
        style={{
          fontFamily: FONT,
          background: C.cardBg,
          border: `1px solid ${C.border}`,
          borderRadius: 12,
          padding: "24px 28px",
          color: C.red,
          fontSize: 13,
        }}
      >
        Failed to load form submissions: {error.message}
      </div>
    );
  }

  const rows: FormSubmissionRow[] = ((rawRows ?? []) as RawRow[]).map((r) => ({
    ...r,
    section_name: sectionMap.get(r.section_id) ?? r.section_id,
  }));

  // Text search (contact name, email, form name, payload values — applied
  // in-memory over the fetched page).
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
    .in("status", STATUSES as unknown as string[]);

  const counts: Record<string, number> = { new: 0, read: 0, archived: 0, spam: 0 };
  for (const r of (countRows ?? []) as Array<{ status: string }>) {
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  }

  const newCount = counts.new ?? 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20, fontFamily: FONT, minWidth: 0 }}>
      {/* ── Header ── */}
      <div>
        <div
          style={{
            fontSize: 10.5,
            fontWeight: 700,
            letterSpacing: 0.7,
            textTransform: "uppercase",
            color: C.accent,
            marginBottom: 4,
          }}
        >
          {scope.membership.display_name}
        </div>
        <h1
          style={{
            fontFamily: FONT,
            fontSize: 26,
            fontWeight: 700,
            color: C.ink,
            margin: 0,
            lineHeight: 1.1,
          }}
        >
          Form submissions
        </h1>
        <div style={{ marginTop: 5, fontSize: 12.5, color: C.inkMuted, maxWidth: 620 }}>
          {newCount > 0 ? (
            <>
              <span style={{ color: C.amber, fontWeight: 600 }}>
                {newCount} new {newCount === 1 ? "submission" : "submissions"}
              </span>{" "}
              waiting. Everything people send through the contact forms on your site lands here.
            </>
          ) : (
            <>Everything people send through the contact forms on your site lands here.</>
          )}
        </div>
      </div>

      {/* ── Status tab strip ── */}
      <nav
        style={{
          display: "flex",
          gap: 2,
          borderBottom: `1px solid ${C.border}`,
          flexWrap: "wrap" as const,
        }}
      >
        {STATUSES.map((tab) => {
          const isActive = activeStatus === tab;
          const tabCount = counts[tab] ?? 0;
          const href = new URLSearchParams([
            ["status", tab],
            ...(sectionFilter ? [["section", sectionFilter]] : []),
            ...(searchQuery ? [["q", searchQuery]] : []),
          ]).toString();
          return (
            <Link
              key={tab}
              href={`/${tenantSlug}/admin/website/forms?${href}`}
              aria-current={isActive ? "page" : undefined}
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
              {STATUS_LABEL[tab]}
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
                    fontVariantNumeric: "tabular-nums",
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

      {/* ── Toolbar + the one submission list ── */}
      <FormsInboxClient
        tenantSlug={tenantSlug}
        sectionList={sectionList}
        activeSectionId={sectionFilter ?? null}
        activeStatus={activeStatus}
        searchQuery={searchQuery ?? ""}
        rows={filtered}
        totalInStatus={counts[activeStatus] ?? 0}
      />
    </div>
  );
}
