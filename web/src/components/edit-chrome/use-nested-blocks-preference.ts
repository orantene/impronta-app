"use client";

import { useEffect, useRef, useState, type Dispatch, type SetStateAction } from "react";

/**
 * Nested-blocks panel preference — the panel starts HIDDEN and remembers the
 * operator's last choice across sessions.
 *
 * It used to mount open and re-open itself on every new selection, so the
 * bottom-left panel covered the canvas for everyone whether they used it or
 * not. Now it is a sticky, opt-in surface: closed until the chip's "Nested
 * blocks" toggle (or the collapsed pill) opens it, and whatever the operator
 * last chose is what they get in the next session.
 *
 * Stored in a cookie rather than localStorage so it travels with the editor
 * chrome's other cookie-held prefs (see `use-editor-locale.ts`).
 */
export const NESTED_BLOCKS_PANEL_COOKIE = "tulala_builder_nested_blocks";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/** Parse the panel preference out of a raw `document.cookie` string. */
export function parseNestedBlocksPanelCookie(cookie: string): boolean | null {
  const match = cookie.match(
    new RegExp(`(?:^|; )${NESTED_BLOCKS_PANEL_COOKIE}=([^;]*)`),
  );
  if (!match) return null;
  const value = decodeURIComponent(match[1] ?? "");
  if (value === "1") return true;
  if (value === "0") return false;
  return null;
}

/** The `document.cookie` assignment that persists `open` for a year. */
export function serializeNestedBlocksPanelCookie(
  open: boolean,
  secure: boolean,
): string {
  return [
    `${NESTED_BLOCKS_PANEL_COOKIE}=${open ? "1" : "0"}`,
    "path=/",
    `max-age=${ONE_YEAR_SECONDS}`,
    "samesite=lax",
    ...(secure ? ["secure"] : []),
  ].join("; ");
}

export function useNestedBlocksPanelPreference(): [
  boolean,
  Dispatch<SetStateAction<boolean>>,
] {
  // Hidden by default — both for the first-ever session and for the server
  // render, so hydration never flashes an open panel.
  const [open, setOpen] = useState(false);
  const skipFirstWrite = useRef(true);

  useEffect(() => {
    const stored = parseNestedBlocksPanelCookie(document.cookie);
    if (stored !== null) setOpen(stored);
  }, []);

  useEffect(() => {
    // The mount pass would write the pre-hydration default back over whatever
    // the cookie holds, so let the read effect above go first.
    if (skipFirstWrite.current) {
      skipFirstWrite.current = false;
      return;
    }
    document.cookie = serializeNestedBlocksPanelCookie(
      open,
      window.location.protocol === "https:",
    );
  }, [open]);

  return [open, setOpen];
}
