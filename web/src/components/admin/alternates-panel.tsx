"use client";

import { useMemo, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Plus, Search, Trash2, UserPlus } from "lucide-react";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";
import {
  addAlternateAction,
  promoteAlternateAction,
  removeAlternateAction,
  reorderAlternatesAction,
} from "@/app/(workspace)/[tenantSlug]/admin/_alternates-actions";
import { handleActionResult, type ActionResult } from "@/lib/inquiry/inquiry-action-result";
import type { GroupShortfall, InquiryAlternate } from "@/lib/inquiry/alternates-types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export type AlternateTalentOption = {
  id: string;
  profileCode: string;
  displayName: string | null;
};

function matchOption(option: AlternateTalentOption, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    option.profileCode.toLowerCase().includes(q) ||
    (option.displayName ?? "").toLowerCase().includes(q)
  );
}

/**
 * Admin-only "Alternates" coordination panel for an inquiry. Lists a ranked
 * waitlist of alternate talents, lets a coordinator add / reorder / remove
 * them, and — when a requirement group is short — surfaces a one-click
 * "Promote" that moves the alternate into the live roster (Agent 1's
 * promoteAlternateAction). Server boundary: this is a client island fed
 * initial data by the work-detail server page.
 */
export function AlternatesPanel({
  inquiryId,
  inquiryVersion,
  initialAlternates,
  shortfalls,
  talentOptions,
  rosterTalentProfileIds,
}: {
  inquiryId: string;
  inquiryVersion: number;
  initialAlternates: InquiryAlternate[];
  shortfalls: GroupShortfall[];
  talentOptions: AlternateTalentOption[];
  rosterTalentProfileIds: string[];
}) {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [query, setQuery] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const alternates = initialAlternates;
  const hasShortfall = shortfalls.some((s) => s.shortfall > 0);

  // Talent already on the alternates list OR already in the live roster are not
  // pickable (the engine rejects roster dupes on promote; avoid offering them).
  const excludedTalentIds = useMemo(() => {
    const set = new Set<string>(rosterTalentProfileIds);
    for (const a of alternates) set.add(a.talentProfileId);
    return set;
  }, [alternates, rosterTalentProfileIds]);

  const filtered = useMemo(
    () =>
      talentOptions
        .filter((o) => !excludedTalentIds.has(o.id))
        .filter((o) => matchOption(o, query))
        .slice(0, 8),
    [excludedTalentIds, query, talentOptions],
  );

  const feedback = (result: ActionResult, successFallback?: string) => {
    setError(null);
    setNotice(null);
    handleActionResult(result, {
      onToast: (m) => setNotice(m || successFallback || "Done."),
      onRefresh: () => queueRouterRefresh(),
      onInlineError: (m) => setError(m),
      onBlockerBanner: (m) => setError(m),
    });
  };

  const runAdd = (talentProfileId: string) => {
    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("talent_profile_id", talentProfileId);
    fd.set("expected_version", String(inquiryVersion));
    setBusyId(talentProfileId);
    startTransition(() => {
      void addAlternateAction(fd)
        .then((r) => feedback(r, "Alternate added."))
        .finally(() => setBusyId(null));
    });
  };

  const runRemove = (alternateId: string) => {
    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("alternate_id", alternateId);
    fd.set("expected_version", String(inquiryVersion));
    setBusyId(alternateId);
    startTransition(() => {
      void removeAlternateAction(fd)
        .then((r) => feedback(r, "Alternate removed."))
        .finally(() => setBusyId(null));
    });
  };

  const runReorder = (index: number, direction: "up" | "down") => {
    const target = direction === "up" ? index - 1 : index + 1;
    if (target < 0 || target >= alternates.length) return;
    const next = [...alternates];
    const [moved] = next.splice(index, 1);
    next.splice(target, 0, moved);
    const orderedIds = next.map((a) => a.id);

    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("ordered_alternate_ids", orderedIds.join(","));
    fd.set("expected_version", String(inquiryVersion));
    setBusyId(alternates[index].id);
    startTransition(() => {
      void reorderAlternatesAction(fd)
        .then((r) => feedback(r, "Order updated."))
        .finally(() => setBusyId(null));
    });
  };

  const runPromote = (alternateId: string) => {
    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("alternate_id", alternateId);
    fd.set("expected_version", String(inquiryVersion));
    setBusyId(alternateId);
    startTransition(() => {
      void promoteAlternateAction(fd)
        .then((r) => feedback(r, "Alternate promoted to roster."))
        .finally(() => setBusyId(null));
    });
  };

  return (
    <section className="rounded-[1.5rem] border border-border/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(249,247,242,0.74))] p-4 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Alternates
          </p>
          <p className="text-xs text-muted-foreground">
            A ranked waitlist for this inquiry. Promote an alternate into the roster when a slot opens.
          </p>
        </div>
        <span className="rounded-full border border-border/45 bg-background/85 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          {alternates.length} on list
        </span>
      </div>

      {/* Shortfall banner */}
      {hasShortfall ? (
        <div className="mt-3 space-y-1.5 rounded-2xl border border-amber-500/35 bg-amber-50/70 px-3.5 py-2.5">
          {shortfalls
            .filter((s) => s.shortfall > 0)
            .map((s) => (
              <p key={s.groupId} className="text-sm font-medium text-amber-800">
                Need {s.shortfall} more for {s.roleKey ? s.roleKey.replace(/_/g, " ") : "this group"}
                <span className="ml-1 font-normal text-amber-700">
                  ({s.approvedCount}/{s.quantityRequired} filled)
                </span>
              </p>
            ))}
          <p className="text-xs text-amber-700/90">Promote an alternate below to fill the open slot.</p>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 rounded-xl border border-destructive/35 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p className="mt-3 rounded-xl border border-emerald-500/35 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </p>
      ) : null}

      {/* Add alternate (talent picker — mirrors roster editor search) */}
      <div className="mt-4 space-y-3 rounded-2xl border border-border/45 bg-muted/10 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search talent by code or name to add an alternate"
            className="pl-9"
          />
        </div>
        <div className="rounded-2xl border border-border/45 bg-background">
          {query.trim().length >= 1 ? (
            filtered.length > 0 ? (
              <ul className="divide-y divide-border/40">
                {filtered.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      disabled={pending}
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30",
                        pending && "opacity-60",
                      )}
                      onClick={() => runAdd(option.id)}
                    >
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-foreground">
                          {option.displayName ?? option.profileCode}
                        </span>
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">
                          {option.profileCode}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-border/55 bg-background/85 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                        <Plus className="h-3.5 w-3.5" />
                        {busyId === option.id ? "Adding…" : "Add"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">No talent matches.</p>
            )
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">
              Search to add a backup talent to this inquiry&apos;s waitlist.
            </p>
          )}
        </div>
      </div>

      {/* Ranked alternates list */}
      {alternates.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {alternates.map((alt, index) => {
            const rowBusy = busyId === alt.id && pending;
            return (
              <li
                key={alt.id}
                className="flex flex-col gap-3 rounded-2xl border border-border/45 bg-background/70 px-4 py-3 text-sm shadow-sm sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-border/55 bg-muted/40 px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
                      #{index + 1}
                    </span>
                    <p className="truncate font-medium text-foreground">
                      {alt.talentName ?? "Talent"}
                    </p>
                  </div>
                  {alt.note ? (
                    <p className="truncate text-xs text-muted-foreground">{alt.note}</p>
                  ) : null}
                </div>

                <div className="flex flex-wrap items-center gap-1.5 self-end sm:self-center">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 rounded-full p-0"
                    disabled={index === 0 || pending}
                    onClick={() => runReorder(index, "up")}
                  >
                    <ArrowUp className="h-4 w-4" />
                    <span className="sr-only">Move up</span>
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 w-9 rounded-full p-0"
                    disabled={index === alternates.length - 1 || pending}
                    onClick={() => runReorder(index, "down")}
                  >
                    <ArrowDown className="h-4 w-4" />
                    <span className="sr-only">Move down</span>
                  </Button>
                  {hasShortfall ? (
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 rounded-full px-3"
                      disabled={pending}
                      onClick={() => runPromote(alt.id)}
                    >
                      <UserPlus className="mr-1 h-4 w-4" />
                      {rowBusy ? "Promoting…" : "Promote"}
                    </Button>
                  ) : null}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-9 rounded-full border-destructive/35 px-3 text-destructive hover:bg-destructive/5"
                    disabled={pending}
                    onClick={() => runRemove(alt.id)}
                  >
                    <Trash2 className="mr-1 h-4 w-4" />
                    {rowBusy ? "…" : "Remove"}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      ) : (
        <p className="mt-4 rounded-2xl border border-dashed border-border/50 bg-muted/10 px-4 py-5 text-sm text-muted-foreground">
          No alternates yet. Add a backup talent above so you can promote them instantly if someone declines.
        </p>
      )}
    </section>
  );
}
