"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronRight, ChevronUp, Loader2, MoreHorizontal } from "lucide-react";
import { toast } from "sonner";

import { AdminTalentBioTranslationPanel } from "@/app/(dashboard)/admin/talent/[id]/admin-talent-bio-translation-panel";
import {
  adminLoadBioTranslationPanelData,
  type BioTranslationPanelPayload,
} from "@/app/(dashboard)/admin/talent/translation-actions";
import { adminAiRunProfileTranslationJob } from "@/app/(dashboard)/admin/translations/translations-ai-actions";
import { adminAiFillMissingSpanishBio, adminMarkSpanishBioReviewed } from "@/app/(dashboard)/admin/talent/translation-actions";
import { adminBulkMarkSpanishBioReviewed } from "@/app/(dashboard)/admin/translations/translations-workflow-actions";
import type { BioFilterKey, BioSortKey, SortDir } from "@/app/(dashboard)/admin/translations/translations-url";
import { bioSortHref, TRANSLATIONS_APANEL_BIO } from "@/app/(dashboard)/admin/translations/translations-url";
import { DashboardEditPanel } from "@/components/dashboard/dashboard-edit-panel";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { formatAdminTimestamp } from "@/lib/admin/format-admin-timestamp";
import {
  ADMIN_TABLE_HEAD,
  ADMIN_TABLE_TH,
} from "@/lib/dashboard-shell-classes";
import {
  isBioEsStatus,
  parseBioEsStatus,
  type BioEsStatus,
} from "@/lib/translation/bio-es-status";
import { friendlyAiFailureMessage } from "@/lib/translation/ai-user-messages";
import { ADMIN_DRAWER_CLASS_WIDE } from "@/lib/admin/admin-drawer-classes";
import { useAdminPanelState } from "@/hooks/use-admin-panel-state";
import { cn } from "@/lib/utils";

type RowAiPhase = "idle" | "translating" | "done" | "error";

export type TalentBioWorkflowRow = {
  id: string;
  profile_code: string;
  display_name: string | null;
  bio_es: string | null;
  bio_es_draft: string | null;
  bio_es_status: string | null;
  bio_es_updated_at: string | null;
  bio_en_updated_at: string | null;
};

export type AuditPreviewRow = {
  created_at: string;
  event_type: string;
  actor_kind: string;
  actor_id: string | null;
  actor_label: string | null;
};

const STATUS_TOOLTIPS: Record<BioEsStatus, string> = {
  missing: "No Spanish exists",
  stale: "English updated after Spanish",
  auto: "AI generated",
  reviewed: "Manually edited",
  approved: "Legacy DB value — not a workflow step",
};

/** Legacy `bio_es_status` column — hide the word “approved” in the table. */
function esStatusColumnLabel(st: BioEsStatus, hasEs: boolean): string {
  if (!hasEs && st === "missing") return "missing";
  if (st === "approved") return "legacy";
  return st;
}

function statusBadgeClass(status: BioEsStatus): string {
  switch (status) {
    case "approved":
      return "border-zinc-500/45 bg-zinc-500/10 text-zinc-200 dark:text-zinc-100";
    case "stale":
      return "border-orange-500/50 bg-orange-500/12 text-orange-950 dark:text-orange-50";
    case "missing":
      return "border-rose-600/50 bg-rose-500/12 text-rose-900 dark:text-rose-50";
    case "auto":
      return "border-sky-600/50 bg-sky-500/12 text-sky-950 dark:text-sky-50";
    case "reviewed":
      return "border-violet-600/50 bg-violet-500/12 text-violet-950 dark:text-violet-100";
    default:
      return "border-border/60 bg-muted/25 text-muted-foreground";
  }
}

function eventTypeLabel(eventType: string): string {
  switch (eventType) {
    case "ai_fill_missing_published":
    case "ai_refresh_draft":
    case "ai_refresh_published":
      return "AI generated";
    case "manual_edit_es":
      return "Manual edit";
    case "manual_edit_es_draft":
      return "Manual edit (Spanish buffer)";
    case "manual_edit_en_draft":
      return "Manual edit (English buffer)";
    case "manual_edit_bilingual_quick":
      return "Quick edit (bilingual)";
    case "mark_reviewed":
      return "Reviewed";
    case "mark_approved":
    case "approve_draft":
      return "Legacy status change";
    case "approve_en_draft":
      return "English buffer merged to live";
    case "en_changed_mark_stale":
      return "Stale (English changed)";
    default:
      return eventType.replaceAll("_", " ");
  }
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

function StatusBadgeWithTooltip({
  status,
  label,
}: {
  status: BioEsStatus;
  label: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span className="inline-flex cursor-help">
          <span
            className={cn(
              "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
              statusBadgeClass(status),
            )}
          >
            {label}
          </span>
        </span>
      </TooltipTrigger>
      <TooltipContent side="top">{STATUS_TOOLTIPS[status]}</TooltipContent>
    </Tooltip>
  );
}

export function TranslationsBioWorkflowTable({
  rows,
  auditByTalentId,
  statusFilter,
  q,
  bioSort,
  sortDir,
  openNextMissingHref,
  aiConfigured,
}: {
  rows: TalentBioWorkflowRow[];
  auditByTalentId: Record<string, AuditPreviewRow[] | undefined>;
  statusFilter: BioFilterKey;
  q: string;
  bioSort: BioSortKey;
  sortDir: SortDir;
  openNextMissingHref: string | null;
  aiConfigured: boolean;
}) {
  const router = useRouter();
  const { apanel, aid, openPanel, closePanel } = useAdminPanelState({
    pathname: "/admin/translations",
  });
  const bioDrawerOpen = apanel === TRANSLATIONS_APANEL_BIO && Boolean(aid);

  const watchedRow = aid ? rows.find((r) => r.id === aid) : undefined;
  const rowDataTick = watchedRow
    ? `${watchedRow.bio_es ?? ""}|${watchedRow.bio_es_draft ?? ""}|${watchedRow.bio_es_status ?? ""}|${watchedRow.bio_es_updated_at ?? ""}`
    : "";

  const [panelLoading, setPanelLoading] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);
  const [panelData, setPanelData] = useState<BioTranslationPanelPayload | null>(null);

  useEffect(() => {
    if (!bioDrawerOpen || !aid) {
      setPanelData(null);
      setPanelError(null);
      setPanelLoading(false);
      return;
    }
    let cancelled = false;
    setPanelLoading(true);
    setPanelError(null);
    void adminLoadBioTranslationPanelData({ talent_profile_id: aid }).then((res) => {
      if (cancelled) return;
      setPanelLoading(false);
      if ("error" in res && res.error) {
        setPanelError(res.error);
        setPanelData(null);
        return;
      }
      if ("data" in res && res.data) setPanelData(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, [bioDrawerOpen, aid, rowDataTick]);

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

  const missingFillTargets = useMemo(() => {
    return rows.filter((r) => {
      if ((r.bio_es ?? "").trim()) return false;
      const raw = r.bio_es_status;
      if (raw != null && raw !== "" && isBioEsStatus(raw) && parseBioEsStatus(raw) === "reviewed") {
        return false;
      }
      return true;
    });
  }, [rows]);

  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const el = headerCheckboxRef.current;
    if (el) el.indeterminate = someSelected && !allSelected;
  }, [someSelected, allSelected]);

  useEffect(() => {
    setRowAiPhase({});
  }, [rowIds]);

  async function runBulkAi(ids: string[]) {
    if (!aiConfigured || ids.length === 0 || aiRunning) return;
    setAiRunning(true);
    setRowAiPhase({});
    let created = 0;
    let skipped = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        setAiProgressLine(`Processing ${i + 1} of ${ids.length}…`);
        setRowAiPhase((prev) => ({ ...prev, [id]: "translating" }));
        const res = await adminAiRunProfileTranslationJob({ talent_profile_id: id });
        if (!res.ok) {
          failed += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "error" }));
        } else if (res.skipped) {
          skipped += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        } else {
          created += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        }
      }
      if (created > 0 && failed > 0) {
        toast.message(
          `${created} updated, ${failed} failed — check row indicators or try again for failed profiles.`,
        );
      } else if (created > 0) {
        const skipPart = skipped > 0 ? ` (${skipped} skipped)` : "";
        toast.success(`${created} translation${created === 1 ? "" : "s"} created${skipPart}`);
      } else if (failed > 0) {
        toast.message(friendlyAiFailureMessage("Some requests failed — check row indicators."));
      } else if (skipped > 0) {
        toast.message(`Skipped ${skipped} profile${skipped === 1 ? "" : "s"} (e.g. manual reviewed).`);
      }
      setSelected(new Set());
      router.refresh();
    } finally {
      setAiProgressLine(null);
      setAiRunning(false);
    }
  }

  async function runTranslateAllMissing() {
    if (!aiConfigured || missingFillTargets.length === 0 || aiRunning) return;
    setAllMissingOpen(false);
    setAiRunning(true);
    setRowAiPhase({});
    const ids = missingFillTargets.map((r) => r.id);
    let created = 0;
    let failed = 0;
    try {
      for (let i = 0; i < ids.length; i++) {
        const id = ids[i]!;
        setAiProgressLine(`Processing ${i + 1} of ${ids.length}…`);
        setRowAiPhase((prev) => ({ ...prev, [id]: "translating" }));
        const res = await adminAiFillMissingSpanishBio({ talent_profile_id: id });
        if (res.error) {
          failed += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "error" }));
        } else {
          created += 1;
          setRowAiPhase((prev) => ({ ...prev, [id]: "done" }));
        }
      }
      if (created > 0 && failed > 0) {
        toast.message(
          `${created} filled, ${failed} failed — check row indicators or retry failed profiles.`,
        );
      } else if (created > 0) {
        toast.success(`${created} translation${created === 1 ? "" : "s"} created`);
      } else if (failed > 0) {
        toast.message("AI unavailable — edit manually.");
      }
      router.refresh();
    } finally {
      setAiProgressLine(null);
      setAiRunning(false);
    }
  }

  function runBulkReviewed(ids: string[]) {
    start(async () => {
      const res = await adminBulkMarkSpanishBioReviewed({ talent_profile_ids: ids });
      if ("error" in res && res.error) {
        toast.error(res.error);
        return;
      }
      if ("failed" in res) {
        if (res.failed.length) {
          toast.message(
            `Updated ${res.ok}; ${res.failed.length} failed (e.g. ${res.failed[0]!.message})`,
          );
        } else {
          toast.success(`Updated ${res.ok} profile${res.ok === 1 ? "" : "s"}`);
        }
        setSelected(new Set());
        router.refresh();
      }
    });
  }

  function runRowAction(kind: "reviewed" | "ai", talentId: string) {
    start(async () => {
      if (kind === "reviewed") {
        const r = await adminMarkSpanishBioReviewed({ talent_profile_id: talentId });
        if (r.error) toast.error(r.error);
        else {
          toast.success("Marked reviewed");
          router.refresh();
        }
        return;
      }
      setRowAiPhase((p) => ({ ...p, [talentId]: "translating" }));
      const r = await adminAiRunProfileTranslationJob({ talent_profile_id: talentId });
      if (!r.ok) {
        setRowAiPhase((p) => ({ ...p, [talentId]: "error" }));
        toast.error(friendlyAiFailureMessage(r.error));
        return;
      }
      if (r.skipped) {
        setRowAiPhase((p) => ({ ...p, [talentId]: "done" }));
        toast.message("Skipped (manual reviewed profile)");
        return;
      }
      setRowAiPhase((p) => ({ ...p, [talentId]: "done" }));
      toast.success("AI translation applied");
      router.refresh();
    });
  }

  return (
    <TooltipProvider delayDuration={300}>
      <div className="rounded-2xl border border-border/45 bg-card/50 shadow-[0_12px_40px_-28px_rgba(0,0,0,0.35)]">
        <div className="flex flex-col gap-3 border-b border-border/50 px-5 py-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
            <p className="text-sm text-muted-foreground">
              Showing {rows.length} profile{rows.length === 1 ? "" : "s"}
              {rows.length === 250 ? (
                <span className="ml-1 text-amber-200/90">(first 250 — narrow filters or search)</span>
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
                disabled={!aiConfigured || aiRunning || missingFillTargets.length === 0}
                aria-busy={aiRunning}
                title={
                  !aiConfigured
                    ? "Configure OPENAI_API_KEY"
                    : "Fill missing Spanish bios for every row on this list (current filter)"
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
                title="Sets legacy Spanish status to reviewed (staff verification — not a publish step)"
                onClick={() => runBulkReviewed(selectedIds)}
              >
                Mark reviewed
              </Button>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-8 rounded-full"
                disabled={!aiConfigured || aiRunning || selectedIds.length === 0}
                aria-busy={aiRunning}
                title={
                  !aiConfigured
                    ? "Configure OPENAI_API_KEY"
                    : "Missing Spanish → fill; other rows follow legacy DB rules in this bulk tool."
                }
                onClick={() => void runBulkAi(selectedIds)}
              >
                Bulk AI
              </Button>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[920px] text-left text-sm">
            <caption className="sr-only">
              Talent bios translation queue. Columns: select, expand for audit trail, name, profile code, legacy
              Spanish status flags, optional buffer column, Spanish and English live text timestamps, and row actions.
            </caption>
            <thead className={cn("border-b border-border/50 text-xs uppercase tracking-wider", ADMIN_TABLE_HEAD)}>
              <tr>
                <th className={cn(ADMIN_TABLE_TH, "w-10 py-3")}>
                  <input
                    ref={headerCheckboxRef}
                    type="checkbox"
                    className="size-4 rounded border-border accent-[var(--impronta-gold)]"
                    checked={allSelected}
                    onChange={(e) => toggleAll(e.target.checked)}
                    aria-label="Select all on this page"
                  />
                </th>
                <th className={cn(ADMIN_TABLE_TH, "w-8 py-3")} aria-label="Expand row for audit history" />
                <th className={cn(ADMIN_TABLE_TH, "py-3")} title="Display name">
                  <SortHeader
                    label="Talent"
                    titleAttr="Sort by display name"
                    href={bioSortHref("name", bioSort, sortDir, statusFilter, q)}
                    active={bioSort === "name"}
                    ascending={sortDir === "asc"}
                  />
                  <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    Display name
                  </span>
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-3")} title="Public profile code">
                  <SortHeader
                    label="Code"
                    titleAttr="Sort by profile code"
                    href={bioSortHref("code", bioSort, sortDir, statusFilter, q)}
                    active={bioSort === "code"}
                    ascending={sortDir === "asc"}
                  />
                  <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    TAL-… ID
                  </span>
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-3")} title="Legacy Spanish status column (internal)">
                  <span className="block">ES status</span>
                  <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    Internal / legacy
                  </span>
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-3")} title="Optional Spanish buffer column (internal)">
                  <span className="block">Buffer</span>
                  <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    Optional ES copy
                  </span>
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-3")} title="Spanish live bio (en-GB)">
                  <SortHeader
                    label="ES live"
                    titleAttr="Spanish live bio — en-GB format"
                    href={bioSortHref("es_at", bioSort, sortDir, statusFilter, q)}
                    active={bioSort === "es_at"}
                    ascending={sortDir === "asc"}
                  />
                  <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    Spanish updated
                  </span>
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-3")} title="English source bio (en-GB)">
                  <SortHeader
                    label="EN source"
                    titleAttr="English bio — en-GB format"
                    href={bioSortHref("en_at", bioSort, sortDir, statusFilter, q)}
                    active={bioSort === "en_at"}
                    ascending={sortDir === "asc"}
                  />
                  <span className="mt-1 block text-[10px] font-normal normal-case tracking-normal text-muted-foreground">
                    English updated
                  </span>
                </th>
                <th className={cn(ADMIN_TABLE_TH, "py-3 text-right")}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const rawStatus = row.bio_es_status;
                const unset = rawStatus != null && rawStatus !== "" && !isBioEsStatus(rawStatus);
                const st = unset ? null : parseBioEsStatus(rawStatus);
                const hasEs = Boolean((row.bio_es ?? "").trim());
                const hasDraft = Boolean((row.bio_es_draft ?? "").trim());
                const isOpen = expanded === row.id;
                const audits = auditByTalentId[row.id] ?? [];

                return (
                  <Fragment key={row.id}>
                    <tr
                      className={cn(
                        "cursor-pointer border-b border-border/40 last:border-0",
                        isOpen ? "bg-muted/20" : "hover:bg-muted/10",
                      )}
                      onClick={() => setExpanded((prev) => (prev === row.id ? null : row.id))}
                    >
                      <td
                        className="px-4 py-2"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="checkbox"
                          className="size-4 rounded border-border accent-[var(--impronta-gold)]"
                          checked={selected.has(row.id)}
                          onChange={(e) => toggleOne(row.id, e.target.checked)}
                          aria-label={`Select ${row.display_name?.trim() || row.profile_code}`}
                        />
                      </td>
                      <td className="px-1 py-2 text-muted-foreground">
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
                      <td className="px-4 py-2">
                        <div className="text-sm font-medium leading-snug text-foreground">
                          {row.display_name?.trim() || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                        {row.profile_code}
                      </td>
                      <td className="px-4 py-2" onClick={(e) => e.stopPropagation()}>
                        {unset ? (
                          <span
                            className={cn(
                              "inline-flex rounded-md border px-2 py-0.5 text-[10px] font-semibold uppercase",
                              "border-zinc-500/40 bg-zinc-500/10 text-zinc-200",
                            )}
                          >
                            unset ({rawStatus})
                          </span>
                        ) : (
                          <StatusBadgeWithTooltip
                            status={st!}
                            label={esStatusColumnLabel(st!, hasEs)}
                          />
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {hasDraft ? (
                          <span className="inline-flex rounded-md border border-amber-500/45 bg-amber-500/12 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-950 dark:text-amber-50">
                            Buffer present
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">No buffer</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums leading-snug">
                        {row.bio_es_updated_at ? formatAdminTimestamp(row.bio_es_updated_at) : "—"}
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground tabular-nums leading-snug">
                        {row.bio_en_updated_at ? formatAdminTimestamp(row.bio_en_updated_at) : "—"}
                      </td>
                      <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-8"
                            onClick={() => openPanel(TRANSLATIONS_APANEL_BIO, row.id)}
                            onMouseEnter={() => router.prefetch(`/admin/talent/${row.id}`)}
                            onFocus={() => router.prefetch(`/admin/talent/${row.id}`)}
                          >
                            Open editor
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
                                disabled={pending}
                                title="Sets legacy Spanish status to reviewed (staff verification)"
                                onClick={() => runRowAction("reviewed", row.id)}
                              >
                                Mark reviewed
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start"
                                disabled={pending || !aiConfigured || aiRunning}
                                title={
                                  aiConfigured
                                    ? "Generate or refresh Spanish using AI (respects workflow rules)"
                                    : "Configure OPENAI_API_KEY to enable AI actions"
                                }
                                onClick={() => runRowAction("ai", row.id)}
                              >
                                AI translate
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-9 w-full justify-start text-muted-foreground"
                                type="button"
                                title="Expand the row to see the latest audit events"
                                onClick={() => setExpanded(row.id)}
                              >
                                Show audit in row
                              </Button>
                            </PopoverContent>
                          </Popover>
                        </div>
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr className="border-b border-border/40 bg-muted/15">
                        <td colSpan={9} className="px-4 py-3 text-sm">
                          <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                            Recent activity
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Up to the three latest translation events for this profile (newest first).
                          </p>
                          {audits.length > 0 ? (
                            <ul className="mt-3 space-y-3">
                              {audits.map((a, evIdx) => (
                                <li
                                  key={`${row.id}-audit-${evIdx}`}
                                  className="rounded-lg border border-border/50 bg-background/40 px-3 py-2"
                                >
                                  <dl className="grid gap-1 sm:grid-cols-[auto_1fr] sm:gap-x-4">
                                    <dt className="text-muted-foreground">Event</dt>
                                    <dd>{eventTypeLabel(a.event_type)}</dd>
                                    <dt className="text-muted-foreground">When</dt>
                                    <dd className="tabular-nums">{formatAdminTimestamp(a.created_at)}</dd>
                                    <dt className="text-muted-foreground">Actor</dt>
                                    <dd>
                                      {a.actor_kind === "ai"
                                        ? "AI"
                                        : a.actor_kind === "system"
                                          ? "System"
                                          : a.actor_label ?? "Staff user"}
                                    </dd>
                                  </dl>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-2 text-muted-foreground">
                              No audit events recorded for this profile yet.
                            </p>
                          )}
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

      <DashboardEditPanel
        open={bioDrawerOpen}
        onOpenChange={(next) => {
          if (!next) closePanel();
        }}
        title={
          watchedRow?.display_name?.trim() ||
          watchedRow?.profile_code ||
          "Spanish bio"
        }
        description="Edit Spanish while keeping filters and triage context. Full profile tools stay on the talent hub."
        className={ADMIN_DRAWER_CLASS_WIDE}
      >
        {aid ? (
          <p className="mb-4 text-sm">
            <Link
              href={`/admin/talent/${aid}`}
              className="font-medium text-[var(--impronta-gold)] underline-offset-4 hover:underline"
              onClick={() => closePanel()}
            >
              Open full talent workspace
            </Link>
          </p>
        ) : null}
        {panelLoading ? (
          <div className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" aria-hidden />
            <span className="text-sm">Loading editor…</span>
          </div>
        ) : panelError ? (
          <p className="text-sm text-destructive">{panelError}</p>
        ) : panelData ? (
          <AdminTalentBioTranslationPanel
            talentProfileId={panelData.talent_profile_id}
            bio_en={panelData.bio_en}
            bio_es={panelData.bio_es}
            bio_en_updated_at={panelData.bio_en_updated_at}
            bio_es_updated_at={panelData.bio_es_updated_at}
            short_bio={panelData.short_bio}
            openAiAvailable={panelData.open_ai_available}
          />
        ) : null}
      </DashboardEditPanel>

      {allMissingOpen ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="translations-ai-all-missing-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border/60 bg-card p-6 shadow-lg">
            <h2 id="translations-ai-all-missing-title" className="text-lg font-semibold text-foreground">
              Translate missing bios?
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Translate {missingFillTargets.length} item{missingFillTargets.length === 1 ? "" : "s"}? Only profiles
              with empty Spanish and not in manual reviewed state are included (current table, current filters).
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
                onClick={() => void runTranslateAllMissing()}
              >
                Translate {missingFillTargets.length} items
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </TooltipProvider>
  );
}
