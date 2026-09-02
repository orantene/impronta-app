"use client";

/**
 * Command palette (⌘K / Ctrl+K).
 *
 * A single keyboard-accessible spotlight surface that indexes:
 *   - Surfaces (workspace / talent / client / platform)
 *   - Pages within the active surface
 *   - Role switches (workspace only). NOT plan: tier is a billing fact, so
 *     it changes through the upgrade modal and Stripe, never from here.
 *   - Common drawers (new inquiry, plan compare, danger zone, etc.)
 *
 * It is intentionally small and fast: substring match, no debounce, no
 * fuzzy-search dependency. The palette closes after every action and
 * delegates state changes to AdminShellProvider via useAdminShell.
 *
 * Mounting: rendered once at the page root next to DrawerRoot. Visibility
 * is local state inside the palette — opens on ⌘K / Ctrl+K, closes on
 * Escape, on selection, or on backdrop click.
 */

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useT } from "@/i18n/use-t";
import { interpolate } from "@/i18n/interpolate";
import { COLORS, FONTS, PAGE_META, ROLES, ROLE_META, SURFACES, SURFACE_META, TALENT_PAGES, TALENT_PAGE_META, Z, useAdminShell, type DrawerId, type Role, type Surface, type TalentPage, type WorkspacePage } from "./state";

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
  const proto = useAdminShell();
  const { state } = proto;
  const t = useT();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Global ⌘K / Ctrl+K opener. Closes on Escape inside.
  // Also: "?" without modifiers opens with the query pre-populated to
  // "shortcuts" — surfaces the help/hotkeys list immediately.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isOpenKey = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isHelpKey =
        e.key === "?" &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        // Don't intercept when the user is typing in an input/textarea
        !(e.target instanceof HTMLElement &&
          (e.target.tagName === "INPUT" ||
            e.target.tagName === "TEXTAREA" ||
            e.target.isContentEditable));
      if (isOpenKey) {
        e.preventDefault();
        setOpen((v) => !v);
        setQuery("");
        setActiveIdx(0);
      } else if (isHelpKey) {
        e.preventDefault();
        setOpen(true);
        setQuery("shortcut");
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
        label: interpolate(t("dashboard.adminShell.commandPalette.switchToSurface"), {
          surface: SURFACE_META[s].short,
        }),
        group: t("dashboard.adminShell.commandPalette.groupSurfaces"),
        keywords: `surface ${t("dashboard.adminShell.commandPalette.groupSurfaces")} ${s} ${SURFACE_META[s].short}`.toLowerCase(),
        current: state.surface === s,
        run: () => {
          proto.setSurface(s as Surface);
          close();
        },
      });
    });

    // Active-surface page jumps
    if (state.surface === "workspace") {
      state.visiblePages.forEach((p) => {
        items.push({
          id: `wp-${p}`,
          label: `${t("dashboard.adminShell.commandPalette.surfaceWorkspace")} · ${PAGE_META[p].label}`,
          group: t("dashboard.adminShell.commandPalette.groupPages"),
          keywords: `workspace page ${t("dashboard.adminShell.commandPalette.groupPages")} ${p} ${PAGE_META[p].label}`.toLowerCase(),
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
          label: `${t("dashboard.adminShell.commandPalette.surfaceTalent")} · ${TALENT_PAGE_META[p].label}`,
          group: t("dashboard.adminShell.commandPalette.groupPages"),
          keywords: `talent page ${t("dashboard.adminShell.commandPalette.groupPages")} ${p} ${TALENT_PAGE_META[p].label}`.toLowerCase(),
          current: state.talentPage === p,
          run: () => {
            proto.setTalentPage(p as TalentPage);
            close();
          },
        });
      });
    }

    // Workspace-only switches: role
    //
    // The plan switcher used to live here too. It called the shell's local
    // plan setter, so ⌘K → "Plan: Agency" silently pretended a real tenant
    // had upgraded — locked cards opened, server gates kept refusing, and one
    // reload undid it. Changing tier is a billing action; it lives in the
    // upgrade modal (`openUpgrade` → Stripe Checkout) and nowhere else.
    if (state.surface === "workspace") {
      ROLES.forEach((r) => {
        items.push({
          id: `role-${r}`,
          label: `${t("dashboard.adminShell.commandPalette.rolePrefix")}: ${ROLE_META[r].label}`,
          group: t("dashboard.adminShell.commandPalette.groupWorkspaceRole"),
          keywords: `role ${t("dashboard.adminShell.commandPalette.rolePrefix")} ${r} ${ROLE_META[r].label}`.toLowerCase(),
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
    const drawerShortcuts: { id: DrawerId; labelKey: string; surface?: Surface; keywords: string }[] = [
      { id: "new-inquiry", labelKey: "newInquiry", surface: "workspace", keywords: "new inquiry composer brief" },
      { id: "new-talent", labelKey: "addTalent", surface: "workspace", keywords: "new talent add roster" },
      { id: "plan-compare", labelKey: "comparePlans", surface: "workspace", keywords: "plan compare upgrade pricing" },
      { id: "team", labelKey: "teamSeats", surface: "workspace", keywords: "team seats invite member" },
      { id: "branding", labelKey: "branding", surface: "workspace", keywords: "branding logo theme" },
      { id: "domain", labelKey: "customDomain", surface: "workspace", keywords: "domain custom storefront url" },
      { id: "notifications", labelKey: "notifications", keywords: "notifications bell alerts" },
      { id: "danger-zone", labelKey: "dangerZone", surface: "workspace", keywords: "danger zone pause delete transfer" },
      { id: "whats-new", labelKey: "whatsNew", keywords: "changelog whats new release notes recent" },
      { id: "help", labelKey: "helpShortcuts", keywords: "help shortcuts keybindings docs support" },
      { id: "inbox-snippets", labelKey: "savedSnippets", surface: "workspace", keywords: "snippets canned response template reply" },
      { id: "notifications-prefs", labelKey: "notificationPrefs", keywords: "notification preferences settings email digest quiet" },
      { id: "data-export", labelKey: "exportData", surface: "workspace", keywords: "export download data backup gdpr off-boarding" },
      { id: "audit-log", labelKey: "activityLog", surface: "workspace", keywords: "audit log activity history who when changes" },
      { id: "tenant-switcher", labelKey: "switchWorkspace", surface: "workspace", keywords: "switch workspace tenant agency multi" },
      { id: "talent-block-dates", labelKey: "blockDates", surface: "talent", keywords: "talent block unavailable dates" },
      { id: "talent-profile-edit", labelKey: "editProfile", surface: "talent", keywords: "talent edit profile" },
    ];
    // Help / shortcuts — surfaces the gestures + keybindings in a toast
    // so users have a discoverable cheat-sheet from inside the palette.
    items.push({
      id: "help-shortcuts",
      label: t("dashboard.adminShell.commandPalette.shortcutsAndGestures"),
      group: t("dashboard.adminShell.commandPalette.groupHelp"),
      keywords:
        `shortcut shortcuts keyboard hotkeys gesture swipe help cheatsheet ${t("dashboard.adminShell.commandPalette.shortcutsAndGestures")}`.toLowerCase(),
      run: () => {
        proto.toast(t("dashboard.adminShell.commandPalette.shortcutsToast"));
        close();
      },
    });

    // Restore onboarding arcs — wipes the dismissal flags so the
     // "4 steps to get booked" / "Welcome — let's get you booking" /
     // free overview activation arc reappear. Useful for demos and for
     // users who dismissed by mistake.
    items.push({
      id: "onboarding-restore",
      label: t("dashboard.adminShell.commandPalette.restoreChecklists"),
      group: t("dashboard.adminShell.commandPalette.groupView"),
      keywords:
        `restore reset onboarding setup checklist arc help getting started ${t("dashboard.adminShell.commandPalette.restoreChecklists")}`.toLowerCase(),
      run: () => {
        try {
          window.localStorage.removeItem("tulala_onboard_client");
          window.localStorage.removeItem("tulala_onboard_talent");
          window.localStorage.removeItem("tulala_onboard_client_completed");
          window.localStorage.removeItem("tulala_onboard_talent_completed");
        } catch {
          /* ignore */
        }
        proto.toast(t("dashboard.adminShell.commandPalette.checklistsRestoredToast"));
        close();
      },
    });

    // Density toggle — persists to localStorage via setDensity.
    items.push({
      id: "density-toggle",
      label:
        state.density === "compact"
          ? t("dashboard.adminShell.commandPalette.densityComfortable")
          : t("dashboard.adminShell.commandPalette.densityCompact"),
      group: t("dashboard.adminShell.commandPalette.groupView"),
      keywords:
        `density compact comfortable rows spacing layout ${t("dashboard.adminShell.commandPalette.densityComfortable")} ${t("dashboard.adminShell.commandPalette.densityCompact")}`.toLowerCase(),
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
        label: t(`dashboard.adminShell.commandPalette.drawer.${d.labelKey}`),
        group: t("dashboard.adminShell.commandPalette.groupActions"),
        keywords:
          `${d.keywords} ${t(`dashboard.adminShell.commandPalette.drawer.${d.labelKey}`)}`.toLowerCase(),
        run: () => {
          proto.openDrawer(d.id);
          close();
        },
      });
    });

    return items;
  }, [proto, state, t]);

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
        aria-label={t("dashboard.adminShell.commandPalette.dialogAria")}
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
            placeholder={t("dashboard.adminShell.commandPalette.placeholder")}
            aria-label={t("dashboard.adminShell.commandPalette.searchAria")}
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
            <div style={{ padding: "32px 16px", textAlign: "center", fontSize: 13 }} className="text-admin-ink-muted">
              {t("dashboard.adminShell.commandPalette.noMatches")}
            </div>
          )}
          {grouped.map(([group, list]) => (
            <div key={group}>
              <div style={{ padding: "8px 16px 4px", fontSize: 10.5, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase" }} className="text-admin-ink-dim">
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
                    <span className="flex-1 min-w-0">{it.label}</span>
                    {it.current && <CurrentChip label={t("dashboard.adminShell.commandPalette.current")} />}
                    {it.hint && (
                      <span className="text-admin-ink-muted text-admin-11">{it.hint}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 14px", borderTop: `1px solid ${COLORS.borderSoft}`, fontSize: 11 }} className="text-admin-ink-muted bg-admin-surface">
          <span>
            <Kbd>↑</Kbd> <Kbd>↓</Kbd> {t("dashboard.adminShell.commandPalette.footerNavigate")} ·{" "}
            <Kbd>↵</Kbd> {t("dashboard.adminShell.commandPalette.footerSelect")}
          </span>
          <span>
            <Kbd>Esc</Kbd> {t("dashboard.adminShell.commandPalette.footerClose")}
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

function CurrentChip({ label }: { label: string }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 600, letterSpacing: 0.5, textTransform: "uppercase", padding: "2px 6px", borderRadius: 999 }} className="bg-admin-accent-soft text-admin-accent-deep">
      {label}
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
