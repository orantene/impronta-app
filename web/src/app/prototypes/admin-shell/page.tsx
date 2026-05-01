"use client";

/**
 * Admin Shell — Clickable High-Fidelity Prototype
 *
 * This is a fake-but-real SaaS experience for the Tulala/Impronta admin
 * surface. It is NOT wired to any backend — every drawer, click, and
 * state change runs in local React Context (`ProtoProvider`).
 *
 * Architecture (5-file split):
 *   page.tsx         — entry point (this file). Mounts the provider tree.
 *   _state.tsx       — types, mock data, ProtoProvider, useProto, tokens
 *   _primitives.tsx  — Icon library, atoms, cards, drawer/modal shells, ToastHost
 *   _pages.tsx       — ControlBar, WorkspaceTopbar, all surface/page renderers
 *   _drawers.tsx     — DrawerRoot dispatcher, every drawer body, UpgradeModal
 *
 * Four prototype dimensions (set via the dark ControlBar at the top):
 *   Surface           — workspace · talent · client · platform
 *   Plan              — free · studio · agency · network
 *   Role              — viewer → editor → coordinator → admin → owner
 *   TalentRelationship — alsoTalent on/off (am I a talent on this roster?)
 *
 * State is bidirectionally synced with the URL query string via
 * `replaceState`, so a refresh keeps your scene and you can paste a link
 * to a teammate.
 *
 * Dev-handoff documentation lives at `web/docs/admin-redesign/dev-handoff.md`.
 */

import { Component, Suspense, useEffect, useRef, useState, type ReactNode } from "react";
import {
  ProtoProvider, useProto, COLORS, FONTS, RADIUS, TRANSITION, Z, meetsRole,
  WORKSPACE_PAGES, PAGE_META,
  TALENT_PAGE_META, CLIENT_PAGE_META, PLATFORM_PAGE_META,
  FAB_PALETTE_OPEN_EVENT, FAB_PALETTE_CHANGED_EVENT,
  type FabPaletteChangedDetail,
} from "./_state";
// FeedbackButton intentionally NOT imported — it was the legacy bottom-right
// FAB and now lives dormant in _primitives. The new unified BottomActionFab
// owns that screen position; feedback is reachable via the FAB's Ask AI tab.
import { Icon, ToastHost, BackToTop, OfflineBanner, ShortcutsModal } from "./_primitives";
import { AdminTour } from "./_admin-tour";
import { ControlBar, MobileBottomNav, SurfaceRouter } from "./_pages";
import { DrawerRoot, UpgradeModal } from "./_drawers";
import { CommandPalette } from "./_palette";
import { MOCK_CONVERSATIONS } from "./_talent";
import { DRAWER_HELP } from "./_help";

// ─── Toast bridge (reads from context, passes to dumb host) ──────────

function ToastBridge() {
  const { state, dismissToast } = useProto();
  return <ToastHost toasts={state.toasts} onDismiss={dismissToast} />;
}

/**
 * Browser tab title reflects total unread count. e.g. "(3) Tulala" so
 * the talent sees at a glance from another tab that something needs
 * them. Reads talent-surface MOCK_CONVERSATIONS for the count.
 */
function TabTitleBridge() {
  useEffect(() => {
    if (typeof document === "undefined") return;
    const unread = MOCK_CONVERSATIONS.reduce((s, c) => s + (c.unreadCount || 0), 0);
    const base = "Tulala";
    document.title = unread > 0 ? `(${unread}) ${base}` : base;
    return () => {
      document.title = base;
    };
  }, []);
  return null;
}

/**
 * Audit item #6 — hide the dev-only PROTOTYPE control bar (Surface /
 * Plan / Role pickers) unless `?dev=1` is on the URL. Demos look like
 * the real product by default; engineers add `?dev=1` to switch
 * dimensions during testing.
 *
 * The visibility flag is also written to a CSS variable so sticky
 * descendants (IdentityBar, mode-shell topbars/sidebars) can adjust
 * their `top` offset without prop-drilling. See `--proto-cbar` below.
 */
function useDevControlBar() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      setShow(new URLSearchParams(window.location.search).get("dev") === "1");
    } catch {
      /* ignore */
    }
  }, []);
  return show;
}

function DevOnlyControlBar({ show }: { show: boolean }) {
  if (!show) return null;
  return <ControlBar />;
}


// ─── Error boundary (#26) ─────────────────────────────────────────────
// Catches render-time exceptions and shows a friendly fallback page.

class ErrorBoundary extends Component<
  { children: ReactNode },
  { caught: Error | null }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { caught: null };
  }
  static getDerivedStateFromError(err: Error) {
    return { caught: err };
  }
  render() {
    if (this.state.caught) {
      return (
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            minHeight: "100vh",
            gap: 16,
            fontFamily: "system-ui, sans-serif",
            padding: 32,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 40 }}>⚠️</div>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>Something broke</h1>
          <p style={{ fontSize: 14, color: "rgba(11,11,13,0.6)", margin: 0 }}>
            {this.state.caught.message || "An unexpected error occurred."}
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              marginTop: 8,
              padding: "10px 22px",
              background: "#0F4F3E",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ─── Page entry ──────────────────────────────────────────────────────

export default function AdminShellPrototypePage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <ProtoProvider>
          <PrototypeRoot />
        </ProtoProvider>
      </Suspense>
    </ErrorBoundary>
  );
}

function PrototypeRoot() {
  const defaultShow = useDevControlBar();
  const [showDevBar, setShowDevBar] = useState(defaultShow);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  // Sync once the URL-param check resolves (runs after mount)
  useEffect(() => { setShowDevBar(defaultShow); }, [defaultShow]);

  // ⌘? / ? opens the keyboard shortcuts modal (#18)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const inInput = target?.matches("input, textarea, select, [contenteditable]");
      if (e.key === "?" && !inInput) setShortcutsOpen(true);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // 2026 #11 — Service Worker for offline draft persistence. Scoped to
  // /prototypes/admin-shell so we don't pollute production routes.
  // Best-effort: registration failures are non-fatal.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;
    if (!window.location.pathname.startsWith("/prototypes/admin-shell")) return;
    navigator.serviceWorker
      .register("/tulala-prototype-sw.js", { scope: "/prototypes/admin-shell/" })
      .catch(() => {
        // SW registration failed — prototype still works, just no offline.
      });
  }, []);

  return (
    <>
      <ProtoProviderInnerOriginal showDevBar={showDevBar} />
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
      {/* Floating toggle — always visible so users can reveal/hide the
          prototype control bar without touching the URL. */}
      <button
        type="button"
        title={showDevBar ? "Hide prototype controls" : "Show prototype controls"}
        onClick={() => setShowDevBar((v) => !v)}
        style={{
          position: "fixed",
          bottom: 18,
          left: 18,
          zIndex: 9999,
          width: 36,
          height: 36,
          borderRadius: 10,
          background: showDevBar ? "#1a1a1f" : "rgba(11,11,13,0.85)",
          border: "1.5px solid rgba(255,255,255,0.14)",
          color: "#fff",
          cursor: "pointer",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          backdropFilter: "blur(8px)",
          boxShadow: "0 2px 10px rgba(0,0,0,0.28)",
          transition: "background .15s, transform .1s",
          fontFamily: "system-ui, sans-serif",
          fontSize: 13,
          fontWeight: 700,
          letterSpacing: -0.3,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.08)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        ⚙
      </button>
    </>
  );
}


// ════════════════════════════════════════════════════════════════════
// BottomActionFab — unified bottom-right "+" that opens a panel with
// two tabs: Create (quick-create list) + Ask AI (chat).
// Replaces the topbar "+ New" + standalone AI sparkle button.
// ════════════════════════════════════════════════════════════════════

type FabTab = "create" | "ai" | "recent";

// Mock counts surfaced as notification dots on the FAB.
// Production wires these to real queue/draft counts.
const FAB_PENDING_APPROVALS_MOCK = 3;
const FAB_DRAFTS_MOCK = 2;

/** Stable popover ID — referenced by:
 *  - the FAB button via popoverTarget
 *  - the window event "tulala:open-fab-palette" (⌘K, palette nav, etc.)
 *  - the imperative .showPopover()/.hidePopover() calls below */
const FAB_POPOVER_ID = "tulala-fab-popover";

function BottomActionFab() {
  const { state, openDrawer, setPage, setTalentPage, setClientPage, setPlatformPage, toast } = useProto();
  // Native popover-driven open/close — listens to the browser's
  // toggle event so React state still mirrors visibility for animation
  // + auto-reset of search input. The browser handles outside-click,
  // escape, and ::backdrop for free.
  const [open, setOpen] = useState(false);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const searchRef = useRef<HTMLInputElement | null>(null);

  // #1 (deferred → shipped) — Unified FAB across all four surfaces.
  // Each surface gets its own Create items but the shell, Recent tab,
  // and AI tab are shared. Removes the legacy purple Concierge FAB +
  // Messages FAB on talent/client surfaces.
  const contextDefault: FabTab = "create";
  const [tab, setTab] = useState<FabTab>(contextDefault);
  const [query, setQuery] = useState("");
  const [aiSeed, setAiSeed] = useState<string>("");
  const [selIdx, setSelIdx] = useState(0);

  // Track the popover's toggle event — browser-driven open/close
  useEffect(() => {
    const el = popoverRef.current;
    if (!el) return;
    const onToggle = (e: Event) => {
      const isOpen = (e as ToggleEvent).newState === "open";
      setOpen(isOpen);
      if (isOpen) {
        setQuery("");
        setAiSeed("");
        setTab(contextDefault);
        setSelIdx(0);
        // Focus the search input after the browser paints the popover.
        // Two-frame delay because top-layer promotion runs after toggle.
        requestAnimationFrame(() => requestAnimationFrame(() => searchRef.current?.focus()));
      }
    };
    el.addEventListener("toggle", onToggle);
    return () => el.removeEventListener("toggle", onToggle);
  }, [contextDefault]);

  // External open trigger (⌘K, palette redirect, etc.) — calls showPopover.
  // Falls back to setOpen(true) if popover API isn't supported (very old
  // browsers); the conditional render below handles both paths.
  useEffect(() => {
    const onOpen = () => {
      const el = popoverRef.current;
      if (el && typeof (el as HTMLElement & { showPopover?: () => void }).showPopover === "function") {
        try { (el as HTMLElement & { showPopover: () => void }).showPopover(); return; } catch {}
      }
      setOpen(true);
    };
    window.addEventListener(FAB_PALETTE_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(FAB_PALETTE_OPEN_EVENT, onOpen);
  }, []);

  // Broadcast open/close so the surrounding shell can treat the palette as
  // a modal layer (suppressing global keyboard shortcuts while it's open).
  useEffect(() => {
    const detail: FabPaletteChangedDetail = { open };
    window.dispatchEvent(new CustomEvent(FAB_PALETTE_CHANGED_EVENT, { detail }));
  }, [open]);

  const totalDots = state.surface === "workspace"
    ? FAB_PENDING_APPROVALS_MOCK + FAB_DRAFTS_MOCK
    : 0;

  // Helper to close the popover from inside (e.g. clicking a Create item).
  const hidePopover = () => {
    const el = popoverRef.current;
    if (el && typeof (el as HTMLElement & { hidePopover?: () => void }).hidePopover === "function") {
      try { (el as HTMLElement & { hidePopover: () => void }).hidePopover(); return; } catch {}
    }
    setOpen(false);
  };

  // Quick-create + navigate items — surface-specific. The unified palette
  // mixes "create X" actions with "go to Y" jumps in one filterable list,
  // replacing the legacy Cmd-K palette's separate sections.
  type Item = { id: string; label: string; sub: string; icon: string; shortcut?: string; canDo: boolean; run: () => void };
  const items: Item[] = (() => {
    if (state.surface === "talent") {
      const create: Item[] = [
        { id: "block-dates",    label: "Block dates",     sub: "Mark days you're not available",    icon: "calendar", canDo: true,
          run: () => openDrawer("talent-block-dates") },
        { id: "edit-profile",   label: "Edit profile",     sub: "Update photos, bio, rates",         icon: "user",     canDo: true,
          run: () => openDrawer("talent-profile-edit") },
        { id: "polaroids",      label: "Add polaroids",    sub: "Front · side · back · smile",       icon: "plus",     canDo: true,
          run: () => openDrawer("talent-polaroids") },
      ];
      const nav: Item[] = (Object.keys(TALENT_PAGE_META) as Array<keyof typeof TALENT_PAGE_META>).map((p) => ({
        id: `nav-talent-${p}`,
        label: `Go to ${TALENT_PAGE_META[p].label}`,
        sub: "Talent surface",
        icon: "arrow-right",
        canDo: true,
        run: () => setTalentPage(p),
      }));
      return [...create, ...nav];
    }
    if (state.surface === "client") {
      const create: Item[] = [
        { id: "new-inquiry",    label: "Send an inquiry",  sub: "Brief us — we'll reply in <2h",     icon: "plus",     canDo: true,
          run: () => openDrawer("client-send-inquiry") },
        { id: "shortlist",      label: "Build a shortlist", sub: "Save talent + share a brief",       icon: "team",     canDo: true,
          run: () => openDrawer("client-new-shortlist") },
      ];
      const nav: Item[] = (Object.keys(CLIENT_PAGE_META) as Array<keyof typeof CLIENT_PAGE_META>).map((p) => ({
        id: `nav-client-${p}`,
        label: `Go to ${CLIENT_PAGE_META[p].label}`,
        sub: "Client surface",
        icon: "arrow-right",
        canDo: true,
        run: () => setClientPage(p),
      }));
      return [...create, ...nav];
    }
    if (state.surface === "platform") {
      const create: Item[] = [
        { id: "new-tenant",     label: "New tenant",       sub: "Onboard an agency or hub",          icon: "plus",     canDo: true,
          run: () => toast("Open tenant intake") },
        { id: "ops",            label: "Operations alerts", sub: "Cross-tenant flags",                icon: "info",     canDo: true,
          run: () => toast("Open operations") },
      ];
      const nav: Item[] = (Object.keys(PLATFORM_PAGE_META) as Array<keyof typeof PLATFORM_PAGE_META>).map((p) => ({
        id: `nav-platform-${p}`,
        label: `Go to ${PLATFORM_PAGE_META[p].label}`,
        sub: "Platform surface",
        icon: "arrow-right",
        canDo: true,
        run: () => setPlatformPage(p),
      }));
      return [...create, ...nav];
    }
    // workspace (default)
    const create: Item[] = [
      { id: "new-inquiry",    label: "New inquiry",       sub: "Capture a lead from a client",        icon: "plus",     shortcut: "G I", canDo: meetsRole(state.role, "coordinator") || state.plan === "free",
        run: () => openDrawer("new-inquiry") },
      { id: "new-booking",    label: "New booking",       sub: "Confirmed job — skip the inquiry",    icon: "calendar", shortcut: "G B", canDo: meetsRole(state.role, "coordinator"),
        run: () => openDrawer("new-booking") },
      { id: "new-talent",     label: "Add talent",        sub: "Create a roster profile",             icon: "user",     shortcut: "G T", canDo: meetsRole(state.role, "editor"),
        run: () => openDrawer("new-talent") },
      { id: "new-client",     label: "Add client",        sub: "Track a relationship",                icon: "team",     shortcut: "G C", canDo: meetsRole(state.role, "coordinator") && state.plan !== "free",
        run: () => openDrawer("client-profile", { id: "new" }) },
      { id: "invite-team",    label: "Invite teammate",   sub: "Coordinator or editor",               icon: "plus",     shortcut: "G U", canDo: meetsRole(state.role, "admin"),
        run: () => openDrawer("team") },
      { id: "snippets",       label: "New snippet",       sub: "Reusable reply for the composer",     icon: "plus",     shortcut: "G S", canDo: meetsRole(state.role, "coordinator"),
        run: () => openDrawer("inbox-snippets") },
      { id: "share-card",     label: "Share talent",      sub: "Send a client-facing standalone link", icon: "plus",    shortcut: "G H", canDo: meetsRole(state.role, "coordinator"),
        run: () => openDrawer("talent-share-card") },
    ];
    const nav: Item[] = WORKSPACE_PAGES.map((p) => ({
      id: `nav-ws-${p}`,
      label: `Go to ${PAGE_META[p]?.label ?? p}`,
      sub: PAGE_META[p]?.description ?? "Workspace surface",
      icon: "arrow-right",
      canDo: true,
      run: () => setPage(p),
    }));
    return [...create, ...nav];
  })();

  const allowedItems = items.filter(i => i.canDo);

  const q = query.trim().toLowerCase();
  const filteredItems = q
    ? allowedItems.filter(i =>
        i.label.toLowerCase().includes(q) || i.sub.toLowerCase().includes(q)
      )
    : allowedItems;

  // Clamp selection whenever the filtered list shrinks/changes.
  useEffect(() => {
    setSelIdx((idx) => {
      if (filteredItems.length === 0) return 0;
      return Math.min(idx, filteredItems.length - 1);
    });
  }, [filteredItems.length, query]);

  // Keep the selected row visible as the user navigates with arrow keys.
  useEffect(() => {
    if (!open || tab !== "create") return;
    const list = popoverRef.current?.querySelector('[role="listbox"]');
    const row = list?.querySelectorAll('[role="option"]')[selIdx] as HTMLElement | undefined;
    row?.scrollIntoView({ block: "nearest" });
  }, [selIdx, open, tab]);

  const goToAi = (seed: string) => {
    setAiSeed(seed);
    setTab("ai");
  };

  const runSelected = () => {
    if (filteredItems.length > 0) {
      const it = filteredItems[Math.min(selIdx, filteredItems.length - 1)];
      it.run();
      hidePopover();
    } else if (q) {
      goToAi(query.trim());
    }
  };

  const moveSel = (delta: number) => {
    if (filteredItems.length === 0) return;
    setSelIdx((idx) => {
      const next = (idx + delta + filteredItems.length) % filteredItems.length;
      return next;
    });
  };

  return (
    <div data-tulala-bottom-fab style={{
      position: "fixed",
      bottom: "calc(80px + env(safe-area-inset-bottom))",
      right: 16,
      zIndex: Z.toast - 10,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 10,
      fontFamily: FONTS.body,
    }}>
      {/* Panel — native popover. Browser handles light-dismiss (outside
          click + escape) and renders on the top layer. We position it via
          fixed coords below; popover="auto" keeps it isolated from
          surrounding stacking contexts. The popoverRef + toggle event wire
          React state for animation + focus management. */}
      <div
        ref={popoverRef}
        id={FAB_POPOVER_ID}
        {...({ popover: "auto" } as Record<string, string>)}
        style={{
          // popover="auto" sets `display:none` until shown; once shown, the
          // browser promotes to top layer and `display: revert`s. The UA
          // sets `inset: 0; margin: auto` by default — neutralize inset
          // so our bottom/right anchoring actually positions the panel.
          position: "fixed",
          inset: "auto",
          bottom: "calc(146px + env(safe-area-inset-bottom))",
          right: 16,
          width: 340,
          maxWidth: "calc(100vw - 32px)",
          maxHeight: "calc(100vh - 180px)",
          background: "#fff",
          borderRadius: 18,
          boxShadow: "0 24px 60px -10px rgba(11,11,13,0.30), 0 4px 16px rgba(11,11,13,0.06)",
          border: `1px solid ${COLORS.borderSoft}`,
          overflow: "hidden",
          flexDirection: "column",
          margin: 0,
          padding: 0,
          fontFamily: FONTS.body,
          // Use display:flex when open. Browsers that respect popover will
          // toggle via [popover] selector; we also respect React's `open`
          // state so legacy fallback works.
          display: open ? "flex" : "none",
          animation: "tulalaFabSlideUp .18s cubic-bezier(.22,1,.36,1)",
        }}
      >
          <style dangerouslySetInnerHTML={{ __html:
            "@keyframes tulalaFabSlideUp {" +
              "from { opacity: 0; transform: translateY(12px) scale(0.96); }" +
              "to   { opacity: 1; transform: translateY(0) scale(1); }" +
            "}" +
            "@keyframes tulalaFabSheetSlideUp {" +
              "from { transform: translateY(100%); }" +
              "to   { transform: translateY(0); }" +
            "}" +
            "#" + FAB_POPOVER_ID + ":popover-open { display: flex !important; }" +
            "#" + FAB_POPOVER_ID + "::backdrop { background: rgba(11,11,13,0); transition: background 0.2s; }" +
            /* Mobile bottom-sheet: panel anchors to viewport bottom, takes
               full width, ~78vh tall. The internal flex order is reversed
               so the search input lands at the bottom (thumb reach) with
               results stacked above. A drag handle hints at the sheet
               affordance (real drag-to-dismiss handled by the popover's
               built-in light-dismiss + swipe via the input keyboard). */
            "@media (max-width: 767px) {" +
              "#" + FAB_POPOVER_ID + " {" +
                "left: 0 !important; right: 0 !important; bottom: 0 !important;" +
                "width: 100% !important; max-width: 100% !important;" +
                "max-height: 82vh !important;" +
                "border-radius: 18px 18px 0 0 !important;" +
                "flex-direction: column-reverse !important;" +
                "animation: tulalaFabSheetSlideUp .22s cubic-bezier(.22,1,.36,1) !important;" +
              "}" +
              "#" + FAB_POPOVER_ID + "::backdrop { background: rgba(11,11,13,0.42) !important; }" +
              "#" + FAB_POPOVER_ID + " [data-tulala-fab-sheet-handle] { display: flex !important; }" +
            "}"
          }} />

          {/* Search bar — single input, three scopes via tabs below */}
          <div style={{
            display: "flex", alignItems: "center", gap: 8,
            padding: "12px 14px 10px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}>
            <Icon name="search" size={14} stroke={1.7} color={COLORS.inkMuted} />
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                if (tab !== "create") setTab("create");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); runSelected(); }
                else if (e.key === "ArrowDown") { e.preventDefault(); moveSel(1); }
                else if (e.key === "ArrowUp")   { e.preventDefault(); moveSel(-1); }
                else if (e.key === "Escape" && query) { e.preventDefault(); setQuery(""); }
              }}
              placeholder="Search, create, or ask Tulala…"
              aria-label="Search, create, or ask"
              style={{
                flex: 1, minWidth: 0,
                border: "none", outline: "none", background: "transparent",
                fontFamily: FONTS.body, fontSize: 13.5, color: COLORS.ink,
                letterSpacing: -0.1,
              }}
            />
            {query ? (
              <button type="button" onClick={() => { setQuery(""); searchRef.current?.focus(); }}
                aria-label="Clear search"
                style={{
                  border: "none", background: "rgba(11,11,13,0.06)", cursor: "pointer",
                  color: COLORS.inkMuted,
                  width: 20, height: 20, borderRadius: 999,
                  display: "inline-flex", alignItems: "center", justifyContent: "center",
                  flexShrink: 0,
                }}>
                <Icon name="x" size={11} />
              </button>
            ) : (
              <kbd style={{
                fontSize: 10, fontFamily: FONTS.mono,
                color: COLORS.inkMuted,
                background: "rgba(11,11,13,0.05)",
                border: `1px solid ${COLORS.borderSoft}`,
                padding: "1px 6px", borderRadius: 4,
                flexShrink: 0,
              }}>esc</kbd>
            )}
          </div>

          {/* Scope tabs (filters for the input above) */}
          <div style={{
            display: "flex",
            padding: "8px 12px",
            gap: 4,
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}>
            <FabTabButton label="Create" icon="plus" active={tab === "create"} onClick={() => setTab("create")} />
            <FabTabButton label="Recent" icon="bolt" active={tab === "recent"} onClick={() => setTab("recent")} badge={FAB_DRAFTS_MOCK > 0 ? FAB_DRAFTS_MOCK : undefined} />
            <FabTabButton label="Ask AI" icon="sparkle" active={tab === "ai"} onClick={() => { setAiSeed(query.trim()); setTab("ai"); }} accent="royal" />
          </div>

          {/* Body */}
          {tab === "create" && (
            <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: "8px 6px" }} role="listbox" aria-label="Search results">
              {filteredItems.map((it, idx) => {
                const selected = idx === Math.min(selIdx, filteredItems.length - 1);
                return (
                <button key={it.id} type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => { it.run(); hidePopover(); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "9px 10px", margin: "0 4px",
                    background: selected ? COLORS.surfaceAlt : "transparent",
                    border: "none",
                    width: "calc(100% - 8px)", textAlign: "left",
                    fontFamily: FONTS.body, cursor: "pointer",
                    borderRadius: 10,
                    transition: `background ${TRANSITION.micro}`,
                  }}
                >
                  <span style={{
                    width: 32, height: 32, borderRadius: 9,
                    background: selected ? "#fff" : COLORS.surfaceAlt,
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0, color: COLORS.ink,
                    boxShadow: selected ? `0 0 0 1px ${COLORS.borderSoft}` : "none",
                  }}>
                    <Icon name={it.icon as any} size={14} stroke={1.7} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 13.5, fontWeight: 600, color: COLORS.ink, letterSpacing: -0.1 }}>
                      {it.label}
                    </span>
                    <span style={{ display: "block", fontSize: 11.5, color: COLORS.inkMuted, marginTop: 1 }}>
                      {it.sub}
                    </span>
                  </span>
                  {selected ? (
                    <span aria-hidden style={{
                      fontSize: 10, fontFamily: FONTS.mono,
                      color: COLORS.inkMuted,
                      background: "#fff",
                      border: `1px solid ${COLORS.borderSoft}`,
                      padding: "1px 6px", borderRadius: 4,
                      flexShrink: 0,
                    }}>↵</span>
                  ) : it.shortcut ? (
                    <span style={{ display: "inline-flex", gap: 3, flexShrink: 0 }}>
                      {it.shortcut.split(" ").map(k => (
                        <span key={k} style={{
                          fontSize: 9.5, fontFamily: FONTS.mono,
                          color: COLORS.inkMuted,
                          background: "rgba(11,11,13,0.05)",
                          padding: "1px 5px", borderRadius: 4,
                          minWidth: 14, textAlign: "center",
                        }}>{k}</span>
                      ))}
                    </span>
                  ) : null}
                </button>
              );
              })}

              {q && filteredItems.length === 0 && (
                <div style={{
                  padding: "14px 14px 6px",
                  fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5,
                }}>
                  No matching action. Ask Tulala instead?
                </div>
              )}

              {q && (
                <button type="button"
                  onClick={() => goToAi(query.trim())}
                  style={{
                    display: "flex", alignItems: "center", gap: 11,
                    padding: "10px 10px", margin: "4px 4px 0",
                    background: COLORS.royalSoft,
                    border: `1px solid rgba(95,75,139,0.16)`,
                    width: "calc(100% - 8px)", textAlign: "left",
                    fontFamily: FONTS.body, cursor: "pointer",
                    borderRadius: 10,
                  }}
                >
                  <span style={{
                    width: 32, height: 32, borderRadius: 9,
                    background: "#fff",
                    display: "inline-flex", alignItems: "center", justifyContent: "center",
                    flexShrink: 0,
                  }}>
                    <Icon name="sparkle" size={14} stroke={1.7} color={COLORS.royalDeep} />
                  </span>
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 12, fontWeight: 600, color: COLORS.royalDeep, letterSpacing: 0.2, textTransform: "uppercase" }}>
                      Ask AI
                    </span>
                    <span style={{ display: "block", fontSize: 13, color: COLORS.ink, marginTop: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {query.trim()}
                    </span>
                  </span>
                  <span aria-hidden style={{
                    fontSize: 9.5, fontFamily: FONTS.mono,
                    color: COLORS.royalDeep,
                    background: "#fff",
                    padding: "1px 6px", borderRadius: 4,
                  }}>↵</span>
                </button>
              )}

              {!q && state.surface === "workspace" && (
                <div style={{
                  margin: "6px 8px 4px",
                  padding: "8px 8px 4px",
                  borderTop: `1px solid ${COLORS.borderSoft}`,
                  fontSize: 10.5, color: COLORS.inkDim,
                }}>
                  Press G then a key from anywhere to quick-create.
                </div>
              )}
            </div>
          )}

          {tab === "recent" && <FabRecentPanel query={q} />}
          {tab === "ai" && <FabAiPanel seedQuestion={aiSeed} />}

          {/* Mobile-only sheet drag handle. Hidden on desktop via the inline
              <style> rule; visible at the top of the bottom sheet because
              the panel uses flex-direction: column-reverse on phones, so
              the LAST DOM child paints at the visual top. Tapping the
              handle closes the sheet — full drag-to-dismiss isn't wired
              (popover API doesn't expose touch deltas) but tap-to-close
              gives the affordance a real action. */}
          <button
            type="button"
            data-tulala-fab-sheet-handle
            aria-label="Close palette"
            onClick={hidePopover}
            style={{
              display: "none",
              padding: "8px 0 4px",
              justifyContent: "center",
              alignItems: "center",
              flexShrink: 0,
              border: "none",
              background: "transparent",
              cursor: "pointer",
              width: "100%",
            }}
          >
            <span aria-hidden style={{
              display: "block",
              width: 36, height: 4,
              borderRadius: 999,
              background: "rgba(11,11,13,0.18)",
            }} />
          </button>
        </div>

      {/* The "+" button itself — with notification dot if work is pending.
          popoverTarget wires the native open/close behavior; React state
          mirrors via the popoverRef toggle event listener. */}
      <div style={{ position: "relative" }}>
        <button
          type="button"
          {...({ popoverTarget: FAB_POPOVER_ID, popoverTargetAction: "toggle" } as Record<string, string>)}
          aria-label={open ? "Close quick actions" : `Open quick actions${totalDots > 0 ? ` · ${totalDots} pending` : ""}`}
          aria-expanded={open}
          aria-controls={FAB_POPOVER_ID}
          title="Quick actions (⌘K)"
          style={{
            width: 52, height: 52, borderRadius: 16,
            background: open ? COLORS.fill : COLORS.fill,
            color: "#fff", border: "none", cursor: "pointer",
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            boxShadow: open
              ? "0 12px 32px -8px rgba(11,11,13,0.45), 0 2px 6px rgba(11,11,13,0.15)"
              : "0 8px 24px -6px rgba(11,11,13,0.35), 0 2px 6px rgba(11,11,13,0.12)",
            transition: `transform ${TRANSITION.sm}, box-shadow ${TRANSITION.sm}`,
            transform: open ? "rotate(45deg)" : "rotate(0)",
          }}>
          <Icon name="plus" size={20} stroke={2} color="#fff" />
        </button>
        {!open && totalDots > 0 && (
          <span aria-hidden style={{
            position: "absolute", top: -4, right: -4,
            minWidth: 20, height: 20, padding: "0 6px",
            borderRadius: 999,
            background: COLORS.amberDeep, color: "#fff",
            fontSize: 11, fontWeight: 700,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            border: "2px solid #fff",
            boxShadow: "0 2px 6px rgba(11,11,13,0.20)",
            fontFamily: FONTS.body,
          }}>{totalDots}</span>
        )}
      </div>
    </div>
  );
}

// Recent tab — surfaces drafts + last-created items so power users can resume.
// `query` is the search input from the parent FAB; when present, drafts +
// recent rows are filtered by label/note substring.
function FabRecentPanel({ query = "" }: { query?: string }) {
  const { openDrawer, toast } = useProto();
  const drafts = [
    { id: "draft-1", label: "Maria Sandoval — promo model", note: "Draft · started 2h ago", action: () => toast("Resume Maria's profile") },
    { id: "draft-2", label: "Carlos Pérez — DJ",            note: "Draft · started 3d ago", action: () => toast("Resume Carlos's profile") },
  ];
  const recent = [
    { id: "r-1", label: "Sofia Lupo invited",               note: "Talent · 12 min ago",  action: () => openDrawer("talent-approvals") },
    { id: "r-2", label: "RI-208 inquiry created",           note: "Inquiry · 1h ago",     action: () => openDrawer("inquiry-peek", { id: "RI-208" }) },
    { id: "r-3", label: "Tomás Navarro published",          note: "Talent · yesterday",   action: () => toast("Open Tomás") },
  ];
  const q = query.trim().toLowerCase();
  const match = (it: { label: string; note: string }) =>
    !q || it.label.toLowerCase().includes(q) || it.note.toLowerCase().includes(q);
  const filteredDrafts = drafts.filter(match);
  const filteredRecent = recent.filter(match);
  const empty = q && filteredDrafts.length === 0 && filteredRecent.length === 0;
  return (
    <div style={{ overflowY: "auto", padding: "10px 6px", maxHeight: 380, fontFamily: FONTS.body }}>
      <RecentSection title="Drafts" items={filteredDrafts} />
      <RecentSection title="Last created" items={filteredRecent} />
      {empty && (
        <div style={{ padding: "14px 14px 6px", fontSize: 12, color: COLORS.inkMuted, lineHeight: 1.5 }}>
          Nothing recent matches “{query}”.
        </div>
      )}
    </div>
  );
}

function RecentSection({ title, items }: {
  title: string;
  items: { id: string; label: string; note: string; action: () => void }[];
}) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: 6 }}>
      <div style={{
        padding: "6px 10px 4px",
        fontSize: 10, fontWeight: 600, letterSpacing: 1.2, textTransform: "uppercase",
        color: COLORS.inkMuted,
      }}>{title}</div>
      {items.map(it => (
        <button key={it.id} type="button" onClick={it.action} style={{
          display: "flex", alignItems: "center", gap: 11,
          padding: "9px 10px", margin: "0 4px",
          background: "transparent", border: "none",
          width: "calc(100% - 8px)", textAlign: "left",
          cursor: "pointer", borderRadius: 10,
          transition: `background ${TRANSITION.micro}`,
        }}
          onMouseEnter={(e) => { e.currentTarget.style.background = COLORS.surfaceAlt; }}
          onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
        >
          <span style={{
            width: 28, height: 28, borderRadius: 8,
            background: COLORS.surfaceAlt, color: COLORS.ink,
            display: "inline-flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0,
          }}>
            <Icon name="bolt" size={13} stroke={1.7} />
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13, fontWeight: 500, color: COLORS.ink }}>
              {it.label}
            </span>
            <span style={{ display: "block", fontSize: 11, color: COLORS.inkMuted, marginTop: 1 }}>
              {it.note}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}

function FabTabButton({ label, icon, active, onClick, accent, badge }: {
  label: string;
  icon: string;
  active: boolean;
  onClick: () => void;
  accent?: "royal";
  badge?: number;
}) {
  const activeBg = accent === "royal" ? COLORS.royalSoft : "rgba(11,11,13,0.05)";
  const activeFg = accent === "royal" ? COLORS.royalDeep : COLORS.ink;
  return (
    <button type="button" onClick={onClick} style={{
      padding: "6px 12px", borderRadius: 999,
      border: "none",
      background: active ? activeBg : "transparent",
      color: active ? activeFg : COLORS.inkMuted,
      fontFamily: FONTS.body, fontSize: 12, fontWeight: 600,
      cursor: "pointer",
      display: "inline-flex", alignItems: "center", gap: 5,
      position: "relative",
    }}>
      <Icon name={icon as any} size={11} stroke={1.7} color={active ? activeFg : COLORS.inkMuted} />
      {label}
      {badge !== undefined && badge > 0 && (
        <span style={{
          marginLeft: 2,
          minWidth: 16, height: 16, padding: "0 5px", borderRadius: 999,
          background: COLORS.amberDeep, color: "#fff",
          fontSize: 9.5, fontWeight: 700,
          display: "inline-flex", alignItems: "center", justifyContent: "center",
        }}>{badge}</span>
      )}
    </button>
  );
}

// ── AI chat panel (extracted from AIHelpBot, now mounted inside Fab) ─
function FabAiPanel({ seedQuestion }: { seedQuestion?: string }) {
  const { state } = useProto();
  const drawerId = state.drawer.drawerId;
  const helpEntry = drawerId ? (DRAWER_HELP as Record<string, typeof DRAWER_HELP[keyof typeof DRAWER_HELP]>)[drawerId] ?? null : null;
  const faqs = helpEntry?.faqs ?? [];
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "bot"; text: string }[]>([
    { role: "bot", text: "Hi! I can answer questions about how to use Tulala. Try asking something or pick a suggestion below." },
  ]);
  const listRef = useRef<HTMLDivElement>(null);
  const lastSeed = useRef<string>("");

  const send = (text: string) => {
    if (!text.trim()) return;
    const userMsg = { role: "user" as const, text };
    const matchedFaq = faqs.find((f) => text.toLowerCase().includes(f.q.toLowerCase().slice(0, 20)));
    const botReply = matchedFaq
      ? matchedFaq.a
      : helpEntry
        ? `${helpEntry.purpose} ${helpEntry.youCanHere[0] ? `You can: ${helpEntry.youCanHere[0].toLowerCase()}` : ""}`
        : "I don't have specific info about that, but you can find guidance in the help panel (click ⓘ in any drawer).";
    setMessages((prev) => [...prev, userMsg, { role: "bot", text: botReply }]);
    setInput("");
    setTimeout(() => {
      if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
    }, 50);
  };

  // Keep a ref to the latest `send` so the seed effect picks up current
  // FAQ context even if the user opens a different drawer between
  // Ask-AI invocations within the same panel mount.
  const sendRef = useRef(send);
  sendRef.current = send;

  useEffect(() => {
    const seed = (seedQuestion ?? "").trim();
    if (seed && seed !== lastSeed.current) {
      lastSeed.current = seed;
      sendRef.current(seed);
    }
  }, [seedQuestion]);

  const quickSuggestions = faqs.length > 0
    ? faqs.slice(0, 3).map((f) => f.q)
    : ["How do I send an offer?", "How do I add talent to the roster?", "How do I invite a teammate?"];

  return (
    <div style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 320, maxHeight: 460 }}>
      {helpEntry && (
        <div style={{
          padding: "6px 14px",
          background: COLORS.royalSoft,
          fontSize: 10.5, color: COLORS.royalDeep, fontWeight: 500,
        }}>Context: {helpEntry.category}</div>
      )}
      <div ref={listRef} style={{
        flex: 1, overflowY: "auto", padding: "12px 14px",
        display: "flex", flexDirection: "column", gap: 8,
      }}>
        {messages.map((m, i) => (
          <div key={i} style={{
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
          }}>
            <div style={{
              maxWidth: "82%",
              padding: "8px 11px",
              borderRadius: m.role === "user" ? "12px 12px 3px 12px" : "12px 12px 12px 3px",
              background: m.role === "user" ? COLORS.royal : COLORS.surfaceAlt,
              fontFamily: FONTS.body,
              fontSize: 12.5,
              color: m.role === "user" ? "#fff" : COLORS.ink,
              lineHeight: 1.45,
            }}>
              {m.text}
            </div>
          </div>
        ))}
      </div>
      {messages.length <= 2 && (
        <div style={{ padding: "0 12px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
          {quickSuggestions.map((q, i) => (
            <button key={i} type="button" onClick={() => send(q)} style={{
              textAlign: "left",
              padding: "7px 11px",
              background: COLORS.royalSoft,
              border: `1px solid rgba(95,75,139,0.15)`,
              borderRadius: 10,
              fontFamily: FONTS.body, fontSize: 12, color: COLORS.royalDeep,
              cursor: "pointer", lineHeight: 1.4,
            }}>
              {q}
            </button>
          ))}
        </div>
      )}
      <div style={{
        borderTop: `1px solid ${COLORS.borderSoft}`,
        padding: "10px 12px",
        display: "flex", gap: 6,
      }}>
        <input type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") send(input); }}
          placeholder="Ask Tulala anything…"
          style={{
            flex: 1, padding: "9px 12px",
            fontFamily: FONTS.body, fontSize: 12.5,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 10,
            outline: "none", color: COLORS.ink, background: "#fff",
          }}
        />
        <button type="button" onClick={() => send(input)} disabled={!input.trim()} style={{
          padding: "0 12px",
          background: input.trim() ? COLORS.royal : "rgba(11,11,13,0.10)",
          color: input.trim() ? "#fff" : COLORS.inkDim,
          border: "none", borderRadius: 10,
          cursor: input.trim() ? "pointer" : "default",
          display: "inline-flex", alignItems: "center",
        }}>
          <Icon name="arrow-right" size={13} color={input.trim() ? "#fff" : COLORS.inkDim} />
        </button>
      </div>
    </div>
  );
}

function ProtoProviderInnerOriginal({ showDevBar }: { showDevBar: boolean }) {
  return (
    <>
        {/* 2026 #7 — Speculation Rules. Tells the browser to prerender
            same-origin URLs the user is likely to visit next. Targets
            internal nav links inside the prototype shell. The browser
            holds prerenders for ~5 minutes; click → instant render with
            no network or layout cost. Falls back silently on browsers
            without support. Uses "moderate" eagerness so we prerender
            on hover/focus rather than every link in viewport. */}
        <script type="speculationrules" dangerouslySetInnerHTML={{ __html: JSON.stringify({
          prerender: [{
            where: { and: [
              { href_matches: "/prototypes/admin-shell*" },
              { not: { href_matches: "/prototypes/admin-shell?logout*" } },
            ] },
            eagerness: "moderate",
          }],
          prefetch: [{
            where: { href_matches: "/prototypes/admin-shell*" },
            eagerness: "moderate",
          }],
        })}} />
        {/* Global keyboard-focus styling for the prototype. Scoped via
            `.tulala-shell` so we don't leak into other prototypes. Uses
            :focus-visible so mouse clicks don't trigger the ring. */}
        <style>{`
          .tulala-shell button:focus-visible,
          .tulala-shell a:focus-visible,
          .tulala-shell [role="button"]:focus-visible,
          .tulala-shell input:focus-visible,
          .tulala-shell textarea:focus-visible,
          .tulala-shell select:focus-visible {
            outline: 2px solid ${COLORS.accent};
            outline-offset: 2px;
          }
          .tulala-shell button:focus:not(:focus-visible) {
            outline: none;
          }
          /* On mobile the BottomActionFab is the single command surface —
             hide the duplicate topbar Search pills. They reappear ≥768px. */
          @media (max-width: 767px) {
            .tulala-shell [data-tulala-topbar-search],
            .tulala-shell [data-tulala-topbar-search-right] {
              display: none !important;
            }
          }
          /* 2026 #11 — prefers-reduced-motion enforcement. Respects the
             OS-level "Reduce motion" setting (System Settings →
             Accessibility on iOS / macOS, or equivalent). Cuts every
             transition + animation to a near-instant ~10ms duration so
             the UI still acknowledges state changes without vestibular
             motion. Scoped to .tulala-shell to keep us isolated. */
          @media (prefers-reduced-motion: reduce) {
            .tulala-shell *,
            .tulala-shell *::before,
            .tulala-shell *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
              scroll-behavior: auto !important;
            }
          }
          /* Audit #4 — acting-as chevron rotates 180° on chip hover. */
          .tulala-shell .tulala-acting-chip:hover .tulala-acting-chevron {
            transform: rotate(180deg);
          }
          /* Skip-to-main: invisible until focused. Lets keyboard users
             jump past the dark prototype ControlBar and into the surface. */
          .tulala-shell .skip-to-main {
            position: absolute;
            left: -9999px;
            top: auto;
            width: 1px;
            height: 1px;
            overflow: hidden;
            z-index: 100;
          }
          .tulala-shell .skip-to-main:focus-visible {
            position: fixed;
            left: 12px;
            top: 12px;
            width: auto;
            height: auto;
            background: ${COLORS.ink};
            color: #fff;
            padding: 8px 14px;
            border-radius: 8px;
            font-family: ${FONTS.body};
            font-size: 13px;
            font-weight: 600;
            text-decoration: none;
            outline: 2px solid ${COLORS.accent};
            outline-offset: 2px;
          }
          /* Respect users who've asked the OS to dial down motion.
             Drawer slides, toast slide-in, and every transition collapses
             to ~instant. Functional state still updates; only the animation
             vanishes. */
          @media (prefers-reduced-motion: reduce) {
            .tulala-shell *,
            .tulala-shell *::before,
            .tulala-shell *::after {
              animation-duration: 0.01ms !important;
              animation-iteration-count: 1 !important;
              transition-duration: 0.01ms !important;
              scroll-behavior: auto !important;
            }
          }

          /* WS-12.8 — Windows High Contrast / macOS Increase Contrast.
             In forced-colors mode the browser substitutes system colors for
             all custom colors. We:
             1. Ensure all interactive elements have a visible border so they
                still read as affordances without their background color.
             2. Use ButtonText / LinkText / Highlight system color tokens
                where a custom accent would otherwise be invisible.
             3. Preserve StatusChip / badge borders so they remain legible
                as colored boxes even when their background is stripped. */
          @media (forced-colors: active) {
            .tulala-shell button,
            .tulala-shell a[href],
            .tulala-shell [role="button"] {
              forced-color-adjust: auto;
            }
            .tulala-shell [data-tulala-drawer-panel] {
              border-left: 2px solid ButtonText !important;
            }
            .tulala-shell [data-tulala-app-topbar],
            .tulala-shell [data-tulala-app-sidebar],
            .tulala-shell [data-tulala-identity-bar] {
              border-bottom: 1px solid ButtonText !important;
              border-right: 1px solid ButtonText !important;
            }
            /* Chips and status pills: ensure border is visible */
            .tulala-shell [data-tulala-chip],
            .tulala-shell [data-tulala-status-pill] {
              border: 1px solid ButtonText !important;
              forced-color-adjust: none;
            }
            /* Toast: keep text legible */
            .tulala-shell [data-tulala-toast-host] > * {
              border: 1px solid ButtonText !important;
            }
          }
          /* ──────────────────────────────────────────────────────────────
             Mobile / tablet responsive layer. The prototype is built with
             inline desktop styles; these rules override at narrow widths
             via [data-tulala-*] attributes attached to the relevant nodes.
             Every override uses !important because inline styles win
             otherwise.

             Breakpoints:
               ≤ 1024px — tablet (some grid collapse)
               ≤ 720px  — small tablet / large phone
               ≤ 540px  — phone

             Goal: every surface reads cleanly without horizontal scroll
             on a 360–414px viewport.
             ────────────────────────────────────────────────────────────── */

          /* Tablet: 4-col hero strips drop to 2-col; 3-col panels stay 3 */
          @media (max-width: 1024px) {
            .tulala-shell [data-tulala-grid="4"] {
              grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
            }
          }

          /* Small tablet / large phone: one main column; tighter padding;
             topbars wrap into two rows; ControlBar shrinks. */
          @media (max-width: 720px) {
            .tulala-shell {
              overflow-x: hidden;
            }
            /* Surface main padding compresses */
            .tulala-shell [data-tulala-surface-main] {
              padding: 18px 14px 48px !important;
            }
            /* All grid variants collapse to single column */
            .tulala-shell [data-tulala-grid="2"],
            .tulala-shell [data-tulala-grid="3"],
            .tulala-shell [data-tulala-grid="4"],
            .tulala-shell [data-tulala-grid="auto"] {
              grid-template-columns: 1fr !important;
              gap: 10px !important;
            }
            /* PageHeader: actions wrap to a row below the title */
            .tulala-shell [data-tulala-page-header] {
              flex-direction: column !important;
              align-items: stretch !important;
              gap: 12px !important;
              margin-bottom: 18px !important;
            }
            .tulala-shell [data-tulala-page-header-actions] {
              justify-content: flex-start !important;
              flex-wrap: wrap !important;
            }
            /* Buttons inside the actions slot get natural-width content so
               labels never wrap mid-word. */
            .tulala-shell [data-tulala-page-header-actions] > * {
              flex-shrink: 0 !important;
            }
            /* H1 scales down */
            .tulala-shell [data-tulala-h1] {
              font-size: 24px !important;
              letter-spacing: -0.4px !important;
            }
            /* App topbars: tenant chip on top row, page nav on second row */
            .tulala-shell [data-tulala-app-topbar] {
              padding: 0 14px !important;
            }
            .tulala-shell [data-tulala-app-topbar-row] {
              flex-wrap: wrap !important;
              row-gap: 0 !important;
              gap: 10px !important;
              height: auto !important;
              padding: 8px 0 !important;
            }
            .tulala-shell [data-tulala-topbar-divider] {
              display: none !important;
            }
            /* Hide the in-topbar page nav on mobile — the bottom tab bar
               replaces it (better thumb reach + native pattern). */
            .tulala-shell [data-tulala-app-topbar-nav] {
              display: none !important;
            }
            /* Workspace sidebar shell — collapse 232px+1fr grid to single
               column on mobile and hide the left rail. The bottom tab
               bar replaces nav, same as topbar shell. */
            .tulala-shell [data-tulala-workspace-grid] {
              grid-template-columns: 1fr !important;
            }
            .tulala-shell [data-tulala-app-sidebar] {
              display: none !important;
            }
            /* Workspace topbar — also drop nav-style chips inside. */
            .tulala-shell [data-tulala-workspace-topbar] [data-tulala-app-topbar-nav] {
              display: none !important;
            }
          }
          /* Page-transition fade-up — used by both talent + workspace
             routers. Lives at root scope so the keyframe is available
             everywhere inside .tulala-shell. */
          @keyframes tulala-page-fade {
            from { opacity: 0; transform: translateY(6px); }
            to { opacity: 1; transform: translateY(0); }
          }
          @media (prefers-reduced-motion: reduce) {
            [data-tulala-talent-page-anim],
            [data-tulala-workspace-page-anim] {
              animation: none !important;
            }
          }
          @media (max-width: 720px) {
            /* placeholder so the brace count remains correct after the
               page-fade rules above. The next rule continues here. */
            .tulala-shell [data-tulala-mobile-placeholder] { display: none; }
            /* Workspace surface main padding tightens on mobile so cards
               aren't squeezed by 28px of side gutters. */
            .tulala-shell [data-tulala-workspace-grid] > main,
            .tulala-shell [data-tulala-workspace-grid] [data-tulala-surface-main] {
              padding: 14px 14px 60px !important;
            }
            /* Show the mobile bottom tab bar */
            .tulala-shell [data-tulala-mobile-bottom-nav] {
              display: block !important;
            }
            /* Lift the toast stack above the bottom tab bar — at mobile,
               default bottom: 20 lands directly on the 56px tabs. */
            .tulala-shell [data-tulala-toast-host] {
              bottom: calc(72px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Pad surface main so its last item isn't hidden under the bar.
               Also clamp side padding from desktop's 28px → 14px so cards
               can use the full mobile viewport width. */
            .tulala-shell [data-tulala-surface-main] {
              padding: 14px 14px calc(64px + env(safe-area-inset-bottom, 0px)) !important;
              max-width: 100% !important;
              min-width: 0 !important;
              box-sizing: border-box !important;
              overflow-x: hidden !important;
            }
            /* Workspace topbar — hide nav chips inside (already covered by
               data-tulala-app-topbar-nav rule above). Also: when the
               topbar uses tenant-meta + entity-meta chips on desktop,
               those collapse to icon-only on mobile. */
            .tulala-shell [data-tulala-app-topbar-row] {
              padding: 0 14px !important;
            }
            /* Cards / tiles wider than viewport collapse to 100%. Many
               workspace dashboards use min-width: 280-360 on internal
               cards which overflow at 375. */
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 280"],
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 320"],
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 360"],
            .tulala-shell [data-tulala-surface-main] [style*="min-width: 400"] {
              min-width: 0 !important;
            }
            /* Wide desktop grids (3-up, 4-up cards) collapse to 1 column.
               Inline styles use grid-template-columns with explicit widths
               or repeat(N, ...) — wildcard-target by setting !important. */
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: repeat(3"],
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: repeat(4"],
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: 1fr 1fr 1fr"],
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: 1fr 1fr 1fr 1fr"] {
              grid-template-columns: 1fr !important;
            }
            /* 2-column grids → also 1 column at narrowest */
            .tulala-shell [data-tulala-surface-main] [style*="grid-template-columns: 1fr 1fr"] {
              grid-template-columns: 1fr !important;
            }
            /* Tables — let them scroll horizontally rather than overflow. */
            .tulala-shell [data-tulala-surface-main] table {
              display: block;
              overflow-x: auto;
              max-width: 100%;
            }
            .tulala-shell [data-tulala-app-topbar-right] {
              margin-left: auto !important;
            }
            /* Hide just the plan + entity meta chips on mobile (they're
               still reachable via the tenant-summary drawer); keep the
               avatar + tenant name visible. */
            .tulala-shell [data-tulala-tenant-meta] {
              display: none !important;
            }
            /* Drawers go full-bleed */
            .tulala-shell [data-tulala-drawer-panel] {
              width: 100vw !important;
              max-width: 100vw !important;
            }
            .tulala-shell [data-tulala-drawer-body] {
              padding: 16px 14px 20px !important;
            }
            /* Mobile drawer header: show the back-to-page pill, hide the
               X close icon (back button replaces it as the primary
               dismiss control). Also hide size-toolbar (compact/half/full
               size buttons are meaningless on mobile — drawer is always
               full-bleed). The "Copy link" button also hides since
               share/copy is rare on a phone. The toolbar with help (?)
               stays since it's contextual. */
            .tulala-shell [data-tulala-drawer-mobile-back] {
              display: inline-flex !important;
            }
            /* Add a small tap-pad so the small Back link still meets a
               44×44 hit area without visually dominating. */
            .tulala-shell [data-tulala-drawer-mobile-back]::before {
              content: "";
              position: absolute;
              inset: -10px -16px;
            }
            .tulala-shell [data-tulala-drawer-mobile-back] {
              position: relative !important;
            }
            .tulala-shell [data-tulala-drawer-header] > div:last-child > button[aria-label^="Close"] {
              display: none !important;
            }
            .tulala-shell [data-tulala-drawer-header] > div:last-child > [role="group"] {
              display: none !important;
            }
            .tulala-shell [data-tulala-drawer-header] > div:last-child > button[aria-label="Copy link to this drawer"] {
              display: none !important;
            }
            /* Tighten drawer header padding on mobile */
            .tulala-shell [data-tulala-drawer-header] {
              padding: 12px 14px 12px !important;
              gap: 10px !important;
            }
            /* Drawer h2 mobile typography */
            .tulala-shell [data-tulala-drawer-header] h2 {
              font-size: 17px !important;
              line-height: 1.25 !important;
              letter-spacing: -0.2px !important;
            }
            .tulala-shell [data-tulala-drawer-header] p {
              font-size: 12px !important;
              line-height: 1.4 !important;
              margin-top: 2px !important;
            }
            /* Plan-compare drawer is a wide N×M table that can't collapse
               cleanly to one column. At mobile, give the inner grids a
               fixed min-width and let users swipe horizontally. The sticky
               column header in row-1 scrolls with the body as a unit. */
            .tulala-shell [data-tulala-plan-compare-grid] {
              min-width: 720px;
            }
            .tulala-shell [data-tulala-plan-compare-header],
            .tulala-shell [data-tulala-plan-compare-body] {
              overflow-x: auto;
              -webkit-overflow-scrolling: touch;
            }
            /* Compare-drawer footer collapses to a single CTA row — only
               the primary "Upgrade" path matters on mobile. */
            .tulala-shell [data-tulala-plan-compare-footer] {
              grid-template-columns: 1fr !important;
              gap: 8px !important;
            }
            .tulala-shell [data-tulala-plan-compare-footer] > div:first-child {
              order: 99;
              padding: 4px 0 !important;
            }
            /* Drawer size toolbar (compact/half/full) is meaningless on
               mobile — there's only one viable size. Hide it. */
            .tulala-shell [data-tulala-drawer-size-toolbar] {
              display: none !important;
            }
            /* Drawer footer shrinks padding on mobile */
            .tulala-shell [data-tulala-drawer-footer] {
              padding: 12px 14px !important;
              flex-wrap: wrap !important;
              gap: 8px !important;
            }
            .tulala-shell [data-tulala-modal-overlay] > div {
              max-width: 96vw !important;
            }
            /* Prototype ControlBar: sit inside a horizontal scroller so it
               occupies one short row instead of stacking 5+ rows tall. */
            .tulala-shell > header[role="banner"] {
              flex-wrap: nowrap !important;
              overflow-x: auto !important;
              padding: 6px 12px !important;
              gap: 10px !important;
            }
            .tulala-shell > header[role="banner"] > * {
              flex-shrink: 0 !important;
            }
          }

          /* Information-density mode. Set from useProto via a doc-level
             data attribute. Compact tightens table-style row paddings
             and gaps without overwriting type sizes — comfortable stays
             the default. Targets list rows that opt in by setting the
             [data-tulala-row] attribute on themselves. */
          /* Hide the Next.js dev "N" badge that floats over the bottom-
             left corner. It overlaps the avatar / first column of the
             mobile bottom tab bar in the prototype. Selectors target the
             various names Next has used across versions. */
          [data-nextjs-toast],
          [data-next-mark],
          .__next-dev-overlay-icon,
          #__next-build-watcher,
          nextjs-portal {
            display: none !important;
          }
          /* Typing-indicator dot animation. Used by <TypingIndicator>
             (#11). Three dots pulse opacity in sequence. */
          @keyframes tulalaTypingDot {
            0%, 80%, 100% { opacity: 0.25; }
            40% { opacity: 1; }
          }
          /* Skeleton shimmer — left-to-right gradient sweep. */
          @keyframes tulalaSkeleton {
            0% { background-position: 200% 0; }
            100% { background-position: -200% 0; }
          }
          [data-tulala-density="compact"] .tulala-shell [data-tulala-row] {
            padding-top: 8px !important;
            padding-bottom: 8px !important;
          }
          [data-tulala-density="compact"] .tulala-shell [data-tulala-grid] {
            gap: 8px !important;
          }
          /* Messages page — premium mobile pattern. Two-pane layout
             collapses to a single-pane stack at <720px. The list is
             shown by default; tapping a conversation flips to the
             thread; back arrow returns to list. Identity bar +
             talent topbar stay sticky above. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-messages-shell] {
              grid-template-columns: 1fr !important;
              border: none !important;
              border-radius: 0 !important;
              /* 100dvh handles iOS dynamic URL bar; --proto-kb is set
                 by a visualViewport listener so the shell shrinks when
                 the soft keyboard opens (audit P0 — keyboard avoidance). */
              height: calc(100dvh - var(--proto-cbar, 50px) - 56px - 52px - var(--proto-kb, 0px)) !important;
              max-height: calc(100dvh - var(--proto-cbar, 50px) - 56px - 52px - var(--proto-kb, 0px)) !important;
              min-height: 0 !important;
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="list"] [data-tulala-thread-pane],
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="list"] [data-tulala-thread-info-sidebar] {
              display: none !important;
            }
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-list-pane] {
              display: none !important;
            }
            /* Single-pane: thread fills viewport, no right info sidebar
               by default — ensure thread pane spans full width when
               sidebar isn't collapsed yet via the toggle. */
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] {
              grid-template-columns: 1fr !important;
            }
            /* Inner thread+info grid (1fr 320px desktop) collapses to a
               single column at mobile — the info sidebar slides up as a
               bottom sheet (position:fixed below) and shouldn't reserve
               grid space. */
            .tulala-shell [data-tulala-thread-grid] {
              grid-template-columns: 1fr !important;
            }
            /* Info sidebar at mobile = premium bottom sheet (not a
               full-screen overlay). Slides up from bottom with rounded
               top corners + drag-handle pill + soft shadow. Caps at
               80vh so the user can still see thread context above. */
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-thread-info-sidebar] {
              position: fixed !important;
              left: 0 !important;
              right: 0 !important;
              bottom: 0 !important;
              top: auto !important;
              max-height: 80vh !important;
              border-left: none !important;
              border-top: 1px solid rgba(11,11,13,0.08) !important;
              border-radius: 18px 18px 0 0 !important;
              z-index: 200 !important;
              box-shadow: 0 -10px 40px rgba(11,11,13,0.18) !important;
              animation: tulala-sheet-up .26s cubic-bezier(.4,.0,.2,1) !important;
              padding-bottom: env(safe-area-inset-bottom, 0px) !important;
            }
            /* Drag-handle pill at top of the bottom sheet — pure visual
               affordance hinting the sheet is dismissable. Tap × to close. */
            .tulala-shell [data-tulala-messages-shell][data-mobile-pane="thread"] [data-tulala-thread-info-sidebar]::before {
              content: "";
              position: sticky;
              top: 0;
              display: block;
              width: 36px;
              height: 4px;
              border-radius: 999px;
              background: rgba(11,11,13,0.18);
              margin: 8px auto 0;
              z-index: 1;
            }
            /* Mobile back button reveals at narrow widths */
            .tulala-shell .tulala-mobile-back {
              display: inline-flex !important;
            }
            /* Workspace messages WhatsApp-style header: show back arrow,
               hide desktop-only trust chip + status chip to keep the bar
               clean for thumb-driven nav. */
            .tulala-shell [data-tulala-thread-back] {
              display: inline-flex !important;
            }
            .tulala-shell [data-tulala-header-trust-desktop],
            .tulala-shell [data-tulala-header-status-desktop] {
              display: none !important;
            }
            /* Mobile FAB sits comfortably above the bottom tab bar +
               safe-area inset. */
            .tulala-shell button[aria-label^="Messages ·"][style*="position: fixed"] {
              bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Feedback FAB is hidden on mobile — the "Send feedback"
               action lives inside the bottom-nav More menu instead, so
               we never cover content with a floating button. The panel
               itself still opens via the same FeedbackButton component
               (it listens to a "tulala-open-feedback" custom event). */
            .tulala-shell [data-tulala-feedback-btn] > button[aria-label="Send feedback"] {
              display: none !important;
            }
            /* AI helpbot lifts above the bottom nav on mobile (Feedback
               is no longer floating, so we just clear the 64px tab bar
               + a comfortable gap). */
            .tulala-shell [data-tulala-ai-helpbot] {
              bottom: calc(80px + env(safe-area-inset-bottom, 0px)) !important;
            }
            /* Account menu trigger (avatar + hamburger) — make sure the
               whole pill is at least 36px tall on mobile for thumb taps. */
            .tulala-shell [data-tulala-account-menu-root] > button {
              min-height: 36px !important;
            }
            /* Composer mobile: input taller for thumb comfort, button
               touch zones grown, attach popover spans full viewport
               width above the composer. */
            .tulala-shell [data-tulala-thread-pane] form input,
            .tulala-shell [data-tulala-thread-pane] input[placeholder="Message…"],
            .tulala-shell [data-tulala-thread-pane] textarea[placeholder="Message…"] {
              padding: 12px 0 !important;
              font-size: 16px !important; /* iOS won't auto-zoom on focus when ≥16 */
            }
            /* Composer trigger buttons (attach +, voice 🎙️): grow to
               40px hit area. Smart-replies ✨ toggle hides at mobile
               per audit E4 — frees real estate, smart-replies still
               accessible on tablet+. */
            .tulala-shell [data-tulala-thread-pane] [aria-label="Attach"],
            .tulala-shell [data-tulala-thread-pane] [aria-label="Voice note"] {
              width: 40px !important;
              height: 40px !important;
            }
            .tulala-shell [data-tulala-thread-pane] [aria-label^="Hide smart"],
            .tulala-shell [data-tulala-thread-pane] [aria-label^="Show smart"] {
              display: none !important;
            }
            .tulala-shell [data-tulala-thread-pane] [aria-label="Send"] {
              width: 40px !important;
              height: 40px !important;
            }
            /* Thread header on mobile: condense padding so it doesn't
               eat 60px of vertical space when stacked under the
               identity bar. */
            .tulala-shell [data-tulala-thread-pane] > div:first-child {
              padding: 10px 14px !important;
            }
            /* Bottom-sheet info panel: pad past the safe-area inset and
               give the close button + first heading more breathing room. */
            .tulala-shell [data-tulala-thread-info-sidebar] > div:first-child {
              padding: 16px 18px 12px !important;
            }
            /* Message bubbles: larger font for readability over arm's
               length. Targets the rounded chat-bubble shapes used by
               text messages (18px corners with one nub). */
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 18px 18px 18px 6px"],
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 18px 18px 6px 18px"],
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 16px 16px 4px 16px"],
            .tulala-shell [data-tulala-thread-pane] [style*="border-radius: 16px 16px 16px 4px"] {
              font-size: 14.5px !important;
              line-height: 1.45 !important;
            }
            /* Action message cards (rate input, transport, etc.) clamp
               to viewport width at mobile. */
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 380px"],
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 360px"],
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 320px"] {
              max-width: calc(100vw - 48px) !important;
            }
            /* Message bubbles use more of the viewport on mobile. */
            .tulala-shell [data-tulala-thread-pane] [style*="max-width: 70%"] {
              max-width: 88% !important;
            }
            /* Conversation list rows: 44px minimum vertical tap area
               (Apple HIG / Material). Scoped to the list-body buttons
               (conversation rows) — NOT the header chips/filter pills. */
            .tulala-shell [data-tulala-list-pane] > div:nth-child(2) > button {
              min-height: 56px !important;
            }
            /* Audit P0-1 — filter chips become a horizontal scroll
               strip on phone instead of wrapping to 2-3 rows that eat
               list real estate. Edge-fade hints overflow. */
            .tulala-shell [data-tulala-msg-filter-chips] {
              flex-wrap: nowrap !important;
              overflow-x: auto !important;
              scroll-snap-type: x mandatory !important;
              -webkit-overflow-scrolling: touch !important;
              padding-bottom: 2px !important;
              scrollbar-width: none !important;
              mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%) !important;
              -webkit-mask-image: linear-gradient(to right, #000 0, #000 calc(100% - 24px), transparent 100%) !important;
            }
            .tulala-shell [data-tulala-msg-filter-chips]::-webkit-scrollbar { display: none !important; }
            .tulala-shell [data-tulala-msg-filter-chips] > button {
              flex-shrink: 0 !important;
              scroll-snap-align: start !important;
            }
            /* Audit P1-7 — bump conversation row typography above iOS
               minimum (12px). Stage chip 9.5 → 10.5; preview/age 10.5/11
               → 12; client name 13 → 14. */
            .tulala-shell [data-tulala-conv-row-name] { font-size: 14px !important; }
            .tulala-shell [data-tulala-conv-row-age] { font-size: 11.5px !important; }
            .tulala-shell [data-tulala-conv-row-brief] { font-size: 12.5px !important; }
            .tulala-shell [data-tulala-conv-row-preview] { font-size: 12px !important; }
            .tulala-shell [data-tulala-conv-row-stage] { font-size: 10px !important; }
            /* Audit P1-6 — trim thread header on phone. Hide the
               in-thread search button + info-toggle (info still
               reachable via the ⋯ menu / bottom-sheet swipe). */
            .tulala-shell [data-tulala-thread-header] [aria-label="Search in thread"],
            .tulala-shell [data-tulala-thread-header] [aria-label="Hide info panel"],
            .tulala-shell [data-tulala-thread-header] [aria-label="Show info panel"] {
              display: none !important;
            }
          }
          @keyframes tulala-sheet-up {
            from { transform: translateY(100%); }
            to { transform: translateY(0); }
          }
          /* Pinned info row inside the messages page (legacy class — now
             always lives in the right sidebar; targeted here just in case
             it sneaks back). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-messages-shell] [data-tulala-app-topbar-row],
            .tulala-shell [data-tulala-messages-shell] [data-tulala-surface-main] {
              max-width: 100% !important;
            }
          }
          /* Talent surface main padding compresses on mobile so the
             messages shell can fill the viewport without margins. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main]:has([data-tulala-messages-shell]) {
              padding: 0 !important;
            }
          }
          /* Mobile tap-target floor. Apple HIG / Material both call for
             44×44 minimum hit area. A transparent ::before sits behind
             the control, expanding the hit-area without changing visual
             size. Opt-in via data-tulala-tap-pad on the small controls
             (chip pills, icon buttons, dot toggles). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-tap-pad] {
              position: relative;
            }
            .tulala-shell [data-tulala-tap-pad]::before {
              content: "";
              position: absolute;
              left: 50%;
              top: 50%;
              transform: translate(-50%, -50%);
              width: max(100%, 44px);
              height: max(100%, 44px);
              z-index: 0;
            }
          }
          /* Talent / workspace stat strips: wrap to 2-up grid at <720
             so 3 stats with vertical dividers don't overflow the row.
             Hide the inline dividers (they're abs-positioned 1px lines
             that look broken when the strip wraps). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-stat-strip] {
              flex-wrap: wrap !important;
              gap: 12px !important;
              padding: 12px 14px !important;
              row-gap: 12px !important;
            }
            .tulala-shell [data-tulala-stat-strip] > [data-tulala-stat-divider] {
              display: none !important;
            }
            .tulala-shell [data-tulala-stat-strip] > * {
              /* Audit P1-12 — stack to 1-col on phone instead of 2+1
                 leaving an awkward lone third item at full width. */
              flex-basis: 100% !important;
              flex-grow: 1 !important;
            }
          }
          /* Forecast tile: 3-up horizontal collapses to vertical stack
             at <720 so each metric is full-width and readable. The
             internal vertical 1px dividers turn into 1px horizontal
             dividers via flex-direction. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-forecast-tile] {
              flex-direction: column !important;
            }
            .tulala-shell [data-tulala-forecast-tile] > div[style*="width: 1px"] {
              width: 100% !important;
              height: 1px !important;
            }
          }
          /* Surface H1 mobile typography. New compact-header system uses
             ~19px on phone — header is navigation, not hero. The old
             rule scaled the big 30px display headline down to 26/22; now
             the headline is born small. Keeping these as a global cap so
             any straggling h1 (not via PageHeader) also stays compact. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] h1 {
              font-size: 20px !important;
              letter-spacing: -0.3px !important;
            }
          }
          @media (max-width: 540px) {
            .tulala-shell [data-tulala-surface-main] h1 {
              font-size: 19px !important;
              letter-spacing: -0.25px !important;
            }
          }
          /* Composer attach menu — at <720 expands to a full-width
             bottom sheet (anchored to the composer's bottom edge),
             not a 270px popover. 4-up grid for thumb-comfortable
             items + each tile sized 44px+ (Apple HIG). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-attach-menu] {
              left: 0 !important;
              right: 0 !important;
              border-radius: 14px 14px 0 0 !important;
              padding: 12px 14px !important;
              grid-template-columns: repeat(4, 1fr) !important;
              gap: 6px !important;
              animation: tulala-sheet-up .22s cubic-bezier(.4,.0,.2,1) !important;
            }
            .tulala-shell [data-tulala-attach-menu] > button {
              padding: 14px 6px !important;
              min-height: 64px !important;
            }
          }
          /* Identity bar mobile collapse — drop the lowest-priority
             utilities below 720px so the centerpiece (mode toggle +
             notifications) keeps room. Help, locale toggle, sign-out
             move to the avatar menu. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-identity-bar] {
              padding: 0 14px !important;
            }
            .tulala-shell [data-tulala-identity-bar] [aria-label="Help"],
            .tulala-shell [data-tulala-identity-bar] [aria-label="Sign out"],
            .tulala-shell [data-tulala-identity-bar] [role="group"][aria-label="Language"] {
              display: none !important;
            }
          }
          /* ─── PREMIUM MOBILE PASS ────────────────────────────────
             Audit J1–J8 + section A/B/C/D/E/F/G/H/I improvements.
             Mobile-only @media rules; desktop styles untouched. */

          /* Audit A2 — Mode toggle proportion at narrow widths.
             Tighter button padding so the pill sits comfortably inside
             the 56px identity bar at <720. Font also shrinks 12.5→12. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-identity-bar] [role="tablist"][aria-label="Switch between Talent and Workspace"] > button {
              padding: 0 10px !important;
              font-size: 12px !important;
            }
          }

          /* J4/J5 (audit C1+C2) — TalentTodayHero stacks vertically at
             <720. The right-column action buttons drop below the
             headline so the title doesn't wrap to 4 lines. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-talent-hero-row] {
              flex-direction: column !important;
              gap: 14px !important;
              align-items: stretch !important;
            }
            .tulala-shell [data-tulala-talent-hero-row] > div:last-child {
              align-self: flex-start !important;
            }
          }

          /* J8 (audit D2) — Conversation list filter chips: scroll
             horizontally instead of wrapping. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-list-pane] > div:first-child > div:nth-child(3) {
              flex-wrap: nowrap !important;
              overflow-x: auto !important;
              -webkit-overflow-scrolling: touch !important;
              scrollbar-width: none;
              padding-bottom: 2px;
            }
            .tulala-shell [data-tulala-list-pane] > div:first-child > div:nth-child(3)::-webkit-scrollbar {
              display: none;
            }
            .tulala-shell [data-tulala-list-pane] > div:first-child > div:nth-child(3) > button {
              flex-shrink: 0 !important;
            }
          }

          /* Audit A4 — At <380px the "Acme Models" label hides;
             only the green dot + chevron remain. */
          @media (max-width: 380px) {
            .tulala-shell [data-tulala-identity-bar] [data-tulala-acting-label] {
              display: none !important;
            }
          }
          /* Acting-as detail subline (€4.2k pending · 3 confirmed) hides
             at narrow widths to keep the identity bar uncluttered. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-identity-bar] [data-tulala-acting-detail] {
              display: none !important;
            }
          }

          /* Audit E1 — Thread header redesign for mobile. Hide search +
             ⋯ (rare on phone, accessible via info panel). Trust chip
             also hides — it's redundant in the header (lives in the
             info sidebar). Brief truncates with ellipsis instead of
             wrapping. Tighter gap, smaller stage pill. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-thread-pane] [aria-label="Search in thread"],
            .tulala-shell [data-tulala-thread-pane] [aria-label="Thread options"] {
              display: none !important;
            }
            .tulala-shell [data-tulala-thread-header] {
              gap: 10px !important;
              padding: 10px 14px !important;
              align-items: center !important;
            }
            .tulala-shell [data-tulala-thread-header-titlerow] {
              gap: 6px !important;
            }
            .tulala-shell [data-tulala-thread-header-trust] {
              display: none !important;
            }
            .tulala-shell [data-tulala-thread-header-stage] {
              font-size: 9px !important;
              padding: 2px 5px !important;
            }
          }
          /* Below 380px the stage pill drops too — only client name +
             brief remain in the title block. */
          @media (max-width: 380px) {
            .tulala-shell [data-tulala-thread-header-stage] {
              display: none !important;
            }
          }

          /* Audit B6 + H3 — Native-feeling press feedback. */
          @media (max-width: 720px) {
            .tulala-shell button:active:not([disabled]) {
              transform: scale(0.97);
              transition: transform .08s cubic-bezier(.4,0,.2,1);
            }
          }

          /* Audit F3 — Toast lifts above bottom nav. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-toast-host] {
              bottom: calc(76px + env(safe-area-inset-bottom, 0px)) !important;
              left: 12px !important;
              right: 12px !important;
            }
          }

          /* Audit C7 + I1 — Tap-target floor 56px on lists. Scoped to
             conversation rows (list body), not header chip buttons. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-list-pane] > div:nth-child(2) > button,
            .tulala-shell [data-tulala-row] {
              min-height: 56px !important;
            }
          }

          /* Audit B3 — Bottom-tab pill grows to 44×28 on mobile. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:first-child {
              width: 44px !important;
              height: 28px !important;
            }
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:first-child > svg {
              width: 18px !important;
              height: 18px !important;
            }
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:last-child {
              font-size: 11.5px !important;
            }
          }

          /* Audit F1 — Drawer + form input min-height 44px / 15px. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-drawer-panel] input,
            .tulala-shell [data-tulala-drawer-panel] select,
            .tulala-shell [data-tulala-drawer-panel] textarea {
              min-height: 44px !important;
              font-size: 15px !important;
            }
          }

          /* Audit G5 — Subtle 1px shadow on white cards over cream
             surface (lifts them off the page on phone). */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] section[style*="background: rgb(255, 255, 255)"] {
              box-shadow: 0 1px 1px rgba(11,11,13,0.04);
            }
          }

          /* Phone-specific tightening — values, captions, and chip rows
             that still feel cramped at 720 get a final pass at 540. */
          @media (max-width: 540px) {
            .tulala-shell [data-tulala-h1] {
              font-size: 19px !important;
            }
            .tulala-shell [data-tulala-surface-main] {
              padding: 10px 12px 36px !important;
            }
            /* Identity bar phone — collapse brand, name, slash separator.
               Keep avatar (recognizable identity) + acting-as chip + mode
               toggle + bell. The mode toggle is the centerpiece; protect
               its width. */
            .tulala-shell [data-tulala-brand],
            .tulala-shell [data-tulala-id-divider],
            .tulala-shell [data-tulala-identity-name],
            .tulala-shell [data-tulala-id-slash] {
              display: none !important;
            }
            /* Tighten gaps so everything fits on a 360px viewport. */
            .tulala-shell [data-tulala-identity-bar] > div {
              gap: 8px !important;
            }
          }
          /* #1 — back button in page headers, mobile only */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-page-back] {
              display: inline-flex !important;
            }
          }

          /* #2 — tenant meta in avatar menu on mobile */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-tenant-meta-mobile] {
              display: flex !important;
            }
          }

          /* #4 FAB — show on mobile only */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-fab] {
              display: inline-flex !important;
            }
          }

          /* #13 — bottom tab label truncation at 320px. maxWidth 76 → 48
             so 5 tabs fit on a 320px screen without overflow. */
          @media (max-width: 340px) {
            .tulala-shell [data-tulala-mobile-bottom-nav] button > span:last-child {
              max-width: 48px !important;
              font-size: 10px !important;
            }
          }

          /* #15 — swipe-between-tabs: overscroll-x contain so accidental
             horizontal flicks don't navigate the browser history. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] {
              overscroll-behavior-x: contain;
            }
          }

          /* #16 — 44px tap-target floor on narrow icon buttons at mobile. */
          @media (max-width: 720px) {
            .tulala-shell button[style*="width: 28px"],
            .tulala-shell button[style*="width: 26px"],
            .tulala-shell button[style*="width: 24px"],
            .tulala-shell button[style*="width: 32px"] {
              min-width: 44px !important;
              min-height: 44px !important;
            }
          }

          /* #17 — pull-to-refresh: contain overscroll-y to prevent native
             browser pull-to-refresh from firing accidentally inside the
             prototype. Real PTR needs a JS touch handler. */
          @media (max-width: 720px) {
            .tulala-shell [data-tulala-surface-main] {
              overscroll-behavior-y: contain;
            }
          }

          /* #29 — ARIA live region pulse: a subtle opacity pulse when
             data-tulala-updating="true" so sighted users notice the update. */
          @keyframes tulalaLivePulse {
            0%, 100% { opacity: 1; }
            50% { opacity: 0.6; }
          }
          [aria-live="polite"][data-tulala-updating="true"] {
            animation: tulalaLivePulse .5s ease 1;
          }

          /* #30 — keyboard focus style inside context menus. */
          .tulala-shell [role="menu"] [role="menuitem"]:focus-visible {
            background: rgba(15,79,62,0.08) !important;
            outline: none !important;
          }

          /* Print: strip the prototype chrome (dark ControlBar, drawer
             overlays, toast host, skip link) so the surface itself is what
             ends up on paper. */
          @media print {
            .tulala-shell .skip-to-main,
            .tulala-shell > header[role="banner"],
            .tulala-shell [data-tulala-drawer-overlay],
            .tulala-shell [data-tulala-drawer-panel],
            .tulala-shell [data-tulala-modal-overlay],
            .tulala-shell [data-tulala-toast-host] {
              display: none !important;
            }
            .tulala-shell {
              background: #fff !important;
            }
          }
        `}</style>
        <div
          className="tulala-shell"
          data-dev={showDevBar ? "1" : "0"}
          style={{
            // CSS var consumed by sticky descendants (IdentityBar +
            // mode-shell topbars/sidebars) so they offset correctly
            // whether the dev control bar is shown or hidden.
            ["--proto-cbar" as never]: showDevBar ? "50px" : "0px",
            background: COLORS.surface,
            minHeight: "100vh",
            fontFamily: FONTS.body,
            color: COLORS.ink,
            display: "flex",
            flexDirection: "column",
          }}
        >
          {/* Skip-to-main link for keyboard users (visible on focus only) */}
          <a href="#tulala-main" className="skip-to-main">
            Skip to main content
          </a>

          {/* Top: prototype control bar (dark, sticky). Hidden on
              non-dev URLs so the prototype demos look like the real
              product. Pass ?dev=1 to show it. */}
          <DevOnlyControlBar show={showDevBar} />

          {/* Below: the surface — workspace, talent, client, or platform */}
          <SurfaceRouter />

          {/* Layered on top: drawer overlay + drawer panel */}
          <DrawerRoot />

          {/* Layered on top: upgrade modal (cream header + plan unlocks) */}
          <UpgradeModal />

          {/* Layered on top: toast stack (bottom-right) */}
          <ToastBridge />
          <TabTitleBridge />

          {/* Offline banner — fixed at top, asserts connection loss (#23) */}
          <OfflineBanner />

          {/* Layered on top: command palette (⌘K / Ctrl+K) */}
          <CommandPalette />

          {/* Mobile-only bottom tab bar (hidden on desktop via CSS). */}
          <MobileBottomNav />

          {/* Floating "↑ Top" — appears after 600px of scroll. */}
          <BackToTop />

          {/* WS-9.8 Feedback button — DORMANT. Replaced by BottomActionFab,
              which now owns the bottom-right slot. Feedback is reachable from
              within the FAB's "Ask AI" tab and the help bell menu. Kept import
              for TS until full removal in next pass. */}
          {/* <FeedbackButton /> */}

          {/* Unified bottom-right floating action button — combines
              Quick Create (was top-right "+ New") + AI Assistant (was a
              separate sparkle FAB) into one menu. */}
          <BottomActionFab />
          {/* First-time admin tour — 4 tooltip overlays. Self-fires once. */}
          <AdminTourGate />
        </div>
    </>
  );
}

/** Gate the tour to workspace surface only. Lives outside ProtoProvider's
 *  children scope so it can read state via useProto. */
function AdminTourGate() {
  const { state } = useProto();
  if (state.surface !== "workspace") return null;
  return <AdminTour />;
}
