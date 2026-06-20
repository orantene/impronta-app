"use client";

/**
 * Rail pinning — lets the operator "pin" individual items on the builder's two
 * icon rails (the left CommandDock and the right InspectorCommandRail) so they
 * stay reachable even after the rail is collapsed to its handle pill.
 *
 * {@link useRailPinned} owns the persisted set of pinned item ids (localStorage,
 * so pins survive reload). {@link PinnableRailItem} wraps a single rail item and
 * overlays a small pin toggle in its corner — visible on hover, and persistently
 * lit when the item is pinned (in the expanded rail, so you can see what's
 * pinned at a glance).
 */

import {
  useCallback,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { Pin } from "lucide-react";

import { CHROME } from "./tokens";

export interface RailPinned {
  isPinned: (id: string) => boolean;
  togglePinned: (id: string) => void;
}

/** Persisted set of pinned item ids for one rail, stored as a JSON array. */
export function useRailPinned(storageKey: string): RailPinned {
  const [pinned, setPinned] = useState<ReadonlySet<string>>(
    () => new Set<string>(),
  );

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        setPinned(new Set(parsed.filter((x): x is string => typeof x === "string")));
      }
    } catch {
      // localStorage / JSON can throw in private mode — start with no pins.
    }
  }, [storageKey]);

  const togglePinned = useCallback(
    (id: string) => {
      setPinned((prev) => {
        const next = new Set(prev);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        try {
          window.localStorage.setItem(storageKey, JSON.stringify([...next]));
        } catch {
          // best-effort persistence; the in-memory toggle still works.
        }
        return next;
      });
    },
    [storageKey],
  );

  const isPinned = useCallback((id: string) => pinned.has(id), [pinned]);

  return { isPinned, togglePinned };
}

export interface PinnableRailItemProps {
  pinned: boolean;
  onTogglePinned: () => void;
  /** Item name, used in the pin toggle's aria-label/title. */
  label: string;
  /**
   * When true, a pinned item shows its pin persistently (the "this is pinned"
   * indicator on the expanded rail). When false the pin only appears on
   * hover/focus (used in the collapsed pill, where every item is already
   * pinned — a persistent badge on each would be noise).
   */
  showPinnedIndicator: boolean;
  children: ReactNode;
}

export function PinnableRailItem({
  pinned,
  onTogglePinned,
  label,
  showPinnedIndicator,
  children,
}: PinnableRailItemProps) {
  const pinLabel = pinned ? `Unpin ${label}` : `Pin ${label}`;
  const persistentlyShown = pinned && showPinnedIndicator;

  return (
    <div className="group relative">
      {children}
      <button
        type="button"
        data-no-drag
        onClick={(e) => {
          e.stopPropagation();
          onTogglePinned();
        }}
        aria-label={pinLabel}
        title={pinLabel}
        className={`absolute right-0.5 top-0.5 inline-flex size-6 items-center justify-center rounded-md border-none p-0 transition-opacity focus-visible:opacity-100 focus-visible:[outline:2px_solid_#7c3aed] focus-visible:[outline-offset:1px] ${
          persistentlyShown
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100"
        }`}
        // A surface backplate keeps the glyph legible on ANY underlying fill —
        // notably the solid-accent "Add" circle, where a bare violet pin would
        // sit invisibly violet-on-violet.
        style={{
          color: pinned ? CHROME.accent : CHROME.muted2,
          background: CHROME.surface,
          boxShadow:
            "0 0 0 1px rgba(24,24,27,0.08), 0 1px 2px rgba(0,0,0,0.10)",
        }}
        onMouseEnter={(e) => {
          if (!pinned) e.currentTarget.style.color = CHROME.muted;
        }}
        onMouseLeave={(e) => {
          if (!pinned) e.currentTarget.style.color = CHROME.muted2;
        }}
      >
        <Pin
          size={12}
          strokeWidth={2.25}
          fill={pinned ? "currentColor" : "none"}
          aria-hidden
        />
      </button>
    </div>
  );
}
