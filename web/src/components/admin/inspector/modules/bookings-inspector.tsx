"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ADMIN_APANEL_PEEK } from "@/lib/admin/admin-panel-search-params";
import type { InspectorContext } from "@/lib/admin/admin-inspector/types";
import { Button } from "@/components/ui/button";
import { AdminCommercialStatusBadge } from "@/components/admin/admin-commercial-status-badge";

function isBookingsList(ctx: InspectorContext) {
  return ctx.pathname === "/admin/bookings";
}

function filterLines(ctx: InspectorContext): string[] {
  const sp = ctx.searchParams;
  const lines: string[] = [];
  const status = sp.get("status");
  if (status && status !== "all") lines.push(`Status: ${status.replace(/_/g, " ")}`);
  if (sp.get("q")?.trim()) lines.push(`Search: “${sp.get("q")!.trim()}”`);
  if (sp.get("client_account_id")) lines.push("Scoped to one client account");
  if (sp.get("client_user_id")) lines.push("Scoped to one platform client");
  if (sp.get("owner_staff_id")) lines.push("Filtered by booking owner");
  if (sp.get("updated_from") || sp.get("updated_to")) lines.push("Updated date range applied");
  return lines;
}

export function BookingsFiltersModule({ ctx }: { ctx: InspectorContext }) {
  if (!isBookingsList(ctx)) return null;
  const lines = filterLines(ctx);
  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      {lines.length ? (
        <ul className="list-inside list-disc space-y-1">
          {lines.map((l) => (
            <li key={l}>{l}</li>
          ))}
        </ul>
      ) : (
        <p>No filters beyond the default queue (all statuses, full list).</p>
      )}
    </div>
  );
}

export function BookingsEmptyHelperModule({ ctx }: { ctx: InspectorContext }) {
  if (!isBookingsList(ctx)) return null;
  const sp = ctx.searchParams;
  const hasNarrowing =
    Boolean(sp.get("q")?.trim()) ||
    Boolean(sp.get("client_account_id")) ||
    Boolean(sp.get("client_user_id")) ||
    Boolean(sp.get("owner_staff_id")) ||
    Boolean(sp.get("updated_from") || sp.get("updated_to")) ||
    (Boolean(sp.get("status")) && sp.get("status") !== "all");

  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-[var(--admin-nav-idle)]">
      {!hasNarrowing ? (
        <li>Use status tabs or filters to shrink a long queue before spot-checking margins and payment state.</li>
      ) : (
        <li>Clear filters from the bar above if the list looks empty unexpectedly.</li>
      )}
      <li>Peek rows keep you on the list; open the workspace for lineup and pricing.</li>
    </ul>
  );
}

export function BookingsQuickActionsModule({ ctx }: { ctx: InspectorContext }) {
  if (!isBookingsList(ctx)) return null;
  const sp = ctx.searchParams.toString();
  const base = sp ? `/admin/bookings?${sp}` : "/admin/bookings";
  return (
    <div className="flex flex-col gap-2">
      <Button asChild size="sm" variant="outline" className="h-8 justify-start rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href="/admin/bookings/new" scroll={false}>
          New booking
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline" className="h-8 justify-start rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href={base} scroll={false}>
          Refresh list view
        </Link>
      </Button>
    </div>
  );
}

type BookingInspectorPayload = {
  id: string;
  title: string;
  status: string;
  payment_status: string;
  starts_at: string | null;
  ends_at: string | null;
  source_inquiry_id: string | null;
  client_account_id: string | null;
  account_name: string | null;
  contact_name: string | null;
  talent_count: number;
  updated_at: string;
};

export function BookingsSelectedPeekModule({ ctx }: { ctx: InspectorContext }) {
  const [data, setData] = useState<BookingInspectorPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const active =
    isBookingsList(ctx) && ctx.apanel === ADMIN_APANEL_PEEK && Boolean(ctx.aid);

  useEffect(() => {
    if (!active || !ctx.aid) {
      setData(null);
      setErr(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setErr(null);
    void fetch(`/api/admin/inspector/booking?id=${encodeURIComponent(ctx.aid!)}`)
      .then(async (r) => {
        const j = (await r.json()) as BookingInspectorPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) {
          setData(null);
          setErr(e.message);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [active, ctx.aid]);

  if (!active) return null;

  if (loading) {
    return <p className="text-xs text-[var(--admin-nav-idle)]">Loading booking…</p>;
  }
  if (err) {
    return <p className="text-xs text-destructive">{err}</p>;
  }
  if (!data) return null;

  return (
    <div className="space-y-2 text-xs">
      <div className="flex flex-wrap items-center gap-2">
        <AdminCommercialStatusBadge kind="booking" status={data.status} />
        <span className="rounded-md border border-[var(--admin-gold-border)]/40 bg-[var(--admin-workspace-surface)] px-2 py-0.5 capitalize text-[var(--admin-nav-idle)]">
          {data.payment_status.replace(/_/g, " ")}
        </span>
      </div>
      <p className="font-medium text-[var(--admin-workspace-fg)]">{data.title}</p>
      <dl className="grid gap-1 text-[var(--admin-nav-idle)]">
        {data.account_name ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Account</dt>
            <dd>{data.account_name}</dd>
          </div>
        ) : null}
        {data.contact_name ? (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Contact</dt>
            <dd>{data.contact_name}</dd>
          </div>
        ) : null}
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Talent slots</dt>
          <dd>{data.talent_count}</dd>
        </div>
      </dl>
      <div className="flex flex-col gap-2 pt-1">
        <Button asChild size="sm" variant="secondary" className="h-8 rounded-lg text-xs">
          <Link href={`/admin/bookings/${data.id}`} scroll={false}>
            Open workspace
          </Link>
        </Button>
        {data.source_inquiry_id ? (
          <Button asChild size="sm" variant="outline" className="h-8 rounded-lg text-xs">
            <Link href={`/admin/inquiries/${data.source_inquiry_id}`} scroll={false}>
              Source inquiry
            </Link>
          </Button>
        ) : null}
      </div>
    </div>
  );
}

export function BookingsWorkspaceModule({ ctx }: { ctx: InspectorContext }) {
  const m = /^\/admin\/bookings\/([^/]+)$/.exec(ctx.pathname);
  if (!m) return null;
  const seg = m[1];
  if (seg === "new" || seg === "") return null;
  if (!/^[0-9a-f-]{36}$/i.test(seg)) return null;

  return (
    <div className="space-y-2 text-xs text-[var(--admin-nav-idle)]">
      <p>You are in a single booking workspace. Use the main canvas for lineup, pricing, and documents.</p>
      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href="/admin/bookings" scroll={false}>
          Back to queue
        </Link>
      </Button>
    </div>
  );
}
