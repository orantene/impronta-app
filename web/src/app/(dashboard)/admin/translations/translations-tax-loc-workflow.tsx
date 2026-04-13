"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, ChevronUp, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import {
  adminAiTranslateLocation,
  adminAiTranslateTaxonomyTerm,
} from "@/app/(dashboard)/admin/translations/translations-ai-actions";
import {
  adminBulkMarkLocationTranslated,
  adminBulkMarkTaxonomyTranslated,
  adminMarkLocationTranslated,
  adminMarkTaxonomyTranslated,
} from "@/app/(dashboard)/admin/translations/translations-tax-loc-actions";
import type { LocationSortKey, SortDir, TaxLocFilterKey, TaxonomySortKey } from "@/app/(dashboard)/admin/translations/translations-url";
import { locationSortHref, taxonomySortHref } from "@/app/(dashboard)/admin/translations/translations-url";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import { ADMIN_TABLE_HEAD, ADMIN_TABLE_TH } from "@/lib/dashboard-shell-classes";
import { friendlyAiFailureMessage } from "@/lib/translation/ai-user-messages";
import { cn } from "@/lib/utils";

type RowAiPhase = "idle" | "translating" | "done" | "error";

export type TaxonomyWorkflowRow = {
  id: string;
  kind: string;
  slug: string;
  name_en: string;
  name_es: string | null;
  updated_at: string;
};

export type LocationWorkflowRow = {
  id: string;
  country_code: string;
  city_slug: string;
  display_name_en: string;
  display_name_es: string | null;
  updated_at: string;
};

type ComputedStatus = "missing" | "translated";

function computeTaxStatus(row: TaxonomyWorkflowRow): ComputedStatus {
  return (row.name_es ?? "").trim() ? "translated" : "missing";
}

function computeLocStatus(row: LocationWorkflowRow): ComputedStatus {
  return (row.display_name_es ?? "").trim() ? "translated" : "missing";
}

function SortHeader({
  label,
  titleAttr,
  href,
  active,
  ascending,
}: {
  label: string;
  titleAttr: string;
  href: string;
  active: boolean;
  ascending: boolean;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "inline-flex items-center gap-1 font-medium hover:text-foreground",
        active ? "text-foreground" : "text-muted-foreground",
      )}
      title={titleAttr}
    >
      {label}
      {active ? (
        ascending ? (
          <ChevronUp className="size-3.5 opacity-80" aria-hidden />
        ) : (
          <ChevronDown className="size-3.5 opacity-80" aria-hidden />
        )
      ) : null}
    </Link>
  );
}

function StatusBadge({ status }: { status: ComputedStatus }) {
  const label = status === "missing" ? "missing" : "translated";
  const tooltip =
    status === "missing"
      ? "No Spanish label — fill manually, Mark translated, or use AI."
      : "Spanish label is set — compare with English in the expanded row.";
  const cls =
    status === "missing"
      ? "border-red-600/55 bg-red-600/15 text-red-50"
      : "border-emerald-600/60 bg-emerald-600/15 text-emerald-100";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              cls,
            )}
          >
            {label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function TranslationsTaxonomyWorkflowTable({
  rows,
  statusFilter,
  q,
  taxonomySort,
  sortDir,
  openNextMissingHref,
  aiConfigured,
}: {
  rows: TaxonomyWorkflowRow[];
  statusFilter: TaxLocFilterKey;
  q: string;
  taxonomySort: TaxonomySortKey;
  sortDir: SortDir;
  openNextMissingHref: string | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgressLine, setAiProgressLine] = useState<string | null>(null);
  const [rowAiPhase, setRowAiPhase] = useState<Record<string, RowAiPhase>>({});
  const [allMissingOpen, setAllMissingOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = rowIds.some((id) => selected.has(id));
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  useEffect(() => {
    setRowAiPhase({});
  }, [rowIds]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rowIds) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const missingAiTargets = useMemo(
    () => rows.filter((r) => !(r.name_es ?? "").trim()),
    [rows],
  );

  async function runBulkAiTaxonomy(ids: string[]) {
    if (!aiConfigured || ids.length === 0 || aiRunning) return;
    setAiRunning(true);
    setRowAiPhase({});
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        setAiProgressLine(`Processing ${i + 1} of ${ids.length}…`);
        setRowAiPhase((prev) => ({ ...prev, [id]: "translating" }));
        const res = await adminAiTranslateTaxonomyTerm({ id });
        if (!res.ok) {
          failed += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "error" }));
        } else if (res.skipped) {
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        } else {
          created += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        }
      }
      if (created > 0 && failed > 0) {
        toast.message(
          `${created} updated, ${failed} failed — check row indicators or retry failed terms.`,
        );
      } else if (created > 0) {
        toast.success(`${created} translation${created === 1 ? "" : "s"} created`);
      } else if (failed > 0) {
        toast.message(friendlyAiFailureMessage("Some requests failed — check row indicators."));
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setAiProgressLine(null);
      setAiRunning(false);
    }
  }

  async function runTranslateAllMissingTaxonomy() {
    if (!aiConfigured || missingAiTargets.length === 0 || aiRunning) return;
    setAllMissingOpen(false);
    setAiRunning(true);
    setRowAiPhase({});
    const ids = missingAiTargets.map((r) => r.id);
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        setAiProgressLine(`Processing ${i + 1} of ${ids.length}…`);
        setRowAiPhase((prev) => ({ ...prev, [id]: "translating" }));
        const res = await adminAiTranslateTaxonomyTerm({ id });
        if (!res.ok) {
          failed += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "error" }));
        } else if (!res.skipped) {
          created += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        } else {
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        }
      }
      if (created > 0 && failed > 0) {
        toast.message(
          `${created} filled, ${failed} failed — check row indicators or retry failed terms.`,
        );
      } else if (created > 0) {
        toast.success(`${created} translation${created === 1 ? "" : "s"} created`);
      } else if (failed > 0) {
        toast.message(friendlyAiFailureMessage("Some requests failed — check row indicators."));
      }
      router.refresh();
    } finally {
      setAiProgressLine(null);
      setAiRunning(false);
    }
  }

  function runBulk(ids: string[]) {
    start(async () => {
      const res = await adminBulkMarkTaxonomyTranslated({ ids });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("failed" in res) {
        if (res.failed.length) {
          toast.message(`Updated ${res.ok}; ${res.failed.length} failed (e.g. ${res.failed[0]!.message})`);
        } else {
          toast.success(`Marked ${res.ok} term${res.ok === 1 ? "" : "s"}`);
        }
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function runRowMark(id: string) {
    start(async () => {
      const r = await adminMarkTaxonomyTranslated({ id });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Marked translated");
        router.refresh();
      }
    });
  }

  function runRowAiTaxonomy(id: string) {
    start(async () => {
      setRowAiPhase((p) => ({ ...p, [id]: "translating" }));
      const res = await adminAiTranslateTaxonomyTerm({ id });
      if (!res.ok) {
        setRowAiPhase((p) => ({ ...p, [id]: "error" }));
        toast.error(friendlyAiFailureMessage(res.error));
        return;
      }
      if (res.skipped) {
        setRowAiPhase((p) => ({ ...p, [id]: "done" }));
        toast.message("Spanish already set — not overwritten");
        return;
      }
      setRowAiPhase((p) => ({ ...p, [id]: "done" }));
      toast.success("AI translation applied");
      router.refresh();
    });
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-xl border border-border/60 bg-card/30">
        <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {rows.length} term{rows.length === 1 ? "" : "s"}
              {rows.length === 500 ? (
                <span className="ml-1 text-amber-200/90">(first 500 — narrow filters or search)</span>
              ) : null}
            </p>
            {openNextMissingHref ? (
              <Button asChild size="sm" variant="secondary" className="h-8 w-fit rounded-full">
                <Link href={openNextMissingHref}>Open next missing</Link>
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {aiProgressLine ? (
              <span className="text-xs tabular-nums text-muted-foreground">{aiProgressLine}</span>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-8 rounded-full"
                disabled={!aiConfigured || aiRunning || missingAiTargets.length === 0}
                aria-busy={aiRunning}
                title={
                  !aiConfigured
                    ? "Configure OPENAI_API_KEY"
                    : "Fill missing Spanish labels for every row on this list (current filter)"
                }
                onClick={() => setAllMissingOpen(true)}
              >
                Translate all missing
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-full"
                disabled={pending || aiRunning || selectedIds.length === 0}
                aria-busy={pending}
                title="Copy English into Spanish and mark translated (bulk)"
                onClick={() => runBulk(selectedIds)}
              >
                Mark translated
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full"
                disabled={!aiConfigured || aiRunning || selectedIds.length === 0}
                aria-busy={aiRunning}
                title="AI fill empty Spanish only (never overwrites existing ES)"
                onClick={() => void runBulkAiTaxonomy(selectedIds)}
              >
                Bulk AI
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={cn("border-b border-border/50 text-xs uppercase tracking-wider", ADMIN_TABLE_HEAD)}>
              <tr>
                <th className={cn(ADMIN_TABLE_TH, "w-10 py-2.5")}>
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className="size-4 rounded border-border accent-primary"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all on this page"
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "w-8 py-2.5")} aria-hidden />
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>
                  <SortHeader
                    label="Name EN"
                    titleAttr="Sort by English name"
                    href={taxonomySortHref("name_en", taxonomySort, sortDir, statusFilter, q)}
                    active={taxonomySort === "name_en"}
                    ascending={sortDir === "asc"}
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>
                  <SortHeader
                    label="Name ES"
                    titleAttr="Sort by Spanish name"
                    href={taxonomySortHref("name_es", taxonomySort, sortDir, statusFilter, q)}
                    active={taxonomySort === "name_es"}
                    ascending={sortDir === "asc"}
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>Status</th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>
                  <SortHeader
                    label="Updated"
                    titleAttr="Sort by last update"
                    href={taxonomySortHref("updated", taxonomySort, sortDir, statusFilter, q)}
                    active={taxonomySort === "updated"}
                    ascending={sortDir === "asc"}
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5 text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = computeTaxStatus(row);
                const isOpen = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-border/40 last:border-0",
                        isOpen ? "bg-muted/20" : "hover:bg-muted/10",
                      )}
                      onClick={() => setExpanded((prev) => (prev === row.id ? null : row.id))}
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border accent-primary"
                          checked={selected.has(row.id)}
                          onChange={(e) => toggleOne(row.id, e.target.checked)}
                          aria-label={`Select ${row.slug}`}
                        />
                      </td>
                      <td className="px-1 py-2.5 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          {rowAiPhase[row.id] === "translating" ? (
                            <span className="size-2 animate-pulse rounded-full bg-amber-400" title="Translating" />
                          ) : rowAiPhase[row.id] === "done" ? (
                            <span className="size-2 rounded-full bg-emerald-500" title="Done" />
                          ) : rowAiPhase[row.id] === "error" ? (
                            <span className="size-2 rounded-full bg-red-500" title="Error" />
                          ) : (
                            <span className="size-2 shrink-0 rounded-full bg-transparent" aria-hidden />
                          )}
                          {isOpen ? (
                            <ChevronDown className="size-4" aria-hidden />
                          ) : (
                            <ChevronRight className="size-4" aria-hidden />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground">{row.name_en}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {row.kind} · {row.slug}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {(row.name_es ?? "").trim() || "—"}
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {formatAdminTimestamp(row.updated_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="outline" className="h-8">
                            <Link href={`/admin/taxonomy?q=${encodeURIComponent(row.slug)}`}>Open editor</Link>
                          </Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 px-2"
                                aria-label="More actions"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-52 space-y-1 p-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start"
                                disabled={pending || aiRunning || !aiConfigured || status === "translated"}
                                title={
                                  status === "translated"
                                    ? "Already has Spanish"
                                    : !aiConfigured
                                      ? "Configure OPENAI_API_KEY"
                                      : "AI fill for empty Spanish only (does not overwrite existing ES)"
                                }
                                onClick={() => runRowAiTaxonomy(row.id)}
                              >
                                AI translate
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start"
                                disabled={pending || status === "translated"}
                                title={
                                  status === "translated"
                                    ? "Already has Spanish"
                                    : "Copy English into Spanish and mark as translated"
                                }
                                onClick={() => runRowMark(row.id)}
                              >
                                Mark translated
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start text-muted-foreground"
                                type="button"
                                title="Expand the row to compare English and Spanish side by side"
                                onClick={() => setExpanded(row.id)}
                              >
                                Show labels in row
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-border/40 bg-muted/15">
                        <td colSpan={7} className="px-4 py-3 text-sm text-muted-foreground">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Labels
                          </p>
                          <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                            <dt className="text-muted-foreground">English</dt>
                            <dd className="text-foreground">{row.name_en}</dd>
                            <dt className="text-muted-foreground">Spanish</dt>
                            <dd className="text-foreground">{(row.name_es ?? "").trim() || "—"}</dd>
                            <dt className="text-muted-foreground">Slug</dt>
                            <dd className="font-mono text-xs">{row.slug}</dd>
                            <dt className="text-muted-foreground">Updated</dt>
                            <dd className="tabular-nums">{formatAdminTimestamp(row.updated_at)}</dd>
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {allMissingOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="taxonomy-ai-all-missing-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-lg">
            <h2 id="taxonomy-ai-all-missing-title" className="text-lg font-semibold text-foreground">
              Translate missing taxonomy labels?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Translate {missingAiTargets.length} item{missingAiTargets.length === 1 ? "" : "s"}? Only terms with
              empty Spanish on the current table are included. Existing Spanish is never overwritten.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAllMissingOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={aiRunning}
                aria-busy={aiRunning}
                onClick={() => void runTranslateAllMissingTaxonomy()}
              >
                Translate {missingAiTargets.length} items
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  );
}

export function TranslationsLocationWorkflowTable({
  rows,
  statusFilter,
  q,
  locationSort,
  sortDir,
  openNextMissingHref,
  aiConfigured,
}: {
  rows: LocationWorkflowRow[];
  statusFilter: TaxLocFilterKey;
  q: string;
  locationSort: LocationSortKey;
  sortDir: SortDir;
  openNextMissingHref: string | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [aiRunning, setAiRunning] = useState(false);
  const [aiProgressLine, setAiProgressLine] = useState<string | null>(null);
  const [rowAiPhase, setRowAiPhase] = useState<Record<string, RowAiPhase>>({});
  const [allMissingOpen, setAllMissingOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [expanded, setExpanded] = useState<string | null>(null);

  const rowIds = useMemo(() => rows.map((r) => r.id), [rows]);
  const allSelected = rowIds.length > 0 && rowIds.every((id) => selected.has(id));
  const someSelected = rowIds.some((id) => selected.has(id));
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  useEffect(() => {
    setRowAiPhase({});
  }, [rowIds]);

  function toggleAll(checked: boolean) {
    setSelected(checked ? new Set(rowIds) : new Set());
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  const selectedIds = useMemo(() => Array.from(selected), [selected]);

  const missingAiTargets = useMemo(
    () => rows.filter((r) => !(r.display_name_es ?? "").trim()),
    [rows],
  );

  async function runBulkAiLocations(ids: string[]) {
    if (!aiConfigured || ids.length === 0 || aiRunning) return;
    setAiRunning(true);
    setRowAiPhase({});
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        setAiProgressLine(`Processing ${i + 1} of ${ids.length}…`);
        setRowAiPhase((prev) => ({ ...prev, [id]: "translating" }));
        const res = await adminAiTranslateLocation({ id });
        if (!res.ok) {
          failed += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "error" }));
        } else if (res.skipped) {
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        } else {
          created += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        }
      }
      if (created > 0 && failed > 0) {
        toast.message(
          `${created} updated, ${failed} failed — check row indicators or retry failed locations.`,
        );
      } else if (created > 0) {
        toast.success(`${created} translation${created === 1 ? "" : "s"} created`);
      } else if (failed > 0) {
        toast.message(friendlyAiFailureMessage("Some requests failed — check row indicators."));
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setAiProgressLine(null);
      setAiRunning(false);
    }
  }

  async function runTranslateAllMissingLocations() {
    if (!aiConfigured || missingAiTargets.length === 0 || aiRunning) return;
    setAllMissingOpen(false);
    setAiRunning(true);
    setRowAiPhase({});
    const ids = missingAiTargets.map((r) => r.id);
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        setAiProgressLine(`Processing ${i + 1} of ${ids.length}…`);
        setRowAiPhase((prev) => ({ ...prev, [id]: "translating" }));
        const res = await adminAiTranslateLocation({ id });
        if (!res.ok) {
          failed += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "error" }));
        } else if (!res.skipped) {
          created += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        } else {
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        }
      }
      if (created > 0 && failed > 0) {
        toast.message(
          `${created} filled, ${failed} failed — check row indicators or retry failed locations.`,
        );
      } else if (created > 0) {
        toast.success(`${created} translation${created === 1 ? "" : "s"} created`);
      } else if (failed > 0) {
        toast.message(friendlyAiFailureMessage("Some requests failed — check row indicators."));
      }
      router.refresh();
    } finally {
      setAiProgressLine(null);
      setAiRunning(false);
    }
  }

  function runBulk(ids: string[]) {
    start(async () => {
      const res = await adminBulkMarkLocationTranslated({ ids });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("failed" in res) {
        if (res.failed.length) {
          toast.message(`Updated ${res.ok}; ${res.failed.length} failed (e.g. ${res.failed[0]!.message})`);
        } else {
          toast.success(`Marked ${res.ok} location${res.ok === 1 ? "" : "s"}`);
        }
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function runRowMark(id: string) {
    start(async () => {
      const r = await adminMarkLocationTranslated({ id });
      if (r.error) toast.error(r.error);
      else {
        toast.success("Marked translated");
        router.refresh();
      }
    });
  }

  function runRowAiLocation(id: string) {
    start(async () => {
      setRowAiPhase((p) => ({ ...p, [id]: "translating" }));
      const res = await adminAiTranslateLocation({ id });
      if (!res.ok) {
        setRowAiPhase((p) => ({ ...p, [id]: "error" }));
        toast.error(friendlyAiFailureMessage(res.error));
        return;
      }
      if (res.skipped) {
        setRowAiPhase((p) => ({ ...p, [id]: "done" }));
        toast.message("Spanish already set — not overwritten");
        return;
      }
      setRowAiPhase((p) => ({ ...p, [id]: "done" }));
      toast.success("AI translation applied");
      router.refresh();
    });
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-xl border border-border/60 bg-card/30">
        <div className="flex flex-col gap-3 border-b border-border/50 px-4 py-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {rows.length} location{rows.length === 1 ? "" : "s"}
              {rows.length === 500 ? (
                <span className="ml-1 text-amber-200/90">(first 500 — narrow filters or search)</span>
              ) : null}
            </p>
            {openNextMissingHref ? (
              <Button asChild size="sm" variant="secondary" className="h-8 w-fit rounded-full">
                <Link href={openNextMissingHref}>Open next missing</Link>
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col items-end gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            {aiProgressLine ? (
              <span className="text-xs tabular-nums text-muted-foreground">{aiProgressLine}</span>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                size="sm"
                variant="default"
                className="h-8 rounded-full"
                disabled={!aiConfigured || aiRunning || missingAiTargets.length === 0}
                aria-busy={aiRunning}
                title={
                  !aiConfigured
                    ? "Configure OPENAI_API_KEY"
                    : "Fill missing Spanish display names for every row on this list (current filter)"
                }
                onClick={() => setAllMissingOpen(true)}
              >
                Translate all missing
              </Button>
              <Button
                type="button"
                size="sm"
                variant="secondary"
                className="h-8 rounded-full"
                disabled={pending || aiRunning || selectedIds.length === 0}
                aria-busy={pending}
                title="Copy English into Spanish and mark translated (bulk)"
                onClick={() => runBulk(selectedIds)}
              >
                Mark translated
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full"
                disabled={!aiConfigured || aiRunning || selectedIds.length === 0}
                aria-busy={aiRunning}
                title="AI fill empty Spanish only (never overwrites existing ES)"
                onClick={() => void runBulkAiLocations(selectedIds)}
              >
                Bulk AI
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-left text-sm">
            <thead className={cn("border-b border-border/50 text-xs uppercase tracking-wider", ADMIN_TABLE_HEAD)}>
              <tr>
                <th className={cn(ADMIN_TABLE_TH, "w-10 py-2.5")}>
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className="size-4 rounded border-border accent-primary"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all on this page"
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "w-8 py-2.5")} aria-hidden />
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>
                  <SortHeader
                    label="Name EN"
                    titleAttr="Sort by English display name"
                    href={locationSortHref("display_en", locationSort, sortDir, statusFilter, q)}
                    active={locationSort === "display_en"}
                    ascending={sortDir === "asc"}
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>
                  <SortHeader
                    label="Name ES"
                    titleAttr="Sort by Spanish display name"
                    href={locationSortHref("display_es", locationSort, sortDir, statusFilter, q)}
                    active={locationSort === "display_es"}
                    ascending={sortDir === "asc"}
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>Status</th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5")}>
                  <SortHeader
                    label="Updated"
                    titleAttr="Sort by last update"
                    href={locationSortHref("updated", locationSort, sortDir, statusFilter, q)}
                    active={locationSort === "updated"}
                    ascending={sortDir === "asc"}
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-2.5 text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const status = computeLocStatus(row);
                const isOpen = expanded === row.id;
                return (
                  <Fragment key={row.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-border/40 last:border-0",
                        isOpen ? "bg-muted/20" : "hover:bg-muted/10",
                      )}
                      onClick={() => setExpanded((prev) => (prev === row.id ? null : row.id))}
                    >
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border accent-primary"
                          checked={selected.has(row.id)}
                          onChange={(e) => toggleOne(row.id, e.target.checked)}
                          aria-label={`Select ${row.city_slug}`}
                        />
                      </td>
                      <td className="px-1 py-2.5 text-muted-foreground">
                        <div className="flex items-center gap-1">
                          {rowAiPhase[row.id] === "translating" ? (
                            <span className="size-2 animate-pulse rounded-full bg-amber-400" title="Translating" />
                          ) : rowAiPhase[row.id] === "done" ? (
                            <span className="size-2 rounded-full bg-emerald-500" title="Done" />
                          ) : rowAiPhase[row.id] === "error" ? (
                            <span className="size-2 rounded-full bg-red-500" title="Error" />
                          ) : (
                            <span className="size-2 shrink-0 rounded-full bg-transparent" aria-hidden />
                          )}
                          {isOpen ? (
                            <ChevronDown className="size-4" aria-hidden />
                          ) : (
                            <ChevronRight className="size-4" aria-hidden />
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="font-medium text-foreground">{row.display_name_en}</div>
                        <div className="mt-0.5 font-mono text-[10px] text-muted-foreground">
                          {row.country_code} · {row.city_slug}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-muted-foreground">
                        {(row.display_name_es ?? "").trim() || "—"}
                      </td>
                      <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <StatusBadge status={status} />
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-muted-foreground">
                        {formatAdminTimestamp(row.updated_at)}
                      </td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button asChild size="sm" variant="outline" className="h-8">
                            <Link href={`/admin/locations?q=${encodeURIComponent(row.city_slug)}`}>
                              Open editor
                            </Link>
                          </Button>
                          <Popover>
                            <PopoverTrigger asChild>
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                className="h-8 px-2"
                                aria-label="More actions"
                              >
                                <MoreHorizontal className="size-4" />
                              </Button>
                            </PopoverTrigger>
                            <PopoverContent align="end" className="w-52 space-y-1 p-2">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start"
                                disabled={pending || aiRunning || !aiConfigured || status === "translated"}
                                title={
                                  status === "translated"
                                    ? "Already has Spanish"
                                    : !aiConfigured
                                      ? "Configure OPENAI_API_KEY"
                                      : "AI fill for empty Spanish only (does not overwrite existing ES)"
                                }
                                onClick={() => runRowAiLocation(row.id)}
                              >
                                AI translate
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start"
                                disabled={pending || status === "translated"}
                                title={
                                  status === "translated"
                                    ? "Already has Spanish"
                                    : "Copy English into Spanish and mark as translated"
                                }
                                onClick={() => runRowMark(row.id)}
                              >
                                Mark translated
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start text-muted-foreground"
                                type="button"
                                title="Expand the row to compare English and Spanish side by side"
                                onClick={() => setExpanded(row.id)}
                              >
                                Show labels in row
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-border/40 bg-muted/15">
                        <td colSpan={7} className="px-4 py-3 text-sm text-muted-foreground">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Labels
                          </p>
                          <dl className="mt-2 grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                            <dt className="text-muted-foreground">English</dt>
                            <dd className="text-foreground">{row.display_name_en}</dd>
                            <dt className="text-muted-foreground">Spanish</dt>
                            <dd className="text-foreground">{(row.display_name_es ?? "").trim() || "—"}</dd>
                            <dt className="text-muted-foreground">Country · slug</dt>
                            <dd className="font-mono text-xs">
                              {row.country_code} · {row.city_slug}
                            </dd>
                            <dt className="text-muted-foreground">Updated</dt>
                            <dd className="tabular-nums">{formatAdminTimestamp(row.updated_at)}</dd>
                          </dl>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {allMissingOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="locations-ai-all-missing-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-lg">
            <h2 id="locations-ai-all-missing-title" className="text-lg font-semibold text-foreground">
              Translate missing locations?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Translate {missingAiTargets.length} item{missingAiTargets.length === 1 ? "" : "s"}? Only rows with empty
              Spanish on the current table are included. Existing Spanish is never overwritten.
            </p>
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setAllMissingOpen(false)}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={aiRunning}
                aria-busy={aiRunning}
                onClick={() => void runTranslateAllMissingLocations()}
              >
                Translate {missingAiTargets.length} items
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  );
}
