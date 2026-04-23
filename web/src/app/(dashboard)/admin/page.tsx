import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  ExternalLink,
  Images,
  Inbox,
  Languages,
  LayoutDashboard,
  Plus,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { translationsHref } from "@/app/(dashboard)/admin/translations/translations-url";
import { AdminMetricCard } from "@/components/admin/admin-metric-card";
import {
  AdminSurfaceCard,
  AdminSurfaceCardBody,
} from "@/components/admin/admin-surface-card";
import { AdminStatusChip } from "@/components/admin/admin-status-chip";
import {
  ADMIN_HOME_SECTION_GAP,
  ADMIN_PAGE_STACK,
  ADMIN_TEXT_DISPLAY_LG,
  ADMIN_TEXT_EYEBROW,
  ADMIN_TEXT_META,
} from "@/lib/dashboard-shell-classes";
import { Button } from "@/components/ui/button";
import {
  loadAdminOverviewData,
  loadAdminTier1AlertCount,
  loadAdminTranslationHealth,
} from "@/lib/dashboard/admin-dashboard-data";
import { requireStaff } from "@/lib/server/action-guards";
import { getTenantScope } from "@/lib/saas";
import { loadPublicIdentity } from "@/lib/site-admin/server/reads";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Phase 15 / Admin shell v2 — Home as operating surface.
 *
 * Replaces the translation-health-led status board with an action-oriented
 * landing composed of:
 *   1. Greeting   — tenant + user context line
 *   2. Attention  — amber cards for things that need action now
 *   3. Metrics    — 4-card state-of-business strip
 *   4. Actions    — the 4 most common operator moves
 *   5. Your site  — builder entry point with site status
 *   6. Recent     — 5-item feed + view-all
 *   7. Signals    — translation health, collapsed by default
 *
 * Reuses existing server reads (overview, tier-1 alerts, translation
 * health, identity) — no new queries introduced.
 */
export default async function AdminHomePage() {
  const [auth, overview, tier1AlertCount, translationHealth, scope] =
    await Promise.all([
      requireStaff(),
      loadAdminOverviewData(),
      loadAdminTier1AlertCount(),
      loadAdminTranslationHealth(),
      getTenantScope().catch(() => null),
    ]);

  const identity = scope
    ? await loadPublicIdentity(scope.tenantId).catch(() => null)
    : null;

  const firstName = resolveFirstName(auth.ok ? auth.user.email ?? null : null);
  const tenantName =
    identity?.public_name?.trim() ||
    scope?.membership.display_name ||
    "your workspace";
  const primaryDomain =
    (identity as { primary_domain?: string | null } | null)?.primary_domain?.trim() ||
    null;

  const attentionItems = buildAttentionItems({
    tier1AlertCount,
    pendingTalent: overview?.counts.pendingTalent ?? 0,
    pendingMedia: overview?.counts.pendingMedia ?? 0,
    translationHealth,
  });

  const metrics = [
    {
      label: "Open inquiries",
      value: overview?.counts.openInquiries ?? 0,
      href: "/admin/inquiries",
      icon: <Inbox className="size-4" aria-hidden />,
      hint:
        tier1AlertCount > 0 ? `${tier1AlertCount} need action` : undefined,
    },
    {
      label: "Roster",
      value: overview?.counts.totalTalent ?? 0,
      href: "/admin/talent",
      icon: <Users className="size-4" aria-hidden />,
      hint:
        (overview?.counts.pendingTalent ?? 0) > 0
          ? `${overview?.counts.pendingTalent} pending review`
          : undefined,
    },
    {
      label: "Clients",
      value: overview?.counts.totalClients ?? 0,
      href: "/admin/clients",
      icon: <UserRound className="size-4" aria-hidden />,
    },
    {
      label: "Pending media",
      value: overview?.counts.pendingMedia ?? 0,
      href: "/admin/media",
      icon: <Images className="size-4" aria-hidden />,
    },
  ];

  return (
    <div className={ADMIN_PAGE_STACK}>
      {/* 1. Greeting */}
      <section className={ADMIN_HOME_SECTION_GAP}>
        <div className="space-y-1.5">
          <p className={ADMIN_TEXT_EYEBROW}>Agency workspace</p>
          <h1 className={ADMIN_TEXT_DISPLAY_LG}>
            {firstName ? `Welcome back, ${firstName}.` : "Welcome back."}
          </h1>
          <p className={ADMIN_TEXT_META}>
            <span className="text-foreground/80">{tenantName}</span>
            {primaryDomain ? (
              <>
                {" · "}
                <a
                  href={`https://${primaryDomain}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1 underline-offset-2 hover:underline"
                >
                  {primaryDomain}
                  <ExternalLink className="size-3" aria-hidden />
                </a>
              </>
            ) : null}
          </p>
        </div>
      </section>

      {/* 2. Attention strip — hides when empty */}
      {attentionItems.length > 0 ? (
        <section aria-labelledby="attention-heading" className="space-y-3">
          <h2
            id="attention-heading"
            className={cn(ADMIN_TEXT_EYEBROW, "text-rose-400/90")}
          >
            Needs attention
          </h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {attentionItems.map((item) => (
              <AdminSurfaceCard
                key={item.id}
                variant="object"
                tone="attention"
                href={item.href}
              >
                <AdminSurfaceCardBody className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <AdminStatusChip state="attention" label={item.tag} />
                    <ArrowRight className="size-4 text-rose-400/70" aria-hidden />
                  </div>
                  <p className="text-sm font-semibold leading-snug text-foreground">
                    {item.title}
                  </p>
                  {item.detail ? (
                    <p className="text-xs text-muted-foreground">{item.detail}</p>
                  ) : null}
                </AdminSurfaceCardBody>
              </AdminSurfaceCard>
            ))}
          </div>
        </section>
      ) : null}

      {/* 3. Metric strip */}
      <section aria-labelledby="metrics-heading" className="space-y-3">
        <h2 id="metrics-heading" className={ADMIN_TEXT_EYEBROW}>
          This week
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metrics.map((m) => (
            <AdminMetricCard
              key={m.label}
              label={m.label}
              value={m.value}
              href={m.href}
              icon={m.icon}
              hint={m.hint}
            />
          ))}
        </div>
      </section>

      {/* 4. Primary action row */}
      <section aria-labelledby="actions-heading" className="space-y-3">
        <h2 id="actions-heading" className={ADMIN_TEXT_EYEBROW}>
          Quick actions
        </h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <Button asChild variant="outline" className="h-11 justify-between rounded-xl">
            <Link href="/admin/inquiries?new=1">
              <span className="flex items-center gap-2">
                <Plus className="size-4" aria-hidden />
                New inquiry
              </span>
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 justify-between rounded-xl">
            <Link href="/admin/talent">
              <span className="flex items-center gap-2">
                <Users className="size-4" aria-hidden />
                Add talent
              </span>
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 justify-between rounded-xl">
            <Link href="/admin/site-settings/structure">
              <span className="flex items-center gap-2">
                <LayoutDashboard className="size-4" aria-hidden />
                Edit site
              </span>
              <ArrowRight className="size-4" aria-hidden />
            </Link>
          </Button>
          <Button asChild variant="outline" className="h-11 justify-between rounded-xl">
            <a
              href={primaryDomain ? `https://${primaryDomain}` : "/"}
              target="_blank"
              rel="noreferrer noopener"
            >
              <span className="flex items-center gap-2">
                <ExternalLink className="size-4" aria-hidden />
                Open public site
              </span>
              <ArrowRight className="size-4" aria-hidden />
            </a>
          </Button>
        </div>
      </section>

      {/* 5. Your site card */}
      <section aria-labelledby="your-site-heading" className="space-y-3">
        <h2 id="your-site-heading" className={ADMIN_TEXT_EYEBROW}>
          Your site
        </h2>
        <AdminSurfaceCard variant="action" tone="neutral">
          <AdminSurfaceCardBody className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-base font-semibold text-foreground">
                  {tenantName}
                </span>
                {primaryDomain ? (
                  <AdminStatusChip state="live" label={`Live · ${primaryDomain}`} />
                ) : (
                  <AdminStatusChip state="pending" label="Domain not set" />
                )}
              </div>
              <p className={ADMIN_TEXT_META}>
                Compose the homepage, design tokens, and sections from one
                workspace. Changes are drafts until you publish.
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button asChild variant="outline" className="rounded-xl">
                <Link href="/admin/site-settings/sections">Sections</Link>
              </Button>
              <Button asChild className="rounded-xl">
                <Link href="/admin/site-settings/structure">
                  Open composer
                  <ArrowRight className="ml-1 size-4" aria-hidden />
                </Link>
              </Button>
            </div>
          </AdminSurfaceCardBody>
        </AdminSurfaceCard>
      </section>

      {/* 6. Recent activity */}
      <section aria-labelledby="recent-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent-heading" className={ADMIN_TEXT_EYEBROW}>
            Recent activity
          </h2>
          {overview && overview.recentActivity.length > 5 ? (
            <Link
              href="/admin/inquiries"
              className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
            >
              View all
            </Link>
          ) : null}
        </div>
        {overview && overview.recentActivity.length > 0 ? (
          <ul className="space-y-2">
            {overview.recentActivity.slice(0, 5).map((item) => (
              <li key={item.id}>
                <AdminSurfaceCard variant="object" href={item.href}>
                  <AdminSurfaceCardBody className="flex flex-wrap items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">
                        {item.title}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {item.detail}
                      </p>
                      <p className="mt-1 text-[11px] text-muted-foreground/80">
                        <Calendar className="mr-1 inline size-3" aria-hidden />
                        {new Date(item.createdAt).toLocaleString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {item.type}
                      </span>
                      <AdminStatusChip
                        state={mapActivityStatus(item.status)}
                        label={item.status.replace(/_/g, " ")}
                      />
                    </div>
                  </AdminSurfaceCardBody>
                </AdminSurfaceCard>
              </li>
            ))}
          </ul>
        ) : (
          <AdminSurfaceCard variant="info">
            <AdminSurfaceCardBody>
              <p className="text-sm text-muted-foreground">
                No recent activity yet. New inquiries, talent submissions, and
                media uploads will appear here.
              </p>
            </AdminSurfaceCardBody>
          </AdminSurfaceCard>
        )}
      </section>

      {/* 7. Operational signals — translation health, collapsed */}
      {translationHealth ? (
        <TranslationSignalsPanel health={translationHealth} />
      ) : null}
    </div>
  );
}

// ──────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────

function resolveFirstName(email: string | null): string | null {
  if (!email) return null;
  const local = email.split("@")[0];
  if (!local) return null;
  const first = local.split(/[._+-]/)[0];
  if (!first) return null;
  return first.charAt(0).toUpperCase() + first.slice(1);
}

interface AttentionItem {
  id: string;
  tag: string;
  title: string;
  detail?: string;
  href: string;
}

function buildAttentionItems(args: {
  tier1AlertCount: number;
  pendingTalent: number;
  pendingMedia: number;
  translationHealth: Awaited<ReturnType<typeof loadAdminTranslationHealth>>;
}): AttentionItem[] {
  const items: AttentionItem[] = [];

  if (args.tier1AlertCount > 0) {
    items.push({
      id: "inquiries",
      tag: `${args.tier1AlertCount} to act on`,
      title: "Inquiries need a response",
      detail: "Tier-1 alerts: agency-owned action or unread thread.",
      href: "/admin/inquiries?tier1_only=1",
    });
  }

  if (args.pendingTalent > 0) {
    items.push({
      id: "talent",
      tag: `${args.pendingTalent} pending`,
      title: "Talent awaiting review",
      detail: "Submitted and under-review profiles.",
      href: "/admin/talent?status=under_review",
    });
  }

  if (args.pendingMedia > 0) {
    items.push({
      id: "media",
      tag: `${args.pendingMedia} uploads`,
      title: "Media awaiting approval",
      href: "/admin/media",
    });
  }

  const th = args.translationHealth;
  if (th) {
    const total =
      th.profilesMissingSpanish +
      th.profilesNeedsAttention +
      th.taxonomyMissingSpanish +
      th.locationsMissingSpanish +
      th.cmsMissingSpanish +
      th.messagesMissingEs +
      th.profileFieldsMissingEs;
    if (total > 0) {
      items.push({
        id: "translations",
        tag: `${total} gaps`,
        title: "Spanish translation gaps",
        detail: "Bios, taxonomy, CMS titles, UI strings.",
        href: "/admin/translations",
      });
    }
  }

  return items;
}

type ActivityToneState =
  | "draft"
  | "live"
  | "pending"
  | "attention"
  | "archived";

function mapActivityStatus(status: string): ActivityToneState {
  const s = status.toLowerCase();
  if (s.includes("draft")) return "draft";
  if (s.includes("approved") || s.includes("published") || s === "live") return "live";
  if (s.includes("pending") || s.includes("review") || s.includes("submitted")) return "pending";
  if (s.includes("rejected") || s.includes("failed")) return "attention";
  if (s.includes("archived") || s.includes("closed")) return "archived";
  return "pending";
}

function TranslationSignalsPanel({
  health,
}: {
  health: NonNullable<Awaited<ReturnType<typeof loadAdminTranslationHealth>>>;
}) {
  const total =
    health.profilesMissingSpanish +
    health.profilesNeedsAttention +
    health.taxonomyMissingSpanish +
    health.locationsMissingSpanish +
    health.cmsMissingSpanish +
    health.messagesMissingEs +
    health.profileFieldsMissingEs;

  if (total === 0) return null;

  const cards = [
    {
      title: "Bios missing ES",
      count: health.profilesMissingSpanish,
      href: translationsHref({ view: "bio", status: "missing" }),
    },
    {
      title: "Bios: needs attention",
      count: health.profilesNeedsAttention,
      href: translationsHref({ view: "bio", status: "needs_attention" }),
    },
    {
      title: "Taxonomy gaps",
      count: health.taxonomyMissingSpanish,
      href: translationsHref({ view: "taxonomy", status: "missing" }),
    },
    {
      title: "Location gaps",
      count: health.locationsMissingSpanish,
      href: translationsHref({ view: "locations", status: "missing" }),
    },
    {
      title: "CMS page title gaps",
      count: health.cmsMissingSpanish,
      href: translationsHref({ view: "cms", status: "missing" }),
    },
    {
      title: "UI string gaps",
      count: health.messagesMissingEs,
      href: translationsHref({ view: "messages", status: "missing" }),
    },
    {
      title: "Profile field (i18n) gaps",
      count: health.profileFieldsMissingEs,
      href: translationsHref({ view: "profile_fields", status: "missing" }),
    },
  ];

  return (
    <section aria-labelledby="signals-heading" className="space-y-3">
      <details className="group rounded-2xl border border-border/60 bg-card/30 shadow-sm">
        <summary
          id="signals-heading"
          className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden"
        >
          <div className="flex items-center gap-3">
            <span className="flex size-8 items-center justify-center rounded-lg bg-amber-500/10 text-amber-400">
              <Languages className="size-4" aria-hidden />
            </span>
            <div>
              <p className="text-sm font-semibold text-foreground">
                Operational signals
              </p>
              <p className="text-xs text-muted-foreground">
                {total} translation item{total === 1 ? "" : "s"} across the
                Translation Center registry
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="shrink-0 rounded-xl"
            >
              <Link href="/admin/translations">Open translations</Link>
            </Button>
            <Sparkles
              className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
              aria-hidden
            />
          </div>
        </summary>
        <div className="border-t border-border/50 px-5 py-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {cards.map((card) => (
              <AdminMetricCard
                key={card.title}
                label={card.title}
                value={card.count}
                href={card.href}
              />
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}
