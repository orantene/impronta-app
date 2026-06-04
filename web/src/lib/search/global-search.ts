"use server";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { logServerError } from "@/lib/server/safe-error";
import type { SearchResult } from "@/lib/search/global-search-types";

/**
 * globalSearch — cross-surface command-palette search.
 *
 * Shared CONTRACT (consumed by the workspace command palette):
 *   globalSearch(query) -> SearchResult[]
 *
 * Searches the four content kinds the caller can already see (RLS does the
 * authorization — we use the request-scoped server client, NOT service-role):
 *   • inquiries     — by title-ish (contact_name) / company / message
 *   • bookings      — by title
 *   • messages      — by body (recent)
 *   • talent        — by display_name
 *
 * `href` is built for the caller's role surface, mirroring the slug-batch +
 * per-role href construction in `lib/notifications/self.ts`:
 *   admin  -> /<slug>/admin/work/<inquiryId>  (messages -> /admin/messages?inquiry=)
 *   client -> /<slug>/client/inquiries/<id>
 *   talent -> /<slug>/talent/inbox?inquiry=<id>
 */

const MIN_QUERY = 2;
const MAX_RESULTS = 20;
const PER_KIND_LIMIT = 8;

type Surface = "admin" | "client" | "talent";

export async function globalSearch(query: string): Promise<SearchResult[]> {
  try {
    const q = (typeof query === "string" ? query : "").trim();
    if (q.length < MIN_QUERY) return [];

    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return [];

    // Role → surface. Default to admin (workspace staff is the broadest reader).
    const surface = await resolveSurface(supabase, user.id);

    // PostgREST `ilike` pattern — escape the wildcards in the user's input so a
    // literal % or _ doesn't widen the match.
    const pattern = `%${escapeLike(q)}%`;

    const [inquiries, bookings, messages, talent] = await Promise.all([
      searchInquiries(supabase, pattern),
      searchBookings(supabase, pattern),
      searchMessages(supabase, pattern),
      searchTalent(supabase, pattern),
    ]);

    // Resolve all tenant slugs in one batch (RLS already limited rows to ones
    // the caller can see).
    const tenantIds = new Set<string>();
    for (const r of inquiries) if (r.tenant_id) tenantIds.add(r.tenant_id);
    for (const r of bookings) if (r.tenant_id) tenantIds.add(r.tenant_id);
    for (const r of messages) if (r.tenant_id) tenantIds.add(r.tenant_id);
    const slugByTenant = await loadTenantSlugs(supabase, Array.from(tenantIds));

    const out: SearchResult[] = [];

    for (const r of inquiries) {
      const slug = r.tenant_id ? slugByTenant.get(r.tenant_id) : undefined;
      const href = inquiryHref(surface, slug, r.id);
      if (!href) continue;
      out.push({
        kind: "inquiry",
        id: r.id,
        title: titleFromInquiry(r),
        snippet: snippet(r.message ?? r.company ?? r.contact_email ?? ""),
        href,
      });
    }

    for (const r of bookings) {
      const slug = r.tenant_id ? slugByTenant.get(r.tenant_id) : undefined;
      const href = bookingHref(surface, slug, r);
      if (!href) continue;
      out.push({
        kind: "booking",
        id: r.id,
        title: r.title || "Booking",
        snippet: snippet(r.client_account_name ?? r.contact_name ?? ""),
        href,
      });
    }

    for (const r of messages) {
      const slug = r.tenant_id ? slugByTenant.get(r.tenant_id) : undefined;
      const href = messageHref(surface, slug, r.inquiry_id);
      if (!href) continue;
      out.push({
        kind: "message",
        id: r.id,
        title: "Message",
        snippet: snippet(r.body),
        href,
      });
    }

    for (const r of talent) {
      const href = talentHref(surface, r.id);
      out.push({
        kind: "talent",
        id: r.id,
        title: r.display_name || "Talent",
        snippet: snippet(r.home_city_text ?? ""),
        href,
      });
    }

    return out.slice(0, MAX_RESULTS);
  } catch (err) {
    logServerError("search.global", err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Per-kind queries (RLS-scoped via the request server client)
// ---------------------------------------------------------------------------

type InquiryRow = {
  id: string;
  tenant_id: string | null;
  contact_name: string | null;
  company: string | null;
  contact_email: string | null;
  message: string | null;
};

async function searchInquiries(
  supabase: Sb,
  pattern: string,
): Promise<InquiryRow[]> {
  try {
    const { data, error } = await supabase
      .from("inquiries")
      .select("id, tenant_id, contact_name, company, contact_email, message")
      .or(
        `contact_name.ilike.${pattern},company.ilike.${pattern},message.ilike.${pattern},contact_email.ilike.${pattern}`,
      )
      .order("created_at", { ascending: false })
      .limit(PER_KIND_LIMIT);
    if (error) return [];
    return (data ?? []) as InquiryRow[];
  } catch {
    return [];
  }
}

type BookingRow = {
  id: string;
  tenant_id: string | null;
  title: string;
  client_account_name: string | null;
  contact_name: string | null;
  source_inquiry_id: string | null;
};

async function searchBookings(
  supabase: Sb,
  pattern: string,
): Promise<BookingRow[]> {
  try {
    const { data, error } = await supabase
      .from("agency_bookings")
      .select("id, tenant_id, title, client_account_name, contact_name, source_inquiry_id")
      .ilike("title", pattern)
      .order("created_at", { ascending: false })
      .limit(PER_KIND_LIMIT);
    if (error) return [];
    return (data ?? []) as BookingRow[];
  } catch {
    return [];
  }
}

type MessageRow = {
  id: string;
  tenant_id: string | null;
  inquiry_id: string;
  body: string;
};

async function searchMessages(
  supabase: Sb,
  pattern: string,
): Promise<MessageRow[]> {
  try {
    const { data, error } = await supabase
      .from("inquiry_messages")
      .select("id, tenant_id, inquiry_id, body")
      .is("deleted_at", null)
      .ilike("body", pattern)
      .order("created_at", { ascending: false })
      .limit(PER_KIND_LIMIT);
    if (error) return [];
    return (data ?? []) as MessageRow[];
  } catch {
    return [];
  }
}

type TalentRow = {
  id: string;
  display_name: string | null;
  home_city_text: string | null;
};

async function searchTalent(supabase: Sb, pattern: string): Promise<TalentRow[]> {
  try {
    const { data, error } = await supabase
      .from("talent_profiles")
      .select("id, display_name, home_city_text")
      .is("deleted_at", null)
      .ilike("display_name", pattern)
      .order("last_active_at", { ascending: false, nullsFirst: false })
      .limit(PER_KIND_LIMIT);
    if (error) return [];
    return (data ?? []) as TalentRow[];
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Surface + href construction (mirrors lib/notifications/self.ts)
// ---------------------------------------------------------------------------

async function resolveSurface(supabase: Sb, userId: string): Promise<Surface> {
  try {
    const { data } = await supabase
      .from("profiles")
      .select("app_role")
      .eq("id", userId)
      .maybeSingle();
    const role = (data as { app_role?: string | null } | null)?.app_role ?? null;
    if (role === "talent") return "talent";
    if (role === "client") return "client";
    return "admin";
  } catch {
    return "admin";
  }
}

async function loadTenantSlugs(
  supabase: Sb,
  tenantIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (tenantIds.length === 0) return map;
  try {
    const { data } = await supabase
      .from("agencies")
      .select("id, slug")
      .in("id", tenantIds);
    for (const row of (data ?? []) as Array<{ id: string; slug: string }>) {
      if (row.id && row.slug) map.set(row.id, row.slug);
    }
  } catch {
    /* best-effort */
  }
  return map;
}

function inquiryHref(
  surface: Surface,
  slug: string | undefined,
  inquiryId: string,
): string | null {
  if (!slug) return null;
  const id = encodeURIComponent(inquiryId);
  if (surface === "talent") return `/${slug}/talent/inbox?inquiry=${id}`;
  if (surface === "client") return `/${slug}/client/inquiries/${id}`;
  return `/${slug}/admin/work/${id}`;
}

function bookingHref(
  surface: Surface,
  slug: string | undefined,
  row: BookingRow,
): string | null {
  if (!slug) return null;
  // Bookings deep-link through their source inquiry where one exists, matching
  // how the shells route booking cards.
  if (row.source_inquiry_id) return inquiryHref(surface, slug, row.source_inquiry_id);
  const id = encodeURIComponent(row.id);
  if (surface === "client") return `/${slug}/client/bookings/${id}`;
  if (surface === "talent") return `/${slug}/talent/inbox`;
  return `/${slug}/admin/work?booking=${id}`;
}

function messageHref(
  surface: Surface,
  slug: string | undefined,
  inquiryId: string,
): string | null {
  if (!slug) return null;
  const id = encodeURIComponent(inquiryId);
  if (surface === "talent") return `/${slug}/talent/inbox?inquiry=${id}`;
  if (surface === "client") return `/${slug}/client/messages?inquiry=${id}`;
  return `/${slug}/admin/messages?inquiry=${id}`;
}

function talentHref(surface: Surface, talentId: string): string {
  const id = encodeURIComponent(talentId);
  if (surface === "client") return `/discover/talent/${id}`;
  if (surface === "talent") return `/discover/talent/${id}`;
  return `/admin/talent/${id}`;
}

// ---------------------------------------------------------------------------
// helpers
// ---------------------------------------------------------------------------

type Sb = NonNullable<Awaited<ReturnType<typeof createSupabaseServerClient>>>;

function titleFromInquiry(r: InquiryRow): string {
  return r.contact_name || r.company || r.contact_email || "Inquiry";
}

function escapeLike(s: string): string {
  // Neutralize PostgREST/SQL LIKE wildcards and the comma that would break
  // an `.or()` filter list, plus backslash.
  return s.replace(/[\\%_,()]/g, (m) => `\\${m}`);
}

function snippet(s: string, max = 140): string {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  if (!t) return "";
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}
