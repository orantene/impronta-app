"use client";

/**
 * Presence provider — live collaborator presence for the page builder (WS1-A).
 *
 * Uses Supabase Realtime PRESENCE on channel `cms-page-editors-${pageId}` (or
 * `…-${pageId}-${locale}` when a locale is supplied — the builder edits content
 * per-locale, so editors on different locales of the same page are NOT colliding
 * and must not appear to each other). Each browser TAB that mounts this joins the
 * channel, tracks its identity, and receives sync events as editors join/leave.
 *
 * IDENTITY — keyed per TAB, grouped per USER:
 *   - The presence KEY is a per-tab id (`getSessionId()`, sessionStorage-backed),
 *     so two tabs of the SAME account appear as two distinct entries (the old code
 *     keyed on `user.id`, collapsing them to one — which is why a second tab could
 *     edit with zero awareness and only surface at the save conflict).
 *   - The tracked payload carries `userId` + `name`, so the UI can tell "another
 *     person is editing" (different userId) from "you have this open in another
 *     tab" (same userId).
 *
 * This is pure ephemeral Realtime presence — ZERO database writes — so it can
 * never cause a save/version conflict; it is strictly additive awareness.
 *
 * Graceful fallbacks: missing Supabase env / null pageId / any Realtime error →
 * a single self-entry and `online:false`. Presence is decorative and must never
 * break the builder.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import { createClient } from "@/lib/supabase/client";

// ── types ──────────────────────────────────────────────────────────────────────

export interface EditorPresence {
  /** Per-TAB id (presence key). Unique per browser tab. */
  id: string;
  /** Auth user id — same across this user's tabs; distinguishes people from tabs. */
  userId: string | null;
  /** Display name. */
  name: string;
  /** 1–2 letter initials derived from name. */
  initials: string;
  /** Stable accent color derived from the tab id. */
  color: string;
  /** True for THIS tab's own entry. */
  isSelf: boolean;
}

interface PresenceContextValue {
  /** All editor tabs on the channel, self first. */
  editors: EditorPresence[];
  /** Editors other than this tab (other people AND this user's other tabs). */
  others: EditorPresence[];
  /** Whether the Realtime channel is subscribed (false = degraded/offline). */
  online: boolean;
}

// ── palette ───────────────────────────────────────────────────────────────────

/** 8-color palette for presence avatars (editor-chrome blues/teals/purples). */
const PRESENCE_COLORS: readonly string[] = [
  "#3d4f7c",
  "#1e6f8e",
  "#5a3d7c",
  "#1a7a6e",
  "#7c3d4f",
  "#3d6f1e",
  "#7c5a1e",
  "#1e3d7a",
];

function colorForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return PRESENCE_COLORS[hash % PRESENCE_COLORS.length]!;
}

function initialsForName(name: string): string {
  const words = name.trim().split(/\s+/);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ""}${words[1]![0] ?? ""}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) ?? "?").toUpperCase();
}

function makeEditor(
  tabId: string,
  name: string,
  opts: { userId?: string | null; isSelf?: boolean } = {},
): EditorPresence {
  return {
    id: tabId,
    userId: opts.userId ?? null,
    name,
    initials: initialsForName(name),
    color: colorForId(tabId),
    isSelf: opts.isSelf ?? false,
  };
}

// ── stable per-TAB id ───────────────────────────────────────────────────────────

let _sessionId: string | null = null;

/** A stable id unique to THIS browser tab (sessionStorage is per-tab). */
function getSessionId(): string {
  if (_sessionId) return _sessionId;
  try {
    const stored =
      typeof sessionStorage !== "undefined"
        ? sessionStorage.getItem("edit:presence-id")
        : null;
    if (stored) {
      _sessionId = stored;
      return stored;
    }
  } catch {
    // sessionStorage may be blocked
  }
  const id = `tab-${Math.random().toString(36).slice(2, 10)}`;
  _sessionId = id;
  try {
    if (typeof sessionStorage !== "undefined") {
      sessionStorage.setItem("edit:presence-id", id);
    }
  } catch {
    // ignore
  }
  return id;
}

// ── context ───────────────────────────────────────────────────────────────────

const PresenceContext = createContext<PresenceContextValue>({
  editors: [],
  others: [],
  online: false,
});

// ── provider ──────────────────────────────────────────────────────────────────

export interface PresenceProviderProps {
  /** cms_pages.id for the page being edited. Presence is scoped per page. */
  pageId: string | null;
  /** Active edit locale — scopes the channel so locales don't cross-talk. */
  locale?: string | null;
  /** Display name for this editor. Defaults to "You". */
  selfName?: string;
  /** Auth user id for this editor (grouping key; distinguishes people from tabs). */
  selfId?: string;
  children: React.ReactNode;
}

export function PresenceProvider({
  pageId,
  locale,
  selfName = "You",
  selfId,
  children,
}: PresenceProviderProps) {
  // Per-TAB presence key — two tabs of one account are two distinct entries.
  const tabId = getSessionId();
  const self = useMemo(
    () => makeEditor(tabId, selfName, { userId: selfId ?? null, isSelf: true }),
    [tabId, selfName, selfId],
  );

  const [editors, setEditors] = useState<EditorPresence[]>([self]);
  const [online, setOnline] = useState(false);

  // Keep a ref to the latest self so the effect closure is always fresh.
  const selfRef = useRef(self);
  useEffect(() => {
    selfRef.current = self;
  }, [self]);

  const buildEditorList = useCallback(
    (
      presenceState: Record<
        string,
        Array<{ tabId?: string; userId?: string; name?: string }>
      >,
    ): EditorPresence[] => {
      // One entry per presence KEY (= tab). Self always included + first.
      const seen = new Map<string, EditorPresence>();
      seen.set(selfRef.current.id, selfRef.current);

      for (const [key, tracks] of Object.entries(presenceState)) {
        const track = tracks[0];
        const id =
          (typeof track?.tabId === "string" && track.tabId) || key || null;
        if (!id || seen.has(id)) continue;
        const name =
          typeof track?.name === "string" && track.name ? track.name : "Editor";
        const userId =
          typeof track?.userId === "string" && track.userId
            ? track.userId
            : null;
        seen.set(id, makeEditor(id, name, { userId, isSelf: id === tabId }));
      }

      return Array.from(seen.values());
    },
    [tabId],
  );

  useEffect(() => {
    if (!pageId) {
      setEditors([selfRef.current]);
      setOnline(false);
      return;
    }

    let supa: ReturnType<typeof createClient>;
    try {
      supa = createClient();
    } catch {
      supa = null;
    }

    if (!supa) {
      setEditors([selfRef.current]);
      setOnline(false);
      return;
    }

    const channelName = locale
      ? `cms-page-editors-${pageId}-${locale}`
      : `cms-page-editors-${pageId}`;
    const channel = supa.channel(channelName, {
      config: { presence: { key: tabId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        try {
          const state = channel.presenceState() as Record<
            string,
            Array<{ tabId?: string; userId?: string; name?: string }>
          >;
          setEditors(buildEditorList(state));
        } catch {
          // ignore
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          setOnline(true);
          try {
            await channel.track({
              tabId,
              userId: selfRef.current.userId,
              name: selfRef.current.name,
            });
          } catch {
            // ignore — presence is decorative
          }
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setOnline(false);
        }
      });

    return () => {
      setOnline(false);
      try {
        void channel.untrack();
        void supa!.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [pageId, locale, tabId, buildEditorList]);

  const value = useMemo<PresenceContextValue>(() => {
    const others = editors.filter((e) => !e.isSelf);
    return { editors, others, online };
  }, [editors, online]);

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns presence for the current page: all editor tabs (`editors`, self first),
 * everyone else (`others`), and whether the channel is live (`online`).
 */
export function usePagePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}
