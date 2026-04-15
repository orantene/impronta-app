"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, ExternalLink, Plus, Search, Trash2 } from "lucide-react";
import { addInquiryTalent, type AdminActionState, moveInquiryTalent, removeInquiryTalent } from "@/app/(dashboard)/admin/actions";
import {
  rosterAddTalent,
  rosterMoveParticipant,
  rosterRemoveParticipant,
} from "@/app/(dashboard)/admin/inquiries/[id]/roster-actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { handleActionResult, type ActionResult } from "@/lib/inquiry/inquiry-action-result";
import { cn } from "@/lib/utils";

type TalentOption = {
  id: string;
  profile_code: string;
  display_name: string | null;
};

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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const feedback = (result: ActionResult) => {
    handleActionResult(result, {
      onToast: (m) => toast.message(m),
      onRefresh: () => router.refresh(),
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

  const selectedIds = useMemo(() => new Set(selected.map((row) => row.id)), [selected]);
  const filtered = useMemo(
    () =>
      talents
        .filter((option) => !selectedIds.has(option.id))
        .filter((option) => matchTalent(option, query))
        .slice(0, 8),
    [query, selectedIds, talents],
  );

  return (
    <div className="space-y-3">
      <input type="hidden" name={inputName} value={selected.map((row) => row.id).join(",")} />
      <div className="rounded-2xl border border-border/45 bg-muted/10 p-3">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search talent by code or name" className="pl-9" />
        </div>
      </div>
      <div className="rounded-2xl border border-border/45 bg-background">
        {query.trim().length >= 1 ? (
          filtered.length > 0 ? (
            <ul className="divide-y divide-border/40">
              {filtered.map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/30"
                    onClick={() => {
                      setSelected((current) => [...current, option]);
                      setQuery("");
                    }}
                  >
                    <span className="min-w-0 text-sm">
                      <span className="block font-medium text-foreground">{option.display_name ?? option.profile_code}</span>
                      <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">{option.profile_code}</span>
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--impronta-gold-border)]/70 bg-[var(--impronta-gold-muted)] px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-[var(--impronta-gold)]">
                      <Plus className="h-3.5 w-3.5" />
                      Add
                    </span>
                  </button>
                </li>
              ))}
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
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [selectedTalentId, setSelectedTalentId] = useState("");
  const [state, addAction, addPending] = useActionState<AdminActionState, FormData>(addInquiryTalent, undefined);
  const [v2AddPending, startV2Add] = useTransition();

  const selectedIds = useMemo(() => new Set(rows.map((row) => row.talent_profile_id)), [rows]);
  const filtered = useMemo(
    () =>
      allTalents
        .filter((option) => !selectedIds.has(option.id))
        .filter((option) => matchTalent(option, query))
        .slice(0, 8),
    [allTalents, query, selectedIds],
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
                onRefresh: () => router.refresh(),
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
                      )}
                      onClick={() => setSelectedTalentId(option.id)}
                    >
                      <span className="min-w-0 text-sm">
                        <span className="block font-medium text-foreground">{option.display_name ?? option.profile_code}</span>
                        <span className="block text-xs uppercase tracking-[0.16em] text-muted-foreground">{option.profile_code}</span>
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
