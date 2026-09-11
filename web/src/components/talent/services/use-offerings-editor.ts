"use client";

/**
 * useOfferingsEditor — the one state machine behind every catalogue editor.
 *
 * The talent's Services tab (`TalentOfferingsManager`) and the workspace's
 * Catalog (`page-modules/catalog/*`) draw two different screens over the
 * SAME rows, the same actions and the same optimistic-persist-then-rollback
 * idiom. This hook is that idiom, parameterised by the owner, so the two
 * skins cannot drift apart on what a save, a delete, a reorder or a duplicate
 * means. Neither surface talks to `offerings-actions` / `menu-offerings-actions`
 * directly any more.
 *
 * Owner decides the action set: a talent profile id routes to the talent
 * actions (with legacy import and performance stats), a workspace tenant id
 * to the Menu actions (with the stock RPC). Nothing here renders.
 */

import { useCallback, useEffect, useState, useTransition } from "react";
import {
  loadTalentOfferingsForEditor,
  upsertTalentOffering,
  deleteTalentOffering,
  reorderTalentOfferings,
  importLegacyToOfferings,
} from "@/lib/talent/offerings-actions";
import {
  loadWorkspaceMenuForEditor,
  upsertWorkspaceMenuItem,
  deleteWorkspaceMenuItem,
  reorderWorkspaceMenuItems,
} from "@/lib/talent/menu-offerings-actions";
import { loadTalentServicePerformance, type ServicePerformanceStat } from "@/lib/talent/services-menu-actions";
import {
  blankOffering,
  validateOffering,
  type OfferingAddOn,
  type OfferingOwner,
  type OfferingVariant,
  type TalentOffering,
} from "@/lib/talent/offerings-types";

export type OfferingsEditor = {
  owner: OfferingOwner;
  isWorkspace: boolean;
  talentId: string;
  workspaceTenantId: string;
  items: TalentOffering[];
  defaultCurrency: string;
  legacyImportable: boolean;
  loading: boolean;
  saving: boolean;
  /** The last refusal, in the action's own words; null when the last write went through. */
  error: string | null;
  savedOk: boolean;
  /** The new-item draft being composed (not yet persisted). */
  draft: TalentOffering | null;
  /** Per-offering quoted/booked stats (talent only). */
  perf: Record<string, ServicePerformanceStat>;
  setError: (e: string | null) => void;
  setDraft: (next: TalentOffering | null | ((d: TalentOffering | null) => TalentOffering | null)) => void;
  /** Persist one existing item with optimistic replace + rollback. */
  persistItem: (next: TalentOffering) => void;
  patchItem: (id: string, patch: Partial<TalentOffering>) => void;
  /**
   * Save the composed draft (insert), with `last` applied on top of it first
   * (a Publish that sets the status in the same breath). Resolves with the
   * saved row, or null on refusal with `error` set. The draft is NOT cleared
   * here: the caller clears it once it has moved to the saved row, so the
   * screen never flashes back to "nothing to edit" in between.
   */
  saveDraft: (last?: Partial<TalentOffering>) => Promise<TalentOffering | null>;
  removeItem: (id: string) => void;
  move: (id: string, dir: -1 | 1) => void;
  duplicate: (it: TalentOffering) => void;
  /** Start a blank draft; `seed` pre-fills it. */
  startAdd: (seed?: Partial<TalentOffering>) => TalentOffering;
  importLegacy: () => void;
  /** Local-state updaters for child rows (join rows, not the row itself). */
  syncImages: (offeringId: string, assets: { id: string; url: string }[]) => void;
  syncOptions: (offeringId: string, variants: OfferingVariant[], addOns: OfferingAddOn[]) => void;
  syncStock: (offeringId: string, available: number | null) => void;
};

export function useOfferingsEditor(owner: OfferingOwner): OfferingsEditor {
  const isWorkspace = owner.kind === "workspace";
  const talentId = owner.kind === "talent" ? owner.talentProfileId : "";
  const workspaceTenantId = owner.kind === "workspace" ? owner.tenantId : "";

  const [items, setItems] = useState<TalentOffering[]>([]);
  const [defaultCurrency, setDefaultCurrency] = useState("USD");
  const [legacyImportable, setLegacyImportable] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedOk, setSavedOk] = useState(false);
  const [draft, setDraft] = useState<TalentOffering | null>(null);
  const [perf, setPerf] = useState<Record<string, ServicePerformanceStat>>({});
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    const load = isWorkspace
      ? loadWorkspaceMenuForEditor(workspaceTenantId)
      : loadTalentOfferingsForEditor(talentId);
    load
      .then((res) => {
        if (cancelled) return;
        if (res.ok) {
          setItems(res.items);
          setDefaultCurrency(res.defaultCurrency);
          setLegacyImportable("legacyImportable" in res ? !!res.legacyImportable : false);
        } else {
          setError(res.error);
        }
        setLoading(false);
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isWorkspace, talentId, workspaceTenantId]);

  useEffect(() => {
    if (isWorkspace) return;
    let cancelled = false;
    loadTalentServicePerformance(talentId)
      .then((res) => {
        if (!cancelled && res.ok) setPerf(res.stats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isWorkspace, talentId]);

  const flashSaved = useCallback(() => {
    setSavedOk(true);
    setTimeout(() => setSavedOk(false), 1800);
  }, []);

  const upsertOne = useCallback(
    (next: TalentOffering) =>
      isWorkspace ? upsertWorkspaceMenuItem(workspaceTenantId, next) : upsertTalentOffering(talentId, next),
    [isWorkspace, workspaceTenantId, talentId],
  );
  const deleteOne = useCallback(
    (id: string) => (isWorkspace ? deleteWorkspaceMenuItem(workspaceTenantId, id) : deleteTalentOffering(talentId, id)),
    [isWorkspace, workspaceTenantId, talentId],
  );
  const reorderAll = useCallback(
    (ids: string[]) =>
      isWorkspace ? reorderWorkspaceMenuItems(workspaceTenantId, ids) : reorderTalentOfferings(talentId, ids),
    [isWorkspace, workspaceTenantId, talentId],
  );

  const persistItem = useCallback(
    (next: TalentOffering) => {
      let previous: TalentOffering[] = [];
      setItems((cur) => {
        previous = cur;
        return cur.map((it) => (it.id === next.id ? next : it));
      });
      setSaving(true);
      setError(null);
      startTransition(async () => {
        const res = await upsertOne(next);
        setSaving(false);
        if (res.ok) {
          // The saved row is the row; child rows (images, options) stay local.
          setItems((cur) =>
            cur.map((it) =>
              it.id === res.item.id
                ? { ...res.item, imageAssets: it.imageAssets, variants: it.variants, addOns: it.addOns }
                : it,
            ),
          );
          flashSaved();
        } else {
          setItems(previous);
          setError(res.error);
        }
      });
    },
    [upsertOne, flashSaved],
  );

  const patchItem = useCallback(
    (id: string, patch: Partial<TalentOffering>) => {
      const target = items.find((it) => it.id === id);
      if (target) persistItem({ ...target, ...patch });
    },
    [items, persistItem],
  );

  const saveDraft = useCallback((last?: Partial<TalentOffering>): Promise<TalentOffering | null> => {
    if (!draft) return Promise.resolve(null);
    const toSave = last ? { ...draft, ...last } : draft;
    const errors = validateOffering(toSave);
    if (errors.length > 0) {
      setError(errors[0]!);
      return Promise.resolve(null);
    }
    setSaving(true);
    setError(null);
    return new Promise((resolve) => {
      startTransition(async () => {
        const res = await upsertOne(toSave);
        setSaving(false);
        if (res.ok) {
          setItems((cur) => [...cur, res.item]);
          flashSaved();
          resolve(res.item);
        } else {
          setError(res.error);
          resolve(null);
        }
      });
    });
  }, [draft, upsertOne, flashSaved]);

  const removeItem = useCallback(
    (id: string) => {
      let previous: TalentOffering[] = [];
      setItems((cur) => {
        previous = cur;
        return cur.filter((it) => it.id !== id);
      });
      setSaving(true);
      startTransition(async () => {
        const res = await deleteOne(id);
        setSaving(false);
        if (!res.ok) {
          setItems(previous);
          setError(res.error ?? "Failed to delete.");
        } else {
          flashSaved();
        }
      });
    },
    [deleteOne, flashSaved],
  );

  const move = useCallback(
    (id: string, dir: -1 | 1) => {
      const idx = items.findIndex((it) => it.id === id);
      const swap = idx + dir;
      if (idx < 0 || swap < 0 || swap >= items.length) return;
      const next = [...items];
      [next[idx], next[swap]] = [next[swap]!, next[idx]!];
      const reindexed = next.map((it, i) => ({ ...it, sortOrder: i }));
      setItems(reindexed);
      setSaving(true);
      startTransition(async () => {
        const res = await reorderAll(reindexed.map((it) => it.id));
        setSaving(false);
        if (!res.ok) setError(res.error ?? "Failed to reorder.");
        else flashSaved();
      });
    },
    [items, reorderAll, flashSaved],
  );

  const duplicate = useCallback(
    (it: TalentOffering) => {
      setSaving(true);
      startTransition(async () => {
        const res = await upsertOne({
          ...it,
          id: "",
          title: `${it.title} (copy)`,
          status: "draft",
          sortOrder: items.length,
          imageUrls: [],
        });
        setSaving(false);
        if (res.ok) {
          setItems((cur) => [...cur, res.item]);
          flashSaved();
        } else setError(res.error);
      });
    },
    [items.length, upsertOne, flashSaved],
  );

  // `owner` is a fresh object literal on every caller render; the two fields
  // that identify it are the stable inputs, so the owner is rebuilt from them.
  const startAdd = useCallback(
    (seed?: Partial<TalentOffering>) => {
      const stableOwner: OfferingOwner = isWorkspace
        ? { kind: "workspace", tenantId: workspaceTenantId }
        : { kind: "talent", talentProfileId: talentId };
      const b = { ...blankOffering(stableOwner, defaultCurrency, items.length), ...(seed ?? {}) };
      setDraft(b);
      setError(null);
      return b;
    },
    [isWorkspace, talentId, workspaceTenantId, defaultCurrency, items.length],
  );

  const importLegacy = useCallback(() => {
    if (isWorkspace) return;
    setSaving(true);
    setError(null);
    startTransition(async () => {
      const res = await importLegacyToOfferings(talentId);
      setSaving(false);
      if (res.ok) {
        setItems(res.items);
        setLegacyImportable(false);
        flashSaved();
      } else setError(res.error);
    });
  }, [isWorkspace, talentId, flashSaved]);

  const syncImages = useCallback((offeringId: string, assets: { id: string; url: string }[]) => {
    setItems((cur) =>
      cur.map((x) => (x.id === offeringId ? { ...x, imageAssets: assets, imageUrls: assets.map((a) => a.url) } : x)),
    );
  }, []);
  const syncOptions = useCallback((offeringId: string, variants: OfferingVariant[], addOns: OfferingAddOn[]) => {
    setItems((cur) => cur.map((x) => (x.id === offeringId ? { ...x, variants, addOns } : x)));
  }, []);
  const syncStock = useCallback((offeringId: string, available: number | null) => {
    setItems((cur) => cur.map((x) => (x.id === offeringId ? { ...x, inventoryQty: available } : x)));
  }, []);

  return {
    owner,
    isWorkspace,
    talentId,
    workspaceTenantId,
    items,
    defaultCurrency,
    legacyImportable,
    loading,
    saving,
    error,
    savedOk,
    draft,
    perf,
    setError,
    setDraft,
    persistItem,
    patchItem,
    saveDraft,
    removeItem,
    move,
    duplicate,
    startAdd,
    importLegacy,
    syncImages,
    syncOptions,
    syncStock,
  };
}
