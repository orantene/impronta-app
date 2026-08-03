"use client";

import { useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  clearDirectoryOrder,
  saveDirectoryOrder,
} from "@/app/(workspace)/[tenantSlug]/admin/roster/arrange-actions";
import { COLORS, FONTS, useAdminShell } from "../state";
import type { TalentProfile } from "../state";
import { fillAdminTpl } from "./TalentPage-1";

// ════════════════════════════════════════════════════════════════════
// ARRANGE DIRECTORY ORDER — roster reorder mode
// ── Drag cards (or click the position number and type) to curate the
//    public directory's "Recommended" sort. Persists to
//    `talent_profiles.manual_rank_override` via saveDirectoryOrder;
//    every committed change autosaves with an explicit Saving/Saved chip.
//    Styling lives in the scoped <style> block below (ratchet rule 2:
//    no new inline style attributes in the admin shell — dynamic values
//    travel through CSS custom properties only).
// ════════════════════════════════════════════════════════════════════

/**
 * Initial arrange order = what the public directory shows today:
 * curated rank first (`manual_rank_override` asc), then the automatic
 * chain's recency keys. The bridge doesn't carry is_featured /
 * featured_level, so unranked talent approximate the public order by
 * updated/created recency; after the first save every talent has an
 * explicit rank and the order is exact from then on.
 */
function initialArrangeOrder(items: TalentProfile[]): TalentProfile[] {
  return [...items].sort((a, b) => {
    const ar = a.directoryRank ?? Number.POSITIVE_INFINITY;
    const br = b.directoryRank ?? Number.POSITIVE_INFINITY;
    if (ar !== br) return ar - br;
    const au = a.updatedAt ? Date.parse(a.updatedAt) : 0;
    const bu = b.updatedAt ? Date.parse(b.updatedAt) : 0;
    if (au !== bu) return bu - au;
    const ac = a.createdAt ? Date.parse(a.createdAt) : 0;
    const bc = b.createdAt ? Date.parse(b.createdAt) : 0;
    if (ac !== bc) return bc - ac;
    return b.id.localeCompare(a.id);
  });
}

type SaveState = "idle" | "saving" | "saved" | "error";

const ARRANGE_CSS = `
[data-tulala-arrange] { font-family: var(--ta-font-body); }
[data-tulala-arrange] .ta-header {
  display: flex; align-items: center; gap: 10px; flex-wrap: wrap;
  padding: 12px 14px; margin-bottom: 14px; border-radius: 12px;
  background: rgba(15,79,62,0.05); border: 1px solid var(--ta-accent);
}
[data-tulala-arrange] .ta-header-copy { flex: 1; min-width: 220px; }
[data-tulala-arrange] .ta-title { font-size: 13.5px; font-weight: 700; letter-spacing: -0.1px; }
[data-tulala-arrange] .ta-subtitle { font-size: 11.5px; margin-top: 2px; }
[data-tulala-arrange] .ta-chip {
  display: inline-flex; align-items: center; gap: 5px; padding: 5px 11px;
  border-radius: 999px; font-size: 11.5px; font-weight: 600; white-space: nowrap;
}
[data-tulala-arrange] .ta-chip-saving { border: 1px solid var(--ta-border-soft); background: #fff; color: var(--ta-ink-muted); }
[data-tulala-arrange] .ta-chip-saved { border: 1px solid rgba(46,125,91,0.35); background: rgba(46,125,91,0.08); color: var(--ta-green); }
[data-tulala-arrange] .ta-chip-error { border: 1px solid rgba(176,48,58,0.4); background: rgba(176,48,58,0.08); color: var(--ta-critical); cursor: pointer; font-family: var(--ta-font-body); }
[data-tulala-arrange] .ta-spinner {
  width: 10px; height: 10px; border-radius: 50%;
  border: 2px solid var(--ta-border-soft); border-top-color: var(--ta-ink-muted);
  animation: tulala-arrange-spin 0.7s linear infinite;
}
@keyframes tulala-arrange-spin { to { transform: rotate(360deg); } }
[data-tulala-arrange] .ta-btn-ghost {
  padding: 7px 12px; border-radius: 999px; border: 1px solid var(--ta-border-soft);
  background: #fff; color: var(--ta-ink-muted); font-family: var(--ta-font-body);
  font-size: 12px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
[data-tulala-arrange] .ta-btn-ghost:disabled { cursor: default; opacity: 0.6; }
[data-tulala-arrange] .ta-btn-primary {
  padding: 7px 16px; border-radius: 999px; border: none;
  background: var(--ta-accent); color: #fff; font-family: var(--ta-font-body);
  font-size: 12.5px; font-weight: 600; cursor: pointer; white-space: nowrap;
}
[data-tulala-arrange] .ta-grid {
  display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 12px;
}
@media (max-width: 600px) {
  [data-tulala-arrange] .ta-grid { grid-template-columns: repeat(2, 1fr); gap: 10px; }
}
@media (min-width: 1500px) {
  [data-tulala-arrange] .ta-grid { grid-template-columns: repeat(6, minmax(0, 1fr)); max-width: 1340px; }
}
[data-tulala-arrange] .ta-card {
  position: relative; background: #fff; border-radius: 14px; overflow: hidden;
  font-family: var(--ta-font-body); cursor: grab;
  border: 1px solid var(--ta-border-soft);
  box-shadow: 0 1px 2px rgba(11,11,13,0.03);
  transform: var(--ta-dnd-transform); transition: var(--ta-dnd-transition);
  opacity: var(--ta-card-opacity, 1);
  touch-action: none; user-select: none; -webkit-user-select: none;
}
[data-tulala-arrange] .ta-card-dragging {
  cursor: grabbing; border-color: var(--ta-accent); z-index: 5;
  box-shadow: 0 12px 28px -12px rgba(11,11,13,0.35);
}
[data-tulala-arrange] .ta-photo {
  position: relative; aspect-ratio: 4 / 5; display: flex;
  align-items: center; justify-content: center; overflow: hidden;
}
[data-tulala-arrange] .ta-photo img { object-fit: cover; pointer-events: none; }
[data-tulala-arrange] .ta-initials {
  font-family: var(--ta-font-display); font-size: 36px; font-weight: 500;
  color: var(--ta-ink-muted); letter-spacing: -1px; user-select: none;
}
[data-tulala-arrange] .ta-rank {
  position: absolute; top: 8px; left: 8px; min-width: 26px; height: 26px;
  padding: 0 7px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.25);
  background: rgba(11,11,13,0.72); color: #fff; font-family: var(--ta-font-body);
  font-size: 12.5px; font-weight: 700; cursor: text;
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
}
[data-tulala-arrange] .ta-rank-input {
  position: absolute; top: 8px; left: 8px; width: 44px; height: 26px;
  border-radius: 8px; border: 1.5px solid var(--ta-accent); background: #fff;
  color: var(--ta-ink); font-family: var(--ta-font-body); font-size: 12.5px;
  font-weight: 700; text-align: center; outline: none; padding: 0;
}
[data-tulala-arrange] .ta-drag-hint {
  position: absolute; top: 8px; right: 8px; width: 24px; height: 24px;
  border-radius: 7px; background: rgba(11,11,13,0.55);
  border: 1px solid rgba(255,255,255,0.2); display: inline-flex;
  align-items: center; justify-content: center; color: rgba(255,255,255,0.9);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); pointer-events: none;
}
[data-tulala-arrange] .ta-name-row { padding: 8px 12px 10px; }
[data-tulala-arrange] .ta-name {
  font-size: 13px; font-weight: 600; letter-spacing: -0.1px;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
`;

export function RosterArrangeView({
  items,
  tenantSlug,
  onExit,
}: {
  items: TalentProfile[];
  tenantSlug: string;
  onExit: () => void;
}) {
  const { t, toast } = useAdminShell();
  const [order, setOrder] = useState<TalentProfile[]>(() => initialArrangeOrder(items));
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [isResetting, setIsResetting] = useState(false);
  // Latest-wins save queue: a drop while a save is in flight replaces the
  // pending payload instead of stacking a request per drop.
  const pendingRef = useRef<string[] | null>(null);
  const inFlightRef = useRef(false);

  const sensors = useSensors(
    // Distance threshold keeps plain clicks (rank badge, card) from
    // starting a drag.
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const ids = useMemo(() => order.map((p) => p.id), [order]);

  const persist = async (nextIds: string[]) => {
    pendingRef.current = nextIds;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setSaveState("saving");
    let failed = false;
    while (pendingRef.current) {
      const batch = pendingRef.current;
      pendingRef.current = null;
      const res = await saveDirectoryOrder(tenantSlug, batch);
      if (!res.ok) {
        failed = true;
        break;
      }
    }
    inFlightRef.current = false;
    setSaveState(failed ? "error" : "saved");
  };

  const commitOrder = (next: TalentProfile[]) => {
    setOrder(next);
    void persist(next.map((p) => p.id));
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = order.findIndex((p) => p.id === active.id);
    const to = order.findIndex((p) => p.id === over.id);
    if (from < 0 || to < 0) return;
    commitOrder(arrayMove(order, from, to));
  };

  /** Insert semantics: typing 3 on a card moves it to position 3, pushing others down. */
  const moveToPosition = (id: string, position: number) => {
    const from = order.findIndex((p) => p.id === id);
    if (from < 0) return;
    const to = Math.min(Math.max(position, 1), order.length) - 1;
    if (to === from) return;
    commitOrder(arrayMove(order, from, to));
  };

  const handleReset = async () => {
    if (!window.confirm(t("admin.roster.arrange.resetConfirm"))) return;
    setIsResetting(true);
    const res = await clearDirectoryOrder(tenantSlug);
    setIsResetting(false);
    if (res.ok) {
      onExit();
    } else {
      toast(res.error);
    }
  };

  return (
    <div
      data-tulala-arrange
      style={{
        "--ta-accent": COLORS.accent,
        "--ta-green": COLORS.green,
        "--ta-critical": COLORS.critical,
        "--ta-ink": COLORS.ink,
        "--ta-ink-muted": COLORS.inkMuted,
        "--ta-border-soft": COLORS.borderSoft,
        "--ta-font-body": FONTS.body,
        "--ta-font-display": FONTS.display,
      } as React.CSSProperties}
    >
      <style>{ARRANGE_CSS}</style>

      {/* Arrange header — title + save state + reset/done */}
      <div className="ta-header">
        <div className="ta-header-copy">
          <div className="ta-title text-admin-ink">{t("admin.roster.arrange.title")}</div>
          <div className="ta-subtitle text-admin-ink-muted">{t("admin.roster.arrange.subtitle")}</div>
        </div>
        <SaveStateChip
          state={saveState}
          onRetry={() => void persist(order.map((p) => p.id))}
        />
        <button
          type="button"
          className="ta-btn-ghost"
          onClick={() => void handleReset()}
          disabled={isResetting}
        >
          {t("admin.roster.arrange.reset")}
        </button>
        <button type="button" className="ta-btn-primary" onClick={onExit}>
          {t("admin.roster.arrange.done")}
        </button>
      </div>

      {/* Sortable grid — mirrors RosterGrid's column model */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div className="ta-grid">
            {order.map((p, i) => (
              <ArrangeCard
                key={p.id}
                profile={p}
                position={i + 1}
                total={order.length}
                onMoveTo={(pos) => moveToPosition(p.id, pos)}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

function SaveStateChip({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  const { t } = useAdminShell();
  if (state === "idle") return null;
  if (state === "error") {
    return (
      <button type="button" className="ta-chip ta-chip-error" onClick={onRetry}>
        {t("admin.roster.arrange.saveError")}
      </button>
    );
  }
  const saving = state === "saving";
  return (
    <div aria-live="polite" className={`ta-chip ${saving ? "ta-chip-saving" : "ta-chip-saved"}`}>
      {saving ? (
        <span aria-hidden className="ta-spinner" />
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {saving ? t("admin.roster.arrange.saving") : t("admin.roster.arrange.saved")}
    </div>
  );
}

function ArrangeCard({
  profile,
  position,
  total,
  onMoveTo,
}: {
  profile: TalentProfile;
  position: number;
  total: number;
  onMoveTo: (position: number) => void;
}) {
  const { t } = useAdminShell();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: profile.id });
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [photoFailed, setPhotoFailed] = useState(false);

  const isPubliclyVisible = (profile.siteVisible ?? false) && !(profile.talentHidden ?? false);

  const commitDraft = () => {
    setEditing(false);
    const parsed = parseInt(draft, 10);
    if (!Number.isNaN(parsed)) onMoveTo(parsed);
  };

  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      aria-label={fillAdminTpl(t("admin.roster.arrange.rankAria"), { name: profile.name })}
      className={`ta-card${isDragging ? " ta-card-dragging" : ""}`}
      style={{
        "--ta-dnd-transform": CSS.Transform.toString(transform) ?? "none",
        "--ta-dnd-transition": transition ?? "none",
        "--ta-card-opacity": isPubliclyVisible ? 1 : 0.55,
      } as React.CSSProperties}
      title={isPubliclyVisible ? undefined : t("admin.roster.arrange.hiddenHint")}
    >
      {/* Photo */}
      <div className="ta-photo bg-admin-surface-alt">
        {profile.thumb && !photoFailed && (
          <Image
            src={profile.thumb}
            alt={profile.name}
            fill
            sizes="(max-width: 600px) 50vw, (max-width: 1500px) 22vw, 220px"
            unoptimized={!/^https?:\/\//.test(profile.thumb) || /\/(card|thumb|polaroid)\//.test(profile.thumb)}
            onError={() => setPhotoFailed(true)}
            draggable={false}
          />
        )}
        {/* Initials fallback when no photo / photo failed to load. */}
        {(!profile.thumb || photoFailed) && (
          <div aria-hidden className="ta-initials">
            {profile.name.split(" ").map((w) => w[0]).join("").slice(0, 2).toUpperCase()}
          </div>
        )}

        {/* Position badge — click to type an exact position */}
        {editing ? (
          <input
            // eslint-disable-next-line jsx-a11y/no-autofocus
            autoFocus
            type="number"
            min={1}
            max={total}
            value={draft}
            className="ta-rank-input"
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              if (e.key === "Escape") setEditing(false);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          />
        ) : (
          <button
            type="button"
            className="ta-rank"
            onClick={() => {
              setDraft(String(position));
              setEditing(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={fillAdminTpl(t("admin.roster.arrange.rankAria"), { name: profile.name })}
          >
            {position}
          </button>
        )}

        {/* Drag affordance — visual hint only; the whole card drags */}
        <div aria-hidden className="ta-drag-hint">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
            <circle cx="8" cy="5" r="1.7" />
            <circle cx="16" cy="5" r="1.7" />
            <circle cx="8" cy="12" r="1.7" />
            <circle cx="16" cy="12" r="1.7" />
            <circle cx="8" cy="19" r="1.7" />
            <circle cx="16" cy="19" r="1.7" />
          </svg>
        </div>
      </div>

      {/* Body — name only; arrange mode is about order, not profile detail */}
      <div className="ta-name-row">
        <div className="ta-name text-admin-ink">{profile.name}</div>
      </div>
    </div>
  );
}
