"use client";

/**
 * Presence provider — live collaborator presence for the page builder.
 *
 * Uses Supabase Realtime PRESENCE on channel `cms-page-editors-${pageId}`.
 * Each browser tab that mounts PresenceProvider joins the channel, tracks
 * its own identity, and receives sync events when other editors join or leave.
 *
 * Graceful fallbacks:
 *   - If Supabase client is unavailable (missing env), returns a single
 *     self-entry so the rail still renders something.
 *   - If pageId is null (composition not yet loaded), no channel is joined
 *     and we return only self.
 *   - All errors are swallowed — presence is decorative and must never
 *     break the builder.
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
  /** Stable per-session id (user id when available, random fallback). */
  id: string;
  /** Display name. */
  name: string;
  /** 1–2 letter initials derived from name. */
  initials: string;
  /** Stable accent color derived from id. */
  color: string;
}

interface PresenceContextValue {
  editors: EditorPresence[];
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

function makeEditor(id: string, name: string): EditorPresence {
  return {
    id,
    name,
    initials: initialsForName(name),
    color: colorForId(id),
  };
}

// ── stable per-session id ─────────────────────────────────────────────────────

let _sessionId: string | null = null;

function getSessionId(): string {
  if (_sessionId) return _sessionId;
  try {
    const stored = typeof sessionStorage !== "undefined"
      ? sessionStorage.getItem("edit:presence-id")
      : null;
    if (stored) {
      _sessionId = stored;
      return stored;
    }
  } catch {
    // sessionStorage may be blocked
  }
  const id = `anon-${Math.random().toString(36).slice(2, 10)}`;
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

const PresenceContext = createContext<PresenceContextValue>({ editors: [] });

// ── provider ──────────────────────────────────────────────────────────────────

export interface PresenceProviderProps {
  /** cms_pages.id for the page being edited. Presence is scoped per page. */
  pageId: string | null;
  /** Display name for this editor. Defaults to "You". */
  selfName?: string;
  /** Stable id for this editor. Falls back to a per-session random id. */
  selfId?: string;
  children: React.ReactNode;
}

export function PresenceProvider({
  pageId,
  selfName = "You",
  selfId,
  children,
}: PresenceProviderProps) {
  const resolvedId = selfId ?? getSessionId();
  const self = useMemo(() => makeEditor(resolvedId, selfName), [resolvedId, selfName]);

  const [editors, setEditors] = useState<EditorPresence[]>([self]);

  // Keep a ref to the latest self so the effect closure is always fresh.
  const selfRef = useRef(self);
  useEffect(() => {
    selfRef.current = self;
  }, [self]);

  const buildEditorList = useCallback(
    (
      presenceState: Record<string, Array<{ id?: string; name?: string }>>,
    ): EditorPresence[] => {
      // Flatten all presence tracks from all "clients" (connection keys).
      // Deduplicate by id; self takes priority for its own entry.
      const seen = new Map<string, EditorPresence>();
      // Always include self.
      seen.set(selfRef.current.id, selfRef.current);

      for (const tracks of Object.values(presenceState)) {
        for (const track of tracks) {
          const id = typeof track.id === "string" && track.id ? track.id : null;
          const name =
            typeof track.name === "string" && track.name ? track.name : "Editor";
          if (!id) continue;
          // Don't override self entry.
          if (!seen.has(id)) {
            seen.set(id, makeEditor(id, name));
          }
        }
      }

      return Array.from(seen.values());
    },
    [],
  );

  useEffect(() => {
    if (!pageId) {
      // No page yet — just show self.
      setEditors([selfRef.current]);
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
      return;
    }

    // Create the presence channel.
    const channelName = `cms-page-editors-${pageId}`;
    const channel = supa.channel(channelName, {
      config: { presence: { key: resolvedId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        try {
          // presenceState() returns { [key: string]: Array<PresenceData> }
          const state = channel.presenceState() as Record<
            string,
            Array<{ id?: string; name?: string }>
          >;
          setEditors(buildEditorList(state));
        } catch {
          // ignore
        }
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          try {
            await channel.track({ id: resolvedId, name: selfRef.current.name });
          } catch {
            // ignore — presence is decorative
          }
        }
      });

    return () => {
      try {
        void channel.untrack();
        void supa!.removeChannel(channel);
      } catch {
        // ignore
      }
    };
  }, [pageId, resolvedId, buildEditorList]);

  const value = useMemo<PresenceContextValue>(() => ({ editors }), [editors]);

  return (
    <PresenceContext.Provider value={value}>
      {children}
    </PresenceContext.Provider>
  );
}

// ── hook ──────────────────────────────────────────────────────────────────────

/**
 * Returns the list of active editors on the current page.
 * The current user is always first in the list.
 */
export function usePagePresence(): PresenceContextValue {
  return useContext(PresenceContext);
}
