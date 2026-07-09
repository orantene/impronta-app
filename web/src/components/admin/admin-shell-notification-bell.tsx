"use client";

import * as React from "react";
import { Bell } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import {
  loadMyNotifications,
  markNotificationsRead,
} from "@/lib/notifications/my-notifications-actions";
import type { MyNotification } from "@/lib/notifications/self-types";
import {
  fireOpenShellDrawer,
} from "@/components/admin/shell/internal/open-drawer-bridge";
import type { DrawerId } from "@/components/admin/shell/internal/state";

function relativeTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60_000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  return `${Math.floor(hr / 24)}d ago`;
}

function kindIcon(kind: MyNotification["kind"]): string {
  switch (kind) {
    case "approval":  return "👤";
    case "message":   return "💬";
    case "offer":     return "💼";
    case "booking":   return "📅";
    case "payment":   return "💳";
    case "profile":   return "✎";
    case "system":    return "ⓘ";
    default:          return "🔔";
  }
}

/**
 * Self-contained notification bell. Loads notifications via the shared
 * `loadMyNotifications` server action (does NOT touch AdminShellProvider).
 * Opens a popover drawer with unread badge, mark-all-read, and per-row
 * dismiss. Refreshes on first open + on window focus.
 */
export function TopBarNotificationBell() {
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<MyNotification[]>([]);
  const [loaded, setLoaded] = React.useState(false);
  const popoverRef = React.useRef<HTMLDivElement | null>(null);
  const buttonRef = React.useRef<HTMLButtonElement | null>(null);
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set());

  const loadNotifs = React.useCallback(async () => {
    try {
      const result = await loadMyNotifications(50);
      setNotifications(result);
      setLoaded(true);
    } catch {
      setLoaded(true);
    }
  }, []);

  // Load on first open
  React.useEffect(() => {
    if (open && !loaded) void loadNotifs();
  }, [open, loaded, loadNotifs]);

  // Re-load on window focus so the bell stays fresh after switching tabs
  React.useEffect(() => {
    const onFocus = () => { if (loaded) void loadNotifs(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [loaded, loadNotifs]);

  // Close on outside click
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        popoverRef.current &&
        !popoverRef.current.contains(e.target as Node) &&
        buttonRef.current &&
        !buttonRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const visible = notifications.filter((n) => !dismissed.has(n.id));
  const unread = visible.filter((n) => n.readAt === null).length;

  const markAllRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })),
    );
    await markNotificationsRead("all");
  };

  const dismissItem = async (id: string) => {
    setDismissed((prev) => new Set([...prev, id]));
    await markNotificationsRead([id]);
  };

  const markOneRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, readAt: n.readAt ?? new Date().toISOString() } : n,
      ),
    );
    await markNotificationsRead([id]);
  };

  return (
    <div className="relative">
      <Tooltip>
        <TooltipTrigger asChild>
          <button
            ref={buttonRef}
            type="button"
            onClick={() => setOpen((v) => !v)}
            className={cn(
              "relative inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-foreground/70 transition-colors hover:bg-foreground/[0.05] hover:text-foreground",
              open && "bg-foreground/[0.06] text-foreground",
            )}
            aria-label={
              unread > 0
                ? `${unread} unread notification${unread === 1 ? "" : "s"}`
                : "Notifications"
            }
          >
            <Bell className="size-4" aria-hidden />
            {unread > 0 && (
              <span className="absolute right-1.5 top-1.5 inline-flex min-w-[14px] items-center justify-center rounded-full bg-foreground px-1 text-[9px] font-bold leading-[14px] text-background">
                {unread > 9 ? "9+" : unread}
              </span>
            )}
          </button>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {unread > 0 ? `${unread} unread` : "Notifications"}
        </TooltipContent>
      </Tooltip>

      {open && (
        <div
          ref={popoverRef}
          className="absolute right-0 top-[calc(100%+6px)] z-50 flex w-[360px] max-w-[calc(100vw-24px)] flex-col overflow-hidden rounded-xl border border-border bg-background shadow-xl"
          role="dialog"
          aria-label="Notifications"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/60 px-3.5 py-2.5">
            <span className="text-[12.5px] font-bold text-foreground">Notifications</span>
            {unread > 0 && (
              <button
                type="button"
                onClick={markAllRead}
                className="text-[11px] font-semibold text-primary hover:underline"
              >
                Mark all read
              </button>
            )}
          </div>

          {/* Body */}
          <div className="max-h-[360px] overflow-y-auto">
            {!loaded ? (
              <div className="py-10 text-center text-[12px] text-muted-foreground">
                Loading…
              </div>
            ) : visible.length === 0 ? (
              <div className="py-10 text-center">
                <div className="mb-1.5 text-2xl">✓</div>
                <div className="text-[12px] text-muted-foreground">All caught up.</div>
              </div>
            ) : (
              <ul className="py-1">
                {visible.map((n) => {
                  const isRead = n.readAt !== null;
                  return (
                    <li
                      key={n.id}
                      className={cn(
                        "group relative flex items-start gap-2.5 px-3 py-2.5",
                        !isRead && "bg-primary/[0.03]",
                        "transition-colors hover:bg-muted/40",
                      )}
                    >
                      <span className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-muted/60 text-[13px]">
                        {kindIcon(n.kind)}
                      </span>
                      <button
                        type="button"
                        className="min-w-0 flex-1 text-left"
                        onClick={() => {
                          void markOneRead(n.id);
                          if (n.targetDrawer) {
                            fireOpenShellDrawer(n.targetDrawer as DrawerId);
                            setOpen(false);
                            return;
                          }
                          if (n.href) window.location.href = n.href;
                        }}
                      >
                        <div className="flex items-baseline gap-1.5">
                          <span
                            className={cn(
                              "flex-1 truncate text-[12px] leading-snug",
                              isRead
                                ? "font-medium text-foreground/80"
                                : "font-semibold text-foreground",
                            )}
                          >
                            {n.title}
                          </span>
                          <span className="shrink-0 text-[10px] text-muted-foreground">
                            {relativeTime(n.createdAt)}
                          </span>
                        </div>
                        {n.body ? (
                          <div className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2">
                            {n.body}
                          </div>
                        ) : null}
                      </button>
                      <button
                        type="button"
                        aria-label="Dismiss"
                        onClick={() => void dismissItem(n.id)}
                        className="mt-0.5 shrink-0 opacity-0 transition-opacity group-hover:opacity-60 hover:!opacity-100"
                      >
                        <span className="text-[14px] leading-none text-foreground/60">×</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-border/60 px-3.5 py-2 text-center">
            <span className="text-[11px] text-muted-foreground">
              Showing last {notifications.length} notification{notifications.length === 1 ? "" : "s"}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
