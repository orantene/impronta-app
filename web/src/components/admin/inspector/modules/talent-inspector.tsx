"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { InspectorContext } from "@/lib/admin/admin-inspector/types";
import { isUuidPathSegment, pathSegments } from "@/lib/admin/admin-inspector/context";
import { Button } from "@/components/ui/button";

type TalentInspectorPayload = {
  id: string;
  profile_code: string;
  display_name: string | null;
  workflow_status: string;
  visibility: string;
  is_featured: boolean;
  profile_completeness_score: number | null;
  deleted_at: string | null;
  pending_media_count: number;
  warnings: string[];
};

function useTalentInspectorPayload(id: string | null) {
  const [data, setData] = useState<TalentInspectorPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    void fetch(`/api/admin/inspector/talent?id=${encodeURIComponent(id)}`)
      .then(async (r) => {
        const j = (await r.json()) as TalentInspectorPayload & { error?: string };
        if (!r.ok) throw new Error(j.error ?? `HTTP ${r.status}`);
        return j;
      })
      .then((j) => {
        if (!cancelled) setData(j);
      })
      .catch((e: Error) => {
        if (!cancelled) setErr(e.message);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return { data, err };
}

function isTalentList(ctx: InspectorContext) {
  return ctx.pathname === "/admin/talent";
}

function isTalentDetail(ctx: InspectorContext) {
  const s = pathSegments(ctx.pathname);
  return s.length === 3 && s[0] === "admin" && s[1] === "talent" && isUuidPathSegment(s[2]!);
}

function talentDetailId(ctx: InspectorContext): string | null {
  const s = pathSegments(ctx.pathname);
  if (!isTalentDetail(ctx) || !s[2]) return null;
  return s[2]!;
}

const STATUS_LABEL: Record<string, string> = {
  all: "All profiles",
  draft: "Draft",
  under_review: "Pending review",
  approved: "Approved",
  featured: "Featured",
  hidden: "Hidden / not visible",
  archived: "Archived",
  deleted: "Removed",
};

export function TalentListScopeModule({ ctx }: { ctx: InspectorContext }) {
  if (!isTalentList(ctx)) return null;
  const sp = ctx.searchParams;
  const status = sp.get("status") ?? "all";
  const media = sp.get("media");
  const sort = sp.get("sort") ?? "newest";
  const page = sp.get("page");
  const q = sp.get("q")?.trim();

  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-[var(--admin-nav-idle)]">
      <li>
        Tab: <span className="text-[var(--admin-workspace-fg)]">{STATUS_LABEL[status] ?? status}</span>
      </li>
      {media === "pending" ? (
        <li>Media tab: pending approvals only (talent with uploads awaiting review).</li>
      ) : (
        <li>Media tab: all uploads context.</li>
      )}
      <li>
        Sort: <span className="text-[var(--admin-workspace-fg)]">{sort.replace(/_/g, " ")}</span>
        {sort === "completion" ? " — surfaces profiles with lower completeness first." : null}
      </li>
      {page && page !== "1" ? <li>Page {page} of the list.</li> : null}
      {q ? <li>Search active for “{q}”.</li> : null}
    </ul>
  );
}

export function TalentListVisibilityModule({ ctx }: { ctx: InspectorContext }) {
  if (!isTalentList(ctx)) return null;
  const status = ctx.searchParams.get("status") ?? "all";
  return (
    <p className="text-xs leading-relaxed text-[var(--admin-nav-idle)]">
      {status === "hidden"
        ? "Hidden tab includes profiles with visibility hidden or workflow hidden — they stay out of client-facing surfaces."
        : status === "featured"
          ? "Featured tab is curated spotlighting; confirm contracts before leaving talent featured."
          : "Use the Hidden tab to audit profiles that should not appear in the directory or client picks."}
    </p>
  );
}

export function TalentListMediaModule({ ctx }: { ctx: InspectorContext }) {
  if (!isTalentList(ctx)) return null;
  const pending = ctx.searchParams.get("media") === "pending";
  return (
    <p className="text-xs text-[var(--admin-nav-idle)]">
      {pending
        ? "Queue is restricted to talent with at least one asset in pending approval. Open a row to approve or reject from the media cockpit."
        : "Switch to Pending media to focus the queue on approvals."}
    </p>
  );
}

export function TalentListWarningsModule({ ctx }: { ctx: InspectorContext }) {
  if (!isTalentList(ctx)) return null;
  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-[var(--admin-nav-idle)]">
      <li>Sort by Completion to find bios, locations, or taxonomy gaps before go-live.</li>
      <li>Draft and pending profiles may be missing public-facing copy — verify before client presentation.</li>
    </ul>
  );
}

export function TalentDetailContextModule({ ctx }: { ctx: InspectorContext }) {
  const id = talentDetailId(ctx);
  const { data, err } = useTalentInspectorPayload(isTalentDetail(ctx) ? id : null);

  if (!isTalentDetail(ctx) || !id) return null;
  if (err) return <p className="text-xs text-destructive">{err}</p>;
  if (!data) return <p className="text-xs text-[var(--admin-nav-idle)]">Loading profile…</p>;

  const score =
    data.profile_completeness_score != null ? String(data.profile_completeness_score) : "—";

  return (
    <div className="space-y-3 text-xs">
      <div>
        <p className="font-medium text-[var(--admin-workspace-fg)]">
          {data.display_name ?? data.profile_code}{" "}
          <span className="font-mono text-[var(--admin-nav-idle)]">({data.profile_code})</span>
        </p>
        <p className="mt-1 text-[var(--admin-nav-idle)]">
          Completeness score:{" "}
          <span className="font-mono text-[var(--admin-workspace-fg)]">{score}</span>
        </p>
      </div>
      <dl className="grid gap-2 text-[var(--admin-nav-idle)]">
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Workflow</dt>
          <dd className="capitalize">{data.workflow_status.replace(/_/g, " ")}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Visibility</dt>
          <dd className="capitalize">{data.visibility}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Featured</dt>
          <dd>{data.is_featured ? "Yes" : "No"}</dd>
        </div>
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-[var(--admin-gold-muted)]">Pending media</dt>
          <dd>{data.pending_media_count} asset(s)</dd>
        </div>
      </dl>
    </div>
  );
}

export function TalentDetailGapsModule({ ctx }: { ctx: InspectorContext }) {
  const id = talentDetailId(ctx);
  const { data, err } = useTalentInspectorPayload(isTalentDetail(ctx) ? id : null);

  if (!isTalentDetail(ctx) || !id) return null;
  if (err || !data) return null;

  if (!data.warnings.length) {
    return <p className="text-xs text-[var(--admin-nav-idle)]">No automated gaps flagged for this profile.</p>;
  }

  return (
    <ul className="list-inside list-disc space-y-1 text-xs text-[var(--admin-nav-idle)]">
      {data.warnings.map((w) => (
        <li key={w}>{w}</li>
      ))}
    </ul>
  );
}

export function TalentDetailActionsModule({ ctx }: { ctx: InspectorContext }) {
  const id = talentDetailId(ctx);
  const { data, err } = useTalentInspectorPayload(isTalentDetail(ctx) ? id : null);

  if (!isTalentDetail(ctx) || !id) return null;
  if (err || !data) return null;

  return (
    <div className="flex flex-col gap-2">
      <Button asChild size="sm" variant="secondary" className="h-8 rounded-lg text-xs">
        <Link href={`/t/${data.profile_code}`} target="_blank" rel="noreferrer">
          Public preview
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href="/admin/media" scroll={false}>
          Media approvals
        </Link>
      </Button>
      <Button asChild size="sm" variant="outline" className="h-8 rounded-lg border-[var(--admin-gold-border)]/60 text-xs">
        <Link href="/admin/talent" scroll={false}>
          Back to directory
        </Link>
      </Button>
    </div>
  );
}
