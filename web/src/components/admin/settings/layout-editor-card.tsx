"use client";

/**
 * LayoutEditorCard — Spaces › layout editor (W13) and the R06 rule:
 * activating a layout never writes capacity. Writers live in venue-engine.
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import {
  layoutActivate,
  layoutUpsert,
  layoutsList,
  locationsList,
} from "@/lib/server-actions/venue-engine";
import { VENUE_ENGINE_REFUSALS, type VenueEngineRefusal } from "@/lib/venues/engine-refusals";
import { CLIENT_LOAD_REFUSAL, type ClientLoadRefusal } from "@/lib/settings/refusals";
import {
  ActionButton,
  CouldNotLoad,
  LoadingLines,
  Note,
  SaveStateChip,
  SelectField,
  SettingsCard,
  SettingsHeader,
  TextField,
  UsedIn,
  type SaveState,
} from "./settings-ui";

const K = "dashboard.adminWorkspace.layouts";

type LayoutRow = {
  id: string;
  locationId: string;
  name: string;
  isActive: boolean;
  canvas: { w: number; h: number };
  version: number;
};
type ItemRow = { layoutId: string; spaceId: string; x: number; y: number; w: number; h: number; rotation: number; shape: string };
type SpaceRow = { id: string; code: string | null; name: string; kind: string; partyMax: number };
type LocationRow = { id: string; name: string; isDefault: boolean };

function isRefusal(reason: string): reason is VenueEngineRefusal {
  return reason in VENUE_ENGINE_REFUSALS;
}

function spaceLabel(space: SpaceRow): string {
  return space.code || space.name;
}

export function LayoutEditorCard() {
  const t = useT();
  const [layouts, setLayouts] = useState<LayoutRow[] | null>(null);
  const [items, setItems] = useState<ItemRow[]>([]);
  const [spaces, setSpaces] = useState<SpaceRow[]>([]);
  const [locations, setLocations] = useState<LocationRow[]>([]);
  const [loadRefusal, setLoadRefusal] = useState<ClientLoadRefusal | VenueEngineRefusal | null>(null);
  const [writeReason, setWriteReason] = useState<VenueEngineRefusal | null>(null);
  const [save, setSave] = useState<SaveState>({ kind: "idle" });
  const [reloadToken, setReloadToken] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nameDraft, setNameDraft] = useState("");
  const [draftItems, setDraftItems] = useState<ItemRow[]>([]);
  const [placingId, setPlacingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    setLoadRefusal(null);
    try {
      const [layoutRes, locRes] = await Promise.all([layoutsList(), locationsList()]);
      if (!layoutRes.ok) {
        setLoadRefusal(layoutRes.reason);
        return;
      }
      if (!locRes.ok) {
        setLoadRefusal(locRes.reason);
        return;
      }
      setLayouts(layoutRes.layouts);
      setItems(layoutRes.items);
      setSpaces(layoutRes.spaces);
      setLocations(locRes.locations.map((row) => ({ id: row.id, name: row.name, isDefault: row.isDefault })));
      setSelectedId((prev) => {
        if (prev && layoutRes.layouts.some((row) => row.id === prev)) return prev;
        return layoutRes.layouts.find((row) => row.isActive)?.id ?? layoutRes.layouts[0]?.id ?? null;
      });
    } catch {
      setLoadRefusal(CLIENT_LOAD_REFUSAL);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadToken]);

  const selected = useMemo(() => layouts?.find((row) => row.id === selectedId) ?? null, [layouts, selectedId]);

  useEffect(() => {
    if (!selected) {
      setNameDraft("");
      setDraftItems([]);
      return;
    }
    setNameDraft(selected.name);
    setDraftItems(items.filter((item) => item.layoutId === selected.id));
    setPlacingId(null);
  }, [selected, items]);

  const defaultLocationId = locations.find((row) => row.isDefault)?.id ?? locations[0]?.id ?? null;
  const unplaced = spaces.filter((space) => !draftItems.some((item) => item.spaceId === space.id));

  function sentence(reason: string) {
    if (isRefusal(reason)) return t(VENUE_ENGINE_REFUSALS[reason]);
    if (reason === CLIENT_LOAD_REFUSAL) return t(`${K}.errors.load_failed`);
    return t(VENUE_ENGINE_REFUSALS.unavailable);
  }

  async function runWrite(work: () => Promise<{ ok: true } | { ok: false; reason: string }>) {
    setSave({ kind: "saving" });
    setWriteReason(null);
    try {
      const res = await work();
      if (!res.ok) {
        const reason = isRefusal(res.reason) ? res.reason : "unavailable";
        setWriteReason(reason);
        setSave({ kind: "failed", message: sentence(reason) });
        return;
      }
      await load();
      setAdding(false);
      setNewName("");
      setSave({ kind: "saved", at: new Date() });
    } catch {
      setSave({ kind: "failed", message: t(`${K}.errors.load_failed`) });
    }
  }

  function saveSelected() {
    if (!selected) return Promise.resolve({ ok: false as const, reason: "invalid" });
    return layoutUpsert({
      id: selected.id,
      locationId: selected.locationId,
      name: nameDraft,
      canvas: selected.canvas,
      items: draftItems.map((item) => ({
        spaceId: item.spaceId,
        x: item.x,
        y: item.y,
        w: item.w,
        h: item.h,
        rotation: item.rotation,
        shape: item.shape,
      })),
      expectedVersion: selected.version,
    });
  }

  function placeAt(x: number, y: number) {
    if (!selected || !placingId) return;
    setDraftItems((prev) => [
      ...prev,
      { layoutId: selected.id, spaceId: placingId, x, y, w: 96, h: 72, rotation: 0, shape: "rect" },
    ]);
    setPlacingId(null);
  }

  const dirty = Boolean(
    selected &&
      (nameDraft.trim() !== selected.name ||
        JSON.stringify(draftItems) !== JSON.stringify(items.filter((item) => item.layoutId === selected.id))),
  );

  return (
    <div data-testid="layout-editor-card" className="flex flex-col gap-[14px]">
      <SettingsHeader
        title={t(`${K}.title`)}
        subtitle={t(`${K}.subtitle`)}
        actions={
          <>
            <SaveStateChip
              testId="layouts-save-state"
              state={save}
              labels={{ saving: t(`${K}.saving`), saved: t(`${K}.saved`), failed: t(`${K}.saveFailed`), retry: t(`${K}.retry`) }}
              onRetry={save.kind === "failed" && dirty ? () => void runWrite(saveSelected) : undefined}
            />
            <ActionButton testId="layouts-add" disabled={adding || save.kind === "saving" || !defaultLocationId} onClick={() => setAdding(true)}>
              + {t(`${K}.add`)}
            </ActionButton>
            <ActionButton
              tone="primary"
              testId="layouts-save"
              disabled={!dirty || save.kind === "saving" || !selected}
              onClick={() => void runWrite(saveSelected)}
            >
              {t(`${K}.save`)}
            </ActionButton>
          </>
        }
      />
      <UsedIn
        count={3}
        label={t(`${K}.usedIn`)}
        parts={[
          { where: t(`${K}.usedInPos`), what: t(`${K}.usedInPosList`) },
          { where: t(`${K}.usedInWeb`), what: t(`${K}.usedInWebList`) },
        ]}
      />
      <Note>{t(`${K}.shareCapacity`)}</Note>
      {writeReason ? <p className="m-0 text-admin-13 text-admin-red">{sentence(writeReason)}</p> : null}

      <div className="grid grid-cols-1 gap-[16px] lg:grid-cols-[280px_1fr]">
        <SettingsCard title={t(`${K}.versionsHeading`)} testId="layouts-list">
          {loadRefusal ? (
            <CouldNotLoad message={sentence(loadRefusal)} retryLabel={t(`${K}.retry`)} onRetry={() => setReloadToken((n) => n + 1)} />
          ) : !layouts ? (
            <LoadingLines label={t(`${K}.loading`)} />
          ) : layouts.length === 0 ? (
            <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.empty`)}</p>
          ) : (
            layouts.map((row) => (
              <button
                key={row.id}
                type="button"
                data-testid={`layouts-row-${row.id}`}
                onClick={() => setSelectedId(row.id)}
                className={`flex w-full items-start gap-[8px] border-t border-admin-border-soft py-[8px] text-left text-admin-13 first:border-t-0 ${
                  row.id === selectedId ? "bg-admin-surface-alt" : ""
                }`}
              >
                <span className="min-w-0 flex-1 font-semibold text-admin-ink">{row.name}</span>
                <span className="shrink-0 text-admin-ink-muted">{row.isActive ? t(`${K}.activeChip`) : t(`${K}.draftChip`)}</span>
              </button>
            ))
          )}
          {adding ? (
            <div className="flex flex-col gap-[8px] border-t border-admin-border-soft pt-[10px]">
              <TextField label={t(`${K}.nameLabel`)} value={newName} onChange={setNewName} testId="layouts-new-name" />
              <div className="flex gap-[8px]">
                <ActionButton
                  tone="primary"
                  testId="layouts-new-confirm"
                  disabled={!newName.trim() || !defaultLocationId || save.kind === "saving"}
                  onClick={() =>
                    void runWrite(() =>
                      layoutUpsert({ locationId: defaultLocationId!, name: newName, canvas: { w: 1000, h: 800 }, items: [] }),
                    )
                  }
                >
                  {t(`${K}.add`)}
                </ActionButton>
                <ActionButton testId="layouts-new-cancel" onClick={() => setAdding(false)}>
                  {t(`${K}.cancel`)}
                </ActionButton>
              </div>
            </div>
          ) : null}
          {selected ? (
            <div className="flex flex-col gap-[10px] border-t border-admin-border-soft pt-[10px]">
              <TextField label={t(`${K}.nameLabel`)} value={nameDraft} onChange={setNameDraft} testId="layouts-edit-name" />
              {!selected.isActive ? (
                <ActionButton
                  testId="layouts-activate"
                  disabled={save.kind === "saving" || dirty}
                  onClick={() => void runWrite(() => layoutActivate({ layoutId: selected.id, expectedVersion: selected.version }))}
                >
                  {t(`${K}.activate`)}
                </ActionButton>
              ) : null}
              {dirty ? <p className="m-0 text-[11.5px] text-admin-ink-dim">{t(`${K}.saveBeforeActivate`)}</p> : null}
            </div>
          ) : null}
        </SettingsCard>

        <SettingsCard title={t(`${K}.canvasHeading`)} testId="layouts-canvas">
          {!selected ? (
            <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.pickLayout`)}</p>
          ) : (
            <>
              <div
                data-testid="layouts-canvas-surface"
                className="relative min-h-[360px] overflow-hidden rounded-[10px] border border-admin-border-strong bg-admin-surface"
                onClick={(event) => {
                  if (!placingId) return;
                  const box = event.currentTarget.getBoundingClientRect();
                  const x = ((event.clientX - box.left) / box.width) * selected.canvas.w;
                  const y = ((event.clientY - box.top) / box.height) * selected.canvas.h;
                  placeAt(Math.max(0, x - 48), Math.max(0, y - 36));
                }}
              >
                {draftItems.map((item) => {
                  const space = spaces.find((row) => row.id === item.spaceId);
                  const round = item.shape === "round" || space?.kind === "seat";
                  return (
                    <button
                      key={item.spaceId}
                      type="button"
                      data-testid={`layouts-item-${item.spaceId}`}
                      className={`absolute flex items-center justify-center border-2 border-admin-border-strong bg-admin-card text-[12px] font-bold text-admin-ink ${
                        round ? "rounded-full" : "rounded-[12px]"
                      }`}
                      style={{
                        left: `${(item.x / selected.canvas.w) * 100}%`,
                        top: `${(item.y / selected.canvas.h) * 100}%`,
                        width: `${(item.w / selected.canvas.w) * 100}%`,
                        height: `${(item.h / selected.canvas.h) * 100}%`,
                      }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setDraftItems((prev) => prev.filter((row) => row.spaceId !== item.spaceId));
                      }}
                    >
                      {space ? spaceLabel(space) : item.spaceId.slice(0, 4)}
                    </button>
                  );
                })}
              </div>
              <p className="m-0 text-[11.5px] text-admin-ink-dim">{t(`${K}.canvasHint`)}</p>
              <div className="flex flex-col gap-[6px]">
                <p className="m-0 text-[12px] font-semibold text-admin-ink">{t(`${K}.unplacedHeading`)}</p>
                {unplaced.length === 0 ? (
                  <p className="m-0 text-admin-13 text-admin-ink-muted">{t(`${K}.allPlaced`)}</p>
                ) : (
                  <div className="flex flex-wrap gap-[8px]">
                    {unplaced.map((space) => (
                      <ActionButton
                        key={space.id}
                        testId={`layouts-unplaced-${space.id}`}
                        onClick={() => setPlacingId(space.id)}
                      >
                        {placingId === space.id ? interpolate(t(`${K}.placing`), { name: spaceLabel(space) }) : spaceLabel(space)}
                      </ActionButton>
                    ))}
                  </div>
                )}
              </div>
              {unplaced.length > 0 ? (
                <p className="m-0 text-[11.5px] text-admin-ink-dim">
                  {interpolate(t(`${K}.unmapped`), { n: unplaced.length })}
                </p>
              ) : null}
              <SelectField
                label={t(`${K}.shapeHint`)}
                value="rect"
                options={[{ id: "rect", label: t(`${K}.shapeRect`) }]}
                reason={t(`${K}.notWired.shape`)}
              />
            </>
          )}
        </SettingsCard>
      </div>
    </div>
  );
}
