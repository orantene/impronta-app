"use client";

/**
 * ScannerListener — arms the counter for a keyboard-wedge scanner (design
 * board C23, "Scanner ready").
 *
 * Renders nothing. One `keydown` listener on the document feeds every
 * keystroke to `wedgeKey` (`lib/pos/scan-code.ts`), which recognises the
 * shape of a scan: a fast run of characters closed by Enter. When a text
 * field has focus the keystrokes are that field's, not a scan's, so the
 * listener stands down; a cashier typing a search never trips it, and a
 * scanner fired while the search box is focused types into the box, which
 * is what the hardware does anyway.
 *
 * `onScan` is called with the raw code and nothing else; looking it up and
 * adding the item are the counter's business (`pos-client.tsx`), through
 * the same `posAddLine` a tap on a tile uses.
 */

import { useEffect, useRef } from "react";

import { WEDGE_IDLE, wedgeKey, type WedgeState } from "@/lib/pos/scan-code";

function textFieldHasFocus(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  const tag = el.tagName;
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true;
  return el instanceof HTMLElement && el.isContentEditable;
}

export function ScannerListener({ onScan, enabled = true }: { onScan: (code: string) => void; enabled?: boolean }) {
  const state = useRef<WedgeState>(WEDGE_IDLE);
  const handler = useRef(onScan);
  useEffect(() => {
    handler.current = onScan;
  }, [onScan]);

  useEffect(() => {
    if (!enabled) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return;
      if (textFieldHasFocus()) {
        state.current = WEDGE_IDLE;
        return;
      }
      const next = wedgeKey(state.current, event.key, event.timeStamp);
      state.current = next.state;
      if (next.scanned) {
        event.preventDefault();
        handler.current(next.scanned);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [enabled]);

  return null;
}
