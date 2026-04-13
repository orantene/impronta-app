"use client";

import { useRouter } from "next/navigation";
import { useActionState, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronsDownUp,
  ChevronsUpDown,
  ListFilter,
  Search,
  Sparkles,
} from "lucide-react";
import {
  assignTaxonomyToSelf,
  removeTaxonomyFromSelf,
  type TalentFormState,
} from "@/app/(dashboard)/talent/actions";
import { Input } from "@/components/ui/input";
import type {
  TalentEditableTaxonomyField,
  TalentTaxonomyTermOption,
} from "@/lib/talent-dashboard-data";
import {
  dispatchTalentWorkspaceState,
  TALENT_PROFILE_SAVED,
} from "@/lib/talent-workspace-events";
import { cn } from "@/lib/utils";

function pickLabel(locale: "en" | "es", en: string, es?: string | null): string {
  if (locale === "es" && es && es.trim()) return es.trim();
  return en;
}

const searchCardBase =
  "rounded-2xl border border-border/45 bg-card/90 shadow-sm ring-1 ring-black/[0.03] dark:bg-zinc-900/85 dark:ring-white/[0.06]";

const sectionShell =
  "overflow-hidden rounded-2xl border border-border/45 bg-card/80 shadow-sm ring-1 ring-black/[0.03] transition-[border-color,box-shadow,ring-color] duration-200 dark:bg-zinc-900/72 dark:ring-white/[0.07] dark:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.04)]";

const bulkNavBtn =
  "inline-flex items-center gap-1 rounded-lg border border-border/50 bg-background/60 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm transition-colors hover:border-[var(--impronta-gold)]/35 hover:bg-[var(--impronta-gold)]/8 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/30 disabled:pointer-events-none disabled:opacity-40 dark:bg-zinc-950/50";

function TermToggle({
  term,
  assigned,
  isPrimaryTalentType,
  compact = false,
}: {
  term: TalentTaxonomyTermOption;
  assigned: boolean;
  isPrimaryTalentType: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [addState, addAction, addPending] = useActionState<TalentFormState, FormData>(
    assignTaxonomyToSelf,
    undefined,
  );
  const [removeState, removeAction, removePending] = useActionState<TalentFormState, FormData>(
    removeTaxonomyFromSelf,
    undefined,
  );

  const pending = addPending || removePending;
  const error = addState?.error ?? removeState?.error;

  useEffect(() => {
    dispatchTalentWorkspaceState({ profileSaving: pending });
  }, [pending]);

  useEffect(() => {
    if (addState?.error) toast.error(addState.error);
    if (removeState?.error) toast.error(removeState.error);
    if (addState?.success || removeState?.success) {
      document.dispatchEvent(new CustomEvent(TALENT_PROFILE_SAVED));
      dispatchTalentWorkspaceState({ profileDirty: false, profileSaving: false });
      toast.success("Tags updated.");
      router.refresh();
    }
  }, [addState, removeState, router]);

  const chipAssigned = cn(
    "inline-flex items-center rounded-xl border border-[var(--impronta-gold)]/45 bg-[var(--impronta-gold)]/12 font-medium text-[var(--impronta-gold)] shadow-sm transition-[transform,colors,box-shadow] duration-150 hover:bg-[var(--impronta-gold)]/20 hover:shadow-[0_0_0_1px_rgba(201,162,39,0.2)] active:scale-[0.98] disabled:opacity-50 motion-reduce:active:scale-100",
    compact ? "min-h-9 min-w-[2.75rem] gap-1 px-2 py-1 text-xs sm:min-h-8" : "min-h-11 min-w-[2.75rem] gap-1.5 px-3 py-1.5 text-sm sm:min-h-[2.25rem]",
  );
  const chipOpen = cn(
    "inline-flex items-center rounded-xl border border-border/50 bg-background/60 font-medium text-muted-foreground shadow-sm transition-[transform,colors] duration-150 hover:border-[var(--impronta-gold)]/40 hover:bg-muted/30 hover:text-foreground active:scale-[0.98] disabled:opacity-50 dark:bg-zinc-950/50 motion-reduce:active:scale-100",
    compact ? "min-h-9 min-w-[2.75rem] gap-0.5 px-2 py-1 text-xs sm:min-h-8" : "min-h-11 min-w-[2.75rem] gap-1 px-3 py-1.5 text-sm sm:min-h-[2.25rem]",
  );
  const maxW = compact ? "max-w-[9.5rem]" : "max-w-[200px]";

  if (assigned) {
    return (
      <div className={cn("inline-flex flex-wrap items-center", compact ? "gap-1" : "gap-1.5")}>
        <form action={removeAction}>
          <input type="hidden" name="taxonomy_term_id" value={term.id} />
          <button type="submit" disabled={pending} className={chipAssigned} title={error ?? undefined}>
            <span className={cn(maxW, "truncate")}>{term.name_en}</span>
            <span className="opacity-80" aria-hidden>
              ✕
            </span>
          </button>
        </form>
        {term.kind === "talent_type" && isPrimaryTalentType ? (
          <span
            className={cn(
              "rounded-full border border-[var(--impronta-gold)]/35 bg-[var(--impronta-gold)]/10 font-semibold uppercase tracking-wide text-[var(--impronta-gold)]",
              compact ? "px-1.5 py-0 text-[9px]" : "px-2 py-0.5 text-[10px]",
            )}
          >
            Primary
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form action={addAction}>
      <input type="hidden" name="taxonomy_term_id" value={term.id} />
      <button type="submit" disabled={pending} className={chipOpen} title={error ?? undefined}>
        <span className={cn(maxW, "truncate")}>{term.name_en}</span>
        <span className="text-muted-foreground/80" aria-hidden>
          +
        </span>
      </button>
    </form>
  );
}

export function TalentTaxonomyEditor({
  allTerms,
  assignedIds,
  primaryTalentTypeId,
  editableFields,
  locale = "en",
  /** When true (e.g. dedicated Categories sheet), expand sections with selections when opened. */
  sheetOpen = false,
  /**
   * `embedded` = inside a field-group sheet (tighter chrome, denser tags).
   * `sheet` = full Categories panel (roomier).
   */
  variant = "sheet",
}: {
  allTerms: TalentTaxonomyTermOption[];
  assignedIds: string[];
  primaryTalentTypeId: string | null;
  editableFields: TalentEditableTaxonomyField[];
  locale?: "en" | "es";
  sheetOpen?: boolean;
  variant?: "sheet" | "embedded";
}) {
  const [q, setQ] = useState("");
  const [selectedOnly, setSelectedOnly] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set());
  const sheetEnteredRef = useRef(false);
  const embeddedFieldsKeyRef = useRef("");
  const embeddedInitRef = useRef(false);
  const suppressDefaultExpansionRef = useRef(false);
  const skipPersistRef = useRef(false);

  const isEmbedded = variant === "embedded";

  const allowedKinds = useMemo(() => {
    return new Set(editableFields.map((f) => f.taxonomy_kind));
  }, [editableFields]);

  const visibleTerms = useMemo(() => {
    return allTerms.filter((t) => allowedKinds.has(t.kind));
  }, [allTerms, allowedKinds]);

  const qNorm = q.trim().toLowerCase();
  const termsAfterSearch = useMemo(() => {
    if (!qNorm) return visibleTerms;
    return visibleTerms.filter((t) => {
      const name = pickLabel(locale, t.name_en, t.name_es).toLowerCase();
      return name.includes(qNorm);
    });
  }, [visibleTerms, qNorm, locale]);

  const displayTerms = useMemo(() => {
    if (!selectedOnly) return termsAfterSearch;
    return termsAfterSearch.filter((t) => assignedIds.includes(t.id));
  }, [termsAfterSearch, selectedOnly, assignedIds]);

  const editableFieldsKey = useMemo(
    () => editableFields.map((f) => f.key).sort().join("\0"),
    [editableFields],
  );

  const storageKey = useMemo(
    () => `impronta_taxonomy_exp_v1:${variant}:${editableFieldsKey}`,
    [variant, editableFieldsKey],
  );

  useLayoutEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem(storageKey);
      if (!raw) return;
      const arr = JSON.parse(raw) as unknown;
      if (!Array.isArray(arr)) return;
      const valid = new Set(editableFields.map((f) => f.key));
      const next = new Set(
        arr.filter((k): k is string => typeof k === "string" && valid.has(k)),
      );
      if (next.size > 0) {
        setExpandedSections(next);
        suppressDefaultExpansionRef.current = true;
        skipPersistRef.current = true;
      }
    } catch {
      /* ignore */
    }
  }, [storageKey, editableFields]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (skipPersistRef.current) {
      skipPersistRef.current = false;
      return;
    }
    try {
      sessionStorage.setItem(storageKey, JSON.stringify([...expandedSections]));
    } catch {
      /* quota */
    }
  }, [storageKey, expandedSections]);

  useEffect(() => {
    if (!sheetOpen || isEmbedded) {
      sheetEnteredRef.current = false;
      return;
    }
    if (suppressDefaultExpansionRef.current) {
      suppressDefaultExpansionRef.current = false;
      sheetEnteredRef.current = true;
      return;
    }
    if (sheetEnteredRef.current || editableFields.length === 0) return;
    sheetEnteredRef.current = true;

    const next = new Set<string>();
    for (const field of editableFields) {
      const terms = visibleTerms.filter((t) => t.kind === field.taxonomy_kind);
      if (terms.some((t) => assignedIds.includes(t.id))) next.add(field.key);
    }
    if (next.size === 0 && editableFields[0]) next.add(editableFields[0].key);
    setExpandedSections(next);
  }, [sheetOpen, isEmbedded, editableFields, visibleTerms, assignedIds]);

  useEffect(() => {
    if (!isEmbedded) {
      embeddedInitRef.current = false;
      embeddedFieldsKeyRef.current = "";
      return;
    }
    if (editableFieldsKey !== embeddedFieldsKeyRef.current) {
      embeddedFieldsKeyRef.current = editableFieldsKey;
      embeddedInitRef.current = false;
    }
    if (suppressDefaultExpansionRef.current) {
      suppressDefaultExpansionRef.current = false;
      embeddedInitRef.current = true;
      return;
    }
    if (embeddedInitRef.current || editableFields.length === 0) return;
    embeddedInitRef.current = true;

    const next = new Set<string>();
    for (const field of editableFields) {
      const terms = visibleTerms.filter((t) => t.kind === field.taxonomy_kind);
      if (terms.some((t) => assignedIds.includes(t.id))) next.add(field.key);
    }
    if (next.size === 0 && editableFields[0]) next.add(editableFields[0].key);
    setExpandedSections(next);
  }, [isEmbedded, editableFieldsKey, editableFields, visibleTerms, assignedIds]);

  const toggleSection = (key: string) => {
    setExpandedSections((prev) => {
      const n = new Set(prev);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  };

  useEffect(() => {
    if (!qNorm) return;
    const matching = new Set<string>();
    for (const field of editableFields) {
      const hasMatch = termsAfterSearch.some((t) => t.kind === field.taxonomy_kind);
      if (hasMatch) matching.add(field.key);
    }
    setExpandedSections(matching);
  }, [qNorm, termsAfterSearch, editableFields]);

  const totalAssignedInView = useMemo(() => {
    return visibleTerms.filter((t) => assignedIds.includes(t.id)).length;
  }, [visibleTerms, assignedIds]);

  const allGroupKeys = useMemo(() => editableFields.map((f) => f.key), [editableFields]);
  const showBulkToggle = allGroupKeys.length >= 1;
  const expandedCount = expandedSections.size;
  const allExpanded = expandedCount === allGroupKeys.length && allGroupKeys.length > 0;
  const allCollapsed = expandedCount === 0;

  const expandAllGroups = () => {
    setExpandedSections(new Set(allGroupKeys));
  };

  const collapseAllGroups = () => {
    setExpandedSections(new Set());
  };

  if (allTerms.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 bg-muted/15 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground">
        No categories are available yet. The agency will add tags you can choose from.
      </div>
    );
  }

  if (visibleTerms.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-border/50 bg-muted/15 px-4 py-8 text-center text-sm leading-relaxed text-muted-foreground">
        No editable tag groups right now. If this looks wrong, contact the agency.
      </div>
    );
  }

  const searchCardClass = cn(searchCardBase, isEmbedded ? "p-2.5" : "p-3.5");

  const summaryLine =
    editableFields.length <= 1 ? (
      <>
        <span className="font-semibold tabular-nums text-foreground">{totalAssignedInView}</span> selected in
        this section
      </>
    ) : (
      <>
        <span className="font-semibold tabular-nums text-foreground">{totalAssignedInView}</span> selected
        across {editableFields.length} groups
      </>
    );

  return (
    <div className={cn(isEmbedded ? "space-y-4" : "space-y-5")}>
      <div className={searchCardClass}>
        <label
          className={cn(
            "mb-2 flex items-center gap-2 font-semibold uppercase tracking-[0.18em] text-muted-foreground",
            isEmbedded ? "text-[10px]" : "text-[11px]",
          )}
        >
          <Sparkles className={cn("shrink-0 text-[var(--impronta-gold)]", isEmbedded ? "size-3" : "size-3.5")} aria-hidden />
          Find tags
        </label>
        <div className="relative">
          <Search
            className={cn(
              "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground/70",
              isEmbedded ? "left-3 size-3.5" : "left-3.5 size-4",
            )}
            aria-hidden
          />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={isEmbedded ? "Filter tags…" : "Search by name…"}
            className={cn(
              "w-full rounded-xl border-border/50 bg-background/90 py-2 pr-3 shadow-inner shadow-black/[0.03] placeholder:text-muted-foreground focus-visible:border-[var(--impronta-gold)]/45 focus-visible:ring-[var(--impronta-gold)]/20 dark:bg-zinc-950/60",
              isEmbedded ? "h-10 pl-9 text-sm" : "h-12 pl-10 text-[15px]",
            )}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSelectedOnly((v) => !v)}
            aria-pressed={selectedOnly}
            disabled={totalAssignedInView === 0}
            className={cn(
              bulkNavBtn,
              "gap-1.5",
              selectedOnly &&
                "border-[var(--impronta-gold)]/35 bg-[var(--impronta-gold)]/10 text-[var(--impronta-gold)]",
            )}
          >
            <ListFilter className="size-3 opacity-80" aria-hidden />
            Selected only
          </button>
          {selectedOnly ? (
            <span className="text-[11px] text-foreground/70">Showing tags on your profile</span>
          ) : null}
        </div>
        <div
          className={cn(
            "flex flex-wrap items-center justify-between gap-y-2 gap-x-3 border-border/35 pt-3",
            isEmbedded ? "mt-2 border-t" : "mt-3 border-t",
          )}
        >
          <p className={cn("min-w-0 flex-1 text-foreground/70", isEmbedded ? "text-[11px] leading-snug" : "text-xs")}>
            {summaryLine}
          </p>
          <div className="flex flex-wrap items-center justify-end gap-2">
            {showBulkToggle ? (
              <>
                <button
                  type="button"
                  onClick={expandAllGroups}
                  disabled={allExpanded}
                  className={bulkNavBtn}
                  title="Open every category"
                >
                  <ChevronsUpDown className="size-3 opacity-70" aria-hidden />
                  Expand all
                </button>
                <button
                  type="button"
                  onClick={collapseAllGroups}
                  disabled={allCollapsed}
                  className={bulkNavBtn}
                  title="Close every category"
                >
                  <ChevronsDownUp className="size-3 opacity-70" aria-hidden />
                  Collapse all
                </button>
              </>
            ) : null}
            {qNorm ? (
              <button
                type="button"
                onClick={() => setQ("")}
                className={cn(
                  "rounded-lg font-medium text-[var(--impronta-gold)] transition-colors hover:bg-[var(--impronta-gold)]/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--impronta-gold)]/30",
                  isEmbedded ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-1 text-xs",
                )}
              >
                Clear search
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className={cn(isEmbedded ? "space-y-2.5" : "space-y-3")}>
        {editableFields.map((field) => {
          const sectionTerms = displayTerms.filter((t) => t.kind === field.taxonomy_kind);
          const assignedCount = sectionTerms.filter((t) => assignedIds.includes(t.id)).length;
          const isOpen = expandedSections.has(field.key);
          const label = pickLabel(locale, field.label_en, field.label_es);

          return (
            <div
              key={field.key}
              className={cn(
                sectionShell,
                isOpen && "border-[var(--impronta-gold)]/25 shadow-md ring-[var(--impronta-gold)]/10 dark:border-[var(--impronta-gold)]/20",
              )}
            >
              <button
                type="button"
                onClick={() => toggleSection(field.key)}
                className={cn(
                  "flex w-full touch-manipulation items-center gap-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--impronta-gold)]/35",
                  isEmbedded ? "min-h-[48px] px-3.5 py-3 sm:min-h-0" : "min-h-[52px] gap-3 px-4 py-4 sm:min-h-0",
                  isOpen ? "bg-muted/15 dark:bg-zinc-950/40" : "hover:bg-muted/20 dark:hover:bg-zinc-950/35",
                )}
              >
                <div className={cn("flex min-w-0 flex-1 flex-col", isEmbedded ? "gap-0.5" : "gap-1")}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        "font-semibold leading-snug tracking-tight text-foreground",
                        isEmbedded ? "text-sm" : "text-[15px]",
                      )}
                    >
                      {label}
                    </span>
                    {assignedCount > 0 ? (
                      <span className="flex min-h-[1.35rem] min-w-[1.35rem] items-center justify-center rounded-full bg-[var(--impronta-gold)]/18 px-2 text-xs font-bold tabular-nums text-[var(--impronta-gold)] ring-1 ring-[var(--impronta-gold)]/25">
                        {assignedCount}
                      </span>
                    ) : (
                      <span className="rounded-full border border-border/50 bg-muted/25 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                        None yet
                      </span>
                    )}
                  </div>
                  <span
                    className={cn("text-muted-foreground", isEmbedded ? "text-[11px] leading-snug" : "text-xs")}
                  >
                    {sectionTerms.length} option{sectionTerms.length === 1 ? "" : "s"}
                    {selectedOnly ? " · selected only" : ""}
                    {qNorm ? ` · ${sectionTerms.length} match${sectionTerms.length === 1 ? "" : "es"}` : ""}
                  </span>
                </div>
                <span
                  className={cn(
                    "flex shrink-0 items-center justify-center rounded-xl border border-border/40 bg-background/70 text-muted-foreground dark:bg-zinc-950/60",
                    isEmbedded ? "size-8" : "size-9",
                    isOpen && "border-[var(--impronta-gold)]/25 text-[var(--impronta-gold)]",
                  )}
                >
                  <ChevronDown
                    className={cn(
                      "transition-transform duration-200",
                      isEmbedded ? "size-3.5" : "size-4",
                      isOpen && "rotate-180",
                    )}
                  />
                </span>
              </button>

              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-300 ease-[cubic-bezier(0.33,1,0.68,1)] motion-reduce:transition-none",
                  isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <div className="min-h-0 overflow-hidden">
                  <div
                    className={cn(
                      "border-t border-border/40 bg-gradient-to-b from-muted/10 to-transparent dark:from-zinc-950/50",
                      isEmbedded ? "px-3.5 py-3" : "px-4 py-4",
                    )}
                  >
                    {sectionTerms.length > 0 ? (
                      <div className={cn("flex flex-wrap", isEmbedded ? "gap-2" : "gap-2.5")}>
                        {sectionTerms.map((term) => {
                          const assigned = assignedIds.includes(term.id);
                          const isPrimaryTalentType =
                            field.taxonomy_kind === "talent_type" && primaryTalentTypeId === term.id;
                          return (
                            <TermToggle
                              key={term.id}
                              term={term}
                              assigned={assigned}
                              isPrimaryTalentType={isPrimaryTalentType}
                              compact={isEmbedded}
                            />
                          );
                        })}
                      </div>
                    ) : (
                      <p className={cn("text-muted-foreground", isEmbedded ? "text-xs" : "text-sm")}>
                        No tags match your search.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
