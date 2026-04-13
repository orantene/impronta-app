"use client";

import { motion, useReducedMotion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DashboardSegmentedNav } from "@/components/dashboard/dashboard-segmented-nav";
import { cn } from "@/lib/utils";

type HubProfile = {
  id: string;
  profile_code: string;
  display_name: string | null;
  workflow_status: string;
  visibility: string;
  deleted_at: string | null;
  user_id: string | null;
};

export function AdminTalentHubShell({
  profile,
  children,
}: {
  profile: HubProfile;
  children: React.ReactNode;
}) {
  const reduceMotion = useReducedMotion();
  const pathname = usePathname();
  const base = `/admin/talent/${profile.id}`;
  const isMedia = pathname?.startsWith(`${base}/media`);
  const isAccount = pathname?.startsWith(`${base}/account`);
  const isOverview = pathname === base;

  const items = [
    { href: base, label: "Overview", active: Boolean(isOverview) },
    { href: `${base}/media`, label: "Media", active: Boolean(isMedia) },
    ...(profile.user_id && !profile.deleted_at
      ? [{ href: `${base}/account`, label: "Account", active: Boolean(isAccount) }]
      : []),
  ];

  return (
    <div className="space-y-6">
      {profile.deleted_at ? (
        <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-foreground">
          This profile is <span className="font-medium">removed</span> from the active roster. Restore it from the
          Overview tab, or stay in read-only mode.
        </div>
      ) : null}

      <section
        className={cn(
          "overflow-hidden rounded-3xl border border-border/50 bg-gradient-to-br from-[var(--impronta-gold)]/[0.07] via-card to-card px-4 py-5 shadow-sm sm:px-6 sm:py-6",
          profile.deleted_at && "opacity-90",
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="h-8 rounded-full border-border/55 bg-background/75 px-3 text-xs shadow-sm transition-[border-color,box-shadow] hover:border-[var(--impronta-gold)]/40 hover:bg-background"
                asChild
              >
                <Link href="/admin/talent" scroll={false}>
                  ← Talent queue
                </Link>
              </Button>
              <span className="rounded-full border border-border/50 bg-background/50 px-2.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:text-xs">
                {profile.profile_code}
              </span>
            </div>
            <h1 className="mt-3 font-display text-xl font-medium tracking-wide text-foreground sm:text-2xl">
              {profile.display_name ?? "Unnamed talent"}
            </h1>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge variant="secondary" className="capitalize border border-border/45 shadow-sm">
                {profile.workflow_status.replace(/_/g, " ")}
              </Badge>
              <Badge
                variant={profile.visibility === "public" ? "success" : "muted"}
                className="capitalize shadow-sm"
              >
                {profile.visibility}
              </Badge>
            </div>
          </div>
        </div>

        <div className="mt-5 overflow-x-auto border-t border-border/40 pt-4">
          <DashboardSegmentedNav ariaLabel="Talent hub sections" items={items} />
        </div>
      </section>

      <motion.div
        key={pathname ?? ""}
        initial={reduceMotion ? false : { opacity: 0.92, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        {children}
      </motion.div>
    </div>
  );
}
