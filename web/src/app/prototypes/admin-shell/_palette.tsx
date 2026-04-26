"use client";

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * A single keyboard-accessible spotlight surface that indexes:
 *   - Surfaces (workspace / talent / client / platform)
 *   - Pages within the active surface
 *   - Plan / role / entity switches (workspace only)
 *   - Common drawers (new inquiry, plan compare, danger zone, etc.)
 *
 * It is intentionally small and fast: substring match, no debounce, no
 * fuzzy-search dependency. The palette closes after every action and
 * delegates state changes to ProtoProvider via useProto.
 *
 * Mounting: rendered once at the page root next to DrawerRoot. Visibility
 * is local state inside the palette — opens on ⌘K / Ctrl+K, closes on
 * Escape, on selection, or on backdrop click.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CLIENT_PAGES,
  CLIENT_PAGE_META,
  COLORS,
  FONTS,
  PAGE_META,
  PLANS,
  PLAN_META,
  PLATFORM_PAGES,
  PLATFORM_PAGE_META,
  ROLES,
  ROLE_META,
  SURFACES,
  SURFACE_META,
  TALENT_PAGES,
  TALENT_PAGE_META,
  WORKSPACE_PAGES,
  Z,
  useProto,
  type ClientPage,
  type DrawerId,
  type PlatformPage,
  type Plan,
  type Role,
  type Surface,
  type TalentPage,
  type WorkspacePage,
} from "./_state";

type CommandItem = {
  id: string;
  label: string;
  /** Group label shown above the row in the listing. */
  group: string;
  /** Optional hint shown right-aligned (e.g. keybinding, current value). */
  hint?: string;
  /** Match terms — lowercased, joined with spaces, scanned by substring. */
  keywords: string;
  run: () => void;
  /** Indicates current state (active surface / current plan / etc.). */
  current?: boolean;
};

const isMac =
  typeof navigator !== "undefined" && /Mac/i.test(navigator.platform);

export function CommandPalette() {
  const proto = useProto();
  const { state } = proto;
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Global ⌘K / Ctrl+K opener. Closes on Escape inside.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isOpenKey = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      if (isOpenKey) {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActiveIdx(0);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus the input when opening.
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Build the command list. Re-derived per render so it reflects current
  // surface / plan / role / etc. — items show "current" markers and hints.
  const allItems: CommandItem[] = useMemo(() => {
    const items: CommandItem[] = [];
    const close = () => setOpen(false);

    // Surface jumps
    SURFACES.forEach((s) => {
      items.push({
        id: `surface-${s}`,
        label: `Switch to ${SURFACE_META[s].short}`,
        group: "Surfaces",
        keywords: `surface ${s} ${SURFACE_META[s].short}`.toLowerCase(),
        current: state.surface === s,
        run: () => {
          proto.setSurface(s as Surface);
          close();
        },
      });
    });

    // Active-surface page jumps
    if (state.surface === "workspace") {
      WORKSPACE_PAGES.forEach((p) => {
        items.push({
          id: `wp-${p}`,
          label: `Workspace · ${PAGE_META[p].label}`,
          group: "Pages",
          keywords: `workspace page ${p} ${PAGE_META[p].label}`.toLowerCase(),
          current: state.page === p,
          run: () => {
            proto.setPage(p as WorkspacePage);
            close();
          },
        });
      });
    } else if (state.surface === "talent") {
      TALENT_PAGES.forEach((p) => {
        items.push({
          id: `tp-${p}`,
          label: `Talent · ${TALENT_PAGE_META[p].label}`,
          group: "Pages",
          keywords: `talent page ${p} ${TALENT_PAGE_META[p].label}`.toLowerCase(),
          current: state.talentPage === p,
          run: () => {
            proto.setTalentPage(p as TalentPage);
            close();
          },
        });
      });
    } else if (state.surface === "client") {
      CLIENT_PAGES.forEach((p) => {
        items.push({
          id: `cp-${p}`,
          label: `Client · ${CLIENT_PAGE_META[p].label}`,
          group: "Pages",
          keywords: `client page ${p} ${CLIENT_PAGE_META[p].label}`.toLowerCase(),
          current: state.clientPage === p,
          run: () => {
            proto.setClientPage(p as ClientPage);
            close();
          },
        });
      });
    } else if (state.surface === "platform") {
      PLATFORM_PAGES.forEach((p) => {
        items.push({
          id: `pp-${p}`,
          label: `Platform · ${PLATFORM_PAGE_META[p].label}`,
          group: "Pages",
          keywords: `platform page ${p} ${PLATFORM_PAGE_META[p].label}`.toLowerCase(),
          current: state.platformPage === p,
          run: () => {
            proto.setPlatformPage(p as PlatformPage);
            close();
          },
        });
      });
    }

    // Workspace-only switches: plan / role
    if (state.surface === "workspace") {
      PLANS.forEach((p) => {
        items.push({
          id: `plan-${p}`,
          label: `Plan: ${PLAN_META[p].label}`,
          group: "Workspace plan",
          keywords: `plan ${p} ${PLAN_META[p].label}`.toLowerCase(),
          current: state.plan === p,
          run: () => {
            proto.setPlan(p as Plan);
            close();
          },
        });
      });
      ROLES.forEach((r) => {
        items.push({
          id: `role-${r}`,
          label: `Role: ${ROLE_META[r].label}`,
          group: "Workspace role",
          keywords: `role ${r} ${ROLE_META[r].label}`.toLowerCase(),
          current: state.role === r,
          run: () => {
            proto.setRole(r as Role);
            close();
          },
        });
      });
    }

    // Common drawer shortcuts (curated subset — the full list of ~150
    // drawers would overwhelm; users open peripheral ones via UI).
    const drawerShortcuts: { id: DrawerId; label: string; surface?: Surface; keywords: string }[] = [
      { id: "new-inquiry", label: "New inquiry", surface: "workspace", keywords: "new inquiry composer brief" },
      { id: "new-talent", label: "Add talent", surface: "workspace", keywords: "new talent add roster" },
      { id: "plan-compare", label: "Compare plans", surface: "workspace", keywords: "plan compare upgrade pricing" },
      { id: "team", label: "Team & seats", surface: "workspace", keywords: "team seats invite member" },
      { id: "branding", label: "Branding", surface: "workspace", keywords: "branding logo theme" },
      { id: "domain", label: "Custom domain", surface: "workspace", keywords: "domain custom storefront url" },
      { id: "notifications", label: "Notifications", keywords: "notifications bell alerts" },
      { id: "danger-zone", label: "Danger zone", surface: "workspace", keywords: "danger zone pause delete transfer" },
      { id: "inbox-snippets", label: "Saved snippets", surface: "workspace", keywords: "snippets canned response template reply" },
      { id: "notifications-prefs", label: "Notification preferences", keywords: "notification preferences settings email digest quiet" },
      { id: "data-export", label: "Export workspace data", surface: "workspace", keywords: "export download data backup gdpr off-boarding" },
      { id: "audit-log", label: "Activity log", surface: "workspace", keywords: "audit log activity history who when changes" },
      { id: "tenant-switcher", label: "Switch workspace", surface: "workspace", keywords: "switch workspace tenant agency multi" },
      { id: "client-send-inquiry", label: "New inquiry", surface: "client", keywords: "client send inquiry new brief" },
      { id: "client-quick-question", label: "Quick question", surface: "client", keywords: "client quick question ask" },
      { id: "talent-block-dates", label: "Block dates", surface: "talent", keywords: "talent block unavailable dates" },
      { id: "talent-profile-edit", label: "Edit profile", surface: "talent", keywords: "talent edit profile" },
    ];
    // Density toggle — persists to localStorage via setDensity.
    items.push({
      id: "density-toggle",
      label: state.density === "compact" ? "Switch to comfortable density" : "Switch to compact density",
      group: "View",
      keywords: "density compact comfortable rows spacing layout",
      run: () => {
        proto.setDensity(state.density === "compact" ? "comfortable" : "compact");
        close();
      },
    });

    drawerShortcuts.forEach((d) => {
      // If the drawer is surface-specific and we're on a different
      // surface, skip — opening it would put state in an awkward place.
      if (d.surface && state.surface !== d.surface) return;
      items.push({
        id: `drawer-${d.id}`,
        label: d.label,
        group: "Actions",
        keywords: d.keywords.toLowerCase(),
        run: () => {
          proto.openDrawer(d.id);
          close();
        },
      });
    });

    return items;
  }, [proto, state]);

  // Filter by query — substring match against keywords. Empty query
  // returns everything in their natural ordering.
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((it) => it.keywords.includes(q));
  }, [allItems, query]);

  // Reset highlight when filter changes.
  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  // Group filtered items for rendering.
  const grouped = useMemo(() => {
    const groups = new Map<string, CommandItem[]>();
    filtered.forEach((it) => {
      const g = groups.get(it.group) ?? [];
      g.push(it);
      groups.set(it.group, g);
    });
    return Array.from(groups.entries());
  }, [filtered]);

  // Handle keyboard nav inside the palette.
  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      filtered[activeIdx]?.run();
      return;
    }
  };

  // Scroll the active row into view when navigating with the keyboard.
  useEffect(() => {
    if (!open || !listRef.current) return;
    const el = listRef.current.querySelector<HTMLButtonElement>(
      `[data-cmd-idx="${activeIdx}"]`,
    );
    el?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  if (!open) return null;

  let runningIdx = 0;

  return (
    <div
      onClick={() => setOpen(false)}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(11,11,13,0.36)",
        zIndex: Z.modalBackdrop,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "center",
        padding: "10vh 16px 16px",
      }}
    >
      <div
        role="dialog"
        aria-label="Command palette"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        style={{
          width: "100%",
          maxWidth: 600,
          background: "#fff",
          borderRadius: 14,
          boxShadow: "0 30px 80px -20px rgba(11,11,13,0.45)",
          overflow: "hidden",
          fontFamily: FONTS.body,
          display: "flex",
          flexDirection: "column",
          maxHeight: "70vh",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 16px",
            borderBottom: `1px solid ${COLORS.borderSoft}`,
          }}
        >
          <SearchGlyph />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a surface, page, plan, or action…"
            aria-label="Command palette search"
            style={{
              flex: 1,
              border: "none",
              outline: "none",
              fontFamily: FONTS.body,
              fontSize: 14,
              color: COLORS.ink,
              background: "transparent",
            }}
          />
          <Kbd>{isMac ? "⌘K" : "Ctrl+K"}</Kbd>
        </div>
        <div ref={listRef} style={{ overflowY: "auto", padding: "6px 0" }}>
          {filtered.length === 0 && (
            <div
              style={{
                padding: "32px 16px",
                textAlign: "center",
                color: COLORS.inkMuted,
                fontSize: 13,
              }}
            >
              No matches. Try a different word.
            </div>
          )}
          {grouped.map(([group, list]) => (
            <div key={group}>
              <div
                style={{
                  padding: "8px 16px 4px",
                  fontSize: 10.5,
                  fontWeight: 600,
                  letterSpacing: 0.6,
                  textTransform: "uppercase",
                  color: COLORS.inkDim,
                }}
              >
                {group}
              </div>
              {list.map((it) => {
                const idx = runningIdx++;
                const active = idx === activeIdx;
                return (
                  <button
                    key={it.id}
                    type="button"
                    data-cmd-idx={idx}
                    onMouseEnter={() => setActiveIdx(idx)}
                    onClick={it.run}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      width: "100%",
                      padding: "9px 16px",
                      background: active ? COLORS.accentSoft : "transparent",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: FONTS.body,
                      fontSize: 13,
                      color: active ? COLORS.accentDeep : COLORS.ink,
                      textAlign: "left",
                    }}
                  >
                    <span style={{ flex: 1, minWidth: 0 }}>{it.label}</span>
                    {it.current && <CurrentChip />}
                    {it.hint && (
                      <span style={{ fontSize: 11, color: COLORS.inkMuted }}>{it.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            padding: "8px 14px",
            borderTop: `1px solid ${COLORS.borderSoft}`,
            fontSize: 11,
            color: COLORS.inkMuted,
            background: COLORS.surface,
          }}
        >
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> navigate · <Kbd>↵</Kbd> select
          </span>
          <span>
            <Kbd>Esc</Kbd> close
          </span>
        </div>
      </div>
    </div>
  );
}

function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd
      style={{
        fontFamily: FONTS.body,
        fontSize: 10.5,
        fontWeight: 500,
        padding: "2px 6px",
        borderRadius: 5,
        background: "rgba(11,11,13,0.06)",
        color: COLORS.inkMuted,
      }}
    >
      {children}
    </kbd>
  );
}

function CurrentChip() {
  return (
    <span
      style={{
        fontSize: 9.5,
        fontWeight: 600,
        letterSpacing: 0.5,
        textTransform: "uppercase",
        padding: "2px 6px",
        borderRadius: 999,
        background: COLORS.accentSoft,
        color: COLORS.accentDeep,
      }}
    >
      Current
    </span>
  );
}

function SearchGlyph() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke={COLORS.inkMuted}
      strokeWidth={1.7}
      strokeLinecap="round"
    >
      <circle cx={11} cy={11} r={7} />
      <line x1={20} y1={20} x2={16.5} y2={16.5} />
    </svg>
  );
}
