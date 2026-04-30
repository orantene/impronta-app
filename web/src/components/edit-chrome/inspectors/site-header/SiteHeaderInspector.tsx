"use client";

/**
 * <SiteHeaderInspector> — the foundation drawer pattern.
 *
 * What this component is:
 *   - The single client surface for editing the public site header.
 *   - Mounted INSIDE the existing InspectorDock (right rail) so the
 *     visual chrome matches the rest of the editor.
 *   - Gated by the synthetic selection ID `__site_header__` — see the
 *     early-branch in inspector-dock.tsx.
 *
 * What this component owns:
 *   - Loading the config from agency_business_identity + agency_branding
 *     (and later cms_navigation_menus) via loadHeaderConfigAction.
 *   - The 6-tab IA: Brand / Navigation / Layout / Mobile / Behavior / Style.
 *   - The hybrid live-preview model: optimistic <html data-token-*> for
 *     theme tokens, router.refresh() for renderer-driven changes.
 *   - The unified save state — one autosave queue across three tables,
 *     one save indicator, one error surface.
 *
 * What this component does NOT own:
 *   - The tab rendering itself — each tab is its own file.
 *   - The per-tab read/write specifics — each tab gets a typed handle
 *     into the shared state and the save bus.
 *
 * The save bus:
 *   useSiteHeaderState() returns { config, patch fns, status }. Each
 *   patch fn:
 *     1. updates local state immediately (optimistic),
 *     2. updates the relevant <html data-token-*> attr if it's a token,
 *     3. enqueues a debounced server action,
 *     4. on settle, reconciles version + clears dirty.
 */

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CHROME, DrawerBody, DrawerTabs, DrawerTab } from "../../kit";
import {
  loadHeaderConfigAction,
  saveHeaderBrandingAction,
  saveHeaderIdentityAction,
  saveHeaderNavigationAction,
  saveHeaderTokenAction,
} from "@/lib/site-admin/site-header/actions";
import type {
  SiteHeaderConfig,
  SiteHeaderNavItemInput,
} from "@/lib/site-admin/site-header/types";

import { BrandTab } from "./tabs/BrandTab";
import { LayoutTab } from "./tabs/LayoutTab";
import { MobileTab } from "./tabs/MobileTab";
import { BehaviorTab } from "./tabs/BehaviorTab";
import { NavigationTab } from "./tabs/NavigationTab";
import { StyleTab } from "./tabs/StyleTab";

type TabKey =
  | "brand"
  | "navigation"
  | "layout"
  | "mobile"
  | "behavior"
  | "style";

const TAB_DEFS: Array<{ key: TabKey; label: string }> = [
  { key: "brand", label: "Brand" },
  { key: "navigation", label: "Navigation" },
  { key: "layout", label: "Layout" },
  { key: "mobile", label: "Mobile" },
  { key: "behavior", label: "Behavior" },
  { key: "style", label: "Style" },
];

export type SaveStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: number }
  | { kind: "error"; message: string };

// Patch interfaces exposed to tabs.
export interface SiteHeaderPatch {
  /** Patch identity (label, tagline, primary CTA). Renderer-driven; triggers refresh. */
  patchIdentity: (input: {
    publicName?: string;
    tagline?: string | null;
    primaryCtaLabel?: string | null;
    primaryCtaHref?: string | null;
  }) => void;
  /** Patch branding (logo, brand mark, colors, font). Renderer-driven; triggers refresh. */
  patchBranding: (input: {
    logoMediaAssetId?: string | null;
    brandMarkSvg?: string | null;
    primaryColor?: string | null;
    accentColor?: string | null;
    fontPreset?: string | null;
  }) => void;
  /** Patch a theme token. Token-driven; optimistic + autosave + no refresh. */
  patchToken: (key: string, value: string) => void;
  /** Replace the entire header nav list (one locale). Server diffs; triggers refresh. */
  patchNavigation: (items: SiteHeaderNavItemInput[]) => void;
}

export function SiteHeaderInspector({ tenantId }: { tenantId: string }) {
  const [tab, setTab] = useState<TabKey>("brand");
  const [config, setConfig] = useState<SiteHeaderConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [status, setStatus] = useState<SaveStatus>({ kind: "idle" });
  const [, startTransition] = useTransition();
  const router = useRouter();

  // ── Undo (single-step) ───────────────────────────────────────────────
  // We snapshot the config BEFORE each patch lands, store it in a ref,
  // and surface an "Undo" button in the drawer head whenever a snapshot
  // is available. Click → replay the snapshot's values via the same
  // patch functions, then clear the ref. Premium-builder rule:
  // operators expect to recover from a misclick without paging back
  // through the canvas.
  const undoSnapshotRef = useRef<SiteHeaderConfig | null>(null);
  const [hasUndo, setHasUndo] = useState(false);
  const captureUndo = useCallback(() => {
    if (!config) return;
    undoSnapshotRef.current = config;
    setHasUndo(true);
  }, [config]);
  const clearUndo = useCallback(() => {
    undoSnapshotRef.current = null;
    setHasUndo(false);
  }, []);

  // Auto-dismiss the "Saved" indicator after 1.5s. The "Saving…" state
  // stays visible the whole time the action is in flight; once it
  // settles we acknowledge briefly, then return the inspector to its
  // calm idle state. Premium UX rule: status messages don't camp on
  // the screen after they're no longer relevant.
  useEffect(() => {
    if (status.kind !== "saved") return;
    const t = setTimeout(() => {
      setStatus((s) => (s.kind === "saved" ? { kind: "idle" } : s));
    }, 1500);
    return () => clearTimeout(t);
  }, [status]);

  // Initial load.
  useEffect(() => {
    let cancelled = false;
    setLoadError(null);
    (async () => {
      const res = await loadHeaderConfigAction();
      if (cancelled) return;
      if (!res.ok) {
        setLoadError(res.error);
        return;
      }
      setConfig(res.config);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Save queue ───────────────────────────────────────────────────────
  // Single in-flight save + a queued "next" payload. The inspector
  // accumulates patches into the next payload while a save is in
  // flight, then drains. This prevents overlapping saves from racing
  // CAS and keeps the status indicator honest.

  type PendingKind = "identity" | "branding" | "token" | "navigation";
  type Pending = {
    kind: PendingKind;
    /** Payload accumulated for the next save (merged on every patch call). */
    payload: Record<string, unknown>;
    /** Optimistic version pointer — the value we expect to be the row's CAS. */
    expectedVersion: number;
  };
  const queueRef = useRef<Map<PendingKind, Pending>>(new Map());
  const flushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);

  const scheduleFlush = useCallback(() => {
    if (flushTimerRef.current) clearTimeout(flushTimerRef.current);
    flushTimerRef.current = setTimeout(() => {
      void flush();
    }, 450);
  }, []);

  const flush = useCallback(async () => {
    if (inFlightRef.current) {
      // Already saving — let it finish, then drain.
      await inFlightRef.current;
    }
    if (queueRef.current.size === 0) return;
    setStatus({ kind: "saving" });
    const work: Promise<void> = (async () => {
      let triggerRefresh = false;
      for (const [kind, entry] of queueRef.current.entries()) {
        try {
          if (kind === "identity") {
            const res = await saveHeaderIdentityAction({
              expectedVersion: entry.expectedVersion,
              ...(entry.payload as {
                publicName?: string;
                tagline?: string | null;
                primaryCtaLabel?: string | null;
                primaryCtaHref?: string | null;
              }),
            });
            if (!res.ok) throw new Error(res.error);
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    identity: { ...prev.identity, version: res.version },
                  }
                : prev,
            );
            triggerRefresh = true;
          } else if (kind === "branding") {
            const res = await saveHeaderBrandingAction({
              expectedVersion: entry.expectedVersion,
              ...(entry.payload as {
                logoMediaAssetId?: string | null;
                brandMarkSvg?: string | null;
              }),
            });
            if (!res.ok) throw new Error(res.error);
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    branding: { ...prev.branding, version: res.version },
                  }
                : prev,
            );
            triggerRefresh = true;
          } else if (kind === "token") {
            const res = await saveHeaderTokenAction({
              expectedVersion: entry.expectedVersion,
              patch: entry.payload as Record<string, string>,
            });
            if (!res.ok) throw new Error(res.error);
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    branding: {
                      ...prev.branding,
                      version: res.version,
                      themeJson: res.theme,
                    },
                  }
                : prev,
            );
            // Tokens render via CSS — no refresh needed; the optimistic
            // <html> mutation already shows the change.
          } else if (kind === "navigation") {
            const navPayload = entry.payload as {
              locale: string;
              items: SiteHeaderNavItemInput[];
            };
            const res = await saveHeaderNavigationAction(navPayload);
            if (!res.ok) throw new Error(res.error);
            // Server returns the canonical post-publish list (with new
            // ids for inserts). Replace local state so the UI rekeys.
            setConfig((prev) =>
              prev
                ? {
                    ...prev,
                    navigation: {
                      ...prev.navigation,
                      items: res.items,
                    },
                  }
                : prev,
            );
            triggerRefresh = true;
          }
          queueRef.current.delete(kind);
        } catch (e) {
          setStatus({
            kind: "error",
            message: e instanceof Error ? e.message : "Save failed.",
          });
          // Keep the entry in the queue so a retry could pick it up.
          return;
        }
      }
      if (triggerRefresh) {
        startTransition(() => router.refresh());
      }
      setStatus({ kind: "saved", at: Date.now() });
    })();
    inFlightRef.current = work;
    await work;
    inFlightRef.current = null;
    if (queueRef.current.size > 0) {
      // Another patch arrived during the in-flight save — drain again.
      scheduleFlush();
    }
  }, [router, scheduleFlush]);

  const enqueueIdentity = useCallback(
    (payload: Record<string, unknown>) => {
      if (!config) return;
      const existing = queueRef.current.get("identity");
      queueRef.current.set("identity", {
        kind: "identity",
        payload: { ...(existing?.payload ?? {}), ...payload },
        expectedVersion: existing?.expectedVersion ?? config.identity.version,
      });
      scheduleFlush();
    },
    [config, scheduleFlush],
  );
  const enqueueBranding = useCallback(
    (payload: Record<string, unknown>) => {
      if (!config) return;
      const existing = queueRef.current.get("branding");
      queueRef.current.set("branding", {
        kind: "branding",
        payload: { ...(existing?.payload ?? {}), ...payload },
        expectedVersion: existing?.expectedVersion ?? config.branding.version,
      });
      scheduleFlush();
    },
    [config, scheduleFlush],
  );
  const enqueueToken = useCallback(
    (key: string, value: string) => {
      if (!config) return;
      // Optimistic: update <html data-token-*> immediately so any
      // CSS-driven layout (variant, background, sticky toggle) reflects
      // before the server roundtrip lands.
      const attr = `data-token-${key.replace(/\./g, "-")}`;
      document.documentElement.setAttribute(attr, value);

      const existing = queueRef.current.get("token");
      queueRef.current.set("token", {
        kind: "token",
        payload: { ...(existing?.payload ?? {}), [key]: value },
        expectedVersion: existing?.expectedVersion ?? config.branding.version,
      });
      // Mirror into local config so tabs reading themeJson see the new value.
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              branding: {
                ...prev.branding,
                themeJson: { ...prev.branding.themeJson, [key]: value },
              },
            }
          : prev,
      );
      scheduleFlush();
    },
    [config, scheduleFlush],
  );

  const enqueueNavigation = useCallback(
    (items: SiteHeaderNavItemInput[]) => {
      if (!config) return;
      // Replace any pending nav save — the operator's latest desired
      // state supersedes all prior in-flight changes.
      queueRef.current.set("navigation", {
        kind: "navigation",
        payload: { locale: config.navigation.locale, items },
        // Nav doesn't use a single CAS version (each row has its own).
        // The action handles per-row CAS internally.
        expectedVersion: 0,
      });
      scheduleFlush();
    },
    [config, scheduleFlush],
  );

  const patch: SiteHeaderPatch = {
    patchIdentity: (input) => {
      captureUndo();
      // Optimistic local update so inputs stay snappy.
      setConfig((prev) =>
        prev ? { ...prev, identity: { ...prev.identity, ...mapIdentityInput(input) } } : prev,
      );
      enqueueIdentity(input);
    },
    patchBranding: (input) => {
      captureUndo();
      setConfig((prev) =>
        prev ? { ...prev, branding: { ...prev.branding, ...mapBrandingInput(input) } } : prev,
      );
      enqueueBranding(input);
    },
    patchToken: (key, value) => {
      captureUndo();
      enqueueToken(key, value);
    },
    patchNavigation: (items) => {
      captureUndo();
      // Optimistic: render the new list immediately, even before the
      // server persists. Items without ids stay locally-keyed; the
      // server's response replaces them with real ids on settle.
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              navigation: {
                ...prev.navigation,
                items: items.map((it, i) => ({
                  id: it.id ?? `__new_${i}_${Date.now()}__`,
                  label: it.label,
                  href: it.href,
                  visible: it.visible,
                  sortOrder: (i + 1) * 10,
                  version: it.expectedVersion ?? 0,
                })),
              },
            }
          : prev,
      );
      enqueueNavigation(items);
    },
  };

  // Undo handler — rebuilds the previous config via the same patch
  // bus. We touch ALL kinds so a single click rolls back whichever
  // table was last edited; the patch functions internally diff and
  // skip no-op writes.
  const handleUndo = useCallback(() => {
    const snap = undoSnapshotRef.current;
    if (!snap || !config) return;
    // Don't capture another undo while we're replaying the rollback.
    undoSnapshotRef.current = null;
    setHasUndo(false);

    // Identity rollback
    if (
      snap.identity.publicName !== config.identity.publicName ||
      snap.identity.tagline !== config.identity.tagline ||
      snap.identity.primaryCtaLabel !== config.identity.primaryCtaLabel ||
      snap.identity.primaryCtaHref !== config.identity.primaryCtaHref
    ) {
      setConfig((prev) => (prev ? { ...prev, identity: snap.identity } : prev));
      enqueueIdentity({
        publicName: snap.identity.publicName,
        tagline: snap.identity.tagline,
        primaryCtaLabel: snap.identity.primaryCtaLabel,
        primaryCtaHref: snap.identity.primaryCtaHref,
      });
    }

    // Branding rollback (logo/mark/colors/font + theme tokens)
    if (
      snap.branding.logoMediaAssetId !== config.branding.logoMediaAssetId ||
      snap.branding.brandMarkSvg !== config.branding.brandMarkSvg ||
      snap.branding.primaryColor !== config.branding.primaryColor ||
      snap.branding.accentColor !== config.branding.accentColor ||
      snap.branding.fontPreset !== config.branding.fontPreset
    ) {
      setConfig((prev) => (prev ? { ...prev, branding: snap.branding } : prev));
      enqueueBranding({
        logoMediaAssetId: snap.branding.logoMediaAssetId,
        brandMarkSvg: snap.branding.brandMarkSvg,
        primaryColor: snap.branding.primaryColor,
        accentColor: snap.branding.accentColor,
        fontPreset: snap.branding.fontPreset,
      });
    }

    // Theme-token rollback — diff each shell.* / background.* token.
    const tokenDiff: Record<string, string> = {};
    const allKeys = new Set([
      ...Object.keys(snap.branding.themeJson),
      ...Object.keys(config.branding.themeJson),
    ]);
    for (const key of allKeys) {
      const snapVal = snap.branding.themeJson[key];
      const curVal = config.branding.themeJson[key];
      if (snapVal !== curVal && snapVal !== undefined) {
        tokenDiff[key] = snapVal;
      }
    }
    if (Object.keys(tokenDiff).length > 0) {
      setConfig((prev) =>
        prev
          ? {
              ...prev,
              branding: {
                ...prev.branding,
                themeJson: { ...prev.branding.themeJson, ...tokenDiff },
              },
            }
          : prev,
      );
      // Apply each token via enqueueToken so optimistic <html> attrs flip
      for (const [key, value] of Object.entries(tokenDiff)) {
        enqueueToken(key, value);
      }
    }
  }, [config, enqueueIdentity, enqueueBranding, enqueueToken]);

  // Render.
  if (loadError) {
    return (
      <DrawerBody padding="14px">
        <div
          className="rounded-lg px-3 py-2.5 text-[12px]"
          style={{
            background: CHROME.amberBg,
            border: `1px solid ${CHROME.amberLine}`,
            color: CHROME.amber,
          }}
        >
          Couldn’t load header config — {loadError}
        </div>
      </DrawerBody>
    );
  }

  if (!config) {
    return (
      <DrawerBody padding="14px">
        <div className="text-[12px] text-stone-500">Loading header…</div>
      </DrawerBody>
    );
  }

  return (
    <>
      <div
        className="flex items-center justify-between gap-2"
        style={{ borderBottom: `1px solid ${CHROME.line}`, paddingBottom: 10 }}
      >
        <DrawerTabs>
          {TAB_DEFS.map((t) => (
            <DrawerTab
              key={t.key}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </DrawerTab>
          ))}
        </DrawerTabs>
        <UndoButton hasUndo={hasUndo} onUndo={handleUndo} />
      </div>
      <DrawerBody padding="14px 14px 32px">
        <SaveBanner status={status} />
        {tab === "brand" ? (
          <BrandTab config={config} patch={patch} tenantId={tenantId} />
        ) : tab === "navigation" ? (
          <NavigationTab config={config} patch={patch} />
        ) : tab === "layout" ? (
          <LayoutTab config={config} patch={patch} />
        ) : tab === "mobile" ? (
          <MobileTab config={config} patch={patch} />
        ) : tab === "behavior" ? (
          <BehaviorTab config={config} patch={patch} />
        ) : (
          <StyleTab config={config} patch={patch} />
        )}
      </DrawerBody>
    </>
  );
}

function mapIdentityInput(input: {
  publicName?: string;
  tagline?: string | null;
  primaryCtaLabel?: string | null;
  primaryCtaHref?: string | null;
}): Partial<SiteHeaderConfig["identity"]> {
  const out: Partial<SiteHeaderConfig["identity"]> = {};
  if (input.publicName !== undefined) out.publicName = input.publicName;
  if (input.tagline !== undefined) out.tagline = input.tagline;
  if (input.primaryCtaLabel !== undefined)
    out.primaryCtaLabel = input.primaryCtaLabel;
  if (input.primaryCtaHref !== undefined)
    out.primaryCtaHref = input.primaryCtaHref;
  return out;
}

function mapBrandingInput(input: {
  logoMediaAssetId?: string | null;
  brandMarkSvg?: string | null;
  primaryColor?: string | null;
  accentColor?: string | null;
  fontPreset?: string | null;
}): Partial<SiteHeaderConfig["branding"]> {
  const out: Partial<SiteHeaderConfig["branding"]> = {};
  if (input.logoMediaAssetId !== undefined)
    out.logoMediaAssetId = input.logoMediaAssetId;
  if (input.brandMarkSvg !== undefined)
    out.brandMarkSvg = input.brandMarkSvg;
  if (input.primaryColor !== undefined) out.primaryColor = input.primaryColor;
  if (input.accentColor !== undefined) out.accentColor = input.accentColor;
  if (input.fontPreset !== undefined) out.fontPreset = input.fontPreset;
  return out;
}

/**
 * Single-step undo pill, mounted next to the tab bar. Disabled when
 * there's nothing to roll back. Single-step is intentional: deeper
 * history is a separate concern and operators rarely need more than
 * one step of "wait, that wasn't right" recovery in a drawer.
 */
function UndoButton({
  hasUndo,
  onUndo,
}: {
  hasUndo: boolean;
  onUndo: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onUndo}
      disabled={!hasUndo}
      title={hasUndo ? "Undo last change" : "Nothing to undo"}
      aria-label="Undo last change"
      className={`mr-2 inline-flex size-7 shrink-0 items-center justify-center rounded-md transition-[opacity,background-color] duration-150 active:scale-[0.96] ${
        hasUndo
          ? "text-stone-500 hover:bg-[#faf9f6] hover:text-stone-800"
          : "pointer-events-none opacity-30"
      }`}
    >
      <svg
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <path d="M3 7v6h6" />
        <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
      </svg>
    </button>
  );
}

function SaveBanner({ status }: { status: SaveStatus }) {
  // Errors keep the bordered red treatment — they're the only state
  // worth "stopping the operator." Saving / Saved are inline status
  // dots, not banners.
  if (status.kind === "error") {
    return (
      <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12px] text-red-700">
        {status.message}
      </div>
    );
  }
  if (status.kind === "saving" || status.kind === "saved") {
    const saving = status.kind === "saving";
    return (
      <div
        className={`mb-3 flex items-center gap-2 text-[10.5px] transition-opacity duration-200 ${
          saving ? "text-stone-400" : "text-emerald-700/70"
        }`}
      >
        <span
          className={`inline-block size-1.5 rounded-full ${
            saving ? "animate-pulse bg-indigo-400" : "bg-emerald-500"
          }`}
        />
        {saving ? "Saving…" : "Saved"}
      </div>
    );
  }
  return null;
}
