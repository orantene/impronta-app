/**
 * stripe-health.ts — "is our Stripe wiring actually correct?" in one read.
 *
 * WHY THIS EXISTS: on 2026-08-27 answering that question took a whole session of
 * cross-referencing the Stripe dashboard, the Vercel env list and the database
 * by hand. The facts that mattered were all knowable from the API — which
 * account the key talks to, whether every tier's price exists ON that account,
 * whether the webhook endpoints belong to it, and whether the Connect account
 * IDs we stored are reachable under it. A stale key silently pointing at an old
 * account looks EXACTLY like a healthy one until a customer tries to pay.
 *
 * Every check is read-only and fails soft: a check that cannot run reports
 * "unknown" rather than throwing, so one dead endpoint never blanks the panel.
 */

import "server-only";
import { cache } from "react";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import { logServerError } from "@/lib/server/safe-error";
import { loadStripeAccountInfo } from "./stripe-account-info";

export type HealthStatus = "ok" | "warn" | "fail" | "unknown";

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthStatus;
  /** One plain-language line. No jargon — this panel is read under pressure. */
  detail: string;
  /** Optional per-item breakdown (tiers, endpoints, connected accounts). */
  items?: { name: string; status: HealthStatus; detail: string }[];
};

export type StripeHealth = {
  checks: HealthCheck[];
  fetchedAt: string;
};

const STRIPE_API = "https://api.stripe.com/v1";

async function stripeGet<T>(
  path: string,
  key: string,
): Promise<{ ok: true; data: T } | { ok: false; status: number; message: string }> {
  try {
    const res = await fetch(`${STRIPE_API}${path}`, {
      headers: { Authorization: `Bearer ${key}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { error?: { message?: string } }
        | null;
      return {
        ok: false,
        status: res.status,
        message: body?.error?.message ?? `HTTP ${res.status}`,
      };
    }
    return { ok: true, data: (await res.json()) as T };
  } catch (err) {
    logServerError("stripe-health.get", err);
    return {
      ok: false,
      status: 0,
      message: err instanceof Error ? err.message : "request failed",
    };
  }
}

/** Which account is the live key actually talking to? */
async function checkAccount(): Promise<HealthCheck> {
  const info = await loadStripeAccountInfo();
  if (!info.ok) {
    return {
      id: "account",
      label: "Stripe account",
      status: "fail",
      detail:
        info.reason === "no-key"
          ? "STRIPE_SECRET_KEY is not set, so nothing can be charged."
          : `The key was rejected by Stripe (${info.error}).`,
    };
  }
  const name = info.displayName ?? info.businessName ?? info.accountId;
  return {
    id: "account",
    label: "Stripe account",
    status: info.testMode ? "warn" : info.chargesEnabled ? "ok" : "warn",
    detail: info.testMode
      ? `Connected to "${name}" in TEST mode — no real money can move.`
      : info.chargesEnabled
        ? `Connected to "${name}" (${info.accountId}). Charges enabled.`
        : `Connected to "${name}", but charges are NOT enabled on this account.`,
  };
}

type StripePrice = { id: string; active: boolean; unit_amount: number | null };

/**
 * Every active tier must resolve to a price that exists ON THIS ACCOUNT. A
 * price ID from a different account 404s here — which is precisely the failure
 * that a stale key produces, and the one nothing else surfaces until checkout.
 */
async function checkPrices(key: string): Promise<HealthCheck> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      id: "prices",
      label: "Tier prices",
      status: "unknown",
      detail: "Could not read the pricing catalog.",
    };
  }
  const { data, error } = await supabase
    .from("product_prices")
    .select("stripe_price_id, interval, unit_amount, product_tiers!inner(slug, is_active)")
    .eq("currency", "USD")
    .eq("is_active", true)
    .is("archived_at", null)
    .is("valid_from", null)
    .is("valid_until", null);

  if (error || !data) {
    return {
      id: "prices",
      label: "Tier prices",
      status: "unknown",
      detail: "Could not read the pricing catalog.",
    };
  }

  const rows = data as unknown as {
    stripe_price_id: string | null;
    interval: string;
    unit_amount: number;
    product_tiers: { slug: string; is_active: boolean };
  }[];
  const live = rows.filter((r) => r.product_tiers?.is_active);

  const items = await Promise.all(
    live.map(async (row) => {
      const name = `${row.product_tiers.slug} ${row.interval}ly`;
      if (!row.stripe_price_id) {
        return {
          name,
          status: "fail" as HealthStatus,
          detail: "No Stripe price ID recorded — sync this tier.",
        };
      }
      const res = await stripeGet<StripePrice>(`/prices/${row.stripe_price_id}`, key);
      if (!res.ok) {
        return {
          name,
          status: "fail" as HealthStatus,
          detail:
            res.status === 404
              ? "This price does not exist on the connected account (wrong account?)."
              : res.message,
        };
      }
      if (!res.data.active) {
        return { name, status: "warn" as HealthStatus, detail: "Price is archived in Stripe." };
      }
      if (res.data.unit_amount !== row.unit_amount) {
        return {
          name,
          status: "warn" as HealthStatus,
          detail: `Catalog says ${row.unit_amount}, Stripe says ${res.data.unit_amount}.`,
        };
      }
      return { name, status: "ok" as HealthStatus, detail: `$${(row.unit_amount / 100).toFixed(0)}` };
    }),
  );

  const bad = items.filter((i) => i.status === "fail").length;
  const warn = items.filter((i) => i.status === "warn").length;
  return {
    id: "prices",
    label: "Tier prices",
    status: bad > 0 ? "fail" : warn > 0 ? "warn" : items.length === 0 ? "warn" : "ok",
    detail:
      items.length === 0
        ? "No active tiers have a USD price."
        : bad > 0
          ? `${bad} of ${items.length} prices cannot be charged.`
          : warn > 0
            ? `${items.length} prices found, ${warn} need attention.`
            : `All ${items.length} prices are live and match the catalog.`,
    items,
  };
}

type WebhookEndpoint = { url: string; status: string; enabled_events: string[] };

/** Webhooks are what turn a payment into an activated plan. */
async function checkWebhooks(key: string): Promise<HealthCheck> {
  const res = await stripeGet<{ data: WebhookEndpoint[] }>("/webhook_endpoints?limit=20", key);
  if (!res.ok) {
    return {
      id: "webhooks",
      label: "Webhooks",
      status: "unknown",
      detail: `Could not list webhook endpoints (${res.message}).`,
    };
  }
  const endpoints = res.data.data ?? [];
  const enabled = endpoints.filter((e) => e.status === "enabled");
  return {
    id: "webhooks",
    label: "Webhooks",
    status: enabled.length === 0 ? "fail" : "ok",
    detail:
      enabled.length === 0
        ? "No enabled webhook endpoint on this account — payments would never activate a plan."
        : `${enabled.length} enabled endpoint${enabled.length === 1 ? "" : "s"} on this account.`,
    items: endpoints.map((e) => ({
      name: e.url,
      status: e.status === "enabled" ? ("ok" as HealthStatus) : ("warn" as HealthStatus),
      detail: `${e.status} · ${e.enabled_events.length} events`,
    })),
  };
}

/**
 * Connect accounts are stored per agency/talent. They belong to ONE platform
 * account and cannot move between them, so after a key change some may become
 * unreachable — the exact thing that has to be checked before switching.
 */
async function checkConnect(key: string): Promise<HealthCheck> {
  const supabase = createServiceRoleClient();
  if (!supabase) {
    return {
      id: "connect",
      label: "Connect accounts",
      status: "unknown",
      detail: "Could not read stored Connect accounts.",
    };
  }
  const [agencies, talent] = await Promise.all([
    supabase.from("agencies").select("slug, stripe_account_id").not("stripe_account_id", "is", null),
    supabase
      .from("talent_profiles")
      .select("profile_code, stripe_account_id")
      .not("stripe_account_id", "is", null),
  ]);

  const stored: { name: string; id: string }[] = [
    ...((agencies.data ?? []) as { slug: string; stripe_account_id: string }[]).map((a) => ({
      name: a.slug,
      id: a.stripe_account_id,
    })),
    ...((talent.data ?? []) as { profile_code: string; stripe_account_id: string }[]).map((t) => ({
      name: t.profile_code,
      id: t.stripe_account_id,
    })),
  ];

  if (stored.length === 0) {
    return {
      id: "connect",
      label: "Connect accounts",
      status: "ok",
      detail: "No Connect accounts stored yet.",
    };
  }

  const items = await Promise.all(
    stored.map(async (row) => {
      const res = await stripeGet<{ id: string; charges_enabled: boolean }>(
        `/accounts/${row.id}`,
        key,
      );
      if (!res.ok) {
        return {
          name: row.name,
          status: "fail" as HealthStatus,
          detail:
            res.status === 404
              ? "Not on this platform account — this seller cannot be paid."
              : res.message,
        };
      }
      return {
        name: row.name,
        status: res.data.charges_enabled ? ("ok" as HealthStatus) : ("warn" as HealthStatus),
        detail: res.data.charges_enabled ? "reachable, charges enabled" : "reachable, charges off",
      };
    }),
  );

  const unreachable = items.filter((i) => i.status === "fail").length;
  return {
    id: "connect",
    label: "Connect accounts",
    status: unreachable > 0 ? "warn" : "ok",
    detail:
      unreachable > 0
        ? `${unreachable} of ${items.length} stored accounts are NOT on this platform account.`
        : `All ${items.length} stored accounts are reachable.`,
    items,
  };
}

/** Runs every check in parallel. Never throws. */
export const loadStripeHealth = cache(async (): Promise<StripeHealth> => {
  const fetchedAt = new Date().toISOString();
  const key = process.env.STRIPE_SECRET_KEY;
  const account = await checkAccount();

  if (!key) {
    return {
      fetchedAt,
      checks: [
        account,
        { id: "prices", label: "Tier prices", status: "unknown", detail: "No Stripe key." },
        { id: "webhooks", label: "Webhooks", status: "unknown", detail: "No Stripe key." },
        { id: "connect", label: "Connect accounts", status: "unknown", detail: "No Stripe key." },
      ],
    };
  }

  const [prices, webhooks, connect] = await Promise.all([
    checkPrices(key),
    checkWebhooks(key),
    checkConnect(key),
  ]);
  return { fetchedAt, checks: [account, prices, webhooks, connect] };
});
