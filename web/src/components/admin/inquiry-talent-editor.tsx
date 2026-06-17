"use client";

import Image from "next/image";
import Link from "next/link";
import { useActionState, useMemo, useState, useTransition } from "react";
import { useQueuedRouterRefresh } from "@/lib/ui/use-queued-router-refresh";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Lock, Plus, Search, Trash2 } from "lucide-react";
import { addInquiryTalent, type AdminActionState, moveInquiryTalent, removeInquiryTalent } from "@/lib/server-actions/admin-inquiries";
import {
  rosterAddTalent,
  rosterMoveParticipant,
  rosterRemoveParticipant,
} from "@/lib/server-actions/admin-inquiry-roster";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { handleActionResult, type ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { cn } from "@/lib/utils";

type TalentOption = {
  id: string;
  profile_code: string;
  display_name: string | null;
  /**
   * Picker enrichment (optional — populated by `enrichPickerTalents` in the
   * loader; absent for callers that don't enrich, so the picker degrades to
   * its original behavior). See `@/lib/inquiry/picker-talent-guard`.
   */
  isExclusiveElsewhere?: boolean;
  nextAvailableDate?: string | null;
  availableDaysInNext30?: number | null;
  availabilityDots14d?: string | null;
};

// ───────────────────────────────────────────────────────────────────────────
// Picker enrichment presentation helpers
// ───────────────────────────────────────────────────────────────────────────

/** Compact "N of next 30 days open" / "Next free Jun 24" label, mirroring Discover. */
function availabilityLabel(option: TalentOption): string | null {
  const days = option.availableDaysInNext30;
  if (typeof days === "number") {
    if (days === 0) return "Fully booked · 30d";
    return `${days} of 30 days open`;
  }
  const next = option.nextAvailableDate;
  if (next) {
    const d = new Date(next);
    if (!Number.isNaN(d.getTime())) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (d > today) {
        return `Next free ${d.toLocaleString("en-US", { month: "short" })} ${d.getDate()}`;
      }
    }
  }
  return null;
}

/** True when the enrichment says this talent has zero open days in the next 30. */
function isFullyBooked(option: TalentOption): boolean {
  return option.availableDaysInNext30 === 0;
}

/**
 * A small inline strip of 14 availability dots (·=free / ×=blocked), matching
 * the Discover card's binary-dots fast path. Renders nothing when no data.
 */
function AvailabilityDots({ dots }: { dots: string | null | undefined }) {
  if (!dots) return null;
  const chars = dots.split("").slice(0, 14);
  return (
    <span className="inline-flex items-center gap-[2px] align-middle" aria-hidden>
      {Array.from({ length: 14 }, (_, i) => {
        const c = chars[i];
        const color =
          c === "·" ? "#2E7D5B" : c === "×" ? "rgba(11,11,13,0.32)" : "rgba(11,11,13,0.12)";
        return (
          <span
            key={i}
            className="inline-block h-[5px] w-[5px] shrink-0 rounded-full"
            style={{ background: color }}
          />
        );
      })}
    </span>
  );
}

/**
 * Inline metadata row under a picker candidate's name: the exclusivity lock
 * chip (when the talent is bound to another agency) + an availability label
 * with a compact dots strip. Both are no-ops when the option carries no
 * enrichment, so unenriched callers render exactly as before.
 */
function TalentOptionMeta({ option }: { option: TalentOption }) {
  const availLabel = availabilityLabel(option);
  const exclusive = option.isExclusiveElsewhere === true;
  if (!availLabel && !exclusive && !option.availabilityDots14d) return null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
      {exclusive ? (
        <span
          title="Exclusive to another agency"
          className="inline-flex items-center gap-1 rounded-full border border-destructive/35 bg-destructive/5 px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] text-destructive"
        >
          <Lock className="h-3 w-3" />
          Exclusive
        </span>
      ) : null}
      {availLabel ? (
        <span
          className={cn(
            "inline-flex items-center gap-1.5 text-[11px]",
            isFullyBooked(option) ? "text-destructive/80" : "text-muted-foreground",
          )}
        >
          <AvailabilityDots dots={option.availabilityDots14d} />
          {availLabel}
        </span>
      ) : null}
    </span>
  );
}

type InquiryTalentRow = {
  id: string;
  talent_profile_id: string;
  profile_code: string;
  display_name: string | null;
  image_url?: string | null;
  tag_label?: string | null;
};

function matchTalent(option: TalentOption, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return option.profile_code.toLowerCase().includes(q) || (option.display_name ?? "").toLowerCase().includes(q);
}

function TalentDraftList({
  rows,
  onMove,
  onRemove,
}: {
  rows: TalentOption[];
  onMove: (index: number, direction: "up" | "down") => void;
  onRemove: (talentId: string) => void;
}) {
  return (
    <ul className="space-y-2">
      {rows.map((row, index) => (
        <li
          key={row.id}
          className="flex items-center justify-between gap-3 rounded-2xl border border-border/45 bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(255,255,255,0.3))] px-4 py-3 text-sm shadow-sm"
        >
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <span className="rounded-full border border-[var(--impronta-gold-border)]/60 bg-[var(--impronta-gold-muted)] px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--impronta-gold)]">
                {index + 1}
              </span>
              <p className="font-medium text-foreground">{row.display_name ?? row.profile_code}</p>
            </div>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{row.profile_code}</p>
            <TalentOptionMeta option={row} />
          </div>
          <div className="flex items-center gap-1">
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 px-0" disabled={index === 0} onClick={() => onMove(index, "up")}>
              <ArrowUp className="h-4 w-4" />
              <span className="sr-only">Move up</span>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-8 w-8 px-0"
              disabled={index === rows.length - 1}
              onClick={() => onMove(index, "down")}
            >
              <ArrowDown className="h-4 w-4" />
              <span className="sr-only">Move down</span>
            </Button>
            <Button type="button" variant="ghost" size="sm" className="h-8 w-8 px-0 text-destructive" onClick={() => onRemove(row.id)}>
              <Trash2 className="h-4 w-4" />
              <span className="sr-only">Remove</span>
            </Button>
          </div>
        </li>
      ))}
    </ul>
  );
}

function TalentAvatar({ row }: { row: InquiryTalentRow }) {
  if (row.image_url) {
    return (
      <Image
        src={row.image_url}
        alt={row.display_name ?? row.profile_code}
        width={64}
        height={64}
        className="h-16 w-16 rounded-2xl border border-border/50 object-cover shadow-sm"
      />
    );
  }

  return (
    <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-border/50 bg-muted/30 text-lg font-medium text-foreground shadow-sm">
      {(row.display_name ?? row.profile_code).slice(0, 1).toUpperCase()}
    </div>
  );
}

function RosterEngineV2RowControls({
  inquiryId,
  inquiryVersion,
  participantId,
  index,
  total,
}: {
  inquiryId: string;
  inquiryVersion: number;
  participantId: string;
  index: number;
  total: number;
}) {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [pending, startTransition] = useTransition();

  const feedback = (result: ActionResult) => {
    handleActionResult(result, {
      onToast: (m) => toast.message(m),
      onRefresh: () => queueRouterRefresh(),
      onInlineError: (m) => toast.error(m),
      onBlockerBanner: (m) => toast.error(m),
    });
  };

  const runMove = (direction: "up" | "down") => {
    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("participant_id", participantId);
    fd.set("direction", direction);
    fd.set("expected_version", String(inquiryVersion));
    startTransition(() => {
      void rosterMoveParticipant(fd).then((r) => feedback(r));
    });
  };

  const runRemove = () => {
    const fd = new FormData();
    fd.set("inquiry_id", inquiryId);
    fd.set("participant_id", participantId);
    fd.set("expected_version", String(inquiryVersion));
    startTransition(() => {
      void rosterRemoveParticipant(fd).then((r) => feedback(r));
    });
  };

  return (
    <div className="flex items-center gap-2 self-end sm:self-center">
      <div className="mr-1 rounded-full border border-[var(--impronta-gold-border)]/65 bg-[var(--impronta-gold-muted)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--impronta-gold)]">
        {index + 1}
      </div>
      <Button type="button" variant="outline" size="sm" className="h-9 w-9 rounded-full p-0" disabled={index === 0 || pending} onClick={() => runMove("up")}>
        <ArrowUp className="h-4 w-4" />
        <span className="sr-only">Move up</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 w-9 rounded-full p-0"
        disabled={index === total - 1 || pending}
        onClick={() => runMove("down")}
      >
        <ArrowDown className="h-4 w-4" />
        <span className="sr-only">Move down</span>
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-9 rounded-full border-destructive/35 px-3 text-destructive hover:bg-destructive/5"
        disabled={pending}
        onClick={runRemove}
      >
        <Trash2 className="mr-1 h-4 w-4" />
        Remove
      </Button>
    </div>
  );
}

/**
 * Toggle row used for the two additive picker filters ("Available only",
 * "Hide exclusive-to-other-agency"). Matches the cool admin token palette.
 */
function PickerFilterToggle({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (next: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="inline-flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
      <span>{label}</span>
    </label>
  );
}

export function InquiryTalentDraftField({
  talents,
  initialSelectedIds = [],
  inputName = "talent_ids",
}: {
  talents: TalentOption[];
  initialSelectedIds?: string[];
  inputName?: string;
}) {
  const [query, setQuery] = useState("");
  const initialRows = initialSelectedIds.map((id) => talents.find((talent) => talent.id === id)).filter(Boolean) as TalentOption[];
  const [selected, setSelected] = useState<TalentOption[]>(initialRows);
  // Additive filters — both default OFF so the picker is unchanged on first paint.
  const [availableOnly, setAvailableOnly] = useState(false);
  const [hideExclusive, setHideExclusive] = useState(false);
  // Two-step confirm before adding a talent who's exclusive to another agency.
  const [confirmId, setConfirmId] = useState<string | null>(null);

  // Only show the filter toggles when the candidates actually carry the
  // relevant enrichment — otherwise the controls would be no-ops.
  const hasAvailabilityData = useMemo(
    () => talents.some((t) => typeof t.availableDaysInNext30 === "number"),
    [talents],
  );
  const hasExclusivityData = useMemo(
    () => talents.some((t) => t.isExclusiveElsewhere === true),
    [talents],
  );

  const selectedIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);
  const filtered = useMemo(
    () =>
      talents
        .filter((option) => !selectedIds.has(option.id))
        .filter((option) => matchTalent(option, query))
        .filter((option) => !(availableOnly && option.availableDaysInNext30 === 0))
        .filter((option) => !(hideExclusive && option.isExclusiveElsewhere === true))
        .slice(0, 8),
    [query, selectedIds, talents, availableOnly, hideExclusive],
  );

  const addOption = (option: TalentOption) => {
    setSelected((current) => [...current, option]);
    setQuery("");
    setConfirmId(null);
  };

  return (
    <div className="space-y-3">
      <input type="hidden" name={inputName} value={selected.map((row) => row.id).join(",")} />
      <div className="rounded-2xl border border-border/45 bg-muted/10 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              // Drop a pending exclusive-confirm when the search changes so the
              // "Confirm" affordance can't carry over to a different candidate.
              setConfirmId(null);
            }}
            placeholder="Search talent by code or name"
            className="pl-9"
          />
        </div>
        {hasAvailabilityData || hasExclusivityData ? (
          <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2">
            {hasAvailabilityData ? (
              <PickerFilterToggle
                id="picker-available-only"
                label="Available only"
                checked={availableOnly}
                onCheckedChange={setAvailableOnly}
              />
            ) : null}
            {hasExclusivityData ? (
              <PickerFilterToggle
                id="picker-hide-exclusive"
                label="Hide exclusive-to-other-agency"
                checked={hideExclusive}
                onCheckedChange={setHideExclusive}
              />
            ) : null}
          </div>
        ) : null}
      </div>
      <div className="rounded-2xl border border-border/45 bg-background">
        {query.trim().length >= 1 ? (
          filtered.length > 0 ? (
            <ul className="divide-y divide-border/40">
              {filtered.map((option) => {
                const exclusive = option.isExclusiveElsewhere === true;
                const awaitingConfirm = confirmId === option.id;
                return (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30",
                        exclusive && "bg-destructive/[0.03]",
                        awaitingConfirm && "bg-destructive/[0.06]",
                      )}
                      onClick={() => {
                        // Exclusive-elsewhere requires an explicit confirm tap
                        // first (we warn, never hard-block).
                        if (exclusive && !awaitingConfirm) {
                          setConfirmId(option.id);
                          return;
                        }
                        addOption(option);
                      }}
                    >
                      <span className="min-w-0 text-sm">
                        <span className={cn("block font-medium", exclusive ? "text-foreground/70" : "text-foreground")}>
                          {option.display_name ?? option.profile_code}
                        </span>
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">{option.profile_code}</span>
                        <TalentOptionMeta option={option} />
                        {awaitingConfirm ? (
                          <span className="mt-1 block text-[11px] font-medium text-destructive">
                            Exclusive to another agency — tap again to add anyway.
                          </span>
                        ) : null}
                      </span>
                      <span
                        className={cn(
                          "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em]",
                          awaitingConfirm
                            ? "border-destructive/40 bg-destructive/5 text-destructive"
                            : "border-[var(--impronta-gold-border)]/70 bg-[var(--impronta-gold-muted)] text-[var(--impronta-gold)]",
                        )}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        {awaitingConfirm ? "Confirm" : "Add"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">No talent matches.</p>
          )
        ) : (
          <p className="px-3 py-3 text-sm text-muted-foreground">Search to add represented talent to this request.</p>
        )}
      </div>

      {selected.length > 0 ? (
        <TalentDraftList
          rows={selected}
          onMove={(index, direction) => {
            setSelected((current) => {
              const next = [...current];
              const targetIndex = direction === "up" ? index - 1 : index + 1;
              if (targetIndex < 0 || targetIndex >= next.length) return current;
              const [moved] = next.splice(index, 1);
              next.splice(targetIndex, 0, moved);
              return next;
            });
          }}
          onRemove={(talentId) => setSelected((current) => current.filter((row) => row.id !== talentId))}
        />
      ) : (
        <p className="rounded-[1.4rem] border border-dashed border-border/50 bg-muted/10 px-4 py-4 text-sm text-muted-foreground">
          No talent added yet.
        </p>
      )}
    </div>
  );
}

export function InquiryTalentEditor({
  inquiryId,
  allTalents,
  rows,
  engineV2 = false,
  inquiryVersion = 1,
}: {
  inquiryId: string;
  allTalents: TalentOption[];
  rows: InquiryTalentRow[];
  engineV2?: boolean;
  inquiryVersion?: number;
}) {
  const queueRouterRefresh = useQueuedRouterRefresh();
  const [query, setQuery] = useState("");
  const [selectedTalentId, setSelectedTalentId] = useState("");
  const [state, addAction, addPending] = useActionState<AdminActionState, FormData>(addInquiryTalent, undefined);
  const [v2AddPending, startV2Add] = useTransition();

  // Additive filters — both default OFF so the editor is unchanged on first paint.
  const [availableOnly, setAvailableOnly] = useState(false);
  const [hideExclusive, setHideExclusive] = useState(false);

  const hasAvailabilityData = useMemo(
    () => allTalents.some((t) => typeof t.availableDaysInNext30 === "number"),
    [allTalents],
  );
  const hasExclusivityData = useMemo(
    () => allTalents.some((t) => t.isExclusiveElsewhere === true),
    [allTalents],
  );

  const selectedIds = useMemo(() => new Set(rows.map((row) => row.talent_profile_id)), [rows]);
  const filtered = useMemo(
    () =>
      allTalents
        .filter((option) => !selectedIds.has(option.id))
        .filter((option) => matchTalent(option, query))
        .filter((option) => !(availableOnly && option.availableDaysInNext30 === 0))
        .filter((option) => !(hideExclusive && option.isExclusiveElsewhere === true))
        .slice(0, 8),
    [allTalents, query, selectedIds, availableOnly, hideExclusive],
  );

  const selectedOption = useMemo(
    () => allTalents.find((t) => t.id === selectedTalentId) ?? null,
    [allTalents, selectedTalentId],
  );

  const addFormAction = engineV2 ? undefined : addAction;
  const addPendingState = engineV2 ? v2AddPending : addPending;
  const addError = engineV2 ? undefined : state?.error;

  return (
    <div className="space-y-4">
      <form
        action={addFormAction}
        className="space-y-4 rounded-[1.5rem] border border-border/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.78),rgba(255,255,255,0.55))] p-4 shadow-sm"
        onSubmit={(event) => {
          setQuery("");
          setSelectedTalentId("");
          if (!engineV2) return;
          event.preventDefault();
          const fd = new FormData(event.currentTarget);
          startV2Add(() => {
            void rosterAddTalent(fd).then((result) =>
              handleActionResult(result, {
                onToast: (m) => toast.message(m),
                onRefresh: () => queueRouterRefresh(),
                onInlineError: (m) => toast.error(m),
                onBlockerBanner: (m) => toast.error(m),
              }),
            );
          });
        }}
      >
        <input type="hidden" name="inquiry_id" value={inquiryId} />
        <input type="hidden" name="talent_profile_id" value={selectedTalentId} />
        {engineV2 ? <input type="hidden" name="expected_version" value={String(inquiryVersion)} /> : null}
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">Add to shortlist</p>
          <p className="text-xs text-muted-foreground">Search represented talent by profile code or name, then add them to this inquiry.</p>
        </div>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search talent by code or name" className="pl-9" />
        </div>
        {hasAvailabilityData || hasExclusivityData ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            {hasAvailabilityData ? (
              <PickerFilterToggle
                id="editor-available-only"
                label="Available only"
                checked={availableOnly}
                onCheckedChange={setAvailableOnly}
              />
            ) : null}
            {hasExclusivityData ? (
              <PickerFilterToggle
                id="editor-hide-exclusive"
                label="Hide exclusive-to-other-agency"
                checked={hideExclusive}
                onCheckedChange={setHideExclusive}
              />
            ) : null}
          </div>
        ) : null}
        <div className="rounded-2xl border border-border/45 bg-background">
          {query.trim().length >= 1 ? (
            filtered.length > 0 ? (
              <ul className="divide-y divide-border/40">
                {filtered.map((option) => (
                  <li key={option.id}>
                    <button
                      type="button"
                      className={cn(
                        "flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30",
                        selectedTalentId === option.id && "bg-muted/30",
                        option.isExclusiveElsewhere === true && "bg-destructive/[0.03]",
                      )}
                      onClick={() => setSelectedTalentId(option.id)}
                    >
                      <span className="min-w-0 text-sm">
                        <span
                          className={cn(
                            "block font-medium",
                            option.isExclusiveElsewhere === true ? "text-foreground/70" : "text-foreground",
                          )}
                        >
                          {option.display_name ?? option.profile_code}
                        </span>
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">{option.profile_code}</span>
                        <TalentOptionMeta option={option} />
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-[var(--impronta-gold-border)]/70 bg-[var(--impronta-gold-muted)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-gold)]">
                        {selectedTalentId === option.id ? "Selected" : "Pick"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-3 py-3 text-sm text-muted-foreground">No talent matches.</p>
            )
          ) : (
            <p className="px-3 py-3 text-sm text-muted-foreground">Search to add talent to this inquiry.</p>
          )}
        </div>
        {selectedOption?.isExclusiveElsewhere === true ? (
          <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
            <Lock className="h-3.5 w-3.5" />
            {selectedOption.display_name ?? selectedOption.profile_code} is exclusive to another agency. Confirm before adding.
          </p>
        ) : null}
        {addError ? <p className="text-sm text-destructive">{addError}</p> : null}
        <Button type="submit" size="sm" className="rounded-full px-4" disabled={!selectedTalentId || addPendingState}>
          {addPendingState ? "Adding…" : "Add talent"}
        </Button>
      </form>

      {rows.length > 0 ? (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <li
              key={row.id}
              className="flex flex-col gap-4 rounded-[1.6rem] border border-border/50 bg-[linear-gradient(180deg,rgba(255,255,255,0.85),rgba(249,247,242,0.74))] p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 items-center gap-4">
                <TalentAvatar row={row} />

                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold text-foreground">{row.display_name ?? row.profile_code}</p>
                    <span className="rounded-full border border-border/45 bg-background/85 px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-muted-foreground">
                      {row.profile_code}
                    </span>
                    {row.tag_label ? (
                      <span className="rounded-full border border-[var(--impronta-gold-border)]/70 bg-[var(--impronta-gold-muted)] px-2 py-0.5 text-[11px] uppercase tracking-[0.16em] text-[var(--impronta-gold)]">
                        {row.tag_label}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex flex-wrap gap-2 text-xs">
                    <Link
                      href={`/t/${row.profile_code}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-[var(--impronta-gold-border)]/65 bg-[var(--impronta-gold-muted)] px-2.5 py-1 font-medium text-[var(--impronta-gold)] transition-colors hover:bg-[var(--impronta-gold-muted)]/80"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Public profile
                    </Link>
                    <Link
                      href={`/admin/talent/${row.talent_profile_id}`}
                      className="inline-flex items-center gap-1 rounded-full border border-border/55 bg-background/85 px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:border-border hover:text-foreground"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Admin profile
                    </Link>
                  </div>
                </div>
              </div>

              {engineV2 ? (
                <RosterEngineV2RowControls
                  inquiryId={inquiryId}
                  inquiryVersion={inquiryVersion}
                  participantId={row.id}
                  index={index}
                  total={rows.length}
                />
              ) : (
                <div className="flex items-center gap-2 self-end sm:self-center">
                  <div className="mr-1 rounded-full border border-[var(--impronta-gold-border)]/65 bg-[var(--impronta-gold-muted)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--impronta-gold)]">
                    {index + 1}
                  </div>
                  <form action={moveInquiryTalent}>
                    <input type="hidden" name="inquiry_id" value={inquiryId} />
                    <input type="hidden" name="inquiry_talent_id" value={row.id} />
                    <input type="hidden" name="direction" value="up" />
                    <Button type="submit" variant="outline" size="sm" className="h-9 w-9 rounded-full p-0" disabled={index === 0}>
                      <ArrowUp className="h-4 w-4" />
                      <span className="sr-only">Move up</span>
                    </Button>
                  </form>
                  <form action={moveInquiryTalent}>
                    <input type="hidden" name="inquiry_id" value={inquiryId} />
                    <input type="hidden" name="inquiry_talent_id" value={row.id} />
                    <input type="hidden" name="direction" value="down" />
                    <Button type="submit" variant="outline" size="sm" className="h-9 w-9 rounded-full p-0" disabled={index === rows.length - 1}>
                      <ArrowDown className="h-4 w-4" />
                      <span className="sr-only">Move down</span>
                    </Button>
                  </form>
                  <form action={removeInquiryTalent}>
                    <input type="hidden" name="inquiry_id" value={inquiryId} />
                    <input type="hidden" name="inquiry_talent_id" value={row.id} />
                    <Button type="submit" variant="outline" size="sm" className="h-9 rounded-full border-destructive/35 px-3 text-destructive hover:bg-destructive/5">
                      <Trash2 className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  </form>
                </div>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-[1.4rem] border border-dashed border-border/50 bg-muted/10 px-4 py-6 text-sm text-muted-foreground">
          No talent selected yet. Add represented talent above to build this inquiry shortlist.
        </p>
      )}
    </div>
  );
}
