"use client";

// The `qr_code` block's link picker. A <select> over the workspace's links,
// loaded once via listLinksForPickerAction (tenant resolved from the session,
// never a client-passed id). Lives in its own component because it owns hooks,
// and the inspector's per-kind branch is an early return where hooks cannot run.
//
// TWO behaviours pinned by the QR & Links contract and NOT to be "fixed" away:
//   - PAUSED links are shown, with their status marked — never filtered. An
//     operator choosing what to print must see a paused code.
//   - A FAILED read is surfaced (an error + a manual-code fallback), never
//     swallowed into an empty list that reads as an empty workspace.

import { useEffect, useState } from "react";

import type { LinkSummary } from "@/lib/links/link-store";
import { listLinksForPickerAction } from "@/lib/site-admin/links/actions";

import { KIT } from "./kit/tokens";

type PickerState =
  | { status: "loading" }
  | { status: "ready"; links: LinkSummary[] }
  | { status: "error" };

export function QrCodeLinkPicker({
  linkCode,
  onPick,
}: {
  linkCode: string;
  onPick: (code: string) => void;
}) {
  const [state, setState] = useState<PickerState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void listLinksForPickerAction().then((result) => {
      if (!alive) return;
      setState(
        result.ok
          ? { status: "ready", links: result.links }
          : { status: "error" },
      );
    });
    return () => {
      alive = false;
    };
  }, []);

  if (state.status === "loading") {
    return (
      <div className={KIT.field}>
        <select className={KIT.input} disabled defaultValue="">
          <option value="">Loading your links…</option>
        </select>
      </div>
    );
  }

  if (state.status === "error") {
    // Surfaced, never []: say the read failed AND keep a manual code entry so
    // the operator is not stranded when the picker cannot load.
    return (
      <div className={KIT.field}>
        <p style={{ fontSize: 12, color: "#b4231f", margin: "0 0 4px" }}>
          Couldn&apos;t load your links. Enter a code by hand.
        </p>
        <input
          type="text"
          className={KIT.input}
          value={linkCode}
          placeholder="Paste a link code"
          onChange={(event) => onPick(event.currentTarget.value)}
        />
      </div>
    );
  }

  return (
    <div className={KIT.field}>
      <select
        className={KIT.input}
        value={linkCode}
        onChange={(event) => onPick(event.currentTarget.value)}
      >
        <option value="">Choose a link…</option>
        {state.links.map((link) => (
          <option key={link.id} value={link.code}>
            {(link.name || link.code) + (link.status === "paused" ? " (paused)" : "")}
          </option>
        ))}
      </select>
    </div>
  );
}
