import "server-only";

import { createClient as createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";

/**
 * _data-bridge/workspace-config.ts — agency identity, plan, custom domain,
 * and team member loaders.
 *
 * Split out of `_data-bridge.ts` (rev 13). These four pieces are the
 * "workspace settings" reads — what the agency owner needs to render their
 * settings pages and the chrome's identity strip.
 */

// ─── Plan tier ────────────────────────────────────────────────────────────────

/** Valid workspace plan tiers — mirrors WorkspacePlan from admin-workspace-summary. */
export type WorkspacePlan = "free" | "website" | "studio" | "agency" | "network";

const VALID_WORKSPACE_PLANS = new Set<string>([
  "free",
  "website",
  "studio",
  "agency",
  "network",
]);

function coercePlan(raw: unknown): WorkspacePlan {
  if (typeof raw === "string" && VALID_WORKSPACE_PLANS.has(raw)) {
    return raw as WorkspacePlan;
  }
  return "free";
}

// ─── Agency summary ───────────────────────────────────────────────────────────

export type WorkspaceAgencySummary = {
  displayName: string;
  slug: string;
  plan: WorkspacePlan;
  /** Null = unlimited (Network plan). */
  talentLimit: number | null;
  talentCount: number;
  contactEmail: string | null;
  contactPhone: string | null;
  addressCity: string | null;
  addressCountry: string | null;
  /** Preferred Stripe presentment currency (lowercase ISO 4217). Null = Adaptive Pricing auto-detect. */
  preferredCurrency: string | null;
  /** agencies.created_at — workspace registration date (ISO). Null if unreadable. */
  registeredAt: string | null;
};

/**
 * Tenant-id-explicit workspace summary. Used by the Account page on the app
 * host where tenant scope comes from the URL slug, not the active-tenant
 * cookie.
 *
 * Returns null on error or missing data.
 */
export async function loadWorkspaceAgencySummary(
  tenantId: string,
): Promise<WorkspaceAgencySummary | null> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return null;

    // Self-heal an expired platform plan override before reading the plan,
    // so the workspace's own dashboard / billing / gates stay honest. The
    // RPC is SECURITY DEFINER + idempotent — a no-op when nothing expired.
    try {
      await supabase.rpc("reconcile_expired_plan_overrides", {
        p_tenant_id: tenantId,
      });
    } catch {
      // Non-fatal — the platform-side sweep reconciles too.
    }

    const [agencyRes, identityRes, rosterCountRes] = await Promise.all([
      supabase
        .from("agencies")
        .select("slug, display_name, plan_tier, talent_seat_limit, preferred_currency, created_at")
        .eq("id", tenantId)
        .maybeSingle(),
      supabase
        .from("agency_business_identity")
        .select("contact_email, contact_phone, address_city, address_country")
        .eq("tenant_id", tenantId)
        .maybeSingle(),
      supabase
        .from("agency_talent_roster")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .neq("status", "removed"),
    ]);

    if (agencyRes.error) {
      logServerError("workspace.loadAgencySummary.agency", agencyRes.error);
    }

    if (!agencyRes.data) return null;

    const row = agencyRes.data as {
      slug: string;
      display_name: string;
      plan_tier: string | null;
      talent_seat_limit: number | null;
      preferred_currency: string | null;
      created_at: string | null;
    };
    const identity = identityRes.data as {
      contact_email: string | null;
      contact_phone: string | null;
      address_city: string | null;
      address_country: string | null;
    } | null;

    return {
      displayName: row.display_name,
      slug: row.slug,
      plan: coercePlan(row.plan_tier),
      talentLimit: row.talent_seat_limit,
      talentCount: rosterCountRes.count ?? 0,
      contactEmail: identity?.contact_email ?? null,
      contactPhone: identity?.contact_phone ?? null,
      addressCity: identity?.address_city ?? null,
      addressCountry: identity?.address_country ?? null,
      preferredCurrency: row.preferred_currency ?? null,
      registeredAt: row.created_at ?? null,
    };
  } catch (err) {
    logServerError("workspace.loadAgencySummary", err);
    return null;
  }
}

// ─── Custom domain summary ───────────────────────────────────────────────────

export type WorkspaceDomainSummary = {
  primaryHost: string | null;
  primaryHostKind: "subdomain" | "custom" | null;
  primaryHostStatus:
    | "pending"
    | "dns_verification_sent"
    | "verified"
    | "ssl_provisioned"
    | "active"
    | "failed"
    | "suspended"
    | null;
  subdomainHost: string | null;
  customDomainHost: string | null;
  customDomainStatus:
    | "pending"
    | "dns_verification_sent"
    | "verified"
    | "ssl_provisioned"
    | "active"
    | "failed"
    | "suspended"
    | null;
  customDomainVerifiedAt: string | null;
  verificationToken: string | null;
  failureReason: string | null;
  customDomains: {
    hostname: string;
    isPrimary: boolean;
    status:
      | "pending"
      | "dns_verification_sent"
      | "verified"
      | "ssl_provisioned"
      | "active"
      | "failed"
      | "suspended";
    verificationToken: string | null;
    verifiedAt: string | null;
    failureReason: string | null;
  }[];
  subdomains: {
    hostname: string;
    isPrimary: boolean;
    status:
      | "pending"
      | "dns_verification_sent"
      | "verified"
      | "ssl_provisioned"
      | "active"
      | "failed"
      | "suspended";
  }[];
};

/**
 * Load current branded host + custom-domain state for workspace settings.
 * Returns null hosts when the domain registry is unavailable or no rows exist.
 */
export async function loadWorkspaceDomainSummary(
  tenantId: string,
): Promise<WorkspaceDomainSummary> {
  const empty: WorkspaceDomainSummary = {
    primaryHost: null,
    primaryHostKind: null,
    primaryHostStatus: null,
    subdomainHost: null,
    customDomainHost: null,
    customDomainStatus: null,
    customDomainVerifiedAt: null,
    verificationToken: null,
    failureReason: null,
    customDomains: [],
    subdomains: [],
  };

  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return empty;

    const { data, error } = await supabase
      .from("agency_domains")
      .select("hostname, kind, is_primary, status, verification_token, verified_at, failure_reason, updated_at")
      .eq("tenant_id", tenantId)
      .order("updated_at", { ascending: false });

    if (error) {
      logServerError("workspace.loadDomainSummary", error);
      return empty;
    }

    const rows = (data ?? []) as {
      hostname: string;
      kind: "subdomain" | "custom";
      is_primary: boolean;
      status:
        | "pending"
        | "dns_verification_sent"
        | "verified"
        | "ssl_provisioned"
        | "active"
        | "failed"
        | "suspended";
      verification_token: string | null;
      verified_at: string | null;
      failure_reason: string | null;
      updated_at: string;
    }[];

    const subdomains = rows.filter((row) => row.kind === "subdomain");
    const customs = rows.filter((row) => row.kind === "custom");

    const preferredSubdomain =
      subdomains.find((row) => row.is_primary)
      ?? subdomains.find((row) => row.hostname.endsWith(".tulala.digital"))
      ?? subdomains.find((row) => row.hostname.endsWith(".lvh.me"))
      ?? subdomains.find((row) => row.hostname.endsWith(".studiobooking.io"))
      ?? subdomains[0]
      ?? null;

    const custom =
      customs.find((row) => row.is_primary)
      ?? customs[0]
      ?? null;
    const primary =
      rows.find((row) => row.is_primary)
      ?? custom
      ?? preferredSubdomain
      ?? null;

    return {
      primaryHost: primary?.hostname ?? null,
      primaryHostKind: primary?.kind ?? null,
      primaryHostStatus: primary?.status ?? null,
      subdomainHost: preferredSubdomain?.hostname ?? null,
      customDomainHost: custom?.hostname ?? null,
      customDomainStatus: custom?.status ?? null,
      customDomainVerifiedAt: custom?.verified_at ?? null,
      verificationToken: custom?.verification_token ?? null,
      failureReason: custom?.failure_reason ?? null,
      customDomains: customs.map((row) => ({
        hostname: row.hostname,
        isPrimary: row.is_primary,
        status: row.status,
        verificationToken: row.verification_token,
        verifiedAt: row.verified_at,
        failureReason: row.failure_reason,
      })),
      subdomains: subdomains.map((row) => ({
        hostname: row.hostname,
        isPrimary: row.is_primary,
        status: row.status,
      })),
    };
  } catch (err) {
    logServerError("workspace.loadDomainSummary", err);
    return empty;
  }
}

// ─── Team members ─────────────────────────────────────────────────────────────

export type WorkspaceTeamMember = {
  /** profile_id from agency_memberships */
  id: string;
  name: string;
  /** Member headshot URL from `profiles.avatar_url`, when it is an http(s)
   *  URL. Shown on the identity card; falls back to an initial avatar. */
  photoUrl?: string;
  /** Account email from `auth.users.email` (fetched via service-role
   *  `auth.admin.getUserById` since `public.profiles` carries no email).
   *  Shown as the secondary line on the identity card. Best-effort —
   *  optional. */
  email?: string;
  /** Membership role: viewer | editor | manager | admin | owner */
  role: string;
  /** Membership status: active | pending_acceptance */
  status: string;
  /** ISO timestamp when the membership was accepted or created */
  joinedAt: string | null;
};

/**
 * Load active + pending team members for a workspace.
 * Ordered by role rank desc (owner first), then by join date asc.
 *
 * Returns [] on error. Never falls back to mock data.
 */
export async function loadWorkspaceTeamMembers(
  tenantId: string,
): Promise<WorkspaceTeamMember[]> {
  try {
    const supabase = await createSupabaseServerClient();
    if (!supabase) return [];

    const { data, error } = await supabase
      .from("agency_memberships")
      .select(
        "profile_id, role, status, accepted_at, created_at, profiles:profile_id(display_name, avatar_url)",
      )
      .eq("tenant_id", tenantId)
      .in("status", ["active", "pending_acceptance"])
      .order("created_at", { ascending: true });

    if (error) {
      logServerError("workspace.loadTeamMembers", error);
      return [];
    }

    type MemberRow = {
      profile_id: string;
      role: string;
      status: string;
      accepted_at: string | null;
      created_at: string;
      profiles:
        | { display_name: string | null; avatar_url: string | null }
        | { display_name: string | null; avatar_url: string | null }[]
        | null;
    };

    const ROLE_RANK: Record<string, number> = {
      owner: 4,
      admin: 3,
      manager: 2,
      editor: 1,
      viewer: 0,
    };

    const rows = (data ?? []) as unknown as MemberRow[];

    // Member emails live on `auth.users`, not `public.profiles` — so fetch
    // them via service-role `auth.admin.getUserById` in parallel. Best-
    // effort: a failure leaves emails blank but member rows still render.
    const emailById = new Map<string, string>();
    const admin = createServiceRoleClient();
    if (admin && rows.length > 0) {
      try {
        const lookups = await Promise.all(
          rows.map((r) => admin.auth.admin.getUserById(r.profile_id)),
        );
        for (let i = 0; i < lookups.length; i++) {
          const user = lookups[i]?.data?.user;
          const email = user?.email?.trim();
          if (email) emailById.set(rows[i]!.profile_id, email);
        }
      } catch (err) {
        logServerError("workspace.loadTeamMembers.emails", err);
      }
    }

    const out: WorkspaceTeamMember[] = rows.map((row) => {
      const profileJoin = row.profiles;
      const profile = Array.isArray(profileJoin) ? profileJoin[0] : profileJoin;
      const name = profile?.display_name?.trim() || row.profile_id.slice(0, 8);
      const avatar = profile?.avatar_url?.trim();
      return {
        id: row.profile_id,
        name,
        // Only http(s) avatars render as <img>; storage-path avatars are
        // skipped so the card falls back to an initial avatar cleanly.
        photoUrl: avatar && /^https?:\/\//i.test(avatar) ? avatar : undefined,
        email: emailById.get(row.profile_id),
        role: row.role,
        status: row.status,
        joinedAt: row.accepted_at ?? row.created_at,
      };
    });

    // Sort: higher rank first, then by joinedAt asc
    out.sort((a, b) => {
      const ra = ROLE_RANK[a.role] ?? -1;
      const rb = ROLE_RANK[b.role] ?? -1;
      if (ra !== rb) return rb - ra;
      return new Date(a.joinedAt ?? 0).getTime() - new Date(b.joinedAt ?? 0).getTime();
    });

    return out;
  } catch (err) {
    logServerError("workspace.loadTeamMembers", err);
    return [];
  }
}
