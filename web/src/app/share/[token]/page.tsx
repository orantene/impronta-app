/**
 * Phase 9 — public share-link viewer.
 *
 * Token-gated, no-auth view of a frozen page revision. Operators mint these
 * from the topbar Share button: the JWT carries `tid`, `pid`, `rev`, `iat`,
 * `exp`, plus an optional human label. This route verifies the token, loads
 * the matching `cms_page_revisions` row via the service-role client, and
 * renders the snapshot through the same dispatcher that drives the published
 * storefront.
 *
 * TWO SNAPSHOT SHAPES, because the platform has two page engines and a share
 * link can now point at either (it used to always be the homepage):
 *
 *   - slot-composed (homepage, legacy cms pages): `snapshot.slots` →
 *     `HomepageCmsSections`, one mount per slot entry in sortOrder.
 *   - freeform cms pages: `snapshot.builderTree` (the shared REV-1 key) →
 *     `renderFreeformPageRootTree`, the same helper `/p/<slug>` uses. Bare
 *     `renderBuilderNodes` is NOT interchangeable here: it renders root
 *     `section` nodes as null, which would show an empty page for every
 *     AI-generated or section-rooted page.
 *
 * A snapshot matching neither shape falls through to the "empty" error rather
 * than rendering a blank page with live chrome around it.
 *
 * Tenant scoping defence-in-depth:
 *   1. Middleware resolves the host to a tenant via `agency_domains`
 *      and asserts it matches the JWT's `tid` claim — a token signed
 *      for tenant A cannot be opened on tenant B's host.
 *   2. The service-role read is scoped to `tenant_id = claims.tid AND
 *      page_id = claims.pid AND id = claims.rev` — three matching
 *      filters, all from the signed claim, mean a forged claim must
 *      forge the signature too.
 *   3. The shared snapshot is `noindex` and never renders the agency
 *      header / footer / search bar — it's a section-list viewer, not
 *      a fully impersonated storefront.
 *
 * Why service-role on a public route: the visitor is unauthenticated
 * and `cms_page_revisions` RLS is staff-only. The token IS the auth
 * boundary for sharing — once verified, we trust its claims.
 */

import type { Metadata } from "next";
import Link from "next/link";

import { getPublicHostContext, getPublicPathPrefix } from "@/lib/saas/scope";
import { createServiceRoleClient } from "@/lib/supabase/admin";
import {
  loadPublicComponentStyleDefaults,
  loadPublicIdentity,
} from "@/lib/site-admin/server/reads";
import { verifyShareJwt } from "@/lib/site-admin/share-link/jwt";
import type { HomepageSnapshot } from "@/lib/site-admin/server/homepage";
import { HomepageCmsSections } from "@/components/home/homepage-cms-sections";
import { parseBuilderTreeFromSnapshot } from "@/lib/site-admin/edit-mode/composition-revision-snapshot";
import { renderFreeformPageRootTree } from "@/lib/site-admin/builder-node/freeform-page-blocks";
import {
  BuilderNodeFontLinks,
  BuilderNodeRendererStyles,
  collectPresentNodeKinds,
} from "@/lib/site-admin/builder-node/render";
import { makeSectionEmbedRenderer } from "@/lib/site-admin/builder-node/section-embed-renderer";

export const dynamic = "force-dynamic";

interface SharePageParams {
  params: Promise<{ token: string }>;
}

// Always noindex — share links are meant for invited recipients, not search.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
  title: "Shared draft preview",
};

export default async function ShareTokenPage({ params }: SharePageParams) {
  const { token } = await params;
  const verified = verifyShareJwt(token);

  if (!verified.ok) {
    return <ShareError reason={verified.reason} />;
  }
  const { claims } = verified;

  // Cross-check: the host this request landed on must match the tenant
  // the token was signed for. A leaked token replayed against the wrong
  // host is rejected here even if the JWT itself is valid.
  const ctx = await getPublicHostContext();
  if (
    (ctx.kind === "agency" || ctx.kind === "hub") &&
    ctx.tenantId !== claims.tenantId
  ) {
    return <ShareError reason="tenant_mismatch" />;
  }

  const supabase = createServiceRoleClient();
  if (!supabase) {
    return <ShareError reason="config" />;
  }

  // Load the revision row. All three filters come from the signed claim;
  // the row is the snapshot at issue time and never mutates.
  const { data: revRow, error: revErr } = await supabase
    .from("cms_page_revisions")
    .select("id, snapshot, kind, version, created_at")
    .eq("tenant_id", claims.tenantId)
    .eq("page_id", claims.pageId)
    .eq("id", claims.revisionId)
    .maybeSingle();

  if (revErr || !revRow) {
    return <ShareError reason="not_found" />;
  }

  const rawSnapshot = revRow.snapshot as unknown;
  const slotSnapshot = (rawSnapshot ?? null) as HomepageSnapshot | null;
  const hasSlots = Boolean(slotSnapshot?.slots);
  // REV-1 shares the `builderTree` key across every freeform surface, so this
  // one parse covers freeform cms pages and any future freeform snapshot.
  const builderTree = hasSlots
    ? undefined
    : parseBuilderTreeFromSnapshot(rawSnapshot);

  if (!hasSlots && !builderTree) {
    return <ShareError reason="empty" />;
  }

  // Pull tenant identity for the brand label in the share footer. Best-effort:
  // a missing identity row falls back to a neutral brand label.
  const identity = await loadPublicIdentity(claims.tenantId);
  const brandLabel = identity?.public_name?.trim() || "this draft";

  // The freeform snapshot carries no locale, so read it off the page row the
  // token is bound to. Tenant-scoped like every other read on this route.
  const { data: pageRow } = await supabase
    .from("cms_pages")
    .select("locale")
    .eq("id", claims.pageId)
    .eq("tenant_id", claims.tenantId)
    .maybeSingle<{ locale: string }>();
  const locale = slotSnapshot?.locale ?? pageRow?.locale ?? "en";

  const body = builderTree ? (
    <FreeformShareBody
      tree={builderTree}
      tenantId={claims.tenantId}
      locale={locale}
    />
  ) : (
    <SlotShareBody
      snapshot={slotSnapshot as HomepageSnapshot}
      tenantId={claims.tenantId}
      locale={locale}
    />
  );

  return (
    <div className="flex min-h-screen flex-col bg-background">
      <ShareBanner
        label={claims.label ?? null}
        expiresAt={claims.expiresAt}
        brandLabel={brandLabel}
        revisionKind={revRow.kind as "draft" | "published" | "rollback"}
      />
      <main className="flex flex-1 flex-col">{body}</main>
      <ShareFooter
        brandLabel={brandLabel}
        expiresAt={claims.expiresAt}
        issuedAt={claims.issuedAt}
      />
    </div>
  );
}

// ── bodies ─────────────────────────────────────────────────────────────────

/** Slot-composed revision (homepage + legacy cms pages). Unchanged behaviour. */
function SlotShareBody({
  snapshot,
  tenantId,
  locale,
}: {
  snapshot: HomepageSnapshot;
  tenantId: string;
  locale: string;
}) {
  const sortedSlots = [...(snapshot.slots ?? [])].sort(
    (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0),
  );
  if (sortedSlots.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center px-6 py-24">
        <p className="text-sm text-zinc-500">
          This revision has no published sections.
        </p>
      </div>
    );
  }
  return (
    <>
      {sortedSlots.map((entry) => (
        <HomepageCmsSections
          key={`share-slot-${entry.slotKey}-${entry.sectionId}-${entry.sortOrder}`}
          snapshot={snapshot}
          onlySectionId={entry.sectionId}
          tenantId={tenantId}
          locale={locale}
        />
      ))}
    </>
  );
}

/**
 * Freeform revision (`cms_pages.blocks` tree). Composed exactly like the
 * public `/p/<slug>` render: renderer styles + font links emitted once at this
 * level, `renderFreeformPageRootTree` (not bare `renderBuilderNodes`) for the
 * tree, and the section-embed renderer so embedded sections paint instead of
 * collapsing to nothing.
 */
async function FreeformShareBody({
  tree,
  tenantId,
  locale,
}: {
  tree: NonNullable<ReturnType<typeof parseBuilderTreeFromSnapshot>>;
  tenantId: string;
  locale: string;
}) {
  const publicPathPrefix = await getPublicPathPrefix();
  const componentStyleDefaults = await loadPublicComponentStyleDefaults(tenantId);
  return (
    <>
      <BuilderNodeRendererStyles kinds={collectPresentNodeKinds(tree)} />
      <BuilderNodeFontLinks nodes={tree} />
      <div className="w-full flex-1" data-theme-canvas-root="">
        {renderFreeformPageRootTree(tree, {
          publicPathPrefix,
          mode: "freeform",
          includeRendererStyles: false,
          componentStyleDefaults,
          renderSectionEmbed: makeSectionEmbedRenderer({
            tenantId,
            locale,
            publicPathPrefix,
            previewSubject: { kind: "workspace", id: tenantId },
          }),
        })}
      </div>
    </>
  );
}

// ── chrome ─────────────────────────────────────────────────────────────────

function ShareBanner({
  label,
  expiresAt,
  brandLabel,
  revisionKind,
}: {
  label: string | null;
  expiresAt: Date;
  brandLabel: string;
  revisionKind: "draft" | "published" | "rollback";
}) {
  const expiry = expiresAt.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const kindCopy =
    revisionKind === "published"
      ? "Published version"
      : revisionKind === "rollback"
        ? "Rollback"
        : "Draft";
  return (
    <div
      role="status"
      className="sticky top-0 z-[60] flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white/95 px-4 py-2.5 text-[12px] backdrop-blur sm:px-6"
      style={{ backdropFilter: "blur(12px) saturate(160%)" }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className="inline-flex size-5 items-center justify-center rounded-full bg-zinc-900 text-white"
        >
          <svg
            width="11"
            height="11"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
          >
            <circle cx="18" cy="5" r="3" />
            <circle cx="6" cy="12" r="3" />
            <circle cx="18" cy="19" r="3" />
            <line x1="8.6" y1="13.5" x2="15.4" y2="17.5" />
            <line x1="15.4" y1="6.5" x2="8.6" y2="10.5" />
          </svg>
        </span>
        <span className="truncate font-semibold text-zinc-900">
          {kindCopy} preview
          {label ? <span className="text-zinc-500"> · {label}</span> : null}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-2 text-zinc-500">
        <span>From {brandLabel}</span>
        <span aria-hidden>·</span>
        <span>Expires {expiry}</span>
      </div>
    </div>
  );
}

function ShareFooter({
  brandLabel,
  expiresAt,
  issuedAt,
}: {
  brandLabel: string;
  expiresAt: Date;
  issuedAt: Date;
}) {
  return (
    <footer className="border-t border-zinc-200 bg-white px-6 py-8 text-center text-[11px] text-zinc-500">
      <p>
        Shared preview from {brandLabel}. Issued{" "}
        {issuedAt.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        })}
        , expires{" "}
        {expiresAt.toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
          year: "numeric",
        })}
        .
      </p>
      <p className="mt-1">
        This is a draft snapshot; the live site may differ.
      </p>
    </footer>
  );
}

function ShareError({ reason }: { reason: string }) {
  const copy = (() => {
    switch (reason) {
      case "expired":
        return {
          title: "This share link has expired.",
          body: "Ask whoever shared it for an updated link.",
        };
      case "bad_signature":
      case "bad_issuer":
      case "malformed":
        return {
          title: "This share link isn't valid.",
          body: "The link may have been mistyped or tampered with.",
        };
      case "tenant_mismatch":
        return {
          title: "This share link belongs to a different site.",
          body: "Open it on the same workspace it was created from.",
        };
      case "not_found":
        return {
          title: "This shared revision is no longer available.",
          body: "It may have been removed by an administrator.",
        };
      case "empty":
        return {
          title: "Nothing to show.",
          body: "This revision has no published sections.",
        };
      default:
        return {
          title: "Something went wrong opening this share link.",
          body: "Try again, or ask the sender for a fresh link.",
        };
    }
  })();
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6">
      <div className="max-w-md rounded-xl border border-zinc-200 bg-white px-8 py-10 text-center shadow-sm">
        <h1 className="text-base font-semibold text-zinc-900">{copy.title}</h1>
        <p className="mt-2 text-sm text-zinc-600">{copy.body}</p>
        <Link
          href="/"
          className="mt-6 inline-flex items-center gap-1.5 rounded-full border border-zinc-200 bg-white px-4 py-2 text-xs font-semibold text-zinc-900 transition hover:border-zinc-400"
        >
          Go to homepage
        </Link>
      </div>
    </div>
  );
}
