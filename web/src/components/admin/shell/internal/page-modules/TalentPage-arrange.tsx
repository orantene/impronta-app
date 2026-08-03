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
    <div style={{ fontFamily: FONTS.body }}>
      {/* Arrange header — title + save state + reset/done */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          flexWrap: "wrap",
          padding: "12px 14px",
          marginBottom: 14,
          borderRadius: 12,
          background: "rgba(15,79,62,0.05)",
          border: `1px solid ${COLORS.accent}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 220 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: -0.1 }} className="text-admin-ink">
            {t("admin.roster.arrange.title")}
          </div>
          <div style={{ fontSize: 11.5, marginTop: 2 }} className="text-admin-ink-muted">
            {t("admin.roster.arrange.subtitle")}
          </div>
        </div>
        <SaveStateChip
          state={saveState}
          onRetry={() => void persist(order.map((p) => p.id))}
        />
        <button
          type="button"
          onClick={() => void handleReset()}
          disabled={isResetting}
          style={{
            padding: "7px 12px",
            borderRadius: 999,
            border: `1px solid ${COLORS.borderSoft}`,
            background: "#fff",
            color: COLORS.inkMuted,
            fontFamily: FONTS.body,
            fontSize: 12,
            fontWeight: 600,
            cursor: isResetting ? "default" : "pointer",
            opacity: isResetting ? 0.6 : 1,
            whiteSpace: "nowrap",
          }}
        >
          {t("admin.roster.arrange.reset")}
        </button>
        <button
          type="button"
          onClick={onExit}
          style={{
            padding: "7px 16px",
            borderRadius: 999,
            border: "none",
            background: COLORS.accent,
            color: "#fff",
            fontFamily: FONTS.body,
            fontSize: 12.5,
            fontWeight: 600,
            cursor: "pointer",
            whiteSpace: "nowrap",
          }}
        >
          {t("admin.roster.arrange.done")}
        </button>
      </div>

      {/* Sortable grid — mirrors RosterGrid's column model */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={ids} strategy={rectSortingStrategy}>
          <div
            data-tulala-arrange-grid
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
              gap: 12,
            }}
          >
            <style>{`
              @media (max-width: 600px) {
                [data-tulala-arrange-grid] { grid-template-columns: repeat(2, 1fr) !important; gap: 10px !important; }
              }
              @media (min-width: 1500px) {
                [data-tulala-arrange-grid] {
                  grid-template-columns: repeat(6, minmax(0, 1fr)) !important;
                  max-width: 1340px;
                }
              }
            `}</style>
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
      <button
        type="button"
        onClick={onRetry}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 5,
          padding: "5px 11px",
          borderRadius: 999,
          border: "1px solid rgba(176,48,58,0.4)",
          background: "rgba(176,48,58,0.08)",
          color: COLORS.critical,
          fontFamily: FONTS.body,
          fontSize: 11.5,
          fontWeight: 600,
          cursor: "pointer",
          whiteSpace: "nowrap",
        }}
      >
        {t("admin.roster.arrange.saveError")}
      </button>
    );
  }
  const saving = state === "saving";
  return (
    <div
      aria-live="polite"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        padding: "5px 11px",
        borderRadius: 999,
        border: `1px solid ${saving ? COLORS.borderSoft : "rgba(46,125,91,0.35)"}`,
        background: saving ? "#fff" : "rgba(46,125,91,0.08)",
        color: saving ? COLORS.inkMuted : COLORS.green,
        fontSize: 11.5,
        fontWeight: 600,
        whiteSpace: "nowrap",
      }}
    >
      {saving ? (
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            border: `2px solid ${COLORS.borderSoft}`,
            borderTopColor: COLORS.inkMuted,
            animation: "tulala-arrange-spin 0.7s linear infinite",
          }}
        />
      ) : (
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {saving ? t("admin.roster.arrange.saving") : t("admin.roster.arrange.saved")}
      <style>{`@keyframes tulala-arrange-spin { to { transform: rotate(360deg); } }`}</style>
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
      style={{
        position: "relative",
        background: "#fff",
        border: `1px solid ${isDragging ? COLORS.accent : COLORS.borderSoft}`,
        borderRadius: 14,
        overflow: "hidden",
        fontFamily: FONTS.body,
        cursor: isDragging ? "grabbing" : "grab",
        transform: CSS.Transform.toString(transform),
        transition,
        boxShadow: isDragging
          ? "0 12px 28px -12px rgba(11,11,13,0.35)"
          : "0 1px 2px rgba(11,11,13,0.03)",
        zIndex: isDragging ? 5 : undefined,
        opacity: isPubliclyVisible ? 1 : 0.55,
        touchAction: "none",
        userSelect: "none",
      }}
      title={isPubliclyVisible ? undefined : t("admin.roster.arrange.hiddenHint")}
    >
      {/* Photo */}
      <div
        style={{
          position: "relative",
          aspectRatio: "4 / 5",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
        }}
        className="bg-admin-surface-alt"
      >
        {profile.thumb && !photoFailed && (
          <Image
            src={profile.thumb}
            alt={profile.name}
            fill
            sizes="(max-width: 600px) 50vw, (max-width: 1500px) 22vw, 220px"
            style={{ objectFit: "cover", pointerEvents: "none" }}
            unoptimized={!/^https?:\/\//.test(profile.thumb) || /\/(card|thumb|polaroid)\//.test(profile.thumb)}
            onError={() => setPhotoFailed(true)}
            draggable={false}
          />
        )}
        {(!profile.thumb || photoFailed) && (
          <div
            aria-hidden
            style={{
              fontFamily: FONTS.display,
              fontSize: 36,
              fontWeight: 500,
              color: COLORS.inkMuted,
              letterSpacing: -1,
              userSelect: "none",
            }}
          >
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
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitDraft();
              if (e.key === "Escape") setEditing(false);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              width: 44,
              height: 26,
              borderRadius: 8,
              border: `1.5px solid ${COLORS.accent}`,
              background: "#fff",
              color: COLORS.ink,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 700,
              textAlign: "center",
              outline: "none",
              padding: 0,
            }}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setDraft(String(position));
              setEditing(true);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            aria-label={fillAdminTpl(t("admin.roster.arrange.rankAria"), { name: profile.name })}
            style={{
              position: "absolute",
              top: 8,
              left: 8,
              minWidth: 26,
              height: 26,
              padding: "0 7px",
              borderRadius: 8,
              border: "1px solid rgba(255,255,255,0.25)",
              background: "rgba(11,11,13,0.72)",
              color: "#fff",
              fontFamily: FONTS.body,
              fontSize: 12.5,
              fontWeight: 700,
              cursor: "text",
              backdropFilter: "blur(6px)",
              WebkitBackdropFilter: "blur(6px)",
            }}
          >
            {position}
          </button>
        )}

        {/* Drag affordance — visual hint only; the whole card drags */}
        <div
          aria-hidden
          style={{
            position: "absolute",
            top: 8,
            right: 8,
            width: 24,
            height: 24,
            borderRadius: 7,
            background: "rgba(11,11,13,0.55)",
            border: "1px solid rgba(255,255,255,0.2)",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: "rgba(255,255,255,0.9)",
            backdropFilter: "blur(6px)",
            WebkitBackdropFilter: "blur(6px)",
            pointerEvents: "none",
          }}
        >
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
      <div style={{ padding: "8px 12px 10px" }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            letterSpacing: -0.1,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          className="text-admin-ink"
        >
          {profile.name}
        </div>
      </div>
    </div>
  );
}
